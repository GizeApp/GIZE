// Lo cargado sin señal no se pierde cuando la sesión no se puede renovar. Sin sesión,
// supabase-js manda los pedidos con la clave anónima: la base los rechaza por RLS (42501) y
// antes eso apartaba el pendiente como error permanente y el pie decía «Sincronizado».
// (a) Token vencido, entreno guardado sin señal y la señal vuelve durante el enfriamiento de
//     60 s de la librería: el entreno espera y sale como el usuario cuando se renueva el token.
// (b) Sesión cerrada desde otro dispositivo (el servidor rechaza la renovación): se pide
//     ingresar de nuevo sin borrar nada, y al volver a entrar se sube lo pendiente.
//     (b2) Lo mismo al abrir la app con el token todavía vigente, con un borrado pendiente.
//     (b3) Volver a entrar con el botón de Google (web): antes lo frenaba «ya hay una cuenta
//     adentro» (cloudUser sigue puesto para que la cola no deje de juntar lo que se carga).
// (c) Rescate: los entrenos que la versión anterior apartó por RLS vuelven a la cola al entrar.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const DAYS = [{ id: 'd1', name: 'Pierna', exercises: [{ id: 'e1', name: 'Sentadilla libre', sets: [{ id: 's1', kg: '100', reps: '5', done: true }] }] }];
const RLS = t => 'new row violates row-level security policy for table "' + t + '"';
const now = () => Math.floor(Date.now() / 1000);
const fresh = tok => ({ access_token: tok, token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: 'r-' + tok, user: ALUMNO });

// Base simulada con RLS, como la de verdad: sin sesión (Authorization = la clave anónima) un
// INSERT se rechaza con 42501 y un DELETE no borra nada pero tampoco da error. Con sesión
// guarda y borra las filas, y las devuelve al leer.
function fakeDb(){
  const db = { sessions: [], entries: [], anon: [], user: [] };
  const table = name => (r, J, i) => {
    const h = r.request().headers();
    if (i.m === 'GET') {
      if (name !== 'sessions') return undefined;
      return J(db.sessions.map(s => Object.assign({}, s, { session_entries: db.entries.filter(e => e.session_id === s.id) })));
    }
    const anon = h['authorization'] === 'Bearer ' + h['apikey'];
    (anon ? db.anon : db.user).push(i.m + ' ' + name);
    if (i.m === 'DELETE') {
      const id = (i.url.searchParams.get('id') || '').replace(/^eq\./, '');
      if (!anon && name === 'sessions') db.sessions = db.sessions.filter(s => s.id !== id);
      return r.fulfill({ status: 204, body: '' });
    }
    if (anon) return J({ code: '42501', message: RLS(name), details: null, hint: null }, 401);
    if (i.m === 'POST') {
      const rows = [].concat(JSON.parse(i.body || '[]'));
      if (name === 'sessions') rows.forEach(x => { if (!db.sessions.some(s => s.id === x.id)) db.sessions.push(x); });
      else rows.forEach(x => { if (!db.entries.some(e => e.id === x.id)) db.entries.push(x); });
    }
    return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  };
  return { db, handlers: { '/sessions': table('sessions'), '/session_entries': table('session_entries') } };
}

const peek = p => p.evaluate(() => {
  const q = k => JSON.parse(localStorage.getItem(k) || '[]');
  return { cola: q('core_outbox_v1').map(i => i.k), apartados: q('core_outbox_failed_v1').map(i => i.id + ' ' + i.k),
    pie: (document.getElementById('syncFoot') || {}).textContent || '', entrenos: JSON.parse(localStorage.getItem('rutina_jero_v1')).sessions.map(s => s.id),
    login: !!document.querySelector('#authHost .auth-card'), aviso: ((document.querySelector('#authHost .auth-msg') || {}).textContent || '') };
});
// Espera a que se vaya lo que la app manda al arrancar (día, preferencias: salen 1,5 s después)
// para que no se mezcle con lo que prueba cada caso. Con tiempo real: con la máquina cargada
// un wait fijo no alcanzaba.
async function settle(p, ms = 20000){
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await peek(p).catch(() => null);
    if (r && !r.cola.length && r.pie === 'Sincronizado con tu cuenta') return true;
    await wait(250);
  }
  return false;
}
// Cierra "¡Entreno terminado!". Con click() de Playwright a veces se cortaba: según qué se
// muestre último, el login le queda encima y el botón no se puede tocar.
async function skipFb(p){
  await p.waitForSelector('[data-action="fb-skip"]', { state: 'attached', timeout: 10000 }).catch(() => {});
  await p.evaluate(() => { const b = document.querySelector('[data-action="fb-skip"]'); if (b) b.click(); }); await wait(800);
}
const expire = p => p.evaluate(() => { const k = 'sb-wegptuzhsrwppbknqstf-auth-token'; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem(k, JSON.stringify(s)); });

