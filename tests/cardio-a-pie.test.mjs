// Cardio «A pie» / «En bici», paso 4: la pantalla.
// a) Archivos: MapLibre en vendor/ con su licencia, la CSP con OpenFreeMap (sin clave) y el worker.
// b) Alumno con GPS falso (y un reloj que avanza con cada punto): «Salir a moverte» (lo último de
//    Cardio) abre la hoja de abajo para elegir «A pie» / «En bici» con sus aclaraciones y
//    «Empezar»; el aviso «Usar tu ubicación», la hoja que se cierra al empezar, en vivo arriba de
//    todo (el reloj de main.js solo con Cardio a la vista y la app adelante, caminando → trotando →
//    corriendo, pausa y seguir, mini mapa, el punto en la pestaña), terminar → resumen encima de todo con el recorrido animado (se dibuja de
//    a poco y termina), los números, «Ver de nuevo», «Guardar» y «Tus salidas» (volver a abrirla
//    repite la animación sin pedir nada), «Borrar»; salida terminada sin guardar al recargar.
// c) Compartir: imagen PNG de 1080 × 1920 por Web Share, descarga sin Web Share, y en la app
//    nativa por Filesystem (caché, siempre el mismo archivo, que se borra al cerrar sesión) +
//    Share; desactivado mientras llega el recorrido. «Ver de nuevo» a mitad del dibujo. El estado
//    del GPS que va y viene no redibuja la pantalla.
// d) Movimiento reducido (dibujo completo de una), modo liviano (sin MapLibre), las apariencias
//    (Claro, Azul, Rosa, sin neón) con sus colores y sin halo alrededor del recorrido (apariencia
//    tranquila, css/ui/calma.css), nada que se mueva sin fin, 320 px sin scroll de costado y el
//    «Atrás» de Android. Los botones principales de Cardio («Salir a moverte», «Empezar» e
//    «Iniciar») son rellenos, con el filete fino y quieto (sin anillo de neón que gire ni
//    resplandor de colores).
// El mapa (tiles.openfreemap.org) nunca sale a internet en las pruebas (tests/lib.mjs lo corta):
// donde se quiere el dibujo sin mapa de una, gize_mapa_off = "1".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, ALUMNO, profile, abrirSalir, empezarSalida } from './lib.mjs';
// Texto tal cual (innerText respeta las mayúsculas del CSS).
const tc = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }, sel);
// ¿Hay algún color con tinte (no gris) en este valor de CSS? rgb()/rgba() y color(srgb …), que es
// como sale un color-mix() calculado; canales de 0 a 255.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const BREAK = '20 min caminando · 15 trotando · 10 corriendo';
const PLAN = [[1200, 5], [900, 8], [600, 11]];   // 20 min a 5 km/h, 15 a 8 y 10 a 11
const SUB_PIE = 'Caminar, trotar o correr: la app lo detecta sola', SUB_BICI = 'Ruta o calle';
const TRACK_KEY = 'gize_salidas_track_v1';

// GPS web falso con un reloj que avanza: __push(lat, lon, acc, t) manda un punto a la hora t y el
// reloj de la página queda en t (Date.now). __route(plan, desde, n): n puntos (uno por segundo)
// del recorrido sintético (un circuito de calles con ±1 m de error) desde el segundo «desde».
const FAKE = () => {
  const real = Date.now.bind(Date);
  window.__skew = 0;
  Date.now = () => real() + window.__skew;
  window.__geo = { watchers: {}, n: 0 };
  Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(ok, err){ const id = ++window.__geo.n; window.__geo.watchers[id] = { ok, err }; return id; },
    clearWatch(id){ delete window.__geo.watchers[id]; }, getCurrentPosition(){},
  }, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => ({ addEventListener(){}, release: async () => {} }) }, configurable: true });
  const perms = navigator.permissions;
  Object.defineProperty(navigator, 'permissions', { value: { query: async d => (d && d.name === 'geolocation') ? { state: 'prompt' } : perms.query(d) }, configurable: true });
  window.__push = (lat, lon, acc, t) => {
    window.__skew = t - real();
    for (const k in window.__geo.watchers) window.__geo.watchers[k].ok({ coords: { latitude: lat, longitude: lon, accuracy: acc, speed: null }, timestamp: t });
  };
  window.__advance = ms => { window.__skew += ms; };
  window.__route = (plan, from, n) => {
    const W = [[0, 0], [650, 0], [650, 380], [1180, 380], [1180, 960], [560, 1180], [90, 820], [-260, 420], [0, 0]];
    let len = 0; const cum = [0];
    for (let i = 1; i < W.length; i++){ len += Math.hypot(W[i][0] - W[i - 1][0], W[i][1] - W[i - 1][1]); cum.push(len); }
    const at = d => { d = d % len; let i = 1; while (cum[i] < d) i++; const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1]); return [W[i - 1][0] + (W[i][0] - W[i - 1][0]) * f, W[i - 1][1] + (W[i][1] - W[i - 1][1]) * f]; };
    // Error del GPS que va y viene despacio (como el de un celular: el mismo de tests/cardio-motor.test.mjs).
    let s = 1234567; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gauss = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    let ex = 0, ey = 0;
    const t0 = window.__t0 || (window.__t0 = Date.now() + 2000);
    let d = 0, k = 0;
    for (const [secs, kmh] of plan) for (let j = 0; j < secs; j++, k++){
      d += kmh / 3.6;
      ex = 0.95 * ex + gauss() * 0.25; ey = 0.95 * ey + gauss() * 0.25;
      if (k < from || k >= from + n) continue;
      const [x, y] = at(d);
      window.__push(-34.5862 + (y + ey) / 111195, -58.4106 + (x + ex) / (111195 * Math.cos(34.5862 * Math.PI / 180)), 5, t0 + k * 1000);
    }
  };
};
// Web Share falso: guarda lo que se compartió.
const FAKE_SHARE = () => {
  window.__shared = [];
  navigator.canShare = d => !!(d && d.files && d.files.length);
  navigator.share = async d => { window.__shared.push({ title: d.title, files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) }); window.__sharedFile = d.files && d.files[0]; };
};

