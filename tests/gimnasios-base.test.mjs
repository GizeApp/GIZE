// Gimnasios, etapa 0: la base de pruebas con Postgres de verdad (tests/pg.mjs) y que agregar los
// gimnasios no cambia nada de lo que ya existe. Sin Postgres se saltea con un aviso.
// a) La base se arma desde el repo: Supabase simulado + esquema base inferido + los supabase/*.sql en
//    el orden de tests/pg/orden.txt. Lo único simulado de los archivos son sus «create extension» de
//    pg_cron y pg_net. Cada función que una nota «OJO» declara vigente quedó con el cuerpo de ese
//    archivo (si el orden estuviera mal, esto lo dice) y, con los gimnasios, las cuatro canónicas son
//    las de gimnasios-vinculo.sql. Las consultas de solo lectura del repo corren sobre la base, y la
//    huella del esquema (supabase/esquema-huella.sql) sale sin datos de nadie.
// b) gimnasios.sql no cambia nada: la huella de todo lo que ya existía (funciones, políticas,
//    triggers, permisos, columnas, índices) queda igual y solo hay objetos nuevos y dos columnas
//    nuevas. Con las funciones de hoy, borrar la cuenta (alumno, coach con alumnos, coach con la
//    renovación de Mercado Pago, que se frena), bloquear, sacar un alumno, vincularse y liberar por
//    plan vencido dan exactamente lo mismo que sin gimnasios.sql, y seats_used queda al día.
//    gimnasios-vinculo.sql solo cambia las cuatro canónicas (mismos permisos) y suma las dos suyas.
// c) Los dos archivos se pueden volver a correr (misma huella) y volver atrás con sus bloques
//    comentados deja exactamente la huella de la base de hoy.
// d) El orden: gimnasios-vinculo.sql sin gimnasios.sql, y volver atrás gimnasios.sql con
//    gimnasios-vinculo.sql aplicado, fallan enteros sin cambiar nada (si no, se aplicaban sin error
//    y después fallaba cada lectura del coach). Volver a correr pasos-grupos.sql con los gimnasios
//    aplicados y seguir su nota «OJO» deja los filtros de bloqueos puestos.
// e) La huella ve un trigger de una tabla de public que llama a una función de otro esquema (un
//    «Database Webhook» en coach_billing, que ahora se escribe en cada vínculo), los permisos por
//    defecto y los ajustes del servidor; y las funciones que llama el service role no dependen de
//    los permisos por defecto.
// f) El cluster local: nadie más de la máquina entra al socket, y se apaga y se borra también con
//    SIGHUP o, si murió con kill -9, en la corrida siguiente.
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { conPg, leer, orden, simuladas, cuerpo, volverAtras, huella, diferencias, limpiarViejos } from './pg.mjs';

const NUEVAS_TABLAS = ['gyms', 'gym_staff', 'gym_invites', 'gym_codes', 'gym_members', 'gym_member_notes', 'gym_audit',
  'gym_alerts', 'gym_bajas', 'gym_entries', 'gym_turnos'];
const NUEVAS_FN = ['gym_mi_rol', 'gym_soy_socio', 'gym_role', 'vinculo_gym', 'gym_de_dueno', 'gym_active', 'gym_operativo',
  'gym_reads_member', 'recount_seats', 'seats_drift', 'gym_recontar', 'gym_cupo_profiles', 'gym_cupo_members',
  'gym_cupo_staff', 'gym_cupo_gyms', 'coach_billing_cupo', 'gym_codes_unico', 'gym_profe_ficha', 'gym_members_profe', 'gym_members_pedido_sin_cuenta'];
const NUEVAS_EN_VIEJAS = ['col:coach_billing.seats_used', 'col:coach_messages.gym_id', 'con:coach_billing.coach_billing_seats_used_check',
  'trg:profiles.profiles_gym_cupo_alta', 'trg:profiles.profiles_gym_cupo_cambio', 'trg:profiles.profiles_gym_cupo_baja',
  'trg:coach_billing.coach_billing_cupo'];
