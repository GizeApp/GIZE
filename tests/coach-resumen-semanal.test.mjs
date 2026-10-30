// «Resumen de los lunes» del coach (Configuración → Avisos, app/screens/coach/settings.js, con
// supabase/resumen-semanal.sql): la tarjeta para apagarlo o volver a prenderlo.
// - Aparece según resumen_semanal_estado: true, «Te llega los lunes» con «Apagar»; false, «Resumen
//   apagado» con «Prender». Se pregunta al abrir Avisos (no al entrar) y una sola vez.
// - «Apagar» llama a resumen_semanal_cambiar { p_on: false } y queda «Prender»; «Prender», { p_on: true }.
//   Si no se puede guardar, un solo aviso y el botón queda como estaba.
// - Sin la tarjeta y sin errores: la base sin la función (PGRST202: no se vuelve a preguntar) o que
//   contesta null (el resumen apagado en el panel de GIZE; es también lo que contestan por defecto las
//   demás pruebas). Sin señal, no aparece y se vuelve a probar más tarde.
// - En el celular sin correrse de costado, en Android e iPhone sin plan, precios ni gize.ar, y en el
//   panel del gimnasio.
import { newPage, wait, configCoach, CONFIG_COACH } from './lib.mjs';
import { entrar, miGimnasio, DUENA, rpcs, IOS, ANDROID } from './gym-comun.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated', created_at: new Date(Date.now() - 60 * 864e5).toISOString() };
// Lo que no se puede ver en las apps (tests/coach-iphone.test.mjs).
const PROHIBIDO = /prueba|gratis|\bplan\b|pago|precio|tarjeta|mercado|suscrip|contrat|\$|gize\.ar/i;
const TOGGLE = CONFIG_COACH + ' [data-coach="resumen-toggle"]';

// Coach con su lista y la base simulada del resumen. o.estado: lo que contesta resumen_semanal_estado
// (true, false, null; 'sin': la base no tiene la función; 'falla': sin señal).
async function coach(base, o = {}){
  const st = { estado: o.estado, cambiar: [], pide: 0, falla: false };
  const pg = await newPage({ user: COACH, init: o.init, viewport: o.vp || { width: 390, height: 844 }, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([{ id: 'c1', full_name: 'Alumno Uno', role: 'client' }]);
      const me = { id: COACH.id, role: 'coach', full_name: 'Martín Pérez' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/rpc/my_invite_code': (r, J) => J('K7XM2PQA'),
    '/rpc/resumen_semanal_estado': (r, J) => {
      st.pide++;
      if (st.estado === 'sin') return J({ code: 'PGRST202', message: 'Could not find the function public.resumen_semanal_estado', details: null, hint: null }, 404);
      if (st.estado === 'falla') return r.abort('internetdisconnected');
      return J(st.estado === undefined ? null : st.estado);
    },
    '/rpc/resumen_semanal_cambiar': (r, J, i) => {
      const b = JSON.parse(i.body || '{}'); st.cambiar.push(b);
      if (st.falla) return J({ code: 'XX000', message: 'falló el servidor', details: null, hint: null }, 500);
      st.estado = b.p_on; return J(b.p_on);
    },
  } });
  await pg.p.goto(base + '/app/'); await wait(3000);
  const onb = await pg.p.$('[data-onb="done"]'); if (onb) { await onb.click(); await wait(400); }
  return Object.assign(pg, { st });
}
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText).join(' ').replace(/\s+/g, ' ').trim(), sel);
const tarjeta = p => p.evaluate(sel => { const h = [...document.querySelectorAll(sel + ' .cs-h')].find(x => x.textContent === 'Resumen de los lunes'); return h ? h.closest('section').innerText.replace(/\s+/g, ' ').trim() : ''; }, CONFIG_COACH);
const boton = p => p.$eval(TOGGLE, b => [b.textContent, b.getAttribute('aria-label'), b.classList.contains('on'), b.disabled]).catch(() => null);
// La página no se corre de costado y la tarjeta entra entera en la pantalla (el menú de secciones sí se
// desliza a propósito: por eso no se usa sinScrollHorizontal).
const entra = p => p.evaluate(sel => { const h = [...document.querySelectorAll(sel + ' .cs-h')].find(x => x.textContent === 'Resumen de los lunes'), s = h && h.closest('section');
  return !!s && document.documentElement.scrollWidth <= window.innerWidth && [s, ...s.querySelectorAll('*')].every(e => { const r = e.getBoundingClientRect(); return !r.width || (r.left >= 0 && r.right <= window.innerWidth); }); }, CONFIG_COACH);