// Píxeles pintados de un canvas: cuántos, cuántos con color (no grises) y cuántos cerca de rgb.
const pixels = (p, sel, near) => p.evaluate(([sel, near]) => {
  const c = document.querySelector(sel); if (!c || !c.width) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0, sat = 0, close = 0;
  for (let i = 0; i < d.length; i += 8) if (d[i + 3] > 200){
    n++;
    if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) sat++;
    if (near && Math.abs(d[i] - near[0]) + Math.abs(d[i + 1] - near[1]) + Math.abs(d[i + 2] - near[2]) < 60) close++;
  }
  return { n, sat, close };
}, [sel, near || null]);
const estado = p => p.evaluate(() => { const v = document.querySelector('#salidaHost .rv'); return v ? v.dataset.estado : null; });
const waitEstado = async (p, want, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms){ if (await estado(p) === want) return true; await wait(100); } return false; };
const tickOn = p => p.evaluate(async () => (await import('/app/main.js')).tickActive());
// Animaciones sin fin en lo que se ve.
const infinite = p => p.evaluate(() => {
  const out = new Set();
  document.querySelectorAll('*').forEach(e => {
    if (!e.getClientRects().length) return;
    for (const ps of [null, '::before', '::after']){ const s = getComputedStyle(e, ps); if (s.animationName !== 'none' && s.animationIterationCount === 'infinite' && s.animationPlayState !== 'paused') out.add(String(e.className || e.tagName) + (ps || '') + ':' + s.animationName); }
  });
  return [...out];
});
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#salidaHost .sov, #view')].every(e => e.scrollWidth <= e.clientWidth + 1));

const H = {
  '/profiles': profile('client'),
  '/body_weights': (r, J, i) => i.m === 'GET' ? J([{ id: 'w1', client_id: ALUMNO.id, measured_on: '2026-09-20', kg: 72 }]) : undefined,
};