const esDeGimnasios = k => NUEVAS_EN_VIEJAS.includes(k)
  || NUEVAS_TABLAS.some(tb => new RegExp('^(tabla|tblacl):' + tb + '$|^(col|con|idx|pol|trg|colacl):' + tb + '\\.').test(k))
  || NUEVAS_FN.some(f => new RegExp('^(fn|fnacl|fndueno):' + f + '\\(').test(k));

// Funciones con notas «OJO»: el archivo que tiene la versión vigente.
const VIGENTES = [['join_coach', 'bloqueos.sql'], ['pasos_unirse', 'bloqueos.sql'], ['pasos_ranking', 'bloqueos.sql'],
  ['pasos_campeon', 'bloqueos.sql'], ['pasos_mis_grupos', 'bloqueos.sql'], ['coach_active', 'cupo-plan.sql'],
  ['is_my_client', 'suscripciones.sql'], ['hay_avisos_vence', 'compras-apple.sql'], ['tomar_avisos_vence', 'compras-apple.sql'],
  ['push_subscriptions_validate', 'push-nativo.sql'], ['routine_days_ok', 'ejercicio-audio.sql'],
  ['delete_own_account', 'pagos-seguros.sql'], ['my_invite_code', 'endurecer-base.sql'], ['admin_overview', 'precios-2026-10.sql'],
  ['release_lapsed_clients', 'coach-vencido.sql'], ['routine_schedule_on_coach_change', 'rutina-programada.sql'], ['admin_set_role', 'admin.sql'],
  ['admin_unlink', 'admin.sql']];
const CANONICAS = ['coach_active', 'is_my_client', 'join_coach', 'release_lapsed_clients', 'routine_schedule_on_coach_change', 'admin_set_role', 'admin_unlink'];
// Lo que suma gimnasios-vinculo.sql (etapas 0 y 1) y las políticas de hoy que cambia (etapa 1).
const FN_VINCULO = ['coach_client_ok', 'profiles_gym_sync', 'gym_alerta', 'gym_alerta_staff', 'gym_auditar', 'gym_cupo_ok', 'gym_profe_no_puede',
  'gym_aprobar_interno', 'gym_pedir', 'gym_cerrar_interno', 'gym_cerrar_por_baja', 'profiles_gym_baja', 'gym_mi_fila_oculta'];
const POLITICAS_VINCULO = ['pol:coach_billing.billing: el coach ve la suya', 'pol:coach_messages.mensajes: el coach ve los suyos',
  'pol:storage.objects.chat-audio: escuchar en mi conversación'];

// Personas de b) (uuids y mails de prueba).
const U = { K: 'b1000000-0000-4000-8000-000000000001', M: 'b1000000-0000-4000-8000-000000000002',
  c1: 'b1000000-0000-4000-8000-000000000011', c2: 'b1000000-0000-4000-8000-000000000012',
  c3: 'b1000000-0000-4000-8000-000000000013', c4: 'b1000000-0000-4000-8000-000000000014' };
