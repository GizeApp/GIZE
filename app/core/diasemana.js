// Días de la semana de cada día de la rutina (pedido): el alumno o su coach le asignan a cada
// día uno o varios días de la semana (Día A el lunes y el jueves) y, al abrir la app, Entreno
// arranca en el día que toca hoy (ver elegirDiaDeHoy en core/state.js).
//
// Se guarda en el mismo día, dentro de la rutina: day.dias = [números como Date.getDay(),
// 0 = domingo … 6 = sábado], igual que los días de los hábitos del coach (plan.habitDays). Viaja a la
// nube adentro del jsonb "days" de routines / routine_templates / routine_schedule (no hace
// falta SQL: routine_days_ok solo valida ids y videos). Un día sin "dias" (o con la lista
// vacía) no tiene día asignado y todo funciona como antes.
import { today } from './utils.js';

export const SEMANA = [1, 2, 3, 4, 5, 6, 0]; // en pantalla, de lunes a domingo
export const DIA_LETRA = ["D", "L", "M", "M", "J", "V", "S"];
export const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DIA_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Los días de un día de la rutina, limpios (pueden venir escritos a mano en la nube): sin
// repetir, solo de 0 a 6 y en orden de lunes a domingo.
export function diasDe(day){
  const v = day && day.dias;
  if (!Array.isArray(v)) return [];
  const set = new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6));
  return SEMANA.filter(n => set.has(n));
}

// «Lunes», «Lun · Jue», «Todos los días» (vacío si no tiene ninguno).
export function diasTexto(day){
  const d = diasDe(day);
  if (!d.length) return "";
  if (d.length === 7) return "Todos los días";
  if (d.length === 1) { const s = DIA_LARGO[d[0]]; return s.charAt(0).toUpperCase() + s.slice(1); }
  return d.map(n => DIA_CORTO[n]).join(" · ");
}

// Pone o saca un día de la semana. Sin ninguno, el campo se borra (queda como antes).
export function toggleDia(day, n){
  n = Number(n);
  if (!day || !(Number.isInteger(n) && n >= 0 && n <= 6)) return;
  const cur = diasDe(day);
  const next = cur.includes(n) ? cur.filter(x => x !== n) : cur.concat(n);
  if (next.length) day.dias = SEMANA.filter(x => next.includes(x)); else delete day.dias;
}

// Día de la semana de hoy (fecha local del celular, la misma de today()).
export function hoyDow(){ return new Date(today() + "T12:00:00").getDay(); }

// El primer día de la rutina que tiene asignado hoy (null si ninguno).
export function diaDeHoy(days){
  const h = hoyDow();
  return (Array.isArray(days) ? days : []).find(d => diasDe(d).includes(h)) || null;
}

// Rutinas armadas (core/rutinas-ejemplo.js): el subtítulo ya dice el día («Jueves · Glúteos…»).
export function diasDeSubtitulo(sub){
  const w = String(sub || "").split("·")[0].trim().toLowerCase();
  const i = DIA_LARGO.indexOf(w.normalize("NFC"));
  return i >= 0 ? [i] : null;
}
