// Armador de rutinas según los días de la semana que la persona puede ir (de 1 a 5). En la
// bienvenida y en Entreno → «Ver rutinas armadas» elige los días (lunes, miércoles y viernes;
// lunes y martes nada más; de lunes a viernes…) y sale una rutina distinta para cada
// combinación: no es lo mismo tener tres días seguidos que tres días salteados.
//
// Las leyes que cumple toda rutina que sale de acá (son las del método de la app, ver también
// tests/rutina-dias.test.mjs, que las revisa para las 119 combinaciones):
//   · pecho con tríceps, espalda con bíceps y pierna van cada uno hasta dos veces por semana, y
//     entre las dos veces siempre hay dos días enteros de descanso (72 h) para los dos lados de
//     la semana. Si los días elegidos no lo permiten, ese grupo va una sola vez;
//   · el tríceps solo se trabaja los días de pecho y el bíceps los días de espalda: así el brazo
//     también descansa 72 h;
//   · el hombro (vuelos laterales) es el único músculo que va hasta tres veces, con un día de
//     descanso entre medio (48 h). Abdominales, gemelos y aductores también respetan las 72 h;
//   · cada día tiene como mucho 8 ejercicios y 19 series;
//   · ejercicios guiados (Smith, hack, prensa, máquinas, poleas), series pesadas primero y una
//     de más repeticiones al final (top set + back-off), RIR 2-0 (2-1 en los más pesados),
//     descanso de 4' en pierna pesada, 3' en presses y remos, 2' en aislamiento y 1:30 en
//     abdominales.
//
// Cómo elige: cada grupo grande puede ir en un par de días que estén a 3 o 4 días de distancia
// (los dos sentidos de la semana dan 72 h o más) o en un día solo. Se prueban todas las
// combinaciones y gana la que más grupos manda dos veces; después, la que no deja días sin
// grupo, la que menos grupos junta en un mismo día, y la que deja la pierna sola (torso /
// pierna) antes que mezclada con pecho. Un día que queda sin grupo (de lunes a viernes, el
// miércoles) es el día de hombros, con gemelos, aductores y abdominales si les toca.
// Según cuántos grupos comparten el día, cada uno entra con más o menos ejercicios (entero,
// mitad o tercio), y los días sueltos (hombro, abdominales, gemelos, aductores) se reparten al
// final donde hay lugar y donde el descanso lo permite.
//
// Los nombres de los ejercicios son los de la lista de la app (EX_DB en data.js): así andan el
// video, el músculo y las variantes. Lo que sale tiene la misma forma que una rutina del
// catálogo (rutinas-ejemplo.js) y se carga igual, con copiarDias.
import { SEMANA, DIA_LARGO } from './diasemana.js';
import { EX_CATS } from './data.js';
import { uid } from './utils.js';

export const MAX_DIAS = 5, MAX_EJ = 8, MAX_SERIES = 19;

// Un ejercicio con sus series (objetivo de reps de cada una), descanso y RIR.
const ej = (name, mus, targets, rest, rir) => ({ id: uid(), name, mus, rir, rest,
  sets: targets.map(t => ({ id: uid(), kg: "", reps: "", targetKg: "", done: false, target: t })) });
const series = d => d.exercises.reduce((n, e) => n + e.sets.length, 0);

// Esquemas de series: top set + back-off.
const C3 = ["6-10", "6-10", "10-14"], C2 = ["8-12", "12-16"], A3 = ["8-12", "12-16", "12-16"], A2 = ["10-15", "12-16"];
const ABS = ["10-15", "10-15", "10-15"];

