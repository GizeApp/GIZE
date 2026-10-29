// «Usar IA en tus rutinas»: el permiso del coach para «Pasar mis planillas» y «Armar con IA»
// (app/ui/ia-permiso-rutinas.js), su estado (app/core/ia-coach.js, que pregunta ia_coach_estado) y
// su fila en Configuración → Privacidad. Todavía ninguna pantalla llama a la IA del coach: la hoja
// se abre desde Privacidad o llamando a pedirPermisoRutinas(), como lo van a hacer las pantallas.
//   · Con la IA del coach apagada no aparece nada nuevo (y nunca se llama a la función «ia»).
//   · Prendida: la fila aparece apagada; prenderla muestra el aviso; «Ahora no» y Escape no guardan
//     nada; «Aceptar y usar IA» guarda ia_permiso_rutinas con la versión del aviso de la base (una
//     sola vez aunque se toque dos veces); apagarla guarda que no quiere. Nunca toca el de Comida.
//   · Con el permiso aceptado no se vuelve a preguntar; si lo había apagado, no se le pregunta
//     solo: un cartel lo lleva a Configuración → Privacidad.
//   · Si no se pudo guardar, lo dice en la hoja y no la cierra.
//   · El «Atrás» de Android cierra la hoja como «Ahora no».
//   · En las apps de Android y iPhone, ni la hoja, ni la fila, ni los mensajes de la IA del coach
//     nombran la prueba, el plan, pagos ni precios.
//   · El estado se guarda 5 minutos (no se pregunta en cada redibujo).
import { newPage, wait, text, configCoach, CONFIG_COACH } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@ejemplo.test', aud: 'authenticated', role: 'authenticated' };
const APAGADA = { activa: false, funciones: { planilla: false, rutina: false }, rol: 'coach', motivo: null, permiso_rutinas: null, aviso_version: 1 };
// aviso_version 3: la app tiene que mandar la de la base, no una fija.
const PRENDIDA = { activa: true, funciones: { planilla: false, rutina: true }, rol: 'coach', por_gimnasio: false, permiso_rutinas: null, aviso_version: 3,
  estado: 'normal', vuelve: null, manana: '2026-10-30T03:00:00+00:00', quedan: { planilla: 0, rutina: 15 }, tope: { planilla: 30, rutina: 15, total: 60 } };
// Lo que no se puede ver en las apps (como en coach-iphone.test.mjs).
const PROHIBIDO = /prueba|gratis|\bplan\b|pago|precio|tarjeta|mercado|suscrip|contrat|\$|gize\.ar(?!\/privacidad)/i;
const IOS = () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; };
// Android con el plugin App: el «Atrás» se dispara a mano (window.__ls.backButton).
const ANDROID = () => {
  window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } };
};

// El panel del coach (plan de cortesía) con ia_coach_estado e ia_permiso_rutinas simulados.
// S.fallar: el mensaje con el que falla el próximo ia_permiso_rutinas.
async function pagina(base, estado, init){
  const S = { estado: Object.assign({}, estado), permisos: [], nEstado: 0, fallar: null };
  const pg = await newPage({ user: COACH, init, tocarAvisos: true, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([]);
      const me = { id: COACH.id, role: 'coach', full_name: 'Coach Ejemplo' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/rpc/ia_coach_estado': (r, J) => { S.nEstado++; return J(S.estado); },
    '/rpc/ia_permiso_rutinas': (r, J, i) => {
      const b = JSON.parse(i.body || '{}'); S.permisos.push(b);
      if (S.fallar) { const m = S.fallar; S.fallar = null; return J({ code: '22023', message: m, details: null, hint: null }, 400); }
      S.estado = Object.assign({}, S.estado, { permiso_rutinas: b.p_acepta ? 'ok' : 'no' });
      return J(S.estado);
    },
  } });
  await pg.p.goto(base + '/app/'); await wait(3000);
  return Object.assign(pg, { S });
}
const hoja = p => p.evaluate(() => { const h = document.querySelector('#iaRutHost .ia-perm:not(.closing)'); return h && h.getClientRects().length ? h.innerText.replace(/\s+/g, ' ').trim() : ''; });
const interruptor = p => p.evaluate(() => { const b = document.querySelector('#coachHost .cs-body [data-iar-toggle]'); return b ? b.getAttribute('aria-checked') : null; });
const toast = p => p.evaluate(() => { const t = document.getElementById('iaToast'); return t && t.classList.contains('show') ? t.textContent : ''; });
// Pide el permiso como lo van a hacer las pantallas: el resultado queda en window.__perm.
const pedir = p => p.evaluate(async () => {
  const c = await import('/app/core/ia-coach.js'); await c.iaCoachEstado(true);
  const m = await import('/app/ui/ia-permiso-rutinas.js');
  window.__perm = 'esperando'; m.pedirPermisoRutinas().then(v => { window.__perm = v; });
});
const resultado = p => p.evaluate(() => window.__perm);
const sinIA = calls => !calls.some(c => /\/functions\/v1\/ia\b|\/rpc\/ia_permiso$/.test(c));

