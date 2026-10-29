// supabase/pagina-coach.sql (la página pública del coach, gize.ar/c/<alias>).
// 1) Leído: encabezado y de qué depende; tablas con RLS, sin políticas ni permisos para anon ni
//    authenticated; solo coach_pagina_ver y coach_pagina_foto_ok se llaman sin sesión; las demás,
//    solo con sesión; las admin_* empiezan con admin_assert; la política de la foto es nueva y no toca
//    las de hoy; no redefine funciones de otros archivos; la tarea diaria; el bloque para volver
//    atrás; sin mails ni uuids; ningún texto de error nombra el plan, pagos ni precios (lo leen las
//    apps); y que tests/pg/orden.txt lo carga.
// 2) Con Postgres de verdad (tests/pg.mjs, en la base de hoy y con los gimnasios; sin Postgres se
//    saltea): crear el link (formato, reservados, ocupado, dos coaches a la vez), cambiarlo (libre
//    las primeras 24 horas, después una vez por semana con la fecha en el mensaje, el link viejo 90
//    días, volver al propio, el vencido se libera), lo que ve la página sin sesión y con sesión
//    (apagada, pausada, cuenta de coach no activa, otro rol, bloqueo, sin foto, es_mi_coach, soy_yo),
//    la foto en Storage (sin sesión, solo la de la página), el admin (pausar, reanudar, liberar, con
//    admin_audit; los demás reciben 42501), borrar la cuenta, la tarea de pg_cron, que se puede correr
//    dos veces y que volver atrás deja la base exactamente como antes.
import { conPg, leer, orden, cuerpo, volverAtras, huella, diferencias, lit } from './pg.mjs';

const FUNCIONES = ['coach_pagina_ver', 'coach_pagina_foto_ok', 'coach_pagina_mia', 'coach_pagina_guardar', 'admin_coach_paginas', 'admin_coach_pagina'];
const FIRMAS = { coach_pagina_ver: 'text', coach_pagina_foto_ok: 'text', coach_pagina_mia: '', coach_pagina_guardar: 'text, boolean, boolean',
  admin_coach_paginas: '', admin_coach_pagina: 'uuid, text' };
const POLITICA = 'avatar: la de la página pública del coach';
const RESERVADOS = ['admin', 'api', 'app', 'ayuda', 'baja', 'coach', 'coaches', 'contacto', 'gimnasio', 'gimnasios', 'landing', 'login', 'oficial',
  'privacidad', 'registro', 'soporte', 'terminos', 'www', 'null', 'test', 'prueba'];
const FORMATO = 'Usá de 3 a 30 letras o números, sin espacios ni acentos. En el medio podés usar punto, guion o guion bajo.';
const RESERVADO = 'Ese link no se puede usar. Probá con otro.';
const OCUPADO = 'Ese link ya lo usa otro coach. Probá con otro.';

