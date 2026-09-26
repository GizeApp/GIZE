// Entreno del historial que se abre al tocarlo: fecha/día arriba y, adentro, cada
// ejercicio con sus series (kg × reps), los totales de la sesión y el feedback que el
// cliente mandó al guardar. Lo usan el cliente (Progreso → Historial de entrenos) y el
// coach (ficha del cliente → Historial de entrenos), así los dos ven exactamente lo mismo.
//
// Va con <details>/<summary> nativos a propósito: abrir/cerrar no pasa por renderApp()
// ni necesita estado propio, funciona con teclado y el lector de pantalla lo anuncia
// como expandible. El botón de borrar queda FUERA del <summary>: adentro, tocarlo
// también abriría/cerraría el entreno.

import { esc, fmtDate, fmtSecs } from '../core/utils.js';

const fmtKg = n => { const v = Number(n) || 0; return (Math.round(v * 100) / 100).toString().replace(".", ","); };

function exerciseBlock(ex){
  const sets = ex.sets || [];
  const best = sets.reduce((b, s) => (Number(s.kg) || 0) > (Number(b && b.kg) || 0) ? s : b, null);
  // Series por tiempo (plancha, isométricos): el tiempo va donde van las reps y el kg solo si hubo.
  const rows = sets.map((s, i) => (Number(s.secs) || 0) > 0 ?
    '<div class="sd-set"><span class="sd-n">' + (i + 1) + '</span>' +
    '<span class="sd-kg">' + ((Number(s.kg) || 0) > 0 ? fmtKg(s.kg) + '<small>kg</small>' : '') + '</span>' +
    '<span class="sd-x">' + ((Number(s.kg) || 0) > 0 ? '·' : '') + '</span>' +
    '<span class="sd-reps">' + fmtSecs(s.secs) + '</span></div>' :
    '<div class="sd-set"><span class="sd-n">' + (i + 1) + '</span>' +
    '<span class="sd-kg">' + fmtKg(s.kg) + '<small>kg</small></span>' +
    '<span class="sd-x">×</span>' +
    '<span class="sd-reps">' + (Number(s.reps) || 0) + '<small>reps</small></span></div>'
  ).join("");
  const meta = [sets.length + (sets.length === 1 ? " serie" : " series")];
  if (best && Number(best.kg) > 0) meta.push("mejor " + fmtKg(best.kg) + " kg");
  const maxSecs = sets.reduce((m, s) => Math.max(m, Number(s.secs) || 0), 0);
  if (maxSecs > 0) meta.push("máx " + fmtSecs(maxSecs));
  return '<div class="sd-ex"><div class="sd-ex-h"><span class="sd-ex-name">' + esc(ex.name || "") + '</span>' +
    '<span class="sd-ex-meta">' + meta.join(" · ") + '</span></div>' + rows + '</div>';
}

// Coach: cada ejercicio de este entreno al lado de la vez pasada que lo hizo (el entreno
// anterior con ese ejercicio), serie por serie, con la diferencia marcada en color.
const setTxt = s => !s ? "—" : (Number(s.secs) || 0) > 0 ? ((Number(s.kg) || 0) > 0 ? fmtKg(s.kg) + " kg · " : "") + fmtSecs(s.secs)
  : fmtKg(s.kg) + " kg × " + (Number(s.reps) || 0);
