// Panel → Productos → Pedidos: «Leer con IA» (función «ia», supabase/ia.sql) y la página IA.
// - Con la IA apagada (como arranca) no aparece nada nuevo.
// - Prendida: el botón está en los pedidos que llegaron después del cambio de la política; en los
//   de antes, un aviso para cargarlo a mano; un pedido ya leído viene completo.
// - Al tocar: «Leyendo…» y deshabilitado; llena kcal, macros, porción y unidad, los marca «Leído
//   con IA» (y aparte los dudosos), avisa si las calorías no cierran, si la tabla era por porción
//   o si no se ve la tabla. Publicar manda lo que quedó en el formulario.
// - Los errores muestran su texto («Falta la clave», «La IA está apagada», el límite del mes con la
//   fecha, la función sin publicar) y el botón vuelve a quedar habilitado.
// - La página IA: el interruptor (arranca apagado), la fecha de los créditos, la de la política, la
//   función de Pedidos y el aviso de que falta la clave.
// - Inicio: si la IA está cortada, aparece en «Para atender».
import { newPage, wait, text, ADMIN } from './lib.mjs';

const U = '11111111-1111-1111-1111-111111111111';
const DESDE = '2026-10-19T03:00:00Z';
const pedido = (id, name, created_at, extra) => Object.assign({ id, code: null, name, brand: 'Marca', label_path: U + '/pedido-tabla-' + id + '.jpg', front_path: null, status: 'pendiente',
  created_at, user_email: 'x@prueba.test', user_name: 'Beto', existing_id: null }, extra);
const NUEVO = new Date(Date.now() - 3600e3).toISOString();
const REQS = () => [pedido(1, 'Alfajor triple', NUEVO), pedido(2, 'Galletitas viejas', '2026-10-10T12:00:00Z'),
  pedido(3, 'Yogur leído', NUEVO, { ai_at: NUEVO, ai_encontrada: true, ai_kcal: 76, ai_protein: 2.9, ai_carbs: 12, ai_fat: 1.8, ai_unit: 'ml', ai_portion: 200, ai_por_porcion: false, ai_revisar: false, ai_dudosos: ['grasas'], ai_modelo: 'm1' })];
const ESTADO = (extra = {}) => Object.assign({ activa: true, funciones: { etiqueta_admin: true, etiqueta_usuario: false, plato: false, texto: false, rutina: false, resumen: false },
  modelos: {}, topes: { admin: { etiqueta: 300, total: 300, usd_ciclo: 10 } }, ancla: '2026-11-10T00:00:00Z', pedidos_desde: DESDE, aviso_version: 1,
  ciclo: { id: 1, inicio: '2026-10-10T00:00:00Z', fin: '2026-11-10T00:00:00Z', credito: 200, aviso: 100, ahorro: 150, tope: 180, gastado: 0.0123, reservado: 0, estado: 'normal',
    cortado_por: null, vuelve: null, aviso_at: null, hoy: 0.0012, limite_hoy: 16.36, proyeccion: 0.05 },
  por_funcion: { etiqueta: { usos: 12, usd: 0.0123 } }, errores: {}, tablas: { leidas: 12, sin_tabla: 1, publicadas: 10, sin_corregir: 8, kcal_bien: 9 }, clave_rechazada: null, ultimas: [] }, extra);
const LEIDO = { ok: true, encontrada: true, unidad: 'g', columna: 'porcion', porcion: 50, por_porcion: false, kcal: 438, p: 5.6, c: 60, f: 20, revisar: false, dudosos: ['carbohidratos'], modelo: 'm1', modelo_nombre: 'Modelo de prueba' };

