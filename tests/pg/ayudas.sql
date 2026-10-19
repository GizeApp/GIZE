-- Ayudas de las pruebas con Postgres (esquema «prueba»), solo en la base de pruebas: correr SQL como
-- cada persona (con su rol y su auth.uid(), como lo hace PostgREST), con o sin deshacer, y los
-- invariantes de los gimnasios. Son plpgsql: el cuerpo no se valida al crearlas, así que cargan
-- también en la base sin gimnasios.
create schema if not exists prueba;

-- Nombre de cada persona de prueba, para que los mensajes digan «A1» y no un uuid.
create table if not exists prueba.nombres (id uuid primary key, nombre text not null);
create or replace function prueba.n(u uuid) returns text language sql stable as $$
  select coalesce((select nombre from prueba.nombres where id = u), u::text)
$$;

-- quien: un uuid (cuenta con sesión: rol authenticated y ese sub en el JWT), 'anon', 'servicio'
-- (service_role) o 'postgres' (el dueño, como el SQL Editor).
create or replace function prueba.ser(quien text) returns void language plpgsql as $$
begin
  if quien is null or quien = 'postgres' then
    perform set_config('request.jwt.claims', '', true);
    execute 'reset role';
  elsif quien = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  elsif quien = 'servicio' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    execute 'set local role service_role';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', quien, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

-- Corre q (una consulta que devuelve un jsonb) como quien y DESHACE todo lo que haya cambiado.
-- Devuelve {"ok": <lo que devolvió q>, "status": <response.status>} o {"error": sqlstate, "msg": …}.
create or replace function prueba.probar(quien text, q text) returns jsonb language plpgsql as $$
declare r jsonb; st text; e text; m text;
begin
  begin
    perform prueba.ser(quien);
    if q ~* '^\s*(select|with|values|table)\M' then execute q into r; else execute q; end if;
    st := current_setting('response.status', true);
    raise exception using errcode = 'GZ999', message = 'deshacer';
  exception when others then
    get stacked diagnostics e = returned_sqlstate, m = message_text;
    if e = 'GZ999' then return jsonb_build_object('ok', r, 'status', nullif(st, '')); end if;
    return jsonb_build_object('error', e, 'msg', m);
  end;
end $$;

-- Lo mismo, pero lo que cambió queda (si dio error, no queda nada).
create or replace function prueba.hacer(quien text, q text) returns jsonb language plpgsql as $$
declare r jsonb; st text; e text; m text;
begin
  begin
    perform prueba.ser(quien);
    if q ~* '^\s*(select|with|values|table)\M' then execute q into r; else execute q; end if;
    st := current_setting('response.status', true);
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('response.status', '', true);
    return jsonb_build_object('ok', r, 'status', nullif(st, ''));
  exception when others then
    get stacked diagnostics e = returned_sqlstate, m = message_text;
    return jsonb_build_object('error', e, 'msg', m);
  end;
end $$;

-- Invariantes de supabase/gimnasios.sql y gimnasios-vinculo.sql. Devuelve la lista de lo que no se
-- cumple (vacía = todo bien):
--   I1  seats_used = recount_seats para cada fila de coach_billing (seats_drift vacío), y
--       recount_seats = la definición de la spec, escrita con vinculo_gym;
--   I2  ficha activa o pausada con cuenta: trainer_id = coach_id si ese coach es dueño, admin o
--       profe activo del gimnasio de la ficha; si no, null. Ficha sin cuenta, en baja o visita: sin
--       profe;
--   I3  ficha pendiente: sin profe;
--   I4  gimnasio abierto con dueño: exactamente una fila «owner» activa en gym_staff, la del dueño;
--   I5  a lo sumo una ficha que no es baja por cuenta.
create or replace function prueba.invariantes() returns jsonb language plpgsql as $$
declare v jsonb := '[]';
begin
  select v || coalesce(jsonb_agg(format('I1 %s: seats_used %s, recount_seats %s', prueba.n(coach_id), cacheado, contado)), '[]')
    into v from public.seats_drift();
  select v || coalesce(jsonb_agg(format('I1 %s: recount_seats %s, por la definición %s', prueba.n(x.coach_id), x.r, x.d)), '[]') into v
    from (select b.coach_id, public.recount_seats(b.coach_id) as r,
                 (select count(*) from public.profiles p where p.coach_id = b.coach_id and public.vinculo_gym(p.id) is null)
               + (select count(*) from public.gym_members m join public.gyms g on g.id = m.gym_id
                   where g.owner_id = b.coach_id and g.closed_at is null and m.status in ('activo', 'pausado')) as d
            from public.coach_billing b) x
   where x.r <> x.d;
  select v || coalesce(jsonb_agg(format('I2 ficha de %s: trainer_id %s, coach_id %s', prueba.n(m.member_id), prueba.n(m.trainer_id), prueba.n(p.coach_id))), '[]') into v
    from public.gym_members m join public.profiles p on p.id = m.member_id
   where m.status in ('activo', 'pausado')
     and m.trainer_id is distinct from (case when exists (select 1 from public.gym_staff s where s.gym_id = m.gym_id and s.user_id = p.coach_id
                                                          and s.left_at is null and s.role in ('owner', 'admin', 'profe'))
                                             then p.coach_id end);
  select v || coalesce(jsonb_agg(format('I2 ficha sin cuenta %s con profe %s', m.full_name, prueba.n(m.trainer_id))), '[]') into v
    from public.gym_members m where m.member_id is null and m.trainer_id is not null;
  select v || coalesce(jsonb_agg(format('I2 ficha %s de %s con profe %s', m.status, prueba.n(m.member_id), prueba.n(m.trainer_id))), '[]') into v
    from public.gym_members m where m.status in ('baja', 'visita') and m.member_id is not null and m.trainer_id is not null;
  select v || coalesce(jsonb_agg(format('I3 ficha pendiente de %s con profe %s', prueba.n(m.member_id), prueba.n(m.trainer_id))), '[]') into v
    from public.gym_members m where m.status = 'pendiente' and m.trainer_id is not null;
  select v || coalesce(jsonb_agg(format('I4 gimnasio %s: dueño %s', g.name, prueba.n(g.owner_id))), '[]') into v
    from public.gyms g
   where g.closed_at is null and g.owner_id is not null
     and ((select count(*) from public.gym_staff s where s.gym_id = g.id and s.role = 'owner' and s.left_at is null) <> 1
          or not exists (select 1 from public.gym_staff s where s.gym_id = g.id and s.user_id = g.owner_id and s.role = 'owner' and s.left_at is null));
  select v || coalesce(jsonb_agg(format('I5 %s tiene %s fichas', prueba.n(member_id), c)), '[]') into v
    from (select member_id, count(*) as c from public.gym_members where member_id is not null and status <> 'baja' group by member_id having count(*) > 1) x;
  return v;
end $$;

-- Varios pasos seguidos, cada uno como su persona ({"quien": …, "q": …}, como prueba.hacer: lo que
-- cambia uno lo ve el siguiente) y al final DESHACE todo. Devuelve el resultado de cada paso.
create or replace function prueba.varios(pasos jsonb) returns jsonb language plpgsql as $$
declare p jsonb; r jsonb := '[]';
begin
  begin
    for p in select * from jsonb_array_elements(pasos) loop
      r := r || jsonb_build_array(prueba.hacer(p->>'quien', p->>'q'));
    end loop;
    raise exception using errcode = 'GZ996', message = 'deshacer';
  exception when sqlstate 'GZ996' then null;
  end;
  return r;
end $$;
