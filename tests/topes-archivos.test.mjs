// Topes por usuario en Storage (supabase/topes-archivos.sql): ruta exacta y cantidad de archivos
// por día en chat-audio (audios del chat y de los ejercicios), productos (fotos de los pedidos) y
// avatars (foto de perfil). Antes se aceptaban archivos sin límite y en cualquier subcarpeta de
// la carpeta propia: una cuenta nueva podía llenar el espacio que paga GIZE, y lo de las
// subcarpetas quedaba para siempre porque el borrado de la cuenta no lo veía.
//   · Las rutas que arma la app entran en las de la base (si no, dejaría de poder subir).
//   · Al eliminar la cuenta, la app, borrar-audios y el panel recorren también las subcarpetas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const COACH = '33333333-3333-3333-3333-333333333333';
// Política de storage.objects por nombre → texto del with check (sin saltos de línea).
const policy = (sql, name) => ((sql.match(new RegExp('create policy "' + name + '" on storage\\.objects[\\s\\S]*?;')) || [''])[0]).replace(/\s+/g, ' ');
const rx = p => { const m = p.match(/name ~ '([^']+)'/); return m ? new RegExp(m[1]) : null; };

export default async function ({ base, t }){
  const sql = read('supabase/topes-archivos.sql');
  t.ok(sql.length > 0, 'existe supabase/topes-archivos.sql');
  const cupo = (sql.match(/create or replace function public\.storage_cupo_ok\(p_bucket text\)[\s\S]*?\$\$;/) || [''])[0].replace(/\s+/g, ' ');
  t.ok(/security definer set search_path = public/.test(cupo), 'el tope cuenta como dueño (ve storage.objects entero)');
  t.ok(/o\.bucket_id = p_bucket and o\.owner_id = auth\.uid\(\)::text and o\.created_at > now\(\) - interval '1 day'/.test(cupo), 'el tope cuenta lo que subió cada uno en las últimas 24 horas');
  t.ok(/when 'chat-audio' then 300 when 'productos' then 40 when 'avatars' then 20 else 0 end/.test(cupo), 'topes por bucket (y 0 para los demás)');
  t.ok(/revoke all on function public\.storage_cupo_ok\(text\) from public, anon;/.test(sql), 'sin sesión no se usa');
  // La lista final trae solo los buckets con archivos en subcarpetas («Filas devueltas: 0»: ninguno).
  const fin = sql.slice(sql.lastIndexOf('select bucket_id')).replace(/\s+/g, ' ');
  t.ok(/^select bucket_id, count\(\*\) as en_subcarpetas from storage\.objects where bucket_id in \('chat-audio', 'productos', 'avatars'\) and \(array_length\(storage\.foldername\(name\), 1\) > 2 or \(bucket_id <> 'chat-audio' and array_length\(storage\.foldername\(name\), 1\) > 1\)\) group by bucket_id/.test(fin),
    'la lista final trae solo los buckets con archivos en subcarpetas: ' + fin.slice(0, 120));

  const conv = policy(sql, 'chat-audio: subir en mi conversación'), ex = policy(sql, 'ejercicio-audio: el coach sube');
  const prod = policy(sql, 'productos: sube en su carpeta'), av = policy(sql, 'avatar: subir la propia'), avUp = policy(sql, 'avatar: cambiar la propia');
  for (const [n, p, b] of [['chat', conv, 'chat-audio'], ['ejercicios', ex, 'chat-audio'], ['productos', prod, 'productos'], ['avatar', av, 'avatars']]){
    t.ok(/for insert to authenticated/.test(p) && p.includes("bucket_id = '" + b + "'"), n + ': política de subir');
    t.ok(!!rx(p), n + ': ruta exacta');
    t.ok(p.includes("public.storage_cupo_ok('" + b + "')"), n + ': tope por día');
  }
  t.ok(conv.includes('public.chat_folder_mine((storage.foldername(name))[1], (storage.foldername(name))[2])'), 'chat: solo en una conversación propia');
  t.ok(ex.includes('public.ex_audio_access((storage.foldername(name))[1], true)'), 'ejercicios: solo el coach en su carpeta');
  t.ok(/for update to authenticated .*with check \(bucket_id = 'avatars' and name ~ '/.test(avUp), 'avatar: cambiar uno no lo mueve a una subcarpeta');
  for (const f of ['supabase/chat.sql', 'supabase/ejercicio-audio.sql', 'supabase/foto-perfil.sql', 'supabase/productos-revision.sql'])
    t.has(read(f), 'topes-archivos.sql', f + ' avisa que la política vigente está en topes-archivos.sql');

  // Las rutas que arma la app entran; las de subcarpetas no.
  const ok = (p, s) => { const r = rx(p); return !!r && r.test(s); };
  const { p, errs, close } = await newPage({});
  await p.goto(base + '/app/'); await wait(1000);
  const names = await p.evaluate(async () => { const g = await import('/app/ui/grabar.js');
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg', 'audio/aac'].map(x => g.newAudioName() + '.' + g.extFor(x)); });
  await close();
  t.eq(names.length, 4, 'nombres de audio de la app');
  names.forEach(n => {
    t.ok(ok(conv, COACH + '/' + ALUMNO.id + '/' + n), 'chat: la ruta de la app entra (' + n + ')');
    t.ok(ok(ex, COACH + '/ex/' + n), 'ejercicios: la ruta de la app entra (' + n + ')');
  });
  t.ok(!ok(conv, COACH + '/' + ALUMNO.id + '/x/' + names[0]), 'chat: en una subcarpeta no');
  t.ok(!ok(ex, COACH + '/ex/x/' + names[0]), 'ejercicios: en una subcarpeta no');
  // Las mismas formas que arman app/ui/chat.js, app/screens/coach/audio-ej.js, app/core/productos.js y app/core/avatar.js.
  t.ok(/const path = c\.coachId \+ "\/" \+ c\.clientId \+ "\/" \+ name \+ "\." \+ extFor\(type\);/.test(read('app/ui/chat.js')), 'chat.js arma {coach}/{alumno}/{nombre}.{ext}');
  t.ok(/const path = State\.cloudUser\.id \+ "\/ex\/" \+ newAudioName\(\) \+ "\." \+ extFor\(type\);/.test(read('app/screens/coach/audio-ej.js')), 'audio-ej.js arma {coach}/ex/{nombre}.{ext}');
  t.ok(/const path = State\.cloudUser\.id \+ "\/" \+ \(prefix \|\| ""\) \+ String\(code \|\| "x"\)\.replace\(\/\\D\/g, ""\)\.slice\(0, 14\) \+ "-" \+ Date\.now\(\) \+ "\.jpg";/.test(read('app/core/productos.js')), 'productos.js arma {usuario}/{archivo}.jpg');
  t.ok(/const path = uid \+ "\/" \+ Date\.now\(\) \+ "\.jpg";/.test(read('app/core/avatar.js')), 'avatar.js arma {usuario}/{número}.jpg');
  t.ok(ok(prod, ALUMNO.id + '/pedido-tabla-7791234567895-1760000000000.jpg') && ok(prod, ALUMNO.id + '/pedido-frente--1760000000000.jpg'), 'productos: las rutas de la app entran');
  t.ok(!ok(prod, ALUMNO.id + '/x/y.jpg'), 'productos: en una subcarpeta no');
  t.ok(ok(av, ALUMNO.id + '/1760000000000.jpg') && !ok(av, ALUMNO.id + '/x/1760000000000.jpg'), 'avatar: la ruta de la app entra y una subcarpeta no');
  t.eq(errs, [], 'errores de la página (nombres de audio)');

  // Al eliminar la cuenta, la app borra también lo de las subcarpetas (avatars y productos).
  {
    const listed = [], removed = [];
    const tree = { [ALUMNO.id]: [{ name: '1.jpg', id: 'f1' }, { name: 'vieja', id: null }], [ALUMNO.id + '/vieja']: [{ name: 'a.jpg', id: 'f2' }, { name: 'mas', id: null }], [ALUMNO.id + '/vieja/mas']: [{ name: 'b.jpg', id: 'f3' }] };
    const list = bucket => (r, J, i) => { const pre = JSON.parse(i.body || '{}').prefix || ''; listed.push(bucket + ':' + pre); return J(bucket === 'avatars' ? (tree[pre] || []) : []); };
    const rm = bucket => (r, J, i) => i.m === 'DELETE' ? (removed.push(...(JSON.parse(i.body || '{}').prefixes || []).map(x => bucket + ':' + x)), J([])) : undefined;
    const pg = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': profile('client'), '/object/list/avatars': list('avatars'), '/object/list/productos': list('productos'),
        '/object/avatars': rm('avatars'), '/object/productos': rm('productos'), '/functions/v1/borrar-audios': (r, J) => J({ removed: 0, deleted: true }) } });
    pg.p.dialogAnswer = 'ELIMINAR';
    await pg.p.goto(base + '/app/'); await wait(2500);
    await pg.p.click('#nav-config'); await wait(500);
    await pg.p.click('[data-action="cfg-delete-account"]'); await wait(1500);
    t.ok(listed.includes('avatars:' + ALUMNO.id + '/vieja/mas'), 'la app recorre las subcarpetas: ' + listed.join(', '));
    t.eq(removed.sort(), ['avatars:' + ALUMNO.id + '/1.jpg', 'avatars:' + ALUMNO.id + '/vieja/a.jpg', 'avatars:' + ALUMNO.id + '/vieja/mas/b.jpg'], 'borra los archivos de las subcarpetas');
    t.ok(pg.dialogs.includes('Tu cuenta fue eliminada.'), 'la cuenta se elimina: ' + JSON.stringify(pg.dialogs));
    t.eq(pg.errs, [], 'errores de la página (eliminar la cuenta)');
    await pg.close();
  }

  // borrar-audios y el panel (función admin) también recorren las subcarpetas.
  const ba = read('supabase/functions/borrar-audios/index.ts'), ad = read('supabase/functions/admin/index.ts');
  t.ok(/async function walk\(prefix: string, depth = 0\)[\s\S]*?\(it\.id \? out : dirs\)\.push[\s\S]*?for \(const d of dirs\) out\.push\(\.\.\.await walk\(d, depth \+ 1\)\)/.test(ba), 'borrar-audios: recorre las subcarpetas');
  t.ok(/paths\.push\(\.\.\.await walk\(me\)\);/.test(ba) && /paths\.push\(\.\.\.await walk\(c \+ "\/" \+ me\)\)/.test(ba), 'borrar-audios: la carpeta del coach y cada conversación del alumno, enteras');
  t.ok(/async function walk\(st: any, bucket: string, prefix: string, depth = 0\)[\s\S]*?for \(const d of dirs\) out\.push\(\.\.\.await walk\(st, bucket, d, depth \+ 1\)\)/.test(ad), 'panel: recorre las subcarpetas');
  t.ok(/const paths = await walk\(st, bucket, uid\);/.test(ad) && /await walk\(st, "chat-audio", uid\)/.test(ad) && /await walk\(st, "chat-audio", c \+ "\/" \+ uid\)/.test(ad), 'panel: fotos, audios del coach y conversaciones del alumno, enteras');
}
