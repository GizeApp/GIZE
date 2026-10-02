// Cardio «A pie» / «En bici», paso 3: las salidas en la nube, la ficha del coach y la privacidad.
// a) supabase/cardio-a-pie.sql: tabla cardio_outings re-ejecutable, RLS (alumno: crear, leer y
//    borrar las suyas; su coach: leer), sin update, topes (recorrido de hasta 200.000
//    caracteres) y borrado en cascada con la cuenta. Política de privacidad con «Ubicación».
// b) Alumno: guardar una salida terminada (core/salidas.js saveEnded) → la fila que sale por la
//    cola (columnas, recorrido «1;…», sin coordenadas en ningún otro lado); tabla que falta → la
//    salida queda pendiente sin trabar lo demás (un peso encolado detrás sale igual) y el pie lo
//    explica; cuando la tabla existe, sale. Borrar una pendiente → no se manda y sale el DELETE.
//    loadCloud mezcla la nube (sin el recorrido) con lo local y respeta los borrados pendientes.
//    El recorrido se pide una vez al abrir la salida y después sale de la caché.
//    clearAccountLeftovers borra la salida en curso y la caché de recorridos.
// c) Coach: tarjeta «Salidas a pie y en bici» en la ficha, lista con fecha, modo, km, tiempo,
//    kcal y «20 min caminando · 15 trotando · 10 corriendo», detalle con el recorrido (pedido
//    recién al abrir, una vez), números y parciales; «Atrás» de Android; 320 px; neón apagado;
//    tabla que falta.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const OUT = 'core_outbox_v1';
const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const NO_TABLE = { code: 'PGRST205', details: null, hint: null, message: "Could not find the table 'public.cardio_outings' in the schema cache" };
const COLS = ['avg_speed_kmh', 'breakdown', 'client_id', 'distance_m', 'duration_s', 'ended_at', 'gap_s', 'id', 'kcal', 'max_speed_kmh', 'mode', 'moving_s',
  'performed_on', 'points', 'segments', 'splits', 'started_at', 'track', 'weight_default', 'weight_kg'];
// Lo que piden las listas: todo menos el recorrido (track), que se pide al abrir una salida.
const LIST_COLS = 'id,mode,performed_on,started_at,ended_at,duration_s,moving_s,distance_m,kcal,avg_speed_kmh,max_speed_kmh,weight_kg,weight_default,gap_s,breakdown,segments,splits,points,created_at';
const ID = n => '5a1d0000-0000-4000-8000-00000000000' + n;
const ESPERA = 'Tus salidas quedan guardadas en este celular y se suben solas a tu cuenta apenas se pueda';

// Supabase falso para cardio_outings. S.get / S.write: 'ok' o 'missing' (la tabla no existe).
// S.rows: lo que devuelve la lista; S.tracks: {id: recorrido}. S.reqs anota cada pedido.
const outings = S => (r, J, i) => {
  const q = decodeURIComponent(i.url.search);
  S.reqs.push({ m: i.m, q, body: i.body, prefer: r.request().headers()['prefer'] || '' });
  if (i.m === 'GET'){
    if (S.get === 'missing') return J(NO_TABLE, 404);
    if (/select=track/.test(q)){ const id = (q.match(/id=eq\.([0-9a-f-]+)/) || [])[1], tr = S.tracks[id]; return J(i.one ? (tr ? { track: tr } : null) : (tr ? [{ track: tr }] : [])); }
    return J(S.rows);
  }
  if (S.write === 'missing') return J(NO_TABLE, 404);
  return J([], i.m === 'POST' ? 201 : 200);
};

// Una salida terminada armada con el motor (puntos en línea recta, uno por segundo) y puesta
// como la salida de ui/gps.js, con sus partes guardadas como si la hubiera medido.
const endedRun = (p, id, mode, legs, minsAgo) => p.evaluate(async ([id, mode, legs, minsAgo, uid]) => {
  const g = await import('/app/ui/gps.js'), m = await import('/app/core/cardiogps.js');
  const t0 = Date.now() - minsAgo * 60000, run = m.newRun(mode, t0, id);
  run.uid = uid;
  let lat = -34.6, t = t0;
  for (const [kmh, n] of legs) for (let i = 0; i < n; i++){ t += 1000; lat += kmh / 3.6 / 111195; m.addPoint(run, { lat, lon: -58.4, acc: 5, spd: null, t }); }
  m.endRun(run, t + 1000);
  g.GpsState.run = run;
  localStorage.setItem('gize_salida_v1', JSON.stringify({ v: 1, id, status: 'ended' }));
  localStorage.setItem('gize_salida_v1_c0', JSON.stringify(run.pts.slice(0, 400)));
}, [id, mode, legs, minsAgo, ALUMNO.id]);
const call = (p, mod, fn, ...args) => p.evaluate(async ([mod, fn, args]) => {
  const v = await (await import(mod))[fn](...args);
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}, [mod, fn, args]);
const queue = p => p.evaluate(o => JSON.parse(localStorage.getItem(o) || '[]').map(i => i.k + ':' + ((i.p && (i.p.id || i.p.date)) || '')), OUT);
const appState = p => p.evaluate(async () => JSON.parse(JSON.stringify((await import('/app/core/state.js')).state)));