// Los grupos grandes. entero: el día es solo de ese grupo; mitad: lo comparte con otro; tercio:
// cuerpo completo. A y B son la primera y la segunda vez en la semana.
const GRUPOS = {
  push: {
    nombre: "Push", mus: ["pecho", "triceps"],
    entero: [
      () => [ej("Press inclinado en Smith", "pecho", C3, "3'", "2-1"), ej("Press de pecho en máquina", "pecho", C2, "3'", "2-0"), ej("Peck deck", "pecho", C2, "2'", "2-0"),
        ej("Press francés con barra", "triceps", C2, "2'", "2-1"), ej("Katana en polea", "triceps", A3, "2'", "2-0")],
      () => [ej("Press plano en Smith", "pecho", C3, "3'", "2-1"), ej("Press inclinado con mancuernas", "pecho", C2, "3'", "2-0"), ej("Cruce de poleas", "pecho", A2, "2'", "2-0"),
        ej("Press francés con mancuernas", "triceps", C2, "2'", "2-1"), ej("Extensión de tríceps unilateral en polea", "triceps", C3, "2'", "2-0")]],
    mitad: [
      () => [ej("Press inclinado en Smith", "pecho", C3, "3'", "2-1"), ej("Peck deck", "pecho", C2, "2'", "2-0"), ej("Extensión de tríceps unilateral en polea", "triceps", C3, "2'", "2-0")],
      () => [ej("Press plano en Smith", "pecho", C3, "3'", "2-1"), ej("Cruce de poleas", "pecho", C2, "2'", "2-0"), ej("Press francés con mancuernas", "triceps", A3, "2'", "2-1")]],
    tercio: [() => [ej("Press inclinado en Smith", "pecho", C3, "3'", "2-1"), ej("Extensión con soga", "triceps", C2, "1:30", "2-0")]]
  },
  pull: {
    nombre: "Pull", mus: ["espalda", "biceps"],
    entero: [
      () => [ej("Jalón prono", "espalda", C3, "3'", "2-0"), ej("Remo en máquina unilateral", "espalda", ["6-10", "8-12", "8-12"], "3'", "2-0"), ej("Remo neutro abierto en polea baja", "espalda", C2, "3'", "2-0"),
        ej("Curl predicador", "biceps", C3, "2'", "2-0"), ej("Curl en polea detrás del cuerpo", "biceps", C2, "2'", "2-0")],
      () => [ej("Jalón neutro", "espalda", C3, "3'", "2-0"), ej("Remo en máquina", "espalda", C3, "3'", "2-0"), ej("Jalón en estocada", "espalda", ["10-14", "12-16"], "3'", "2-0"),
        ej("Curl en banco inclinado", "biceps", C2, "2'", "2-0"), ej("Curl en polea", "biceps", A3, "2'", "2-0")]],
    mitad: [
      () => [ej("Jalón prono", "espalda", C3, "3'", "2-0"), ej("Remo en máquina unilateral", "espalda", ["6-10", "8-12"], "3'", "2-0"), ej("Curl predicador", "biceps", A3, "2'", "2-0")],
      () => [ej("Remo neutro abierto en polea baja", "espalda", C3, "3'", "2-0"), ej("Jalón neutro", "espalda", C2, "3'", "2-0"), ej("Curl en polea", "biceps", A3, "2'", "2-0")]],
    tercio: [() => [ej("Jalón al pecho", "espalda", C2, "3'", "2-0"), ej("Remo en máquina", "espalda", C2, "3'", "2-0"), ej("Curl en polea", "biceps", C2, "1:30", "2-0")]]
  },
  pierna: {
    nombre: "Pierna", mus: ["cuadriceps", "isquios", "gemelos", "aductores"],
    entero: [
      () => [ej("Sentadilla hack", "cuadriceps", C3, "4'", "2-1"), ej("Curl femoral sentado", "isquios", A3, "2'", "2-0"), ej("Prensa 45", "cuadriceps", C2, "4'", "2-0"),
        ej("Peso muerto rumano", "isquios", ["8-12", "10-14"], "4'", "2-1"), ej("Extensión de cuádriceps", "cuadriceps", A2, "2'", "2-0"), ej("Gemelos de pie", "gemelos", A3, "2'", "2-0")],
      () => [ej("Peso muerto rumano", "isquios", C3, "4'", "2-1"), ej("Sentadilla en Smith", "cuadriceps", C3, "4'", "2-1"), ej("Curl femoral acostado", "isquios", C2, "2'", "2-0"),
        ej("Extensión de cuádriceps a una pierna", "cuadriceps", A2, "2'", "2-0"), ej("Aductores en máquina", "aductores", A2, "2'", "2-0"), ej("Gemelos sentado", "gemelos", A3, "2'", "2-0")]],
    mitad: [
      () => [ej("Sentadilla hack", "cuadriceps", C3, "4'", "2-1"), ej("Curl femoral sentado", "isquios", A3, "2'", "2-0"), ej("Extensión de cuádriceps", "cuadriceps", A2, "2'", "2-0")],
      () => [ej("Prensa 45", "cuadriceps", C3, "4'", "2-0"), ej("Peso muerto rumano", "isquios", ["6-10", "10-14"], "4'", "2-1"), ej("Curl femoral acostado", "isquios", A3, "2'", "2-0")]],
    tercio: [() => [ej("Sentadilla hack", "cuadriceps", C3, "4'", "2-1"), ej("Peso muerto rumano", "isquios", ["8-12", "10-14"], "4'", "2-1")]]
  }
};
const ORDEN = ["push", "pull", "pierna"];
// Series de cada grupo cuando el día es suyo, lo comparte con otro o con dos (entero, mitad, tercio).
const SERIES = { push: [12, 8, 5], pull: [13, 8, 6], pierna: [15, 8, 5] };

