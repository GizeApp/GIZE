// El coach borró todas las preguntas (del registro y del check-in) y guardó: el alumno no ve
// las predeterminadas, y el editor del coach, al volver a abrirlo, las muestra vacías.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const cq = { daily: [], checkin: [] };
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
      handlers: { '/profiles': profile('client', { coach_id: '33333333-3333-3333-3333-333333333333' }),
        '/coach_questions': (r, J, i) => i.m === 'GET' ? J(i.one ? cq : [cq]) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    const tile = await p.evaluate(() => { const b = document.querySelector('[data-action="psec-open"][data-v="checkin"]'); return { txt: b.querySelector('.ptile-s').innerText.trim(), pend: b.classList.contains('pend') }; });
    t.eq(tile, { txt: 'Sin preguntas esta semana', pend: false }, 'la tarjeta del check-in no queda pendiente para siempre');
    await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
    t.has(await text(p, '.ci-status'), 'no armó preguntas', 'el check-in avisa que no hay preguntas');
    t.eq(await p.$$eval('[data-action="ci-open"]', b => b.length), 0, 'no hay un formulario vacío para responder');
    await p.click('[data-action="psec-close"]'); await wait(200);
    await p.click('[data-action="psec-open"][data-v="registro"]'); await wait(300);
    t.eq(await p.$$eval('.daily-card .dq-row', r => r.length), 0, 'el registro no muestra las preguntas predeterminadas');
    t.ok(!!(await p.$('#dKg')), 'el registro sigue con el peso');
    t.eq(await p.$$eval('.daily-card input, .daily-card textarea', l => l.map(e => e.id)), ['dKg'], 'y nada más: los pasos no se anotan a mano (llegan de Salud)');
    t.eq(errs, [], 'alumno: errores de la página');
    await close();
  }
  {
    const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/coach_questions': (r, J, i) => i.m === 'GET' ? J(i.one ? cq : [cq]) : undefined,
      } });
    await p.goto(base + '/app/'); await wait(3000);
    const ed = await p.evaluate(async () => {
      const b = document.createElement('button'); b.dataset.coach = 'q-open'; b.dataset.k = 'checkin'; document.body.appendChild(b); b.click();
      await new Promise(r => setTimeout(r, 800));
      const { CoachState } = await import('/app/screens/coach/state.js');
      const e = CoachState.coachQEdit; return e ? { daily: e.daily.length, checkin: e.checkin.length } : null;
    });
    t.eq(ed, { daily: 0, checkin: 0 }, 'coach: el editor muestra las listas vacías que guardó');
    t.eq(errs, [], 'coach: errores de la página');
    await close();
  }
}
