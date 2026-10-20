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
// del servidor prendido; o abrir el panel si ya es del equipo), gize.ar/app/#equipo=<token>
// (aceptar una invitación al equipo), y los del socio (parte 3): #codigo=<código del gimnasio> (el QR
// del mostrador: abre la hoja para pedir sumarse) y #unirme=<token> (la ficha que cargó el gimnasio).
// Se leen acá, al cargar el módulo, se guardan en esta pestaña (sessionStorage: sobreviven al
// registro y al link del mail de confirmación si vuelve a la misma pestaña) y se sacan de la
// dirección.
//
// El socio (parte 3): la tarjeta «Tu gimnasio» de Entreno (screens/entreno.js) y Ajustes → Tu
// gimnasio (screens/config.js) se dibujan con lo que dice mi_gimnasio(); lo que hacen sus botones
// (data-gys) y los flujos de pedir sumarse están en app/screens/gym/socio.js, que se carga con
// import() solo cuando hace falta (para quien no está en un gimnasio, ni se pide).
import { State } from './state.js';
import { appIOS, appNativa } from './tienda.js';

export const GYM_CACHE = "gize_gym_v1";
const CREAR_KEY = "gize_gym_crear", EQUIPO_KEY = "gize_gym_equipo", CODIGO_KEY = "gize_gym_codigo", UNIRME_KEY = "gize_gym_unirme";
const TOPE_MS = 4000;
// info: lo último que dijo mi_gimnasio() para esta cuenta (o la copia guardada). leido: ya contestó
// (o se cortó) en esta sesión. ui: el panel del gimnasio, cuando se cargó (app/screens/gym/index.js).
// espera: afterLogin todavía espera la respuesta para dibujar (primer ingreso en este dispositivo); si
// llega después, aunque sea antes del tope de 4 s, se redibuja (gymSinEspera).
export const Gym = { info: null, uid: null, leido: false, ui: null, cargando: null, espera: false };

