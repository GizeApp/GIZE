// Preguntas que el cliente responde en "Registro de hoy" (daily) y en el "Check-in
// semanal" (checkin). Cada coach puede armar las suyas desde Configuración (ver
// screens/coach/preguntas.js); si no tocó nada, se usan las predeterminadas de acá,
// que son exactamente las que la app tenía fijas antes.
//
// Una pregunta es { id, label, type: "text" | "options", options?: [..] }.
// El id es la clave con la que se guarda la respuesta. Las predeterminadas conservan
// sus ids de siempre (soreness, q1, adherence…) para que las respuestas viejas se sigan
// leyendo; las que agrega el coach reciben un id nuevo ("c…").

import { SCALES, CHECKIN_Q } from './data.js';

import { State, state } from './state.js';

export const DAILY_DEFAULT = SCALES.map(s => ({ id: s[0], label: s[1], type: "options", options: s[2].slice() }))
  .concat([{ id: "comment", label: "Comentarios del día", type: "text" }]);

export const CHECKIN_DEFAULT = CHECKIN_Q.map(q => ({ id: q[0], label: q[1], type: "text" }))
  .concat([{ id: "adherence", label: "Adherencia a la nutrición (1 = nada, 10 = perfecto)", type: "options",
    options: ["1","2","3","4","5","6","7","8","9","10"] }]);

// Respuestas del registro diario que tienen columna propia en daily_logs. El resto
// (preguntas nuevas del coach) va en daily_logs.answers (jsonb).
export const DAILY_COLUMNS = ["soreness", "performance", "motivation", "hunger", "fatigue", "sleep", "comment"];

export const QUESTION_KINDS = ["daily", "checkin"];

export function defaultQuestions(kind){
  return JSON.parse(JSON.stringify(kind === "daily" ? DAILY_DEFAULT : CHECKIN_DEFAULT));
}

// Limpia lo que viene de la base o del editor: descarta preguntas sin texto, recorta
// opciones vacías y pasa a "texto" una de opciones que se quedó sin opciones.
export function normalizeQuestions(list){
  if (!Array.isArray(list)) return null;
  const out = [];
  list.forEach(q => {
    if (!q || !q.id) return;
    const label = String(q.label || "").trim();
    if (!label) return;
    const opts = Array.isArray(q.options) ? q.options.map(o => String(o).trim()).filter(Boolean) : [];
    if (q.type === "options" && opts.length) out.push({ id: String(q.id), label: label, type: "options", options: opts });
    else out.push({ id: String(q.id), label: label, type: "text" });
  });
  return out;
}

// Preguntas que ve el cliente: las de su coach si las configuró, si no las de siempre.
// Una lista vacía es a propósito (el coach borró todas y guardó): no se cambia por las de
// siempre. Sin configurar (null) sí.
export function clientQuestions(kind){
  const cq = state.coachQ && normalizeQuestions(state.coachQ[kind]);
  return cq ? cq : defaultQuestions(kind);
}

// "Foto" de los textos de las preguntas respondidas, guardada junto con las respuestas
// (clave _q). Así, si el coach después cambia o borra una pregunta, las respuestas viejas
// se siguen mostrando con la pregunta que el cliente vio en su momento.
export function questionSnapshot(list, answers){
  const snap = {};
  (list || []).forEach(q => { if (answers && answers[q.id] != null && answers[q.id] !== "") snap[q.id] = q.label; });
  return snap;
}

export function newQuestionId(){
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Para el panel del coach: el orden y los textos de las preguntas con respuesta, según
// su configuración actual y, para lo que ya no está, la foto guardada o la predeterminada.
export function answeredQuestions(kind, answers, coachList){
  const a = answers || {};
  const snap = a._q || {};
  const current = (coachList && coachList.length) ? coachList : defaultQuestions(kind);
  const defaults = defaultQuestions(kind);
  const seen = {};
  const out = [];
  current.forEach(q => { seen[q.id] = 1; if (a[q.id] != null && a[q.id] !== "") out.push({ id: q.id, label: q.label, value: a[q.id] }); });
  Object.keys(a).forEach(k => {
    if (seen[k] || k === "_q" || a[k] == null || a[k] === "") return;
    const d = defaults.find(q => q.id === k);
    out.push({ id: k, label: snap[k] || (d && d.label) || k, value: a[k] });
  });
  return out;
}

// El coach logueado guarda sus propias preguntas en State (no en el state del cliente).
// Puede ser [] si las borró todas (answeredQuestions usa entonces el orden de siempre).
export function coachOwnQuestions(kind){
  const cq = State.coachQ && normalizeQuestions(State.coachQ[kind]);
  return cq || null;
}
