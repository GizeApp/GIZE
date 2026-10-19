// Panel de administración, Usuarios: con la red lenta, la ficha de una cuenta que se cerró antes de
// que llegara su detalle NO vuelve a aparecer (su fondo tapaba la tabla y no se podía tocar otra
// fila), y la respuesta vieja de una ficha no pisa la de otra cuenta que se abrió después.
import { newPage, wait, text, ADMIN } from './lib.mjs';

const NOW = Date.now();
const D = n => new Date(NOW + n * 864e5).toISOString();
const users = [{ id: 'c1', email: 'c1@prueba.test', full_name: 'Coach Uno', role: 'coach', coach_name: null, created_at: D(-60), last_seen_at: D(-1), last_sign_in_at: D(-1), app_platform: 'web', is_admin: false },
  { id: 'a1', email: 'a1@prueba.test', full_name: 'Ana', role: 'client', coach_name: 'Coach Uno', created_at: D(-30), last_seen_at: D(-1), last_sign_in_at: D(-1), app_platform: 'web', is_admin: false }];
const detalle = uid => Object.assign({}, users.find(u => u.id === uid), { provider: 'email', sessions: 0, food_days: 0 },
  uid === 'c1' ? { clients: [{ name: 'Ana' }] } : { coach: { name: 'Coach Uno' } });
const TARDA = 1500; // el detalle de Ana llega tarde; el de Coach Uno, enseguida

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1300, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_users': (r, J) => J(users), '/admin_coaches': (r, J) => J([]),
    '/admin_user_detail': async (r, J, i) => { const uid = JSON.parse(i.body).uid; if (uid === 'a1') await wait(TARDA); return J(detalle(uid)); } } });
  await p.goto(base + '/admin/#usuarios'); await wait(1500);

  // 1) Abre la ficha de Ana y la cierra mientras dice «Cargando…».
  await p.click('tr[data-user="a1"]'); await wait(150);
  t.has(await text(p, '.drawer'), 'Cargando', 'la ficha abre con «Cargando…»');
  await p.click('.drawer [data-a="closeDrawer"]');
  await wait(TARDA + 600);
  t.eq(await p.$$eval('.drawer, .drawer-bg', e => e.length), 0, 'el detalle que llega tarde no vuelve a abrir la ficha cerrada');
  await p.click('tr[data-user="c1"]', { timeout: 3000 }); await wait(400);
  t.has(await text(p, '.drawer'), 'Coach Uno', 'la tabla sigue tocable: se abre la ficha de otra cuenta');
  await p.click('.drawer [data-a="closeDrawer"]'); await wait(200);

  // 2) Abre Ana (lenta) y enseguida Coach Uno (rápida): queda la de Coach Uno. El fondo de la ficha
  // tapa la tabla, así que el segundo clic va directo a la fila (como cuando una acción reabre otra ficha).
  await p.click('tr[data-user="a1"]'); await wait(150);
  await p.$eval('tr[data-user="c1"]', e => e.click());
  await wait(TARDA + 600);
  const ficha = await text(p, '.drawer');
  t.has(ficha, 'Coach Uno', 'queda abierta la ficha que se pidió última');
  t.ok(!/a1@prueba\.test/.test(ficha), 'la respuesta vieja de Ana no pisa la ficha de Coach Uno');
  t.eq(await p.$$eval('.drawer', e => e.length), 1, 'una sola ficha');
  t.eq(errs, [], 'errores de la página');
  await close();
}