// El recorrido de una salida abierta (ui/mapa.js): espera a que termine de dibujarse.
const rutaLista = async p => { for (let i = 0; i < 100; i++){ if (await p.evaluate(() => { const v = document.querySelector('.sal-ruta .rv'); return !!v && v.dataset.estado === 'listo'; })) return true; await wait(100); } return false; };
// Píxeles de la línea y de las marcas (el anillo del inicio va con el color frío; en este
// recorrido las vueltas corriendo tapan las caminando): cuántos, con color, y cerca de a (lento)
// y de b (rápido).
const rutaPx = (p, a, b) => p.evaluate(([a, b]) => {
  const cs = [...document.querySelectorAll('.sal-ruta .rv-line, .sal-ruta .rv-head')]; if (cs.length < 2) return null;
  const r = cs[0].getBoundingClientRect();
  let n = 0, sat = 0, na = 0, nb = 0;
  for (const c of cs){
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const near = (i, x) => Math.abs(d[i] - x[0]) + Math.abs(d[i + 1] - x[1]) + Math.abs(d[i + 2] - x[2]) < 60;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200){ n++; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) sat++; if (near(i, a)) na++; if (near(i, b)) nb++; }
  }
  return { w: r.width, h: r.height, n, sat, a: na, b: nb };
}, [a, b]);

