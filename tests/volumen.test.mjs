// Volumen semanal: las hiperextensiones suman a dos barras (espalda baja e isquios), pero el
// total de series cuenta cada serie una vez, igual que la tarjeta de Progreso y la del coach.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const S = n => Array.from({ length: n }, (_, i) => ({ id: 'x' + n + i, kg: '', reps: '' }));
const days = [{ id: 'd1', name: 'Dia', exercises: [
  { id: 'e1', name: 'Hiperextensiones', sets: S(3) },
  { id: 'e2', name: 'Curl femoral acostado', sets: S(2) }] }];

export default async function ({ base, t }){
  // Alumno
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': profile('client'),
        '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days, updated_at: new Date().toISOString() } : [{ days, updated_at: new Date().toISOString() }]) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    t.eq(await text(p, '[data-action="psec-open"][data-v="volumen"] .ptile-s'), '5 series por semana', 'tarjeta de Volumen semanal');
    await p.click('[data-action="psec-open"][data-v="volumen"]'); await wait(300);
    t.has(await text(p, '.vol-sub'), '5 series por semana', 'adentro, el mismo total que la tarjeta');
    t.eq(await p.$$eval('.vol-row', l => l.map(r => r.innerText.replace(/\s+/g, ' ').trim())), ['Isquios 5', 'Espalda baja 3'], 'las barras siguen sumando a los dos grupos');
    t.eq(errs, [], 'errores de la página (alumno)');
    await close();
  }
  // Coach: la misma rutina en la ficha del alumno.
  {
    const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
    const A1 = '44444444-4444-4444-4444-444444444444';
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/routines': (r, J, i) => i.m === 'GET' && /client_id=eq\.4444/.test(i.url.search) ? J(i.one ? { days } : [{ days }]) : undefined,
      } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    t.eq(await text(p, '[data-coach="sec-open"][data-v="volumen"] .ptile-s'), '5 series por semana', 'coach: tarjeta de Volumen semanal');
    await p.click('[data-coach="sec-open"][data-v="volumen"]'); await wait(400);
    t.has(await text(p, '.vol-sub'), '5 series por semana', 'coach: adentro, el mismo total que la tarjeta');
    t.eq(errs, [], 'errores de la página (coach)');
    await close();
  }
}
