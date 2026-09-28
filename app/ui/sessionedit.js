// Editar un entreno ya guardado (Progreso → Historial de entrenos → lápiz): corregir kg,
// reps o segundos de cada serie, o quitar una serie. Sirve sobre todo para un peso mal
// escrito (625 en vez de 62,5), que si no quedaba como mejor marca y en los gráficos.
// Se corrige en el celular y en la nube (cloudEditSession, con la cola de envío si no hay
// señal), así el coach también ve el dato bien.
import { state } from '../core/state.js';
import { esc, fmtDate, parseSecs } from '../core/utils.js';

export const EditState = { se: null }; // { id, date, day, exercises } copia de trabajo

export function openSessionEdit(id) {
  const se = (state.sessions || []).find(x => x.id === id);
  if (!se) return false;
  EditState.se = JSON.parse(JSON.stringify({ id: se.id, date: se.date, day: se.day, exercises: se.exercises || [] }));
  return true;
}

const num = v => String(v == null ? "" : v).replace(".", ",");
const isTimed = ex => (ex.sets || []).some(s => (Number(s.secs) || 0) > 0);
const secsStr = s => { s = Math.round(+s || 0); if (!s) return ""; const m = Math.floor(s / 60), r = s % 60; return m ? m + ":" + String(r).padStart(2, "0") : String(r); };

export function renderSessionEdit() {
  const se = EditState.se;
  if (!se) return "";
  const blocks = se.exercises.map((ex, ei) => {
    const timed = isTimed(ex);
    const rows = (ex.sets || []).map((s, si) => `
      <div class="se-row">
        <span class="se-n">${si + 1}</span>
        <label class="se-f"><input inputmode="decimal" value="${esc(num(s.kg || ""))}" placeholder="0" data-action="se-val" data-k="kg" data-e="${ei}" data-s="${si}" aria-label="Kg, serie ${si + 1}"><span>kg</span></label>
        ${timed
          ? `<label class="se-f"><input inputmode="numeric" value="${esc(secsStr(s.secs))}" placeholder="0" data-action="se-val" data-k="secs" data-e="${ei}" data-s="${si}" aria-label="Segundos, serie ${si + 1}"><span>seg</span></label>`
          : `<label class="se-f"><input inputmode="numeric" value="${esc(s.reps || "")}" placeholder="0" data-action="se-val" data-k="reps" data-e="${ei}" data-s="${si}" aria-label="Reps, serie ${si + 1}"><span>reps</span></label>`}
        <button class="se-rm" data-action="se-rmset" data-e="${ei}" data-s="${si}" aria-label="Quitar la serie ${si + 1}">✕</button>
      </div>`).join("");
    return `<div class="se-ex"><div class="se-exn">${esc(ex.name)}</div>${rows || '<div class="cal-hint">Sin series: se quita del entreno.</div>'}</div>`;
  }).join("");
  return `
    <div class="sheet-bg" data-action="se-cancel"></div>
    <div class="sheet se-sheet" role="dialog" aria-label="Editar entreno">
      <div class="sheet-title">Editar entreno</div>
      <div class="se-sub">${fmtDate(se.date)}${se.day ? " · " + esc(se.day) : ""}</div>
      <div class="se-list">${blocks}</div>
      <div class="sheet-btns">
        <button class="ctrl" data-action="se-cancel">Cancelar</button>
        <button class="ctrl primary" data-action="se-save">Guardar cambios</button>
      </div>
    </div>`;
}

// Cambia el valor en la copia de trabajo (sin redibujar: se perdería el foco del teclado).
export function setSessionEditVal(el) {
  const se = EditState.se; if (!se) return;
  const s = se.exercises[+el.dataset.e] && se.exercises[+el.dataset.e].sets[+el.dataset.s]; if (!s) return;
  s[el.dataset.k] = el.value;
}

export function removeSessionEditSet(ei, si) {
  const ex = EditState.se && EditState.se.exercises[ei]; if (!ex) return;
  ex.sets.splice(si, 1);
}

// Pasa la copia de trabajo al formato guardado. Devuelve los ejercicios limpios, o un
// mensaje si no queda nada.
export function cleanSessionEdit() {
  const se = EditState.se;
  const exs = [];
  se.exercises.forEach(ex => {
    const sets = (ex.sets || []).map(s => {
      const o = { kg: parseFloat(String(s.kg).replace(",", ".")) || 0, reps: parseInt(s.reps) || 0 };
      const sc = parseSecs(s.secs); if (sc > 0) o.secs = Math.min(36000, sc);
      return o;
    }).filter(s => s.kg !== 0 || s.reps > 0 || s.secs > 0);
    if (sets.length) exs.push({ name: ex.name, sets });
  });
  if (!exs.length) return { error: "No quedó ninguna serie con datos. Si querés borrar el entreno entero, usá la ✕ del historial." };
  return { exercises: exs };
}