function staticChecks(t){
  const csp = (read('app/index.html').match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  const dir = k => (csp.match(new RegExp('(?:^|; )' + k + ' ([^;]+)')) || [])[1] || '';
  t.has(dir('connect-src'), 'https://tiles.openfreemap.org', 'CSP: el mapa (OpenFreeMap) en connect-src');
  t.has(dir('img-src'), 'https://tiles.openfreemap.org', 'CSP: OpenFreeMap en img-src');
  t.eq(dir('worker-src'), "'self' blob:", 'CSP: el worker de MapLibre');
  t.ok(!/maptiler|mapa-clave/i.test(read('app/index.html') + read('app/ui/mapa.js')), 'sin servicios con clave (ni MapTiler ni la función mapa-clave)');
  t.has(read('app/ui/mapa.js'), 'https://tiles.openfreemap.org/styles/dark', 'el estilo oscuro de OpenFreeMap');
  for (const f of ['maplibre-gl.js', 'maplibre-gl-shared.js', 'maplibre-gl-worker.js', 'maplibre-gl.css'])
    t.ok(fs.existsSync(path.join(ROOT, 'vendor/maplibre-gl-6.11.2', f)), 'vendor: MapLibre ' + f);
  const ml = read('vendor/maplibre-gl-6.11.2/maplibre-gl.js');
  t.ok(ml.includes('./maplibre-gl-shared.js') && !ml.includes('sourceMappingURL'), 'vendor: MapLibre importa el .js (no .mjs) y sin source maps');
  const lic = read('vendor/LICENSES.txt');
  t.has(lic, 'maplibre-gl 6.11.2  (vendor/maplibre-gl-6.11.2/)', 'LICENSES.txt: sección de MapLibre');
  t.has(lic, 'Copyright (c) 2023, MapLibre contributors', 'LICENSES.txt: la licencia BSD de MapLibre');
  t.has(read('vendor/README.md'), '`maplibre-gl-6.11.2/`', 'vendor/README.md: la fila de MapLibre');
  t.ok(!/maplibre/i.test(read('sw.js')), 'sw.js no precarga MapLibre (se guarda en la caché recién cuando se usa)');
  t.has(read('app/core/icons.js'), 'export const shoeSvg', 'ícono de zapatilla');
  t.has(read('app/core/icons.js'), 'export const bikeSvg', 'ícono de bici');
  t.has(read('app/ui/compartir.js'), '"OpenFreeMap © OpenMapTiles © OpenStreetMap"', 'la imagen con mapa lleva los créditos completos (OpenFreeMap, OpenMapTiles y OpenStreetMap)');
}

// ---- b) El flujo completo en la web ----
async function flujo(base, t){
  const pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE, handlers: H });
  const p = pg.p;
  await p.addInitScript("localStorage.setItem('gize_mapa_off','1'); localStorage.setItem('gize_lite','0');");
  const reqs = []; p.on('request', r => reqs.push(r.url()));
  await p.goto(base + '/app/'); await wait(2500);
  t.eq(reqs.filter(u => /maplibre|openfreemap/i.test(u)), [], 'al abrir la app no se pide MapLibre ni el mapa');

  await p.click('#nav-cardio'); await wait(500);
  const v = await tc(p, '#view');
  t.has(v, 'Salir a moverte', 'Cardio: «Salir a moverte»');
  t.has(v, 'Cronómetro', 'el cronómetro sigue');
  t.ok(v.indexOf('Cronómetro y temporizador') < v.lastIndexOf('Salir a moverte'), '«Salir a moverte» va último, después del cronómetro');
  // No promete un mapa: en los navegadores de Android el recorrido va sin mapa de calles.
  t.eq(await tc(p, '#view .sal-salir-t'), 'A pie o en bici, con el GPS: distancia, ritmo, calorías y el dibujo de tu recorrido.', '«Salir a moverte»: qué mide, sin prometer un mapa');
  t.eq(await p.$$eval('#view [data-action="sal-start"], #view [data-action="sal-mode"]', l => l.length), 0, 'en la pantalla no está «Empezar»: va en la hoja');
  // «Salir a moverte» abre la hoja de abajo con las dos opciones y «Empezar».
  await abrirSalir(p);
  const modes = await p.$$eval('#salSheet [data-action="sal-mode"]', l => l.map(b => [b.dataset.mode, b.querySelector('.sal-mode-t').textContent, b.querySelector('.sal-mode-s').textContent, !!b.querySelector('svg'), b.classList.contains('active')]));
  t.eq(modes, [['pie', 'A pie', SUB_PIE, true, true], ['bici', 'En bici', SUB_BICI, true, false]], 'la hoja: dos opciones con ícono y aclaración: «A pie» (elegida) y «En bici»');
  t.ok(!/a bici/i.test(v + await tc(p, '#salSheet')), 'nunca «a bici»');
  // Apariencia tranquila: ningún anillo gira; los principales son rellenos (blancos en «Oscuro»)
  // con el filete fino de un toque de color, y sin resplandor de colores.
  const prim = await p.$$eval('#view .ctrl.primary, #salSheet .ctrl.primary', l => l.map(b => { const s = getComputedStyle(b), be = getComputedStyle(b, '::before');
    return { t: b.textContent, anim: [s.animationName, be.animationName], bg: s.backgroundImage, glow: [s.boxShadow, s.textShadow, s.filter] }; }));
  t.eq(prim.map(b => [b.t, b.anim]), [['Iniciar', ['none', 'none']], ['Salir a moverte', ['none', 'none']], ['Empezar', ['none', 'none']]], 'ningún anillo gira: el «Iniciar» del cronómetro, «Salir a moverte» y «Empezar» quietos');
  for (const b of prim){
    t.ok(/^linear-gradient\(rgb\(255, 255, 255\), rgb\(255, 255, 255\)\)/.test(b.bg), '«' + b.t + '»: relleno blanco, como los botones principales: ' + b.bg.slice(0, 60));
    t.ok(/linear-gradient\(155deg/.test(b.bg) && !/conic-gradient/.test(b.bg) && conTinte(b.bg), '«' + b.t + '»: el borde es el filete fino con un toque de color, no la gama de neón: ' + b.bg.slice(0, 120));
    t.ok(!b.glow.some(conTinte), '«' + b.t + '»: sin resplandor de colores: ' + JSON.stringify(b.glow));
  }
  await p.click('#salSheet [data-action="sal-mode"][data-mode="bici"]'); await wait(200);
  t.eq(await p.$$eval('[data-action="sal-mode"].active', l => l.map(b => b.dataset.mode)), ['bici'], 'elegir «En bici»');
  t.eq(await p.$eval('[data-action="sal-mode"][data-mode="bici"]', b => b.getAttribute('aria-checked')), 'true', '«En bici» marcada para el lector de pantalla');
  await p.click('#salSheet [data-action="sal-mode"][data-mode="pie"]'); await wait(200);
  t.eq(await tickOn(p), false, 'sin salida, el reloj de main.js no anda');

  // Empezar: primero el aviso.
  await empezarSalida(p); await wait(400);
  t.has(await text(p, '#salAviso'), 'Usar tu ubicación', 'la primera vez: el aviso «Usar tu ubicación»');
  t.eq(await p.evaluate(() => window.__geo.n), 0, 'antes de aceptarlo no se pide la ubicación');
  await p.click('#salAviso [data-action="sal-aviso-ok"]'); await wait(600);
  t.eq(await p.$$eval('#salAviso', l => l.length), 0, 'el aviso se cierra');
  t.eq(await p.$$eval('#salSheet', l => l.length), 0, 'al empezar, la hoja se cierra');
  t.eq(await p.evaluate(() => Object.keys(window.__geo.watchers).length), 1, 'empezó a mirar la ubicación');
  t.ok(await p.$('#salLive'), 'en vivo');
  t.eq(await p.evaluate(() => document.querySelector('#view > section').id), 'salLive', 'en vivo: arriba de todo en Cardio');
  t.eq(await p.$$eval('#view [data-action="sal-sheet"]', l => l.length), 0, 'en vivo: sin «Salir a moverte» abajo');
  t.has(await text(p, '#salLive'), 'En el navegador, GIZE mide la salida solo con la pantalla prendida y la app abierta.', 'en vivo (web): el aviso de la pantalla prendida');

  // Caminando 3 min.
  await p.evaluate(plan => window.__route(plan, 0, 180), PLAN); await wait(400);
  const t1 = await text(p, '#salTime');
  t.eq(t1, '3:02', 'el tiempo de la salida (reloj − pausas)');
  t.eq(await tickOn(p), true, 'con la salida en Cardio, el reloj de main.js anda');
  await p.evaluate(() => window.__advance(3000)); await wait(1300);
  const t2 = await text(p, '#salTime');
  t.ok(['3:05', '3:06'].includes(t2), 'el tiempo cambia solo, sin redibujar la pantalla: ' + t1 + ' → ' + t2);
  t.eq(await text(p, '#salAct'), 'Caminando', 'detecta que camina');
  t.ok(/^0,2\d$/.test(await text(p, '#salDist')), 'distancia en vivo: ' + await text(p, '#salDist'));
  t.ok(/^1[0-3]:\d\d$/.test(await text(p, '#salPace')), 'ritmo del momento (12:00 /km): ' + await text(p, '#salPace'));
  t.ok(Number(await text(p, '#salKcal')) > 10, 'calorías en vivo');
  // Mini mapa que sigue a la persona (sin mapa de fondo con gize_mapa_off).
  await wait(400);
  t.eq(await p.evaluate(() => { const v = document.querySelector('.sal-minimap .rv'); return v && v.dataset.estado; }), 'listo', 'mini mapa en vivo');
  const mini = await pixels(p, '.sal-minimap .rv-line');
  t.ok(mini && mini.n > 50, 'mini mapa: el recorrido dibujado: ' + JSON.stringify(mini));

  // Trotando y corriendo.
  await p.evaluate(plan => window.__route(plan, 180, 1170), PLAN); await wait(300);
  t.eq(await text(p, '#salAct'), 'Trotando', 'detecta que trota');
  await p.evaluate(plan => window.__route(plan, 1350, 900), PLAN); await wait(300);
  t.eq(await text(p, '#salAct'), 'Corriendo', 'detecta que corre');
  t.eq(await p.$eval('#salAct', e => e.className), 'sal-act sal-c-correr', 'el tramo con el color de su clase');

  // En otra pestaña: el punto en Cardio y el reloj quieto.
  await p.click('#nav-entreno'); await wait(400);
  t.eq(await p.$eval('#nav-cardio', e => e.classList.contains('en-curso')), true, 'en otra pestaña: Cardio con el punto de salida en curso');
  t.eq(await tickOn(p), false, 'fuera de Cardio el reloj de main.js no anda');
  await p.click('#nav-cardio'); await wait(400);
  t.eq(await tickOn(p), true, 'de vuelta en Cardio anda');
  await p.evaluate(() => document.dispatchEvent(new Event('pause'))); await wait(200);
  t.eq(await tickOn(p), false, 'con la app en segundo plano no anda');
  await p.evaluate(() => document.dispatchEvent(new Event('resume'))); await wait(300);
  t.eq(await infinite(p), [], 'en vivo: nada se mueve sin fin');

  // Pausa y seguir.
  await p.click('[data-action="sal-pause"]'); await wait(300);
  t.has(await text(p, '#salLive'), 'Pausada', 'pausada');
  t.ok(await p.$('[data-action="sal-resume"]'), '«Seguir»');
  t.eq(await tickOn(p), false, 'en pausa el reloj de main.js no anda');
  await p.click('[data-action="sal-resume"]'); await wait(300);
  t.has(await text(p, '#salLive'), 'En curso', 'sigue');
  await p.evaluate(plan => window.__route(plan, 2250, 450), PLAN); await wait(300);

  // Terminar → el resumen encima de todo, con el recorrido animado.
  await p.click('[data-action="sal-stop"]'); await wait(500);
  t.ok(pg.dialogs.includes('¿Terminar la salida?'), 'pregunta antes de terminar');
  t.ok(await p.$('#salidaHost .sov'), 'se abre el resumen');
  const ov = await tc(p, '#salidaHost');
  t.has(ov, BREAK, 'resumen: cuánto caminó, trotó y corrió');
  for (const s of ['A pie', 'Distancia', 'Tiempo', 'En movimiento', 'Ritmo medio', 'Velocidad máxima', 'Calorías', 'Parciales', 'Km 1', 'Más lento', 'Más rápido', 'Guardar', 'Compartir', 'Ver de nuevo', 'Descartar'])
    t.has(ov, s, 'resumen: «' + s + '»');
  t.ok(!/Calorías calculadas con 70 kg/.test(ov), 'con el peso cargado (72 kg) no avisa de los 70 kg');
  t.eq(await estado(p), 'animando', 'el recorrido se está dibujando');
  t.eq(await p.$eval('#sovNums', e => e.classList.contains('in')), false, 'los números aparecen al terminar la animación');
  await wait(1500);
  const mid = await pixels(p, '#salidaHost .rv-line'), km = await text(p, '#sovKm');
  t.ok(await waitEstado(p, 'listo'), 'la animación termina sola (4 a 6 s)');
  const end = await pixels(p, '#salidaHost .rv-line');
  t.ok(mid && end && end.n > mid.n * 1.3 && end.n > 2000, 'se dibuja de a poco: ' + JSON.stringify([mid, end]));
  t.ok(end.sat > end.n * 0.8, 'el recorrido con los colores de la gama: ' + JSON.stringify(end));
  t.ok(/^\d,\d\d$/.test(km) && km !== await text(p, '#sovKm'), 'la distancia grande cuenta mientras se dibuja: ' + km + ' → ' + await text(p, '#sovKm'));
  t.eq(await text(p, '#sovKm'), await p.evaluate(async () => (await import('/app/core/cardiogps.js')).fmtKm((await import('/app/screens/cardio.js')).endedSummary().rec.dist)), 'al final, la distancia de la salida');
  await wait(450);
  t.eq(await p.$eval('#sovNums', e => [e.classList.contains('in'), getComputedStyle(e).opacity]), [true, '1'], 'los números ya se ven');
  t.ok((await pixels(p, '#salidaHost .rv-head', [255, 61, 174])).close > 20, 'el punto del final (intenso) aparece');
  t.has(await text(p, '#salidaHost .rv-msg'), '', 'sin mapa a propósito (gize_mapa_off): sin aviso de conexión');
  t.eq(await infinite(p), [], 'resumen: nada se mueve sin fin');
  t.ok(await noHScroll(p), 'resumen: sin scroll de costado');
  t.eq(reqs.filter(u => /maplibre/i.test(u)), [], 'gize_mapa_off: no se pide MapLibre');

  // Ver de nuevo.
  await p.click('#salidaHost [data-action="sal-replay"]'); await wait(300);
  t.eq(await estado(p), 'animando', '«Ver de nuevo» dibuja otra vez');
  // Otra vez en medio del dibujo: el que se cortó no da por terminado el nuevo.
  await p.click('#salidaHost [data-action="sal-replay"]'); await wait(300);
  t.eq(await estado(p), 'animando', '«Ver de nuevo» a mitad del dibujo: sigue dibujando (el anterior no lo termina)');
  t.eq(await p.$eval('#sovNums', e => e.classList.contains('in')), true, 'los números siguen a la vista');
  t.ok(await waitEstado(p, 'listo'), 'y termina');

  // Guardar → «Tus salidas».
  await p.click('#salidaHost [data-action="sal-save"]'); await wait(500);
  const st = await p.evaluate(async () => (await import('/app/core/state.js')).state.salidas);
  t.eq(st.length, 1, 'se guardó la salida');
  const rec = st[0];
  t.ok(rec && rec.mode === 'pie' && rec.kg === 72 && rec.kgDefault === false && !('track' in rec), 'la salida guardada (con 72 kg, sin coordenadas): ' + JSON.stringify(rec && [rec.mode, rec.kg, rec.kgDefault]));
  const ov2 = await text(p, '#salidaHost');
  t.ok(!/Guardar|Descartar/.test(ov2) && /Compartir/.test(ov2) && /Borrar/.test(ov2), 'ya guardada: «Compartir», «Ver de nuevo» y «Borrar»: ' + ov2.slice(-80));
  t.eq(await estado(p), 'listo', 'guardar no vuelve a dibujar el recorrido');
  t.eq(await p.evaluate(async () => (await import('/app/ui/gps.js')).GpsState.run), null, 'ya no hay salida en curso');
  await p.evaluate(async () => (await import('/app/ui/atras.js')).handleBack()); await wait(300);
  t.eq(await p.$$eval('#salidaHost', l => l.length), 0, '«Atrás» de Android cierra el resumen');
  t.eq(await p.$$eval('.rv', l => l.length), 0, 'y saca el mapa');
  const list = await tc(p, '.sal-hist');
  t.has(list, 'Tus salidas', '«Tus salidas»');
  t.has(list, 'A pie', 'la fila: modo');
  t.has(list, BREAK, 'la fila: desglose');
  t.ok(/\d,\d\d km · 4\d:\d\d · \d+:\d\d \/km · \d+ kcal/.test(list), 'la fila: km · tiempo · ritmo · kcal: ' + list);
  t.ok(await p.$('[data-action="sal-sheet"]'), 'de nuevo «Salir a moverte»');
  t.eq(await p.$eval('#nav-cardio', e => e.classList.contains('en-curso')), false, 'sin salida en curso, sin el punto');

  // Volver a abrirla: la misma ficha, con la animación otra vez, sin pedir el recorrido.
  const calls0 = pg.calls.length;
  await p.click(`[data-action="sal-open"][data-id="${rec.id}"]`); await wait(300);
  t.eq(await estado(p), 'animando', 'abrir una de «Tus salidas» repite la animación');
  t.has(await tc(p, '#salidaHost'), BREAK, 'y muestra la misma ficha');
  t.eq(pg.calls.slice(calls0).filter(c => /cardio_outings/.test(c) && /GET/.test(c)), [], 'el recorrido sale de la caché (sin pedirlo)');
  t.ok(await waitEstado(p, 'listo'), 'termina');
  const track = await p.evaluate(async id => (await import('/app/core/salidas.js')).cachedTrack(id), rec.id);
  t.ok(/^1;/.test(track || ''), 'el recorrido en la caché');

  // Borrar.
  await p.click('#salidaHost [data-action="sal-del"]'); await wait(400);
  t.ok(pg.dialogs.includes('¿Borrar esta salida?'), 'pregunta antes de borrar');
  t.eq(await p.$$eval('#salidaHost', l => l.length), 0, 'se cierra el resumen');
  t.eq(await p.evaluate(async () => (await import('/app/core/state.js')).state.salidas.length), 0, 'y ya no está');
  t.eq(await p.$$eval('.sal-hist', l => l.length), 0, 'sin salidas, sin la lista');
  t.eq(pg.errs, [], 'errores de la página (flujo)');
  await pg.close();
  return { rec, track };
}

