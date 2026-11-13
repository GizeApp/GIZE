// Rutinas de varias semanas (semana 1, semana 2…): el coach arma días distintos para cada
// semana y la app del alumno le muestra solo los de la semana que le toca, y el lunes siguiente
// pasa sola a la otra. Al terminar la última vuelve a la 1 (ciclo).
//
// Se guarda adentro de la misma rutina (el jsonb "days" de routines / routine_templates /
// routine_schedule), sin SQL nuevo:
//   · day.semana = 1, 2… (un día sin «semana» es de la semana 1: toda rutina de antes sigue
//     igual, es una rutina de una sola semana);
//   · day.ciclo = "AAAA-MM-DD", el lunes en que arranca la semana 1. Va repetido en cada día
//     (un día es lo único que la rutina tiene para guardar cosas) y vale el primero que se
//     encuentre. Sin «ciclo», se toma el inicio del bloque del coach (core/bloque.js) y, sin
//     bloque, un lunes fijo: así todos los celulares calculan la misma semana.
// La base solo valida ids y videos (routine_days_ok), así que estos campos pasan sin cambios.
// copiarDias (rutinas-ejemplo.js) no los copia: las rutinas del catálogo son de una semana.
import { today } from './utils.js';

// Un lunes cualquiera, para que sin «ciclo» ni bloque la cuenta dé igual en todos lados.
const LUNES_BASE = "2024-01-01";
const DIA = 24 * 3600 * 1000;
const al = s => new Date(String(s) + "T12:00:00"); // mediodía: sin saltos por cambio de horario
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

// La semana de un día de la rutina (1 si no tiene).
export function semanaDe(day){
  const n = parseInt(day && day.semana);
  return n >= 1 ? n : 1;
}

// Cuántas semanas tiene la rutina (la más alta que aparece; 1 si ninguno la tiene).
export function semanasDe(days){
  return (Array.isArray(days) ? days : []).reduce((m, d) => Math.max(m, semanaDe(d)), 1);
}

// El lunes en que arranca la semana 1, si la rutina lo dice ("AAAA-MM-DD" o null).
export function cicloDe(days){
  const d = (Array.isArray(days) ? days : []).find(x => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.ciclo || "")));
  return d ? String(d.ciclo) : null;
}

// El lunes de la semana de una fecha "AAAA-MM-DD".
export function lunesDe(fecha){
  const d = al(fecha || today());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

// En qué semana del ciclo cae una fecha: de 1 a semanasDe(days). Con una sola semana, 1.
// bloque: el bloque activo del alumno (state.block), por si la rutina no dice cuándo arranca.
export function semanaActual(days, fecha, bloque){
  const n = semanasDe(days);
  if (n <= 1) return 1;
  const inicio = cicloDe(days) || (bloque && /^\d{4}-\d{2}-\d{2}/.test(String(bloque.start_date || "")) ? String(bloque.start_date).slice(0, 10) : LUNES_BASE);
  const semanas = Math.round((al(lunesDe(fecha || today())) - al(lunesDe(inicio))) / (7 * DIA));
  return ((semanas % n) + n) % n + 1;
}

// Los días de la semana n de la rutina. Con una sola semana, todos.
export function diasDeSemana(days, n){
  const L = Array.isArray(days) ? days : [];
  return semanasDe(L) <= 1 ? L.slice() : L.filter(d => semanaDe(d) === n);
}

// Los días que ve el alumno en una fecha (los de la semana que le toca). Si por algún motivo esa
// semana quedó sin días, todos: nunca una pantalla vacía.
export function diasVisibles(days, fecha, bloque){
  const v = diasDeSemana(days, semanaActual(days, fecha, bloque));
  return v.length ? v : (Array.isArray(days) ? days.slice() : []);
}

// Pone (o saca, con null) el lunes de inicio en todos los días: va en cada uno, ver arriba.
export function fijarCiclo(days, lunes){
  (Array.isArray(days) ? days : []).forEach(d => { if (!d) return; if (lunes) d.ciclo = lunes; else delete d.ciclo; });
}

// Al sumar una semana (o guardar una rutina de dos o más) sin inicio, arranca la semana 1 este
// lunes: así la semana que corre es la 1 y la que viene, la 2. fecha: para las pruebas.
export function asegurarCiclo(days, fecha){
  if (semanasDe(days) > 1 && !cicloDe(days)) fijarCiclo(days, lunesDe(fecha || today()));
}

// «Semana 2 de 2» para mostrar (vacío con una sola semana).
export function textoSemana(days, fecha, bloque){
  const n = semanasDe(days);
  return n > 1 ? "Semana " + semanaActual(days, fecha, bloque) + " de " + n : "";
}
