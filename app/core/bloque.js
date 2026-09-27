// Bloque / mesociclo que arma el coach (tabla blocks): en qué semana está el alumno, cuáles
// son de descarga y, si el coach le armó una, la rutina de descarga de esa semana.
// La rutina de siempre (tabla routines) no se toca: durante la semana de descarga la app del
// alumno muestra la de descarga y el lunes siguiente vuelve sola a la de siempre.
import { ymd } from './utils.js';

const DAY = 24 * 3600 * 1000;
const at = s => new Date(String(s) + "T12:00:00"); // mediodía: sin saltos por cambio de horario

// Semana del bloque en la fecha dstr (1 = la del inicio). 0 si todavía no empezó.
export function blockWeek(b, dstr){
  if(!b || !b.start_date) return 0;
  const days = Math.round((at(dstr) - at(b.start_date)) / DAY);
  if(!(days >= 0)) return 0;
  return Math.floor(days / 7) + 1;
}

// Primer y último día de la semana wk del bloque ("2026-10-05", "2026-10-11").
export function weekRange(b, wk){
  if(!b || !b.start_date || !(wk >= 1)) return null;
  const a = at(b.start_date); a.setDate(a.getDate() + (wk - 1) * 7);
  const z = new Date(a); z.setDate(z.getDate() + 6);
  return [ymd(a), ymd(z)];
}

export function deloadWeeks(b){
  return (b && Array.isArray(b.deloads) ? b.deloads : []).map(Number).filter(n => n >= 1);
}

export function isDeload(b, wk){ return deloadWeeks(b).indexOf(Number(wk)) >= 0; }

// Objetivo e indicaciones de una semana ({goal, note}). Antes se llamaba weekPlan.
export function weekPlanOf(b, wk){
  const p = b && (b.week_plan || b.weekPlan);
  return (p && typeof p === "object" && p[wk] && typeof p[wk] === "object") ? p[wk] : {};
}

// Rutina de descarga guardada para la semana wk ({days, start}), o null. Solo la de este
// ciclo del bloque: cada una guarda la fecha de inicio con la que se armó (start) y, si el
// coach re-fechó el bloque para otro mesociclo, las del anterior ya no valen.
// altStart: otra fecha que también vale (en el panel del coach, la guardada mientras edita
// la fecha de inicio sin guardar: esas rutinas se ofrecen al guardar, así que se muestran).
export function deloadRoutineOf(b, wk, altStart){
  const all = b && b.deload_routines;
  const r = (all && typeof all === "object") ? all[wk] : null;
  if(!(r && Array.isArray(r.days) && r.days.length)) return null;
  return (!r.start || !b.start_date || r.start === b.start_date || (altStart && r.start === altStart)) ? r : null;
}

// La que corresponde hoy: solo si la semana está marcada como descarga y tiene rutina.
// Devuelve {wk, key, days, name} (key identifica bloque y semana) o null.
export function activeDeload(b, dstr){
  const wk = blockWeek(b, dstr);
  if(wk < 1 || (b.weeks && wk > parseInt(b.weeks)) || !isDeload(b, wk)) return null;
  const r = deloadRoutineOf(b, wk);
  return r ? { wk, key: "descarga:" + (b.id || "") + ":" + wk, days: r.days, name: r.name || "" } : null;
}
