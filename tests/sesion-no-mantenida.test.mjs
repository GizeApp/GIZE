// Sesión sin «Mantener la sesión» (en una compu compartida):
// 1) Tildar la casilla en otra pestaña no pasa a localStorage la sesión de esta: la renovación
//    del token queda en la pestaña y no pisa la sesión guardada de otra cuenta.
// 2) Cerrar la pestaña sin «Salir» y volver a abrir GIZE sin sesión borra lo de esa cuenta del
//    navegador (estado, perfil, recorridos, borradores), salvo lo que no se subió: la cola.
// 3) Si la rutina propia cambió sin subirse, queda solo la rutina.
// 4) Con «Mantener la sesión» no se borra nada al abrir sin sesión (control).
// 5) Cerrar sesión borra los borradores de rutina del coach.
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
const COLA = { id: 'q1', uid: ALUMNO.id, k: 'daily', key: '2026-10-09', p: { d: '2026-10-09', sleep: 7 }, ts: 1 };
const DRAFT = 'gize_rt_draft_' + ALUMNO.id + '_c1';
// Lo que una cuenta deja en el navegador, además del estado.
const RESTOS = ([q, d]) => { localStorage.setItem('core_outbox_v1', JSON.stringify([q])); localStorage.setItem(d, '{"days":[]}');
  localStorage.setItem('gize_salidas_track_v1', '{"s1":"x"}'); localStorage.setItem('core_profile_v1', JSON.stringify({ uid: q.uid, profile: { id: q.uid, role: 'client' } })); };
const claves = p => p.evaluate(() => ({ st: JSON.parse(localStorage.getItem('rutina_jero_v1') || 'null'), prof: localStorage.getItem('core_profile_v1'),
  track: localStorage.getItem('gize_salidas_track_v1'), drafts: Object.keys(localStorage).filter(k => k.startsWith('gize_rt_draft_')),
  cola: JSON.parse(localStorage.getItem('core_outbox_v1') || '[]'), marca: localStorage.getItem('gize_session_ephemeral') }));
// Se cierra la pestaña: se va la sesión de sessionStorage (las marcas de la prueba quedan) y se abre de nuevo.
const cerrarYAbrir = async p => { await p.evaluate(k => sessionStorage.removeItem(k), SB_KEY); await p.reload(); await wait(5000); };
const WEIGHTS = (r, J, i) => i.m === 'GET' ? J([{ id: 'w1', client_id: ALUMNO.id, measured_on: '2026-10-01', kg: 80 }]) : undefined;
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

  // 2) Sin «Mantener la sesión», se cierra la pestaña sin «Salir» y se vuelve a abrir GIZE.
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: EFIMERA, handlers: { '/profiles': profile('client'), '/body_weights': WEIGHTS } });
    await p.goto(base + '/app/'); await wait(3000);
    let c = await claves(p);
    t.eq(c.marca, ALUMNO.id, '2: queda anotado de quién son los datos de una sesión no mantenida');
    t.ok(c.st && c.st.weights && c.st.weights.length, '2: mientras está adentro, los datos están en el navegador');
    t.ok(c.st && c.st.routineHash, '2: la rutina quedó igual que en la nube');
    await p.evaluate(RESTOS, [COLA, DRAFT]);
    await cerrarYAbrir(p);
    c = await claves(p);
    t.eq(c.st, null, '2: se borra el estado de la cuenta (pesos, registros, rutina)');
    t.eq(c.prof, null, '2: se borra el perfil');
    t.eq(c.track, null, '2: se borran los recorridos de Cardio');
    t.eq(c.drafts, [], '2: se borran los borradores de rutina');
    t.eq(c.cola.map(i => i.id), ['q1'], '2: lo que no se subió (la cola) queda, para subirlo si vuelve a entrar');
    t.eq(c.marca, null, '2: la marca se saca');
    t.ok(await p.isVisible('#auEmail'), '2: pide ingresar');
    t.eq(errs, [], '2: errores de la página');
    await close();
  }

  // 3) Lo mismo, con la rutina cambiada en el navegador sin llegar a subirse.
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: EFIMERA, handlers: { '/profiles': profile('client'), '/body_weights': WEIGHTS } });
    await p.goto(base + '/app/'); await wait(3000);
    await p.evaluate(RESTOS, [COLA, DRAFT]);
    // Cambio sin pasar por save() (que la subiría): como si no hubiera habido señal.
    await p.evaluate(async () => { const { state } = await import('/app/core/state.js'); state.days[0].name = 'Cambiada sin subir'; localStorage.setItem('rutina_jero_v1', JSON.stringify(state)); });
    await cerrarYAbrir(p);
    const c = await claves(p);
    t.ok(c.st && c.st.ownerUid === ALUMNO.id && c.st.days && c.st.days[0].name === 'Cambiada sin subir', '3: la rutina sin subir queda: ' + JSON.stringify(c.st && c.st.days && c.st.days[0] && c.st.days[0].name));
    t.ok(c.st && !c.st.weights && !c.st.sessions && !c.st.daily, '3: y nada más del estado: ' + Object.keys(c.st || {}).join(','));
    t.eq(c.prof, null, '3: el perfil se borra');
    t.eq(errs, [], '3: errores de la página');
    await close();
  }

  // 4) Con «Mantener la sesión» no se anota nada ni se borra al abrir sin sesión.
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client'), '/body_weights': WEIGHTS } });
    await p.goto(base + '/app/'); await wait(3000);
    t.eq((await claves(p)).marca, null, '4: con «Mantener la sesión» no queda la marca');
    await p.evaluate(k => localStorage.removeItem(k), SB_KEY); await p.reload(); await wait(4000);
    const c = await claves(p);
    t.ok(c.st && c.st.weights && c.st.weights.length, '4: los datos siguen detrás del ingreso');
    t.eq(errs, [], '4: errores de la página');
    await close();
  }

  // 5) Cerrar sesión borra los borradores de rutina del coach.
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(3000);
    await p.evaluate(d => localStorage.setItem(d, '{"days":[]}'), DRAFT);
    await p.click('#nav-config'); await wait(500);
    await p.click('[data-auth="logout"]');
    await p.waitForEvent('load', { timeout: 30000 }).catch(() => {});
    await wait(3000);
    t.eq((await claves(p)).drafts, [], '5: al cerrar sesión no quedan borradores de rutina');
    t.eq(errs, [], '5: errores de la página');
    await close();
  }
}
