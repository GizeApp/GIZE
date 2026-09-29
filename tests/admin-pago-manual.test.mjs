// Panel de administración → Coaches y pagos → ficha del coach: «Pago manual» y «Cortar ahora».
// Al elegir otro plan, «Alumnos máximos» pasa al tope de ese plan (antes se guardaba el tope
// viejo); un tope de 1000 no se lee como «1.000» (= 1); y «Cortar ahora» con la prueba gratis
// todavía vigente avisa que vuelve a la prueba.
import { newPage, wait, ADMIN } from './lib.mjs';

// Reloj fijo en el pasado (la sesión simulada vence una hora después de ahora): 1/10/2025, 10 h.
const NOW = Date.parse('2025-10-01T13:00:00Z');
const D = n => new Date(NOW + n * 864e5).toISOString();
const coaches = [
  { id: 'c1', full_name: 'En el 25', plan: 'p25', max_clients: 25, clients: 20, paid_until: D(5), trial_ends_at: D(-60) },
  { id: 'c2', full_name: 'Gimnasio grande', plan: 'p100', max_clients: 1000, clients: 300, paid_until: D(5), trial_ends_at: D(-60) },
  { id: 'c3', full_name: 'En prueba', plan: 'trial', max_clients: 10, clients: 2, paid_until: null, trial_ends_at: D(5) },
  // Pagó durante la prueba: la prueba sigue hasta el 10/10 (se guarda como las 00:00 del 11/10).
  { id: 'c4', full_name: 'Pagó en la prueba', plan: 'p25', max_clients: 25, clients: 12, paid_until: D(40), trial_ends_at: '2025-10-11T03:00:00Z' },
  { id: 'c5', full_name: 'Pagó después', plan: 'p25', max_clients: 25, clients: 12, paid_until: D(20), trial_ends_at: D(-30) },
].map(c => Object.assign({ email: c.id + '@prueba.test', mp_status: null, has_mp: false, price: 0 }, c));

export default async function ({ base, t }){
  const rpcs = [];
  const log = n => (r, J, i) => (rpcs.push(n + ' ' + i.body), J(null));
  const { p, errs, dialogs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_coaches': (r, J) => J(coaches),
    '/admin_set_paid': log('admin_set_paid'), '/admin_set_trial': log('admin_set_trial'), '/admin_clear_paid': log('admin_clear_paid'),
  } });
  await p.clock.setFixedTime(NOW);
  await p.goto(base + '/admin/#coaches'); await wait(1500);
  const ficha = async id => { if (await p.$('.drawer')) await p.click('.drawer [data-a="closeDrawer"]'); await p.click(`tr[data-coach="${id}"]`); await wait(300); };
  const last = () => rpcs[rpcs.length - 1] || '';

  // Pasa del plan de 25 al de 50: el tope sube a 50 y eso es lo que se guarda.
  await ficha('c1');
  await p.selectOption('#pmPlan', 'p50');
  t.eq(await p.inputValue('#pmMax'), '50', 'al elegir el plan de 50, «Alumnos máximos» pasa a 50');
  await p.click('[data-a="pmSave"]'); await wait(400);
  t.has(last(), 'admin_set_paid {"cid":"c1","p_plan":"p50","p_max":50,', 'guarda el plan de 50 con 50 alumnos');
  t.has(dialogs[dialogs.length - 1], '(50 alumnos)', 'el cartel de confirmación dice 50');

  // Si igual se deja un tope menor que el del plan, el cartel lo avisa.
  await ficha('c1');
  await p.selectOption('#pmPlan', 'p50'); await p.fill('#pmMax', '25');
  await p.click('[data-a="pmSave"]'); await wait(400);
  t.has(dialogs[dialogs.length - 1], 'Ojo: el Hasta 50 es para 50 alumnos', 'avisa que el tope es menor que el del plan');

  // Tope de 1000: el número va entero (antes «1.000», que el campo lee como 1).
  await ficha('c2');
  t.eq(await p.inputValue('#pmMax'), '1000', 'pago: 1000 alumnos se ve como 1000');
  t.eq(await p.inputValue('#trMax'), '1000', 'prueba: 1000 alumnos se ve como 1000');
  await p.click('[data-a="pmSave"]'); await wait(400);
  t.has(last(), '"p_plan":"p100","p_max":1000,', 'renovar el gimnasio guarda 1000 alumnos');

  // En prueba: arranca en el de 25; al elegir el de 10 el tope baja a 10.
  await ficha('c3');
  t.eq(await p.inputValue('#pmMax'), '25', 'en prueba arranca con el plan de 25');
  await p.selectOption('#pmPlan', 'p10');
  t.eq(await p.inputValue('#pmMax'), '10', 'al elegir el plan de 10, el tope pasa a 10');

  // «Cortar ahora» con la prueba vigente: vuelve a la prueba (hasta 10 alumnos) hasta el 10/10.
  await ficha('c4');
  await p.click('[data-a="pmClear"]'); await wait(400);
  const hasta = await p.evaluate(() => new Date(2025, 9, 10).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' }));
  t.has(dialogs[dialogs.length - 1], 'Vuelve a la prueba gratis (hasta 10 alumnos) hasta el ' + hasta, 'cortar con la prueba vigente avisa que vuelve a la prueba');
  t.has(last(), 'admin_clear_paid {"cid":"c4"}', 'cortar el pago');
  // Con la prueba ya vencida, queda sin plan.
  await ficha('c5');
  await p.click('[data-a="pmClear"]'); await wait(400);
  t.has(dialogs[dialogs.length - 1], 'Queda sin plan', 'cortar sin prueba vigente avisa que queda sin plan');

  t.eq(errs, [], 'errores de la página');
  await close();
}
