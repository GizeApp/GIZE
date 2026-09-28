-- IA de Comida (función «ia-comida»): cuántas fotos analizó cada usuario por día, para poner
-- un tope y que el gasto no se dispare. Solo la usa la función con la service role: la
-- tabla no tiene políticas, así que desde la app no se lee ni se escribe.
-- Correr con el workflow "Supabase" → tarea sql → supabase/ia-comida.sql. Se puede correr
-- varias veces.

create table if not exists public.ia_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia     date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  n       int  not null default 0,
  primary key (user_id, dia)
);
alter table public.ia_uso enable row level security;

-- Suma una foto si todavía no llegó al tope del día. true = puede seguir.
create or replace function public.ia_contar(uid uuid, tope int)
returns boolean language plpgsql security definer set search_path = public as $$
declare hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date; m int;
begin
  insert into public.ia_uso (user_id, dia, n) values (uid, hoy, 1)
    on conflict (user_id, dia) do update set n = ia_uso.n + 1 where ia_uso.n < tope
    returning n into m;
  return m is not null;
end $$;
revoke execute on function public.ia_contar(uuid, int) from public, anon, authenticated;
grant execute on function public.ia_contar(uuid, int) to service_role;

-- Uso de los últimos días (para mirar desde el editor SQL; no muestra quién).
-- select dia, count(*) as usuarios, sum(n) as fotos from public.ia_uso group by dia order by dia desc limit 14;
