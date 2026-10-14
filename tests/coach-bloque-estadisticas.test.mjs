// Panel del coach: «Bloque / mesociclo» está en la pestaña Estadísticas del alumno (el rediseño del
// panel lo había dejado sin tarjeta y no había forma de llegar al bloque ni a las rutinas de
// descarga). Al volver de una rutina de descarga, la app queda en Estadísticas → Bloque.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const ACTUAL = [{ id: 'd0', name: 'Full body', subtitle: '', exercises: [{ id: 'e0', name: 'Peso muerto', sets: [{ id: 's0', kg: '', reps: '' }] }] }];
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
    } });
  const st = () => p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); return { tab: CoachState.coachClientTab, sec: CoachState.coachSec }; });
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);

  // En Ficha no está; en Estadísticas sí, y abre el bloque.
  await p.click('[data-coach="client-tab"][data-t="ficha"]'); await wait(300);
  t.ok(!(await p.$('[data-coach="sec-open"][data-v="bloque"]')), 'la pestaña Ficha no tiene la tarjeta del bloque');
  await p.click('[data-coach="client-tab"][data-t="stats"]'); await wait(300);
  const tiles = await p.$$eval('[data-coach="sec-open"]', bs => bs.map(b => b.dataset.v));
  t.eq(tiles[0], 'bloque', 'Estadísticas empieza con «Bloque / mesociclo»: ' + tiles.join(', '));
  await p.click('[data-coach="sec-open"][data-v="bloque"]'); await wait(300);
  t.ok(await p.$('[data-coach="blk-name"]'), 'la tarjeta abre el bloque (nombre, semanas, descargas)');
  t.eq(await st(), { tab: 'stats', sec: 'bloque' }, 'queda en Estadísticas → Bloque');
  await p.click('[data-coach="sec-close"]'); await wait(300);
  t.eq((await st()).tab, 'stats', '«‹» vuelve al menú de Estadísticas');

  // Volver de una rutina de descarga (sin cambios) deja Estadísticas → Bloque abierto.
  await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); const { renderCoach } = await import('/app/screens/coach/index.js');
    CoachState.coachClientTab = 'ficha'; CoachState.coachSec = null;
    CoachState.coachTplEdit = { id: null, name: 'Descarga semana 4', deload: true, wk: 4, days: [], orig: '[]' }; renderCoach(); }); await wait(300);
  await p.click('[data-coach="tpl-back"]'); await wait(400);
  t.eq(await st(), { tab: 'stats', sec: 'bloque' }, 'al volver de la rutina de descarga queda en Estadísticas → Bloque');
  t.eq(errs, [], 'errores de la página');
  await close();
}
