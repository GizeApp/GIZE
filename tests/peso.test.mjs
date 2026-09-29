// Peso corporal: la fecha del formulario se renueva si la app quedó abierta de un día para
// otro (no se pisa el peso de ayer), los pesos van con coma («80,7 kg», «▼ 0,8 kg») y en
// pantallas de menos de 360 px la fecha va sola en su fila (se veía «28/09/» sin el año).
import { newPage, saved, wait, text, ALUMNO, profile } from './lib.mjs';

// Reloj falso: arranca en startIso y se mueve con window.__setNow(ms).
const clock = startIso => `(() => {
  const R = Date; let o = Number(sessionStorage.getItem('dateOff') || 'NaN');
  if (isNaN(o)) { o = R.parse(${JSON.stringify(startIso)}) - R.now(); sessionStorage.setItem('dateOff', String(o)); }
  window.__setNow = t => { o = t - R.now(); sessionStorage.setItem('dateOff', String(o)); };
  function D(...a){ if (!(this instanceof D)) return new R(R.now() + o).toString(); return a.length ? new R(...a) : new R(R.now() + o); }
  D.prototype = R.prototype; D.now = () => R.now() + o; D.parse = R.parse; D.UTC = R.UTC;
  window.Date = D;
})();`;
// Con el reloj movido, la sesión simulada puede estar vencida: la renovación responde otra.
const token = (r, J) => J({ access_token: 'x.eyJzdWIiOiJ1MyJ9.y', token_type: 'bearer', expires_in: 3600 * 24 * 400,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 400, refresh_token: 'r', user: ALUMNO });

