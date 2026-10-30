// La IA en la app (función «ia» de Supabase, supabase/functions/ia): la foto del plato y la voz
// («Contá qué comiste»: lo que la persona dicta con el micrófono del teclado o escribe; GIZE no
// graba la voz, a la función va solo el texto). Todo arranca apagado: la app no muestra nada nuevo
// hasta que ia_mi_estado() (supabase/ia.sql) dice que la función está prendida en el panel
// (gize.ar/admin → IA); la voz pide además la base nueva (aviso_texto). Antes del primer uso se pide
// permiso (app/ui/ia-permiso.js). La IA nunca anota nada sola: la persona revisa y toca «Agregar».
import { State } from './state.js';

// Lo último que dijo ia_mi_estado(): { activa, funciones: { plato, texto }, permiso_comida,
// aviso_version, permiso_texto, aviso_texto, estado, vuelve, quedan: { plato, texto }, tope, plus
// (IA Plus, ui/ia-plus.js) }. null: no se sabe (sin sesión, sin internet, la base sin ia.sql): la
// app no muestra nada.
// fallo: la última vez no se pudo preguntar (sin internet, la base sin ia.sql): se vuelve a probar
// recién al minuto, para no mandar un pedido que falla en cada redibujo de Comida o Ajustes.
export const IA = { estado: null, at: 0, uid: null, pidiendo: null, fallo: false };
const VIGENCIA = 5 * 60_000, REINTENTO = 60_000;

const mio = () => !!(State.cloudUser && IA.uid === State.cloudUser.id);

// Pregunta el estado (con sesión). Sin forzar, usa lo que tiene si es de hace menos de 5 minutos.
// Devuelve el estado o null; nunca falla.
export async function iaEstado(forzar){
  if (!State.cloudUser || !State.sb) { IA.estado = null; IA.uid = null; return null; }
  if (!forzar && mio() && IA.at && Date.now() - IA.at < (IA.fallo ? REINTENTO : VIGENCIA)) return IA.estado;
  // Sin conexión ni se pregunta (sin forzar): queda lo que había.
  if (!forzar && navigator.onLine === false) return mio() ? IA.estado : null;
  if (IA.pidiendo) return IA.pidiendo;
  const uid = State.cloudUser.id;
  // No se pudo: se recuerda (para esperar el minuto) y queda lo que había de esta cuenta.
  const fallido = () => {
    if (!State.cloudUser || State.cloudUser.id !== uid) return null;
    if (!mio()) IA.estado = null;
    IA.uid = uid; IA.at = Date.now(); IA.fallo = true;
    return IA.estado;
  };
  IA.pidiendo = (async () => {
    try {
      const r = await State.sb.rpc("ia_mi_estado");
      if (r.error || !r.data || typeof r.data !== "object") return fallido();
      if (!State.cloudUser || State.cloudUser.id !== uid) return null;
      IA.estado = r.data; IA.at = Date.now(); IA.uid = uid; IA.fallo = false;
      return IA.estado;
    } catch (e) { return fallido(); }
    finally { IA.pidiendo = null; }
  })();
  return IA.pidiendo;
}
// Para cuando cambia la cuenta: nada de lo de la otra.
export function iaOlvidar(){ IA.estado = null; IA.at = 0; IA.uid = null; IA.fallo = false; }

