// Panel → Productos → Pedidos: «Leer con IA» (función «ia», supabase/ia.sql) y la página IA.
// - Con la IA apagada (como arranca) no aparece nada nuevo.
// - Prendida: el botón está en los pedidos que llegaron después del cambio de la política; en los
//   de antes, un aviso para cargarlo a mano; un pedido ya leído viene completo.
// - Al tocar: «Leyendo…» y deshabilitado; llena kcal, macros, porción y unidad, los marca «Leído
//   con IA» (y aparte los dudosos), avisa si las calorías no cierran, si la tabla era por porción
//   o si no se ve la tabla. Publicar manda lo que quedó en el formulario.
// - Los errores muestran su texto en la tarjeta, una sola vez y sin cartel abajo («Falta la clave»,
//   «La IA está apagada», el límite del mes con la fecha, la función sin publicar, el texto propio
//   de la función para «error» y «solo administradores») y el botón vuelve a quedar habilitado.
// - Lo que escribió el administrador no se pierde ni lo pisa la IA: ni al leer con valores ya
//   cargados, ni cuando la lista se vuelve a dibujar (publicar o rechazar otro pedido, mientras lee).
//   Si se vuelve a dibujar mientras lee, la lectura completa la tarjeta nueva y no se puede tocar
//   otra vez (no hay dos llamadas pagas).
// - La página IA: el interruptor (arranca apagado), la fecha de los créditos, la de la política, la
//   función de Pedidos, la foto del plato (sin «Contame qué comiste»: solo fotos) y el aviso de que
//   falta la clave.
// - Inicio: si la IA está cortada, aparece en «Para atender».
import { newPage, wait, text, ADMIN } from './lib.mjs';

const U = '11111111-1111-1111-1111-111111111111';
const DESDE = '2026-10-19T03:00:00Z';
const pedido = (id, name, created_at, extra) => Object.assign({ id, code: null, name, brand: 'Marca', label_path: U + '/pedido-tabla-' + id + '.jpg', front_path: null, status: 'pendiente',
  created_at, user_email: 'x@prueba.test', user_name: 'Beto', existing_id: null }, extra);
const NUEVO = new Date(Date.now() - 3600e3).toISOString();
const REQS = () => [pedido(1, 'Alfajor triple', NUEVO), pedido(2, 'Galletitas viejas', '2026-10-10T12:00:00Z'),
  pedido(3, 'Yogur leído', NUEVO, { ai_at: NUEVO, ai_encontrada: true, ai_kcal: 76, ai_protein: 2.9, ai_carbs: 12, ai_fat: 1.8, ai_unit: 'ml', ai_portion: 200, ai_por_porcion: false, ai_revisar: false, ai_dudosos: ['grasas'], ai_modelo: 'm1', ai_columna: 'porcion' })];
const ESTADO = (extra = {}) => Object.assign({ activa: true, funciones: { etiqueta_admin: true, etiqueta_usuario: false, plato: false, texto: false, rutina: false, resumen: false },
  modelos: {}, topes: { admin: { etiqueta: 300, total: 300, usd_ciclo: 10 } }, ancla: '2026-11-10T00:00:00Z', pedidos_desde: DESDE, aviso_version: 1,
  ciclo: { id: 1, inicio: '2026-10-10T00:00:00Z', fin: '2026-11-10T00:00:00Z', credito: 200, aviso: 100, ahorro: 150, tope: 180, gastado: 0.0123, reservado: 0, estado: 'normal',
    cortado_por: null, vuelve: null, aviso_at: null, hoy: 0.0012, limite_hoy: 16.36, proyeccion: 0.05 },
  por_funcion: { etiqueta: { usos: 12, usd: 0.0123 } }, errores: {}, tablas: { leidas: 12, sin_tabla: 1, publicadas: 10, sin_corregir: 8, kcal_bien: 9 }, clave_rechazada: null, ultimas: [] }, extra);
const LEIDO = { ok: true, encontrada: true, unidad: 'g', columna: 'porcion', porcion: 50, por_porcion: false, kcal: 438, p: 5.6, c: 60, f: 20, revisar: false, dudosos: ['carbohidratos'], modelo: 'm1', modelo_nombre: 'Modelo de prueba' };

const FN_ESTADO = { ok: true, clave: true, modelos: [{ id: 'm1', nombre: 'Modelo de prueba', defecto: true, tabla: true, usd_tabla: 0.0005 }, { id: 'm2', nombre: 'Modelo capaz', defecto: false, tabla: true, usd_tabla: 0.0098 }, { id: 'm3', nombre: 'Modelo de platos', defecto: false, tabla: false, usd_tabla: 0.004 }] };

