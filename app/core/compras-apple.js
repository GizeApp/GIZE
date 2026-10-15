// Compras con Apple en la app de iPhone (App Store, regla 3.1.1): los planes de coach se pagan
// con una suscripción mensual de Apple que se renueva sola (In-App Purchase). Usa el plugin propio
// GizeCompras (StoreKit 2, en ios/App/App/AppDelegate.swift). Lo que compra el coach lo confirma
// el servidor (supabase/functions/compras-apple), que verifica la firma de Apple y le pone el plan.
// Solo existe en la app de iPhone que trae el plugin: en Android y en la web no hay nada de esto
// (ahí todo sigue como antes, ver core/tienda.js).
import { appIOS } from './tienda.js';

// Productos del App Store y el plan de GIZE que da cada uno. Es la misma lista que
// supabase/functions/compras-apple/planes.ts (tests/compras-apple.test.mjs controla que sean
// iguales). En App Store Connect van con estos IDs exactos (docs/APPLE-COMPRAS.md).
export const PRODUCTOS_APPLE = {
  "ar.com.gize.app.coach.p10": { plan: "p10", max: 10 },
  "ar.com.gize.app.coach.p25": { plan: "p25", max: 25 },
  "ar.com.gize.app.coach.p50": { plan: "p50", max: 50 },
  "ar.com.gize.app.coach.p100": { plan: "p100", max: 100 },
  "ar.com.gize.app.coach.p250": { plan: "p250", max: 250 },
  "ar.com.gize.app.coach.p500": { plan: "p500", max: 500 },
};
export const productoDelPlan = plan => Object.keys(PRODUCTOS_APPLE).find(k => PRODUCTOS_APPLE[k].plan === plan) || null;

// El plugin, sin bundler (como core/push.js). null fuera de la app de iPhone o si la app instalada
// no lo trae.
let plugin;
export function pluginCompras(){
  if (plugin !== undefined) return plugin;
  plugin = null;
  try {
    const C = window.Capacitor;
    if (appIOS()) {
      if (C.Plugins && C.Plugins.GizeCompras) plugin = C.Plugins.GizeCompras;
      else if (typeof C.isPluginAvailable === "function" && C.isPluginAvailable("GizeCompras") && C.registerPlugin) plugin = C.registerPlugin("GizeCompras");
    }
  } catch (e) { plugin = null; }
  return plugin;
}
// ¿Se compran los planes con Apple? (app de iPhone con el plugin)
export const comprasApple = () => !!pluginCompras();

// Los productos con el precio que pone Apple (en la moneda de la cuenta de Apple de cada uno), por
// plan: { p10: { id, nombre, descripcion, precio, periodo } }. null si todavía no están o no se
// pudieron traer (se vuelve a probar).
let productos = null, cargando = null;
export const productosApple = () => productos;
export function cargarProductosApple(){
  const P = pluginCompras();
  if (!P) return Promise.resolve(null);
  if (productos) return Promise.resolve(productos);
  if (!cargando) {
    cargando = Promise.resolve().then(() => P.productos({ ids: Object.keys(PRODUCTOS_APPLE) })).then(r => {
      const out = {};
      for (const p of (r && r.productos) || []) { const m = PRODUCTOS_APPLE[p && p.id]; if (m && p.precio) out[m.plan] = p; }
      productos = Object.keys(out).length ? out : null;
      return productos;
    }, () => null).finally(() => { cargando = null; });
  }
  return cargando;
}

// Comprar: { estado: "ok" | "cancelado" | "pendiente", jws, transaccion }. cuenta: el id del
// usuario de GIZE (Apple lo guarda en la compra como appAccountToken y el servidor lo controla).
export const comprarApple = (plan, cuenta) => pluginCompras().comprar({ id: productoDelPlan(plan), cuenta });
// Se le avisa a Apple que la compra ya quedó guardada (solo cuando el servidor la aceptó: si no,
// Apple la vuelve a mandar al abrir la app y se reintenta).
export const finalizarApple = transaccion => pluginCompras().finalizar({ transaccion: String(transaccion) });
// Las suscripciones vigentes de esta cuenta de Apple (los JWS).
export const vigentesApple = () => pluginCompras().vigentes().then(r => (r && r.jws) || []);
// «Restaurar compras»: Apple vuelve a leer las compras (puede pedir la contraseña de Apple).
export const restaurarApple = () => pluginCompras().restaurar();
// «Administrar suscripción»: la hoja de Apple para cambiar o cancelar la suscripción.
export const administrarApple = () => pluginCompras().administrar();
// Compras que llegan solas (una renovación, una compra aprobada más tarde o hecha en otro
// dispositivo): fn({ jws, transaccion }).
export function escucharApple(fn){
  const P = pluginCompras();
  if (P && P.addListener) try { P.addListener("transaccion", fn); } catch (e) {}
}
