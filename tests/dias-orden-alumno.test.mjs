// La app del alumno con los días de su coach cargados en otro orden (lo que vio el dueño: «Legs» del
// martes primero, después «Pull 1» del miércoles y «Push 1» del lunes). Las pestañas de Entreno van
// de lunes a domingo; al borrar un día queda el primero de la fila; y si el día elegido ya no existe
// (y ninguno es de hoy), abre el primero de la fila.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ex = (id, name) => ({ id, name, sets: [{ id: id + 's', kg: '', reps: '', done: false }] });
const dias = () => [
  { id: 'legs', name: 'Legs', dias: [2], exercises: [ex('a', 'Sentadilla libre')] },
  { id: 'pull', name: 'Pull 1', dias: [3], exercises: [ex('b', 'Remo con barra')] },
  { id: 'push', name: 'Push 1', dias: [1], exercises: [ex('c', 'Press banca plano con barra')] },
];
const pestanas = p => p.$$eval('.tab[data-action="tab"]', l => l.map(b => b.textContent.trim()));
const activo = p => p.evaluate(async () => (await import('/app/core/state.js')).State.activeId);

export default async function ({ base, t }){
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: dias(), sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(await pestanas(p), ['Push 1', 'Legs', 'Pull 1'], 'alumno: Push 1 (lunes), Legs (martes), Pull 1 (miércoles)');
    await p.click('.tab[data-day="pull"]'); await wait(400);
    t.eq(await activo(p), 'pull', 'alumno: tocar Pull 1 lo abre');
    // Borrar el día abierto: queda el primero de la fila (Push 1), no el primero cargado (Legs).
    p.on('dialog', d => d.accept());
    const borrar = await p.$('[data-action="delday"]');
    if (borrar){ await borrar.click(); await wait(300); const ok = await p.$('.av-bg [data-av="ok"], .av-bg .av-ok'); if (ok) await ok.click(); await wait(500);
      t.eq(await activo(p), 'push', 'alumno: al borrar un día queda el primero de la fila'); }
    t.eq(errs, [], 'errores de la página (alumno)');
    await close();
  }
  {
    // Un día elegido que ya no está (la rutina cambió): vuelve al primero de la fila. Hoy no es lunes,
    // martes ni miércoles para que no elija «el de hoy»: se usan días que no tocan hoy.
    const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })).getDay();
    const otros = [1, 2, 3, 4, 5, 6, 0].filter(n => n !== hoy); // de lunes a domingo, sin hoy
    const D = [{ id: 'x', name: 'Segundo', dias: [otros[2]], exercises: [] }, { id: 'y', name: 'Primero', dias: [otros[0]], exercises: [] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: D, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(await activo(p), 'y', 'sin día de hoy: abre el primero de la fila (no el primero cargado)');
    t.eq(errs, [], 'errores de la página (sin día de hoy)');
    await close();
  }
}