// Los sueltos: cuántas veces por semana como mucho, qué descanso piden (en días) y con qué
// ejercicio entran cada vez. El hombro es el único con un día de descanso; el resto, dos.
const SUELTOS = [
  { mus: "hombros", veces: 3, gap: 1, ej: [
    () => ej("Vuelos laterales sentado", "hombros", A3, "2'", "2-0"),
    () => ej("Vuelos laterales en polea", "hombros", A3, "2'", "2-0"),
    () => ej("Vuelos laterales con mancuernas", "hombros", A3, "2'", "2-0")] },
  { mus: "abs", veces: 2, gap: 2, ej: [
    () => ej("Encogimiento en polea", "abs", ABS, "1:30", "2-0"),
    () => ej("Elevación de piernas", "abs", ABS, "1:30", "2-0")] },
  { mus: "gemelos", veces: 2, gap: 2, ej: [
    () => ej("Gemelos de pie", "gemelos", A3, "2'", "2-0"),
    () => ej("Gemelos sentado", "gemelos", A3, "2'", "2-0")] },
  { mus: "aductores", veces: 1, gap: 2, ej: [() => ej("Aductores en máquina", "aductores", A2, "2'", "2-0")] }
];
// Lo que completa un día de hombros (sin grupo grande), además de los sueltos de arriba.
const HOMBROS_EXTRA = [
  () => ej("Vuelos laterales en máquina", "hombros", A3, "2'", "2-0"),
  () => ej("Posterior en máquina", "hombros", A2, "2'", "2-0"),
  () => ej("Jalón a la cara", "hombros", A3, "2'", "2-0")];

// ---- La semana ----
// Días como Date.getDay() (0 = domingo). pos: de lunes (0) a domingo (6). dist(a, b): días de a
// hasta b yendo hacia adelante en la semana (de viernes a lunes, 3).
const pos = d => (Number(d) + 6) % 7;
const dist = (a, b) => (pos(b) - pos(a) + 7) % 7;
// Entre dos días hay «gap» días de descanso o más, para los dos lados de la semana.
const separados = (a, b, gap) => { const d = dist(a, b); return d >= gap + 1 && d <= 6 - gap; };

// Los días elegidos, limpios y en orden de lunes a domingo (de 1 a 5).
export function diasLimpios(dias){
  const set = new Set((Array.isArray(dias) ? dias : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6));
  return SEMANA.filter(n => set.has(n));
}

