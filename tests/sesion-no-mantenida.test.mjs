// Sesión sin «Mantener la sesión» (en una compu compartida):
// 1) Tildar la casilla en otra pestaña no pasa a localStorage la sesión de esta: la renovación
//    del token queda en la pestaña y no pisa la sesión guardada de otra cuenta.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const SB_KEY = 'sb-wegptuzhsrwppbknqstf-auth-token';
const STATE = { days: [{ id: 'd1', name: 'Día 1', exercises: [] }], sessions: [], weights: [], daily: {} };
const now = () => Math.floor(Date.now() / 1000);
const sesion = (user, refresh) => ({ access_token: 'x.eyJzdWIiOiJ1MyJ9.y', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: refresh, user });
// La primera vez, la sesión que siembra newPage pasa a la pestaña (sessionStorage), como queda
// al entrar con la casilla destildada.
const EFIMERA = `(() => { if (sessionStorage.getItem('efimera')) return; sessionStorage.setItem('efimera', '1');
  const k = '${SB_KEY}', v = localStorage.getItem(k); if (v) { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
  localStorage.setItem('gize_remember', '0'); })()`;
const guardada = p => p.evaluate(k => ({ ss: JSON.parse(sessionStorage.getItem(k) || 'null'), ls: JSON.parse(localStorage.getItem(k) || 'null') }), SB_KEY);

export default async function ({ base, t }){
  // 1) La casilla se tilda en otra pestaña (y ahí entra otra cuenta con «Mantener la sesión»).
  {
    const OTRA = { id: '33333333-3333-3333-3333-333333333333', email: 'otra@prueba.test', aud: 'authenticated', role: 'authenticated' };
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: EFIMERA, handlers: {
      '/auth/v1/token': (r, J) => J(sesion(ALUMNO, 'r2')), '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(3000);
    let s = await guardada(p);
    t.ok(s.ss && !s.ls, '1: sin «Mantener la sesión», la sesión está solo en la pestaña');
    await p.evaluate(([k, v]) => { localStorage.setItem('gize_remember', '1'); localStorage.setItem(k, JSON.stringify(v)); }, [SB_KEY, sesion(OTRA, 'rB')]);
    await p.evaluate(async () => { const { State } = await import('/app/core/state.js'); await State.sb.auth.refreshSession(); });
    await wait(500);
    s = await guardada(p);
    t.ok(s.ss && s.ss.refresh_token === 'r2' && s.ss.user.id === ALUMNO.id, '1: la sesión renovada sigue en la pestaña: ' + JSON.stringify(s.ss && s.ss.refresh_token));
    t.ok(s.ls && s.ls.refresh_token === 'rB' && s.ls.user.id === OTRA.id, '1: la sesión guardada de la otra cuenta queda como estaba: ' + JSON.stringify(s.ls && s.ls.user && s.ls.user.id));
    t.eq(errs, [], '1: errores de la página');
    await close();
  }
}