export default async function ({ base, t }){
  // 1) Apagada: Privacidad sin la fila, sin hoja y sin llamar a nada de la IA.
  let pg = await pagina(base, APAGADA);
  t.ok(!(await pg.p.$('#iaRutHost .sheet')), 'apagada: el panel abre sin la hoja del permiso');
  await configCoach(pg.p, 'privacidad'); await wait(500);
  t.ok(pg.calls.includes('POST /rest/v1/rpc/ia_coach_estado'), 'al abrir Privacidad se pregunta ia_coach_estado');
  t.ok(!(await text(pg.p, CONFIG_COACH)).includes('Usar IA en tus rutinas'), 'apagada: Privacidad sin «Usar IA en tus rutinas»');
  t.has(await text(pg.p, CONFIG_COACH), 'Personas bloqueadas', 'Privacidad sigue con lo de siempre');
  t.eq(pg.S.permisos, [], 'apagada: no se guardó ningún permiso');
  t.ok(sinIA(pg.calls), 'apagada: no se llamó a la IA ni al permiso de Comida');
  t.eq(pg.errs, [], 'errores de la página (apagada)');
  await pg.close();

  // 2) Prendida, desde Configuración → Privacidad.
  pg = await pagina(base, PRENDIDA);
  let { p } = pg;
  await configCoach(p, 'privacidad'); await wait(600);
  const fila = await text(p, CONFIG_COACH);
  t.has(fila, 'Funciones con IA', 'prendida: la tarjeta «Funciones con IA»');
  t.has(fila, 'Usar IA en tus rutinas', 'prendida: la fila «Usar IA en tus rutinas»');
  t.has(fila, 'envía a Anthropic (EE. UU.) el pedido que escribís y los ejercicios de tus planillas', 'la fila dice qué se manda');
  t.eq(await interruptor(p), 'false', 'sin aceptar: el interruptor está apagado');
  t.ok(await p.evaluate(() => [...document.querySelectorAll('#coachHost .cs-body a')].some(a => a.getAttribute('href') === 'https://gize.ar/privacidad/?app=1#ia-coach')), 'la fila lleva a la política (#ia-coach)');
  // Escape = «Ahora no».
  await p.click('#coachHost .cs-body [data-iar-toggle]'); await wait(500);
  let h = await hoja(p);
  t.has(h, 'Usar IA en tus rutinas', 'prender: se muestra el aviso');
  for (const frase of ['Anthropic, la empresa que hace la IA Claude, en Estados Unidos', 'Con «Armar con IA» va el pedido que escribís', 'De tus planillas van solo los ejercicios', '«[alumno]»',
    'no lo usa para entrenar su IA', 'GIZE no guarda tus planillas ni tus pedidos', 'Configuración → Privacidad', 'Aceptar y usar IA', 'Ahora no'])
    t.has(h, frase, 'el aviso dice: ' + frase);
  t.eq(await p.evaluate(() => document.activeElement && document.activeElement.dataset.iar), 'si', 'el foco arranca en «Aceptar y usar IA»');
  t.ok(await p.evaluate(() => { const r = document.querySelector('#iaRutHost [data-iar="si"]').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!(e && e.closest('#iaRutHost')); }), 'la hoja queda encima del panel');
  await p.keyboard.press('Escape'); await wait(500);
  t.eq(await hoja(p), '', 'Escape cierra el aviso');
  t.eq(pg.S.permisos, [], 'Escape: no se guardó nada');
  t.eq(await interruptor(p), 'false', 'Escape: sigue apagado');
  t.eq(await toast(p), '', 'desde Configuración, «Ahora no» no muestra el aviso de abajo');
  // «Ahora no».
  await p.click('#coachHost .cs-body [data-iar-toggle]'); await wait(500);
  await p.click('#iaRutHost button[data-iar="no"]'); await wait(500);
  t.eq(await hoja(p), '', '«Ahora no» cierra el aviso');
  t.eq(pg.S.permisos, [], '«Ahora no»: no se guardó nada');
  // Aceptar (dos toques seguidos: un solo pedido).
  await p.click('#coachHost .cs-body [data-iar-toggle]'); await wait(500);
  await p.evaluate(() => { const b = document.querySelector('#iaRutHost [data-iar="si"]'); b.click(); b.click(); });
  await wait(900);
  t.eq(pg.S.permisos, [{ p_acepta: true, p_version: 3 }], 'aceptar guarda ia_permiso_rutinas una sola vez, con la versión del aviso de la base');
  t.eq(await hoja(p), '', 'aceptar cierra el aviso');
  t.eq(await interruptor(p), 'true', 'aceptado: el interruptor queda prendido');
  t.has(await toast(p), 'quedó prendida', 'avisa que quedó prendida');
  // Apagar.
  await p.click('#coachHost .cs-body [data-iar-toggle]'); await wait(800);
  t.eq(pg.S.permisos[1], { p_acepta: false }, 'apagar guarda que no quiere');
  t.eq(await interruptor(p), 'false', 'apagado: el interruptor queda apagado');
  t.has(await toast(p), 'No se manda nada', 'avisa que no se manda nada');
  t.eq(await hoja(p), '', 'apagar no muestra el aviso');
  // El estado se guarda 5 minutos: volver a Privacidad no vuelve a preguntar.
  const n = pg.S.nEstado;
  await configCoach(p, 'perfil'); await configCoach(p, 'privacidad'); await wait(400);
  t.eq(pg.S.nEstado, n, 'volver a Privacidad no vuelve a preguntar el estado');
  t.ok(sinIA(pg.calls), 'prendida: no se llamó a la IA ni al permiso de Comida');
  t.eq(pg.errs, [], 'errores de la página (Configuración)');
  await pg.close();

  // 3) Como lo van a usar las pantallas: pedirPermisoRutinas().
  pg = await pagina(base, PRENDIDA); p = pg.p;
  await pedir(p); await wait(500);
  t.has(await hoja(p), 'Usar IA en tus rutinas', 'sin aceptar: pedirPermisoRutinas muestra el aviso');
  await p.click('#iaRutHost button[data-iar="no"]'); await wait(500);
  t.eq(await resultado(p), false, '«Ahora no» devuelve false');
  t.has(await toast(p), 'Configuración → Privacidad', '«Ahora no» dice dónde prenderla después');
  t.eq(pg.S.permisos, [], '«Ahora no»: no se guardó nada');
  // No se pudo guardar: lo dice y la hoja sigue abierta.
  await pedir(p); await wait(500);
  pg.S.fallar = 'El aviso cambió: volvé a leerlo.';
  await p.click('#iaRutHost [data-iar="si"]'); await wait(800);
  t.has(await text(p, '#iaRutHost .ia-perm-err'), 'El aviso cambió: volvé a leerlo.', 'si el aviso cambió, lo dice');
  t.eq(await resultado(p), 'esperando', 'y la hoja sigue abierta');
  pg.S.fallar = 'algo raro de la base';
  await p.click('#iaRutHost [data-iar="si"]'); await wait(800);
  t.has(await text(p, '#iaRutHost .ia-perm-err'), 'No se pudo guardar. Revisá la conexión y probá de nuevo.', 'otro error: el mensaje de siempre, sin el de la base');
  t.eq(await p.evaluate(() => document.querySelector('#iaRutHost [data-iar="si"]').textContent), 'Aceptar y usar IA', 'el botón vuelve a estar listo');
  await p.click('#iaRutHost [data-iar="si"]'); await wait(800);
  t.eq(await resultado(p), true, 'aceptar devuelve true');
  t.eq(pg.S.permisos.length, 3, 'se intentó guardar tres veces (dos fallaron)');
  // Ya aceptado: no se vuelve a preguntar.
  await pedir(p); await wait(500);
  t.eq(await resultado(p), true, 'aceptado: devuelve true sin preguntar');
  t.eq(await hoja(p), '', 'aceptado: no se muestra el aviso');
  t.eq(pg.S.permisos.length, 3, 'aceptado: no se vuelve a guardar');
  // Un aviso nuevo (permiso «viejo»): se vuelve a preguntar.
  pg.S.estado = Object.assign({}, pg.S.estado, { permiso_rutinas: 'viejo', aviso_version: 4 });
  await pedir(p); await wait(500);
  t.has(await hoja(p), 'Usar IA en tus rutinas', 'con un aviso nuevo se vuelve a preguntar');
  await p.click('#iaRutHost [data-iar="si"]'); await wait(800);
  t.eq(pg.S.permisos[3], { p_acepta: true, p_version: 4 }, 'y se guarda con la versión nueva');
  t.ok(sinIA(pg.calls), 'no se llamó a la IA ni al permiso de Comida');
  t.eq(pg.errs, [], 'errores de la página (pedirPermisoRutinas)');
  await pg.close();

  // 4) Lo había apagado: no se le pregunta solo; el cartel lo lleva a Configuración → Privacidad.
  pg = await pagina(base, Object.assign({}, PRENDIDA, { permiso_rutinas: 'no' })); p = pg.p;
  p.contestar = false;
  await pedir(p); await wait(700);
  t.eq(await hoja(p), '', 'apagado: no se muestra el aviso');
  const q = pg.preguntas[0] || {};
  t.has(q.texto || '', 'Apagaste «Usar IA en tus rutinas»', 'un cartel dice que lo apagó');
  t.eq(q.ok, 'Ir a Configuración', 'con «Ir a Configuración»');
  t.eq(await resultado(p), false, 'devuelve false');
  t.ok(!(await p.$('#coachHost .cs-layout')), '«Cancelar»: se queda donde estaba');
  p.contestar = true;
  await pedir(p); await wait(900);
  t.eq(await resultado(p), false, 'tampoco con «Ir a Configuración»');
  t.ok(await p.isVisible('#coachHost .cs-nav [data-k="privacidad"].on'), '«Ir a Configuración» abre Configuración → Privacidad');
  t.has(await text(p, CONFIG_COACH), 'Usar IA en tus rutinas', 'donde está el interruptor para prenderla');
  t.eq(pg.S.permisos, [], 'no se guardó nada');
  t.eq(pg.errs, [], 'errores de la página (apagado)');
  await pg.close();

  // 5) Android: el «Atrás» cierra el aviso como «Ahora no»; ni el aviso, ni la fila, ni los mensajes
  // hablan de la prueba, el plan, pagos ni precios.
  pg = await pagina(base, PRENDIDA, ANDROID); p = pg.p;
  await pedir(p); await wait(500);
  const enAndroid = await hoja(p);
  t.ok(enAndroid.length > 200 && !PROHIBIDO.test(enAndroid), 'Android: el aviso no habla de planes ni precios: ' + (enAndroid.match(PROHIBIDO) || ''));
  await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(500);
  t.eq(await hoja(p), '', 'Android: «Atrás» cierra el aviso');
  t.eq(await resultado(p), false, 'Android: «Atrás» cuenta como «Ahora no»');
  t.eq(await p.evaluate(() => window.__min), 0, 'Android: «Atrás» no saca de la app');
  t.eq(pg.S.permisos, [], 'Android: no se guardó nada');
  await configCoach(p, 'privacidad'); await wait(500);
  const filaAndroid = await text(p, '#coachHost .cs-body .cs-row:has([data-iar-toggle])');
  t.ok(filaAndroid.includes('Usar IA en tus rutinas') && !PROHIBIDO.test(filaAndroid), 'Android: la fila no habla de planes ni precios: ' + filaAndroid);
  // Los mensajes de la IA del coach: neutros, iguales en la web y en las apps.
  const msgs = await p.evaluate(async () => {
    const { iaCoachMensaje } = await import('/app/core/ia-coach.js');
    const codigos = ['sin_sesion', 'sin_conexion', 'sin_permiso', 'sin_plan', 'no_habilitado', 'ahorro', 'pausada', 'ritmo', 'tope_dia', 'tope_persona', 'tope_mes', 'ocupada', 'hoja_grande', 'no_se_pudo', 'error', 'cualquiera'];
    const out = {};
    for (const f of ['planilla', 'rutina']) for (const c of codigos) out[f + ':' + c] = iaCoachMensaje({ codigo: c, tope: 15, vuelve: '2026-11-10T12:00:00Z', motivo: 'apagada' }, f);
    out.viejo = iaCoachMensaje({ codigo: 'sin_permiso', motivo: 'aviso_nuevo' }, 'rutina');
    out.nunca = iaCoachMensaje({ codigo: 'sin_permiso', motivo: 'sin_preguntar' }, 'rutina');
    out.nada = iaCoachMensaje(null);
    return out;
  });
  for (const [k, m] of Object.entries(msgs)) t.ok(m && !PROHIBIDO.test(m), 'mensaje neutro (' + k + '): ' + m);
  t.eq(msgs['rutina:sin_plan'], 'Por ahora no podés usar esta función: armá la rutina a mano.', 'sin plan: un texto neutro');
  t.eq([msgs['rutina:no_habilitado'], msgs['rutina:ahorro'], msgs['planilla:sin_plan']], Array(3).fill(msgs['rutina:sin_plan']), 'sin plan, sin permiso del panel y el ahorro dicen lo mismo (sin decir por qué)');
  t.eq(msgs['rutina:tope_dia'], 'Llegaste al límite de hoy para armar rutinas con IA (15). Mañana seguís.', 'el tope del día de las rutinas');
  t.eq(msgs['planilla:tope_dia'], 'Llegaste al límite de hoy para pasar planillas con IA (15). Mañana seguís.', 'el tope del día de las planillas');
  t.has(msgs['rutina:tope_persona'], 'Vuelve el 10 de noviembre.', 'el tope del mes dice cuándo vuelve');
  t.has(msgs['rutina:sin_permiso'], 'Configuración → Privacidad', 'permiso apagado: dónde prenderlo');
  t.has(msgs.viejo, 'El aviso de la IA cambió', 'aviso nuevo: volver a leerlo');
  t.eq(msgs.nada, msgs['rutina:error'], 'sin código: el mensaje de error de siempre');
  t.eq(pg.errs, [], 'errores de la página (Android)');
  await pg.close();

  // 6) iPhone: el aviso tampoco habla de planes ni precios.
  pg = await pagina(base, PRENDIDA, IOS); p = pg.p;
  await pedir(p); await wait(500);
  const enIphone = await hoja(p);
  t.ok(enIphone.length > 200 && !PROHIBIDO.test(enIphone), 'iPhone: el aviso no habla de planes ni precios: ' + (enIphone.match(PROHIBIDO) || ''));
  t.eq(pg.errs, [], 'errores de la página (iPhone)');
  await pg.close();

  // 7) El estado: se guarda 5 minutos, forzar vuelve a preguntar, y si falla no se insiste en cada redibujo.
  pg = await pagina(base, PRENDIDA); p = pg.p;
  const cuenta = await p.evaluate(async () => {
    const c = await import('/app/core/ia-coach.js');
    const n = [];
    await c.iaCoachEstado(); await c.iaCoachEstado();
    n.push(c.iaCoachVisible('rutina'), c.iaCoachVisible('planilla'), c.iaCoachAlguna(), c.iaRutinasPermiso());
    await c.iaCoachEstado(true);
    return n;
  });
  t.eq(cuenta, [true, false, true, null], 'prendida: rutina sí, planilla no, la fila sí y sin permiso');
  t.eq(pg.S.nEstado, 2, 'dos pedidos seguidos preguntan una vez; forzar pregunta otra');
  await pg.close();
  pg = await newPage({ user: COACH, handlers: { '/rpc/ia_coach_estado': (r, J) => J({ message: 'no existe' }, 404) } }); p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  const fallo = await p.evaluate(async () => {
    const c = await import('/app/core/ia-coach.js');
    const a = await c.iaCoachEstado(), b = await c.iaCoachEstado();
    return [a, b, c.iaCoachVisible('rutina'), c.iaCoachAlguna()];
  });
  t.eq(fallo, [null, null, false, false], 'sin ia_coach_estado en la base: no se muestra nada');
  t.eq(pg.calls.filter(c => c.endsWith('/rpc/ia_coach_estado')).length, 1, 'si falló, no se vuelve a preguntar enseguida');
  await pg.close();
}
