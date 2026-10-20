// Gimnasios, etapa 1: el chat dentro de un gimnasio (§6.4, §9 P2 y P3) en Postgres de verdad
// (tests/pg.mjs; sin Postgres se saltea).
// - coach_messages (política «mensajes: el coach ve los suyos» de gimnasios-vinculo.sql): el profe lee
//   sus conversaciones mientras atiende al socio; cuando deja de atenderlo (lo pasan a otro profe, lo
//   deja, se va del equipo) deja de leer lo que se mandaron en el gimnasio (gym_id). Lo de fuera del
//   gimnasio (gym_id null) y entre un coach independiente y su alumno no cambia. El socio lee todo. La
//   dueña, la administración y la recepción no leen chats ajenos.
// - chat-audio (escuchar): el socio sigue escuchando todos sus audios aunque cambie de profe; el profe
//   que dejó de atenderlo ya no; nadie más.
// - coach_client_ok (lo que van a usar rapid-worker y avisos-coach, P4): sí con el profe que atiende,
//   no con el que dejó de atender; con un coach de afuera, como hoy.
// - El gym_id de cada mensaje lo pone la base (trigger coach_messages_gym), también lo que guarda
//   chat_guardar; chat_unread y chat_mark_read siguen la misma regla que la política del coach.
import { conPg } from './pg.mjs';
import { P, F, G, DATOS, ayudas, rpc, nom, conCanon } from './gimnasios-comun.mjs';

