// Gimnasios, etapa 1: la foto del socio en el gimnasio (decisión del 20/10) en Postgres de verdad
// (tests/pg.mjs; sin Postgres se saltea). La saca o la aprueba el gimnasio al sumarlo y el socio no la
// cambia solo: propone y espera la aprobación. Es aparte de la foto de perfil (avatars), que sigue
// libre y nunca la reemplaza; la recepción ve solo la del gimnasio.
// - Bucket privado gym-fotos ({gimnasio}/{ficha}/{uuid}.jpg|webp): quién sube a qué carpeta, quién ve
//   qué, sin cambiar ni borrar desde la app, tope de 5 subidas por día para el socio.
// - gym_foto_proponer, gym_foto_staff, gym_foto_resolver y gym_aprobar(…, foto_ok): estados y auditoría.
import { conPg } from './pg.mjs';
import { P, F, G, VER, DATOS, ayudas, rpc, nom, conCanon } from './gimnasios-comun.mjs';

const U = n => 'c0000000-0000-4000-8000-' + String(n).padStart(12, '0');
const ruta = (f, n, g = G.A, ext = 'jpg') => `${g}/${f}/${U(n)}.${ext}`;
const subir = path => `with x as (insert into storage.objects (bucket_id, name, owner_id) values ('gym-fotos', '${path}', auth.uid()::text) returning 1) select to_jsonb(count(*)) from x`;
const ver = `select coalesce(jsonb_agg(name order by name), '[]') from storage.objects where bucket_id = 'gym-fotos'`;
const ficha = f => `select jsonb_build_object('ok', foto_path, 'pend', foto_pend_path, 'rechazo', foto_rechazo, 'por', foto_ok_by) from public.gym_members where id = '${f}'`;

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  const { J, V } = ayudas(db);
  const bucket = await J(`select jsonb_build_object('public', public, 'tope', file_size_limit, 'tipos', allowed_mime_types) from storage.buckets where id = 'gym-fotos'`);
  t.eq(bucket, { public: false, tope: 307200, tipos: ['image/jpeg', 'image/webp'] }, 'bucket gym-fotos: privado, 300 KB, jpg o webp');

  // ===== Subir: quién a qué carpeta =====
  const SUBIR = [
    ['A1', ruta(F.A1, 1), 1, 'el socio, a la carpeta de su ficha'],
    ['A1', ruta(F.A1, 2, G.A, 'webp'), 1, 'también webp'],
    ['A1', ruta(F.A2, 3), '42501', 'no a la de otro socio'],
    ['A1', `${G.A}/${F.A1}/foto.jpg`, '42501', 'no con otro nombre (tiene que ser un uuid)'],
    ['A1', `${G.A}/${F.A1}/sub/${U(4)}.jpg`, '42501', 'no en una subcarpeta'],
    ['A1', ruta(F.A1, 5, G.B), '42501', 'no con otro gimnasio en la ruta'],
    ['A6', ruta(F.A6, 6), 1, 'quien pidió sumarse, a la carpeta de su pedido'],
    ['A7', ruta(F.A7, 7), 1, 'el socio sin la hoja aceptada, a la suya'],
    ['dA', ruta(F.A2, 8), 1, 'la dueña, a cualquier ficha de su gimnasio'],
    ['dA', ruta(F.A4, 9), 1, 'también a una ficha sin app'],
    ['aA', ruta(F.A2, 10), 1, 'la administración, también'],
    ['rA', ruta(F.A2, 11), 1, 'la recepción, con «altas» (prendido por defecto)'],
    ['pA1', ruta(F.A1, 12), '42501', 'el profe no'],
    ['dB', ruta(F.A1, 13), '42501', 'el dueño de otro gimnasio no'],
    ['C', ruta(F.A1, 14), '42501', 'un coach de afuera no'],
    ['N', ruta(F.A1, 15), '42501', 'una cuenta cualquiera no'],
    ['anon', ruta(F.A1, 16), '42501', 'sin sesión no']];
  for (const [w, path, esp, que] of SUBIR){
    const r = (await V([[w, subir(path)]]))[0];
    t.eq(r.error || r, esp, 'gym-fotos, subir: ' + que + ' (' + w + ')');
  }
  let x = await V([['postgres', `update public.gyms set settings = '{"recepcion_altas": false}' where id = '${G.A}'`], ['rA', subir(ruta(F.A2, 17))]]);
  t.eq(x[1].error, '42501', 'la recepción con «altas» apagado, no');
  x = await V([['postgres', `update public.gym_members set status = 'baja', left_at = now() where id = '${F.A2}'`], ['A2', subir(ruta(F.A2, 18))], ['dA', subir(ruta(F.A2, 19))]]);
  t.eq([x[1].error, x[2].error], ['42501', '42501'], 'a una ficha en baja, nadie');
  // Tope por día: el socio, 5.
  x = await V([1, 2, 3, 4, 5, 6].map(n => ['A1', subir(ruta(F.A1, 100 + n))]));
  t.eq(x.map(r => r.error || r), [1, 1, 1, 1, 1, '42501'], 'el socio sube hasta 5 fotos por día');
  x = await V([...[1, 2, 3, 4, 5, 6].map(n => ['dA', subir(ruta(F.A2, 200 + n))])]);
  t.eq(x.map(r => r.error || r), [1, 1, 1, 1, 1, 1], 'el equipo, más (300)');
  // Sin cambiar ni borrar desde la app.
  await db.sql(`insert into storage.objects (bucket_id, name, owner_id) values ('gym-fotos', '${ruta(F.A1, 900)}', '${P.A1}'), ('gym-fotos', '${ruta(F.A2, 901)}', '${P.dA}'),
    ('gym-fotos', '${ruta(F.B1, 902, G.B)}', '${P.dB}'), ('gym-fotos', '${ruta(F.A6, 903)}', '${P.A6}');`);
  x = await V([['A1', `with x as (update storage.objects set name = name where bucket_id = 'gym-fotos' returning 1) select to_jsonb(count(*)) from x`],
    ['dA', `with x as (update storage.objects set name = name where bucket_id = 'gym-fotos' returning 1) select to_jsonb(count(*)) from x`]]);
  t.eq(x, [0, 0], 'nadie cambia una foto desde la app (sin política de update)');

  // ===== Ver =====
  const VER_ = { A1: [ruta(F.A1, 900)], A2: [ruta(F.A2, 901)], A6: [ruta(F.A6, 903)], dA: [ruta(F.A1, 900), ruta(F.A2, 901), ruta(F.A6, 903)],
    aA: [ruta(F.A1, 900), ruta(F.A2, 901), ruta(F.A6, 903)], pA1: [ruta(F.A1, 900), ruta(F.A2, 901)], pA2: [],
    rA: [ruta(F.A1, 900), ruta(F.A2, 901), ruta(F.A6, 903)], dB: [ruta(F.B1, 902, G.B)], B1: [ruta(F.B1, 902, G.B)], C: [], N: [] };
  for (const [w, esp] of Object.entries(VER_)) t.eq((await V([[w, ver]]))[0], [...esp].sort(), 'gym-fotos, ver: ' + w);
  x = await V([['postgres', `update public.gyms set settings = '{"profes_recepcion": true, "recepcion_altas": false}' where id = '${G.A}'`], ['pA2', ver], ['rA', ver]]);
  t.eq([x[1], x[2]], [[ruta(F.A1, 900), ruta(F.A2, 901)].sort(), [ruta(F.A1, 900), ruta(F.A2, 901)].sort()],
    'el profe sin asignados ve las fotos solo si el gimnasio le abre la recepción (y nunca las de los pedidos); la recepción sin «altas», tampoco las de los pedidos');
  x = await V([['dA', rpc('gym_asignar_profe', [F.A2], P.pA2)], ['pA1', ver], ['pA2', ver]]);
  t.eq([x[1], x[2]], [[ruta(F.A1, 900)], [ruta(F.A2, 901)]], 'cuando pasan un socio a otro profe, la foto la ve el profe nuevo y deja de verla el anterior');
  x = await V([['postgres', `update public.gym_members set status = 'baja', left_at = now() where id = '${F.A1}'`], ['A1', ver], ['rA', ver]]);
  t.eq([x[1], x[2]], [[], [ruta(F.A2, 901), ruta(F.A6, 903)].sort()], 'con la ficha en baja, ni el socio ni el equipo la ven');

  // ===== Proponer, aprobar, rechazar, sacarla el gimnasio =====
  const p1 = ruta(F.A1, 900), p2 = ruta(F.A1, 901);
  await db.sql(`insert into storage.objects (bucket_id, name, owner_id) values ('gym-fotos', '${p2}', '${P.A1}');`);
  x = await V([['A1', rpc('gym_foto_proponer', p1)], ['postgres', ficha(F.A1)], ['A1', rpc('mi_gimnasio')], ['dA', rpc('mi_gimnasio')],
    ['postgres', `select coalesce(jsonb_agg(substr(recipient, 3)), '[]') from public.gym_alerts where kind = 'foto_para_aprobar'`],
    ['dA', rpc('gym_foto_resolver', F.A1, true, null)], ['postgres', ficha(F.A1)], ['A1', rpc('mi_gimnasio')],
    ['A1', rpc('gym_foto_proponer', p2)], ['postgres', ficha(F.A1)], ['rA', rpc('gym_foto_resolver', F.A1, false, 'Se ve muy oscura')], ['postgres', ficha(F.A1)],
    ['A1', rpc('mi_gimnasio')], ['postgres', `select coalesce(jsonb_agg(action order by id), '[]') from public.gym_audit where gym_member_id = '${F.A1}'`]]);
  t.eq([x[0], x[1], x[2].ficha.foto], [{ foto: 'pendiente' }, { ok: null, pend: p1, rechazo: null, por: null }, 'pendiente'], 'el socio propone: queda pendiente (la aprobada no cambia)');
  t.eq([x[3].contadores.fotos_pendientes, x[4].map(nom).sort()], [1, ['aA', 'dA']], 'la administración la ve en «Para hacer» y se anota el aviso');
  t.eq([x[5], x[6].ok, x[6].pend, nom(x[6].por), x[7].ficha.foto], [{ foto: 'ok' }, p1, null, 'dA', 'ok'], 'la dueña la aprueba: es la foto del gimnasio');
  t.eq([x[9].ok, x[9].pend], [p1, p2], 'propone otra: la aprobada sigue siendo la anterior hasta que la aprueben');
  t.eq([x[10], x[11], x[12].ficha.foto, x[12].ficha.foto_rechazo], [{ foto: 'rechazada' }, { ok: p1, pend: null, rechazo: 'Se ve muy oscura', por: P.dA }, 'ok', 'Se ve muy oscura'],
    'la recepción (con «altas») la rechaza con un motivo: queda la anterior y el socio ve el motivo');
  t.eq(x[13], ['foto_propuesta', 'foto_aprobada', 'foto_propuesta', 'foto_rechazada'], 'cada paso queda en la auditoría');
  // La foto de un pedido (A6, pendiente) se aprueba desde Solicitudes: cuenta como solicitud, no como
  // «foto para aprobar» (Socios no muestra los pedidos y «Revisar» abría una lista vacía).
  x = await V([['A6', rpc('gym_foto_proponer', ruta(F.A6, 903))], ['dA', rpc('mi_gimnasio')], ['A1', rpc('gym_foto_proponer', p2)], ['dA', rpc('mi_gimnasio')]]);
  t.eq([x[0], x[1].contadores.solicitudes, x[1].contadores.fotos_pendientes, x[3].contadores.fotos_pendientes], [{ foto: 'pendiente' }, 1, 0, 1],
    'mi_gimnasio: la foto de un pedido no cuenta en fotos_pendientes (sí la de un socio)');
  x = await V([['A1', rpc('gym_foto_proponer', ruta(F.A2, 901))], ['A1', rpc('gym_foto_proponer', ruta(F.A1, 777))], ['A2', rpc('gym_foto_proponer', p1)], ['pA1', rpc('gym_foto_resolver', F.A1, true, null)]]);
  t.eq([x[0].msg, x[1].msg, x[2].msg, x[3].error], ['No encontramos la foto: probá de nuevo.', 'No encontramos la foto: probá de nuevo.', 'No encontramos la foto: probá de nuevo.', '42501'],
    'no se propone la foto de otra ficha ni una que no se subió; el profe no resuelve');
  x = await V([['A1', rpc('gym_foto_proponer', p2)], ['dA', rpc('gym_foto_staff', F.A1, ruta(F.A1, 900))], ['postgres', ficha(F.A1)],
    ['postgres', `select data from public.gym_audit where action = 'foto_staff'`]]);
  t.eq([x[1], x[2], x[3]], [{ foto: 'ok' }, { ok: p1, pend: null, rechazo: null, por: P.dA }, { reemplaza: null, descarta: p2 }],
    'la saca el gimnasio (gym_foto_staff): queda aprobada y descarta la propuesta (anotada para borrarla después)');
  x = await V([['dA', rpc('gym_foto_staff', F.A4, ruta(F.A2, 901))]]);
  t.eq(x[0].msg, 'No encontramos la foto: probá de nuevo.', 'gym_foto_staff con la foto de otra ficha: no');
  // Al aprobar la solicitud, con «Aprobar la foto».
  x = await V([['A6', rpc('gym_foto_proponer', ruta(F.A6, 903))], ['dA', rpc('gym_aprobar', F.A6, null, null, true)], ['postgres', ficha(F.A6)]]);
  t.eq(x[2], { ok: ruta(F.A6, 903), pend: null, rechazo: null, por: P.dA }, 'gym_aprobar(…, foto_ok): la foto que propuso al pedir queda aprobada');
  x = await V([['A6', rpc('gym_foto_proponer', ruta(F.A6, 903))], ['dA', rpc('gym_aprobar', F.A6, null, null, false)], ['postgres', ficha(F.A6)]]);
  t.eq(x[2], { ok: null, pend: ruta(F.A6, 903), rechazo: null, por: null }, 'sin «Aprobar la foto», queda pendiente');
  // «Es la ficha de…»: la foto del pedido queda en la carpeta del pedido (que se borra) y se sigue viendo.
  const verA6 = `select coalesce(jsonb_agg(name), '[]') from storage.objects where bucket_id = 'gym-fotos' and name = '${ruta(F.A6, 903)}'`;
  x = await V([['A6', rpc('gym_foto_proponer', ruta(F.A6, 903))], ['dA', rpc('gym_aprobar', F.A6, null, F.A4, true)], ['postgres', ficha(F.A4)],
    ['A6', verA6], ['rA', verA6], ['dA', verA6], ['aA', verA6], ['pA1', verA6], ['N', verA6], ['A6', rpc('mi_gimnasio')]]);
  t.eq([x[2].ok, x[3], x[4], x[5], x[6], x[7], x[8], x[9].ficha.foto], [ruta(F.A6, 903), [ruta(F.A6, 903)], [ruta(F.A6, 903)], [ruta(F.A6, 903)], [ruta(F.A6, 903)], [], [], 'ok'],
    '«es la ficha de…» con «Aprobar la foto»: la foto aprobada se sigue viendo (el socio, la recepción, la dueña y la administración; no otro profe ni otra cuenta)');
  x = await V([['A6', rpc('gym_foto_proponer', ruta(F.A6, 903))], ['dA', rpc('gym_aprobar', F.A6, null, F.A4, false)], ['postgres', ficha(F.A4)], ['rA', verA6],
    ['dA', rpc('gym_foto_resolver', F.A4, true, null)], ['postgres', ficha(F.A4)]]);
  t.eq([x[2].pend, x[3], x[4], x[5].ok], [ruta(F.A6, 903), [ruta(F.A6, 903)], { foto: 'ok' }, ruta(F.A6, 903)],
    'sin «Aprobar la foto», queda propuesta en la ficha, se ve y se aprueba después');
  x = await V([['postgres', `update public.gym_members set foto_pend_path = '${ruta(F.A4, 950)}' where id = '${F.A4}'`], ['dA', rpc('gym_foto_resolver', F.A4, true, null)],
    ['postgres', `update public.gym_members set foto_pend_path = '${ruta(F.B1, 902, G.B)}' where id = '${F.A4}'`], ['dA', rpc('gym_foto_resolver', F.A4, true, null)]]);
  t.eq([x[1].msg, x[3].msg], ['No encontramos la foto: pedile que mande otra.', 'No encontramos la foto: pedile que mande otra.'],
    'gym_foto_resolver no aprueba una foto que no está subida ni una de otro gimnasio');

  // El link #unirme con DNI reemplaza el pedido que tenía: la foto que había propuesto pasa a la ficha.
  const pedRuta = `'${G.A}/' || current_setting('prueba.ped') || '/${U(960)}.jpg'`;
  x = await V([['N', rpc('gym_unirse', 'FUERZA22', VER, false, null)],
    ['postgres', `select to_jsonb(set_config('prueba.ped', (select id::text from public.gym_members where member_id = '${P.N}'), true))`],
    ['N', `with x as (insert into storage.objects (bucket_id, name, owner_id) values ('gym-fotos', ${pedRuta}, auth.uid()::text) returning 1) select to_jsonb(count(*)) from x`],
    ['N', `select to_jsonb(public.gym_foto_proponer(${pedRuta}))`],
    ['dA', `select to_jsonb(set_config('prueba.tok', public.gym_ficha_crear('{"nombre": "Nora Vidal", "dni": "33444555"}'::jsonb)->>'token', true))`],
    ['N', `select to_jsonb(public.gym_unirse_token(current_setting('prueba.tok'), '555', '${VER}', false, null))`],
    ['postgres', `select jsonb_build_object('pend', foto_pend_path = ${pedRuta}, 'mia', member_id = '${P.N}') from public.gym_members where foto_pend_path is not null and member_id = '${P.N}'`],
    ['rA', `select to_jsonb(count(*)) from storage.objects where bucket_id = 'gym-fotos' and name = ${pedRuta}`]]);
  t.eq([x[3], x[5].estado, x[6], x[7]], [{ foto: 'pendiente' }, 'activo', { pend: true, mia: true }, 1],
    'el link #unirme con DNI reemplaza el pedido: la foto que propuso al pedir pasa a la ficha y la recepción la ve');

  // ===== Las fotos que ya no usa ninguna ficha (para borrarlas por la API de Storage) =====
  const viejas = `update storage.objects set created_at = now() - interval '3 days' where bucket_id = 'gym-fotos'`;
  const huerfanas = ['servicio', `select coalesce(jsonb_agg(x order by x), '[]') from public.gym_fotos_huerfanas() x`];
  x = await V([['A1', rpc('gym_foto_proponer', p2)], ['dA', rpc('gym_foto_resolver', F.A1, false, null)], ['postgres', viejas], huerfanas,
    ['A1', `select to_jsonb(count(*)) from public.gym_fotos_huerfanas()`]]);
  t.eq(x[3], [ruta(F.A1, 900), p2, ruta(F.A2, 901), ruta(F.A6, 903), ruta(F.B1, 902, G.B)].sort(), 'gym_fotos_huerfanas: las que no usa ninguna ficha (acá, todas: ninguna está aprobada ni propuesta)');
  t.eq(x[4].error, '42501', 'solo el service role');
  x = await V([['A6', rpc('gym_foto_proponer', ruta(F.A6, 903))], ['dA', rpc('gym_foto_staff', F.A1, p1)], ['postgres', viejas], huerfanas,
    ['A6', rpc('gym_cancelar_solicitud')], huerfanas]);
  t.eq([x[3], x[5]], [[ruta(F.A1, 901), ruta(F.A2, 901), ruta(F.B1, 902, G.B)].sort(), [ruta(F.A1, 901), ruta(F.A2, 901), ruta(F.A6, 903), ruta(F.B1, 902, G.B)].sort()],
    'la aprobada y la propuesta no se listan; la del pedido cancelado, sí');

  // ===== La foto de perfil no es la del gimnasio =====
  await db.sql(`insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '${P.A1}/perfil.jpg', '${P.A1}');`);
  x = await V([['dA', rpc('gym_foto_staff', F.A1, p1)], ['A1', `select to_jsonb(true) from (select public.set_my_avatar('${P.A1}/perfil.jpg')) x`],
    ['postgres', ficha(F.A1)], ['rA', rpc('buscar_socio', 'Martina Sosa')],
    ['rA', `select coalesce(jsonb_agg(name), '[]') from storage.objects where bucket_id = 'avatars'`], ['dA', `select coalesce(jsonb_agg(name), '[]') from storage.objects where bucket_id = 'avatars'`]]);
  t.eq([x[2].ok, x[3][0].foto_path, x[3][0].nombre], [p1, p1, 'Martina Sosa'], 'cambiar la foto de perfil no cambia la del gimnasio; la recepción recibe la del gimnasio en buscar_socio');
  t.eq([x[4], x[5]], [[], [`${P.A1}/perfil.jpg`]], 'la recepción no ve la foto de perfil del socio (la dueña sí, gimnasios-lectura.sql)');
  t.eq(await J('select prueba.invariantes();'), [], 'invariantes');
  await db.borrar();
}