const OPERACIONES = `
insert into auth.users (id, email, raw_user_meta_data) values
  ('${U.K}', 'coach.k@ejemplo.test', '{"full_name":"Coach Prueba K","role":"coach"}'),
  ('${U.M}', 'coach.m@ejemplo.test', '{"full_name":"Coach Prueba M","role":"coach"}'),
  ('${U.c1}', 'uno@ejemplo.test', '{"full_name":"Alumna Uno"}'), ('${U.c2}', 'dos@ejemplo.test', '{"full_name":"Alumno Dos"}'),
  ('${U.c3}', 'tres@ejemplo.test', '{"full_name":"Alumna Tres"}'), ('${U.c4}', 'cuatro@ejemplo.test', '{"full_name":"Alumno Cuatro"}');
update public.coach_billing set plan = 'p10', paid_until = now() + interval '10 days' where coach_id = '${U.K}';
update public.coach_billing set mp_preapproval_id = 'preaprobacion-de-prueba', mp_status = 'authorized' where coach_id = '${U.M}';
update public.profiles set invite_code = 'KKPRUEBA' where id = '${U.K}';
update public.profiles set coach_id = '${U.K}' where id in ('${U.c1}', '${U.c2}', '${U.c3}');
update public.profiles set coach_id = '${U.M}' where id = '${U.c4}';
create temp table r (n serial, op text, res jsonb, drift jsonb);
create or replace function pg_temp.paso(op text, quien text, q text) returns void language plpgsql as $$
declare res jsonb := prueba.hacer(quien, q); d jsonb := '[]';
begin
  if to_regprocedure('public.seats_drift()') is not null then
    execute 'select coalesce(jsonb_agg(d), ''[]'') from public.seats_drift() d' into d;
  end if;
  insert into r (op, res, drift) values (op, res, d);
end $$;
select pg_temp.paso('alumna borra su cuenta', '${U.c1}', 'select to_jsonb(true) from (select public.delete_own_account()) x');
select pg_temp.paso('coach con renovación de MP borra su cuenta', '${U.M}', 'select to_jsonb(true) from (select public.delete_own_account()) x');
select pg_temp.paso('coach saca un alumno', '${U.K}', $q$select to_jsonb(public.coach_remove_client('${U.c2}'))$q$);
select pg_temp.paso('alumna bloquea a su coach', '${U.c3}', $q$select public.block_user('chat', null, '${U.K}')$q$);
select pg_temp.paso('vuelve con el código', '${U.c2}', $q$select to_jsonb(public.join_coach('kkprueba '))$q$);
select pg_temp.paso('la bloqueada no puede', '${U.c3}', $q$select to_jsonb(public.join_coach('KKPRUEBA'))$q$);
select pg_temp.paso('código equivocado', '${U.c3}', $q$select to_jsonb(public.join_coach('NOEXISTE'))$q$);
update public.coach_billing set trial_ends_at = now() - interval '9 days', paid_until = now() - interval '5 days', mp_status = 'cancelled' where coach_id = '${U.M}';
select pg_temp.paso('plan vencido hace 5 días: libera', 'postgres', 'select to_jsonb(public.release_lapsed_clients())');
select pg_temp.paso('coach con alumnos borra su cuenta', '${U.K}', 'select to_jsonb(true) from (select public.delete_own_account()) x');
select json_build_object(
  'pasos', (select json_agg(json_build_object('op', op, 'res', res) order by n) from r),
  'drift', (select json_agg(drift order by n) from r),
  'perfiles', (select json_agg(json_build_array(id, coach_id, coach_left_at is not null) order by id) from public.profiles),
  'intentos', (select count(*) from public.join_code_attempts),
  'bloqueos', (select count(*) from public.user_blocks));
`;

