// Cardio sin GPS: se sacaron las salidas de correr / caminar / bici con GPS (mapa, recorridos y
// «Tus salidas»). Cardio queda con el cronómetro, el temporizador y el plan del coach. Nada de
// ubicación, mapas ni tablas de salidas: ni al abrir la app ni al entrar a Cardio. Lo que había
// quedado de la versión con GPS (salidas guardadas, salida en curso, pendientes en la cola) se
// descarta sin errores y sin trabar lo demás que esté en la cola.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, saved, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const OUT = 'core_outbox_v1', FAILED = 'core_outbox_failed_v1';
const SAL = '0f0f0f0f-0000-4000-8000-000000000001';

export default async function ({ base, t }){
  // ===== Sin ubicación en las apps, la web ni la política =====
  const man = read('android/app/src/main/AndroidManifest.xml');
  for (const x of ['LOCATION', 'FOREGROUND_SERVICE', 'location.gps', 'BackgroundGeolocation']) t.ok(!man.includes(x), 'Android: el manifiesto no tiene ' + x);
  t.ok(!/geolocation/i.test(read('package.json')), 'package.json sin el plugin de ubicación');
  t.ok(!/geolocation/i.test(read('android/capacitor.settings.gradle')), 'Android sin el plugin de ubicación');
  t.ok(!/geolocation/i.test(read('ios/App/CapApp-SPM/Package.swift')), 'iPhone sin el plugin de ubicación');
  const plist = read('ios/App/App/Info.plist');
  t.ok(!/NSLocation|<string>location<\/string>/.test(plist), 'iPhone: Info.plist sin permisos ni modo de ubicación');
  t.ok(!/PreciseLocation/.test(read('ios/App/App/PrivacyInfo.xcprivacy')), 'iPhone: PrivacyInfo sin ubicación precisa');
  t.ok(!/maptiler|worker-src/i.test(read('app/index.html')), 'CSP sin MapTiler ni worker-src');
  const pol = read('privacidad/index.html');
  t.has(pol, 'No usamos tu ubicación, tus contactos ni publicidad', 'la política dice que no se usa la ubicación');
  t.ok(!/MapTiler|<h2>Ubicación|recorrido/.test(pol), 'la política no habla de mapas, ubicación ni recorridos');

  // ===== Alumno con datos de la versión con GPS =====
  const weightPosts = [];
  const pg = await newPage({ user: ALUMNO,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {},
      cardio: [{ id: SAL, kind: 'correr', date: '2026-09-27', dur: 2693, dist: 7180, kcal: 517, route: '_p~iF~ps|U_ulLnnqC' }] },
    // La salida en curso y la cola de envío, antes de que arranque la app (el script va solo,
    // sin variables de afuera).
    init: () => {
      const uid = '11111111-1111-1111-1111-111111111111', sal = '0f0f0f0f-0000-4000-8000-000000000001', out = 'core_outbox_v1', failed = 'core_outbox_failed_v1';
      if (sessionStorage.getItem('init-gps')) return;
      sessionStorage.setItem('init-gps', '1');
      localStorage.setItem('gize_cardio_run', JSON.stringify({ kind: 'correr', startTs: Date.now() - 600000, dist: 1200 }));
      const it = (k, p, extra) => Object.assign({ id: 'q-' + k, uid, k, key: null, p, ts: Date.now() }, extra || {});
      localStorage.setItem(out, JSON.stringify([
        it('cardio', { id: sal, kind: 'correr', date: '2026-09-27', dur: 2693, dist: 7180 }),
        it('cardioRoute', { id: sal, route: '_p~iF~ps|U_ulLnnqC' }),
        it('cardioDelete', { id: sal }),
        it('weight', { date: '2026-09-28', kg: 80.5 }),
      ]));
      localStorage.setItem(failed, JSON.stringify([
        it('cardio', { id: sal }, { error: 'relation "public.cardio_sessions" does not exist' }),
        it('daily', { dt: '2026-09-20', rec: {} }, { error: 'viejo' }),
      ]));
    },
    handlers: {
      '/profiles': profile('client'),
      '/nutrition': (r, J, i) => { if (i.m !== 'GET') return undefined; const np = { client_id: ALUMNO.id, kcal: null, plan: { cardio: { text: '30 min de cinta después de pesas', items: ['Martes: 20 min de bici'] } } }; return J(i.one ? np : [np]); },
      '/body_weights': (r, J, i) => { if (i.m === 'POST') { weightPosts.push(i.body); return J([], 201); } return undefined; },
    } });
  const reqs = [];
  pg.p.on('request', r => reqs.push(r.url()));
  const p = pg.p;
  await p.goto(base + '/app/'); await wait(3000);

  const badReq = () => reqs.filter(u => /cardio_sessions|cardio_routes|maptiler|maplibre|mapa-clave/i.test(u));
  t.eq(badReq(), [], 'al abrir la app no se piden salidas, recorridos, mapas ni la clave del mapa');
  t.eq(pg.calls.filter(c => /cardio_/.test(c)), [], 'Supabase: nada de cardio_sessions / cardio_routes');

  // La cola: los pendientes de salidas se descartan sin mandarse; el peso sale igual.
  t.ok(weightPosts.some(b => /80\.5/.test(b || '')), 'el peso que estaba en la cola se manda: ' + JSON.stringify(weightPosts));
  const q = await p.evaluate(([o, f]) => ({ cola: JSON.parse(localStorage.getItem(o) || '[]').map(i => i.k), apartados: JSON.parse(localStorage.getItem(f) || '[]').map(i => i.k) }), [OUT, FAILED]);
  t.eq(q.cola, [], 'la cola quedó vacía (sin los pendientes de salidas)');
  t.eq(q.apartados, ['daily'], 'los apartados de salidas se descartan; los demás quedan');
  t.eq(await p.evaluate(() => localStorage.getItem('gize_cardio_run')), null, 'se borra la salida en curso que había quedado');
  t.eq(await p.evaluate(async () => 'cardio' in (await import('/app/core/state.js')).state), false, 'state.cardio viejo se descarta');

  // Cardio: cronómetro, temporizador y el plan del coach. Nada de GPS ni mapas.
  await p.click('#nav-cardio'); await wait(600);
  const v = await text(p, '#view');
  t.has(v, 'Cronómetro', 'Cardio: cronómetro');
  t.has(v, 'Temporizador', 'Cardio: temporizador');
  t.has(await p.$eval('.cardio-rx-h', e => e.textContent).catch(() => ''), 'Tu cardio de esta semana', 'Cardio: la tarjeta del plan del coach');
  t.has(await text(p, '.cardio-rx'), 'Martes: 20 min de bici', 'Cardio: lo que pidió el coach');
  for (const s of ['Salir a correr', 'Tus salidas', 'GPS', 'salida', 'Caminar', 'Bici', 'km']) t.ok(!v.includes(s), 'Cardio no muestra «' + s + '»: ' + v.slice(0, 200));
  t.eq(await p.$$eval('[data-action^="gps-"], [class*="gps"], [class*="mapa"], .maplibregl-map', l => l.length), 0, 'Cardio: ningún botón de GPS ni mapa');
  await p.click('[data-action="cardio-mode"][data-mode="timer"]'); await wait(300);
  t.eq(await p.$$eval('#cringTime', l => l.length), 1, 'el temporizador se ve');
  t.eq(badReq(), [], 'al entrar a Cardio no se piden salidas, recorridos ni mapas');
  await p.click('#nav-entreno').catch(() => {}); await wait(300);
  const st = await saved(p);
  t.ok(st && !('cardio' in st), 'lo guardado en el dispositivo ya no tiene las salidas');
  t.eq(pg.errs, [], 'errores de la página (alumno)');
  await pg.close();

  // ===== Coach: la ficha del alumno sin la tarjeta de salidas =====
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const row = { id: SAL, client_id: A1, performed_on: '2026-09-27', started_at: '2026-09-27T10:00:00Z', kind: 'correr', duration_s: 2693, distance_m: 7180, kcal: 517, avg_speed_kmh: 9.6, max_speed_kmh: 12.3, created_at: '2026-09-27T10:50:00Z' };
  const cg = await newPage({ user: COACH, viewport: { width: 1100, height: 900 }, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/cardio_sessions': (r, J, i) => i.m === 'GET' ? J([row]) : undefined,
  } });
  await cg.p.goto(base + '/app/'); await wait(3500);
  await cg.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  const co = await text(cg.p, '#coachHost');
  t.has(co, 'Ana Alumna', 'coach: se abre la ficha');
  t.ok(!/salida/i.test(co), 'coach: la ficha no muestra salidas: ' + co.slice(0, 200));
  t.eq(await cg.p.$$eval('[data-coach="sec-open"][data-v="cardio"]', l => l.length), 0, 'coach: no hay tarjeta Cardio de salidas');
  t.eq(cg.calls.filter(c => /cardio_/.test(c)), [], 'coach: no se piden las salidas del alumno');
  t.eq(cg.errs, [], 'errores de la página (coach)');
  await cg.close();
}
