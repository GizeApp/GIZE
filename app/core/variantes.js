// Variantes de un ejercicio (pedido: «en cada ejercicio poder ver variantes que trabajen el
// mismo músculo en caso de que la máquina o el espacio no esté disponible»).
//
// - Se arman solas: el mismo músculo (exMuscle, el mismo que usa el volumen semanal) con OTRO
//   equipo (barra, mancuernas, máquina, polea, Smith, peso corporal…), primero las de movimiento
//   parecido (subgrupos.js y patternOf) y las comunes antes que las raras.
// - Elegir una vale SOLO POR HOY: la rutina (state.days, la del coach) no se toca. El cambio
//   vive en state.exVariant = { date, map: { idEjercicio: { name, from, mus, kg0 } } } y la
//   pantalla de Entreno dibuja el ejercicio con el nombre de la variante (todayEx). Se borra al
//   guardar el entreno, y deja de valer al día siguiente (salvo un entreno en curso que pasa la
//   medianoche, como el reloj del entreno).
// - El entreno guardado lleva el ejercicio que se hizo de verdad (la variante) y originalName.
//   En la nube las series se guardan solo con el nombre (session_entries), así que lo que se
//   cambió viaja en el registro del día (daily_logs.habits_done.subs, ya es JSON): de ahí lo
//   leen el coach y el mismo cliente al bajar su historial (markSubs).
import { EX_CATS, EX_DB } from './data.js';
import { state } from './state.js';
import { volumeGroups } from './subgrupos.js';
import { exMuscle, isTimedEx, today } from './utils.js';

const low = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export const EQ_LABELS = { barra: "Barra", mancuernas: "Mancuernas", maquina: "Máquina", polea: "Polea", smith: "Smith",
  corporal: "Peso corporal", banda: "Banda", kettlebell: "Kettlebell", disco: "Disco", otro: "Otro" };

// Equipo de un ejercicio, deducido del nombre (la base de ejercicios no lo tiene).
export function equipOf(name){
  const n = low(name);
  if (/smith/.test(n)) return "smith";
  if (/maquina|peck deck/.test(n)) return "maquina";
  if (/polea|cable|cruce|jalon|soga|katana|pallof|lenador|a la cara|face ?pull|bayesian/.test(n)) return "polea";
  if (/\bbanda|elastic/.test(n)) return "banda";
  if (/kettlebell|pesa rusa/.test(n)) return "kettlebell";
  if (/mancuerna|goblet|arnold|patada de triceps|curl (martillo|alternado|concentrado|arana|zottman)|curl en banco inclinado|vuelos laterales sentado|elevaciones (laterales|frontales)|vuelos posteriores|elevacion y|aperturas|extension sobre la cabeza|zancada|bulgara|step-up|caminata del granjero|sentadilla sumo|sentadilla con mancuerna/.test(n)) return "mancuernas";
  if (/flexion(es)? (de brazos|diamante)|dominadas|fondos|plancha|remo invertido|sissy|nordico|colgad|a la barra|de la barra|puente|hiperextension|escaladores|bicicleta|bicho muerto|bandera|abdominales en v|encogimiento (abdominal|declinado|invertido)|crunch|elevacion de (piernas|rodillas)|cuadrupedia|subida al cajon|rueda abdominal|oblicuos|giro ruso|rotaciones de cuello|flexion lateral de cuello|fitball|tibial|a una pierna|empuje de cadera a una/.test(n)) return "corporal";
  if (/disco|arnes/.test(n)) return "disco";
  if (/barra|press de banca|militar|peso muerto|sentadilla (libre|frontal)|pendlay|remo t\b|meadows|buenos dias|rack pull|press (cerrado|jm|landmine)|empuje de cadera|curl 21|curl predicador|remo al menton|encogimientos de hombros|curl de muneca|enrollador/.test(n)) return "barra";
  if (/prensa|hack|pendular|cuadricera|camilla|extension de (cuadriceps|triceps)|curl femoral|abductores|aductores|gemelos|cinturon|posterior/.test(n)) return "maquina";
  return "otro";
}

