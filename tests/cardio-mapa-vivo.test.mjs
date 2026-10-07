// Cardio «A pie» / «En bici»: el mini mapa en vivo muestra dónde está la persona desde el primer
// dato del GPS, aunque el motor todavía no lo acepte (precisión floja al arrancar).
// a) Antes del primer dato: «Buscando tu ubicación…» y ningún punto. Con datos de 60 m (el motor
//    los descarta: no suman distancia): el mapa se centra ahí, el punto «estás acá» con el círculo
//    de la precisión y el texto cambia. Después, caminando con buena señal: el recorrido se dibuja
//    y el punto lo sigue. El punto late unas veces y queda quieto (nada se mueve sin fin).
// b) watchPosition va en el mismo toque de «Empezar» (iPhone: si no, el cartel del permiso puede
//    no salir), aunque el navegador tarde en contestar si hay permiso.
// c) Permiso negado: con algo medido, la salida se pausa y el mini mapa dice «Sin permiso de
//    ubicación»; sin nada medido, la hoja «Salir a moverte» se vuelve a abrir con el aviso. Si el
//    navegador ya lo había negado: no arranca y no queda mirando la ubicación.
// El mapa de fondo no sale a internet en las pruebas (gize_mapa_off): proyección propia.
import { newPage, wait, text, ALUMNO, profile, empezarSalida } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const H = { '/profiles': profile('client') };
const PERM_WEB = 'GIZE no tiene permiso para usar tu ubicación. Permitilo en los ajustes del navegador.';

// GPS web falso con un reloj que avanza (como tests/cardio-a-pie.test.mjs). El navegador tarda en
// contestar el permiso (como uno de verdad). __inClick: si watchPosition se llamó dentro del toque.
const FAKE = () => {
  const real = Date.now.bind(Date);
  window.__skew = 0; window.__perm = 'prompt';
  Date.now = () => real() + window.__skew;
  window.__geo = { watchers: {}, n: 0, inClick: [] };
  window.__inClick = false;
  window.addEventListener('click', () => { window.__inClick = true; }, true);
  window.addEventListener('click', () => { window.__inClick = false; });
  Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(ok, err){ const id = ++window.__geo.n; window.__geo.watchers[id] = { ok, err }; window.__geo.inClick.push(window.__inClick); return id; },
    clearWatch(id){ delete window.__geo.watchers[id]; }, getCurrentPosition(){},
  }, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => ({ addEventListener(){}, release: async () => {} }) }, configurable: true });
  const perms = navigator.permissions;
  Object.defineProperty(navigator, 'permissions', { value: { query: d => (d && d.name === 'geolocation') ? new Promise(ok => setTimeout(() => ok({ state: window.__perm }), 30)) : perms.query(d) }, configurable: true });
  window.__push = (lat, lon, acc, t) => {
    window.__skew = t - real();
    for (const k in window.__geo.watchers) window.__geo.watchers[k].ok({ coords: { latitude: lat, longitude: lon, accuracy: acc, speed: null }, timestamp: t });
  };
  window.__deny = () => { for (const k in window.__geo.watchers) window.__geo.watchers[k].err({ code: 1, message: 'denied' }); };
};
// Un lugar cualquiera (no es de nadie): el Monumento a la Bandera, en Rosario.
const LAT = -32.9476, LON = -60.6305;

