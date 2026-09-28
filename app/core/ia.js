// Fotos analizadas con IA (función «ia-comida» de Supabase, que usa Claude): la tabla
// nutricional de un envase o lo que hay en un plato. La foto se achica antes de mandarla.
import { State } from './state.js';
import { ensureSb } from './supabase.js';

// Foto → JPEG en base64 (sin el "data:…,"), con el lado más largo en max px.
export async function photoB64(file, max = 1280){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No se pudo abrir la foto")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.82).split(",")[1];
  } finally { URL.revokeObjectURL(url); }
}

export function iaAvailable(){ return !!State.cloudUser && navigator.onLine !== false; }

// modo "etiqueta" | "plato". Devuelve lo que responde la función; si falla, tira un Error
// con un mensaje para mostrar (err.soft = true cuando conviene probar otra forma).
export async function iaAnalyze(modo, file, texto){
  const sb = await ensureSb();
  if (!sb || !State.cloudUser) { const e = new Error("Iniciá sesión para usar la IA."); e.soft = true; throw e; }
  const imagen = await photoB64(file);
  const r = await sb.functions.invoke("ia-comida", { body: { modo, imagen, texto: texto || "" } });
  if (r.error) {
    let msg = "", status = 0;
    try { status = r.error.context && r.error.context.status; const j = await r.error.context.json(); msg = j && j.error; } catch (e) {}
    const e = new Error(msg || "No se pudo analizar la foto. Revisá la conexión y probá de nuevo.");
    e.soft = !msg || status === 503 || status === 502 || status === 404;
    throw e;
  }
  return r.data || {};
}
