// Tarjeta «Registro de hoy» en Progreso: la fila del día que la app sube sola (agua, pasos,
// hábitos) no cuenta como registro cargado al volver a abrir la app; una respuesta sí. El peso
// de hoy (en «Tu peso») cuenta solo si el registro no tiene preguntas: si las tiene, sigue
// pendiente hasta responder alguna, y guardar el registro con solo el peso pide una respuesta
// (no guarda ni manda nada, y el peso escrito queda en el formulario).
import { newPage, saved, wait, ALUMNO, perfil, CON_COACH } from './lib.mjs';
// Con coach (perfil y no profile, que deja la app sin perfil): sin coach, Progreso no muestra el
// registro de hoy.

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// cq: las preguntas del coach (null: las predeterminadas). registros: lo que se manda del
// registro a la nube (las filas con "comment"; la fila automática del día no lo trae).
async function tarjeta(base, rows, cq = null){
  const registros = [];
  const { p, errs, dialogs, avisos, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
    handlers: { '/profiles': perfil('client', CON_COACH),
      '/daily_logs': (r, J, i) => { if (i.m === 'GET') return J(rows); if (i.body) [].concat(JSON.parse(i.body)).forEach(x => { if (x && 'comment' in x) registros.push(x); }); return undefined; },
      '/coach_questions': (r, J, i) => i.m === 'GET' ? J(i.one ? cq : (cq ? [cq] : [])) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-progreso'); await wait(300);
  const tile = () => p.evaluate(() => { const b = document.querySelector('[data-action="psec-open"][data-v="registro"]'); return { txt: b.querySelector('.ptile-s').innerText.trim(), pend: b.classList.contains('pend') }; });
  return { p, errs, dialogs, avisos, registros, close, tile };
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

  // Con las preguntas de siempre: anotar el peso en «Tu peso» no completa el registro.
  s = await tarjeta(base, []);
  await s.p.fill('#wqKg', '79,5'); await s.p.click('[data-action="weight-today"]'); await wait(800);
  t.has(await s.p.innerText('.wq-hoy'), 'Hoy: 79,5 kg', 'con preguntas: el peso de hoy quedó');
  t.eq(await s.tile(), { txt: 'Pendiente de hoy', pend: true }, 'con preguntas: solo el peso no completa el registro');
  // Guardar el registro con solo el peso (cambiado a 79,8): pide una respuesta, como el check-in,
  // no guarda ni manda nada y el peso escrito sigue en el formulario.
  await s.p.click('[data-action="psec-open"][data-v="registro"]'); await wait(300);
  t.eq(await s.p.inputValue('#dKg'), '79,5', 'con preguntas: el registro trae el peso de hoy');
  await s.p.fill('#dKg', '79,8');
  await s.p.click('[data-action="daily-save"]'); await wait(1500);
  t.ok(s.dialogs.includes('Respondé al menos una pregunta antes de guardar el registro.'), 'con preguntas: solo el peso pide una respuesta: ' + JSON.stringify(s.dialogs));
  t.ok(!s.dialogs.some(d => /Registro guardado|Se guard/.test(d)), 'con preguntas: no dice que se guardó');
  t.eq(s.registros, [], 'con preguntas: no se manda el registro a la nube');
  let st = await saved(s.p);
  t.eq([st.daily[TODAY] && st.daily[TODAY].kg, st.weights.filter(w => w.date === TODAY).map(w => w.kg)], [undefined, [79.5]], 'con preguntas: no se guarda nada (ni el peso nuevo)');
  t.eq(await s.p.inputValue('#dKg'), '79,8', 'con preguntas: el peso escrito queda en el formulario');
  // Al responder una pregunta (redibuja), el peso escrito sigue; ahora se guarda todo.
  await s.p.click('[data-action="daily-set"][data-k="sleep"] >> nth=0'); await wait(200);
  t.eq(await s.p.inputValue('#dKg'), '79,8', 'con preguntas: al redibujar, el peso escrito sigue');
  await s.p.click('[data-action="daily-save"]'); await wait(1500);
  t.ok(s.dialogs.some(d => d.includes('Registro guardado')), 'con preguntas: respondiendo una, se guarda: ' + JSON.stringify(s.dialogs));
  t.eq(s.registros.length, 1, 'con preguntas: el registro va a la nube una vez');
  st = await saved(s.p);
  t.eq(st.weights.filter(w => w.date === TODAY).map(w => w.kg), [79.8], 'con preguntas: con el peso escrito');
  await s.p.click('[data-action="psec-close"]'); await wait(300);
  t.eq(await s.tile(), { txt: 'Cargado hoy ✓', pend: false }, 'con preguntas: respondiendo una, cargado');
  t.eq(s.errs, [], 'con preguntas: errores de la página');
  await s.close();

  // El coach borró todas las preguntas del registro (queda solo el peso): el peso de hoy lo
  // completa, y guardar el registro con solo el peso funciona como siempre.
  s = await tarjeta(base, [], { daily: [], checkin: null });
  t.eq(await s.tile(), { txt: 'Pendiente de hoy', pend: true }, 'sin preguntas: sin el peso, pendiente');
  await s.p.fill('#wqKg', '79,5'); await s.p.click('[data-action="weight-today"]'); await wait(800);
  t.eq(await s.tile(), { txt: 'Cargado hoy ✓', pend: false }, 'sin preguntas: con el peso de hoy, cargado');
  t.eq(s.dialogs, [], 'sin preguntas: sin carteles');
  await s.p.click('[data-action="psec-open"][data-v="registro"]'); await wait(300);
  await s.p.fill('#dKg', '79,2');
  await s.p.click('[data-action="daily-save"]'); await wait(1500);
  // El ✓ del mensaje lo muestra el cartel propio como «Listo» (app/ui/avisos.js).
  t.eq(s.dialogs, ['Registro guardado'], 'sin preguntas: el registro con solo el peso se guarda');
  t.eq(s.avisos.map(a => a.titulo), ['Listo'], 'sin preguntas: con el cartel de «Listo»');
  t.eq(s.registros.length, 1, 'sin preguntas: y va a la nube');
  t.eq((await saved(s.p)).weights.filter(w => w.date === TODAY).map(w => w.kg), [79.2], 'sin preguntas: con el peso nuevo');
  t.eq(s.errs, [], 'sin preguntas: errores de la página');
  await s.close();
}
