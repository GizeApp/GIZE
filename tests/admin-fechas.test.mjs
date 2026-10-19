// Panel de administración → Coaches y pagos: fechas de pago y de prueba.
// La base guarda «pagado hasta el 15» como las 00:00 del 16 (hora de Argentina): el panel tiene
// que mostrar el 15 (como la app del coach), contar los días en el calendario de Argentina y
// sumar meses sin pasarse de mes (del 31/10, +1 mes es el 30/11).
// El reloj queda fijo en el pasado (2025): la sesión simulada vence una hora después de ahora.
import { newPage, wait, text, ADMIN } from './lib.mjs';

// «Pagado hasta» o «Prueba hasta» ese día, como lo guardan admin_set_paid / admin_set_trial.
const hasta = ymd => { const d = new Date(ymd + 'T03:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString(); };
const VIEJA = '2025-09-01T03:00:00Z';
const coaches = [
  { id: 'c1', full_name: 'Pago hasta el 15/10', plan: 'p25', paid_until: hasta('2025-10-15'), trial_ends_at: VIEJA },
  { id: 'c2', full_name: 'Prueba hasta el 30/9', plan: 'trial', paid_until: null, trial_ends_at: hasta('2025-09-30') },
  { id: 'c3', full_name: 'Pago hasta hoy', plan: 'p25', paid_until: hasta('2025-10-01'), trial_ends_at: VIEJA },
  { id: 'c4', full_name: 'Prueba hasta mañana', plan: 'trial', paid_until: null, trial_ends_at: hasta('2025-10-02') },
  { id: 'c5', full_name: 'Pago cortado hoy', plan: 'p25', paid_until: '2025-10-01T12:00:00Z', trial_ends_at: VIEJA },
  { id: 'c6', full_name: 'Pago hasta el 31/10', plan: 'p25', paid_until: hasta('2025-10-31'), trial_ends_at: VIEJA },
  { id: 'c7', full_name: 'Pago hasta el 31/1', plan: 'p25', paid_until: hasta('2026-01-31'), trial_ends_at: VIEJA },
].map(c => Object.assign({ email: c.id + '@prueba.test', clients: 3, max_clients: c.plan === 'trial' ? 10 : 25, mp_status: null, has_mp: false, price: 0 }, c));

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_coaches': (r, J) => J(coaches),
  } });
  const fecha = (y, m, d) => p.evaluate(([y, m, d]) => new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' }), [y, m, d]);
  const fact = l => p.evaluate(l => { const f = [...document.querySelectorAll('.drawer .fact')].find(x => x.querySelector('span').textContent === l); return f ? f.querySelector('b').textContent : ''; }, l);
  const pill = id => text(p, `#cSoon [data-coach="${id}"] .pill`);
  const soon = async (cuando) => {
    t.eq(await pill('c2'), 'Prueba vencida hace 1 día', cuando + ': la prueba que terminó ayer ya venció');
    t.eq(await pill('c3'), 'Pago vence hoy', cuando + ': el pago hasta hoy vence hoy');
    t.eq(await pill('c4'), 'Prueba vence en 1 día', cuando + ': la prueba hasta mañana vence en 1 día');
    t.eq(await pill('c5'), 'Pago venció hoy', cuando + ': el pago cortado hoy ya venció');
    t.ok(await p.$eval('#cSoon [data-coach="c5"] .pill', e => e.classList.contains('bad')), cuando + ': lo vencido va en rojo');
  };

  // 1/10 a las 10 de la mañana (hora de Argentina)
  await p.clock.setFixedTime(Date.parse('2025-10-01T13:00:00Z'));
  await p.goto(base + '/admin/#coaches'); await wait(1500);
  await soon('a la mañana');
  t.has(await text(p, 'tr[data-coach="c1"]'), 'Pagado hasta ' + await fecha(2025, 10, 15), 'la lista muestra el último día pagado');
  t.has(await text(p, 'tr[data-coach="c3"]'), 'Pagado hasta ' + await fecha(2025, 10, 1), 'pagado hasta hoy');
  t.has(await text(p, 'tr[data-coach="c4"]'), 'Prueba hasta ' + await fecha(2025, 10, 2), 'la lista muestra el último día de prueba');
  t.has(await text(p, 'tr[data-coach="c2"]'), 'Sin pagar', 'la prueba vencida queda sin pagar');

  // Ficha: los datos y el calendario dicen el mismo día
  await p.click('tr[data-coach="c4"]'); await wait(300);
  t.eq(await fact('Prueba hasta'), await fecha(2025, 10, 2), 'ficha: «Prueba hasta» es el último día');
  t.eq(await p.inputValue('#trUntil'), '2025-10-02', 'ficha: el calendario de la prueba dice el mismo día');
  t.eq(await p.inputValue('#trUntilTxt'), '02/10/2025', 'la fecha se ve con el día primero');
  t.ok(await p.isVisible('.dfield-cal'), 'botón para abrir el calendario');
  await p.click('.drawer [data-a="closeDrawer"]');
  await p.click('tr[data-coach="c1"]'); await wait(300);
  t.eq(await fact('Pago al día hasta'), await fecha(2025, 10, 15), 'ficha: «Pago al día hasta» es el último día pagado');
  await p.click('.drawer [data-a="closeDrawer"]');

  // +1 / +3 / +12 meses sin pasarse de mes
  await p.click('tr[data-coach="c6"]'); await wait(300);
  t.eq(await p.inputValue('#pmUntil'), '2025-11-30', 'del 31/10, un mes más es el 30/11');
  await p.click('[data-a="pmMeses"][data-m="3"]'); t.eq(await p.inputValue('#pmUntil'), '2026-01-31', 'del 31/10, +3 es el 31/1');
  await p.click('[data-a="pmMeses"][data-m="12"]'); t.eq(await p.inputValue('#pmUntil'), '2026-10-31', 'del 31/10, +12 es el 31/10');
  t.eq(await p.inputValue('#pmUntilTxt'), '31/10/2026', 'los botones de meses cambian también la fecha día/mes');
  await p.fill('#pmUntilTxt', '5/11/2026'); t.eq(await p.inputValue('#pmUntil'), '2026-11-05', 'escribir día/mes/año guarda esa fecha');
  await p.fill('#pmUntilTxt', '31/02/2026'); t.eq(await p.inputValue('#pmUntil'), '', 'una fecha que no existe no se toma');
  t.ok(await p.$eval('#pmUntilTxt', e => e.classList.contains('bad')), 'y se marca en rojo');
  await p.click('.drawer [data-a="closeDrawer"]');
  await p.click('tr[data-coach="c7"]'); await wait(300);
  t.eq(await p.inputValue('#pmUntil'), '2026-02-28', 'del 31/1, un mes más es el 28/2');
  await p.click('[data-a="pmMeses"][data-m="3"]'); t.eq(await p.inputValue('#pmUntil'), '2026-04-30', 'del 31/1, +3 es el 30/4');
  await p.click('.drawer [data-a="closeDrawer"]');

  // El mismo día a las 22:30 (en UTC ya es el 2/10): los días no cambian
  await p.clock.setFixedTime(Date.parse('2025-10-02T01:30:00Z'));
  await p.click('[data-go="coaches"]'); await wait(1000);
  await soon('a la noche');

  t.eq(errs, [], 'errores de la página');
  await close();
}
