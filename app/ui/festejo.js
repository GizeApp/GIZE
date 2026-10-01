// Festejo de récord personal (PR): al tildar una serie con más kg que la mejor marca de ese
// ejercicio en entrenos anteriores. Destello en la fila, chispas desde el ✓ y un chip
// "PR +2,5 kg" que se va solo (~2 s). No tapa la pantalla: todo pasa dentro de la fila.
// Una vez por ejercicio en el día; la serie queda con un trofeo chiquito mientras dure la
// sesión (no se guarda en la rutina).
import { state } from '../core/state.js';
import { num, today } from '../core/utils.js';
import { trophySvg } from '../core/icons.js';

// Series que fueron récord en esta sesión (para el trofeo junto al número de serie).
export const prSets = new Set();
// Ejercicios ya festejados hoy: "fecha|nombre" → la serie que lo ganó.
const celebrated = new Map();

const fmtKg = n => (Math.round(n * 10) / 10).toLocaleString("es-AR", { maximumFractionDigits: 1 });

// ¿Esta serie recién tildada es récord? Devuelve cuántos kg más que la mejor marca, o null.
// Hace falta una marca anterior (si nunca lo hizo, no hay nada que superar) y reps > 0.
export function checkSetPR(ex, s) {
  if (!ex || !s || !s.done) return null;
  const kg = num(s.kg), reps = parseInt(s.reps) || 0;
  if (kg === 0 || reps <= 0) return null; // negativo: asistido (-25 le gana a -30)
  const key = today() + "|" + ex.name;
  if (celebrated.has(key)) return null;
  const prev = prevBest(ex);
  if (prev === null || kg <= prev) return null;
  celebrated.set(key, s.id);
  prSets.add(s.id);
  return kg - prev;
}

// Mejor marca de entrenos anteriores. Los de hoy ya guardados no cuentan como "antes" (si
// guardó y sigue cargando). Una marca suelta muy por encima de todas las demás (625 kg
// cuando el resto anda por 60) es un error de tipeo que quedó guardado: se usa la
// siguiente, si no el alumno no volvía a ver un récord hasta superar el número mal escrito.
function prevBest(ex) {
  const t = today();
  const kgs = [];
  (state.sessions || []).forEach(se => {
    if (se.date === t) return;
    (se.exercises || []).forEach(e => {
      if (e.name !== ex.name) return;
      (e.sets || []).forEach(x => { const kg = num(x.kg); if (kg !== 0) kgs.push(kg); });
    });
  });
  if (!kgs.length) return null;
  kgs.sort((a, b) => b - a);
  const [top, next] = kgs;
  // Solo saltos de error de tipeo (coma o cero de más: ~10 veces más), no progresiones reales.
  if (next !== undefined && next > 0 && top >= next * 2.5 && top - next >= 20) return next;
  return top;
}

// ¿El peso es tanto más que su mejor marca que parece mal escrito (625 en vez de 62,5)?
// Devuelve la mejor marca para mostrarla en la pregunta, o null si el peso es creíble.
export function suspiciousKg(ex, s) {
  const kg = num(s.kg);
  if (kg <= 0) return null;
  const prev = prevBest(ex);
  if (prev === null) return kg > 400 ? 0 : null;
  // Casi el doble de su mejor marca (y 20 kg más) o más de 400 kg: pregunta. Una subida
  // normal (60 → 65, 40 → 60) no pregunta nada.
  return (kg >= prev * 1.8 && kg - prev >= 20) || kg > 400 ? prev : null;
}

// La serie que ganó el festejo se destildó o se le cambió el peso (se había escrito mal):
// se devuelve el festejo del ejercicio para que pueda volver a salir con el peso bien.
export function forgetPR(setId) {
  if (!prSets.delete(setId)) return;
  for (const [k, id] of celebrated) if (id === setId) celebrated.delete(k);
}

// Anima la fila de la serie (ya dibujada). Sin movimiento si el celular pide reducirlo.
export function playPR(setId, diff) {
  const btn = document.querySelector('[data-action="toggle"][data-set="' + CSS.escape(setId) + '"]');
  const row = btn && btn.closest(".set");
  if (!row) return;
  try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
  const chip = document.createElement("span");
  chip.className = "pr-chip";
  chip.setAttribute("role", "status");
  chip.innerHTML = trophySvg + 'PR <span class="pr-chip-kg">+' + fmtKg(diff) + ' kg</span>';
  row.appendChild(chip);
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const extras = [chip];
  if (!reduced) {
    const edge = document.createElement("span");
    edge.className = "pr-edge";
    row.appendChild(edge);
    extras.push(edge);
    // La gama de la apariencia elegida (en «Azul» es azul, violeta, cian e índigo; en «Rosa»,
    // rosa, orquídea, rubor y magenta; en «Claro», la de siempre un poco más profunda) y dorado.
    // Sin neón (app/ui/neon.js): blancos y grises (en «Claro», negros y grises), con el dorado.
    const root = document.documentElement;
    const colors = root.classList.contains("sin-neon")
      ? (root.classList.contains("tema-luz") ? ["#0B0D11", "#6E7482", "#0B0D11", "#A3A8B2", "#E0A100", "#E0A100"]
        : ["#FFFFFF", "#D6DAE0", "#FFFFFF", "#B4BAC4", "#FFC940", "#FFC940"])
      : root.classList.contains("tema-luz")
      ? ["#2B93F0", "#9B4DFA", "#F0369F", "#13C2A5", "#E0A100", "#E0A100"]
      : root.classList.contains("tema-rosa")
      ? ["#FF5FA8", "#D65CF5", "#FFA3C8", "#E84DBE", "#FFC940", "#FFC940"]
      : root.classList.contains("tema-claro")
      ? ["#3FA3F2", "#A474F7", "#2EC6EE", "#5B6CF2", "#FFC940", "#FFC940"]
      : ["#2FA0FF", "#A65CFF", "#FF3DAE", "#25E8C8", "#FFC940", "#FFC940"];
    for (let i = 0; i < 8; i++) {
      const sp = document.createElement("span");
      sp.className = "pr-spark";
      const ang = (Math.PI * 2 * i) / 8 + 0.3, dist = 22 + (i % 3) * 6;
      sp.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      sp.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      sp.style.background = colors[i % colors.length];
      btn.appendChild(sp);
      extras.push(sp);
    }
  }
  row.classList.add("pr-play");
  setTimeout(() => { extras.forEach(x => x.remove()); row.classList.remove("pr-play"); }, 2000);
}

// Duración del festejo antes de que el ejercicio terminado se colapse.
export const PR_HOLD_MS = 1300;
