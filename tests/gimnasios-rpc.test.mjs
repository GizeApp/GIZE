// Gimnasios, etapa 1: cada RPC de supabase/gimnasios-socios.sql y gimnasios-lectura.sql con cada persona
// de la matriz (tests/gimnasios-comun.mjs), en Postgres de verdad (tests/pg.mjs; sin Postgres se saltea).
// Por cada RPC: quién la puede llamar (y que lo que hace queda en gym_audit con quien la hizo), quién
// recibe 42501 (sin permiso) y quién un P0001 con su texto; que anon no llama ninguna; que las internas
// no las llama la app; y los permisos escritos (sin depender de los permisos por defecto).
// Cada llamada se deshace: todas salen del mismo estado.
import { conPg } from './pg.mjs';
import { P, F, G, VER, DATOS, ayudas, rpc, nom, VENCE, canon } from './gimnasios-comun.mjs';

const PERSONAS = ['dA', 'aA', 'pA1', 'rA', 'A1', 'A6', 'A7', 'dB', 'C', 'N', 'anon'];
const NUEVO = 'b0000000-0000-4000-8000-0000000000e1';
const EN_30 = `(current_date + 30)::text`;

// [nombre, sql, {ok: [...], P0001: [...]}, acción en gym_audit (o null)]. El resto: 42501.
const CASOS = [
  ['mi_gimnasio', rpc('mi_gimnasio'), { ok: PERSONAS.filter(p => p !== 'anon') }, null],
  ['gym_versiones', rpc('gym_versiones'), { ok: PERSONAS.filter(p => p !== 'anon') }, null],
  ['gym_crear (interruptor apagado)', rpc('gym_crear', 'Gimnasio Nuevo', 'Funes', 'Santa Fe', VER), { P0001: PERSONAS.filter(p => p !== 'anon') }, null],
  ['gym_config', rpc('gym_config', { city: 'Funes' }), { ok: ['dA', 'aA', 'dB'] }, 'config'],
  ['gym_codigo_rotar', rpc('gym_codigo_rotar'), { ok: ['dA', 'aA', 'dB'] }, 'codigo_rotar'],
  ['gym_cerrar', rpc('gym_cerrar', 'Gimnasio Fuerza'), { ok: ['dA'], P0001: ['dB'] }, 'cerrar'],
  ['gym_exportar', rpc('gym_exportar', 'socios'), { ok: ['dA', 'aA', 'dB'] }, 'exportar'],
  ['gym_invitar profe', rpc('gym_invitar', 'profe'), { ok: ['dA', 'aA', 'dB'] }, 'invitar'],
  ['gym_invitar admin', rpc('gym_invitar', 'admin'), { ok: ['dA', 'dB'], P0001: ['aA'] }, 'invitar'],
  ['gym_invitaciones', rpc('gym_invitaciones'), { ok: ['dA', 'aA', 'dB'] }, null],
  ['gym_invitacion_revocar', rpc('gym_invitacion_revocar', NUEVO), { P0001: ['dA', 'aA', 'dB'] }, null],
  ['gym_invitacion_info', rpc('gym_invitacion_info', 'no-existe'), { ok: PERSONAS.filter(p => p !== 'anon') }, null],
  ['gym_aceptar_invitacion', rpc('gym_aceptar_invitacion', 'no-existe'), { P0001: PERSONAS.filter(p => p !== 'anon') }, null],
  ['gym_cambiar_rol a admin', rpc('gym_cambiar_rol', P.pA2, 'admin'), { ok: ['dA'], P0001: ['aA', 'dB'] }, 'cambiar_rol'],
  ['gym_quitar_staff', rpc('gym_quitar_staff', P.pA2, null), { ok: ['dA', 'aA'], P0001: ['dB'] }, 'quitar_staff'],
  ['gym_solicitudes', rpc('gym_solicitudes'), { ok: ['dA', 'aA', 'rA', 'dB'] }, null],
  ['gym_aprobar', rpc('gym_aprobar', F.A6, null, null, false), { ok: ['dA', 'aA', 'rA'], P0001: ['dB'] }, 'aprobar'],
  ['gym_rechazar', rpc('gym_rechazar', F.A6, 'No es del barrio'), { ok: ['dA', 'aA', 'rA'], P0001: ['dB'] }, 'rechazar'],
  ['gym_ficha_crear', rpc('gym_ficha_crear', { nombre: 'Gabriel Núñez', dni: '28.555.444' }), { ok: ['dA', 'aA', 'rA', 'dB'] }, 'ficha_alta'],
  ['gym_ficha_editar', rpc('gym_ficha_editar', F.A4, { telefono: '341 555 1234' }), { ok: ['dA', 'aA'], P0001: ['dB'] }, 'ficha_editar'],
  ['gym_ficha_link', rpc('gym_ficha_link', F.A4), { ok: ['dA', 'aA', 'rA'], P0001: ['dB'] }, 'link_unirme'],
  ['gym_nota_guardar', rpc('gym_nota_guardar', F.A2, 'Prefiere la tarde'), { ok: ['dA', 'aA', 'pA1'] }, 'nota'],
  ['gym_asignar_profe', rpc('gym_asignar_profe', [F.A3], P.pA2), { ok: ['dA', 'aA', 'dB'] }, null],
  ['gym_dejar_socio', rpc('gym_dejar_socio', F.A1), { ok: ['pA1'], P0001: PERSONAS.filter(p => !['pA1', 'anon'].includes(p)) }, 'dejar_socio'],
  ['gym_pausar', `select to_jsonb(public.gym_pausar('${F.A2}', ${EN_30}::date))`, { ok: ['dA', 'aA'], P0001: ['dB'] }, 'pausar'],
  ['gym_reactivar', rpc('gym_reactivar', F.A2), { P0001: ['dA', 'aA', 'dB'] }, null],
  ['gym_baja', rpc('gym_baja', F.A2, 'Se mudó'), { ok: ['dA', 'aA'], P0001: ['dB'] }, 'baja'],
  ['gym_socios_resumen', rpc('gym_socios_resumen'), { ok: ['dA', 'aA', 'dB'] }, null],
  ['buscar_socio', rpc('buscar_socio', 'mart'), { ok: ['dA', 'aA', 'rA', 'dB'] }, null],
  ['gym_ingreso_manual', rpc('gym_ingreso_manual', NUEVO, F.A1), { ok: ['dA', 'aA', 'rA'], P0001: ['dB'] }, 'ingreso_manual'],
  ['gym_ingresos', `select to_jsonb(public.gym_ingresos(null))`, { ok: ['dA', 'aA', 'pA1', 'rA', 'dB'] }, null],
  ['gym_foto_staff', rpc('gym_foto_staff', F.A1, `${G.A}/${F.A1}/${NUEVO}.jpg`), { P0001: ['dA', 'aA', 'rA', 'dB'] }, null],
  ['gym_foto_resolver', rpc('gym_foto_resolver', F.A1, true, null), { P0001: ['dA', 'aA', 'rA', 'dB'] }, null],
  ['gym_registro_lectura', `select public.gym_registro_lectura('${P.A1}')`, { ok: ['dA', 'aA'] }, null],
  ['gym_cardio_lectura', `select public.gym_cardio_lectura('${P.A1}')`, { ok: ['dA', 'aA'] }, null],
  ['gym_codigo_info', rpc('gym_codigo_info', 'FUERZA22'), { ok: PERSONAS.filter(p => p !== 'anon') }, null],
  ['gym_unirse', rpc('gym_unirse', 'FUERZA22', VER, false, null), { ok: ['A6', 'N'], P0001: ['dA', 'aA', 'pA1', 'rA', 'A1', 'A7', 'dB', 'C'] }, null],
  ['gym_cancelar_solicitud', rpc('gym_cancelar_solicitud'), { ok: ['A6'], P0001: PERSONAS.filter(p => !['A6', 'anon'].includes(p)) }, 'solicitud_cancelada'],
  ['gym_unirse_token_info', rpc('gym_unirse_token_info', 'no-existe'), { ok: PERSONAS.filter(p => p !== 'anon') }, null],
  ['gym_unirse_token', rpc('gym_unirse_token', 'no-existe', '123', VER, false, null), { ok: PERSONAS.filter(p => p !== 'anon') }, null],
  ['gym_confirmar_hoja', rpc('gym_confirmar_hoja', VER, false, null), { ok: ['A1', 'A6', 'A7'], P0001: ['dA', 'aA', 'pA1', 'rA', 'dB', 'C', 'N'] }, 'confirmar_hoja'],
  ['gym_compartir_admin', rpc('gym_compartir_admin', true, VER), { ok: ['A1', 'A6'], P0001: ['dA', 'aA', 'pA1', 'rA', 'A7', 'dB', 'C', 'N'] }, 'compartir'],
  ['gym_salir', rpc('gym_salir', false), { ok: ['A1', 'A6', 'A7'], P0001: ['dA', 'aA', 'pA1', 'rA', 'dB', 'C', 'N'] }, null],
  ['gym_foto_proponer', rpc('gym_foto_proponer', `${G.A}/${F.A1}/${NUEVO}.jpg`), { P0001: PERSONAS.filter(p => p !== 'anon') }, null],
];

