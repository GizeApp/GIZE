// supabase/bloqueos.sql (bloquear desde el chat o desde un grupo de pasos), leído: acá no hay
// Postgres. Revisa lo que no se puede escapar:
// - las tablas con RLS prendido, sin políticas y sin permisos para anon ni authenticated, y que al
//   borrar una cuenta se van sus bloqueos de los dos lados;
// - block_user: security definer con search_path fijo, solo con sesión (nada para anon), que mira
//   que la persona sea la del mensaje o del vínculo (chat) o del grupo, con el tope de 30 por día,
//   y que corta el vínculo coach ↔ alumno y saca a la persona de los grupos que armé;
// - los mensajes: un trigger de coach_messages no deja guardar ninguno si uno bloqueó al otro;
// - los grupos: el ranking, el campeón y mis grupos no muestran a quien bloqueé, y pasos_unirse no
//   deja entrar a quien bloqueó el que armó el grupo (las versiones de pasos-grupos.sql enteras,
//   más el chequeo);
// - el panel primero chequea que sea administrador; el archivo se puede volver a correr y no
//   lleva datos de nadie.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '';
const sinComentarios = s => s.replace(/--[^\n]*/g, '');

// El cuerpo de una función (desde su create hasta el final de su $$).
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

export default async ({ t }) => {
  const sql = read('supabase/bloqueos.sql');
  t.ok(!!sql, 'existe supabase/bloqueos.sql');
  if (!sql) return;
  const code = sinComentarios(sql);
  const cabeza = sql.split('\n').slice(0, 20).join('\n');

  // Encabezado como los demás archivos.
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/bloqueos.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.ok(/después de\s+(--\s+)?supabase\/coach-alumnos\.sql, supabase\/chat\.sql, supabase\/pasos-grupos\.sql y supabase\/reportes\.sql/.test(cabeza), 'encabezado: de qué depende');
  t.ok(/versiones vigentes de join_coach[\s\S]*pasos_unirse, pasos_ranking, pasos_campeon y\s+(--\s+)?pasos_mis_grupos[\s\S]*correr\s+(--\s+)?después este/.test(cabeza), 'encabezado: qué versiones vigentes tiene y que va después de los otros');
  const pasosCabeza = read('supabase/pasos-grupos.sql').split('\n').slice(0, 35).join(' ');
  t.ok(/vigentes de pasos_unirse, pasos_mis_grupos, pasos_ranking y pasos_campeon/.test(pasosCabeza) && /bloqueos\.sql/.test(pasosCabeza), 'pasos-grupos.sql: las vigentes están en bloqueos.sql');

  // Tablas.
  t.ok(/create table if not exists public\.user_blocks \(/.test(code), 'la tabla user_blocks');
  t.ok(/blocker\s+uuid not null references auth\.users\(id\) on delete cascade/.test(code) && /blocked\s+uuid not null references auth\.users\(id\) on delete cascade/.test(code),
    'al borrar una cuenta se van sus bloqueos, los que hizo y los que le hicieron');
  t.ok(/created_at\s+timestamptz not null default now\(\)/.test(code) && /primary key \(blocker, blocked\)/.test(code), 'created_at y clave (blocker, blocked)');
  t.ok(/check \(blocker <> blocked\)/.test(code), 'nadie se bloquea a sí mismo');
  t.ok(/create table if not exists public\.user_block_log \([\s\S]*?user_id\s+uuid not null references auth\.users\(id\) on delete cascade/.test(code), 'el registro del tope se va con la cuenta');
  const adds = [...code.matchAll(/add constraint (\w+)/g)].map(x => x[1]);
  t.ok(adds.length >= 2 && adds.every(c => code.includes('drop constraint if exists ' + c)), 'cada check se borra antes de crearlo: ' + adds.join(', '));
  t.ok(!/drop table/i.test(code), 'no borra tablas (se puede volver a correr sin perder bloqueos)');

  // RLS y permisos de las tablas.
  for (const tb of ['user_blocks', 'user_block_log']){
    t.ok(code.includes('alter table public.' + tb + ' enable row level security;'), tb + ': RLS prendido');
    t.ok(code.includes('revoke all on public.' + tb + ' from anon, authenticated;'), tb + ': sin permisos para anon ni authenticated');
  }
  t.ok(!/create policy/i.test(code), 'sin políticas: nadie las lee ni las escribe directo');
  t.ok(!/grant [^;]*on (table )?public\.user_block/i.test(code), 'ningún grant sobre las tablas');
  t.ok(!/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i.test(code), 'ningún grant para anon ni public');

  // Funciones de la app: solo con sesión.
  for (const sig of ['block_user(text, text, uuid)', 'unblock_user(uuid)', 'my_blocks()']){
    t.ok(new RegExp('revoke all on function public\\.' + sig.replace(/[()]/g, '\\$&') + ' from public, anon;').test(code), sig + ': nada para public ni anon');
    t.ok(code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': solo usuarios con sesión');
  }
  for (const sig of ['bloqueo_entre(uuid, uuid)', 'lo_bloquee(uuid)', 'coach_messages_sin_bloqueo()'])
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon, authenticated;'), sig + ': uso interno, no se llama desde la app');
  for (const name of ['block_user', 'unblock_user', 'my_blocks', 'bloqueo_entre', 'lo_bloquee', 'coach_messages_sin_bloqueo', 'admin_reports_blocked', 'join_coach', 'pasos_unirse', 'pasos_mis_grupos', 'pasos_ranking', 'pasos_campeon'])
    t.ok(/security definer\s+set search_path = public/.test(fn(code, name)), name + ': security definer con search_path fijo');

  // block_user.
  const bu = fn(code, 'block_user');
  t.ok(bu.length > 1500, 'está block_user');
  t.ok(/if me is null then raise exception/.test(bu), 'block_user: pide sesión');
  t.ok(/coalesce\(p_kind, ''\) not in \('chat', 'grupo'\)/.test(bu), 'block_user: solo chat o grupo');
  t.ok(/m\.coach_id = me and m\.sender = 'client'\) or \(m\.client_id = me and m\.sender = 'coach'\)/.test(bu), 'chat: el mensaje es de una conversación suya y lo escribió el otro');
  t.ok(/p\.id = p_target and p\.coach_id = me/.test(bu) && /p\.id = me and p\.coach_id = p_target/.test(bu), 'chat sin mensaje: solo un alumno mío o mi coach');
  t.ok(/public\.pasos_soy_miembro\(ref_id\)/.test(bu) && /t\.miembro = p_target and t\.user_id <> me/.test(bu), 'grupo: los dos son del grupo (y no es uno mismo)');
  const lock = bu.indexOf("pg_advisory_xact_lock(hashtext('bloqueos:' || me::text))");
  const tope = bu.search(/if \(select count\(\*\) from public\.user_block_log l where l\.user_id = me\) >= 30 then\s+raise exception 'Bloqueaste a muchas personas hoy\. Probá de nuevo mañana\.' using errcode = 'P0001';/);
  const ins = bu.indexOf('insert into public.user_blocks');
  t.ok(/delete from public\.user_block_log l where l\.user_id = me and l\.created_at < now\(\) - interval '1 day'/.test(bu), 'tope: cuenta solo las últimas 24 horas (lo viejo se borra)');
  t.ok(lock > 0 && tope > lock && ins > tope, 'de a uno por persona: primero espera su turno, después el tope de 30 y recién ahí guarda');
  t.ok(/if not exists \(select 1 from public\.user_blocks b where b\.blocker = me and b\.blocked = quien\) then/.test(bu), 'si ya estaba bloqueada no cuenta para el tope ni se repite');
  t.ok(/update public\.profiles set coach_id = null\s+where \(id = quien and coach_id = me\) or \(id = me and coach_id = quien\);/.test(bu), 'corta el vínculo coach ↔ alumno de cualquiera de los dos lados (como coach_remove_client)');
  t.ok(/delete from public\.pasos_miembros m\s+using public\.pasos_grupos g\s+where g\.id = m\.grupo_id and g\.dueno = me and m\.user_id = quien;/.test(bu), 'la saca de los grupos que armé');
  t.ok(!/delete from public\.(routines|sessions|daily_logs|coach_messages)/.test(bu), 'el alumno no pierde nada de lo suyo');

  // Desbloquear y la lista.
  t.ok(/delete from public\.user_blocks b where b\.blocker = auth\.uid\(\) and b\.id = p_id;/.test(fn(code, 'unblock_user')), 'unblock_user: solo los bloqueos propios, por el id del bloqueo');
  const mb = fn(code, 'my_blocks');
  t.ok(/returns table \(id uuid, nombre text, created_at timestamptz\)/.test(mb) && /where b\.blocker = auth\.uid\(\)/.test(mb), 'my_blocks: solo los míos, con el nombre (sin la cuenta del otro)');
  t.ok(!/b\.blocked\b/.test(mb), 'my_blocks no devuelve la cuenta bloqueada');

  // Chat.
  t.ok(/create trigger coach_messages_sin_bloqueo before insert on public\.coach_messages\s+for each row execute function public\.coach_messages_sin_bloqueo\(\);/.test(code), 'trigger antes de guardar cada mensaje');
  t.ok(/drop trigger if exists coach_messages_sin_bloqueo on public\.coach_messages;/.test(code), 'el trigger se borra antes de crearlo (se puede volver a correr)');
  t.ok(/if public\.bloqueo_entre\(new\.coach_id, new\.client_id\) then\s+raise exception 'No se pueden mandar mensajes en esta conversación\.' using errcode = 'P0001';/.test(fn(code, 'coach_messages_sin_bloqueo')), 'chat: con un bloqueo de cualquier lado no se guarda (P0001, sin decir quién)');
  t.ok(/\(b\.blocker = p_a and b\.blocked = p_b\) or \(b\.blocker = p_b and b\.blocked = p_a\)/.test(fn(code, 'bloqueo_entre')), 'bloqueo_entre mira los dos lados');

  // Grupos: las versiones de pasos-grupos.sql enteras, más lo del bloqueo.
  const pasos = sinComentarios(read('supabase/pasos-grupos.sql'));
  for (const name of ['pasos_unirse', 'pasos_mis_grupos', 'pasos_ranking', 'pasos_campeon']){
    const nuevo = fn(code, name), viejo = fn(pasos, name);
    const lineas = viejo.split('\n').map(l => l.trim()).filter(l => l && !/^(where|order by|\(select count|from public\.pasos_totales)/.test(l));
    const faltan = lineas.filter(l => !nuevo.includes(l));
    t.ok(nuevo.length > 200 && faltan.length === 0, name + ': tiene lo de pasos-grupos.sql: falta ' + JSON.stringify(faltan));
  }
  t.ok(/where public\.pasos_soy_miembro\(p_grupo\)\s+and not public\.lo_bloquee\(t\.user_id\)/.test(fn(code, 'pasos_ranking')), 'ranking: solo si soy del grupo y sin quien bloqueé');
  t.ok(/where t\.pasos > 0 and t\.pasos = t\.top\s+and not public\.lo_bloquee\(t\.user_id\)/.test(fn(code, 'pasos_campeon')), 'campeón: sin quien bloqueé (y sin pasarle la copa al que seguía)');
  const mg = fn(code, 'pasos_mis_grupos');
  t.ok((mg.match(/not public\.lo_bloquee\((x|t)\.user_id\)/g) || []).length === 2, 'mis grupos: cuántos somos y mi puesto, sin quien bloqueé');
  const un = fn(code, 'pasos_unirse');
  const exp = un.indexOf('pasos_expulsados'), blq = un.search(/join public\.user_blocks b on b\.blocker = g\.dueno and b\.blocked = me where g\.id = gid\) then\s+raise exception 'No podés sumarte a este grupo\.' using errcode = 'P0001';/);
  t.ok(blq > 0 && exp > 0 && blq < un.indexOf('insert into public.pasos_miembros'), 'unirse: no entra quien bloqueó el que armó el grupo (antes de sumarlo)');
  t.ok(/\(b\.blocker = auth\.uid\(\) and b\.blocked = p_user\)|b\.blocker = auth\.uid\(\) and b\.blocked = p_user/.test(fn(code, 'lo_bloquee')), 'lo_bloquee: los que bloqueé yo');
  for (const sig of ['pasos_unirse(text, text)', 'pasos_mis_grupos()', 'pasos_ranking(uuid, int)', 'pasos_campeon(uuid)']){
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon;'), sig + ': nada para public ni anon');
    t.ok(code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': solo usuarios con sesión');
  }

  // Panel.
  const ar = fn(code, 'admin_reports_blocked');
  t.ok(/\$\$\s*begin\s+perform public\.admin_assert\(\);/.test(ar), 'admin_reports_blocked: lo primero es admin_assert');
  t.ok(/b\.blocker = c\.reporter and b\.blocked = c\.reported_user/.test(ar), 'admin_reports_blocked: quien reportó bloqueó a quien reportó');
  t.ok(code.includes('revoke execute on function public.admin_reports_blocked(uuid[]) from public, anon;') && code.includes('grant execute on function public.admin_reports_blocked(uuid[]) to authenticated;'), 'admin_reports_blocked: como las demás del panel');

  // El repositorio es público: nada de datos de nadie.
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(sql), 'sin mails');
  t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), 'sin ids de cuentas');
  t.ok(/notify pgrst, 'reload schema';/.test(code), 'avisa a la API que recargue');
};
