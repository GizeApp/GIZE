// Función «ia» (supabase/functions/ia): «Leer con IA» de la tabla nutricional de un pedido, desde
// el panel. Se corre de verdad con tests/funcion.mjs: Supabase (la base, Storage y la sesión) y la
// API de Anthropic simulados, así que nada sale a internet y no hace falta ninguna clave.
// Revisa:
// - quién puede: sin sesión 401; solo administradores (por ahora);
// - que esté apagada de verdad: sin la clave, con el interruptor o la función apagados, con un
//   pedido anterior al cambio de la política o de alguien que apagó la IA, no se llama a la API
//   (y sin la clave ni siquiera se toca la base);
// - la foto: solo JPEG de hasta 1600 px y 2 MB (la que sube la app);
// - la guardia: reserva antes (con lo máximo que puede costar), no llama si la reserva no pasa, y
//   cierra con el costo real («usage»), con la reserva entera si no hubo respuesta o con 0 si la
//   API rechazó el pedido;
// - cada error de la API: créditos agotados (400 y 402), límites de la Console (400) y del nivel
//   (429 enforced_spend_limit_reached), 429 y 529 comunes, clave rechazada, 500, sin respuesta,
//   rechazo del modelo, respuesta cortada y JSON inválido;
// - lo que se manda: modelo de la lista, max_tokens, sin razonamiento, sin nada que cobre aparte
//   y sin datos de la persona; lo que se devuelve y se guarda en el pedido (ai_*);
// - las cuentas (precios, reserva, tokens de la imagen) y que en los registros no quede la clave
//   ni datos de nadie.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { funcion, supabaseSimulado } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = f => import(pathToFileURL(path.join(ROOT, 'supabase/functions/ia', f)).href);

const ADMIN = '22222222-2222-2222-2222-222222222222', DUENO = '11111111-1111-1111-1111-111111111111';
const CLAVE = 'clave-de-prueba-que-no-sirve';
const AHORA = Date.now();

// Un JPEG mínimo (SOI, APP0, SOF0 con el tamaño, SOS, EOI): alcanza para leer el tamaño.
function jpeg(ancho, alto, sof = 0xC0){
  return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xFF, sof, 0x00, 0x11, 0x08, alto >> 8, alto & 255, ancho >> 8, ancho & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xFF, 0xDA, 0x00, 0x08, 1, 1, 0, 0, 0x3F, 0, 0x12, 0x34, 0xFF, 0xD9]);
}
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);

const respuesta = (out, extra = {}) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'x',
  content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) }], stop_reason: 'end_turn',
  usage: { input_tokens: 2600, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, ...extra });
const TABLA100 = { encontrada: true, unidad: 'g', columna: '100', porcion: 30, kcal: 450, kj: 1883, proteinas: 7, carbohidratos: 70, grasas: 15, dudosos: [] };
const http = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const errorApi = (type, message, details) => ({ type: 'error', error: Object.assign({ type, message }, details ? { details } : {}), request_id: 'req_1' });