const INTERNAS = ['gym_tick()', 'gym_diaria()', 'release_lapsed_gyms()', 'gym_restaurar(uuid)', 'gym_cerrar_por_baja(uuid)', 'gym_cerrar_interno(uuid, text)',
  'gym_pedir(uuid, uuid, text, text, boolean, text)', 'gym_aprobar_interno(uuid, uuid)', 'gym_cupo_ok(uuid, uuid[])', 'gym_profe_no_puede(uuid, uuid, uuid)',
  'gym_alerta(uuid, text, text, text, text, jsonb)', 'gym_alerta_staff(uuid, text, text, jsonb)', 'gym_auditar(uuid, text, uuid, uuid, jsonb)',
  'gym_version_ok(text, text)', 'gym_hoy()', 'gym_token()', 'gym_hash(text)', 'gym_norm(text)', 'gym_codigo_nuevo()', 'gym_settings(uuid)', 'gym_mi_staff()',
  'gym_exigir(text[])', 'gym_exigir_altas()', 'gym_exigir_recepcion()', 'gym_tope_profes(uuid)', 'gym_profes_usados(uuid)', 'gym_plan_estado(uuid)',
  'gym_semaforo(uuid)', 'gym_json(uuid)', 'gym_crear_motivo(uuid)', 'gym_fotos_cupo_libre(text)', 'gym_fotos_cupo_alta()', 'gym_foto_valida(uuid, uuid, text)',
  'gym_invitacion_estado(uuid, uuid)', 'gym_socio_puede(uuid, uuid)', 'gym_ficha_datos(jsonb, boolean)', 'profiles_gym_baja()'];