// La versión del aviso de la voz que trae esta app (app/ui/ia-permiso.js, el que ya dice que también
// se manda lo que la persona cuenta). Si la base pide uno más nuevo, esta app no muestra la voz.
export const AVISO_VOZ = 3;
// ¿La voz está lista? Prendida en el panel (funciones.texto) y con la base nueva: ia_mi_estado trae
// aviso_texto, entre 3 y el aviso que trae la app. Sin eso no se ve nada de la voz.
export function iaVozLista(){
  const e = mio() && IA.estado;
  return !!(e && e.activa && e.funciones && e.funciones.texto === true && typeof e.aviso_texto === "number" && e.aviso_texto >= 3 && e.aviso_texto <= AVISO_VOZ);
}
// ¿Se muestra el botón de esa función ("plato" o "texto", la voz)? Con sesión y prendida en el
// panel. Si la persona la apagó en Ajustes, el botón sigue y lleva a Ajustes (no se le vuelve a
// preguntar sola).
export function iaVisible(f){
  if (f === "texto") return iaVozLista();
  const e = mio() && IA.estado;
  return !!(e && e.activa && e.funciones && e.funciones[f] === true);
}
// ¿Se muestra «Funciones con IA» en Ajustes? Con alguna prendida en el panel o, aunque estén
// apagadas, si la persona ya la había aceptado (para que la pueda apagar).
export function iaAlguna(){
  const e = mio() && IA.estado;
  return !!(e && ((e.activa && e.funciones && e.funciones.plato) || iaVozLista() || e.permiso_comida === "ok"));
}
export const iaPermiso = () => (mio() && IA.estado && IA.estado.permiso_comida) || null;
// El permiso de la voz: el mismo de Comida (el mismo interruptor apaga las dos), pero con el aviso
// que ya dice que se manda lo que contás ('viejo': aceptó solo el de la foto).
export const iaPermisoTexto = () => (mio() && IA.estado && IA.estado.permiso_texto) || null;
// ¿Se puede usar de verdad? Además de prendida en el panel, que la persona no la haya apagado en
// Ajustes y, si todavía no aceptó el aviso, que haya conexión (sin internet no se puede guardar el
// permiso). Si no, el buscador muestra el escáner de códigos para que la barra no quede vacía.
export function iaDisponible(f){
  if (!iaVisible(f)) return false;
  const pm = f === "texto" ? iaPermisoTexto() : iaPermiso();
  return pm !== "no" && !(pm !== "ok" && navigator.onLine === false);
}
export const avisoVersion = () => (mio() && IA.estado && IA.estado.aviso_version) || 1;

// Aceptar o apagar (ia_permiso). version: la del aviso que mostró la app (la 3, la de la voz); sin
// ella, la que da el servidor (la base todavía sin aviso_texto: la hoja mostró el aviso de la foto).
// Devuelve el estado nuevo o tira un Error con el mensaje.
export async function iaGuardarPermiso(acepta, version){
  if (!State.cloudUser || !State.sb) throw new Error("Iniciá sesión para usar la IA.");
  const r = await State.sb.rpc("ia_permiso", acepta ? { p_tipo: "comida", p_acepta: true, p_version: version || avisoVersion() } : { p_tipo: "comida", p_acepta: false });
  if (r.error) throw new Error(/aviso cambió/.test(r.error.message || "") ? r.error.message : "No se pudo guardar. Revisá la conexión y probá de nuevo.");
  if (r.data && typeof r.data === "object") { IA.estado = r.data; IA.at = Date.now(); IA.uid = State.cloudUser.id; IA.fallo = false; }
  return IA.estado;
}

