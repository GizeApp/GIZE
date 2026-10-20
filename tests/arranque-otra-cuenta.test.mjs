// Otra cuenta en el mismo celular: una cuenta sale («Cerrar sesión») o se elimina, y después entra
// otra (con su mail y contraseña). Sin el rol recordado (salir lo borra), el arranque espera el perfil
// para no adivinar si es coach: tiene que abrir enseguida lo que corresponde a la cuenta NUEVA (el
// panel a un coach, la app a un alumno), sin un cuadro de la app del alumno para el coach y sin
// quedarse en el splash con «No se pudo abrir tu cuenta».
// (4) Antes, si al abrir con la sesión de B la consulta del usuario (getUser) contestaba con otra
// cuenta, la app pasaba a ser esa otra cuenta mientras la sesión seguía siendo la de B: ninguna
// lectura salía (no era «su» sesión) y el splash quedaba para siempre con «No se pudo abrir tu
// cuenta». Ahora se sigue con la cuenta de la sesión.
import { newPage, wait, ALUMNO } from './lib.mjs';

const SB_KEY = 'sb-wegptuzhsrwppbknqstf-auth-token';
const COACH_A = { id: '55555555-5555-4555-8555-555555555555', email: 'coach-a@prueba.test', aud: 'authenticated', role: 'authenticated' };
const ALUMNO_B = { id: '66666666-6666-4666-8666-666666666666', email: 'alumno-b@prueba.test', aud: 'authenticated', role: 'authenticated' };
const COACH_B = { id: '77777777-7777-4777-8777-777777777777', email: 'coach-b@prueba.test', aud: 'authenticated', role: 'authenticated' };
const ROL = { [ALUMNO.id]: 'client', [COACH_A.id]: 'coach', [ALUMNO_B.id]: 'client', [COACH_B.id]: 'coach' };
// La sesión de la cuenta que entra después lleva su propio token: el servidor falso sabe de quién es
// cada pedido por él (el de la primera cuenta es el de tests/lib.mjs).
const TOKEN_B = 'b.eyJzdWIiOiJiIn0.y';
const sesionB = u => ({ access_token: TOKEN_B, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rb', user: u });

// Cada cuadro: ¿se ve algo de la app del alumno (su barra o su pantalla) sin el splash ni la pantalla
// de ingreso tapándolo?
const ESPIA = `(() => {
  window.__vista = { alumno: 0 };
  const cuadro = () => { try {
    const nav = document.querySelector('.navbar'), sp = document.getElementById('splash'), v = document.getElementById('view'), au = document.getElementById('authHost');
    const tapa = (sp && getComputedStyle(sp).visibility !== 'hidden' && Number(getComputedStyle(sp).opacity) > 0.98) || (au && getComputedStyle(au).display !== 'none');
    const c = nav && getComputedStyle(nav);
    const barra = c && c.display !== 'none' && c.visibility !== 'hidden' && nav.getBoundingClientRect().height > 0;
    const pantalla = v && v.innerHTML.length > 0 && getComputedStyle(v).visibility !== 'hidden' && !document.body.classList.contains('silk-coach');
    if ((barra || pantalla) && !tapa) window.__vista.alumno++;
  } catch (e) {} requestAnimationFrame(cuadro); };
  requestAnimationFrame(cuadro);
})();`;
const mirar = p => p.evaluate(() => {
  const nav = document.getElementById('nav-config');
  return {
    alumno: window.__vista ? window.__vista.alumno : -1,
    panel: document.body.classList.contains('silk-coach') && getComputedStyle(document.getElementById('coachHost')).display !== 'none',
    app: !document.body.classList.contains('silk-coach') && !!nav && nav.offsetParent !== null && !document.body.classList.contains('is-booting'),
    login: !!document.getElementById('authHost') && getComputedStyle(document.getElementById('authHost')).display !== 'none' && !!document.querySelector('#auEmail'),
    splash: !!document.getElementById('splash'),
    cartel: (() => { const r = document.querySelector('#splash .sp-reintento'); return r && !r.hidden ? r.innerText.replace(/\s+/g, ' ').trim() : ''; })(),
    sesion: ((JSON.parse(localStorage.getItem('sb-wegptuzhsrwppbknqstf-auth-token') || 'null') || {}).user || {}).id || null,
  };
});
async function hasta(p, cond, ms){
  const fin = Date.now() + ms; let r;
  while (Date.now() < fin) { r = await mirar(p).catch(() => null); if (r && cond(r)) return r; await wait(200); }
  return r || await mirar(p).catch(() => null);
}

// El servidor falso: cada pedido es de la cuenta de su token (A con el de tests/lib.mjs, B con TOKEN_B).
// getUserMal: /auth/v1/user contesta siempre con la primera cuenta (no con la del token).
function servidor(A, B, { getUserMal = false } = {}){
  const de = r => (r.request().headers().authorization || '').includes(TOKEN_B) ? B : A;
  const me = u => ({ id: u.id, role: ROL[u.id], full_name: ROL[u.id] === 'coach' ? 'Coach ' + u.email : 'Alumno ' + u.email, coach_id: null });
  return {
    '/auth/v1/user': (r, J) => J(getUserMal ? A : de(r)),
    '/auth/v1/token': (r, J, i) => /grant_type=password/.test(i.url.search) ? J(sesionB(B)) : J(Object.assign(sesionB(de(r)), { access_token: de(r) === B ? TOKEN_B : 'x.eyJzdWIiOiJ1MyJ9.y' })),
    '/auth/v1/logout': (r, J) => J({}),
    '/delete_own_account': (r, J) => J(null),
    '/profiles': (r, J, i) => {
      if (i.m !== 'GET') return undefined;
      const u = de(r);
      if (/coach_id=eq/.test(i.url.search)) return J(ROL[u.id] === 'coach' ? [{ id: '44444444-4444-4444-4444-444444444444', full_name: 'Alumna Zeta' }] : []);
      const x = me(u); return J(i.one ? x : [x]);
    },
    '/coach_billing': (r, J, i) => { const b = { coach_id: de(r).id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  };
}

// La primera cuenta sale (o se elimina) y entra la segunda con mail y contraseña.
async function cambio(base, t, nombre, A, B, salida){
  const { p, errs, close } = await newPage({ user: A, handlers: servidor(A, B),
    init: `localStorage.getItem('core_profile_v1') || sessionStorage.getItem('__rol') || (sessionStorage.setItem('__rol', '1'), localStorage.setItem('core_profile_v1', JSON.stringify({ uid: '${A.id}', profile: { id: '${A.id}', role: '${ROL[A.id]}' } })));`,
    state: ROL[A.id] === 'client' ? { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} } : undefined });
  await p.addInitScript(ESPIA);
  await p.goto(base + '/app/');
  const r0 = await hasta(p, x => (ROL[A.id] === 'coach' ? x.panel : x.app) && !x.splash, 12000);
  t.ok(r0 && !r0.cartel && (ROL[A.id] === 'coach' ? r0.panel : r0.app), nombre + ': la primera cuenta entra: ' + JSON.stringify(r0));

  if (salida === 'borrar'){
    p.dialogAnswer = 'ELIMINAR';
    await p.click('#nav-config'); await wait(500);
    await p.click('[data-action="cfg-delete-account"]');
  } else if (ROL[A.id] === 'coach') await p.evaluate(() => document.querySelector('[data-auth="logout"]').click());
  else { await p.click('#nav-config'); await wait(500); await p.click('[data-auth="logout"]'); }
  const r1 = await hasta(p, x => x.login && !x.splash && !x.sesion, 15000);
  t.ok(r1 && r1.login && !r1.sesion, nombre + ': queda en la pantalla de ingreso, sin sesión: ' + JSON.stringify(r1));
  await wait(500);

  await p.fill('#auEmail', B.email); await p.fill('#auPass', 'una-clave-larga');
  const t0 = Date.now();
  await p.evaluate(() => { window.__vista.alumno = 0; });
  await p.click('[data-auth="do-login"]');
  const coach = ROL[B.id] === 'coach';
  const r2 = await hasta(p, x => x.sesion === B.id && (coach ? x.panel : x.app) && !x.splash, 15000);
  const seg = (Date.now() - t0) / 1000;
  t.ok(r2 && r2.sesion === B.id && (coach ? r2.panel : r2.app) && !r2.splash, nombre + ': entra la cuenta nueva a ' + (coach ? 'su panel' : 'su app') + ' (' + seg.toFixed(1) + ' s): ' + JSON.stringify(r2));
  t.ok(seg < 10, nombre + ': sin demora (' + seg.toFixed(1) + ' s)');
  t.eq(r2 && r2.cartel, '', nombre + ': sin «No se pudo abrir tu cuenta»');
  if (coach) t.eq(r2 && r2.alumno, 0, nombre + ': al coach, ni un cuadro de la app del alumno');
  else { await p.click('#nav-config', { timeout: 5000 }); t.ok(await p.isVisible('[data-auth="logout"]'), nombre + ': la app del alumno responde (Configuración)'); }
  const rol = await p.evaluate(() => (JSON.parse(localStorage.getItem('core_profile_v1') || 'null') || {}));
  t.ok(rol.uid === B.id && rol.profile && rol.profile.role === ROL[B.id], nombre + ': queda recordado el rol de la cuenta nueva: ' + JSON.stringify(rol));
  t.eq(errs, [], nombre + ': sin errores en la página');
  await close();
}

export default async function ({ base, t }){
  await cambio(base, t, '(1) alumno sale, entra un coach', ALUMNO, COACH_B, 'salir');
  await cambio(base, t, '(2) coach sale, entra un alumno', COACH_A, ALUMNO_B, 'salir');
  await cambio(base, t, '(3) alumno elimina su cuenta, entra un coach', ALUMNO, COACH_B, 'borrar');
  await cambio(base, t, '(3b) alumno elimina su cuenta, entra otro alumno', ALUMNO, ALUMNO_B, 'borrar');

  // (4) Abre con la sesión de B guardada (entró en otra visita) y getUser contesta con otra cuenta.
  for (const B of [COACH_B, ALUMNO_B]){
    const nombre = '(4) ' + (ROL[B.id] === 'coach' ? 'coach' : 'alumno') + ' B, getUser contesta con otra cuenta';
    const { p, errs, close } = await newPage({ handlers: servidor(ALUMNO, B, { getUserMal: true }),
      init: `localStorage.setItem('${SB_KEY}', ${JSON.stringify(JSON.stringify(sesionB(B)))}); localStorage.setItem('gize_remember', '1');` });
    await p.addInitScript(ESPIA);
    p.goto(base + '/app/').catch(() => {});
    const coach = ROL[B.id] === 'coach';
    const r = await hasta(p, x => ((coach ? x.panel : x.app) && !x.splash) || x.cartel, 12000);
    t.ok(r && (coach ? r.panel : r.app) && !r.splash, nombre + ': entra a lo suyo: ' + JSON.stringify(r));
    t.eq(r && r.cartel, '', nombre + ': sin «No se pudo abrir tu cuenta»');
    t.eq(r && r.sesion, B.id, nombre + ': sigue la sesión de B');
    if (coach) t.eq(r && r.alumno, 0, nombre + ': ni un cuadro de la app del alumno');
    t.eq(errs, [], nombre + ': sin errores en la página');
    await close();
  }
}
