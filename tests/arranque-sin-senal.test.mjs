// Abrir la app sin señal con el token vencido (alcanza con no haberla abierto en la última
// hora). supabase-js intenta renovarlo ~30 s y getSession() devuelve session:null aunque la
// sesión sigue guardada: antes quedaba la pantalla vacía y después «Ingresar» sin decir nada
// de la conexión, y nada volvía a entrar solo cuando volvía la señal.
// (a) Con la sesión guardada: la app abre en pocos segundos con la rutina local y el aviso de
//     sin conexión. Nada sale como anónimo. Vuelve la señal: se renueva el token, llega lo de
//     la nube y se sube el entreno cargado sin señal, sin reabrir la app.
// (b) Sin sesión guardada y sin señal: «Ingresar» dice que no hay conexión.
// (c) Sesión guardada que el servidor ya no acepta: «Ingresar» dice que la sesión se cerró.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const DAYS = [{ id: 'd1', name: 'Pierna', exercises: [{ id: 'e1', name: 'Sentadilla libre', sets: [{ id: 's1', kg: '100', reps: '5', done: true }] }] }];
const now = () => Math.floor(Date.now() / 1000);
// Token vencido hace dos horas (el init de newPage lo guarda vigente).
const expired = () => { if (sessionStorage.getItem('init2')) return; sessionStorage.setItem('init2', '1'); const k = 'sb-wegptuzhsrwppbknqstf-auth-token'; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 7200; localStorage.setItem(k, JSON.stringify(s)); };

