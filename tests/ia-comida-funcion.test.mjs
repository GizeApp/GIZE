// Función «ia», modo de la app: «plato» (foto del plato). «Contame qué comiste» (el modo «texto»)
// se sacó: contesta 400 no_disponible sin tocar nada. Se corre de verdad con tests/funcion.mjs: Supabase y la API de Anthropic simulados, nada sale a
// internet y no hace falta ninguna clave. Revisa:
// - quién puede: sin sesión 401; sin el permiso vigente 403 sin_permiso (nunca preguntado, apagado
//   en Ajustes o un aviso viejo), sin reservar ni llamar; con la función o el interruptor apagados,
//   «pausada» sin llamar; sin la clave, sin tocar la base;
// - la foto: solo JPEG de hasta 1024 px (la que manda la app); 2000 × 2000 o un PNG no se mandan;
// - el pedido: la BASE de GIZE primero con caché de 1 hora, el esquema y el esfuerzo, max_tokens,
//   sin nada que cobre aparte, sin datos de la persona; el modelo que no acepta esfuerzo va sin él;
// - la respuesta: valores de la base cuando el alimento está (crudo → cocido), la estimación si no
//   o si no se parecen (3 veces), máximo 12, sin los vacíos, «no hay comida»;
// - la guardia: topes de la persona por su rol, límites del día, de la persona, ritmo y ahorro
//   (sin llamar), rechazo del modelo (422, con el costo anotado) y JSON inválido;
// - los registros no tienen la foto, la aclaración ni la clave;
// - «texto» ya no existe: 400 no_disponible, sin mirar la configuración, el permiso ni llamar.
import { funcion, supabaseSimulado } from './funcion.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FOODS, cookVariant } from '../app/core/foods.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = f => import(pathToFileURL(path.join(ROOT, 'supabase/functions/ia', f)).href);
const YO = '11111111-1111-1111-1111-111111111111', CLAVE = 'clave-de-prueba-que-no-sirve';
const idx = n => FOODS.findIndex(f => f.name === n);

function jpeg(ancho, alto){
  return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xFF, 0xC0, 0x00, 0x11, 0x08, alto >> 8, alto & 255, ancho >> 8, ancho & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xFF, 0xDA, 0x00, 0x08, 1, 1, 0, 0, 0x3F, 0, 0x12, 0x34, 0xFF, 0xD9]);
}
const FOTO = jpeg(1024, 768).toString('base64');
const http = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const USO = { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 15000 };
const respuesta = (out, extra = {}) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'x',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) }], stop_reason: 'end_turn', usage: USO, ...extra });
const item = (o) => Object.assign({ id_base: -1, nombre: 'Algo', cantidad: null, unidad: null, gramos: 100, kcal: 100, proteinas: 1, carbohidratos: 1, grasas: 1, dudoso: false }, o);
const PLATO = { hay_comida: true, nota: '', items: [
  item({ id_base: idx('Milanesa de carne frita'), nombre: 'Milanesa', gramos: 150, kcal: 450, proteinas: 30, carbohidratos: 20, grasas: 25 }),
  item({ id_base: idx('Arroz blanco'), nombre: 'Arroz blanco', gramos: 200, kcal: 260, proteinas: 5, carbohidratos: 56, grasas: 0.6 }),
  item({ id_base: idx('Puré de papa (con leche y manteca)'), nombre: 'Puré', gramos: 100, kcal: 900, proteinas: 1, carbohidratos: 1, grasas: 1, dudoso: true }),
  item({ id_base: -1, nombre: 'Salsa rara', gramos: 30, kcal: 60, proteinas: 0, carbohidratos: 3, grasas: 5 }),
  item({ id_base: 99999, nombre: 'Inventado', gramos: 50, kcal: 80 }),
  item({ nombre: 'Nada', gramos: 0, kcal: 0 }),
] };

