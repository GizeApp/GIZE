// App de iPhone (App Store, reglas 3.1.1 y 3.1.3): las cuentas de coach se crean y se manejan
// solo desde la web. En la app de iPhone no se ofrece crear una cuenta de coach ni se habla de
// la prueba, de planes, de precios ni de pagos (tampoco se dice dónde se contratan): la usan
// los alumnos y los coaches que ya tienen cuenta. La web y la app de Android siguen como antes
// (en Android ya no hay precios ni links de pago: ver screens/coach/plan.js).

export function appIOS(){
  try {
    const C = window.Capacitor;
    return !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === "ios");
  } catch (e) { return false; }
}

// Mensajes propios de join_coach (supabase/suscripciones.sql) cuando el coach tiene el plan
// vencido o lleno: en iPhone, sin hablar del plan ni de renovarlo.
export function joinMsgTienda(m){
  if (!m || !appIOS()) return m;
  return /plan|renuev|ampl/i.test(m) ? "Tu coach no puede sumar alumnos en este momento. Avisale y volvé a intentar." : m;
}

// Error de la función de mensajes (notificar-cliente) con el plan del coach vencido: en iPhone,
// sin hablar del plan ni de renovarlo.
export function chatMsgTienda(m){
  if (!m || !appIOS()) return m;
  return /plan|renov/i.test(m) ? "Por ahora no se pueden mandar mensajes en esta conversación." : m;
}