// Corre la función una vez. o: { user, admin, clave, cfg, pedido, permiso, foto, reservar, api, body }.
async function correr(o = {}){
  const h = { fetches: [], rpcs: {}, db: [], updates: [], descargas: 0 };
  const cfg = 'cfg' in o ? o.cfg : { activa: true, funciones: { etiqueta_admin: true }, modelos: {}, pedidos_desde: new Date(AHORA - 864e5).toISOString() };
  const pedido = 'pedido' in o ? o.pedido : { id: 7, user_id: DUENO, label_path: DUENO + '/pedido-tabla-7.jpg', status: 'pendiente', created_at: new Date(AHORA - 3600e3).toISOString() };
  const asUser = supabaseSimulado(q => {
    if (q.tabla === 'is_app_admin') return { data: o.admin !== false };
    return { data: null };
  }, { user: o.user === undefined ? { id: ADMIN, email: 'admin@prueba.test' } : o.user });
  const db = supabaseSimulado(q => {
    h.db.push(q.tabla || q.bucket);
    if (q.tabla === 'ia_config') return { data: cfg };
    if (q.tabla === 'product_requests' && q.accion === 'select') return { data: pedido };
    if (q.tabla === 'product_requests' && q.accion === 'update'){ h.updates.push({ valores: q.valores, filtros: q.filtros }); return { data: null }; }
    if (q.tabla === 'ia_permisos') return { data: o.permiso || null };
    if (q.bucket === 'productos' && q.accion === 'download'){ h.descargas++; h.ruta = q.prefijo; return { data: new Blob([o.foto || jpeg(1200, 1600)]) }; }
    if (q.accion === 'rpc'){
      (h.rpcs[q.tabla] = h.rpcs[q.tabla] || []).push(q.valores);
      if (q.tabla === 'ia_reservar') return { data: o.reservar ? o.reservar(q.valores) : { ok: true, llamada_id: 41, ciclo_id: 3, ahorro: false } };
      return { data: null };
    }
    return { data: null };
  });
  const fn = await funcion('ia', {
    env: Object.assign({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv' }, o.clave === false ? {} : { ANTHROPIC_API_KEY: o.clave || CLAVE }),
    npm: { '@supabase/supabase-js': { createClient: (url, key) => key === 'srv' ? db : asUser } },
    fetch: async (url, init) => {
      const b = JSON.parse(init.body);
      h.fetches.push({ url: String(url), headers: init.headers, body: b, signal: !!init.signal });
      const r = o.api ? await o.api(b) : http(200, respuesta(TABLA100));
      return r;
    },
  });
  const r = await fn.call(new Request('https://x.supabase.co/functions/v1/ia', { method: 'POST', headers: { Authorization: 'Bearer x' },
    body: JSON.stringify(o.body || { modo: 'etiqueta', pedido: 7 }) }));
  h.status = r.status; h.res = await r.json(); h.logs = fn.logs;
  return h;
}

export default async function ({ t }){
  const P = await mod('precios.ts'), M = await mod('modos.ts'), A = await mod('api.ts'), J = await mod('jpeg.ts');
  const ids = Object.keys(P.MODELOS);
  const defecto = ids.find(k => P.MODELOS[k].defecto);
  // El más caro de la lista (el plan B de las tablas) y uno de imagen estándar (tope de tokens más bajo).
  const caro = ids.slice().sort((a, b) => P.MODELOS[b].in - P.MODELOS[a].in)[0];
  const estandar = ids.find(k => P.MODELOS[k].imgMax < P.MODELOS[defecto].imgMax);
  t.ok(ids.length >= 2 && defecto && caro !== defecto, 'la lista de modelos tiene uno de siempre y otro más capaz: ' + ids.join(', '));
  t.eq(ids.filter(k => P.MODELOS[k].defecto).length, 1, 'un solo modelo de siempre');

  // ---------- quién puede ----------
  let x = await correr({ user: null });
  t.ok(x.status === 401 && x.res.codigo === 'sin_sesion' && x.fetches.length === 0 && x.db.length === 0, 'sin sesión: 401 y nada más: ' + JSON.stringify(x.res));
  x = await correr({ admin: false });
  t.ok(x.status === 403 && x.res.codigo === 'no_habilitado' && x.fetches.length === 0 && x.db.length === 0, 'quien no es administrador: 403, sin tocar la base ni la API: ' + JSON.stringify(x.res));
  x = await correr({ body: { modo: 'plato', imagen: 'x' } });
  t.ok(x.status === 400 && x.fetches.length === 0, 'otro modo (todavía no existe): 400 sin llamar');

  // ---------- apagada de verdad ----------
  x = await correr({ clave: false });
  t.ok(x.status === 503 && x.res.codigo === 'pausada' && x.res.motivo === 'sin_clave' && /Falta la clave/.test(x.res.mensaje), 'sin ANTHROPIC_API_KEY: «Falta la clave»: ' + JSON.stringify(x.res));
  t.ok(x.fetches.length === 0 && x.db.length === 0 && x.descargas === 0, 'sin la clave no toca la base, ni la foto, ni la API');
  x = await correr({ clave: false, body: { modo: 'estado' } });
  t.ok(x.status === 200 && x.res.ok && x.res.clave === false && x.fetches.length === 0, 'modo estado sin clave: clave false');
  t.eq(x.res.modelos.map(m => m.id), ids, 'modo estado: la lista de modelos para el panel');
  t.ok(x.res.modelos.every(m => m.nombre) && x.res.modelos.filter(m => m.defecto).length === 1, 'cada modelo con su nombre y uno de siempre');
  t.ok(!JSON.stringify(x.res).includes('srv') && !JSON.stringify(x.res).includes(CLAVE), 'modo estado no devuelve claves');
  x = await correr({ body: { modo: 'estado' } });
  t.ok(x.res.clave === true && x.fetches.length === 0, 'modo estado con clave: clave true, sin llamar');
  for (const [cfg, que] of [[{ activa: false, funciones: { etiqueta_admin: true } }, 'interruptor apagado'], [{ activa: true, funciones: { etiqueta_admin: false } }, 'función apagada'], [null, 'sin correr ia.sql']]){
    x = await correr({ cfg });
    t.ok(x.status === 503 && x.res.codigo === 'pausada' && x.fetches.length === 0 && x.descargas === 0 && !x.rpcs.ia_reservar, que + ': pausada, sin bajar la foto ni reservar ni llamar: ' + JSON.stringify(x.res));
  }
  x = await correr({ cfg: { activa: false, funciones: { etiqueta_admin: true } } });
  t.has(x.res.mensaje, 'La IA está apagada', 'interruptor apagado: el mensaje lo dice');
  x = await correr({ pedido: { id: 7, user_id: DUENO, label_path: DUENO + '/a.jpg', status: 'pendiente', created_at: new Date(AHORA - 3 * 864e5).toISOString() } });
  t.ok(x.status === 403 && x.res.codigo === 'no_habilitado' && /antes del cambio de la política/.test(x.res.mensaje) && x.fetches.length === 0 && x.descargas === 0, 'pedido anterior a pedidos_desde: no se lee: ' + JSON.stringify(x.res));
  x = await correr({ cfg: { activa: true, funciones: { etiqueta_admin: true }, pedidos_desde: null } });
  t.ok(x.res.codigo === 'no_habilitado' && x.fetches.length === 0, 'sin pedidos_desde no se lee ningún pedido');
  x = await correr({ permiso: { comida_ok_at: new Date(AHORA - 864e5).toISOString(), comida_no_at: new Date(AHORA - 3600e3).toISOString() } });
  t.ok(x.status === 403 && x.res.codigo === 'persona_sin_ia' && x.fetches.length === 0 && x.descargas === 0, 'quien mandó el pedido apagó la IA: no se manda su foto');
  x = await correr({ permiso: { comida_ok_at: new Date(AHORA - 3600e3).toISOString(), comida_no_at: new Date(AHORA - 864e5).toISOString() } });
  t.ok(x.status === 200 && x.fetches.length === 1, 'la volvió a prender después: se lee');
  x = await correr({ pedido: null });
  t.ok(x.status === 404 && x.fetches.length === 0, 'pedido que no existe: 404');
  x = await correr({ pedido: { id: 7, user_id: DUENO, label_path: DUENO + '/a.jpg', status: 'cargado', created_at: new Date(AHORA).toISOString() } });
  t.ok(x.status === 409 && x.fetches.length === 0, 'pedido ya resuelto: no se lee');

  // ---------- la foto ----------
  for (const [foto, que] of [[PNG, 'un PNG'], [jpeg(2000, 2000), 'un JPEG de 2000 px'], [Buffer.concat([jpeg(1000, 1000), Buffer.alloc(2_100_000)]), 'una foto de más de 2 MB'], [Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]), 'un JPEG sin tamaño']]){
    x = await correr({ foto });
    t.ok(x.status === 400 && x.res.codigo === 'foto_invalida' && x.fetches.length === 0 && !x.rpcs.ia_reservar, que + ': foto_invalida, sin reservar ni llamar: ' + JSON.stringify(x.res));
  }

  // ---------- la guardia no deja ----------
  for (const [r, st] of [[{ ok: false, codigo: 'tope_mes', motivo: 'tope', vuelve: '2026-11-10T00:00:00Z' }, 503], [{ ok: false, codigo: 'ritmo', vuelve: '2026-10-20T03:00:00Z' }, 503],
    [{ ok: false, codigo: 'tope_dia', vuelve: '2026-10-20T03:00:00Z', tope: 300 }, 429], [{ ok: false, codigo: 'tope_persona', vuelve: '2026-11-10T00:00:00Z' }, 429],
    [{ ok: false, codigo: 'pausada', motivo: 'sin_ciclo' }, 503], [{ ok: false, codigo: 'pausada', motivo: 'creditos', vuelve: '2026-10-19T14:00:00Z' }, 503]]){
    x = await correr({ reservar: () => r });
    t.ok(x.status === st && x.res.codigo === r.codigo && x.res.motivo === r.motivo && x.res.vuelve === r.vuelve && x.fetches.length === 0 && !x.rpcs.ia_cerrar,
      'reserva rechazada (' + r.codigo + (r.motivo ? ' ' + r.motivo : '') + '): ' + st + ' sin llamar: ' + JSON.stringify(x.res));
  }

  // ---------- todo bien (cada 100) ----------
  x = await correr();
  t.eq(x.status, 200, 'lee la tabla: 200');
  t.eq(x.res, { ok: true, encontrada: true, unidad: 'g', columna: '100', porcion: 30, por_porcion: false, kcal: 450, p: 7, c: 70, f: 15, revisar: false, dudosos: [],
    modelo: defecto, modelo_nombre: P.MODELOS[defecto].nombre }, 'cada 100: pasa tal cual');
  t.eq(x.ruta, DUENO + '/pedido-tabla-7.jpg', 'baja la foto del pedido');
  const res = x.rpcs.ia_reservar && x.rpcs.ia_reservar[0];
  const entrada = M.entradaEtiqueta(1200, 1600, defecto);
  t.eq(res, { p_uid: ADMIN, p_rol: 'admin', p_funcion: 'etiqueta', p_modelo: defecto, p_max_usd: P.reserva(defecto, entrada, M.MAX_TOKENS_ETIQUETA), p_pedido: 7 }, 'reserva con lo máximo que puede costar');
  t.ok(res && res.p_max_usd > 0 && res.p_max_usd < 0.002, 'la reserva de una tabla es de milésimas de dólar: ' + (res && res.p_max_usd));
  const usdOk = P.costo({ input_tokens: 2600, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, defecto);
  t.eq(x.rpcs.ia_cerrar, [{ p_id: 41, p_estado: 'ok', p_codigo: null, p_usd: usdOk, p_in: 2600, p_out: 90, p_cw: 0, p_cr: 0, p_ms: x.rpcs.ia_cerrar[0].p_ms }], 'cierra con el costo real');
  t.ok(typeof x.rpcs.ia_cerrar[0].p_ms === 'number', 'anota cuánto tardó');
  t.ok(!x.rpcs.ia_cortar, 'no corta nada');
  const ord = x.db.filter(n => ['ia_reservar', 'ia_cerrar'].includes(n));
  t.eq(ord, ['ia_reservar', 'ia_cerrar'], 'reserva antes y cierra después');
  // Lo que se manda.
  const f0 = x.fetches[0] || { body: {}, headers: {} };
  t.eq(f0.url, 'https://api.anthropic.com/v1/messages', 'llama a la API de mensajes');
  t.eq(f0.headers, { 'x-api-key': CLAVE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, 'cabeceras de la API');
  t.ok(f0.signal, 'con tiempo máximo');
  t.eq(Object.keys(f0.body).sort(), ['max_tokens', 'messages', 'model', 'output_config', 'system', 'thinking'], 'el pedido lleva solo lo necesario (sin región, modo rápido, reintentos en otro modelo, herramientas ni temperatura)');
  t.ok(ids.includes(f0.body.model) && f0.body.model === defecto, 'modelo de la lista (el de siempre)');
  t.eq(f0.body.max_tokens, 600, 'max_tokens de la tabla: 600');
  t.eq(f0.body.thinking, { type: P.MODELOS[defecto].sinPensar }, 'sin razonamiento');
  t.eq(f0.body.output_config, { format: { type: 'json_schema', schema: M.ETIQUETA } }, 'salida con el esquema de la tabla');
  t.ok(M.ETIQUETA.additionalProperties === false && M.ETIQUETA.required.length === Object.keys(M.ETIQUETA.properties).length, 'el esquema: nada de más y todo obligatorio');
  const msgs = f0.body.messages || [];
  t.ok(msgs.length === 1 && msgs[0].role === 'user', 'un solo mensaje, del usuario (sin texto «de arranque» de la respuesta)');
  t.eq((msgs[0] && msgs[0].content || []).map(c => c.type), ['image', 'text'], 'la foto y después el pedido');
  t.eq(msgs[0] && msgs[0].content[0].source.data, jpeg(1200, 1600).toString('base64'), 'manda la foto del pedido tal cual, en base64');
  const todo = JSON.stringify(f0.body);
  for (const dato of [ADMIN, DUENO, 'admin@prueba.test', 'usuario@prueba.test', 'Beto']) t.ok(!todo.includes(dato), 'no manda datos de la persona: ' + dato);
  // Lo que queda en el pedido.
  t.eq(x.updates.length, 1, 'guarda lo leído en el pedido');
  const ai = (x.updates[0] || {}).valores || {};
  t.ok(ai.ai_encontrada === true && ai.ai_kcal === 450 && ai.ai_protein === 7 && ai.ai_carbs === 70 && ai.ai_fat === 15 && ai.ai_unit === 'g' && ai.ai_portion === 30
    && ai.ai_por_porcion === false && ai.ai_revisar === false && ai.ai_modelo === defecto && typeof ai.ai_at === 'string', 'ai_* del pedido: ' + JSON.stringify(ai));
  t.eq((x.updates[0] || {}).filtros, [['eq', 'id', 7]], 'solo ese pedido');
  // Los registros.
  const logs = x.logs.join('\n');
  t.ok(!logs.includes(CLAVE) && !logs.includes(ADMIN) && !logs.includes(DUENO) && !logs.includes('@'), 'en los registros no queda la clave ni datos de nadie');
  x = await correr({ body: { modo: 'tabla', pedido: 7 } });
  t.ok(x.status === 200 && x.fetches.length === 1, 'también acepta modo «tabla»');

  // ---------- postproceso ----------
  const leer = async (out, extra) => { const r = await correr({ api: () => http(200, respuesta(out, extra)) }); return r; };
  x = await leer({ encontrada: true, unidad: 'g', columna: 'porcion', porcion: 50, kcal: 219, kj: 920, proteinas: 2.8, carbohidratos: 30, grasas: 10, dudosos: [] });
  t.ok(x.res.kcal === 438 && x.res.p === 5.6 && x.res.c === 60 && x.res.f === 20 && x.res.porcion === 50 && x.res.por_porcion === false && x.res.columna === 'porcion', 'por porción con tamaño: se pasa a cada 100: ' + JSON.stringify(x.res));
  x = await leer({ encontrada: true, unidad: 'ml', columna: 'porcion', porcion: null, kcal: 76, kj: null, proteinas: 2.9, carbohidratos: 12, grasas: 1.8, dudosos: [] });
  t.ok(x.res.por_porcion === true && x.res.kcal === 76 && x.res.unidad === 'ml', 'por porción sin tamaño: queda por porción (por_porcion): ' + JSON.stringify(x.res));
  t.ok((x.updates[0] || {}).valores.ai_por_porcion === true, 'y se guarda así');
  x = await leer({ encontrada: true, unidad: 'g', columna: '100', porcion: null, kcal: null, kj: 1883, proteinas: 7, carbohidratos: 70, grasas: 15, dudosos: [] });
  t.ok(x.res.kcal === 450 && x.res.revisar === false, 'solo kJ: se pasa a kcal: ' + JSON.stringify(x.res));
  x = await leer({ encontrada: true, unidad: 'g', columna: '100', porcion: null, kcal: 900, kj: null, proteinas: 7, carbohidratos: 70, grasas: 15, dudosos: ['kcal', 'sodio', 'kcal'] });
  t.ok(x.res.revisar === true, 'kcal que no cierran con los macros: revisar');
  t.eq(x.res.dudosos, ['kcal'], 'dudosos: solo los campos que existen, sin repetir');
  x = await leer({ encontrada: false, unidad: 'g', columna: '100', porcion: null, kcal: null, kj: null, proteinas: null, carbohidratos: null, grasas: null, dudosos: [] });
  t.ok(x.status === 200 && x.res.ok === true && x.res.encontrada === false, 'sin tabla legible: ok, encontrada false');
  t.ok(x.rpcs.ia_cerrar[0].p_estado === 'vacia' && x.rpcs.ia_cerrar[0].p_usd > 0, 'sin tabla: se cierra como vacía y con su costo');
  t.ok((x.updates[0] || {}).valores.ai_encontrada === false && (x.updates[0] || {}).valores.ai_kcal === null, 'sin tabla: queda anotado');
  // Bloques de razonamiento antes del texto: se toma el texto.
  x = await correr({ api: () => http(200, { ...respuesta(TABLA100), content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: JSON.stringify(TABLA100) }] }) });
  t.ok(x.status === 200 && x.res.kcal === 450, 'con bloques de razonamiento antes: toma el de texto');

  // ---------- errores del modelo ----------
  x = await correr({ api: () => http(200, { ...respuesta(''), content: [], stop_reason: 'refusal', usage: { input_tokens: 2600, output_tokens: 5 } }) });
  t.ok(x.status === 422 && x.res.codigo === 'no_se_pudo' && x.rpcs.ia_cerrar[0].p_estado === 'error' && x.rpcs.ia_cerrar[0].p_codigo === 'refusal' && x.rpcs.ia_cerrar[0].p_usd > 0, 'rechazo: 422 no_se_pudo y el costo queda anotado (cuenta para el tope del día): ' + JSON.stringify(x.rpcs.ia_cerrar));
  t.eq(x.updates, [], 'rechazo: no guarda nada en el pedido');
  x = await correr({ api: () => http(200, { ...respuesta('{"encontrada": tr'), stop_reason: 'max_tokens' }) });
  t.ok(x.status === 502 && x.res.codigo === 'error' && x.rpcs.ia_cerrar[0].p_codigo === 'max_tokens' && x.rpcs.ia_cerrar[0].p_usd > 0, 'respuesta cortada: error, con su costo');
  x = await correr({ api: () => http(200, respuesta('esto no es JSON')) });
  t.ok(x.status === 502 && x.res.codigo === 'error' && x.rpcs.ia_cerrar[0].p_codigo === 'json' && x.rpcs.ia_cerrar[0].p_usd > 0, 'JSON inválido: error, con su costo');
  x = await correr({ api: () => http(200, { ...respuesta(TABLA100), usage: undefined }) });
  t.ok(x.status === 200 && x.rpcs.ia_cerrar[0].p_usd === null, 'sin «usage»: se cobra la reserva (usd null)');

  // ---------- errores de la API ----------
  const cortes = async (status, body, headers) => { const r = await correr({ api: () => http(status, body, headers) }); return r; };
  // Créditos agotados: 400 o 402 con el texto (el código no está confirmado), y el 402 solo.
  for (const [st, body] of [[400, errorApi('invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.')],
    [402, errorApi('billing_error', 'Your credit balance is too low to access the Anthropic API.')], [402, errorApi('billing_error', 'Billing problem.')]]){
    x = await cortes(st, body);
    const cut = (x.rpcs.ia_cortar || [])[0] || {};
    const media = Date.parse(cut.p_vuelve) - Date.now();
    t.ok(x.status === 503 && x.res.codigo === 'pausada' && x.res.motivo === 'creditos', 'créditos agotados (' + st + '): pausada: ' + JSON.stringify(x.res));
    t.ok(cut.p_ciclo === 3 && cut.p_motivo === 'creditos' && media > 29 * 60e3 && media <= 30 * 60e3, 'créditos agotados (' + st + '): corta el ciclo de la llamada por media hora: ' + JSON.stringify(cut));
    t.ok(x.rpcs.ia_cerrar[0].p_usd === 0 && x.rpcs.ia_cerrar[0].p_codigo === 'creditos', 'créditos agotados: no se cobra');
  }
  // Límites de la Console (organización y workspace): 400 con la fecha en que vuelve.
  for (const msg of ['You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.',
    'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.']){
    x = await cortes(400, errorApi('invalid_request_error', msg));
    const cut = (x.rpcs.ia_cortar || [])[0] || {};
    t.ok(x.status === 503 && x.res.codigo === 'tope_mes' && x.res.vuelve === '2026-11-01T00:00:00.000Z', 'límite de la Console: tope_mes con la fecha del mensaje: ' + JSON.stringify(x.res));
    t.ok(cut.p_motivo === 'limite_console' && cut.p_vuelve === '2026-11-01T00:00:00.000Z' && x.rpcs.ia_cerrar[0].p_usd === 0, 'límite de la Console: corta el ciclo hasta esa fecha y no cobra');
  }
  // Tope del nivel: 429 con enforced_spend_limit_reached, sin retry-after.
  x = await cortes(429, errorApi('rate_limit_error', 'You have reached your API usage limits: your organization has crossed its monthly API usage threshold, set based on your organization\'s API tier. You will regain access on 2026-11-01 at 00:00 UTC.', { error_code: 'enforced_spend_limit_reached' }));
  t.ok(x.res.codigo === 'tope_mes' && ((x.rpcs.ia_cortar || [])[0] || {}).p_motivo === 'limite_console' && x.res.vuelve === '2026-11-01T00:00:00.000Z', 'tope del nivel (429 enforced_spend_limit_reached): tope_mes');
  x = await cortes(429, errorApi('rate_limit_error', 'Spend cap reached.', { error_code: 'enforced_spend_limit_reached' }));
  const primero = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString();
  t.ok(x.res.codigo === 'tope_mes' && x.res.vuelve === primero, 'sin fecha en el mensaje: vuelve el día 1 del mes que viene a las 00:00 UTC: ' + x.res.vuelve);
  // 429 común (con retry-after) y 529: ocupada, sin cortar ni cobrar.
  x = await cortes(429, errorApi('rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit'), { 'retry-after': '20' });
  t.ok(x.status === 503 && x.res.codigo === 'ocupada' && !x.rpcs.ia_cortar && x.rpcs.ia_cerrar[0].p_usd === 0, '429 común: ocupada, sin cortar ni cobrar');
  x = await cortes(529, errorApi('overloaded_error', 'Overloaded'));
  t.ok(x.res.codigo === 'ocupada' && !x.rpcs.ia_cortar && x.rpcs.ia_cerrar[0].p_usd === 0 && x.rpcs.ia_cerrar[0].p_codigo === 'sobrecarga', '529: ocupada, no cobra (no cuenta para el tope del día)');
  x = await cortes(401, errorApi('authentication_error', 'invalid x-api-key'));
  t.ok(x.res.codigo === 'pausada' && x.res.motivo === 'clave_rechazada' && x.rpcs.ia_cerrar[0].p_codigo === 'clave_rechazada' && x.rpcs.ia_cerrar[0].p_usd === 0, 'clave rechazada: pausada y queda anotado para el panel');
  x = await cortes(500, errorApi('api_error', 'Internal server error'));
  t.ok(x.status === 502 && x.res.codigo === 'error' && x.rpcs.ia_cerrar[0].p_codigo === 'api_500' && x.rpcs.ia_cerrar[0].p_usd === 0, '500: error, sin cobrar');
  // Sin respuesta: se cobra la reserva entera (cuenta para el tope del día).
  x = await correr({ api: () => { throw Object.assign(new Error('The signal has been aborted'), { name: 'TimeoutError' }); } });
  t.ok(x.status === 502 && x.res.codigo === 'error' && x.rpcs.ia_cerrar[0].p_usd === null && x.rpcs.ia_cerrar[0].p_codigo === 'tiempo', 'tiempo máximo: error y se cobra la reserva (usd null)');
  x = await correr({ api: () => { throw new TypeError('fetch failed'); } });
  t.ok(x.res.codigo === 'error' && x.rpcs.ia_cerrar[0].p_usd === null && x.rpcs.ia_cerrar[0].p_codigo === 'red', 'error de red: lo mismo');
  t.ok(!x.logs.join('\n').includes(CLAVE), 'tampoco en los errores queda la clave en los registros');

  // ---------- otro modelo desde el panel ----------
  x = await correr({ cfg: { activa: true, funciones: { etiqueta_admin: true }, modelos: { etiqueta: caro }, pedidos_desde: new Date(AHORA - 864e5).toISOString() } });
  const fc = x.fetches[0] || { body: {} };
  t.ok(fc.body.model === caro && x.rpcs.ia_reservar[0].p_modelo === caro, 'el modelo elegido en el panel');
  t.eq(fc.body.thinking, { type: P.MODELOS[caro].sinPensar }, 'cada modelo con su forma de apagar el razonamiento');
  const ratio = x.rpcs.ia_reservar[0].p_max_usd / P.reserva(defecto, entrada, M.MAX_TOKENS_ETIQUETA);
  t.ok(ratio > 15 && ratio < 25, 'la misma tabla con el modelo capaz reserva unas 20 veces más: ' + ratio.toFixed(1));
  x = await correr({ cfg: { activa: true, funciones: { etiqueta_admin: true }, modelos: { etiqueta: 'modelo-que-no-existe' }, pedidos_desde: new Date(AHORA - 864e5).toISOString() } });
  t.ok((x.fetches[0] || { body: {} }).body.model === defecto, 'un modelo que no está en la lista no se usa: va el de siempre');

  // ---------- cuentas ----------
  const d = P.MODELOS[defecto];
  // 100.000 tokens (justo en el límite del precio normal) = una décima del precio por millón.
  const cien = precio => +(precio / 10 * 1.1).toFixed(6);
  t.eq(P.costo({ input_tokens: 1e5 }, defecto), cien(d.in), 'costo: entrada con el 10 %');
  t.eq(P.costo({ output_tokens: 1e5 }, defecto), cien(d.out), 'costo: salida con el 10 %');
  t.eq(P.costo({ cache_read_input_tokens: 1e5 }, defecto), cien(d.rd), 'costo: lectura de caché');
  t.eq(P.costo({ cache_creation_input_tokens: 1e5, cache_creation: { ephemeral_5m_input_tokens: 1e5, ephemeral_1h_input_tokens: 0 } }, defecto), cien(d.w5), 'costo: escritura de 5 minutos');
  t.eq(P.costo({ cache_creation_input_tokens: 1e5, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1e5 } }, defecto), cien(d.w1h), 'costo: escritura de 1 hora');
  t.eq(P.costo({ cache_creation_input_tokens: 1e5 }, defecto), cien(d.w1h), 'costo: sin desglose, al precio de 1 hora (el más caro)');
  const mezcla = P.costo({ input_tokens: 1000, output_tokens: 400, cache_creation_input_tokens: 15000, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 15000 } }, defecto);
  t.eq(mezcla, Math.ceil((1000 * d.in + 15000 * d.w1h + 400 * d.out) / 1e6 * 1.1 * 1e6 - 1e-9) / 1e6, 'costo: entrada, escritura de 1 hora y salida juntas');
  t.eq(P.costo({ input_tokens: 100001 }, defecto), Math.ceil(100001 * d.in * d.largo / 1e6 * 1.1 * 1e6 - 1e-9) / 1e6, 'costo: pasando los 100.000 tokens se multiplica (' + d.largo + ' veces)');
  t.ok(d.largo === 5, 'el modelo de siempre cobra 5 veces más pasando los 100.000 tokens');
  t.eq(P.reserva(defecto, 4000, 600), Math.ceil((4000 * d.w1h + 600 * d.out) / 1e6 * 1.1 * 1e6 - 1e-9) / 1e6, 'reserva: toda la entrada al precio más alto y todos los max_tokens');
  t.ok(P.reserva(defecto, 4000, 600) >= P.costo({ input_tokens: 4000, output_tokens: 600 }, defecto), 'la reserva es un techo de lo que puede costar');
  t.eq(P.imagenTokens(1600, 1200, defecto), 58 * 43, 'tokens de una foto de 1600 × 1200');
  t.eq(P.imagenTokens(1600, 1600, defecto), 58 * 58, 'tokens de una foto de 1600 × 1600');
  t.eq(P.imagenTokens(4000, 3000, defecto), d.imgMax, 'una foto enorme se achica: tope del modelo');
  if (estandar) t.eq(P.imagenTokens(1600, 1200, estandar), P.MODELOS[estandar].imgMax, 'con un modelo de resolución estándar, su tope');
  t.ok(M.ENTRADA_MAX_ETIQUETA < P.ENTRADA_TOPE && M.entradaEtiqueta(1600, 1600, defecto) <= M.ENTRADA_MAX_ETIQUETA, 'la tabla más grande entra en su entrada máxima (y lejos de los 100.000)');
  t.ok(M.entradaEtiqueta(1700, 1700, defecto) > M.ENTRADA_MAX_ETIQUETA, 'una foto más grande que las de la app pasa la entrada máxima');
  t.eq(P.modeloDe('cualquiera'), defecto, 'modeloDe: uno que no está, el de siempre');
  t.eq(P.modeloDe(caro), caro, 'modeloDe: uno de la lista, ese');
  // Tamaño del JPEG (también progresivo).
  t.eq(J.jpegTamano(jpeg(1600, 1200)), { ancho: 1600, alto: 1200 }, 'jpegTamano: SOF0');
  t.eq(J.jpegTamano(jpeg(800, 600, 0xC2)), { ancho: 800, alto: 600 }, 'jpegTamano: progresivo (SOF2)');
  t.eq(J.jpegTamano(PNG), null, 'jpegTamano: un PNG no');
  t.eq(J.jpegTamano(new Uint8Array([0xFF, 0xD8, 0xFF, 0xC4, 0x00, 0x04, 0, 0, 0xFF, 0xD9])), null, 'jpegTamano: sin SOF, null');
  // Fechas de los errores.
  const ahora = new Date('2026-10-19T13:00:00Z');
  t.eq(A.fechaDelMensaje('You will regain access on 2026-11-01 at 00:00 UTC.', ahora), new Date('2026-11-01T00:00:00Z'), 'fecha del mensaje');
  t.eq(A.fechaDelMensaje('You will regain access on 2025-01-01 at 00:00 UTC.', ahora), null, 'una fecha pasada no sirve');
  t.eq(A.primeroDelMesQueViene(new Date('2026-12-15T10:00:00Z')), new Date('2027-01-01T00:00:00Z'), 'el día 1 del mes que viene (cambio de año)');
  t.eq(A.clasificarError(429, { type: 'rate_limit_error', message: 'x' }).codigo, 'ocupada', '429 sin enforced: ocupada');
  t.eq(A.clasificarError(404, { type: 'not_found_error', message: 'model: x' }).codigo, 'error', '404 (modelo que no existe): error');
}
