// Rutinas armadas por disciplina (CrossFit, Powerlifting, Weightlifting, Running y Atleta
// híbrido), de 3 a 5 días por semana. Se suman a las generales de rutinas-ejemplo.js: en la
// bienvenida, quien eligió una disciplina ve primero las suyas (disc = id de DISCIPLINAS).
// Los nombres son los de EX_DB (data.js), así andan el video, el músculo y el volumen.
import { uid } from './utils.js';

// x("Ejercicio", "músculo", series, "objetivo", descanso): objetivo en texto (reps, tiempo, distancia).
const x = (name, mus, n, target, rest) => ({
  id: uid(), name, mus, rir: "", rest: rest || "2'-3'",
  sets: Array.from({ length: n }, () => ({ id: uid(), kg: "", reps: "", targetKg: "", done: false, target })) });
const d = (name, subtitle, list) => ({ id: uid(), name, subtitle, exercises: list });
const SEM = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Días de la semana que le tocan a cada cantidad de días de entreno.
const DIAS = { 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5] };
const sub = (n, i, txt) => SEM[DIAS[n][i]] + " · " + txt;

// ---- Powerlifting: los tres básicos, cada uno con su día, y accesorios ----
const plSent = (n, i) => d("Sentadilla", sub(n, i, "Sentadilla · Piernas"), [
  x("Sentadilla libre", "cuadriceps", 4, "5"), x("Sentadilla con pausa", "cuadriceps", 3, "3"), x("Prensa 45", "cuadriceps", 3, "10"),
  x("Curl femoral sentado", "isquios", 3, "10", "1:30-2'"), x("Plancha", "abs", 3, "45 s", "1:30")]);
const plBanca = (n, i) => d("Banca", sub(n, i, "Press de banca · Hombros · Tríceps"), [
  x("Press de banca plano (barra)", "pecho", 5, "5"), x("Press cerrado", "triceps", 3, "8"), x("Press militar con barra", "hombros", 3, "8"),
  x("Extensión con soga", "triceps", 3, "12", "1:30")]);
const plPeso = (n, i) => d("Peso muerto", sub(n, i, "Peso muerto · Espalda"), [
  x("Peso muerto convencional", "espalda", 4, "4"), x("Peso muerto con pausa", "espalda", 3, "3"), x("Remo con barra", "espalda", 4, "8"),
  x("Dominadas", "espalda", 3, "8"), x("Hiperextensiones lumbares", "espalda", 3, "12", "1:30")]);
const plAcc = (n, i) => d("Accesorios de torso", sub(n, i, "Pecho · Espalda · Brazos"), [
  x("Press inclinado con mancuernas", "pecho", 3, "10"), x("Jalón al pecho", "espalda", 3, "10"), x("Vuelos laterales con mancuernas", "hombros", 3, "12", "1:30"),
  x("Curl con barra Z", "biceps", 3, "10", "1:30"), x("Extensión con soga", "triceps", 3, "12", "1:30")]);
const plPierna = (n, i) => d("Pierna volumen", sub(n, i, "Cuádriceps · Isquios · Gemelos"), [
  x("Sentadilla libre", "cuadriceps", 3, "8"), x("Peso muerto rumano", "isquios", 3, "8"), x("Sentadilla búlgara", "cuadriceps", 3, "10"),
  x("Gemelos de pie", "gemelos", 4, "12", "1:30"), x("Plancha", "abs", 3, "45 s", "1:30")]);

// ---- Weightlifting: arranque y cargada y envión, tirones y sentadillas ----
const wlA = (n, i) => d("Arranque", sub(n, i, "Arranque · Tirones · Sentadilla"), [
  x("Arranque", "olimpicos", 6, "2"), x("Tirón de arranque", "olimpicos", 4, "3"), x("Sentadilla libre", "cuadriceps", 4, "5"), x("Plancha", "abs", 3, "45 s", "1:30")]);
const wlB = (n, i) => d("Cargada y envión", sub(n, i, "Cargada y envión · Tirones · Sentadilla frontal"), [
  x("Cargada y envión", "olimpicos", 6, "2"), x("Tirón de cargada", "olimpicos", 4, "3"), x("Sentadilla frontal", "cuadriceps", 4, "4"), x("Peso muerto rumano", "isquios", 3, "6")]);
const wlC = (n, i) => d("Potencia y jerk", sub(n, i, "Potencia · Jerk · Espalda"), [
  x("Arranque de potencia", "olimpicos", 5, "3"), x("Push jerk", "olimpicos", 5, "3"), x("Sentadilla overhead", "olimpicos", 3, "5"),
  x("Remo con barra", "espalda", 3, "8"), x("Plancha", "abs", 3, "45 s", "1:30")]);
const wlD = (n, i) => d("Colgante y fuerza", sub(n, i, "Colgante · Sentadilla · Hombros"), [
  x("Arranque colgante", "olimpicos", 5, "3"), x("Cargada colgante", "olimpicos", 5, "3"), x("Sentadilla frontal", "cuadriceps", 4, "5"),
  x("Push press", "olimpicos", 3, "5"), x("Hiperextensiones lumbares", "espalda", 3, "12", "1:30")]);
