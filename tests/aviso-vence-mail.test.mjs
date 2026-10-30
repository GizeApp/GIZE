// Mail «tu plan vence mañana» (supabase/functions/vence-plan): el texto, la fecha en hora de
// Argentina y que la función se publique con las demás.
// Gimnasios (supabase/gimnasios-admin.sql): el dueño recibe el mail a 7, 3 y 1 día con el nombre del
// gimnasio, sus socios y qué pasa si no se renueva, con la administración del gimnasio en copia; con
// el SQL de antes (cuatro columnas) la función anda igual; si el mail no sale, se suelta para reintentar.
// Google Play: al coach al que Google le renueva el plan solo (google_renueva y google_vence hasta el
// vencimiento o después) no le llega el mail («omitidos»); a los demás, igual que siempre.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async function ({ t }){
  const m = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/vence-plan/mail.ts')).href);
  // Plan pago hasta el martes 6 de octubre (vence a las 00:00 del 7 en Argentina).
  const pago = m.mailVence({ nombre: 'Juan Pérez', vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 12 });
  t.eq(pago.subject, 'Tu plan de GIZE vence mañana', 'asunto del plan pago');
  t.has(pago.text, 'Hola Juan:', 'saluda por el nombre');
  t.has(pago.text, 'cubre hasta el martes 6 de octubre', 'último día en hora de Argentina');
  t.has(pago.text, 'renovación automática con tarjeta', 'ofrece la renovación automática');
  t.has(pago.text, 'transferencia', 'y la transferencia');
  t.has(pago.text, 'tus 12 clientes pasan a usar GIZE por su cuenta', 'qué pasa con sus clientes');
  t.has(pago.html, 'https://gize.ar/app/', 'botón a Mi plan');

  const prueba = m.mailVence({ nombre: '', vence: '2026-10-05T18:30:00Z', prueba: true, clientes: 0 });
  t.eq(prueba.subject, 'Tu prueba gratis de GIZE termina mañana', 'asunto de la prueba');
  t.has(prueba.text, 'Hola:', 'sin nombre');
  t.ok(!/clientes pasan|cliente pasa/.test(prueba.text), 'sin clientes no habla de ellos');

  const raro = m.mailVence({ nombre: '<b>Ana</b>', vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 1 });
  t.ok(!raro.html.includes('<b>Ana'), 'el nombre va escapado en el HTML');
  t.has(raro.text, 'Después, tu cliente pasa', 'un solo cliente');

  // Dueño de un gimnasio: 7, 3 y 1 día.
  const g7 = m.mailVence({ nombre: 'Laura Fuerza', vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 183, gimnasio: 'Gimnasio Fuerza', socios: 182, dias: 7 });
  t.eq(g7.subject, 'El plan de GIZE de Gimnasio Fuerza vence en 7 días', 'asunto del dueño a 7 días');
  t.has(g7.text, 'Hola Laura:', 'saluda al dueño');
  t.has(g7.text, 'cubre hasta el martes 6 de octubre). Hoy tiene 182 socios.', 'con el último día y los socios del gimnasio');
  t.has(g7.text, 'Plan de GIZE', 'manda a la pantalla del plan del gimnasio');
  t.has(g7.text, 'durante 5 días todo sigue andando', 'qué pasa si no se renueva: 5 días');
  t.has(g7.text, 'a los 10 días los socios quedan sin profe', 'y a los 10');
  t.ok(!/tus 183 clientes/.test(g7.text), 'no habla de «tus clientes» como a un coach');
  t.eq(m.mailVence({ vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 1, gimnasio: 'Gimnasio Fuerza', socios: 1, dias: 3 }).subject, 'El plan de GIZE de Gimnasio Fuerza vence en 3 días', 'a 3 días');
  const g1 = m.mailVence({ vence: '2026-10-07T03:00:00Z', prueba: true, clientes: 0, gimnasio: 'Gimnasio <Norte>', socios: 1, dias: 1 });
  t.eq(g1.subject, 'La prueba gratis de GIZE de Gimnasio <Norte> termina mañana', 'a 1 día, en prueba');
  t.has(g1.text, 'Hoy tiene 1 socio.', 'un socio');
  t.ok(!g1.html.includes('<Norte>') && g1.html.includes('&lt;Norte&gt;'), 'el nombre del gimnasio va escapado en el HTML');
  t.has(g1.html, 'Ir a Plan de GIZE', 'el botón del dueño');
  // «dias» es el escalón; el texto dice los días que faltan de verdad (faltan).
  const g5 = m.mailVence({ vence: '2026-10-26T03:00:00Z', prueba: false, clientes: 1, gimnasio: 'Gimnasio Fuerza', socios: 1, dias: 7, faltan: 5 });
  t.eq(g5.subject, 'El plan de GIZE de Gimnasio Fuerza vence en 5 días', 'entra a la ventana con 5 días: «en 5 días», no «en 7 días»');
  t.has(g5.text, 'vence en 5 días (cubre hasta el domingo 25 de octubre)', 'y el cuerpo igual');
  t.eq([m.mailVence({ vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 1, gimnasio: 'G', socios: 1, dias: 3, faltan: 1 }).subject,
    m.mailVence({ vence: '2026-10-07T03:00:00Z', prueba: true, clientes: 1, gimnasio: 'G', socios: 1, dias: 1, faltan: 0 }).subject],
    ['El plan de GIZE de G vence mañana', 'La prueba gratis de GIZE de G termina hoy'], 'faltan 1: «mañana»; faltan 0: «hoy»');
  t.eq(m.mailVence({ nombre: 'Juan Pérez', vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 12, gimnasio: null, socios: null, dias: 1 }).text, pago.text,
    'un coach con las columnas nuevas (sin gimnasio): el mismo mail de siempre');

  // La función de verdad, con la base y Resend simulados.
  const ID = n => 'c0ac4000-0000-4000-8000-' + String(n).padStart(12, '0');
  const correr = async (filas, { falla = false, billing = {} } = {}) => {
    const enviados = [], soltados = [];
    const db = supabaseSimulado(q => {
      if (q.accion === 'rpc' && q.tabla === 'tomar_avisos_vence') return { data: filas };
      if (q.accion === 'rpc' && q.tabla === 'soltar_aviso_vence') { soltados.push(q.valores.cid); return { data: null }; }
      if (q.tabla === 'profiles') return { data: { full_name: 'Laura Fuerza' } };
      if (q.tabla === 'coach_billing') { const f = q.filtros.find(x => x[0] === 'eq' && x[1] === 'coach_id'); return billing === 'sin-columnas' ? { error: { code: '42703', message: 'no existe la columna google_renueva' } } : { data: (f && billing[f[2]]) || null }; }
      return { data: null };
    });
    db.auth.admin.getUserById = async id => ({ data: { user: { id, email: 'cuenta-' + id.slice(-2) + '@prueba.test' } } });
    const fn = await funcion('vence-plan', {
      env: { RESEND_API_KEY: 'k', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv' },
      npm: { '@supabase/supabase-js': { createClient: () => db } },
      fetch: async (url, init) => { enviados.push(JSON.parse(init.body)); return new Response('{}', { status: falla ? 500 : 200 }); },
    });
    const r = await fn.call(new Request('https://x.supabase.co/functions/v1/vence-plan', { method: 'POST' }));
    return { res: await r.json(), enviados, soltados };
  };
  let x = await correr([{ coach_id: ID(1), vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 6, gym_id: ID(90), gimnasio: 'Gimnasio Fuerza', socios: 5, dias: 7, copia: [ID(2), ID(3), ID(1)], faltan: 4 },
    { coach_id: ID(4), vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 2, gym_id: null, gimnasio: null, socios: null, dias: 1, copia: null }]);
  t.eq(x.res, { ok: true, enviados: 2, fallidos: 0, omitidos: 0 }, 'la función manda los dos');
  t.eq([x.enviados[0].to, x.enviados[0].cc, x.enviados[0].subject], [['cuenta-01@prueba.test'], ['cuenta-02@prueba.test', 'cuenta-03@prueba.test'], 'El plan de GIZE de Gimnasio Fuerza vence en 4 días'],
    'al dueño (con los días que faltan de verdad), con la administración del gimnasio en copia (sin repetir al dueño)');
  t.ok(!('cc' in x.enviados[1]) && x.enviados[1].subject === 'Tu plan de GIZE vence mañana', 'al coach, como siempre y sin copia');
  x = await correr([{ coach_id: ID(5), vence: '2026-10-07T03:00:00Z', prueba: true, clientes: 0 }]);
  t.ok(x.res.enviados === 1 && x.enviados[0].subject === 'Tu prueba gratis de GIZE termina mañana' && !('cc' in x.enviados[0]), 'con el SQL de antes (cuatro columnas) anda igual');
  x = await correr([{ coach_id: ID(1), vence: '2026-10-07T03:00:00Z', prueba: false, clientes: 6, gimnasio: 'Gimnasio Fuerza', socios: 5, dias: 1, copia: [] }], { falla: true });
  t.eq([x.res.fallidos, x.soltados], [1, [ID(1)]], 'si el mail no sale, se suelta para reintentar');
  // Google Play le renueva el plan solo: sin mail (queda marcado igual). Con google_vence antes del
  // vencimiento, sin renovación o sin las columnas (todavía sin compras-google.sql), como siempre.
  const vence = '2026-10-07T03:00:00Z', fila = n => ({ coach_id: ID(n), vence, prueba: false, clientes: 3 });
  x = await correr([fila(6), fila(7), fila(8), fila(9)], { billing: {
    [ID(6)]: { google_renueva: true, google_vence: vence }, [ID(7)]: { google_renueva: true, google_vence: '2026-11-07T03:00:00Z' },
    [ID(8)]: { google_renueva: true, google_vence: '2026-10-06T03:00:00Z' }, [ID(9)]: { google_renueva: false, google_vence: '2026-11-07T03:00:00Z' } } });
  t.eq(x.res, { ok: true, enviados: 2, fallidos: 0, omitidos: 2 }, 'Google Play renueva el plan de dos: a esos no les manda el mail');
  t.eq(x.enviados.map(e => e.to[0]).sort(), ['cuenta-08@prueba.test', 'cuenta-09@prueba.test'], 'sí a quien Google cubre menos tiempo y a quien no se le renueva');
  t.eq(x.soltados, [], 'los omitidos quedan marcados (no se sueltan para reintentar)');
  x = await correr([fila(6)], { billing: 'sin-columnas' });
  t.eq(x.res, { ok: true, enviados: 1, fallidos: 0, omitidos: 0 }, 'sin las columnas de Google (falta compras-google.sql): manda el mail como siempre');

  const adm = fs.readFileSync(path.join(ROOT, 'supabase/gimnasios-admin.sql'), 'utf8');
  const tomar = adm.slice(adm.indexOf('create or replace function public.tomar_avisos_vence()'), adm.indexOf('end $$;', adm.indexOf('create or replace function public.tomar_avisos_vence()')));
  t.ok(/interval '7 days'/.test(tomar) && /then 3 else 7/.test(tomar) && /not public\.gym_profe_sin_cargo\(b\.coach_id\)/.test(tomar) && /s\.role = 'admin'/.test(tomar),
    'gimnasios-admin.sql: dueños a 7, 3 y 1 día, el profe sin alumnos propios afuera y la copia a la administración');

  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/supabase.yml'), 'utf8');
  t.ok(/for fn in [^\n]*\bvence-plan\b/.test(wf), 'el workflow publica vence-plan');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/aviso-vencimiento.sql'), 'utf8');
  t.has(sql, "coalesce(b.mp_status, '') <> 'authorized'", 'no avisa a quien se renueva solo');
  t.has(sql, "interval '24 hours'", 'avisa con 24 horas o menos');
}
