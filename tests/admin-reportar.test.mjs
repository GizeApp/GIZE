// Panel de administración → Reportes: lo que la gente reporta desde la app (chat con el coach y
// grupos de pasos, supabase/reportes.sql). Apple y Google piden revisarlo rápido.
// - El número de reportes sin revisar en el menú y en «Para atender» de Inicio (lleva a Reportes).
// - Cada reporte con lo justo para decidir: del chat, el texto y la fecha del mensaje; de un audio,
//   solo cuánto dura (el audio nunca); de un grupo, el nombre reportado, el de ahora y el grupo.
// - «Marcar revisado» llama a admin_report_review y lo saca de la lista; «Revisados» muestra quién.
// - «Ver cuenta» abre la ficha de la cuenta reportada (para actuar).
// - Sin supabase/reportes.sql en la base: lo dice, sin errores.
import { newPage, wait, text, ADMIN } from './lib.mjs';

const D = h => new Date(Date.now() - h * 3600e3).toISOString();
const U2 = '22220000-0000-4000-8000-000000000002';
const NUEVOS = () => [
  { id: 'aaaa0000-0000-4000-8000-000000000001', created_at: D(2), kind: 'chat', reason: 'ofensivo', detail: 'Me insulta', status: 'nuevo', reviewed_at: null, reviewed_by_name: null,
    reporter_id: 'u1', reporter_name: 'Ana Alumna', reported_id: U2, reported_name: 'Coach Prueba', reported_total: 3,
    msg_body: 'Sos un desastre', msg_audio_secs: null, msg_at: D(3), member_name: null, member_name_now: null, group_name: null },
  { id: 'aaaa0000-0000-4000-8000-000000000002', created_at: D(5), kind: 'chat', reason: 'spam', detail: null, status: 'nuevo', reviewed_at: null, reviewed_by_name: null,
    reporter_id: 'u3', reporter_name: 'Coach Dos', reported_id: 'u4', reported_name: 'Beto Alumno', reported_total: 1,
    msg_body: '', msg_audio_secs: 75, msg_at: D(6), member_name: null, member_name_now: null, group_name: null },
  { id: 'aaaa0000-0000-4000-8000-000000000003', created_at: D(20), kind: 'grupo', reason: 'otro', detail: 'El apodo es un insulto', status: 'nuevo', reviewed_at: null, reviewed_by_name: null,
    reporter_id: null, reporter_name: null, reported_id: 'u5', reported_name: 'Bruno Pérez', reported_total: 1,
    msg_body: null, msg_audio_secs: null, msg_at: null, member_name: 'Apodo feo', member_name_now: 'Bruno', group_name: 'Los del laburo' },
  { id: 'aaaa0000-0000-4000-8000-000000000004', created_at: D(30), kind: 'grupo', reason: 'ofensivo', detail: null, status: 'nuevo', reviewed_at: null, reviewed_by_name: null,
    reporter_id: 'u1', reporter_name: 'Ana Alumna', reported_id: 'u6', reported_name: 'Caro', reported_total: 1,
    msg_body: null, msg_audio_secs: null, msg_at: null, member_name: 'Otro apodo', member_name_now: null, group_name: 'Los del barrio' },
];

function mock(falta){
  const rpcs = [], db = NUEVOS();
  const handlers = {
    '/is_app_admin': (x, J) => J(true), '/admin_overview': (x, J) => J({ pending: 0, versions: [], users: 0 }), '/admin_contact_unread': (x, J) => J(0),
    '/admin_reports_pending': (x, J) => falta ? J({ code: 'PGRST202', message: 'Could not find the function public.admin_reports_pending without parameters in the schema cache' }, 404) : J(db.filter(r => r.status === 'nuevo').length),
    '/admin_reports_list': (x, J, i) => {
      rpcs.push('list ' + i.body);
      if (falta) return J({ code: 'PGRST202', message: 'Could not find the function public.admin_reports_list(p_status) in the schema cache' }, 404);
      return J(db.filter(r => r.status === JSON.parse(i.body).p_status));
    },
    '/admin_report_review': (x, J, i) => { rpcs.push('review ' + i.body); const r = db.find(r => r.id === JSON.parse(i.body).p_id); Object.assign(r, { status: 'revisado', reviewed_at: D(0), reviewed_by_name: 'Admin Prueba' }); return J(null); },
    '/admin_user_detail': (x, J, i) => { rpcs.push('user ' + i.body); return J({ id: U2, email: 'coach@prueba.test', full_name: 'Coach Prueba', role: 'coach', clients: [] }); },
  };
  return { handlers, rpcs };
}

