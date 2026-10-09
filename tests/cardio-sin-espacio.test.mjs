// Cardio: guardar una salida terminada con el celular lleno (localStorage sin lugar).
// a) La cola de envío no tiene lugar hasta que se borran las partes guardadas de la salida en
//    curso: se borran (los puntos siguen en memoria), la salida entra en la cola, llega a la nube
//    y queda en «Tus salidas». Antes la cola tragaba el error, se borraba la salida en curso y la
//    salida no subía nunca.
// b) Ni así entra: no se borra nada. saveEnded devuelve null y avisa; la salida sigue terminada
//    (en memoria y guardada en el celular) y, con lugar, «Guardar» de nuevo la guarda.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const ID = n => '5a1d0000-0000-4000-8000-00000000000' + n;

// Una salida terminada armada con el motor (un punto por segundo) y puesta como la salida de
// ui/gps.js, con todas sus partes guardadas como si la hubiera medido.
const endedRun = (p, id, legs) => p.evaluate(async ([id, legs, uid]) => {
  const g = await import('/app/ui/gps.js'), m = await import('/app/core/cardiogps.js');
  const t0 = Date.now() - 3600000, run = m.newRun('pie', t0, id);
  run.uid = uid;
  let lat = -34.6, t = t0;
  for (const [kmh, n] of legs) for (let i = 0; i < n; i++){ t += 1000; lat += kmh / 3.6 / 111195; m.addPoint(run, { lat, lon: -58.4, acc: 5, spd: null, t }); }
  m.endRun(run, t + 1000);
  g.GpsState.run = run;
  const chunks = Math.ceil(run.pts.length / 400);
  for (let k = 0; k < chunks; k++) localStorage.setItem('gize_salida_v1_c' + k, JSON.stringify(run.pts.slice(k * 400, (k + 1) * 400)));
  localStorage.setItem('gize_salida_v1', JSON.stringify({ v: 1, id, status: 'ended', chunks }));
}, [id, legs, ALUMNO.id]);

// localStorage con tope: __cap (caracteres en total) y __deny (una clave que nunca entra).
const LLENO = () => {
  const real = Storage.prototype.setItem;
  const size = (s, skip) => { let n = 0; for (let i = 0; i < s.length; i++){ const k = s.key(i); if (k !== skip) n += k.length + (s.getItem(k) || '').length; } return n; };
  window.__cap = Infinity; window.__deny = null; window.__used = () => size(localStorage);
  Storage.prototype.setItem = function (k, v){
    if (this === localStorage && (k === window.__deny || size(this, k) + k.length + String(v).length > window.__cap)) throw new DOMException('Sin lugar', 'QuotaExceededError');
    return real.call(this, k, v);
  };
};

const saveEnded = p => p.evaluate(async () => { const r = (await import('/app/core/salidas.js')).saveEnded(); return r ? r.id : null; });
const runKeys = p => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('gize_salida_v1')).sort());
const appRun = p => p.evaluate(async () => { const r = (await import('/app/ui/gps.js')).GpsState.run; return r ? { id: r.id, status: r.status } : null; });
const salidas = p => p.evaluate(async () => ((await import('/app/core/state.js')).state.salidas || []).map(s => s.id));

export default async function ({ base, t }){
  const posts = [];
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: {
    '/profiles': profile('client'),
    '/cardio_outings': (r, J, i) => { if (i.m === 'POST'){ posts.push(i.body || ''); return J([], 201); } return J(i.one ? null : []); },
  } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.evaluate(LLENO);

  // ===== a) Entra al borrar las partes de la salida en curso =====
  await endedRun(p, ID(1), [[5, 1200], [8, 900], [11, 600]]);
  const partes = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('gize_salida_v1')).reduce((n, k) => n + localStorage.getItem(k).length, 0));
  // Casi sin lugar: entra algo chico, pero ni el recorrido ni la salida en la cola.
  await p.evaluate(() => { window.__cap = window.__used() + 300; });
  t.eq(await saveEnded(p), ID(1), 'a) con el celular lleno, la salida se guarda igual (partes de la salida en curso: ' + partes + ' caracteres)');
  await wait(1500);
  t.ok(posts.some(b => b.includes(ID(1))), 'a) la salida entra en la cola y llega a la nube');
  t.eq(await salidas(p), [ID(1)], 'a) queda en «Tus salidas»');
  t.eq(await runKeys(p), [], 'a) la salida en curso se borra (ya está a salvo)');
  t.eq(await appRun(p), null, 'a) y ya no hay salida en curso');
  t.ok(!dialogs.some(d => /espacio/.test(d)), 'a) sin aviso de espacio');

  // ===== b) Ni así entra: no se borra nada =====
  await p.evaluate(() => { window.__cap = Infinity; window.__deny = 'core_outbox_v1'; });
  await endedRun(p, ID(2), [[5, 300], [8, 300]]);
  const antes = await runKeys(p);
  t.eq(await saveEnded(p), null, 'b) sin lugar en la cola: saveEnded devuelve null');
  t.ok(dialogs.some(d => /No hay espacio en el celular para guardar la salida/.test(d) && /tocá «Guardar» de nuevo/.test(d)), 'b) avisa que no hay espacio: ' + JSON.stringify(dialogs));
  t.eq(await appRun(p), { id: ID(2), status: 'ended' }, 'b) la salida sigue terminada en memoria');
  t.eq(await runKeys(p), antes, 'b) y guardada en el celular (al cerrar la app no se pierde)');
  t.eq(await salidas(p), [ID(1)], 'b) no aparece en «Tus salidas» sin estar a salvo');
  // Con lugar, «Guardar» de nuevo.
  await p.evaluate(() => { window.__deny = null; });
  t.eq(await saveEnded(p), ID(2), 'b) con lugar, se guarda');
  await wait(1500);
  t.ok(posts.some(b => b.includes(ID(2))), 'b) y llega a la nube');
  t.eq((await salidas(p)).sort(), [ID(1), ID(2)], 'b) las dos en «Tus salidas»');
  t.eq(await runKeys(p), [], 'b) la salida en curso se borra');

  t.eq(errs, [], 'errores de la página');
  await close();
}
