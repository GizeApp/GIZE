// Pregunta de adherencia del check-in cambiada por el coach (opciones con palabras o
// respuesta libre): la respuesta se marca, llega en answers (no a la columna numérica, que
// la rechazaría) y el coach la ve como una pregunta más. Con un número sigue yendo a la columna.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

async function enviar(base, t, tag, adhQ, responder){
  const posts = [];
  const cq = { daily: null, checkin: [{ id: 'q1', label: '¿Cómo fue tu semana?', type: 'text' }, adhQ] };
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
    handlers: { '/profiles': profile('client', { coach_id: '33333333-3333-3333-3333-333333333333' }),
      '/coach_questions': (r, J, i) => i.m === 'GET' ? J(i.one ? cq : [cq]) : undefined,
      '/checkins': (r, J, i) => i.m === 'POST' ? (posts.push(JSON.parse(i.body)), r.fulfill({ status: 201, body: '[]' })) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-progreso'); await wait(300);
  await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
  await p.click('[data-action="ci-open"]'); await wait(300);
  await p.fill('textarea[data-k="q1"]', 'Bien');
  await responder(p); await wait(300);
  const marcadas = await p.$$eval('.sc-opt.on', b => b.map(x => x.textContent));
  await p.click('[data-action="ci-save"]'); await wait(2000);
  t.ok(dialogs.some(d => d.includes('Check-in enviado')), tag + ': se envía: ' + JSON.stringify(dialogs));
  t.eq(errs, [], tag + ': errores de la página');
  await close();
  return { marcadas, post: posts[posts.length - 1] || null };
}

export default async function ({ base, t }){
  const label = '¿Cuánto cumpliste el plan?';
  // Opciones con palabras.
  let r = await enviar(base, t, 'palabras', { id: 'adherence', label, type: 'options', options: ['Nada', 'Poco', 'Bastante', 'Todo'] },
    p => p.click('[data-action="ci-opt"][data-k="adherence"][data-v="Bastante"]'));
  t.eq(r.marcadas, ['Bastante'], 'palabras: la opción tocada queda marcada');
  t.eq(r.post && [r.post.adherence, r.post.answers.adherence, r.post.answers.q1], [null, 'Bastante', 'Bien'], 'palabras: la respuesta llega en answers');

  // Respuesta libre con texto.
  r = await enviar(base, t, 'texto', { id: 'adherence', label, type: 'text' },
    async p => { await p.fill('textarea[data-k="adherence"]', 'casi todo'); await p.click('textarea[data-k="q1"]'); });
  t.eq(r.post && [r.post.adherence, r.post.answers.adherence], [null, 'casi todo'], 'texto: no va a la columna numérica, va en answers');

  // Respuesta libre con un número: a la columna, como siempre.
  r = await enviar(base, t, 'texto-número', { id: 'adherence', label, type: 'text' },
    async p => { await p.fill('textarea[data-k="adherence"]', '8'); await p.click('textarea[data-k="q1"]'); });
  t.eq(r.post && [r.post.adherence, 'adherence' in r.post.answers], [8, false], 'texto-número: va a la columna');

  // Las predeterminadas (1 a 10): a la columna.
  r = await enviar(base, t, 'números', { id: 'adherence', label, type: 'options', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
    p => p.click('[data-action="ci-opt"][data-k="adherence"][data-v="9"]'));
  t.eq(r.marcadas, ['9'], 'números: la opción queda marcada');
  t.eq(r.post && [r.post.adherence, 'adherence' in r.post.answers], [9, false], 'números: va a la columna');

  // Lo que ve el coach.
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
    handlers: {
      '/profiles': (r2, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
      '/coach_billing': (r2, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    } });
  await p.goto(base + '/app/'); await wait(3000);
  const vista = await p.evaluate(async () => {
    const { CoachState } = await import('/app/screens/coach/state.js');
    const { renderCoachCheckins } = await import('/app/screens/coach/seguimiento.js');
    const txt = h => { const d = document.createElement('div'); d.innerHTML = h; return d.innerText.replace(/\s+/g, ' ').trim(); };
    CoachState.coachCkSel = '2026-09-21';
    return {
      palabras: txt(renderCoachCheckins({ checkins: [{ week_start: '2026-09-21', adherence: null, answers: { q1: 'Bien', adherence: 'Bastante', _q: { adherence: '¿Cuánto cumpliste el plan?' } } }] })),
      numero: txt(renderCoachCheckins({ checkins: [{ week_start: '2026-09-21', adherence: 8, answers: { q1: 'Bien' } }] })),
    };
  });
  t.has(vista.palabras, 'Bastante', 'coach: ve la adherencia en palabras');
  t.ok(!vista.palabras.includes('/10'), 'coach: no muestra «0/10» con una respuesta en palabras: ' + vista.palabras);
  t.has(vista.numero, 'Adherencia: 8/10', 'coach: con número la ve en el encabezado');
  t.eq(errs, [], 'coach: errores de la página');
  await close();
}