const wlE = (n, i) => d("Sentadilla y tirones", sub(n, i, "Sentadilla · Tirones"), [
  x("Sentadilla libre", "cuadriceps", 5, "5"), x("Tirón de arranque", "olimpicos", 4, "3"), x("Tirón de cargada", "olimpicos", 4, "3"),
  x("Dominadas", "espalda", 3, "8"), x("Plancha", "abs", 3, "45 s", "1:30")]);

// ---- CrossFit: fuerza + metcon, gimnásticos y trabajo mixto ----
const cfFuerza = (n, i) => d("Fuerza + metcon", sub(n, i, "Sentadilla · Metcon"), [
  x("Sentadilla frontal", "cuadriceps", 5, "5"), x("Thruster con barra", "olimpicos", 4, "8"),
  x("Wall ball", "crossfit", 3, "15", "1:30"), x("Burpee", "crossfit", 3, "12", "1:30"), x("Saltos dobles con soga", "crossfit", 3, "40", "1:30")]);
const cfGim = (n, i) => d("Gimnásticos", sub(n, i, "Dominadas · Toes to bar · Empuje"), [
  x("Dominadas kipping", "crossfit", 5, "8"), x("Toes to bar", "crossfit", 4, "10", "1:30"), x("Flexiones de brazos en vertical", "crossfit", 4, "5"),
  x("Sentadilla pistol", "crossfit", 3, "5 por pierna", "1:30"), x("Plancha", "abs", 3, "45 s", "1:30")]);
const cfOlim = (n, i) => d("Halterofilia + WOD", sub(n, i, "Cargada · Arranque · WOD"), [
  x("Cargada de potencia", "olimpicos", 5, "3"), x("Arranque de potencia", "olimpicos", 5, "3"), x("Swing con kettlebell", "crossfit", 4, "20", "1:30"),
  x("Salto al cajón", "crossfit", 4, "12", "1:30"), x("Remo en ergómetro", "crossfit", 3, "500 m", "1:30")]);
const cfFuerza2 = (n, i) => d("Fuerza de empuje y tirón", sub(n, i, "Peso muerto · Press · Remo"), [
  x("Peso muerto convencional", "espalda", 4, "5"), x("Push press", "olimpicos", 4, "5"), x("Remo con barra", "espalda", 4, "8"),
  x("Devil press con mancuernas", "crossfit", 3, "10", "1:30"), x("Caminata del granjero", "crossfit", 3, "40 m", "1:30")]);
const cfMixto = (n, i) => d("Resistencia mixta", sub(n, i, "Cardio · Core"), [
  x("Air bike", "crossfit", 5, "1 min fuerte", "1:30"), x("Remo en ergómetro", "crossfit", 4, "500 m", "1:30"), x("Empuje de trineo", "crossfit", 4, "20 m", "1:30"),
  x("Burpee sobre la barra", "crossfit", 3, "10", "1:30"), x("Plancha", "abs", 3, "45 s", "1:30")]);

// ---- Running: rodajes, series, fondo y fuerza para correr ----
const ruRodaje = (n, i) => d("Rodaje suave", sub(n, i, "Rodaje suave · Técnica"), [
  x("Rodaje suave", "running", 1, "40 min", ""), x("Técnica de carrera", "running", 3, "30 m", "1:00")]);
const ruSeries = (n, i) => d("Series", sub(n, i, "Series en pista"), [
  x("Técnica de carrera", "running", 2, "30 m", "1:00"), x("Series en pista", "running", 6, "400 m", "1:30"), x("Rodaje suave", "running", 1, "10 min", "")]);
const ruFondo = (n, i) => d("Fondo largo", sub(n, i, "Fondo largo"), [x("Fondo largo", "running", 1, "70 min", "")]);
const ruTempo = (n, i) => d("Ritmo tempo", sub(n, i, "Ritmo tempo · Cuestas"), [
  x("Ritmo tempo", "running", 1, "25 min", ""), x("Cuestas", "running", 6, "60 s", "1:30")]);
const ruFuerza = (n, i) => d("Fuerza para correr", sub(n, i, "Piernas · Core"), [
  x("Sentadilla búlgara", "cuadriceps", 3, "8"), x("Peso muerto rumano a una pierna", "isquios", 3, "8"), x("Gemelos de pie", "gemelos", 3, "15", "1:30"),
  x("Zancada inversa", "cuadriceps", 3, "10"), x("Plancha", "abs", 3, "45 s", "1:30")]);
const ruFart = (n, i) => d("Fartlek", sub(n, i, "Fartlek · Progresivos"), [
  x("Fartlek", "running", 1, "35 min", ""), x("Progresivos", "running", 4, "100 m", "1:00")]);