// Abre Pedidos con el estado de la IA y la respuesta de la función que se le pase.
async function abrir(base, { estado = ESTADO(), fnResp = () => ({ body: LEIDO }), reqs = REQS(), vista = 'productos', viewport } = {}){
  const fnBodies = [], rpcs = [];
  const { p, errs, close } = await newPage({ user: ADMIN, viewport: viewport || { width: 1280, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true), '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }),
    '/admin_contact_unread': (r, J) => J(0), '/admin_reports_pending': (r, J) => J(0), '/admin_requests_pending': (r, J) => J(reqs.length),
    '/admin_requests': (r, J) => J(reqs),
    '/admin_ia_estado': (r, J) => estado instanceof Error ? J({ code: 'PGRST202', message: 'Could not find the function public.admin_ia_estado without parameters in the schema cache' }, 404) : J(estado),
    '/admin_ia_config': (r, J, i) => { const b = JSON.parse(i.body || '{}'); rpcs.push(['config', b]); const p0 = b.p || {}; estado = Object.assign({}, estado, p0.activa !== undefined ? { activa: p0.activa } : {}, p0.funciones ? { funciones: Object.assign({}, estado.funciones, p0.funciones) } : {}, p0.pedidos_desde ? { pedidos_desde: p0.pedidos_desde } : {}); return J(estado); },
    '/admin_ia_ciclo': (r, J, i) => { rpcs.push(['ciclo', JSON.parse(i.body || '{}')]); return J(estado); },
    '/admin_request_publish': (r, J, i) => { rpcs.push(['publicar', JSON.parse(i.body || '{}')]); return J('p-1'); },
    '/functions/v1/ia': (r, J, i) => { const b = JSON.parse(i.body || '{}'); fnBodies.push(b); const x = fnResp(b); return x.delay ? new Promise(ok => setTimeout(ok, x.delay)).then(() => J(x.body, x.status || 200)) : J(x.body, x.status || 200); },
  } });
  await p.route(/supabase\.co\/storage\//, r => r.request().method() === 'POST' && r.request().url().includes('/object/sign/')
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JSON.parse(r.request().postData()).paths.map(x => ({ path: x, signedURL: '/object/sign/productos/' + x + '?token=t', error: null }))) })
    : r.fulfill({ status: 404, body: '' }));
  await p.goto(base + '/admin/#' + vista); await wait(1500);
  if (vista === 'productos'){ const tab = await p.$('[data-a="ptab"][data-v="pedidos"]'); if (tab){ await tab.click(); await wait(900); } }
  return { p, errs, close, fnBodies, rpcs };
}
const campos = (p, id) => p.evaluate(id => {
  const c = document.querySelector(`[data-req="${id}"]`); const o = {};
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'portion', 'unit']){ const i = c.querySelector(`[data-k="${k}"]`), l = i.closest('label'); o[k] = { v: i.value, ia: l.classList.contains('ia'), dudoso: l.classList.contains('dudoso'), title: l.title }; }
  return o;
}, id);
const toastTxt = p => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));

