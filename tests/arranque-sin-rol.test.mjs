// Arranque de un coach SIN el rol recordado (la primera vez en un celular, o cualquier ingreso después
// de «Salir», que lo borra) y con la red o la base fallando. Antes:
// (1) si el perfil no se podía leer (la base con error, sin señal, el token vencido sin poder
//     renovarse) la app seguía como si fuera un alumno: al coach le aparecía la app del alumno, con
//     su barra de abajo y «Todavía no tenés rutina». Ahora el splash se queda con «No se pudo abrir
//     tu cuenta» y «Reintentar», y cuando el perfil llega (los reintentos de fondo) entra al panel.
// (2) una lectura que el rol no necesita (las comidas de hoy) colgada lo dejaba en el splash para
//     siempre: se esperaba la cuenta entera. Ahora el rol se aplica apenas llega el perfil.
// Y con el rol recordado:
// (3) el token vencido (no abrió la app en más de una hora) con una renovación que no contesta nunca
//     trababa todo supabase-js (tiene la sesión tomada): el panel quedaba con «Cargando tus
//     clientes…» aunque la red volviera. Ahora el pedido se corta a los 12 s y se reintenta.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const ME = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
const ROL = `localStorage.setItem('core_profile_v1', JSON.stringify({ uid: '${COACH.id}', profile: ${JSON.stringify(ME)} }));`;
// El token guardado vencido hace 10 minutos (una sola vez: la recarga lo encuentra renovado).
const VENCIDO = `(() => { if (sessionStorage.getItem('__vencido')) return; sessionStorage.setItem('__vencido', '1');
  const k = 'sb-wegptuzhsrwppbknqstf-auth-token'; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 600; localStorage.setItem(k, JSON.stringify(s)); })();`;