// Una salida terminada sin guardar sigue ahí al recargar; «Descartar» la borra.
async function terminadaSinGuardar(base, t){
  const pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE, handlers: H });
  const p = pg.p;
  await p.addInitScript("localStorage.setItem('gize_mapa_off','1'); localStorage.setItem('gize_salida_aviso','1');");
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  await abrirSalir(p);
  await p.click('#salSheet [data-action="sal-mode"][data-mode="bici"]'); await wait(200);
  await empezarSalida(p); await wait(500);
  await p.evaluate(() => window.__route([[900, 20]], 0, 900)); await wait(300);
  t.has(await text(p, '#salLive'), 'En bici', 'en bici: el modo');
  t.has(await tc(p, '#salLive'), 'Velocidad', 'en bici: velocidad (no ritmo)');
  t.eq(await text(p, '#salAct'), 'En bici', 'en bici: un solo tipo de tramo');
  await p.click('[data-action="sal-stop"]'); await wait(400);
  t.has(await text(p, '#salidaHost'), 'Velocidad media', 'en bici: velocidad media en el resumen');
  await p.reload(); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  const c = await tc(p, '.sal-ended');
  t.has(c, 'Tu salida terminó', 'al recargar: la salida terminada sin guardar');
  t.has(c, 'En bici', 'con su modo');
  await p.click('[data-action="sal-review"]'); await wait(300);
  t.ok(await p.$('#salidaHost [data-action="sal-save"]'), '«Ver y guardar» abre el resumen con «Guardar»');
  await p.click('#salidaHost [data-action="sal-discard"]'); await wait(400);
  t.ok(pg.dialogs.includes('¿Descartar esta salida? No se va a guardar.'), 'pregunta antes de descartar');
  t.eq(await p.evaluate(() => Object.keys(localStorage).filter(k => /^gize_salida_v1/.test(k))), [], 'descartada: no queda nada guardado');
  t.ok(await p.$('[data-action="sal-sheet"]'), 'de nuevo «Salir a moverte»');
  t.eq(pg.errs, [], 'errores de la página (sin guardar)');
  await pg.close();
}

