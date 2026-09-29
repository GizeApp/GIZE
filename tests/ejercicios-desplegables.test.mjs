// Entreno: los ejercicios arrancan cerrados (una fila con el nombre, las series y una flechita)
// y se abren y cierran con la flecha. Pedido: las cajas ocupaban demasiado lugar.
import { newPage, wait, saved, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [
    { id: 'e1', name: 'Press de banca plano (barra)', sets: [{ id: 's1', kg: '80', reps: '8' }, { id: 's2', kg: '80', reps: '8' }] },
    { id: 'e2', name: 'Remo con barra', ss: true, sets: [{ id: 's3', kg: '', reps: '' }] },
    { id: 'e3', name: 'Jalón al pecho', sets: [{ id: 's4', kg: '', reps: '' }] },
    { id: 'e4', name: 'Curl con barra', sets: [{ id: 's5', kg: '30', reps: '10', done: true }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  const view = () => p.evaluate(() => ({
    open: [...document.querySelectorAll('#view .card[data-ex-id]')].map(c => c.dataset.exId),
    closed: [...document.querySelectorAll('#view .ex-collapsed')].map(r => r.dataset.ex),
    meta: [...document.querySelectorAll('#view .ex-collapsed .ex-collapsed-best')].map(e => e.textContent.trim()),
    chev: document.querySelectorAll('#view .ex-collapsed .ex-chev svg').length,
    inputs: document.querySelectorAll('#view input.kg').length }));

  let v = await view();
  t.eq(v.open, [], 'al abrir la app ningún ejercicio está desplegado');
  t.eq(v.closed, ['e1', 'e2', 'e3', 'e4'], 'todos aparecen como filas cerradas');
  t.eq(v.chev, 4, 'cada fila tiene su flechita');
  t.eq(v.meta, ['2 series', '1 serie', '1 serie', '30 kg × 10'], 'la fila dice cuántas series (o la mejor, si ya terminó)');
  t.eq(v.inputs, 0, 'cerrados no muestran los campos de kg');

  await p.click('.ex-collapsed[data-ex="e1"]'); await wait(300);
  v = await view();
  t.eq(v.open, ['e1'], 'tocar la fila abre ese ejercicio');
  t.ok(await p.$('.card[data-ex-id="e1"] [data-action="ex-collapse"]'), 'abierto tiene la flecha para cerrarlo');

  // Superserie (Remo + Jalón): se abre entera, así la pantalla pasa de uno al otro.
  // Uno abierto a la vez: abrir otro cierra el anterior. Una superserie (Remo + Jalón) se abre
  // entera, así la pantalla pasa de uno al otro.
  await p.click('.ex-collapsed[data-ex="e3"]'); await wait(300);
  v = await view();
  t.eq(v.open, ['e2', 'e3'], 'abrir otro cierra el anterior; la superserie se abre entera');

  await p.click('.card[data-ex-id="e2"] [data-action="ex-collapse"]'); await wait(500);
  v = await view();
  t.eq(v.open, [], 'y se cierra entera con la flecha');

  await p.click('.ex-collapsed[data-ex="e4"]'); await wait(300);
  await p.click('.ex-collapsed[data-ex="e1"]'); await wait(300);
  t.eq((await view()).open, ['e1'], 'abrir el 1 cierra el que estaba abierto');

  // Tildar la última serie cierra solo el ejercicio terminado.
  await p.click('[data-action="toggle"][data-set="s1"]'); await wait(300);
  t.eq((await view()).open, ['e1'], 'con series pendientes sigue abierto');
  await p.click('[data-action="toggle"][data-set="s2"]'); await wait(900);
  v = await view();
  t.eq(v.open, [], 'terminado se cierra solo');
  t.ok(v.meta[0].includes('80 kg × 8'), 'y la fila muestra la mejor serie: ' + v.meta[0]);
  t.eq((await saved(p)).days[0].exercises[0].sets.map(s => !!s.done), [true, true], 'las series quedaron tildadas');

  // Teclado: Enter sobre la fila la abre.
  await p.focus('.ex-collapsed[data-ex="e4"]'); await p.keyboard.press('Enter'); await wait(300);
  t.eq((await view()).open, ['e4'], 'Enter abre el ejercicio');

  // Al volver a abrir la app, todo cerrado otra vez.
  await p.reload(); await wait(2500);
  t.eq((await view()).open, [], 'al volver a abrir la app aparecen cerrados');
  t.eq(errs, [], 'errores de la página');
  await close();
}