// La definición entera de una función (desde «create or replace» hasta el cierre del cuerpo).
const defin = (sql, name) => {
  const i = sql.search(new RegExp('^create or replace function public\\.' + name + '\\(', 'm'));
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

// t.eq sin mirar el orden de las claves (jsonb las ordena a su manera).
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;

export default async ({ t: t0 }) => {
  const t = Object.assign({}, t0, { eq: (a, b, m) => t0.eq(canon(a), canon(b), m) });
  const sql = leer('supabase/pagina-coach.sql');
  const code = sql.replace(/--[^\n]*/g, '');
  const plano = sql.replace(/\n--\s*/g, ' ');

  // ---------- 1) Leído ----------
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/pagina-coach.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.has(plano, 'después de supabase/foto-perfil.sql, supabase/endurecer-base.sql, supabase/cupo-plan.sql, supabase/bloqueos.sql y supabase/admin.sql',
    'encabezado: de qué depende');
  t.has(plano, 'Public Can Execute SECURITY DEFINER Function', 'encabezado: avisa que el chequeo de Supabase va a marcar las dos funciones sin sesión (a propósito)');
  t.ok(/raise exception 'Primero correr supabase\/foto-perfil\.sql, endurecer-base\.sql, cupo-plan\.sql, bloqueos\.sql y admin\.sql\.'/.test(code),
    'se frena sin cambiar nada si faltan los archivos de los que depende');
  for (const tb of ['coach_paginas', 'coach_alias_viejos']){
    t.ok(code.includes('create table if not exists public.' + tb + ' ('), tb + ': se crea si no está');
    t.ok(code.includes('alter table public.' + tb + ' enable row level security;'), tb + ': RLS prendido');
    t.ok(code.includes('revoke all on public.' + tb + ' from anon, authenticated;'), tb + ': sin permisos para anon ni authenticated');
  }
  t.ok(/coach_id\s+uuid primary key references public\.profiles\(id\) on delete cascade/.test(code)
    && /coach_id uuid not null references public\.profiles\(id\) on delete cascade/.test(code), 'las dos tablas se borran con la cuenta (on delete cascade)');
  t.ok(code.includes("check (alias ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' and alias !~ '[._-]{2}')"), 'el formato del link también lo controla la tabla');
  const adds = [...code.matchAll(/add constraint (\w+)/g)].map(x => x[1]);
  t.ok(adds.length >= 1 && adds.every(c => code.includes('drop constraint if exists ' + c)), 'cada check se borra antes de crearlo: ' + adds.join(', '));
  t.ok(code.includes('create unique index if not exists coach_paginas_alias on public.coach_paginas (alias);'), 'un link vigente es de un solo coach (índice único)');
  t.ok(!/grant [^;]*\bon (table )?public\.coach_/i.test(code), 'ningún grant sobre las tablas');
  t.ok(!/drop table/i.test(code), 'no borra tablas (se puede volver a correr sin perder las páginas)');

  // La política de la foto: nueva, aparte, y la única que toca el archivo.
  const pols = [...code.matchAll(/(?:drop|create|alter) policy (?:if exists )?"([^"]+)"/g)].map(m => m[1]);
  t.eq([...new Set(pols)], [POLITICA], 'solo toca su política (las de foto-perfil, gimnasios-lectura y topes-archivos quedan como están)');
  t.ok(code.includes(`drop policy if exists "${POLITICA}" on storage.objects;`), 'la política se borra antes de crearla (se puede volver a correr)');
  t.ok(/create policy "avatar: la de la página pública del coach" on storage\.objects\s+for select to anon, authenticated\s+using \(bucket_id = 'avatars' and public\.coach_pagina_foto_ok\(name\)\);/.test(code),
    'la política: solo leer, solo avatars, solo lo que dice coach_pagina_foto_ok');
  t.ok(!/create policy [^;]* on public\./i.test(code), 'sin políticas en las tablas: nadie las lee directo');
  t.ok(!/storage\.buckets/.test(code), 'no cambia el bucket (sigue privado)');

  // Funciones: security definer con search_path fijo; quién las llama.
  for (const name of FUNCIONES){
    t.ok(/language plpgsql (stable )?security definer set search_path = public as \$\$/.test(defin(code, name)), name + ': security definer con search_path fijo');
  }
  const grants = [...code.matchAll(/grant execute on function public\.(\w+)\(([^)]*)\) to ([^;]+);/g)].map(m => [m[1] + '(' + m[2] + ')', m[3].trim()]);
  t.eq(grants.filter(g => /\banon\b/.test(g[1])).map(g => g[0]).sort(), ['coach_pagina_foto_ok(text)', 'coach_pagina_ver(text)'],
    'sin sesión, solo coach_pagina_ver y coach_pagina_foto_ok (la página y la política de la foto)');
  for (const name of ['coach_pagina_ver', 'coach_pagina_foto_ok']){
    const sig = name + '(' + FIRMAS[name] + ')';
    t.ok(code.includes('revoke all on function public.' + sig + ' from public;') && code.includes('grant execute on function public.' + sig + ' to anon, authenticated;'),
      sig + ': para anon y authenticated (nada para public)');
  }
  for (const name of ['coach_pagina_mia', 'coach_pagina_guardar', 'admin_coach_paginas', 'admin_coach_pagina']){
    const sig = name + '(' + FIRMAS[name] + ')';
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon;'), sig + ': nada para public ni anon');
    t.ok(code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': solo con sesión');
  }
  t.eq(grants.map(g => g[0].replace(/\(.*/, '')).sort(), [...FUNCIONES].sort(), 'cada función tiene su grant escrito');
  for (const name of ['admin_coach_paginas', 'admin_coach_pagina'])
    t.ok(/\$\$\s*(declare[\s\S]*?)?begin\s+perform public\.admin_assert\(\);/.test(defin(code, name)), name + ': lo primero es admin_assert');
  t.ok(/perform public\.admin_log\('pagina_coach'/.test(defin(code, 'admin_coach_pagina')), 'cada acción del admin queda en admin_audit');
  const ver = cuerpo(sql, 'coach_pagina_ver') || '';
  const claves = [...(ver.split('return jsonb_build_object(')[1] || '').matchAll(/^\s*'(\w+)',/gm)].map(m => m[1]);
  t.eq(claves, ['alias', 'nombre', 'foto', 'codigo', 'es_mi_coach', 'soy_yo'], 'coach_pagina_ver devuelve solo eso (ni el mail ni el id del coach)');
  t.ok(!/auth\.users|email/.test(ver), 'coach_pagina_ver no lee mails');
  t.ok(/public\.coach_active\(pag\.coach_id\)/.test(ver) && /public\.bloqueo_entre\(me, pag\.coach_id\)/.test(ver), 'coach_pagina_ver mira coach_active y los bloqueos');
  const foto = cuerpo(sql, 'coach_pagina_foto_ok') || '';
  t.ok(/p_name !~ '\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\/'/.test(foto) && foto.indexOf('!~') < foto.indexOf('::uuid'),
    'coach_pagina_foto_ok: mira que el primer tramo sea un uuid antes de convertirlo');
  t.ok(/p\.id = c and p\.avatar_path = p_name/.test(foto), 'coach_pagina_foto_ok: busca al coach por la clave y la ruta tiene que ser su foto de perfil');
  const guardar = cuerpo(sql, 'coach_pagina_guardar') || '';
  t.ok(/pg_advisory_xact_lock\(hashtext\('coach_alias'\), h\)/.test(guardar) && /select distinct hashtext\(x\) from unnest\(array\[a, pag\.alias\]\) x where x is not null order by 1 loop/.test(guardar),
    'guardar: bloquea el link nuevo y el anterior, siempre en el mismo orden');
  t.ok(/exception when unique_violation then\s+raise exception 'Ese link ya lo usa otro coach\. Probá con otro\.'/.test(guardar), 'guardar: un choque del índice único da el mismo mensaje');
  t.ok(/perform public\.my_invite_code\(\)/.test(guardar), 'guardar: arma el código de invitación si no tenía');
  t.ok(RESERVADOS.every(r => guardar.includes("'" + r + "'")) && /a like 'gize%'/.test(guardar), 'guardar: los nombres reservados y todo lo que empieza con «gize»');
  t.ok(/at time zone 'America\/Argentina\/Buenos_Aires', 'DD\/MM'/.test(guardar), 'guardar: la fecha del mensaje, en hora de Argentina');
  t.ok(!/create or replace function public\.(coach_active|join_coach|my_invite_code|bloqueo_entre|gym_codigo_info|admin_set_config|admin_assert|admin_log)\(/.test(code),
    'no redefine funciones de otros archivos (coach_active, join_coach, my_invite_code, bloqueo_entre, gym_codigo_info, admin_set_config…)');

  // Textos de error: los muestran las apps tal cual.
  const textos = [...code.matchAll(/raise exception '([^']+)'/g)].map(m => m[1]).filter(m => !/^Primero /.test(m));
  t.ok(textos.length >= 7, 'textos de error: ' + textos.length);
  t.ok(!textos.some(m => /\bplan\b|renov|renuev|precio|\$|pag[aáo]|prueba|gratis|mercado/i.test(m)),
    'ningún texto de error nombra el plan, la prueba, pagos ni precios: ' + textos.filter(m => /plan|precio|pag|prueba|gratis/i.test(m)).join(' | '));

  // La tarea diaria y el final.
  t.ok(code.includes("select cron.unschedule('gize-paginas-coach') where exists (select 1 from cron.job where jobname = 'gize-paginas-coach');"),
    'la tarea se borra antes de crearla (se puede volver a correr)');
  t.ok(/select cron\.schedule\('gize-paginas-coach', '23 6 \* \* \*', \$job\$\s+delete from public\.coach_alias_viejos where hasta < now\(\);\s+\$job\$\);/.test(code),
    'tarea diaria (06:23 UTC) que borra los links viejos vencidos');
  t.ok(/notify pgrst, 'reload schema';\s*$/.test(code.trim() + '\n'), 'termina avisándole a PostgREST');
  const atras = volverAtras(sql);
  t.ok(atras.includes("select cron.unschedule('gize-paginas-coach')") && atras.includes(`drop policy if exists "${POLITICA}" on storage.objects;`)
    && atras.includes('drop table if exists public.coach_alias_viejos;') && atras.includes('drop table if exists public.coach_paginas;')
    && FUNCIONES.every(f => atras.includes('public.' + f + '(' + FIRMAS[f] + ')')), 'volver atrás: la tarea, la política, las seis funciones y las dos tablas');
  t.has(plano, 'revoke execute on function public.coach_pagina_ver(text) from anon, authenticated;', 'cómo apagar las páginas en una emergencia sin borrar nada');

  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(sql), 'sin mails');
  t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), 'sin ids de cuentas');

  // La base de pruebas lo carga, al final de la base de hoy.
  const lista = orden();
  t.ok(lista.includes('pagina-coach.sql') && lista.indexOf('pagina-coach.sql') > lista.indexOf('codigo-fundador.sql')
    && ['foto-perfil.sql', 'endurecer-base.sql', 'cupo-plan.sql', 'bloqueos.sql', 'admin.sql'].every(f => lista.indexOf(f) >= 0 && lista.indexOf(f) < lista.indexOf('pagina-coach.sql')),
    'tests/pg/orden.txt lo carga después de los archivos de los que depende');
  t.has(leer('tests/pg/README.md'), '| `pagina-coach-sql` |', 'tests/pg/README.md dice qué prueba');

  // ---------- 2) Con Postgres ----------
  const h = await conPg(t);
  if (!h) return;
  await conDatos(t, h, sql);
  await vueltas(t, h, sql);
  await conGimnasios(t, h);
};

