// Panel de administración: cobro manual (pago, prueba con calendario, "vencen pronto") y
// pedidos de productos (publicar y rechazar).
import { newPage, wait, text, ADMIN } from './lib.mjs';
// Reloj fijo, para que dé lo mismo a cualquier hora: 15/9 a las 22:30 de Argentina, que en UTC ya
// es el 16 (antes la prueba fallaba de 21 a 24 porque calculaba las fechas con la hora de la compu).
// Tiene que quedar en el pasado: la sesión simulada vence una hora después de la hora real.
const NOW = Date.parse('2026-09-16T01:30:00Z');
const D = n => new Date(NOW + n * 864e5).toISOString();

export default async function ({ base, t }){
  const rpcs = [];
  const coaches = [
    { id: 'c1', full_name: 'Ana Coach', email: 'ana@prueba.test', plan: 'trial', clients: 3, max_clients: 10, trial_ends_at: D(3), paid_until: null, mp_status: null, has_mp: false, price: 0 },
    { id: 'c2', full_name: 'Beto Coach', email: 'beto@prueba.test', plan: 'p25', clients: 12, max_clients: 25, trial_ends_at: D(-40), paid_until: D(20), mp_status: null, has_mp: false, price: 15000 }];
  const U = '11111111-1111-1111-1111-111111111111';
  const reqs = [
    { id: 1, code: '7791234567', name: 'Yogur firme frutilla', brand: 'Ser', label_path: U + '/pedido-tabla-1.jpg', front_path: null, status: 'pendiente', created_at: D(0), user_email: 'x@prueba.test', user_name: 'Beto', existing_id: null },
    { id: 2, code: null, name: 'Barra', brand: 'Nutri', label_path: U + '/pedido-tabla-2.jpg', front_path: null, status: 'pendiente', created_at: D(0), user_email: 'y@prueba.test', user_name: null, existing_id: null }];
  const log = n => (r, J, i) => (rpcs.push(n + ' ' + i.body), J(null));
  const { p, errs, dialogs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true),
    '/admin_overview': (r, J) => J({ pending: 1, versions: [], users: 0 }),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_coaches': (r, J) => J(coaches),
    '/admin_requests_pending': (r, J) => J(reqs.filter(x => x.status === 'pendiente').length),
    '/admin_requests': (r, J, i) => J(reqs.filter(x => (JSON.parse(i.body).kind === 'pendientes') === (x.status === 'pendiente'))),
    '/admin_set_paid': log('admin_set_paid'), '/admin_set_trial': log('admin_set_trial'),
    '/admin_request_publish': (r, J, i) => { rpcs.push('publish ' + i.body); reqs[0].status = 'cargado'; return J('p1'); },
    '/admin_request_reject': (r, J, i) => { rpcs.push('reject ' + i.body); reqs[1].status = 'rechazado'; return J(null); },
  } });
  p.dialogAnswer = 'La tabla no se lee';
  await p.clock.setFixedTime(NOW);

  // Coaches y pagos
  await p.goto(base + '/admin/#coaches'); await wait(2000);
  t.has(await text(p, '#cSoon'), 'Ana Coach', '"Vencen pronto" muestra la prueba que vence');
  await p.click('#cSoon [data-coach="c1"]'); await wait(400);
  t.ok(!(await p.$('#trDays')), 'ya no está "sumar días"');
  t.ok(!!(await p.$('#trUntil')) && !!(await p.$('#trMax')), 'prueba con calendario y alumnos escritos');
  // La prueba termina el 18/9 a las 22:30 (hora de Argentina): un mes desde ahí es el 18/10.
  t.eq(await p.inputValue('#pmUntil'), '2026-10-18', 'en prueba, "Pagado hasta" se cuenta desde el fin de la prueba');
  await p.fill('#trUntil', '2026-11-10'); await p.fill('#trMax', '15');
  await p.click('[data-a="trSave"]'); await wait(500);
  await p.click('tr[data-coach="c2"]'); await wait(400);
  await p.click('[data-a="pmSave"]'); await wait(500);
  t.has(rpcs.join('\n'), 'admin_set_trial {"cid":"c1","p_until":"2026-11-10","p_max":15}', 'guardar prueba');
  t.has(rpcs.join('\n'), 'admin_set_paid {"cid":"c2","p_plan":"p25","p_max":25,', 'guardar pago');

  // Productos → Pedidos
  await p.click('[data-go="productos"]'); await wait(1500);
  t.eq(await text(p, '#navPend'), '3', 'globito de Productos (1 de la base + 2 pedidos)');
  const c = '[data-req="1"] ';
  await p.fill(c + '[data-k="kcal"]', '80'); await p.fill(c + '[data-k="protein"]', '3,5'); await p.fill(c + '[data-k="carbs"]', '12'); await p.fill(c + '[data-k="fat"]', '1,5');
  await p.click(c + '[data-a="rqPublish"]'); await wait(600);
  await p.click('[data-req="2"] [data-a="rqReject"]'); await wait(600);
  t.has(rpcs.join('\n'), 'publish {"rid":1,"p_code":"7791234567","p_unit":"g","p_portion":null,"p_name":"Yogur firme frutilla","p_brand":"Ser","p_kcal":80,"p_protein":3.5,"p_carbs":12,"p_fat":1.5}', 'publicar pedido');
  t.has(rpcs.join('\n'), 'reject {"rid":2,"p_note":"La tabla no se lee"}', 'rechazar pedido con motivo');
  t.has(await text(p, '#pList'), 'No hay pedidos para cargar', 'la lista queda vacía');
  t.eq(errs, [], 'errores de la página');
  await close();
}
