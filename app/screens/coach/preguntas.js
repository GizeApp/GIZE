// Editor de las preguntas que responden los clientes del coach: las del "Registro de hoy"
// y las del "Check-in semanal". Se abre desde Configuración (tuerca del panel) en el mismo
// modal (.cp-ccard en #coachSheetHost). Las preguntas valen para todos los clientes del
// coach y se guardan en la tabla coach_questions (ver supabase/preguntas-coach.sql).
//
// Mientras se edita se trabaja sobre una copia (CoachState.coachQEdit); recién "Guardar"
// la manda a la base. Los campos de texto no re-renderizan en cada tecla (mismo criterio
// que "settings-name" en main.js: re-dibujar el modal le sacaría el foco al input).

import { State } from '../../core/state.js';

import { esc } from '../../core/utils.js';

import { defaultQuestions, newQuestionId, normalizeQuestions } from '../../core/questions.js';

import { CoachState } from './state.js';

import { renderCoachSettings } from './settings.js';

const KIND_LABEL = { daily: "Registro de hoy", checkin: "Check-in semanal" };
const KIND_HINT = {
  daily: "El cliente las responde cada día. El peso se pide siempre.",
  checkin: "El cliente las responde una vez por semana."
};

// Lee las preguntas del coach logueado. Sin fila = usa las predeterminadas.
export async function loadCoachQuestions(){
  if(!State.sb || !State.cloudUser) return;
  const r = await State.sb.from("coach_questions").select("daily, checkin").eq("coach_id", State.cloudUser.id).maybeSingle();
  if(r.error){ CoachState.coachQError = r.error; return; }
  CoachState.coachQError = null;
  State.coachQ = r.data ? { daily: r.data.daily || null, checkin: r.data.checkin || null } : null;
}

// Una lista vacía guardada queda vacía (antes, al volver a abrir, mostraba las de siempre
// como si no se hubiera guardado).
function currentList(kind){
  const cq = State.coachQ && normalizeQuestions(State.coachQ[kind]);
  return cq ? cq : defaultQuestions(kind);
}

function openEditor(tab){
  CoachState.coachQEdit = { tab: (tab === "checkin" ? "checkin" : "daily"), daily: currentList("daily"), checkin: currentList("checkin"), dirty: false };
  renderQuestionsEditor();
  // Si todavía no se leyeron (o cambiaron en otro dispositivo), se leen y se refresca,
  // salvo que el coach ya haya empezado a editar.
  loadCoachQuestions().then(() => {
    const ed = CoachState.coachQEdit; if(!ed || ed.dirty) return;
    ed.daily = currentList("daily"); ed.checkin = currentList("checkin"); renderQuestionsEditor();
  }).catch(() => {});
}

function questionRow(q, i, n){
  const isOpt = q.type === "options";
  return '<div class="cq-item">' +
    '<div class="cq-top"><span class="cq-n">' + (i + 1) + '</span>' +
      '<textarea class="co-note cq-label" rows="2" data-coach="q-label" data-i="' + i + '" placeholder="Escribí la pregunta">' + esc(q.label) + '</textarea></div>' +
    '<div class="cq-row">' +
      '<select class="co-note cq-type" data-coach="q-type" data-i="' + i + '" aria-label="Tipo de respuesta">' +
        '<option value="text"' + (isOpt ? '' : ' selected') + '>Respuesta libre</option>' +
        '<option value="options"' + (isOpt ? ' selected' : '') + '>Elegir una opción</option>' +
      '</select>' +
      '<button class="cq-btn" data-coach="q-up" data-i="' + i + '" title="Subir" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="cq-btn" data-coach="q-down" data-i="' + i + '" title="Bajar" aria-label="Bajar"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button class="cq-btn del" data-coach="q-del" data-i="' + i + '" title="Borrar pregunta" aria-label="Borrar pregunta">✕</button>' +
    '</div>' +
    (isOpt ? '<input class="co-note cq-opts" data-coach="q-opts" data-i="' + i + '" value="' + esc((q.options || []).join(", ")) + '" placeholder="Opciones separadas por coma: Nada, Poco, Mucho">' : '') +
  '</div>';
}

export function renderQuestionsEditor(){
  const host = document.getElementById("coachSheetHost"); if(!host) return;
  const ed = CoachState.coachQEdit;
  if(!ed){ renderCoachSettings(); return; }
  const list = ed[ed.tab];
  const tabs = Object.keys(KIND_LABEL).map(k =>
    '<button class="cq-tab' + (ed.tab === k ? ' on' : '') + '" data-coach="q-tab" data-k="' + k + '">' + KIND_LABEL[k] + '</button>').join("");
  const warn = CoachState.coachQError ? '<div class="cq-warn">No se pudieron leer tus preguntas guardadas. Si es la primera vez, falta correr <b>supabase/preguntas-coach.sql</b> en Supabase. Mientras tanto, tus clientes ven las predeterminadas.</div>' : '';
  host.innerHTML = '<div class="cp-bg" data-coach="q-close"></div><div class="cp-ccard cq-card">' +
    '<div class="cp-head"><button class="cq-back" data-coach="q-close" aria-label="Volver">‹</button><div class="cp-title">Preguntas para tus clientes</div><button class="cp-x" data-coach="q-close" aria-label="Cerrar">✕</button></div>' +
    '<div class="cq-tabs">' + tabs + '</div>' +
    '<div class="cq-hint">' + KIND_HINT[ed.tab] + ' Los cambios valen para todos tus clientes.</div>' +
    warn +
    (list.length ? list.map((q, i) => questionRow(q, i, list.length)).join("") : '<div class="cal-hint">Sin preguntas. Tus clientes solo van a ver ' + (ed.tab === "daily" ? 'el peso.' : 'un check-in vacío.') + '</div>') +
    '<button class="pl-add cq-add" data-coach="q-add">+ Agregar pregunta</button>' +
    '<button class="co-save-rt" data-coach="q-save">Guardar preguntas</button>' +
    '<button class="logout-btn cq-reset" data-coach="q-reset">Volver a las predeterminadas</button>' +
  '</div>';
}

