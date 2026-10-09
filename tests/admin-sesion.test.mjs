// Panel de administración (gize.ar/admin) y la sesión, que es la misma que la de gize.ar/app:
// 1) Un link gize.ar/admin/#access_token=... armado con la sesión de otra cuenta no cambia la
//    sesión guardada (antes el panel la tomaba y la app quedaba adentro de esa cuenta).
// 2) Una cuenta que no es administradora no queda con la sesión abierta: se cierra y se pide
//    entrar con otra.
// 3) Entrar con Google sigue andando (ahora con PKCE: vuelve con ?code= y se canjea).
import { newPage, wait, text, ADMIN, ALUMNO } from './lib.mjs';

const SB_KEY = 'sb-wegptuzhsrwppbknqstf-auth-token';
const stored = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), SB_KEY);
const ATACANTE = { id: '99999999-9999-4999-8999-999999999999', email: 'atacante@prueba.test', aud: 'authenticated', role: 'authenticated' };
const auth = r => r.request().headers().authorization || '';

export default async function ({ base, t }){
  // 1) Link con la sesión de otra cuenta, con la cuenta administradora adentro.
  {
    const users = [];
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
      '/auth/v1/user': r => { const a = auth(r).includes('atacante'); users.push(a ? 'atacante' : 'admin'); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(a ? ATACANTE : ADMIN) }); },
      '/is_app_admin': (r, J) => J(!auth(r).includes('atacante')),
      '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }),
      '/admin_contact_unread': (r, J) => J(0),
    } });
    await p.goto(base + '/admin/#access_token=atacante.eyJzdWIiOiI5OSJ9.x&refresh_token=rA&expires_in=3600&token_type=bearer'); await wait(2500);
    const s = await stored(p);
    t.ok(s && s.user && s.user.id === ADMIN.id, '1: la sesión guardada sigue siendo la propia: ' + (s && s.user && s.user.id));
    t.ok(!users.includes('atacante'), '1: el token del link ni se prueba: ' + users.join(','));
    t.ok(!(await p.evaluate(() => location.hash)).includes('access_token'), '1: el link se saca de la dirección');
    t.ok(!/no es administradora/.test(await text(p, '#root')), '1: el panel sigue abierto con la cuenta propia');
    t.eq(errs, [], '1: errores de la página');
    await close();
  }

  // 2) Cuenta que no es administradora.
  {
    const logout = [];
    const { p, errs, close } = await newPage({ user: ALUMNO, viewport: { width: 1200, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(false),
      '/auth/v1/logout': (r, J, i) => (logout.push(i.url.search), J({})),
    } });
    await p.goto(base + '/admin/'); await wait(2500);
    const tx = await text(p, '#root');
    t.has(tx, 'no es administradora', '2: se avisa que la cuenta no es administradora');
    t.has(tx, 'alumno@prueba.test', '2: con el mail de la cuenta');
    t.eq(await stored(p), null, '2: no queda la sesión guardada');
    t.ok(logout.length >= 1 && logout.every(x => /scope=local/.test(x)), '2: se cierra solo esta sesión (no las de otros dispositivos): ' + logout.join(','));
    t.ok(await p.isVisible('#lgMail'), '2: se puede entrar con otra cuenta');
    t.eq(errs, [], '2: errores de la página');
    await close();
  }

  // 3) Entrar con Google: sale con PKCE y la vuelta (?code=) deja adentro.
  {
    const token = [];
    const { p, errs, close } = await newPage({ viewport: { width: 1200, height: 900 }, handlers: {
      '/auth/v1/authorize': r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' }),
      '/auth/v1/token': (r, J, i) => { token.push(i.url.search + ' ' + (i.body || '')); const now = Math.floor(Date.now() / 1000);
        return J({ access_token: 'x.eyJzdWIiOiJ1MyJ9.y', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user: ADMIN }); },
      '/auth/v1/user': (r, J) => J(ADMIN),
      '/is_app_admin': (r, J) => J(true),
      '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }),
      '/admin_contact_unread': (r, J) => J(0),
    } });
    await p.goto(base + '/admin/'); await wait(1500);
    await p.click('[data-a="google"]'); await wait(1500);
    const u = new URL(p.url());
    t.ok(u.pathname.endsWith('/auth/v1/authorize') && u.searchParams.get('provider') === 'google' && !!u.searchParams.get('code_challenge'), '3: va a Google con PKCE: ' + p.url().slice(0, 160));
    await p.goto(base + '/admin/?code=codigo-de-prueba'); await wait(2500);
    t.ok(token.some(x => /grant_type=pkce/.test(x) && /codigo-de-prueba/.test(x)), '3: canjea el código: ' + token.join(' | '));
    t.ok(!/code=/.test(await p.evaluate(() => location.search)), '3: el código se saca de la dirección');
    t.ok(!!(await p.$('.shell')), '3: entra al panel');
    t.eq(errs, [], '3: errores de la página');
    await close();
  }
}
