// Gimnasios (etapa 1): con qué gimnasio y con qué rol entra la cuenta, y los links del gimnasio.
//
// Al entrar, afterLogin (core/supabase.js) pregunta mi_gimnasio() (supabase/gimnasios-socios.sql) en
// paralelo con la lectura del perfil. Para quien NO está en un gimnasio no cambia nada: si la función
// devuelve null, falla (sin señal, todavía no está en la base) o tarda más de 4 s, la cuenta sigue
// exactamente como hoy (mismas pantallas y mismas consultas; la única de más es mi_gimnasio). La
// respuesta queda guardada en el dispositivo por cuenta, así el dueño entra a su panel aunque abra sin
// señal; se borra al salir (accountKeys en core/supabase.js).
//
// Quién abre qué (SPEC §2.1): dueño y administración → panel del gimnasio (app/screens/gym/, se carga
// con import() solo para ellos); recepción → la recepción (la llena la parte 4; mientras, un cartel);
// profe, socio, pedido pendiente y sin gimnasio → como hoy (lo del profe y lo del socio llegan en las
// partes 3 y 4).
//
// Links: gize.ar/gimnasio → /app/#gimnasio (crear un gimnasio, solo en la web y con el interruptor
// del servidor prendido; o abrir el panel si ya es del equipo) y gize.ar/app/#equipo=<token>
// (aceptar una invitación al equipo). Se leen acá, al cargar el módulo, se guardan en esta pestaña
// (sessionStorage: sobreviven al registro y al link del mail de confirmación si vuelve a la misma
// pestaña) y se sacan de la dirección.
import { State } from './state.js';
import { appIOS, appNativa } from './tienda.js';

export const GYM_CACHE = "gize_gym_v1";
const CREAR_KEY = "gize_gym_crear", EQUIPO_KEY = "gize_gym_equipo";
const TOPE_MS = 4000;
// info: lo último que dijo mi_gimnasio() para esta cuenta (o la copia guardada). leido: ya contestó
// (o se cortó) en esta sesión. ui: el panel del gimnasio, cuando se cargó (app/screens/gym/index.js).
export const Gym = { info: null, uid: null, leido: false, ui: null, cargando: null };