// Patrón de movimiento dentro del músculo: entre dos con otro equipo, primero el que se mueve igual.
export function patternOf(name, mus){
  const n = low(name);
  switch (mus){
    case "pecho": return /apertura|cruce|vuelos|peck|fly/.test(n) ? "fly" : /fondos/.test(n) ? "dip" : "press";
    case "espalda": return /dominad|jalon|pull ?down/.test(n) ? "vertical" : /pullover/.test(n) ? "pullover" : /hiperext|lumbar|rack pull/.test(n) ? "lumbar" : "remo";
    case "hombros": return /posterior|a la cara|rotacion externa/.test(n) ? "post" : /lateral|elevacion y|al menton/.test(n) ? "lateral" : /frontal/.test(n) ? "frontal" : /encogimiento/.test(n) ? "shrug" : "press";
    case "biceps": return /martillo|zottman/.test(n) ? "hammer" : "curl";
    case "triceps": return /fondos|press cerrado|press jm/.test(n) ? "press" : /frances|sobre la cabeza|katana/.test(n) ? "overhead" : "ext";
    case "cuadriceps": return /extension|sissy/.test(n) ? "ext" : /zancad|bulgara|subida|step/.test(n) ? "lunge" : "squat";
    case "isquios": return /curl|camilla|nordico/.test(n) ? "curl" : "hinge";
    case "gluteos": return /empuje|puente/.test(n) ? "thrust" : /patada/.test(n) ? "kick" : /abduc|caminata lateral/.test(n) ? "abd" : /step|subida/.test(n) ? "lunge" : "hinge";
    case "abs": return /plancha|pallof|rueda|bicho|escaladores/.test(n) ? "anti" : /elevacion|puntas|rodillas|invertido|en v\b/.test(n) ? "legs" : /giro|oblicuo|lenador|lateral|bandera/.test(n) ? "rot" : "crunch";
    case "gemelos": return /tibial/.test(n) ? "tibial" : /sentado/.test(n) ? "sentado" : "pie";
    default: return "x";
  }
}