const look = p => p.evaluate(() => {
  const ah = document.getElementById('authHost');
  return { login: !!document.querySelector('#authHost .auth-card') && !!ah && ah.style.display !== 'none',
    aviso: ((document.querySelector('#authHost .auth-msg') || {}).textContent || ''),
    vista: ((document.getElementById('view') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
    pie: (document.getElementById('syncFoot') || {}).textContent || '',
    cola: JSON.parse(localStorage.getItem('core_outbox_v1') || '[]').map(i => i.k),
    entrenos: (JSON.parse(localStorage.getItem('rutina_jero_v1')) || { sessions: [] }).sessions.map(s => s.id) };
});
async function until(p, cond, ms){
  const end = Date.now() + ms; let r;
  while (Date.now() < end) { r = await look(p).catch(() => null); if (r && cond(r)) return r; await wait(250); }
  return r;
}

export default async function ({ base, t }){
  // (a) Sesión guardada, token vencido, sin señal.
  {
    const nube = { id: 'nube-1', client_id: ALUMNO.id, created_at: new Date(Date.now() - 86400000).toISOString(), session_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), day_name: 'Pierna', session_entries: [] };
    const db = { sessions: [nube], entries: [] };
    let refreshed = 0;
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: DAYS, sessions: [], weights: [], daily: {} }, init: expired,
      handlers: {
        '/profiles': profile('client'),
        '/auth/v1/token': (r, J) => { refreshed++; return J({ access_token: 'x.eyJzdWIiOiJ1MSJ9.nuevo', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: 'r2', user: ALUMNO }); },
        '/sessions': (r, J, i) => { if (i.m === 'GET') return J(db.sessions.map(s => Object.assign({}, s, { session_entries: db.entries.filter(e => e.session_id === s.id) })));
          if (i.m === 'POST') [].concat(JSON.parse(i.body || '[]')).forEach(x => { if (!db.sessions.some(s => s.id === x.id)) db.sessions.push(x); }); },
        '/session_entries': (r, J, i) => { if (i.m === 'POST') [].concat(JSON.parse(i.body || '[]')).forEach(x => db.entries.push(x)); }
      } });
    // Todo pedido a Supabase se anota (¿salió como el usuario o como anónimo?) y, sin señal, se corta.
    let offline = true; const anon = [];
    await p.route(/supabase\.co/, r => {
      const h = r.request().headers(), u = new URL(r.request().url());
      if (!u.pathname.startsWith('/auth/') && h['authorization'] === 'Bearer ' + h['apikey']) anon.push(r.request().method() + ' ' + u.pathname);
      return offline ? r.abort('internetdisconnected') : r.fallback();
    });
    const t0 = Date.now();
    await p.goto(base + '/app/');
    const abre = await until(p, r => /Pierna/.test(r.vista) && /Sin conexión/.test(r.pie), 8000);
    const seg = (Date.now() - t0) / 1000;
    t.ok(abre && !abre.login && /Pierna/.test(abre.vista), '(a) sin señal abre la app con la rutina local, no «Ingresar»: ' + JSON.stringify(abre));
    t.ok(seg < 8, '(a) abre en pocos segundos: ' + seg.toFixed(1) + ' s');
    t.has(abre && abre.pie, 'Sin conexión', '(a) el pie avisa que no hay conexión');
    // Se carga un entreno sin señal: queda en la cola.
    await p.click('[data-action="save-session"]').catch(() => {});
    await p.waitForSelector('[data-action="fb-skip"]', { state: 'attached', timeout: 5000 }).catch(() => {});
    await p.evaluate(() => { const b = document.querySelector('[data-action="fb-skip"]'); if (b) b.click(); });
    const sin = await until(p, r => r.cola.includes('session'), 5000);
    t.ok(sin && sin.cola.includes('session'), '(a) el entreno sin señal queda pendiente: ' + JSON.stringify(sin && sin.cola));
    const local = sin ? sin.entrenos.filter(id => id !== 'nube-1') : [];
    // Vuelve la señal (sin reabrir la app).
    offline = false;
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    const fin = await until(p, r => r.entrenos.includes('nube-1') && !r.cola.length && r.pie === 'Sincronizado con tu cuenta', 45000);
    t.ok(refreshed > 0, '(a) al volver la señal se renueva el token');
    t.ok(fin && fin.entrenos.includes('nube-1'), '(a) llega lo de la nube sin reabrir: ' + JSON.stringify(fin && fin.entrenos));
    t.ok(local.length === 1 && db.sessions.some(s => s.id === local[0]) && db.entries.length === 1, '(a) se sube el entreno cargado sin señal: ' + JSON.stringify(db.sessions.map(s => s.id)));
    t.eq(fin && [fin.cola, fin.pie], [[], 'Sincronizado con tu cuenta'], '(a) cola vacía y pie al día');
    t.eq(anon, [], '(a) nada se lee ni se manda como anónimo');
    t.eq(errs, [], '(a) sin errores de JavaScript');
    await close();
  }

  // (b) Sin sesión guardada y sin señal.
  {
    const { p, errs, close } = await newPage({ init: () => { Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true }); } });
    await p.route(/supabase\.co/, r => r.abort('internetdisconnected'));
    await p.goto(base + '/app/');
    const r = await until(p, x => x.login, 10000);
    t.ok(r && r.login, '(b) sin sesión muestra «Ingresar»');
    t.has(r && r.aviso, 'No hay conexión', '(b) «Ingresar» dice que no hay conexión');
    t.eq(errs, [], '(b) sin errores de JavaScript');
    await close();
  }

  // (c) Sesión guardada con el token vencido que el servidor rechaza (se cerró desde otro lado).
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: DAYS, sessions: [], weights: [], daily: {} }, init: expired,
      handlers: { '/auth/v1/token': (r, J) => J({ code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400) } });
    await p.goto(base + '/app/');
    const r = await until(p, x => x.login && x.aviso, 10000);
    t.ok(r && r.login, '(c) pide ingresar');
    t.has(r && r.aviso, 'Tu sesión se cerró', '(c) con el mensaje de sesión cerrada');
    t.eq((await p.evaluate(() => JSON.parse(localStorage.getItem('rutina_jero_v1')).days.map(d => d.name))), ['Pierna'], '(c) los datos del celular siguen');
    t.eq(errs, [], '(c) sin errores de JavaScript');
    await close();
  }
}
