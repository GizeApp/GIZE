// «Continuar con Apple» en la app de iPhone (App Store, guía 4.8). Con Capacitor simulado y un
// SocialLogin falso: el botón aparece solo en el iPhone nativo, arriba del de Google y del mismo
// tamaño; a Apple le llega el SHA-256 del nonce y a Supabase el nonce original con provider
// "apple"; el nombre que manda Apple la primera vez se guarda si el perfil no tiene; cerrar la
// hoja de Apple no muestra error. En la web y en Android no aparece.
import crypto from 'node:crypto';
import { newPage, wait } from './lib.mjs';

const UID = '33333333-3333-3333-3333-333333333333';
// Cuenta recién creada con Apple y el mail oculto (dirección de reenvío de Apple).
const USER = { id: UID, email: 'x7k2@privaterelay.appleid.com', aud: 'authenticated', role: 'authenticated',
  app_metadata: { provider: 'apple', providers: ['apple'] }, identities: [{ provider: 'apple' }], created_at: new Date().toISOString() };

// window.Capacitor de mentira. plataforma: 'ios' | 'android'; hoja: 'ok' | 'cancel' | 'error'.
const fakeCap = (plataforma, hoja) => `(() => {
  window.__sl = [];
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => ${JSON.stringify(plataforma)}, Plugins: {
    App: { getInfo: async () => ({ version: '1.0.0', build: '1' }), addListener: () => {}, getLaunchUrl: async () => null },
    SocialLogin: {
      initialize: async o => { window.__sl.push(['initialize', o]); },
      login: async o => {
        window.__sl.push(['login', o]);
        if (${JSON.stringify(hoja)} === 'cancel') throw new Error('No se ha podido completar la operación. (com.apple.AuthenticationServices.AuthorizationError error 1001.)');
        if (${JSON.stringify(hoja)} === 'error') throw new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)');
        return { provider: 'apple', result: { idToken: 'token-de-apple', accessToken: null, profile: { user: 'u1', email: '', givenName: 'Ana', familyName: 'Pérez' } } };
      }
    }
  } };
})();`;

// Supabase simulado para el ingreso con Apple: guarda el canje del token y los cambios al perfil.
function sbApple(nombre){
  const log = { token: [], patch: [] };
  const handlers = {
    '/auth/v1/token': (r, J, i) => {
      log.token.push({ grant: i.url.searchParams.get('grant_type'), body: JSON.parse(i.body || '{}') });
      const now = Math.floor(Date.now() / 1000);
      return J({ access_token: 'x.eyJzdWIiOiJ1MyJ9.y', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user: USER });
    },
    '/auth/v1/user': (r, J) => J(USER),
    '/profiles': (r, J, i) => {
      if (i.m === 'GET') return J([{ id: UID, role: 'client', full_name: nombre, coach_id: null }]);
      if (i.m === 'PATCH') { log.patch.push({ q: i.url.search, body: JSON.parse(i.body || '{}') }); return r.fulfill({ status: 204, body: '' }); }
    },
  };
  return { log, handlers };
}

const botones = p => p.evaluate(() => {
  const box = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, w: b.width, h: b.height, txt: e.innerText.trim(), vis: b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden', dis: e.disabled }; };
  return { apple: box('#authHost [data-auth="apple"]'), google: box('#authHost [data-auth="google"]') };
});
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

