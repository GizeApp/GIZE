import { RC } from '../core/data.js';

import { checkSvg, xSvg } from '../core/icons.js';

import { state } from '../core/state.js';

import { save } from '../core/storage.js';

import { dayRolled } from '../core/supabase.js';

import { esc, hkey, today, uid } from '../core/utils.js';

import { renderApp } from '../main.js';

import { liveCounting } from './entreno.js';

import { logDayKcal } from './comida.js';

export const HabitosState = {

  pendingFocusHabit: false,

  pendingFocusDay: false,

  edit: null, // hoja de días y aviso abierta: { kind, key, name, coachDays, days, time }

};

export function checkDaily(){ const t=today(); let ch=false;
  if (state.habitsDate !== t) { state.habits.forEach(h=>h.done=false); state.habitsDate=t; ch=true; }
  if (state.diaryDate !== t) { logDayKcal(state.diaryDate, state.diary); state.diary=[]; state.diaryDate=t; ch=true; }
  if (state.stepsDate !== t) { state.steps=0; state.stepsDate=t; ch=true; }
  if (state.waterDate !== t) { state.water=0; state.waterDate=t; ch=true; }
  // El día nuevo vacío no se sube: traería abajo lo cargado hoy en otro dispositivo (ver dayRolled).
  if (ch) { dayRolled(); save(); }
}

// ---- Días y aviso de cada hábito (la campanita) ----
// state.habitAlarms = { own: { [id del hábito]: { days, time } }, coach: { [nombre]: { days, time } } }
//   · days: días de la semana en que va (0 = domingo … 6 = sábado); sin days = todos los días.
//   · time: "HH:MM" del aviso (solo suena en las apps de Android y iPhone, ver ui/habitnotif.js).
// Los hábitos del coach traen sus días del plan (coachPlan.habitDays, alineado con habits); el
// alumno puede cambiarlos y ponerles hora (el coach no elige horas). Se guarda aparte de la
// lista (client_prefs.habit_alarms) para que una versión vieja de la app no lo borre.
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // de lunes a domingo
const DAY_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
const DAY_NAME = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const bellSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

const cleanDays = d => Array.isArray(d) ? [...new Set(d.map(Number).filter(n => n >= 0 && n <= 6))].sort((a, b) => a - b) : null;
const everyDay = d => !d || !d.length || d.length === 7;
export function todayDow(){ return new Date(today() + "T12:00:00").getDay(); }
export function daysText(d){
  if (everyDay(d)) return "Todos los días";
  const k = d.join(",");
  if (k === "1,2,3,4,5") return "Lunes a viernes";
  if (k === "0,6") return "Fines de semana";
  return WEEK.filter(x => d.includes(x)).map(x => DAY_NAME[x]).join(", ");
}

// Hábitos del coach con sus días (los vacíos se descartan sin perder a qué días va cada uno).
export function coachHabitList(){
  const p = state.coachPlan; if (!p || !Array.isArray(p.habits)) return [];
  const hd = Array.isArray(p.habitDays) ? p.habitDays : [];
  return p.habits.map((name, i) => ({ name, coachDays: everyDay(cleanDays(hd[i])) ? null : cleanDays(hd[i]) })).filter(x => x.name && x.name.trim());
}

function alarmsOf(kind){ const a = state.habitAlarms && state.habitAlarms[kind]; return a && typeof a === "object" ? a : {}; }
// Días y hora que valen para un hábito (con lo que eligió el alumno encima de lo del coach).
export function habitSchedule(kind, key, coachDays){
  const a = alarmsOf(kind)[key] || {};
  const days = Array.isArray(a.days) ? (everyDay(cleanDays(a.days)) ? null : cleanDays(a.days)) : (kind === "coach" ? coachDays || null : null);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(a.time || "") ? a.time : null;
  return { days, time };
}
const activeToday = days => !days || days.includes(todayDow());

