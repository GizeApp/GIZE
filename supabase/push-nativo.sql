-- Notificaciones de las apps de las tiendas (Android e iPhone).
-- validaciones.sql solo aceptaba direcciones de navegadores (https://…), así que las apps
-- no podían guardar su dispositivo. Las apps guardan un token:
--   fcm:<token>   Android (Firebase Cloud Messaging)
--   apns:<token>  iPhone (Apple Push Notification service, token en hexadecimal)
-- Se puede correr varias veces.
create or replace function public.push_subscriptions_validate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.endpoint is null or char_length(new.endpoint) > 2048
     or not (
       new.endpoint ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)(:[0-9]+)?/'
       -- Sin {20,4096}: Postgres no acepta repeticiones de más de 255 ("invalid repetition
       -- count") y todos los Android fallaban al guardar. El largo lo controla char_length.
       or (new.endpoint ~ '^fcm:[A-Za-z0-9_:.-]+$' and char_length(new.endpoint) >= 24)
       or new.endpoint ~ '^apns:[0-9a-fA-F]{32,200}$'
     ) then
    raise exception 'Este navegador usa un servicio de notificaciones que GIZE no reconoce. Probá con Chrome, Safari, Firefox o Edge.'
      using errcode = '22023';
  end if;
  if new.p256dh !~ '^[A-Za-z0-9_+/=-]{1,200}$' or new.auth !~ '^[A-Za-z0-9_+/=-]{1,100}$' then
    raise exception 'Las claves de notificación de este dispositivo no son válidas.' using errcode = '22023';
  end if;
  return new;
end $$;
