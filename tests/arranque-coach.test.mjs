// Arranque del panel del coach (video del 19/10, «GIZE WEB» agregada a inicio en un iPhone):
// (1) La primera vez quedó trabada: pantalla vacía con la «G» arriba y la barra de abajo del ALUMNO;
//     tocar las pestañas no hacía nada. La app (app/main.js y sus módulos) no había llegado a
//     arrancar —un módulo que no llegó (red colgada) o que no encajaba con los demás (recién
//     publicada una versión)— y el splash se iba igual por reloj: a los 3 s por CSS y a los 8 s
//     del todo, dejando la pantalla de abajo. Ahora el splash se queda, la app se recarga sola una
//     vez si un módulo no encaja y, si sigue sin arrancar, sale «Reintentar».
// (2) Al volver a entrar cargó bien, pero unos segundos se vieron la barra de arriba (su nombre
//     con «Tu coach») y la de abajo del alumno antes del panel: el splash se iba a los 3 s aunque el
//     panel no estuviera. Ahora se va recién cuando la app armó su pantalla, y body.sp-tapa
//     esconde lo de abajo hasta entonces (también en el primer cuadro, antes del splash).
// (3) Cada paso de red del ingreso tenía espera sin límite: con la sesión o el perfil colgados no
//     entraba nunca, y sin señal el coach tardaba ~30 s (supabase-js reintenta cada lectura ~7 s y
//     la lista de alumnos probaba 4 veces). Ahora hay tope: con el rol recordado (el perfil guardado
//     en el celular, por cuenta, se borra al salir) entra al panel y lo que falta llega después.
// Los alumnos, igual que siempre.
import { newPage, wait, ALUMNO, perfil } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const ME = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
const ROL = `localStorage.setItem('core_profile_v1', JSON.stringify({ uid: '${COACH.id}', profile: ${JSON.stringify(ME)} }));`;
const nunca = () => new Promise(() => {});
const tarde = ms => new Promise(ok => setTimeout(ok, ms));
const alumnos = (r, J, i) => J([{ id: '44444444-4444-4444-4444-444444444444', full_name: 'Alumna Zeta' }]);
const coach = (extra = {}) => Object.assign({
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return alumnos(r, J, i); return J(i.one ? ME : [ME]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
}, extra);

// Cada cuadro: ¿se ve la barra de abajo del alumno (sin el splash tapándola)? Cuenta las cargas
// de la página (la recarga automática) en sessionStorage.
const ESPIA = `(() => {
  try { sessionStorage.setItem('__cargas', String(Number(sessionStorage.getItem('__cargas') || 0) + 1)); } catch (e) {}
  window.__vista = { alumno: 0, primero: null };
  const t0 = performance.now();
  const cuadro = () => { try {
    const nav = document.querySelector('.navbar'), sp = document.getElementById('splash');
    const tapa = sp && getComputedStyle(sp).visibility !== 'hidden' && Number(getComputedStyle(sp).opacity) > 0.98;
    const c = nav && getComputedStyle(nav);
    if (c && c.display !== 'none' && c.visibility !== 'hidden' && nav.getBoundingClientRect().height > 0 && !tapa) {
      window.__vista.alumno++; if (window.__vista.primero == null) window.__vista.primero = Math.round(performance.now() - t0); }
  } catch (e) {} requestAnimationFrame(cuadro); };
  requestAnimationFrame(cuadro);
})();`;
const mirar = p => p.evaluate(() => ({
  alumno: window.__vista.alumno, primero: window.__vista.primero,
  cargas: Number(sessionStorage.getItem('__cargas') || 0),
  panel: document.body.classList.contains('silk-coach') && getComputedStyle(document.getElementById('coachHost')).display !== 'none',
  alumnas: /Alumna Zeta/.test((document.getElementById('coachHost') || {}).innerText || ''),
  splash: !!document.getElementById('splash'),
  cartel: (() => { const r = document.querySelector('#splash .sp-reintento'); return r && !r.hidden ? r.innerText.replace(/\s+/g, ' ').trim() : ''; })(),
  vista: (document.getElementById('view') || {}).innerHTML.length
}));
async function hasta(p, cond, ms){
  const fin = Date.now() + ms; let r;
  while (Date.now() < fin) { r = await mirar(p).catch(() => null); if (r && cond(r)) return r; await wait(200); }
  return r || await mirar(p).catch(() => null);
}

export default async function ({ base, t }){
  // (1a) Un módulo de la app que nunca llega: el splash se queda y a los 15 s ofrece «Reintentar».
  // Tocarlo (con la red ya bien) recarga y entra al panel.
  {
    const { p, errs, close } = await newPage({ user: COACH, handlers: coach(), init: ROL, touch: true });
    await p.addInitScript(ESPIA);
    let colgado = true;
    await p.route(/\/app\/ui\/selector\.js/, r => colgado ? undefined : r.fallback());
    p.goto(base + '/app/').catch(() => {});
    await wait(9000);
    const medio = await mirar(p);
    t.ok(medio.splash && !medio.cartel, '(1a) a los 9 s sigue el splash (no la pantalla vacía de abajo): ' + JSON.stringify(medio));
    await p.tap('#nav-habitos', { force: true, timeout: 2000 }).catch(() => {});
    const r = await hasta(p, x => x.cartel, 8000);
    t.has(r && r.cartel, 'Está tardando más de lo normal', '(1a) a los 15 s el splash avisa');
    t.has(r && r.cartel, 'Reintentar', '(1a) con «Reintentar»');
    t.eq(r && [r.alumno, r.vista], [0, 0], '(1a) nunca se ve la barra del alumno ni su pantalla (primer cuadro: ' + (r && r.primero) + ' ms)');
    colgado = false;
    await p.click('#splash .sp-r-btn', { timeout: 3000 }).catch(() => {});
    const ok = await hasta(p, x => x.panel && x.alumnas && !x.splash, 12000);
    t.ok(ok && ok.panel && ok.alumnas && !ok.splash, '(1a) «Reintentar» recarga y entra al panel: ' + JSON.stringify(ok));
    t.eq(ok && ok.alumno, 0, '(1a) tampoco después de reintentar se ve la barra del alumno');
    t.eq(errs, [], '(1a) sin errores de JavaScript');
    await close();
  }

  // (1b) Un módulo que no encaja con los demás (uno viejo sin lo que pide el nuevo): se recarga sola
  // una vez y, si sigue igual, «No se pudo abrir GIZE» con «Reintentar».
  {
    const { p, close } = await newPage({ user: COACH, handlers: coach(), init: ROL });
    await p.addInitScript(ESPIA);
    await p.route(/\/app\/core\/icons\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const viejo = 1;' }));
    p.goto(base + '/app/').catch(() => {});
    const r = await hasta(p, x => x.cartel, 12000);
    t.eq(r && r.cargas, 2, '(1b) se recargó sola una vez (y no más)');
    t.has(r && r.cartel, 'No se pudo abrir GIZE', '(1b) después avisa que no se pudo abrir');
    t.has(r && r.cartel, 'Reintentar', '(1b) con «Reintentar»');
    t.eq(r && [r.alumno, r.vista], [0, 0], '(1b) nunca se ve la barra del alumno ni su pantalla');
    await close();
  }

  // (2) Los datos del panel tardan (4 s): el splash espera al panel; nunca se ve lo del alumno.
  {
    const { p, errs, close } = await newPage({ user: COACH, init: ROL, handlers: coach({ '/rpc/my_invite_code': (r, J) => tarde(4000).then(() => J('ABCD2345')) }) });
    await p.addInitScript(ESPIA);
    p.goto(base + '/app/').catch(() => {});
    await wait(3300);
    const a3 = await mirar(p);
    t.ok(a3.splash, '(2) a los 3,3 s, con el panel todavía sin armar, sigue el splash');
    const r = await hasta(p, x => x.panel && x.alumnas && !x.splash, 10000);
    t.ok(r && r.panel && r.alumnas, '(2) entra al panel con sus alumnos');
    t.eq(r && [r.alumno, r.vista], [0, 0], '(2) ni un cuadro con la barra del alumno (primero: ' + (r && r.primero) + ' ms)');
    t.eq(errs, [], '(2) sin errores de JavaScript');
    await close();
  }

  // (3) Pasos de red colgados o sin señal, con el rol recordado: entra al panel en pocos segundos.
  let sinRed = true; // «sin señal»: se corta todo Supabase hasta que vuelve (fallback: el simulado)
  const casos = [
    ['sesión colgada (getUser no contesta)', coach({ '/auth/v1/user': () => nunca() }), null, 10000],
    ['perfil colgado', coach({ '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return alumnos(r, J, i); return nunca(); } }), null, 10000],
    ['sin señal', coach(), p => p.route(/supabase\.co/, r => sinRed ? r.abort('internetdisconnected') : r.fallback()), 12000],
  ];
  for (const [nombre, handlers, ruta, ms] of casos){
    const { p, close } = await newPage({ user: COACH, init: ROL, handlers });
    await p.addInitScript(ESPIA);
    if (ruta) await ruta(p);
    const t0 = Date.now();
    p.goto(base + '/app/').catch(() => {});
    const r = await hasta(p, x => x.panel && !x.splash, ms + 3000);
    const seg = (Date.now() - t0) / 1000;
    t.ok(r && r.panel && !r.splash && seg <= ms / 1000, '(3) ' + nombre + ': entra al panel en ' + seg.toFixed(1) + ' s (tope ' + ms / 1000 + ' s): ' + JSON.stringify(r));
    t.eq(r && [r.alumno, r.vista], [0, 0], '(3) ' + nombre + ': nunca se ve la barra del alumno');
    if (nombre !== 'sin señal') t.ok(r && r.alumnas, '(3) ' + nombre + ': con sus alumnos');
    else {
      // Sin señal la lista no llega: dice que está cargando (no «no tenés clientes», como antes) y,
      // cuando vuelve la conexión, aparecen. Sin el aviso 'online': con un wifi sin internet (o la red
      // colgada de un iPhone) no llega nunca, y la lista se quedaba cargando para siempre.
      await wait(9000);
      const txt = await p.evaluate(() => document.getElementById('coachHost').innerText);
      t.ok(/Cargando tus clientes/.test(txt) && !/Todavía no tenés clientes/.test(txt), '(3) sin señal: «Cargando tus clientes…», no «no tenés clientes»: ' + txt.replace(/\s+/g, ' ').slice(0, 160));
      sinRed = false;
      const t1 = Date.now();
      const v = await hasta(p, x => x.alumnas, 30000);
      t.ok(v && v.alumnas, '(3) sin señal: al volver la conexión aparecen sus alumnos solos, sin el aviso «online» (' + ((Date.now() - t1) / 1000).toFixed(1) + ' s)');
    }
    await close();
  }

  // (4) Sin rol recordado (primera vez en este celular) y el perfil colgado: no se adivina. Se queda
  // el splash, avisa que tarda y, cuando el perfil llega, entra al panel (nunca a la app del alumno).
  {
    let soltar; const llega = new Promise(ok => { soltar = ok; });
    const { p, close } = await newPage({ user: COACH, handlers: coach({ '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined;
      if (/coach_id=eq/.test(i.url.search)) return alumnos(r, J, i); return llega.then(() => J(i.one ? ME : [ME])); } }) });
    await p.addInitScript(ESPIA);
    p.goto(base + '/app/').catch(() => {});
    const r = await hasta(p, x => x.cartel, 17000);
    t.has(r && r.cartel, 'Está tardando más de lo normal', '(4) sin rol conocido espera con el splash y avisa que tarda');
    soltar();
    const ok = await hasta(p, x => x.panel && !x.splash, 12000);
    t.ok(ok && ok.panel && ok.alumnas, '(4) cuando llega el perfil entra al panel: ' + JSON.stringify(ok));
    t.eq(ok && [ok.alumno, ok.vista], [0, 0], '(4) nunca se ve la barra del alumno');
    await close();
  }

  // (5) El rol recordado es por cuenta y se borra al salir.
  {
    const { p, close } = await newPage({ user: COACH, handlers: coach() });
    p.on('dialog', d => d.accept().catch(() => {}));
    await p.goto(base + '/app/');
    await hasta(p, x => x.panel && !x.splash, 8000);
    const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('core_profile_v1') || 'null'));
    t.eq(guardado && [guardado.uid, guardado.profile.role], [COACH.id, 'coach'], '(5) queda recordado el rol de esta cuenta');
    await p.click('[data-auth="logout"]');
    await p.waitForSelector('#auEmail', { timeout: 15000 }).catch(() => {});
    t.eq(await p.evaluate(() => localStorage.getItem('core_profile_v1')), null, '(5) al salir se borra');
    await close();
  }

  // (6) Las apps de las tiendas (Capacitor: el mismo index.html, splash y main.js, sin service
  // worker). En Android va el splash corto del modo liviano. Con el panel lento, igual: ni un cuadro
  // de la barra del alumno, y el splash se va cuando está el panel.
  for (const [nombre, plat] of [['iPhone', 'ios'], ['Android', 'android']]){
    const NATIVA = `window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plat}', Plugins: {} };`;
    const { p, errs, close } = await newPage({ user: COACH, init: ROL + NATIVA, handlers: coach({ '/rpc/my_invite_code': (r, J) => tarde(2500).then(() => J('ABCD2345')) }) });
    await p.addInitScript(ESPIA);
    await p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), x => x.abort());
    p.goto(base + '/app/').catch(() => {});
    await wait(1500);
    const antes = await mirar(p);
    t.ok(antes.splash, '(6) ' + nombre + ': mientras arma el panel sigue el splash');
    const r = await hasta(p, x => x.panel && x.alumnas && !x.splash, 10000);
    t.ok(r && r.panel && r.alumnas && !r.splash, '(6) ' + nombre + ': entra al panel: ' + JSON.stringify(r));
    t.eq(r && [r.alumno, r.vista], [0, 0], '(6) ' + nombre + ': nunca se ve la barra del alumno');
    t.eq(errs, [], '(6) ' + nombre + ': sin errores de JavaScript');
    await close();
  }

  // (7) Alumnos: arrancan como siempre (su app y su barra), también con la red lenta.
  for (const [nombre, extra] of [['normal', {}], ['perfil lento (6 s)', { lento: true }]]){
    const ESTADO = { days: [{ id: 'd1', name: 'Pierna', exercises: [] }], sessions: [], weights: [], daily: {} };
    const p0 = perfil('client');
    const handlers = { '/profiles': extra.lento ? (r, J, i) => i.m === 'GET' ? tarde(6000).then(() => p0(r, J, i)) : undefined : p0 };
    const rol = `localStorage.setItem('core_profile_v1', JSON.stringify({ uid: '${ALUMNO.id}', profile: { id: '${ALUMNO.id}', role: 'client', coach_id: null } }));`;
    const { p, errs, close } = await newPage({ user: ALUMNO, state: ESTADO, handlers, init: rol });
    const t0 = Date.now();
    await p.goto(base + '/app/');
    await p.waitForFunction(() => !document.getElementById('splash') && /Pierna/.test(document.getElementById('view').innerText), null, { timeout: 15000 }).catch(() => {});
    const seg = (Date.now() - t0) / 1000;
    const v = await p.evaluate(() => ({ nav: getComputedStyle(document.querySelector('.navbar')).visibility, entreno: document.getElementById('nav-entreno').classList.contains('active'),
      pierna: /Pierna/.test(document.getElementById('view').innerText), coach: document.body.classList.contains('silk-coach') }));
    t.eq(v, { nav: 'visible', entreno: true, pierna: true, coach: false }, '(7) alumno, ' + nombre + ': su app con su barra');
    t.ok(seg < 9.5, '(7) alumno, ' + nombre + ': abre en ' + seg.toFixed(1) + ' s');
    t.eq(errs, [], '(7) alumno, ' + nombre + ': sin errores de JavaScript');
    await close();
  }
}
