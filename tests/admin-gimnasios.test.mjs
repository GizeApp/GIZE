// Panel de administración: la pestaña «Gimnasios» de Usuarios (supabase/gimnasios-admin.sql).
// - Está al lado de «Coaches y pagos»; en el menú queda marcado Usuarios.
// - Lista con las marcas (sobre el cupo, plan menor a 100, sin uso a los 30 días, diferencia en el
//   cupo, cerrado por la baja del dueño con los días para borrarlo) y el interruptor «Crear gimnasios»
//   (app_config «gimnasios», que pregunta antes).
// - El detalle: equipo y contadores, sin datos de socios; subir el tope de profes; transferir (avisa
//   que la suscripción de Mercado Pago no pasa); exportar la auditoría en CSV; cerrar escribiendo el
//   nombre (con otro nombre no cierra).
// - Convertir una cuenta de coach eligiendo qué alumnos pasan (los demás siguen como alumnos propios),
//   desde la pestaña y desde la ficha del coach en «Coaches y pagos».
// - Celular: la tabla scrollea adentro y la página no se va de costado. Contraste AA.
// Con GYM_CAPTURAS=<carpeta> guarda capturas de cada pantalla (el panel de admin es solo oscuro).
import { newPage, wait, text, contraste, ADMIN } from './lib.mjs';
import { captura } from './gym-comun.mjs';

const NOW = Date.now();
const D = n => new Date(NOW + n * 864e5).toISOString();
const id = n => 'a0000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const IDS = { dA: id(1), pA1: id(2), pA2: id(3), rA: id(4), aA: id(5), K: id(6), C: id(7), dN: id(8), GA: id(91), GN: id(92), GS: id(93), K1: id(61), K2: id(62), K3: id(63) };
const sinMarcas = { sobre_cupo: false, plan_menor_100: false, sin_uso_30: false, diferencia_cupo: false, cerrado_por_baja: false };
export const GYMS = { alta: false, gyms: [
  { id: IDS.GA, nombre: 'Gimnasio Fuerza', ciudad: 'Rosario', provincia: 'Santa Fe', dueno: { id: IDS.dA, nombre: 'Laura Fuerza', email: 'laura@prueba.test' }, plan: 'p250', seats_used: 182, max: 250,
    profes_usados: 6, profes_tope: 15, profes_extra: 0, recepcion: 2, estado: 'activo', vence: D(18), paid_until: D(18), trial_ends_at: D(-60), mp: 'authorized', apple: false, apple_renueva: false,
    creado: D(-120), ultima_entrada: D(0), ultimo_uso: D(-0.1), codigo: 'FUERZA22', cerrado: null, motivo_cierre: null, borrar_el: null, dias_para_borrar: null, marcas: sinMarcas },
  { id: IDS.GN, nombre: 'Gimnasio Norte', ciudad: 'Funes', provincia: 'Santa Fe', dueno: { id: IDS.dN, nombre: 'Hugo Norte', email: 'hugo@prueba.test' }, plan: 'p50', seats_used: 61, max: 50,
    profes_usados: 9, profes_tope: 8, profes_extra: 0, recepcion: 0, estado: 'gracia', vence: D(-2), paid_until: D(-2), trial_ends_at: D(-90), mp: null, apple: false, apple_renueva: false,
    creado: D(-45), ultima_entrada: null, ultimo_uso: D(-3), codigo: 'NRTE2345', cerrado: null, motivo_cierre: null, borrar_el: null, dias_para_borrar: null,
    marcas: { sobre_cupo: true, plan_menor_100: true, sin_uso_30: true, diferencia_cupo: true, cerrado_por_baja: false } },
  { id: IDS.GS, nombre: 'Gimnasio Sur', ciudad: 'Rosario', provincia: 'Santa Fe', dueno: null, plan: null, seats_used: 0, max: 10, profes_usados: 0, profes_tope: 8, profes_extra: 0, recepcion: 0,
    estado: 'cerrado', vence: null, mp: null, apple: false, apple_renueva: false, creado: D(-300), ultima_entrada: D(-4), ultimo_uso: null, codigo: null, cerrado: D(-3), motivo_cierre: 'baja_cuenta_dueño',
    borrar_el: D(87), dias_para_borrar: 87, marcas: Object.assign({}, sinMarcas, { cerrado_por_baja: true }) }] };