const AUDIO = `${P.pA1}/${P.A1}/audio-de-prueba-01.webm`, AUDIO_P1 = `${P.pA1}/${P.P1}/audio-de-prueba-02.webm`, AUDIO_C = `${P.C}/${P.C1}/audio-de-prueba-03.webm`;
const mensajes = `select coalesce(jsonb_agg(coach_id::text || '→' || client_id::text), '[]') from public.coach_messages`;
const audios = `select coalesce(jsonb_agg(name order by name), '[]') from storage.objects where bucket_id = 'chat-audio'`;

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  await db.sql(`insert into storage.objects (bucket_id, name, owner_id) values ('chat-audio', '${AUDIO}', '${P.pA1}'), ('chat-audio', '${AUDIO_P1}', '${P.pA1}'),
    ('chat-audio', '${AUDIO_C}', '${P.C}');`);
  const { J, V } = ayudas(db);
  const nombres = a => [...new Set(a.map(m => m.split('→').map(nom).join('→')))].sort();
  const lee = async (cambio, quienes) => {
    const r = await V([['postgres', cambio], ...quienes.flatMap(w => [[w, mensajes], [w, audios]])]);
    return Object.fromEntries(quienes.map((w, i) => [w, { msj: nombres(r[1 + 2 * i]), audios: r[2 + 2 * i].length }]));
  };

  // ===== Al empezar =====
  let x = await lee('select 1', ['pA1', 'A1', 'P1', 'dA', 'aA', 'rA', 'pA2', 'C', 'C1', 'A2']);
  t.eq(x.pA1, { msj: ['pA1→A1', 'pA1→P1'], audios: 2 }, 'pA1 lee su chat con A1 (en el gimnasio) y con P1 (alumno propio), y escucha sus audios');
  t.eq([x.A1, x.P1], [{ msj: ['pA1→A1'], audios: 1 }, { msj: ['pA1→P1'], audios: 1 }], 'cada socio y alumno, lo suyo');
  t.eq([x.dA.msj, x.aA.msj, x.rA.msj, x.pA2.msj, x.A2.msj], [['dA→A7', 'dA→D1'], [], [], [], []],
    'la dueña lee solo sus conversaciones (no la de pA1 con A1); el encargado, la recepción, otro profe y otro socio, nada');
  t.eq([x.dA.audios, x.aA.audios, x.rA.audios, x.pA2.audios, x.A2.audios], [0, 0, 0, 0, 0], 'y no escuchan ningún audio ajeno');
  t.eq([x.C, x.C1], [{ msj: ['C→C1'], audios: 1 }, { msj: ['C→C1'], audios: 1 }], 'coach independiente y su alumna: como hoy');

  // ===== El profe deja de atender al socio =====
  for (const [que, cambio] of [
    ['lo pasan a otro profe (gym_asignar_profe)', `select prueba.hacer('${P.dA}', $q$select to_jsonb(public.gym_asignar_profe(array['${F.A1}']::uuid[], '${P.pA2}'))$q$)`],
    ['el profe lo deja (gym_dejar_socio)', `select prueba.hacer('${P.pA1}', $q$select to_jsonb(public.gym_dejar_socio('${F.A1}'))$q$)`],
    ['lo quitan del equipo (gym_quitar_staff)', `select prueba.hacer('${P.dA}', $q$select to_jsonb(public.gym_quitar_staff('${P.pA1}', '${P.pA2}'))$q$)`],
    ['el socio sale del gimnasio', `select prueba.hacer('${P.A1}', $q$select to_jsonb(public.gym_salir(false))$q$)`]]){
    x = await lee(cambio, ['pA1', 'A1', 'pA2', 'dA']);
    t.eq([x.pA1, x.A1, x.pA2.msj, x.dA.msj], [{ msj: ['pA1→P1'], audios: 1 }, { msj: ['pA1→A1'], audios: 1 }, [], ['dA→A7', 'dA→D1']],
      que + ': pA1 deja de leer y escuchar lo de A1 (sigue con P1); A1 conserva todo, texto y audios; el profe nuevo empieza de cero; la dueña no lo lee');
  }
  x = await lee(`select prueba.hacer('${P.A1}', $q$select to_jsonb(public.gym_salir(true))$q$)`, ['pA1', 'A1']);
  t.eq([x.pA1.msj, x.A1.msj], [['pA1→A1', 'pA1→P1'], ['pA1→A1']], 'si sale y sigue con su profe como alumno propio, siguen leyendo la conversación');

  // ===== Entre un coach independiente y su alumno, nada cambia =====
  x = await lee(`update public.profiles set coach_id = null where id = '${P.C1}'`, ['C', 'C1']);
  t.eq([x.C, x.C1], [{ msj: ['C→C1'], audios: 0 }, { msj: ['C→C1'], audios: 1 }],
    'si la alumna se desvincula de un coach independiente: él sigue leyendo los mensajes (gym_id vacío, como hoy) y ya no escucha los audios (como hoy); ella sí');

  // ===== coach_client_ok (rapid-worker y avisos-coach, P4) =====
  const ok = (c, s) => ['servicio', `select to_jsonb(public.coach_client_ok('${P[c]}', '${P[s]}'))`];
  x = await V([ok('pA1', 'A1'), ok('pA2', 'A1'), ok('dA', 'A1'), ok('C', 'C1'), ok('pA1', 'P1'),
    ['postgres', `select prueba.hacer('${P.dA}', $q$select to_jsonb(public.gym_asignar_profe(array['${F.A1}']::uuid[], '${P.pA2}'))$q$)`],
    ok('pA1', 'A1'), ok('pA2', 'A1')]);
  t.eq([x[0], x[1], x[2], x[3], x[4], x[6], x[7]], [true, false, false, true, true, false, true],
    'coach_client_ok: sí con el profe que atiende; no con otro profe ni con la dueña; después de cambiar de profe, solo con el nuevo; coach independiente y alumno propio, como hoy');
  // El mensaje nuevo del profe nuevo (rapid-worker guarda gym_id = vinculo_gym): lo lee él y no el anterior.
  x = await V([['postgres', `select prueba.hacer('${P.dA}', $q$select to_jsonb(public.gym_asignar_profe(array['${F.A1}']::uuid[], '${P.pA2}'))$q$)`],
    ['servicio', `with x as (insert into public.coach_messages (coach_id, client_id, body, sender, gym_id) values ('${P.pA2}', '${P.A1}', 'Hola, soy tu profe nuevo', 'coach', public.vinculo_gym('${P.A1}')) returning gym_id) select to_jsonb(gym_id) from x`],
    ['pA2', mensajes], ['pA1', mensajes], ['A1', mensajes]]);
  t.eq([nom(x[1]), nombres(x[2]), nombres(x[3]), nombres(x[4])], ['A', ['pA2→A1'], ['pA1→P1'], ['pA1→A1', 'pA2→A1']],
    'el mensaje del profe nuevo lleva el gimnasio; él lo lee, el anterior no; el socio, los dos');

  // ===== Lo que guarda rapid-worker (chat_guardar): el gimnasio de cada mensaje lo pone la base =====
  const guardar = (c, s, quien, body) => ['servicio', `select to_jsonb(count(*)) from public.chat_guardar('${P[c]}', '${P[s]}', '${quien}', '${body}')`];
  const sinLeer = `select coalesce(jsonb_agg(jsonb_build_array(client_id, n) order by n desc, client_id), '[]') from public.chat_unread()`;
  x = await V([guardar('pA1', 'A1', 'client', 'Mensaje nuevo por rapid-worker'), guardar('pA1', 'P1', 'client', 'De un alumno propio'),
    guardar('C', 'C1', 'client', 'De una alumna independiente'),
    ['postgres', `select jsonb_agg(jsonb_build_array(client_id, gym_id) order by body) from public.coach_messages
                   where body in ('Mensaje nuevo por rapid-worker', 'De un alumno propio', 'De una alumna independiente')`],
    ['pA1', sinLeer],
    ['postgres', `select prueba.hacer('${P.dA}', $q$select to_jsonb(public.gym_asignar_profe(array['${F.A1}']::uuid[], '${P.pA2}'))$q$)`],
    ['pA1', `select coalesce(jsonb_agg(body order by body), '[]') from public.coach_messages where client_id = '${P.A1}'`],
    ['pA1', sinLeer],
    ['pA1', `select to_jsonb(true) from (select public.chat_mark_read('${P.A1}')) x`],
    ['postgres', `select to_jsonb(count(*)) from public.coach_messages where client_id = '${P.A1}' and sender = 'client' and read_at is not null`],
    ['pA2', sinLeer], ['A1', `select coalesce(jsonb_agg(body order by body), '[]') from public.coach_messages where sender = 'client'`]]);
  t.eq(x.slice(0, 3), [1, 1, 1], 'chat_guardar guarda los tres mensajes');
  t.eq(x[3].map(([c, g]) => [nom(c), nom(g)]).sort(), [['A1', 'A'], ['C1', null], ['P1', null]],
    'el mensaje del socio con su profe del gimnasio lleva el gimnasio (lo pone la base); con un alumno propio o un coach independiente, vacío (como hoy)');
  t.eq(x[4].map(([c, n]) => [nom(c), n]), [['A1', 2], ['P1', 1]], 'pA1 tiene sin leer los de A1 y el de P1');
  t.eq([x[6], x[7].map(([c, n]) => [nom(c), n])], [[], [['P1', 1]]],
    'cuando pasan a A1 a otro profe, pA1 no lee lo que A1 mandó por rapid-worker y ya no lo cuenta como sin leer (sigue con P1)');
  t.eq([x[9], x[10]], [0, []], 'pA1 no puede marcar como visto lo de A1 (A1 no ve «Visto»), y el profe nuevo no tiene esos sin leer');
  t.eq(x[11], ['Bien', 'Mensaje nuevo por rapid-worker'], 'A1 sigue viendo todo lo que mandó');
  t.eq(await J('select prueba.invariantes();'), [], 'invariantes');
  await db.borrar();
}
