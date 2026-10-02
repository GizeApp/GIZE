// Panel del coach: «+ Programar una rutina nueva» deja elegir una de «Mis rutinas» (distinta de la
// que tiene el alumno) y la carga en el editor de la rutina programada: mismos días y ejercicios,
// ids nuevos, sin pesos ni repeticiones. Guardar la sube a routine_schedule con la fecha elegida.
// El camino de siempre (copiar la rutina actual) sigue andando.
import { newPage, wait, text } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const set = (id, extra) => Object.assign({ id, kg: '80', reps: '8', done: true, goal: '8-10' }, extra);
  const ACTUAL = [{ id: 'd0', name: 'Full body', subtitle: '', exercises: [{ id: 'e0', name: 'Peso muerto', sets: [set('s0')] }] }];
  const TPL = { id: 'tpl-1', coach_id: COACH.id, name: 'Hipertrofia 4 días', days: [
    { id: 'td1', name: 'Torso A', subtitle: '', exercises: [
      { id: 'te1', name: 'Press banca plano', rir: '2', rest: '3', notes: 'Pausa abajo', video: 'https://youtu.be/abc', sets: [set('ts1'), set('ts2')] },
      { id: 'te2', name: 'Remo con barra', rir: '1', sets: [set('ts3')] }] },
    { id: 'td2', name: 'Pierna A', subtitle: '', exercises: [{ id: 'te3', name: 'Sentadilla libre', sets: [set('ts4')] }] }] };
  const posts = [];
  const handlers = (tpls) => ({
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
    '/routine_templates': (r, J, i) => i.m === 'GET' ? J(tpls) : undefined,
    '/routine_schedule': (r, J, i) => { if (i.m === 'GET') return J([]); posts.push({ m: i.m, body: JSON.parse(i.body || 'null') }); return J([], 201); },
  });
  const openRutina = async p => {
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(400);
    await p.click('[data-coach="sched-new"]'); await wait(700);
  };
  const shots = process.env.SHOTS;

  // ---- Con rutinas guardadas: elegir una ----
  {
    const { p, errs, close } = await newPage({ user: COACH, handlers: handlers([TPL]) });
    await openRutina(p);
    const sheet = await text(p, '#applyMount .cp-ccard');
    t.has(sheet.toLowerCase(), 'empezar desde una de mis rutinas', 'el selector ofrece empezar desde una de mis rutinas');
    t.has(sheet, 'Hipertrofia 4 días', 'aparece la rutina guardada');
    t.has(sheet, '2 días · 3 ej.', 'con días y ejercicios');
    t.has(sheet, 'Copiar la rutina actual', 'sigue la opción de copiar la rutina actual');
    if (shots) await p.screenshot({ path: shots + '/1-selector.png' });
    await p.click('[data-coach="sp-tpl"][data-id="tpl-1"]'); await wait(500);
    t.eq(await p.evaluate(() => (document.getElementById('applyMount') || {}).innerHTML || ''), '', 'el selector se cierra');
    const host = await text(p, '#coachHost');
    t.has(host, 'Rutina programada para Ana Alumna', 'se abre el editor de la rutina programada');
    t.has(host, 'Torso A', 'el editor muestra los días de la rutina elegida');
    t.has(host, 'Press banca plano', 'y sus ejercicios');
    const ed = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); return JSON.parse(JSON.stringify(CoachState.coachTplEdit)); });
    t.eq(ed.name, 'Hipertrofia 4 días', 'el nombre viene de la rutina elegida');
    t.eq(await p.inputValue('[data-coach="tpl-name"]'), 'Hipertrofia 4 días', 'el campo nombre está completo');
    const ex0 = ed.days[0].exercises[0];
    t.ok(ed.days[0].id !== 'td1' && ex0.id !== 'te1' && ex0.sets[0].id !== 'ts1', 'ids nuevos (no se pisa la rutina guardada)');
    t.eq([ex0.sets[0].kg, ex0.sets[0].reps, ex0.sets[0].done], ['', '', false], 'sin pesos ni repeticiones cargados');
    t.eq([ex0.rir, ex0.rest, ex0.notes, ex0.video, ex0.sets[0].goal], ['2', '3', 'Pausa abajo', 'https://youtu.be/abc', '8-10'], 'quedan RIR, descanso, notas, video y objetivo');
    const tplIntact = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); const s = CoachState.coachTpls[0].days[0].exercises[0].sets[0]; return [s.id, s.kg]; });
    t.eq(tplIntact, ['ts1', '80'], 'la rutina guardada no cambia');
    if (shots) await p.screenshot({ path: shots + '/2-editor.png' });
    // Fecha y guardar.
    await p.fill('[data-coach="sched-date"]', '2026-12-01'); await wait(100);
    await p.click('[data-coach="tpl-save"]'); await wait(1500);
    const ins = posts.filter(x => x.m === 'POST');
    t.eq(ins.length, 1, 'se guarda una rutina programada');
    const row = ins[0] && (Array.isArray(ins[0].body) ? ins[0].body[0] : ins[0].body);
    t.eq(row && row.starts_on, '2026-12-01', 'con la fecha elegida');
    t.eq(row && row.client_id, A1, 'para el alumno');
    t.eq(row && row.name, 'Hipertrofia 4 días', 'con el nombre de la rutina');
    t.eq(row && row.days.map(d => d.name + ':' + d.exercises.map(e => e.name).join('+')), ['Torso A:Press banca plano+Remo con barra', 'Pierna A:Sentadilla libre'], 'con los días de la rutina elegida');
    t.eq(errs, [], 'errores de la página');
    await close();
  }

  // ---- Sin rutinas guardadas: aviso y camino de siempre ----
  {
    posts.length = 0;
    const { p, errs, close } = await newPage({ user: COACH, handlers: handlers([]) });
    await openRutina(p);
    const sheet = await text(p, '#applyMount .cp-ccard');
    t.has(sheet, 'Todavía no tenés rutinas guardadas', 'sin rutinas guardadas: aviso corto');
    await p.click('[data-coach="sp-copy"]'); await wait(500);
    const host = await text(p, '#coachHost');
    t.has(host, 'Peso muerto', 'copiar la rutina actual: el editor la muestra');
    await p.click('[data-coach="tpl-save"]'); await wait(1500);
    const ins = posts.filter(x => x.m === 'POST');
    const row = ins[0] && (Array.isArray(ins[0].body) ? ins[0].body[0] : ins[0].body);
    t.eq(row && row.days.map(d => d.name), ['Full body'], 'copiar la rutina actual: se guarda como antes');
    t.ok(row && row.starts_on > '2026-10-01', 'con la fecha de siempre (más adelante): ' + (row && row.starts_on));
    t.eq(errs, [], 'sin rutinas: errores de la página');
    await close();
  }
}
