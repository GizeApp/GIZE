// Lo común de las pruebas de la IA en Comida (comida-ia-*.test.mjs): la página con Supabase y la
// función «ia» simulados, el estado de la IA prendida y una respuesta de plato.
import { newPage, wait, ALUMNO, perfil } from './lib.mjs';

export const ESTADO_ON = { activa: true, funciones: { plato: true, texto: true }, permiso_comida: null, aviso_version: 1, estado: 'normal', vuelve: null, quedan: { plato: 8, texto: 15 }, tope: { plato: 8, texto: 15, total: 25 } };
export const base = (id, nombre, kcal, p, c, f, unit = 'g', cocido = false) => ({ id, nombre, cocido, kcal, p, c, f, unit });
export const PLATO = { ok: true, hay_comida: true, nota: 'Supuse que el puré lleva manteca.', modelo_nombre: 'IA', items: [
  { nombre: 'Milanesa', gramos: 150, kcal: 465, p: 30, c: 20, f: 25, cantidad: 1, unidad: 'unidad', dudoso: false, base: base(101, 'Milanesa de carne frita', 310, 21, 12, 20) },
  { nombre: 'Puré de papa', gramos: 200, kcal: 210, p: 4, c: 30, f: 8, cantidad: null, unidad: null, dudoso: true, base: base(352, 'Puré de papa (con leche y manteca)', 105, 2, 15, 4) },
  { nombre: 'Salsa criolla', gramos: 40, kcal: 32, p: 0.4, c: 3, f: 2, cantidad: null, unidad: null, dudoso: false, base: null },
] };

// Una página con la IA simulada. o: { estado, funcion(body) → [status, json], sinEstado (ia_mi_estado da 404),
// estadoTarde (ms que tarda ia_mi_estado) }. S.nEstado: cuántas veces se preguntó el estado.
export async function pagina(o = {}){
  const S = { estado: Object.assign({}, o.estado || ESTADO_ON), permisos: [], reportes: [], llamadas: [], posts: [] };
  const pg = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, diary: [], calTarget: 2000 },
    handlers: Object.assign({
      '/profiles': perfil('client'),
      '/rpc/ia_mi_estado': (r, J) => { S.nEstado = (S.nEstado || 0) + 1; return o.sinEstado ? J({ message: 'no existe' }, 404) : o.estadoTarde ? new Promise(ok => setTimeout(() => ok(J(S.estado)), o.estadoTarde)) : J(S.estado); },
      '/rpc/ia_permiso': (r, J, i) => { const b = JSON.parse(i.body || '{}'); S.permisos.push(b); S.estado = Object.assign({}, S.estado, { permiso_comida: b.p_acepta ? 'ok' : 'no' }); return J(S.estado); },
      '/rpc/ia_reportar': (r, J, i) => { S.reportes.push(JSON.parse(i.body || '{}')); return J(null); },
      '/functions/v1/ia': (r, J, i) => {
        if (i.m !== 'POST') return J({});
        const b = JSON.parse(i.body || '{}'); S.llamadas.push(b);
        const [st, js] = o.funcion ? o.funcion(b, S) : [200, PLATO];
        return J(js, st);
      },
      '/food_entries': (r, J, i) => { if (i.m === 'POST') { S.posts.push(JSON.parse(i.body || '[]')); return J([], 201); } return undefined; },
    }, o.handlers || {}) });
  // Open Food Facts también, sin productos de marca: si no, la búsqueda va a la red de verdad y,
  // con la red lenta, «Buscando productos de marca…» sigue a la vista cuando la prueba ya mira.
  await pg.p.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"products":[]}' }));
  Object.assign(pg, { S });
  return pg;
}
export async function abrirComida(p, base){
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(500);
}
export async function abrirBuscador(p){ await p.click('[data-action="search-open"]'); await wait(700); }
// Una foto de verdad (JPEG) para el campo de la cámara.
export const fotoJpeg = async p => ({ name: 'plato.jpg', mimeType: 'image/jpeg', buffer: await p.screenshot({ type: 'jpeg', quality: 70 }) });