// Página con una salida ya guardada (y su recorrido en la caché). Sin la marca de subida: la nube
// de prueba no la tiene, y una subida que la nube no tiene se toma como borrada en otro lado.
const local = rec => { const r = Object.assign({}, rec); delete r.cloud; return r; };
const withSaved = (base, saved, extra) => newPage(Object.assign({ user: ALUMNO, state: Object.assign({}, STATE, { salidas: [local(saved.rec)] }), handlers: H }, extra || {}, {
  init: `localStorage.setItem(${JSON.stringify(TRACK_KEY)}, ${JSON.stringify(JSON.stringify([[saved.rec.id, saved.track]]))}); ${(extra && extra.init) || ''}`,
}));
async function abrir(p, saved){
  await p.click('#nav-cardio'); await wait(400);
  await p.click(`[data-action="sal-open"][data-id="${saved.rec.id}"]`); await wait(200);
}

// ---- c) Compartir ----
async function compartir(base, t, saved){
  // Web Share con archivos.
  let pg = await withSaved(base, saved, { init: `localStorage.setItem('gize_mapa_off','1'); (${FAKE_SHARE})();` });
  let p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await abrir(p, saved);
  await p.click('#salidaHost [data-action="sal-share"]'); await wait(200);
  t.has(await text(p, '#salShare'), 'Compartir tu salida', 'la hoja «Compartir tu salida»');
  t.eq(await p.$eval('#salShare input[data-sh="ends"]', e => e.checked), true, 'por defecto oculta dónde empezás y terminás');
  t.has(await text(p, '#salShare'), 'Ocultar dónde empezás y terminás', 'el interruptor lo dice');
  await p.waitForSelector('#salShare[data-listo="1"]', { timeout: 15000 }).catch(() => {});
  t.ok(await p.$('#salShare .ssh-img'), 'vista previa de la imagen');
  await p.click('#salShare [data-sh="share"]'); await wait(600);
  const sh = await p.evaluate(async () => {
    const f = window.__sharedFile; if (!f) return null;
    const b = await createImageBitmap(f);
    return { shared: window.__shared, w: b.width, h: b.height };
  });
  t.ok(sh && sh.shared.length === 1 && sh.shared[0].title === 'Mi salida en GIZE' && sh.shared[0].files[0].type === 'image/png' && /^gize-salida-[0-9a-f]{8}\.png$/.test(sh.shared[0].files[0].name), 'Web Share recibe el PNG: ' + JSON.stringify(sh && sh.shared));
  t.eq(sh && [sh.w, sh.h], [1080, 1920], 'la imagen es vertical, de 1080 × 1920');
  // Con y sin ocultar los extremos: imágenes distintas.
  const two = await p.evaluate(async () => {
    const c = await import('/app/ui/compartir.js'), m = await import('/app/core/salidas.js'), st = (await import('/app/core/state.js')).state;
    const r = st.salidas[0], tr = m.cachedTrack(r.id);
    const a = await c.storyImage(r, tr, { hideEnds: true }), b = await c.storyImage(r, tr, { hideEnds: false });
    const px = async bl => { const bm = await createImageBitmap(bl), cv = new OffscreenCanvas(bm.width, bm.height), x = cv.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height).data; };
    const da = await px(a), db = await px(b);
    let diff = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) > 30) diff++;
    return diff;
  });
  t.ok(two > 500, 'ocultar el principio y el final cambia la imagen: ' + two);
  await p.click('#salShare .ssh-close'); await wait(200);
  t.eq(await p.$$eval('#salShare', l => l.length), 0, '«Cerrar» saca la hoja');
  t.eq(pg.errs, [], 'errores de la página (Web Share)');
  await pg.close();

  // Sin Web Share: «Guardar imagen» la descarga.
  pg = await withSaved(base, saved, { init: "localStorage.setItem('gize_mapa_off','1'); navigator.canShare = undefined; navigator.share = undefined;" });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await abrir(p, saved);
  await p.click('#salidaHost [data-action="sal-share"]');
  await p.waitForSelector('#salShare[data-listo="1"]', { timeout: 15000 }).catch(() => {});
  t.eq(await p.$eval('#salShare [data-sh="share"]', b => b.hidden), true, 'sin Web Share no se ofrece «Compartir»');
  t.has(await text(p, '#salShare'), 'mantener apretada la imagen', 'y explica que se puede mantener apretada');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#salShare [data-sh="save"]')]);
  t.eq(dl && dl.suggestedFilename(), 'gize-salida.png', '«Guardar imagen» la descarga');
  t.eq(pg.errs, [], 'errores de la página (descarga)');
  await pg.close();

  // App nativa: Filesystem (caché) + Share.
  pg = await withSaved(base, saved, { init: "localStorage.setItem('gize_mapa_off','1');" });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await abrir(p, saved);
  await p.evaluate(() => {
    window.__nat = [];
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: n => n === 'Share' || n === 'Filesystem',
      Plugins: {
        Filesystem: { writeFile: async o => { window.__nat.push(['write', o.path, o.directory, o.data.slice(0, 8)]); return { uri: 'file:///data/cache/' + o.path }; } },
        Share: { share: async o => { window.__nat.push(['share', o.title, o.files, o.dialogTitle]); return {}; } },
      } };
  });
  await p.click('#salidaHost [data-action="sal-share"]');
  await p.waitForSelector('#salShare[data-listo="1"]', { timeout: 15000 }).catch(() => {});
  t.eq(await p.$$eval('#salShare [data-sh="save"]', l => l.length), 0, 'en la app no aparece «Guardar imagen»');
  await p.click('#salShare [data-sh="share"]'); await wait(800);
  const nat = await p.evaluate(() => window.__nat);
  const name = 'gize-salida.png';
  t.eq(nat, [['write', name, 'CACHE', 'iVBORw0K'], ['share', 'Mi salida en GIZE', ['file:///data/cache/' + name], 'Compartir tu salida']], 'app nativa: el PNG a la caché (Filesystem, siempre con el mismo nombre: cada una pisa a la anterior) y se comparte el archivo (Share)');
  // Al cerrar sesión o borrar la cuenta, la imagen se borra de la caché.
  await p.evaluate(() => { window.Capacitor.Plugins.Filesystem.deleteFile = async o => { window.__nat.push(['delete', o.path, o.directory]); }; });
  await p.evaluate(async uid => (await import('/app/core/supabase.js')).clearAccountLeftovers(uid), ALUMNO.id); await wait(100);
  t.eq((await p.evaluate(() => window.__nat)).slice(-1), [['delete', name, 'CACHE']], 'al cerrar sesión se borra la imagen de la caché');
  t.eq(pg.errs, [], 'errores de la página (nativo)');
  await pg.close();
}