export default async function ({ base, t }){
  // 1) Apagada (como arranca): nada nuevo en los pedidos.
  let a = await abrir(base, { estado: ESTADO({ activa: false }) });
  t.eq(await a.p.$$eval('[data-a="rqIA"]', b => b.length), 0, 'apagada: no hay «Leer con IA»');
  t.ok(!(await text(a.p, '[data-req="2"]')).includes('antes del cambio'), 'apagada: tampoco el aviso de los pedidos viejos');
  t.eq(a.errs, [], 'errores de la página (apagada)');
  await a.close();
  // Prendida pero sin la fecha de la política: no se lee nada (y no se avisa en cada pedido).
  a = await abrir(base, { estado: ESTADO({ pedidos_desde: null }) });
  t.ok(!(await a.p.$('[data-a="rqIA"]')) && !(await text(a.p, '#pList')).includes('antes del cambio'), 'sin la fecha de la política: sin botón ni aviso en los pedidos');
  await a.close();
  // Sin la base de la IA (falta correr ia.sql): Pedidos anda como siempre.
  a = await abrir(base, { estado: new Error('sin base') });
  t.ok((await a.p.$$('[data-req]')).length === 3 && !(await a.p.$('[data-a="rqIA"]')), 'sin ia.sql: los pedidos se ven igual y sin botón');
  await a.close();

  // 2) Prendida.
  a = await abrir(base, { fnResp: () => ({ body: LEIDO, delay: 700 }) });
  const p = a.p;
  t.ok(!!(await p.$('[data-req="1"] [data-a="rqIA"]')), 'pedido nuevo: está «Leer con IA»');
  t.ok(!(await p.$('[data-req="2"] [data-a="rqIA"]')), 'pedido anterior a la política: sin botón');
  t.has(await text(p, '[data-req="2"]'), 'Este pedido llegó antes del cambio de la política: cargalo a mano.', 'pedido anterior a la política: el aviso');
  t.ok(!(await p.$('[data-req="3"] [data-a="rqIA"]')), 'pedido ya leído: sin botón');
  const ya = await campos(p, 3);
  t.ok(ya.kcal.v === '76' && ya.kcal.ia && ya.unit.v === 'ml' && ya.portion.v === '200' && ya.fat.dudoso, 'pedido ya leído: viene completo y marcado: ' + JSON.stringify(ya));
  t.has(await text(p, '[data-req="3"]'), 'Leído con IA · revisalo', 'pedido ya leído: el cartel');
  // La fila de botones: «Leer con IA» antes de Rechazar y Publicar.
  t.eq(await p.$$eval('[data-req="1"] .row-btns button', bs => bs.map(b => b.dataset.a)), ['rqIA', 'rqReject', 'rqPublish'], 'el botón va antes de Rechazar y Publicar');
  await p.click('[data-req="1"] [data-a="rqIA"]'); await wait(200);
  const leyendo = await p.$eval('[data-req="1"] [data-a="rqIA"]', b => ({ txt: b.textContent, dis: b.disabled, busy: b.getAttribute('aria-busy') }));
  t.ok(leyendo.txt.includes('Leyendo…') && leyendo.dis && leyendo.busy === 'true', 'mientras lee: «Leyendo…» y deshabilitado: ' + JSON.stringify(leyendo));
  t.has(await text(p, '[data-req="1"] .ia-st'), 'Leyendo la tabla con IA…', 'mientras lee: se anuncia (aria-live)');
  await wait(900);
  t.eq(a.fnBodies, [{ modo: 'etiqueta', pedido: 1 }], 'llama a la función con el pedido');
  const c1 = await campos(p, 1);
  t.eq([c1.kcal.v, c1.protein.v, c1.carbs.v, c1.fat.v, c1.portion.v, c1.unit.v], ['438', '5.6', '60', '20', '50', 'g'], 'completa kcal, macros, porción y unidad');
  t.ok(['kcal', 'protein', 'carbs', 'fat', 'portion', 'unit'].every(k => c1[k].ia && /Leído con IA/.test(c1[k].title)), 'cada campo completado queda marcado «Leído con IA»');
  t.ok(c1.carbs.dudoso && !c1.kcal.dudoso, 'el que no se leía bien queda marcado aparte');
  const nota = await text(p, '[data-req="1"] .ia-note');
  t.has(nota, 'Leído con IA · revisalo', 'el cartel «Leído con IA · revisalo»');
  t.has(nota, 'Leído con IA (Modelo de prueba). Mirá la foto antes de publicar.', 'dice con qué modelo y que mire la foto');
  t.has(nota, 'La tabla era por porción (50 g): GIZE la pasó a cada 100 g.', 'avisa que se pasó de porción a cada 100');
  t.has(nota, 'No se leía bien: carbos', 'avisa los dudosos');
  t.has(nota, '✓ Las calorías cierran con los macros (darían 442).', 'controla las calorías con los macros');
  t.ok(!(await p.$('[data-req="1"] [data-a="rqIA"]')), 'después de leer, el botón ya no está');
  // Publicar manda lo del formulario (con lo que corrija el administrador).
  await p.fill('[data-req="1"] [data-k="carbs"]', '61');
  await p.click('[data-req="1"] [data-a="rqPublish"]'); await wait(700);
  const pub = (a.rpcs.find(r => r[0] === 'publicar') || [])[1] || {};
  t.ok(pub.rid === 1 && pub.p_kcal === 438 && pub.p_protein === 5.6 && pub.p_carbs === 61 && pub.p_fat === 20 && pub.p_portion === 50 && pub.p_unit === 'g', 'publicar manda lo que quedó en el formulario: ' + JSON.stringify(pub));
  t.eq(a.errs, [], 'errores de la página (leer y publicar)');
  await a.close();

  // 3) Avisos del resultado: no cierra, por porción sin tamaño, sin tabla.
  a = await abrir(base, { fnResp: () => ({ body: Object.assign({}, LEIDO, { columna: '100', porcion: null, kcal: 900, revisar: true, dudosos: [] }) }) });
  await a.p.click('[data-req="1"] [data-a="rqIA"]'); await wait(700);
  t.has(await text(a.p, '[data-req="1"] .ia-note'), 'Las calorías no cierran con los macros: revisá', 'revisar: el aviso de las calorías');
  await a.close();
  a = await abrir(base, { fnResp: () => ({ body: Object.assign({}, LEIDO, { columna: 'porcion', porcion: null, por_porcion: true, kcal: 76, p: 2.9, c: 12, f: 1.8, unidad: 'ml', dudosos: [] }) }) });
  await a.p.click('[data-req="1"] [data-a="rqIA"]'); await wait(700);
  const pp = await campos(a.p, 1);
  t.ok(pp.kcal.v === '' && pp.protein.v === '' && pp.carbs.v === '' && pp.fat.v === '' && pp.unit.v === 'ml', 'por porción sin tamaño: los valores cada 100 quedan vacíos: ' + JSON.stringify(pp));
  t.has(await text(a.p, '[data-req="1"] .ia-note'), 'La tabla es por porción (kcal 76, P 2,9, C 12, G 1,8) y no dice el tamaño: completá la porción y pasalo a cada 100.', 'por porción sin tamaño: la nota con los valores');
  await a.close();
  a = await abrir(base, { fnResp: () => ({ body: { ok: true, encontrada: false, modelo: 'm1', modelo_nombre: 'Modelo de prueba' } }) });
  await a.p.click('[data-req="1"] [data-a="rqIA"]'); await wait(300);
  t.has(await toastTxt(a.p), 'No se ve una tabla legible en la foto.', 'sin tabla legible: el aviso');
  t.has(await text(a.p, '[data-req="1"] .ia-note'), 'No se ve una tabla legible en la foto. Cargala a mano o rechazá el pedido.', 'sin tabla legible: queda en la tarjeta');
  t.eq((await campos(a.p, 1)).kcal.v, '', 'sin tabla legible: no completa nada');
  await a.close();

  // 4) Errores: el texto y el botón otra vez habilitado.
  const ERRORES = [
    [{ status: 503, body: { ok: false, codigo: 'pausada', motivo: 'sin_clave', mensaje: 'x' } }, 'Falta la clave de la IA (ANTHROPIC_API_KEY)'],
    [{ status: 503, body: { ok: false, codigo: 'pausada', motivo: 'apagada', mensaje: 'x' } }, 'La IA está apagada.'],
    [{ status: 503, body: { ok: false, codigo: 'tope_mes', motivo: 'limite_console', vuelve: '2026-11-01T12:00:00Z', mensaje: 'x' } }, 'La IA de GIZE llegó a su límite de este mes: cargalo a mano. Vuelve el 1 de nov'],
    [{ status: 503, body: { ok: false, codigo: 'pausada', motivo: 'creditos', mensaje: 'x' } }, 'se terminaron los créditos'],
    [{ status: 503, body: { ok: false, codigo: 'ocupada', mensaje: 'x' } }, 'La IA está con mucha demanda. Probá en un minuto.'],
    [{ status: 422, body: { ok: false, codigo: 'no_se_pudo', mensaje: 'x' } }, 'No se pudo analizar esta foto.'],
    [{ status: 403, body: { ok: false, codigo: 'persona_sin_ia', mensaje: 'x' } }, 'Esta persona desactivó la IA: cargalo a mano.'],
    [{ status: 502, body: { ok: false, codigo: 'error', mensaje: 'x' } }, 'La IA está tardando más de lo normal o falló.'],
    [{ status: 404, body: { code: 'NOT_FOUND', message: 'Requested function was not found' } }, 'La función «ia» todavía no está publicada'],
  ];
  for (const [resp, txt] of ERRORES){
    a = await abrir(base, { fnResp: () => resp });
    await a.p.click('[data-req="1"] [data-a="rqIA"]'); await wait(350);
    t.has(await toastTxt(a.p), txt, 'error ' + (resp.body.codigo || resp.status) + (resp.body.motivo ? ' ' + resp.body.motivo : '') + ': el texto');
    t.has(await text(a.p, '[data-req="1"] .ia-st'), txt, 'error ' + (resp.body.codigo || resp.status) + ': queda en la tarjeta');
    const b = await a.p.$eval('[data-req="1"] [data-a="rqIA"]', b => ({ dis: b.disabled, txt: b.textContent }));
    t.ok(!b.dis && b.txt.includes('Leer con IA'), 'error ' + (resp.body.codigo || resp.status) + ': el botón vuelve a estar habilitado');
    t.eq((await campos(a.p, 1)).kcal.v, '', 'error: no completa nada');
    await a.close();
  }

  // 5) Página IA.
  a = await abrir(base, { vista: 'ia', estado: ESTADO({ activa: false, ancla: null, pedidos_desde: null, ciclo: null, funciones: { etiqueta_admin: false, etiqueta_usuario: false, plato: false, texto: false, rutina: false, resumen: false } }), fnResp: () => ({ body: { ok: true, clave: false, modelos: [{ id: 'm1', nombre: 'Modelo de prueba', defecto: true }, { id: 'm2', nombre: 'Modelo capaz', defecto: false }] } }) });
  const ia = a.p;
  t.ok(await ia.isVisible('.nav[data-go="ia"]'), 'el menú tiene IA');
  t.eq(await ia.$eval('[data-a="iaOn"]', b => b.getAttribute('aria-checked')), 'false', 'el interruptor arranca apagado');
  const pag = await text(ia, '#main');
  t.has(pag, 'Falta la clave de la IA.', 'avisa que falta la clave');
  t.has(pag, 'Falta la fecha en que vencen los créditos.', 'avisa que falta la fecha de los créditos');
  t.has(pag, 'Falta la fecha de la política de privacidad.', 'avisa que falta la fecha de la política');
  t.ok(a.fnBodies.length >= 1 && a.fnBodies.every(b => b.modo === 'estado'), 'pregunta a la función si está la clave (sin leer nada): ' + JSON.stringify(a.fnBodies));
  await ia.click('[data-a="iaOn"]'); await wait(600);
  t.eq((a.rpcs.find(r => r[0] === 'config') || [])[1], { p: { activa: true } }, 'el interruptor prende la IA');
  t.eq(await ia.$eval('[data-a="iaOn"]', b => b.getAttribute('aria-checked')), 'true', 'y queda prendido');
  await ia.click('[data-a="iaFn"][data-k="etiqueta_admin"]'); await wait(600);
  t.eq(a.rpcs.filter(r => r[0] === 'config')[1], ['config', { p: { funciones: { etiqueta_admin: true } } }], 'prende «Leer tablas en Pedidos»');
  t.ok(await ia.$eval('[data-a="iaFn"][data-k="plato"]', b => b.disabled), 'lo que todavía no está en la app no se puede prender');
  await ia.fill('#iaAnclaTxt', '10/11/2026'); await ia.click('[data-a="iaAncla"]'); await wait(600);
  t.eq((a.rpcs.find(r => r[0] === 'ciclo') || [])[1], { p_fin: '2026-11-10' }, 'guarda la fecha en que vencen los créditos');
  await ia.fill('#iaDesdeTxt', '19/10/2026'); await ia.click('[data-a="iaDesde"]'); await wait(600);
  t.eq(a.rpcs.filter(r => r[0] === 'config').pop(), ['config', { p: { pedidos_desde: '2026-10-19T00:00:00-03:00' } }], 'guarda la fecha de la política (a la medianoche de Argentina)');
  t.eq(a.errs, [], 'errores de la página (IA)');
  await a.close();
  a = await abrir(base, { vista: 'ia', fnResp: () => ({ body: { ok: true, clave: true, modelos: [{ id: 'm1', nombre: 'Modelo de prueba', defecto: true }] } }) });
  const pag2 = await text(a.p, '#main');
  t.has(pag2, 'La clave está cargada en Supabase.', 'con la clave: lo dice');
  t.has(pag2, 'US$ 0,0123 de US$ 200,00', 'el gasto del ciclo');
  t.has(pag2, 'Tope de hoy: US$ 16,36', 'el tope de hoy');
  t.has(pag2, 'Ciclo de los créditos: del 10 de oct de 26 al 10 de nov de 26.', 'las fechas del ciclo son las de la Console (00:00 UTC), no el día anterior');
  t.has(pag2, '90 %', 'tablas sin corregir las calorías');
  await a.close();

  // 6) Inicio: la IA cortada aparece en «Para atender».
  a = await abrir(base, { vista: 'resumen', estado: ESTADO({ ciclo: Object.assign(ESTADO().ciclo, { estado: 'cortado', cortado_por: 'tope', vuelve: '2026-11-10T00:00:00Z', gastado: 180 }) }) });
  t.has(await text(a.p, '#hTodo'), 'IA cortada', 'Inicio: la IA cortada en «Para atender»');
  await a.close();
}