// Personas (todo inventado).
const ID = n => 'b0000000-0000-4000-8000-' + n.padStart(12, '0');
const T = ID('1'), O = ID('2'), PP = ID('3'), V = ID('4'), A = ID('5'), B = ID('6'), AD = ID('7');
const USUARIOS = `
insert into auth.users (id, email, raw_user_meta_data) values
  ('${T}', 'toro@ejemplo.test', '{"full_name":"Toro <b>Entrena</b>","role":"coach"}'),
  ('${O}', 'olga@ejemplo.test', '{"full_name":"Olga Coach","role":"coach"}'),
  ('${PP}', 'pablo@ejemplo.test', '{"full_name":"Pablo Coach","role":"coach"}'),
  ('${V}', 'vera@ejemplo.test', '{"full_name":"Vera Coach","role":"coach"}'),
  ('${A}', 'ana@ejemplo.test', '{"full_name":"Ana Alumna"}'),
  ('${B}', 'beto@ejemplo.test', '{"full_name":"Beto Alumno"}'),
  ('${AD}', 'admin@ejemplo.test', '{"full_name":"Admin GIZE"}');
insert into public.app_admins (user_id) values ('${AD}');
update public.profiles set invite_code = 'OLGA2345' where id = '${O}';
`;
const FOTO_T = T + '/1760000000000.jpg', FOTO_T_VIEJA = T + '/1700000000000.jpg', FOTO_B = B + '/1760000000001.jpg', FOTO_O = O + '/1760000000002.jpg';