// «Compartir» de una salida cuyo recorrido todavía no llegó: desactivado hasta que llega (si no,
// la imagen saldría «Sin recorrido»).
async function compartirCargando(base, t, saved){
  const H2 = Object.assign({}, H, { '/cardio_outings': (r, J, i) => /select=track/.test(decodeURIComponent(i.url.search))
    ? new Promise(ok => setTimeout(() => ok(J(i.one ? { track: saved.track } : [{ track: saved.track }])), 1500)) : undefined });
  const pg = await newPage({ user: ALUMNO, state: Object.assign({}, STATE, { salidas: [local(saved.rec)] }), handlers: H2, init: "localStorage.setItem('gize_mapa_off','1');" });
  const p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await abrir(p, saved); await wait(200);
  t.has(await text(p, '#salidaHost'), 'Cargando el recorrido', 'sin el recorrido en el celular: lo pide');
  t.eq(await p.$eval('#salidaHost [data-action="sal-share"]', b => b.disabled), true, 'mientras llega, «Compartir» está desactivado');
  await p.evaluate(() => document.querySelector('#salidaHost [data-action="sal-share"]').click()); await wait(100);
  t.eq(await p.$$eval('#salShare', l => l.length), 0, 'y no abre la hoja');
  await p.waitForSelector('#salidaHost .rv', { timeout: 5000 }).catch(() => {});
  t.eq(await p.$eval('#salidaHost [data-action="sal-share"]', b => b.disabled), false, 'cuando llega el recorrido, «Compartir» se activa');
  t.eq(pg.errs, [], 'errores de la página (compartir mientras carga)');
  await pg.close();
}

