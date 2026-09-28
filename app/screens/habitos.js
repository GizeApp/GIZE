import { RC } from '../core/data.js';

import { checkSvg, xSvg } from '../core/icons.js';

import { state } from '../core/state.js';

import { save } from '../core/storage.js';

import { esc, hkey, today, uid } from '../core/utils.js';

import { renderApp } from '../main.js';

import { liveCounting } from './entreno.js';

import { logDayKcal } from './comida.js';

export const HabitosState = {

  pendingFocusHabit: false,

  pendingFocusDay: false,

};

export function checkDaily(){ const t=today(); let ch=false;
  if (state.habitsDate !== t) { state.habits.forEach(h=>h.done=false); state.habitsDate=t; ch=true; }
  if (state.diaryDate !== t) { logDayKcal(state.diaryDate, state.diary); state.diary=[]; state.diaryDate=t; ch=true; }
  if (state.stepsDate !== t) { state.steps=0; state.stepsDate=t; ch=true; }
  if (state.waterDate !== t) { state.water=0; state.waterDate=t; ch=true; }
  if (ch) save();
}

export function renderHabitos(){
  const coachHabits = (state.coachPlan && Array.isArray(state.coachPlan.habits)) ? state.coachPlan.habits.filter(x=>x&&x.trim()) : [];
  const chDone = coachHabits.filter(name => state.habitsDone && state.habitsDone[hkey(name)]).length;
  const total = state.habits.length + coachHabits.length;
  const done = state.habits.filter(h=>h.done).length + chDone;
  const pct = total ? Math.round(done/total*100) : 0;
  const coachItems = coachHabits.map(name => {
    const on = !!(state.habitsDone && state.habitsDone[hkey(name)]);
    return `<div class="hb-item coach" data-action="chabit-toggle" data-name="${esc(name)}">
      <span class="hb-check${on?' on':''}">${on?checkSvg:''}</span>
      <span class="hb-name${on?' done':''}">${esc(name)}</span>
      <span class="hb-coach-tag">coach</span>
    </div>`;
  }).join("");
  const items = coachItems + state.habits.map(h => `
    <div class="hb-item" data-action="habit-toggle" data-id="${esc(h.id)}">
      <span class="hb-check${h.done?' on':''}">${h.done?checkSvg:''}</span>
      <span class="hb-name${h.done?' done':''}">${esc(h.name)}</span>
      <button class="hb-rm" data-action="habit-remove" data-id="${esc(h.id)}" title="Eliminar">${xSvg}</button>
    </div>`).join("");
  return `
    <div class="hb-head">
      <div class="hb-title">Daily Checklist</div>
      <div class="title-accent"></div>
      <div class="progress-row">
        <div class="bar"><div style="width:${pct}%"></div></div>
        <span class="count">${done}/${total}</span>
      </div>
    </div>
    <div class="hb-list">${items || '<div class="empty">No tenés tareas todavía.<br>Agregá la primera acá abajo 👇</div>'}</div>
    <div class="hb-add">
      <input id="habitInput" type="text" placeholder="Nueva tarea diaria…" data-action="habit-name-input">
      <button class="hb-add-btn" data-action="habit-add">+</button>
    </div>
    <p class="foot">Se reinician solas cada día</p>`;
}

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
