// Panel de administración → Reportes: si quien reportó también bloqueó a la persona reportada
// (supabase/bloqueos.sql, admin_reports_blocked), el reporte lo dice con «También lo bloqueó».
// - Se pregunta por los reportes de la lista (sus ids), cada vez que se lee la lista.
// - Sin bloqueos.sql en la base, la lista se ve igual, sin la marca y sin errores.
import { newPage, wait, text, ADMIN } from './lib.mjs';

const D = h => new Date(Date.now() - h * 3600e3).toISOString();
const R1 = 'aaaa0000-0000-4000-8000-000000000001', R2 = 'aaaa0000-0000-4000-8000-000000000002';
const REPS = () => [
  { id: R1, created_at: D(2), kind: 'chat', reason: 'ofensivo', detail: 'Me insulta', status: 'nuevo', reporter_id: 'u1', reporter_name: 'Ana Alumna',
    reported_id: 'u2', reported_name: 'Coach Prueba', reported_total: 1, msg_body: 'Sos un desastre', msg_audio_secs: null, msg_at: D(3) },
  { id: R2, created_at: D(5), kind: 'grupo', reason: 'spam', detail: null, status: 'nuevo', reporter_id: 'u3', reporter_name: 'Beto',
    reported_id: 'u5', reported_name: 'Bruno Pérez', reported_total: 1, member_name: 'Bruno', member_name_now: 'Bruno', group_name: 'Los del laburo' },
];

function mock(falta){
  const pedidos = [];
  const handlers = {
    '/is_app_admin': (x, J) => J(true), '/admin_overview': (x, J) => J({ pending: 0, versions: [], users: 0 }), '/admin_contact_unread': (x, J) => J(0),
    '/admin_reports_pending': (x, J) => J(2),
    '/admin_reports_list': (x, J) => J(REPS()),
    '/admin_reports_blocked': (x, J, i) => {
      pedidos.push(JSON.parse(i.body));
      return falta ? J({ code: 'PGRST202', message: 'Could not find the function public.admin_reports_blocked(p_ids) in the schema cache' }, 404) : J([{ id: R1 }]);
    },
  };
  return { handlers, pedidos };
}

export default async function ({ base, t }){
  {
    const m = mock(false);
    const { p, errs, close } = await newPage({ user: ADMIN, handlers: m.handlers });
    await p.goto(base + '/admin/#reportes'); await wait(1800);
    t.ok(m.pedidos.length > 0 && m.pedidos.every(x => JSON.stringify(x) === JSON.stringify({ p_ids: [R1, R2] })), 'pregunta por los reportes de la lista: ' + JSON.stringify(m.pedidos));
    t.has(await text(p, `[data-rep="${R1}"] .rep-h`), 'También lo bloqueó', 'el reporte de quien además bloqueó lo dice');
    t.ok(!(await text(p, `[data-rep="${R2}"]`)).includes('bloqueó'), 'el otro no');
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390 px: la página no se corre de costado');
    t.eq(errs, [], 'errores de la página');
    await close();
  }
  {
    const m = mock(true);
    const { p, errs, close } = await newPage({ user: ADMIN, handlers: m.handlers });
    await p.goto(base + '/admin/#reportes'); await wait(1800);
    t.has(await text(p, `[data-rep="${R1}"]`), 'Sos un desastre', 'sin bloqueos.sql: la lista se ve igual');
    t.ok(!(await text(p, '#rList')).includes('bloqueó'), 'sin bloqueos.sql: sin la marca');
    t.eq(errs, [], 'errores de la página (sin bloqueos.sql)');
    await close();
  }
}
