// Panel del coach: tocar dos veces «Guardar rutina» mientras se espera la red guarda una sola
// rutina. Antes una rutina nueva (sin id hasta que vuelve el primer guardado) quedaba dos veces
// en «Mis rutinas». Lo mismo con «Guardar rutina programada».
import { newPage, wait, text } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const ACTUAL = [{ id: 'd0', name: 'Full body', subtitle: '', exercises: [{ id: 'e0', name: 'Peso muerto', sets: [{ id: 's0', kg: '', reps: '' }] }] }];
  const tpls = [], tplPosts = [], schedPosts = [];
  // La red tarda: el segundo toque llega antes de que vuelva el primero.
  const lento = (J, o) => new Promise(ok => setTimeout(ok, 800)).then(() => J(o, 201));
  const { p, errs, dialogs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_templates': (r, J, i) => {
        if (i.m === 'GET') return J(tpls);
        const row = Object.assign({ id: 'tpl-' + (tplPosts.length + 1) }, JSON.parse(i.body)); tplPosts.push(row); tpls.push(row);
        return lento(J, [row]);
      },
      '/routine_schedule': (r, J, i) => { if (i.m === 'GET') return J([]); schedPosts.push(i.body); return lento(J, []); },
    } });
  await p.goto(base + '/app/'); await wait(3500);

  // Rutina nueva en «Mis rutinas»: doble toque en «Guardar rutina».
  await p.click('[data-coach="view-tpls"]'); await wait(500);
  await p.click('[data-coach="tpl-new"]'); await wait(300);
  await p.fill('[data-coach="tpl-name"]', 'Fuerza 3 días'); await wait(100);
  await p.dblclick('[data-coach="tpl-save"]'); await wait(2000);
  t.eq(tplPosts.length, 1, 'doble toque: se guarda una sola rutina');
  t.has(await text(p, '#coachHost'), 'Mis rutinas (1)', 'en «Mis rutinas» queda una');
  t.eq(dialogs.filter(d => d.includes('Rutina guardada')).length, 1, 'un solo «Rutina guardada»');

  // Rutina programada para la alumna: doble toque en «Guardar rutina programada».
  await p.click('[data-coach="view-clients"]'); await wait(300);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(400);
  await p.click('[data-coach="sched-new"]'); await wait(700);
  await p.click('[data-coach="sp-copy"]'); await wait(400);
  await p.dblclick('[data-coach="tpl-save"]'); await wait(2500);
  t.eq(schedPosts.length, 1, 'doble toque: se programa una sola vez');
  t.ok(!dialogs.some(d => d.includes('Ya hay otra rutina programada')), 'sin el aviso confuso de otra rutina ese día');
  t.eq(errs, [], 'errores de la página');
  await close();
}
