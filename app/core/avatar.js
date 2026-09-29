// Foto de perfil (cliente y coach).
//
// La imagen se recorta en cuadrado (el encuadre lo elige la persona en ui/recorte.js) y se
// achica en el celular antes de subirla (JPEG de 320 × 320, unos 30–60 KB). Se guarda en el bucket privado "avatars" de Supabase, en la
// carpeta del propio usuario ({uid}/…jpg), y la ruta queda en profiles.avatar_path.
// Para mostrarla se piden links firmados (valen 1 día).
// Quién puede verla lo deciden las políticas de supabase/foto-perfil.sql: el propio
// usuario, su coach y los clientes de ese coach.
//
// Si el SQL todavía no se corrió, subir avisa y todo lo demás sigue mostrando iniciales.

import { State } from './state.js';

import { esc, storageErrorText } from './utils.js';

const BUCKET = "avatars";
const SIZE = 320;
const TTL = 24 * 3600;
const urls = new Map(); // ruta → { url, exp }

export function avatarUrl(path){
  const c = path && urls.get(path);
  return c && c.exp > Date.now() ? c.url : "";
}

// Pide links firmados para las rutas que todavía no tienen uno vigente.
export async function resolveAvatars(paths){
  const need = [...new Set((paths || []).filter(p => p && !avatarUrl(p)))];
  if (!need.length || !State.sb) return false;
  const r = await State.sb.storage.from(BUCKET).createSignedUrls(need, TTL);
  if (r.error || !Array.isArray(r.data)){ console.error("avatars: links firmados", r.error); return false; }
  const exp = Date.now() + (TTL - 600) * 1000;
  let any = false;
  r.data.forEach((d, i) => {
    // Cada ítem puede venir con su propio error (p. ej. la política de storage no deja
    // leer esa carpeta): se loguea para poder verlo en vez de quedar en iniciales mudas.
    const p = (d && d.path) || need[i];
    if (d && d.signedUrl && p){ urls.set(p, { url: d.signedUrl, exp }); any = true; }
    else console.error("avatars: sin link para", p, d && d.error);
  });
  return any;
}

// Círculo con la foto o, si no hay, con las iniciales (mismas clases que ya usa cada lugar).
export function avatarHtml(path, initials, cls){
  const u = avatarUrl(path);
  return u
    ? '<span class="' + cls + ' has-photo"><img src="' + esc(u) + '" alt="" loading="lazy" decoding="async"></span>'
    : '<span class="' + cls + '">' + esc(initials || "?") + '</span>';
}

function loadImage(file){
  if (window.createImageBitmap) return createImageBitmap(file).catch(() => loadImageEl(file));
  return loadImageEl(file);
}
function loadImageEl(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

// Recorte cuadrado centrado + achicado a 320 px → JPEG.
export async function squareJpeg(file){
  const img = await loadImage(file);
  const w = img.width, h = img.height, s = Math.min(w, h);
  const cv = document.createElement("canvas"); cv.width = cv.height = SIZE;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, SIZE, SIZE);
  if (img.close) img.close();
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("No se pudo procesar la imagen")), "image/jpeg", 0.85));
}

// Sube la foto nueva, la guarda en el perfil y borra la anterior. Devuelve un mensaje de
// error para mostrar, o "" si salió bien. cropped: el cuadrado ya elegido en la pantalla de
// acomodar la foto (ui/recorte.js); si no viene, se recorta al centro como antes.
export async function uploadMyAvatar(file, cropped){
  if (!State.sb || !State.cloudUser) return "Tenés que iniciar sesión para cambiar la foto.";
  if (!cropped && (!file || !/^image\//.test(file.type || "image/"))) return "Elegí una imagen.";
  let blob = cropped || null;
  if (!blob) try { blob = await squareJpeg(file); } catch (e) { return "No se pudo leer esa imagen. Probá con otra."; }
  const uid = State.cloudUser.id, old = State.cloudProfile && State.cloudProfile.avatar_path;
  const path = uid + "/" + Date.now() + ".jpg"; // nombre nuevo: evita que se vea la foto vieja cacheada
  const up = await State.sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (up.error) return "No se pudo subir la foto: " + storageErrorText(up.error, 2) + setupHint(up.error);
  // .select() para confirmar que se guardó: con RLS, un UPDATE que ninguna política
  // permite no da error, cambia 0 filas. Sin esto el usuario veía su foto (se muestra
  // apenas se sube) pero no quedaba en su perfil y el coach nunca la veía.
  const pr = await saveAvatarPath(path);
  if (pr.error){
    State.sb.storage.from(BUCKET).remove([path]).catch(() => {});
    return "No se pudo guardar la foto en tu perfil: " + (pr.error.message || pr.error) + setupHint(pr.error);
  }
  if (State.cloudProfile) State.cloudProfile.avatar_path = path;
  await resolveAvatars([path]);
  if (old && old !== path) State.sb.storage.from(BUCKET).remove([old]).catch(() => {});
  return "";
}

export async function removeMyAvatar(){
  if (!State.sb || !State.cloudUser || !State.cloudProfile || !State.cloudProfile.avatar_path) return "";
  const old = State.cloudProfile.avatar_path;
  const pr = await saveAvatarPath(null);
  if (pr.error) return "No se pudo quitar la foto: " + (pr.error.message || pr.error);
  State.cloudProfile.avatar_path = null;
  State.sb.storage.from(BUCKET).remove([old]).catch(() => {});
  return "";
}

// Guarda la ruta en el perfil propio. Primero con la función set_my_avatar (solo toca
// avatar_path del propio usuario, ver supabase/foto-perfil.sql); si la base todavía no
// la tiene, con un UPDATE directo, confirmando con .select() que realmente cambió la fila.
async function saveAvatarPath(path){
  const rpc = await State.sb.rpc("set_my_avatar", { p_path: path });
  if (!rpc.error) return { error: null };
  const pr = await State.sb.from("profiles").update({ avatar_path: path }).eq("id", State.cloudUser.id).select("id");
  if (!pr.error && (!pr.data || !pr.data.length)) pr.error = { message: "la base no permitió actualizar tu perfil" };
  return pr;
}

function setupHint(err){
  const m = String((err && (err.message || err.error)) || "").toLowerCase();
  return /bucket|avatar_path|column|not found|policy|row-level|permiti/.test(m)
    ? "\n\nSi es la primera vez, falta correr supabase/foto-perfil.sql en Supabase." : "";
}