const nunca = () => new Promise(() => {});
const alumnos = (r, J) => J([{ id: '44444444-4444-4444-4444-444444444444', full_name: 'Alumna Zeta' }]);
const coach = (extra = {}) => Object.assign({
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return alumnos(r, J); return J(i.one ? ME : [ME]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
}, extra);
const tokenNuevo = () => ({ access_token: 'x.eyJzdWIiOiJ1MyJ9.y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r2', user: COACH });

// Cada cuadro: ¿se ve algo del alumno (su barra de abajo o su pantalla) sin el splash tapándolo?
const ESPIA = `(() => {
  window.__vista = { alumno: 0, primero: null };
  const t0 = performance.now();
  const cuadro = () => { try {
    const nav = document.querySelector('.navbar'), sp = document.getElementById('splash'), v = document.getElementById('view');
    const tapa = sp && getComputedStyle(sp).visibility !== 'hidden' && Number(getComputedStyle(sp).opacity) > 0.98;
    const c = nav && getComputedStyle(nav);
    const barra = c && c.display !== 'none' && c.visibility !== 'hidden' && nav.getBoundingClientRect().height > 0;
    const pantalla = v && v.innerHTML.length > 0 && getComputedStyle(v).visibility !== 'hidden' && !document.body.classList.contains('silk-coach');
    if ((barra || pantalla) && !tapa) { window.__vista.alumno++; if (window.__vista.primero == null) window.__vista.primero = Math.round(performance.now() - t0); }
  } catch (e) {} requestAnimationFrame(cuadro); };
  requestAnimationFrame(cuadro);
})();`;
const mirar = p => p.evaluate(() => ({
  alumno: window.__vista.alumno, primero: window.__vista.primero,
  panel: document.body.classList.contains('silk-coach') && getComputedStyle(document.getElementById('coachHost')).display !== 'none',
  alumnas: /Alumna Zeta/.test((document.getElementById('coachHost') || {}).innerText || ''),
  cargando: /Cargando tus clientes/.test((document.getElementById('coachHost') || {}).innerText || ''),
  splash: !!document.getElementById('splash'),
  cartel: (() => { const r = document.querySelector('#splash .sp-reintento'); return r && !r.hidden ? r.innerText.replace(/\s+/g, ' ').trim() : ''; })(),
  rol: (JSON.parse(localStorage.getItem('core_profile_v1') || 'null') || { profile: {} }).profile.role || null
}));
async function hasta(p, cond, ms){
  const fin = Date.now() + ms; let r;
  while (Date.now() < fin) { r = await mirar(p).catch(() => null); if (r && cond(r)) return r; await wait(250); }
  return r || await mirar(p).catch(() => null);
}

export default async function ({ base, t }){
  // (1) Sin rol recordado y el perfil no se puede leer: el splash con «Reintentar», nunca la app del
  // alumno; cuando la base vuelve a contestar, entra sola al panel.
  let perfilMal = true, sinRed = true, tokenColgado = true;
  const casos = [
    ['la base contesta el perfil con error', { handlers: coach({ '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined;
      if (/coach_id=eq/.test(i.url.search)) return alumnos(r, J); return perfilMal ? J({ message: 'falla', code: 'XX000' }, 500) : J(i.one ? ME : [ME]); } }) },
      null, () => { perfilMal = false; }, 9000],
    ['sin señal', { handlers: coach() }, p => p.route(/supabase\.co/, r => sinRed ? r.abort('internetdisconnected') : r.fallback()), () => { sinRed = false; }, 14000],
    ['el token vencido y su renovación colgada', { handlers: coach({ '/auth/v1/token': (r, J) => tokenColgado ? nunca() : J(tokenNuevo()) }), init: VENCIDO },
      null, () => { tokenColgado = false; }, 9000],
  ];
  for (const [nombre, opts, ruta, vuelve, msCartel] of casos){
    const { p, errs, close } = await newPage(Object.assign({ user: COACH }, opts));
    await p.addInitScript(ESPIA);
    if (ruta) await ruta(p);
    p.goto(base + '/app/').catch(() => {});
    const r = await hasta(p, x => x.cartel, msCartel);
    t.has(r && r.cartel, 'No se pudo abrir tu cuenta', '(1) ' + nombre + ': el splash avisa que no pudo abrir la cuenta');
    t.has(r && r.cartel, 'Reintentar', '(1) ' + nombre + ': con «Reintentar»');
    t.eq(r && [r.alumno, r.panel], [0, false], '(1) ' + nombre + ': ni un cuadro de la app del alumno (primero: ' + (r && r.primero) + ' ms)');
    await wait(1500);
    const sigue = await mirar(p);
    t.ok(sigue.splash && sigue.cartel && sigue.alumno === 0, '(1) ' + nombre + ': se queda en el splash, no sigue como alumno: ' + JSON.stringify(sigue));
    // Vuelve la base o la red (sin avisos de 'online'): los reintentos de fondo leen el perfil y entra.
    vuelve();
    const ok = await hasta(p, x => x.panel && !x.splash, 30000);
    t.ok(ok && ok.panel && !ok.splash && ok.rol === 'coach', '(1) ' + nombre + ': cuando vuelve, entra solo al panel: ' + JSON.stringify(ok));
    t.eq(ok && ok.alumno, 0, '(1) ' + nombre + ': tampoco después se ve la app del alumno');
    t.eq(errs, [], '(1) ' + nombre + ': sin errores de JavaScript');
    await close();
  }

  // (2) Sin rol recordado: el perfil llega enseguida pero las comidas de hoy no contestan nunca (un
  // coach ni las usa). Entra al panel como siempre, sin el cartel.
  {
    const { p, errs, close } = await newPage({ user: COACH, handlers: coach({ '/food_entries': (r, J, i) => i.m === 'GET' ? nunca() : undefined }) });
    await p.addInitScript(ESPIA);
    const t0 = Date.now();
    p.goto(base + '/app/').catch(() => {});
    const r = await hasta(p, x => x.panel && !x.splash, 12000);
    const seg = (Date.now() - t0) / 1000;
    t.ok(r && r.panel && !r.splash && seg < 10, '(2) una lectura colgada que el rol no necesita: entra al panel en ' + seg.toFixed(1) + ' s: ' + JSON.stringify(r));
    t.ok(r && r.alumnas && !r.cartel, '(2) con sus alumnos y sin el cartel');
    t.eq(r && r.rol, 'coach', '(2) el rol queda recordado apenas llega el perfil');
    t.eq(r && r.alumno, 0, '(2) ni un cuadro de la app del alumno');
    t.eq(errs, [], '(2) sin errores de JavaScript');
    await close();
  }

  // (3) Con el rol recordado, el token vencido y el primer pedido para renovarlo que no contesta nunca
  // (la red colgada al volver de segundo plano); a los 6 s la red vuelve (los pedidos nuevos
  // contestan, el viejo sigue colgado). Antes, para siempre «Cargando tus clientes…». Ahora el pedido
  // colgado se corta a los 12 s, se renueva el token y aparecen sus alumnos.
  {
    let primero = true, colgada = true;
    const { p, calls, errs, close } = await newPage({ user: COACH, init: ROL + VENCIDO, handlers: coach({
      '/auth/v1/token': (r, J) => { if (primero || colgada) { primero = false; return nunca(); } return J(tokenNuevo()); } }) });
    await p.addInitScript(ESPIA);
    p.goto(base + '/app/').catch(() => {});
    const r = await hasta(p, x => x.panel && !x.splash, 12000);
    t.ok(r && r.panel && r.cargando, '(3) token colgado: entra al panel, con «Cargando tus clientes…»: ' + JSON.stringify(r));
    await wait(6000);
    colgada = false;
    const t0 = Date.now();
    const ok = await hasta(p, x => x.alumnas, 30000);
    const seg = (Date.now() - t0) / 1000;
    t.ok(ok && ok.alumnas && seg <= 20, '(3) token colgado: con la red de vuelta aparecen sus alumnos en ' + seg.toFixed(1) + ' s (tope 20 s): ' + JSON.stringify(ok));
    t.ok(calls.filter(c => /\/auth\/v1\/token/.test(c)).length >= 2, '(3) token colgado: el pedido colgado se cortó y se volvió a pedir');
    t.eq(ok && ok.alumno, 0, '(3) token colgado: ni un cuadro de la app del alumno');
    t.eq(errs, [], '(3) sin errores de JavaScript');
    await close();
  }
}