// ---- Links ----
(function leerLink(){
  try {
    const h = location.hash || "";
    let m;
    if (h === "#gimnasio") sessionStorage.setItem(CREAR_KEY, "1");
    else if ((m = /^#equipo=([0-9a-f]{64})(?:&rol=(admin|profe|recepcion))?$/i.exec(h))) sessionStorage.setItem(EQUIPO_KEY, JSON.stringify({ t: m[1].toLowerCase(), rol: m[2] || null }));
    else return;
    history.replaceState(history.state, "", location.pathname + location.search);
  } catch (e) {}
})();
export function linkCrear(){ try { return sessionStorage.getItem(CREAR_KEY) === "1"; } catch (e) { return false; } }
export function linkEquipo(){ try { return JSON.parse(sessionStorage.getItem(EQUIPO_KEY) || "null"); } catch (e) { return null; } }
export function olvidarLinks(cual){
  try { if (!cual || cual === "crear") sessionStorage.removeItem(CREAR_KEY); if (!cual || cual === "equipo") sessionStorage.removeItem(EQUIPO_KEY); } catch (e) {}
}
// Sin sesión, con un link del gimnasio: la pantalla de ingreso explica para qué es (cloudBoot). En las
// apps no se ofrece crear una cuenta de coach (core/tienda.js): se ingresa con la que ya tiene.
export function ingresoParaLink(){
  const eq = linkEquipo();
  if (eq){
    const coach = eq.rol !== "recepcion";
    if (appNativa()) return { msg: "Te invitaron al equipo de un gimnasio. Ingresá con tu cuenta para aceptar." + (coach ? " Si todavía no tenés cuenta de coach, creala desde gize.ar en la compu." : ""), modo: "in", vals: {} };
    return { msg: "Te invitaron al equipo de un gimnasio. Creá tu cuenta o ingresá para aceptar.", modo: "up", vals: coach && !appIOS() ? { role: "coach" } : {} };
  }
  if (linkCrear()) return { msg: appNativa() ? "El gimnasio se crea desde gize.ar en la compu." : "Para crear tu gimnasio, ingresá con tu cuenta de coach.", modo: "in", vals: {} };
  return null;
}

// ---- mi_gimnasio() ----
function guardada(uid){
  try { const c = JSON.parse(localStorage.getItem(GYM_CACHE) || "null"); return c && c.uid === uid ? c : null; } catch (e) { return null; }
}
function guardar(uid, info){
  try { localStorage.setItem(GYM_CACHE, JSON.stringify({ uid, info: info || null, t: Date.now() })); } catch (e) {}
}
export const rolGym = () => (Gym.info && Gym.info.rol) || null;
// Dueño, administración o recepción: el panel del gimnasio reemplaza al de coach (o a la app del socio).
export const esPanelGym = () => ["owner", "admin", "recepcion"].includes(rolGym());
// ¿Hay algo del gimnasio que mostrar? (el panel, o una pantalla de los links: crear, aceptar)
export const quiereGym = () => esPanelGym() || linkCrear() || !!linkEquipo();

// Arranca la consulta. Devuelve { primera, lista }: primera = no había copia guardada de esta cuenta
// (primer ingreso en este dispositivo: vale la pena esperar la respuesta un poco); lista = la promesa
// de la respuesta (null si falló o tardó más de 4 s: en ese caso queda lo guardado).
// sinRed: la sesión no está confirmada (se entra sin señal): solo la copia guardada.
export function consultarGym(sinRed){
  const uid = State.cloudUser && State.cloudUser.id;
  Gym.uid = uid || null; Gym.leido = false;
  const c = uid ? guardada(uid) : null;
  Gym.info = c ? c.info : null;
  if (!uid || !State.sb || sinRed) { Gym.leido = true; return { primera: false, lista: Promise.resolve(null) }; }
  let t;
  const tope = new Promise(ok => { t = setTimeout(() => ok({ tarde: true }), TOPE_MS); });
  const pedido = Promise.resolve(State.sb.rpc("mi_gimnasio")).then(r => r, e => ({ error: e }));
  const lista = Promise.race([pedido.finally(() => clearTimeout(t)), tope]).then(r => {
    if (r && !r.tarde && !r.error && State.cloudUser && State.cloudUser.id === uid){ aplicar(uid, r.data); return r.data || null; }
    // Tarde: si llega después, se aplica igual (y se redibuja si cambió algo).
    if (r && r.tarde) pedido.then(x => { if (x && !x.error && State.cloudUser && State.cloudUser.id === uid && aplicar(uid, x.data)) redibujar(); });
    Gym.leido = true;
    return null;
  });
  return { primera: !c, lista };
}
// Guarda la respuesta. Devuelve true si cambió el rol o el gimnasio (hay que redibujar).
function aplicar(uid, data){
  const antes = JSON.stringify([rolGym(), Gym.info && Gym.info.gym && Gym.info.gym.id]);
  Gym.info = data && typeof data === "object" ? data : null;
  Gym.leido = true;
  guardar(uid, Gym.info);
  return antes !== JSON.stringify([rolGym(), Gym.info && Gym.info.gym && Gym.info.gym.id]);
}
// Vuelve a preguntar (después de crear el gimnasio, aceptar una invitación, o para los contadores).
export async function releerGym(){
  if (!State.sb || !State.cloudUser) return Gym.info;
  const uid = State.cloudUser.id;
  try { const r = await State.sb.rpc("mi_gimnasio"); if (!r.error && State.cloudUser && State.cloudUser.id === uid) aplicar(uid, r.data); } catch (e) {}
  return Gym.info;
}

// El módulo del panel (carga diferida). Devuelve true si quedó listo.
export function cargarPanelGym(){
  if (Gym.ui) return Promise.resolve(true);
  if (!Gym.cargando) Gym.cargando = import("../screens/gym/index.js").then(m => { m.iniciarGym(); return !!Gym.ui; }, e => { console.error("gimnasio", e); Gym.cargando = null; return false; });
  return Gym.cargando;
}

// Redibuja lo que corresponda cuando cambia el rol (la respuesta llegó tarde): el panel del gimnasio
// si hace falta cargarlo, o la app de siempre.
let _redibujar = null;
export function alRedibujar(f){ _redibujar = f; }
export async function redibujar(){
  if (quiereGym()) await cargarPanelGym();
  if (_redibujar) _redibujar();
}
// Lo que dibuja el panel del gimnasio en lugar del de coach o de la app (renderCoach / renderApp).
// false: no es del gimnasio, sigue como hoy. Si el panel tiene abierto algo del panel de coach (sus
// rutinas, la ficha de un socio), lo dibuja renderCoach: desde renderCoach se sigue (false); desde
// renderApp (app: una cuenta común de la administración) se llama a renderCoach y listo (true).
export function pintarGym(app){
  if (!(Gym.ui && quiereGym())) return false;
  const r = Gym.ui.pintar();
  if (r === "coach"){ if (app) Gym.ui.coach(); return !!app; }
  return !!r;
}