export default async function ({ base, t }){
  // 1) iPhone: aparece, entra con Apple y guarda el nombre.
  {
    const sb = sbApple('');
    const { p, errs, dialogs, close } = await newPage({ init: fakeCap('ios', 'ok'), handlers: sb.handlers });
    await p.goto(base + '/app/'); await wait(2500);
    let b = await botones(p);
    t.ok(b.apple && b.apple.vis, 'iPhone: aparece «Continuar con Apple»: ' + JSON.stringify(b.apple));
    t.eq(b.apple && b.apple.txt, 'Continuar con Apple', 'iPhone: texto del botón de Apple');
    t.ok(b.apple && b.google && b.apple.top < b.google.top, 'iPhone: Apple va arriba de Google');
    t.ok(b.apple && b.google && b.apple.h >= b.google.h - 0.5 && b.apple.w >= b.google.w - 0.5, 'iPhone: Apple es al menos del tamaño de Google: ' + JSON.stringify(b));
    const estilo = await p.evaluate(() => { const e = document.querySelector('[data-auth="apple"]'); if (!e) return null; const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color, logo: !!e.querySelector('svg') }; });
    t.eq(estilo, { bg: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)', logo: true }, 'iPhone: botón blanco con logo y texto negros (pautas de Apple sobre fondo oscuro)');
    // También en "Crear cuenta".
    await p.click('[data-auth="to-signup"]'); await wait(400);
    b = await botones(p);
    t.ok(b.apple && b.apple.vis && b.apple.top < b.google.top, 'iPhone: en «Crear cuenta» también está Apple, arriba de Google');
    await p.click('[data-auth="to-login"]'); await wait(400);

    t.eq(await p.evaluate(() => document.getElementById('view').children.length), 0, 'antes de entrar no hay app dibujada');
    await p.click('[data-auth="apple"]'); await wait(3000);
    const sl = await p.evaluate(() => window.__sl);
    const ini = sl.find(x => x[0] === 'initialize'), login = sl.find(x => x[0] === 'login');
    t.ok(ini && ini[1] && ini[1].apple && !ini[1].google, 'se inicializa el proveedor Apple: ' + JSON.stringify(ini));
    t.ok(login && login[1].provider === 'apple', 'se llama a SocialLogin.login con provider apple: ' + JSON.stringify(login));
    const hashed = login && login[1].options && login[1].options.nonce;
    t.ok(/^[0-9a-f]{64}$/.test(hashed || ''), 'a Apple le llega un nonce SHA-256 en hexa: ' + hashed);
    const tok = sb.log.token[0];
    t.ok(!!tok, 'se canjea el token de Apple en Supabase');
    if (tok){
      t.eq(tok.grant, 'id_token', 'signInWithIdToken (grant_type=id_token)');
      t.eq(tok.body.provider, 'apple', 'Supabase recibe provider apple');
      t.eq(tok.body.id_token, 'token-de-apple', 'Supabase recibe el ID token de Apple');
      t.ok(tok.body.nonce && tok.body.nonce !== hashed && sha(tok.body.nonce) === hashed, 'a Supabase va el nonce crudo y su SHA-256 es el que recibió Apple');
    }
    t.eq(sb.log.patch.map(x => x.body), [{ full_name: 'Ana Pérez' }], 'el nombre que manda Apple se guarda en el perfil vacío');
    t.ok(sb.log.patch.every(x => x.q.includes('id=eq.' + UID)), 'se guarda solo en el perfil propio: ' + JSON.stringify(sb.log.patch.map(x => x.q)));
    // Entra a la app: se va el login (en una cuenta nueva, authHost pasa a mostrar la bienvenida).
    t.eq(await p.evaluate(() => ({ login: !!document.querySelector('#authHost [data-auth]'), app: !!(document.getElementById('view') && document.getElementById('view').children.length) })), { login: false, app: true }, 'después de Apple se entra a la app');
    await wait(800);
    const aviso = dialogs.find(d => /Creamos una cuenta nueva/.test(d)) || '';
    t.ok(/tu cuenta de Apple/.test(aviso) && !/privaterelay/.test(aviso), 'cuenta nueva desde «Ingresar»: avisa sin mostrar el mail de reenvío de Apple: ' + aviso);
    t.eq(errs, [], 'errores de la página (iPhone, entra con Apple)');
    await close();
  }

  // 2) Si el perfil ya tiene nombre, no se pisa.
  {
    const sb = sbApple('Nombre Viejo');
    const { p, errs, close } = await newPage({ init: fakeCap('ios', 'ok'), handlers: sb.handlers });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-auth="apple"]'); await wait(3000);
    t.ok(sb.log.token.length === 1, 'perfil con nombre: entra igual con Apple');
    t.eq(sb.log.patch, [], 'perfil con nombre: el nombre que ya tenía no se cambia');
    t.eq(errs, [], 'errores de la página (perfil con nombre)');
    await close();
  }

  // 3) Cerrar la hoja de Apple: vuelve el login sin error y el botón anda de nuevo.
  {
    const sb = sbApple('');
    const { p, errs, close } = await newPage({ init: fakeCap('ios', 'cancel'), handlers: sb.handlers });
    await p.goto(base + '/app/'); await wait(2500);
    await p.fill('#auEmail', 'ana@prueba.test');
    await p.click('[data-auth="apple"]'); await wait(1200);
    const r = await p.evaluate(() => ({ login: getComputedStyle(document.getElementById('authHost')).display !== 'none', msg: (document.querySelector('#authHost .auth-msg') || {}).innerText || '',
      dis: (document.querySelector('[data-auth="apple"]') || {}).disabled, mail: (document.getElementById('auEmail') || {}).value, intent: localStorage.getItem('gize_google_intent') }));
    t.eq(r, { login: true, msg: '', dis: false, mail: 'ana@prueba.test', intent: null }, 'cancelar Apple: sigue el login, sin cartel de error, con el mail escrito');
    t.eq(sb.log.token, [], 'cancelar Apple: no se llama a Supabase');
    t.eq(errs, [], 'errores de la página (cancelar)');
    await close();
  }

  // 4) Otro error de Apple (por ejemplo, la capacidad sin activar): se avisa.
  {
    const sb = sbApple('');
    const { p, errs, close } = await newPage({ init: fakeCap('ios', 'error'), handlers: sb.handlers });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-auth="apple"]'); await wait(1200);
    const msg = await p.evaluate(() => (document.querySelector('#authHost .auth-msg') || {}).innerText || '');
    t.ok(/No se pudo entrar con Apple/.test(msg), 'error de Apple: aparece el cartel: ' + msg);
    t.eq(sb.log.token, [], 'error de Apple: no se llama a Supabase');
    t.eq(errs, [], 'errores de la página (error de Apple)');
    await close();
  }

  // 5) Android (app nativa) y web: no hay botón de Apple; Google sigue.
  for (const [nombre, init] of [['Android', fakeCap('android', 'ok')], ['web', undefined]]){
    const { p, errs, close } = await newPage({ init });
    await p.goto(base + '/app/'); await wait(2500);
    const b = await botones(p);
    t.eq(b.apple, null, nombre + ': no aparece el botón de Apple');
    t.ok(!!b.google, nombre + ': sigue el botón de Google');
    t.eq(errs, [], 'errores de la página (' + nombre + ')');
    await close();
  }
}