// Nombres propios o variantes poco comunes: van al final.
const ODD_RE = /arnold|bayesian|meadows|\bjm\b|katana|curl 21|pendlay|estocada|\(enfasis|bandera|sissy|nordico|pendular|cuadricera|landmine|zottman|arana|burro|cinturon|fitball|rack pull/;
const UNI_RE = /unilateral|a una pierna|alternado/;

// Variantes de un ejercicio: { mus, label, list: [{ name, eq }] } (sin el ejercicio original).
export function variantsFor(ex, max){
  max = max || 7;
  const name = ex && ex.name, mus = exMuscle(ex);
  const pool = EX_DB[mus];
  if (!name || !pool) return { mus, label: "", list: [] };
  const label = (EX_CATS.find(c => c[0] === mus) || [mus, mus])[1];
  const key = low(name), eq = equipOf(name), pat = patternOf(name, mus);
  const sub = volumeGroups({ name, mus }).join(","), timed = isTimedEx(ex);
  const cands = [];
  pool.forEach((c, i) => {
    if (low(c) === key) return;
    // Uno por tiempo (plancha) no reemplaza a uno por repeticiones, ni al revés: las series del coach no encajarían.
    if (isTimedEx({ name: c }) !== timed) return;
    const ceq = equipOf(c);
    let score = (patternOf(c, mus) === pat ? 20 : 0) + (volumeGroups({ name: c, mus }).join(",") === sub ? 10 : 0);
    if (ODD_RE.test(low(c))) score -= 15;
    if (UNI_RE.test(low(c))) score -= 4;
    if (/asistid/.test(low(c)) && !/asistid/.test(key)) score -= 6;
    cands.push({ name: c, eq: ceq, score: score - i * 0.01, other: ceq !== eq });
  });
  cands.sort((a, b) => b.score - a.score);
  // Orden: otro equipo que se mueve igual (uno de cada equipo, así hay de todo), otro equipo
  // del mismo subgrupo (pecho, espalda y hombros: press ↔ aperturas del mismo sector), y el resto
  // de los que se mueven igual. Con muy pocas, se suman las del mismo equipo que se mueven igual.
  const split = mus === "pecho" || mus === "espalda" || mus === "hombros";
  const samePat = c => patternOf(c.name, mus) === pat;
  const sameSub = c => split && volumeGroups({ name: c.name, mus }).join(",") === sub;
  const out = [];
  const take = (test, unique, lim) => { const seen = new Set(out.map(c => c.eq)); cands.forEach(c => {
    if (out.length >= (lim || max) || out.includes(c) || !test(c) || (unique && seen.has(c.eq))) return;
    seen.add(c.eq); out.push(c);
  }); };
  take(c => c.other && samePat(c), true);
  take(c => c.other && sameSub(c), true);
  take(c => c.other && samePat(c));
  take(c => c.other && sameSub(c));
  take(c => !c.other && samePat(c), false, 4);
  return { mus, label, list: out.map(c => ({ name: c.name, eq: c.eq })) };
}

// ---- Variante elegida para hoy ----
const SIX_H = 6 * 3600 * 1000;
function store(){
  const v = state.exVariant;
  if (!v || typeof v !== "object" || !v.map || typeof v.map !== "object") return null;
  if (v.date === today()) return v;
  // Un entreno en curso que empezó ese día y pasa la medianoche la sigue usando.
  const w = state.wkStart;
  return (w && w.ts && Date.now() - w.ts < SIX_H && w.date === v.date) ? v : null;
}
// Lo elegido para este ejercicio de la rutina (o null). Si el coach cambió el ejercicio, ya no vale.
export function variantOf(ex){
  const v = store(), o = v && ex && v.map[ex.id];
  return o && o.from === ex.name && o.name ? o : null;
}
// El ejercicio como se hace hoy: el mismo objeto de la rutina (series, notas, audio, RIR…), con
// el nombre de la variante. Lo que se escribe (series, kg) va al ejercicio de la rutina.
export function todayEx(ex){
  const o = variantOf(ex); if (!o) return ex;
  return new Proxy(ex, { get(t, k){
    if (k === "name") return o.name;
    if (k === "mus") return o.mus || t.mus;
    if (k === "video" || k === "videoFor") return undefined; // el video del coach era del original
    if (k === "origName") return t.name;
    return t[k];
  } });
}
export function todayExs(d){ return ((d && d.exercises) || []).map(todayEx); }

export function setVariant(ex, name, extra){
  let v = store();
  if (!v){ v = { date: today(), map: {} }; state.exVariant = v; }
  const prev = v.map[ex.id] && v.map[ex.id].from === ex.name ? v.map[ex.id] : null;
  v.map[ex.id] = Object.assign({ name, from: ex.name, mus: exMuscle(ex) }, prev && prev.kg0 ? { kg0: prev.kg0 } : {}, extra || {});
  return v.map[ex.id];
}
export function clearVariant(id){
  const v = state.exVariant; if (!v || !v.map || !v.map[id]) return null;
  const o = v.map[id]; delete v.map[id];
  if (!Object.keys(v.map).length) delete state.exVariant;
  return o;
}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Al guardar el entreno: se sacan las de ese día (se devuelven para «Seguir entrenando») y vuelve
// el peso que tenía el ejercicio de la rutina (kg0), también en las series tildadas: el entreno ya
// quedó guardado. Si no, la vez siguiente el original arrancaba con los kg de la variante.
export function takeVariants(d){
  const out = {};
  (d && d.exercises || []).forEach(ex => {
    if (!variantOf(ex)) return;
    const o = out[ex.id] = clearVariant(ex.id);
    if (o.kg0){ o.kgNow = {}; (ex.sets || []).forEach(s => { if (has(o.kg0, s.id)){ o.kgNow[s.id] = s.kg; s.kg = o.kg0[s.id]; } }); }
  });
  dropExpiredVariants();
  return out;
}
// Variante vencida (otro día, sin guardar el entreno): vuelve el peso del ejercicio de la rutina
// en las series sin tildar, como «Volver al original». Devuelve true si había una.
export function dropExpiredVariants(){
  const v = state.exVariant;
  if (!v || store()) return false;
  const map = v.map && typeof v.map === "object" ? v.map : {};
  (state.days || []).forEach(d => (d.exercises || []).forEach(ex => { const o = map[ex.id];
    if (o && o.from === ex.name && o.kg0) (ex.sets || []).forEach(s => { if (!s.done && has(o.kg0, s.id)) s.kg = o.kg0[s.id]; }); }));
  delete state.exVariant;
  return true;
}
export function restoreVariants(map){
  if (!map || !Object.keys(map).length) return;
  // Vuelven los kg que tenía la variante (ver takeVariants).
  (state.days || []).forEach(d => (d.exercises || []).forEach(ex => { const o = map[ex.id];
    if (o && o.kgNow){ (ex.sets || []).forEach(s => { if (has(o.kgNow, s.id)) s.kg = o.kgNow[s.id]; }); delete o.kgNow; } }));
  let v = store(); if (!v){ v = { date: today(), map: {} }; state.exVariant = v; }
  Object.assign(v.map, map);
}

// ---- Lo que se cambió, para el coach y el historial ----
// state.exSubs = { dt, list: [{ day, n, o }] } (n: lo que hizo, o: lo de la rutina). Sube con el
// registro del día (daySnapshot en core/supabase.js).
const clip = s => String(s || "").slice(0, 120);
export function noteSubs(dayName, exercises){
  const subs = (exercises || []).filter(e => e.originalName).map(e => ({ day: clip(dayName), n: clip(e.name), o: clip(e.originalName) }));
  if (!subs.length) return;
  const t = today();
  if (!state.exSubs || state.exSubs.dt !== t) state.exSubs = { dt: t, list: [] };
  subs.forEach(s => { if (!state.exSubs.list.some(x => x.day === s.day && x.n === s.n && x.o === s.o)) state.exSubs.list.push(s); });
}
export function todaySubs(){ const s = state.exSubs; return s && s.dt === today() && Array.isArray(s.list) && s.list.length ? s.list : null; }
// Lo que vino de la nube en el registro de hoy (otro celular): se suma, no se pisa.
export function mergeTodaySubs(list){
  if (!Array.isArray(list) || !list.length) return;
  const t = today();
  if (!state.exSubs || state.exSubs.dt !== t) state.exSubs = { dt: t, list: [] };
  list.forEach(s => { if (s && s.n && s.o && !state.exSubs.list.some(x => x.day === s.day && x.n === s.n && x.o === s.o)) state.exSubs.list.push({ day: clip(s.day), n: clip(s.n), o: clip(s.o) }); });
}
// Entrenos que vienen de la nube (solo con nombres): se les marca originalName con lo que dice
// el registro del día. rows: filas de daily_logs ({ log_date, habits_done: { subs } }).
export function markSubs(sessions, rows){
  const byDate = {};
  (rows || []).forEach(r => { const s = r && r.habits_done && r.habits_done.subs; if (Array.isArray(s) && s.length) byDate[r.log_date] = (byDate[r.log_date] || []).concat(s); });
  (sessions || []).forEach(se => {
    const subs = byDate[se.date]; if (!subs) return;
    (se.exercises || []).forEach(ex => {
      if (ex.originalName) return;
      const m = subs.find(s => s && s.n === ex.name && (!s.day || s.day === se.day));
      if (m && m.o && m.o !== ex.name) ex.originalName = String(m.o);
    });
  });
  return sessions;
}
