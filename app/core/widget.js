// «GIZE de hoy», el widget de la pantalla de inicio: el puente con el plugin propio GizeWidget de la
// app de Android (WidgetPlugin.java) y de la de iPhone (AppDelegate.swift). Lo que muestra lo arma
// core/widgetdatos.js; acá se manda, se borra, se atienden los toques (gize://widget/…) y se dibuja la
// tarjeta de Ajustes. En la web y en las apps que todavía no traen el plugin no hace nada.
//
// Cuándo se manda: cada vez que la app se dibuja (renderApp → widgetMarcar, como mucho una vez cada
// 2 s y solo si cambió), al pasar a segundo plano (al toque) y al entrar a la cuenta. El widget nunca
// lee nada por su cuenta: muestra lo último que le mandó la app.
// Cuándo se borra: al cerrar sesión, al eliminar la cuenta, cuando entra otra cuenta y al borrar una
// sesión no mantenida (core/supabase.js, main.js y screens/config.js). Después de borrarlo no se
// manda nada más hasta que la app se recarga: así no vuelve a aparecer la cuenta que salió.
//
// Plugin: guardar({ datos: texto JSON }) → { instalados }, borrar(), info() → { instalados,
// puedeAgregar } y agregar() → { pedido } (Android: el cartel del sistema para sumarlo a la pantalla).
//
// Los imports se usan solo adentro de funciones: main.js y supabase.js importan este archivo y estos
// módulos los importan a ellos (como en screens/pasos.js).
import { State, state } from './state.js';
import { today } from './utils.js';
import { esPanelGym } from './gimnasio.js';
import { SaludState, saludPrendida } from './salud.js';
import { appAndroid, appNativa } from './plataforma.js';
import { onAwayChange } from '../ui/pausa.js';
import { armarWidget, leerEnlaceWidget } from './widgetdatos.js';

const ESPERA = 2000;
const ARRANQUE = "gize_widget_arranque"; // sessionStorage: el link con que se abrió la app ya se usó

let plugin;             // undefined: todavía no se buscó; null: no hay
let opciones = null;    // los de initWidget: { ir(destino, dia), racha() }
let timer = null, ultimo = null, apagado = false, borrando = null;
let info = null, pidiendo = false; // lo último que dijo info(): { instalados, puedeAgregar }

// El plugin, sin bundler (como pluginCompras en core/compras-apple.js). null en la web o si la app
// instalada no lo trae.
export function pluginWidget(){
  if (plugin !== undefined) return plugin;
  plugin = null;
  try {
    const C = window.Capacitor;
    if (appNativa() && C) {
      if (C.Plugins && C.Plugins.GizeWidget) plugin = C.Plugins.GizeWidget;
      else if (typeof C.isPluginAvailable === "function" && C.isPluginAvailable("GizeWidget") && C.registerPlugin) plugin = C.registerPlugin("GizeWidget");
    }
  } catch (e) { plugin = null; }
  return plugin;
}
export const widgetDisponible = () => !!pluginWidget();

// Quién está adentro: null sin sesión (o con la sesión perdida, o sin saber todavía si es coach),
// "coach", "gimnasio" (el panel del gimnasio) o "alumno".
function modoActual(){
  if (!State.cloudUser || State.sessionLost) return null;
  if (State.cloudProfile && State.cloudProfile.role === "coach") return "coach";
  if (!State.cloudProfile && !State.cloudReady) return null;
  if (esPanelGym()) return "gimnasio";
  return "alumno";
}

// Algo cambió en la pantalla: se manda dentro de 2 s (los cambios seguidos van juntos).
export function widgetMarcar(){
  if (apagado || timer || !opciones || !pluginWidget()) return;
  timer = setTimeout(() => { timer = null; widgetEnviar(); }, ESPERA);
}

// Arma y manda ya, solo si cambió desde lo último que se mandó. Devuelve una promesa (true si mandó).
export function widgetEnviar(){
  clearTimeout(timer); timer = null;
  const P = pluginWidget(), modo = modoActual();
  if (apagado || !opciones || !P || !modo) return Promise.resolve(false);
  let datos;
  try {
    datos = JSON.stringify(armarWidget({ hoy: today(), ahora: Date.now(), modo, st: state,
      racha: modo === "alumno" && opciones.racha ? opciones.racha() : 0,
      salud: { prendida: saludPrendida(), lectura: SaludState.lastSync } }));
  } catch (e) { console.warn("widget", e); return Promise.resolve(false); }
  if (datos === ultimo) return Promise.resolve(false);
  ultimo = datos;
  // El pedido sale ya, no en la vuelta siguiente: si en el mismo momento se borra el widget, el
  // borrado tiene que llegar después y no al revés (si no, quedaba la cuenta que salió).
  let pedido;
  try { pedido = Promise.resolve(P.guardar({ datos })); } catch (e) { pedido = Promise.reject(e); }
  return pedido.then(r => {
    if (r && typeof r.instalados === "number") info = Object.assign({}, info, { instalados: r.instalados });
    return true;
  }, e => { if (ultimo === datos) ultimo = null; console.warn("widget", e); return false; });
}

