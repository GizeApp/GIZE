// Sesión: cerrar sesión de verdad sin señal, links con tokens en la query y textos de error.
// 1) Sin señal y con el token vencido, supabase-js devolvía el error de signOut sin borrar la
//    sesión guardada: al recargar, la app volvía a entrar a la misma cuenta.
// 2) Un link gize.ar/app/?access_token=...&refresh_token=... (la librería también lee la query)
//    cambiaba de cuenta a quien ya estaba adentro: el chequeo de links solo miraba el #.
// 3) Un link con ?error_description=... ponía cualquier texto en la pantalla de ingreso.
// 4) Ingresar: los errores de Supabase, en castellano; sin confirmar, se reenvía el mail.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const SB_KEY = 'sb-wegptuzhsrwppbknqstf-auth-token';
const stored = p => p.evaluate(k => localStorage.getItem(k) || sessionStorage.getItem(k), SB_KEY);

export default async function ({ base, t }){
  // 1) Cerrar sesión sin señal con el token vencido.
  {
    const down = r => r.abort('internetdisconnected');
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', exercises: [] }], sessions: [], weights: [], daily: {} },
      init: `(() => { if (sessionStorage.getItem('vencido')) return; sessionStorage.setItem('vencido', '1');
        const k = '${SB_KEY}'; const s = JSON.parse(localStorage.getItem(k) || 'null'); if (!s) return;
        s.expires_at = Math.floor(Date.now() / 1000) - 7200; localStorage.setItem(k, JSON.stringify(s)); })()`,
      handlers: { '/auth/v1/token': down, '/auth/v1/user': down, '/auth/v1/logout': down, '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(5000);
    t.ok(await stored(p), '1: arranca adentro de la cuenta (sin señal)');
    await p.click('#nav-config'); await wait(500);
    await p.click('[data-auth="logout"]');
    await p.waitForEvent('load', { timeout: 30000 }).catch(() => {});
    await wait(4000);
    t.ok(!(await stored(p)), '1: después de cerrar sesión no queda la sesión guardada');
    t.ok(await p.isVisible('#authHost'), '1: al recargar pide ingresar (no vuelve a entrar a la cuenta)');
    t.eq(errs, [], '1: errores de la página');
    await close();
  }

  // 2) Link con los tokens de otra cuenta en la query, estando adentro.
  {
    const OTRO = { id: '99999999-9999-4999-8999-999999999999', email: 'otro@prueba.test', aud: 'authenticated', role: 'authenticated' };
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: { '/auth/v1/user': (r, J, i) => J((i.url && r.request().headers().authorization || '').includes('otro') ? OTRO : ALUMNO), '/profiles': profile('client') } });
    await p.goto(base + '/app/?access_token=otro.eyJzdWIiOiI5OSJ9.x&refresh_token=otro&expires_in=3600&token_type=bearer'); await wait(4000);
    const s = JSON.parse((await stored(p)) || 'null');
    t.ok(s && s.user && s.user.id === ALUMNO.id, '2: sigue en su cuenta (el link no la cambia): ' + (s && s.user && s.user.id));
    t.ok(!/access_token|refresh_token/.test(await p.evaluate(() => location.search)), '2: los tokens se sacan de la dirección');
    t.eq(errs, [], '2: errores de la página');
    await close();
  }

  // 3) error_description armado a mano: no aparece en la pantalla de ingreso.
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/app/?error_description=Tu+cuenta+fue+suspendida.+Escribi+al+WhatsApp+11-5555-5555'); await wait(2500);
    const tx = await text(p, '#authHost');
    t.ok(!/WhatsApp|suspendida/.test(tx), '3: el texto del link no se muestra: ' + tx.slice(0, 200));
    t.eq(errs, [], '3: errores de la página');
    await close();
  }

  // 4) Errores al ingresar.
  {
    let resent = 0, kind = 'invalid_credentials';
    const { p, errs, close } = await newPage({ handlers: {
      '/auth/v1/token': (r, J) => J(kind === 'invalid_credentials' ? { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' } : { code: 'email_not_confirmed', error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400),
      '/auth/v1/resend': (r, J) => (resent++, J({})),
    } });
    await p.goto(base + '/app/'); await wait(2500);
    const login = async () => {
      await p.fill('#auEmail', 'alguien@prueba.test'); await p.fill('#auPass', 'una-clave-larga');
      await p.click('[data-auth="do-login"]'); await wait(2500);
      return text(p, '#authHost');
    };
    let tx = await login();
    t.has(tx, 'Mail o contraseña incorrectos', '4: contraseña equivocada, en castellano');
    t.ok(!/Invalid login/.test(tx), '4: sin el texto en inglés');
    kind = 'email_not_confirmed';
    tx = await login();
    t.eq(resent, 1, '4: sin confirmar, se reenvía el mail de confirmación');
    t.has(tx, 'te reenviamos el mail de confirmación', '4: y se avisa');
    t.eq(errs, [], '4: errores de la página');
    await close();
  }
}