export default async function ({ base, t }){
  // (a) Token vencido + sin señal; la señal vuelve dentro del enfriamiento.
  {
    const { db, handlers } = fakeDb();
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: DAYS, sessions: [], weights: [], daily: {} },
      handlers: Object.assign({ '/profiles': profile('client'), '/auth/v1/token': (r, J) => J(fresh('x.eyJzdWIiOiJ1MSJ9.a')) }, handlers) });
    // Sin señal: el celular lo sabe (navigator.onLine, eventos offline/online) y a Supabase no llega nada.
    let offline = false;
    const signal = async on => { offline = !on; await p.context().setOffline(!on); };
    await p.route(/supabase\.co/, r => offline ? r.abort('internetdisconnected') : r.fallback());
    await p.clock.install(); // para saltar los 30 s de reintentos y los 60 s de enfriamiento de supabase-js
    await p.goto(base + '/app/'); t.ok(await settle(p), '(a) arranca con la cola al día');
    await signal(false); await expire(p); // más de una hora sin señal: el token venció
    await p.click('[data-action="save-session"]'); await wait(1000);
    // La renovación sin señal reintenta ~30 s y se rinde: la librería guarda el fallo 60 s
    // (lastRefreshFailure) y mientras tanto no hay sesión. La señal vuelve recién ahí.
    const cooling = () => p.evaluate(async () => { const { State } = await import('/app/core/state.js'); return !!State.sb.auth.lastRefreshFailure; });
    for (let i = 0; i < 30 && !(await cooling()); i++) { await p.clock.fastForward(5000); await wait(300); }
    t.ok(await cooling(), '(a) la renovación del token falló sin señal');
    await wait(1000);
    const sin = await peek(p);
    t.eq(sin.cola, ['session'], '(a) sin señal el entreno queda pendiente');
    await signal(true); await wait(3000); // vuelve la señal (evento online) durante el enfriamiento
    const vuelve = await peek(p);
    t.eq(db.anon, [], '(a) no se manda nada como anónimo mientras la librería no tiene sesión');
    t.eq(vuelve.apartados, [], '(a) el entreno no se aparta como error');
    t.eq(vuelve.cola, ['session'], '(a) el entreno sigue en la cola hasta que haya sesión');
    t.ok(!/Sincronizado/.test(vuelve.pie), '(a) el pie no dice «Sincronizado» con el entreno sin subir: ' + vuelve.pie);
    await p.clock.fastForward(66000); await wait(4000); // pasa el enfriamiento: se renueva el token y sale solo
    const fin = await peek(p);
    t.eq(db.sessions.map(s => s.id), fin.entrenos, '(a) el entreno llega a la cuenta, mandado con la sesión del usuario');
    t.ok(db.entries.length === 1 && db.user.includes('POST sessions'), '(a) llegan el entreno y su serie: ' + JSON.stringify(db.user));
    t.eq([fin.cola, fin.apartados, fin.pie], [[], [], 'Sincronizado con tu cuenta'], '(a) cola vacía y pie al día');
    t.eq(errs, [], '(a) sin errores de JavaScript');
    await close();
  }

  // (b) Sesión revocada: el servidor rechaza la renovación.
  {
    const { db, handlers } = fakeDb();
    let revoked = false;
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: DAYS, sessions: [], weights: [], daily: {} },
      handlers: Object.assign({ '/profiles': profile('client'), '/auth/v1/token': (r, J, i) => {
        if (i.url.searchParams.get('grant_type') === 'password') return J(fresh('x.eyJzdWIiOiJ1MSJ9.b'));
        return revoked ? J({ code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400) : J(fresh('x.eyJzdWIiOiJ1MSJ9.c'));
      } }, handlers) });
    await p.goto(base + '/app/'); t.ok(await settle(p), '(b) arranca con la cola al día');
    await wait(4500); // touchMe (4 s después de entrar) pediría la sesión y adelantaría el login antes de guardar
    revoked = true; await expire(p); // cerró sesión en la compu y el token del celular venció
    await p.click('[data-action="save-session"]'); await wait(4000);
    await skipFb(p); // "¡Entreno terminado!" queda arriba del login
    const r = await peek(p);
    t.eq(db.anon, [], '(b) con la sesión revocada no se manda nada como anónimo');
    t.eq([r.cola, r.apartados], [['session'], []], '(b) el entreno queda en la cola, no se aparta');
    t.ok(r.login && /sesión se cerró/.test(r.aviso), '(b) se pide ingresar de nuevo con un aviso claro: ' + JSON.stringify(r.aviso));
    t.ok(!/Sincronizado/.test(r.pie), '(b) el pie no dice «Sincronizado»: ' + r.pie);
    t.eq(r.entrenos.length, 1, '(b) el entreno sigue en el celular');
    if (r.login) { // vuelve a entrar con la misma cuenta
      t.eq(await p.inputValue('#auEmail'), ALUMNO.email, '(b) el mail de la cuenta ya viene puesto');
      revoked = false;
      await p.fill('#auPass', 'secreta'); await p.click('[data-auth="do-login"]'); await wait(4000);
      const d = await peek(p);
      t.ok(!d.login, '(b) vuelve a entrar');
      t.eq(db.sessions.map(s => s.id), r.entrenos, '(b) al volver a entrar se sube el entreno pendiente');
      t.eq([d.cola, d.apartados, d.pie, d.entrenos], [[], [], 'Sincronizado con tu cuenta', r.entrenos], '(b) cola vacía, pie al día y el entreno en el celular');
    }
    t.eq(errs, [], '(b) sin errores de JavaScript');
    await close();
  }

  // (b2) Lo mismo, pero se abre la app con el token todavía vigente: el servidor dice que la
  // sesión ya no existe (getUser) y la librería la borra. Antes seguía cargando sin sesión.
  // Quedaron pendientes un entreno y el borrado de otro (hecho sin señal).
  {
    const { db, handlers } = fakeDb();
    let revoked = true;
    const SID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', OLD = '12121212-1212-4121-8121-121212121212', ts = Date.now() - 3600000;
    db.sessions.push({ id: OLD, client_id: ALUMNO.id, performed_on: '2026-09-01', day_name: 'Pierna', created_at: '2026-09-01T12:00:00Z' });
    const pend = [{ id: 'q1', uid: ALUMNO.id, k: 'session', key: null, ts, p: { id: SID, date: '2026-09-28', day: 'Pierna', ts, dur: 0,
      exercises: [{ name: 'Sentadilla libre', sets: [{ kg: '100', reps: '5' }] }], entries: [{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Sentadilla libre', order: 0, kg: '100', reps: '5', secs: 0 }] } },
      { id: 'q2', uid: ALUMNO.id, k: 'sessionDelete', key: OLD, ts, p: { id: OLD } }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: DAYS, sessions: [{ id: SID, cloudId: SID, date: '2026-09-28', ts, day: 'Pierna', exercises: pend[0].p.exercises }], weights: [], daily: {} },
      handlers: Object.assign({ '/profiles': profile('client'),
        '/auth/v1/user': (r, J) => revoked ? J({ code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' }, 403) : undefined,
        '/auth/v1/token': (r, J) => J(fresh('x.eyJzdWIiOiJ1MSJ9.d')) }, handlers),
      init: 'if(!sessionStorage.getItem("init-cola")){ sessionStorage.setItem("init-cola","1"); localStorage.setItem("core_outbox_v1", ' + JSON.stringify(JSON.stringify(pend)) + '); }' });
    await p.goto(base + '/app/'); await wait(3500);
    const r = await peek(p);
    t.ok(r.login && /sesión se cerró/.test(r.aviso), '(b2) al abrir se pide ingresar de nuevo con un aviso claro: ' + JSON.stringify(r.aviso));
    // Al arrancar, el aviso SIGNED_IN de la librería vacía la cola y puede ganarle a getUser:
    // con el JWT todavía válido lo que sale va como el usuario y se guarda (está bien). Lo que
    // salga como anónimo (la librería borró la sesión en el medio) se rechaza y se queda en la
    // cola. Cada pendiente, entonces: o sigue en la cola o quedó hecho en la cuenta.
    const subido = db.sessions.some(s => s.id === SID), borrado = !db.sessions.some(s => s.id === OLD);
    t.eq([r.cola.includes('session') || subido, r.cola.includes('sessionDelete') || borrado, r.apartados],
      [true, true, []], '(b2) el entreno y el borrado siguen pendientes o ya están hechos en la cuenta, nada apartado: ' + JSON.stringify([r.cola, subido, borrado]));
    t.ok(!db.anon.includes('DELETE sessions'), '(b2) el borrado no se da por hecho mandándolo como anónimo: ' + JSON.stringify(db.anon));
    if (r.login) {
      revoked = false;
      await p.fill('#auPass', 'secreta'); await p.click('[data-auth="do-login"]'); await wait(4000);
      const d = await peek(p);
      t.eq([db.sessions.map(s => s.id), db.entries.length, d.cola, d.login], [[SID], 1, [], false], '(b2) al volver a entrar se sube el entreno y se borra el otro');
    }
    t.eq(errs, [], '(b2) sin errores de JavaScript');
    await close();
  }

  // (b3) Sesión revocada y se vuelve a entrar con el botón de Google de la web (simulado: el
  // callback que la app le da a google.accounts.id.initialize).
  {
    const { db, handlers } = fakeDb();
    let revoked = false; const grants = [];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: DAYS, sessions: [], weights: [], daily: {} },
      init: 'window.google={accounts:{id:{initialize(o){window.__gisCb=o.callback;},renderButton(){},prompt(){}}}};',
      handlers: Object.assign({ '/profiles': profile('client'), '/auth/v1/token': (r, J, i) => {
        const g = i.url.searchParams.get('grant_type'); grants.push(g);
        if (g === 'id_token') return J(fresh('x.eyJzdWIiOiJ1MSJ9.e'));
        return revoked ? J({ code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400) : J(fresh('x.eyJzdWIiOiJ1MSJ9.f'));
      } }, handlers) });
    await p.goto(base + '/app/'); t.ok(await settle(p), '(b3) arranca con la cola al día');
    await wait(4500); // lo mismo que en (b): que touchMe ya haya pasado
    revoked = true; await expire(p);
    await p.click('[data-action="save-session"]'); await wait(4000);
    await skipFb(p);
    const r = await peek(p);
    t.ok(r.login && /sesión se cerró/.test(r.aviso), '(b3) se pide ingresar de nuevo: ' + JSON.stringify(r.aviso));
    t.eq(await p.evaluate(() => typeof window.__gisCb), 'function', '(b3) el botón de Google está listo');
    revoked = false;
    await p.evaluate(() => window.__gisCb({ credential: 'google-id-token' })); await wait(4000);
    const d = await peek(p);
    t.ok(grants.includes('id_token'), '(b3) tocar Google intenta entrar: ' + JSON.stringify(grants));
    t.eq([d.login, db.sessions.map(s => s.id), d.cola, d.apartados, d.pie], [false, r.entrenos, [], [], 'Sincronizado con tu cuenta'], '(b3) entra con Google y se sube el entreno pendiente');
    t.eq(db.anon, [], '(b3) nada como anónimo');
    t.eq(errs, [], '(b3) sin errores de JavaScript');
    await close();
  }

  // (c) Rescate de lo que la versión anterior apartó por RLS.
  {
    const { db, handlers } = fakeDb();
    const SID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ts = Date.parse('2026-09-20T12:00:00Z');
    const ses = (id, uid, sid, error) => ({ id, uid, k: 'session', key: null, ts, error,
      p: { id: sid, date: '2026-09-20', day: 'Pierna', ts, dur: 0, exercises: [{ name: 'Sentadilla libre', sets: [{ kg: '100', reps: '5' }] }],
        entries: [{ id: sid.replace(/^a{8}/, 'bbbbbbbb'), name: 'Sentadilla libre', order: 0, kg: '100', reps: '5', secs: 0 }] } });
    const failed = [
      ses('f1', ALUMNO.id, SID, RLS('sessions')),
      { id: 'f2', uid: ALUMNO.id, k: 'daily', key: '2026-09-20', ts, error: RLS('daily_logs'), p: { dt: '2026-09-20', rec: { comment: 'x' } } },
      ses('f3', '99999999-9999-4999-8999-999999999999', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', RLS('sessions')),
      ses('f4', ALUMNO.id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'value too long for type character varying(80)')];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: DAYS, sessions: [], weights: [], daily: {} },
      handlers: Object.assign({ '/profiles': profile('client') }, handlers),
      init: 'if(!sessionStorage.getItem("init-apartados")){ sessionStorage.setItem("init-apartados","1"); localStorage.setItem("core_outbox_failed_v1", ' + JSON.stringify(JSON.stringify(failed)) + '); }' });
    await p.goto(base + '/app/'); await wait(3500);
    const c = await peek(p);
    t.eq(db.sessions.map(s => s.id), [SID], '(c) el entreno apartado por RLS se sube al entrar');
    t.eq(db.anon, [], '(c) se sube con la sesión del usuario');
    t.eq(c.apartados, ['f2 daily', 'f3 session', 'f4 session'], '(c) quedan apartados lo de otra cuenta, el registro (podría pisar uno más nuevo) y el rechazo que no fue por RLS');
    t.eq([c.cola, c.entrenos], [[], [SID]], '(c) cola vacía y el entreno de vuelta en el celular');
    t.eq(errs, [], '(c) sin errores de JavaScript');
    await close();
  }
}
