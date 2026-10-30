// El borrador de la IA del coach → días de GIZE (app/core/rutina-borrador.js), en Node (utils.js,
// data.js y diasemana.js no necesitan navegador). Revisa: ids que pasan routine_days_ok
// (supabase/ejercicio-audio.sql), el nombre exacto de la lista aunque venga en mayúsculas, sin
// tildes o con un nombre viejo, el grupo (pickMuscle), las series con su objetivo y su carga,
// descanso, RIR, nota y progresión, superseries, días de la semana, por tiempo, propios (planillas)
// o afuera, videos solo https, lo que hay que revisar y los topes. Al final, la cadena entera: lo
// que contesta la IA → rutinaPost (supabase/functions/ia/rutina.ts) → diasDesdeIA.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EX_DB, EX_CATS, ES_MAP } from '../app/core/data.js';
import { diasDesdeIA } from '../app/core/rutina-borrador.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async ({ t }) => {
  const ej = o => Object.assign({ nombre: 'Remo T', grupo: 'espalda', propio: false, dudoso: false, series: [{ objetivo: '8-10', kg: '' }], timed: false, descanso: '', rir: '', nota: '', progresion: '', ss: false }, o);
  const dia = (ejercicios, o) => Object.assign({ nombre: 'Día', dias: [], nota: '', ejercicios }, o);
  const borr = (dias, o) => Object.assign({ hay_rutina: true, nombre: 'Rutina', nota: '', dias }, o);
  const de = (b, o) => diasDesdeIA(b, o).days;

  // Ids nuevos y válidos para la nube (también si el borrador trae ids raros).
  const b0 = borr([dia([ej({ id: '"><img>' }), ej({ nombre: 'Curl con barra', series: [{ objetivo: '10', kg: '' }, { objetivo: '8', kg: '' }] })], { id: 'x y' })]);
  const d0 = de(b0);
  const ids = d0.flatMap(d => [d.id, ...d.exercises.flatMap(e => [e.id, ...e.sets.map(s => s.id)])]);
  t.ok(ids.length === 6 && ids.every(i => ID.test(i)), 'días, ejercicios y series con ids que pasan routine_days_ok: ' + ids.join(' '));
  t.eq(new Set(ids).size, ids.length, 'ids sin repetir');
  t.eq(Object.keys(d0[0]).sort(), ['exercises', 'id', 'name', 'subtitle'], 'un día de GIZE: id, name, subtitle y exercises');
  t.eq(d0[0].exercises[0], { id: d0[0].exercises[0].id, name: 'Remo T', sets: [{ id: d0[0].exercises[0].sets[0].id, kg: '', reps: '', targetKg: '', done: false, target: '8-10' }], mus: 'espalda' },
    'un ejercicio sin nada más: solo nombre, series y grupo');

  // El nombre exacto de la lista.
  const nombres = de(borr([dia([ej({ nombre: 'press PLANO con  mancuernas' }), ej({ nombre: 'Press de banca plano (barra)' }), ej({ nombre: 'Curl Bayesian', grupo: 'biceps' }),
    ej({ nombre: 'Hip Thrust', grupo: 'gluteos' }), ej({ nombre: 'pullover EN polea' })])]))[0].exercises.map(e => e.name);
  t.eq(nombres, ['Press plano con mancuernas', 'Press de banca plano (barra)', 'Curl en polea detrás del cuerpo', 'Empuje de cadera', 'Pullover en polea'],
    'nombre exacto de EX_DB (mayúsculas, espacios y nombres viejos; «Pullover en polea» está en la lista aunque ES_MAP lo renombre a uno que no está)');
  const todos = new Set(Object.values(EX_DB).flat());
  t.ok(nombres.every(n => todos.has(n)), 'todos de la lista');

  // El grupo.
  const mus = de(borr([dia([ej({ nombre: 'Curl martillo', grupo: 'antebrazo' }), ej({ nombre: 'Curl martillo', grupo: 'biceps' }), ej({ nombre: 'Curl martillo', grupo: 'pecho' }),
    ej({ nombre: 'Curl martillo', grupo: '' }), ej({ nombre: 'Aductores', grupo: 'gluteos' })])]))[0].exercises.map(e => e.mus);
  t.eq(mus, ['antebrazo', 'biceps', 'biceps', 'biceps', 'aductores'], 'grupo con pickMuscle: el elegido si el ejercicio está ahí, si no el suyo');
  // Un grupo que no es de la lista no rompe nada ni queda como grupo (tampoco los nombres que tiene
  // cualquier objeto, como «__proto__» o «constructor»).
  let raros = null;
  try { raros = de(borr([dia(['__proto__', 'constructor', 'toString'].flatMap(g => [ej({ grupo: g }), ej({ nombre: 'Algo raro', grupo: g })]))]), { propios: true })[0].exercises.map(e => e.mus); }
  catch (e) { raros = 'se rompe: ' + e.message; }
  t.eq(raros, ['espalda', undefined, 'espalda', undefined, 'espalda', undefined], 'grupos que no son de la lista: el del ejercicio, o ninguno si es propio');

  // Series, descanso, RIR, nota, progresión.
  const e1 = de(borr([dia([ej({ series: [{ objetivo: '10', kg: '60' }, { objetivo: '8', kg: '65' }, { objetivo: '6', kg: '' }], descanso: "2'-3'", rir: '2-1', nota: 'Bajar lento', progresion: 'Sumar 2,5 kg por semana' })])]))[0].exercises[0];
  t.eq(e1.sets.map(s => [s.target, s.targetKg]), [['10', '60'], ['8', '65'], ['6', '']], 'una serie por cada una, con su objetivo y su carga');
  t.ok(e1.sets.every(s => s.kg === '' && s.reps === '' && s.done === false), 'series sin hacer');
  t.eq([e1.rest, e1.rir, e1.note, e1.goal], ["2'-3'", '2-1', 'Bajar lento', 'Sumar 2,5 kg por semana'], 'descanso, RIR, nota y objetivo de progreso');
  const e2 = de(borr([dia([ej({ series: [] })])]))[0].exercises[0];
  t.eq(e2.sets.length, 3, 'sin series: 3 vacías');
  t.ok(!('target' in e2.sets[0]), 'sin objetivo');
  t.eq(de(borr([dia([ej({ series: Array.from({ length: 15 }, () => ({ objetivo: '5', kg: '' })) })])]))[0].exercises[0].sets.length, 10, 'hasta 10 series');

  // Superseries.
  const ss = de(borr([dia([ej({ ss: true }), ej({ nombre: 'Inventado', ss: false }), ej({ nombre: 'Jalón al pecho', ss: true }), ej({ nombre: 'Inventado', ss: true }),
    ej({ nombre: 'Press Arnold', ss: true }), ej({ nombre: 'Curl con barra', ss: true })])]))[0].exercises;
  t.eq(ss.map(e => [e.name, !!e.ss]), [['Remo T', false], ['Jalón al pecho', true], ['Press Arnold', true], ['Curl con barra', false]],
    'superseries: el último nunca; si se saca el que seguía, sigue unida solo si el sacado también iba con el siguiente');
  t.ok(!('ss' in ss[0]) && !('ss' in ss[3]), 'sin ss: el campo no va');

  // Días de la semana, nombre y nota del día.
  const ds = de(borr([dia([ej()], { nombre: 'Torso A', dias: [0, 4, 1, 1, 9, 'x'], nota: 'Calentar bien' }), dia([ej()], { nombre: '', dias: [] }), dia([], { nombre: 'Vacío', dias: [2] }),
    dia([ej({ nombre: 'Inventado' })], { nombre: 'Sin nada de la lista' }), dia([ej()], { nombre: 'x'.repeat(100) })]));
  t.eq(ds.map(d => [d.name.length > 20 ? d.name.length : d.name, d.dias, d.note]), [['Torso A', [1, 4, 0], 'Calentar bien'], ['Día 2', undefined, undefined], [60, undefined, undefined]],
    'días de la semana (0-6, de lunes a domingo, sin repetir), «Día N» sin nombre, nota; días vacíos afuera; nombre hasta 60');

  // Por tiempo: solo si las series lo son y el nombre no lo dice.
  const tm = de(borr([dia([ej({ nombre: 'Sentadilla libre', timed: true }), ej({ nombre: 'Plancha', timed: true }), ej({ nombre: 'Remo T', timed: false })])]))[0].exercises;
  t.eq(tm.map(e => e.timed), [true, undefined, undefined], 'timed solo cuando hace falta');

  // Propios (planillas) o afuera.
  const pr = borr([dia([ej(), ej({ nombre: 'Burpee con giro', grupo: 'crossfit', propio: true }), ej({ nombre: 'Algo raro', grupo: 'inventado', propio: true })])]);
  t.eq(de(pr)[0].exercises.map(e => e.name), ['Remo T'], 'sin propios, lo que no está en la lista se saca');
  t.eq(de(pr, { propios: true })[0].exercises.map(e => [e.name, e.mus]), [['Remo T', 'espalda'], ['Burpee con giro', 'crossfit'], ['Algo raro', undefined]],
    'con propios quedan con su nombre y el grupo si es de la lista');
  t.eq(de(borr([dia([ej({ nombre: 'Inventado' })])])), [], 'sin ningún ejercicio de la lista: ningún día');

  // Videos de la planilla, solo https.
  const links = { 3: 'https://youtu.be/abc', 4: 'http://youtu.be/abc', 5: 'javascript:alert(1)', 6: 'https://x.test/a b' };
  const vid = de(borr([dia([3, 4, 5, 6, 7].map(f => ej({ fila: f })).concat(ej()))]), { links })[0].exercises.map(e => e.video);
  t.eq(vid, ['https://youtu.be/abc', undefined, undefined, undefined, undefined, undefined], 'video de la fila solo si es https');
  t.ok(!('video' in de(borr([dia([ej({ fila: 3 })])]))[0].exercises[0]), 'sin links, sin video');

  // Lo que hay que revisar.
  const rv = diasDesdeIA(borr([dia([ej({ dudoso: true }), ej(), ej({ nombre: 'Inventado', dudoso: true }), ej({ nombre: 'Jalón al pecho', dudoso: true })])]));
  t.eq(rv.revisar, [rv.days[0].exercises[0].id, rv.days[0].exercises[2].id], 'revisar: los ids de los que quedaron y la IA marcó como dudosos');

  // Topes.
  const muchos = n => Array.from({ length: n }, () => ej());
  const tp = de(borr(Array.from({ length: 16 }, () => dia(muchos(30)))));
  t.eq([tp.length, tp[0].exercises.length], [14, 25], 'hasta 14 días y 25 ejercicios por día');

  // Textos largos y raros.
  const lg = de(borr([dia([ej({ descanso: 'x'.repeat(50), rir: 'x'.repeat(50), nota: 'x'.repeat(500), progresion: 'x'.repeat(500), nombre: 'Algo ' + 'y'.repeat(100), series: [{ objetivo: 'z'.repeat(50), kg: '9'.repeat(50) }] })])]), { propios: true })[0].exercises[0];
  t.eq([lg.rest.length, lg.rir.length, lg.note.length, lg.goal.length, lg.name.length, lg.sets[0].target.length, lg.sets[0].targetKg.length], [20, 10, 160, 120, 60, 20, 10], 'textos recortados');
  t.eq(diasDesdeIA(null), { days: [], revisar: [] }, 'sin borrador: nada');
  t.eq(diasDesdeIA({ dias: [null, { ejercicios: [null, 7, ej()] }] }).days[0].exercises.length, 1, 'lo que no es un objeto se saltea');

  // No toca el borrador.
  const orig = borr([dia([ej({ ss: true }), ej({ nombre: 'Inventado' })])]), copia = JSON.stringify(orig);
  diasDesdeIA(orig);
  t.eq(JSON.stringify(orig), copia, 'el borrador queda igual');

  // ---------- la cadena entera ----------
  const R = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/ia/rutina.ts')).href);
  const EJ = R.ejercicios(EX_DB, EX_CATS, ES_MAP), num = n => EJ.lista.findIndex(e => e.nombre === n);
  const x = (n, o) => Object.assign({ nombre: n, numero: num(n), nombre_lista: n, grupo: '', series: [{ objetivo: '4x10', kg: '' }], descanso: '90 s', rir: '2', progresion: '', nota: '', ss: false, dudoso: false }, o);
  const ia = { hay_rutina: true, nombre: 'Hipertrofia · 2 días', nota: '', dias: [
    { nombre: 'Torso', dias_semana: ['lunes', 'jueves'], nota: '', ejercicios: [x('Press plano con mancuernas', { nombre: 'Press mancuernas', ss: true }), x('Remo T', { ss: true }),
      x('Curl martillo', { grupo: 'antebrazo', series: [{ objetivo: '12-10-8', kg: '14-16-18' }] }), x('Plancha', { series: [{ objetivo: '3x45 s', kg: '' }] })] },
    { nombre: 'Pierna', dias_semana: ['martes'], nota: '', ejercicios: [x('Sentadilla libre', { fila: 7 }), { nombre: 'Sentadilla rara', numero: -1, nombre_lista: '', grupo: 'cuadriceps', series: [], descanso: '', rir: '', progresion: '', nota: '', ss: false, dudoso: true }] },
  ] };
  const viaje = JSON.parse(JSON.stringify(R.rutinaPost(ia, EJ, { propios: true })));
  const cad = diasDesdeIA(viaje, { propios: true, links: { 7: 'https://youtu.be/xyz' } });
  t.eq(cad.days.map(d => [d.name, d.dias, d.exercises.map(e => e.name)]), [['Torso', [1, 4], ['Press plano con mancuernas', 'Remo T', 'Curl martillo', 'Plancha']],
    ['Pierna', [2], ['Sentadilla libre', 'Sentadilla rara']]], 'de la respuesta de la IA a los días de GIZE');
  const torso = cad.days[0].exercises;
  t.eq(torso.map(e => !!e.ss), [true, true, false, false], 'la superserie llega');
  t.eq(torso[2].sets.map(s => [s.target, s.targetKg]), [['12', '14'], ['10', '16'], ['8', '18']], 'las series y cargas partidas en el servidor llegan una por una');
  t.eq([torso[2].mus, torso[3].sets.length, torso[3].sets[0].target, torso[3].timed], ['antebrazo', 3, '45 s', undefined], 'grupo elegido; la plancha ya es por tiempo');
  t.eq([torso[0].rest, torso[0].rir], ['90 s', '2'], 'descanso y RIR');
  t.eq(cad.days[1].exercises[0].video, 'https://youtu.be/xyz', 'el video de su fila');
  t.eq(cad.revisar, [cad.days[1].exercises[1].id], 'el dudoso, para revisar');
  t.ok(cad.days.every(d => ID.test(d.id) && d.exercises.every(e => ID.test(e.id) && e.sets.every(s => ID.test(s.id)) && (!e.video || /^https:\/\//.test(e.video)))), 'todo pasa routine_days_ok');
  t.eq(de(JSON.parse(JSON.stringify(R.rutinaPost(ia, EJ))))[1].exercises.map(e => e.name), ['Sentadilla libre'], 'en «Armar con IA» (sin propios) solo los de la lista');
};
