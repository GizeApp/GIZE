// Ficha del alumno (coach): Disponibilidad va de 1 a 7 días por semana, y en Etapa no se repite
// la definición («Déficit» era lo mismo). Un «Déficit» guardado de antes se sigue viendo.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const { p, errs, close } = await newPage({ user: COACH, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  } });
  await p.goto(base + '/app/'); await wait(3000);
  const r = await p.evaluate(async () => {
    const { renderCoachInfo } = await import('/app/screens/coach/clientes.js');
    const opts = (info, k) => { const d = document.createElement('div'); d.innerHTML = renderCoachInfo({ info }); return [...d.querySelectorAll('select[data-coach="info-' + k + '"] option')].map(o => o.textContent).filter(x => x !== '—'); };
    return { disp: opts({}, 'availability'), etapa: opts({}, 'stage'), viejo: opts({ stage: 'Déficit' }, 'stage') };
  });
  t.eq(r.disp, ['1 día / semana', '2 días / semana', '3 días / semana', '4 días / semana', '5 días / semana', '6 días / semana', '7 días / semana'], 'disponibilidad de 1 a 7 días');
  t.eq(r.etapa, ['Volumen', 'Mantenimiento', 'Recomposición', 'Definición'], 'etapa sin repetir la definición');
  t.ok(r.viejo.includes('Déficit'), 'un «Déficit» guardado de antes se sigue mostrando');
  t.eq(errs, [], 'errores de la página');
  await close();
}
