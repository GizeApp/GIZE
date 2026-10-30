// Widget «GIZE de hoy»: lo que arma app/core/widgetdatos.js, sin pantalla (el puente con el plugin y
// los toques están en tests/widget.test.mjs).
// · El JSON: v = 1, de hoy a hoy+7 (8 días, cruzando el fin de mes) y sinDatos, siempre con las
//   claves de CLAVES_WIDGET (el contrato con el widget de Android y el de iPhone) y sus tipos.
// · Entreno de hoy, en orden: entrenando (reloj de menos de 6 h, como en Entreno), hecho, el que
//   toca por día de la semana, descanso, el que sigue al último guardado (rutina que rota) o sin
//   rutina. Los días que vienen, por su día de la semana y con la rutina de descarga del bloque.
// · Racha: hoy, mañana «¡Entrá hoy!» (sigue en juego) y desde pasado «Se apagó».
// · Pasos: con Salud conectada, los de hoy con la meta, los miles con punto y la hora de la lectura;
//   los días que vienen «— · Abrí GIZE»; sin Salud, «Conectá tus pasos».
// · Coach y panel del gimnasio: solo el aviso, sin nada de la rutina.
// · Los toques: gize://widget/(hoy|entreno|pasos|racha)[?dia=id], y un id raro no hace nada.
import { CLAVES_WIDGET, DESTINOS_WIDGET, DIAS_WIDGET, WIDGET_V, armarWidget, leerEnlaceWidget } from '../app/core/widgetdatos.js';

const HOY = '2026-10-28'; // miércoles (3)
const AHORA = new Date(2026, 9, 28, 18, 0).getTime();
const ex = (id, done) => ({ id, name: 'Ej ' + id, sets: [{ id: id + 's', kg: '50', reps: '10', done: !!done }] });
const A = (o = {}) => Object.assign({ id: 'dA', name: 'Día A', exercises: [ex('a1'), ex('a2')] }, o);
const B = (o = {}) => Object.assign({ id: 'dB', name: 'Día B', exercises: [ex('b1')] }, o);
const C = (o = {}) => Object.assign({ id: 'dC', name: 'Día C', exercises: [ex('c1'), ex('c2'), ex('c3')] }, o);
const SALUD = { prendida: true, lectura: new Date(2026, 9, 28, 14, 32).getTime() };
const arma = (st, o = {}) => armarWidget(Object.assign({ hoy: HOY, ahora: AHORA, modo: 'alumno', st, racha: 12, salud: SALUD }, o));
const hoy = (st, o) => arma(st, o).dias[HOY];
const ent = (st, o) => hoy(st, o).entreno;
const FECHAS = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];

// Las claves y los tipos de un Dia, como los leen Java y Swift.
function revisar(t, dia, que){
  const k = o => o && typeof o === 'object' ? Object.keys(o) : null;
  t.eq(k(dia), CLAVES_WIDGET.dia, que + ': las claves del día');
  t.eq(k(dia.pasos), CLAVES_WIDGET.pasos, que + ': las claves de pasos');
  t.eq(k(dia.racha), CLAVES_WIDGET.racha, que + ': las claves de racha');
  t.eq(k(dia.entreno), CLAVES_WIDGET.entreno, que + ': las claves de entreno');
  if (dia.aviso !== null) t.eq(k(dia.aviso), CLAVES_WIDGET.aviso, que + ': las claves del aviso');
  const p = dia.pasos, r = dia.racha, e = dia.entreno;
  t.ok(typeof p.txt === 'string' && typeof p.pie === 'string' && Number.isInteger(p.pct) && p.pct >= 0 && p.pct <= 100, que + ': tipos de pasos ' + JSON.stringify(p));
  t.ok(typeof r.txt === 'string' && typeof r.pie === 'string' && typeof r.prendida === 'boolean', que + ': tipos de racha ' + JSON.stringify(r));
  t.ok(['titulo', 'nombre', 'detalle', 'dia'].every(x => typeof e[x] === 'string') && typeof e.hecho === 'boolean', que + ': tipos de entreno ' + JSON.stringify(e));
  t.ok(e.dia === '' || /^[A-Za-z0-9_-]{1,64}$/.test(e.dia), que + ': el id del día sirve para el link');
  if (dia.aviso !== null) t.ok(['titulo', 'texto', 'pie'].every(x => typeof dia.aviso[x] === 'string'), que + ': tipos del aviso');
}

