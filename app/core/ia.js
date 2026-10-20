// La IA en la app (función «ia» de Supabase, supabase/functions/ia): la foto del plato y «Contame
// qué comiste». Todo arranca apagado: la app no muestra nada nuevo hasta que ia_mi_estado()
// (supabase/ia.sql) dice que la función está prendida en el panel (gize.ar/admin → IA). Antes del
// primer uso se pide permiso (app/ui/ia-permiso.js). La IA nunca anota nada sola: la persona revisa
// y toca «Agregar».
import { State } from './state.js';

// Lo último que dijo ia_mi_estado(): { activa, funciones: { plato, texto }, permiso_comida,
// aviso_version, estado, vuelve, quedan: { plato, texto }, tope }. null: no se sabe (sin sesión,
// sin internet, la base sin ia.sql): la app no muestra nada.
export const IA = { estado: null, at: 0, uid: null, pidiendo: null };
const VIGENCIA = 5 * 60_000;

const mio = () => !!(State.cloudUser && IA.uid === State.cloudUser.id);

// Pregunta el estado (con sesión). Sin forzar, usa lo que tiene si es de hace menos de 5 minutos.
// Devuelve el estado o null; nunca falla.
export async function iaEstado(forzar){
  if (!State.cloudUser || !State.sb) { IA.estado = null; IA.uid = null; return null; }
  if (!forzar && mio() && IA.estado && Date.now() - IA.at < VIGENCIA) return IA.estado;
  if (IA.pidiendo) return IA.pidiendo;
  const uid = State.cloudUser.id;
  IA.pidiendo = (async () => {
    try {
      const r = await State.sb.rpc("ia_mi_estado");
      if (r.error || !r.data || typeof r.data !== "object") { if (!mio()) IA.estado = null; return mio() ? IA.estado : null; }
      if (!State.cloudUser || State.cloudUser.id !== uid) return null;
      IA.estado = r.data; IA.at = Date.now(); IA.uid = uid;
      return IA.estado;
    } catch (e) { return mio() ? IA.estado : null; }
    finally { IA.pidiendo = null; }
  })();
  return IA.pidiendo;
}
// Para cuando cambia la cuenta: nada de lo de la otra.
export function iaOlvidar(){ IA.estado = null; IA.at = 0; IA.uid = null; }

// ¿Se muestra el botón de esa función ("plato" | "texto")? Con sesión y prendida en el panel. Si la
// persona la apagó en Ajustes, el botón sigue y lleva a Ajustes (no se le vuelve a preguntar sola).
export function iaVisible(f){
  const e = mio() && IA.estado;
  return !!(e && e.activa && e.funciones && e.funciones[f] === true);
}
// ¿Se muestra «Funciones con IA» en Ajustes? Con alguna prendida en el panel o, aunque estén
// apagadas, si la persona ya la había aceptado (para que la pueda apagar).
export function iaAlguna(){
  const e = mio() && IA.estado;
  return !!(e && ((e.activa && e.funciones && (e.funciones.plato || e.funciones.texto)) || e.permiso_comida === "ok"));
}
export const iaPermiso = () => (mio() && IA.estado && IA.estado.permiso_comida) || null;
export const avisoVersion = () => (mio() && IA.estado && IA.estado.aviso_version) || 1;

// Aceptar o apagar (ia_permiso). Devuelve el estado nuevo o tira un Error con el mensaje.
export async function iaGuardarPermiso(acepta){
  if (!State.cloudUser || !State.sb) throw new Error("Iniciá sesión para usar la IA.");
  const r = await State.sb.rpc("ia_permiso", acepta ? { p_tipo: "comida", p_acepta: true, p_version: avisoVersion() } : { p_tipo: "comida", p_acepta: false });
  if (r.error) throw new Error(/aviso cambió/.test(r.error.message || "") ? r.error.message : "No se pudo guardar. Revisá la conexión y probá de nuevo.");
  if (r.data && typeof r.data === "object") { IA.estado = r.data; IA.at = Date.now(); IA.uid = State.cloudUser.id; }
  return IA.estado;
}

// Foto → JPEG en base64 (sin el "data:…,"), con el lado más largo en max px. El canvas no copia
// los datos de la foto (EXIF, GPS): solo viaja la imagen.
export async function photoB64(file, max = 1024){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("foto")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.8).split(",")[1];
  } finally { URL.revokeObjectURL(url); }
}