const mini = p => p.evaluate(() => {
  const v = document.querySelector('.sal-minimap .rv'); if (!v) return null;
  const m = v.querySelector('.rv-msg'), h = v.querySelector('.rv-here'), a = h && h.querySelector('.rv-here-acc');
  const r = v.getBoundingClientRect(), hr = h && !h.hidden ? h.getBoundingClientRect() : null, ar = a && !a.hidden && h && !h.hidden ? a.getBoundingClientRect() : null;
  const dot = h && h.querySelector('.rv-here-dot'), ds = dot && getComputedStyle(dot, '::after');
  return {
    msg: m && !m.hidden ? m.textContent : '',
    here: !!hr, x: hr ? Math.round(hr.left - r.left) : null, y: hr ? Math.round(hr.top - r.top) : null, w: Math.round(r.width), h: Math.round(r.height),
    ring: ar ? Math.round(ar.width) : 0,
    pulse: h && !h.hidden ? [ds.animationName, ds.animationIterationCount] : null,
    dotBg: dot ? getComputedStyle(dot).backgroundColor : '',
  };
});
const linePx = p => p.evaluate(() => {
  const c = document.querySelector('.sal-minimap .rv-line'); if (!c || !c.width) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 200) n++;
  return n;
});
const infinite = p => p.evaluate(() => {
  const out = new Set();
  document.querySelectorAll('*').forEach(e => {
    if (!e.getClientRects().length) return;
    for (const ps of [null, '::before', '::after']){ const s = getComputedStyle(e, ps); if (s.animationName !== 'none' && s.animationIterationCount === 'infinite' && s.animationPlayState !== 'paused') out.add(String(e.className || e.tagName) + (ps || '') + ':' + s.animationName); }
  });
  return [...out];
});
const gs = p => p.evaluate(async () => { const g = await import('/app/ui/gps.js'); const r = g.GpsState.run; return { status: r && r.status, pts: r ? r.pts.length : 0, here: !!g.GpsState.here, errorWhy: g.GpsState.errorWhy, watchers: Object.keys(window.__geo.watchers).length }; });

async function page(base){
  const pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE, handlers: H });
  await pg.p.addInitScript("localStorage.setItem('gize_mapa_off','1'); localStorage.setItem('gize_lite','0'); localStorage.setItem('gize_salida_aviso','1');");
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-cardio'); await wait(400);
  return pg;
}