// Todos los avisos a programar (ui/habitnotif.js).
export function habitAlarmList(){
  const out = [];
  coachHabitList().forEach(h => { const s = habitSchedule("coach", h.name, h.coachDays); if (s.time) out.push({ name: h.name, days: s.days, time: s.time }); });
  (state.habits || []).forEach(h => { const s = habitSchedule("own", h.id, null); if (s.time) out.push({ name: h.name, days: s.days, time: s.time }); });
  return out;
}

function metaLine(s){
  if (!s.time && !s.days) return "";
  return `<span class="hb-meta">${s.time ? esc(s.time) + ' · ' : ''}${esc(daysText(s.days))}</span>`;
}
function alarmBtn(kind, key, s){
  return `<button class="hb-alarm${s.time ? ' on' : ''}" data-action="habit-alarm" data-kind="${kind}" data-key="${esc(key)}" aria-label="Días y aviso">${bellSvg}</button>`;
}

export function renderHabitos(){
  const coach = coachHabitList().map(h => Object.assign(h, { s: habitSchedule("coach", h.name, h.coachDays) }));
  const own = (state.habits || []).map(h => ({ h, s: habitSchedule("own", h.id, null) }));
  const cToday = coach.filter(x => activeToday(x.s.days)), oToday = own.filter(x => activeToday(x.s.days));
  const chDone = cToday.filter(x => state.habitsDone && state.habitsDone[hkey(x.name)]).length;
  const total = oToday.length + cToday.length;
  const done = oToday.filter(x => x.h.done).length + chDone;
  const pct = total ? Math.round(done/total*100) : 0;
  const coachRow = x => {
    const on = !!(state.habitsDone && state.habitsDone[hkey(x.name)]);
    return `<div class="hb-item coach" data-action="chabit-toggle" data-name="${esc(x.name)}">
      <span class="hb-check${on?' on':''}">${on?checkSvg:''}</span>
      <span class="hb-main"><span class="hb-name${on?' done':''}">${esc(x.name)}</span>${metaLine(x.s)}</span>
      <span class="hb-coach-tag">coach</span>
      ${alarmBtn("coach", x.name, x.s)}
    </div>`;
  };
  const ownRow = x => `
    <div class="hb-item" data-action="habit-toggle" data-id="${esc(x.h.id)}">
      <span class="hb-check${x.h.done?' on':''}">${x.h.done?checkSvg:''}</span>
      <span class="hb-main"><span class="hb-name${x.h.done?' done':''}">${esc(x.h.name)}</span>${metaLine(x.s)}</span>
      ${alarmBtn("own", x.h.id, x.s)}
      <button class="hb-rm" data-action="habit-remove" data-id="${esc(x.h.id)}" title="Eliminar">${xSvg}</button>
    </div>`;
  // Los de otros días: se ven abajo, apagados, para poder cambiarlos (no se tachan hoy).
  const later = coach.filter(x => !activeToday(x.s.days)).map(x => ({ name: x.name, kind: "coach", key: x.name, s: x.s }))
    .concat(own.filter(x => !activeToday(x.s.days)).map(x => ({ name: x.h.name, kind: "own", key: x.h.id, s: x.s, id: x.h.id })));
  const laterRows = later.map(x => `<div class="hb-item later">
      <span class="hb-main"><span class="hb-name">${esc(x.name)}</span>${metaLine(x.s)}</span>
      ${x.kind === "coach" ? '<span class="hb-coach-tag">coach</span>' : ''}
      ${alarmBtn(x.kind, x.key, x.s)}
      ${x.kind === "own" ? `<button class="hb-rm" data-action="habit-remove" data-id="${esc(x.id)}" title="Eliminar">${xSvg}</button>` : ''}
    </div>`).join("");
  const items = cToday.map(coachRow).join("") + oToday.map(ownRow).join("");
  return `
    <div class="hb-head">
      <div class="hb-title">Daily Checklist</div>
      <div class="title-accent"></div>
      <div class="progress-row">
        <div class="bar"><div style="width:${pct}%"></div></div>
        <span class="count">${done}/${total}</span>
      </div>
    </div>
    <div class="hb-list">${items || (later.length ? '<div class="empty">Hoy no tenés tareas.</div>' : '<div class="empty">No tenés tareas todavía.<br>Agregá la primera acá abajo 👇</div>')}</div>
    <div class="hb-add">
      <input id="habitInput" type="text" placeholder="Nueva tarea diaria…" data-action="habit-name-input">
      <button class="hb-add-btn" data-action="habit-add">+</button>
    </div>
    ${later.length ? `<div class="hb-later-t">Otros días</div><div class="hb-list">${laterRows}</div>` : ''}
    <p class="foot">Se reinician solas cada día. Con la campanita elegís qué días va cada una y a qué hora te avisa.</p>`;
}

