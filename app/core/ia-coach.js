// La IA del coach: «Pasar mis planillas» y «Armar con IA» (función «ia» de Supabase, modos
// «planilla» y «rutina»). Va aparte de app/core/ia.js (la IA de Comida del alumno), con su propio
// estado y su propio permiso. Todo arranca apagado: el panel del coach no muestra nada nuevo hasta
// que ia_coach_estado() (supabase/ia.sql) dice que la función está prendida en el panel (gize.ar/admin
// → IA) y que el coach la puede usar. Antes del primer uso se pide un solo permiso para las dos,
// «Usar IA en tus rutinas» (app/ui/ia-permiso-rutinas.js), que se apaga y se prende en Configuración
// → Privacidad. La IA nunca guarda nada sola: arma un borrador que el coach revisa y guarda.
import { State } from './state.js';

// Lo último que dijo ia_coach_estado(): { activa, funciones: { planilla, rutina }, rol, motivo,
// por_gimnasio, permiso_rutinas ('ok' | 'no' | 'viejo' | null), aviso_version (la del aviso «Usar IA
// en tus rutinas»), estado, vuelve, manana, quedan: { planilla, rutina }, tope }. Sin montos.
// null: no se sabe (sin sesión, sin internet, la base sin ia.sql): el panel no muestra nada.
// fallo: la última vez no se pudo preguntar: se vuelve a probar recién al minuto, para no mandar un
// pedido que falla en cada redibujo del panel.
export const IA_COACH = { estado: null, at: 0, uid: null, pidiendo: null, fallo: false };
const VIGENCIA = 5 * 60_000, REINTENTO = 60_000;

const mio = () => !!(State.cloudUser && IA_COACH.uid === State.cloudUser.id);
const guardar = d => { IA_COACH.estado = d; IA_COACH.at = Date.now(); IA_COACH.uid = State.cloudUser.id; IA_COACH.fallo = false; };

// Pregunta el estado (con sesión). Sin forzar, usa lo que tiene si es de hace menos de 5 minutos.
// Devuelve el estado o null; nunca falla.
export async function iaCoachEstado(forzar){
  if (!State.cloudUser || !State.sb) { IA_COACH.estado = null; IA_COACH.uid = null; return null; }
  if (!forzar && mio() && IA_COACH.at && Date.now() - IA_COACH.at < (IA_COACH.fallo ? REINTENTO : VIGENCIA)) return IA_COACH.estado;
  // Sin conexión ni se pregunta (sin forzar): queda lo que había.
  if (!forzar && navigator.onLine === false) return mio() ? IA_COACH.estado : null;
  if (IA_COACH.pidiendo) return IA_COACH.pidiendo;
  const uid = State.cloudUser.id;
  // No se pudo: se recuerda (para esperar el minuto) y queda lo que había de esta cuenta.
  const fallido = () => {
    if (!State.cloudUser || State.cloudUser.id !== uid) return null;
    if (!mio()) IA_COACH.estado = null;
    IA_COACH.uid = uid; IA_COACH.at = Date.now(); IA_COACH.fallo = true;
    return IA_COACH.estado;
  };
  IA_COACH.pidiendo = (async () => {
    try {
      const r = await State.sb.rpc("ia_coach_estado");
      if (r.error || !r.data || typeof r.data !== "object") return fallido();
      if (!State.cloudUser || State.cloudUser.id !== uid) return null;
      guardar(r.data);
      return IA_COACH.estado;
    } catch (e) { return fallido(); }
    finally { IA_COACH.pidiendo = null; }
  })();
  return IA_COACH.pidiendo;
}

// ¿Se muestra el botón de esa función ("planilla" o "rutina")? Con sesión, prendida en el panel y
// si el coach la puede usar (la base ya pone la función en false si no puede). Si el coach apagó el
// permiso, el botón sigue y lleva a Configuración (no se le vuelve a preguntar sola).
export function iaCoachVisible(f){
  const e = mio() && IA_COACH.estado;
  return !!(e && e.activa && e.funciones && e.funciones[f] === true);
}
// ¿Se muestra «Usar IA en tus rutinas» en Configuración → Privacidad? Con alguna de las dos
// prendida o, aunque estén apagadas, si el coach ya lo había aceptado (para que lo pueda apagar).
export function iaCoachAlguna(){
  const e = mio() && IA_COACH.estado;
  return !!(e && ((e.activa && e.funciones && (e.funciones.planilla === true || e.funciones.rutina === true)) || e.permiso_rutinas === "ok"));
}
export const iaRutinasPermiso = () => (mio() && IA_COACH.estado && IA_COACH.estado.permiso_rutinas) || null;
const avisoVersion = () => (mio() && IA_COACH.estado && IA_COACH.estado.aviso_version) || 1;