// a le gana a b si en el primer punto en que difieren tiene más.
function ganaA(a, b){
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Dónde va cada grupo grande: la mejor combinación de pares (72 h) y días solos.
function repartir(dias){
  const n = dias.length, lugares = [];
  for (let i = 0; i < n; i++){
    lugares.push([i]);
    for (let j = i + 1; j < n; j++) if (separados(dias[i], dias[j], 2)) lugares.push([i, j]);
  }
  let mejor = null, mejorPuntos = null;
  const probar = (asig) => {
    const carga = dias.map(() => []);
    asig.forEach((l, k) => l.forEach(i => carga[i].push(ORDEN[k])));
    if (carga.some(c => c.length > 3)) return;
    // Cuánto entrena de verdad la semana: las series de cada grupo según con cuántos comparte
    // el día (entero, mitad o tercio) más un premio por cada grupo que va dos veces. Así, con
    // cuatro días seguidos, torso dos veces y pierna una le gana a cuerpo completo dos veces con
    // dos días casi vacíos, y de lunes a viernes pierna dos veces le gana a pierna una sola vez.
    const valor = asig.reduce((s, l, k) => s + l.reduce((t, i) => t + SERIES[ORDEN[k]][carga[i].length - 1], 0) + (l.length === 2 ? 10 : 0), 0);
    const puntos = [
      valor,
      -carga.filter(c => !c.length).length,               // días sin grupo
      -Math.max(...carga.map(c => c.length)),             // cuántos grupos juntos
      -carga.reduce((s, c) => s + c.length * c.length, 0),// reparto parejo
      -carga.filter(c => c.length > 1 && c.includes("pierna")).length,  // pierna sola
      -carga.filter(c => c.includes("push") && c.includes("pierna")).length // y si comparte, con espalda
    ];
    if (!mejorPuntos || ganaA(puntos, mejorPuntos)){ mejor = asig.map(l => l.slice()); mejorPuntos = puntos; }
  };
  for (const a of lugares) for (const b of lugares) for (const c of lugares) probar([a, b, c]);
  return mejor;
}

// ---- Armar ----
// dias: números de día de la semana (0 = domingo … 6 = sábado), de 1 a 5. Devuelve los días
// de la rutina (como days de routines) o null si no hay días válidos o son más de 5.
export function armarDias(dias){
  dias = diasLimpios(dias);
  if (!dias.length || dias.length > MAX_DIAS) return null;
  const asig = repartir(dias);
  const planes = dias.map(d => ({ dow: d, grupos: [], exercises: [] }));
  asig.forEach((l, k) => l.forEach((i, vez) => planes[i].grupos.push({ g: ORDEN[k], vez, de: l.length })));
  // Los grupos grandes, con el tamaño que les toca según cuántos comparten el día.
  for (const p of planes){
    const tam = p.grupos.length === 1 ? "entero" : p.grupos.length === 2 ? "mitad" : "tercio";
    for (const x of p.grupos){
      const vars = GRUPOS[x.g][tam];
      x.ejs = vars[Math.min(x.vez, vars.length - 1)]();
      p.exercises.push(...x.ejs);
    }
  }
  // Qué días ya trabajan cada músculo (directo): para repartir los sueltos con su descanso.
  const diasDe = mus => planes.filter(p => p.exercises.some(e => e.mus === mus)).map(p => p.dow);
  const entra = (p, e) => p.exercises.length < MAX_EJ && series(p) + e.sets.length <= MAX_SERIES;
  // (el mismo día puede sumar otro ejercicio del músculo; los demás días tienen que estar lejos)
  const puede = (p, mus, gap) => diasDe(mus).every(d => d === p.dow || separados(d, p.dow, gap));
  // Los sueltos: cada uno busca el mayor número de días posible que respeten su descanso y
  // tengan lugar, prefiriendo los días con menos series (el de hombros, primero).
  for (const s of SUELTOS){
    const ya = diasDe(s.mus).length;
    for (let veces = s.veces - ya; veces > 0; veces--){
      const elegidos = mejorConjunto(planes, s, veces, entra, puede);
      if (!elegidos) continue;
      elegidos.forEach((p, i) => { const e = s.ej[Math.min(ya + i, s.ej.length - 1)](); p.exercises.push(e); });
      break;
    }
  }
  // Un día sin grupo es el día de hombros: se completa con más hombro si hay lugar.
  for (const p of planes) if (!p.grupos.length && puede(p, "hombros", 1)) for (const f of HOMBROS_EXTRA){ const e = f(); if (entra(p, e)) p.exercises.push(e); }
  const days = planes.map(armarDia);
  // Dos días con el mismo nombre (un grupo que va una sola vez junto a otro repetido) se numeran.
  days.forEach(d => { const igual = days.filter(x => x.name === d.name); if (igual.length > 1) igual.forEach((x, i) => { x.name += " " + (i + 1); }); });
  return days;
}

// El mejor conjunto de «veces» días para un suelto: todos separados entre sí por su descanso,
// separados de los días que ya trabajan ese músculo, y con lugar. Gana el de menos series.
function mejorConjunto(planes, s, veces, entra, puede){
  const cand = planes.filter(p => puede(p, s.mus, s.gap) && entra(p, s.ej[0]()));
  let mejor = null, mejorCarga = Infinity;
  const rec = (desde, acc) => {
    if (acc.length === veces){
      const carga = acc.reduce((n, p) => n + series(p) * 10 + p.grupos.length, 0);
      if (carga < mejorCarga){ mejorCarga = carga; mejor = acc.slice(); }
      return;
    }
    for (let i = desde; i < cand.length; i++) if (acc.every(q => separados(q.dow, cand[i].dow, s.gap))) rec(i + 1, acc.concat(cand[i]));
  };
  rec(0, []);
  return mejor;
}

const LABEL = Object.fromEntries(EX_CATS);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// Nombre del día por sus grupos («Push A», «Torso B», «Pull + Pierna A», «Cuerpo completo»,
// «Hombros») y subtítulo con el día de la semana y los músculos que trabaja.
function armarDia(p){
  const gs = p.grupos.map(x => x.g);
  let name = !gs.length ? "Hombros" : gs.length === 3 ? "Cuerpo completo"
    : gs.includes("push") && gs.includes("pull") ? "Torso"
    : gs.map(g => GRUPOS[g].nombre).join(" + ");
  // La letra (A, B) si todos los grupos del día van dos veces y es la misma vez para todos.
  const veces = p.grupos.filter(x => x.de === 2).map(x => x.vez);
  if (p.grupos.length && veces.length === p.grupos.length && veces.every(v => v === veces[0])) name += " " + "AB"[veces[0]];
  const muss = []; p.exercises.forEach(e => { if (!muss.includes(e.mus)) muss.push(e.mus); });
  return { id: uid(), name, subtitle: cap(DIA_LARGO[p.dow]) + " · " + muss.map(m => LABEL[m] || m).join(" · "), dias: [p.dow], exercises: p.exercises };
}

// La rutina entera, con la forma del catálogo: { id, nombre, para, desc, days }. El id sale de
// los días: la misma elección da el mismo id (la lista la busca por id).
export function armarRutina(dias){
  const ds = diasLimpios(dias), days = armarDias(ds);
  if (!days) return null;
  const n = ds.length, nombres = ds.map(d => DIA_LARGO[d]);
  const lista = n === 1 ? cap(nombres[0]) : cap(nombres.slice(0, -1).join(", ")) + " y " + nombres[n - 1];
  const dos = days.filter(d => /\bB$/.test(d.name)).map(d => d.name.replace(/ B$/, ""));
  return { id: "dias-" + ds.join(""), nombre: "A tu medida · " + n + " día" + (n === 1 ? "" : "s"), para: "todos",
    desc: lista + ". " + (n === 1 ? "Todo el cuerpo en una sesión." : dos.length ? (dos.length === 3 ? "Cada músculo" : cap(dos.map(x => x.toLowerCase()).join(" y "))) + " dos veces por semana, con tres días de descanso entre medio." : "Cada músculo una vez por semana, con descanso de sobra."),
    days };
}
