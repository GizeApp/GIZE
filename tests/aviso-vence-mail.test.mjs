// Mail «tu plan vence mañana» (supabase/functions/vence-plan): el texto, la fecha en hora de
// Argentina y que la función se publique con las demás.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

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

  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/supabase.yml'), 'utf8');
  t.ok(/for fn in [^\n]*\bvence-plan\b/.test(wf), 'el workflow publica vence-plan');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/aviso-vencimiento.sql'), 'utf8');
  t.has(sql, "coalesce(b.mp_status, '') <> 'authorized'", 'no avisa a quien se renueva solo');
  t.has(sql, "interval '24 hours'", 'avisa con 24 horas o menos');
}
