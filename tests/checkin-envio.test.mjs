// Check-in semanal que no llega a la nube (con internet): no dice «enviado». Si el servidor
// falla, queda pendiente y la tarjeta lo muestra; si la base lo rechaza, avisa, no queda como
// respondido y las respuestas vuelven al formulario (también después de traer lo de la nube).
// El registro diario rechazado por la base tampoco dice «guardado».
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

async function abrirCheckin(p){
  await p.click('#nav-progreso'); await wait(300);
  await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
}
const tile = p => p.evaluate(async () => {
  const { ProgresoState } = await import('/app/screens/progreso.js');
  const { renderApp } = await import('/app/main.js');
  ProgresoState.section = null; renderApp();
  const b = document.querySelector('[data-action="psec-open"][data-v="checkin"]');
  return { txt: b.querySelector('.ptile-s').innerText.trim(), pend: b.classList.contains('pend') };
});
const cola = p => p.evaluate(() => ({ pend: JSON.parse(localStorage.getItem('core_outbox_v1') || '[]').map(i => i.k), fallidos: JSON.parse(localStorage.getItem('core_outbox_failed_v1') || '[]').map(i => i.k) }));

export default async function ({ base, t }){
  // 1) Servidor caído (503) con el celular «en línea»: queda pendiente, sin decir «enviado».
  {
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
      handlers: { '/profiles': profile('client'),
        '/checkins': (r, J, i) => i.m === 'POST' ? r.fulfill({ status: 503, contentType: 'text/html', body: '<html>503</html>' }) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await abrirCheckin(p);
    await p.click('[data-action="ci-open"]'); await wait(300);
    await (await p.$$('textarea.ci-in'))[0].fill('Todo bien');
    await p.click('[data-action="ci-opt"][data-k="adherence"][data-v="7"]'); await wait(200);
    await p.click('[data-action="ci-save"]'); await wait(6000);
    t.ok(!dialogs.some(d => /enviado/i.test(d)), '503: no dice «enviado»: ' + JSON.stringify(dialogs));
    t.ok(dialogs.some(d => d.includes('todavía no llegó a tu coach')), '503: avisa que quedó pendiente: ' + JSON.stringify(dialogs));
    t.has(await text(p, '.ci-status'), 'todavía no llegó a tu coach', '503: la tarjeta del check-in dice que falta enviarlo');
    t.eq((await cola(p)).pend, ['checkin'], '503: el check-in sigue en la cola para reintentarse');
    const tl = await tile(p);
    t.ok(!/Enviado/.test(tl.txt) && tl.pend, '503: la tarjeta de Progreso no dice «Enviado»: ' + JSON.stringify(tl));
    t.eq(errs, [], '503: errores de la página');
    await close();
  }

  // 2) La base lo rechaza (error permanente): avisa, no queda como respondido y no se pierde.
  {
    let rechaza = true; const posts = [];
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
      handlers: { '/profiles': profile('client'),
        '/checkins': (r, J, i) => { if (i.m !== 'POST') return undefined; posts.push(JSON.parse(i.body));
          return rechaza ? J({ code: '23514', message: 'new row violates check constraint' }, 400) : r.fulfill({ status: 201, body: '[]' }); } } });
    await p.goto(base + '/app/'); await wait(2500);
    await abrirCheckin(p);
    await p.click('[data-action="ci-open"]'); await wait(300);
    await (await p.$$('textarea.ci-in'))[0].fill('Semana dura');
    await p.click('[data-action="ci-opt"][data-k="adherence"][data-v="6"]'); await wait(200);
    await p.click('[data-action="ci-save"]'); await wait(2500);
    t.ok(!dialogs.some(d => /enviado/i.test(d)), 'rechazo: no dice «enviado»: ' + JSON.stringify(dialogs));
    t.ok(dialogs.some(d => d.includes('No se pudo enviar tu check-in')), 'rechazo: avisa que no se pudo enviar: ' + JSON.stringify(dialogs));
    t.eq(await p.$eval('textarea.ci-in', e => e.value).catch(() => null), 'Semana dura', 'rechazo: las respuestas siguen en el formulario');
    t.eq((await cola(p)).fallidos, ['checkin'], 'rechazo: quedó apartado como fallido');

    // Se cierra el formulario y la app vuelve a traer todo de la nube (que no lo tiene).
    if (await p.$('[data-action="ci-close"]')) { await p.click('[data-action="ci-close"]'); await wait(200); }
    await p.evaluate(async () => { const sb = await import('/app/core/supabase.js'); await sb.loadCloud(); });
    const tl = await tile(p);
    t.eq(tl, { txt: 'No se pudo enviar', pend: true }, 'rechazo: la tarjeta de Progreso lo muestra');
    await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
    t.has(await text(p, '.ci-status'), 'no se pudo enviar', 'rechazo: la tarjeta del check-in lo explica');
    await p.click('[data-action="ci-open"]'); await wait(300);
    t.eq(await p.$eval('textarea.ci-in', e => e.value).catch(() => null), 'Semana dura', 'rechazo: al abrirlo de nuevo están las respuestas');
    t.eq(await p.$$eval('.sc-opt.on', b => b.map(x => x.textContent)), ['6'], 'rechazo: la adherencia elegida sigue marcada');

    // Ahora la base lo acepta: se manda con las mismas respuestas.
    rechaza = false; dialogs.length = 0;
    await p.click('[data-action="ci-save"]'); await wait(2000);
    t.ok(dialogs.some(d => d.includes('Check-in enviado')), 'reenvío: dice «enviado»: ' + JSON.stringify(dialogs));
    const last = posts[posts.length - 1] || {};
    t.eq([last.answers && last.answers.q1, last.adherence], ['Semana dura', 6], 'reenvío: llegan las respuestas');
    t.eq(await tile(p), { txt: 'Enviado esta semana ✓', pend: false }, 'reenvío: la tarjeta queda como enviada');
    t.eq(errs, [], 'rechazo: errores de la página');
    await close();
  }

  // 3) Registro diario rechazado por la base: no dice «guardado».
  {
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
      handlers: { '/profiles': profile('client'),
        // Solo el registro (trae "comment"); la fila automática del día (agua, pasos) pasa.
        '/daily_logs': (r, J, i) => i.m === 'POST' && 'comment' in JSON.parse(i.body) ? J({ code: '22P02', message: 'invalid input syntax' }, 400) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    await p.click('[data-action="psec-open"][data-v="registro"]'); await wait(300);
    await p.click('[data-action="daily-set"][data-k="sleep"] >> nth=0'); await wait(200);
    await p.click('[data-action="daily-save"]'); await wait(2500);
    t.ok(!dialogs.some(d => d.includes('Registro guardado')), 'registro rechazado: no dice «guardado»: ' + JSON.stringify(dialogs));
    t.ok(dialogs.some(d => d.includes('No se pudo enviar tu registro')), 'registro rechazado: avisa: ' + JSON.stringify(dialogs));
    t.eq(errs, [], 'registro rechazado: errores de la página');
    await close();
  }
}
