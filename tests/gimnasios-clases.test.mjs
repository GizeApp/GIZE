// Gimnasios, etapa 3: las clases (supabase/gimnasios-clases.sql) en Postgres de verdad (tests/pg.mjs;
// sin Postgres se saltea). Con las personas de la etapa 1 (tests/gimnasios-comun.mjs):
// - Cada RPC nueva con cada persona: quién puede, quién recibe 42501 y quién P0001; lo que hace el
//   equipo queda en gym_audit con quien lo hizo.
// - La grilla: crear (los datos que no van), cambiar (el día no; la hora mueve las fechas que vienen),
//   el profe tiene que ser del equipo, archivar (cancela lo que venía y avisa); la semana: la recepción
//   ve todas, cada profe las suyas.
// - Reservar: con lugar, confirmada; sin lugar, a la espera en orden; la misma reserva otra vez no
//   duplica; cancelar pasa solo al primero de la espera y le anota el aviso; el límite de horas para
//   cancelar y para reservar; los días para adelante; pausado y visita; la cuota vencida con el
//   interruptor; el tope de reservas.
// - SIN CARRERAS: cinco socios reservan los dos últimos lugares a la vez y entran dos.
// - Cancelar una fecha (avisa, no se reserva, se vuelve a dar), anotar y sacar desde el mostrador
//   (también una ficha sin app, con su aviso por mail), el presente (marcado por el profe o la
//   recepción, o del ingreso si coincide en horario), y la baja que suelta las reservas.
// - Nadie más que dueño y administración lee las tablas y nadie escribe directo; con el plan liberado
//   no se reserva pero se lee y se cancela; las ayudas no las llama la app; la limpieza de 12 meses.
import { conPg } from './pg.mjs';
import { P, F, G, ID, DATOS, ayudas, rpc, VENCE, conCanon } from './gimnasios-comun.mjs';

const PERSONAS = ['dA', 'aA', 'pA1', 'pA2', 'rA', 'A1', 'A6', 'dB', 'C', 'N', 'anon'];
const CS = ID('c51'), CY = ID('c52'), CN = ID('c53');
const R1 = ID('e301');
const HOY = "(now() at time zone 'America/Argentina/Buenos_Aires')::date";
const reservar = (clase, dia) => `select to_jsonb(public.gym_reservar('${clase}', '${dia}'))`;
const cancelarR = rid => `select to_jsonb(public.gym_reserva_cancelar(${rid}))`;
const alumnos = (clase, dia) => `select to_jsonb(public.gym_clase_alumnos('${clase}', '${dia}'))`;
const cfg = patch => `select to_jsonb(public.gym_clases_config('${JSON.stringify(patch)}'::jsonb))`;
// La reserva de una ficha en una clase y fecha (el id lo genera la base). prueba.rid la busca sin
// pasar por las políticas (la crea esta prueba, solo en su base): el socio no lee gym_bookings.
const RID = (ficha, clase, dia) => `prueba.rid('${ficha}', '${clase}', '${dia}')`;
const RID_SQL = `create function prueba.rid(ficha uuid, clase uuid, dia date) returns uuid language sql stable security definer set search_path = public as $f$
    select b.id from public.gym_bookings b join public.gym_class_dates d on d.id = b.date_id where b.gym_member_id = ficha and d.class_id = clase and d.day = dia $f$;
  grant usage on schema prueba to authenticated, anon, service_role; grant execute on function prueba.rid(uuid, uuid, date) to authenticated;`;
// Mueve la fecha de una clase (que ya existe) para que empiece dentro de tantos minutos (negativo: ya empezó).
const mover = (clase, dia, min, dur = 60) => `update public.gym_class_dates set starts_at = now() + interval '${min} minutes', ends_at = now() + interval '${min + dur} minutes'
  where class_id = '${clase}' and day = '${dia}'`;
