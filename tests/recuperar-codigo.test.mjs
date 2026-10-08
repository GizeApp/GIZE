// Recuperar la contraseña con el código del mail. El link del mail solo funciona donde se
// pidió (en la web por seguridad, en la app por el PKCE) y quien lo abría desde Gmail en otro
// navegador o en la compu quedaba trabado. Ahora, después de pedir el mail, la app pide el
// código de 6 números que trae (verifyOtp type "recovery") y de ahí pasa a elegir la contraseña
// nueva, en cualquier celular o navegador. «Ya tengo un código» lleva directo a ese paso, y el
// link abierto donde no sirve avisa que se use el código.
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
      if (b.token === '482913' && b.email === MAIL && b.type === 'recovery') return J(SESION());
      return J({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403);
    },
    '/auth/v1/user': (r, J, i) => { if (i.m === 'PUT') log.update.push(JSON.parse(i.body || '{}')); return J(USER); },
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

    // Bien (pegado con un espacio en el medio).
    await p.fill('#auOtp', '482 913'); await p.click('[data-auth="do-code"]'); await wait(1000);
    t.eq(s.log.verify.slice(-1)[0] && s.log.verify.slice(-1)[0].token, '482913', 'el código pegado con espacio se manda sin el espacio');
    t.eq(await modo(p), 'Contraseña nueva', 'código bien: pasa a elegir la contraseña nueva');

    await p.fill('#auPass', 'nueva-clave-1'); await p.click('[data-auth="do-newpass"]'); await wait(2500);
    t.eq(s.log.update.map(x => x.password), ['nueva-clave-1'], 'guarda la contraseña nueva');
    t.ok(!(await p.isVisible('#authHost .auth-card')), 'y entra a la app');
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
    t.has(await msg(p), 'Poné primero el mail', 'sin mail: lo pide antes');
    t.eq(await modo(p), 'Recuperar contraseña', 'y no pasa al código');
    await p.fill('#auEmail', MAIL); await p.click('[data-auth="to-code"]'); await wait(300);
    t.eq(await modo(p), 'Código del mail', 'con mail: pasa al código sin mandar otro mail');
    t.eq(s.log.recover.length, 0, 'no pide un mail nuevo');
    // «No me llegó» vuelve con el mail escrito; «Volver a ingresar» también.
    await p.click('[data-auth="to-forgot"]'); await wait(300);
    t.eq(await p.inputValue('#auEmail'), MAIL, '«No me llegó» vuelve a pedir el mail con el mail ya escrito');
    await p.click('[data-auth="to-code"]'); await wait(300);
    await p.click('[data-auth="to-login"]'); await wait(300);
    t.eq(await p.inputValue('#auEmail'), MAIL, '«Volver a ingresar» trae el mail escrito');
    await close();
  }

  // 3) El link abierto en otro navegador (sin la marca de que se pidió acá): no entra y avisa
  //    que se use el código.
  {
    const s = sb();
    const { p, close } = await newPage({ handlers: s.handlers });
    await p.goto(base + '/app/#access_token=x.eyJzdWIiOiJ1NCJ9.y&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery'); await wait(2500);
    t.eq(await modo(p), 'Recuperar contraseña', 'el link de otro navegador no abre la contraseña nueva');
    t.has(await msg(p), 'Ya tengo un código', 'y explica que se use el código del mail');
    t.ok(await p.isVisible('[data-auth="to-code"]'), 'con el botón «Ya tengo un código» a mano');
    await close();
  }
}
