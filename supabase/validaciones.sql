-- Validaciones de dispositivos de notificaciones y de la ruta de la foto de perfil.
-- Correr UNA vez en Supabase → SQL Editor.
-- OJO: NO volver a correr suelto. Redefine push_subscriptions_validate, y la versión vigente
-- (que además acepta las apps de Android e iPhone) está en push-nativo.sql. Si lo corrés,
-- corré después push-nativo.sql.
-- No toca los datos que ya están: solo valida lo que se guarda de acá en adelante.
-- Al final devuelve lo que haya que revisar (si no devuelve filas, está todo bien).


-- 1) Dispositivos de notificaciones (push_subscriptions).
--    Antes se aceptaba cualquier dirección y cualquier cantidad: un cliente podía
--    registrar miles de direcciones inventadas y, cada vez que el coach le escribía, la
--    función notificar-cliente intentaba mandarles a todas.
--    Va en triggers de la tabla (y no solo en save_push_subscription) porque la política
--    "push: agregar los propios" también deja insertar directo.

-- 1a) Solo servicios de push reales: Google (Chrome, Android, Opera, Samsung, Brave),
--     Mozilla (Firefox), Apple (Safari, iPhone) y Microsoft (Edge en Windows).
create or replace function public.push_subscriptions_validate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.endpoint is null or char_length(new.endpoint) > 2048
     or new.endpoint !~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)/' then
    raise exception 'Este navegador usa un servicio de notificaciones que GIZE no reconoce. Probá con Chrome, Safari, Firefox o Edge.'
      using errcode = '22023';
  end if;
  if new.p256dh !~ '^[A-Za-z0-9_+/=-]{1,200}$' or new.auth !~ '^[A-Za-z0-9_+/=-]{1,100}$' then
    raise exception 'Las claves de notificación de este dispositivo no son válidas.' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists push_subscriptions_validate on public.push_subscriptions;
create trigger push_subscriptions_validate
  before insert or update of endpoint, p256dh, auth on public.push_subscriptions
  for each row execute function public.push_subscriptions_validate();

-- 1b) Máximo 10 dispositivos por usuario: al sumar uno nuevo se borran los más viejos.
--     (Un celular que vuelve a entrar actualiza su fila y queda como el más nuevo.)
create or replace function public.push_subscriptions_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions
   where user_id = new.user_id
     and id in (select id from public.push_subscriptions
                 where user_id = new.user_id
                 order by created_at desc, id desc
                 offset 10);
  return null;
end $$;

drop trigger if exists push_subscriptions_cap on public.push_subscriptions;
create trigger push_subscriptions_cap
  after insert or update of user_id on public.push_subscriptions
  for each row execute function public.push_subscriptions_cap();


-- 2) Ruta de la foto de perfil: solo dentro de la carpeta propia ({id}/...).
--    La app siempre guarda así; esto evita que alguien guarde a mano una ruta ajena.
--    Trigger y no CHECK: un CHECK se evalúa en CUALQUIER cambio del perfil, y a quien ya
--    tuviera una ruta rara guardada le impediría hasta cambiarse el nombre. Esto solo
--    revisa cuando la ruta cambia. Corre también dentro de set_my_avatar (SECURITY DEFINER).
create or replace function public.profiles_avatar_path_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null
     and (split_part(new.avatar_path, '/', 1) <> new.id::text
          or new.avatar_path ~ '\.\.'
          or char_length(new.avatar_path) > 200) then
    raise exception 'La foto de perfil tiene que estar en tu propia carpeta' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_avatar_path_check on public.profiles;
create trigger profiles_avatar_path_check
  before update of avatar_path on public.profiles
  for each row execute function public.profiles_avatar_path_check();


notify pgrst, 'reload schema';


-- Chequeo final: si devuelve filas, hay algo para mirar (nada se rompe por esto: lo que
-- ya está guardado sigue funcionando igual).
--  · "Dispositivo de servicio desconocido": un navegador ya registrado con un servicio que
--    no está en la lista. Le siguen llegando los mensajes, pero si se vuelve a registrar
--    va a dar error: avisame el servicio y lo sumamos.
--  · "Foto fuera de su carpeta": un perfil con una ruta que hoy ya no se aceptaría.
select 'Dispositivo de servicio desconocido' as chequeo,
       split_part(split_part(endpoint, '://', 2), '/', 1) || ' (' || count(*) || ')' as detalle
  from public.push_subscriptions
 where endpoint !~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)/'
 group by split_part(split_part(endpoint, '://', 2), '/', 1)
union all
select 'Foto fuera de su carpeta', id::text || ' → ' || avatar_path
  from public.profiles
 where avatar_path is not null
   and (split_part(avatar_path, '/', 1) <> id::text or avatar_path ~ '\.\.');
