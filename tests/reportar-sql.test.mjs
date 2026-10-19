// supabase/reportes.sql (reportar un mensaje del chat o a alguien de un grupo de pasos), leído:
// acá no hay Postgres. Revisa lo que no se puede escapar:
// - la tabla con RLS prendido, sin políticas y sin permisos para anon ni authenticated;
// - report_content: security definer con search_path fijo, solo para usuarios con sesión (nada para
//   anon), que mira que quien reporta pueda ver lo que reporta (el mensaje es de su conversación y
//   no es suyo; en un grupo, que los dos sean del grupo), con el tope de 20 por día y sin repetidos;
// - las funciones del panel primero chequean que sea administrador (admin_assert) y marcar
//   revisado queda en el registro (admin_log); la lista nunca devuelve la ruta de un audio;
// - el archivo se puede volver a correr (drop / if not exists) y no lleva datos de nadie.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// El cuerpo de una función (desde su create hasta el final de su $$).
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

export default async ({ t }) => {
  const file = path.join(ROOT, 'supabase/reportes.sql');
  t.ok(fs.existsSync(file), 'existe supabase/reportes.sql');
  if (!fs.existsSync(file)) return;
  const sql = fs.readFileSync(file, 'utf8');
  const code = sql.replace(/--[^\n]*/g, ''); // sin comentarios

  // Encabezado como los demás archivos.
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/reportes.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.ok(/después de\s+(--\s+)?supabase\/chat\.sql, supabase\/pasos-grupos\.sql y supabase\/admin\.sql/.test(sql), 'encabezado: de qué depende');

  // Tabla.
  t.ok(/create table if not exists public\.content_reports \(/.test(code), 'la tabla content_reports');
  for (const col of ['id', 'created_at', 'reporter', 'reported_user', 'kind', 'ref', 'reason', 'detail', 'status', 'reviewed_at', 'reviewed_by'])
    t.ok(new RegExp('\\n\\s+' + col + '\\s').test(code), 'la tabla tiene ' + col);
  t.ok(/reporter\s+uuid default auth\.uid\(\)/.test(code), 'reporter por defecto es quien llama');
  t.ok(/check \(kind in \('chat', 'grupo'\)\)/.test(code), 'kind: chat o grupo');
  t.ok(/check \(reason in \('ofensivo', 'spam', 'otro'\)\)/.test(code), 'reason: lista fija');
  t.ok(/check \(detail is null or char_length\(detail\) <= 500\)/.test(code), 'detail con tope de largo');
  t.ok(/status\s+text not null default 'nuevo'/.test(code) && /check \(status in \('nuevo', 'revisado'\)\)/.test(code), 'status: nuevo o revisado');
  t.ok(/reported_user\s+uuid not null references auth\.users\(id\) on delete cascade/.test(code), 'al borrar la cuenta reportada se van sus reportes');
  t.ok(/reporter\s+uuid default auth\.uid\(\) references auth\.users\(id\) on delete set null/.test(code), 'al borrar la cuenta de quien reportó no se traba el borrado');
  // Cada check se borra antes de crearlo (se puede correr de nuevo).
  const adds = [...code.matchAll(/add constraint (\w+)/g)].map(x => x[1]);
  t.ok(adds.length >= 5 && adds.every(c => code.includes('drop constraint if exists ' + c)), 'cada check se borra antes de crearlo: ' + adds.join(', '));

  // RLS y permisos de la tabla.
  t.ok(/alter table public\.content_reports enable row level security;/.test(code), 'RLS prendido');
  t.ok(/revoke all on public\.content_reports from anon, authenticated;/.test(code), 'sin permisos de tabla para anon ni authenticated');
  t.ok(!/create policy/i.test(code), 'sin políticas: nadie la lee ni la escribe directo');
  t.ok(!/grant [^;]*on (table )?public\.content_reports/i.test(code), 'ningún grant sobre la tabla');
  t.ok(!/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i.test(code), 'ningún grant para anon ni public');

  // report_content.
  const rc = fn(code, 'report_content');
  t.ok(rc.length > 500, 'está report_content');
  t.ok(/security definer\s+set search_path = public/.test(rc), 'report_content: security definer con search_path fijo');
  t.ok(/if me is null then raise exception/.test(rc), 'report_content: pide sesión');
  t.ok(/m\.coach_id = me and m\.sender = 'client'\) or \(m\.client_id = me and m\.sender = 'coach'\)/.test(rc), 'chat: el mensaje es de una conversación suya y lo escribió el otro');
  t.ok(/public\.pasos_soy_miembro\(ref_id\)/.test(rc) && /t\.miembro = p_reported and t\.user_id <> me/.test(rc), 'grupo: quien reporta y el reportado son del grupo (y no es uno mismo)');
  t.ok(/pg_advisory_xact_lock\(hashtext\('reportes:' \|\| me::text\)\)/.test(rc), 'de a un reporte a la vez por persona');
  const dedup = rc.search(/if exists \(select 1 from public\.content_reports c\s+where c\.reporter = me and c\.kind = p_kind and c\.ref = ref_id::text and c\.reported_user = quien\s+and c\.reason = motivo and c\.created_at > now\(\) - interval '24 hours'\) then\s+return jsonb_build_object\('ok', true\);/);
  const tope = rc.search(/if \(select count\(\*\) from public\.content_reports c\s+where c\.reporter = me and c\.created_at > now\(\) - interval '24 hours'\) >= 20 then\s+raise exception/);
  const ins = rc.indexOf('insert into public.content_reports');
  t.ok(dedup > 0, 'el mismo reporte en 24 horas devuelve ok sin otra fila');
  t.ok(tope > 0, 'tope de 20 reportes por persona cada 24 horas');
  t.ok(dedup > 0 && tope > dedup && ins > tope, 'primero los repetidos, después el tope y recién ahí guarda');
  t.ok(/revoke all on function public\.report_content\(text, text, uuid, text, text\) from public, anon;/.test(code), 'report_content: nada para public ni anon');
  t.ok(/grant execute on function public\.report_content\(text, text, uuid, text, text\) to authenticated;/.test(code), 'report_content: solo usuarios con sesión');

  // Panel.
  for (const name of ['admin_reports_list', 'admin_report_review']){
    const f = fn(code, name);
    t.ok(f.length > 100, 'está ' + name);
    t.ok(/\$\$\s*(declare[\s\S]*?)?begin\s+perform public\.admin_assert\(\);/.test(f), name + ': lo primero es admin_assert');
    t.ok(/security definer set search_path = public/.test(f), name + ': security definer con search_path fijo');
  }
  t.ok(/if not public\.is_app_admin\(\) then return 0; end if;/.test(fn(code, 'admin_reports_pending')), 'admin_reports_pending: a quien no es administrador le da 0');
  t.ok(/perform public\.admin_log\('reporte_revisado'/.test(fn(code, 'admin_report_review')), 'marcar revisado queda en el registro (admin_audit)');
  t.ok(!/audio_path/.test(fn(code, 'admin_reports_list')), 'la lista del panel nunca trae la ruta del audio');
  for (const sig of ['admin_reports_pending()', 'admin_reports_list(text)', 'admin_report_review(uuid)']){
    t.ok(code.includes('revoke execute on function public.' + sig + ' from public, anon;'), sig + ': nada para public ni anon');
    t.ok(code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': como las demás del panel');
  }
  t.ok(/drop function if exists public\.admin_reports_list\(text\);/.test(code), 'la lista se borra antes (se pueden cambiar sus columnas)');

  // El repositorio es público: nada de datos de nadie.
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(sql), 'sin mails');
  t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), 'sin ids de cuentas');
};
