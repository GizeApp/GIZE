// Rutina propia (alumno sin coach) en dos dispositivos con la misma nube. El celular B quedó
// abierto con la rutina vieja mientras en A se agregó un ejercicio: anotar agua en B o volver
// a primer plano al día siguiente no sube la vieja encima de la nueva, B toma la de la nube,
// y lo que se edita en B sí se sube. Si cambiaron los dos lados, gana el cambio más nuevo.
import { newPage, wait, saved, ALUMNO, profile, openAllEx } from './lib.mjs';

const R0 = [{ id: 'd1', name: 'Pierna', exercises: [{ id: 'e1', name: 'Sentadilla libre', mus: 'cuadriceps', sets: [{ id: 's1', kg: '100', reps: '5', done: false }] }] }];
// "Ejercicio:series" de cada ejercicio del primer día.
const shape = days => days[0].exercises.map(e => e.name + ':' + e.sets.length);
// La nube guarda la rutina como jsonb, que devuelve las claves en otro orden (más cortas primero).
const jsonb = v => Array.isArray(v) ? v.map(jsonb) : (v && typeof v === 'object')
  ? Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map(k => [k, jsonb(v[k])])) : v;

export default async function ({ base, t }){
  const cloud = { routine: { days: jsonb(R0), updated_at: new Date(Date.now() - 3600e3).toISOString() }, down: false, delay: 0 };
  const posts = { A: [], B: [] };
  const routines = who => (r, J, i) => {
    if (cloud.down) return r.abort(); // sin señal
    if (i.m === 'GET') return wait(cloud.delay).then(() => J(i.one ? cloud.routine : [cloud.routine]));
    const b = JSON.parse(i.body), row = Array.isArray(b) ? b[0] : b;
    posts[who].push(shape(row.days).join(', '));
    cloud.routine = { days: jsonb(row.days), updated_at: row.updated_at };
    return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  };
  const open = async who => {
    const d = await newPage({ user: ALUMNO, state: { days: R0, sessions: [], weights: [], daily: {}, calTarget: 2000 },
      handlers: { '/profiles': profile('client'), '/routines': routines(who) } });
    await d.p.goto(base + '/app/'); await wait(2500);
    return d;
  };
  // Vuelve a primer plano; con nuevoDia, como si fuera el día siguiente (dispara el save() de la racha).
  const volver = (p, nuevoDia) => p.evaluate(async nd => {
    if (nd) {
      const { state } = await import('/app/core/state.js'), y = '2020-01-01';
      state.waterDate = state.diaryDate = state.stepsDate = state.habitsDate = y;
      state.visits = (state.visits || []).filter(d => d === y);
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, nuevoDia);
  const cloudShape = () => shape(cloud.routine.days);

  const B = await open('B'), A = await open('A');

  // 1) En A se agrega un ejercicio y se sube.
  await A.p.click('[data-action="ex-add-open"]'); await wait(500);
  const nuevo = await A.p.getAttribute('.ex-pick', 'data-name');
  await A.p.click('.ex-pick'); await wait(2500);
  const sA = shape((await saved(A.p)).days);
  t.eq(sA.length, 2, 'A tiene el ejercicio nuevo');
  t.eq(cloudShape(), sA, 'A sube la rutina con el ejercicio nuevo');

  // 2) B (con la vieja) anota agua: no sube la rutina.
  await B.p.click('#nav-comida'); await wait(600);
  await B.p.click('[data-action="water-add"][data-n="250"]'); await wait(2500);
  t.eq(posts.B, [], 'anotar agua en B no sube la rutina');
  t.eq(cloudShape(), sA, 'después del agua en B, la nube conserva el ejercicio nuevo');

  // 3) B vuelve a primer plano al día siguiente, sin tocar nada: toma la de la nube.
  await volver(B.p, true); await wait(2500);
  t.eq(posts.B, [], 'volver a primer plano en un día nuevo no sube la rutina vieja');
  t.eq(cloudShape(), sA, 'la nube sigue con el ejercicio nuevo');
  t.eq(shape((await saved(B.p)).days), sA, 'B toma la rutina nueva de la nube (y la guarda)');
  await B.p.click('#nav-entreno'); await wait(600); await openAllEx(B.p);
  t.eq(await B.p.$$eval('#view .ex-name', els => els.map(e => e.value)), ['Sentadilla libre', nuevo], 'B muestra el ejercicio nuevo');

  // 4) Editar la rutina en B sí se sube (sobre la nueva).
  await openAllEx(B.p); await B.p.click('[data-action="addset"]'); await wait(2500);
  const sB = shape((await saved(B.p)).days);
  t.eq(posts.B.length, 1, 'agregar una serie en B sube la rutina');
  t.eq(cloudShape(), sB, 'la nube tiene la serie de B y el ejercicio de A');
  t.eq(sB.length, 2, 'la rutina de B conserva el ejercicio de A');

  // Sin cambios en ningún lado (la nube devuelve las claves en otro orden): no toca nada.
  t.eq(await B.p.evaluate(async () => { const m = await import('/app/core/supabase.js'); return m.refreshOwnRoutine ? m.refreshOwnRoutine() : 'no existe'; }), false,
    'volver a primer plano sin cambios no cambia la rutina');
  t.eq(posts.B.length, 1, 'ni la vuelve a subir');

  // 5) A vuelve a primer plano: toma la serie de B sin subir nada.
  await volver(A.p, false); await wait(1500);
  t.eq(shape((await saved(A.p)).days), sB, 'A toma de la nube la serie que agregó B');
  t.eq(posts.A.length, 1, 'A no vuelve a subir la rutina');

  // 6) Cambiaron los dos y la nube es más nueva: B agregó una serie sin señal, después A agregó
  //    otra. B vuelve al día siguiente con la conexión lenta (el save() de la racha sale mientras
  //    lee la nube): se queda con la de A y no la pisa.
  cloud.down = true;
  await openAllEx(B.p); await B.p.click('[data-action="addset"]'); await wait(2000);
  cloud.down = false;
  await A.p.click('#nav-entreno'); await wait(300); await openAllEx(A.p);
  await openAllEx(A.p); await A.p.locator('[data-action="addset"]').nth(1).click(); await wait(2500);
  const sA2 = cloudShape();
  t.eq(posts.A.length, 2, 'A sube su serie');
  cloud.delay = 2500;
  await volver(B.p, true); await wait(4500);
  cloud.delay = 0;
  t.eq(posts.B.length, 1, 'B no sube su cambio más viejo');
  t.eq(cloudShape(), sA2, 'la nube conserva el cambio más nuevo (el de A)');
  t.eq(shape((await saved(B.p)).days), sA2, 'B se queda con el cambio más nuevo');

  // 7) Cambiaron los dos y el de acá es más nuevo: A agrega una serie, después B otra sin señal.
  //    Al volver B con señal, se sube la de B.
  await openAllEx(A.p); await A.p.locator('[data-action="addset"]').nth(1).click(); await wait(2500);
  cloud.down = true;
  await openAllEx(B.p); await B.p.click('[data-action="addset"]'); await wait(2000);
  cloud.down = false;
  const sB2 = shape((await saved(B.p)).days);
  await volver(B.p, false); await wait(2500);
  t.eq(posts.B.length, 2, 'B sube su cambio más nuevo al volver');
  t.eq(cloudShape(), sB2, 'la nube queda con el cambio de B');

  t.eq(A.errs.concat(B.errs), [], 'errores de las páginas');
  await A.close(); await B.close();

  // 8) Rutina vieja en la nube que migrateNames corrige (un ejercicio sin 'mus', un día con id
  //    raro): se sube corregida una sola vez y volver a primer plano no la vuelve a tomar (antes
  //    la tomaba en cada vuelta, le cambiaba el id al día y el alumno saltaba al primer día).
  const VIEJA = [{ id: 'dia 1', name: 'Pierna', exercises: [{ id: 'e1', name: 'Sentadilla libre', sets: [{ id: 's1', kg: '100', reps: '5', done: false }] }] },
    { id: 'd2', name: 'Torso', exercises: [{ id: 'e2', name: 'Press de banca plano (barra)', mus: 'pecho', sets: [{ id: 's2', kg: '60', reps: '8', done: false }] }] }];
  cloud.routine = { days: jsonb(VIEJA), updated_at: new Date(Date.now() - 3600e3).toISOString() };
  posts.C = [];
  const C = await newPage({ user: ALUMNO, state: { days: VIEJA, sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: { '/profiles': profile('client'), '/routines': routines('C') } });
  await C.p.goto(base + '/app/'); await wait(2500);
  t.eq(posts.C.length, 1, 'la rutina corregida se sube una vez al abrir');
  const vueltas = [];
  for (let k = 0; k < 3; k++) {
    vueltas.push(await C.p.evaluate(async () => {
      const { State, state } = await import('/app/core/state.js'), m = await import('/app/core/supabase.js');
      State.activeId = state.days[1].id; const id0 = state.days[0].id;
      const r = await m.refreshOwnRoutine();
      return [r, State.activeId === state.days[1].id, state.days[0].id === id0];
    }));
    await wait(1600);
  }
  t.eq(vueltas, [[false, true, true], [false, true, true], [false, true, true]], 'volver a primer plano no la vuelve a tomar: sigue en el día elegido y con los mismos ids');
  t.eq(posts.C.length, 1, 'ni la vuelve a subir');
  // Si la vuelve a escribir así otro dispositivo (una versión vieja de la app), se toma una vez,
  // se sube corregida y las vueltas siguientes ya no cambian nada.
  cloud.routine = { days: jsonb(VIEJA), updated_at: new Date().toISOString() };
  const refresh = () => C.p.evaluate(async () => (await import('/app/core/supabase.js')).refreshOwnRoutine());
  t.eq(await refresh(), true, 'toma la rutina que cambió en la nube');
  await wait(2000);
  t.eq(posts.C.length, 2, 'y sube la corregida una vez');
  t.eq([await refresh(), await refresh()], [false, false], 'las vueltas siguientes no la vuelven a tomar');
  await wait(1600);
  t.eq(posts.C.length, 2, 'ni la vuelven a subir');
  t.eq(C.errs, [], 'errores de la página C');
  await C.close();
}