// Abre Pedidos con el estado de la IA y la respuesta de la función que se le pase (fnResp para
// leer; fnEstado para el modo «estado», el de la clave y los modelos). firmaDelay: cuánto tardan
// en llegar las direcciones de las fotos.
async function abrir(base, { estado = ESTADO(), fnResp = () => ({ body: LEIDO }), fnEstado = () => ({ body: FN_ESTADO }), reqs = REQS(), vista = 'productos', viewport, firmaDelay = 0 } = {}){
  const fnBodies = [], rpcs = [];
  const { p, errs, dialogs, close } = await newPage({ user: ADMIN, viewport: viewport || { width: 1280, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true), '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }),
    '/admin_contact_unread': (r, J) => J(0), '/admin_reports_pending': (r, J) => J(0), '/admin_requests_pending': (r, J) => J(reqs.length),
    '/admin_requests': (r, J) => J(reqs),
    '/admin_ia_estado': (r, J) => estado instanceof Error ? J({ code: 'PGRST202', message: 'Could not find the function public.admin_ia_estado without parameters in the schema cache' }, 404) : J(estado),
    '/admin_ia_config': (r, J, i) => { const b = JSON.parse(i.body || '{}'); rpcs.push(['config', b]); const p0 = b.p || {}; estado = Object.assign({}, estado, p0.activa !== undefined ? { activa: p0.activa } : {}, p0.funciones ? { funciones: Object.assign({}, estado.funciones, p0.funciones) } : {}, p0.pedidos_desde ? { pedidos_desde: p0.pedidos_desde } : {}); return J(estado); },
    '/admin_ia_ciclo': (r, J, i) => { rpcs.push(['ciclo', JSON.parse(i.body || '{}')]); return J(estado); },
    '/admin_request_publish': (r, J, i) => { rpcs.push(['publicar', JSON.parse(i.body || '{}')]); return J('p-1'); },
    '/admin_request_reject': (r, J, i) => { rpcs.push(['rechazar', JSON.parse(i.body || '{}')]); return J(null); },
    '/functions/v1/ia': (r, J, i) => { const b = JSON.parse(i.body || '{}'); fnBodies.push(b); const x = b.modo === 'estado' ? fnEstado(b) : fnResp(b); return x.delay ? new Promise(ok => setTimeout(ok, x.delay)).then(() => J(x.body, x.status || 200)) : J(x.body, x.status || 200); },
  } });
  await p.route(/supabase\.co\/storage\//, async r => {
    if (!(r.request().method() === 'POST' && r.request().url().includes('/object/sign/'))) return r.fulfill({ status: 404, body: '' });
    if (firmaDelay) await new Promise(ok => setTimeout(ok, firmaDelay));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JSON.parse(r.request().postData()).paths.map(x => ({ path: x, signedURL: '/object/sign/productos/' + x + '?token=t', error: null }))) });
  });
  await p.goto(base + '/admin/#' + vista); await wait(1500);
  if (vista === 'productos'){ const tab = await p.$('[data-a="ptab"][data-v="pedidos"]'); if (tab){ await tab.click(); await wait(900); } }
  const lecturas = () => fnBodies.filter(b => b.modo !== 'estado');
  return { p, errs, dialogs, close, fnBodies, lecturas, rpcs };
}
const campos = (p, id) => p.evaluate(id => {
  const c = document.querySelector(`[data-req="${id}"]`); const o = {};
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'portion', 'unit']){ const i = c.querySelector(`[data-k="${k}"]`), l = i.closest('label'); o[k] = { v: i.value, ia: l.classList.contains('ia'), dudoso: l.classList.contains('dudoso'), title: l.title }; }
  return o;
}, id);
const toastTxt = p => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
const boton = (p, id) => p.evaluate(id => { const b = document.querySelector(`[data-req="${id}"] [data-a="rqIA"]`); return b ? { txt: b.textContent, dis: b.disabled, ariaDis: b.getAttribute('aria-disabled'), busy: b.getAttribute('aria-busy') } : null; }, id);
const caja = (p, sel) => p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
const isoAR = d => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const dmy = iso => iso.split('-').reverse().join('/');

