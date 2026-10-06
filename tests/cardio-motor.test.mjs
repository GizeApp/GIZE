// Cardio «A pie» / «En bici» con GPS: el motor de cuentas (app/core/cardiogps.js), sin pantalla.
// Recorridos sintéticos armados acá (un punto por segundo, con ruido de GPS de semilla fija, así
// siempre dan lo mismo) y pasados por el motor adentro de la página: caminata pareja, caminar →
// trotar → correr, GPS quieto que tiembla, picos y saltos, corte de señal, semáforo (pausa
// automática), parciales, bici, salida corta y sin peso cargado. También la salida en vivo
// (pausa manual, recuperar después de cerrar la app), el recorrido guardado (polyline de 3
// dimensiones), los colores por velocidad y los textos.
import { newPage } from './lib.mjs';

// ---- Recorridos sintéticos ----
// PRNG con semilla (mulberry32) y normal de Box–Muller.
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const M_LAT = 111195.08; // metros por grado de latitud (el radio de haversine)
const T0 = Date.parse('2026-10-02T09:00:00Z'), LAT0 = -34.58, LON0 = -58.42;
// legs: [{ s (segundos), kmh (número o función del segundo), jitter (m, ruido blanco ±),
//          silent (sin puntos), spikeAt/spike (un punto corrido spike m), shift (m, todo corrido),
//          acc }].
// noise: error del GPS que va y viene despacio (como el de un celular), en metros.
function track({ legs, seed = 1, noise = 0.8, acc = 5, turn = 0.15, spd = false }){
  const r = rng(seed), k = Math.cos(LAT0 * Math.PI / 180), out = [];
  let x = 0, y = 0, h = Math.PI / 6, ex = 0, ey = 0, t = T0;
  for (const L of legs){
    for (let i = 0; i < L.s; i++){
      t += 1000;
      const v = (typeof L.kmh === 'function' ? L.kmh(i) : (L.kmh || 0)) / 3.6;
      x += v * Math.sin(h); y += v * Math.cos(h); h += (v > 0 ? turn : 0) * Math.PI / 180;
      ex = 0.95 * ex + gauss(r) * noise * 0.312; ey = 0.95 * ey + gauss(r) * noise * 0.312;
      if (L.silent) continue;
      let jx = 0, jy = 0;
      if (L.jitter){ jx = (r() * 2 - 1) * L.jitter; jy = (r() * 2 - 1) * L.jitter; }
      const sx = (L.spikeAt === i ? L.spike : 0) + (L.shift || 0);
      out.push({ lat: LAT0 + (y + ey + jy) / M_LAT, lon: LON0 + (x + ex + jx + sx) / (M_LAT * k), t, acc: L.acc || acc, spd: spd ? v : null });
    }
  }
  return out;
}

const TRACKS = {
  walk: track({ legs: [{ s: 1800, kmh: 5 }] }),
  mix: track({ legs: [{ s: 1200, kmh: 5 }, { s: 900, kmh: 8 }, { s: 600, kmh: 11 }], seed: 2 }),
  still: track({ legs: [{ s: 600, kmh: 0, jitter: 5, acc: 8 }], noise: 0, seed: 3 }),
  osc: track({ legs: [{ s: 600, kmh: i => (Math.floor(i / 10) % 2 ? 6.7 : 6.3) }], seed: 4 }),
  sprint: track({ legs: [{ s: 300, kmh: 5 }, { s: 30, kmh: 14 }, { s: 300, kmh: 5 }], seed: 5 }),
  light: track({ legs: [{ s: 300, kmh: 5 }, { s: 120, kmh: 0, jitter: 2 }, { s: 300, kmh: 5 }], seed: 6 }),
  lightSilent: track({ legs: [{ s: 300, kmh: 5 }, { s: 150, kmh: 0, silent: true }, { s: 300, kmh: 5 }], seed: 6 }),
  gap: track({ legs: [{ s: 300, kmh: 5 }, { s: 180, kmh: 5, silent: true }, { s: 300, kmh: 5 }], seed: 7 }),
  // Pantalla bloqueada 20 s (navegador del iPhone) y el primer dato al volver, flojo y corrido.
  hole: track({ legs: [{ s: 300, kmh: 5 }, { s: 20, kmh: 5, silent: true }, { s: 1, kmh: 5, acc: 28, shift: 25 }, { s: 300, kmh: 5 }], seed: 15 }),
  // Corte de más de 30 min, uno en colectivo (20 km/h en línea recta) y uno a 11 km/h.
  gapLong: track({ legs: [{ s: 300, kmh: 5 }, { s: 2000, kmh: 5, silent: true }, { s: 300, kmh: 5 }], seed: 16, turn: 0 }),
  gapBus: track({ legs: [{ s: 300, kmh: 5 }, { s: 300, kmh: 20, silent: true }, { s: 300, kmh: 5 }], seed: 17, turn: 0 }),
  gapFast: track({ legs: [{ s: 300, kmh: 5 }, { s: 120, kmh: 11, silent: true }, { s: 300, kmh: 5 }], seed: 18, turn: 0 }),
  spike: track({ legs: [{ s: 300, kmh: 5 }, { s: 1, kmh: 5, spikeAt: 0, spike: 200 }, { s: 300, kmh: 5 }], seed: 8 }),
  nospike: track({ legs: [{ s: 300, kmh: 5 }, { s: 1, kmh: 5 }, { s: 300, kmh: 5 }], seed: 8 }),
  shift: track({ legs: [{ s: 300, kmh: 5 }, { s: 300, kmh: 5, shift: 300 }], seed: 9 }),
  zigzag: track({ legs: [{ s: 1800, kmh: 5, jitter: 3 }], noise: 0.5, seed: 10 }),
  splits: track({ legs: [{ s: 1874, kmh: 10 }], noise: 0, turn: 0 }),
  bike: track({ legs: [{ s: 1800, kmh: 20 }, { s: 60, kmh: 45 }, { s: 60, kmh: 0, silent: true }, { s: 300, kmh: 22 }], seed: 11 }),
  doppler: track({ legs: [{ s: 600, kmh: 5 }, { s: 600, kmh: 10 }], spd: true, seed: 12 }),
  short: track({ legs: [{ s: 40, kmh: 0, jitter: 3 }], seed: 13 }),
};
// Primer punto malo: 300 m al este de donde está; los demás, bien.
TRACKS.badFirst = track({ legs: [{ s: 600, kmh: 5 }], seed: 14 });
TRACKS.badFirst[0] = Object.assign({}, TRACKS.badFirst[0], { lon: TRACKS.badFirst[0].lon + 300 / (M_LAT * Math.cos(LAT0 * Math.PI / 180)) });
// 15 min caminando (para los puntos que llegan tarde, en tanda).
TRACKS.late = track({ legs: [{ s: 900, kmh: 5 }], seed: 21 });

