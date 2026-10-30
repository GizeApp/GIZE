// Compras con Google Play en la app de Android: los planes de coach se pagan con una suscripción
// mensual de Google Play que se renueva sola (Play Billing). Usa el plugin propio GizeCompras
// (android/app/src/main/java/ar/com/gize/app/GizeComprasPlugin.java, se llama igual que el del
// iPhone pero cada uno tiene su código). Lo que compra el coach lo verifica, lo guarda y lo reconoce
// el servidor (supabase/functions/compras-google): la app solo le pasa { token, producto }.
// Arranca APAGADO: solo se vende si el interruptor del panel (rpc compras_google, ver
// supabase/compras-google.sql) lo prende para esta cuenta. Apagado, o en una versión de la app sin
// el plugin, Android sigue como siempre (sin planes ni precios, ver core/tienda.js). En el iPhone y
// en la web no hay nada de esto.
import { appAndroid } from './plataforma.js';

// Productos de Google Play y el plan de GIZE que da cada uno. Son los mismos IDs que en el App Store
// y la misma lista que supabase/functions/compras-google/planes.ts (tests/compras-google-app.test.mjs
// controla que sean iguales). En Play Console van con estos IDs exactos y el plan base «mensual».
export const PRODUCTOS_GOOGLE = {
  "ar.com.gize.app.coach.p10": { plan: "p10", max: 10 },
  "ar.com.gize.app.coach.p25": { plan: "p25", max: 25 },
  "ar.com.gize.app.coach.p50": { plan: "p50", max: 50 },
  "ar.com.gize.app.coach.p100": { plan: "p100", max: 100 },
  "ar.com.gize.app.coach.p250": { plan: "p250", max: 250 },
  "ar.com.gize.app.coach.p500": { plan: "p500", max: 500 },
};
export const productoDelPlanGoogle = plan => Object.keys(PRODUCTOS_GOOGLE).find(k => PRODUCTOS_GOOGLE[k].plan === plan) || null;
// IA Plus con Google Play (ui/ia-plus.js): la suscripción mensual de la IA de Comida. No va en
// PRODUCTOS_GOOGLE: no es un plan de coach.
export const PRODUCTO_IA_PLUS_GOOGLE = "ar.com.gize.app.iaplus.mensual";
// El plan base de cada suscripción en Play Console (el mismo que PLAN_BASE del plugin).
export const PLAN_BASE = "mensual";

// El plugin, sin bundler (como core/compras-apple.js). null fuera de la app de Android o si la app
// instalada no lo trae (versiones viejas).
let plugin;
export function pluginGoogle(){
  if (plugin !== undefined) return plugin;
  plugin = null;
  try {
    const C = window.Capacitor;
    if (appAndroid() && C && C.getPlatform && C.getPlatform() === "android") {
      if (C.Plugins && C.Plugins.GizeCompras) plugin = C.Plugins.GizeCompras;
      else if (typeof C.isPluginAvailable === "function" && C.isPluginAvailable("GizeCompras") && C.registerPlugin) plugin = C.registerPlugin("GizeCompras");
    }
  } catch (e) { plugin = null; }
  return plugin;
}

// El interruptor del panel para esta cuenta: { planes, plus }. Se guarda también en el dispositivo
// (por cuenta) para arrancar sin señal con lo último que se supo. Sin la función en la base todavía
// (404, PGRST202) o con una respuesta rara: apagado.
const APAGADO = { planes: false, plus: false };
let interruptor = null;
const claveInterruptor = uid => "gize_compras_google_" + uid;
function leerGuardado(uid){
  try { const v = JSON.parse(localStorage.getItem(claveInterruptor(uid)) || "null"); return v && typeof v === "object" ? { planes: v.planes === true, plus: v.plus === true } : null; }
  catch (e) { return null; }
}
function guardar(uid, v){ try { localStorage.setItem(claveInterruptor(uid), JSON.stringify(v)); } catch (e) {} }
export async function cargarInterruptorGoogle(sb, uid){
  if (!pluginGoogle() || !sb || !uid) { interruptor = null; return APAGADO; }
  if (!interruptor || interruptor.uid !== uid) interruptor = Object.assign({ uid }, leerGuardado(uid) || APAGADO);
  try {
    const r = await sb.rpc("compras_google");
    if (r.error) {
      // Todavía no está la función en la base: apagado.
      if (r.error.code === "PGRST202" || r.status === 404) { interruptor = Object.assign({ uid }, APAGADO); guardar(uid, APAGADO); }
    } else {
      const d = r.data && typeof r.data === "object" ? r.data : {};
      const v = { planes: d.planes === true, plus: d.plus === true };
      interruptor = Object.assign({ uid }, v); guardar(uid, v);
    }
  } catch (e) {}
  return { planes: interruptor.planes, plus: interruptor.plus };
}
// ¿Se vende con Google Play? cual: "planes" (planes de coach) o "plus" (IA Plus).
export const comprasGoogle = cual => !!pluginGoogle() && !!(interruptor && interruptor[cual] === true);

