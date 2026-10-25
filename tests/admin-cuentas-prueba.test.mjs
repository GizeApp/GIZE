// Panel de administración: cuentas de prueba (las propias, las demo y las de la revisión de Apple,
// supabase/cuentas-prueba.sql). En Coaches y pagos no se cuentan en el resumen («N coaches · N
// pagando · N en prueba»), van al final de la lista, en gris y con la etiqueta «Prueba», y no
// aparecen en «Vencen pronto» ni en «Para atender». En Usuarios también van al final. Desde la
// ficha de un coach o de un usuario se marcan y desmarcan con el interruptor «Cuenta de prueba».
import { newPage, wait, text, ADMIN } from './lib.mjs';

const NOW = Date.now();
const D = n => new Date(NOW + n * 864e5).toISOString();
const base = { max_clients: 10, clients: 0, mp_status: null, has_mp: false, pending_plan: null, price: 0 };
const coaches = [
  // De prueba, primera en lo que manda el servidor: la revisión de Apple, con la prueba vencida hace 1 día.
  Object.assign({}, base, { id: 'cr', email: 'cr@prueba.test', full_name: 'Coach Revisión', plan: 'trial', trial_ends_at: D(-1), paid_until: null, is_test: true }),
  Object.assign({}, base, { id: 'c1', email: 'c1@prueba.test', full_name: 'Coach Uno', plan: 'p25', max_clients: 25, clients: 3, paid_until: D(20), trial_ends_at: D(-60), price: 24900, is_test: false }),
  Object.assign({}, base, { id: 'c2', email: 'c2@prueba.test', full_name: 'Coach Dos', plan: 'trial', trial_ends_at: D(5), paid_until: null, is_test: false }),
  // Otra de prueba en prueba gratis (la demo con cortesía no cambia los totales): no suma «en prueba».
  Object.assign({}, base, { id: 'cd', email: 'cd@prueba.test', full_name: 'Coach Demo', plan: 'trial', trial_ends_at: D(3), paid_until: null, is_test: true }),
];
const users = [
  { id: 'cr', email: 'cr@prueba.test', full_name: 'Coach Revisión', role: 'coach', coach_name: null, created_at: D(-1), last_seen_at: D(-1), last_sign_in_at: D(-1), app_platform: 'ios', is_admin: false, is_test: true },
  { id: 'a1', email: 'a1@prueba.test', full_name: 'Ana', role: 'client', coach_name: 'Coach Uno', created_at: D(-30), last_seen_at: D(-1), last_sign_in_at: D(-1), app_platform: 'web', is_admin: false, is_test: false },
  { id: 'c1', email: 'c1@prueba.test', full_name: 'Coach Uno', role: 'coach', coach_name: null, created_at: D(-60), last_seen_at: D(-1), last_sign_in_at: D(-1), app_platform: 'web', is_admin: false, is_test: false },
];
const detail = id => Object.assign({}, users.find(u => u.id === id), { provider: 'email', clients: [], sessions: 0, food_days: 0 });

export default async function ({ base: url, t }){
  const calls = [];
  const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1300, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_users': (r, J) => J(JSON.parse(JSON.stringify(users))),
    '/admin_coaches': (r, J) => J(JSON.parse(JSON.stringify(coaches))), '/admin_user_detail': (r, J, i) => J(detail(JSON.parse(i.body).uid)),
    '/admin_set_test': (r, J, i) => { const b = JSON.parse(i.body); calls.push(b); coaches.concat(users).forEach(x => { if (x.id === b.uid) x.is_test = b.on_off; }); return J(null); } } });

  // Coaches y pagos.
  await p.goto(url + '/admin/#coaches'); await wait(1500);
  const sum = await text(p, '#cListB-s');
  t.has(sum, '2 coaches · 1 pagando · 1 en prueba', 'el resumen no cuenta las cuentas de prueba: ' + sum);
  t.has(sum, '2 de prueba', 'y dice cuántas de prueba hay aparte');
  t.ok(!/sin pagar/.test(sum), 'la de la revisión de Apple (prueba vencida) no suma «sin pagar»: ' + sum);
  const filas = await p.$$eval('#cList tr[data-coach]', trs => trs.map(tr => ({ id: tr.dataset.coach, test: tr.classList.contains('is-test'), txt: tr.innerText, op: getComputedStyle(tr.querySelector('td')).opacity })));
  t.eq(filas.map(f => f.id), ['c1', 'c2', 'cr', 'cd'], 'las de prueba van al final de la lista');
  t.eq(filas.map(f => f.test), [false, false, true, true], 'marcadas como de prueba');
  t.ok(filas.filter(f => f.test).every(f => /Prueba/.test(f.txt.split('\n')[0]) && Number(f.op) < 1), 'en gris y con la etiqueta «Prueba»');
  t.ok(filas.filter(f => !f.test).every(f => Number(f.op) === 1), 'las reales se ven normales');
  const soon = await text(p, '#cSoon');
  t.ok(/Coach Dos/.test(soon) && !/Coach Revisión|Coach Demo/.test(soon), '«Vencen pronto» no muestra las de prueba: ' + soon);

  // Marcar un coach real desde su ficha.
  await p.click('#cList tr[data-coach="c2"]'); await wait(400);
  const sw = '.drawer [data-a="testAcc"]';
  t.eq(await p.getAttribute(sw, 'aria-checked'), 'false', 'la ficha tiene el interruptor «Cuenta de prueba», apagado');
  t.eq(await p.getAttribute(sw, 'aria-label'), 'Cuenta de prueba', 'con su nombre');
  await p.click(sw); await wait(900);
  t.eq(calls[0], { uid: 'c2', on_off: true }, 'marca la cuenta en la base');
  t.eq(await p.getAttribute(sw, 'aria-checked'), 'true', 'el interruptor queda prendido');
  t.has(await text(p, '#cListB-s'), '1 coach · 1 pagando · 0 en prueba', 'el resumen se actualiza');
  t.eq(await p.$$eval('#cList tr[data-coach]', trs => trs.map(tr => tr.dataset.coach)), ['c1', 'cr', 'c2', 'cd'], 'y pasa al final (con las de prueba)');
  await p.click(sw); await wait(900);
  t.eq(calls[1], { uid: 'c2', on_off: false }, 'desmarcar también va a la base');
  t.has(await text(p, '#cListB-s'), '2 coaches · 1 pagando · 1 en prueba', 'vuelve a contarse');
  await p.click('.drawer [data-a="closeDrawer"]');

  // Usuarios: las de prueba al final (aunque sean las más nuevas) y con la etiqueta.
  await p.click('.tabs [data-go="usuarios"]'); await wait(1200);
  const us = await p.$$eval('#uList tr[data-user]', trs => trs.map(tr => tr.dataset.user + (tr.classList.contains('is-test') ? ':prueba' : '')));
  t.eq(us, ['a1', 'c1', 'cr:prueba'], 'Usuarios: las de prueba al final');
  t.has(await text(p, '#uList tr[data-user="cr"]'), 'Prueba', 'con la etiqueta «Prueba»');
  await p.click('#uList tr[data-user="a1"]'); await wait(500);
  t.eq(await p.getAttribute(sw, 'aria-checked'), 'false', 'la ficha de un usuario también tiene el interruptor');
  await p.click(sw); await wait(900);
  t.eq(calls[2], { uid: 'a1', on_off: true }, 'marca al usuario');
  t.eq(await p.$$eval('#uList tr[data-user]', trs => trs.map(tr => tr.dataset.user)), ['c1', 'cr', 'a1'], 'y la lista lo pasa al final');
  t.eq(errs, [], 'errores de la página');
  await close();
}