// Aceptar (con la versión del aviso que se mostró) o apagar el permiso (ia_permiso_rutinas). No
// toca el permiso de Comida. Devuelve el estado nuevo o tira un Error con el mensaje.
export async function iaGuardarPermisoRutinas(acepta){
  if (!State.cloudUser || !State.sb) throw new Error("Iniciá sesión para usar la IA.");
  const r = await State.sb.rpc("ia_permiso_rutinas", acepta ? { p_acepta: true, p_version: avisoVersion() } : { p_acepta: false });
  if (r.error) throw new Error(/aviso cambió/.test(r.error.message || "") ? r.error.message : "No se pudo guardar. Revisá la conexión y probá de nuevo.");
  if (r.data && typeof r.data === "object") guardar(r.data);
  return IA_COACH.estado;
}

// ---------- textos ----------
// Los mismos en la web y en las apps: nunca nombran la prueba, el plan, precios ni links (reglas de
// las tiendas). El estado de ia_coach_estado() (pausada, tope_mes, tope_persona, ahorro) usa los
// mismos textos: iaCoachMensaje({ codigo: estado.estado, vuelve: estado.vuelve }, f).
const fecha = iso => { try { return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" }); } catch (e) { return ""; } };
const QUE = { planilla: "pasar planillas", rutina: "armar rutinas" };
const A_MANO = "armá la rutina a mano.";
// El texto de cada código de la función «ia» para el coach. f: "planilla" o "rutina".
export function iaCoachMensaje(e, f){
  const c = (e && e.codigo) || "error", que = QUE[f] || "usar la IA";
  const vuelve = e && e.vuelve ? " Vuelve el " + fecha(e.vuelve) + "." : "";
  switch (c) {
    case "sin_sesion": return "Iniciá sesión para usar la IA.";
    case "sin_conexion": return "Sin conexión. La IA necesita internet: " + A_MANO;
    case "sin_permiso":
      if (e.motivo === "apagada") return "Apagaste «Usar IA en tus rutinas». Si la querés usar, prendela en Configuración → Privacidad.";
      if (e.motivo === "aviso_nuevo") return "El aviso de la IA cambió: volvé a leerlo antes de seguir.";
      return "Antes de usar la IA, leé y aceptá el aviso «Usar IA en tus rutinas».";
    // Sin plan, en la prueba con el ciclo en ahorro o sin permiso del panel: lo mismo, sin decir por qué.
    case "sin_plan": case "no_habilitado": case "ahorro": return "Por ahora no podés usar esta función: " + A_MANO;
    case "pausada": return "La IA está pausada por ahora: " + A_MANO;
    case "ritmo": return "Por hoy la IA llegó a su límite. Mañana vuelve. Mientras, " + A_MANO;
    case "tope_dia": return "Llegaste al límite de hoy para " + que + " con IA" + (e.tope ? " (" + e.tope + ")" : "") + ". Mañana seguís.";
    case "tope_persona": return "Llegaste a tu límite de este mes con IA." + vuelve + " Mientras, " + A_MANO;
    case "tope_mes": return "La IA de GIZE llegó a su límite de este mes: " + A_MANO + vuelve;
    case "ocupada": return "La IA está con mucha demanda. Probá en un minuto.";
    case "hoja_grande": return "Esta hoja es muy grande para pasarla con IA. Partila en hojas más chicas y probá de nuevo.";
    case "no_se_pudo": return f === "planilla" ? "No se pudo leer esta hoja con IA. Probá de nuevo o cargala a mano." : "No se pudo armar la rutina con ese pedido. Probá contarlo de otra forma o " + A_MANO;
    default: return "La IA está tardando más de lo normal o falló. Probá de nuevo en un rato.";
  }
}