function closeEditor(){
  const ed = CoachState.coachQEdit;
  if(ed && ed.dirty && !confirm("Tenés cambios sin guardar en las preguntas. ¿Salir igual?")) return;
  CoachState.coachQEdit = null;
  renderCoachSettings();
}

async function saveQuestions(btn){
  const ed = CoachState.coachQEdit; if(!ed) return;
  const daily = normalizeQuestions(ed.daily) || [], checkin = normalizeQuestions(ed.checkin) || [];
  const bad = ["daily", "checkin"].find(k => (ed[k] || []).some(q => q.type === "options" && !(q.options || []).filter(o => String(o).trim()).length && String(q.label || "").trim()));
  if(bad && !confirm("Hay preguntas de \"Elegir una opción\" sin opciones en " + KIND_LABEL[bad] + ". Se van a guardar como respuesta libre. ¿Seguir?")) return;
  btn.textContent = "Guardando...";
  const r = await State.sb.from("coach_questions").upsert(
    { coach_id: State.cloudUser.id, daily: daily, checkin: checkin, updated_at: new Date().toISOString() },
    { onConflict: "coach_id" });
  if(r.error){
    btn.textContent = "Guardar preguntas";
    alert("No se pudieron guardar las preguntas: " + (r.error.message || r.error) +
      "\n\nSi dice que la tabla no existe, falta correr supabase/preguntas-coach.sql en Supabase.");
    return;
  }
  State.coachQ = { daily: daily, checkin: checkin }; CoachState.coachQError = null;
  CoachState.coachQEdit = null;
  alert("Preguntas guardadas ✓ Tus clientes las ven la próxima vez que abran la app.");
  renderCoachSettings();
}

document.body.addEventListener("click", e => {
  const b = e.target.closest("[data-coach]"); if(!b) return;
  const a = b.dataset.coach; if(a.indexOf("q-") !== 0) return;
  if(a === "q-open"){ openEditor(b.dataset.k); return; }
  const ed = CoachState.coachQEdit; if(!ed) return;
  const list = ed[ed.tab], i = +b.dataset.i;
  if(a === "q-close"){ closeEditor(); return; }
  if(a === "q-save"){ saveQuestions(b); return; }
  if(a === "q-tab"){ ed.tab = b.dataset.k; renderQuestionsEditor(); return; }
  if(a === "q-add"){
    list.push({ id: newQuestionId(), label: "", type: "text" }); ed.dirty = true; renderQuestionsEditor();
    const ins = document.querySelectorAll(".cq-label"); const last = ins[ins.length - 1]; if(last) last.focus();
    return;
  }
  if(a === "q-del"){ if(confirm("¿Borrar esta pregunta? Las respuestas que ya dieron tus clientes no se pierden.")){ list.splice(i, 1); ed.dirty = true; renderQuestionsEditor(); } return; }
  if(a === "q-up" && i > 0){ list.splice(i - 1, 0, list.splice(i, 1)[0]); ed.dirty = true; renderQuestionsEditor(); return; }
  if(a === "q-down" && i < list.length - 1){ list.splice(i + 1, 0, list.splice(i, 1)[0]); ed.dirty = true; renderQuestionsEditor(); return; }
  if(a === "q-reset"){
    if(confirm("¿Volver a las preguntas predeterminadas de " + KIND_LABEL[ed.tab] + "? Se reemplazan las de esta pestaña (tocá Guardar para aplicarlo).")){
      ed[ed.tab] = defaultQuestions(ed.tab); ed.dirty = true; renderQuestionsEditor();
    }
  }
});

document.body.addEventListener("input", e => {
  const el = e.target.closest("[data-coach]"); if(!el) return;
  const a = el.dataset.coach; const ed = CoachState.coachQEdit; if(!ed || a.indexOf("q-") !== 0) return;
  const q = ed[ed.tab][+el.dataset.i]; if(!q) return;
  if(a === "q-label"){ q.label = el.value; ed.dirty = true; }
  else if(a === "q-opts"){ q.options = el.value.split(",").map(x => x.trim()).filter(Boolean); ed.dirty = true; }
});

document.body.addEventListener("change", e => {
  const el = e.target.closest("[data-coach]"); if(!el || el.dataset.coach !== "q-type") return;
  const ed = CoachState.coachQEdit; if(!ed) return;
  const q = ed[ed.tab][+el.dataset.i]; if(!q) return;
  q.type = el.value === "options" ? "options" : "text";
  if(q.type === "options" && !(q.options && q.options.length)) q.options = [];
  ed.dirty = true; renderQuestionsEditor();
  const o = document.querySelector('.cq-opts[data-i="' + el.dataset.i + '"]'); if(o) o.focus();
});