// El estado del GPS que va y viene (precisión cerca de los 20 m: «débil» / bien en cada punto):
// se pinta solo el cartelito, sin redibujar la pantalla de Cardio.
async function gpsDebil(base, t){
  const pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE, handlers: H });
  const p = pg.p;
  await p.addInitScript("localStorage.setItem('gize_mapa_off','1'); localStorage.setItem('gize_salida_aviso','1');");
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  await empezarSalida(p); await wait(400);
  await p.evaluate(plan => window.__route(plan, 0, 30), PLAN); await wait(300);
  await p.evaluate(() => { window.__renders = 0; new MutationObserver(l => { if (l.some(m => m.type === 'childList' && m.target.id === 'view')) window.__renders++; }).observe(document.getElementById('view'), { childList: true }); });
  const seen = await p.evaluate(async () => {
    const c = await import('/app/screens/cardio.js'), g = await import('/app/ui/gps.js'), m = await import('/app/core/cardiogps.js');
    const lp = m.lastPoint(g.GpsState.run), tl = Math.max(lp.t, g.GpsState.run.live.rawT || 0), out = new Set();
    // Sigue desde donde quedó, trotando para el norte (un punto por segundo).
    for (let i = 0; i < 60; i++){
      window.__push(lp.lat + (i + 1) * 2.5 / 111195, lp.lon, i % 2 ? 24 : 16, tl + (i + 1) * 1000);
      await new Promise(r => setTimeout(r, 5));
      c.paintSalida(); // lo que hace el reloj de main.js cada segundo
      const g = document.getElementById('salGps'); out.add(g && !g.hidden ? g.textContent : '');
    }
    return [...out];
  });
  await wait(300);
  t.ok(await p.evaluate(() => window.__renders) <= 1, 'GPS débil / bien alternando en 60 puntos: Cardio no se redibuja (' + await p.evaluate(() => window.__renders) + ' veces)');
  t.ok(seen.includes('Señal del GPS débil'), 'el cartelito «Señal del GPS débil» se pinta igual: ' + JSON.stringify(seen));
  t.eq(pg.errs, [], 'errores de la página (GPS débil)');
  await pg.close();
}