async function enVivo(base, t){
  const pg = await page(base), p = pg.p;
  await empezarSalida(p); await wait(500);
  t.eq(await p.evaluate(() => window.__geo.inClick), [true], 'watchPosition se pide dentro del toque de «Empezar» (sin esperar al permiso)');
  let m = await mini(p);
  t.ok(m, 'en vivo: el mini mapa');
  t.eq([m && m.msg, m && m.here], ['Buscando tu ubicación…', false], 'antes del primer dato: «Buscando tu ubicación…» y ningún punto');
  t.ok(!/Tu recorrido aparece acá/.test(await text(p, '#salLive')), 'ya no el texto viejo que esperaba al recorrido');

  // Datos con 60 m de precisión: el motor los descarta, pero el mapa ya muestra dónde está.
  const t0 = await p.evaluate(() => Date.now() + 1000);
  for (let i = 0; i < 3; i++){ await p.evaluate(([a, o, tt]) => window.__push(a, o, 60, tt), [LAT + i * 0.000005, LON, t0 + i * 1000]); await wait(80); }
  await wait(1200);
  let s = await gs(p);
  t.eq([s.pts, s.here], [0, true], 'precisión de 60 m: el motor no lo acepta, pero queda anotado dónde está');
  t.eq(await text(p, '#salDist'), '0,00', 'y no suma distancia');
  m = await mini(p);
  t.eq(m.msg, 'Estás por acá (±60 m). Afinando el GPS…', 'el texto cambia: ya sabe dónde está, con la precisión');
  t.ok(m.here && Math.abs(m.x - m.w / 2) <= 2 && Math.abs(m.y - m.h / 2) <= 2, 'el punto «estás acá», en el centro del mapa: ' + JSON.stringify(m));
  t.ok(m.ring > 30 && m.ring < Math.min(m.w, m.h), 'con el círculo de la precisión (entra en el mapa): ' + m.ring + ' px');
  t.eq(m.pulse, ['rvHere', '3'], 'el punto late 3 veces al aparecer (y queda quieto)');
  t.eq(m.dotBg, await p.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--gize-blue)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }), 'el punto, azul GIZE');
  t.eq(await infinite(p), [], 'en vivo con el punto: nada se mueve sin fin');

  // Caminando con buena señal (5 m), hacia el norte: el recorrido aparece y el punto lo sigue.
  const t1 = t0 + 3000;
  await p.evaluate(([a, o, tt]) => { for (let i = 0; i < 60; i++) window.__push(a + i * 1.4 / 111195, o, 5, tt + i * 1000); }, [LAT, LON, t1]);
  await wait(300);
  await p.evaluate(async () => (await import('/app/screens/cardio.js')).liveMapTick(true)); // el redibujo de cada 5 s
  await wait(300);
  s = await gs(p);
  t.ok(s.pts > 10, 'con buena señal, el motor acepta los puntos: ' + s.pts);
  t.ok(await linePx(p) > 30, 'el recorrido se dibuja en el mini mapa: ' + await linePx(p));
  m = await mini(p);
  t.eq(m.msg, '', 'con recorrido, sin texto encima');
  t.ok(m.here && m.ring === 0, 'el punto sigue, sin círculo (precisión buena): ' + JSON.stringify(m));
  t.ok(Math.abs(m.x - m.w / 2) <= 2 && Math.abs(m.y - m.h / 2) <= 2, 'centrado en dónde está ahora: ' + JSON.stringify(m));
  // Datos flojos otra vez (el motor no los acepta, así que no hay redibujo del recorrido): el
  // punto se mueve igual, solo, con el círculo de la precisión.
  const y0 = m.y, n0 = s.pts;
  await p.evaluate(([a, o, tt]) => { for (let i = 1; i <= 3; i++) window.__push(a + (59 * 1.4 + i * 15) / 111195, o, 40, tt + (59 + i) * 1000); }, [LAT, LON, t1]);
  await wait(1300);
  m = await mini(p);
  t.eq((await gs(p)).pts, n0, 'datos flojos: no suman puntos');
  t.ok(m.here && m.y < y0 - 10 && m.ring > 0, 'el punto sigue a la persona (hacia el norte, arriba) con su círculo: ' + y0 + ' → ' + m.y + ', ' + m.ring + ' px');
  t.eq(await infinite(p), [], 'caminando: nada se mueve sin fin');

  // Se niega el permiso con algo medido: se pausa y el mini mapa lo dice.
  await p.evaluate(() => window.__deny()); await wait(500);
  s = await gs(p);
  t.eq([s.status, s.errorWhy, s.watchers], ['paused', 'permiso', 0], 'permiso negado con algo medido: pausada y sin mirar');
  m = await mini(p);
  t.eq(m && m.msg, 'Sin permiso de ubicación', 'el mini mapa: «Sin permiso de ubicación»');
  t.has(await text(p, '#salLive .sal-err'), PERM_WEB, 'y el aviso del permiso a la vista');
  t.eq(pg.errs, [], 'errores de la página (en vivo)');
  await pg.close();
}

async function sinPermiso(base, t){
  const pg = await page(base), p = pg.p;
  // Lo niega en el cartel, sin haber medido nada.
  await empezarSalida(p); await wait(400);
  t.eq((await mini(p) || {}).msg, 'Buscando tu ubicación…', 'esperando el permiso: «Buscando tu ubicación…»');
  await p.evaluate(() => window.__deny()); await wait(500);
  let s = await gs(p);
  t.eq([s.status, s.errorWhy, s.watchers], [null, 'permiso', 0], 'permiso negado sin nada medido: no queda salida ni mirando');
  t.has(await text(p, '#salSheet .sal-err'), PERM_WEB, 'la hoja «Salir a moverte» se vuelve a abrir con el aviso del permiso');
  t.ok(!(await p.$('.sal-minimap')), 'sin mini mapa esperando para siempre');
  // El navegador ya lo había negado: no arranca y no queda mirando.
  await p.evaluate(() => { window.__perm = 'denied'; });
  await empezarSalida(p); await wait(500);
  s = await gs(p);
  t.eq([s.status, s.errorWhy, s.watchers], [null, 'permiso', 0], 'ya negado: no arranca y no queda mirando la ubicación');
  t.has(await text(p, '#salSheet .sal-err'), PERM_WEB, 'y avisa en la hoja');
  t.eq(pg.errs, [], 'errores de la página (sin permiso)');
  await pg.close();
}

export default async function ({ base, t }){
  await enVivo(base, t);
  await sinPermiso(base, t);
}
