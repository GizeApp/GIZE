// Panel de administración → Inicio: objetivos (avance y estado) y tareas (agrupadas por fecha,
// marcar como hecha, agregar) y lo que hay que atender.
import { newPage, wait, text, ADMIN } from './lib.mjs';
// Reloj fijo: 2/10/2026 al mediodía de Argentina.
const NOW = Date.parse('2026-10-02T15:00:00Z');
const D = n => new Date(NOW + n * 864e5).toISOString();
const day = n => new Date(NOW + n * 864e5).toISOString().slice(0, 10);

export default async function ({ base, t }){
  const rpcs = [];
  const goals = [
    { id: 1, metric: 'paid', target: 40, deadline: '2026-12-31', label: null, baseline: 8, started_at: D(-45), created_at: D(-45) },
    { id: 2, metric: 'users', target: 1000, deadline: '2026-12-31', label: 'Mil usuarios', baseline: 900, started_at: D(-30), created_at: D(-30) }];
  let tasks = [
    { id: 1, title: 'Llamar a Ana', due_date: day(-2), goal_id: 1, done: false, done_at: null, created_at: D(-5) },
    { id: 2, title: 'Publicar en iPhone', due_date: day(0), goal_id: null, done: false, done_at: null, created_at: D(-5) },
    { id: 3, title: 'Armar el video', due_date: day(20), goal_id: 1, done: false, done_at: null, created_at: D(-5) },
    { id: 4, title: 'Ordenar la base', due_date: null, goal_id: null, done: false, done_at: null, created_at: D(-5) },
    { id: 5, title: 'Lista de gimnasios', due_date: day(-9), goal_id: 1, done: true, done_at: D(-1), created_at: D(-9) }];
  const body = i => JSON.parse(i.body || '{}');
  const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_requests_pending': (r, J) => J(0), '/admin_coaches': (r, J) => J([]),
    '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 1200, paid: 14, overdue: 0 }),
    '/admin_goals': (r, J) => J(goals), '/admin_tasks': (r, J) => J(tasks),
    '/admin_task_done': (r, J, i) => { rpcs.push('done ' + i.body); return J(null); },
    '/admin_task_save': (r, J, i) => { const b = body(i); rpcs.push('save ' + i.body); tasks = tasks.concat([{ id: 9, title: b.p_title, due_date: b.p_due, goal_id: b.p_goal, done: false, done_at: null, created_at: D(0) }]); return J(9); },
  } });
  await p.clock.setFixedTime(NOW);
  await p.goto(base + '/admin/#resumen'); await wait(1800);

  // Objetivos
  const g = await text(p, '#hGoals');
  t.has(g, 'Coaches pagando', 'objetivo sin nombre: se llama como la métrica');
  t.has(g, 'Atrasado', '14 de 40 con el ritmo de 6 en 45 días: atrasado');
  t.has(g, 'Cumplido', '1.200 usuarios de 1.000: cumplido');
  t.has(g, '1 de 3 tareas hechas', 'la tarjeta cuenta sus tareas');

  // Para atender: las tareas vencidas o para hoy
  t.has(await text(p, '#hTodo'), 'tareas vencidas o para hoy', 'lo vencido y lo de hoy está en «Para atender»');

  // Grupos por fecha, en orden
  const ts = (await text(p, '#hTasks')).toLowerCase(); // los títulos de grupo van en mayúsculas por CSS
  const order = ['Vencidas', 'Llamar a Ana', 'Hoy', 'Publicar en iPhone', 'Más adelante', 'Armar el video', 'Sin fecha', 'Ordenar la base', 'Hechas (1)'];
  t.ok(order.map(x => x.toLowerCase()).every((x, i, o) => ts.indexOf(x) >= 0 && (i === 0 || ts.indexOf(x) > ts.indexOf(o[i - 1]))), 'tareas agrupadas por fecha: ' + ts.slice(0, 260));
  t.has(ts, 'hace 2 días', 'la vencida dice hace cuánto');

  // Marcar como hecha
  await p.click('[data-a="tDone"][data-id="2"]'); await wait(400);
  t.has(rpcs.join('\n'), '"p_id":2,"p_done":true', 'marcar como hecha llama a admin_task_done');
  t.has(await text(p, '#hTasks'), 'Hechas (2)', 'pasa a las hechas');

  // Agregar con fecha y objetivo
  await p.fill('#tNew', 'Mandar mail a coaches');
  await p.fill('#tNewDue', day(3));
  await p.selectOption('#tNewGoal', '1');
  await p.press('#tNew', 'Enter'); await wait(500);
  t.has(rpcs.join('\n'), '"p_title":"Mandar mail a coaches","p_due":"' + day(3) + '","p_goal":1', 'agregar manda título, fecha y objetivo');
  t.has((await text(p, '#hTasks')).toLowerCase(), 'próximos 7 días', 'la nueva aparece en su grupo');

  // Ficha de una tarea
  await p.click('[data-task="3"]'); await wait(300);
  t.eq(await p.inputValue('#tTitle'), 'Armar el video', 'la ficha abre la tarea tocada');
  await p.click('.drawer [data-a="closeDrawer"]');

  // Bloques fijos: resumen en el título, sin flechas para plegar, «+ Nuevo» abre el formulario
  t.has(await text(p, '#hGoalsB .blk-h'), '1 atrasado · 1 cumplido', 'resumen de objetivos en el título');
  t.has(await text(p, '#hTasksB .blk-h'), '1 vencida', 'resumen de tareas en el título');
  t.eq(await p.$$eval('#main .pnl', ds => ds.length), 0, 'Objetivos no tiene paneles plegables');
  t.ok(!(await p.isVisible('.pg-fold')), 'sin «Abrir todo / Plegar todo» en esta pantalla');
  await p.click('#hGoalsB [data-a="gNew"]'); await wait(300);
  t.ok(await p.isVisible('.drawer'), '«+ Nuevo» abre el formulario');
  await p.click('.drawer [data-a="closeDrawer"]');
  // Menú plano: lo de todos los días arriba y «Más» abajo, todo a la vista y sin plegar
  for (const k of ['resumen', 'usuarios', 'finanzas', 'seguridad', 'contacto', 'reportes', 'productos', 'avisos', 'estadisticas'])
    t.ok(await p.isVisible('[data-go="' + k + '"]'), 'el menú muestra «' + k + '» sin abrir nada');
  t.eq(await p.$$eval('.nav', ns => ns.slice(0, 4).map(n => n.dataset.go)), ['resumen', 'usuarios', 'finanzas', 'seguridad'], 'arriba van las cuatro de todos los días');
  t.eq(await text(p, '[data-go="resumen"]'), 'Objetivos', 'la primera sección se llama Objetivos');
  t.ok(!(await p.$('.nav[data-go="coaches"]')), '«Coaches y pagos» no tiene botón propio en el menú: es una pestaña de Usuarios');
  // Estadísticas: los números, los gráficos y las versiones salieron de Inicio
  t.ok(!(await p.isVisible('#hNumB')), 'Objetivos ya no trae los números');
  await p.click('[data-go="estadisticas"]'); await wait(800);
  t.ok(await p.isVisible('#hNumB') && await p.isVisible('#hChartsB') && await p.isVisible('#hVerB'), 'Estadísticas muestra números, gráficos y versiones');
  t.eq(errs, [], 'errores de la página');
  await close();
}
