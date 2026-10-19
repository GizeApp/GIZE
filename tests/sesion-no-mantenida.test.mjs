// Sesión sin «Mantener la sesión» (en una compu compartida):
// 1) Tildar la casilla en otra pestaña no pasa a localStorage la sesión de esta: la renovación
//    del token queda en la pestaña y no pisa la sesión guardada de otra cuenta.
// 2) Cerrar la pestaña sin «Salir» y volver a abrir GIZE sin sesión borra lo de esa cuenta del
//    navegador (estado, perfil, recorridos, borradores), salvo lo que no se subió: la cola.
// 3) Si la rutina propia cambió sin subirse, queda solo la rutina.
// 4) Con «Mantener la sesión» no se borra nada al abrir sin sesión (control).
// 5) Cerrar sesión borra los borradores de rutina del coach.
// 6) Con la sesión abierta en una pestaña, abrir GIZE en otra (sin sesión) no borra nada; y si la
//    marca se perdió igual, el próximo save() de la pestaña con sesión la vuelve a poner.
// 7) La marca de las versiones anteriores ("1" en vez de la cuenta, y sin state.ownerUid): la
//    rutina sin subir queda igual.
// 8) En la app de las tiendas y en la agregada a inicio (iPhone, o instalada en Android) el sistema
//    la cierra solo (y con eso la sesión de la pestaña): no se borra nada, el entreno en curso queda
//    detrás del ingreso.
// 9) En el celular, la pestaña con la sesión queda congelada en segundo plano (no contesta) y se
//    abre GIZE en otra (un link de WhatsApp): no se borran su entreno ni su salida de Cardio. Si
//    esa sesión no se usa hace más de 30 minutos, se borra como siempre.
// 10) Una cuenta sin «Mantener la sesión» en una pestaña y otra con «Mantener la sesión» en otra:
//    «Salir» en la primera no borra ni cierra la sesión guardada de la otra, y esa pestaña sigue
//    adentro.
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

  // 6) Sesión no mantenida abierta en una pestaña; se abre GIZE en otra (o en la app instalada).
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: EFIMERA, handlers: { '/profiles': profile('client'), '/body_weights': WEIGHTS } });
    await p.goto(base + '/app/'); await wait(3000);
    await p.evaluate(RESTOS, [COLA, DRAFT]);
    await p.evaluate(id => localStorage.setItem('gize_web_push', id), ALUMNO.id);
    const p2 = await p.context().newPage(), errs2 = [];
    p2.on('pageerror', e => errs2.push(e.message));
    await p2.route(/supabase\.co/, r => r.fulfill({ status: 200, contentType: 'application/json', body: new URL(r.request().url()).pathname.includes('/rpc/') ? 'null' : '[]' }));
    await p2.goto(base + '/app/'); await wait(4000);
    t.ok(await p2.isVisible('#auEmail'), '6: la pestaña nueva no tiene sesión y pide ingresar');
    const c = await claves(p);
    t.ok(c.st && c.st.weights && c.st.weights.length, '6: los datos de la sesión abierta siguen');
    t.ok(!!c.prof && !!c.track && c.drafts.length === 1, '6: el perfil, los recorridos y los borradores también');
    t.eq(c.marca, ALUMNO.id, '6: y la marca, para borrarlos cuando se cierre');
    t.eq(await p.evaluate(() => localStorage.getItem('gize_web_push')), ALUMNO.id, '6: las notificaciones no se dan de baja');
    t.ok(await p.evaluate(async () => { const { State } = await import('/app/core/state.js'); return !!State.cloudUser; }), '6: la primera pestaña sigue adentro');
    t.eq(errs2, [], '6: errores de la pestaña nueva');
    await p2.close();
    // La marca se perdió igual (por ejemplo, la pestaña estaba dormida y no contestó).
    await p.evaluate(() => localStorage.removeItem('gize_session_ephemeral'));
    await p.evaluate(async () => { const { save } = await import('/app/core/storage.js'); save(); });
    t.eq((await claves(p)).marca, ALUMNO.id, '6: el próximo save() vuelve a poner la marca');
    t.eq(errs, [], '6: errores de la página');
    await close();
  }

  // 7) Marca "1" de una versión anterior, con la rutina cambiada sin subir.
  {
    const VIEJO = ([st, q]) => { if (sessionStorage.getItem('viejo')) return; sessionStorage.setItem('viejo', '1');
      localStorage.setItem('gize_session_ephemeral', '1'); localStorage.setItem('rutina_jero_v1', JSON.stringify(st));
      localStorage.setItem('core_profile_v1', JSON.stringify({ uid: q, profile: { id: q, role: 'client' } })); };
    const st = Object.assign({}, STATE, { days: [{ id: 'd1', name: 'Cambiada sin subir', exercises: [] }], routineHash: 'otra', weights: [{ id: 'w1', kg: 80 }] });
    const { p, errs, close } = await newPage({ init: `(${VIEJO})(${JSON.stringify([st, ALUMNO.id])})` });
    await p.goto(base + '/app/'); await wait(5000);
    const c = await claves(p);
    t.ok(c.st && c.st.ownerUid === ALUMNO.id && c.st.days && c.st.days[0].name === 'Cambiada sin subir', '7: la rutina sin subir queda, a nombre de su cuenta: ' + JSON.stringify(c.st));
    t.ok(c.st && !c.st.weights, '7: y nada más del estado');
    t.eq(c.prof, null, '7: el perfil se borra');
    t.eq(c.marca, null, '7: la marca se saca');
    t.eq(errs, [], '7: errores de la página');
    await close();
  }

  // 8) Sesión no mantenida en la app de inicio del iPhone, en la de Android y en la web instalada en
  //    Android (display-mode: standalone), con un entreno en curso.
  const IPHONE = `Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });`;
  const INSTALADA = `{ const mm = window.matchMedia.bind(window); window.matchMedia = q => /display-mode:\\s*standalone/.test(q)
    ? { matches: true, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } } : mm(q); }`;
  const ANDROID = `window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { App: { getInfo: async () => ({ build: '999', version: 'x' }),
    getLaunchUrl: async () => null, addListener: () => Promise.resolve({ remove(){} }) } } };`;
  for (const [cual, init] of [['iPhone', IPHONE], ['Android', ANDROID], ['instalada en Android', INSTALADA]]) {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: EFIMERA + ';' + init, handlers: { '/profiles': profile('client'), '/body_weights': WEIGHTS } });
    await p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), r => r.abort());
    await p.goto(base + '/app/'); await wait(3000);
    await p.evaluate(async () => { const { state } = await import('/app/core/state.js'), { save } = await import('/app/core/storage.js');
      state.wkStart = { date: '2026-10-09', day: 'd1', ts: Date.now() }; save(); localStorage.setItem('gize_salidas_track_v1', '{"s1":"x"}'); });
    t.eq((await claves(p)).marca, null, '8 ' + cual + ': no se anota la sesión para borrarla');
    await cerrarYAbrir(p);
    const c = await claves(p);
    t.ok(c.st && c.st.wkStart && c.st.weights && c.st.weights.length, '8 ' + cual + ': el entreno en curso y los datos siguen detrás del ingreso');
    t.eq(c.track, '{"s1":"x"}', '8 ' + cual + ': los recorridos también');
    t.ok(await p.isVisible('#auEmail'), '8 ' + cual + ': pide ingresar');
    t.eq(errs, [], '8 ' + cual + ': errores de la página');
    await close();
  }

  // 9) Pestaña con la sesión congelada (no contesta) y GIZE abierto en otra pestaña. En el celular,
  //    una pestaña en segundo plano no corre nada: acá se simula con que deje de recibir los
  //    mensajes de las otras pestañas (BroadcastChannel).
  {
    const CONGELABLE = `{ const BC = window.BroadcastChannel; window.BroadcastChannel = class extends BC {
      addEventListener(t, f, o){ return super.addEventListener(t, e => { if (!window.congelada) f.call(this, e); }, o); } }; }`;
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: EFIMERA + ';' + CONGELABLE, handlers: { '/profiles': profile('client'), '/body_weights': WEIGHTS } });
    await p.goto(base + '/app/'); await wait(3000);
    await p.evaluate(async () => { const { state } = await import('/app/core/state.js'), { save } = await import('/app/core/storage.js');
      state.wkStart = { date: '2026-10-09', day: 'd1', ts: Date.now() }; save(); localStorage.setItem('gize_salidas_track_v1', '{"s1":"x"}'); });
    await p.evaluate(() => { window.congelada = true; });
    // Abre GIZE en otra pestaña (sin sesión) y devuelve lo que quedó guardado.
    const abrir = async antes => { const p2 = await p.context().newPage(), e2 = [];
      p2.on('pageerror', e => e2.push(e.message));
      await p2.route(/supabase\.co/, r => r.fulfill({ status: 200, contentType: 'application/json', body: new URL(r.request().url()).pathname.includes('/rpc/') ? 'null' : '[]' }));
      if (antes) await p2.addInitScript(antes);
      await p2.goto(base + '/app/'); await wait(4000);
      const c = await claves(p2); await p2.close(); return [c, e2]; };
    let [c, e2] = await abrir();
    t.ok(c.st && c.st.wkStart && c.st.weights && c.st.weights.length, '9: el entreno en curso y los datos de la pestaña congelada siguen');
    t.eq(c.track, '{"s1":"x"}', '9: la salida de Cardio también');
    t.eq(c.marca, ALUMNO.id, '9: y la marca, para borrarlos cuando se cierre');
    t.eq(e2, [], '9: errores de la pestaña nueva');
    // La sesión no se usa hace más de 30 minutos: se borra.
    [c, e2] = await abrir(`if (!sessionStorage.getItem('vieja')) { sessionStorage.setItem('vieja', '1'); localStorage.setItem('gize_session_ephemeral_t', String(Date.now() - 31 * 60000)); }`);
    t.eq(c.st, null, '9: sin usarse hace más de 30 minutos, se borra el estado');
    t.eq(c.track, null, '9: y los recorridos');
    t.eq(c.marca, null, '9: y la marca');
    t.eq(e2, [], '9: errores de la pestaña nueva (sesión vieja)');
    t.eq(errs, [], '9: errores de la página');
    await close();
  }

  // 10) A (ALUMNO) sin «Mantener la sesión» en una pestaña y B (OTRA) con «Mantener la sesión» en otra.
  {
    const OTRA = { id: '33333333-3333-3333-3333-333333333333', email: 'otra@prueba.test', aud: 'authenticated', role: 'authenticated' };
    const SA = Object.assign(sesion(ALUMNO, 'rA'), { access_token: 'a.eyJzdWIiOiJhIn0.a' }), SB = Object.assign(sesion(OTRA, 'rB'), { access_token: 'b.eyJzdWIiOiJiIn0.b' });
    const logout = [];
    // Las dos pestañas contestan igual: la cuenta según el token, y se anota cada cierre de sesión.
    const ruta = r => { const req = r.request(), u = new URL(req.url()), b = (req.headers().authorization || '').includes('b.eyJ');
      if (u.pathname.startsWith('/auth/v1/logout')) logout.push(b ? 'B' : 'A');
      const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (u.pathname.startsWith('/auth/v1/user')) return J(b ? OTRA : ALUMNO);
      if (u.pathname.startsWith('/auth/')) return J({});
      if (u.pathname.includes('/rpc/')) return J(null);
      return req.method() === 'GET' ? J((req.headers().accept || '').includes('vnd.pgrst.object') ? null : []) : r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); };
    const { p, errs, close } = await newPage({ init: `if (!sessionStorage.getItem('b')) { sessionStorage.setItem('b', '1'); localStorage.clear();
      localStorage.setItem('${SB_KEY}', ${JSON.stringify(JSON.stringify(SB))}); localStorage.setItem('gize_remember', '1'); }` });
    await p.route(/supabase\.co/, ruta);
    await p.goto(base + '/app/'); await wait(3000);
    const p2 = await p.context().newPage(), errs2 = [];
    p2.on('pageerror', e => errs2.push(e.message));
    await p2.addInitScript(`if (!sessionStorage.getItem('a')) { sessionStorage.setItem('a', '1'); sessionStorage.setItem('${SB_KEY}', ${JSON.stringify(JSON.stringify(SA))}); }`);
    await p2.route(/supabase\.co/, ruta);
    await p2.goto(base + '/app/'); await wait(3000);
    const quien = pg => pg.evaluate(async () => { const { State } = await import('/app/core/state.js'); return State.cloudUser && State.cloudUser.email; });
    t.eq([await quien(p), await quien(p2)], ['otra@prueba.test', 'alumno@prueba.test'], '10: cada pestaña con su cuenta');
    await p2.click('#nav-config'); await wait(500);
    await p2.click('[data-auth="logout"]');
    await p2.waitForEvent('load', { timeout: 30000 }).catch(() => {});
    await wait(3000);
    const ls = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SB_KEY) || 'null');
    t.ok(ls && ls.refresh_token === 'rB' && ls.user.id === OTRA.id, '10: la sesión guardada de la otra cuenta queda: ' + JSON.stringify(ls && ls.user && ls.user.id));
    t.ok(logout.includes('A') && !logout.includes('B'), '10: se cierra solo la sesión de la que tocó «Salir»: ' + logout.join(','));
    t.ok(!(await p.evaluate(async () => { const { State } = await import('/app/core/state.js'); return State.sessionLost; })) && !(await p.isVisible('#auEmail')), '10: la pestaña de la otra cuenta sigue adentro');
    t.eq(errs2, [], '10: errores de la pestaña que salió');
    t.eq(errs, [], '10: errores de la página');
    await p2.close();
    await close();
  }
}
