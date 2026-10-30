// App de iPhone (App Store, reglas 3.1.1 y 3.1.3): las cuentas de coach se crean y se manejan
// solo desde la web. En la app de iPhone no se ofrece crear una cuenta de coach: la usan los
// alumnos y los coaches que ya tienen cuenta. En la de Android sí se puede crear.
// En ninguna de las dos apps (appNativa) se habla de la prueba gratis ni de pagar por fuera de la
// tienda (tampoco se dice dónde se contrata en la web): ni en el panel del coach
// (screens/coach/plan.js), ni en la bienvenida, ni en los mensajes de abajo. En la de iPhone los
// planes de coach se compran con Apple (core/compras-apple.js): ahí se ven con el precio de Apple.
// En la de Android se compran con Google Play (core/compras-google.js) solo cuando el interruptor
// del panel lo prende para la cuenta: ahí se ven con el precio de Google Play; apagado, Android no
// habla de planes ni de precios. Nunca los precios de la web. La web sigue como antes.
import { appAndroid } from './plataforma.js';

export function appIOS(){
  try {
    const C = window.Capacitor;
    return !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === "ios");
  } catch (e) { return false; }
}
// Cualquiera de las apps de las tiendas (iPhone o Android, también con solo el puente de Android:
// core/plataforma.js appAndroid). Ahí no se habla de la prueba gratis ni de pagar por fuera de la
// tienda (Google Play y App Store); los planes, solo con la tienda de cada una.
export function appNativa(){
  try {
    const C = window.Capacitor;
    return !!(C && C.isNativePlatform && C.isNativePlatform()) || appAndroid();
  } catch (e) { return false; }
}

// Mensajes propios de join_coach (supabase/suscripciones.sql) cuando el coach tiene el plan
// vencido o lleno: en las apps, sin hablar del plan ni de renovarlo.
export function joinMsgTienda(m){
  if (!m || !appNativa()) return m;
  return /plan|renuev|ampl/i.test(m) ? "Tu coach no puede sumar alumnos en este momento. Avisale y volvé a intentar." : m;
}

// Error de la función de mensajes (notificar-cliente) con el plan del coach vencido: en las apps,
// sin hablar del plan ni de renovarlo.
export function chatMsgTienda(m){
  if (!m || !appNativa()) return m;
  return /plan|renov/i.test(m) ? "Por ahora no se pueden mandar mensajes en esta conversación." : m;
}
