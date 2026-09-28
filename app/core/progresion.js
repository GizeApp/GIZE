// Recomendación de peso para hipertrofia: si la vez pasada, con el peso más alto, alguna serie
// pasó el tope del rango de reps del coach por al menos una ("8-12" y hizo 13 o más), conviene
// subir 2,5 kg. Si no, no se recomienda nada. Es solo un aviso: no cambia ningún dato.

import { num } from './utils.js';

export const kgText = k => (Math.round(k * 100) / 100).toString().replace(".", ",");

// "8-12" → [8, 12]; "10" → [10, 10]; lo demás (AMRAP, "al fallo", vacío) → null.
export function repRange(t){
  const m = String(t || "").match(/(\d+)\s*(?:-|–|a)\s*(\d+)/);
  if (m) { const a = +m[1], b = +m[2]; return a > 0 && b >= a ? [a, b] : null; }
  const one = String(t || "").match(/^\s*(\d+)\s*(reps?)?\s*$/i);
  return one ? [+one[1], +one[1]] : null;
}

export const STEP_KG = 2.5;

export function suggest(ex, prevSets, timed){
  if (timed) return null;
  const prev = (prevSets || []).filter(s => num(s.kg) > 0 && num(s.reps) > 0);
  if (!prev.length) return null;
  // Rango del coach, serie por serie (si una no tiene, el de la primera serie que tenga).
  const sets = ex.sets || [];
  const any = repRange((sets.find(s => repRange(s.target)) || {}).target);
  if (!any) return null;
  const rangeOf = i => repRange((sets[i] || {}).target) || any;
  // Las series con el peso más alto de la vez pasada: ¿alguna pasó el tope del rango?
  const kg = Math.max(...prev.map(s => num(s.kg)));
  const over = prev.map((s, i) => ({ s, r: rangeOf(i) })).filter(x => num(x.s.kg) === kg && Math.round(num(x.s.reps)) > x.r[1]);
  if (!over.length) return null;
  const best = over.reduce((a, x) => Math.round(num(x.s.reps)) > Math.round(num(a.s.reps)) ? x : a, over[0]);
  const nk = Math.round((kg + STEP_KG) * 100) / 100;
  return { kg: nk, text: "Subí " + kgText(STEP_KG) + " kg: " + kgText(nk) + " kg",
    why: "La vez pasada hiciste " + Math.round(num(best.s.reps)) + " reps con " + kgText(kg) + " kg y el rango es " + best.r[0] + "-" + best.r[1] + "." };
}
