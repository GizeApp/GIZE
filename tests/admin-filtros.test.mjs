// Panel de administración → Usuarios: filtros (rol, sin coach, sin actividad, admins) y aviso de
// inactividad; Finanzas: sin gastos cargados se muestra una sola invitación y con gastos
// aparecen el punto de equilibrio y «Quién pone qué».
import { newPage, wait, text, ADMIN } from './lib.mjs';

const NOW = Date.now();
const D = n => new Date(NOW + n * 864e5).toISOString();
const user = (id, name, o) => Object.assign({ id, email: id + '@prueba.test', full_name: name, role: 'client', coach_name: null, created_at: D(-60),
  last_sign_in_at: D(-1), last_seen_at: D(-1), app_version: null, app_platform: 'web', is_admin: false }, o);
const users = [
  user('a1', 'Ana', { coach_name: 'Marcelo' }),
  user('a2', 'Beto'),                                            // sin coach
  user('a3', 'Cami', { last_seen_at: D(-20), last_sign_in_at: D(-20) }), // sin actividad
  user('a4', 'Dani', { last_seen_at: null, last_sign_in_at: null }),     // nunca entró
  user('c1', 'Coach Uno', { role: 'coach' }),
  user('d1', 'Dueño', { is_admin: true })];

export default async function ({ base, t }){
  // Usuarios
  {
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1300, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_users': (r, J) => J(users) } });
    await p.goto(base + '/admin/#usuarios'); await wait(1500);
    const rows = () => p.$$eval('#uList tbody tr', rs => rs.map(r => r.querySelector('b').textContent));
    t.eq((await rows()).length, 6, 'Todos: salen las 6 cuentas');
    const bar = await text(p, '#uFilt');
    t.has(bar, 'Alumnos 5', 'el filtro Alumnos cuenta 5 (incluye al dueño, que es alumno)');
    t.has(bar, 'Coaches 1', 'el filtro Coaches cuenta 1');
    t.has(bar, 'Alumnos sin coach 4', 'Alumnos sin coach cuenta a Beto, Cami, Dani y al dueño');
    t.has(bar, 'Sin actividad (14+ días) 2', 'Sin actividad cuenta a quien no entra hace más de 14 días y a quien nunca entró');
    await p.click('[data-a="ufilt"][data-v="coaches"]');
    t.eq(await rows(), ['Coach Uno'], 'Coaches: solo el coach');
    await p.click('[data-a="ufilt"][data-v="inactivos"]');
    t.eq((await rows()).sort(), ['Cami', 'Dani'], 'Sin actividad: Cami (20 días) y Dani (nunca)');
    t.has(await text(p, '#uList'), 'Mostrando 2 de 6', 'avisa cuántas muestra');
    t.ok(await p.$('#uList td.t-warn'), 'la última vez de quien no entra va en color de aviso');
    await p.click('[data-a="ufilt"][data-v="admins"]');
    t.eq(await rows(), ['Dueño'], 'Admins: solo el dueño');
    await p.click('[data-a="ufilt"][data-v="todos"]');
    t.eq((await rows()).length, 6, 'volver a Todos muestra todo');
    t.eq(errs, [], 'Usuarios: errores de la página');
    await close();
  }
  // Finanzas sin gastos y con gastos
  for (const conGastos of [false, true]){
    const fin = { settings: { usd_pago: 'tarjeta' }, trial: 0, todos: [], plans: [{ id: 'p25', name: 'Hasta 25', price: 24900, paid: 1 }],
      costs: conGastos ? [{ id: 'g1', name: 'Servidor', amount: 20000, currency: 'ARS', period: 'mensual', status: 'activo', paid_by: 'Lauta', next_date: null, note: null }] : [] };
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1300, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_fin': (r, J) => J(fin) } });
    await p.route(/dolarapi\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(base + '/admin/#finanzas'); await wait(1500);
    const v = sel => p.isVisible(sel);
    if (!conGastos){
      t.ok(await v('#fEmpty'), 'sin gastos: se muestra la invitación a cargarlos');
      t.ok(!(await v('#fEqB')) && !(await v('#fWhoB')), 'sin gastos: no se muestran los bloques vacíos');
      await p.click('#fEmpty [data-a="fCost"]'); await wait(300);
      t.ok(await v('.drawer'), 'la invitación abre el formulario de gasto');
    } else {
      t.ok(!(await v('#fEmpty')), 'con gastos: no hay invitación');
      t.ok(await v('#fEqB') && await v('#fWhoB'), 'con gastos: aparecen punto de equilibrio y quién pone qué');
      t.has(await text(p, '#fWho'), 'Lauta', 'quién pone qué muestra al socio');
    }
    t.eq(errs, [], 'Finanzas: errores de la página (' + (conGastos ? 'con' : 'sin') + ' gastos)');
    await close();
  }
}