const EQUIPO = [
  { user_id: IDS.dA, nombre: 'Laura Fuerza', email: 'laura@prueba.test', rol: 'owner', desde: D(-120), hasta: null, cuenta_coach: true, socios: 12, version: '1.0.7 (12)', plataforma: 'web', ultimo_uso: D(0) },
  { user_id: IDS.aA, nombre: 'Marcos Encargado', email: 'marcos@prueba.test', rol: 'admin', desde: D(-100), hasta: null, cuenta_coach: false, socios: 0, version: null, plataforma: 'web', ultimo_uso: D(-1) },
  { user_id: IDS.pA1, nombre: 'Martina Profe', email: 'martina@prueba.test', rol: 'profe', desde: D(-100), hasta: null, cuenta_coach: true, socios: 80, version: '1.0.6 (11)', plataforma: 'android', ultimo_uso: D(0) },
  { user_id: IDS.pA2, nombre: 'Lucas Profe', email: 'lucas@prueba.test', rol: 'profe', desde: D(-90), hasta: null, cuenta_coach: true, socios: 60, version: null, plataforma: 'web', ultimo_uso: D(-2) },
  { user_id: IDS.rA, nombre: 'Rocío Recepción', email: 'rocio@prueba.test', rol: 'recepcion', desde: D(-90), hasta: null, cuenta_coach: false, socios: 0, version: null, plataforma: 'web', ultimo_uso: D(0) }];
export const DETALLE = id => Object.assign({}, GYMS.gyms.find(g => g.id === id), {
  equipo: id === IDS.GA ? EQUIPO : id === IDS.GS ? [{ user_id: IDS.pA1, nombre: 'Martina Profe', email: 'martina@prueba.test', rol: 'profe', desde: D(-200), hasta: D(-3), cuenta_coach: true, socios: 0 }] : [],
  contadores: id === IDS.GA ? { activos: 170, pausados: 12, pendientes: 4, visitas: 3, bajas: 20, sin_app: 15, sin_profe: 7, coach_externo: 2, falta_confirmacion: 9, comparten: 64, conversion: 30, ingresos_hoy: 41, ingresos_30: 1830, invitaciones: 1, avisos_pendientes: 5 }
    : { activos: 0, pausados: 0, pendientes: 0, visitas: 0, bajas: 61, sin_app: 0, sin_profe: 0, coach_externo: 0, falta_confirmacion: 0, comparten: 0, conversion: 0, ingresos_hoy: 0, ingresos_30: 0, invitaciones: 0, avisos_pendientes: 0 },
  settings: { profes_extra: 0 }, contrato: { version: '2026-10-borrador', aceptado: D(-120) } });
const coach = (o) => Object.assign({ mp_status: null, has_mp: false, pending_plan: null, active: true, price: 0, gym_id: null, gym_rol: null, gimnasio: null, sin_cargo: false, trial_ends_at: D(-60) }, o);
export const COACHES = [
  coach({ id: IDS.dA, full_name: 'Laura Fuerza', email: 'laura@prueba.test', plan: 'p250', max_clients: 250, clients: 182, paid_until: D(18), mp_status: 'authorized', has_mp: true, price: 119900, gym_id: IDS.GA, gym_rol: 'owner', gimnasio: 'Dueño de Gimnasio Fuerza' }),
  coach({ id: IDS.pA1, full_name: 'Martina Profe', email: 'martina@prueba.test', plan: 'p10', max_clients: 10, clients: 3, paid_until: D(9), price: 14900, gym_id: IDS.GA, gym_rol: 'profe', gimnasio: 'Profe de Gimnasio Fuerza' }),
  coach({ id: IDS.pA2, full_name: 'Lucas Profe', email: 'lucas@prueba.test', plan: 'trial', max_clients: 10, clients: 0, paid_until: null, trial_ends_at: D(-5), gym_id: IDS.GA, gym_rol: 'profe', gimnasio: 'Profe de Gimnasio Fuerza, sin cargo', sin_cargo: true }),
  coach({ id: IDS.K, full_name: 'Karina Coach', email: 'karina@prueba.test', plan: 'p100', max_clients: 100, clients: 3, paid_until: D(25), price: 59900 }),
  coach({ id: IDS.C, full_name: 'Carlos Online', email: 'carlos@prueba.test', plan: 'p25', max_clients: 25, clients: 14, paid_until: D(3), price: 24900 })];