// Hoja para elegir los días y la hora del aviso de un hábito.
export function openHabitAlarm(kind, key){
  let name = "", coachDays = null;
  if (kind === "coach"){ const h = coachHabitList().find(x => x.name === key); if (!h) return; name = h.name; coachDays = h.coachDays; }
  else { const h = (state.habits || []).find(x => x.id === key); if (!h) return; name = h.name; }
  const s = habitSchedule(kind, key, coachDays);
  HabitosState.edit = { kind, key, name, coachDays, days: s.days ? s.days.slice() : null, time: s.time || "" };
}
export function renderHabitAlarmSheet(native){
  const e = HabitosState.edit; if (!e) return "";
  return `
    <div class="sheet-bg" data-action="hba-cancel"></div>
    <div class="sheet hba-sheet" role="dialog" aria-label="Días y aviso"><div class="hba-body">${habitAlarmBody(native)}</div></div>`;
}
function habitAlarmBody(native){
  const e = HabitosState.edit; if (!e) return "";
  const all = !e.days;
  const week = WEEK.map(d => `<button class="hba-day${!all && e.days.includes(d) ? ' on' : ''}" data-action="hba-day" data-d="${d}" aria-label="${DAY_NAME[d]}" aria-pressed="${!all && e.days.includes(d)}">${DAY_SHORT[d]}</button>`).join("");
  const fromCoach = e.kind === "coach" ? `<div class="hba-note">Tu coach lo puso para: <b>${esc(daysText(e.coachDays))}</b>. Podés cambiarlo.</div>` : "";
  return `
      <div class="sheet-title">${esc(e.name)}</div>
      <div class="hba-lbl">Qué días</div>
      <button class="hba-all${all ? ' on' : ''}" data-action="hba-all" aria-pressed="${all}">Todos los días</button>
      <div class="hba-week">${week}</div>
      ${fromCoach}
      <div class="hba-lbl">Aviso</div>
      <div class="hba-time"><button id="hbaTime" class="hba-pick${e.time ? ' on' : ''}" data-action="hba-pick" aria-label="Hora del aviso">${e.time ? esc(e.time) : 'Elegir la hora'}</button>${e.time ? '<button class="hba-clear" data-action="hba-notime">Sin aviso</button>' : ''}</div>
      <div class="sheet-btns">
        <button class="ctrl ghost" data-action="hba-cancel">Cancelar</button>
        <button class="ctrl primary" data-action="hba-save">Guardar</button>
      </div>`;
}
// Al cambiar días u hora se actualiza solo el contenido de la hoja: volver a dibujarla entera
// repetía la animación de apertura (parecía que se abría de nuevo), como pasaba en Comida.
export function paintHabitAlarmSheet(native){
  const b = document.querySelector("#sheetHost .hba-sheet .hba-body");
  if (!b) return false;
  b.innerHTML = habitAlarmBody(native);
  return true;
}
export function habitAlarmDay(d){
  const e = HabitosState.edit; if (!e) return;
  let set = e.days ? e.days.slice() : [];
  set = set.includes(d) ? set.filter(x => x !== d) : set.concat(d);
  e.days = everyDay(cleanDays(set)) ? null : cleanDays(set);
}
// Guarda lo elegido. Devuelve true si quedó un aviso con hora (para pedir el permiso).
export function saveHabitAlarm(){
  const e = HabitosState.edit; if (!e) return false;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time || "") ? e.time : null;
  if (!state.habitAlarms || typeof state.habitAlarms !== "object") state.habitAlarms = {};
  const box = state.habitAlarms[e.kind] = Object.assign({}, alarmsOf(e.kind));
  const entry = {};
  if (time) entry.time = time;
  if (e.kind === "coach"){
    // Igual que lo del coach: no se guarda (así, si el coach lo cambia, sigue lo nuevo).
    const same = (e.days || null) === null ? !e.coachDays : (e.coachDays && e.days.join(",") === e.coachDays.join(","));
    if (!same) entry.days = e.days ? e.days : WEEK.slice().sort();
  } else if (e.days) entry.days = e.days;
  if (Object.keys(entry).length) box[e.key] = entry; else delete box[e.key];
  HabitosState.edit = null;
  save();
  return !!time;
}
export function forgetHabitAlarm(id){ const box = alarmsOf("own"); if (box[id]){ delete box[id]; state.habitAlarms.own = box; } }

