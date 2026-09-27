// Revisión de la base compartida de productos (solo administradores, ver
// supabase/productos-revision.sql). Pantalla completa encima de la app con tres listas:
//   · Pendientes: cargados por usuarios y todavía sin verificar.
//   · Reportados: alguien avisó que un dato está mal.
//   · Ocultos: los que se ocultaron (por 3 reportes o a mano).
// Cada producto muestra la foto de la tabla que subió quien lo cargó; se pueden corregir los
// datos y Verificar, Ocultar o Volver a mostrar.
import { State } from '../core/state.js';
import { esc } from '../core/utils.js';

export const AdminState = { uid: null, isAdmin: false, pending: 0, unread: 0, tab: "pendientes", items: null, err: "", urls: {} };
const TABS = [["pendientes", "Pendientes"], ["reportados", "Reportados"], ["ocultos", "Ocultos"]];
const num = v => parseFloat(String(v == null ? "" : v).replace(",", ".")) || 0;
const fmtN = v => (Math.round((Number(v) || 0) * 10) / 10).toString().replace(".", ",");

// Se fija una vez por sesión si la cuenta es administradora (y cuántos hay para revisar).
export async function checkAdmin(rerender){
  const uid = State.cloudUser && State.cloudUser.id;
  if (!uid || !State.sb){ AdminState.uid = null; AdminState.isAdmin = false; return; }
  if (AdminState.uid === uid) return;
  AdminState.uid = uid;
  try {
    const r = await State.sb.rpc("is_app_admin");
    AdminState.isAdmin = !r.error && !!r.data;
    if (AdminState.isAdmin){
      const c = await State.sb.rpc("admin_pending"); AdminState.pending = (c && c.data) || 0;
      const m = await State.sb.rpc("admin_contact_unread"); AdminState.unread = (m && !m.error && m.data) || 0; // mensajes de contacto sin leer
    }
  } catch (e) { AdminState.isAdmin = false; }
  if (AdminState.isAdmin && rerender) rerender();
}

// Botón de entrada (Ajustes del cliente y Configuración del coach).
export function adminEntry(){
  if (!AdminState.isAdmin) return "";
  return `<a class="adm-entry" href="https://gize.ar/admin/${AdminState.unread ? "#contacto" : ""}" target="_blank" rel="noopener"><span><b>Panel de administración</b><small>${AdminState.unread ? AdminState.unread + (AdminState.unread === 1 ? " mensaje de contacto sin leer" : " mensajes de contacto sin leer") : "Mensajes, resumen, usuarios, coaches y pagos, avisos y seguridad"}</small></span>${AdminState.unread ? `<i>${AdminState.unread}</i>` : ""}<em aria-hidden="true">›</em></a>
    <button class="adm-entry" data-adm="open"><span><b>Revisar productos</b><small>Base compartida de GIZE · verificá lo que cargan los usuarios</small></span>${AdminState.pending ? `<i>${AdminState.pending}</i>` : ""}<em aria-hidden="true">›</em></button>`;
}

function host(){ return document.getElementById("adminHost"); }
function paint(){
  const h = host(); if (!h) return;
  const it = AdminState.items;
  const list = it === null ? '<div class="adm-empty">Cargando…</div>'
    : AdminState.err ? `<div class="adm-empty">${esc(AdminState.err)}</div>`
    : !it.length ? '<div class="adm-empty">No hay nada para revisar acá. 🎉</div>'
    : it.map(card).join("");
  h.innerHTML = `<div class="adm">
    <div class="adm-head"><button class="form-back" data-adm="close" aria-label="Cerrar">‹</button><div class="form-title">Revisar productos</div></div>
    <div class="adm-tabs">${TABS.map(([k, l]) => `<button class="adm-tab${AdminState.tab === k ? " on" : ""}" data-adm="tab" data-v="${k}">${l}</button>`).join("")}</div>
    <div class="adm-list">${list}</div></div>`;
}
function card(p){
  const url = AdminState.urls[p.photo_path];
  const photo = p.photo_path ? (url ? `<button class="adm-photo" data-adm="zoom" data-url="${esc(url)}"><img src="${esc(url)}" alt="Tabla nutricional"></button>` : '<div class="adm-photo adm-nophoto">Cargando foto…</div>')
    : '<div class="adm-photo adm-nophoto">Sin foto<br><small>' + (p.source === "off" ? "vino de Open Food Facts" : "") + '</small></div>';
  const inp = (k, v, l, w) => `<label class="adm-f${w ? " " + w : ""}"><span>${l}</span><input data-k="${k}" value="${esc(v == null ? "" : String(v))}"${["kcal","protein","carbs","fat"].includes(k) ? ' inputmode="decimal"' : ""}></label>`;
  const kcalCalc = Math.round(num(p.protein) * 4 + num(p.carbs) * 4 + num(p.fat) * 9);
  return `<div class="adm-card" data-id="${esc(p.id)}">
    <div class="adm-top">${photo}
      <div class="adm-meta"><b>${esc(p.code || "sin código")}</b><span>${p.source === "off" ? "Open Food Facts" : "Cargado por un usuario"} · ${p.uses} uso${p.uses === 1 ? "" : "s"}</span>
        ${p.reports ? `<span class="adm-rep">⚠ ${p.reports} reporte${p.reports === 1 ? "" : "s"}${p.reasons ? ": " + esc(p.reasons) : ""}</span>` : ""}
        <span>Calorías según los macros: ${kcalCalc}</span></div></div>
    <div class="adm-grid">${inp("name", p.name, "Nombre", "wide")}${inp("brand", p.brand, "Marca", "wide")}
      ${inp("kcal", fmtN(p.kcal), "Kcal")}${inp("protein", fmtN(p.protein), "Prot.")}${inp("carbs", fmtN(p.carbs), "Carb.")}${inp("fat", fmtN(p.fat), "Grasas")}</div>
    <div class="adm-unit">Valores cada 100 ${p.unit === "ml" ? "ml" : "g"}</div>
    <div class="adm-btns">${p.hidden
      ? `<button class="ctrl ghost" data-adm="save" data-verify="0" data-hide="0">Volver a mostrar</button><button class="ctrl primary" data-adm="save" data-verify="1" data-hide="0">Corregir y verificar</button>`
      : `<button class="ctrl ghost adm-hide" data-adm="save" data-verify="0" data-hide="1">Ocultar</button><button class="ctrl primary" data-adm="save" data-verify="1" data-hide="0">✓ Verificar</button>`}</div>
  </div>`;
}

