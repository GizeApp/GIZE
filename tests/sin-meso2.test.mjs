// La rutina «Meso 2 · Microciclo 8» ya no se ofrece: ni para importar en «Mis rutinas» del
// coach ni entre las rutinas armadas de ejemplo. «Importar PPL · 5 días» sigue.
import { newPage, wait, text } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const { p, errs, close } = await newPage({ user: COACH, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  } });
  await p.goto(base + '/app/'); await wait(3500);
  await p.click('[data-coach="view-tpls"]'); await wait(800);
  const txt = await text(p, '#coachHost');
  t.ok(!/Meso 2/.test(txt), 'no está «Importar Meso 2 · Microciclo 8»');
  t.ok(!(await p.$('[data-coach="tpl-seed"]')), 'no hay botón para importarla');
  t.ok(/Importar PPL/.test(txt), 'sigue «Importar PPL · 5 días»');
  const cat = await p.evaluate(async () => (await import('/app/core/rutinas-ejemplo.js')).CATALOGO.map(r => r.nombre));
  t.ok(!cat.some(n => /Meso 2/.test(n)), 'tampoco está entre las rutinas armadas de ejemplo: ' + cat.join(', '));
  t.eq(errs, [], 'errores de la página');
  await close();
}
