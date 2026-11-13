// Rutina de varias semanas (app/core/ciclo.js): el coach arma semana 1 y semana 2 en el mismo
// editor (barra de semanas arriba de los días), elige desde qué lunes arranca la semana 1, y la
// app del alumno muestra solo los días de la semana que le toca y pasa sola a la otra cada lunes
// (al terminar la última vuelve a la 1). Una rutina de antes, sin semanas, sigue igual.
import { newPage, wait, text, ALUMNO } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const ex = (id, name) => ({ id, name, mus: 'pecho', sets: [{ id: id + 's', kg: '', reps: '', done: false, target: '8-12' }] });
// Hoy en Argentina (lo mismo que usa la app) y el lunes de esta semana y de hace una, en AAAA-MM-DD.
const hoyAR = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const lunes = atras => { const d = hoyAR(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * atras); return ymd(d); };
const T = hoyAR().getDay();
const active = p => p.evaluate(async () => (await import('/app/core/state.js')).State.activeId);
const tabs = p => p.$$eval('#view .tabs .tab:not(.tab-add)', l => l.map(b => b.textContent.trim()));

export default async function ({ base, t }){
  // ---- Las cuentas del módulo ----
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/app/'); await wait(800);
    const r = await p.evaluate(async () => {
      const c = await import('/app/core/ciclo.js');
      const una = [{ id: 'a', name: 'A', exercises: [] }, { id: 'b', name: 'B', exercises: [] }];
      const dos = [{ id: 'a', name: 'A', exercises: [], ciclo: '2026-11-02' }, { id: 'b', name: 'B', semana: 2, exercises: [] }, { id: 'c', name: 'C', semana: 2, exercises: [] }];
      const tres = [{ id: 'a', semana: 1 }, { id: 'b', semana: 2 }, { id: 'c', semana: 3 }];
      const out = {
        n: [c.semanasDe(una), c.semanasDe(dos), c.semanasDe(tres), c.semanasDe([]), c.semanasDe(null)],
        de: [c.semanaDe(una[0]), c.semanaDe(dos[1]), c.semanaDe({ semana: '2' }), c.semanaDe({ semana: 0 }), c.semanaDe(null)],
        lunes: [c.lunesDe('2026-11-12'), c.lunesDe('2026-11-09'), c.lunesDe('2026-11-15'), c.lunesDe('2026-11-16')],
        // Con el inicio el lunes 2/11: esa semana es la 1, la del 9 la 2, la del 16 la 1 de nuevo;
        // antes del inicio también cuenta para atrás (la del 26/10 es la 2).
        actual: ['2026-11-02', '2026-11-08', '2026-11-09', '2026-11-16', '2026-11-25', '2026-10-26'].map(f => c.semanaActual(dos, f)),
        unaSola: c.semanaActual(una, '2026-11-09'),
        // Sin inicio en la rutina: el del bloque; sin bloque, igual en todos lados (determinista).
        bloque: [c.semanaActual(tres, '2026-11-12', { start_date: '2026-11-02' }), c.semanaActual(tres, '2026-11-12', { start_date: '2026-10-26' }), c.semanaActual(tres, '2026-11-12', null), c.semanaActual(tres, '2026-11-12', null)],
        dias: [c.diasDeSemana(dos, 1).map(x => x.id), c.diasDeSemana(dos, 2).map(x => x.id), c.diasDeSemana(una, 2).map(x => x.id), c.diasVisibles(dos, '2026-11-10').map(x => x.id), c.diasVisibles(dos, '2026-11-03').map(x => x.id)],
        // Una semana sin días no deja la pantalla vacía.
        vacia: c.diasVisibles([{ id: 'a', semana: 1, ciclo: '2026-11-02' }, { id: 'b', semana: 3 }], '2026-11-10').map(x => x.id),
        texto: [c.textoSemana(dos, '2026-11-10'), c.textoSemana(una, '2026-11-10')],
        ciclo: [c.cicloDe(dos), c.cicloDe(una), c.cicloDe([{ ciclo: 'ayer' }, { ciclo: '2026-01-05' }])]
      };
      const d3 = JSON.parse(JSON.stringify(tres)); c.asegurarCiclo(d3, '2026-11-12'); out.asegura = d3.map(x => x.ciclo);
      const d1 = JSON.parse(JSON.stringify(una)); c.asegurarCiclo(d1, '2026-11-12'); out.aseguraUna = d1.map(x => x.ciclo || null);
      c.fijarCiclo(d3, null); out.saca = d3.map(x => 'ciclo' in x);
      return out;
    });
    t.eq(r.n, [1, 2, 3, 1, 1], 'semanasDe: la más alta; sin semanas, 1');
    t.eq(r.de, [1, 2, 2, 1, 1], 'semanaDe: 1 si no tiene o es inválida');
    t.eq(r.lunes, ['2026-11-09', '2026-11-09', '2026-11-09', '2026-11-16'], 'lunesDe: el lunes de esa semana (el domingo cuenta para la semana que termina)');
    t.eq(r.actual, [1, 1, 2, 1, 2, 2], 'semanaActual: alterna 1 y 2 cada lunes desde el inicio, también hacia atrás');
    t.eq(r.unaSola, 1, 'con una sola semana siempre es la 1');
    t.eq(r.bloque, [2, 3, r.bloque[2], r.bloque[3]], 'sin inicio en la rutina manda el bloque; sin bloque da siempre lo mismo');
    t.eq(r.dias, [['a'], ['b', 'c'], ['a', 'b'], ['b', 'c'], ['a']], 'diasDeSemana / diasVisibles: los de la semana que toca; con una sola, todos');
    t.eq(r.vacia, ['a', 'b'], 'una semana sin días: se ven todos antes que nada');
    t.eq(r.texto, ['Semana 2 de 2', ''], 'textoSemana');
    t.eq(r.ciclo, ['2026-11-02', null, '2026-01-05'], 'cicloDe: el primer día con una fecha bien escrita');
    t.eq(r.asegura, ['2026-11-09', '2026-11-09', '2026-11-09'], 'asegurarCiclo: sin inicio, arranca el lunes de esta semana, en todos los días');
    t.eq(r.aseguraUna, [null, null], 'con una sola semana no agrega nada');
    t.eq(r.saca, [false, false, false], 'fijarCiclo(null) lo saca');
    t.eq(errs, [], 'errores de la página (módulo)');
    await close();
  }

  // ---- Alumno con coach: ve solo la semana que le toca y puede espiar la otra ----
  {
    // La semana 1 arrancó el lunes pasado: esta semana es la 2. El día de hoy de la semana 2 tiene
    // asignado el día de la semana de hoy; el de la semana 1 también (no tiene que ganar).
    const CLOUD = [
      { id: 'w1a', name: 'Push A', semana: 1, ciclo: lunes(1), dias: [T], exercises: [ex('e1', 'Press plano en Smith')] },
      { id: 'w1b', name: 'Pull A', semana: 1, ciclo: lunes(1), exercises: [ex('e2', 'Jalón prono')] },
      { id: 'w2a', name: 'Pull B', semana: 2, ciclo: lunes(1), dias: [T], exercises: [ex('e3', 'Remo en máquina')] },
      { id: 'w2b', name: 'Push B', semana: 2, ciclo: lunes(1), exercises: [ex('e4', 'Press inclinado en Smith')] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'w1a', name: 'Push A', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Ana Alumna', coach_id: COACH.id }; return J(i.one ? me : [me]); },
        '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: CLOUD, updated_at: '2026-10-01T00:00:00Z' } : [{ days: CLOUD }]) : J([], 201) } });
    await p.goto(base + '/app/'); await wait(3000);
    t.eq(await tabs(p), ['Pull B', 'Push B'], 've solo los días de la semana 2');
    t.eq(await active(p), 'w2a', 'y abre en el día de hoy de esa semana');
    t.has(await text(p, '.sem-ciclo'), 'Semana 2 de 2', 'la cartelera dice en qué semana está');
    t.has(await text(p, '.sem-ciclo'), 'esta semana', 'y que es la de ahora');
    await p.click('.sem-ver[data-w="1"]'); await wait(300);
    t.eq(await tabs(p), ['Push A', 'Pull A'], '«Ver semana 1» muestra los días de la semana 1');
    t.has(await text(p, '.sem-ciclo'), 'Solo para mirar: esta semana te toca la 2', 'avisa que es solo para mirar');
    t.eq(await active(p), 'w1a', 'con el primer día de esa semana abierto');
    await p.click('.sem-ver[data-w="2"]'); await wait(300);
    t.eq(await tabs(p), ['Pull B', 'Push B'], '«Volver a la semana 2» vuelve');
    t.eq(await p.$$eval('#view .tabs .tab-add', l => l.length), 0, 'con coach no agrega días');
    t.eq(errs, [], 'errores de la página (alumno con coach)');
    await close();
  }

  // ---- Alumno sin semanas: nada cambia ----
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Torso', exercises: [ex('e1', 'Press plano en Smith')] }, { id: 'd2', name: 'Pierna', exercises: [] }], sessions: [], weights: [], daily: {}, sex: 'x' },
      handlers: { '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); } } });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(await tabs(p), ['Torso', 'Pierna'], 'una rutina de una semana muestra todos sus días');
    t.ok(!(await p.$('.sem-ciclo')), 'sin cartelera de semanas');
    t.eq(errs, [], 'errores de la página (sin semanas)');
    await close();
  }

  // ---- Editor del coach: semana 1 y semana 2 ----
  {
    const ACTUAL = [{ id: 'd0', name: 'Torso', subtitle: '', exercises: [ex('x1', 'Press plano en Smith')] }, { id: 'd1', name: 'Pierna', subtitle: '', exercises: [ex('x2', 'Sentadilla hack')] }];
    const ups = [];
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1280, height: 900 },
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/routines': (r, J, i) => { if (i.m === 'GET') return J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]); ups.push(JSON.parse(i.body)); return J([], 201); },
        '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
      } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
    const dtabs = () => p.$$eval('.co-daytab[data-coach="edit-day"]', l => l.map(b => b.firstChild.textContent.trim()));
    const wtabs = () => p.$$eval('.co-weektab[data-coach="edit-week"]', l => l.map(b => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')));
    const dias = () => p.evaluate(async () => (await import('/app/screens/coach/state.js')).CoachState.coachData.routine.map(d => [d.name, d.semana || null, d.ciclo || null]));
    t.eq(await wtabs(), [], 'una rutina de una semana no tiene pestañas de semanas');
    t.ok(await p.isVisible('.co-weekbar.solo [data-coach="week-add"]'), 'pero sí «+ Semana»');
    t.eq(await dtabs(), ['Torso', 'Pierna'], 'sus dos días');
    // «+ Semana»: la 2 arranca como copia de la 1 y la semana 1 arranca este lunes.
    await p.click('[data-coach="week-add"]'); await wait(400);
    t.eq(await wtabs(), ['Semana 1', 'Semana 2*'], 'aparecen las dos semanas y queda abierta la 2');
    t.eq(await dtabs(), ['Torso', 'Pierna'], 'la semana 2 arranca con los mismos días');
    t.eq(await dias(), [['Torso', 1, lunes(0)], ['Pierna', 1, lunes(0)], ['Torso', 2, lunes(0)], ['Pierna', 2, lunes(0)]], 'los días de antes son de la semana 1, las copias de la 2, y la semana 1 arranca este lunes');
    t.eq(await p.$eval('[data-coach="ciclo-inicio"]', e => e.value), lunes(0), 'el campo del lunes de inicio lo muestra');
    t.has(await text(p, '.co-week-txt'), 'semana 1', 'y dice que hoy el alumno está en la semana 1');
    const copiaIds = await p.evaluate(async () => { const R = (await import('/app/screens/coach/state.js')).CoachState.coachData.routine; return [R[2].id !== R[0].id, R[2].exercises[0].id !== R[0].exercises[0].id, R[2].exercises[0].name]; });
    t.eq(copiaIds, [true, true, 'Press plano en Smith'], 'las copias tienen ids nuevos y los mismos ejercicios');
    // Renombrar un día de la semana 2 no toca el de la 1.
    await p.fill('[data-coach="day-name"]', 'Torso B'); await wait(200);
    t.eq((await dias()).map(d => d[0]), ['Torso', 'Pierna', 'Torso B', 'Pierna'], 'el nombre cambia solo en la semana 2');
    // Un día nuevo en la semana 2 es de la semana 2.
    await p.click('.co-daytab.add[data-coach="day-add"]'); await wait(300);
    t.eq((await dias()).slice(-1), [['Nuevo día', 2, lunes(0)]], 'el día nuevo es de la semana abierta');
    t.eq(await dtabs(), ['Torso B', 'Pierna', 'Nuevo día'], 'y se ve en sus pestañas');
    // Moverlo a la semana 1 (está en el menú «•••» del día).
    await p.click('.co-day-bar details.co-day-menu > summary'); await wait(200);
    await p.click('[data-coach="day-move-week"][data-w="1"]'); await wait(300);
    t.eq(await wtabs(), ['Semana 1*', 'Semana 2'], 'al moverlo se abre la semana 1');
    t.eq(await dtabs(), ['Torso', 'Pierna', 'Nuevo día'], 'con el día movido');
    // Cambiar el lunes de inicio: la semana pasada → hoy el alumno está en la semana 2.
    await p.fill('[data-coach="ciclo-inicio"]', lunes(1)); await p.dispatchEvent('[data-coach="ciclo-inicio"]', 'change'); await wait(300);
    t.has(await text(p, '.co-week-txt'), 'semana 2', 'con el inicio la semana pasada, hoy el alumno está en la semana 2');
    t.ok((await dias()).every(d => d[2] === lunes(1)), 'el inicio va en todos los días');
    // Guardar: viaja con semana y lunes de inicio.
    await p.click('[data-coach="save-routine"]'); await wait(800);
    t.eq(ups.length, 1, 'se guarda una vez');
    const subida = (Array.isArray(ups[0]) ? ups[0][0] : ups[0]).days;
    t.eq(subida.map(d => [d.name, d.semana, d.ciclo]), [['Torso', 1, lunes(1)], ['Pierna', 1, lunes(1)], ['Torso B', 2, lunes(1)], ['Pierna', 2, lunes(1)], ['Nuevo día', 1, lunes(1)]], 'lo guardado tiene la semana de cada día y el lunes de inicio');
    // Quitar la semana 2: vuelve a ser una rutina de una semana, sin «semana» ni inicio.
    await p.click('[data-coach="edit-week"][data-w="2"]'); await wait(200);
    await p.click('[data-coach="week-del"]'); await wait(500);
    t.eq(await wtabs(), [], 'sin la semana 2 no quedan pestañas de semanas');
    t.eq(await dias(), [['Torso', null, null], ['Pierna', null, null], ['Nuevo día', null, null]], 'quedan los días de la semana 1, sin semana ni inicio');
    t.eq(errs, [], 'errores de la página (editor del coach)');
    await close();
  }
}
