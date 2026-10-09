-- Cuentas demo para la revisión de Google Play (Contenido de la app → Datos de inicio de
-- sesión). Las crea el workflow "Supabase" (tarea cuentas-demo), que reemplaza
-- las marcas de los mails y de la contraseña con los secrets DEMO_EMAIL y DEMO_PASSWORD:
-- ni los mails ni la contraseña quedan en el repo (es público y gize.ar sirve este archivo).
-- Se puede correr varias veces: si las cuentas ya existen, solo les actualiza la contraseña.
--
--   __DEMO_COACH__    coach con plan de cortesía (sin vencimiento)
--   __DEMO_CLIENTE__  cliente vinculado a ese coach, con peso y un entreno

do $$
declare
  pw text := '__DEMO_PASSWORD__';
  acc record;
  uid uuid;
  coach uuid;
  client uuid;
begin
  for acc in
    select * from (values
      ('__DEMO_COACH__',   'Coach Demo',   'coach'),
      ('__DEMO_CLIENTE__', 'Cliente Demo', 'client')
    ) as t(email, full_name, role)
  loop
    select id into uid from auth.users where email = acc.email;
    if uid is null then
      uid := gen_random_uuid();
      -- handle_new_user (base.sql) crea el perfil con el rol de raw_user_meta_data.
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        acc.email, extensions.crypt(pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', acc.full_name, 'role', acc.role),
        now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', acc.email, 'email_verified', true),
        'email', now(), now(), now());
    else
      update auth.users
         set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
       where id = uid;
    end if;
    -- Por si el perfil ya existía (cuenta creada antes desde la app o el panel).
    update public.profiles set role = acc.role, full_name = acc.full_name where id = uid;
    if acc.role = 'coach' then coach := uid; else client := uid; end if;
  end loop;

  insert into public.coach_billing (coach_id, plan, max_clients)
  values (coach, 'cortesia', 50)
  on conflict (coach_id) do update set plan = 'cortesia', max_clients = 50, updated_at = now();

  update public.profiles set coach_id = coach where id = client;

  -- Datos para que la app no se vea vacía: 8 semanas de peso.
  insert into public.body_weights (client_id, measured_on, kg)
  select client, (current_date - (7 * g))::date, round((78.6 + g * 0.45)::numeric, 1)
    from generate_series(0, 7) g
   where not exists (select 1 from public.body_weights where client_id = client);
end $$;

select u.email, p.role, p.full_name, p.coach_id is not null as vinculado, b.plan
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.coach_billing b on b.coach_id = u.id
 where u.email in ('__DEMO_COACH__', '__DEMO_CLIENTE__');
