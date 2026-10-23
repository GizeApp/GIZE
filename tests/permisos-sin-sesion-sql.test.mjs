// supabase/permisos-sin-sesion.sql, leído: acá no hay Postgres. Revisa que a las 9 funciones se les
// saque el permiso sin sesión (anon y public), que las que la app llama con sesión lo sigan teniendo
// para authenticated, que no toque forget_push_subscription (la app la usa sin sesión) ni
// is_my_client (la usan las reglas de las tablas), y que coincidan con lo que usa la app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sql = read('supabase/permisos-sin-sesion.sql'), code = sql.replace(/--[^\n]*/g, '');

export default async ({ t }) => {
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/permisos-sin-sesion.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr', 'encabezado: se puede correr varias veces');
  const sinSesion = ['chat_mark_read(uuid)', 'chat_unread()', 'my_clients_emails()', 'chat_folder_mine(text, text)', 'ex_audio_access(text, boolean)',
    'handle_new_user()', 'coach_billing_on_profile()', 'push_subscriptions_cap()', 'routines_owner_guard()'];
  for (const f of sinSesion) t.ok(code.includes('revoke execute on function public.' + f + ' from public, anon;'), f + ': sin permiso sin sesión');
  for (const f of sinSesion.slice(0, 5)) t.ok(code.includes('grant execute on function public.' + f + ' to authenticated;'), f + ': sigue para usuarios con sesión');
  t.ok(!/grant[^;]*to anon/.test(code), 'no le da nada a anon');
  t.ok(!/forget_push_subscription|is_my_client/.test(code), 'no toca forget_push_subscription ni is_my_client');
  t.ok(!/revoke[^;]*authenticated/.test(code), 'no le saca nada a los usuarios con sesión');
  // Las firmas tienen que ser las de los archivos que crean cada función.
  const firmas = { 'chat.sql': ['chat_mark_read(p_client uuid)', 'chat_unread()', 'chat_folder_mine(p_coach text, p_client text)'],
    'ejercicio-audio.sql': ['ex_audio_access(p_owner text, p_write boolean)'], 'mail-clientes.sql': ['my_clients_emails()'] };
  for (const [f, fs_] of Object.entries(firmas)) for (const x of fs_) t.ok(read('supabase/' + f).includes('function public.' + x), f + ': existe ' + x);
  // La app sigue llamando con sesión a las que quedan para authenticated, y forget_push_subscription sin sesión.
  t.has(read('app/core/push.js'), 'forget_push_subscription', 'la app usa forget_push_subscription (queda abierta)');
  t.ok(/notify pgrst, 'reload schema'/.test(code), 'la API se entera sin esperar');
};