// ---- d) Movimiento reducido, modo liviano, apariencias, 320 px ----
async function looks(base, t, saved){
  // Movimiento reducido: el recorrido completo de una, sin animar.
  let pg = await withSaved(base, saved, { reducedMotion: 'reduce', init: "localStorage.setItem('gize_mapa_off','1');" });
  let p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await abrir(p, saved); await wait(250);
  t.eq(await estado(p), 'listo', 'movimiento reducido: el recorrido completo de una');
  t.eq(await p.$eval('#sovNums', e => e.classList.contains('in')), true, 'movimiento reducido: los números ya');
  t.ok((await pixels(p, '#salidaHost .rv-line')).n > 2000, 'movimiento reducido: dibujado entero');
  t.eq(pg.errs, [], 'errores de la página (movimiento reducido)');
  await pg.close();

  // Modo liviano: sin MapLibre, quieto.
  pg = await withSaved(base, saved, { init: "localStorage.setItem('gize_lite','1');" });
  p = pg.p;
  const reqs = []; p.on('request', r => reqs.push(r.url()));
  await p.goto(base + '/app/'); await wait(2500);
  await abrir(p, saved); await wait(1500);
  t.eq(await estado(p), 'listo', 'modo liviano: el recorrido quieto, de una');
  t.eq(reqs.filter(u => /maplibre|openfreemap/i.test(u)), [], 'modo liviano: nunca se pide MapLibre ni el mapa');
  t.eq(pg.errs, [], 'errores de la página (liviano)');
  await pg.close();

  // Con MapLibre (si hay WebGL) y sin conexión al mapa: el recorrido igual, y el aviso.
  pg = await withSaved(base, saved, { init: "localStorage.setItem('gize_lite','0');" });
  p = pg.p;
  const r2 = []; p.on('request', r => r2.push(r.url()));
  await p.goto(base + '/app/'); await wait(2500);
  t.eq(r2.filter(u => /maplibre|openfreemap/i.test(u)), [], 'al abrir la app no se pide MapLibre');
  await abrir(p, saved);
  t.ok(await waitEstado(p, 'listo', 15000), 'sin el mapa (OpenFreeMap no responde) el recorrido se dibuja igual');
  const gl = await p.evaluate(async () => (await import('/app/ui/mapa.js')).webglOk());
  if (gl){
    t.ok(r2.some(u => /vendor\/maplibre-gl-6\.11\.2\/maplibre-gl\.js/.test(u)), 'con WebGL se carga MapLibre (de vendor/) al mostrar el recorrido');
    t.has(await text(p, '#salidaHost .rv-msg'), 'Sin conexión: el recorrido sin el mapa de fondo.', 'avisa que el mapa no llegó');
  }
  t.ok((await pixels(p, '#salidaHost .rv-line')).n > 2000, 'dibujado sobre el fondo propio');
  t.eq(pg.errs, [], 'errores de la página (sin mapa)');
  await pg.close();

  // Apariencias: la línea con la gama de cada una (lento = r1, rápido = r3); sin neón, grises. En
  // ninguna hay halo de color alrededor del recorrido (apariencia tranquila: sin resplandores).
  const LOOKS = [
    ['Oscuro', '', [47, 160, 255], true],
    ['Claro', "localStorage.setItem('gize_tema','luz');", [43, 147, 240], true],
    ['Azul', "localStorage.setItem('gize_tema','azul');", [63, 163, 242], true],
    ['Rosa', "localStorage.setItem('gize_tema','rosa');", [255, 95, 168], true],
    ['sin neón', "localStorage.setItem('gize_neon','0');", [110, 116, 130], false],
    ['Claro sin neón', "localStorage.setItem('gize_tema','luz'); localStorage.setItem('gize_neon','0');", [110, 116, 130], false],
  ];
  for (const [name, init, slow, color] of LOOKS){
    pg = await withSaved(base, saved, { reducedMotion: 'reduce', init: "localStorage.setItem('gize_mapa_off','1'); localStorage.setItem('gize_lite','0');" + init });
    p = pg.p;
    await p.goto(base + '/app/'); await wait(2300);
    await abrir(p, saved); await wait(300);
    const px = await pixels(p, '#salidaHost .rv-line', slow);
    t.ok(px && px.close > 30, name + ': el recorrido arranca con el color frío de su gama: ' + JSON.stringify(px));
    t.ok(color ? px.sat > px.n * 0.5 : px.sat === 0, name + (color ? ': con color' : ': solo grises') + ': ' + JSON.stringify(px));
    t.has(await p.$eval('.sal-leg-bar', e => e.style.background), 'rgb(' + slow.join(', ') + ')', name + ': la leyenda con los mismos colores');
    t.eq(await p.$$eval('#salidaHost .rv-halo', l => l.length), 0, name + ': sin halo alrededor del recorrido');
    t.eq(await infinite(p), [], name + ': nada se mueve sin fin');
    await p.click('#salidaHost [data-action="sal-close"]'); await wait(200);
    t.eq(pg.errs, [], 'errores de la página (' + name + ')');
    await pg.close();
  }

  // 320 px: inicio, en vivo y resumen sin scroll de costado.
  pg = await newPage({ user: ALUMNO, state: Object.assign({}, STATE, { salidas: [local(saved.rec)] }), viewport: { width: 320, height: 640 }, touch: true, handlers: H,
    init: FAKE });
  p = pg.p;
  await p.addInitScript(`localStorage.setItem('gize_mapa_off','1'); localStorage.setItem('gize_salida_aviso','1'); localStorage.setItem(${JSON.stringify(TRACK_KEY)}, ${JSON.stringify(JSON.stringify([[saved.rec.id, saved.track]]))});`);
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  t.ok(await noHScroll(p), '320 px: Cardio sin scroll de costado');
  await p.click(`[data-action="sal-open"][data-id="${saved.rec.id}"]`); await wait(400);
  t.ok(await noHScroll(p), '320 px: el resumen sin scroll de costado');
  await p.click('#salidaHost [data-action="sal-close"]'); await wait(200);
  await empezarSalida(p); await wait(400);
  await p.evaluate(plan => window.__route(plan, 0, 300), PLAN); await wait(300);
  t.ok(await noHScroll(p), '320 px: en vivo sin scroll de costado');
  t.eq(pg.errs, [], 'errores de la página (320 px)');
  await pg.close();
}

export default async function ({ base, t }){
  staticChecks(t);
  const saved = await flujo(base, t);
  await terminadaSinGuardar(base, t);
  if (!saved.rec || !saved.track){ t.ok(false, 'no quedó una salida guardada para seguir probando'); return; }
  await compartir(base, t, saved);
  await compartirCargando(base, t, saved);
  await gpsDebil(base, t);
  await looks(base, t, saved);
}