async function load(){
  AdminState.items = null; AdminState.err = ""; paint();
  try {
    const r = await State.sb.rpc("admin_products", { kind: AdminState.tab });
    if (r.error) throw r.error;
    AdminState.items = r.data || [];
  } catch (e) { AdminState.items = []; AdminState.err = "No se pudo cargar la lista. Revisá tu conexión."; }
  paint();
  // Fotos (privadas): links firmados por una hora.
  const paths = (AdminState.items || []).map(p => p.photo_path).filter(x => x && !AdminState.urls[x]);
  if (paths.length){
    try {
      const s = await State.sb.storage.from("productos").createSignedUrls(paths, 3600);
      (s.data || []).forEach(x => { if (x.signedUrl) AdminState.urls[x.path] = x.signedUrl; });
    } catch (e) {}
    paint();
  }
}

export function openAdmin(){
  let h = host();
  if (!h){ h = document.createElement("div"); h.id = "adminHost"; document.body.appendChild(h); }
  document.body.classList.add("adm-open");
  AdminState.tab = "pendientes"; load();
}
function closeAdmin(){ const h = host(); if (h) h.remove(); document.body.classList.remove("adm-open"); }

async function save(btn){
  const c = btn.closest(".adm-card"); if (!c) return;
  const v = k => { const i = c.querySelector(`[data-k="${k}"]`); return i ? i.value.trim() : ""; };
  const row = { name: v("name"), brand: v("brand"), kcal: num(v("kcal")), protein: num(v("protein")), carbs: num(v("carbs")), fat: num(v("fat")) };
  if (row.name.length < 2){ alert("Poné el nombre del producto."); return; }
  if (row.kcal > 950 || row.protein > 100 || row.carbs > 100 || row.fat > 100 || row.protein + row.carbs + row.fat > 105){ alert("Revisá los valores: son cada 100 g o ml."); return; }
  const item = (AdminState.items || []).find(p => p.id === c.dataset.id);
  btn.disabled = true;
  let r;
  try { r = await State.sb.rpc("admin_product_save", { pid: c.dataset.id, p_name: row.name, p_brand: row.brand || null, p_kcal: row.kcal,
    p_protein: row.protein, p_carbs: row.carbs, p_fat: row.fat, p_unit: item ? item.unit : "g", p_verified: btn.dataset.verify === "1", p_hidden: btn.dataset.hide === "1" }); }
  catch (e) { r = { error: e }; }
  btn.disabled = false;
  if (r.error){ alert("No se pudo guardar. Probá de nuevo."); return; }
  AdminState.items = AdminState.items.filter(p => p.id !== c.dataset.id);
  if (AdminState.tab !== "ocultos" && AdminState.pending > 0) AdminState.pending--;
  paint();
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-adm]"); if (!b) return;
  const a = b.dataset.adm;
  if (a === "open"){ openAdmin(); return; }
  if (a === "close"){ closeAdmin(); return; }
  if (a === "tab"){ AdminState.tab = b.dataset.v; load(); return; }
  if (a === "save"){ save(b); return; }
  if (a === "zoom"){ const z = document.createElement("div"); z.className = "adm-zoom"; z.innerHTML = `<img src="${esc(b.dataset.url)}" alt="Tabla nutricional">`; z.addEventListener("click", () => z.remove()); document.body.appendChild(z); return; }
});