// Error con el código de la función (supabase/functions/ia → no()): .codigo, .vuelve, .tope.
const fallo = (codigo, extra) => Object.assign(new Error(codigo), { codigo }, extra || {});

// Llama a la función. modo "plato" ({ imagen, texto? }) o "texto" ({ texto }). Devuelve la
// respuesta ({ ok, hay_comida, nota, items }) o tira un fallo con .codigo. Sin conexión, no llama.
export async function iaPedir(modo, body){
  if (navigator.onLine === false) throw fallo("sin_conexion");
  if (!State.cloudUser || !State.sb) throw fallo("sin_sesion");
  let r;
  try { r = await State.sb.functions.invoke("ia", { body: Object.assign({ modo }, body) }); }
  catch (e) { throw fallo(navigator.onLine === false ? "sin_conexion" : "error"); }
  if (r.error) {
    const ctx = r.error.context; let j = null;
    try { j = ctx && typeof ctx.json === "function" ? await ctx.json() : null; } catch (e) {}
    if (j && j.codigo) throw fallo(j.codigo, { vuelve: j.vuelve || null, tope: j.tope, motivo: j.motivo });
    throw fallo(r.error.name === "FunctionsFetchError" ? (navigator.onLine === false ? "sin_conexion" : "error") : "error");
  }
  const d = r.data;
  if (!d || typeof d !== "object" || d.ok !== true) throw fallo((d && d.codigo) || "error");
  return d;
}

// «¿Está mal? Avisanos»: lo que estimó la IA (sin la foto) y un comentario.
export async function iaReportar(funcion, respuesta, comentario){
  if (!State.cloudUser || !State.sb) throw new Error("Iniciá sesión.");
  const r = await State.sb.rpc("ia_reportar", { p_funcion: funcion, p_respuesta: respuesta, p_comentario: comentario || null });
  if (r.error) throw new Error(r.error.code === "54000" ? r.error.message : "No se pudo enviar. Probá de nuevo.");
}

// ---------- textos (§7.1) ----------
const fecha = iso => { try { return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" }); } catch (e) { return ""; } };
// El texto de cada código para la persona. modo: "plato" | "texto" (para el tope del día).
export function iaMensaje(e, modo){
  const c = (e && e.codigo) || "error";
  const que = modo === "texto" ? "textos" : "fotos de plato";
  switch (c) {
    case "sin_sesion": return "Iniciá sesión para usar la IA.";
    case "sin_conexion": return "Sin conexión. La IA necesita internet; podés cargarlo a mano.";
    case "pausada": return "La IA está pausada por ahora. Cargalo a mano.";
    case "ahorro": return "Por este mes, la foto y el texto con IA quedan para alumnos con coach. Buscalo o escaneá el código.";
    case "ritmo": return "Por hoy la IA llegó a su límite. Mañana vuelve. Mientras, cargalo a mano.";
    case "tope_dia": return "Llegaste al límite de hoy (" + (e.tope ? e.tope + " " : "") + que + " con IA). Mañana se renueva. Mientras, buscalo o escaneá el código.";
    case "tope_persona": return "Llegaste a tu límite personal de este mes con IA." + (e.vuelve ? " Vuelve el " + fecha(e.vuelve) + "." : "") + " Mientras, buscalo o escaneá el código.";
    case "tope_mes": return "La IA de GIZE llegó a su límite de este mes: cargalo a mano." + (e.vuelve ? " Vuelve el " + fecha(e.vuelve) + "." : "");
    case "ocupada": return "La IA está con mucha demanda. Probá en un minuto.";
    case "foto_invalida": return "La foto no es válida o es muy grande. Probá con otra.";
    case "no_se_pudo": return modo === "texto" ? "No se pudo analizar lo que escribiste." : "No se pudo analizar esta foto.";
    default: return "La IA está tardando más de lo normal o falló. Probá de nuevo en un rato.";
  }
}
// Los códigos con los que no tiene sentido «Probar de nuevo» ahora (se ofrece buscar o escanear).
export const iaSinReintento = c => ["pausada", "ahorro", "ritmo", "tope_dia", "tope_persona", "tope_mes", "sin_sesion"].includes(c);