const ALUMNOS_K = [{ id: IDS.K1, name: 'Ana Torres' }, { id: IDS.K2, name: 'Bruno Castro' }, { id: IDS.K3, name: 'Elena Paz' }];
export const AUDITORIA = [{ fecha: D(-1), quien: 'Laura Fuerza', accion: 'codigo_rotar', ficha: null, sobre: null, datos: { antes: 'FUERZA11', nuevo: 'FUERZA22' } },
  { fecha: D(-2), quien: 'Rocío Recepción', accion: 'ingreso_manual', ficha: 'Juan Pérez', sobre: null, datos: { result: 'ok' } }];

// Los manejadores de la base simulada (los usan esta prueba y las capturas).
export function handlers(rpcs){
  const log = (n, r) => (q, J, i) => (rpcs.push(n + ' ' + i.body), J(typeof r === 'function' ? r(JSON.parse(i.body || '{}')) : r));
  return {
    '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_reports_pending': (r, J) => J(0), '/admin_requests_pending': (r, J) => J(0),
    '/admin_gyms': (r, J) => J(GYMS), '/admin_gym_detail': (r, J, i) => J(DETALLE(JSON.parse(i.body).gym)), '/admin_coaches': (r, J) => J(COACHES),
    '/admin_user_detail': (r, J, i) => J({ id: JSON.parse(i.body).uid, email: 'karina@prueba.test', full_name: 'Karina Coach', role: 'coach', clients: ALUMNOS_K, sessions: 0, food_days: 0 }),
    '/admin_overview': (r, J) => J({ users: 900, coaches: 40, clients: 800, linked: 500, paid: 12, mrr: 900000, trial: 5, courtesy: 2, overdue: 1, gyms: 2, gym_socios: 243, gym_profes: 15, versions: [], signups: [], training: [] }),
    '/admin_set_config': log('admin_set_config', null), '/admin_gym_profes_extra': log('admin_gym_profes_extra', b => ({ profes_extra: b.n, profes_tope: 15 + b.n, profes_usados: 6 })),
    '/admin_gym_transferir': log('admin_gym_transferir', { ok: true, reabre: false, pasan: 12, sin_profe: 0, bajas_sin_hoja: 3, mp_no_pasa: true, apple_no_pasa: false, sin_plan_anterior: false }),
    '/admin_gym_cerrar': log('admin_gym_cerrar', { ok: true, sin_coach: 140 }), '/admin_gym_auditoria': log('admin_gym_auditoria', AUDITORIA),
    '/admin_gym_convertir': log('admin_gym_convertir', b => ({ gym_id: id(94), code: 'KARINA23', nombre: b.nombre, fichas: b.alumnos.length, propios: 3 - b.alumnos.length })),
    '/admin_audit_list': (r, J) => J([{ created_at: D(0), admin_name: 'Admin', action: 'gym_convertir', target: IDS.K, target_name: 'Karina Coach', detail: { fichas: 2 } },
      { created_at: D(0), admin_name: 'Admin', action: 'config', target: 'gimnasios', target_name: null, detail: { alta: true } }]),
  };
}

