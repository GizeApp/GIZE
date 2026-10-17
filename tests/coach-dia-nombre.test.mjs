// Editor de rutina del coach: al escribir el nombre del día, su pestaña cambia mientras se escribe.
// Antes la pestaña seguía con el nombre viejo hasta que algo redibujara el editor, y parecía que el
// cambio no se había tomado.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const rutina = () => [{ id: 'd0', name: 'Día A', subtitle: '', dias: [1], exercises: [] }, { id: 'd1', name: 'Día B', subtitle: '', exercises: [] }];

export default async function ({ base, t }){
  const ACTUAL = rutina();
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1280, height: 800 },
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
    } });
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
  const tabs = () => p.$$eval('.co-daytab[data-coach="edit-day"]', l => l.map(b => b.textContent.trim()));
  await p.fill('[data-coach="day-name"]', 'Pierna y glúteos'); await wait(200);
  t.eq(await tabs(), ['Pierna y glúteosLunes', 'Día B'], 'la pestaña muestra el nombre nuevo mientras se escribe (con sus días abajo)');
  t.eq(await p.$eval('[data-coach="day-name"]', e => e === document.activeElement), true, 'el campo sigue con el foco');
  await p.fill('[data-coach="day-name"]', ''); await wait(200);
  t.eq((await tabs())[0], 'Día 1Lunes', 'sin nombre, la pestaña dice «Día 1»');
  t.eq(errs, [], 'errores de la página');
  await close();
}
