// Alumno con coach en medio de un entreno: si el coach le aplica una rutina nueva (series con otros
// ids), al volver a la app (o al reabrirla) se reemplazaba la rutina y se perdía lo cargado hoy, que
// todavía no estaba guardado. Ahora la nueva espera a que termine el entreno: se aplica al cerrar la
// ventana de «¡Entreno terminado!» («Seguir entrenando» encuentra las series como estaban).
// Además, el cronómetro de una serie por tiempo tilda la serie aunque en el medio la rutina se haya
// vuelto a armar (con coach pasa en cada vuelta a la app).
import { newPage, saved, wait, ALUMNO } from './lib.mjs';

const COACH_ID = '33333333-3333-3333-3333-333333333333';
const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: COACH_ID };
const perfil = (r, J, i) => i.m === 'GET' ? J(i.one ? me : [me]) : undefined;
const visible = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const st0 = (days, extra) => Object.assign({ days, regularDays: JSON.parse(JSON.stringify(days)), routineMode: 'regular', sessions: [], weights: [], daily: {} }, extra);

export default async function ({ base, t }){
  // ---- Rutina nueva del coach durante el entreno ----
  {
    const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca plano (barra)', sets: [{ id: 's1', kg: '80', reps: '8', done: true }, { id: 's2', kg: '80', reps: '8', done: false }] }] }];
    const NUEVA = [{ id: 'n1', name: 'Torso nuevo', exercises: [{ id: 'ne1', name: 'Press plano con mancuernas', sets: [{ id: 'ns1', target: '10' }, { id: 'ns2', target: '10' }] }] }];
    let cloud = days;
    const { p, errs, close } = await newPage({ user: ALUMNO, state: st0(days, { wkStart: { date: '2000-01-01', day: 'd1', ts: Date.now() - 15 * 60000 } }),
      handlers: { '/profiles': perfil, '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: cloud } : [{ days: cloud }]) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    cloud = NUEVA;
    await visible(p); await wait(800);
    let st = await saved(p);
    t.eq(st.days[0].exercises[0].sets.map(s => [s.id, s.kg, !!s.done]), [['s1', '80', true], ['s2', '80', false]], 'entrenando: no se borra lo cargado hoy');
    t.ok(st.routinePending, 'la rutina nueva queda esperando');
    t.eq(st.regularDays[0].id, 'n1', 'la rutina nueva queda guardada');
    // Al reabrir la app, igual.
    await p.reload(); await wait(2500);
    st = await saved(p);
    t.eq(st.days[0].exercises[0].sets.map(s => [s.id, !!s.done]), [['s1', true], ['s2', false]], 'al reabrir la app tampoco se borra');
    // Guardar: se guarda lo de hoy; con la ventana abierta, «Seguir entrenando» vuelve a todo como estaba.
    await p.click('[data-action="save-session"]'); await wait(800);
    st = await saved(p);
    t.eq(st.sessions.map(s => s.exercises.map(e => e.name + ' ' + e.sets.map(x => x.kg + 'x' + x.reps).join(','))), [['Press de banca plano (barra) 80x8']], 'se guarda el entreno de hoy');
    t.eq(st.days[0].id, 'd1', 'con la ventana de «¡Entreno terminado!» abierta todavía no cambia');
    await p.click('#fbHost [data-action="fb-undo"]'); await wait(500);
    st = await saved(p);
    t.eq([st.sessions.length, st.days[0].exercises[0].sets.map(s => !!s.done)], [0, [true, false]], '«Seguir entrenando»: vuelven las series como estaban');
    await wait(1200);
    await p.click('[data-action="save-session"]'); await wait(800);
    await p.click('#fbHost [data-action="fb-skip"]'); await wait(500);
    st = await saved(p);
    t.eq([st.sessions.length, st.days[0].id, st.days[0].exercises[0].sets.map(s => s.id)], [1, 'n1', ['ns1', 'ns2']], 'terminado el entreno, pasa a la rutina nueva');
    t.ok(!st.routinePending, 'y ya no queda esperando');
    t.eq(errs, [], 'rutina nueva: errores de la página');
    await close();
  }

  // ---- El coach cambia algo sin rutina nueva: se aplica como siempre (conserva lo cargado) ----
  {
    const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca plano (barra)', sets: [{ id: 's1', kg: '80', reps: '8', done: true }] }] }];
    let cloud = days;
    const { p, errs, close } = await newPage({ user: ALUMNO, state: st0(days, { wkStart: { date: '2000-01-01', day: 'd1', ts: Date.now() - 15 * 60000 } }),
      handlers: { '/profiles': perfil, '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: cloud } : [{ days: cloud }]) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    cloud = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca plano (barra)', note: 'Bajá lento', sets: [{ id: 's1', target: '6-8' }] }, { id: 'e2', name: 'Remo con barra', sets: [{ id: 's9', target: '10' }] }] }];
    await visible(p); await wait(800);
    const st = await saved(p);
    t.eq([st.days[0].exercises.length, st.days[0].exercises[0].note, st.days[0].exercises[0].sets.map(s => [s.target, s.kg, !!s.done])], [2, 'Bajá lento', [['6-8', '80', true]]], 'cambios del coach a la misma rutina: se aplican ya, con lo cargado');
    t.ok(!st.routinePending, 'no queda nada esperando');
    t.eq(errs, [], 'mismos ids: errores de la página');
    await close();
  }

  // ---- Cronómetro de una serie por tiempo mientras la rutina se vuelve a armar ----
  {
    const days = [{ id: 'd1', name: 'Core', exercises: [{ id: 'e1', name: 'Plancha', sets: [{ id: 't1', kg: '', secs: '', target: '3' }, { id: 't2', kg: '', secs: '', target: '3' }] }] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: st0(days),
      handlers: { '/profiles': perfil, '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days } : [{ days }]) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('.ex-collapsed[data-ex="e1"]'); await wait(300);
    await p.click('[data-action="set-timer"][data-set="t1"]'); await wait(300);
    await visible(p); await wait(4000);
    const st = await saved(p);
    t.eq(st.days[0].exercises[0].sets.map(s => [s.secs, !!s.done]), [['3', true], ['', false]], 'al terminar el cronómetro la serie queda tildada con sus segundos');
    t.eq(errs, [], 'cronómetro: errores de la página');
    await close();
  }
}