const DESC = 'Los lunes a la mañana te mandamos por mail cómo les fue a tus alumnos en la semana: quién entrenó, a quién conviene escribirle y sus récords.';

export default async function ({ base, t }){
  // ===== Le llega: lo apaga y lo vuelve a prender (celular, 390 px) =====
  {
    const pg = await coach(base, { estado: true }), p = pg.p, st = pg.st;
    t.eq(st.pide, 0, 'le llega: al entrar todavía no se pregunta');
    await configCoach(p, 'avisos'); await wait(400);
    t.eq(st.pide, 1, 'le llega: se pregunta al abrir Avisos');
    let c = await tarjeta(p);
    t.has(c, DESC, 'le llega: la tarjeta «Resumen de los lunes» con qué trae');
    t.has(c, 'Te llega los lunes', 'le llega: lo dice');
    t.has(c, 'Por mail y, si tenés los avisos activados, también como aviso.', 'le llega: por dónde');
    t.eq(await boton(p), ['Apagar', 'Apagar el resumen de los lunes', true, false], 'le llega: el botón «Apagar», con el nombre completo para el lector de pantalla');
    t.has(await txt(p, CONFIG_COACH), 'Avisos en este dispositivo', 'le llega: la tarjeta de los avisos sigue');
    t.ok(await entra(p), 'le llega: en el celular la tarjeta entra entera y la página no se corre de costado');
    await p.click(TOGGLE); await wait(500);
    t.eq(st.cambiar, [{ p_on: false }], 'apagar: llama a resumen_semanal_cambiar con p_on false');
    c = await tarjeta(p);
    t.has(c, 'Resumen apagado', 'apagar: queda apagado');
    t.has(c, 'No te llega ni el mail ni el aviso de los lunes.', 'apagar: qué quiere decir');
    t.eq(await boton(p), ['Prender', 'Prender el resumen de los lunes', false, false], 'apagar: el botón pasa a «Prender»');
    await p.click(TOGGLE); await wait(500);
    t.eq(st.cambiar, [{ p_on: false }, { p_on: true }], 'prender: llama con p_on true');
    t.has(await tarjeta(p), 'Te llega los lunes', 'prender: le vuelve a llegar');
    // Ir a otra sección y volver no vuelve a preguntar.
    await configCoach(p, 'perfil'); await configCoach(p, 'avisos'); await wait(400);
    t.eq(st.pide, 1, 'volver a Avisos: no se vuelve a preguntar');
    t.has(await tarjeta(p), 'Te llega los lunes', 'volver a Avisos: queda como lo dejó');
    // No se puede guardar: un solo aviso y el botón como estaba.
    st.falla = true;
    await p.click(TOGGLE); await wait(500);
    t.eq(pg.dialogs, ['No se pudo guardar. Revisá tu conexión y probá de nuevo.'], 'falla al guardar: un solo aviso, claro');
    t.eq(await boton(p), ['Apagar', 'Apagar el resumen de los lunes', true, false], 'falla al guardar: el botón queda como estaba y se puede volver a tocar');
    t.eq(pg.errs, [], 'le llega: sin errores');
    await pg.close();
  }
  // ===== Lo había apagado =====
  {
    const pg = await coach(base, { estado: false, vp: { width: 1440, height: 900 } }), p = pg.p;
    await configCoach(p, 'avisos'); await wait(400);
    t.has(await tarjeta(p), 'Resumen apagado', 'apagado: lo dice');
    t.eq(await boton(p), ['Prender', 'Prender el resumen de los lunes', false, false], 'apagado: con «Prender»');
    await p.click(TOGGLE); await wait(500);
    t.eq(pg.st.cambiar, [{ p_on: true }], 'apagado: «Prender» llama con p_on true');
    t.has(await tarjeta(p), 'Te llega los lunes', 'apagado: queda prendido');
    t.eq(pg.errs, [], 'apagado: sin errores');
    await pg.close();
  }

  // ===== Sin la tarjeta =====
  // La base contesta null (el resumen apagado en el panel de GIZE).
  {
    const pg = await coach(base, { estado: null }), p = pg.p;
    await configCoach(p, 'avisos'); await wait(400);
    t.eq(pg.st.pide, 1, 'apagado en el panel: se pregunta');
    t.eq(await tarjeta(p), '', 'apagado en el panel: sin la tarjeta');
    t.has(await txt(p, CONFIG_COACH), 'Avisos en este dispositivo', 'apagado en el panel: los avisos siguen');
    t.ok(!(await p.$(TOGGLE)), 'apagado en el panel: sin el botón');
    t.eq(pg.errs, [], 'apagado en el panel: sin errores');
    await pg.close();
  }
  // La base todavía no tiene la función: sin la tarjeta, sin errores y sin volver a preguntar.
  {
    const pg = await coach(base, { estado: 'sin' }), p = pg.p;
    await configCoach(p, 'avisos'); await wait(400);
    t.eq(await tarjeta(p), '', 'base sin la función: sin la tarjeta');
    await configCoach(p, 'perfil'); await configCoach(p, 'avisos'); await wait(400);
    const r = await p.evaluate(async () => {
      const { CoachState } = await import('/app/screens/coach/state.js');
      // Ni un minuto después se vuelve a preguntar: queda anotado que no está.
      const ahora = Date.now; Date.now = () => ahora() + 60000;
      try { document.querySelector('#coachHost [data-coach="settings-sec"][data-k="avisos"]').click(); } finally { Date.now = ahora; }
      return CoachState.resumenLunes;
    });
    await wait(400);
    t.eq([r, pg.st.pide], [null, 1], 'base sin la función: queda anotado que no está y no se vuelve a preguntar');
    t.eq(pg.errs, [], 'base sin la función: sin errores');
    await pg.close();
  }
  // Sin señal: no aparece; al rato se vuelve a probar y, si contesta, aparece.
  {
    const pg = await coach(base, { estado: 'falla' }), p = pg.p;
    await configCoach(p, 'avisos'); await wait(400);
    t.eq(await tarjeta(p), '', 'sin señal: sin la tarjeta');
    await configCoach(p, 'perfil'); await configCoach(p, 'avisos'); await wait(400);
    t.eq(pg.st.pide, 1, 'sin señal: no se insiste en cada dibujo');
    pg.st.estado = true;
    await configCoach(p, 'perfil');
    await p.evaluate(() => {
      const ahora = Date.now; Date.now = () => ahora() + 60000;
      try { document.querySelector('#coachHost [data-coach="settings-sec"][data-k="avisos"]').click(); } finally { Date.now = ahora; }
    });
    await wait(600);
    t.eq(pg.st.pide, 2, 'sin señal: pasado el rato se vuelve a preguntar');
    t.has(await tarjeta(p), 'Te llega los lunes', 'sin señal: cuando contesta, aparece la tarjeta');
    t.eq(pg.errs, [], 'sin señal: sin errores');
    await pg.close();
  }

  // ===== Android e iPhone =====
  for (const [plat, init] of [['android', ANDROID], ['ios', IOS]]){
    const pg = await coach(base, { estado: true, init }), p = pg.p;
    await configCoach(p, 'avisos'); await wait(400);
    const c = await tarjeta(p);
    t.has(c, 'Te llega los lunes', plat + ': la tarjeta');
    t.ok(!PROHIBIDO.test(c), plat + ': sin plan, precios ni gize.ar: ' + c.match(PROHIBIDO));
    await p.click(TOGGLE); await wait(500);
    t.eq(pg.st.cambiar, [{ p_on: false }], plat + ': «Apagar» funciona igual');
    t.eq(pg.errs, [], plat + ': sin errores');
    await pg.close();
  }

  // ===== Panel del gimnasio («Mi cuenta» de la dueña) =====
  {
    const pg = await entrar(base, DUENA, { gym: miGimnasio('owner'), rpc: { resumen_semanal_estado: () => true, resumen_semanal_cambiar: b => b.p_on } }), p = pg.p;
    await p.click('#coachHost [data-coach="open-settings"][data-gy-coach]'); await wait(1000);
    await configCoach(p, 'avisos'); await wait(400);
    t.has(await tarjeta(p), 'Te llega los lunes', 'gimnasio: la dueña ve la tarjeta');
    await p.click(TOGGLE); await wait(500);
    t.eq(rpcs(pg.st, 'resumen_semanal_cambiar'), [{ p_on: false }], 'gimnasio: «Apagar» llama a resumen_semanal_cambiar');
    t.has(await tarjeta(p), 'Resumen apagado', 'gimnasio: queda apagado');
    t.eq(pg.errs, [], 'gimnasio: sin errores');
    await pg.close();
  }
}