function setDiff(s, p){
  if (!s || !p) return '<span class="sc-d none"></span>';
  const out = [];
  const dk = Math.round(((Number(s.kg) || 0) - (Number(p.kg) || 0)) * 100) / 100;
  if (dk) out.push('<b class="' + (dk > 0 ? 'up' : 'down') + '">' + (dk > 0 ? '▲ +' : '▼ −') + fmtKg(Math.abs(dk)) + ' kg</b>');
  const timed = (Number(s.secs) || 0) > 0 || (Number(p.secs) || 0) > 0;
  const dr = timed ? (Number(s.secs) || 0) - (Number(p.secs) || 0) : (Number(s.reps) || 0) - (Number(p.reps) || 0);
  if (dr) out.push('<b class="' + (dr > 0 ? 'up' : 'down') + '">' + (dr > 0 ? '▲ +' : '▼ −') + (timed ? fmtSecs(Math.abs(dr)) : Math.abs(dr) + (Math.abs(dr) === 1 ? ' rep' : ' reps')) + '</b>');
  return '<span class="sc-d">' + (out.length ? out.join("") : '<b class="eq">= igual</b>') + '</span>';
}
function exerciseCompare(ex, prev){
  const sets = ex.sets || [], ps = prev ? (prev.ex.sets || []) : [];
  const n = Math.max(sets.length, ps.length);
  let rows = "";
  for (let i = 0; i < n; i++){
    rows += '<div class="sc-row"><span class="sd-n">' + (i + 1) + '</span>' +
      '<span class="sc-now">' + (sets[i] ? setTxt(sets[i]) : '<i>no la hizo</i>') + '</span>' +
      (prev ? '<span class="sc-prev">' + (ps[i] ? setTxt(ps[i]) : '—') + '</span>' + setDiff(sets[i], ps[i]) : '') + '</div>';
  }
  return '<div class="sd-ex sc-ex"><div class="sd-ex-h"><span class="sd-ex-name">' + esc(ex.name || "") + '</span>' +
    '<span class="sd-ex-meta">' + (prev ? 'la vez pasada: ' + fmtDate(prev.date) : 'primera vez que lo hace') + '</span></div>' +
    (prev ? '<div class="sc-row sc-head"><span></span><span>Este entreno</span><span>La vez pasada</span><span>Diferencia</span></div>' : '') +
    rows + '</div>';
}
// La vez anterior que hizo ese ejercicio (mismo nombre), antes de este entreno.
function prevOf(name, se, all){
  const key = String(name || "").trim().toLowerCase(), t = se.ts || 0;
  let best = null;
  for (const o of all || []){
    if (o === se || (o.ts || 0) >= t) continue;
    const ex = (o.exercises || []).find(e => String(e.name || "").trim().toLowerCase() === key);
    if (ex && (!best || (o.ts || 0) > (best.ts || 0))) best = { ex, date: o.date, ts: o.ts };
  }
  return best;
}

function feedbackChips(se){
  const chips = [];
  if (se.rpe) chips.push('<span class="sd-chip">Fatiga <b>' + (parseInt(se.rpe) || 0) + '/5</b></span>');
  if (se.pump) chips.push('<span class="sd-chip">Pump <b>' + (parseInt(se.pump) || 0) + '/5</b></span>');
  if (typeof se.joint === "boolean") chips.push('<span class="sd-chip' + (se.joint ? ' warn' : '') + '">Dolor articular <b>' + (se.joint ? "Sí" : "No") + '</b></span>');
  return chips.length ? '<div class="sd-fb">' + chips.join("") + '</div>' : "";
}

// Duración guardada al terminar (segundos desde la primera serie tildada): "47 min", "1 h 05".
const durShort = s => { s = Math.round(+s || 0); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? h + " h " + String(m).padStart(2, "0") : Math.max(1, m) + " min"; };

// opts.removeBtn: HTML del botón de borrar (solo el cliente borra sus entrenos).
// opts.open: arranca desplegado (el coach lo muestra así al elegirlo en el selector).
// opts.history: todos los entrenos del alumno; si viene, cada ejercicio se compara con la vez pasada.
export function renderSessionItem(se, opts){
  opts = opts || {};
  const exs = se.exercises || [];
  const nSets = exs.reduce((t, e) => t + (e.sets || []).length, 0);
  const names = exs.map(e => e.name).join(", ");
  const totals = '<div class="sd-tot">' +
    '<div><b>' + exs.length + '</b><span>ejercicio' + (exs.length === 1 ? "" : "s") + '</span></div>' +
    '<div><b>' + nSets + '</b><span>serie' + (nSets === 1 ? "" : "s") + '</span></div>' +
    (se.dur > 0 ? '<div><b>' + durShort(se.dur) + '</b><span>de entreno</span></div>' : '') + '</div>';
  const rm = opts.removeBtn || "";
  return '<div class="sess-item sess-det-wrap">' +
    '<details class="sess-det"' + (opts.open ? ' open' : '') + '><summary class="sess-sum"><div class="sess-main">' +
      '<div class="sess-date">' + fmtDate(se.date) + ' · ' + esc(se.day || "") + ' <span class="sess-n">(' + nSets + (nSets === 1 ? ' serie' : ' series') + ')</span></div>' +
      '<div class="sess-exs">' + esc(names) + '</div></div>' +
      '<span class="sess-chev" aria-hidden="true"></span></summary>' +
    '<div class="sess-body">' + totals + feedbackChips(se) + (opts.history ? exs.map(e => exerciseCompare(e, prevOf(e.name, se, opts.history))).join("") : exs.map(exerciseBlock).join("")) + '</div></details>' +
    rm + '</div>';
}