// Los planes con el precio que pone Google Play (el texto que da Google, con su moneda), por plan:
// { p10: { id, nombre, descripcion, precio, periodo } }. null si todavía no están o no se pudieron
// traer (se vuelve a probar).
let productos = null, cargando = null;
export const productosGoogle = () => productos;
export function cargarProductosGoogle(){
  const P = pluginGoogle();
  if (!P) return Promise.resolve(null);
  if (productos) return Promise.resolve(productos);
  if (!cargando) {
    cargando = Promise.resolve().then(() => P.productos({ ids: Object.keys(PRODUCTOS_GOOGLE) })).then(r => {
      const out = {};
      for (const p of (r && r.productos) || []) { const m = PRODUCTOS_GOOGLE[p && p.id]; if (m && p.precio) out[m.plan] = p; }
      productos = Object.keys(out).length ? out : null;
      return productos;
    }, () => null).finally(() => { cargando = null; });
  }
  return cargando;
}

// IA Plus con el precio que pone Google Play ({ id, nombre, descripcion, precio, periodo }) o null si
// no se pudo traer (se vuelve a probar), y comprarlo (devuelve lo mismo que comprarGoogle).
let plusGoogle = null, cargandoPlus = null;
export const productoPlusGoogle = () => plusGoogle;
export function cargarPlusGoogle(){
  const P = pluginGoogle();
  if (!P) return Promise.resolve(null);
  if (plusGoogle) return Promise.resolve(plusGoogle);
  if (!cargandoPlus) {
    cargandoPlus = Promise.resolve().then(() => P.productos({ ids: [PRODUCTO_IA_PLUS_GOOGLE] })).then(r => {
      const p = ((r && r.productos) || []).find(x => x && x.id === PRODUCTO_IA_PLUS_GOOGLE && x.precio);
      plusGoogle = p || null;
      return plusGoogle;
    }, () => null).finally(() => { cargandoPlus = null; });
  }
  return cargandoPlus;
}
export const comprarPlusGoogle = cuenta => pluginGoogle().comprar({ id: PRODUCTO_IA_PLUS_GOOGLE, cuenta });
// ¿Es una compra de IA Plus? (las de los planes las atiende screens/coach/plan.js)
export const esPlusGoogle = c => !!(c && c.token && c.producto === PRODUCTO_IA_PLUS_GOOGLE);

// Comprar: { estado: "ok" | "pendiente", token, producto } o { estado: "cancelado" | "ya" }.
// cuenta: el id del usuario de GIZE (va en la compra como obfuscatedAccountId y el servidor lo
// controla). reemplazo (cambiar de plan): { token, producto, modo: "subir" | "bajar" } de la
// suscripción que ya tiene.
export const comprarGoogle = (plan, cuenta, reemplazo) => pluginGoogle().comprar(Object.assign({ id: productoDelPlanGoogle(plan), cuenta }, reemplazo ? { reemplazo } : {}));
// Se le avisa a Google que la compra quedó (acknowledge). Solo cuando el servidor la guardó y
// contestó reconocer: true (no la pudo reconocer él).
export const reconocerGoogle = token => pluginGoogle().finalizar({ token: String(token) });
// Las suscripciones de esta cuenta de Google en el celular (también las suspendidas).
export const vigentesGoogle = () => pluginGoogle().vigentes().then(r => (r && r.compras) || []);
// «Recuperar mi suscripción»: Google Play vuelve a dar las compras.
export const restaurarGoogle = () => pluginGoogle().restaurar();
// «Administrar en Google Play»: abre esa suscripción en Play Store (cancelar, cambiar el pago).
export const administrarGoogle = producto => pluginGoogle().administrar(producto ? { producto } : {});
// El aviso propio de Google cuando no pudo cobrar: { estado: "nada" | "actualizada", token }.
export const avisosGoogle = () => pluginGoogle().avisos();
// Compras que llegan solas (una pendiente que se acreditó, una renovación): un solo listener del
// plugin que reparte a quien escuche (los planes y IA Plus), cada uno filtra por
// producto. fn({ token, producto, estado, reconocida, suspendida, renueva }).
const oyentes = [];
let escuchando = false;
export function escucharGoogle(fn){
  const P = pluginGoogle();
  if (!P) return;
  oyentes.push(fn);
  if (escuchando || !P.addListener) return;
  escuchando = true;
  try { P.addListener("compra", ev => { for (const f of oyentes) { try { f(ev); } catch (e) {} } }); } catch (e) {}
}
