// Tarjeta «Registro de hoy» en Progreso: la fila del día que la app sube sola (agua, pasos,
// hábitos) no cuenta como registro cargado al volver a abrir la app; una respuesta sí. El peso
// de hoy (en «Tu peso» o solo el peso en el registro) cuenta solo si el registro no tiene
// preguntas: si las tiene, sigue pendiente hasta responder alguna.
import { newPage, wait, ALUMNO, perfil, CON_COACH } from './lib.mjs';
// Con coach (perfil y no profile, que deja la app sin perfil): sin coach, Progreso no muestra el
// registro de hoy.

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// cq: las preguntas del coach (null: las predeterminadas).
async function tarjeta(base, rows, cq = null){
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
    handlers: { '/profiles': perfil('client', CON_COACH), '/daily_logs': (r, J, i) => i.m === 'GET' ? J(rows) : undefined,
      '/coach_questions': (r, J, i) => i.m === 'GET' ? J(i.one ? cq : (cq ? [cq] : [])) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-progreso'); await wait(300);
  const tile = () => p.evaluate(() => { const b = document.querySelector('[data-action="psec-open"][data-v="registro"]'); return { txt: b.querySelector('.ptile-s').innerText.trim(), pend: b.classList.contains('pend') }; });
  return { p, errs, dialogs, close, tile };
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

  // Con las preguntas de siempre: anotar el peso en «Tu peso» no completa el registro, ni
  // guardarlo con solo el peso. Respondiendo una pregunta, sí.
  s = await tarjeta(base, []);
  await s.p.fill('#wqKg', '79,5'); await s.p.click('[data-action="weight-today"]'); await wait(800);
  t.has(await s.p.innerText('.wq-hoy'), 'Hoy: 79,5 kg', 'con preguntas: el peso de hoy quedó');
  t.eq(await s.tile(), { txt: 'Pendiente de hoy', pend: true }, 'con preguntas: solo el peso no completa el registro');
  await s.p.click('[data-action="psec-open"][data-v="registro"]'); await wait(300);
  t.eq(await s.p.inputValue('#dKg'), '79,5', 'con preguntas: el registro trae el peso de hoy');
  await s.p.click('[data-action="daily-save"]'); await wait(1500);
  await s.p.click('[data-action="psec-close"]'); await wait(300);
  t.eq(await s.tile(), { txt: 'Pendiente de hoy', pend: true }, 'con preguntas: guardar el registro con solo el peso tampoco');
  await s.p.click('[data-action="psec-open"][data-v="registro"]'); await wait(300);
  await s.p.click('[data-action="daily-set"][data-k="sleep"] >> nth=0'); await wait(200);
  await s.p.click('[data-action="daily-save"]'); await wait(1500);
  await s.p.click('[data-action="psec-close"]'); await wait(300);
  t.eq(await s.tile(), { txt: 'Cargado hoy ✓', pend: false }, 'con preguntas: respondiendo una, cargado');
  t.eq(s.errs, [], 'con preguntas: errores de la página');
  await s.close();

  // El coach borró todas las preguntas del registro (queda solo el peso): el peso de hoy lo completa.
  s = await tarjeta(base, [], { daily: [], checkin: null });
  t.eq(await s.tile(), { txt: 'Pendiente de hoy', pend: true }, 'sin preguntas: sin el peso, pendiente');
  await s.p.fill('#wqKg', '79,5'); await s.p.click('[data-action="weight-today"]'); await wait(800);
  t.eq(await s.tile(), { txt: 'Cargado hoy ✓', pend: false }, 'sin preguntas: con el peso de hoy, cargado');
  t.eq(s.dialogs, [], 'sin preguntas: sin carteles');
  t.eq(s.errs, [], 'sin preguntas: errores de la página');
  await s.close();
}