async function openPeso(base, { weights, init, viewport, posts = [] }){
  const pg = await newPage({ user: ALUMNO, init, viewport, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights, daily: {} },
    handlers: { '/token': token, '/profiles': profile('client'),
      '/body_weights': (r, J, i) => i.m === 'GET' ? J(weights.map(w => ({ id: w.id, client_id: ALUMNO.id, measured_on: w.date, kg: w.kg })))
        : (posts.push(i.body || ''), r.fulfill({ status: 201, body: '[]' })) } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-progreso'); await wait(300);
  await pg.p.click('[data-action="psec-open"][data-v="peso"]'); await wait(300);
  return pg;
}
const nextMorning = p => p.evaluate(() => { window.__setNow(Date.parse('2026-09-29T07:30:00-03:00')); document.dispatchEvent(new Event('visibilitychange')); });

export default async function ({ base, t }){
  // 1) La app abre el 28/9 a las 23:55 con 80 kg cargados ese día, se cierra la sección y
  //    vuelve de segundo plano el 29/9 a las 7:30: el peso nuevo va al 29 y el del 28 queda.
  {
    const posts = [];
    const { p, errs, dialogs, close } = await openPeso(base, { posts, init: clock('2026-09-28T23:55:00-03:00'), weights: [{ id: 'w1', date: '2026-09-28', kg: 80 }] });
    t.eq(await p.inputValue('#wDate'), '2026-09-28', 'antes de medianoche la fecha es la de ese día');
    await p.click('[data-action="psec-close"]'); await wait(200);
    await nextMorning(p); await wait(800);
    await p.click('[data-action="psec-open"][data-v="peso"]'); await wait(300);
    t.eq(await p.inputValue('#wDate'), '2026-09-29', 'al volver al otro día, la fecha del formulario es la de hoy');
    await p.fill('#wKg', '79,4');
    await p.click('[data-action="weight-save"]'); await wait(2000);
    const ws = (await saved(p)).weights.map(w => w.date + '=' + w.kg).sort();
    t.eq(ws, ['2026-09-28=80', '2026-09-29=79.4'], 'el peso de ayer no se pisa y el de hoy queda en hoy');
    t.ok(posts.some(b => /"measured_on":"2026-09-29"/.test(b)) && !posts.some(b => /"measured_on":"2026-09-28"/.test(b)), 'a la nube va el peso con la fecha de hoy: ' + JSON.stringify(posts));
    t.eq(dialogs, [], 'sin carteles');
    t.eq(errs, [], 'errores de la página (medianoche, sección cerrada)');
    await close();
  }
  // 2) Lo mismo con la sección Peso abierta toda la noche (el visibilitychange la redibuja).
  {
    const { p, errs, close } = await openPeso(base, { init: clock('2026-09-28T23:55:00-03:00'), weights: [{ id: 'w1', date: '2026-09-28', kg: 80 }] });
    await nextMorning(p); await wait(800);
    t.eq(await p.inputValue('#wDate'), '2026-09-29', 'con la sección abierta, al volver al otro día la fecha es la de hoy');
    t.eq(errs, [], 'errores de la página (medianoche, sección abierta)');
    await close();
  }
  // 3) Una fecha pasada elegida a propósito ese mismo día se respeta al redibujar.
  {
    const { p, errs, close } = await openPeso(base, { weights: [] });
    await p.fill('#wDate', '2026-09-20'); await p.dispatchEvent('#wDate', 'change'); await wait(100);
    await p.click('[data-action="psec-close"]'); await wait(200);
    await p.click('[data-action="psec-open"][data-v="peso"]'); await wait(300);
    t.eq(await p.inputValue('#wDate'), '2026-09-20', 'la fecha elegida a mano se mantiene el mismo día');
    t.eq(errs, [], 'errores de la página (fecha a mano)');
    await close();
  }
  // 4) Coma decimal en todo Peso corporal (como la tarjeta del menú).
  {
    const { p, errs, close } = await openPeso(base, { weights: [{ id: 'a', date: '2026-09-20', kg: 81.5 }, { id: 'b', date: '2026-09-27', kg: 80.7 }] });
    t.eq(await text(p, '.w-now'), '80,7 kg', 'peso actual con coma');
    const meta = await text(p, '.w-meta');
    t.has(meta, '▼ 0,8 kg', 'la diferencia va con coma y un solo signo');
    t.ok(!/-/.test(meta) && !/\d\.\d/.test(meta), 'la diferencia no lleva «-» ni punto: ' + meta);
    t.eq(await p.$$eval('.w-kg', l => l.map(e => e.textContent)), ['80,7 kg', '81,5 kg'], 'historial de peso con coma');
    const axis = await p.$$eval('.w-chart text', l => l.map(e => e.textContent).filter(s => /^\d/.test(s) && !/[a-z]/.test(s)));
    t.ok(axis.length > 1 && axis.some(s => s.includes(',')) && !axis.some(s => s.includes('.')), 'eje del gráfico con coma: ' + JSON.stringify(axis));
    await p.click('.w-item[data-id="b"] .w-date'); await wait(300);
    t.eq(await p.inputValue('#wKg'), '80,7', 'al tocar un peso para editarlo, el campo trae coma');
    t.eq(errs, [], 'errores de la página (coma)');
    await close();
  }
  // 5) Menos de 360 px: la fecha entra entera (en su fila); desde 360, todo en una fila como antes.
  for (const w of [320, 340, 360, 390]){
    const { p, errs, close } = await openPeso(base, { weights: [], viewport: { width: w, height: 700 } });
    const m = await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect();
      const d = r('#wDate'), k = r('#wKg'), b = r('.w-form .form-save');
      return { dateW: d.width, sameRow: Math.abs(d.top - k.top) < 2, btnRight: b.right, over: document.documentElement.scrollWidth - innerWidth }; });
    if (w < 360){
      t.ok(m.dateW >= 200, w + ' px: el campo de fecha tiene lugar para «28/09/2026» (' + Math.round(m.dateW) + ' px)');
      t.ok(!m.sameRow, w + ' px: la fecha va en su propia fila');
    } else {
      t.ok(m.sameRow, w + ' px: fecha, peso y Guardar siguen en una fila');
      t.ok(m.dateW >= 90, w + ' px: la fecha entra (' + Math.round(m.dateW) + ' px)');
    }
    t.ok(m.btnRight <= w + 0.5 && m.over <= 0, w + ' px: sin scroll de costado y con Guardar a la vista');
    t.eq(errs, [], w + ' px: errores de la página');
    await close();
  }
}