export default async function ({ base, t }){
  const rpcs = [];
  const { p, errs, preguntas, close } = await newPage({ user: ADMIN, viewport: { width: 1440, height: 900 }, handlers: handlers(rpcs) });
  // Abre la ficha de un gimnasio (si hay otra abierta, primero la cierra).
  const abrir = async gid => { if (await p.$('.drawer')) { await p.click('.drawer [data-a="closeDrawer"]'); await wait(200); } await p.click(`tr[data-gym="${gid}"]`); await wait(700); };
  await p.goto(base + '/admin/#gimnasios'); await wait(1500);
  t.has(await text(p, '.tabs button.on'), 'Gimnasios', 'la pestaña Gimnasios queda marcada');
  t.has(await text(p, '.nav.on'), 'Usuarios', 'el menú marca Usuarios');
  t.eq(await p.$$eval('.tabs button', bs => bs.map(b => b.textContent)), ['Todos los usuarios', 'Coaches y pagos', 'Gimnasios'], 'al lado de «Coaches y pagos»');
  const lista = await text(p, '#gList');
  for (const s of ['Gimnasio Fuerza', 'Laura Fuerza', 'Gimnasio (250)', '182 / 250', '6 / 15', 'Al día', 'Mercado Pago (activa)', 'Gimnasio Norte', 'En gracia', 'Sobre el cupo', 'Plan menor a 100',
    'Sin uso a los 30 días', 'Diferencia en el cupo', 'Gimnasio Sur', 'Sin dueño', 'Cerrado por la baja del dueño · se borra en 87 días'])
    t.has(lista, s, 'la lista muestra «' + s + '»');
  await captura(p, 'admin-gimnasios-lista-compu');
  t.has(await text(p, '#gListB .pnl-s'), '2 gimnasios · 1 con marcas · 1 cerrado', 'el resumen de la lista');
  t.eq(await p.getAttribute('[data-a="gAlta"]', 'aria-checked'), 'false', '«Crear gimnasios» arranca apagado');
  t.has(await text(p, '#gAlta'), 'Convertir una cuenta desde acá anda igual', 'y dice que la conversión no depende del interruptor');

  // El interruptor: pregunta y guarda app_config «gimnasios».
  p.contestar = false;
  await p.click('[data-a="gAlta"]'); await wait(400);
  t.ok(!rpcs.some(r => r.startsWith('admin_set_config')), 'si cancela, no cambia nada');
  p.contestar = true;
  await p.click('[data-a="gAlta"]'); await wait(500);
  t.ok(rpcs.includes('admin_set_config {"p_key":"gimnasios","p_value":{"alta":true}}'), 'prende «Crear gimnasios»: ' + rpcs.join(' | '));
  t.eq(await p.getAttribute('[data-a="gAlta"]', 'aria-checked'), 'true', 'el interruptor queda prendido');
  await captura(p, 'admin-gimnasios-alta-prendido-compu');
  t.has(preguntas.map(q => q.texto).join('\n'), 'gize.ar/gimnasio', 'la pregunta dice dónde se crea');

  // El detalle: equipo y contadores, sin datos de socios.
  await p.click(`tr[data-gym="${IDS.GA}"]`); await wait(700);
  const dr = await text(p, '.drawer');
  for (const s of ['Gimnasio Fuerza', 'código FUERZA22', '182 de 250', '6 de 15', 'Activos', '170', 'Falta confirmación', 'Comparten registros', 'Marcos Encargado', 'Administración',
    'Martina Profe', '80 socios', 'Rocío Recepción', 'Recepción', 'Pagos del dueño', 'Exportar la auditoría', 'Cerrar el gimnasio'])
    t.has(dr, s, 'el detalle muestra «' + s + '»');
  t.ok(!/Juan Pérez|DNI/.test(dr), 'el detalle no muestra datos de socios');
  await captura(p, 'admin-gimnasios-detalle-compu');
  t.eq(await p.$$eval('.drawer details', ds => ds.map(d => d.open)), [false, false], 'tope de profes y transferir arrancan plegados');

  // Tope de profes.
  await p.click('#drGymProfes > summary'); await p.fill('#gExtra', '3'); await p.click('[data-a="gExtra"]'); await wait(700);
  t.ok(rpcs.includes(`admin_gym_profes_extra {"gym":"${IDS.GA}","n":3}`), 'sube el tope de profes');

  // Exportar la auditoría (CSV). Después de cada acción, la ficha se vuelve a abrir con los datos nuevos.
  t.ok(!!(await p.$(`.drawer [data-gym-detalle="${IDS.GA}"]`)), 'después de guardar, la ficha del gimnasio sigue abierta');
  const [baja] = await Promise.all([p.waitForEvent('download'), p.click('.drawer [data-a="gAud"]')]);
  const csv = await (await import('node:fs')).promises.readFile(await baja.path(), 'utf8');
  t.ok(/^auditoria-gimnasio-fuerza-\d{4}-\d{2}-\d{2}\.csv$/.test(baja.suggestedFilename()), 'el CSV se llama auditoria-gimnasio-fuerza-<fecha>.csv: ' + baja.suggestedFilename());
  t.has(csv, 'Fecha,Quién,Acción,Ficha,Sobre,Datos', 'con sus columnas');
  t.has(csv, 'codigo_rotar', 'y las filas');

  // Transferir: avisa que la suscripción de Mercado Pago no pasa.
  await p.click('#drGymTr > summary'); await wait(200);
  const opciones = await p.$$eval('#gTrA option', os => os.map(o => o.textContent));
  t.eq(opciones, ['Martina Profe · Profe del gimnasio', 'Lucas Profe · Profe del gimnasio', 'Karina Coach · karina@prueba.test', 'Carlos Online · carlos@prueba.test'],
    'el dueño nuevo: los profes del gimnasio con cuenta de coach y los coaches sin gimnasio');
  await p.selectOption('#gTrA', IDS.pA2);
  await p.evaluate(() => document.getElementById('drGymTr').scrollIntoView());
  await captura(p, 'admin-gimnasios-transferir-compu');
  await p.click('[data-a="gTr"]'); await wait(700);
  const pTr = preguntas[preguntas.length - 1];
  t.has(pTr.texto, '¿Pasar «Gimnasio Fuerza» a Lucas Profe?', 'pregunta a quién');
  t.has(pTr.texto, 'la suscripción de Mercado Pago de Laura Fuerza no pasa', 'y avisa que la suscripción de Mercado Pago no pasa');
  t.ok(rpcs.includes(`admin_gym_transferir {"gym":"${IDS.GA}","nuevo_dueno":"${IDS.pA2}"}`), 'transfiere');

  // Cerrar: con otro nombre no cierra; con el nombre exacto, sí.
  await abrir(IDS.GA);
  p.dialogAnswer = 'Gimnasio Fuerte';
  await p.click('.drawer [data-a="gCerrar"]'); await wait(500);
  t.ok(!rpcs.some(r => r.startsWith('admin_gym_cerrar')), 'con otro nombre no cierra');
  p.dialogAnswer = 'Gimnasio Fuerza';
  await p.click('.drawer [data-a="gCerrar"]'); await wait(700);
  t.ok(rpcs.includes(`admin_gym_cerrar {"gym":"${IDS.GA}"}`), 'con el nombre exacto, cierra');

  // El cerrado por la baja del dueño: sin cerrar, con transferir y los días para borrarlo.
  await abrir(IDS.GS);
  t.has(await text(p, '.drawer'), 'se borra en 87 días', 'el cerrado dice cuándo se borra');
  await captura(p, 'admin-gimnasios-cerrado-por-baja-compu');
  t.ok(!(await p.$('.drawer [data-a="gCerrar"]')) && !!(await p.$('#drGymTr')), 'sin «Cerrar» y con «Transferir» (para que alguien se haga cargo)');
  await p.click('.drawer [data-a="closeDrawer"]');

  // Convertir una cuenta eligiendo los alumnos.
  await p.click('#gListB [data-a="gConv"]'); await wait(800);
  t.eq(await p.inputValue('#gcCoach'), IDS.K, 'arranca por la cuenta sin gimnasio con el plan más grande');
  t.eq(await p.inputValue('#gcNombre'), 'Gimnasio de Karina Coach', 'con un nombre propuesto');
  t.eq(await p.$$eval('#gcAl [data-gc]', is => is.map(i => i.checked)), [true, true, true], 'todos sus alumnos marcados');
  await p.uncheck(`#gcAl [data-gc="${IDS.K3}"]`);
  t.eq(await p.$eval('#gcTodos', i => [i.checked, i.indeterminate]), [false, true], '«Todos» queda a medias');
  await p.fill('#gcNombre', 'Gimnasio Karina');
  await captura(p, 'admin-gimnasios-convertir-compu');
  await p.click('[data-a="gConvOk"]'); await wait(800);
  t.has(preguntas[preguntas.length - 1].texto, '2 alumnos pasan al gimnasio y 1 sigue como alumno propio. El plan no cambia.', 'pregunta cuántos pasan y cuántos siguen como alumnos propios');
  t.ok(rpcs.includes(`admin_gym_convertir {"coach":"${IDS.K}","alumnos":["${IDS.K1}","${IDS.K2}"],"nombre":"Gimnasio Karina"}`), 'convierte con los elegidos: ' + rpcs.filter(r => r.startsWith('admin_gym_convertir')).join(''));
  t.ok(!(await p.$('.drawer')), 'y cierra la ficha');

  // Coaches y pagos: la columna Gimnasio, «sin cargo», y convertir desde la ficha del coach.
  await p.click('.tabs [data-go="coaches"]'); await wait(800);
  const cl = await text(p, '#cList');
  t.has(cl, 'Dueño de Gimnasio Fuerza', 'columna Gimnasio: dueño');
  t.has(cl, 'Profe de Gimnasio Fuerza, sin cargo', 'el profe sin alumnos propios, sin cargo');
  t.has(cl, 'Sin cargo (gimnasio)', 'su estado no es «Sin pagar»');
  t.ok(!/Sin pagar/.test(await text(p, '#cListB .pnl-s')), 'y no cuenta como «sin pagar» en el resumen');
  t.ok(!(await text(p, '#cSoon')).includes('Lucas Profe'), 'ni en «Vencen pronto»');
  await captura(p, 'admin-coaches-columna-gimnasio-compu');
  await p.click(`tr[data-coach="${IDS.dA}"]`); await wait(400);
  t.has(await text(p, '.drawer'), 'Dueño de Gimnasio Fuerza', 'la ficha del dueño dice su gimnasio');
  t.ok(!!(await p.$('.drawer [data-a="toGym"]')), 'y lleva al gimnasio');
  await captura(p, 'admin-coach-duena-compu');
  await p.click('.drawer [data-a="closeDrawer"]');
  await p.click(`tr[data-coach="${IDS.C}"]`); await wait(400);
  await p.click('.drawer [data-a="gConv"]'); await wait(800);
  t.eq(await p.inputValue('#gcCoach'), IDS.C, 'desde la ficha de un coach, convierte esa cuenta');
  await wait(400); await captura(p, 'admin-convertir-desde-coach-compu');
  await p.click('.drawer [data-a="closeDrawer"]');

  // Registro de acciones.
  await p.click('[data-go="seguridad"]'); await wait(1000);
  const aud = await text(p, '#aud');
  t.has(aud, 'Convirtió una cuenta en gimnasio', 'el registro nombra la conversión');
  t.has(aud, 'Cambió «Crear gimnasios» a prendido', 'y el interruptor');
  // Estadísticas: gimnasios, socios y profes.
  await p.click('[data-go="estadisticas"]'); await wait(1000);
  t.has(await text(p, '#hNumB'), 'Gimnasios', 'Estadísticas suma los gimnasios');
  t.has(await text(p, '#hNumB'), '243 socios · 15 profes', 'con sus socios y profes');
  await captura(p, 'admin-estadisticas-gimnasios-compu');
  t.eq(errs, [], 'errores de la página');
  await close();

  // Celular: la tabla scrollea adentro, la página no se va de costado; contraste AA.
  const cel = await newPage({ user: ADMIN, viewport: { width: 390, height: 844 }, touch: true, handlers: handlers([]) });
  await cel.p.goto(base + '/admin/#gimnasios'); await wait(1500);
  t.eq(await cel.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'en el celular la página no se va de costado');
  t.ok(await cel.p.$eval('#gList', e => e.scrollWidth > e.clientWidth), 'la tabla scrollea adentro de su tarjeta');
  await captura(cel.p, 'admin-gimnasios-lista-cel');
  const k = await contraste(cel.p, '#main');
  t.eq(k.malos, [], 'contraste AA en la pestaña (mínimo ' + k.min + ')');
  await cel.p.click(`tr[data-gym="${IDS.GA}"]`); await wait(700);
  await captura(cel.p, 'admin-gimnasios-detalle-cel');
  const k2 = await contraste(cel.p, '.drawer');
  t.eq(k2.malos, [], 'contraste AA en el detalle (mínimo ' + k2.min + ')');
  await cel.p.click('.drawer [data-a="closeDrawer"]'); await cel.p.click('#gListB [data-a="gConv"]'); await wait(900);
  await captura(cel.p, 'admin-gimnasios-convertir-cel');
  t.eq(await cel.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'convertir en el celular: sin irse de costado');
  t.eq(cel.errs, [], 'errores de la página (celular)');
  await cel.close();
}
