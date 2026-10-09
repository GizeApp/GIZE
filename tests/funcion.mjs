// Corre una Edge Function (supabase/functions/<nombre>/index.ts, escrita para Deno) en Node,
// para probar lo que hace y no solo cómo está escrita. Los paquetes npm: (supabase-js,
// web-push, jose) se cambian por los simulados de cada prueba, Deno.serve guarda el handler y
// Deno.env lee los Secrets de la prueba. Nada sale a internet: fetch también es simulado.
import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Lo que exporta cada paquete. Cada nombre llama al simulado del momento (globalThis.__npm).
const EXPORTS = { '@supabase/supabase-js': ['createClient'], 'web-push': ['default'], 'jose': ['importPKCS8', 'SignJWT', 'decodeJwt'] };
const HOOKS = `
const EXPORTS = ${JSON.stringify(EXPORTS)};
export async function resolve(spec, ctx, next){
  const m = /^npm:((?:@[^/]+\\/)?[^@]+)(?:@.*)?$/.exec(spec);
  return m ? { url: 'npm-simulado:' + m[1], shortCircuit: true } : next(spec, ctx);
}
export async function load(url, ctx, next){
  // Los .ts de las funciones son módulos (sin esto Node avisa que no sabe de qué tipo son).
  if (/^file:.*\\.ts(\\?|$)/.test(url)) return next(url, Object.assign({}, ctx, { format: 'module-typescript' }));
  if (!url.startsWith('npm-simulado:')) return next(url, ctx);
  const pkg = url.slice(13), sim = n => 'globalThis.__npm[' + JSON.stringify(pkg) + '][' + JSON.stringify(n) + ']';
  const source = (EXPORTS[pkg] || []).map(n => n === 'default'
    ? 'export default new Proxy({}, { get: (_, k) => ' + sim('default') + '[k] });'
    : 'export const ' + n + ' = function (...a) { return new.target ? new (' + sim(n) + ')(...a) : ' + sim(n) + '(...a); };').join('\\n');
  return { format: 'module', source, shortCircuit: true };
}`;
let registrado = false, vez = 0;

// sim: { npm: { paquete: { nombre: valor } }, env: { SECRET: 'valor' }, fetch }.
// Devuelve { call(req), logs }: call corre el handler con esos simulados puestos y junta en
// logs lo que la función escribe con console.error.
export async function funcion(nombre, sim = {}){
  if (!registrado) { register('data:text/javascript,' + encodeURIComponent(HOOKS)); registrado = true; }
  let handler = null;
  const logs = [];
  const poner = () => {
    globalThis.__npm = sim.npm || {};
    globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => (sim.env || {})[k] } };
  };
  poner();
  await import(pathToFileURL(path.join(ROOT, 'supabase/functions', nombre, 'index.ts')).href + '?v=' + (++vez));
  return {
    logs,
    async call(req){
      poner();
      const f = globalThis.fetch, e = console.error;
      if (sim.fetch) globalThis.fetch = sim.fetch;
      console.error = (...a) => logs.push(a.map(String).join(' '));
      try { return await handler(req); } finally { globalThis.fetch = f; console.error = e; }
    },
  };
}

// Supabase simulado para las funciones. Cada consulta se arma como en supabase-js y, al
// esperarla, se le pasa a responder(q), que devuelve { data, error, count }:
//   q = { tabla, accion ('select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc'), valores,
//         opciones, filtros: [[op, columna, valor]], columnas, count, single, limit }
// Storage: q = { bucket, accion ('list' | 'remove'), prefijo, valores }.
// user: el usuario de auth.getUser() (con el token del pedido).
export function supabaseSimulado(responder, { user = null } = {}){
  const resp = (q) => Promise.resolve().then(() => responder(q)).then(r => ({ data: r && r.data !== undefined ? r.data : null, error: (r && r.error) || null, count: r && r.count !== undefined ? r.count : null }));
  const consulta = (base) => {
    const q = Object.assign({ filtros: [] }, base);
    const b = {
      select(cols, o){ if (!q.accion) q.accion = 'select'; q.columnas = cols; if (o && o.count) q.count = o.count; if (o && o.head) q.head = true; return b; },
      insert(v, o){ q.accion = 'insert'; q.valores = v; q.opciones = o; return b; },
      upsert(v, o){ q.accion = 'upsert'; q.valores = v; q.opciones = o; return b; },
      update(v){ q.accion = 'update'; q.valores = v; return b; },
      delete(){ q.accion = 'delete'; return b; },
      order(){ return b; },
      limit(n){ q.limit = n; return b; },
      maybeSingle(){ q.single = true; return b; },
      single(){ q.single = true; return b; },
      then(ok, no){ return resp(q).then(ok, no); },
    };
    for (const op of ['eq', 'neq', 'is', 'in', 'lt', 'lte', 'gt', 'gte']) b[op] = (c, v) => { q.filtros.push([op, c, v]); return b; };
    b.not = (c, op, v) => { q.filtros.push(['not.' + op, c, v]); return b; };
    return b;
  };
  return {
    from: (tabla) => consulta({ tabla }),
    rpc: (nombre, args) => consulta({ tabla: nombre, accion: 'rpc', valores: args }),
    storage: { from: (bucket) => ({ list: (prefijo, o) => resp({ bucket, accion: 'list', prefijo, opciones: o }), remove: (valores) => resp({ bucket, accion: 'remove', valores }) }) },
    auth: { getUser: async () => ({ data: { user }, error: null }), admin: { getUserById: async (id) => ({ data: { user: { id, email: 'usuario@prueba.test' } } }) } },
  };
}

// ¿La fila cumple los filtros de la consulta? (eq, neq, is, in, lt, lte, gt, gte)
export function cumple(fila, filtros){
  return filtros.every(([op, c, v]) => {
    const x = fila[c];
    if (op === 'eq') return x === v;
    if (op === 'neq') return x !== v;
    if (op === 'is') return v === null ? x == null : x === v;
    if (op === 'in') return v.includes(x);
    if (op === 'lt') return x < v;
    if (op === 'lte') return x <= v;
    if (op === 'gt') return x > v;
    if (op === 'gte') return x >= v;
    throw new Error('filtro sin simular: ' + op);
  });
}
