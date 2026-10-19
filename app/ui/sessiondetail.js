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

// Variante del día (core/variantes.js): «Hizo X en lugar de Y».
function varNote(ex){
  if (!ex.originalName || ex.originalName === ex.name) return '';
  return '<div class="sd-var">Hizo <b>' + esc(ex.name) + '</b> en lugar de <b>' + esc(ex.originalName) + '</b></div>';
}

// Tarjeta de un ejercicio: nombre + cómo le fue arriba, y las series como fichas en grilla
// (en vez de una lista vertical) para ver todo el ejercicio de un vistazo. Con `prev` (coach),
// cada ficha lleva debajo la diferencia contra la vez pasada y el título muestra la variación
// de la mejor serie.
function setChip(s, i, diff){
  const kg = Number(s.kg) || 0, secs = Number(s.secs) || 0, reps = Number(s.reps) || 0;
  // Series por tiempo (plancha, isométricos): el tiempo va donde van las reps y el kg solo si hubo.
  const val = secs > 0
    ? (kg !== 0 ? '<b>' + fmtKg(kg) + '</b><small>kg</small><i>·</i>' : '') + '<b>' + fmtSecs(secs) + '</b>'
    : (kg !== 0 ? '<b>' + fmtKg(kg) + '</b><small>kg</small><i>×</i>' : '') + '<b>' + reps + '</b>' + (kg !== 0 ? '' : '<small>reps</small>');
  return '<div class="sx-set' + (secs <= 0 && reps === 0 ? ' zero' : '') + '"><div class="sx-set-v"><span class="sd-n">' + (i + 1) + '</span>' +
    '<span class="sx-val">' + val + '</span></div>' + (diff || '') + '</div>';
}
const bestKg = sets => sets.reduce((m, s) => Math.max(m, Number(s.kg) || 0), 0);
// Reps de las series que ambos entrenos tienen (las de más no se pueden comparar).
const commonReps = (sets, n) => sets.slice(0, n).reduce((t, s) => t + (Number(s.reps) || 0), 0);
// Variación del ejercicio contra la vez pasada: primero el kg de la mejor serie y, si no cambió, las reps totales.
function deltaBadge(sets, prev){
  if (!prev) return '<span class="sx-badge new">Primera vez</span>';
  const ps = prev.ex.sets || [];
  const dk = Math.round((bestKg(sets) - bestKg(ps)) * 100) / 100;
  const n = Math.min(sets.length, ps.length), dr = commonReps(sets, n) - commonReps(ps, n);
  const d = dk || dr, txt = dk ? fmtKg(Math.abs(dk)) + ' kg' : Math.abs(dr) + (Math.abs(dr) === 1 ? ' rep' : ' reps');
  return d ? '<span class="sx-badge ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ +' : '▼ −') + txt + '</span>' : '<span class="sx-badge eq">= igual</span>';
}
function exerciseCard(ex, prev, compare){
  const sets = ex.sets || [], ps = prev ? (prev.ex.sets || []) : [];
  const best = sets.reduce((b, s) => (Number(s.kg) || 0) !== 0 && (!b || Number(s.kg) > Number(b.kg)) ? s : b, null);
  const meta = [sets.length + (sets.length === 1 ? " serie" : " series")];
  if (best) meta.push("mejor " + fmtKg(best.kg) + " kg");
  const maxSecs = sets.reduce((m, s) => Math.max(m, Number(s.secs) || 0), 0);
  if (maxSecs > 0) meta.push("máx " + fmtSecs(maxSecs));
  if (prev) meta.push("vs " + fmtDate(prev.date));
  return '<div class="sx-card"><div class="sx-h"><span class="sd-ex-name">' + esc(ex.name || "") + '</span>' + (compare ? deltaBadge(sets, prev) : '') + '</div>' +
    '<div class="sd-ex-meta">' + meta.join(" · ") + '</div>' + varNote(ex) +
    '<div class="sx-sets">' + sets.map((s, i) => setChip(s, i, prev ? setDiff(s, ps[i]) : '')).join("") + '</div></div>';
}
const exerciseBlock = ex => exerciseCard(ex, null, false);

// Coach: cada ejercicio de este entreno al lado de la vez pasada que lo hizo (el entreno
// anterior con ese ejercicio), serie por serie, con la diferencia marcada en color.
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
const exerciseCompare = (ex, prev) => exerciseCard(ex, prev, true);
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
// Se redondea primero el total en minutos: 1:59:30 es "2 h 00", no "1 h 60".
const durShort = s => { const tm = Math.round((+s || 0) / 60), h = Math.floor(tm / 60), m = tm % 60; return h ? h + " h " + String(m).padStart(2, "0") : Math.max(1, m) + " min"; };

// opts.removeBtn: HTML del botón de borrar (solo el cliente borra sus entrenos).
// opts.open: arranca desplegado (el coach lo muestra así al elegirlo en el selector).
// opts.history: todos los entrenos del alumno; si viene, cada ejercicio se compara con la vez pasada.
export function renderSessionItem(se, opts){
  opts = opts || {};
  const exs = se.exercises || [];
  const nSets = exs.reduce((t, e) => t + (e.sets || []).length, 0);
  const names = exs.map(e => e.name + (e.originalName && e.originalName !== e.name ? " (en lugar de " + e.originalName + ")" : "")).join(", ");
  const totals = '<div class="sd-tot">' +
    '<div><b>' + exs.length + '</b><span>ejercicio' + (exs.length === 1 ? "" : "s") + '</span></div>' +
    '<div><b>' + nSets + '</b><span>serie' + (nSets === 1 ? "" : "s") + '</span></div>' +
    (se.dur > 0 ? '<div><b>' + durShort(se.dur) + '</b><span>de entreno</span></div>' : '') + '</div>';
  const rm = opts.removeBtn || "";
  // has-acts: Editar/Borrar van arriba a la derecha y el detalle abierto usa todo el ancho.
  return '<div class="sess-item sess-det-wrap' + (rm ? ' has-acts' : '') + '">' +
    '<details class="sess-det"' + (opts.open ? ' open' : '') + '><summary class="sess-sum"><div class="sess-main">' +
      '<div class="sess-date">' + fmtDate(se.date) + ' · ' + esc(se.day || "") + '</div>' +
      '<div class="sess-exs">' + esc(names) + '</div></div>' +
      '<span class="sess-chev" aria-hidden="true"></span></summary>' +
    '<div class="sess-body">' + totals + feedbackChips(se) + '<div class="sx-grid">' + (opts.history ? exs.map(e => exerciseCompare(e, prevOf(e.name, se, opts.history))).join("") : exs.map(exerciseBlock).join("")) + '</div></div></details>' +
    rm + '</div>';
}