function ayudas(db){
  const r = x => ('error' in x) ? { error: x.error, msg: x.msg } : x.ok;
  // Como quien (uuid, 'anon' o 'postgres'), y lo que cambió queda.
  const como = async (quien, q) => r(await db.json(`select prueba.hacer(${lit(quien)}, ${lit(q)});`));
  const b = v => v === null || v === undefined ? 'null' : String(v);
  return {
    como,
    pg: q => db.sql(q),
    J: q => db.json(q),
    guardar: (quien, alias, activa = null, conFoto = null) => como(quien, `select public.coach_pagina_guardar(${lit(alias)}, ${b(activa)}, ${b(conFoto)})`),
    ver: (quien, alias) => como(quien, `select public.coach_pagina_ver(${lit(alias)})`),
    mia: quien => como(quien, 'select public.coach_pagina_mia()'),
    fotoOk: (quien, name) => como(quien, `select to_jsonb(public.coach_pagina_foto_ok(${lit(name)}))`),
    fotos: quien => como(quien, `select coalesce(jsonb_agg(name order by name), '[]') from storage.objects where bucket_id = 'avatars'`),
    // admin_coach_pagina no devuelve nada (void): si anduvo, «ok».
    admin: (quien, coach, accion) => como(quien, `select to_jsonb(public.admin_coach_pagina(${lit(coach)}, ${lit(accion)}))`).then(x => x === '' ? 'ok' : x),
  };
}

