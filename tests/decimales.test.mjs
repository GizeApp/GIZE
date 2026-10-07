// Decimales con coma, como en el resto de la app («27,5 kg», no «27.5 kg»): la vez pasada y el
// récord en Entreno, Evolución de cargas, la porción en Comida y, en el panel del coach, el
// peso del alumno, el seguimiento diario y las cargas de cada ejercicio.
import { newPage, wait, text, ALUMNO, profile, openAllEx } from './lib.mjs';

const noDot = s => !/\d\.\d/.test(s);

export default async function ({ base, t }){
  // --- Alumno ---
  {
    const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Remo con barra', sets: [{ id: 's1', kg: '', reps: '' }] }] }];
    const sessions = [{ id: 'a', date: '2026-09-20', ts: Date.parse('2026-09-20T12:00:00Z'), day: 'Torso', exercises: [
      { name: 'Remo con barra', sets: [{ kg: 27.5, reps: 8 }, { kg: 25, reps: 10 }] }] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions, weights: [], daily: {} },
      handlers: { '/profiles': profile('client'), '/sessions': (r, J, i) => i.m === 'GET' ? J({ message: 'sin red' }, 500) : undefined } });
    await p.goto(base + '/app/'); await wait(2500); await openAllEx(p);

    const last = await text(p, '.last-sess .ls-sets');
    t.has(last, '27,5kg × 8', 'Entreno, «La vez pasada» con coma');
    t.ok(noDot(last), 'Entreno, «La vez pasada» sin punto decimal: ' + last);

    const preview = await p.evaluate(async () => (await import('/app/screens/comida.js')).previewStr({ kcal: 390, p: 8.2, c: 84.6, f: 0.8 }, 50));
    t.eq(preview, '195 kcal · P 4,1 · C 42,3 · G 0,4', 'Comida, vista previa de la porción con coma');

    await p.click('#nav-progreso'); await wait(300);
    await p.click('[data-action="psec-open"][data-v="cargas"]'); await wait(300);
    t.eq(await p.$$eval('.hx-best', l => l.map(e => e.textContent)), ['máx 27,5 kg'], 'Evolución de cargas, el máximo con coma');
    t.eq(await p.$$eval('.hx-kg', l => l.map(e => e.textContent)), ['27,5 kg', '25 kg'], 'Evolución de cargas, cada serie con coma');
    await p.click('[data-action="psec-close"]'); await wait(200);

    // Récord: 30,5 kg le gana a 27,5 kg de la vez pasada.
    await p.click('#nav-entreno'); await wait(300); await openAllEx(p);
    await p.fill('input.kg[data-set="s1"]', '30,5'); await p.fill('input.reps[data-set="s1"]', '8');
    await p.click('[data-action="toggle"][data-set="s1"]'); await wait(300);
    await p.click('[data-action="save-session"]'); await wait(1500);
    const pr = await text(p, '.pr-box');
    t.has(pr, '30,5 kg × 8', 'cartel de récord con coma');
    t.has(pr, 'antes 27,5 kg', 'cartel de récord, lo de antes con coma');
    t.eq(errs, [], 'errores de la página (alumno)');
    await close();
  }

  // --- Coach ---
  {
    const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
    const A1 = '44444444-4444-4444-4444-444444444444';
    const mine = i => /client_id=eq\.4444/.test(i.url.search);
    const sess = [{ id: 's1', performed_on: '2026-09-20', day_name: 'Pierna', created_at: '2026-09-20T12:00:00Z', session_entries: [
      { exercise_name: 'Sentadilla libre', set_order: 0, kg: 27.5, reps: 5 }, { exercise_name: 'Sentadilla libre', set_order: 1, kg: 25, reps: 8 }] }];
    const weights = [{ id: 'w1', client_id: A1, measured_on: '2026-09-14', kg: 81.25 }, { id: 'w2', client_id: A1, measured_on: '2026-09-21', kg: 80.5 }];
    const daily = [{ client_id: A1, log_date: '2026-09-21', steps: 8000 }];
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/sessions': (r, J, i) => i.m === 'GET' ? J(mine(i) ? sess : []) : undefined,
        '/body_weights': (r, J, i) => i.m === 'GET' ? J(mine(i) ? weights : []) : undefined,
        '/daily_logs': (r, J, i) => i.m === 'GET' ? J(mine(i) ? daily : []) : undefined,
      } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);

    await p.click('[data-coach="sec-open"][data-v="peso"]'); await wait(400);
    const cells = await p.$$eval('.co-sec-body .co-tbl td', l => l.map(e => e.textContent.trim()));
    t.ok(cells.includes('80,5 kg') && cells.includes('81,3 kg'), 'peso día a día con coma: ' + JSON.stringify(cells));
    t.ok(cells.includes('80,50 kg') && cells.includes('-0,75 kg'), 'promedio semanal y variación con coma: ' + JSON.stringify(cells));
    t.ok(cells.every(noDot), 'tablas de peso sin punto decimal: ' + JSON.stringify(cells));
    const axis = await p.$$eval('.co-sec-body .w-chart text', l => l.map(e => e.textContent).filter(s => /^-?\d/.test(s) && !/[a-z]/.test(s)));
    t.ok(axis.length > 1 && axis.every(noDot), 'ejes de los gráficos de peso sin punto decimal: ' + JSON.stringify(axis));
    await p.click('[data-coach="sec-close"]'); await wait(300);

    await p.click('[data-coach="sec-open"][data-v="daily"]'); await wait(400);
    await p.click('[data-coach="cal-day"][data-k="daily"][data-d="2026-09-21"]'); await wait(400); // el día en el calendario
    t.has(await text(p, '.ck-adh'), 'Peso: 80,5 kg', 'seguimiento diario, el peso con coma');

    const ex = await p.evaluate(async () => {
      const c = await import('/app/screens/coach/clientes.js'), { CoachState } = await import('/app/screens/coach/state.js');
      const d = CoachState.coachData, box = document.createElement('div');
      box.innerHTML = c.exTable(d, 'Pierna', 'Sentadilla libre');
      return { sum: c.exSummary(d, 'Pierna', 'Sentadilla libre'), table: box.textContent };
    });
    t.eq(ex.sum, '20 sep: 27,5 kg × 5 reps', 'resumen del ejercicio en la rutina del coach con coma');
    t.has(ex.table, '27,5 kg', 'tabla del ejercicio en la rutina del coach con coma');
    t.ok(noDot(ex.table), 'tabla del ejercicio sin punto decimal: ' + ex.table);
    t.eq(errs, [], 'errores de la página (coach)');
    await close();
  }
}