export default async function ({ t }){
  const h = await conPg(t);
  if (!h) return;
  console.log('    Postgres ' + h.version + ', base armada en ' + h.armado);
  t.ok(/^16\./.test(h.version), 'la base de pruebas es Postgres 16 (el de las pruebas «a mano» del repo): ' + h.version);

  // ===== a) La base =====
  const archivos = orden();
  t.ok(archivos.length >= 64 && archivos.every(f => leer('supabase/' + f)), 'tests/pg/orden.txt nombra los archivos de supabase/ que existen (' + archivos.length + ')');
  const fuera = ['cuentas-demo.sql', 'auditoria.sql', 'estado.sql', 'seguridad-chequeo.sql', 'esquema-huella.sql', 'gimnasios.sql', 'gimnasios-vinculo.sql'];
  const todos = (await import('node:fs')).readdirSync(new URL('../supabase/', import.meta.url)).filter(f => f.endsWith('.sql'));
  t.eq(todos.filter(f => !archivos.includes(f) && !fuera.includes(f)), [], 'todo supabase/*.sql está en tests/pg/orden.txt (o afuera a propósito)');
  const sim = archivos.flatMap(f => simuladas(leer('supabase/' + f)).map(s => f + ': ' + s));
  t.ok(sim.length > 0 && sim.every(s => /create extension if not exists (pg_cron|pg_net)\b/.test(s)), 'solo se simulan los create extension de pg_cron y pg_net: ' + sim.length);

  const sin = h.base('gize_sin'), con = h.base('gize_con');
  const nombres = VIGENTES.map(v => v[0]);
  const cargadas = async db => db.json(`select json_object_agg(proname, prosrc) from pg_proc
    where pronamespace = 'public'::regnamespace and proname = any(array[${nombres.map(x => "'" + x + "'").join(',')}]);`);
  const enSin = await cargadas(sin), enCon = await cargadas(con);
  for (const [fn, f] of VIGENTES){
    const cu = cuerpo(leer('supabase/' + f), fn);
    t.ok(cu !== null, f + ' define ' + fn);
    t.ok(enSin[fn] === cu, 'base de hoy: la vigente de ' + fn + ' es la de ' + f);
    const vinc = cuerpo(leer('supabase/gimnasios-vinculo.sql'), fn);
    t.ok(enCon[fn] === (CANONICAS.includes(fn) ? vinc : cu), 'con gimnasios: la vigente de ' + fn + ' es la de ' + (CANONICAS.includes(fn) ? 'gimnasios-vinculo.sql' : f));
  }
  const dup = await sin.json(`select coalesce(json_agg(proname), '[]') from (select proname from pg_proc where pronamespace = 'public'::regnamespace
    and proname = any(array[${nombres.map(x => "'" + x + "'").join(',')}]) group by proname having count(*) > 1) x;`);
  t.eq(dup, [], 'ninguna de esas funciones tiene otra versión con otros parámetros');
  const tipo = await con.json(`select json_build_object('sin', (select pg_get_function_result('public.join_coach(text)'::regprocedure)),
    'drift', (select count(*) from public.seats_drift()));`);
  t.eq(tipo, { sin: 'json', drift: 0 }, 'con gimnasios: join_coach devuelve json y seats_drift() da vacío');
  for (const q of ['auditoria.sql', 'estado.sql', 'seguridad-chequeo.sql']){
    const r = await con.intentar(leer('supabase/' + q));
    t.ok(r.ok, 'la consulta de solo lectura ' + q + ' corre sobre la base con gimnasios' + (r.ok ? '' : ': ' + r.msg));
  }
  const hSin = await huella(sin);
  t.ok(Object.keys(hSin).length > 1000 && hSin['tabla:profiles'] && hSin['fn:join_coach(code text)'] && hSin['cron:gize-coach-vencido'],
    'la huella del esquema sale (' + Object.keys(hSin).length + ' claves)');
  t.eq(Object.keys(hSin).filter(k => k.startsWith('dato:')).sort(), ['dato:coaches con coach_id', 'dato:coaches sin fila en coach_billing',
    'dato:filas de coach_billing de quien no es coach', 'dato:perfiles sin cuenta'], 'la huella trae solo cuatro conteos agregados');

  // ===== b) gimnasios.sql no cambia nada =====
  const g = await h.nueva('gize_sin');
  await g.archivo('supabase/gimnasios.sql');
  const hG = await huella(g);
  const dG = diferencias(hSin, hG);
  t.eq(dG.faltan, [], 'gimnasios.sql no borra nada');
  t.eq(dG.cambian, [], 'gimnasios.sql no cambia nada de lo que ya existía (funciones, políticas, triggers, permisos, columnas)');
  t.eq(dG.nuevas.filter(k => !esDeGimnasios(k)), [], 'lo nuevo es solo de los gimnasios');
  t.ok(NUEVAS_TABLAS.every(tb => hG['tabla:' + tb] === 'kind=r rls=t force=f'), 'las 11 tablas nuevas, con RLS');
  t.ok(NUEVAS_FN.every(f => Object.keys(hG).some(k => k.startsWith('fn:' + f + '('))), 'las funciones nuevas');

  // Con las funciones de hoy, las operaciones dan lo mismo con y sin gimnasios.sql.
  const s1 = await h.nueva('gize_sin'), s2 = await h.nueva('gize_sin');
  await s2.archivo('supabase/gimnasios.sql');
  const [o1, o2] = [await s1.json(OPERACIONES), await s2.json(OPERACIONES)];
  t.eq(o2.pasos, o1.pasos, 'con gimnasios.sql y las funciones de hoy, cada operación da lo mismo');
  t.eq([o2.perfiles, o2.intentos, o2.bloqueos], [o1.perfiles, o1.intentos, o1.bloqueos], 'y el estado final es el mismo');
  t.eq(o1.pasos[1].res.error, 'P0001', 'el coach con la renovación de Mercado Pago sigue sin poder borrar su cuenta');
  t.eq(o1.pasos.map(p => p.res.ok), [true, null, true, { ok: true, desvinculado: true }, true, null, false, 1, true],
    'resultados: ' + JSON.stringify(o1.pasos.map(p => p.res)));
  t.eq(o2.drift.filter(d => d.length), [], 'seats_used queda al día después de cada operación (seats_drift vacío)');
  for (const b of [g, s1, s2]) await b.borrar();

  // ===== c) Volver a correr y volver atrás =====
  const v = await h.nueva('gize_sin');
  await v.archivo('supabase/gimnasios.sql');
  await v.archivo('supabase/gimnasios.sql');
  t.eq(diferencias(hG, await huella(v)), { nuevas: [], faltan: [], cambian: [] }, 'gimnasios.sql corrido dos veces: la misma huella');
  await v.archivo('supabase/gimnasios-vinculo.sql');
  const hV = await huella(v);
  const dV = diferencias(hG, hV);
  t.eq(dV.faltan, [], 'gimnasios-vinculo.sql no borra nada');
  t.eq(dV.cambian, [...CANONICAS.map(f => Object.keys(hG).find(k => k.startsWith('fn:' + f + '('))), 'fnacl:coach_active(cid uuid)', ...POLITICAS_VINCULO].sort(),
    'gimnasios-vinculo.sql solo cambia las canónicas (las cuatro de la etapa 0, routine_schedule_on_coach_change, admin_set_role y admin_unlink), el permiso de coach_active y las tres políticas de la etapa 1 (no los demás permisos ni los dueños)');
  t.eq([hG['fnacl:coach_active(cid uuid)'], hV['fnacl:coach_active(cid uuid)']], ['anon=false authenticated=true service_role=true', 'anon=false authenticated=false service_role=true'],
    'coach_active: hoy la puede llamar cualquiera con sesión; con gimnasios-vinculo.sql, solo el service role');
  t.eq(dV.nuevas.filter(k => !(/^(fn|fnacl|fndueno):(\w+)\(/.test(k) && FN_VINCULO.includes(k.match(/^\w+:(\w+)\(/)[1]))), ['trg:profiles.profiles_gym_baja', 'trg:profiles.profiles_gym_sync'],
    'y suma sus funciones y los dos triggers de profiles (nada más)');
  t.eq(FN_VINCULO.filter(f => !['fn', 'fnacl', 'fndueno'].every(x => dV.nuevas.some(k => k.startsWith(x + ':' + f + '(')))), [], 'cada función nueva de gimnasios-vinculo.sql: ' + FN_VINCULO.join(', '));
  t.eq(hV['fnacl:coach_client_ok(coach uuid, client uuid)'], 'anon=false authenticated=false service_role=true', 'coach_client_ok: solo el service role');
  await v.archivo('supabase/gimnasios-vinculo.sql');
  await v.archivo('supabase/gimnasios.sql');
  t.eq(diferencias(hV, await huella(v)), { nuevas: [], faltan: [], cambian: [] }, 'los dos corridos otra vez (en cualquier orden): la misma huella');
  // Un archivo viejo que define join_coach con boolean ya no pisa la canónica: falla entero.
  const viejo = await v.intentar(leer('supabase/bloqueos.sql'), { una: true });
  t.ok(!viejo.ok && viejo.code === '42P13', 'con gimnasios-vinculo.sql, volver a correr bloqueos.sql falla entero (cambió el tipo de join_coach): ' + viejo.code + ' ' + viejo.msg);
  t.eq(diferencias(hV, await huella(v)), { nuevas: [], faltan: [], cambian: [] }, 'y no cambió nada');
  // Volver atrás: el bloque de gimnasios-vinculo.sql y después el de gimnasios.sql.
  const atrasV = volverAtras(leer('supabase/gimnasios-vinculo.sql')), atrasG = volverAtras(leer('supabase/gimnasios.sql'));
  t.ok(atrasV.includes('drop function if exists public.join_coach(text);') && atrasG.includes('drop column if exists seats_used'), 'los dos archivos traen su bloque para volver atrás');
  const r1 = await v.intentar(atrasV, { una: true });
  t.ok(r1.ok, 'volver atrás gimnasios-vinculo.sql anda' + (r1.ok ? '' : ': ' + r1.msg));
  t.eq(diferencias(hG, await huella(v)), { nuevas: [], faltan: [], cambian: [] }, 'y deja la huella de gimnasios.sql solo');
  const r2 = await v.intentar(atrasG, { una: true });
  t.ok(r2.ok, 'volver atrás gimnasios.sql anda' + (r2.ok ? '' : ': ' + r2.msg));
  t.eq(diferencias(hSin, await huella(v)), { nuevas: [], faltan: [], cambian: [] }, 'y deja exactamente la huella de la base de hoy');
  // Con el bloque de volver atrás corrido, bloqueos.sql vuelve a correr (y después, los gimnasios).
  const otraVez = await v.intentar(leer('supabase/bloqueos.sql'), { una: true });
  t.ok(otraVez.ok, 'después de volver atrás, bloqueos.sql corre de nuevo' + (otraVez.ok ? '' : ': ' + otraVez.msg));
  await v.archivo('supabase/gimnasios.sql');
  await v.archivo('supabase/gimnasios-vinculo.sql');
  t.eq(diferencias(hV, await huella(v)), { nuevas: [], faltan: [], cambian: [] }, 'y los gimnasios otra vez dejan la misma huella');
  await v.borrar();

  // ===== d) El orden de los archivos =====
  const solo = await h.nueva('gize_sin');
  const r3 = await solo.intentar(leer('supabase/gimnasios-vinculo.sql'), { una: true });
  t.ok(!r3.ok && /Primero correr supabase\/gimnasios\.sql/.test(r3.msg), 'gimnasios-vinculo.sql sin gimnasios.sql: falla entero con «Primero correr supabase/gimnasios.sql»: ' + (r3.msg || 'corrió'));
  t.eq(diferencias(hSin, await huella(solo)), { nuevas: [], faltan: [], cambian: [] }, 'y no cambió nada (la base de hoy sigue igual)');
  await solo.archivo('supabase/gimnasios.sql');
  await solo.intentar(atrasG, { una: true });
  const r4 = await solo.intentar(leer('supabase/gimnasios-vinculo.sql'), { una: true });
  t.ok(!r4.ok && /Primero correr supabase\/gimnasios\.sql/.test(r4.msg), 'tampoco después de volver atrás gimnasios.sql: ' + (r4.msg || 'corrió'));
  await solo.borrar();
  const mal = await h.nueva('gize_con');
  const r5 = await mal.intentar(atrasG, { una: true });
  t.ok(!r5.ok && /Primero el bloque «Para volver atrás» de supabase\/gimnasios-vinculo\.sql/.test(r5.msg) && /coach_active/.test(r5.msg) && /profiles_gym_sync/.test(r5.msg),
    'volver atrás gimnasios.sql con gimnasios-vinculo.sql todavía aplicado: se frena y dice qué funciones usan los gimnasios: ' + (r5.msg || 'corrió'));
  t.eq(diferencias(hV, await huella(mal)), { nuevas: [], faltan: [], cambian: [] }, 'y no cambió nada');
  // Volver a correr pasos-grupos.sql con los gimnasios aplicados, siguiendo su nota «OJO».
  const PASOS = ['pasos_unirse', 'pasos_ranking', 'pasos_campeon', 'pasos_mis_grupos'];
  const deBloqueos = Object.fromEntries(PASOS.map(f => [f, cuerpo(leer('supabase/bloqueos.sql'), f)]));
  // Cuáles de las cuatro tienen el cuerpo de bloqueos.sql (las que filtran los bloqueos).
  const pasos = async db => { const p = await db.json(`select json_object_agg(proname, prosrc) from pg_proc where pronamespace = 'public'::regnamespace
      and proname = any(array[${PASOS.map(x => "'" + x + "'").join(',')}]);`); return PASOS.filter(f => p[f] === deBloqueos[f]); };
  t.eq(await pasos(mal), PASOS, 'con los gimnasios, las de pasos son las de bloqueos.sql (filtran los bloqueos)');
  const nota = leer('supabase/pasos-grupos.sql').split('\n').slice(0, 40).join(' ').replace(/\s*--\s*/g, ' ');
  t.ok(/el bloque «Para volver atrás» de gimnasios-vinculo\.sql, bloqueos\.sql, gimnasios\.sql y gimnasios-vinculo\.sql/.test(nota), 'pasos-grupos.sql dice el orden para volver a poner los filtros');
  await mal.archivo('supabase/pasos-grupos.sql');
  t.eq(await pasos(mal), [], 'después de pasos-grupos.sql, ninguna filtra los bloqueos');
  const sinOrden = await mal.intentar(leer('supabase/bloqueos.sql'), { una: true });
  t.eq(sinOrden.code, '42P13', 'bloqueos.sql solo, con gimnasios-vinculo.sql aplicado: falla entero (por eso la nota)');
  t.ok((await mal.intentar(atrasV, { una: true })).ok, 'la nota, paso 1: volver atrás gimnasios-vinculo.sql');
  await mal.archivo('supabase/bloqueos.sql');
  await mal.archivo('supabase/gimnasios.sql');
  await mal.archivo('supabase/gimnasios-vinculo.sql');
  t.eq(await pasos(mal), PASOS, 'siguiendo la nota (volver atrás, bloqueos.sql, gimnasios.sql y gimnasios-vinculo.sql), las de pasos vuelven a filtrar los bloqueos');
  t.eq(diferencias(hV, await huella(mal)), { nuevas: [], faltan: [], cambian: [] }, 'y la base queda igual que con los gimnasios recién aplicados');
  await mal.borrar();

  // ===== e) Lo que la huella tiene que ver =====
  const hu = await h.nueva('gize_con');
  const antesTrg = await huella(hu);
  await hu.sql(`create schema supabase_functions;
    create function supabase_functions.http_request() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger aviso_plan after update on public.coach_billing for each row execute function supabase_functions.http_request();`);
  const dTrg = diferencias(antesTrg, await huella(hu));
  t.eq([dTrg.nuevas, dTrg.faltan, dTrg.cambian], [['trg:coach_billing.aviso_plan'], [], []], 'un trigger en coach_billing que llama a una función de otro esquema (Database Webhook) aparece en la huella');
  t.ok(/ supabase_functions\.http_request$/.test((await huella(hu))['trg:coach_billing.aviso_plan']), 'con la función que llama');
  t.ok(Object.keys(antesTrg).some(k => k.startsWith('trg:auth.users.')), 'y siguen los triggers de auth.users que llaman a funciones de public');
  t.ok(['servidor:jit', 'servidor:work_mem', 'servidor:random_page_cost'].every(k => k in antesTrg), 'la huella trae los ajustes del servidor que cambian los planes (jit, work_mem, random_page_cost)');
  t.ok(Object.keys(antesTrg).some(k => /^defacl:postgres\.public\.f$/.test(k)) && /service_role=X/.test(antesTrg['defacl:postgres.public.f']), 'y los permisos por defecto de las funciones nuevas: ' + antesTrg['defacl:postgres.public.f']);
  await hu.borrar();
  // Con otros permisos por defecto (si producción no fuera como el Supabase simulado), las funciones
  // que llama el service role lo siguen dejando.
  const pd = await h.nueva('gize_sin');
  await pd.sql('alter default privileges in schema public revoke all on functions from service_role;');
  const hPd = await huella(pd);
  t.ok(hPd['defacl:postgres.public.f'] !== hSin['defacl:postgres.public.f'], 'la huella ve el cambio de permisos por defecto');
  await pd.archivo('supabase/gimnasios.sql');
  await pd.archivo('supabase/gimnasios-vinculo.sql');
  const SERVICIO = ['coach_client_ok(uuid, uuid)', 'coach_active(uuid)', 'vinculo_gym(uuid)', 'gym_role(uuid, uuid)', 'gym_de_dueno(uuid)', 'gym_active(uuid)',
    'gym_operativo(uuid)', 'recount_seats(uuid)', 'seats_drift()'];
  const sp = await pd.json(`select json_object_agg(f, has_function_privilege('service_role', ('public.' || f)::regprocedure, 'execute')) from unnest(array[${SERVICIO.map(f => "'" + f + "'").join(',')}]) f;`);
  t.eq(Object.entries(sp).filter(([, v]) => !v).map(([f]) => f), [], 'sin permisos por defecto para el service role, igual puede llamar a coach_client_ok, coach_active y las internas que usa');
  await pd.borrar();

  // ===== f) El cluster local =====
  if (!h.dir){ console.log('    — el cluster local se saltea: la base es un servidor ya levantado (GIZE_PSQL)'); return; }
  const modo = fs.statSync(h.dir).mode & 0o777;
  t.eq([modo.toString(8), (await h.admin.sql('show unix_socket_permissions;')).trim()], ['700', '0700'], 'la carpeta del cluster y su socket: 0700');
  if (process.getuid && process.getuid() === 0 && spawnSync('id', ['nobody']).status === 0){
    const otro = spawnSync('runuser', ['-u', 'nobody', '--', h.psql[0], '-h', h.dir, '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' });
    t.ok(otro.status !== 0, 'otro usuario de la máquina (nobody) no entra al cluster: ' + String(otro.stderr || otro.stdout).trim().split('\n').pop());
  }
  // Un proceso aparte arma su cluster; con SIGHUP lo apaga y lo borra; con kill -9 lo limpia la corrida siguiente.
  const hijo = () => new Promise((ok, mal) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', `import { clusterLocal } from ${JSON.stringify(new URL('./pg.mjs', import.meta.url).href)};
      const c = clusterLocal(); console.log(JSON.stringify(c)); setInterval(() => {}, 1000);`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; const l = out.split('\n')[0]; if (out.includes('\n')) { try { ok({ p, c: JSON.parse(l) }); } catch (e) { mal(e); } } });
    p.on('error', mal);
    setTimeout(() => mal(new Error('el proceso aparte no armó el cluster: ' + out)), 60000);
  });
  const fin = p => new Promise(ok => p.on('exit', (code, sig) => ok(code ?? sig)));
  const postmaster = dir => spawnSync('pgrep', ['-f', dir + '/data'], { encoding: 'utf8' }).status === 0;
  let x = await hijo();
  t.ok(x.c.dir && fs.existsSync(x.c.dir) && postmaster(x.c.dir), 'el proceso aparte levantó su cluster');
  process.kill(x.p.pid, 'SIGHUP');
  const cod = await fin(x.p);
  t.eq([cod, fs.existsSync(x.c.dir), postmaster(x.c.dir)], [129, false, false], 'con SIGHUP (se cerró la terminal) sale con 129 y apaga y borra su cluster');
  x = await hijo();
  process.kill(x.p.pid, 'SIGKILL');
  await fin(x.p);
  t.ok(fs.existsSync(x.c.dir) && postmaster(x.c.dir), 'con kill -9 el cluster queda');
  const borradas = limpiarViejos();
  t.ok(borradas.includes(x.c.dir) && !fs.existsSync(x.c.dir) && !postmaster(x.c.dir), 'y la corrida siguiente lo apaga y lo borra (sin tocar los de pruebas que siguen corriendo): ' + JSON.stringify(borradas));
  t.ok(fs.existsSync(h.dir), 'el cluster de esta prueba sigue');
}
