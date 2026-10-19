// Avisos de los hábitos (Hábitos → campanita): a la hora elegida, los días elegidos, suena una
// notificación del celular aunque la app esté cerrada y sin internet (plugin
// LocalNotifications de Capacitor: el celular la repite solo cada semana o cada día, y la
// vuelve a programar si se reinicia). Tocarla abre Hábitos para tacharlo.
// Solo en las apps de Android y iPhone: la web no puede sonar con la página cerrada, ahí se
// ve la lista y nada más.
//
// Se reprograma todo cuando cambia la lista de avisos (se compara con la última que se
// programó): al entrar, al cambiar un hábito, al llegar el plan del coach o al cerrar sesión.
// En Android, además, una vez por arranque aunque no haya cambiado: «Forzar detención» (o los
// limpiadores que la fuerzan) borra las alarmas de la app y el plugin las sigue listando como
// programadas, así que no sonaban más hasta reiniciar el celular.

import { habitAlarmList } from '../screens/habitos.js';

const FIRST_ID = 5000, LAST_ID = 5999;  // rango propio (el del descanso es 4101 y el del temporizador, 4102)
const CHANNEL = "habitos_aviso";
const KEY = "gize_habit_alarms_v1";     // última lista programada en este celular

function cap(){ try { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor : null; } catch (e) { return null; } }
function LN(){ const C = cap(); return C && C.Plugins && C.Plugins.LocalNotifications; }
function android(){ try { return !!cap() && window.Capacitor.getPlatform() === "android"; } catch (e) { return false; } }
export const alarmsSupported = () => !!LN();

// Pide el permiso de notificaciones (al guardar un aviso: es un toque del usuario). Devuelve
// true si quedó permitido.
export async function askAlarmPermission(){
  const ln = LN(); if (!ln) return false;
  try {
    let p = await ln.checkPermissions();
    if (p.display === "prompt" || p.display === "prompt-with-rationale") p = await ln.requestPermissions();
    return p.display === "granted";
  } catch (e) { return false; }
}

// Una notificación por hábito y día (o una sola diaria si es todos los días). Weekday de
// Capacitor: 1 = domingo … 7 = sábado; los de la app: 0 = domingo … 6 = sábado.
function plan(list){
  const out = [];
  list.forEach(a => {
    const [hh, mm] = a.time.split(":").map(n => parseInt(n, 10));
    const base = { title: a.name, body: "Tocá para tacharlo en Hábitos.", extra: { gize: "habito" } };
    if (!a.days) out.push(Object.assign({ on: { hour: hh, minute: mm } }, base));
    else a.days.forEach(d => out.push(Object.assign({ on: { weekday: d + 1, hour: hh, minute: mm } }, base)));
  });
  // iPhone guarda como mucho 64 notificaciones programadas (otras son las del descanso y del
  // temporizador de Cardio).
  return out.slice(0, 60).map((n, i) => Object.assign({ id: FIRST_ID + i }, n));
}

let timer = null, running = false, again = false;
let rearm = android(); // falta la vuelta de este arranque (se apaga al programar bien)
export function syncHabitAlarms(){ if (!LN()) return; clearTimeout(timer); timer = setTimeout(run, 400); }

async function run(){
  if (running){ again = true; return; }
  running = true;
  try {
    const ln = LN(); if (!ln) return;
    let want = plan(habitAlarmList());
    const sig = JSON.stringify(want);
    let last = null; try { last = localStorage.getItem(KEY); } catch (e) {}
    if (sig === last && !rearm) return;
    if (want.length){
      const p = await ln.checkPermissions().catch(() => null);
      if (!p || p.display !== "granted") return; // se reintenta cuando dé el permiso (al guardar un aviso)
    }
    // Solo la vuelta del arranque: los que están a la vista en la barra no se tocan (cancelarlos o
    // programarlos borra la notificación, y su alarma sigue: el plugin la reprogramó al sonar).
    let shown = [];
    if (sig === last) try { shown = ((await ln.getDeliveredNotifications()).notifications || []).map(n => n.id); } catch (e) {}
    want = want.filter(n => !shown.includes(n.id));
    // Se borran los programados antes (los del rango propio) y se programan los de ahora.
    const pend = await ln.getPending().catch(() => ({ notifications: [] }));
    const old = (pend.notifications || []).filter(n => n.id >= FIRST_ID && n.id <= LAST_ID && !shown.includes(n.id)).map(n => ({ id: n.id }));
    if (old.length) await ln.cancel({ notifications: old }).catch(() => {});
    if (want.length){
      try { await ln.createChannel({ id: CHANNEL, name: "Avisos de hábitos", description: "Los avisos que ponés en tus hábitos (creatina, cardio…).", importance: 4, visibility: 1, vibration: true }); } catch (e) {}
      await ln.schedule({ notifications: want.map(n => ({
        id: n.id, title: n.title, body: n.body, extra: n.extra,
        schedule: { on: n.on, allowWhileIdle: true },
        channelId: CHANNEL, smallIcon: "ic_stat_gize", iconColor: "#2FA0FF",
      })) });
    }
    try { localStorage.setItem(KEY, sig); } catch (e) {}
    rearm = false;
  } catch (e) {
    console.error("avisos de hábitos", e);
  } finally {
    running = false;
    if (again){ again = false; syncHabitAlarms(); }
  }
}

// Al cerrar sesión: que no le sigan sonando los hábitos de esta cuenta.
export async function clearHabitAlarms(){
  const ln = LN(); if (!ln) return;
  try {
    const pend = await ln.getPending();
    const old = (pend.notifications || []).filter(n => n.id >= FIRST_ID && n.id <= LAST_ID).map(n => ({ id: n.id }));
    if (old.length) await ln.cancel({ notifications: old });
    localStorage.removeItem(KEY);
  } catch (e) {}
}

// Tocar el aviso abre Hábitos.
export function initHabitAlarms(open){
  const ln = LN(); if (!ln) return;
  try { ln.addListener("localNotificationActionPerformed", ev => { const x = ev && ev.notification && ev.notification.extra; if (x && x.gize === "habito") open(); }); } catch (e) {}
  syncHabitAlarms();
}

// Para las pruebas: la lista que se programaría.
export const _plan = () => plan(habitAlarmList());
