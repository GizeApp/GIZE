// Coach con el plan vencido hace más de 4 días: la base desvincula a sus alumnos
// (supabase/coach-vencido.sql) y marca coach_left_at. El alumno ve el aviso una sola vez y la
// rutina queda suya para modificarla. Con coach (todavía en los días de gracia) sigue bloqueada.
import { newPage, wait, ALUMNO } from './lib.mjs';

// El perfil se pide con maybeSingle: puede ir como objeto o como lista de uno.
const profile = extra => (r, J, i) => { if (i.m !== 'GET') return undefined; const row = Object.assign({ id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }, extra); return J(i.one ? row : [row]); };

const days = [{ id: 'd1', name: 'Día del coach', exercises: [{ id: 'e1', name: 'Sentadilla', sets: [{ kg: '', reps: '' }] }] }];

export default async function ({ base, t }){
  const left = new Date(Date.now() - 3600e3).toISOString();
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile({ coach_left_at: left }) } });
  await p.goto(base + '/app/'); await wait(2500);
  t.eq(dialogs.filter(d => d.includes('Tu coach ya no está en GIZE')).length, 1, 'aparece el aviso al alumno');
  t.ok(await p.evaluate(() => !!document.querySelector('#view [data-action="addday"]')), 'la rutina se puede modificar (botón para agregar día)');
  await p.reload(); await wait(2500);
  t.eq(dialogs.filter(d => d.includes('Tu coach ya no está en GIZE')).length, 1, 'el aviso sale una sola vez');
  t.eq(errs, [], 'errores de la página');
  await close();

  // Pasó hace más de 30 días (por ejemplo, entra en un celular nuevo): sin aviso.
  const old = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile({ coach_left_at: new Date(Date.now() - 40 * 864e5).toISOString() }) } });
  await old.p.goto(base + '/app/'); await wait(2500);
  t.eq(old.dialogs.filter(d => d.includes('Tu coach ya no está')).length, 0, 'sin aviso si pasó hace mucho');
  await old.close();

  // Todavía vinculado (días de gracia): la rutina sigue en manos del coach y no hay aviso.
  const still = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile({ coach_id: '33333333-3333-3333-3333-333333333333', coach_left_at: left }) } });
  await still.p.goto(base + '/app/'); await wait(2500);
  t.eq(still.dialogs.filter(d => d.includes('Tu coach ya no está')).length, 0, 'con coach no hay aviso');
  t.ok(await still.p.evaluate(() => !document.querySelector('#view [data-action="addday"]')), 'con coach la rutina sigue bloqueada');
  await still.close();
}