const APP = ['mi_gimnasio()', 'gym_versiones()', 'gym_crear(text, text, text, text)', 'gym_config(jsonb)', 'gym_codigo_rotar()', 'gym_cerrar(text)',
  'gym_exportar(text)', 'gym_invitar(text)', 'gym_invitacion_revocar(uuid)', 'gym_invitaciones()', 'gym_invitacion_info(text)', 'gym_aceptar_invitacion(text)',
  'gym_cambiar_rol(uuid, text)', 'gym_quitar_staff(uuid, uuid)', 'gym_codigo_info(text)', 'gym_unirse(text, text, boolean, text)', 'gym_cancelar_solicitud()',
  'gym_unirse_token_info(text)', 'gym_unirse_token(text, text, text, boolean, text)', 'gym_confirmar_hoja(text, boolean, text)',
  'gym_compartir_admin(boolean, text)', 'gym_salir(boolean)', 'gym_foto_proponer(text)', 'gym_solicitudes()', 'gym_aprobar(uuid, uuid, uuid, boolean)',
  'gym_rechazar(uuid, text)', 'gym_ficha_crear(jsonb)', 'gym_ficha_editar(uuid, jsonb)', 'gym_ficha_link(uuid)', 'gym_nota_guardar(uuid, text)',
  'gym_asignar_profe(uuid[], uuid)', 'gym_dejar_socio(uuid)', 'gym_pausar(uuid, date)', 'gym_reactivar(uuid)', 'gym_baja(uuid, text)',
  'gym_socios_resumen()', 'gym_foto_staff(uuid, text)', 'gym_foto_resolver(uuid, boolean, text)', 'buscar_socio(text)', 'gym_ingreso_manual(uuid, uuid)',
  'gym_ingresos(date)', 'gym_registro_lectura(uuid, date)', 'gym_cardio_lectura(uuid)', 'gym_socios_compartidos()', 'gym_ve_avatar(text)',
  'gym_foto_carpeta(text, text, boolean)', 'gym_fotos_cupo_ok()', 'gym_mi_fila_oculta()'];