// ---- Links ----
// soloSocio: con la app ya abierta (cambió el hash), solo los del socio.
function leerLink(soloSocio){
  try {
    const h = location.hash || "";
    let m;
    if (!soloSocio && h === "#gimnasio") sessionStorage.setItem(CREAR_KEY, "1");
    else if (!soloSocio && (m = /^#equipo=([0-9a-f]{64})(?:&rol=(admin|profe|recepcion))?$/i.exec(h))) sessionStorage.setItem(EQUIPO_KEY, JSON.stringify({ t: m[1].toLowerCase(), rol: m[2] || null }));
    // El link del código del gimnasio (Socios → Sumar socio, el QR del mostrador): abre la hoja para
    // pedir sumarse (linksSocio).
    else if ((m = /^#codigo=([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8})$/i.exec(h))) sessionStorage.setItem(CODIGO_KEY, m[1].toUpperCase());
    // El link de una ficha cargada por el gimnasio (gym_ficha_crear / gym_ficha_link).
    else if ((m = /^#unirme=([0-9a-f]{64})$/i.exec(h))) sessionStorage.setItem(UNIRME_KEY, m[1].toLowerCase());
    else return false;
    history.replaceState(history.state, "", location.pathname + location.search);
    return true;
  } catch (e) { return false; }
}
leerLink();
export function linkCrear(){ try { return sessionStorage.getItem(CREAR_KEY) === "1"; } catch (e) { return false; } }
export function linkEquipo(){ try { return JSON.parse(sessionStorage.getItem(EQUIPO_KEY) || "null"); } catch (e) { return null; } }
export function linkCodigo(){ try { return sessionStorage.getItem(CODIGO_KEY) || ""; } catch (e) { return ""; } }
export function linkUnirme(){ try { return sessionStorage.getItem(UNIRME_KEY) || ""; } catch (e) { return ""; } }
export function olvidarLinks(cual){
  try {
    if (!cual || cual === "crear") sessionStorage.removeItem(CREAR_KEY);
    if (!cual || cual === "equipo") sessionStorage.removeItem(EQUIPO_KEY);
    if (!cual || cual === "codigo") sessionStorage.removeItem(CODIGO_KEY);
    if (!cual || cual === "unirme") sessionStorage.removeItem(UNIRME_KEY);
  } catch (e) {}
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
  if (linkUnirme()) return { msg: "Tu gimnasio te sumó a GIZE. Creá tu cuenta o ingresá con la tuya para terminar.", modo: "up", vals: {} };
  if (linkCodigo()) return { msg: "Para sumarte al gimnasio, creá tu cuenta o ingresá. Tu código es " + linkCodigo() + ".", modo: "up", vals: {} };
  return null;
}
// Entró (o ya estaba adentro) con un link del socio: #unirme= abre el link de su ficha y #codigo=, la
// hoja para pedir sumarse (app/screens/gym/socio.js). Una vez por link. Un coach o alguien del equipo
// no se suma como socio: el link de la ficha le avisa con qué cuenta abrirlo; el del código, nada.
export function linksSocio(){
  const tok = linkUnirme(), c = linkCodigo();
  if (!tok && !c) return;
  olvidarLinks("unirme"); olvidarLinks("codigo");
  const p = State.cloudProfile;
  if (!p || !State.cloudUser) return;
  if (p.role === "coach" || esPanelGym() || rolGym() === "profe"){
    if (tok) setTimeout(() => alert("Ese link es para sumarte como socio del gimnasio: abrilo con la cuenta de quien se suma."), 700);
    return;
  }
  setTimeout(() => cargarSocio().then(m => m && (tok ? m.abrirUnirme(tok) : m.abrirCodigo(c))), 300);
}
// Con la app abierta, alguien toca un link del socio (cambia el hash): se atiende ahí mismo.
try {
  window.addEventListener("hashchange", () => { if (leerLink(true) && State.cloudUser && State.cloudProfile) linksSocio(); });
} catch (e) {}

// ---- mi_gimnasio() ----
function guardada(uid){
  try { const c = JSON.parse(localStorage.getItem(GYM_CACHE) || "null"); return c && c.uid === uid ? c : null; } catch (e) { return null; }
}
function guardar(uid, info){
  try { localStorage.setItem(GYM_CACHE, JSON.stringify({ uid, info: info || null, t: Date.now() })); } catch (e) {}
}
export const rolGym = () => (Gym.info && Gym.info.rol) || null;
// Socio (con ficha) o con un pedido pendiente: la app de siempre más lo del socio (parte 3).
export const esSocioGym = () => ["socio", "pendiente"].includes(rolGym());
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
  Gym.espera = true;
  if (!uid || !State.sb || sinRed) { Gym.leido = true; return { primera: false, lista: Promise.resolve(null) }; }
  let t;
  const tope = new Promise(ok => { t = setTimeout(() => ok({ tarde: true }), TOPE_MS); });
  const pedido = Promise.resolve(State.sb.rpc("mi_gimnasio")).then(r => r, e => ({ error: e }));
  const lista = Promise.race([pedido.finally(() => clearTimeout(t)), tope]).then(r => {
    // A tiempo: si afterLogin ya no la esperaba (había copia guardada, o se le acabó el tope del
    // arranque) y cambió el rol o el gimnasio, se redibuja: la copia decía dueña y la sacaron del
    // equipo (si no, quedaba la pantalla en blanco), o decía «sin gimnasio» y ahora es del equipo.
    if (r && !r.tarde && !r.error && State.cloudUser && State.cloudUser.id === uid){ if (aplicar(uid, r.data) && !Gym.espera) redibujar(); return r.data || null; }
    // Tarde: si llega después, se aplica igual (y se redibuja si cambió algo).
    if (r && r.tarde) pedido.then(x => { if (x && !x.error && State.cloudUser && State.cloudUser.id === uid && aplicar(uid, x.data)) redibujar(); });
    Gym.leido = true;
    return null;
  });
  return { primera: !c, lista };
}
// afterLogin ya no espera la respuesta: lo que cambie de acá en adelante se redibuja cuando llegue.
export function gymSinEspera(){ Gym.espera = false; }
// Guarda la respuesta. Devuelve true si cambió el rol o el gimnasio (hay que redibujar).
// Para el socio también cuenta su ficha o su pedido (el profe, la foto, la hoja aceptada): la tarjeta
// de Entreno y Ajustes se dibujan con eso.
const huella = () => JSON.stringify([rolGym(), Gym.info && Gym.info.gym && Gym.info.gym.id, esSocioGym() ? [Gym.info.gym && Gym.info.gym.name, Gym.info.ficha || Gym.info.solicitud || null] : null]);
function aplicar(uid, data){
  const antes = huella();
  Gym.info = data && typeof data === "object" ? data : null;
  Gym.leido = true;
  guardar(uid, Gym.info);
  return antes !== huella();
}
// Vuelve a preguntar (después de crear el gimnasio, aceptar una invitación, o para los contadores).
export async function releerGym(){
  if (!State.sb || !State.cloudUser) return Gym.info;
  const uid = State.cloudUser.id;
  try { const r = await State.sb.rpc("mi_gimnasio"); if (!r.error && State.cloudUser && State.cloudUser.id === uid) aplicar(uid, r.data); } catch (e) {}
  return Gym.info;
}

// ¿De quién es este código? (gym_codigo_info): { tipo: 'gym' | 'coach' | null, gym } o, si la
// función no está o falla (sin señal, un servidor sin la etapa 1), null: se sigue como hoy, con
// join_coach. El tope de intentos de join_coach llega como { error } con su texto (P0001).
export async function codigoInfo(code){
  if (!State.sb) return null;
  try {
    const r = await State.sb.rpc("gym_codigo_info", { code });
    if (r.error) return r.error.code === "P0001" && r.error.message ? { error: r.error } : null;
    return r.data && typeof r.data === "object" && "tipo" in r.data ? r.data : null;
  } catch (e) { return null; }
}
// Lo del socio (carga diferida: app/screens/gym/socio.js). null si no se pudo cargar.
let _socio = null;
export function cargarSocio(){
  if (!_socio) _socio = import("../screens/gym/socio.js").catch(e => { console.error("gimnasio socio", e); _socio = null; return null; });
  return _socio;
}
// Los botones del socio (tarjeta de Entreno, Ajustes → Tu gimnasio): data-gys="…".
try {
  document.addEventListener("click", e => {
    const b = e.target && e.target.closest && e.target.closest("[data-gys]");
    if (!b || b.disabled || b.closest("#gymSocioHost")) return;
    e.preventDefault();
    cargarSocio().then(m => m && m.accion(b.dataset.gys, b));
  });
  document.addEventListener("change", e => {
    const i = e.target;
    if (!i || !i.matches || !i.matches("input[data-gys-foto]")) return;
    const f = i.files && i.files[0]; i.value = "";
    if (f) cargarSocio().then(m => m && m.proponerFoto(f));
  });
} catch (e) {}
// La foto del gimnasio del socio (bucket privado gym-fotos): un link firmado por una hora. Devuelve
// el link si ya está y, si no, lo pide y redibuja cuando llega.
const _fotos = new Map();
export function fotoSocio(path){
  if (!path || !State.sb) return "";
  const c = _fotos.get(path);
  if (c && (c.pidiendo || c.exp > Date.now())) return c.url || "";
  _fotos.set(path, { pidiendo: true, url: "" });
  Promise.resolve(State.sb.storage.from("gym-fotos").createSignedUrl(path, 3600)).then(r => {
    const u = r && !r.error && r.data && r.data.signedUrl;
    _fotos.set(path, { url: u || "", exp: Date.now() + (u ? 3000e3 : 60e3) });
    if (u && _redibujar) _redibujar();
  }, () => _fotos.set(path, { url: "", exp: Date.now() + 60e3 }));
  return "";
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
  if (!Gym.ui) return false;
  const r = Gym.ui.pintar(); // sin nada del gimnasio, false (y limpia lo que haya dibujado antes)
  if (r === "coach"){ if (app) Gym.ui.coach(); return !!app; }
  return !!r;
}
// La pantalla de planes de coach (renderCoach, sin plan vigente) adentro del panel del gimnasio. El plan
// de la dueña es el del gimnasio (coach_active: con 5 días de gracia, gimnasios-vinculo.sql): mientras
// está activo o en gracia, «Como profe», «Mi cuenta» y la ficha de entrenamiento de un socio siguen
// andando, y si venció, una pantalla del gimnasio que lleva al Plan de GIZE (sin los planes de coach ni
// precios, y sin perder el marco). null: no está en el panel del gimnasio (la pantalla de siempre);
// "": sigue; si no, lo que se dibuja.
export function sinPlanGym(){
  return enMarcoGym() ? Gym.ui.sinPlan() : null;
}
// Dueño o administración con el panel del gimnasio cargado: lo del panel de coach va adentro de su marco.
export const enMarcoGym = () => !!Gym.ui && ["owner", "admin"].includes(rolGym());
