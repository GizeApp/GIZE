// Panel del gimnasio: el estado de las pantallas y las ayudas comunes (llamar a las RPC, textos de
// error, fechas, fotos). Lo usan todas las pantallas de app/screens/gym/.
import { State } from '../../core/state.js';
import { Gym, rolGym } from '../../core/gimnasio.js';
import { esc } from '../../core/utils.js';
import { appNativa } from '../../core/tienda.js';
import { comprasApple } from '../../core/compras-apple.js';

// view: la pantalla del panel (inicio, socios, ficha, profes, config, plan, asistencia, recepcion; o
// crear, aceptar, y «coach» cuando dibuja el panel de coach adentro: sus rutinas, sus planes, la ficha
// de entrenamiento de un socio). vuelta: a qué pantalla se vuelve desde «coach».
export const GS = {
  view: "inicio", vuelta: null,
  socios: null, sociosError: "", solicitudes: null, solicitudesError: "",
  equipo: null, invitaciones: null, equipoError: "",
  tab: "socios",                       // Socios · Solicitudes · Bajas
  filtros: { q: "", profe: "", estado: "", sinProfe: false, externo: false, noViene: false, faltaConf: false, sinApp: false, fotoPend: false, mios: false },
  sel: new Set(),                      // fichas elegidas para las acciones en grupo
  ficha: null,                         // { id, fila, datos, nota, ingresos, cargando, error, form, cal }
  equipoTab: "profe", equipoSel: null, // Profes · Administración · Recepción; la persona abierta
  modal: null,                         // ventana abierta: { tipo, ... }
  solForm: {},                         // por solicitud: { profe, foto } elegidos
  busy: "",
  versiones: null,
  aceptar: null,                       // #equipo=: { token, info, cargando, error }
  crear: { nombre: "", ciudad: "", provincia: "", acepto: false, busy: false },
};

// Quien llama a la RPC ve el texto propio del servidor (P0001) tal cual; sin permiso, uno neutro.
export function errTexto(e){
  if (e && e.code === "P0001" && e.message) return e.message;
  if (e && e.code === "42501") return "No tenés permiso para hacer esto en el gimnasio.";
  return "No se pudo: revisá tu conexión y probá de nuevo.";
}
export async function rpc(f, args){
  if (!State.sb) return { error: { code: "red" }, msg: errTexto(null) };
  try {
    const r = await State.sb.rpc(f, args || {});
    return r.error ? { error: r.error, msg: errTexto(r.error) } : { data: r.data };
  } catch (e) { return { error: e, msg: errTexto(e) }; }
}

export const info = () => Gym.info || {};
export const gym = () => info().gym || {};
export const esDueno = () => rolGym() === "owner";
export const esAdmin = () => rolGym() === "admin";
export const yo = () => (State.cloudUser && State.cloudUser.id) || "";
export const soyCoach = () => !!(State.cloudProfile && State.cloudProfile.role === "coach");
// En las apps de las tiendas (iPhone y Android): nada de precios, planes, prueba ni pagos de GIZE.
export const enApp = () => appNativa() || comprasApple();

// ---- Fechas (en hora de Argentina, como el servidor: gym_hoy) ----
const AR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
const AR_HORA = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
export const hoyAR = () => AR.format(new Date());
export const diaAR = iso => iso ? AR.format(new Date(iso)) : "";
export const horaAR = iso => iso ? AR_HORA.format(new Date(iso)) : "";
export function fecha(iso){
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : diaAR(iso);
  const [y, m, dd] = d.split("-");
  return dd + "/" + m + (y !== hoyAR().slice(0, 4) ? "/" + y.slice(2) : "");
}
export function diasDesde(iso){
  if (!iso) return null;
  const a = new Date(hoyAR() + "T00:00:00Z"), b = new Date((/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : diaAR(iso)) + "T00:00:00Z");
  return Math.round((a - b) / 864e5);
}
// «Hoy 18:42», «Ayer», «Hace 9 días»
export function cuando(iso){
  const n = diasDesde(iso);
  if (n === null) return "—";
  if (n <= 0) return "Hoy " + horaAR(iso);
  if (n === 1) return "Ayer";
  if (n < 60) return "Hace " + n + " días";
  return fecha(iso);
}

export const iniciales = n => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() : "?"; };
export const primerNombre = n => String(n || "").trim().split(/\s+/)[0] || "";
export const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);

// ---- Fotos del gimnasio (bucket privado gym-fotos: links firmados por una hora) ----
const fotos = new Map();
export const fotoUrl = p => { const c = p && fotos.get(p); return c && c.exp > Date.now() ? c.url : ""; };
export async function pedirFotos(paths){
  const need = [...new Set((paths || []).filter(p => p && !fotoUrl(p)))];
  if (!need.length || !State.sb) return false;
  try {
    const r = await State.sb.storage.from("gym-fotos").createSignedUrls(need, 3600);
    if (r.error || !Array.isArray(r.data)) return false;
    let any = false;
    r.data.forEach((d, i) => { const p = (d && d.path) || need[i]; if (d && d.signedUrl) { fotos.set(p, { url: d.signedUrl, exp: Date.now() + 3000e3 }); any = true; } });
    return any;
  } catch (e) { return false; }
}
// El círculo del socio: la foto del gimnasio (o iniciales).
export function fotoHtml(path, nombre, cls){
  const u = fotoUrl(path);
  return u ? '<span class="gy-av ' + (cls || "") + ' has-photo"><img src="' + esc(u) + '" alt="" loading="lazy" decoding="async"></span>'
    : '<span class="gy-av ' + (cls || "") + '" aria-hidden="true">' + esc(iniciales(nombre)) + '</span>';
}

// Copiar al portapapeles (con el textarea de respaldo de siempre). true si copió.
export async function copiar(txt){
  try { await navigator.clipboard.writeText(txt); return true; }
  catch (e) {
    try {
      const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}
export const waLink = (txt, tel) => "https://wa.me/" + (tel ? String(tel).replace(/\D/g, "") : "") + "?text=" + encodeURIComponent(txt);
// El link de la app (la dirección pública, también desde las apps).
export const APP_URL = "https://gize.ar/app/";