export default async function ({ base, t }){
  // 1) Inicio: «Para atender» y el número en el menú.
  {
    const m = mock();
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: m.handlers });
    await p.goto(base + '/admin/#resumen'); await wait(1800);
    t.has(await text(p, '#hTodo'), '4 reportes sin revisar', 'Inicio → Para atender: los reportes sin revisar');
    t.eq(await text(p, '#navRep'), '4', 'el número en el menú (Reportes)');
    await p.click('#hTodo [data-go="reportes"]'); await wait(1500);
    t.eq(await text(p, '.h1'), 'Reportes', '«Para atender» lleva a Reportes');
    t.eq(errs, [], 'errores de la página (Inicio)');
    await close();
  }
  // 2) Reportes en el celular: el contexto de cada uno, revisar y ver la cuenta.
  {
    const m = mock();
    const { p, errs, close } = await newPage({ user: ADMIN, handlers: m.handlers });
    await p.goto(base + '/admin/#reportes'); await wait(1800);
    t.ok(m.rpcs.includes('list {"p_status":"nuevo"}'), 'pide los sin revisar: ' + m.rpcs.join(' | '));
    const c = id => `[data-rep="aaaa0000-0000-4000-8000-00000000000${id}"]`;
    const r1 = await text(p, c(1)), r2 = await text(p, c(2)), r3 = await text(p, c(3)), r4 = await text(p, c(4));
    t.has(r1, 'Ofensivo o acoso', 'chat: el motivo');
    t.has(r1, 'Sos un desastre', 'chat: el texto del mensaje');
    t.has(r1, 'Mensaje del ', 'chat: la fecha del mensaje');
    t.has(r1, 'Me insulta', 'chat: la nota de quien reportó');
    t.has(r1, 'Reportó Ana Alumna', 'chat: quién reportó');
    t.has(r1, 'Reportado: Coach Prueba', 'chat: a quién');
    t.has(r1, '3 reportes en total', 'chat: cuántos reportes tiene esa cuenta');
    t.has(r2, 'Mensaje de voz de 1:15', 'audio: cuánto dura');
    t.eq(await p.$$eval('#rList audio, #rList [src*="audio"], #rList a[href*="audio"]', l => l.length), 0, 'audio: nunca el archivo');
    t.has(r3, '«Apodo feo»', 'grupo: el nombre reportado');
    t.has(r3, 'ahora se llama «Bruno»', 'grupo: el nombre de ahora, si cambió');
    t.has(r3, 'Grupo «Los del laburo»', 'grupo: el nombre del grupo');
    t.has(r3, 'Reportó una cuenta borrada', 'quien reportó ya no tiene cuenta');
    t.has(r4, 'ya no está en el grupo', 'grupo: si ya no está, se dice');
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390 px: la página no se corre de costado');

    await p.click(c(1) + ' [data-a="repReview"]'); await wait(600);
    t.ok(m.rpcs.includes('review {"p_id":"aaaa0000-0000-4000-8000-000000000001"}'), 'Marcar revisado llama a admin_report_review: ' + m.rpcs.join(' | '));
    t.ok(!(await p.$(c(1))), 'el revisado sale de la lista');
    t.eq(await text(p, '#navRep'), '3', 'el número del menú baja');

    await p.click(c(2) + ' [data-a="repUser"]'); await wait(600);
    t.ok(m.rpcs.includes('user {"uid":"u4"}'), '«Ver cuenta» abre la ficha de la cuenta reportada: ' + m.rpcs.join(' | '));
    t.ok(await p.isVisible('.drawer'), 'se ve la ficha');
    await p.click('.drawer [data-a="closeDrawer"]'); await wait(300);

    await p.click('[data-a="rtab"][data-v="revisado"]'); await wait(1000);
    t.ok(m.rpcs.includes('list {"p_status":"revisado"}'), 'Revisados pide los revisados');
    t.has(await text(p, '#rList'), 'Revisado por Admin Prueba', 'Revisados: quién lo revisó');
    t.eq(await p.$$eval('#rList [data-a="repReview"]', l => l.length), 0, 'Revisados: sin «Marcar revisado»');
    t.eq(errs, [], 'errores de la página (Reportes)');
    await close();
  }
  // 3) Sin supabase/reportes.sql en la base.
  {
    const m = mock(true);
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: m.handlers });
    await p.goto(base + '/admin/#reportes'); await wait(1800);
    t.has(await text(p, '#rList'), 'supabase/reportes.sql', 'sin el SQL: dice qué correr');
    t.ok(await p.isHidden('#navRep'), 'sin el SQL: sin número en el menú');
    t.eq(errs, [], 'errores de la página (sin el SQL)');
    await close();
  }
}