export default async function ({ base, t }){
  // ===== a) SQL y política =====
  const sql = read('supabase/cardio-a-pie.sql');
  t.ok(/create table if not exists public\.cardio_outings/.test(sql), 'SQL: create table if not exists cardio_outings');
  t.ok(/client_id\s+uuid not null default auth\.uid\(\) references auth\.users\(id\) on delete cascade/.test(sql), 'SQL: se borra con la cuenta (on delete cascade a auth.users)');
  t.ok(/enable row level security/.test(sql), 'SQL: RLS');
  const pols = [...sql.matchAll(/create policy "([^"]+)" on public\.cardio_outings\s+for (\w+) (using|with check) \(([^;]+)\);/g)].map(m => [m[2], m[4].replace(/\s+/g, ' ')]);
  t.eq(pols, [['insert', 'client_id = auth.uid()'], ['delete', 'client_id = auth.uid()'], ['select', '(client_id = auth.uid()) or is_my_client(client_id)']],
    'SQL: el alumno crea y borra las suyas; él y su coach las leen');
  const created = [...sql.matchAll(/create policy "([^"]+)"/g)].map(m => m[1]), dropped = [...sql.matchAll(/drop policy if exists "([^"]+)"/g)].map(m => m[1]);
  t.eq(dropped, created, 'SQL: cada política se borra antes de crearla (se puede volver a correr)');
  const added = [...sql.matchAll(/add constraint (\w+)/g)].map(m => m[1]), droppedC = [...sql.matchAll(/drop constraint if exists (\w+)/g)].map(m => m[1]);
  t.ok(added.length >= 10 && JSON.stringify(added) === JSON.stringify(droppedC), 'SQL: cada límite se borra antes de agregarlo: ' + added.length);
  t.ok(/grant select, insert, delete on public\.cardio_outings to authenticated/.test(sql) && !/grant[^;]*update[^;]*cardio_outings/.test(sql), 'SQL: sin update');
  t.ok(/revoke all on public\.cardio_outings from anon, authenticated/.test(sql), 'SQL: nada para anónimos');
  t.ok(/length\(track\) between 3 and 200000 and left\(track, 2\) = '1;'/.test(sql), 'SQL: recorrido de hasta 200.000 caracteres con versión');
  t.ok(/create index if not exists cardio_outings_client_inicio on public\.cardio_outings \(client_id, started_at desc\)/.test(sql), 'SQL: índice por alumno y fecha');
  t.ok(/notify pgrst, 'reload schema'/.test(sql), 'SQL: avisa a la API');
  t.ok(!/cardio_sessions\s*\(|cardio_routes\s*\(|drop table/.test(sql), 'SQL: no toca las tablas viejas');
  const pol = read('privacidad/index.html');
  t.has(pol, '<h2 id="ubicacion">Ubicación</h2>', 'política: sección Ubicación');
  t.has(pol, 'solo mientras registrás una salida a pie o en bici', 'política: cuándo se usa la ubicación');
  t.has(pol, 'con la pantalla bloqueada o la app en segundo plano', 'política: en segundo plano solo durante la salida');
  t.has(pol, 'lo ven solo vos y tu coach', 'política: quién ve el recorrido');
  t.has(pol, 'Se borra cuando borrás la salida o tu cuenta', 'política: cómo se borra');
  t.has(pol, '<b>Salidas a pie o en bici:</b>', 'política: qué se guarda de una salida');
  t.has(pol, 'tus salidas y sus recorridos', 'política: se borran con la cuenta');
  t.has(pol, '<b>OpenFreeMap:</b>', 'política: el mapa de fondo');
  t.ok(!/No usamos tu ubicación, tus contactos/.test(pol), 'política: ya no dice que nunca usa la ubicación');
  t.has(read('app/screens/config.js'), 'tus salidas de Cardio (con sus recorridos)', 'eliminar la cuenta avisa que se borran las salidas');

  // ===== b) Alumno =====
  const S = { get: 'missing', write: 'missing', rows: [], tracks: {}, reqs: [], weightPosts: [] };
  const pg = await newPage({ user: ALUMNO, state: STATE, handlers: {
    '/profiles': profile('client'),
    '/body_weights': (r, J, i) => { if (i.m === 'GET') return J([{ id: 'w1', client_id: ALUMNO.id, measured_on: '2026-09-20', kg: 72 }]);
      if (i.m === 'POST'){ S.weightPosts.push(i.body); return J([], 201); } return undefined; },
    '/cardio_outings': outings(S),
  } });
  const p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  t.ok(S.reqs.some(r => r.m === 'GET' && new URLSearchParams(r.q).get('select') === LIST_COLS), 'loadCloud pide las salidas sin el recorrido: ' + JSON.stringify(S.reqs.map(r => r.q)));
  t.eq((await appState(p)).salidas, [], 'sin la tabla: ninguna salida y sin errores');

  // Guardar con la tabla que falta.
  await endedRun(p, ID(1), 'pie', [[5, 1200], [8, 900], [11, 600]], 50);
  const rec = await call(p, '/app/core/salidas.js', 'saveEnded');
  t.ok(rec && rec.id === ID(1) && rec.mode === 'pie', 'saveEnded devuelve la salida guardada');
  t.ok(rec && rec.kg === 72 && rec.kgDefault === false, 'las calorías con el último peso cargado (72 kg): ' + JSON.stringify(rec && [rec.kg, rec.kgDefault]));
  t.ok(rec && Math.abs(rec.breakdown.caminar - 1200) <= 60 && Math.abs(rec.breakdown.trotar - 900) <= 60 && Math.abs(rec.breakdown.correr - 600) <= 60, 'desglose ≈ 20 / 15 / 10 min: ' + JSON.stringify(rec && rec.breakdown));
  t.eq(await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('gize_salida_v1'))), [], 'la salida en curso guardada se borra');
  t.eq(await p.evaluate(async () => (await import('/app/ui/gps.js')).GpsState.run), null, 'y ya no hay salida en curso');
  // Un peso anotado detrás de la salida sale igual.
  await p.evaluate(([o, uid]) => { const q = JSON.parse(localStorage.getItem(o) || '[]'); q.push({ id: 'q-peso', uid, k: 'weight', key: '2026-10-01', p: { date: '2026-10-01', kg: 71.5 }, ts: Date.now() }); localStorage.setItem(o, JSON.stringify(q)); }, [OUT, ALUMNO.id]);
  await wait(4500);
  t.eq(await call(p, '/app/core/supabase.js', 'flushOutbox'), false, 'flushOutbox avisa que quedó algo');
  t.ok(S.weightPosts.some(b => /71\.5/.test(b || '')), 'el peso encolado detrás de la salida sale igual');
  t.eq(await queue(p), ['salida:' + ID(1)], 'la salida queda pendiente (sola) en la cola');
  t.eq(await call(p, '/app/core/supabase.js', 'syncFootText'), ESPERA, 'el pie explica que las salidas se suben solas más adelante');
  t.eq(await call(p, '/app/core/supabase.js', 'salidasEnEspera'), true, 'salidasEnEspera() para la pantalla');
  let st = await appState(p);
  t.eq(st.salidas.map(s => s.id), [ID(1)], 'la salida queda en state.salidas');
  t.ok(st.salidas[0] && !('track' in st.salidas[0]) && !st.salidas[0].cloud, 'en el estado, sin recorrido y sin marcar como subida');

  // La fila que sale.
  const post = S.reqs.filter(r => r.m === 'POST').pop();
  let row = null; try { row = JSON.parse(post.body); if (Array.isArray(row)) row = row[0]; } catch (e) {}
  t.eq(row && Object.keys(row).sort(), COLS, 'la fila de cardio_outings: las columnas de la tabla');
  t.ok(row && row.id === ID(1) && row.client_id === ALUMNO.id && row.mode === 'pie' && /^\d{4}-\d{2}-\d{2}$/.test(row.performed_on), 'id, alumno, modo y fecha');
  t.ok(row && row.duration_s >= 2700 && row.duration_s <= 2702 && row.distance_m > 5400 && row.distance_m < 5600 && row.kcal > 300 && row.weight_kg === 72 && row.weight_default === false,
    'duración, distancia, calorías y peso: ' + JSON.stringify(row && [row.duration_s, row.distance_m, row.kcal, row.weight_kg]));
  t.ok(row && typeof row.track === 'string' && row.track.startsWith('1;') && row.points >= 2, 'el recorrido va codificado («1;…»)');
  const noTrack = row ? JSON.stringify(Object.assign({}, row, { track: null })) : '';
  t.ok(row && !/"lat|"lon|-34\.\d{3}|-58\.\d{3}/.test(noTrack), 'ninguna otra columna tiene coordenadas');
  t.ok(post && /on_conflict=id/.test(post.q) && /resolution=ignore-duplicates/.test(post.prefer), 'upsert por id sin pisar (reintentar no duplica): ' + JSON.stringify(post && [post.q, post.prefer]));
  const cache = await p.evaluate(() => JSON.parse(localStorage.getItem('gize_salidas_track_v1') || '[]'));
  t.eq(cache.map(x => x[0]), [ID(1)], 'el recorrido queda en la caché del celular');
  t.eq(cache[0] && cache[0][1], row && row.track, 'el mismo recorrido que sale a la nube');

  // La tabla ya existe: sale y queda marcada como subida.
  S.write = 'ok'; S.get = 'ok';
  t.eq(await call(p, '/app/core/supabase.js', 'flushOutbox'), true, 'con la tabla, la cola se vacía');
  t.eq(await queue(p), [], 'cola vacía');
  st = await appState(p);
  t.eq(st.salidas[0] && st.salidas[0].cloud, true, 'la salida queda marcada como subida');
  t.eq(await call(p, '/app/core/supabase.js', 'syncFootText'), 'Sincronizado con tu cuenta', 'el pie vuelve a «Sincronizado»');
  const disk = await p.evaluate(() => localStorage.getItem('rutina_jero_v1') || '');
  t.ok(disk.includes(ID(1)) && !/"track"|"lat"|"lon"/.test(disk), 'lo guardado en el dispositivo tiene la salida sin recorrido ni coordenadas');

  // Borrar una salida que todavía no salió: no se manda y sale el DELETE.
  S.write = 'missing';
  await endedRun(p, ID(2), 'bici', [[20, 600]], 15);
  const rec2 = await call(p, '/app/core/salidas.js', 'saveEnded');
  t.ok(rec2 && rec2.mode === 'bici' && rec2.breakdown.bici > 540, 'una salida en bici: ' + JSON.stringify(rec2 && rec2.breakdown));
  await wait(300);
  t.eq(await queue(p), ['salida:' + ID(2)], 'pendiente');
  await p.evaluate(id => { window.__del = null; import('/app/core/salidas.js').then(m => m.deleteSalida(id)).then(v => { window.__del = v; }); }, ID(2));
  await wait(300);
  t.eq(await queue(p), ['salidaDelete:' + ID(2)], 'al borrarla sale de la cola sin mandarse y queda el borrado');
  t.eq((await appState(p)).salidas.map(s => s.id), [ID(1)], 'ya no está en la lista');
  t.eq(await p.evaluate(id => JSON.parse(localStorage.getItem('gize_salidas_track_v1') || '[]').map(x => x[0]).includes(id), ID(2)), false, 'ni su recorrido en la caché');
  await wait(4500);
  S.write = 'ok';
  const from = S.reqs.length;
  await call(p, '/app/core/supabase.js', 'flushOutbox');
  const del = S.reqs.filter(r => r.m === 'DELETE').pop();
  t.ok(del && del.q.includes('id=eq.' + ID(2)) && del.q.includes('client_id=eq.' + ALUMNO.id), 'DELETE con el id y el alumno: ' + (del && del.q));
  t.eq(S.reqs.slice(from).filter(r => r.m === 'POST' && (r.body || '').includes(ID(2))).length, 0, 'la salida borrada ya no se manda');
  t.eq(await queue(p), [], 'cola vacía después del borrado');

  // loadCloud: nube (sin recorrido) + las del celular que no subieron − las borradas pendientes.
  // ID(1): en la nube. ID(4): estuvo en la nube y ya no (se borró en otro dispositivo). ID(3):
  // local, pendiente. ID(5): nueva desde otro dispositivo. ID(6): en la nube con borrado pendiente.
  const cloudRow = (id, mode, startedAt, extra) => Object.assign({ id, client_id: ALUMNO.id, mode, performed_on: startedAt.slice(0, 10), started_at: startedAt, ended_at: null,
    duration_s: 1800, moving_s: 1700, distance_m: 4000, kcal: 250, avg_speed_kmh: 8.47, max_speed_kmh: 11.2, weight_kg: 72, weight_default: false, gap_s: 0,
    breakdown: { caminar: 1700 }, segments: [], splits: [[1000, 420]], points: 40, created_at: startedAt }, extra || {});
  S.rows = [cloudRow(ID(1), 'pie', st.salidas[0].startedAt.replace('Z', '+00:00')), cloudRow(ID(5), 'bici', '2026-09-28T12:00:00+00:00'), cloudRow(ID(6), 'pie', '2026-09-29T12:00:00+00:00')];
  S.tracks[ID(5)] = '1;nubesinsentido';
  S.write = 'missing';
  await p.evaluate(([o, uid, id3, id4, id6]) => {
    return import('/app/core/state.js').then(({ state }) => {
      const base = { mode: 'pie', dur: 900, moving: 880, dist: 2000, kcal: 120, avg: 8.2, max: 10, kg: 72, kgDefault: false, gap: 0, points: 10, breakdown: { trotar: 880 }, segments: [], splits: [] };
      state.salidas.push(Object.assign({ id: id3, date: '2026-09-30', startedAt: '2026-09-30T12:00:00.000Z' }, base));
      state.salidas.push(Object.assign({ id: id4, date: '2026-09-27', startedAt: '2026-09-27T12:00:00.000Z', cloud: true }, base));
      const q = JSON.parse(localStorage.getItem(o) || '[]');
      q.push({ id: 'q3', uid, k: 'salida', key: id3, p: Object.assign({ id: id3, date: '2026-09-30', startedAt: '2026-09-30T12:00:00.000Z', track: '1;local' }, base), ts: Date.now() });
      q.push({ id: 'q6', uid, k: 'salidaDelete', key: id6, p: { id: id6 }, ts: Date.now() });
      localStorage.setItem(o, JSON.stringify(q));
    });
  }, [OUT, ALUMNO.id, ID(3), ID(4), ID(6)]);
  const order = [[ID(5), '2026-09-28T12:00:00Z'], [ID(3), '2026-09-30T12:00:00Z'], [ID(1), st.salidas[0].startedAt]].sort((a, b) => Date.parse(a[1]) - Date.parse(b[1])).map(x => x[0]);
  await call(p, '/app/core/supabase.js', 'loadCloud');
  st = await appState(p);
  t.eq(st.salidas.map(s => s.id), order, 'loadCloud: nube + la local pendiente, sin la borrada en otro lado ni la de borrado pendiente (de la más vieja a la más nueva)');
  const s5 = st.salidas.find(s => s.id === ID(5));
  t.ok(s5 && s5.cloud === true && s5.mode === 'bici' && s5.dist === 4000 && s5.avg === 8.47 && !('track' in s5), 'una salida de la nube como la guarda la app: ' + JSON.stringify(s5));
  t.eq((await call(p, '/app/core/salidas.js', 'salidasList')).map(s => s.id), order.slice().reverse(), 'salidasList: de la más nueva a la más vieja');

  // El recorrido se pide al abrir la salida, una vez.
  const trackGets = () => S.reqs.filter(r => r.m === 'GET' && /select=track/.test(r.q)).length;
  t.eq(trackGets(), 0, 'nadie pidió recorridos todavía');
  t.eq(await call(p, '/app/core/salidas.js', 'getTrack', ID(5)), '1;nubesinsentido', 'getTrack trae el recorrido de la nube');
  t.eq(trackGets(), 1, 'un pedido con select=track');
  t.ok(S.reqs.some(r => /select=track/.test(r.q) && r.q.includes('id=eq.' + ID(5))), 'pedido por id');
  t.eq(await call(p, '/app/core/salidas.js', 'getTrack', ID(5)), '1;nubesinsentido', 'la segunda vez, de la caché');
  t.eq(await call(p, '/app/core/salidas.js', 'getTrack', ID(3)), '1;local', 'una pendiente: de la cola, sin pedir nada');
  t.eq(await call(p, '/app/core/salidas.js', 'getTrack', ID(1)), row && row.track, 'la propia: de la caché');
  t.eq(trackGets(), 1, 'sin más pedidos');

  // Cerrar sesión / borrar la cuenta: no queda la salida en curso ni los recorridos.
  await p.evaluate(() => { localStorage.setItem('gize_salida_v1', '{}'); localStorage.setItem('gize_salida_v1_c0', '[]'); localStorage.setItem('gize_salida_v1_c1', '[]'); });
  await p.evaluate(async uid => (await import('/app/core/supabase.js')).clearAccountLeftovers(uid), ALUMNO.id);
  t.eq(await p.evaluate(() => Object.keys(localStorage).filter(k => /^gize_salida/.test(k))), [], 'clearAccountLeftovers borra la salida en curso y la caché de recorridos');
  t.eq(pg.errs, [], 'errores de la página (alumno)');
  await pg.close();

  // ===== c) Coach =====
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  // Recorrido de prueba: dos vueltas a una plaza, primero caminando y después corriendo.
  const helper = await newPage({});
  await helper.p.goto(base + '/privacidad/');
  const TRACK = await helper.p.evaluate(async () => {
    const m = await import('/app/core/cardiogps.js');
    const pts = []; let a = 0, t = 0;
    for (let i = 0; i < 2700; i++){ const kmh = i < 1200 ? 5 : i < 2100 ? 8 : 11; a += kmh / 3.6 / 300; t++; if (i % 5 === 0) pts.push({ lat: -34.6 + Math.sin(a) * 300 / 111195, lon: -58.4 + Math.cos(a) * 300 / 91500, t }); }
    return m.encodeTrack([pts]);
  });
  await helper.close();
  const R1 = { id: ID(7), client_id: A1, mode: 'pie', performed_on: '2026-10-01', started_at: '2026-10-01T13:00:00+00:00', ended_at: '2026-10-01T13:45:01+00:00',
    duration_s: 2701, moving_s: 2699, distance_m: 5499, kcal: 366, avg_speed_kmh: 7.33, max_speed_kmh: 11.01, weight_kg: 70, weight_default: true, gap_s: 240,
    breakdown: { caminar: 1204, trotar: 894, correr: 601 }, segments: [], splits: [[1000, 720], [1000, 630], [1000, 450], [1000, 409], [1000, 327], [499, 163]], points: 540, created_at: '2026-10-01T13:46:00+00:00' };
  const R2 = { id: ID(8), client_id: A1, mode: 'bici', performed_on: '2026-09-29', started_at: '2026-09-29T21:00:00+00:00', ended_at: '2026-09-29T22:00:00+00:00',
    duration_s: 3600, moving_s: 3500, distance_m: 19400, kcal: 512, avg_speed_kmh: 19.96, max_speed_kmh: 31.2, weight_kg: 70, weight_default: false, gap_s: 0,
    breakdown: { bici: 3500 }, segments: [], splits: [[5000, 900], [5000, 880], [5000, 905], [4400, 815]], points: 300, created_at: '2026-09-29T22:00:00+00:00' };
  const coachPage = (C, extra) => newPage(Object.assign({ user: COACH, viewport: { width: 390, height: 844 }, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/cardio_outings': outings(C),
  } }, extra || {}));
  const C = { get: 'ok', write: 'ok', rows: [R1, R2], tracks: { [ID(7)]: TRACK }, reqs: [] };
  const cg = await coachPage(C);
  const cp = cg.p;
  await cp.goto(base + '/app/'); await wait(3500);
  t.eq(C.reqs.length, 0, 'coach: al entrar no se piden salidas (no registra las suyas)');
  await cp.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  const list = C.reqs.filter(r => r.m === 'GET');
  const sel = list[0] ? new URLSearchParams(list[0].q).get('select') : '';
  t.eq(sel, LIST_COLS, 'coach: pide las columnas de la lista (sin el recorrido)');
  t.ok(list.length === 1 && list[0].q.includes('client_id=eq.' + A1) && /order=started_at\.desc/.test(list[0].q) && /limit=30/.test(list[0].q) && !/track/.test(list[0].q),
    'coach: al abrir la ficha, las últimas 30 salidas del alumno sin el recorrido: ' + JSON.stringify(list.map(r => r.q)));
  const tile = await text(cp, '[data-coach="sec-open"][data-v="salidas"]');
  t.has(tile, 'Salidas a pie y en bici', 'coach: tarjeta de salidas en la ficha');
  t.has(tile, '2 salidas · última 1 oct', 'coach: cuántas y la última');
  await cp.click('[data-coach="sec-open"][data-v="salidas"]'); await wait(500);
  const lt = await text(cp, '.co-sec-body');
  for (const s of ['A pie', 'En bici', '5,50 km', '45:01', '366 kcal', '20 min caminando · 15 trotando · 10 corriendo', '58 min en bici', '19,40 km', '20,0 km/h', '1 oct'])
    t.has(lt, s, 'coach: la lista muestra «' + s + '»');
  t.ok(lt.indexOf('1 oct') < lt.indexOf('29 sep'), 'coach: la más nueva primero');
  t.eq(C.reqs.filter(r => /select=track/.test(r.q)).length, 0, 'coach: la lista no pide recorridos');
  await cp.click(`[data-coach="salida-open"][data-id="${ID(7)}"]`); await wait(800);
  t.eq(C.reqs.filter(r => /select=track/.test(r.q)).length, 1, 'coach: al abrir la salida se pide su recorrido, una vez');
  const det = await text(cp, '.co-sec-body');
  for (const s of ['Distancia', '5,50 km', 'Tiempo', 'En movimiento', 'Ritmo medio', 'Velocidad máxima', '11,0 km/h', 'Calorías', '366 kcal', 'Parciales', 'Km 1', '12:00 /km', 'Km 5,5',
    '20 min caminando · 15 trotando · 10 corriendo', 'Más lento', 'Más rápido', 'Calorías calculadas con 70 kg porque el alumno no tenía su peso cargado.', 'El GPS se cortó 4 min: ese rato no suma distancia.'])
    t.has(det, s, 'coach: el detalle muestra «' + s + '»');
  // El recorrido: el mismo componente que ve el alumno (mapa + canvas, animado; ver
  // tests/cardio-a-pie.test.mjs). Acá, que termina dibujado de lento (frío) a rápido (intenso).
  t.ok(await rutaLista(cp), 'coach: el recorrido se dibuja (animado) y termina');
  const ruta = await rutaPx(cp, [47, 160, 255], [255, 61, 174]);
  t.ok(ruta && ruta.w > 200 && ruta.h > 150 && ruta.a > 10 && ruta.b > 30, 'coach: el recorrido dibujado, de lento (frío) a rápido (intenso): ' + JSON.stringify(ruta));
  t.eq(await cp.$$eval('.sal-bar i', l => l.map(i => i.className)), ['sal-c-caminar', 'sal-c-trotar', 'sal-c-correr'], 'coach: barra de caminando · trotando · corriendo');
  // 320 px: sin scroll de costado.
  await cp.setViewportSize({ width: 320, height: 700 }); await wait(300);
  const over = await cp.evaluate(() => { const h = document.getElementById('coachHost'); return [document.documentElement.scrollWidth - innerWidth, h.scrollWidth - h.clientWidth]; });
  t.ok(over[0] <= 0 && over[1] <= 0, 'coach: el detalle entra en 320 px: ' + JSON.stringify(over));
  await cp.setViewportSize({ width: 390, height: 844 });
  // «Atrás» de Android: primero vuelve a la lista; volver a abrirla no pide de nuevo el recorrido.
  await cp.evaluate(async () => (await import('/app/ui/atras.js')).handleBack()); await wait(300);
  t.ok(await cp.$(`[data-coach="salida-open"][data-id="${ID(8)}"]`), 'coach: «Atrás» vuelve a la lista de salidas');
  await cp.click(`[data-coach="salida-open"][data-id="${ID(7)}"]`); await wait(500);
  t.ok(await cp.$('.sal-ruta .rv'), 'coach: de nuevo el recorrido');
  t.eq(C.reqs.filter(r => /select=track/.test(r.q)).length, 1, 'coach: la segunda vez, de la caché (sin pedirlo de nuevo)');
  await cp.click('[data-coach="salida-close"]'); await wait(300);
  t.eq(await cp.$$eval('.rv', l => l.length), 0, 'coach: al cerrar la salida se saca el mapa');
  await cp.click(`[data-coach="salida-open"][data-id="${ID(8)}"]`); await wait(800);
  const d2 = await text(cp, '.co-sec-body');
  t.has(d2, 'Velocidad media', 'coach: en bici, velocidad media');
  t.has(d2, 'Km 5', 'coach: en bici, parciales cada 5 km');
  t.has(d2, 'No se pudo cargar el recorrido', 'coach: si el recorrido no llega, lo dice');
  t.eq(cg.errs, [], 'errores de la página (coach)');
  await cg.close();

  // Neón apagado: ni bordes ni brillos de colores, y el recorrido en grises.
  const C2 = { get: 'ok', write: 'ok', rows: [R1], tracks: { [ID(7)]: TRACK }, reqs: [] };
  const cn = await coachPage(C2, { init: "localStorage.setItem('gize_neon','0');" });
  await cn.p.goto(base + '/app/'); await wait(3500);
  await cn.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
  await cn.p.click('[data-coach="sec-open"][data-v="salidas"]'); await wait(400);
  await cn.p.click(`[data-coach="salida-open"][data-id="${ID(7)}"]`); await wait(800);
  await rutaLista(cn.p);
  const gris = await rutaPx(cn.p, [110, 116, 130], [255, 255, 255]);
  const neon = await cn.p.evaluate(() => {
    const sat = s => (s.match(/rgba?\([^)]*\)/g) || []).some(c => { const [r, g, b, a = 1] = c.match(/[\d.]+/g).map(Number); return a > 0.05 && Math.max(r, g, b) - Math.min(r, g, b) > 70; });
    const out = [];
    document.querySelectorAll('#coachHost .co-sec-body *').forEach(e => {
      const s = getComputedStyle(e);
      if (sat(s.boxShadow) || sat(s.backgroundImage) || sat(s.backgroundColor) || (sat(s.borderTopColor) && s.borderTopWidth !== '0px' && s.borderTopStyle !== 'none') || sat(s.stroke) || sat(s.fill)) out.push(String(e.getAttribute('class') || e.tagName));
    });
    return { html: document.documentElement.classList.contains('sin-neon'), out };
  });
  t.ok(neon.html && gris && gris.n > 500 && gris.sat === 0 && gris.a > 10, 'sin neón: se ve el recorrido, en grises: ' + JSON.stringify(gris));
  t.eq(neon.out, [], 'sin neón: la sección de salidas sin colores de la gama');
  t.eq(cn.errs, [], 'errores de la página (coach sin neón)');
  await cn.close();

  // La tabla todavía no existe: la ficha lo dice y no se traba.
  const C3 = { get: 'missing', write: 'ok', rows: [], tracks: {}, reqs: [] };
  const cm = await coachPage(C3);
  await cm.p.goto(base + '/app/'); await wait(3500);
  await cm.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
  t.has(await text(cm.p, '#coachHost'), 'Ana Alumna', 'sin tabla: la ficha se abre igual');
  t.has(await text(cm.p, '[data-coach="sec-open"][data-v="salidas"]'), 'Todavía no disponibles', 'sin tabla: la tarjeta lo dice');
  await cm.p.click('[data-coach="sec-open"][data-v="salidas"]'); await wait(400);
  t.has(await text(cm.p, '.co-sec-body'), 'falta crear su tabla', 'sin tabla: la sección explica por qué');
  t.eq(cm.errs, [], 'errores de la página (coach sin tabla)');
  await cm.close();
}
