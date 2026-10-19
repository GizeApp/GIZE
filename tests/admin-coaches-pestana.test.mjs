// Panel de administración: «Coaches y pagos» es una pestaña de Usuarios. En el menú queda marcado
// Usuarios; las dos pestañas se cambian de una a otra; y desde la ficha de un coach en Usuarios
// el botón «Plan y pagos» abre la ficha de pago. Al guardar un pago desde ahí se queda en Usuarios.
import { newPage, wait, text, ADMIN } from './lib.mjs';

const NOW = Date.now();
const D = n => new Date(NOW + n * 864e5).toISOString();
const coach = { id: 'c1', email: 'c1@prueba.test', full_name: 'Coach Uno', plan: 'p25', max_clients: 25, clients: 3, paid_until: D(5), trial_ends_at: D(-60), mp_status: null, has_mp: false, price: 24900 };
const users = [{ id: 'c1', email: 'c1@prueba.test', full_name: 'Coach Uno', role: 'coach', coach_name: null, created_at: D(-60), last_seen_at: D(-1), last_sign_in_at: D(-1), app_platform: 'web', is_admin: false },
  { id: 'a1', email: 'a1@prueba.test', full_name: 'Ana', role: 'client', coach_name: 'Coach Uno', created_at: D(-30), last_seen_at: D(-1), last_sign_in_at: D(-1), app_platform: 'web', is_admin: false }];

export default async function ({ base, t }){
  const rpcs = [];
  const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1300, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_users': (r, J) => J(users), '/admin_coaches': (r, J) => J([coach]),
    '/admin_user_detail': (r, J, i) => J(JSON.parse(i.body).uid === 'c1' ? Object.assign({}, users[0], { provider: 'email', clients: [{ name: 'Ana' }], sessions: 0, food_days: 0 }) : Object.assign({}, users[1], { provider: 'email', coach: { name: 'Coach Uno' }, sessions: 0, food_days: 0 })),
    '/admin_set_paid': (r, J, i) => (rpcs.push('admin_set_paid'), J(null)) } });
  await p.goto(base + '/admin/#usuarios'); await wait(1500);
  t.has(await text(p, '.tabs button.on'), 'Todos los usuarios', 'Usuarios abre en la pestaña «Todos los usuarios»');
  t.has(await text(p, '.nav.on'), 'Usuarios', 'el menú marca Usuarios');
  await p.click('.tabs [data-go="coaches"]'); await wait(800);
  t.has(await text(p, '.tabs button.on'), 'Coaches y pagos', 'la pestaña Coaches y pagos queda marcada');
  t.has(await text(p, '.nav.on'), 'Usuarios', 'estando en Coaches y pagos, el menú sigue marcando Usuarios');
  t.has(await text(p, '#cList'), 'Coach Uno', 'la pestaña muestra la lista de coaches');
  t.eq(await p.$$eval('#main details', ds => ds.length), 0, 'sin paneles plegables en Coaches y pagos');
  await p.click('.tabs [data-go="usuarios"]'); await wait(800);
  // Ficha de un alumno: sin «Plan y pagos». Ficha de un coach: con el botón.
  await p.click('tr[data-user="a1"]'); await wait(400);
  t.ok(!(await p.$('.drawer [data-a="toCoach"]')), 'un alumno no tiene «Plan y pagos»');
  await p.click('.drawer [data-a="closeDrawer"]');
  await p.click('tr[data-user="c1"]'); await wait(400);
  await p.click('.drawer [data-a="toCoach"]'); await wait(600);
  t.ok(await p.$('#pmSave, [data-a="pmSave"]'), '«Plan y pagos» abre la ficha de pago del coach');
  await p.click('[data-a="pmSave"]'); await wait(600);
  t.ok(rpcs.includes('admin_set_paid'), 'guarda el pago');
  t.has(await text(p, '.tabs button.on'), 'Todos los usuarios', 'después de guardar se queda en Usuarios');
  t.eq(errs, [], 'errores de la página');
  await close();
}