async function conDatos(t, h, sql){
  const db = await h.nueva('gize_sin');
  try {
    await db.sql(USUARIOS);
    const { como, pg, J, guardar, ver, mia, fotoOk, fotos, admin } = ayudas(db);

    // Nadie lee las tablas directo; sin sesión no se guarda ni se pide la propia.
    for (const tb of ['coach_paginas', 'coach_alias_viejos'])
      for (const quien of ['anon', T])
        t.eq((await como(quien, `select to_jsonb(count(*)) from public.${tb}`)).error, '42501', tb + ': ' + (quien === 'anon' ? 'sin sesión' : 'el coach') + ' no la lee directo');
    t.eq((await como(T, `insert into public.coach_paginas (coach_id, alias) values ('${T}', 'toro')`)).error, '42501', 'el coach no se escribe la página directo');
    t.eq((await guardar('anon', 'toro')).error, '42501', 'sin sesión no se crea una página');
    t.eq((await mia('anon')).error, '42501', 'sin sesión no se pide la página propia');
    t.eq((await como('anon', 'select public.admin_coach_paginas()')).error, '42501', 'sin sesión no se ve la lista del admin');
    t.eq((await admin('anon', T, 'pausar')).error, '42501', 'sin sesión no se pausa nada');

    // ===== Crear =====
    t.eq(await guardar(A, 'ana'), { error: 'P0001', msg: 'Solo las cuentas de coach tienen página.' }, 'una alumna no tiene página');
    for (const mal of ['to', 'a'.repeat(31), 'mi link', 'martín', 'to--ro', 'to._ro', '.toro', 'toro-', '', null])
      t.eq(await guardar(T, mal), { error: 'P0001', msg: FORMATO }, 'formato inválido: ' + JSON.stringify(mal));
    for (const res of ['admin', 'ADMIN', 'gize-oficial', 'gize', 'gizeok', 'privacidad', 'www', 'prueba'])
      t.eq(await guardar(T, res), { error: 'P0001', msg: RESERVADO }, 'reservado: ' + res);
    t.eq(await J('select to_jsonb(count(*)) from public.coach_paginas'), 0, 'los errores no dejan nada');
    t.eq(await J(`select to_jsonb(invite_code) from public.profiles where id = '${T}'`), null, 'Toro todavía no tiene código de invitación');

    const t1 = await guardar(T, ' Toro ');
    t.ok(t1 && /^[A-Z2-9]{8}$/.test(t1.codigo || ''), 'crear: arma el código de invitación que faltaba: ' + JSON.stringify(t1));
    t.eq(t1 && { ...t1, codigo: 'x' }, { alias: 'toro', activa: true, con_foto: true, pausada: false, cambia_desde: null, codigo: 'x', visible: true },
      '«Toro» queda «toro», prendida, con foto y visible');
    t.eq(await J(`select to_jsonb(invite_code) from public.profiles where id = '${T}'`), t1 && t1.codigo, 'el código queda en el perfil');
    t.eq(await mia(T), t1, 'coach_pagina_mia devuelve lo mismo');
    t.eq(await mia(B), null, 'quien no tiene página: null');
    t.eq(await guardar(O, 'toro'), { error: 'P0001', msg: OCUPADO }, 'otro coach no puede tomar «toro»');
    t.eq(await guardar(O, ' TORO'), { error: 'P0001', msg: OCUPADO }, 'tampoco en mayúsculas');
    t.eq((await guardar(O, 'olga')).alias, 'olga', 'Olga arma la suya');

    // Dos coaches piden el mismo link a la vez: el primero se queda adentro de su transacción un
    // segundo; el otro espera y después lo ve ocupado.
    const pedir = (quien, alias, dormir) => db.intentar(`begin;
      select prueba.ser('${quien}');
      select public.coach_pagina_guardar('${alias}', null, null);
      ${dormir ? 'select pg_sleep(1);' : ''}
      commit;`);
    const [p1, p2] = await Promise.all([pedir(PP, 'pepe', true), new Promise(ok => setTimeout(() => pedir(V, 'pepe', false).then(ok), 300))]);
    t.ok(p1.ok && !p2.ok && p2.code === 'P0001' && p2.msg === OCUPADO, 'dos coaches por el mismo link a la vez: gana uno: ' + JSON.stringify([p1.ok, p2.code, p2.msg]));
    t.eq(await J(`select jsonb_agg(coach_id) from public.coach_paginas where alias = 'pepe'`), [PP], 'el link queda de un solo coach');
    t.eq(await mia(V), null, 'el que perdió no quedó con página');

    // ===== Lo que ve la página =====
    const tc = t1 && t1.codigo;
    const vt = await ver('anon', 'toro');
    t.eq(vt, { alias: 'toro', nombre: 'Toro <b>Entrena</b>', foto: null, codigo: tc, es_mi_coach: false, soy_yo: false },
      'sin sesión: el link, el nombre (tal cual: la página lo pinta como texto), sin foto todavía y el código; nada más (ni mail ni id)');
    t.eq(await ver('anon', 'TORO '), vt, 'el link en mayúsculas o con espacios es el mismo');
    for (const x of ['toro?utm_source=ig', 'nadie', 'to', '', null])
      t.eq(await ver('anon', x), null, 'un link que no existe o no es válido: null (' + JSON.stringify(x) + ')');
    await pg(`update public.profiles set avatar_path = '${FOTO_T}' where id = '${T}';`);
    t.eq((await ver('anon', 'toro')).foto, FOTO_T, 'con foto de perfil: la ruta, para pedir el link firmado');
    await pg(`update public.profiles set coach_id = '${T}' where id = '${A}';`);
    const vA = await ver(A, 'toro'), vT = await ver(T, 'toro'), vB = await ver(B, 'toro');
    t.eq([vA.es_mi_coach, vA.soy_yo], [true, false], 'su alumna: es_mi_coach');
    t.eq([vT.es_mi_coach, vT.soy_yo], [false, true], 'el mismo coach: soy_yo');
    t.eq([vB.es_mi_coach, vB.soy_yo], [false, false], 'otra persona con sesión: ninguno de los dos');
    await pg(`insert into public.user_blocks (blocker, blocked) values ('${T}', '${B}');`);
    t.eq(await ver(B, 'toro'), null, 'el coach lo bloqueó: con sesión no ve la página');
    t.eq(await fotoOk(B, FOTO_T), false, 'ni la foto');
    await pg(`delete from public.user_blocks; insert into public.user_blocks (blocker, blocked) values ('${B}', '${T}');`);
    t.eq(await ver(B, 'toro'), null, 'él bloqueó al coach: tampoco');
    await pg('delete from public.user_blocks;');
    t.eq((await ver(B, 'toro')).alias, 'toro', 'sin el bloqueo la ve de nuevo');
    // Una ruta de otra carpeta (hoy la frena validaciones.sql, pero puede haber alguna guardada de
    // antes) no se devuelve: la política tampoco la dejaría ver.
    const aMano = ruta => pg(`set session_replication_role = replica; update public.profiles set avatar_path = '${ruta}' where id = '${O}'; reset session_replication_role;`);
    await aMano(FOTO_T);
    t.eq((await ver('anon', 'olga')).foto, null, 'una foto de la carpeta de otro: no se devuelve');
    await aMano(FOTO_O);

    // ===== La foto en Storage =====
    await pg(`insert into storage.objects (bucket_id, name) values ('avatars', '${FOTO_T}'), ('avatars', '${FOTO_T_VIEJA}'), ('avatars', '${FOTO_B}'),
      ('productos', '${FOTO_T}');`);
    t.eq(await fotos('anon'), [FOTO_T], 'sin sesión: solo la foto de perfil del coach con página (ni su foto vieja ni la de nadie más)');
    t.eq(await como('anon', `select coalesce(jsonb_agg(name), '[]') from storage.objects where bucket_id = 'productos'`), [], 'y nada de otros buckets');
    t.eq(await fotos(B), [FOTO_T, FOTO_B], 'con sesión: la propia y la de la página');
    for (const x of [null, '', 'nada', FOTO_T.toUpperCase(), FOTO_T + '/x', '../' + FOTO_T, T + '/../' + FOTO_B, FOTO_T_VIEJA])
      t.eq(await fotoOk('anon', x), false, 'coach_pagina_foto_ok: ' + JSON.stringify(x) + ' no');
    t.eq(await fotoOk('anon', FOTO_T), true, 'coach_pagina_foto_ok: la foto de la página sí');
    t.eq(await fotoOk('anon', FOTO_O), true, 'la de perfil de otro coach con la página visible, también');

    // Apagar la foto y la página (el coach).
    let m = await guardar(T, null, null, false);
    t.eq([m.alias, m.activa, m.con_foto], ['toro', true, false], 'apagar la foto deja el link y la página');
    t.eq((await ver('anon', 'toro')).foto, null, 'sin la foto: foto null');
    t.eq(await fotos('anon'), [], 'y Storage ya no la da');
    m = await guardar(T, '', false, null);
    t.eq([m.alias, m.activa, m.visible], ['toro', false, false], 'apagar la página: deja de verse');
    t.eq(await ver('anon', 'toro'), null, 'apagada: null');
    m = await guardar(T, 'toro', true, true);
    t.eq([m.activa, m.con_foto, m.visible], [true, true, true], 'prenderla otra vez');
    t.eq(await fotos('anon'), [FOTO_T], 'vuelve la foto');

    // ===== Cambiar el link =====
    m = await guardar(T, 'toro.fit');
    t.eq([m.alias, m.cambia_desde], ['toro.fit', null], 'en las primeras 24 horas se cambia libre');
    t.eq(await J(`select coalesce(jsonb_agg(alias), '[]') from public.coach_alias_viejos`), [], 'y el anterior queda libre');
    t.eq(await ver('anon', 'toro'), null, '«toro» ya no lleva a nada');
    t.eq((await guardar(O, 'toro')).alias, 'toro', 'otro coach lo puede tomar');
    await pg(`update public.coach_paginas set creada_at = now() - interval '2 days', alias_at = now() - interval '2 days' where coach_id = '${T}';`);
    m = await guardar(T, 'toro-fit');
    t.eq(m.alias, 'toro-fit', 'pasadas las 24 horas, el primer cambio');
    const desde = await J(`select to_jsonb(alias_at + interval '7 days') from public.coach_paginas where coach_id = '${T}'`);
    t.ok(m.cambia_desde && Date.parse(m.cambia_desde) === Date.parse(desde), 'mia: desde cuándo lo puede cambiar otra vez: ' + m.cambia_desde);
    t.eq(await J(`select jsonb_agg(jsonb_build_array(alias, coach_id, hasta > now() + interval '89 days' and hasta < now() + interval '91 days')) from public.coach_alias_viejos`),
      [['toro.fit', T, true]], 'el link anterior queda guardado 90 días para el mismo coach');
    t.eq((await ver('anon', 'toro.fit')).alias, 'toro-fit', 'el link viejo lleva a la página, con el link nuevo (la página cambia la dirección)');
    const fecha = await J(`select to_jsonb(to_char((alias_at + interval '7 days') at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')) from public.coach_paginas where coach_id = '${T}'`);
    t.eq(await guardar(T, 'toro_fit'), { error: 'P0001', msg: 'Ya cambiaste tu link hace poco: lo vas a poder cambiar desde el ' + fecha + '.' },
      'un segundo cambio antes de 7 días: el mensaje con la fecha (hora de Argentina)');
    t.eq((await guardar(T, 'toro-fit', true, true)).alias, 'toro-fit', 'sin cambiar el link, guardar anda igual');
    t.eq(await guardar(O, 'toro.fit'), { error: 'P0001', msg: OCUPADO }, 'nadie toma el link viejo de otro coach');
    await pg(`update public.coach_paginas set alias_at = alias_at - interval '8 days' where coach_id = '${T}';`);
    t.eq((await mia(T)).cambia_desde, null, 'pasados los 7 días, lo puede cambiar');
    m = await guardar(T, 'toro.fit');
    t.eq(m.alias, 'toro.fit', 'vuelve a su link viejo');
    t.eq(await J(`select jsonb_agg(jsonb_build_array(alias, coach_id) order by alias) from public.coach_alias_viejos`), [['toro-fit', T]],
      'el viejo propio sale de la lista y entra el que dejó');
    t.eq((await ver('anon', 'toro-fit')).alias, 'toro.fit', 'que lleva al vigente');
    await pg(`update public.coach_alias_viejos set hasta = now() - interval '1 minute' where alias = 'toro-fit';
      insert into public.coach_alias_viejos (alias, coach_id, hasta) values ('pablo-viejo', '${PP}', now() - interval '1 day');`);
    t.eq(await ver('anon', 'toro-fit'), null, 'un link viejo vencido ya no lleva a nada');
    t.eq((await guardar(O, 'toro-fit')).alias, 'toro-fit', 'y otro coach lo puede tomar');
    t.eq(await J(`select coalesce(jsonb_agg(alias), '[]') from public.coach_alias_viejos`), [], 'guardar borra los links viejos vencidos');

    // ===== Cuándo la página no se ve =====
    t.eq(await admin(AD, T, 'pausar'), 'ok', 'el admin pausa la página');
    t.eq(await ver('anon', 'toro.fit'), null, 'pausada: null');
    m = await mia(T);
    t.eq([m.pausada, m.visible], [true, false], 'el coach ve que está pausada');
    t.eq((await guardar(T, null, true, null)).pausada, true, 'prenderla no le saca la pausa');
    t.eq(await fotos('anon'), [], 'pausada: tampoco la foto');
    t.eq(await admin(AD, T, 'reanudar'), 'ok', 'el admin la reanuda');
    t.eq((await ver('anon', 'toro.fit')).alias, 'toro.fit', 'se ve de nuevo');
    t.eq((await guardar(V, 'vera')).visible, true, 'Vera arma la suya');
    await pg(`update public.profiles set avatar_path = '${V}/1.jpg' where id = '${V}'; insert into storage.objects (bucket_id, name) values ('avatars', '${V}/1.jpg');`);
    t.eq(await fotos('anon'), [FOTO_T, `${V}/1.jpg`], 'las dos fotos se ven');
    await pg(`update public.coach_billing set trial_ends_at = now() - interval '1 day', paid_until = null where coach_id = '${V}';`);
    t.eq(await ver('anon', 'vera'), null, 'la cuenta de coach no está activa (prueba vencida): null');
    t.eq((await mia(V)).visible, false, 'y el coach ve que no se ve');
    t.eq(await fotos('anon'), [FOTO_T], 'ni su foto');
    await pg(`update public.profiles set role = 'client' where id = '${PP}';`);
    t.eq(await ver('anon', 'pepe'), null, 'la cuenta ya no es de coach: null');
    t.eq(await guardar(PP, 'pepe2'), { error: 'P0001', msg: 'Solo las cuentas de coach tienen página.' }, 'y ya no la puede cambiar');
    await pg(`update public.profiles set invite_code = null where id = '${O}';`);
    t.eq(await ver('anon', 'toro-fit'), null, 'sin código de invitación: null');
    m = await guardar(O, null, null, null);
    t.ok(/^[A-Z2-9]{8}$/.test(m.codigo || '') && m.visible === true, 'guardar le vuelve a armar el código');

    // ===== El admin =====
    t.eq(await como(B, 'select public.admin_coach_paginas()'), { error: '42501', msg: 'Solo administradores.' }, 'la lista: solo el admin');
    t.eq(await admin(T, O, 'pausar'), { error: '42501', msg: 'Solo administradores.' }, 'pausar: solo el admin (ni un coach)');
    t.eq(await admin(AD, T, 'borrar'), { error: 'P0001', msg: 'La acción tiene que ser pausar, reanudar o liberar.' }, 'una acción que no existe');
    t.eq(await admin(AD, B, 'pausar'), { error: 'P0001', msg: 'Ese coach no tiene página.' }, 'quien no tiene página');
    await pg(`insert into public.coach_alias_viejos (alias, coach_id, hasta) values ('toro-viejo', '${T}', now() + interval '30 days');`);
    const lista = await como(AD, 'select public.admin_coach_paginas()');
    const lt = (lista || []).find(x => x.coach === T) || {};
    t.eq([lt.alias, lt.nombre, lt.email, lt.activa, lt.pausada, lt.visible, (lt.viejos || []).map(v => v.alias)],
      ['toro.fit', 'Toro <b>Entrena</b>', 'toro@ejemplo.test', true, false, true, ['toro-viejo']], 'la lista: el link, el coach con su mail, si se ve y los links viejos');
    t.eq((lista || []).map(x => x.alias).sort(), ['pepe', 'toro-fit', 'toro.fit', 'vera'], 'todas las páginas');
    t.eq(await admin(AD, T, 'liberar'), 'ok', 'liberar');
    t.eq(await J(`select jsonb_build_array((select count(*) from public.coach_paginas where coach_id = '${T}'), (select count(*) from public.coach_alias_viejos where coach_id = '${T}'))`),
      [0, 0], 'liberar borra la página y sus links viejos');
    t.eq(await ver('anon', 'toro.fit'), null, 'el link liberado ya no lleva a nada');
    t.eq(await mia(T), null, 'y el coach ya no tiene página');
    t.eq(await J(`select jsonb_agg(jsonb_build_array(action, target, detail->>'accion', detail->>'alias') order by id) from public.admin_audit`),
      [['pagina_coach', T, 'pausar', 'toro.fit'], ['pagina_coach', T, 'reanudar', 'toro.fit'], ['pagina_coach', T, 'liberar', 'toro.fit']],
      'cada acción queda en admin_audit');
    t.eq((await guardar(O, 'toro.fit')).alias, 'toro.fit', 'el link liberado lo puede tomar otro coach');

    // ===== Borrar la cuenta =====
    await pg(`insert into public.coach_alias_viejos (alias, coach_id, hasta) values ('olga-vieja', '${O}', now() + interval '30 days');`);
    await pg(`delete from auth.users where id = '${O}';`);
    t.eq(await J(`select jsonb_build_array((select count(*) from public.coach_paginas where coach_id = '${O}'), (select count(*) from public.coach_alias_viejos where coach_id = '${O}'))`),
      [0, 0], 'borrar la cuenta del coach borra su página y sus links viejos');

    // ===== La tarea diaria =====
    t.eq(await J(`select jsonb_build_array(schedule, command ~ 'delete from public\\.coach_alias_viejos where hasta < now\\(\\);', active) from cron.job where jobname = 'gize-paginas-coach'`),
      ['23 6 * * *', true, true], 'la tarea de pg_cron queda anotada (06:23 UTC)');

    // Volver atrás con páginas cargadas: corre y no queda nada.
    await db.sql(volverAtras(sql));
    t.eq(await J(`select jsonb_build_array(to_regclass('public.coach_paginas') is null, to_regclass('public.coach_alias_viejos') is null,
        to_regprocedure('public.coach_pagina_ver(text)') is null, (select count(*) from cron.job where jobname = 'gize-paginas-coach'),
        (select count(*) from pg_policies where schemaname = 'storage' and policyname = '${POLITICA}'))`),
      [true, true, true, 0, 0], 'volver atrás con páginas cargadas: borra todo sin error');
  } finally {
    await db.borrar();
  }
}