export default async function ({ t }){
  // ---- El JSON ----
  t.eq([WIDGET_V, DIAS_WIDGET, DESTINOS_WIDGET], [1, 8, ['hoy', 'entreno', 'pasos', 'racha']], 'versión 1, 8 días y los cuatro destinos');
  const w = arma({ days: [A({ dias: [3] }), B()], sessions: [], stepsDate: HOY, steps: 6543, stepsGoal: 10000 });
  t.eq(Object.keys(w), CLAVES_WIDGET.raiz, 'las claves de arriba: v, dias y sinDatos');
  t.eq(w.v, 1, 'v = 1');
  t.eq(Object.keys(w.dias), FECHAS, 'de hoy a hoy+7, cruzando el fin de mes');
  Object.entries(w.dias).forEach(([f, d]) => { revisar(t, d, f); t.eq(d.aviso, null, f + ': sin aviso'); });
  revisar(t, w.sinDatos, 'sinDatos');
  t.eq(w.sinDatos.aviso, { titulo: 'GIZE', texto: 'Abrí GIZE para ver tu día', pie: '' }, 'sinDatos: «Abrí GIZE para ver tu día» (pasaron más de 8 días)');
  t.ok(JSON.stringify(w).length < 6000, 'el JSON es chico: ' + JSON.stringify(w).length);
  t.eq(JSON.stringify(arma({ days: [A()] })), JSON.stringify(arma({ days: [A()] })), 'lo mismo arma lo mismo (así no se vuelve a mandar)');
  t.ok(!!armarWidget({ hoy: HOY, ahora: AHORA, modo: 'alumno', st: {}, racha: 0, salud: null }).dias[HOY], 'con un estado vacío no se rompe');

  // ---- Entreno de hoy ----
  t.eq(ent({ days: [A({ dias: [3] }), B({ dias: [5] })] }), { titulo: 'Hoy toca', nombre: 'Día A', detalle: '2 ejercicios', hecho: false, dia: 'dA' }, 'toca: el día con el miércoles asignado');
  t.eq(ent({ days: [A({ dias: [1] }), C({ dias: [3, 5] })] }).detalle, '3 ejercicios', 'toca: con varios días de la semana');
  t.eq(ent({ days: [A({ dias: [1] }), B({ dias: [5] })] }), { titulo: 'Hoy', nombre: 'Descanso', detalle: '', hecho: false, dia: '' }, 'descanso: todos tienen días y ninguno es hoy');
  t.eq(ent({ days: [A({ dias: [1] }), B({ dias: [5] }), { id: 'dV', name: 'Vacío', exercises: [] }] }).nombre, 'Descanso', 'descanso: un día vacío sin días no cuenta');
  // Rotación: el que sigue al último guardado, en el orden de las pestañas.
  const rot = { days: [A(), B(), C()] };
  t.eq(ent(Object.assign({ sessions: [] }, rot)), { titulo: 'Te toca', nombre: 'Día A', detalle: '2 ejercicios', hecho: false, dia: 'dA' }, 'rota sin entrenos guardados: el primero');
  t.eq(ent(Object.assign({ sessions: [{ date: '2026-10-26', ts: 1, day: 'Día A', exercises: [] }] }, rot)).nombre, 'Día B', 'rota: después del A, el B');
  t.eq(ent(Object.assign({ sessions: [{ date: '2026-10-27', ts: 5, day: 'Día C' }, { date: '2026-10-25', ts: 9, day: 'Día B' }] }, rot)).nombre, 'Día A', 'rota: el último es el de la fecha más nueva (C) y vuelve al A');
  t.eq(ent(Object.assign({ sessions: [{ date: '2026-10-27', ts: 1, day: 'Otro nombre' }] }, rot)).nombre, 'Día A', 'rota: un día que ya no está, el primero');
  t.eq(ent({ days: [A(), B({ dias: [1] }), C()], sessions: [{ date: '2026-10-27', day: 'Día B' }] }).nombre, 'Día A', 'rota con días mezclados: en el orden de las pestañas (B el lunes, A, C)');
  t.eq(ent({ days: [{ id: 'd1', name: 'Día 1', exercises: [] }] }), { titulo: 'Elegí tu rutina', nombre: '', detalle: '', hecho: false, dia: '' }, 'sin rutina: «Elegí tu rutina»');
  t.eq(ent({}), { titulo: 'Elegí tu rutina', nombre: '', detalle: '', hecho: false, dia: '' }, 'sin días: «Elegí tu rutina»');
  // Hecho hoy: el último guardado hoy.
  const hecho = { days: [A({ dias: [3] }), B()], sessions: [{ date: HOY, ts: AHORA - 9e6, day: 'Día B', exercises: [{ name: 'x' }] }, { date: HOY, ts: AHORA - 3e6, day: 'Día A', exercises: [{ name: 'x' }, { name: 'y' }, { name: 'z' }] }] };
  t.eq(ent(hecho), { titulo: 'Hecho hoy ✓', nombre: 'Día A', detalle: '3 ejercicios', hecho: true, dia: 'dA' }, 'hecho: después de guardar el entreno de hoy');
  t.eq(ent({ days: [A()], sessions: [{ date: HOY, day: 'Ya no está', exercises: [{}] }] }), { titulo: 'Hecho hoy ✓', nombre: 'Ya no está', detalle: '1 ejercicio', hecho: true, dia: '' }, 'hecho con un día que ya no está: sin link al día');
  // Entrenando: reloj de menos de 6 h con una serie tildada o «Iniciar entrenamiento».
  const wk = (ts, o) => ({ wkStart: Object.assign({ date: HOY, day: 'dB', ts }, o) });
  t.eq(ent(Object.assign({ days: [A({ dias: [3] }), B({ exercises: [ex('b1', true)] })] }, wk(AHORA - 25 * 60000))), { titulo: 'Entrenando', nombre: 'Día B', detalle: '1 ejercicio', hecho: false, dia: 'dB' }, 'entrenando: con una serie tildada');
  t.eq(ent(Object.assign({ days: [A({ dias: [3] }), B()] }, wk(AHORA - 25 * 60000, { manual: true }))).titulo, 'Entrenando', 'entrenando: con «Iniciar entrenamiento»');
  t.eq(ent(Object.assign({ days: [A({ dias: [3] }), B()] }, wk(AHORA - 25 * 60000))).titulo, 'Hoy toca', 'empezado sin series tildadas: no cuenta');
  t.eq(ent(Object.assign({ days: [A({ dias: [3] }), B({ exercises: [ex('b1', true)] })] }, wk(AHORA - 7 * 3600000))).titulo, 'Hoy toca', 'un reloj de hace más de 6 h quedó olvidado: no cuenta');
  t.eq(ent(Object.assign({}, hecho, wk(AHORA - 60000, { manual: true }))).titulo, 'Entrenando', 'entrenando va antes que hecho (otro entreno el mismo día)');
  // Nombres e ids.
  t.eq(ent({ days: [{ id: 'x', name: '  ', dias: [3], exercises: [ex('q')] }] }).nombre, 'Día 1', 'un día sin nombre: «Día 1»');
  t.eq(ent({ days: [{ id: 'a b<c>', name: 'Raro', dias: [3], exercises: [ex('q')] }] }).dia, '', 'un id raro no va al link');
  t.eq(ent({ days: [{ id: 'z', name: 'N'.repeat(90), dias: [3], exercises: [ex('q')] }] }).nombre.length, 60, 'un nombre larguísimo se corta');

  // ---- Los días que vienen ----
  const sem = arma({ days: [A({ dias: [3] }), B({ dias: [5] }), C({ dias: [0] })], sessions: [{ date: HOY, day: 'Día A', exercises: [{}] }] });
  t.eq(FECHAS.map(f => sem.dias[f].entreno.titulo + ' ' + sem.dias[f].entreno.nombre),
    ['Hecho hoy ✓ Día A', 'Hoy Descanso', 'Hoy toca Día B', 'Hoy Descanso', 'Hoy toca Día C', 'Hoy Descanso', 'Hoy Descanso', 'Hoy toca Día A'],
    'la semana: cada día por su día de la semana (hecho solo hoy)');
  const rota = arma({ days: [A(), B(), C()], sessions: [{ date: HOY, day: 'Día A', exercises: [{}] }] });
  t.eq(FECHAS.slice(0, 3).map(f => rota.dias[f].entreno.titulo + ' ' + rota.dias[f].entreno.nombre), ['Hecho hoy ✓ Día A', 'Te toca Día B', 'Te toca Día B'],
    'rutina que rota: mañana el que sigue al de hoy (y sigue ese hasta que lo guarde)');
  const wkMañana = arma(Object.assign({ days: [A({ dias: [3] }), B({ dias: [4], exercises: [ex('b1', true)] })] }, wk(AHORA - 60000)));
  t.eq([wkMañana.dias[HOY].entreno.titulo, wkMañana.dias['2026-10-29'].entreno.titulo], ['Entrenando', 'Hoy toca'], 'entrenando es solo hoy');
  // Bloque con semana de descarga (alumno con coach): la semana 2 va con la rutina de descarga.
  const REG = [A({ dias: [3] }), B({ dias: [5] })];
  const DESC = [{ id: 'dX', name: 'Descarga', dias: [1, 3], exercises: [ex('x1')] }];
  const block = { id: 'b1', start_date: '2026-10-26', weeks: 4, deloads: [2], deload_routines: { 2: { days: DESC, start: '2026-10-26' } } };
  const blq = arma({ days: REG, regularDays: REG, routineMode: 'regular', block });
  t.eq(FECHAS.map(f => blq.dias[f].entreno.nombre), ['Día A', 'Descanso', 'Día B', 'Descanso', 'Descanso', 'Descarga', 'Descanso', 'Descarga'], 'desde el lunes de la semana de descarga, la rutina de descarga');
  t.eq(blq.dias['2026-11-02'].entreno.dia, 'dX', 'con el id del día de la de descarga');
  // Ya en la descarga: la semana siguiente vuelve la de siempre.
  const block2 = Object.assign({}, block, { start_date: '2026-10-19', deload_routines: { 2: { days: DESC, start: '2026-10-19' } } });
  const enDesc = arma({ days: DESC, regularDays: REG, routineMode: 'descarga:b1:2', block: block2 });
  t.eq(FECHAS.map(f => enDesc.dias[f].entreno.nombre), ['Descarga', 'Descanso', 'Descanso', 'Descanso', 'Descanso', 'Descanso', 'Descanso', 'Día A'], 'en la descarga: hasta el domingo la de descarga y desde el lunes la de siempre');
  t.eq(FECHAS.map(f => arma({ days: [A({ dias: [1] })], block }).dias[f].entreno.nombre).filter(n => n === 'Descarga').length, 0, 'sin rutina del coach, el bloque no cambia nada');

  // ---- Racha ----
  t.eq(FECHAS.slice(0, 4).map(f => w.dias[f].racha), [
    { txt: '12', pie: 'días seguidos', prendida: true }, { txt: '12', pie: '¡Entrá hoy!', prendida: true },
    { txt: '0', pie: 'Se apagó', prendida: false }, { txt: '0', pie: 'Se apagó', prendida: false }], 'racha: hoy, mañana en juego y después apagada');
  t.eq(hoy({}, { racha: 1 }).racha, { txt: '1', pie: 'día seguido', prendida: true }, 'racha de 1: «día seguido»');
  t.eq(arma({}, { racha: 0 }).dias['2026-10-30'].racha, { txt: '0', pie: '¡Entrá hoy!', prendida: false }, 'sin racha no dice que se apagó');

  // ---- Pasos ----
  t.eq(w.dias[HOY].pasos, { txt: '6.543', pie: 'de 10.000 · 14:32', pct: 65 }, 'pasos de hoy: miles con punto, la meta y la hora de la lectura');
  t.eq(FECHAS.slice(1).map(f => w.dias[f].pasos), Array(7).fill({ txt: '—', pie: 'Abrí GIZE', pct: 0 }), 'los días que vienen: «— · Abrí GIZE»');
  t.eq(hoy({ stepsDate: '2026-10-27', steps: 9000, stepsGoal: 8000 }).pasos, { txt: '0', pie: 'de 8.000 · 14:32', pct: 0 }, 'los pasos de ayer no son los de hoy');
  t.eq(hoy({ stepsDate: HOY, steps: 12345, stepsGoal: 8000 }).pasos.pct, 100, 'pasada la meta: 100');
  t.eq(hoy({ stepsDate: HOY, steps: 1234567 }).pasos.txt, '1.234.567', 'millones');
  t.eq(hoy({ stepsDate: HOY, steps: 500 }, { salud: { prendida: true, lectura: new Date(2026, 9, 27, 23, 50).getTime() } }).pasos.pie, 'de 10.000', 'una lectura de ayer no da la hora');
  t.eq(hoy({ stepsDate: HOY, steps: 500 }, { salud: { prendida: true, lectura: 0 } }).pasos, { txt: '500', pie: 'de 10.000', pct: 5 }, 'sin lectura en esta apertura: sin hora');
  const sinSalud = arma({ stepsDate: HOY, steps: 6543 }, { salud: { prendida: false } });
  t.eq(FECHAS.map(f => sinSalud.dias[f].pasos), Array(8).fill({ txt: 'Conectá', pie: 'tus pasos', pct: 0 }), 'sin Salud conectada: «Conectá tus pasos» (sin el número)');

  // ---- Coach y gimnasio ----
  const st = { days: [A({ dias: [3] })], sessions: [{ date: HOY, day: 'Rutina de Martina', exercises: [{}] }], stepsDate: HOY, steps: 999 };
  for (const [modo, txt] of [['coach', 'Tu panel de coach'], ['gimnasio', 'Tu panel del gimnasio']]){
    const c = arma(st, { modo });
    t.eq(c.dias, {}, modo + ': sin días');
    revisar(t, c.sinDatos, modo);
    t.eq(c.sinDatos.aviso, { titulo: 'GIZE', texto: txt, pie: 'Tocá para abrir' }, modo + ': «' + txt + ' · Tocá para abrir»');
    t.ok(!/Martina|Día A|999/.test(JSON.stringify(c)), modo + ': nada de la rutina, los entrenos ni los pasos');
  }

  // ---- Los toques ----
  t.eq(['gize://widget/hoy', 'gize://widget/entreno', 'gize://widget/entreno?dia=d2', 'gize://widget/pasos', 'gize://widget/racha', 'gize://widget/entreno?dia=', 'gize://widget/entreno/?dia=A_b-9'].map(leerEnlaceWidget), [
    { destino: 'hoy', dia: '' }, { destino: 'entreno', dia: '' }, { destino: 'entreno', dia: 'd2' }, { destino: 'pasos', dia: '' },
    { destino: 'racha', dia: '' }, { destino: 'entreno', dia: '' }, { destino: 'entreno', dia: 'A_b-9' }], 'los links del widget');
  t.eq(['gize://widget/entreno?dia=../x', 'gize://widget/entreno?dia=' + 'a'.repeat(65), 'gize://widget/entreno?dia=d2&otro=1', 'gize://widget/comida', 'gize://login?code=1',
    'gize://confirmado', 'https://gize.ar/widget/hoy', 'GIZE://widget/hoy', '', null, undefined].map(leerEnlaceWidget), Array(11).fill(null),
    'un id raro, otro destino, otro link o nada: no se hace nada');
}
