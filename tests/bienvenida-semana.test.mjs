// Bienvenida de quien entrena solo: «Empezar vacío» arma la semana en 2 pasos (días y objetivo),
// los días quedan como Día 1, Día 2…, y la cuenta nueva no trae ninguna rutina de ejemplo cargada.
import { newPage, saved, wait, ALUMNO } from './lib.mjs';

export default async function ({ base, t }){
  const user = Object.assign({ created_at: new Date(Date.now() - 3600e3).toISOString() }, ALUMNO);
  const perfil = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null };
  const { p, errs, close } = await newPage({ user, handlers: { '/profiles': (r, J, i) => i.m === 'GET' ? J(i.one ? perfil : [perfil]) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);

  const antes = await saved(p);
  t.eq((antes.days || []).map(d => [d.name, (d.exercises || []).length]), [['Día 1', 0]], 'cuenta nueva: arranca con un día vacío');

  await p.click('[data-onb="start"]'); await wait(400);
  await p.click('[data-onb="solo"]'); await wait(400);
  await p.click('[data-onb="start"][data-v="vacio"]'); await p.click('[data-onb="next"]'); await wait(400);
  t.has(await p.textContent('.onb-step-lbl'), 'Paso 1 de 2', 'el armado tiene 2 pasos');
  await p.click('[data-onb="days"][data-v="3"]'); await p.click('[data-onb="wnext"]'); await wait(400);
  t.has(await p.textContent('.onb-step-lbl'), 'Paso 2 de 2', 'segundo paso: el objetivo');
  await p.click('[data-onb="goal"][data-v="grasa"]'); await wait(200);
  t.has(await p.textContent('[data-onb="wnext"]'), 'Empezar', 'el objetivo es el último paso');
  await p.click('[data-onb="wnext"]'); await wait(800);
  t.ok(!(await p.$('#onbFirst')), 'ya no pregunta el nombre del primer día');

  const st = await saved(p);
  t.eq(st.days.map(d => [d.name, d.exercises.length]), [['Día 1', 0], ['Día 2', 0], ['Día 3', 0]], 'semana de 3 días vacíos');
  t.eq(st.goal, 'grasa', 'se guarda el objetivo');

  // Rutinas armadas sin catálogo en la base: las de ejemplo de la app, sin el Meso 2.
  await p.click('[data-action="open-routines"]'); await wait(400);
  await p.click('[data-onb="sex"][data-v="x"]'); await wait(800);
  const lista = await p.textContent('.onb-routines');
  t.has(lista, 'PPL', 'rutinas de ejemplo');
  t.ok(!/Microciclo|Meso/i.test(lista), 'el Meso 2 · Microciclo 8 ya no está entre las rutinas armadas: ' + lista);
  t.eq(errs, [], 'errores de la página');
  await close();
}