// Correrlo dos veces y volver atrás: la huella del esquema.
async function vueltas(t, h, sql){
  const antes = await h.nueva(null);
  const hoy = await h.nueva('gize_sin');
  try {
    // La base de hoy sin este archivo.
    await antes.archivos(['tests/pg/supabase-simulado.sql', 'tests/pg/esquema-base.sql',
      ...orden().filter(f => f !== 'pagina-coach.sql').map(f => 'supabase/' + f), 'tests/pg/ayudas.sql']);
    const hAntes = await huella(antes), hHoy = await huella(hoy);
    const d = diferencias(hAntes, hHoy);
    t.eq([d.faltan, d.cambian], [[], []], 'pagina-coach.sql no borra ni cambia nada de lo que ya existía');
    const esNuevo = k => /^(tabla|tblacl):coach_(paginas|alias_viejos)$/.test(k) || /^(col|con|idx|pol|trg|colacl):coach_(paginas|alias_viejos)\./.test(k)
      || /^(fn|fnacl|fndueno):(coach_pagina_\w+|admin_coach_paginas?)\(/.test(k) || k === 'pol:storage.objects.' + POLITICA || k === 'cron:gize-paginas-coach';
    t.eq(d.nuevas.filter(k => !esNuevo(k)), [], 'lo nuevo es solo lo suyo: dos tablas, seis funciones, la política de la foto y la tarea');
    t.ok(hHoy['tabla:coach_paginas'] === 'kind=r rls=t force=f' && hHoy['tabla:coach_alias_viejos'] === 'kind=r rls=t force=f', 'las dos tablas con RLS');
    t.ok(FUNCIONES.every(f => d.nuevas.some(k => k.startsWith('fn:' + f + '('))), 'las seis funciones');
    t.eq(Object.keys(hHoy).filter(k => /^fnacl:(coach_pagina_\w+|admin_coach_paginas?)\(/.test(k)).sort().map(k => k.replace(/\(.*/, '') + ' ' + hHoy[k]),
      ['fnacl:admin_coach_pagina anon=false authenticated=true service_role=true', 'fnacl:admin_coach_paginas anon=false authenticated=true service_role=true',
        'fnacl:coach_pagina_foto_ok anon=true authenticated=true service_role=true', 'fnacl:coach_pagina_guardar anon=false authenticated=true service_role=true',
        'fnacl:coach_pagina_mia anon=false authenticated=true service_role=true', 'fnacl:coach_pagina_ver anon=true authenticated=true service_role=true'],
      'permisos: sin sesión solo coach_pagina_ver y coach_pagina_foto_ok');

    // Corrido otra vez: lo mismo.
    await antes.archivo('supabase/pagina-coach.sql');
    t.eq(diferencias(hHoy, await huella(antes)), { nuevas: [], faltan: [], cambian: [] }, 'cargado sobre la base sin él: la huella de la base de hoy');
    await antes.archivo('supabase/pagina-coach.sql');
    t.eq(diferencias(hHoy, await huella(antes)), { nuevas: [], faltan: [], cambian: [] }, 'corrido dos veces: la misma huella');
    // Volver atrás: exactamente la base sin él.
    await antes.sql(volverAtras(sql));
    t.eq(diferencias(hAntes, await huella(antes)), { nuevas: [], faltan: [], cambian: [] }, 'volver atrás deja la base exactamente como antes');
    await antes.archivo('supabase/pagina-coach.sql');
    t.eq(diferencias(hHoy, await huella(antes)), { nuevas: [], faltan: [], cambian: [] }, 'y se puede volver a correr después de volver atrás');

    // Sin los archivos de los que depende, se frena sin cambiar nada.
    const vacia = await h.nueva(null);
    try {
      await vacia.archivos(['tests/pg/supabase-simulado.sql', 'tests/pg/esquema-base.sql']);
      const r = await vacia.intentar(leer('supabase/pagina-coach.sql'), { una: true });
      t.ok(!r.ok && /Primero correr supabase\/foto-perfil\.sql/.test(r.msg || ''), 'sin foto-perfil.sql y los demás: se frena con el aviso: ' + (r.msg || 'corrió'));
      t.eq(await vacia.json(`select to_jsonb(to_regclass('public.coach_paginas') is null)`), true, 'y no crea nada');
    } finally { await vacia.borrar(); }
  } finally {
    await antes.borrar();
    await hoy.borrar();
  }
}

// Con los gimnasios: coach_active es la de gimnasios-vinculo.sql (sin permiso para authenticated) y
// todo anda igual, porque las funciones de la página la llaman como dueñas.
async function conGimnasios(t, h){
  const db = await h.nueva('gize_con');
  try {
    await db.sql(USUARIOS);
    const { pg, J, guardar, ver, fotos } = ayudas(db);
    t.eq(await J(`select to_jsonb(has_function_privilege('authenticated', 'public.coach_active(uuid)', 'execute'))`), false,
      'con los gimnasios, authenticated no puede llamar a coach_active');
    const m = await guardar(T, 'toro');
    t.eq(m && [m.alias, m.visible], ['toro', true], 'con los gimnasios: crear la página');
    await pg(`update public.profiles set avatar_path = '${FOTO_T}' where id = '${T}'; insert into storage.objects (bucket_id, name) values ('avatars', '${FOTO_T}'), ('avatars', '${FOTO_B}');`);
    const v = await ver('anon', 'toro');
    t.eq(v && [v.alias, v.foto, v.codigo === m.codigo], ['toro', FOTO_T, true], 'sin sesión se ve, con la foto');
    t.eq(await fotos('anon'), [FOTO_T], 'y Storage da solo esa foto');
    t.eq((await ver(B, 'toro')).alias, 'toro', 'con sesión también');
    await pg(`update public.coach_billing set trial_ends_at = now() - interval '1 day', paid_until = null where coach_id = '${T}';`);
    t.eq(await ver('anon', 'toro'), null, 'cuenta de coach no activa: null');
    t.eq(await fotos('anon'), [], 'ni la foto');
  } finally {
    await db.borrar();
  }
}