export function renderPasos(){
  const g = state.stepsGoal||10000, s = state.steps||0;
  const pct = g ? Math.min(s/g,1) : 0;
  const km = (s*0.00075).toFixed(2), kc = Math.round(s*0.04);
  return `
    <div class="hb-head"><div class="hb-title">Pasos de hoy</div><div class="title-accent"></div></div>
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 120 120">
        <circle class="ring-track" cx="60" cy="60" r="52"></circle>
        <circle id="stepRing" class="ring-fill" cx="60" cy="60" r="52" style="stroke-dasharray:${RC};stroke-dashoffset:${RC*(1-pct)}"></circle>
      </svg>
      <div class="ring-center">
        <div class="ring-num" id="stepNum">${s.toLocaleString("es-AR")}</div>
        <div class="ring-lbl">de ${g.toLocaleString("es-AR")}</div>
      </div>
    </div>
    <div class="ring-sub">\u2248 ${km} km \u00b7 ${kc} kcal</div>
    <div class="step-quick">
      <button class="qbtn" data-action="steps-add" data-n="500">+500</button>
      <button class="qbtn" data-action="steps-add" data-n="1000">+1.000</button>
      <button class="qbtn" data-action="steps-add" data-n="2000">+2.000</button>
    </div>
    <div class="step-set">
      <input id="stepInput" class="form-input" type="text" inputmode="numeric" placeholder="Pon\u00e9 el total de hoy">
      <button class="form-save" style="width:auto;padding:0 20px;margin-top:0" data-action="steps-set">Fijar</button>
    </div>
    <button class="cal-edit" data-action="steps-goal">Cambiar meta diaria</button>
    <button class="ctrl ${liveCounting?'ghost':'primary'}" style="max-width:none;width:100%;margin-top:4px" data-action="steps-live">${liveCounting?'\u25a0 Detener conteo en vivo':'\u25b6 Contar en vivo (beta)'}</button>
    <p class="foot">El conteo en vivo usa el sensor de movimiento y solo cuenta con la app abierta. Para el total del d\u00eda, copi\u00e1 los pasos desde la app Salud del iPhone y us\u00e1 "Fijar".</p>`;
}

export function addHabit(){
  const i = document.getElementById("habitInput"); if(!i) return;
  const val = i.value.trim(); if(!val) return;
  state.habits.push({ id: uid(), name: val, done: false });
  save(); HabitosState.pendingFocusHabit = true; renderApp();
}
