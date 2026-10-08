// Recuperar la contraseña con el código del mail. El link del mail solo funciona donde se
// pidió (en la web por seguridad, en la app por el PKCE) y quien lo abría desde Gmail en otro
// navegador o en la compu quedaba trabado. Ahora, después de pedir el mail, la app pide el
// código de 6 números que trae (verifyOtp type "recovery") y de ahí pasa a elegir la contraseña
// nueva, en cualquier celular o navegador. «Ya tengo un código» lleva directo a ese paso.
// El botón del mail ya no va a Supabase (que gastaba el token al abrirlo, y con él el código):
// llega como #recuperar=<token_hash> y se canjea solo donde se pidió y para esa cuenta; en
// otro lado pide el código. La contraseña nueva a medio elegir no deja entrar a la app.
import { newPage, wait, text } from './lib.mjs';

const UID = '44444444-4444-4444-4444-444444444444';
const MAIL = 'alumno@prueba.test';
const USER = { id: UID, email: MAIL, aud: 'authenticated', role: 'authenticated' };
const now = () => Math.floor(Date.now() / 1000);
const SESION = () => ({ access_token: 'x.eyJzdWIiOiJ1NCJ9.y', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: 'r', user: USER });

function sb(){
  const log = { recover: [], verify: [], update: [] };
  const handlers = {
    '/auth/v1/recover': (r, J, i) => { log.recover.push(JSON.parse(i.body || '{}')); return J({}); },
    '/auth/v1/verify': (r, J, i) => {
      const b = JSON.parse(i.body || '{}'); log.verify.push(b);
      if (b.type === 'recovery' && ((b.token === '482913' && b.email === MAIL) || b.token_hash === 'hash-ok')) return J(SESION());
      if (b.type === 'recovery' && b.token_hash === 'hash-ajeno') return J(Object.assign(SESION(), { user: Object.assign({}, USER, { email: 'otra@prueba.test' }) }));
      if (b.token === '555555') return J({ message: 'Bad gateway' }, 502);
      return J({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403);
    },
    '/auth/v1/user': (r, J, i) => { if (i.m === 'PUT') log.update.push(JSON.parse(i.body || '{}')); return J(USER); },
    '/auth/v1/logout': (r, J) => { log.logout = (log.logout || 0) + 1; return r.fulfill({ status: 204, body: '' }); },
    '/profiles': (r, J, i) => i.m === 'GET' ? J(i.one ? { id: UID, role: 'client', full_name: 'Prueba', coach_id: null } : [{ id: UID, role: 'client', full_name: 'Prueba', coach_id: null }]) : undefined,
  };
  return { log, handlers };
}
const modo = p => p.evaluate(() => { const c = document.querySelector('#authHost .auth-card'); return c ? c.getAttribute('aria-label') : null; });
const msg = p => text(p, '#authHost .auth-msg');

export default async function ({ base, t }){
  // 1) Pedir el mail → código equivocado → código bien → contraseña nueva → entra.
  {
    const s = sb();
    const { p, errs, close } = await newPage({ handlers: s.handlers });
    await p.goto(base + '/app/'); await wait(2000);
    await p.click('[data-auth="to-forgot"]'); await wait(300);
    t.eq(await modo(p), 'Recuperar contraseña', 'abre «Recuperar contraseña»');
    t.eq(await text(p, '#authHost [data-auth="do-forgot"]'), 'Mandarme el mail', 'el botón dice «Mandarme el mail»');
    await p.fill('#auEmail', MAIL);
    await p.click('[data-auth="do-forgot"]'); await wait(800);
    t.eq(s.log.recover.map(x => x.email), [MAIL], 'pide el mail de recuperación a Supabase');
    t.eq(await modo(p), 'Código del mail', 'después de pedir el mail pasa a escribir el código');
    t.has(await text(p, '#authHost .auth-note'), MAIL, 'dice a qué mail se mandó');
    t.has(await msg(p), 'Listo', 'confirma que se mandó');
    t.eq(await p.getAttribute('#auOtp', 'autocomplete'), 'one-time-code', 'el campo sugiere el código del mail (iPhone/Android)');
    t.eq(await p.getAttribute('#auOtp', 'inputmode'), 'numeric', 'y abre el teclado de números');

    // Corto: no se manda.
    await p.fill('#auOtp', '123'); await p.click('[data-auth="do-code"]'); await wait(300);
    t.has(await msg(p), '6 números', 'un código incompleto pide los 6 números');
    t.eq(s.log.verify.length, 0, 'y no se manda a Supabase');
    t.eq(await p.inputValue('#auOtp'), '123', 'lo escrito queda en el campo');

    // Equivocado.
    await p.fill('#auOtp', '111111'); await p.press('#auOtp', 'Enter'); await wait(800);
    t.eq(s.log.verify.length, 1, 'Enter manda el código');
    t.eq(s.log.verify[0] && { email: s.log.verify[0].email, token: s.log.verify[0].token, type: s.log.verify[0].type }, { email: MAIL, token: '111111', type: 'recovery' }, 'se canjea con verifyOtp tipo recovery');
    t.has(await msg(p), 'no es correcto', 'código equivocado: lo avisa');
    t.eq(await modo(p), 'Código del mail', 'y sigue en el paso del código');

    // El servidor no responde (502): no dice que el código está mal.
    await p.fill('#auOtp', '555555'); await p.click('[data-auth="do-code"]'); await wait(800);
    t.has(await msg(p), 'conexión', 'un 502 avisa de la conexión, no de un código equivocado');
    t.has(await msg(p), 'sigue sirviendo', 'y dice que el código sigue sirviendo');

    // Bien (pegado con un espacio en el medio).
    await p.fill('#auOtp', '482 913'); await p.click('[data-auth="do-code"]'); await wait(1000);
    t.eq(s.log.verify.slice(-1)[0] && s.log.verify.slice(-1)[0].token, '482913', 'el código pegado con espacio se manda sin el espacio');
    t.eq(await modo(p), 'Contraseña nueva', 'código bien: pasa a elegir la contraseña nueva');
    const marcas = await p.evaluate(() => ({ expect: localStorage.getItem('gize_auth_expect'), req: localStorage.getItem('gize_recovery_req'), pend: localStorage.getItem('gize_recovery_pending') }));
    t.eq(marcas.expect, null, 'con el código se apaga la marca de link esperado (no queda abierta 7 días)');
    t.eq(marcas.req, null, 'y la del pedido');
    t.eq(marcas.pend, USER.id, 'queda marcada la contraseña nueva pendiente');
    // Recargar en este paso no abre la app: vuelve a pedir la contraseña nueva.
    await p.reload(); await wait(2500);
    t.eq(await modo(p), 'Contraseña nueva', 'recargando a mitad de camino vuelve a pedir la contraseña nueva');

    await p.fill('#auPass', 'nueva-clave-1'); await p.click('[data-auth="do-newpass"]'); await wait(2500);
    t.eq(s.log.update.map(x => x.password), ['nueva-clave-1'], 'guarda la contraseña nueva');
    t.ok(!(await p.isVisible('#authHost .auth-card')), 'y entra a la app');
    t.eq(await p.evaluate(() => localStorage.getItem('gize_recovery_pending')), null, 'ya sin la marca de contraseña pendiente');
    t.eq(errs, [], 'sin errores en la página: ' + errs.join(' | '));
    await close();
  }

  // 2) «Ya tengo un código» desde la pantalla de recuperar (el mail ya había llegado).
  {
    const s = sb();
    const { p, close } = await newPage({ handlers: s.handlers });
    await p.goto(base + '/app/'); await wait(2000);
    await p.click('[data-auth="to-forgot"]'); await wait(300);
    await p.click('[data-auth="to-code"]'); await wait(300);
    t.eq(await modo(p), 'Código del mail', 'sin mail: pasa al código igual');
    t.ok(await p.isVisible('#auEmail'), 'y ahí pide el mail');
    await p.fill('#auOtp', '482913'); await p.click('[data-auth="do-code"]'); await wait(300);
    t.has(await msg(p), 'mail de tu cuenta', 'sin mail no manda el código');
    t.eq(s.log.verify.length, 0, 'ni lo canjea');
    await p.click('[data-auth="to-login"]'); await wait(300);
    await p.click('[data-auth="to-forgot"]'); await wait(300);
    await p.fill('#auEmail', MAIL); await p.click('[data-auth="to-code"]'); await wait(300);
    t.eq(await modo(p), 'Código del mail', 'con mail: pasa al código sin mandar otro mail');
    t.eq(s.log.recover.length, 0, 'no pide un mail nuevo');
    t.ok(!(await p.isVisible('#auEmail')), 'con el mail ya sabido no lo vuelve a pedir');
    // «Pedir un mail nuevo» vuelve con el mail escrito; «Volver a ingresar» también.
    await p.click('[data-auth="to-forgot"]'); await wait(300);
    t.eq(await p.inputValue('#auEmail'), MAIL, '«Pedir un mail nuevo» vuelve a pedir el mail con el mail ya escrito');
    await p.click('[data-auth="to-code"]'); await wait(300);
    await p.click('[data-auth="to-login"]'); await wait(300);
    t.eq(await p.inputValue('#auEmail'), MAIL, '«Volver a ingresar» trae el mail escrito');
    await close();
  }

  // 3) Link de los mails de antes (Supabase ya lo gastó) abierto en otro navegador: no entra y
  //    pide un mail nuevo (el código de ese mail tampoco sirve).
  {
    const s = sb();
    const { p, close } = await newPage({ handlers: s.handlers });
    await p.goto(base + '/app/#access_token=x.eyJzdWIiOiJ1NCJ9.y&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery'); await wait(2500);
    t.eq(await modo(p), 'Recuperar contraseña', 'el link viejo de otro navegador no abre la contraseña nueva');
    t.has(await msg(p), 'Pedí un mail nuevo', 'y pide un mail nuevo (no manda a un código ya gastado)');
    await close();
  }

  // 4) Botón nuevo del mail (#recuperar=...) en otro navegador: no se canjea (el código sigue
  //    sirviendo) y pide mail y código ahí mismo. En la compu no ofrece abrir la app.
  {
    const s = sb();
    const { p, errs, close } = await newPage({ handlers: s.handlers });
    await p.goto(base + '/app/#recuperar=hash-ok'); await wait(2500);
    t.eq(s.log.verify.length, 0, 'otro navegador: el token del botón no se canjea (así el código sigue sirviendo)');
    t.eq(await modo(p), 'Código del mail', 'pide el código');
    t.ok(await p.isVisible('#auEmail'), 'con el mail para escribir');
    t.has(await msg(p), 'todavía sirve', 'y explica que el código del mail sigue sirviendo');
    t.eq(await p.evaluate(() => location.hash), '', 'el token se saca de la URL');
    t.ok(!(await p.$('.auth-open-app')), 'en la compu no ofrece abrir la app');
    await p.fill('#auEmail', MAIL); await p.fill('#auOtp', '482913'); await p.press('#auOtp', 'Enter'); await wait(1000);
    t.eq(await modo(p), 'Contraseña nueva', 'con mail y código sigue desde ahí');
    // «Cancelar» sale sin entrar a la app.
    await p.click('[data-auth="cancel-newpass"]'); await wait(800);
    t.ok(await p.isVisible('#authHost [data-auth="to-forgot"]'), '«Cancelar» vuelve a la pantalla de ingresar');
    t.eq(await p.evaluate(() => localStorage.getItem('gize_recovery_pending')), null, 'sin la marca de pendiente');
    t.eq(await p.evaluate(() => Object.keys(localStorage).filter(k => /auth-token/.test(k)).map(k => localStorage.getItem(k)).filter(Boolean).length), 0, 'y sin la sesión de recuperación guardada');
    t.eq(errs, [], 'sin errores: ' + errs.join(' | '));
    await close();
  }

  // 5) Botón nuevo en el mismo navegador donde se pidió: se canjea y pasa a la contraseña nueva.
  //    Si el token es de otra cuenta, no se entra.
  {
    for (const [hash, esperado] of [['hash-ok', 'Contraseña nueva'], ['hash-ajeno', 'Código del mail']]) {
      const s = sb();
      const { p, close } = await newPage({ handlers: s.handlers });
      await p.goto(base + '/app/'); await wait(2000);
      await p.click('[data-auth="to-forgot"]'); await wait(300);
      await p.fill('#auEmail', MAIL); await p.click('[data-auth="do-forgot"]'); await wait(800);
      // Solo cambiar el # no recarga la página: se pasa por otra antes, como al tocar el link.
      await p.goto('about:blank'); await p.goto(base + '/app/#recuperar=' + hash); await wait(2500);
      t.eq(s.log.verify.map(x => x.token_hash), [hash], hash + ': se canjea el token del botón');
      t.eq(await modo(p), esperado, hash + ': ' + (hash === 'hash-ok' ? 'pasa a la contraseña nueva' : 'de otra cuenta: no entra y pide el código'));
      if (hash === 'hash-ajeno') {
        t.has(await msg(p), 'otra cuenta', 'avisa que el link es de otra cuenta');
        t.eq(await p.evaluate(() => Object.keys(localStorage).filter(k => /auth-token/.test(k)).map(k => localStorage.getItem(k)).filter(Boolean).length), 0, 'y no queda la sesión ajena');
      }
      await close();
    }
  }

  // 6) En el navegador del celular, con el pedido hecho en la app: ofrece abrir GIZE con el token.
  {
    const s = sb();
    const { p, close } = await newPage({ handlers: s.handlers, init: `Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });` });
    await p.goto(base + '/app/#recuperar=hash-ok'); await wait(2500);
    t.eq(await p.getAttribute('.auth-open-app', 'href'), 'gize://confirmado#recuperar=hash-ok', 'en el celular ofrece «abrir GIZE» con el mismo token');
    await close();
  }

  // 7) App (Capacitor): el botón llega por gize://confirmado#recuperar=... Con el pedido hecho
  //    en este celular se canjea; sin el pedido, pide el código.
  {
    for (const pedido of [true, false]) {
      const s = sb();
      const init = `(() => {
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
          App: { getInfo: async () => ({ version: '1.0.0', build: '1' }), addListener: () => {}, getLaunchUrl: async () => ({ url: 'gize://confirmado#recuperar=hash-ok' }) } } };
        if (${pedido} && !sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('gize_recovery_req', JSON.stringify({ t: Date.now(), email: '${MAIL}' })); }
      })();`;
      const { p, close } = await newPage({ handlers: s.handlers, init });
      await p.goto(base + '/app/'); await wait(3000);
      t.eq(await modo(p), pedido ? 'Contraseña nueva' : 'Código del mail', 'app ' + (pedido ? 'con' : 'sin') + ' el pedido hecho acá: ' + (pedido ? 'canjea el botón' : 'pide el código'));
      t.eq(s.log.verify.length, pedido ? 1 : 0, 'app: ' + (pedido ? 'un canje' : 'no gasta el token'));
      await close();
    }
  }
}