// Foto → JPEG en base64 (sin el "data:…,"), con el lado más largo en max px. El canvas no copia
// los datos de la foto (EXIF, GPS): solo viaja la imagen.
export async function photoB64(file, max = 1568){
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

// Llama a la función. modo "plato" ({ imagen }): solo la foto (la aclaración escrita, «¿Qué es?»,
// se sacó: con la foto nunca se manda texto). modo "texto" ({ texto }): lo que la persona contó,
// sin audio ni nada más (así lo dicen el permiso y la política). Devuelve la respuesta ({ ok,
// hay_comida, nota, items }) o tira un fallo con .codigo. Sin conexión, no llama.
export async function iaPedir(modo, body){
  if (navigator.onLine === false) throw fallo("sin_conexion");
  if (!State.cloudUser || !State.sb) throw fallo("sin_sesion");
  const pedido = Object.assign({ modo }, body);
  if (modo === "plato") delete pedido.texto; else delete pedido.imagen;
  let r;
  try { r = await State.sb.functions.invoke("ia", { body: pedido }); }
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

// «¿Está mal? Avisanos»: lo que estimó la IA (sin la foto; en la voz, con lo que contó) y un comentario.
export async function iaReportar(funcion, respuesta, comentario){
  if (!State.cloudUser || !State.sb) throw new Error("Iniciá sesión.");
  const r = await State.sb.rpc("ia_reportar", { p_funcion: funcion, p_respuesta: respuesta, p_comentario: comentario || null });
  if (r.error) throw new Error(r.error.code === "54000" ? r.error.message : "No se pudo enviar. Probá de nuevo.");
}

// ¿Usa la IA con los límites de coach por ser profe de un gimnasio (sin plan de coach propio)?
// Lo dice ia_mi_estado() (por_gimnasio, ver ia_rol_origen en supabase/ia.sql): se le aclara en
// Ajustes y en el aviso del límite de hoy, para que sepa de dónde sale.
export function iaPorGimnasio(){
  const e = mio() && IA.estado;
  return !!(e && e.por_gimnasio === true);
}
export const IA_POR_GIMNASIO = "Tus límites de IA son los de coach, por tu gimnasio.";

// ---------- textos (§7.1) ----------
const fecha = iso => { try { return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" }); } catch (e) { return ""; } };
// El texto de cada código para la persona. modo "texto": los de la voz, donde los de la foto hablan
// de fotos. e.total: el límite de hoy es el de todos los usos con IA juntos (no el de la función).
export function iaMensaje(e, modo){
  const c = (e && e.codigo) || "error";
  if (modo === "texto") switch (c) {
    case "ahorro": return "Por este mes, contar lo que comiste con IA queda para alumnos con coach" + (IA.estado && IA.estado.plus && IA.estado.plus.activa ? " y para quien tiene IA Plus" : "") + ". Buscalo o escaneá el código.";
    case "tope_dia": return "Llegaste al límite de hoy (" + (e.tope ? e.tope + " " : "") + (e.total ? "usos" : "comidas contadas") + " con IA). Mañana se renueva. Mientras, buscalo o escaneá el código." + (iaPorGimnasio() ? " " + IA_POR_GIMNASIO : "");
    case "no_se_pudo": return "No se pudo entender lo que contaste. Probá contarlo de otra forma o cargalo a mano.";
  }
  switch (c) {
    case "sin_sesion": return "Iniciá sesión para usar la IA.";
    case "sin_conexion": return "Sin conexión. La IA necesita internet; podés cargarlo a mano.";
    case "pausada": return "La IA está pausada por ahora. Cargalo a mano.";
    case "ahorro": return "Por este mes, la foto del plato con IA queda para alumnos con coach" + (IA.estado && IA.estado.plus && IA.estado.plus.activa ? " y para quien tiene IA Plus" : "") + ". Buscalo o escaneá el código.";
    case "ritmo": return "Por hoy la IA llegó a su límite. Mañana vuelve. Mientras, cargalo a mano.";
    // IA Plus prendido (ui/ia-plus.js): se terminaron las fotos gratis de la semana.
    case "tope_semana": { const n = e.tope || (IA.estado && IA.estado.plus && IA.estado.plus.gratis_semana); return "Usaste tus " + (n ? n + " " : "") + "fotos gratis con IA de esta semana. Se renuevan el lunes. Mientras, buscalo o escaneá el código."; }
    case "tope_dia": return "Llegaste al límite de hoy (" + (e.tope ? e.tope + " " : "") + (e.total ? "usos" : "fotos de plato") + " con IA). Mañana se renueva. Mientras, buscalo o escaneá el código." + (iaPorGimnasio() ? " " + IA_POR_GIMNASIO : "");
    case "tope_persona": return "Llegaste a tu límite personal de este mes con IA." + (e.vuelve ? " Vuelve el " + fecha(e.vuelve) + "." : "") + " Mientras, buscalo o escaneá el código." + (iaPorGimnasio() ? " " + IA_POR_GIMNASIO : "");
    case "tope_mes": return "La IA de GIZE llegó a su límite de este mes: cargalo a mano." + (e.vuelve ? " Vuelve el " + fecha(e.vuelve) + "." : "");
    case "ocupada": return "La IA está con mucha demanda. Probá en un minuto.";
    case "foto_invalida": return "La foto no es válida o es muy grande. Probá con otra.";
    case "no_se_pudo": return "No se pudo analizar esta foto.";
    default: return "La IA está tardando más de lo normal o falló. Probá de nuevo en un rato.";
  }
}
// Los códigos con los que no tiene sentido «Probar de nuevo» ahora (se ofrece buscar o escanear).
export const iaSinReintento = c => ["pausada", "ahorro", "ritmo", "tope_semana", "tope_dia", "tope_persona", "tope_mes", "sin_sesion"].includes(c);
