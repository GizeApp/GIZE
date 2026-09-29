// Panel de administración en el celular: «Salir» (y «Ir a la app») se ven al final de la fila de
// pestañas y cierran la sesión. Antes en pantallas chicas no había cómo salir.
import { newPage, wait, text, ADMIN } from './lib.mjs';

export default async function ({ base, t }){
  const handlers = { '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }) };
  for (const width of [390, 860, 1200]){
    const { p, errs, calls, close } = await newPage({ user: ADMIN, viewport: { width, height: 844 }, touch: width < 800, handlers });
    await p.goto(base + '/admin/#resumen'); await wait(1500);
    const salir = await p.isVisible('.side [data-a="logout"]');
    t.ok(salir, width + ' px: se ve «Salir»');
    t.ok(await p.isVisible('.side-foot a[href="../app/"]'), width + ' px: se ve «Ir a la app»');
    if (width === 390){
      t.ok(!(await p.isVisible('.side-mail')), '390 px: el mail no ocupa lugar en la fila de pestañas');
      t.eq(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '390 px: la página no se corre de costado');
      if (salir){ await p.click('.side [data-a="logout"]'); await wait(800); }
      t.ok(calls.some(c => c.includes('/auth/v1/logout')), '390 px: «Salir» cierra la sesión');
      t.has(await text(p, '#root'), 'Cerraste la sesión.', '390 px: queda en la pantalla de entrar');
    }
    t.eq(errs, [], width + ' px: errores de la página');
    await close();
  }
}