// Borra lo que muestra el widget (queda «Ingresá a GIZE») y no manda nada más hasta recargar. El
// pedido sale en el momento (sin esperar), así llega aunque la app se recargue enseguida. Devuelve una
// promesa que nunca falla (la misma si se llama otra vez).
export function widgetBorrar(){
  apagado = true; clearTimeout(timer); timer = null; ultimo = null;
  if (borrando) return borrando;
  const P = pluginWidget();
  if (!P) return (borrando = Promise.resolve(false));
  try { borrando = Promise.resolve(P.borrar()).then(() => true, () => false); }
  catch (e) { borrando = Promise.resolve(false); }
  return borrando;
}

// Un toque en el widget: solo con la sesión de un alumno (sin sesión, un coach o el gimnasio, la app
// abre como siempre).
function abrirEnlace(url){
  const e = leerEnlaceWidget(url);
  if (!e || apagado || !opciones || !opciones.ir || modoActual() !== "alumno") return false;
  try { opciones.ir(e.destino, e.dia); } catch (err) { console.warn("widget", err); }
  return true;
}
// La app estaba cerrada y la abrió un toque en el widget: getLaunchUrl() devuelve ese link en cada
// recarga de la app (por ejemplo al cerrar sesión), así que se usa una sola vez por arranque.
async function enlaceDeArranque(){
  try { if (sessionStorage.getItem(ARRANQUE)) return; sessionStorage.setItem(ARRANQUE, "1"); } catch (e) { return; }
  const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (!App || !App.getLaunchUrl) return;
  let r = null; try { r = await App.getLaunchUrl(); } catch (e) {}
  abrirEnlace(r && r.url);
}

// ---- Ajustes → «Widget en tu pantalla» (solo alumnos, en la app que trae el plugin) ----
const widgetSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="17" height="7" rx="2"/></svg>';
function instrucciones(){
  return appAndroid()
    ? "Mantené apretado un lugar vacío de tu pantalla de inicio → Widgets → GIZE."
    : "Mantené apretado un lugar vacío de tu pantalla de inicio, tocá Editar → Agregar widget (o el +) y buscá GIZE.";
}
function accionHtml(){
  if (info && info.instalados > 0) return '<div class="cfg-notif-desc">Ya está en tu pantalla.</div>';
  // Android deja agregarlo desde la app (si el lanzador no deja, se explica cómo). iPhone no.
  if (appAndroid() && !(info && info.puedeAgregar === false)) return '<button type="button" class="form-save" data-widget="agregar">Agregar a la pantalla</button>';
  return '<div class="cfg-notif-desc">' + instrucciones() + '</div>';
}
function pintarAccion(){ const a = document.getElementById("cfgWidgetAcc"); if (a) { const h = accionHtml(); if (a.innerHTML !== h) a.innerHTML = h; } }
function pedirInfo(){
  const P = pluginWidget(); if (!P || pidiendo) return;
  pidiendo = true;
  Promise.resolve().then(() => P.info()).then(r => { if (r) info = { instalados: Number(r.instalados) || 0, puedeAgregar: r.puedeAgregar !== false }; }, () => {})
    .finally(() => { pidiendo = false; pintarAccion(); });
}
export function widgetAjustesHtml(){
  if (!widgetDisponible() || modoActual() !== "alumno") return "";
  pedirInfo();
  return '<div class="card cfg-card" id="cfgWidget">' +
      '<div class="cfg-notif-row">' +
        '<span class="cfg-notif-ic">' + widgetSvg + '</span>' +
        '<div class="cfg-notif-txt">' +
          '<div class="cfg-notif-label">Widget en tu pantalla</div>' +
          '<div class="cfg-notif-desc">Tus pasos, tu racha y el entreno de hoy, sin abrir la app.</div>' +
        '</div>' +
      '</div>' +
      '<div id="cfgWidgetAcc">' + accionHtml() + '</div>' +
    '</div>';
}
async function clicAjustes(ev){
  const b = ev.target && ev.target.closest && ev.target.closest('[data-widget="agregar"]');
  if (!b || b.disabled) return;
  const P = pluginWidget(); if (!P) return;
  b.disabled = true;
  await widgetEnviar(); // que el widget nuevo ya tenga los datos
  let r = null; try { r = await P.agregar(); } catch (e) {}
  b.disabled = false;
  // El lanzador no deja agregarlo desde la app: se explica cómo hacerlo a mano.
  if (!(r && r.pedido)) info = Object.assign({}, info, { puedeAgregar: false });
  pintarAccion();
}

// Al arrancar (main.js, como initHabitAlarms). ir(destino, dia): abre la app en «entreno» (con el día,
// si viene), «pasos» o «racha» (o «hoy», que es Entreno en el día de hoy). racha(): días seguidos.
export function initWidget(o){
  if (!pluginWidget()) return;
  opciones = o || {};
  // Al irse, se manda al toque (la espera de 2 s podría no llegar); al volver, Ajustes al día.
  onAwayChange(away => { if (away) widgetEnviar(); else if (document.getElementById("cfgWidget")) pedirInfo(); });
  window.addEventListener("gize:login", () => { widgetEnviar(); enlaceDeArranque(); });
  const App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (App && App.addListener) {
    try { const r = App.addListener("appUrlOpen", e => abrirEnlace(e && e.url)); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  }
  document.addEventListener("click", clicAjustes);
}