async function correr(o = {}){
  const h = { fetches: [], rpcs: {}, db: [] };
  const cfg = 'cfg' in o ? o.cfg : { activa: true, funciones: { plato: true, texto: true }, modelos: o.modelos || {} };
  const asUser = supabaseSimulado(() => ({ data: null }), { user: o.user === undefined ? { id: YO, email: 'alumno@prueba.test' } : o.user });
  const db = supabaseSimulado(q => {
    h.db.push(q.tabla || q.bucket);
    if (q.tabla === 'ia_config') return { data: cfg };
    if (q.accion === 'rpc'){
      (h.rpcs[q.tabla] = h.rpcs[q.tabla] || []).push(q.valores);
      if (q.tabla === 'ia_permiso_estado') return { data: 'permiso' in o ? o.permiso : 'ok' };
      if (q.tabla === 'ia_rol') return { data: o.rol || 'alumno' };
      if (q.tabla === 'ia_reservar') return { data: o.reservar ? o.reservar(q.valores) : { ok: true, llamada_id: 51, ciclo_id: 4, ahorro: false } };
      return { data: null };
    }
    return { data: null };
  });
  const fn = await funcion('ia', {
    modulos: { './foods.js': { FOODS, cookVariant } },
    env: Object.assign({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv' }, o.clave === false ? {} : { ANTHROPIC_API_KEY: CLAVE }),
    npm: { '@supabase/supabase-js': { createClient: (url, key) => key === 'srv' ? db : asUser } },
    fetch: async (url, init) => { const b = JSON.parse(init.body); h.fetches.push({ url: String(url), body: b, headers: init.headers }); return o.api ? o.api(b) : http(200, respuesta(o.out || PLATO)); },
  });
  const body = o.body || { modo: 'plato', imagen: FOTO };
  const r = await fn.call(new Request('https://x.supabase.co/functions/v1/ia', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify(body) }));
  h.status = r.status; h.json = await r.json(); h.logs = fn.logs;
  return h;
}

export default async ({ t }) => {
  const C = await mod('comida.ts'), P = await mod('precios.ts');

  // ---------- quién puede y apagado de verdad ----------
  let h = await correr({ user: null });
  t.ok(h.status === 401 && h.json.codigo === 'sin_sesion' && !h.fetches.length, 'sin sesión: 401 y sin llamar');
  h = await correr({ clave: false });
  t.ok(h.status === 503 && h.json.codigo === 'pausada' && !h.db.length && !h.fetches.length, 'sin la clave: pausada, sin tocar la base ni llamar');
  for (const cfg of [{ activa: false, funciones: { plato: true } }, { activa: true, funciones: { plato: false, texto: true } }, null]){
    h = await correr({ cfg });
    t.ok(h.status === 503 && h.json.codigo === 'pausada' && !h.rpcs.ia_reservar && !h.fetches.length, 'apagada (' + JSON.stringify(cfg) + '): pausada, sin reservar ni llamar');
  }
  for (const [permiso, motivo] of [[null, 'sin_preguntar'], ['no', 'apagada'], ['viejo', 'aviso_nuevo']]){
    h = await correr({ permiso });
    t.ok(h.status === 403 && h.json.codigo === 'sin_permiso' && h.json.motivo === motivo && !h.rpcs.ia_reservar && !h.fetches.length,
      'sin el permiso vigente (' + permiso + '): 403 sin_permiso «' + motivo + '», sin reservar ni llamar: ' + JSON.stringify(h.json));
  }
  t.eq(h.rpcs.ia_permiso_estado, [{ p_uid: YO }], 'el permiso se mira para quien llama');

  // ---------- la foto ----------
  for (const [nombre, imagen] of [['2000 × 2000', jpeg(2000, 2000).toString('base64')], ['un PNG', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]).toString('base64')],
    ['vacía', ''], ['muy pesada', '/9j/' + 'A'.repeat(1_400_000)], ['con basura', '/9j/<script>']]){
    h = await correr({ body: { modo: 'plato', imagen } });
    t.ok(h.status === 400 && h.json.codigo === 'foto_invalida' && !h.rpcs.ia_reservar && !h.fetches.length, 'foto ' + nombre + ': foto_invalida, sin reservar ni llamar');
  }

  // ---------- plato: lo que se manda ----------
  h = await correr({ body: { modo: 'plato', imagen: FOTO, texto: 'Es milanesa con arroz. ' + 'x'.repeat(400) } });
  t.eq(h.status, 200, 'plato: 200 ' + JSON.stringify(h.json).slice(0, 200));
  const b = h.fetches[0] && h.fetches[0].body;
  t.ok(!!b, 'plato: llama a la API');
  if (b){
    t.ok(P.esModelo(b.model) && P.MODELOS[b.model].defecto, 'plato: el modelo de siempre, de la lista');
    t.eq(b.max_tokens, 2000, 'plato: max_tokens 2000');
    t.eq(b.output_config.effort, 'low', 'plato: esfuerzo bajo');
    t.eq(b.output_config.format, { type: 'json_schema', schema: C.COMIDA }, 'plato: salida con el esquema COMIDA');
    t.ok(Array.isArray(b.system) && b.system.length === 2 && b.system[0].text.startsWith('BASE (número;nombre):\n0;') && b.system[1].text === C.PROMPT_PLATO, 'plato: primero la BASE, después las instrucciones');
    t.eq(b.system[0].cache_control, { type: 'ephemeral', ttl: '1h' }, 'plato: la BASE con caché de 1 hora');
    t.ok(b.system[0].text.split('\n').length === FOODS.length + 1 && b.system[0].text.includes('\n' + idx('Arroz blanco') + ';Arroz blanco [crudo]\n'), 'plato: la BASE tiene todos los alimentos, con [crudo]');
    const cont = b.messages[0].content;
    t.ok(cont[0].type === 'image' && cont[0].source.media_type === 'image/jpeg' && cont[0].source.data === FOTO, 'plato: la foto tal cual');
    t.ok(cont[1].type === 'text' && cont[1].text.startsWith('La persona aclara: Es milanesa con arroz.') && cont[1].text.length <= 'La persona aclara: '.length + 200, 'plato: la aclaración, hasta 200 caracteres');
    for (const k of ['thinking', 'temperature', 'top_p', 'top_k', 'inference_geo', 'fallbacks', 'speed', 'tools', 'betas', 'metadata'])
      t.ok(!(k in b), 'plato: no manda ' + k);
    const todo = JSON.stringify(b);
    t.ok(!todo.includes(YO) && !todo.includes('alumno@prueba.test'), 'plato: no manda el id ni el mail de la persona');
    t.eq(h.fetches[0].headers['x-api-key'], CLAVE, 'plato: con la clave');
  }
  const res = h.rpcs.ia_reservar && h.rpcs.ia_reservar[0];
  t.ok(res && res.p_uid === YO && res.p_rol === 'alumno' && res.p_funcion === 'plato' && res.p_pedido === null, 'plato: reserva como alumno ' + JSON.stringify(res));
  t.ok(res && res.p_max_usd > 0.004 && res.p_max_usd < 0.02, 'plato: la reserva es el techo con la BASE entera (' + (res && res.p_max_usd) + ')');
  const cer = h.rpcs.ia_cerrar && h.rpcs.ia_cerrar[0];
  t.ok(cer && cer.p_id === 51 && cer.p_estado === 'ok' && cer.p_usd === P.costo(USO, b.model) && cer.p_cr === 15000, 'plato: cierra con el costo real (caché leída) ' + JSON.stringify(cer));

  // ---------- plato: la respuesta ----------
  const it = h.json.items || [];
  t.eq(it.length, 5, 'plato: sin el de 0 g y 0 kcal');
  const mila = it[0], arroz = it[1], pure = it[2], salsa = it[3], inv = it[4];
  const fm = FOODS[idx('Milanesa de carne frita')];
  t.ok(mila && mila.base && mila.base.nombre === fm.name && mila.base.kcal === fm.kcal && mila.base.cocido === false && mila.gramos === 150, 'plato: la milanesa con los valores de la base GIZE');
  const fa = cookVariant(FOODS[idx('Arroz blanco')], 'cocido');
  t.ok(arroz && arroz.base && arroz.base.cocido === true && arroz.base.kcal === fa.kcal && arroz.base.kcal < 200, 'plato: el arroz [crudo] pasa a cocido (' + (arroz && arroz.base && arroz.base.kcal) + ' kcal cada 100 g)');
  t.ok(pure && pure.base === null && pure.kcal === 900 && pure.dudoso === true, 'plato: si la base y la IA no se parecen (más de 3 veces), queda la estimación (y «dudoso»)');
  t.ok(salsa && salsa.base === null && salsa.kcal === 60, 'plato: lo que no está en la base queda estimado');
  t.ok(inv && inv.base === null, 'plato: un número que no existe en la base no se usa');
  t.ok(h.json.hay_comida === true && h.json.modelo_nombre, 'plato: hay comida y el nombre del modelo');
  t.ok(!h.logs.join(' ').includes(FOTO.slice(0, 40)) && !h.logs.join(' ').includes('milanesa') && !h.logs.join(' ').includes(CLAVE), 'plato: en los registros no quedan la foto, el texto ni la clave');

  // Máximo 12 y «no hay comida».
  h = await correr({ out: { hay_comida: true, nota: '', items: Array.from({ length: 20 }, (_, i) => item({ nombre: 'A' + i })) } });
  t.eq((h.json.items || []).length, 12, 'plato: máximo 12 alimentos');
  h = await correr({ out: { hay_comida: false, nota: 'Es un perro', items: [] } });
  t.ok(h.status === 200 && h.json.hay_comida === false && h.rpcs.ia_cerrar[0].p_estado === 'vacia', 'plato: sin comida, 200 y la llamada queda «vacia»');

  // ---------- texto: ya no existe (solo fotos) ----------
  for (const [nombre, o] of [['prendido en el panel', {}], ['con el interruptor viejo prendido', { cfg: { activa: true, funciones: { plato: true, texto: true } } }], ['sin el permiso', { permiso: null }]]){
    h = await correr(Object.assign({ body: { modo: 'texto', texto: '2 empanadas de carne y una coca chica' } }, o));
    t.ok(h.status === 400 && h.json.ok === false && h.json.codigo === 'no_disponible', 'texto (' + nombre + '): 400 no_disponible ' + JSON.stringify(h.json));
    t.ok(!h.fetches.length && !h.db.length && !h.rpcs.ia_reservar && !h.rpcs.ia_permiso_estado, 'texto (' + nombre + '): sin tocar la base, el permiso ni la API');
  }
  t.has(h.json.mensaje || '', 'foto del plato', 'texto: el mensaje lleva a la foto del plato');
  h = await correr({ user: null, body: { modo: 'texto', texto: 'dos empanadas' } });
  t.ok(h.status === 401 && h.json.codigo === 'sin_sesion' && !h.fetches.length, 'texto sin sesión: 401 como siempre');
  t.ok(!('PROMPT_TEXTO' in C) && C.MAX_TOKENS_PLATO === 2000 && C.TEXTO_MAX_PLATO === 200, 'comida.ts: sin las instrucciones del texto; solo los topes del plato');

  // ---------- topes, guardia y errores ----------
  h = await correr({ rol: 'coach' });
  t.eq(h.rpcs.ia_reservar[0].p_rol, 'coach', 'coach con plan: reserva con los topes de coach');
  for (const [codigo, status, extra] of [['tope_dia', 429, { tope: 8 }], ['tope_semana', 429, {}], ['tope_persona', 429, {}], ['ritmo', 503, {}], ['ahorro', 503, {}], ['tope_mes', 503, { motivo: 'tope' }], ['pausada', 503, { motivo: 'sin_ciclo' }]]){
    const vuelve = '2026-10-21T03:00:00.000Z';
    h = await correr({ reservar: () => Object.assign({ ok: false, codigo, vuelve }, extra) });
    t.ok(h.status === status && h.json.codigo === codigo && h.json.vuelve === vuelve && !h.fetches.length, codigo + ': ' + status + ', con «vuelve» y sin llamar');
    if (extra.tope) t.eq(h.json.tope, 8, 'tope_dia: dice cuál es el tope');
  }
  h = await correr({ api: () => http(200, respuesta('', { stop_reason: 'refusal', content: [] })) });
  t.ok(h.status === 422 && h.json.codigo === 'no_se_pudo' && h.rpcs.ia_cerrar[0].p_codigo === 'refusal' && h.rpcs.ia_cerrar[0].p_usd > 0, 'rechazo del modelo: 422 no_se_pudo y el costo anotado (cuenta para el tope)');
  h = await correr({ api: () => http(200, respuesta('{"hay_comida": tru')) });
  t.ok(h.status === 502 && h.json.codigo === 'error' && h.rpcs.ia_cerrar[0].p_codigo === 'json', 'JSON inválido: error y se anota');
  h = await correr({ api: () => http(200, respuesta('[1,2]')) });
  t.ok(h.json.codigo === 'error' && h.rpcs.ia_cerrar[0].p_codigo === 'json', 'JSON que no es un objeto: error');
  h = await correr({ api: () => http(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) });
  t.ok(h.json.codigo === 'ocupada' && h.rpcs.ia_cerrar[0].p_usd === 0, '529: ocupada, sin costo');
  h = await correr({ api: () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); } });
  t.ok(h.json.codigo === 'error' && h.rpcs.ia_cerrar[0].p_usd === null, 'sin respuesta: error y se cobra la reserva');

  // ---------- el plan B sin esfuerzo ----------
  const sinEsf = Object.keys(P.MODELOS).find(m => !P.MODELOS[m].esfuerzo);
  if (sinEsf){
    h = await correr({ modelos: { plato: sinEsf } });
    const bb = h.fetches[0] && h.fetches[0].body;
    t.ok(bb && bb.model === sinEsf && !('effort' in bb.output_config) && bb.output_config.format, 'el modelo que no acepta esfuerzo va sin él (y con el esquema)');
  }
  h = await correr({ modelos: { plato: 'modelo-inventado' } });
  t.ok(h.fetches[0] && P.MODELOS[h.fetches[0].body.model].defecto, 'un modelo que no está en la lista no se usa');

  // ---------- cuentas ----------
  const base = C.baseTexto({ foods: FOODS, cocido: cookVariant });
  const ep = C.entradaComida(base, 'x'.repeat(C.TEXTO_MAX_PLATO), { ancho: 1024, alto: 1024 }, P.modeloDefecto());
  t.ok(ep < C.ENTRADA_MAX_PLATO && ep > base.length / 2, 'la entrada máxima del plato (con la aclaración más larga) entra en su tope (' + ep + ' de ' + C.ENTRADA_MAX_PLATO + ')');
};
