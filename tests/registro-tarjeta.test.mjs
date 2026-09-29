// Tarjeta «Registro de hoy» en Progreso: la fila del día que la app sube sola (agua, pasos,
// hábitos) no cuenta como registro cargado al volver a abrir la app; una respuesta sí.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

async function tarjeta(base, rows){
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
    handlers: { '/profiles': profile('client'), '/daily_logs': (r, J, i) => i.m === 'GET' ? J(rows) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-progreso'); await wait(300);
  const tile = () => p.evaluate(() => { const b = document.querySelector('[data-action="psec-open"][data-v="registro"]'); return { txt: b.querySelector('.ptile-s').innerText.trim(), pend: b.classList.contains('pend') }; });
  return { p, errs, close, tile };
}

export default async function ({ base, t }){
  // Solo la fila automática del día (lo que queda en la nube al abrir la app sin cargar nada).
  let s = await tarjeta(base, [{ log_date: TODAY, water_ml: 0, steps: 0, habits_done: { coach: [], own: [] } }]);
  t.eq(await s.tile(), { txt: 'Pendiente de hoy', pend: true }, 'fila automática: sigue pendiente');
  // Se responde una pregunta y se guarda: ahora sí.
  await s.p.click('[data-action="psec-open"][data-v="registro"]'); await wait(300);
  await s.p.click('[data-action="daily-set"][data-k="sleep"] >> nth=0'); await wait(200);
  await s.p.click('[data-action="daily-save"]'); await wait(1500);
  await s.p.click('[data-action="psec-close"]'); await wait(300);
  t.eq(await s.tile(), { txt: 'Cargado hoy ✓', pend: false }, 'con una respuesta guardada: cargado');
  t.eq(s.errs, [], 'errores de la página');
  await s.close();

  // Al volver a abrir, con respuestas en la nube: cargado.
  s = await tarjeta(base, [{ log_date: TODAY, water_ml: 500, steps: 4000, habits_done: { coach: [], own: [] }, comment: 'Bien' }]);
  t.eq(await s.tile(), { txt: 'Cargado hoy ✓', pend: false }, 'respuesta en la nube: cargado');
  await s.close();
}
