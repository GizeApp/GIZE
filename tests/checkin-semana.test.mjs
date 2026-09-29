// Check-in abierto el domingo y enviado pasada la medianoche: va a la semana que decía la
// pantalla. Y un check-in sin ninguna respuesta no se manda.
import { newPage, wait, saved, ALUMNO, profile } from './lib.mjs';

// Reloj de la página movible (solo Date): arranca en startIso y se cambia con window.__setNow(ms).
// Fechas pasadas: así la sesión simulada nunca parece vencida.
const fakeClock = startIso => `(() => {
  const R = Date; let o = Number(sessionStorage.getItem('dateOff') || 'NaN');
  if (isNaN(o)) { o = R.parse(${JSON.stringify(startIso)}) - R.now(); sessionStorage.setItem('dateOff', String(o)); }
  window.__setNow = t => { o = t - R.now(); sessionStorage.setItem('dateOff', String(o)); };
  function D(...a){ if(!(this instanceof D)) return new R(R.now()+o).toString(); return a.length ? new R(...a) : new R(R.now()+o); }
  D.prototype = R.prototype; D.now = () => R.now()+o; D.parse = R.parse; D.UTC = R.UTC;
  window.Date = D;
})();`;

export default async function ({ base, t }){
  // Domingo 27/9/2026 a las 23:50 (semana del lunes 21/9); se envía el lunes 28/9 a las 00:03.
  {
    const posts = [];
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, init: fakeClock('2026-09-27T23:50:00-03:00'),
      state: { sessions: [], daily: {}, weights: [] },
      handlers: { '/profiles': profile('client'),
        '/checkins': (r, J, i) => i.m === 'POST' ? (posts.push(JSON.parse(i.body)), r.fulfill({ status: 201, body: '[]' })) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
    await p.click('[data-action="ci-open"]'); await wait(300);
    t.has(await p.textContent('.ci-week'), 'Semana del 21 sep', 'el formulario es de la semana del domingo');
    await (await p.$$('textarea.ci-in'))[0].fill('Semana dura pero cumplí');
    await p.click('[data-action="ci-opt"][data-k="adherence"][data-v="8"]'); await wait(300);
    await p.evaluate(() => window.__setNow(Date.parse('2026-09-28T00:03:00-03:00')));
    await p.click('[data-action="ci-save"]'); await wait(2500);
    t.eq(posts.map(b => b.week_start), ['2026-09-21'], 'se manda con la semana que decía la pantalla');
    t.eq(Object.keys((await saved(p)).checkins || {}), ['2026-09-21'], 'se guarda en esa semana');
    t.ok(dialogs.some(d => d.includes('Check-in enviado')), 'se envía: ' + JSON.stringify(dialogs));
    t.eq(errs, [], 'medianoche: errores de la página');
    await close();
  }

  // Tocar «Enviar» sin responder nada: no se manda ni queda como respondido.
  {
    const posts = [];
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
      handlers: { '/profiles': profile('client'),
        '/checkins': (r, J, i) => i.m === 'POST' ? (posts.push(i.body), r.fulfill({ status: 201, body: '[]' })) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
    await p.click('[data-action="ci-open"]'); await wait(300);
    await p.click('[data-action="ci-save"]'); await wait(1500);
    t.eq(posts, [], 'vacío: no se manda nada');
    t.ok(dialogs.some(d => d.includes('Respondé al menos una pregunta')), 'vacío: pide responder algo: ' + JSON.stringify(dialogs));
    t.ok(!dialogs.some(d => /enviado/i.test(d)), 'vacío: no dice «enviado»');
    t.eq(Object.keys((await saved(p)).checkins || {}), [], 'vacío: no queda guardado como respondido');
    t.ok(await p.$('[data-action="ci-save"]') !== null, 'vacío: el formulario sigue abierto');
    t.eq(errs, [], 'vacío: errores de la página');
    await close();
  }
}