const estados = (clase, dia) => `select coalesce(jsonb_object_agg(coalesce(prueba.n(m.member_id), m.full_name), b.status), '{}') from public.gym_bookings b join public.gym_members m on m.id = b.gym_member_id
  join public.gym_class_dates d on d.id = b.date_id where d.class_id = '${clase}' and d.day = '${dia}'`;

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  await db.sql(RID_SQL);
  const { J, V, HACER, INV } = ayudas(db);
  const D = await J(`select jsonb_build_object('hoy', ${HOY}, 'd2', ${HOY} + 2, 'd3', ${HOY} + 3, 'd9', ${HOY} + 9, 'dow2', extract(isodow from ${HOY} + 2)::int,
    'dow3', extract(isodow from ${HOY} + 3)::int, 'viejo', ${HOY} - 400)`);
  // La grilla de prueba: Spinning (Martina, cupo 2) dentro de dos días, Yoga (Lucas) dentro de tres y
  // una clase del otro gimnasio.
  await HACER('postgres', `insert into public.gym_classes (id, gym_id, name, trainer_id, weekday, start_time, minutes, capacity, room, starts_on) values
    ('${CS}', '${G.A}', 'Spinning', '${P.pA1}', ${D.dow2}, '19:00', 60, 2, 'Sala 1', ${HOY}),
    ('${CY}', '${G.A}', 'Yoga', '${P.pA2}', ${D.dow3}, '09:00', 50, 10, null, ${HOY}),
    ('${CN}', '${G.B}', 'Funcional', '${P.dB}', ${D.dow2}, '19:00', 60, 15, null, ${HOY})`);
  const quien = p => p === 'anon' ? 'anon' : P[p];
  const CLASE = { nombre: 'Pilates', profe: P.pA1, dia: 1, hora: '08:30', duracion: 45, cupo: 12, sala: 'Sala 2' };
  // Una fecha con una reserva confirmada de A1 (para quitar, cancelar y el presente).
  const CON_RESERVA = `insert into public.gym_bookings (id, gym_id, date_id, gym_member_id, status)
    select '${R1}', '${G.A}', public.gym_clase_fecha('${G.A}', '${CS}', '${D.d2}'), '${F.A1}', 'confirmada'`;

  // ===== Quién puede llamar cada RPC =====
  // [nombre, sql, {ok, P0001}, acción en gym_audit, antes (como postgres)]. El resto: 42501.
  const CASOS = [
    ['gym_clases', rpc('gym_clases'), { ok: ['dA', 'aA', 'pA1', 'pA2', 'rA', 'dB'] }, null],
    ['gym_clases_semana', `select to_jsonb(public.gym_clases_semana(null))`, { ok: ['dA', 'aA', 'pA1', 'pA2', 'rA', 'dB'] }, null],
    ['gym_clase_alumnos', alumnos(CS, D.d2), { ok: ['dA', 'aA', 'pA1', 'rA'], P0001: ['dB'] }, null],
    ['gym_clase_guardar', rpc('gym_clase_guardar', null, CLASE), { ok: ['dA', 'aA'], P0001: ['dB'] }, 'clase_guardar'],
    ['gym_clase_archivar', rpc('gym_clase_archivar', CY), { ok: ['dA', 'aA'], P0001: ['dB'] }, 'clase_archivar'],
    ['gym_clase_cancelar', `select to_jsonb(public.gym_clase_cancelar('${CS}', '${D.d2}', 'Feriado', true))`, { ok: ['dA', 'aA'], P0001: ['dB'] }, 'clase_cancelar'],
    ['gym_clases_config', cfg({ clases_dias: 14 }), { ok: ['dA', 'aA', 'dB'] }, 'config'],
    ['gym_clase_anotar', `select to_jsonb(public.gym_clase_anotar('${CS}', '${D.d2}', '${F.A3}'))`, { ok: ['dA', 'aA', 'rA'], P0001: ['dB'] }, 'clase_anotar'],
    ['gym_clase_quitar', rpc('gym_clase_quitar', R1), { ok: ['dA', 'aA', 'rA'], P0001: ['dB'] }, 'clase_quitar', CON_RESERVA],
    ['gym_clase_presente', rpc('gym_clase_presente', R1, true), { ok: ['dA', 'aA', 'pA1', 'rA'], P0001: ['dB'] }, 'clase_presente', CON_RESERVA + '; ' + mover(CS, D.d2, -10)],
    ['gym_mis_clases', rpc('gym_mis_clases'), { ok: PERSONAS.filter(p => p !== 'anon') }, null],
    ['gym_reservar', reservar(CS, D.d2), { ok: ['A1'], P0001: PERSONAS.filter(p => !['A1', 'anon'].includes(p)) }, null],
    ['gym_reserva_cancelar', cancelarR(`'${R1}'`), { ok: ['A1'], P0001: PERSONAS.filter(p => !['A1', 'anon'].includes(p)) }, null, CON_RESERVA],
  ];
  for (const [nombre, sql, esp, accion, antes] of CASOS){
    const r = await J(`select jsonb_object_agg(x.p, prueba.varios(jsonb_build_array(
        jsonb_build_object('quien', 'postgres', 'q', ${"'" + (antes || 'select 1').replace(/'/g, "''") + "'"}),
        jsonb_build_object('quien', x.q, 'q', ${"'" + sql.replace(/'/g, "''") + "'"}),
        jsonb_build_object('quien', 'postgres', 'q', format('select jsonb_build_array((select count(*) from public.gym_audit where action = %L and actor_id::text = %L), prueba.invariantes())', ${accion ? "'" + accion + "'" : "''"}, x.q)))))
      from (values ${PERSONAS.map(p => `('${p}', '${quien(p)}')`).join(', ')}) x(p, q);`);
    const obtenido = {}, espera = {};
    for (const p of PERSONAS){
      const [pre, res, despues] = r[p];
      t.ok(!('error' in pre), nombre + ': lo de antes anda' + ('error' in pre ? ' — ' + pre.msg : ''));
      obtenido[p] = 'error' in res ? res.error : 'ok';
      espera[p] = (esp.ok || []).includes(p) ? 'ok' : (esp.P0001 || []).includes(p) ? 'P0001' : '42501';
      if (obtenido[p] === 'ok'){
        if (accion) t.ok(despues.ok[0] >= 1, nombre + ' (' + p + '): queda en gym_audit («' + accion + '») con quien la hizo');
        t.eq(despues.ok[1], [], nombre + ' (' + p + '): invariantes después');
      }
    }
    t.eq(obtenido, espera, nombre + ': quién puede (ok), quién recibe P0001 y quién 42501 — ' + JSON.stringify(Object.fromEntries(PERSONAS.map(p => [p, r[p][1].msg || 'ok']))).slice(0, 900));
  }

  // ===== La grilla =====
  const guardar = (id, datos) => `select to_jsonb(public.gym_clase_guardar(${id ? `'${id}'` : 'null'}, '${JSON.stringify(datos).replace(/'/g, "''")}'::jsonb))`;
  let x = await V([['dA', guardar(null, Object.assign({}, CLASE, { nombre: '  Pilates  ', sala: '' }))],
    ['dA', guardar(null, Object.assign({}, CLASE, { nombre: 'P' }))], ['dA', guardar(null, Object.assign({}, CLASE, { dia: 8 }))],
    ['dA', guardar(null, Object.assign({}, CLASE, { hora: '25:00' }))], ['dA', guardar(null, Object.assign({}, CLASE, { hora: '08:30:15' }))],
    ['dA', guardar(null, Object.assign({}, CLASE, { duracion: 5 }))], ['dA', guardar(null, Object.assign({}, CLASE, { cupo: 0 }))],
    ['dA', guardar(null, Object.assign({}, CLASE, { profe: P.C }))], ['dA', guardar(null, Object.assign({}, CLASE, { profe: P.rA }))],
    ['dA', guardar(null, Object.assign({}, CLASE, { color: 'rojo' }))], ['dA', guardar(null, Object.assign({}, CLASE, { desde: D.viejo }))],
    ['dA', guardar(CS, { dia: D.dow2 === 7 ? 1 : D.dow2 + 1 })], ['dA', guardar(CS, { nombre: 'Spinning intenso', cupo: 3 })],
    ['dA', guardar(CN, { nombre: 'Otro' })], ['dA', guardar(null, Object.assign({}, CLASE, { profe: null }))]]);
  t.eq([x[0].nombre, x[0].hora, x[0].duracion, x[0].cupo, x[0].sala, x[0].dia, x[0].profe.id === P.pA1, x[0].desde], ['Pilates', '08:30', 45, 12, null, 1, true, D.hoy],
    'crear una clase: el nombre sin espacios, la sala vacía queda sin sala y arranca hoy');
  t.eq([x[1].msg, x[2].msg, x[3].msg, x[4].msg, x[5].msg, x[6].msg], ['El nombre de la clase tiene que tener entre 2 y 60 letras.', 'Elegí el día de la semana.',
    'Revisá los datos de la clase.', 'Revisá la hora de la clase.', 'La clase dura entre 15 minutos y 4 horas.', 'El cupo va de 1 a 500 personas.'], 'los datos que no van');
  t.eq([x[7].msg, x[8].msg], ['El profe de la clase tiene que ser del equipo del gimnasio.', 'El profe de la clase tiene que ser del equipo del gimnasio.'], 'el profe: del equipo (ni un coach de afuera ni la recepción)');
  t.eq([x[9].msg, x[10].msg], ['No se puede cambiar «color».', 'Revisá desde cuándo se da: de hoy a un año.'], 'campos de más y desde cuándo');
  t.eq(x[11].msg, 'El día de una clase no se cambia: archivala y creá otra para ese día.', 'el día no se cambia');
  t.eq([x[12].nombre, x[12].cupo, x[12].hora], ['Spinning intenso', 3, '19:00'], 'cambiar el nombre y el cupo (lo demás queda)');
  t.eq(x[13].msg, 'No encontramos esa clase.', 'la clase de otro gimnasio: no la encuentra');
  t.eq(x[14].profe, null, 'una clase sin profe');

  // La semana: la recepción ve todas; cada profe, las suyas; el otro gimnasio, la suya.
  x = await V([['rA', `select to_jsonb(public.gym_clases_semana(null))`], ['pA1', `select to_jsonb(public.gym_clases_semana(null))`],
    ['pA2', `select to_jsonb(public.gym_clases_semana(null))`], ['dB', `select to_jsonb(public.gym_clases_semana(null))`],
    ['pA1', rpc('gym_clases')], ['pA2', alumnos(CS, D.d2)], ['rA', `select to_jsonb(public.gym_clases_semana('${D.d9}'))`]]);
  const sem = s => s.clases.map(c => c.nombre + ' ' + c.fecha);
  t.eq(sem(x[0]), ['Spinning ' + D.d2, 'Yoga ' + D.d3], 'la recepción ve las dos clases de la semana, en orden');
  t.eq([sem(x[1]), sem(x[2]), sem(x[3])], [['Spinning ' + D.d2], ['Yoga ' + D.d3], ['Funcional ' + D.d2]], 'cada profe ve solo las suyas; el otro gimnasio, la suya');
  const sp = x[0].clases.find(c => c.nombre === 'Spinning');
  t.eq([sp.hora, sp.fin, sp.cupo, sp.sala, sp.confirmadas, sp.espera, sp.cancelada, sp.profe.name], ['19:00', '20:00', 2, 'Sala 1', 0, 0, false, 'Martina Profe'], 'cada clase con su hora, cupo, sala y profe');
  t.eq([x[4].map(c => c.nombre), x[5].error], [['Spinning'], '42501'], 'la grilla del profe: la suya; la lista de otra clase: no');
  t.eq(sem(x[6]).filter(s => s.startsWith('Spinning')), ['Spinning ' + D.d9], 'la semana que viene: la clase se repite');

  // ===== Reservar, la espera y cancelar =====
  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)], ['A3', reservar(CS, D.d2)], ['A5', reservar(CS, D.d2)],
    ['A1', reservar(CS, D.d2)], ['A3', rpc('gym_mis_clases')], ['postgres', estados(CS, D.d2)]]);
  t.eq([x[0].estado, x[1].estado, x[2].estado, x[2].posicion, x[3].estado, x[3].posicion], ['confirmada', 'confirmada', 'espera', 1, 'espera', 2],
    'cupo 2: los dos primeros confirmados, los demás a la espera en orden (también una visita)');
  t.eq([x[4].repetida, x[4].reserva === x[0].reserva, x[4].estado], [true, true, 'confirmada'], 'reservar otra vez: devuelve la misma reserva');
  const mi = x[5].clases.find(c => c.clase === CS && c.fecha === D.d2);
  t.eq([mi.estado, mi.posicion, mi.libres, mi.espera, mi.nombre, mi.profe, mi.hora], ['espera', 1, 0, 2, 'Spinning', 'Martina Profe', '19:00'], 'el socio ve su lugar en la espera y los libres');
  t.ok(!/Martina Sosa|Juan|30111222/.test(JSON.stringify(x[5])), 'el socio no ve quién más reservó');
  t.eq(x[6], { A1: 'confirmada', A2: 'confirmada', A3: 'espera', A5: 'espera' }, 'las reservas');

  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)], ['A3', reservar(CS, D.d2)], ['A5', reservar(CS, D.d2)],
    ['A1', cancelarR(RID(F.A1, CS, D.d2))], ['postgres', estados(CS, D.d2)], ['A3', rpc('gym_mis_clases')], ['A5', rpc('gym_mis_clases')],
    ['postgres', `select coalesce(jsonb_agg(jsonb_build_array(recipient = 'u:${P.A3}', kind, channel)), '[]') from public.gym_alerts where kind = 'clase_lugar'`],
    ['A1', cancelarR(RID(F.A1, CS, D.d2))], ['A1', reservar(CS, D.d2)], ['postgres', estados(CS, D.d2)]]);
  t.eq([x[4].promovidos, x[5]], [1, { A1: 'cancelada', A2: 'confirmada', A3: 'confirmada', A5: 'espera' }], 'A1 cancela: el primero de la espera (A3) pasa solo a confirmada');
  const m3 = x[6].clases.find(c => c.clase === CS && c.fecha === D.d2), m5 = x[7].clases.find(c => c.clase === CS && c.fecha === D.d2);
  t.eq([m3.estado, m3.promovida, m5.posicion], ['confirmada', true, 1], 'A3 ve que salió de la espera; A5 queda primera');
  t.eq(x[8], [[true, 'clase_lugar', 'push']], 'a A3 se le anota el aviso «clase_lugar» (push)');
  t.eq(x[9].estado, 'cancelada', 'cancelar otra vez: no pasa nada');
  t.eq([x[10].estado, x[10].posicion, x[11].A1], ['espera', 2, 'espera'], 'A1 vuelve a reservar: al final de la espera');

  // Los límites de horas, los días, la pausa, la visita, la cuota y el tope.
  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)], ['A3', reservar(CS, D.d2)],
    ['postgres', mover(CS, D.d2, 90)],
    ['A1', cancelarR(RID(F.A1, CS, D.d2))], ['A3', `select to_jsonb(public.gym_reserva_cancelar(${RID(F.A3, CS, D.d2)}))`],
    ['dA', cfg({ clases_cancelar_horas: 1 })], ['A1', cancelarR(RID(F.A1, CS, D.d2))], ['postgres', estados(CS, D.d2)],
    ['dA', cfg({ clases_reservar_horas: 3 })], ['A3', reservar(CS, D.d2)], ['dA', cfg({ clases_reservar_horas: 0 })],
    ['postgres', mover(CS, D.d2, -5)], ['A3', reservar(CS, D.d2)], ['A2', cancelarR("'00000000-0000-4000-8000-000000000000'")]]);
  t.eq(x[4].msg, 'Ya no se puede cancelar: faltan menos de 2 horas. Avisá en el gimnasio.', 'con lugar, se cancela hasta 2 horas antes (por defecto)');
  t.eq(x[5].estado, 'cancelada', 'en la espera, se cancela hasta que empieza');
  t.eq([x[6].clases.cancelar_horas, x[7].estado, x[7].promovidos, x[8].A1, x[8].A2], [1, 'cancelada', 0, 'cancelada', 'confirmada'], 'con «hasta 1 hora antes», a 90 minutos se cancela');
  t.eq(x[10].msg, 'Las reservas cierran 3 horas antes de la clase.', 'con «reservar hasta 3 horas antes», a 90 minutos no se reserva');
  t.eq(x[13].msg, 'La clase ya empezó.', 'empezada, no se reserva');
  t.eq(x[14].msg, 'No encontramos esa reserva.', 'una reserva que no es suya: no la encuentra');

  x = await V([['A1', reservar(CS, D.d9)], ['dA', cfg({ clases_dias: 14 })], ['A1', reservar(CS, D.d9)], ['A1', reservar(CS, D.d3)],
    ['A1', reservar(CS, D.viejo)], ['A1', reservar(CN, D.d2)],
    ['postgres', `update public.gym_members set status = 'pausado', paused_until = ${HOY} + 30 where id = '${F.A2}'`], ['A2', reservar(CS, D.d2)], ['A2', rpc('gym_mis_clases')],
    ['A5', reservar(CS, D.d9)],
    ['postgres', `insert into public.gym_fee_types (gym_id, name, amount, months) values ('${G.A}', 'Musculación', 30000, 1);
      update public.gym_members set fee_type_id = (select id from public.gym_fee_types where gym_id = '${G.A}'), fee_due = ${HOY} - 3 where id = '${F.A3}'`],
    ['A3', reservar(CY, D.d3)], ['A3', cancelarR(RID(F.A3, CY, D.d3))],
    ['dA', cfg({ clases_cuota_bloquea: true })], ['A3', reservar(CY, D.d3)], ['A3', rpc('gym_mis_clases')],
    ['dA', cfg({ clases_dias: 0 })], ['dA', cfg({ clases_cancelar_horas: 2.5 })], ['dA', cfg({ ingreso_horas: 2 })], ['dA', cfg({ clases_cuota_bloquea: 'si' })]]);
  t.eq(x[0].msg, 'Esa fecha todavía no está abierta para reservar.', 'por defecto se reserva hasta 7 días para adelante');
  t.eq([x[1].clases.dias, x[2].estado], [14, 'confirmada'], 'con 14 días, sí');
  t.eq([x[3].msg, x[4].msg, x[5].msg], ['Esa clase no se da ese día.', 'Esa fecha todavía no está abierta para reservar.', 'No encontramos esa clase.'],
    'otro día de la semana, una fecha pasada o la clase de otro gimnasio: no');
  t.eq([x[7].msg, x[8].ficha_estado, x[8].clases.length > 0], ['Tu lugar en el gimnasio está pausado: cuando vuelvas, vas a poder reservar.', 'pausado', true], 'pausado: mira las clases y no reserva');
  t.eq(x[9].msg, 'Tu visita no llega hasta ese día.', 'una visita reserva solo hasta su último día');
  t.eq([x[11].estado, x[12].estado], ['confirmada', 'cancelada'], 'con la cuota vencida y el interruptor apagado: reserva');
  t.eq([x[13].clases.cuota_bloquea, x[14].msg, x[15].cuota_vencida], [true, 'Tu cuota está vencida: para reservar, hablá con el gimnasio.', true], 'con «no reservar con la cuota vencida»: no reserva, y lo ve');
  t.eq([x[16].msg, x[17].msg, x[18].msg, x[19].msg], ['Se puede reservar de 1 a 28 días para adelante.', 'Las horas van de 0 a 72.', 'No se puede cambiar «ingreso_horas».', 'Revisá «clases_cuota_bloquea».'],
    'los interruptores que no van');

  // El tope de 10 reservas por delante: cuatro semanas de Spinning y seis clases más el mismo día.
  const OTRA = n => 'a0000000-0000-4000-8000-0000000c600' + n;
  await HACER('postgres', `update public.gym_classes set capacity = 50 where id = '${CS}'; update public.gyms set settings = settings || '{"clases_dias": 28}' where id = '${G.A}';
    insert into public.gym_classes (id, gym_id, name, weekday, start_time, minutes, capacity, starts_on)
    select ('a0000000-0000-4000-8000-0000000c600' || n)::uuid, '${G.A}', 'Clase ' || n, ${D.dow2}, make_time(6 + n, 0, 0), 60, 5, ${HOY} from generate_series(1, 7) n`);
  const semanas = [0, 7, 14, 21].map(n => J(`select to_jsonb(${HOY} + 2 + ${n})`));
  x = await V([...(await Promise.all(semanas)).map(d => ['A1', reservar(CS, d)]), ...[1, 2, 3, 4, 5, 6].map(n => ['A1', reservar(OTRA(n), D.d2)]),
    ['A1', reservar(OTRA(7), D.d2)]]);
  t.eq(x.slice(0, 10).map(r => r.estado || r.msg), Array(10).fill('confirmada'), 'diez reservas por delante');
  t.eq(x[10].msg, 'Tenés 10 reservas por delante: cancelá alguna para reservar otra.', 'la once: no');
  await HACER('postgres', `delete from public.gym_classes where name like 'Clase %'; update public.gym_classes set capacity = 2 where id = '${CS}';
    update public.gyms set settings = settings - 'clases_dias' where id = '${G.A}'`);

  // Subir el cupo pasa a la espera; cambiar la hora mueve las fechas que vienen.
  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)], ['A3', reservar(CS, D.d2)], ['A5', reservar(CS, D.d2)],
    ['dA', guardar(CS, { cupo: 3, hora: '20:15' })], ['postgres', estados(CS, D.d2)],
    ['rA', `select to_jsonb(public.gym_clases_semana(null))`]]);
  t.eq(x[5], { A1: 'confirmada', A2: 'confirmada', A3: 'confirmada', A5: 'espera' }, 'cupo de 2 a 3: el primero de la espera pasa');
  const sp2 = x[6].clases.find(c => c.clase === CS);
  t.eq([sp2.hora, sp2.fin, sp2.confirmadas, sp2.espera], ['20:15', '21:15', 3, 1], 'la hora nueva vale para la fecha que ya tenía reservas');

  // ===== SIN CARRERAS: cinco socios a la vez por dos lugares =====
  const carrera = await h.nueva('gize_con');
  await carrera.json(DATOS);
  await carrera.sql(`insert into public.gym_classes (id, gym_id, name, trainer_id, weekday, start_time, minutes, capacity, starts_on) values
    ('${CS}', '${G.A}', 'Spinning', '${P.pA1}', ${D.dow2}, '19:00', 60, 2, ${HOY});
    select public.gym_clase_fecha('${G.A}', '${CS}', '${D.d2}');`);
  const corre = who => carrera.sql(`begin; select prueba.ser('${P[who]}'); select public.gym_reservar('${CS}', '${D.d2}'); select pg_sleep(0.4); commit;`);
  const res = await Promise.allSettled(['A1', 'A2', 'A3', 'A5', 'A7'].map(corre));
  t.eq(res.filter(r => r.status === 'rejected').map(r => r.reason.message), [], 'las cinco reservas a la vez terminan bien');
  const cuenta = await carrera.json(`select jsonb_build_object('fechas', (select count(*) from public.gym_class_dates), 'confirmadas', count(*) filter (where status = 'confirmada'),
    'espera', count(*) filter (where status = 'espera'), 'posiciones', (select count(distinct queued_at) from public.gym_bookings where status = 'espera')) from public.gym_bookings`);
  t.eq(cuenta, { fechas: 1, confirmadas: 2, espera: 3, posiciones: 3 }, 'dos con lugar (el cupo) y tres en la espera, cada uno en su lugar');
  // Y a la vez: dos cancelan y tres esperan; entran exactamente dos.
  const ids = await carrera.json(`select jsonb_object_agg(prueba.n(m.member_id), b.id) from public.gym_bookings b join public.gym_members m on m.id = b.gym_member_id where b.status = 'confirmada'`);
  const cancela = who => carrera.sql(`begin; select prueba.ser('${P[who]}'); select public.gym_reserva_cancelar('${ids[who]}'); select pg_sleep(0.3); commit;`);
  const res2 = await Promise.allSettled(Object.keys(ids).map(cancela));
  t.eq(res2.filter(r => r.status === 'rejected').map(r => r.reason.message), [], 'las dos cancelaciones a la vez terminan bien');
  t.eq(await carrera.json(`select jsonb_build_object('confirmadas', count(*) filter (where status = 'confirmada'), 'espera', count(*) filter (where status = 'espera'),
    'avisos', (select count(*) from public.gym_alerts where kind = 'clase_lugar')) from public.gym_bookings`), { confirmadas: 2, espera: 1, avisos: 2 },
    'pasan dos de la espera (ni uno más que el cupo), cada uno con su aviso');
  await carrera.borrar();

  // ===== Cancelar una fecha, anotar y sacar desde el mostrador =====
  const cancelarF = (c, d, mot, si) => `select to_jsonb(public.gym_clase_cancelar('${c}', '${d}', ${mot ? `'${mot}'` : 'null'}, ${si}))`;
  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)], ['A3', reservar(CS, D.d2)],
    ['dA', cancelarF(CS, D.d2, 'Feriado', true)], ['A5', reservar(CS, D.d2)], ['A5', rpc('gym_mis_clases')],
    ['postgres', `select jsonb_agg(kind order by kind) from public.gym_alerts where kind = 'clase_cancelada'`],
    ['A1', cancelarR(RID(F.A1, CS, D.d2))],
    ['dA', cancelarF(CS, D.d2, null, false)], ['postgres', estados(CS, D.d2)], ['dA', cancelarF(CS, D.d3, null, true)],
    ['postgres', mover(CS, D.d2, -5)], ['dA', cancelarF(CS, D.d2, null, true)]]);
  t.eq([x[3].cancelada, x[3].avisados], [true, 3], 'cancelar la fecha avisa a los tres (con lugar y en la espera)');
  t.eq(x[4].msg, 'Esa clase está cancelada: Feriado', 'en una fecha cancelada no se reserva (con el motivo)');
  const c5 = x[5].clases.find(c => c.clase === CS && c.fecha === D.d2);
  t.eq([c5.cancelada, c5.motivo], [true, 'Feriado'], 'el socio la ve cancelada, con el motivo');
  t.eq(x[6], ['clase_cancelada', 'clase_cancelada', 'clase_cancelada'], 'un aviso a cada uno');
  t.eq(x[7].estado, 'cancelada', 'con la fecha cancelada, cancelar la reserva anda a cualquier hora');
  t.eq(x[9], { A1: 'cancelada', A2: 'confirmada', A3: 'confirmada' }, 'volver a darla: las reservas siguen y la espera avanza (A1 había cancelado)');
  t.eq(x[10].msg, 'Esa clase no se da ese día.', 'cancelar un día en que no se da: no');
  t.eq(x[12].msg, 'Esa clase ya empezó: no se puede cambiar.', 'una clase empezada no se cancela');

  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)],
    ['rA', `select to_jsonb(public.gym_clase_anotar('${CS}', '${D.d2}', '${F.A4}'))`],
    ['rA', `select to_jsonb(public.gym_clase_anotar('${CS}', '${D.d2}', '${F.A6}'))`],
    ['rA', `select to_jsonb(public.gym_clase_anotar('${CS}', '${D.d2}', '${F.B1}'))`],
    ['rA', `select to_jsonb(public.gym_clase_quitar(${RID(F.A2, CS, D.d2)}))`],
    ['postgres', estados(CS, D.d2)],
    ['postgres', `select jsonb_agg(jsonb_build_array(recipient = 'f:${F.A4}', channel)) from public.gym_alerts where kind = 'clase_lugar'`],
    ['rA', alumnos(CS, D.d2)]]);
  t.eq([x[2].estado, x[2].posicion], ['espera', 1], 'la recepción anota una ficha sin app: llena, a la espera');
  t.eq([x[3].msg, x[4].msg], ['Solo se anotan socios activos o visitas.', 'Solo se anotan socios activos o visitas.'], 'ni una solicitud ni la ficha de otro gimnasio');
  t.eq([x[5].promovidos, x[6]], [1, { A1: 'confirmada', A2: 'cancelada', 'Raúl Sin App': 'confirmada' }], 'la recepción saca a A2: la ficha sin app pasa a confirmada');
  t.eq(x[7], [[true, 'mail']], 'el aviso a la ficha sin app va por mail');
  const lista = x[8];
  t.eq(lista.alumnos.map(a => [a.nombre, a.estado, a.sin_app]), [['Martina Sosa', 'confirmada', false], ['Raúl Sin App', 'confirmada', true]], 'la lista: quién tiene lugar');
  t.eq([lista.clase.nombre, lista.hora, lista.fin, lista.canceladas, lista.se_marca], ['Spinning', '19:00', '20:00', 1, false], 'la lista con la clase, la hora y cuántos cancelaron');

  // ===== El presente =====
  const ING = ID('e311');
  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)], ['A3', reservar(CS, D.d2)],
    ['postgres', mover(CS, D.d2, -20)],
    ['postgres', `insert into public.gym_entries (gym_id, gym_member_id, method, result, at) values ('${G.A}', '${F.A1}', 'manual', 'ok', now() - interval '30 minutes'),
      ('${G.A}', '${F.A2}', 'manual', 'ok', now() - interval '4 hours')`],
    ['pA1', alumnos(CS, D.d2)],
    ['pA1', `select to_jsonb(public.gym_clase_presente(${RID(F.A2, CS, D.d2)}, true))`],
    ['rA', `select to_jsonb(public.gym_clase_presente(${RID(F.A1, CS, D.d2)}, false))`],
    ['pA1', `select to_jsonb(public.gym_clase_presente(${RID(F.A3, CS, D.d2)}, true))`],
    ['pA2', `select to_jsonb(public.gym_clase_presente(${RID(F.A1, CS, D.d2)}, true))`],
    ['dA', alumnos(CS, D.d2)],
    ['rA', `select to_jsonb(public.gym_clase_presente(${RID(F.A2, CS, D.d2)}, null))`],
    ['rA', rpc('gym_ingreso_manual', ING, F.A2)], ['rA', alumnos(CS, D.d2)], ['rA', `select to_jsonb(public.gym_clases_semana(null))`]]);
  const pres = l => Object.fromEntries(l.alumnos.map(a => [a.nombre, a.presente]));
  t.eq(pres(x[5]), { 'Martina Sosa': true, 'Juan Pérez': false, 'Lucía Gómez': null }, 'sin marcar: presente quien entró al gimnasio en horario (A1); A2 entró 4 horas antes: no');
  t.ok(x[5].se_marca && x[5].empezo && !!x[5].alumnos.find(a => a.nombre === 'Martina Sosa').ingreso, 'empezada: se marca, y se ve a qué hora entró');
  t.eq([x[6].presente, x[6].marcado, x[7].presente, x[7].marcado], [true, true, false, false], 'el profe marca presente a A2; la recepción, ausente a A1 (aunque entró)');
  t.eq([x[8].msg, x[9].error], ['El presente se marca a quien tiene lugar en la clase.', '42501'], 'a quien espera no se le marca; otro profe no marca');
  t.eq(pres(x[10]), { 'Martina Sosa': false, 'Juan Pérez': true, 'Lucía Gómez': null }, 'lo marcado vale más que el ingreso');
  t.eq([x[11].marcado, x[11].presente], [null, false], 'desmarcar: vuelve a salir del ingreso');
  t.eq(pres(x[13])['Juan Pérez'], true, 'la recepción registra el ingreso de A2 durante la clase: presente');
  t.eq(x[14].clases.find(c => c.clase === CS).presentes, 1, 'la semana cuenta los presentes');
  x = await V([['A1', reservar(CS, D.d2)], ['postgres', mover(CS, D.d2, 120)],
    ['pA1', `select to_jsonb(public.gym_clase_presente(${RID(F.A1, CS, D.d2)}, true))`]]);
  t.eq(x[2].msg, 'El presente se marca desde una hora antes de la clase.', 'antes de tiempo: no');

  // ===== La baja suelta las reservas; archivar avisa =====
  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)], ['A3', reservar(CS, D.d2)],
    ['dA', `select to_jsonb(public.gym_baja('${F.A1}', null))`], ['postgres', estados(CS, D.d2)],
    ['A3', rpc('gym_salir', false)], ['postgres', estados(CS, D.d2)],
    ['A5', reservar(CY, D.d3)], ['dA', rpc('gym_clase_archivar', CY)], ['A5', rpc('gym_mis_clases')], ['rA', rpc('gym_clases')], ['dA', rpc('gym_clases')],
    ['A5', reservar(CY, D.d3)], ['dA', guardar(CY, { cupo: 4 })]]);
  t.eq(x[4], { A1: 'cancelada', A2: 'confirmada', A3: 'confirmada' }, 'la baja de A1 suelta su lugar y pasa A3');
  t.eq(x[6], { A1: 'cancelada', A2: 'confirmada', A3: 'cancelada' }, 'A3 sale del gimnasio: suelta su reserva');
  t.eq([x[8].avisados, x[9].clases.find(c => c.clase === CY).cancelada, x[9].clases.find(c => c.clase === CY).motivo], [1, true, 'La clase dejó de darse.'], 'archivar: la fecha que venía se cancela y se avisa');
  t.eq([x[10].map(c => c.nombre), x[11].find(c => c.id === CY).archivada], [['Spinning'], true], 'la recepción no ve las archivadas; el dueño sí, marcadas');
  t.eq([x[12].msg, x[13].msg], ['Esa clase está cancelada: La clase dejó de darse.', 'Esa clase está archivada.'], 'archivada: no se reserva ni se cambia');

  // ===== Leer las tablas directo =====
  const cuentaT = (w, tb) => [w, `select to_jsonb(count(*)) from public.${tb}`];
  x = await V([['A1', reservar(CS, D.d2)],
    ...['dA', 'aA', 'pA1', 'rA', 'A1', 'dB', 'anon'].flatMap(w => [cuentaT(w, 'gym_classes'), cuentaT(w, 'gym_class_dates'), cuentaT(w, 'gym_bookings')]),
    ['A1', `insert into public.gym_bookings (gym_id, date_id, gym_member_id, status) select '${G.A}', id, '${F.A2}', 'confirmada' from public.gym_class_dates limit 1`],
    ['dA', `update public.gym_classes set capacity = 99`], ['dA', `delete from public.gym_bookings`]]);
  t.eq(x.slice(1, 22).map(v => v.error || v), [2, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, '42501', '42501', '42501'],
    'dueño y administración leen las clases, las fechas y las reservas de su gimnasio; profe, recepción y socio no (por funciones); anon, nada');
  t.eq(x.slice(22).map(v => v.error), ['42501', '42501', '42501'], 'nadie escribe directo');

  // ===== Con el plan liberado: no se reserva; se lee y se cancela =====
  x = await V([['A1', reservar(CS, D.d2)], ['postgres', VENCE('dA', '30 days')], ['A2', reservar(CS, D.d2)], ['dA', guardar(null, CLASE)],
    ['rA', `select to_jsonb(public.gym_clase_anotar('${CS}', '${D.d2}', '${F.A3}'))`], ['rA', `select to_jsonb(public.gym_clases_semana(null))`],
    ['A1', cancelarR(RID(F.A1, CS, D.d2))], ['A1', rpc('gym_mis_clases')]]);
  t.eq([x[2].msg, x[3].msg, x[4].msg], ['Las reservas están pausadas: hablá con el gimnasio.', 'Las clases están pausadas en este momento.',
    'Las clases están pausadas: hablá con la administración del gimnasio.'], 'con el plan vencido hace más de 10 días no se reserva, ni se cambia la grilla, ni se anota (sin nombrar el plan)');
  t.eq([!!x[5].clases, x[6].estado, !!x[7].clases], [true, 'cancelada', true], 'se lee la semana, el socio cancela y ve sus clases');

  // ===== Internas, permisos, borrar y limpiar =====
  const INTERNAS = ['gym_clases_cfg(uuid)', 'gym_exigir_clases(boolean)', 'gym_clase_json(uuid)', 'gym_clases_ocurrencias(uuid, date, date)', 'gym_clase_fecha(uuid, uuid, date)',
    'gym_clase_ingreso(uuid, timestamp with time zone, timestamp with time zone)', 'gym_clase_cuenta(uuid)', 'gym_clase_aviso(uuid, uuid, text, jsonb)', 'gym_clase_promover(uuid)',
    'gym_clase_reservar_en(uuid, uuid, uuid)', 'gym_clase_avisar_cancelada(uuid)', 'gym_clases_mi_ficha()', 'gym_members_clases_baja()', 'gym_clases_limpiar()'];
  const APP = ['gym_clases()', 'gym_clase_guardar(uuid, jsonb)', 'gym_clase_archivar(uuid)', 'gym_clase_cancelar(uuid, date, text, boolean)', 'gym_clases_config(jsonb)',
    'gym_clases_semana(date)', 'gym_clase_alumnos(uuid, date)', 'gym_clase_presente(uuid, boolean)', 'gym_clase_anotar(uuid, date, uuid)', 'gym_clase_quitar(uuid)',
    'gym_mis_clases()', 'gym_reservar(uuid, date)', 'gym_reserva_cancelar(uuid)'];
  const perm = await J(`select jsonb_object_agg(f, jsonb_build_array(has_function_privilege('anon', ('public.' || f)::regprocedure, 'execute'),
      has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'execute'))) from unnest(array[${[...INTERNAS, ...APP].map(f => `'${f}'`).join(', ')}]) f;`);
  t.eq(INTERNAS.filter(f => perm[f][0] || perm[f][1]), [], 'las ayudas no las llama la app (ni anon ni authenticated)');
  t.eq(APP.filter(f => perm[f][0] || !perm[f][1]), [], 'las de la app: con sesión sí, anon no');
  x = await V([['A1', reservar(CS, D.d2)], ['A2', reservar(CS, D.d2)],
    ['postgres', `insert into public.gym_class_dates (gym_id, class_id, day, starts_at, ends_at) values ('${G.A}', '${CS}', '${D.viejo}', now() - interval '400 days', now() - interval '400 days' + interval '1 hour')`],
    ['servicio', `select to_jsonb(public.gym_clases_limpiar())`], ['postgres', `select to_jsonb(count(*)) from public.gym_class_dates`],
    ['postgres', `delete from public.gym_members where id = '${F.A1}'`], ['postgres', `select to_jsonb(count(*)) from public.gym_bookings`],
    ['postgres', `delete from public.gyms where id = '${G.A}'`],
    ['postgres', `select jsonb_build_array((select count(*) from public.gym_bookings), (select count(*) from public.gym_class_dates), (select count(*) from public.gym_classes))`],
    ['postgres', `select to_jsonb(count(*)) from cron.job where jobname = 'gize-gym-clases'`]]);
  t.eq([x[3], x[4]], [1, 1], 'la limpieza borra las fechas de hace más de 12 meses (la de esta semana queda)');
  t.eq(x[6], 1, 'las reservas se van con la ficha');
  t.eq(x[8], [0, 0, 1], 'las clases, las fechas y las reservas se van con el gimnasio (queda la del otro)');
  t.eq(x[9], 1, 'la tarea diaria está programada');
  t.eq(await INV(), [], 'invariantes al final');
  await db.borrar();
}
