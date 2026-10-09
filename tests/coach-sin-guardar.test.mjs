// Panel del coach: lo que se carga en el plan alimenticio, la ficha o el bloque del alumno y no se
// guarda no se pierde sin aviso, como ya pasaba con la rutina. «‹ Volver» y «Actualizar» (y el
// Atrás de Android, que los toca) preguntan antes, la recarga de la página también, y guardar una
// rutina programada (que vuelve a leer al alumno) no los descarta.
import { newPage, wait, text } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const ACTUAL = [{ id: 'd0', name: 'Full body', subtitle: '', exercises: [{ id: 'e0', name: 'Peso muerto', sets: [{ id: 's0', kg: '', reps: '' }] }] }];
  const sched = [];
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_schedule': (r, J, i) => { if (i.m === 'GET') return J([]); sched.push(i.body); return J([], 201); },
    } });
  const st = () => p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); const f = CoachState.coachPlanForm;
    return { sel: CoachState.coachSel, meal: f && f.trainDays && f.trainDays[0] && f.trainDays[0].meal, obj: CoachState.coachInfoForm && CoachState.coachInfoForm.objective, blk: CoachState.coachBlockForm && CoachState.coachBlockForm.name }; });
  const unload = () => p.evaluate(() => { const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });
  // «Cancelar» en el aviso (y se anota qué dice).
  await p.addInitScript(() => { window.__conf = []; window.__ok = false; window.confirm = m => (window.__conf.push(m), window.__ok); });
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);

  // Plan alimenticio: una comida nueva en los días de entreno.
  await p.click('[data-coach="client-tab"][data-t="plan"]'); await wait(300);
  await p.click('[data-coach="plsec-open"][data-v="train"]'); await wait(300);
  await p.click('[data-coach="pl-mealadd"][data-key="trainDays"]'); await wait(300);
  await p.fill('[data-coach="pl-meal"][data-k="meal"]', 'Desayuno'); await wait(100);
  t.has(await text(p, '#coachHost'), 'Cambios sin guardar. Tocá Guardar plan nutricional', 'el plan muestra el cartel de cambios sin guardar');
  // Atrás de Android: el primero cierra la sección, el segundo toca «‹ Volver».
  await p.evaluate(async () => { const { handleBack } = await import('/app/ui/atras.js'); handleBack(); }); await wait(300);
  await p.evaluate(async () => { const { handleBack } = await import('/app/ui/atras.js'); handleBack(); }); await wait(300);
  t.has((await p.evaluate(() => window.__conf)).join(' | '), 'Tenés cambios sin guardar en el plan alimenticio', 'Volver pregunta por el plan');
  t.eq((await st()).meal, 'Desayuno', 'al cancelar, el plan sigue como estaba');
  t.ok(await unload(), 'recargar la página avisa (plan)');

  // Ficha y bloque.
  await p.click('[data-coach="client-tab"][data-t="ficha"]'); await wait(300);
  await p.click('[data-coach="sec-open"][data-v="ficha"]'); await wait(300);
  await p.fill('[data-coach="info-objective"]', 'Bajar grasa'); await wait(100);
  await p.click('[data-coach="sec-close"]'); await wait(300);
  await p.click('[data-coach="sec-open"][data-v="bloque"]'); await wait(300);
  await p.fill('[data-coach="blk-name"]', 'Fuerza'); await wait(100);
  await p.click('[data-coach="refresh"]'); await wait(800);
  const conf = await p.evaluate(() => window.__conf);
  t.has(conf[conf.length - 1], 'en el plan alimenticio, la ficha y el bloque', 'Actualizar pregunta por los tres');
  t.eq(await st(), { sel: A1, meal: 'Desayuno', obj: 'Bajar grasa', blk: 'Fuerza' }, 'al cancelar no se vuelve a leer nada');

  // Guardar una rutina programada vuelve a leer al alumno: lo demás sin guardar queda.
  await p.click('[data-coach="sec-close"]'); await wait(300);
  await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(400);
  await p.click('[data-coach="sched-new"]'); await wait(700);
  await p.click('[data-coach="sp-copy"]'); await wait(400);
  await p.click('[data-coach="tpl-save"]'); await wait(2000);
  t.eq(sched.length, 1, 'se guarda la rutina programada');
  t.eq(await st(), { sel: A1, meal: 'Desayuno', obj: 'Bajar grasa', blk: 'Fuerza' }, 'después de guardarla siguen el plan, la ficha y el bloque sin guardar');

  // Aceptando el aviso se sale, y ya no queda nada pendiente.
  await p.evaluate(() => { window.__ok = true; });
  await p.click('[data-coach="back"]'); await wait(600);
  t.eq((await st()).sel, null, 'aceptando, Volver sale a la lista');
  t.ok(!(await unload()), 'en la lista, recargar ya no avisa');
  t.eq(errs, [], 'errores de la página');
  await close();
}