const near = (a, b, tol) => Math.abs(a - b) <= tol;

export default async function ({ base, t }){
  const pg = await newPage();
  const p = pg.p;
  await p.goto(base + '/privacidad/');
  const r = await p.evaluate(async ([TR, T0]) => {
    const G = await import('/app/core/cardiogps.js');
    const o = {};
    // Salida completa: puntos → addPoint en vivo → terminar → resumen.
    const go = (raw, mode = 'pie', kg = 72) => {
      const run = G.newRun(mode, T0, 'id-' + mode);
      const whys = raw.map(pt => G.addPoint(run, pt));
      const end = raw.length ? raw[raw.length - 1].t : T0 + 1000;
      const liveEnd = G.liveStats(run, end, kg);
      G.endRun(run, end);
      const fin = G.finishRun(run, kg, end, '2026-10-02');
      return { rec: fin.rec, track: fin.track, whys, live: JSON.parse(JSON.stringify(run.live)), liveEnd, n: run.pts.length };
    };
    const S = {};
    for (const k of Object.keys(TR)) S[k] = go(TR[k], k === 'bike' ? 'bici' : 'pie');
    o.S = {};
    for (const k in S){ const x = S[k]; o.S[k] = { rec: x.rec, whys: x.whys.slice(0, 6), live: x.live, liveEnd: x.liveEnd, n: x.n, trackLen: x.track ? x.track.length : 0, pieces: x.track ? G.decodeTrack(x.track).length : 0, txt: G.breakdownText(x.rec.breakdown), pace: G.paceOrSpeed(x.rec) }; }
    o.spikeWhy = S.spike.whys[300];
    o.shiftWhys = S.shift.whys.slice(299, 305);
    o.holeWhy = S.hole.whys[300];

    // Básicos
    o.deg = G.haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    o.ba = G.haversine({ lat: -34.6037, lon: -58.3816 }, { lat: -34.9214, lon: -57.9545 }); // Obelisco → La Plata
    o.pack = G.packPoint({ lat: -34.6037, lon: -58.3816, t: T0 + 1234, acc: 4.6, spd: 1.39, seg: 2 }, T0);
    o.unpack = G.unpackPoint(o.pack, T0);
    o.packNoSpd = G.packPoint({ lat: -34.6, lon: -58.4, t: T0, acc: 5, spd: -1 }, T0);
    // Hora de los puntos (createClock): la del GPS, aunque llegue tarde; un reloj del celular corrido
    // se corrige con la diferencia; sin hora, del futuro o de antes de empezar → la del celular.
    {
      const c = G.createClock(), st = T0 - 600000;
      o.clk = [c(T0 - 5000, T0, st), c(T0 + 600, T0 + 1000, st), c(T0 - 300000, T0 + 2000, st), c(undefined, T0 + 3000, st), c(T0 + 120000, T0 + 4000, st),
        c(T0 + 4600, T0 + 5000, st), c(T0 + 5600, T0 + 6000, st)];
      const d = G.createClock(); // el reloj del celular 2 min adelantado
      o.clkSkew = [d(T0, T0 + 120500, T0), d(T0 + 1000, T0 + 121200, T0), d(T0 + 2000, T0 + 122300, T0)];
      o.clkBefore = G.createClock()(T0 - 1000, T0 + 500, T0);
    }
    // Puntos que llegan tarde, en tanda (iPhone con la app en segundo plano): los minutos 5 a 10
    // de una caminata de 15 llegan todos juntos en el minuto 10. Tienen que sumar igual.
    {
      const raw = TR.late, go = (late) => {
        const run = G.newRun('pie', T0, 'late'), clk = G.createClock();
        const put = (pt, now) => G.addPoint(run, Object.assign({}, pt, { t: clk(pt.t, now, run.start) }));
        raw.forEach((pt, i) => { if (!late || i < 300 || i >= 600) put(pt, pt.t + 300); if (late && i === 599) raw.slice(300, 600).forEach((q, k) => put(q, pt.t + 300 + k * 5)); });
        const end = raw[raw.length - 1].t;
        G.endRun(run, end);
        return G.finishRun(run, 72, end, '2026-10-02').rec;
      };
      const a = go(false), b = go(true);
      o.late = { a: [a.dist, a.moving, a.gap], b: [b.dist, b.moving, b.gap] };
    }

    // Filtro, punto por punto
    {
      const f = G.createFilter('pie');
      const P = (dLat, acc, s) => ({ lat: -34.58 + dLat, lon: -58.42, acc, t: T0 + s * 1000 });
      o.f = [
        f.push({ lat: NaN, lon: 1, t: T0, acc: 5 }).why, f.push(P(0, 31, 1)).why, f.push(P(0, null, 1)).why,
        f.push(P(0, 25, 2)).why, f.push(P(0, 25, 23)).why, f.push(P(0, 5, 23)).why, f.push(P(0.00001, 5, 24)).why,
      ];
      o.fDist = f.dist;
    }
    // Salida en vivo: precisión del primer punto, guardado y pausa manual.
    {
      const run = G.newRun('pie', T0, 'v1');
      const pt = (i, acc, extraLon = 0) => ({ lat: -34.58 + i * 1.389 / 111195, lon: -58.42 + extraLon, acc, t: T0 + i * 1000, spd: null });
      o.v = [G.addPoint(run, pt(1, 31)), G.addPoint(run, pt(2, 25))];
      o.vStored = run.pts.length; // el de 31 m no se guarda; el de 25 m sí (cuenta para la espera)
      for (let i = 3; i <= 120; i++) G.addPoint(run, pt(i, 5));
      G.pauseRun(run, T0 + 121000);
      o.vPaused = G.addPoint(run, pt(150, 5));
      const statsPaused = G.liveStats(run, T0 + 150000, 72);
      o.vPausedStats = { gps: statsPaused.gps, kmh: statsPaused.kmh, el: statsPaused.elapsedMs };
      G.resumeRun(run, T0 + 180000);
      o.vSeg = run.seg;
      o.vLate = G.addPoint(run, pt(170, 5)); // de antes de seguir
      const lon150 = 150 / (111195 * Math.cos(-34.58 * Math.PI / 180));
      o.vAfter = G.addPoint(run, pt(181, 5, lon150)); // se movió 150 m durante la pausa
      for (let i = 182; i <= 300; i++) G.addPoint(run, pt(i, 5, lon150));
      o.vElapsed = G.elapsedMs(run, T0 + 300000);
      o.vSegs = [...new Set(run.pts.map(a => a[5]))];
      o.vLiveDist = run.live.dist;
      G.pauseRun(run, T0 + 301000);
      G.endRun(run, T0 + 400000);
      o.vEndElapsed = G.elapsedMs(run, T0 + 999999);
      const fin = G.finishRun(run, 72, T0 + 400000, '2026-10-02');
      o.vRec = fin.rec; o.vPieces = G.decodeTrack(fin.track).length;
      o.vJson = JSON.stringify(run).includes('"_f"');
    }
    // Recuperar después de cerrar la app: la mitad de la salida pasa por JSON (como en el celular)
    // y sigue; da exactamente lo mismo que sin cortar.
    {
      const raw = TR.mix, a = G.newRun('pie', T0, 'r1');
      for (const pt of raw.slice(0, 1500)) G.addPoint(a, pt);
      const b = JSON.parse(JSON.stringify(a));
      o.rHasF = Object.keys(a).includes('_f');
      o.rLiveAfterRestore = G.liveStats(b, raw[1499].t, 72).dist === G.liveStats(a, raw[1499].t, 72).dist;
      for (const pt of raw.slice(1500)){ G.addPoint(a, pt); G.addPoint(b, pt); }
      const end = raw[raw.length - 1].t;
      G.endRun(a, end); G.endRun(b, end);
      o.rSame = JSON.stringify(G.summarize(a, 72, end, '2026-10-02')) === JSON.stringify(G.summarize(b, 72, end, '2026-10-02'));
      o.rLive = [a.live.dist, b.live.dist];
      o.rReplay = G.replayRun(JSON.parse(JSON.stringify(a))).live.dist;
    }
    // En vivo: pausa automática y estado del GPS.
    {
      const run = G.newRun('pie', T0, 'l1');
      for (const pt of TR.walk) G.addPoint(run, pt);
      const lastT = run.live.lastT;
      o.l5 = G.liveStats(run, lastT + 5000, 72);
      o.l11 = G.liveStats(run, lastT + 11000, 72);
      o.l16 = G.liveStats(run, lastT + 16000, 72);
      const last = TR.walk[TR.walk.length - 1];
      G.addPoint(run, Object.assign({}, last, { t: last.t + 1000, acc: 25 }));
      o.lWeak = G.liveStats(run, last.t + 2000, 72).gps;
      o.lNoKg = G.liveStats(run, last.t + 2000, null);
      o.lPoint = !!G.lastPoint(run) && G.isAccepted('ok') && !G.isAccepted('noise');
    }
    // Calorías
    o.met = [G.metFor('caminar', 5), G.metFor('caminar', 1), G.metFor('correr', 30), G.metFor('bici', 40), G.metFor('trotar', 8)];
    o.kWalk = G.kcalFor({ c: 'caminar', avgKmh: 5, movingS: 3600 }, 70);
    o.kRun = G.kcalFor({ c: 'correr', avgKmh: 10, movingS: 2700 }, 72);
    o.kBike = G.kcalFor({ c: 'bici', avgKmh: 20, movingS: 3600 }, 70);
    o.kNoKg = [G.kcalFor({ c: 'caminar', avgKmh: 5, movingS: 3600 }, null), G.kcalFor({ c: 'caminar', avgKmh: 5, movingS: 3600 }, 0)];
    // Sin peso cargado: 70 kg y aviso.
    {
      const run = G.newRun('pie', T0, 'k1');
      for (const pt of TR.walk) G.addPoint(run, pt);
      G.endRun(run, TR.walk[TR.walk.length - 1].t);
      const s = kg => G.summarize(run, kg, 0, '2026-10-02');
      o.kg = [s(null), s(0), s(72), s(G.lastWeight([]))].map(x => ({ kg: x.kg, def: x.kgDefault, kcal: x.kcal }));
    }
    o.lw = [G.lastWeight([{ date: '2026-09-20', kg: 72 }, { date: '2026-08-01', kg: 90 }]), G.lastWeight([]), G.lastWeight([{ date: '2026-09-01', kg: 0 }])];
    // Clasificación con histéresis
    const C = (v, prev) => G.classifySpeed(v, 'pie', prev);
    o.cls = [C(6.4), C(6.5), C(8.9), C(9), C(6.8, 'caminar'), C(6.9, 'caminar'), C(6.2, 'trotar'), C(6, 'trotar'), C(9.3, 'trotar'), C(9.4, 'trotar'),
      C(8.7, 'correr'), C(8.5, 'correr'), C(6, 'correr'), C(9.5, 'caminar'), G.classifySpeed(40, 'bici', 'caminar')];
    // Velocidad del momento: con la del GPS (Doppler) o por distancia / tiempo.
    {
      const fp = G.filterPoints(TR.doppler, 'pie');
      const sp = G.speedSeries(fp.pts, 'pie');
      const mid = (a, b) => { const v = fp.pts.map((q, i) => [q.t - T0, sp[i]]).filter(x => x[0] > a * 1000 && x[0] < b * 1000).map(x => x[1]); return v.reduce((s, x) => s + x, 0) / v.length; };
      o.spd = [sp.length === fp.pts.length, mid(100, 550), mid(700, 1150), sp[0]];
      const fw = G.filterPoints(TR.walk, 'pie'), sw = G.speedSeries(fw.pts, 'pie');
      o.spdWalk = sw.slice(50).reduce((s, x) => s + x, 0) / (sw.length - 50);
      o.unsorted = G.filterPoints(TR.walk.slice().reverse(), 'pie').dist === fw.dist;
    }
    // Tope de memoria
    {
      const pk = []; for (let i = 0; i < 9; i++) pk.push([i * 1000, 0, 0, 5, -1, 0]); for (let i = 9; i < 14; i++) pk.push([i * 1000, 0, 0, 5, -1, 1]);
      o.thin = G.thinPoints(pk).map(a => a[0] / 1000);
    }
    // Recorrido guardado: ida y vuelta, varias piezas, texto cortado.
    {
      const pcs = [[], []];
      for (let i = 0; i < 50; i++) pcs[0].push({ lat: -34.6 + i * 0.000123, lon: -58.4 - i * 0.0000871, t: i * 3 });
      for (let i = 0; i < 20; i++) pcs[1].push({ lat: -34.59 + Math.sin(i) * 0.001, lon: -58.39 + i * 0.0002, t: 400 + i * 2 });
      const enc = G.encodeTrack(pcs), dec = G.decodeTrack(enc);
      let err = 0, terr = 0;
      dec.forEach((pc, k) => pc.forEach((q, i) => { err = Math.max(err, G.haversine(q, pcs[k][i])); terr = Math.max(terr, Math.abs(q.t - pcs[k][i].t)); }));
      o.enc = { prefix: enc.slice(0, 2), spaces: enc.split(' ').length, pieces: dec.length, lens: dec.map(x => x.length), err, terr, ascii: /^1;[?-~ ]+$/.test(enc) };
      const cut = G.decodeTrack(enc.slice(0, enc.length - 7));
      o.cut = cut.map(x => x.length);
      o.bad = [G.decodeTrack('abc'), G.decodeTrack(null), G.decodeTrack('1;\u0001xyz'), G.decodeTrack('1;'), G.decodeTrack('1;' + enc.slice(2, 8))].map(x => x.length);
      o.pts = G.trackPoints(dec);
    }
    // El recorrido de la salida mezclada: cambios de tramo conservados, tiempos en orden.
    {
      const pcs = G.decodeTrack(S.mix.track), ts = pcs.flat().map(q => q.t);
      o.mixTrack = { pieces: pcs.length, n: ts.length, sorted: ts.every((x, i) => !i || x >= ts[i - 1]), last: ts[ts.length - 1],
        bounds: S.mix.rec.segments.map(s => [s.s, s.e]).flat().every(b => ts.some(x => Math.abs(x - b) <= 1)) };
      const sp = G.trackSpeeds(pcs), dom = G.colorDomain(sp, 'pie');
      o.colors = { lens: sp.map(x => x.length).join() === pcs.map(x => x.length).join(), dom, t0: G.speedT(dom[0] - 1, dom), t1: G.speedT(dom[1] + 1, dom), tm: G.speedT((dom[0] + dom[1]) / 2, dom) };
      o.domFlat = [G.colorDomain([[5, 5, 5, 5]], 'pie'), G.colorDomain([[20, 20, 20]], 'bici'), G.colorDomain([], 'pie')];
      const b = G.trackBounds(pcs);
      o.bounds = b && b.s < b.n && b.w < b.e;
    }
    // Recorrido enorme: se simplifica más hasta que entra en el tope.
    {
      const r = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
      const big = []; let lat = -34.6, lon = -58.4, cd = 0;
      for (let i = 0; i < 30000; i++){ const ang = r() * 6.283, d = 4 + r() * 8; lat += Math.cos(ang) * d / 111195; lon += Math.sin(ang) * d / 91500; cd += d; big.push({ lat, lon, t: T0 + i * 1000, cd, brk: i === 0 }); }
      const tr = G.trackOf(big, T0, []);
      o.big = { len: tr.track.length, max: G.MAX_TRACK_LEN, points: tr.points, dec: G.decodeTrack(tr.track).length };
      o.trackNull = [G.trackOf([], T0), G.trackOf([{ lat: 1, lon: 1, t: T0, cd: 0, brk: true }], T0)];
    }
    // Imagen para compartir: sin nada a menos de 200 m (en línea recta) del inicio ni del final.
    {
      const line = n => [Array.from({ length: n + 1 }, (_, i) => ({ lat: -34.6 + i * 10 / 111195, lon: -58.4, t: i * 4 }))];
      const P = (x, y, t) => ({ lat: -34.6 + y / 111195.08, lon: -58.4 + x / (111195.08 * Math.cos(34.6 * Math.PI / 180)), t });
      const minD = (pcs, z) => Math.min(...pcs.flat().map(p => G.haversine(p, z)));
      const t1 = G.trimTrack(line(100));
      // Una vuelta a la manzana (50 × 50 m) y después 1 km derecho.
      const loop = [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]].map(([x, y], i) => P(x, y, i * 10));
      for (let y = 60; y <= 1000; y += 20) loop.push(P(0, y, loop.length * 10));
      const tl = G.trimTrack([loop]);
      // Sale para el este, vuelve por una paralela que pasa a 100 m de casa y termina 1 km al norte.
      const mid = [P(0, 0, 0), P(1000, 0, 100), P(1000, 100, 110), P(-1000, 100, 310), P(-1000, 1100, 410)];
      const tm = G.trimTrack([mid]);
      o.trim = { len: G.trackLength(t1), start: G.haversine(t1[0][0], line(100)[0][0]), t: t1[0][0].t, short400: G.trimTrack(line(40)), short300: G.trimTrack(line(30)),
        loopN: tl.length, loopHome: minD(tl, loop[0]), loopEnd: minD(tl, loop[loop.length - 1]), loopFirst: G.haversine(tl[0][0], loop[0]),
        midN: tm.length, midHome: minD(tm, mid[0]), midEnd: minD(tm, mid[4]), zero: G.trimTrack(line(100), 0).length, empty: G.trimTrack([], 200) };
      o.simple = G.simplifyLine(line(100)[0], 2).length;
    }
    // Mini mapa en vivo (livePath): lo mismo que filtrar todo de nuevo, también después de
    // recuperar la salida; en una salida larga, con tope y repartido parejo.
    {
      const run = G.newRun('pie', T0, 'lp');
      for (const pt of TR.gap) G.addPoint(run, pt);
      const lp = G.livePath(run), { pts } = G.filterPoints(run.pts.map(a => G.unpackPoint(a, run.start)), 'pie');
      const again = []; let cur = null;
      for (const p of pts){ if (!cur || p.brk || p.hole){ cur = []; again.push(cur); } cur.push({ lat: p.lat, lon: p.lon, t: (p.t - run.start) / 1000 }); }
      const big = G.newRun('pie', T0, 'lp2');
      for (let i = 0; i < 12000; i++) G.addPoint(big, { lat: -34.6 + i * 3.4 / 111195, lon: -58.4, acc: 5, spd: null, t: T0 + (i + 1) * 1000 });
      const flat = G.livePath(big).flat(), gaps = [];
      for (let i = 2; i < flat.length - 1; i++) gaps.push(flat[i].t - flat[i - 1].t); // el primero: lo que tarda en confirmar que se mueve
      o.lp = { same: JSON.stringify(lp) === JSON.stringify(again), pieces: lp.length, restored: JSON.stringify(G.livePath(JSON.parse(JSON.stringify(run)))) === JSON.stringify(lp),
        n: flat.length, last: flat[flat.length - 1].t, now: (G.lastPoint(big).t - T0) / 1000, gapMin: Math.min(...gaps), gapMax: Math.max(...gaps), max: G.LIVE_PATH_MAX };
    }
    // Textos
    o.txt = [G.fmtHMS(2693000), G.fmtClock(2693000), G.fmtClock(3912000), G.fmtPace(375), G.fmtPace(0), G.fmtKm(7180), G.fmtKmh(18.44),
      G.paceOrSpeed({ mode: 'pie', dist: 7180, moving: 2693, dur: 2800 }), G.paceOrSpeed({ mode: 'bici', avg: 18.44, dist: 1, dur: 1 }),
      G.modeLabel('pie'), G.modeLabel('bici'), G.modeLabel('x'), G.classLabel('trotar'), G.classLabel('bici')];
    o.bd = [G.breakdownText({ caminar: 1200, trotar: 900, correr: 600 }), G.breakdownText({ caminar: 3900, trotar: 1200 }), G.breakdownText({ bici: 2700 }),
      G.breakdownText({}), G.breakdownText({ caminar: 20 }), G.breakdownText({ correr: 3600 }), G.breakdownText({ trotar: 600, caminar: 300 })];
    o.src = await (await fetch('/app/core/cardiogps.js')).text();
    o.short = [G.isShort(S.short.rec), G.isShort(S.walk.rec), G.isShort(null)];
    return o;
  }, [TRACKS, T0]);

  const S = r.S, W = 1800 * 5 / 3.6;
  // ---- Básicos ----
  t.ok(near(r.deg, 111195, 60), 'haversine: 1° de latitud ≈ 111,2 km: ' + r.deg);
  t.ok(near(r.ba, 52600, 1500), 'haversine: Obelisco → La Plata ≈ 52,6 km: ' + r.ba);
  t.eq(r.pack, [1234, -34603700, -58381600, 5, 139, 2], 'punto empaquetado para guardar');
  t.eq(r.unpack, { t: T0 + 1234, lat: -34.6037, lon: -58.3816, acc: 5, spd: 1.39, seg: 2 }, 'punto desempaquetado');
  t.eq(r.packNoSpd[4], -1, 'sin velocidad del GPS (o negativa, la de iPhone sin dato) se guarda -1');
  t.eq(r.clk, [T0 - 5000, T0 + 600, T0 - 300000, T0 + 3000, T0 + 4000, T0 + 4600, T0 + 5600], 'hora del punto: la del GPS (también la de uno que llega 5 min tarde); sin hora o del futuro, la del celular, y se recupera');
  t.eq(r.clkSkew, [T0 + 120500, T0 + 121200, T0 + 122200], 'reloj del celular 2 min corrido: la hora del GPS más la diferencia (la menor)');
  t.eq(r.clkBefore, T0 + 500, 'un punto de antes de empezar: la hora del celular');
  t.ok(near(r.late.b[0], r.late.a[0], r.late.a[0] * 0.01) && near(r.late.b[1], r.late.a[1], 10) && r.late.b[2] === 0 && r.late.a[0] > 1150,
    'puntos que llegan tarde en tanda (5 min juntos): suman igual, sin corte de GPS: ' + JSON.stringify(r.late));

  // ---- Filtro ----
  t.eq(r.f, ['bad', 'acc', 'acc', 'acc', 'first', 'dup', 'noise'], 'filtro: coordenadas rotas, precisión de 31 m, sin precisión, primer punto con 25 m (espera 20 s), después lo toma, hora repetida, temblor de 1 m');
  t.eq(r.fDist, 0, 'filtro: nada de eso suma distancia');

  // ---- Caminata pareja: 30 min a 5 km/h ----
  const w = S.walk.rec;
  t.ok(near(w.dist, W, W * 0.03), 'caminata: distancia ≈ 2,5 km (±3 %): ' + w.dist);
  t.ok(near(w.moving, 1800, 10), 'caminata: 30 min en movimiento: ' + w.moving);
  t.eq(Object.keys(w.breakdown), ['caminar'], 'caminata: todo caminando');
  t.eq(S.walk.txt, '30 min caminando', 'caminata: desglose');
  t.ok(near(w.kcal, 3.7 * 72 * 0.5, 133 * 0.05), 'caminata: kcal ≈ 3,7 MET × 72 kg × 0,5 h = 133: ' + w.kcal);
  t.ok(/^1[12]:\d\d \/km$/.test(S.walk.pace), 'caminata: ritmo ≈ 12:00 /km: ' + S.walk.pace);
  t.ok(w.splits.length === 3 && w.splits[0][0] === 1000 && near(w.splits[0][1], 720, 20) && near(w.splits[2][0], W - 2000, 80), 'caminata: parciales por km: ' + JSON.stringify(w.splits));
  t.ok(w.max >= w.avg && w.max < 7, 'caminata: velocidad máxima razonable (≥ la media, < 7 km/h): ' + w.max + ' / ' + w.avg);
  t.eq(w.segments.length, 1, 'caminata: un solo tramo');
  t.ok(!/lat|lon/i.test(JSON.stringify(w)) && !/-34\.|-58\./.test(JSON.stringify(w)), 'el resumen no lleva coordenadas: ' + JSON.stringify(w).slice(0, 200));
  t.ok(w.mode === 'pie' && w.date === '2026-10-02' && w.startedAt === '2026-10-02T09:00:00.000Z' && w.dur === 1800 && w.id === 'id-pie', 'resumen: modo, fecha, inicio, duración e id');

  // ---- Caminar 20 min → trotar 15 → correr 10 ----
  const m = S.mix.rec;
  t.ok(near(m.breakdown.caminar, 1200, 60) && near(m.breakdown.trotar, 900, 60) && near(m.breakdown.correr, 600, 60), 'mezcla: desglose ±60 s: ' + JSON.stringify(m.breakdown));
  t.eq(S.mix.txt, '20 min caminando · 15 trotando · 10 corriendo', 'mezcla: texto del desglose');
  t.eq(m.segments.map(s => s.c), ['caminar', 'trotar', 'correr'], 'mezcla: tres tramos en orden');
  const mixKcal = (3.7 * 1200 + 8.3 * 900 + 10.7 * 600) * 72 / 3600;
  t.ok(near(m.kcal, mixKcal, mixKcal * 0.05), 'mezcla: kcal por tramo (MET × peso × tiempo) ≈ ' + Math.round(mixKcal) + ': ' + m.kcal);
  t.ok(near(m.kcal, m.segments.reduce((a, s) => a + s.k, 0), 1), 'mezcla: las kcal son la suma de los tramos');
  t.ok(near(m.dist, 5500, 5500 * 0.03) && near(m.moving, 2700, 10), 'mezcla: distancia ≈ 5,5 km y 45 min en movimiento: ' + m.dist + ' / ' + m.moving);
  t.ok(m.segments.every(s => s.e > s.s && s.m > 0 && s.d > 0) && near(m.segments[1].s, 1200, 30) && near(m.segments[2].s, 2100, 30), 'mezcla: inicio y fin de cada tramo: ' + JSON.stringify(m.segments));
  t.eq(m.splits.length, 6, 'mezcla: 5 km + el pedazo final');
  t.ok(m.splits[0][1] > m.splits[4][1] + 200, 'mezcla: el km caminando tarda más que el km corriendo: ' + JSON.stringify(m.splits));
  t.eq(Math.round(S.mix.live.dist), m.dist, 'en vivo y al final, la misma distancia');
  t.ok(near(S.mix.live.movingMs / 1000, m.moving, 1), 'en vivo y al final, el mismo tiempo en movimiento');
  t.eq(S.mix.live.cls, 'correr', 'en vivo: el tramo actual es «correr»');
  t.ok(near(S.mix.liveEnd.kcal, m.kcal, m.kcal * 0.08), 'en vivo: kcal parecidas a las del final: ' + S.mix.liveEnd.kcal + ' / ' + m.kcal);

  // ---- GPS quieto que tiembla ±5 m durante 10 min ----
  t.ok(S.still.rec.dist < 15 && S.still.rec.moving < 15, 'quieto con temblor de ±5 m: casi nada de distancia ni de tiempo en movimiento: ' + S.still.rec.dist + ' m, ' + S.still.rec.moving + ' s');
  t.eq(S.still.txt, 'Menos de 1 min en movimiento', 'quieto: desglose');

  // ---- Picos y saltos ----
  t.eq(r.spikeWhy, 'jump', 'pico suelto de 200 m: se descarta como salto');
  t.ok(near(S.spike.rec.dist, S.nospike.rec.dist, 2), 'pico suelto: no suma (' + S.spike.rec.dist + ' vs ' + S.nospike.rec.dist + ' m)');
  t.eq(S.badFirst.whys.slice(0, 4), ['first', 'jump', 'jump', 'anchor'], 'primer punto malo: 3 saltos coherentes y se toma la referencia nueva');
  t.ok(near(S.badFirst.rec.dist, 600 * 5 / 3.6, 25), 'primer punto malo: no suma los 300 m del salto: ' + S.badFirst.rec.dist);
  t.ok(r.shiftWhys.filter(x => x === 'jump').length === 2 && r.shiftWhys.includes('anchor'), 'GPS corrido 300 m a mitad de camino: 2 saltos y re-anclaje: ' + r.shiftWhys);
  t.ok(near(S.shift.rec.dist, 600 * 5 / 3.6, 25) && S.shift.pieces === 2, 'GPS corrido: no suma el salto y el dibujo queda en 2 piezas: ' + S.shift.rec.dist + ' m, ' + S.shift.pieces);
  t.ok(near(S.zigzag.rec.dist, W, W * 0.04), 'GPS que zigzaguea ±3 m: la distancia no se infla: ' + S.zigzag.rec.dist + ' (de ' + Math.round(W) + ')');

  // ---- Corte de señal de 3 min (caminando): se suma en línea recta ----
  t.eq(S.gap.rec.gap, 0, 'corte de 3 min caminando: se cuenta (no queda como corte sin sumar)');
  t.eq(S.gap.pieces, 2, 'corte: el dibujo queda en 2 piezas (el hueco va gris de puntos, no de color)');
  t.ok(near(S.gap.rec.dist, 780 * 5 / 3.6, 25) && near(S.gap.rec.moving, 780, 10), 'corte: suma la distancia en línea recta y el tiempo en movimiento: ' + S.gap.rec.dist + ' m, ' + S.gap.rec.moving + ' s');
  t.ok(near(S.gap.liveEnd.dist, S.gap.rec.dist, 2) && near(S.gap.liveEnd.movingMs / 1000, S.gap.rec.moving, 2), 'corte: en vivo, lo mismo: ' + Math.round(S.gap.liveEnd.dist) + ' m, ' + Math.round(S.gap.liveEnd.movingMs / 1000) + ' s');
  t.eq(Object.keys(S.gap.rec.breakdown), ['caminar'], 'corte: todo caminando');
  // Pantalla bloqueada 20 s y el primer dato flojo: se espera uno bueno y se suma.
  t.eq(r.holeWhy, 'acc', 'al volver de la pantalla bloqueada, el primer dato flojo (28 m) no suma');
  t.ok(near(S.hole.rec.dist, 621 * 5 / 3.6, 20) && near(S.hole.rec.moving, 621, 6) && S.hole.rec.gap === 0 && S.hole.pieces === 2, 'pantalla bloqueada 20 s: suma lo caminado, en movimiento, y el dibujo en 2 piezas: ' + JSON.stringify([S.hole.rec.dist, S.hole.rec.moving, S.hole.rec.gap, S.hole.pieces]));
  // Más de 30 min, o más rápido de lo que se cree a pie: como antes, no suma.
  t.ok(near(S.gapLong.rec.gap, 2000, 3) && near(S.gapLong.rec.dist, 600 * 5 / 3.6, 25) && near(S.gapLong.rec.moving, 600, 10), 'corte de 33 min: no suma lo que no se vio: ' + JSON.stringify([S.gapLong.rec.gap, S.gapLong.rec.dist, S.gapLong.rec.moving]));
  t.ok(near(S.gapBus.rec.gap, 300, 3) && near(S.gapBus.rec.dist, 600 * 5 / 3.6, 25) && near(S.gapBus.rec.moving, 600, 10), 'corte a 20 km/h a pie (colectivo): no suma: ' + JSON.stringify([S.gapBus.rec.gap, S.gapBus.rec.dist, S.gapBus.rec.moving]));
  t.ok(S.gapFast.rec.gap === 0 && near(S.gapFast.rec.dist, 600 * 5 / 3.6 + 120 * 11 / 3.6, 25) && near(S.gapFast.rec.moving, 720, 10), 'corte a 11 km/h: se suma: ' + JSON.stringify([S.gapFast.rec.gap, S.gapFast.rec.dist, S.gapFast.rec.moving]));
  t.eq(Object.keys(S.gapFast.rec.breakdown), ['caminar'], 'corte a 11 km/h: no inventa un tramo «corriendo» (sigue el tipo que venía): ' + JSON.stringify(S.gapFast.rec.breakdown));
  t.ok(S.gapFast.rec.max < 7, 'corte a 11 km/h: la velocidad máxima no sale del hueco: ' + S.gapFast.rec.max);

  // ---- Semáforo: 2 min parado ----
  t.ok(near(S.light.rec.moving, 600, 20) && S.light.rec.dur === 720, 'semáforo de 2 min (con temblor): en movimiento sin esos 120 s: ' + S.light.rec.moving + ' de ' + S.light.rec.dur);
  t.ok(near(S.lightSilent.rec.moving, 600, 20) && S.lightSilent.rec.gap === 0, 'semáforo de 2,5 min sin puntos (GPS nativo): parado, no es un corte: ' + S.lightSilent.rec.moving + ' s, gap ' + S.lightSilent.rec.gap);
  t.ok(near(S.light.rec.avg, 5, 0.4), 'semáforo: la velocidad media es la de la caminata: ' + S.light.rec.avg);

  // ---- Tramos: histéresis y duración mínima ----
  t.eq(S.osc.rec.segments.length, 1, 'velocidad que oscila 6,3 ↔ 6,7 km/h: un solo tramo');
  t.ok(!('correr' in S.sprint.rec.breakdown) && !S.sprint.rec.segments.some(s => s.c === 'correr'), 'pique de 30 s en una caminata: no aparece «corriendo»: ' + JSON.stringify(S.sprint.rec.breakdown));
  t.eq(S.sprint.txt, '10 min caminando', 'pique de 30 s: todo caminando');
  t.eq(r.cls, ['caminar', 'trotar', 'trotar', 'correr', 'caminar', 'trotar', 'trotar', 'caminar', 'trotar', 'correr', 'correr', 'trotar', 'caminar', 'correr', 'bici'], 'clasificación por velocidad con histéresis ±0,4 km/h');

  // ---- Calorías ----
  t.eq(r.met.map(x => Math.round(x * 100) / 100), [3.7, 2, 23, 15.8, 8.3], 'MET por tipo y velocidad (interpolado, con tope en las puntas)');
  t.ok(near(r.kWalk, 259, 0.5), 'kcal: 1 h a 5 km/h con 70 kg = 259: ' + r.kWalk);
  t.ok(near(r.kRun, 539, 1), 'kcal: 45 min a 10 km/h con 72 kg ≈ 539: ' + r.kRun);
  t.ok(near(r.kBike, 536, 1), 'kcal: bici 1 h a 20 km/h con 70 kg ≈ 536: ' + r.kBike);
  t.eq(r.kNoKg.map(Math.round), [259, 259], 'kcal sin peso: 70 kg');
  t.eq(r.kg.map(x => [x.kg, x.def]), [[70, true], [70, true], [72, false], [70, true]], 'sin peso cargado: 70 kg y aviso (kgDefault)');
  t.ok(near(r.kg[2].kcal, r.kg[0].kcal * 72 / 70, 1), 'kcal proporcionales al peso: ' + r.kg.map(x => x.kcal));
  t.eq(r.lw, [72, null, null], 'peso: el último registrado');

  // ---- Parciales: 6:00 /km parejo durante 5,2 km ----
  const sp = S.splits.rec.splits;
  t.ok(sp.length === 6 && sp.slice(0, 5).every(x => x[0] === 1000 && near(x[1], 360, 1)), 'parciales a 6:00 /km: 5 × 360 s: ' + JSON.stringify(sp));
  t.ok(sp[5] && near(sp[5][0], 200, 6) && near(sp[5][1], 72, 3), 'parciales: el pedazo final ≈ [200 m, 72 s]: ' + JSON.stringify(sp[5]));

  // ---- Bici ----
  const b = S.bike.rec;
  t.eq(Object.keys(b.breakdown), ['bici'], 'bici: todo «en bici»: ' + JSON.stringify(b.breakdown));
  t.ok(b.segments.every(s => s.c === 'bici'), 'bici: tramos en bici');
  t.ok(b.splits.length >= 2 && b.splits[0][0] === 5000 && near(b.splits[0][1], 900, 15), 'bici: parciales cada 5 km: ' + JSON.stringify(b.splits));
  t.ok(b.max > 40 && b.max <= 70, 'bici: 45 km/h en bajada no es un salto del GPS: ' + b.max);
  t.ok(/^\d+ min en bici$/.test(S.bike.txt), 'bici: desglose «… min en bici»: ' + S.bike.txt);
  t.ok(/^\d+,\d km\/h$/.test(S.bike.pace), 'bici: velocidad en vez de ritmo: ' + S.bike.pace);
  t.ok(b.gap === 0 && near(b.moving, 2160, 15), 'bici: 1 min parado sin puntos no es un corte ni suma movimiento: ' + b.moving + ' s, gap ' + b.gap);

  // ---- Velocidad del momento ----
  t.ok(r.spd[0] && near(r.spd[1], 5, 0.6) && near(r.spd[2], 10, 0.8) && r.spd[3] === 0, 'velocidad del momento con la del GPS (Doppler): ' + r.spd);
  t.ok(near(r.spdWalk, 5, 0.6), 'velocidad del momento por distancia / tiempo: ' + r.spdWalk);
  t.ok(r.unsorted, 'puntos desordenados: se ordenan por hora');
  t.eq(S.doppler.rec.segments.map(s => s.c), ['caminar', 'correr'], 'a 10 km/h es «corriendo»');

  // ---- Salida corta, vacía ----
  const sh = S.short.rec;
  t.ok(sh.dur === 40 && sh.dist < 30 && sh.kcal >= 0 && Array.isArray(sh.splits) && sh.splits.length === 0, 'salida corta con ruido: resumen sin errores: ' + JSON.stringify(sh));
  t.eq(r.short, [true, false, true], 'salida corta: se avisa (isShort)');
  t.ok(S.short.trackLen === 0 || S.short.pieces >= 0, 'salida corta: sin recorrido o uno chico');
  t.ok(r.trackNull[0] === null && r.trackNull[1] === null, 'sin puntos no hay recorrido para guardar');

  // ---- En vivo ----
  t.eq(r.v, ['acc', 'acc'], 'en vivo: 31 m y el primero con 25 m no sirven');
  t.eq(r.vStored, 1, 'en vivo: se guarda el de 25 m (cuenta para la espera), no el de 31 m');
  t.eq([r.vPaused, r.vLate, r.vAfter, r.vSeg], ['paused', 'paused', 'first', 1], 'pausa manual: no suma en pausa, ni lo que llega tarde; al seguir, pieza nueva');
  t.eq([r.vPausedStats.gps, r.vPausedStats.kmh, r.vPausedStats.el], ['off', 0, 121000], 'en pausa: GPS apagado, velocidad 0 y el reloj quieto');
  t.eq(r.vElapsed, 241000, 'duración por reloj, sin la pausa');
  t.eq(r.vEndElapsed, 242000, 'terminar estando en pausa: la duración queda en la de la pausa');
  t.eq(r.vSegs, [0, 1], 'los puntos guardados saben de qué pieza son');
  t.ok(near(r.vRec.dist, 239 * 1.389, 15) && r.vLiveDist < 400, 'pausa: no suma los 150 m que se movió en pausa: ' + r.vRec.dist);
  t.eq(r.vPieces, 2, 'pausa: el recorrido queda en 2 piezas');
  t.eq(r.vJson, false, 'el filtro en vivo no se guarda con la salida');
  t.eq(r.rHasF, false, 'el filtro en vivo no es enumerable');
  t.ok(r.rLiveAfterRestore, 'recuperada del celular: los números en vivo se rearman igual');
  t.ok(r.rSame && r.rLive[0] === r.rLive[1] && r.rReplay === r.rLive[0], 'recuperada a mitad de camino: termina exactamente igual que sin cortar');
  t.ok(!r.l5.autoPaused && r.l5.gps === 'ok' && near(r.l5.kmh, 5, 1) && r.l5.cls === 'caminar' && near(r.l5.paceSKm, 720, 30), 'en vivo: velocidad, ritmo y tramo: ' + JSON.stringify(r.l5));
  t.ok(near(r.l5.kcal, w.kcal, w.kcal * 0.08) && near(r.l5.curPaceSKm, 720, 150) && r.l5.elapsedMs > 0, 'en vivo: kcal y ritmo del momento');
  t.ok(r.l11.autoPaused && r.l11.kmh === 0, 'en vivo: más de 10 s sin moverse → pausa automática');
  t.eq(r.l16.gps, 'buscando', 'en vivo: 15 s sin puntos → buscando señal');
  t.eq(r.lWeak, 'debil', 'en vivo: precisión peor que 20 m → señal débil');
  t.ok(r.lNoKg.kgDefault && near(r.lNoKg.kcal, r.l5.kcal * 70 / 72, 2), 'en vivo sin peso: 70 kg');
  t.ok(r.lPoint, 'último punto aceptado e isAccepted');

  // ---- Recorrido guardado ----
  t.eq([r.enc.prefix, r.enc.spaces, r.enc.pieces, r.enc.lens], ['1;', 2, 2, [50, 20]], 'recorrido: «1;» y 2 piezas separadas por un espacio');
  t.ok(r.enc.err <= 1.2 && r.enc.terr <= 1 && r.enc.ascii, 'recorrido: ida y vuelta con ≤ 1,2 m y ≤ 1 s: ' + r.enc.err + ' m, ' + r.enc.terr + ' s');
  t.ok(r.cut.length >= 1 && r.cut[0] === 50 && (r.cut.length === 1 || r.cut[1] < 20), 'recorrido cortado: se queda con lo que había: ' + r.cut);
  t.eq(r.bad, [0, 0, 0, 0, 0], 'recorrido sin versión, vacío o roto: nada');
  t.eq(r.pts, 70, 'puntos del recorrido');
  t.ok(r.mixTrack.pieces === 1 && r.mixTrack.sorted && near(r.mixTrack.last, 2700, 3) && r.mixTrack.n > 10, 'recorrido de la salida: una pieza con los tiempos en orden: ' + JSON.stringify(r.mixTrack));
  t.ok(r.mixTrack.bounds, 'recorrido: conserva los puntos donde cambia el tramo');
  t.ok(S.mix.trackLen > 20 && S.mix.trackLen <= 20000 && S.walk.trackLen <= 12000, 'recorrido de 45 min: chico (' + S.mix.trackLen + ' caracteres)');
  t.ok(S.mix.rec.points > 1 && S.mix.rec.points < 2000, 'resumen: cantidad de puntos del recorrido: ' + S.mix.rec.points);
  t.ok(r.big.len <= r.big.max && r.big.points > 100 && r.big.dec === 1, 'recorrido enorme: se simplifica hasta entrar en 200.000 caracteres: ' + JSON.stringify(r.big));
  t.eq(r.thin, [0, 2, 4, 6, 8, 9, 10, 12, 13], 'tope de memoria: uno de cada dos, sin perder las puntas de cada pieza');

  // ---- Colores por velocidad ----
  t.ok(r.colors.lens && r.colors.dom[0] < 6.5 && r.colors.dom[1] > 9.5, 'colores: rango de velocidades de la mezcla: ' + r.colors.dom);
  t.eq([r.colors.t0, r.colors.t1, Math.round(r.colors.tm * 10) / 10], [0, 1, 0.5], 'colores: 0 lento (frío), 1 rápido (intenso)');
  t.eq(r.domFlat, [[3.5, 6.5], [16, 24], [0, 3]], 'colores: velocidad pareja → rango mínimo (3 km/h a pie, 8 en bici)');
  t.ok(r.bounds, 'límites del recorrido');

  // ---- Imagen para compartir ----
  const tr = r.trim;
  t.ok(near(tr.len, 600, 2) && near(tr.start, 200, 0.5) && near(tr.t, 80, 0.5), 'una recta de 1 km: sin los 200 m de cada punta (el corte en el borde): ' + JSON.stringify([tr.len, tr.start, tr.t]));
  t.eq([tr.short400, tr.short300], [[], []], 'una salida de 400 m o menos: no queda nada que mostrar (sin el tope de un cuarto de antes)');
  t.ok(tr.loopN === 1 && tr.loopHome >= 199.5 && tr.loopEnd >= 199.5 && tr.loopFirst >= 199.5, 'una vuelta a la manzana antes de irse: el principio visible queda a 200 m de casa: ' + JSON.stringify([tr.loopN, tr.loopHome, tr.loopFirst]));
  t.ok(tr.midN === 2 && tr.midHome >= 199.5 && tr.midEnd >= 199.5, 'si vuelve a pasar cerca de casa en el medio, ese pedazo también se oculta (la pieza se parte): ' + JSON.stringify([tr.midN, tr.midHome, tr.midEnd]));
  t.eq([tr.zero, tr.empty], [1, []], 'con 0 m no se oculta nada; sin recorrido, nada');
  const lp = r.lp;
  t.ok(lp.same && lp.pieces === 2 && lp.restored, 'mini mapa en vivo: lo mismo que filtrar todo de nuevo (con el corte de señal), también al recuperar: ' + JSON.stringify(lp));
  t.ok(lp.n <= lp.max + 1 && lp.n >= lp.max / 2 && lp.last === lp.now && lp.gapMax <= 2 * lp.gapMin, 'mini mapa en una salida larga: con tope, parejo y hasta dónde está ahora: ' + JSON.stringify(lp));
  t.eq(r.simple, 2, 'una recta se simplifica a sus 2 puntas');

  // ---- Textos ----
  t.eq(r.txt, ['00:44:53', '44:53', '1:05:12', '6:15', '–:–', '7,18', '18,4', '6:15 /km', '18,4 km/h', 'A pie', 'En bici', 'A pie', 'Trotando', 'En bici'], 'textos con coma');
  t.eq(r.bd, ['20 min caminando · 15 trotando · 10 corriendo', '1 h 5 min caminando · 20 min trotando', '45 min en bici', 'Menos de 1 min en movimiento',
    'Menos de 1 min en movimiento', '1 h corriendo', '5 min caminando · 10 trotando'], 'desglose en texto');
  t.ok(!/\ba bici\b/i.test(r.src), 'nunca «a bici»');
  t.ok(!/^import |Date\.now\(\)|document\.|window\./m.test(r.src), 'el motor es puro: sin imports, sin reloj y sin pantalla');

  t.eq(pg.errs, [], 'errores de la página');
  await pg.close();
}
