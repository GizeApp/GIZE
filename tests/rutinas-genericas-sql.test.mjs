// supabase/rutinas-genericas.sql (se corre con el workflow "Supabase" → tarea sql): carga las
// rutinas genéricas de 1 a 6 días de la app (CATALOGO, app/core/rutinas-ejemplo.js), esconde las
// demás del catálogo, limpia las notas del catálogo que ya se habían copiado a la rutina de
// quien entrena sin coach (y los nombres de día que no son genéricos, «Martina - Pierna») y deja
// un control para que el catálogo no vuelva a guardar notas.
// Que las rutinas sean las mismas que las de la app, tal cual, lo revisa rutinas-armadas.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sinComentarios = s => s.replace(/--.*$/gm, '');
const lista = s => [...s.matchAll(/'([^']*)'/g)].map(m => m[1]);
const iguales = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());

export default async ({ t }) => {
  const sql = leer('supabase/rutinas-genericas.sql'), cuerpo = sinComentarios(sql);
  const js = leer('app/core/rutinas-ejemplo.js');

  // Las rutinas: las mismas id, nombre y para que CATALOGO, en el mismo orden.
  const app = [...js.matchAll(/\{ id: "([0-9a-f-]{36})", nombre: "([^"]+)", para: "(\w+)"/g)].map(m => ({ id: m[1], nombre: m[2], para: m[3] }));
  const rows = [...cuerpo.matchAll(/\('([0-9a-f-]{36})'::uuid, '((?:[^']|'')*)', '(\w+)', '((?:[^']|'')*)',\s*'((?:[^']|'')*)'::jsonb, (\d+), (true|false)\)/g)]
    .map(m => ({ id: m[1], nombre: m[2].replace(/''/g, "'"), para: m[3], desc: m[4].replace(/''/g, "'"), days: JSON.parse(m[5].replace(/''/g, "'")), orden: +m[6], activa: m[7] === 'true' }));
  t.ok(app.length >= 6, 'encuentra las rutinas de CATALOGO: ' + app.length);
  t.eq(rows.map(r => [r.id, r.nombre, r.para]), app.map(r => [r.id, r.nombre, r.para]), 'el SQL carga las mismas rutinas que CATALOGO (id, nombre y para)');
  t.ok(rows.every(r => /^7a1c000[1-9]-0000-4000-8000-00000000000[1-9]$/.test(r.id)), 'ids fijos 7a1c000N-…');
  t.eq(new Set(rows.map(r => r.id)).size, rows.length, 'sin ids repetidos');
  t.ok(rows.every(r => r.activa && r.nombre.length <= 80 && r.desc.length <= 160), 'activas, nombre ≤ 80 y descripción ≤ 160');
  t.ok(rows.every(r => ['todos', 'mujer', 'hombre'].includes(r.para)), 'para: todos, mujer u hombre');
  const genericas = (cuerpo.match(/insert into rg_genericas \(id\) values ([^;]+);/) || [])[1] || '';
  t.eq([...genericas.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map(m => m[1]), app.map(r => r.id), 'la lista de genéricas (rg_genericas) son los ids de CATALOGO');

  // De 1 a 6 días de entreno (los de descanso no cuentan), al menos una para todos de cada una, y
  // ordenadas por días.
  const dias = r => r.days.filter(d => (d.exercises || []).length).length;
  for (const n of [1, 2, 3, 4, 5, 6]) t.ok(rows.some(r => dias(r) === n && r.para === 'todos'), 'hay una genérica (para todos) de ' + n + ' día' + (n === 1 ? '' : 's'));
  t.ok(rows.every(r => dias(r) >= 1 && dias(r) <= 6), 'ninguna de más de 6 días');
  t.ok(rows.every(r => Math.floor(r.orden / 10) === dias(r)), 'orden por días por semana: ' + rows.map(r => r.orden).join(', '));
  t.eq(rows.map(r => r.orden), rows.map(r => r.orden).slice().sort((a, b) => a - b), 'en orden');

  // Sin notas ni nada escrito para una persona: solo los campos que copia la app.
  const CAMPOS_DIA = JSON.parse((js.match(/export const CAMPOS_DIA = (\[[^\]]*\]);/) || [])[1] || 'null');
  const CAMPOS_EJ = JSON.parse((js.match(/export const CAMPOS_EJ = (\[[^\]]*\]);/) || [])[1] || 'null');
  t.ok(Array.isArray(CAMPOS_DIA) && CAMPOS_DIA.includes('name') && !CAMPOS_DIA.includes('note'), 'campos del día que copia la app: ' + CAMPOS_DIA);
  t.ok(Array.isArray(CAMPOS_EJ) && CAMPOS_EJ.includes('mus') && !CAMPOS_EJ.some(k => /note|goal|video|audio|noSug/.test(k)), 'campos del ejercicio que copia la app: ' + CAMPOS_EJ);
  const raros = [];
  for (const r of rows) for (const d of r.days){
    Object.keys(d).forEach(k => { if (!['id', 'exercises'].concat(CAMPOS_DIA).includes(k)) raros.push(r.nombre + ' / ' + d.name + ': ' + k); });
    for (const e of d.exercises){
      Object.keys(e).forEach(k => { if (!['id', 'sets'].concat(CAMPOS_EJ).includes(k)) raros.push(r.nombre + ' / ' + e.name + ': ' + k); });
      for (const s of e.sets) if (s.kg !== '' || s.reps !== '' || (s.targetKg || '') !== '' || s.done !== false || Object.keys(s).some(k => !['id', 'kg', 'reps', 'targetKg', 'done', 'target'].includes(k))) raros.push(r.nombre + ' / ' + e.name + ': serie ' + JSON.stringify(s));
    }
  }
  t.eq(raros, [], 'las rutinas cargadas no tienen notas, objetivos, videos, audios ni kilos');
  t.ok(!rows.some(r => /"note"/.test(JSON.stringify(r.days))), 'ningún "note" en lo que se carga');

  // 1) Limpieza: solo rutinas de personas sin coach (y no de cuentas de coach), solo textos que
  //    estén en el catálogo, sin tocar las plantillas de los coaches ni borrar nada.
  const sinCoach = (cuerpo.match(/sin_coach as \(([\s\S]*?)\n\), cambian as/) || [])[1] || '';
  t.ok(/from public\.routines r\s+join public\.profiles p on p\.id = r\.client_id/.test(sinCoach), 'mira la rutina con el perfil de su dueño');
  t.ok(/where p\.coach_id is null\b/.test(sinCoach), 'solo de quien no tiene coach');
  t.ok(/and p\.role is distinct from 'coach'/.test(sinCoach), 'y no de cuentas de coach');
  const updRutinas = [...cuerpo.matchAll(/update public\.routines\b[^;]*/g)].map(m => m[0]);
  t.eq(updRutinas.length, 1, 'un solo update de routines');
  t.ok(/from cambian c\s+where r\.client_id = c\.client_id/.test(updRutinas[0] || ''), 'cambia solo las que salen de las de sin coach');
  t.ok(/public\.routine_days_ok\(c\.days\)/.test(updRutinas[0] || '') && /pg_column_size\(c\.days\) <= 500000/.test(updRutinas[0] || ''), 'solo las que la base acepta (no frena todo con routines_validate ni con el tope)');
  t.ok(/updated_at = now\(\)/.test(updRutinas[0] || ''), 'la limpia queda más nueva que la del celular');
  t.ok(!/update public\.routine_templates|delete from|truncate|drop table if exists public\./i.test(cuerpo), 'no toca las plantillas de los coaches ni borra nada');
  const textos = (cuerpo.match(/with textos as \(([\s\S]*?)\n\), sin_coach as/) || [])[1] || '';
  t.ok(/public\.rutinas_catalogo c, jsonb_path_query\(c\.days, 'lax \$\[\*\]\.note'\)/.test(textos) && /'lax \$\[\*\]\.exercises\[\*\]\.note'/.test(textos), 'las notas que saca son las que están en el catálogo (días y ejercicios)');
  t.ok(!/where[^)]*activa/.test(textos), 'de cualquier rutina del catálogo, activa o no');
  const fnTextos = (cuerpo.match(/create or replace function pg_temp\.rg_sin_textos[\s\S]*?\$\$;/) || [''])[0];
  t.ok(/d->>'note' = any\(notas\)/.test(fnTextos) && /e->>'note' = any\(notas\)/.test(fnTextos), 'saca la nota solo si es exactamente un texto del catálogo');
  t.ok(/order by i\)/.test(fnTextos) && /order by n\)/.test(fnTextos), 'mantiene el orden de días y ejercicios');

  // Nombres de día: solo los días con el mismo nombre y subtítulo que un día de una rutina
  // escondida (no genérica) del catálogo; se quedan si todas sus palabras son de rutina.
  t.ok(/pg_temp\.rg_dia_nombre\(case when d->>'note' = any\(notas\) then d - 'note' else d end, n, pares\)/.test(fnTextos), 'cambia los nombres dentro de la misma limpieza (mismo alcance: sin coach)');
  t.eq([...cuerpo.matchAll(/pg_temp\.rg_sin_textos\(/g)].length, 2, 'rg_sin_textos: se define y se usa una sola vez');
  t.ok(/pg_temp\.rg_sin_textos\(r\.days, t\.notas, t\.metas, t\.videos, t\.pares\)/.test(sinCoach), 'se usa con las rutinas de quien no tiene coach');
  t.ok(/coalesce\(d->>'name', ''\) \|\| chr\(31\) \|\| coalesce\(d->>'subtitle', ''\)\s+from public\.rutinas_catalogo c, [^\n]*\n\s+where c\.id not in \(select id from rg_genericas\) and jsonb_typeof\(d\) = 'object'\) as pares/.test(textos),
    'los pares nombre + subtítulo salen solo de las rutinas escondidas (no genéricas)');
  const fnDia = (cuerpo.match(/create or replace function pg_temp\.rg_dia_nombre[\s\S]*?\$\$;/) || [''])[0];
  t.ok(/\(coalesce\(d->>'name', ''\) \|\| chr\(31\) \|\| coalesce\(d->>'subtitle', ''\)\) = any \(pares\)\) then d/.test(fnDia), 'un día que no es de esas rutinas queda igual');
  t.ok(/pg_temp\.rg_generico\(d->>'name'\)/.test(fnDia) && /coalesce\(pg_temp\.rg_musculos\(d\), 'Día ' \|\| n\)/.test(fnDia), 'nombre: si no es genérico, los músculos o «Día N»');
  t.ok(/pg_temp\.rg_generico\(d->>'subtitle'\)/.test(fnDia) && /pg_temp\.rg_solo_dias\(split_part\(d->>'subtitle', '·', 1\)\)/.test(fnDia), 'subtítulo: si no es genérico, el día de la semana y los músculos');
  // Los músculos, como los nombra la app (EX_CATS), como mucho tres.
  const fnMus = (cuerpo.match(/create or replace function pg_temp\.rg_musculos[\s\S]*?\$\$;/) || [''])[0];
  const exCats = JSON.parse((leer('app/core/data.js').match(/export const EX_CATS = (\[[^;]*\]);/) || [])[1] || '[]');
  t.eq([...fnMus.matchAll(/\('(\w+)', '([^']+)'\)/g)].map(m => [m[1], m[2]]), exCats, 'etiquetas de los músculos = EX_CATS de data.js');
  t.ok(/limit 3\)/.test(fnMus), 'como mucho tres músculos');
  // La lista de palabras genéricas: todos los días de las rutinas genéricas pasan; un nombre
  // con el de una persona, no. (Misma cuenta que rg_palabras, en JS.)
  const fnPal = (cuerpo.match(/create or replace function pg_temp\.rg_palabras[\s\S]*?\$\$;/) || [''])[0];
  const [, de, a] = fnPal.match(/translate\(coalesce\(t, ''\), '([^']+)', '([^']+)'\)/) || [, '', ''];
  t.ok(de.length > 20 && [...de].length === [...a].length, 'saca los acentos (mayúsculas y minúsculas)');
  t.ok(/'\[\[:space:\]\[:punct:\]·«»¿¡“”‘’–—…\]\+'/.test(fnPal) && /w !~ '\^\(\[a-d\]\|\[0-9\]\+\|x\[0-9\]\+\|\[0-9\]\+x\)\$'/.test(fnPal), 'separa por espacios y signos; sin letras sueltas A-D ni números');
  const vocab = lista((cuerpo.match(/create or replace function pg_temp\.rg_generico[\s\S]*?array\[([\s\S]*?)\]\)\);/) || [])[1] || '');
  const palabras = x => [...String(x || '')].map(c => de.includes(c) ? [...a][[...de].indexOf(c)] : c).join('').toLowerCase()
    .split(/[\s!-/:-@[-`{-~·«»¿¡“”‘’–—…]+/).filter(w => w && !/^([a-d]|[0-9]+|x[0-9]+|[0-9]+x)$/.test(w));
  const generico = x => palabras(x).every(w => vocab.includes(w));
  t.ok(vocab.length > 100 && ['pierna', 'torso', 'empuje', 'tiron', 'gluteos', 'dia', 'lunes', 'sabado', 'y', 'de'].every(w => vocab.includes(w)), 'lista de palabras genéricas: ' + vocab.length);
  t.ok(vocab.every(w => /^[a-z]+$/.test(w) && palabras(w).join() === w), 'la lista ya está normalizada (minúscula, sin acentos)');
  const noGen = [...new Set(rows.flatMap(r => r.days.flatMap(d => [d.name, d.subtitle])))].filter(x => !generico(x));
  t.eq(noGen, [], 'los nombres y subtítulos de las rutinas genéricas son genéricos');
  t.eq(['Pierna A', 'Torso (Upper)', 'Día 2 (B)', 'Glúteos e isquios', 'Lunes · Pecho · Espalda', 'Full body x2', 'Martina - Pierna', 'Día de Juli', 'Pierna Martu', 'Lunes · Para Ana'].map(generico),
    [true, true, true, true, true, true, false, false, false, false], 'genérico o no (ejemplos)');
  const semana = lista((cuerpo.match(/create or replace function pg_temp\.rg_solo_dias[\s\S]*?bool_or\(w = any \(array\[([^\]]*)\]/) || [])[1] || '');
  t.ok(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].every(w => semana.includes(w) && vocab.includes(w)), 'días de la semana');
  t.ok(/dias as \(/.test(cuerpo) && /from limpias l\s+join sin_coach s on s\.client_id = l\.client_id/.test(cuerpo), 'cuenta los días cambiados solo de las rutinas que sí se limpiaron');

  // 2) Las demás del catálogo se esconden (no se borran).
  t.ok(/update public\.rutinas_catalogo set activa = false\s+where activa and id not in \(select id from rg_genericas\)/.test(cuerpo), 'esconde las que no son genéricas');

  // 3) Para lo que venga: el catálogo guarda solo los campos de la rutina, los mismos que la app.
  const fnGen = (cuerpo.match(/create or replace function public\.rutina_generica\(days jsonb\)[\s\S]*?\$\$;/) || [''])[0];
  const claves = [...fnGen.matchAll(/where k in \(([^)]*)\)/g)].map(m => lista(m[1]));
  t.eq(claves.length, 3, 'rutina_generica: una lista para días, ejercicios y series');
  t.ok(iguales(claves[0] || [], ['id'].concat(CAMPOS_DIA)), 'días: los mismos campos que copia la app: ' + claves[0]);
  t.ok(iguales(claves[1] || [], ['id'].concat(CAMPOS_EJ)), 'ejercicios: los mismos campos que copia la app: ' + claves[1]);
  t.ok(iguales(claves[2] || [], ['id', 'target']), 'series: solo el objetivo: ' + claves[2]);
  t.ok(/'\{"kg": "", "reps": "", "targetKg": "", "done": false\}'::jsonb/.test(fnGen), 'series con kilos, reps y tilde vacíos');
  t.ok(/new\.days := public\.rutina_generica\(new\.days\)/.test(cuerpo), 'el trigger guarda lo que deja rutina_generica');
  t.ok(/create trigger rutinas_catalogo_limpiar before insert or update of days, activa on public\.rutinas_catalogo\s+for each row when \(new\.activa\) execute function public\.rutinas_catalogo_limpiar\(\);/.test(cuerpo),
    'trigger al cargar o cambiar una activa, o al volver a activarla');
  const valida = (sinComentarios(leer('supabase/rutinas-catalogo.sql')).match(/create trigger (\w+) before insert or update of days on public\.rutinas_catalogo/) || [])[1] || '';
  t.ok(valida && 'rutinas_catalogo_limpiar' < valida, 'corre antes que la validación (' + valida + ', van por orden alfabético): se valida lo que queda');
  t.ok(/revoke all on function public\.rutina_generica\(jsonb\) from public, anon;/.test(cuerpo), 'rutina_generica: nada para usuarios sin sesión');
  t.ok(cuerpo.indexOf('create trigger rutinas_catalogo_limpiar') < cuerpo.indexOf('insert into public.rutinas_catalogo'), 'las genéricas también pasan por el control');
  t.ok(cuerpo.indexOf('with textos as') < cuerpo.indexOf('update public.rutinas_catalogo'), 'limpia las rutinas antes de tocar el catálogo');
  t.has(leer('supabase/rutinas-catalogo.sql'), 'rutinas-genericas.sql', 'rutinas-catalogo.sql explica dónde está el control');

  // 4) Carga: upsert, todo en una transacción y se puede correr varias veces.
  t.ok(/on conflict \(id\) do update set[\s\S]*days = excluded\.days, orden = excluded\.orden, activa = true;/.test(cuerpo), 'actualiza las que ya están (por id)');
  t.ok(/^\s*begin;/m.test(cuerpo) && cuerpo.indexOf('begin;') < cuerpo.indexOf('with textos as') && cuerpo.indexOf('commit;') > cuerpo.indexOf('insert into public.rutinas_catalogo'), 'todo en una transacción');
  t.ok(/drop table if exists pg_temp\.rg_genericas;/.test(cuerpo) && /drop table if exists pg_temp\.rg_resumen;/.test(cuerpo), 'las tablas temporales se rehacen al volver a correrlo');

  // Resultado: el log del workflow es público, así que la última consulta devuelve solo cantidades.
  const ultima = cuerpo.slice(cuerpo.lastIndexOf('notify pgrst')).replace(/^notify pgrst, 'reload schema';/, '').trim();
  t.ok(/^with genericas as \(/.test(ultima) && cuerpo.indexOf('commit;') < cuerpo.lastIndexOf('notify pgrst'), 'termina con la consulta del resumen, después del commit');
  const alias = [...ultima.matchAll(/\bas (\w+)(?=,|;|\s*$)/g)].map(m => m[1]);
  t.eq(alias, ['activas_de_1_dia', 'activas_de_2_dias', 'activas_de_3_dias', 'activas_de_4_dias', 'activas_de_5_dias', 'activas_de_6_dias', 'otras_activas', 'activas_con_notas',
    'escondidas_ahora', 'escondidas_en_total', 'rutinas_limpiadas', 'rutinas_sin_poder_limpiar', 'dias_renombrados', 'subtitulos_cambiados'], 'columnas del resumen');
  const salida = ultima.slice(ultima.indexOf('\nselect '));
  t.eq(salida.split(/,\n\s*/).filter(c => !/^\s*(select )?\(select (count\(\*\)|n) from /.test(c)), [], 'cada columna es una cantidad (count o el número guardado)');
  t.ok(!/email|full_name|nombre|descripcion|client_id|coach_id|auth\.|select \*|->>|#>>/.test(ultima), 'sin columnas de personas ni textos');
};
