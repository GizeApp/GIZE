// Editor de preguntas del coach: guardar una pestaña no pisa la otra. Con poca señal falla la
// lectura de sus preguntas y el editor arranca con las predeterminadas; el coach agrega una al
// «Check-in semanal» y guarda. Antes se mandaban las dos pestañas y las preguntas propias del
// «Registro de hoy» quedaban reemplazadas por las predeterminadas para todos sus alumnos.
import { newPage, wait, text } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const SAVED = { daily: [{ id: 'qd1', label: '¿Cuántas horas dormiste?', type: 'text' }], checkin: [{ id: 'qc1', label: '¿Cómo fue la semana?', type: 'text' }] };
  let falla = true; const ups = [];
  const { p, errs, dialogs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/coach_questions': (r, J, i) => {
        if (i.m === 'GET') return falla ? J({ message: 'TypeError: Failed to fetch' }, 500) : J(i.one ? SAVED : [SAVED]);
        const b = JSON.parse(i.body); ups.push(Array.isArray(b) ? b[0] : b); return J([], 201);
      },
    } });
  await p.goto(base + '/app/'); await wait(3500);
  // Desde la ficha de la alumna: la ruedita del «Check-in semanal» abre el editor en esa pestaña.
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await p.click('[data-coach="sec-open"][data-v="checkin"]'); await wait(400);
  await p.click('.co-sec-gear[data-k="checkin"]'); await wait(800);
  const warn = await text(p, '.cq-warn');
  t.has(warn, 'No se pudieron leer tus preguntas guardadas', 'avisa que no se pudieron leer');
  t.ok(!warn.includes('tus clientes ven las predeterminadas'), 'sin decir que los alumnos ven las predeterminadas (no es así): ' + warn);
  await p.click('[data-coach="q-add"]'); await wait(200);
  await p.fill('.cq-label >> nth=-1', '¿Entrenaste los 4 días?'); await wait(100);

  // Vuelve la señal y guarda: antes se leen las guardadas. Su check-in no es el que estaba en
  // pantalla (las predeterminadas): pregunta, y al cancelar muestra el guardado para editarlo.
  falla = false;
  await p.evaluate(() => { window.__conf = []; window.__ok = false; window.confirm = m => (window.__conf.push(m), window.__ok); });
  await p.click('[data-coach="q-save"]'); await wait(1000);
  t.eq(ups.length, 0, 'no reemplaza sin preguntar las del check-in que no se habían leído');
  t.has((await p.evaluate(() => window.__conf)).join(' | '), 'no son las que tenías en pantalla', 'pregunta antes de reemplazarlas');
  t.eq(await p.$$eval('.cq-label', l => l.map(e => e.value)), ['¿Cómo fue la semana?'], 'al cancelar muestra las del check-in guardadas');
  await p.click('[data-coach="q-add"]'); await wait(200);
  await p.fill('.cq-label >> nth=-1', '¿Entrenaste los 4 días?'); await wait(100);
  await p.evaluate(() => { window.__ok = true; });
  await p.click('[data-coach="q-save"]'); await wait(1000);
  t.eq(ups.length, 1, 'con señal se guarda');
  const row = ups[0] || {};
  t.ok(!('daily' in row), 'el «Registro de hoy» no se manda (quedan las del coach): ' + JSON.stringify(row.daily));
  t.eq((row.checkin || []).map(q => q.label), ['¿Cómo fue la semana?', '¿Entrenaste los 4 días?'], 'el check-in va con la pregunta nueva');
  const cq = await p.evaluate(async () => { const { State } = await import('/app/core/state.js'); return State.coachQ; });
  t.eq(cq && cq.daily, SAVED.daily, 'en el celular quedan las preguntas propias del registro');

  // Otra vez sin señal: si al guardar todavía no se pueden leer, no se guarda nada a ciegas.
  falla = true; ups.length = 0;
  await p.click('.co-sec-gear[data-k="checkin"]'); await wait(800);
  await p.click('[data-coach="q-tab"][data-k="daily"]'); await wait(200);
  await p.click('[data-coach="q-add"]'); await wait(200);
  await p.fill('.cq-label >> nth=-1', '¿Tomaste la creatina?'); await wait(100);
  await p.click('[data-coach="q-save"]'); await wait(800);
  t.eq(ups.length, 0, 'sin poder leer las guardadas no se guarda');
  t.ok(dialogs.some(d => d.includes('No se pudieron leer tus preguntas guardadas')), 'avisa que no se guardó: ' + dialogs.join(' | '));
  t.ok(await p.$('.cq-card'), 'el editor sigue abierto con lo cargado');
  t.eq(errs, [], 'errores de la página');
  await close();
}
