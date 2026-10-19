-- Huella del esquema: para comparar la base de producción con la base de pruebas que se arma desde el
-- repo (tests/pg.mjs). SOLO LEE: no cambia nada, y no devuelve datos de nadie (estructura, hashes de
-- las definiciones y cuatro conteos agregados).
-- No se corre con el workflow (la tarea sql no imprime resultados: el log es público). Cuando el
-- dueño lo apruebe, se pega en Supabase → SQL Editor, se copia el resultado (un solo JSON) a un
-- archivo, y se compara con:
--   node tests/pg/comparar-huella.mjs <ese archivo>
-- que arma la base de pruebas, le saca la misma huella y lista las diferencias. Qué puede diferir y
-- por qué está en tests/pg/README.md («Dónde la base de pruebas puede no ser producción»).
--
-- Cada clave es un objeto y su valor, lo que tiene que coincidir:
--   version                     versión mayor de Postgres
--   rol:<rol>                   superusuario, bypassrls, login de postgres, anon, authenticated…
--   ajuste:<rol>                ajustes por rol (statement_timeout de anon y authenticated)
--   ext:<extensión>             versión de cada extensión
--   tabla:<tabla>               RLS prendida y forzada
--   col:<tabla>.<columna>       tipo, not null y default
--   con:<tabla>.<restricción>   md5 de la definición (checks, únicas, claves foráneas con su on delete)
--   idx:<tabla>.<índice>        md5 de la definición
--   pol:<tabla>.<política>      comando, roles, md5 de using y de with check (public y storage.objects)
--   trg:<tabla>.<trigger>       md5 de la definición (los que llaman a funciones de public)
--   fn:<función(args)>          md5 del cuerpo, lenguaje, security definer, volatilidad, ajustes, resultado
--   fnacl:<función(args)>       quién la puede llamar (anon, authenticated, service_role)
--   fndueno:<función(args)>     dueño
--   tblacl:<tabla>              permisos de anon, authenticated y service_role sobre la tabla
--   colacl:<tabla>.<columna>    permisos por columna (los que hay)
--   bucket:<id>                 público, tope y tipos de cada bucket
--   cron:<tarea>                horario y md5 del comando
--   pub:<publicación>           tablas de la publicación de realtime
--   dato:<conteo>               conteos agregados que no son estructura (no se comparan: se muestran)
with
f as (
  select p.oid, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig, p.prosrc, l.lanname,
         p.prosecdef, p.provolatile, p.proconfig, pg_get_function_result(p.oid) as res, p.proowner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
),
t as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
),
r(rol) as (values ('anon'), ('authenticated'), ('service_role')),
kv(k, v) as (
  select 'version', (current_setting('server_version_num')::int / 10000)::text
  union all
  select 'rol:' || rolname, format('super=%s bypassrls=%s inherit=%s login=%s', rolsuper, rolbypassrls, rolinherit, rolcanlogin)
    from pg_roles where rolname in ('postgres', 'anon', 'authenticated', 'service_role', 'authenticator')
  union all
  select 'ajuste:' || r.rolname || case when s.setdatabase = 0 then '' else '@base' end, array_to_string(s.setconfig, ' ')
    from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
   where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator') and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
  union all
  select 'ext:' || extname, extversion from pg_extension
  union all
  select 'tabla:' || relname, format('kind=%s rls=%s force=%s', relkind, relrowsecurity, relforcerowsecurity) from t
  union all
  select 'col:' || t.relname || '.' || a.attname,
         format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end
         || coalesce(' default ' || pg_get_expr(ad.adbin, ad.adrelid), '')
    from t join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  union all
  select 'con:' || t.relname || '.' || c.conname, md5(pg_get_constraintdef(c.oid))
    from t join pg_constraint c on c.conrelid = t.oid
  union all
  select 'idx:' || t.relname || '.' || i.relname, md5(pg_get_indexdef(i.oid))
    from t join pg_index x on x.indrelid = t.oid join pg_class i on i.oid = x.indexrelid
  union all
  select 'pol:' || case when schemaname = 'public' then '' else schemaname || '.' end || tablename || '.' || policyname,
         format('%s %s %s using=%s check=%s', permissive, cmd, roles, coalesce(md5(qual), '-'), coalesce(md5(with_check), '-'))
    from pg_policies where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
  union all
  select 'trg:' || case when n.nspname = 'public' then '' else n.nspname || '.' end || c.relname || '.' || g.tgname, md5(pg_get_triggerdef(g.oid))
    from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = g.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
   where not g.tgisinternal and pn.nspname = 'public'
  union all
  select 'fn:' || sig, format('%s %s secdef=%s vol=%s config=%s returns %s', md5(prosrc), lanname, prosecdef, provolatile,
                              coalesce(array_to_string(proconfig, ','), '-'), res) from f
  union all
  select 'fnacl:' || f.sig, string_agg(r.rol || '=' || has_function_privilege(r.rol, f.oid, 'execute'), ' ' order by r.rol)
    from f cross join r group by f.sig
  union all
  select 'fndueno:' || f.sig, pg_get_userbyid(f.proowner) from f
  union all
  select 'tblacl:' || t.relname, string_agg(r.rol || '=' || coalesce((
           select string_agg(v, ',' order by v) from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) v
            where has_table_privilege(r.rol, t.oid, v)), '-'), ' ' order by r.rol)
    from t cross join r group by t.relname
  union all
  select 'colacl:' || t.relname || '.' || a.attname, array_to_string(array(select x::text from unnest(a.attacl) x order by 1), ' ')
    from t join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null
  union all
  select 'bucket:' || id, format('public=%s limit=%s mime=%s', public, coalesce(file_size_limit::text, '-'),
                                 coalesce(array_to_string(array(select m from unnest(allowed_mime_types) m order by 1), ','), '-'))
    from storage.buckets
  union all
  select 'cron:' || jobname, schedule || ' ' || md5(command) from cron.job
  union all
  select 'pub:' || p.pubname, coalesce((select string_agg(x.schemaname || '.' || x.tablename, ',' order by x.schemaname, x.tablename)
                                          from pg_publication_tables x where x.pubname = p.pubname), '-')
    from pg_publication p where p.pubname = 'supabase_realtime'
  union all
  select 'dato:coaches con coach_id', count(*)::text from public.profiles where role = 'coach' and coach_id is not null
  union all
  select 'dato:coaches sin fila en coach_billing', count(*)::text from public.profiles p
   where p.role = 'coach' and not exists (select 1 from public.coach_billing b where b.coach_id = p.id)
  union all
  select 'dato:filas de coach_billing de quien no es coach', count(*)::text from public.coach_billing b
   where not exists (select 1 from public.profiles p where p.id = b.coach_id and p.role = 'coach')
  union all
  select 'dato:perfiles sin cuenta', count(*)::text from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id)
)
select jsonb_object_agg(k, v) as huella from kv;