export default async function ({ base, t }){
  // 1) Apagada (como arranca): nada nuevo en los pedidos.
  let a = await abrir(base, { estado: ESTADO({ activa: false }) });
  t.eq(await a.p.$$eval('[data-a="rqIA"]', b => b.length), 0, 'apagada: no hay «Leer con IA»');
  t.ok(!(await text(a.p, '[data-req="2"]')).includes('antes del cambio'), 'apagada: tampoco el aviso de los pedidos viejos');
  t.eq(a.fnBodies, [], 'apagada: no se llama a la función (ni para el estado)');
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
  t.ok(!!(await p.$('[data-req="3"] .row-btns .ia-hecho')), 'pedido ya leído: en el lugar del botón, «Leído»');
  const ya = await campos(p, 3);
  t.ok(ya.kcal.v === '76' && ya.kcal.ia && ya.unit.v === 'ml' && ya.portion.v === '200' && ya.fat.dudoso, 'pedido ya leído: viene completo y marcado: ' + JSON.stringify(ya));
  const nota3 = await text(p, '[data-req="3"] .ia-note');
  t.has(nota3, 'Leído con IA · revisalo', 'pedido ya leído: el cartel');
  t.has(nota3, 'La tabla era por porción (200 ml): GIZE la pasó a cada 100 ml.', 'pedido ya leído: el aviso de la porción también después (ai_columna)');
  t.has(nota3, 'Hecho con Modelo de prueba.', 'pedido ya leído: el nombre del modelo, aunque no se haya abierto la página IA');
  // La fila de botones: «Leer con IA» antes de Rechazar y Publicar.
  t.eq(await p.$$eval('[data-req="1"] .row-btns button', bs => bs.map(b => b.dataset.a)), ['rqIA', 'rqReject', 'rqPublish'], 'el botón va antes de Rechazar y Publicar');
  const grilla0 = await caja(p, '[data-req="1"] .pgrid'), boton0 = await caja(p, '[data-req="1"] [data-a="rqIA"]'), rech0 = await caja(p, '[data-req="1"] [data-a="rqReject"]');
  // Con el teclado: el foco queda en el botón mientras lee.
  await p.focus('[data-req="1"] [data-a="rqIA"]'); await p.keyboard.press('Enter'); await wait(200);
  const leyendo = await boton(p, 1);
  t.ok(leyendo.txt.includes('Leyendo…') && leyendo.ariaDis === 'true' && leyendo.busy === 'true' && !leyendo.dis, 'mientras lee: «Leyendo…», aria-disabled (no disabled, así no pierde el foco): ' + JSON.stringify(leyendo));
  t.ok(await p.evaluate(() => document.activeElement && document.activeElement.dataset.a === 'rqIA'), 'mientras lee: el foco sigue en el botón');
  t.has(await text(p, '[data-req="1"] .ia-st'), 'Leyendo la tabla con IA…', 'mientras lee: se anuncia (aria-live)');
  t.eq(await caja(p, '[data-req="1"] .pgrid'), grilla0, 'mientras lee: el formulario no se corre');
  t.eq((await caja(p, '[data-req="1"] [data-a="rqIA"]')).w, boton0.w, 'mientras lee: el botón no cambia de ancho');
  await p.$eval('[data-req="1"] [data-a="rqIA"]', b => b.click()); await wait(900); // un segundo toque mientras lee
  t.eq(a.lecturas(), [{ modo: 'etiqueta', pedido: 1 }], 'llama a la función con el pedido (una sola vez, aunque se toque de nuevo mientras lee)');
  const c1 = await campos(p, 1);
  t.eq([c1.kcal.v, c1.protein.v, c1.carbs.v, c1.fat.v, c1.portion.v, c1.unit.v], ['438', '5.6', '60', '20', '50', 'g'], 'completa kcal, macros, porción y unidad');
  t.ok(['kcal', 'protein', 'carbs', 'fat', 'portion', 'unit'].every(k => c1[k].ia && /Leído con IA/.test(c1[k].title)), 'cada campo completado queda marcado «Leído con IA»');
  t.ok(c1.carbs.dudoso && !c1.kcal.dudoso, 'el que no se leía bien queda marcado aparte');
  const nota = await text(p, '[data-req="1"] .ia-note');
  t.has(nota, 'Leído con IA · revisalo', 'el cartel «Leído con IA · revisalo»');
  t.eq(nota.split('Leído con IA').length - 1, 1, 'la nota dice «Leído con IA» una sola vez');
  t.has(nota, 'Hecho con Modelo de prueba. Mirá la foto antes de publicar.', 'dice con qué modelo y que mire la foto');
  t.has(nota, 'La tabla era por porción (50 g): GIZE la pasó a cada 100 g.', 'avisa que se pasó de porción a cada 100');
  t.has(nota, 'No se leía bien: carbos', 'avisa los dudosos');
  t.has(nota, '✓ Las calorías cierran con los macros (darían 442).', 'controla las calorías con los macros');
  t.ok(!(await p.$('[data-req="1"] [data-a="rqIA"]')), 'después de leer, el botón ya no está');
  const hecho = await caja(p, '[data-req="1"] .ia-hecho');
  t.ok(hecho && hecho.x === boton0.x && hecho.w === boton0.w, 'en su lugar queda «Leído», del mismo ancho: ' + JSON.stringify([hecho, boton0]));
  t.eq((await caja(p, '[data-req="1"] [data-a="rqReject"]')).x, rech0.x, '«Rechazar» no se corre abajo del dedo');
  t.ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('ia-note')), 'el foco pasa a la nota (qué completó y qué mirar)');
  t.has(await toastTxt(p), 'Listo: revisá los valores con la foto.', 'el aviso de listo');
  t.has(await text(p, '#toastVivo'), 'Listo: revisá los valores con la foto.', 'y se anuncia (zona aria-live fija)');
  // Publicar manda lo del formulario (con lo que corrija el administrador); lo corregido deja de estar marcado.
  await p.fill('[data-req="1"] [data-k="carbs"]', '61');
  t.ok(!(await campos(p, 1)).carbs.ia, 'lo que corrige el administrador deja de estar marcado «Leído con IA»');
  await p.click('[data-req="1"] [data-a="rqPublish"]'); await wait(700);
  const pub = (a.rpcs.find(r => r[0] === 'publicar') || [])[1] || {};
  t.ok(pub.rid === 1 && pub.p_kcal === 438 && pub.p_protein === 5.6 && pub.p_carbs === 61 && pub.p_fat === 20 && pub.p_portion === 50 && pub.p_unit === 'g', 'publicar manda lo que quedó en el formulario: ' + JSON.stringify(pub));
  t.eq(a.errs, [], 'errores de la página (leer y publicar)');
  await a.close();

  // 3) Lo que escribió el administrador no se pierde al volver a dibujar la lista.
  const R4 = () => REQS().concat([pedido(4, 'Galletitas', NUEVO), pedido(5, 'Cereal leído', NUEVO, { ai_at: NUEVO, ai_encontrada: true, ai_kcal: 450, ai_protein: 7, ai_carbs: 70, ai_fat: 15, ai_unit: 'g', ai_portion: 30, ai_por_porcion: false, ai_revisar: false, ai_dudosos: [], ai_modelo: 'm1', ai_columna: '100' })]);
  a = await abrir(base, { reqs: R4() });
  await a.p.fill('[data-req="5"] [data-k="carbs"]', '65'); await a.p.fill('[data-req="5"] [data-k="kcal"]', '430');
  await a.p.fill('[data-req="4"] [data-k="kcal"]', '480'); await a.p.fill('[data-req="4"] [data-k="protein"]', '6');
  // Publicar otro (el 3, ya leído): la lista se vuelve a dibujar.
  await a.p.click('[data-req="3"] [data-a="rqPublish"]'); await wait(700);
  t.ok(!(await a.p.$('[data-req="3"]')), 'el publicado sale de la lista');
  let c5 = await campos(a.p, 5);
  t.ok(c5.carbs.v === '65' && c5.kcal.v === '430' && !c5.carbs.ia && !c5.kcal.ia && c5.fat.v === '15' && c5.fat.ia, 'al publicar otro, lo corregido sobre lo de la IA queda (y sin la marca de la IA): ' + JSON.stringify(c5));
  const c4 = await campos(a.p, 4);
  t.ok(c4.kcal.v === '480' && c4.protein.v === '6', 'al publicar otro, lo cargado a mano en otro pedido queda: ' + JSON.stringify(c4));
  // Rechazar otro: lo mismo.
  a.p.dialogAnswer = 'Falta la tabla';
  await a.p.click('[data-req="1"] [data-a="rqReject"]'); await wait(900);
  t.ok((a.rpcs.find(r => r[0] === 'rechazar') || [])[1] && !(await a.p.$('[data-req="1"]')), 'el rechazado sale de la lista');
  c5 = await campos(a.p, 5);
  t.ok(c5.carbs.v === '65' && c5.kcal.v === '430', 'al rechazar otro, lo corregido queda: ' + JSON.stringify(c5));
  await a.p.click('[data-req="5"] [data-a="rqPublish"]'); await wait(700);
  const pub5 = a.rpcs.filter(r => r[0] === 'publicar').map(r => r[1]).find(b => b.rid === 5) || {};
  t.ok(pub5.p_kcal === 430 && pub5.p_carbs === 65 && pub5.p_protein === 7, 'y al publicarlo manda lo corregido, no lo que leyó la IA: ' + JSON.stringify(pub5));
  t.eq(a.errs, [], 'errores de la página (volver a dibujar)');
  await a.close();

  // 4) «Leer con IA» no pisa lo que ya estaba cargado: lo dice en la nota.
  a = await abrir(base);
  await a.p.fill('[data-req="1"] [data-k="kcal"]', '999'); await a.p.fill('[data-req="1"] [data-k="protein"]', '9');
  await a.p.selectOption('[data-req="1"] [data-k="unit"]', 'ml');
  await a.p.click('[data-req="1"] [data-a="rqIA"]'); await wait(500);
  const cc = await campos(a.p, 1);
  t.ok(cc.kcal.v === '999' && cc.protein.v === '9' && cc.unit.v === 'ml' && !cc.kcal.ia && !cc.protein.ia && !cc.unit.ia, 'no pisa lo que ya había cargado: ' + JSON.stringify(cc));
  t.ok(cc.carbs.v === '60' && cc.carbs.ia && cc.fat.v === '20' && cc.portion.v === '50', 'y completa lo que estaba vacío: ' + JSON.stringify(cc));
  t.has(await text(a.p, '[data-req="1"] .ia-note'), 'No cambié lo que ya habías cargado: kcal, proteína, unidad. Comparalo con la foto.', 'avisa qué no cambió');
  await a.close();

  // 5) Si la lista se vuelve a dibujar mientras lee (rechazar otro, o llegan las fotos), la
  //    lectura completa la tarjeta nueva, el botón sigue «Leyendo…» y no hay dos llamadas.
  a = await abrir(base, { reqs: R4(), fnResp: () => ({ body: LEIDO, delay: 1500 }) });
  await a.p.click('[data-req="1"] [data-a="rqIA"]'); await wait(200);
  a.p.dialogAnswer = 'Falta la tabla';
  await a.p.click('[data-req="4"] [data-a="rqReject"]'); await wait(500);
  const durante = await boton(a.p, 1);
  t.ok(durante && durante.txt.includes('Leyendo…') && durante.ariaDis === 'true', 'rechazar otro mientras lee: el botón sigue «Leyendo…»: ' + JSON.stringify(durante));
  t.has(await text(a.p, '[data-req="1"] .ia-st'), 'Leyendo la tabla con IA…', 'rechazar otro mientras lee: sigue diciendo que lee');
  await a.p.$eval('[data-req="1"] [data-a="rqIA"]', b => b.click()); await wait(1300);
  t.eq(a.lecturas().length, 1, 'tocar otra vez mientras lee no hace otra llamada (que se paga)');
  const fin = await campos(a.p, 1);
  t.ok(fin.kcal.v === '438' && fin.kcal.ia && fin.carbs.v === '60', 'la lectura completa la tarjeta que se ve: ' + JSON.stringify(fin));
  t.ok(!(await a.p.$('[data-req="1"] [data-a="rqIA"]')) && !!(await a.p.$('[data-req="1"] .ia-hecho')), 'y el botón queda en «Leído»');
  t.has(await text(a.p, '[data-req="1"] .ia-note'), 'Leído con IA · revisalo', 'con su nota');
  await a.close();
  a = await abrir(base, { firmaDelay: 2500, fnResp: () => ({ body: LEIDO, delay: 300 }) });
  await a.p.fill('[data-req="1"] [data-k="name"]', 'Alfajor triple de dulce de leche');
  await a.p.click('[data-req="1"] [data-a="rqIA"]'); await wait(2800);
  t.ok(!!(await a.p.$('[data-req="1"] .prod-ph img')), 'llegan las fotos después');
  const ff = await campos(a.p, 1);
  t.ok(ff.kcal.v === '438' && ff.kcal.ia, 'las fotos llegan después de leer: lo leído sigue en la tarjeta: ' + JSON.stringify(ff));
  t.eq(await a.p.inputValue('[data-req="1"] [data-k="name"]'), 'Alfajor triple de dulce de leche', 'y lo escrito también');
  t.eq(a.lecturas().length, 1, 'una sola llamada');
  await a.close();

  // 6) Avisos del resultado: no cierra, por porción sin tamaño, sin tabla.
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

  // 7) Errores: el texto en la tarjeta (una sola vez: sin cartel abajo) y el botón otra vez habilitado.
  const ERRORES = [
    [{ status: 503, body: { ok: false, codigo: 'pausada', motivo: 'sin_clave', mensaje: 'x' } }, 'Falta la clave de la IA (ANTHROPIC_API_KEY)'],
    [{ status: 503, body: { ok: false, codigo: 'pausada', motivo: 'apagada', mensaje: 'x' } }, 'La IA está apagada.'],
    [{ status: 503, body: { ok: false, codigo: 'tope_mes', motivo: 'limite_console', vuelve: '2026-11-01T12:00:00Z', mensaje: 'x' } }, 'La IA de GIZE llegó a su límite de este mes: cargalo a mano. Vuelve el 1 de nov'],
    [{ status: 503, body: { ok: false, codigo: 'pausada', motivo: 'creditos', mensaje: 'x' } }, 'se terminaron los créditos'],
    [{ status: 503, body: { ok: false, codigo: 'ocupada', mensaje: 'x' } }, 'La IA está con mucha demanda. Probá en un minuto.'],
    [{ status: 422, body: { ok: false, codigo: 'no_se_pudo', mensaje: 'x' } }, 'No se pudo analizar esta foto.'],
    [{ status: 403, body: { ok: false, codigo: 'persona_sin_ia', mensaje: 'x' } }, 'Esta persona desactivó la IA: cargalo a mano.'],
    [{ status: 403, body: { ok: false, codigo: 'no_habilitado', mensaje: 'Este pedido llegó antes del cambio de la política: cargalo a mano.' } }, 'Este pedido llegó antes del cambio de la política: cargalo a mano.'],
    [{ status: 403, body: { ok: false, codigo: 'no_habilitado', motivo: 'solo_admin', mensaje: 'Por ahora la lectura con IA es solo para el equipo de GIZE.' } }, 'Por ahora la lectura con IA es solo para el equipo de GIZE.'],
    [{ status: 502, body: { ok: false, codigo: 'error', mensaje: 'La IA está tardando más de lo normal o falló. Probá de nuevo en un rato.' } }, 'La IA está tardando más de lo normal o falló.'],
    [{ status: 409, body: { ok: false, codigo: 'error', mensaje: 'Ese pedido ya se resolvió.' } }, 'Ese pedido ya se resolvió.'],
    [{ status: 404, body: { ok: false, codigo: 'error', mensaje: 'Ese pedido ya no existe.' } }, 'Ese pedido ya no existe.'],
    [{ status: 502, body: { ok: false, codigo: 'error', mensaje: 'No se pudo bajar la foto del pedido. Probá de nuevo.' } }, 'No se pudo bajar la foto del pedido.'],
    [{ status: 404, body: { code: 'NOT_FOUND', message: 'Requested function was not found' } }, 'La función «ia» todavía no está publicada'],
  ];
  for (const [resp, txt] of ERRORES){
    a = await abrir(base, { fnResp: () => resp });
    const que = 'error ' + (resp.body.codigo || resp.status) + (resp.body.motivo ? ' ' + resp.body.motivo : '') + ' (' + resp.status + ')';
    await a.p.click('[data-req="1"] [data-a="rqIA"]'); await wait(350);
    t.has(await text(a.p, '[data-req="1"] .ia-st'), txt, que + ': el texto en la tarjeta');
    t.eq(await toastTxt(a.p), '', que + ': sin cartel abajo (no se repite)');
    const b = await boton(a.p, 1);
    t.ok(b && !b.dis && b.ariaDis === null && b.txt.includes('Leer con IA'), que + ': el botón vuelve a andar: ' + JSON.stringify(b));
    t.eq((await campos(a.p, 1)).kcal.v, '', que + ': no completa nada');
    await a.close();
  }

  // 8) Página IA.
  const APAGADA = ESTADO({ activa: false, ancla: null, pedidos_desde: null, ciclo: null, funciones: { etiqueta_admin: false, etiqueta_usuario: false, plato: false, texto: false, rutina: false, resumen: false } });
  a = await abrir(base, { vista: 'ia', estado: APAGADA, fnEstado: () => ({ body: Object.assign({}, FN_ESTADO, { clave: false }) }) });
  const ia = a.p;
  t.ok(await ia.isVisible('.nav[data-go="ia"]'), 'el menú tiene IA');
  t.eq(await ia.$eval('[data-a="iaOn"]', b => b.getAttribute('aria-checked')), 'false', 'el interruptor arranca apagado');
  const pag = await text(ia, '#main');
  t.has(pag, 'Falta la clave de la IA.', 'avisa que falta la clave');
  t.has(pag, 'Falta la fecha en que vencen los créditos.', 'avisa que falta la fecha de los créditos');
  t.has(pag, 'Falta la fecha de la política de privacidad.', 'avisa que falta la fecha de la política');
  t.has(pag, 'El día que se publique la política, avisalo en Avisos', 'recuerda avisar el cambio de la política en la app (la política lo promete)');
  t.ok(await ia.isVisible('#iaFunB a[data-go="avisos"]'), 'con un enlace a Avisos');
  t.ok(a.fnBodies.length >= 1 && a.fnBodies.every(b => b.modo === 'estado'), 'pregunta a la función si está la clave (sin leer nada): ' + JSON.stringify(a.fnBodies));
  // El modelo: solo los que sirven para tablas, con lo que cuesta cada una, y el más capaz con su nombre.
  t.eq(await ia.$$eval('#iaModelo option', os => os.map(o => o.textContent)), ['Modelo de prueba (el de siempre) · unos US$ 0,0005 por tabla', 'Modelo capaz · unos US$ 0,0098 por tabla'], 'el modelo: solo los de tablas, con el costo de cada una');
  t.has(pag, 'Si lee mal las tablas, probá con Modelo capaz: cuesta unas 20 veces más por tabla', 'la ayuda nombra al modelo más capaz');
  // Los campos de fecha: la etiqueta apunta al que se ve.
  const lab = await ia.evaluate(() => ['iaAnclaTxt', 'iaDesdeTxt'].map(id => { const i = document.getElementById(id); return { labels: [...i.labels].map(l => l.textContent.trim()), aria: i.getAttribute('aria-label') }; }));
  t.ok(/Vencimiento de los créditos/.test(lab[0].labels[0] || '') && /Día en que se publicó la política/.test(lab[1].labels[0] || '') && !/día\/mes\/año/.test(lab[0].aria + lab[1].aria), 'las fechas se anuncian por su nombre: ' + JSON.stringify(lab));
  await ia.click('label[for="iaAnclaTxt"]'); await wait(100);
  t.eq(await ia.evaluate(() => document.activeElement.id), 'iaAnclaTxt', 'tocar la etiqueta lleva al campo que se ve');
  await ia.focus('[data-a="iaOn"]'); await ia.keyboard.press('Enter'); await wait(900);
  t.ok(a.dialogs.some(d => /¿Prender la IA\?/.test(d)), 'prenderla pide confirmar');
  t.eq((a.rpcs.find(r => r[0] === 'config') || [])[1], { p: { activa: true } }, 'el interruptor prende la IA');
  t.eq(await ia.$eval('[data-a="iaOn"]', b => b.getAttribute('aria-checked')), 'true', 'y queda prendido');
  t.eq(await ia.evaluate(() => document.activeElement && document.activeElement.dataset.a), 'iaOn', 'el foco vuelve al interruptor después de guardar');
  await ia.click('[data-a="iaFn"][data-k="etiqueta_admin"]'); await wait(600);
  t.eq(a.rpcs.filter(r => r[0] === 'config')[1], ['config', { p: { funciones: { etiqueta_admin: true } } }], 'prende «Leer tablas en Pedidos»');
  for (const k of ['etiqueta_usuario', 'planilla', 'rutina', 'resumen'])
    t.ok(await ia.$eval(`[data-a="iaFn"][data-k="${k}"]`, b => b.disabled), 'lo que todavía no está en la app no se puede prender (' + k + ')');
  // La foto del plato (app) ya se puede prender, con confirmación.
  t.ok(!(await ia.$eval('[data-a="iaFn"][data-k="plato"]', b => b.disabled)), '«Foto del plato» se puede prender');
  await ia.click('[data-a="iaFn"][data-k="plato"]'); await wait(700);
  t.ok(a.dialogs.some(d => d.includes('¿Prender «Foto del plato» en la app?')), '«Foto del plato»: pide confirmar');
  t.eq(a.rpcs.filter(r => r[0] === 'config').pop(), ['config', { p: { funciones: { plato: true } } }], 'prende «Foto del plato»');
  t.has(await text(ia, '#main'), 'Aparece en Comida, al lado del buscador', 'dice dónde aparece en la app');
  // «Contame qué comiste» se sacó (solo fotos): ya no hay interruptor.
  t.ok(!(await ia.$('[data-a="iaFn"][data-k="texto"]')), 'sin el interruptor de «Contame qué comiste»');
  t.ok(!(await text(ia, '.ia-funs')).includes('«Contame qué comiste» (app)'), 'la lista de funciones no lo nombra como función');
  if (process.env.SHOTS) { await ia.$eval('.ia-funs', e => e.scrollIntoView({ block: 'center' })); await wait(200); await ia.screenshot({ path: process.env.SHOTS + '/30-panel-funciones.png' }); }
  await ia.fill('#iaAnclaTxt', '10/11/2026'); await ia.click('[data-a="iaAncla"]'); await wait(600);
  t.eq((a.rpcs.find(r => r[0] === 'ciclo') || [])[1], { p_fin: '2026-11-10' }, 'guarda la fecha en que vencen los créditos');
  // La fecha de la política: un día pasado → desde las 00:00 del día siguiente; hoy → desde ahora.
  const ayer = isoAR(new Date(Date.now() - 2 * 864e5)), siguiente = isoAR(new Date(Date.now() - 864e5));
  await ia.fill('#iaDesdeTxt', dmy(ayer)); await ia.click('[data-a="iaDesde"]'); await wait(600);
  t.eq(a.rpcs.filter(r => r[0] === 'config').pop(), ['config', { p: { pedidos_desde: siguiente + 'T00:00:00-03:00' } }], 'política publicada otro día: se leen los pedidos desde las 00:00 del día siguiente (nunca uno de antes)');
  t.eq(await ia.inputValue('#iaDesdeTxt'), dmy(ayer), 'y el campo sigue mostrando el día que se eligió');
  const antes = Date.now();
  await ia.fill('#iaDesdeTxt', dmy(isoAR(new Date()))); await ia.click('[data-a="iaDesde"]'); await wait(600);
  const hoy = Date.parse(((a.rpcs.filter(r => r[0] === 'config').pop() || [])[1] || { p: {} }).p.pedidos_desde);
  t.ok(hoy >= antes - 1000 && hoy <= Date.now(), 'política publicada hoy: se leen los pedidos desde ahora: ' + new Date(hoy).toISOString());
  t.eq(a.errs, [], 'errores de la página (IA)');
  await a.close();
  a = await abrir(base, { vista: 'ia', estado: ESTADO({ por_funcion: { etiqueta: { usos: 12, usd: 0.0123, p50: 2100, p95: 3400 } },
    tablas: { leidas: 12, sin_tabla: 1, con_tabla: 11, revisar: 2, publicadas: 10, sin_corregir: 8, kcal_bien: 9, campos: { kcal: 1, protein: 0, carbs: 2, fat: 0, portion: 1, unit: 0 } },
    errores: { refusal: 1, api_500: 2, limite_uso: 1 }, ciclo: Object.assign(ESTADO().ciclo, { frenos: { tope_dia: 3, ritmo: 1 } }),
    ultimas: [{ creada: NUEVO, rol: 'admin', funcion: 'etiqueta', modelo: 'm1', estado: 'error', codigo: 'max_tokens', usd: 0.0003, max_usd: 0.0014, ms: 1800 }] }) });
  await a.p.click('#iaUltB summary'); await wait(200);
  const pag2 = await text(a.p, '#main');
  t.has(pag2, 'La clave está cargada en Supabase.', 'con la clave: lo dice');
  t.has(pag2, 'US$ 0,0123 de US$ 200,00', 'el gasto del ciclo');
  t.has(pag2, 'Tope de hoy: US$ 16,36', 'el tope de hoy');
  t.has(pag2, 'Ciclo de los créditos: del 10 de oct de 26 al 10 de nov de 26.', 'las fechas del ciclo son las de la Console (00:00 UTC), no el día anterior');
  t.has(pag2, '90 %', 'tablas sin corregir las calorías');
  t.has(pag2, 'tarda 2,1 s (95 %: 3,4 s)', 'cuánto tarda (mediana y 95 %)');
  t.has(pag2, 'Corregido por campo (de 10 publicadas): kcal 10 % · proteína 0 % · carbos 20 % · grasas 0 % · porción 10 % · unidad 0 %', 'lo corregido por campo');
  t.has(pag2, 'Calorías que no cerraban con los macros: 18 % de las tablas leídas.', 'el % de «revisar»');
  t.has(pag2, 'Frenadas por la guardia: tope del día 3 · ritmo del día 1', 'las frenadas de la guardia');
  t.has(pag2, 'Errores del ciclo: la IA no quiso leerla 1 · error de la API (500) 2 · mucha demanda (límite por minuto) 1', 'los errores, en castellano');
  t.has(pag2, 'respuesta cortada', 'las últimas llamadas, en castellano');
  t.ok(!/\brefusal\b|max_tokens|api_500/.test(pag2), 'sin códigos crudos en inglés');
  await a.close();
  // La IA del coach (base en supabase/ia.sql): el coach en su prueba gratis tiene topes propios
  // («Coach en prueba») y las planillas tienen su nombre en Topes, en el uso y en las llamadas.
  a = await abrir(base, { vista: 'ia', estado: ESTADO({ topes: { admin: { etiqueta: 300, total: 300, usd_ciclo: 10 },
      coach: { planilla: 30, rutina: 15, total: 60, usd_ciclo: 5 }, prueba: { planilla: 15, rutina: 5, total: 20, usd_ciclo: 1 } },
    por_funcion: { planilla: { usos: 3, usd: 0.01 } },
    ultimas: [{ creada: NUEVO, rol: 'prueba', origen: null, funcion: 'planilla', modelo: 'm1', estado: 'ok', codigo: null, usd: 0.003, max_usd: 0.015, ms: 9000 },
      { creada: NUEVO, rol: 'coach', origen: 'plan', funcion: 'rutina', modelo: 'm1', estado: 'ok', codigo: null, usd: 0.003, max_usd: 0.009, ms: 8000 }] }) });
  await a.p.$$eval('#iaTopesB, #iaUltB', ds => ds.forEach(d => { d.open = true; })); await wait(300);
  const tps = await text(a.p, '#iaTopesB');
  t.has(tps, 'Coach en prueba', 'Topes: el coach en prueba con su nombre');
  t.has(tps, 'Coach en su prueba gratis, sin plan pago: solo planillas y rutinas', 'Topes: qué es el coach en prueba');
  t.has(tps, 'Planillas por día', 'Topes: las planillas por día con su nombre');
  t.eq(await a.p.inputValue('[data-tope="prueba.planilla"]'), '15', 'Topes: las planillas del coach en prueba se pueden cambiar');
  t.has(await text(a.p, '#iaUsoB'), 'Planillas', 'Uso del ciclo: las planillas con su nombre');
  t.eq(await a.p.$$eval('#iaUltB tbody tr', trs => trs.map(tr => [tr.children[1].textContent, tr.children[2].textContent])), [['Coach en prueba', 'Planillas'], ['Coach', 'Rutinas']], 'Últimas llamadas: el coach en prueba y las planillas con su nombre');
  t.ok(!(await a.p.$$eval('#iaTopesB b, #iaTopesB label, #iaUltB tbody td', es => es.map(e => e.textContent.trim()))).some(x => /^(prueba|planilla)\b/.test(x)), 'sin claves crudas');
  t.eq(a.errs, [], 'errores de la página (IA del coach)');
  await a.close();
  // En el celular, las marcas de la barra no se pisan.
  a = await abrir(base, { vista: 'ia', viewport: { width: 390, height: 844 } });
  const marcas = await a.p.$$eval('.ia-bar .mk em', es => es.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }));
  t.ok(marcas.length === 3 && marcas.every((m, i) => i === 0 || m[0] >= marcas[i - 1][1]), 'celular: las marcas de la barra no se pisan: ' + JSON.stringify(marcas));
  t.ok(await a.p.isVisible('.ia-ley'), 'celular: abajo, la referencia de las marcas');
  await a.close();

  // 9) Inicio: el gasto del ciclo y, si la IA está cortada, en «Para atender».
  a = await abrir(base, { vista: 'resumen' });
  t.has(await text(a.p, '#hIaB'), 'US$ 0,0123 de US$ 200,00', 'Inicio: el gasto del ciclo');
  await a.close();
  a = await abrir(base, { vista: 'resumen', estado: ESTADO({ ciclo: Object.assign(ESTADO().ciclo, { estado: 'cortado', cortado_por: 'tope', vuelve: '2026-11-10T00:00:00Z', gastado: 180 }) }) });
  t.has(await text(a.p, '#hTodo'), 'IA cortada', 'Inicio: la IA cortada en «Para atender»');
  await a.close();
}
