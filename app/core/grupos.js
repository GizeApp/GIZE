// Competencia de pasos entre amigos: la semana en hora de Argentina, el código de invitación que
// llega por link (gize.ar/app/#grupo=CODIGO) y las llamadas a Supabase (supabase/pasos-grupos.sql).
// La pantalla está en app/screens/pasos.js.

import { State } from './state.js';

export const TZ_AR = "America/Argentina/Buenos_Aires";
const DAY = 864e5;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Fecha (AAAA-MM-DD) de un instante en Argentina, esté donde esté el celular.
export function fechaAR(ms){
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ_AR, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const g = t => (parts.find(p => p.type === t) || {}).value;
  return g("year") + "-" + g("month") + "-" + g("day");
}
const toUTC = s => { const p = s.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
const fromUTC = t => new Date(t).toISOString().slice(0, 10);

// Semana de la competencia: de lunes a domingo, hora de Argentina (como pasos_lunes en la base).
// atras: 0 = esta semana, 1 = la pasada…
export function semanaAR(ms = Date.now(), atras = 0){
  const t = toUTC(fechaAR(ms));
  const lunes = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY - atras * 7 * DAY;
  return { desde: fromUTC(lunes), hasta: fromUTC(lunes + 6 * DAY) };
}

// «5 al 11 de oct» / «29 de sep al 5 de oct».
export function textoSemana(desde, hasta){
  const a = String(desde || "").split("-").map(Number), b = String(hasta || "").split("-").map(Number);
  if (a.length !== 3 || b.length !== 3) return "";
  return a[1] === b[1] ? a[2] + " al " + b[2] + " de " + MESES[b[1] - 1] : a[2] + " de " + MESES[a[1] - 1] + " al " + b[2] + " de " + MESES[b[1] - 1];
}

// Pasos con punto de miles («12.345»).
export const pasosTxt = n => (Math.max(0, Math.round(Number(n) || 0))).toLocaleString("es-AR");

// ---- Código de invitación ----
// 8 letras y números sin los que se confunden (como los arma la base).
export const limpiarCodigo = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const codigoValido = c => /^[A-HJKMNP-Z2-9]{8}$/.test(limpiarCodigo(c));
export const linkInvitacion = codigo => "https://gize.ar/app/#grupo=" + limpiarCodigo(codigo);

// El link de invitación abre la app con #grupo=CODIGO. Se guarda apenas carga (antes del login:
// quien no tiene cuenta primero se registra) y se usa al entrar. Vale 7 días.
const PEND = "gize_grupo_pend";
export function guardarInvitacion(code){
  try { localStorage.setItem(PEND, JSON.stringify({ c: limpiarCodigo(code), t: Date.now() })); } catch (e) {}
}
export function leerInvitacionDeLink(){
  try {
    const m = /^#grupo=([A-Za-z0-9-]{4,20})$/.exec(location.hash || "");
    if (!m) return false;
    guardarInvitacion(m[1]);
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  } catch (e) { return false; }
}
export function tomarInvitacion(){
  try {
    const o = JSON.parse(localStorage.getItem(PEND) || "null");
    localStorage.removeItem(PEND);
    return o && o.c && Date.now() - o.t < 7 * DAY && codigoValido(o.c) ? o.c : "";
  } catch (e) { return ""; }
}
export function hayInvitacion(){ try { return !!localStorage.getItem(PEND); } catch (e) { return false; } }
leerInvitacionDeLink();

// ---- Supabase ----
// Mensaje para mostrar de un error de la base. Los de las funciones (P0001) vienen escritos para
// la persona; si la base todavía no tiene la parte de pasos (falta correr el SQL), se avisa.
export function mensajeError(e){
  if (!e) return "";
  const code = String(e.code || ""), msg = String(e.message || "");
  if (code === "PGRST202" || code === "42883" || code === "42P01" || /could not find the function/i.test(msg)) return "La competencia de pasos todavía no está disponible. Probá más tarde.";
  if (code === "P0001" && msg) return msg;
  if (/fetch|network|Failed/i.test(msg)) return "No hay conexión. Revisá tu internet y probá de nuevo.";
  return "No se pudo completar. Probá de nuevo en un rato.";
}

async function rpc(name, args){
  if (!State.sb || !State.cloudUser) throw Object.assign(new Error("Sin sesión"), { code: "nosession" });
  const r = await State.sb.rpc(name, args || {});
  if (r.error) throw r.error;
  return r.data;
}
const filas = d => Array.isArray(d) ? d : (d ? [d] : []);

export const misGrupos = async () => filas(await rpc("pasos_mis_grupos"));
export const crearGrupo = async (nombre, apodo) => filas(await rpc("pasos_crear_grupo", { p_nombre: nombre, p_apodo: apodo || null }))[0] || null;
export const unirseGrupo = (codigo, apodo) => rpc("pasos_unirse", { p_codigo: limpiarCodigo(codigo), p_apodo: apodo || null });
export const salirGrupo = id => rpc("pasos_salir", { p_grupo: id });
export const borrarGrupo = id => rpc("pasos_borrar_grupo", { p_grupo: id });
export const sacarMiembro = (id, miembro) => rpc("pasos_sacar_miembro", { p_grupo: id, p_miembro: miembro });
export const cambiarMiNombre = (id, apodo) => rpc("pasos_mi_nombre", { p_grupo: id, p_apodo: apodo });
export const rankingGrupo = async (id, atras) => filas(await rpc("pasos_ranking", { p_grupo: id, p_atras: atras || 0 }));
export const campeonGrupo = async id => filas(await rpc("pasos_campeon", { p_grupo: id }))[0] || null;