// ---- Atleta híbrido: fuerza, correr y trabajo de CrossFit en la misma semana ----
const hiPierna = (n, i) => d("Fuerza de piernas", sub(n, i, "Sentadilla · Peso muerto"), [
  x("Sentadilla libre", "cuadriceps", 4, "5"), x("Peso muerto convencional", "espalda", 3, "5"), x("Sentadilla búlgara", "cuadriceps", 3, "8"), x("Plancha", "abs", 3, "45 s", "1:30")]);
const hiCorrer = (n, i) => d("Correr", sub(n, i, "Series en pista"), [
  x("Rodaje suave", "running", 1, "10 min", ""), x("Series en pista", "running", 6, "400 m", "1:30")]);
const hiTorso = (n, i) => d("Fuerza de torso", sub(n, i, "Press · Dominadas"), [
  x("Press de banca plano (barra)", "pecho", 4, "6"), x("Dominadas", "espalda", 4, "6"), x("Press militar con barra", "hombros", 3, "8"), x("Remo con barra", "espalda", 3, "8")]);
const hiMetcon = (n, i) => d("Metcon", sub(n, i, "Thruster · Wall ball · Remo"), [
  x("Thruster con barra", "olimpicos", 4, "10"), x("Wall ball", "crossfit", 4, "15", "1:30"), x("Remo en ergómetro", "crossfit", 4, "500 m", "1:30"),
  x("Burpee", "crossfit", 3, "12", "1:30")]);
const hiFondo = (n, i) => d("Fondo largo", sub(n, i, "Fondo largo"), [x("Fondo largo", "running", 1, "60 min", "")]);

// Cada rutina arma sus días al pedirlos (ids nuevos, nada compartido entre rutinas).
const R = (disc, nombre, desc, n, fns) => ({
  id: "disc-" + disc + "-" + n, disc, nombre, para: "todos", desc, n,
  get days(){ return fns.map((f, i) => f(n, i)); } });

export const RUTINAS_DISCIPLINA = [
  R("powerlifting", "Powerlifting · 3 días", "Un día por cada básico: sentadilla, banca y peso muerto.", 3, [plSent, plBanca, plPeso]),
  R("powerlifting", "Powerlifting · 4 días", "Los tres básicos y un día de accesorios de torso.", 4, [plSent, plBanca, plPeso, plAcc]),
  R("powerlifting", "Powerlifting · 5 días", "Los tres básicos, accesorios de torso y un día de pierna de volumen.", 5, [plSent, plBanca, plPeso, plAcc, plPierna]),
  R("weightlifting", "Weightlifting · 3 días", "Arranque, cargada y envión, y un día de potencia y jerk.", 3, [wlA, wlB, wlC]),
  R("weightlifting", "Weightlifting · 4 días", "Suma un día de movimientos colgantes y fuerza.", 4, [wlA, wlB, wlC, wlD]),
  R("weightlifting", "Weightlifting · 5 días", "Suma un día de sentadilla y tirones.", 5, [wlA, wlB, wlC, wlD, wlE]),
  R("crossfit", "CrossFit · 3 días", "Fuerza con metcon, gimnásticos y halterofilia con WOD.", 3, [cfFuerza, cfGim, cfOlim]),
  R("crossfit", "CrossFit · 4 días", "Suma un día de fuerza de empuje y tirón.", 4, [cfFuerza, cfGim, cfOlim, cfFuerza2]),
  R("crossfit", "CrossFit · 5 días", "Suma un día de resistencia mixta.", 5, [cfFuerza, cfGim, cfOlim, cfFuerza2, cfMixto]),
  R("running", "Running · 3 días", "Rodaje, series y fondo largo, con fuerza para correr.", 3, [ruRodaje, ruSeries, ruFondo]),
  R("running", "Running · 4 días", "Suma un día de fuerza para correr.", 4, [ruRodaje, ruSeries, ruFuerza, ruFondo]),
  R("running", "Running · 5 días", "Suma un día de ritmo tempo y cuestas.", 5, [ruRodaje, ruSeries, ruFuerza, ruTempo, ruFondo]),
  R("hibrido", "Atleta híbrido · 3 días", "Fuerza de piernas, correr y metcon en la misma semana.", 3, [hiPierna, hiCorrer, hiMetcon]),
  R("hibrido", "Atleta híbrido · 4 días", "Suma un día de fuerza de torso.", 4, [hiPierna, hiCorrer, hiTorso, hiMetcon]),
  R("hibrido", "Atleta híbrido · 5 días", "Suma un fondo largo.", 5, [hiPierna, hiCorrer, hiTorso, hiMetcon, hiFondo]),
];

// Las de las disciplinas elegidas (ids de DISCIPLINAS), ya con sus días armados.
export function rutinasDeDisciplinas(ids){
  const set = new Set(ids || []);
  return RUTINAS_DISCIPLINA.filter(r => set.has(r.disc)).map(r => ({ id: r.id, disc: r.disc, nombre: r.nombre, para: r.para, desc: r.desc, days: r.days }));
}
