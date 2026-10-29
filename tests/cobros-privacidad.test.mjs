// Cobros del coach (supabase/cobros-coach.sql) en la Política de privacidad y en los Términos de uso:
// con Cobros, GIZE guarda datos nuevos del alumno (su cuota y los pagos que anota su coach), así que la
// política lo dice en su propia sección, en «Qué datos guardamos» y en «Qué se borra», con la fecha
// nueva. Lo que promete tiene que ser lo que hace la base: se borra con la cuenta del alumno (y con la
// del coach), las notas del coach no las ve el alumno y en las apps ve solo el estado y la fecha.
// Los términos aclaran que lo que cobra el coach es entre él y su alumno: GIZE no lo cobra ni lo
// intermedia (y, como el resto de los términos, sin medios de pago ni montos).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const texto = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const fecha = txt => {
  const m = /Última actualización: (\d{1,2}) de (\w+) de (\d{4})/.exec(txt);
  return m ? new Date(Date.UTC(+m[3], MESES.indexOf(m[2]), +m[1])) : null;
};

export default async ({ t }) => {
  const html = fs.readFileSync(path.join(ROOT, 'privacidad/index.html'), 'utf8');
  const txt = texto(html);
  const desde = new Date(Date.UTC(2026, 9, 29));
  t.ok(fecha(txt) >= desde, 'la fecha de la política es la de Cobros (o posterior)');

  // La sección propia.
  t.ok(/<h2 id="cobros-coach">Tu coach: tu cuota y tus pagos<\/h2>/.test(html), 'la sección «Tu coach: tu cuota y tus pagos»');
  const i = html.indexOf('<h2 id="cobros-coach">'), j = html.indexOf('<h2', i + 5);
  const sec = texto(html.slice(i, j));
  for (const frase of ['Si tu coach usa Cobros', 'cuánto le pagás, cada cuánto y hasta cuándo está paga tu cuota',
    'la fecha, el monto, si fue en efectivo, por transferencia u otro medio, qué período cubre y una nota',
    'GIZE no cobra esas cuotas, no intermedia en los pagos y no guarda datos de tarjetas ni de cuentas bancarias',
    'Tu coach es el responsable de esos datos', 'Quién lo ve: solo tu coach', 'Ajustes → Tu coach',
    'en las apps de Android y iPhone, si está al día y hasta cuándo', 'Las notas que escribe tu coach no las ves',
    'Un pago anotado por error no se borra: se anula y queda marcado',
    'Si te desvinculás de tu coach, él conserva lo que ya anotó, pero no puede anotar nada nuevo',
    'Si eliminás tu cuenta (o tu coach elimina la suya), se borran tu cuota y tus pagos'])
    t.has(sec, frase, 'la sección dice: ' + frase);
  t.ok(!/Mercado Pago|link|botón/i.test(sec), 'la sección no habla de pagar por la app');
  const gim = html.indexOf('<h2 id="gimnasios-clases">'), donde = html.indexOf('<h2>Dónde se guardan</h2>');
  t.ok(gim > 0 && i > gim && i < donde, 'va después de las secciones de los gimnasios y antes de «Dónde se guardan»');

  // «Qué datos guardamos» y «Qué se borra».
  const datos = texto(html.slice(html.indexOf('<h2>Qué datos guardamos</h2>'), html.indexOf('<h2>Para qué los usamos</h2>')));
  t.has(datos, 'Tu cuota con tu coach: si tu coach usa Cobros, cuánto le pagás, hasta cuándo está paga y los pagos que te anotó', '«Qué datos guardamos» suma la cuota con el coach');
  t.has(txt, 'el identificador de notificaciones de tu dispositivo, la cuota y los pagos que anotó tu coach y tu permiso para usar las funciones con IA', '«Qué se borra» suma la cuota y los pagos');

  // Lo que promete es lo que hace la base.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/cobros-coach.sql'), 'utf8');
  for (const tb of ['coach_client_fees', 'coach_client_payments']){
    const def = sql.slice(sql.indexOf('create table if not exists public.' + tb + ' ('), sql.indexOf(');', sql.indexOf('create table if not exists public.' + tb + ' (')));
    t.ok(/coach_id\s+uuid not null references public\.profiles\(id\) on delete cascade/.test(def) && /client_id\s+uuid not null references public\.profiles\(id\) on delete cascade/.test(def),
      tb + ': se borra con la cuenta del alumno y con la del coach');
  }
  const mia = sql.slice(sql.indexOf('create or replace function public.cobro_mi_cuota('), sql.indexOf('grant execute on function public.cobro_mi_cuota()'));
  t.ok(mia.length > 100 && !/note|void_reason/.test(mia) && /voided_at is null/.test(mia), 'el alumno no recibe las notas del coach ni los anulados');

  // Términos de uso: lo que cobra el coach es entre ustedes; GIZE no lo cobra ni lo intermedia.
  const th = fs.readFileSync(path.join(ROOT, 'terminos/index.html'), 'utf8');
  const tt = texto(th);
  t.ok(fecha(tt) >= desde, 'la fecha de los términos es la de Cobros (o posterior)');
  const uso = th.slice(th.indexOf('<h2>Uso de la app</h2>'), th.indexOf('<h2 id="planes">'));
  const vin = (uso.match(/<li>[^<]*?Lo que te cobre tu coach[\s\S]*?<\/li>/) || [''])[0];
  t.ok(!!vin, 'una viñeta en «Uso de la app» sobre lo que cobra el coach');
  t.has(texto(vin), 'Lo que te cobre tu coach por su trabajo lo arreglan entre ustedes: GIZE no cobra esas cuotas ni intermedia en esos pagos', 'los términos: GIZE no cobra ni intermedia');
  t.has(texto(vin), 'Si tu coach usa Cobros, GIZE solo guarda lo que él anota', 'los términos: GIZE solo guarda lo que anota el coach');
  t.ok(!/<a\b/.test(vin), 'sin links (desde la app, un link a la política sin ?app=1 mostraría la barra de la página de inicio)');
  t.ok(!/Mercado Pago|transferencia|\$|efectivo/i.test(texto(vin)), 'sin medios de pago ni montos');
};