export default async function ({ t }){
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  const { J, V, PROBAR } = ayudas(db);

  // ===== Cada RPC con cada persona =====
  const quien = p => p === 'anon' ? 'anon' : P[p];
  for (const [nombre, sql, esp, accion] of CASOS){
    const r = await J(`select jsonb_object_agg(x.p, prueba.varios(jsonb_build_array(
        jsonb_build_object('quien', x.q, 'q', ${"'" + sql.replace(/'/g, "''") + "'"}),
        jsonb_build_object('quien', 'postgres', 'q', format('select jsonb_build_array((select count(*) from public.gym_audit where action = %L and actor_id::text = %L), prueba.invariantes())', ${accion ? "'" + accion + "'" : "''"}, x.q)))))
      from (values ${PERSONAS.map(p => `('${p}', '${quien(p)}')`).join(', ')}) x(p, q);`);
    const obtenido = {}, espera = {};
    for (const p of PERSONAS){
      const [res, despues] = r[p];
      obtenido[p] = 'error' in res ? res.error : 'ok';
      espera[p] = (esp.ok || []).includes(p) ? 'ok' : (esp.P0001 || []).includes(p) ? 'P0001' : '42501';
      if (obtenido[p] === 'ok'){
        if (accion) t.ok(despues.ok[0] >= 1, nombre + ' (' + p + '): queda en gym_audit («' + accion + '») con quien la hizo');
        t.eq(despues.ok[1], [], nombre + ' (' + p + '): invariantes I1 a I5 después');
      }
    }
    t.eq(obtenido, espera, nombre + ': quién puede (ok), quién recibe P0001 y quién 42501 — ' + JSON.stringify(Object.fromEntries(PERSONAS.map(p => [p, r[p][0].msg || 'ok']))).slice(0, 900));
  }

  // ===== Detalles de algunas =====
  // gym_config de dB cambia B, no A; la de dA cambia A.
  let x = await V([['dB', rpc('gym_config', { city: 'Funes' })], ['postgres', `select jsonb_object_agg(name, city) from public.gyms`]]);
  t.eq(canon(x[1]), canon({ 'Gimnasio Fuerza': 'Rosario', 'Gimnasio Norte': 'Funes' }), 'gym_config del dueño de B cambia solo B');
  // Lista blanca de gym_config.
  for (const [patch, msg] of [[{ owner_id: P.dB }, 'No se puede cambiar «owner_id».'], [{ settings: { profes_extra: 5 } }, 'No se puede cambiar «profes_extra».'],
    [{ settings: { ingreso_horas: 0 } }, 'Un ingreso cada 1 a 24 horas.'], [{ settings: { aprobar_solas: 'si' } }, 'Revisá «aprobar_solas».'],
    [{ name: 'X' }, 'El nombre del gimnasio tiene que tener entre 2 y 80 letras.'], [{ default_trainer_id: P.rA }, 'El profe por defecto tiene que ser profe del gimnasio.'],
    [{ contact_email: 'sin-arroba' }, 'Revisá el mail.']]){
    const r = await PROBAR('dA', rpc('gym_config', patch));
    t.eq(r, { error: 'P0001', msg }, 'gym_config rechaza ' + JSON.stringify(patch));
  }
  x = await V([['dA', rpc('gym_config', { settings: { aprobar_solas: true, ingreso_horas: 4 }, default_trainer_id: P.pA2, whatsapp: '+54 341 555-0000' })],
    ['dA', rpc('mi_gimnasio')]]);
  t.eq([x[0].settings.aprobar_solas, x[0].settings.ingreso_horas, x[0].settings.recepcion_altas, nom(x[1].gym.default_trainer_id), x[1].gym.whatsapp],
    [true, 4, true, 'pA2', '+54 341 555-0000'], 'gym_config guarda los interruptores (con sus valores por defecto para el resto) y el profe por defecto');
  // gym_exportar: tres tipos; con el plan liberado, igual.
  x = await V([['postgres', `update public.coach_billing set trial_ends_at = now() - interval '60 days', paid_until = now() - interval '30 days' where coach_id = '${P.dA}'`],
    ['dA', rpc('gym_exportar', 'socios')], ['dA', rpc('gym_exportar', 'ingresos')], ['dA', rpc('gym_exportar', 'equipo')], ['dA', rpc('gym_exportar', 'pagos')]]);
  t.eq([x[1].length, x[2].length, x[3].length, x[4].error], [6, 3, 5, 'P0001'], 'exportar socios (sin las solicitudes), ingresos y equipo anda con el plan vencido hace 30 días; otro tipo, P0001');
  t.ok(x[1].every(f => !('steps' in f) && !('kcal' in f)) && x[1].some(f => f.dni === '30999888'), 'el CSV de socios no trae registros de salud');
  // gym_ingresos: el profe ve los de sus socios; la recepción, los de hoy.
  x = await V([['rA', rpc('gym_ingreso_manual', NUEVO, F.A2)], ['dA', `select to_jsonb(public.gym_ingresos((current_date - 5)))`],
    ['pA1', `select to_jsonb(public.gym_ingresos((current_date - 5)))`], ['rA', `select to_jsonb(public.gym_ingresos((current_date - 5)))`]]);
  t.eq([x[1].length, x[2].map(e => nom(e.ficha)).sort(), x[3].map(e => nom(e.ficha))], [4, ['A1', 'A2', 'A2'], ['A2']],
    'gym_ingresos: el dueño ve los 4 de A; pA1, los de sus socios (A1 y A2); la recepción, solo los de hoy');
  // mi_gimnasio: forma por rol.
  const mg = await J(`select jsonb_object_agg(p, prueba.probar(p, 'select public.mi_gimnasio()')->'ok') from unnest(array['${P.dA}', '${P.aA}', '${P.pA1}', '${P.rA}', '${P.A1}', '${P.A6}', '${P.A7}', '${P.C}', '${P.N}', '${P.K}']) p;`);
  const de = k => mg[P[k]];
  t.eq([de('dA').rol, de('aA').rol, de('pA1').rol, de('rA').rol, de('A1').rol, de('A6').rol, de('A7').rol, de('C'), de('N'), de('K')],
    ['owner', 'admin', 'profe', 'recepcion', 'socio', 'pendiente', 'socio', null, null, null], 'mi_gimnasio: el rol de cada uno; null para quien no tiene nada que ver (y con el interruptor apagado, también para un coach)');
  t.ok(de('dA').plan && de('dA').plan.max === 100 && de('dA').plan.seats_used === 6 && de('dA').plan.estado === 'activo' && de('dA').plan.profes_tope === 8 && de('dA').plan.profes_usados === 2,
    'dueña: plan completo (6 de 100, activo, 2 de 8 profes): ' + JSON.stringify(de('dA').plan));
  t.eq(Object.keys(de('pA1').plan).sort(), ['estado', 'pausa_profes_el', 'vence'], 'profe: solo estado y fechas del plan');
  t.ok(!('plan' in de('rA')) && !('contadores' in de('rA')) && !('plan' in de('A1')), 'la recepción y el socio no reciben el plan');
  t.eq(canon(de('dA').contadores), canon({ solicitudes: 1, sin_profe: 1, falta_confirmacion: 1, fotos_pendientes: 0, ingresos_hoy: 0, invitaciones: 0, aptos_vencidos: 0 }),
    'contadores de la dueña: 1 solicitud (A6), 1 sin profe (A3), 1 sin confirmar (A7)');
  t.eq([de('pA1').mis_fichas.map(nom).sort(), de('pA1').mis_socios.map(nom).sort(), de('dA').mis_socios.map(nom)], [['A1', 'A2'], ['A1', 'A2'], ['A7']], 'mis_fichas y mis_socios del profe (y de la dueña como profe)');
  t.eq([de('A1').ficha.profe.name, de('A1').ficha.coach_externo, de('A1').ficha.foto, de('A7').ficha.terms_at, de('A6').solicitud.gym, de('dA').codigo],
    ['Martina Profe', false, 'falta', null, 'Gimnasio Fuerza', 'FUERZA22'], 'la ficha del socio (profe, coach externo, foto), la solicitud y el código del gimnasio para el equipo');

  // ===== gym_crear con el interruptor prendido =====
  const conAlta = `update public.app_config set value = '{"alta": true}' where key = 'gimnasios'`;
  const kP100 = `update public.coach_billing set plan = 'p100', max_clients = 100 where coach_id = '${P.K}'`;
  x = await V([['postgres', conAlta], ['postgres', kP100], ['K', rpc('mi_gimnasio')], ['K', rpc('gym_crear', '  Gimnasio Kay ', 'Funes', 'Santa Fe', VER)], ['K', rpc('mi_gimnasio')],
    ['postgres', `select jsonb_build_array((select max_clients from public.coach_billing where coach_id = '${P.K}'), (select count(*) from public.gym_audit where action = 'gym_crear'), prueba.invariantes())`]]);
  t.eq(x[2], { gym: null, rol: null, puede_crear: true }, 'coach sin gimnasio con el interruptor prendido: mi_gimnasio dice que puede crear');
  t.ok(x[3].gym_id && /^[A-Z2-9]{8}$/.test(x[3].code), 'gym_crear devuelve el gimnasio y el código: ' + JSON.stringify(x[3]));
  t.eq([x[4].rol, x[4].gym.name, x[4].codigo === x[3].code, x[5]], ['owner', 'Gimnasio Kay', true, [100, 1, []]], 'queda dueña, con el nombre sin espacios (p100 pagado: el tope sigue en 100)');
  for (const [antes, quien2, msg] of [
    [`update public.coach_billing set plan = 'p25', max_clients = 25 where coach_id = '${P.K}'`, 'K', 'Para crear un gimnasio escribinos por WhatsApp.'],
    ['select 1', 'C', 'Para crear un gimnasio escribinos por WhatsApp.'],
    [VENCE('K', '1 day').replace(/'K'/, `'${P.K}'`), 'K', 'Para crear un gimnasio escribinos por WhatsApp.'],
    ['select 1', 'N', 'Para crear un gimnasio necesitás una cuenta de coach.'],
    ['select 1', 'pA1', 'Ya sos del equipo de un gimnasio.']]){
    const r = await V([['postgres', conAlta], ['postgres', antes], [quien2, rpc('gym_crear', 'Otro Gimnasio', 'Funes', 'Santa Fe', VER)]]);
    t.eq(r[2], { error: 'P0001', msg }, 'gym_crear (' + quien2 + '): ' + msg);
  }
  x = await V([['postgres', conAlta], ['postgres', `update public.coach_billing set plan = 'trial', max_clients = 10, trial_ends_at = now() + interval '10 days', paid_until = null where coach_id = '${P.K}'`],
    ['K', rpc('gym_crear', 'Gimnasio Kay', 'Funes', 'Santa Fe', '2025-01-viejo')], ['K', rpc('gym_crear', 'Gimnasio Kay', 'Funes', 'Santa Fe', VER)],
    ['postgres', `select to_jsonb(max_clients) from public.coach_billing where coach_id = '${P.K}'`]]);
  t.eq([x[2], x[4]], [{ error: 'P0001', msg: 'Actualizá la página: cambió el texto que tenés que aceptar.' }, 100], 'con otra versión del contrato, no; con la prueba en curso, el tope pasa a 100');

  // ===== Internas y permisos =====
  const perm = await J(`select jsonb_object_agg(f, jsonb_build_array(has_function_privilege('anon', ('public.' || f)::regprocedure, 'execute'),
      has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'execute'))) from unnest(array[${[...INTERNAS, ...APP].map(f => `'${f}'`).join(', ')}]) f;`);
  t.eq(INTERNAS.filter(f => perm[f][0] || perm[f][1]), [], 'las internas no las llama la app (ni anon ni authenticated)');
  t.eq(APP.filter(f => perm[f][0] || !perm[f][1]), [], 'las de la app: con sesión sí, anon no');
  t.eq(await PROBAR('N', 'select to_jsonb(public.gym_tick())'), { error: '42501', msg: 'permission denied for function gym_tick' }, 'una cuenta no puede correr gym_tick');
  const def = await h.nueva('gize_sin');
  await def.sql('alter default privileges in schema public revoke all on functions from anon, authenticated;');
  for (const f of ['supabase/gimnasios.sql', 'supabase/gimnasios-vinculo.sql', 'supabase/gimnasios-lectura.sql', 'supabase/gimnasios-socios.sql']) await def.archivo(f);
  const permDef = await def.json(`select jsonb_object_agg(f, has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'execute'))
    from unnest(array[${APP.map(f => `'${f}'`).join(', ')}]) f;`);
  t.eq(Object.entries(permDef).filter(([, v]) => !v).map(([f]) => f), [], 'sin permisos por defecto, la app igual puede llamar a todas las suyas (grant escrito)');
  await def.borrar();
  await db.borrar();
}
