// Editor de rutina del coach: «Subir», «Bajar» y «Quitar ejercicio» (menú «⋯») no desarman las
// superseries ni meten en ellas a otro ejercicio (app/screens/coach/rutinas.js: moveEx y removeEx).
// En la rutina, ex.ss quiere decir "va con el siguiente". Antes, subir el segundo de una superserie
// la armaba con el ejercicio de abajo, y quitar el último de una superserie metía en ella al de abajo.
// - Adentro de una superserie, subir/bajar cambia el orden y la superserie sigue con los mismos.
// - En la punta, sale la superserie entera; un ejercicio suelto salta la superserie entera.
// - Quitar el último de una superserie deja suelto al de abajo.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const N = { e0: 'Sentadilla libre', e1: 'Prensa 45°', e2: 'Camilla de cuádriceps', e3: 'Sillón de isquiotibiales', e4: 'Gemelos parado' };
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: '', exercises: Object.keys(N).map(id => Object.assign(
  { id, name: N[id], sets: [{ id: id + 's0', kg: '', reps: '', target: '10' }] }, id === 'e2' ? { ss: true } : {})) }]; // Camilla + Sillón

// El día como «id» y «id+» (el + es "va con el siguiente"), y las superseries que se ven en pantalla.
const estado = p => p.evaluate(async () => {
  const { rtDays } = await import('/app/screens/coach/rutinas.js'); const { CoachState } = await import('/app/screens/coach/state.js');
  const ex = rtDays()[CoachState.coachEditDay].exercises;
  return { orden: ex.map(e => e.id + (e.ss ? '+' : '')),
    grupos: [...document.querySelectorAll('.co-ss-group')].map(g => [...g.querySelectorAll('.co-exc')].map(c => c.dataset.id)) };
});
async function accion(p, id, a){
  if (!await p.$(`.co-exc-open[data-id="${id}"]`)){ await p.click(`.co-exc[data-id="${id}"] .co-exc-chev`); await wait(350); }
  await p.click(`.co-exc[data-id="${id}"] .co-exc-menu2 summary`); await wait(250);
  await p.click(`.co-exc[data-id="${id}"] [data-coach="${a}"]`); await wait(400);
}

export default async function ({ base, t }){
  const ACTUAL = rutina();
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1280, height: 900 },
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
  t.eq(await estado(p), { orden: ['e0', 'e1', 'e2+', 'e3', 'e4'], grupos: [['e2', 'e3']] }, 'arranca con la superserie Camilla + Sillón');

  // Subir el segundo de la superserie: cambia el orden adentro y Gemelos no se mete.
  await accion(p, 'e3', 'rt-up');
  t.eq(await estado(p), { orden: ['e0', 'e1', 'e3+', 'e2', 'e4'], grupos: [['e3', 'e2']] }, 'subir el segundo de la superserie: Sillón primero y la superserie sigue con los dos (Gemelos afuera)');
  // Bajar el último (en la punta): baja la superserie entera, sin meter a Gemelos.
  await accion(p, 'e2', 'rt-down');
  t.eq(await estado(p), { orden: ['e0', 'e1', 'e4', 'e3+', 'e2'], grupos: [['e3', 'e2']] }, 'bajar desde la punta mueve la superserie entera debajo de Gemelos');
  // Un suelto que baja salta la superserie entera.
  await accion(p, 'e4', 'rt-up');
  t.eq((await estado(p)).orden, ['e0', 'e4', 'e1', 'e3+', 'e2'], 'Gemelos sube un lugar (suelto con suelto)');
  await accion(p, 'e1', 'rt-down');
  t.eq(await estado(p), { orden: ['e0', 'e4', 'e3+', 'e2', 'e1'], grupos: [['e3', 'e2']] }, 'un suelto que baja salta la superserie entera (no se mete en el medio)');
  // Quitar el último de la superserie: Prensa (abajo) no pasa a la superserie.
  await accion(p, 'e2', 'rt-del');
  t.eq(await estado(p), { orden: ['e0', 'e4', 'e3', 'e1'], grupos: [] }, 'quitar el último de la superserie deja suelto al de abajo');
  t.eq(errs, [], 'errores de la página');
  await close();
}
