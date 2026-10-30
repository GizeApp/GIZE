// «Mi página»: el link del coach para Instagram (gize.ar/c/<alias>). La página la sirve 404.html y
// muestra su nombre, su foto (si quiere) y su código de invitación, para que quien la abre baje GIZE
// y se sume con ese código. Acá se arma desde Configuración (sección «Mi página») y se comparte desde
// Clientes (la línea debajo del código). Todo pasa por las funciones de supabase/pagina-coach.sql:
// coach_pagina_mia (cómo está) y coach_pagina_guardar (crearla o cambiarla).
//
// CoachState.pagina: undefined (todavía no se sabe) | null (no tiene página) | false (la base todavía
// no tiene la función: la sección no aparece) | { alias, activa, con_foto, pausada, cambia_desde,
// codigo, visible }. Se pide una vez por sesión.
//
// En las apps (Android e iPhone) ningún texto dice gize.ar: se ve solo el nombre del link y se
// comparte con la hoja del sistema (plugin Share), y no está «Ver mi página» (la página tiene los
// botones de las dos tiendas). Tampoco se habla de planes ni pagos.
// No aparece en el panel del gimnasio (la dueña y la administración) ni para el profe de un gimnasio
// sin alumnos propios ni plan propio (el mismo criterio que «Mi plan» en settings.js).
import { State } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { avatarHtml, avatarUrl } from '../../core/avatar.js';
import { copySvg, checkSvg } from '../../core/icons.js';
import { appNativa } from '../../core/tienda.js';
import { enMarcoGym } from '../../core/gimnasio.js';

import { CoachState } from './state.js';
import { billing } from './plan.js';
import { esProfeGym } from './gimnasio.js';
import { coachInitials } from './clientes.js';
import { renderCoach } from './index.js';

export const BASE_LINK = "https://gize.ar/c/";
const ALIAS_OK = a => /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(a) && !/[._-]{2}/.test(a);
// DD/MM en hora de Argentina, como lo escribe la base en sus mensajes.
const AR_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
const ddmm = iso => { const [, m, d] = AR_DIA.format(new Date(iso)).split("-"); return d + "/" + m; };

// Lo que se está escribiendo en la sección (no se guarda en ningún lado hasta tocar el botón).
const UI = { editando: false, alias: null, foto: true, err: "", ocupado: false };

// Quién vuelve a dibujar la Configuración (settings.js, para no importarla de vuelta).
let repintarConfig = () => {};
export const alRepintarPagina = fn => { repintarConfig = fn; };

// ¿Puede tener página? No en el panel del gimnasio ni el profe sin nada propio, y no si la base no
// tiene la función. Si todavía no se sabe, se pide (y se redibuja cuando llega).
export function paginaPosible(){
  if (enMarcoGym() || (esProfeGym() && !billing().propio)) return false;
  cargarPagina();
  return CoachState.pagina !== undefined && CoachState.pagina !== false;
}

// El link para compartir, o "" si no tiene página o hoy no se ve (para quien quiera ofrecerlo
// además del código, como «Pasar mis planillas»).
export function linkPagina(){
  const p = CoachState.pagina;
  return p && p.alias && visible(p) ? BASE_LINK + p.alias : "";
}

const visible = p => p.visible !== undefined ? !!p.visible : (p.activa && !p.pausada);
const codigo = () => CoachState.coachInvite || (CoachState.pagina && CoachState.pagina.codigo) || "";
const nombre = () => (State.cloudProfile && State.cloudProfile.full_name) || "";
const fotoPerfil = () => State.cloudProfile && State.cloudProfile.avatar_path;

// La sugerencia del nombre del link: el nombre sin acentos, en minúsculas y con guiones
// («Martín Pérez» → «martin-perez»). Si no queda un link válido, ninguna.
export function sugerirAlias(n){
  const s = String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 30).replace(/-+$/, "");
  return ALIAS_OK(s) && !s.startsWith("gize") ? s : "";
}

// ---- Lo que hay en la base ----
let deQuien = null, cargando = false, fallo = 0;
export function cargarPagina(){
  const u = State.cloudUser, p = State.cloudProfile;
  if (!State.sb || !u || !p || p.role !== "coach") return;
  if (deQuien !== u.id){ deQuien = u.id; CoachState.pagina = undefined; fallo = 0; Object.assign(UI, { editando: false, alias: null, foto: true, err: "" }); }
  // Sin señal no se insiste en cada dibujo: se vuelve a probar pasados 15 s.
  if (CoachState.pagina !== undefined || cargando || Date.now() - fallo < 15000) return;
  cargando = true;
  Promise.resolve(State.sb.rpc("coach_pagina_mia")).then(r => {
    if (deQuien !== u.id) return;
    if (r.error && !sinFuncion(r.error)){ fallo = Date.now(); return; }
    CoachState.pagina = r.error ? false : (r.data || null);
    repintar();
  }).catch(() => { fallo = Date.now(); }).finally(() => { cargando = false; });
}
// La base todavía no tiene supabase/pagina-coach.sql (o se volvió atrás): la sección no aparece.
const sinFuncion = e => /^(PGRST202|42883)$/.test(String((e && e.code) || ""));

function repintar(){
  if (!State.cloudProfile || State.cloudProfile.role !== "coach") return;
  if (CoachState.coachSel || CoachState.coachTplEdit || CoachState.coachMealEdit) return;
  if (CoachState.coachView === "settings") repintarConfig();
  else if (CoachState.coachView === "clients") renderCoach();
}

// Después de redibujar, el foco vuelve al mismo control (si sigue estando).
function enfocar(sel){
  const el = document.querySelector("#coachHost " + sel);
  if (el) try { el.focus({ preventScroll: true }); } catch (e) {}
}

// ---- Configuración → «Mi página» ----
const card = (titulo, desc, inner) => '<section class="cv-card cs-card"><h2 class="cs-h">' + titulo + '</h2>' + (desc ? '<p class="cs-sub">' + desc + '</p>' : '') + inner + '</section>';
const sw = (k, id, txt, on) => '<div class="cs-neon cpag-sw"><span id="' + id + '">' + txt + '</span><button type="button" class="cfg-switch' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '" aria-labelledby="' + id + '" data-cpag="' + k + '"><span class="cfg-switch-knob"></span></button></div>';
const sinFotoAviso = () => fotoPerfil() ? '' : '<p class="cpag-nota">Subí una foto en Perfil para que se vea. <button class="co-invite-rotate" data-coach="settings-sec" data-k="perfil">Ir a Perfil</button></p>';

// El campo del nombre del link: en la web con «gize.ar/c/» adelante; en las apps, solo el nombre.
function campo(valor){
  return '<div class="cs-field"><label for="cpagAlias">Nombre de tu link</label>' +
    '<div class="cpag-campo">' + (appNativa() ? '' : '<span class="cpag-pre" aria-hidden="true">gize.ar/c/</span>') +
    '<input id="cpagAlias" class="co-note cs-name cpag-in" data-cpag-in value="' + esc(valor || "") + '" maxlength="30" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"' +
      (UI.err ? ' aria-invalid="true" aria-describedby="cpagErr"' : ' aria-describedby="cpagTip"') + '></div>' +
    (UI.err ? '<p class="cpag-err" id="cpagErr" role="alert">' + esc(UI.err) + '</p>' : '<p class="cpag-nota" id="cpagTip">Usá el mismo que tu Instagram. Letras minúsculas y números; en el medio, punto, guion o guion bajo.</p>') + '</div>';
}

export function secPagina(){
  const p = CoachState.pagina;
  if (!p) return secCrear();
  return secVista(p) + secAjustes(p) + secLink(p);
}

function secCrear(){
  if (UI.alias == null) UI.alias = sugerirAlias(nombre());
  return card("Mi página", "Una página con tu nombre, tu foto y tu código de invitación, para poner en tu bio de Instagram o mandar por mensaje. Quien la abre baja GIZE y se suma con tu código.",
    campo(UI.alias) +
    sw("foto-nueva", "cpagFotoLbl", "Mostrar mi foto de perfil", UI.foto) + (UI.foto ? sinFotoAviso() : '') +
    '<p class="cpag-aviso">Tu nombre, tu foto y tu código de invitación se van a ver en esa página: cualquiera con el link los puede ver. La podés apagar cuando quieras.</p>' +
    '<button class="co-save-rt cs-save" data-cpag="crear"' + (UI.ocupado ? ' disabled' : '') + '>' + (UI.ocupado ? 'Creando…' : 'Crear mi página') + '</button>');
}

// Arriba: cómo se ve (sin los botones de las tiendas), el link y cómo compartirlo.
function secVista(p){
  const foto = p.con_foto && fotoPerfil() && avatarUrl(fotoPerfil());
  const cod = codigo();
  const estado = p.pausada ? '<p class="cpag-estado" role="status">GIZE pausó tu página. Escribinos si querés saber por qué.</p>'
    : !p.activa ? '<p class="cpag-estado" role="status">Tu página está apagada: quien abra el link ve que no está disponible.</p>'
    : !visible(p) ? '<p class="cpag-estado" role="status">Tu página no se ve ahora porque tu cuenta de coach no está activa.</p>' : '';
  const prev = '<div class="cpag-prev" aria-label="Así se ve tu página">' +
    (foto ? avatarHtml(fotoPerfil(), coachInitials(nombre()), 'co-avatar cs-avatar-big') : '<span class="co-avatar cs-avatar-big">' + esc(coachInitials(nombre()) || "?") + '</span>') +
    '<div class="cpag-prev-t"><b>' + esc(nombre() || "Tu nombre") + '</b><span>Entrená conmigo en GIZE</span>' +
    (cod ? '<span>Código <span class="cpag-cod">' + esc(cod) + '</span></span>' : '') + '</div></div>';
  // En la web, el link entero y «Ver mi página»; en las apps, solo el nombre del link.
  const link = appNativa() ? '<p class="cpag-link">Tu link: <b>' + esc(p.alias) + '</b></p>'
    : '<p class="cpag-link">Tu link: <b>gize.ar/c/' + esc(p.alias) + '</b></p>';
  const acts = visible(p) ? '<div class="cpag-acts">' +
      '<button class="cs-pill" data-cpag="compartir">Compartir</button>' +
      '<button class="cs-pill on" data-cpag="copiar">' + copySvg + ' Copiar link</button>' +
      '<button class="cs-pill on" data-cpag="qr">Mostrar QR</button></div>' +
      (appNativa() ? '' : '<a class="cs-link cpag-ver" href="' + esc(BASE_LINK + p.alias) + '" target="_blank" rel="noopener" data-cpag="ver"><span class="cs-row-t"><b>Ver mi página</b></span>' + IR + '</a>')
    : '';
  return card("Mi página", "Ponela en tu bio de Instagram o mandala por mensaje: quien la abre baja GIZE y se suma con tu código.", estado + prev + link + acts);
}

function secAjustes(p){
  return card("Qué se ve", "",
    sw("activa", "cpagActLbl", "Página activa", p.activa) +
    sw("foto", "cpagFotoLbl", "Mostrar mi foto", p.con_foto) + (p.con_foto ? sinFotoAviso() : '') +
    '<p class="cpag-aviso">Tu nombre, tu foto y tu código de invitación los puede ver cualquiera con el link.</p>');
}

function secLink(p){
  const regla = '<p class="cpag-nota">Durante las primeras 24 horas lo podés cambiar las veces que quieras. Después, una vez por semana, y tu link anterior sigue llevando a tu página por 90 días.</p>';
  if (UI.editando){
    return card("Cambiar el link", "", campo(UI.alias == null ? p.alias : UI.alias) + regla +
      '<div class="cpag-acts"><button class="co-save-rt cs-save" data-cpag="guardar"' + (UI.ocupado ? ' disabled' : '') + '>' + (UI.ocupado ? 'Guardando…' : 'Guardar link') + '</button>' +
      '<button class="cs-pill on" data-cpag="cancelar">Cancelar</button></div>');
  }
  if (p.cambia_desde){
    return card("Cambiar el link", "", '<p class="cpag-nota">Ya cambiaste tu link hace poco: lo vas a poder cambiar desde el ' + esc(ddmm(p.cambia_desde)) + '.</p>');
  }
  return card("Cambiar el link", "", regla + '<button class="cs-pill on" data-cpag="cambiar">Cambiar el link</button>');
}

const IR = '<svg class="cs-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

// ---- Clientes: la línea debajo del código de invitación ----
export function lineaPagina(){
  if (!paginaPosible()) return "";
  const p = CoachState.pagina;
  const abrir = t => '<button class="co-invite-rotate" data-coach="open-settings" data-sec="pagina">' + t + '</button>';
  if (!p) return '<div class="co-invite-sub cpag-linea">' + abrir("Creá tu página para Instagram ›") + '</div>';
  if (p.pausada) return '<div class="co-invite-sub cpag-linea">GIZE pausó tu página. Escribinos si querés saber por qué.</div>';
  if (!visible(p)) return '<div class="co-invite-sub cpag-linea">' + abrir(p.activa ? "Tu página no se ve ahora ›" : "Tu página está apagada ›") + '</div>';
  return '<div class="co-invite-sub cpag-linea">' + abrir("Tu página para Instagram") + ' · <button class="co-invite-rotate" data-cpag="compartir">Compartir</button></div>';
}

// ---- Acciones ----
async function guardar(alias, activa, conFoto){
  const r = await State.sb.rpc("coach_pagina_guardar", { p_alias: alias, p_activa: activa, p_con_foto: conFoto });
  if (r.error){
    const e = r.error;
    if (sinFuncion(e)){ CoachState.pagina = false; return "Por ahora no podés usar esta función."; }
    if (e.code === "P0001" && e.message) return e.message;
    return "No se pudo guardar. Revisá tu conexión y probá de nuevo.";
  }
  CoachState.pagina = r.data || null;
  return "";
}

async function crear(){
  const i = document.getElementById("cpagAlias");
  const alias = String(i ? i.value : UI.alias || "").trim().toLowerCase();
  UI.alias = alias;
  if (!alias){ UI.err = "Escribí el nombre de tu link."; repintarConfig(); enfocar("#cpagAlias"); return; }
  UI.ocupado = true; UI.err = ""; repintarConfig();
  const err = await guardar(alias, true, UI.foto);
  UI.ocupado = false;
  if (err){ UI.err = err; repintarConfig(); enfocar("#cpagAlias"); return; }
  Object.assign(UI, { alias: null, foto: true, err: "" });
  repintarConfig(); enfocar('[data-cpag="compartir"]');
}

async function cambiarLink(){
  const p = CoachState.pagina; if (!p) return;
  const i = document.getElementById("cpagAlias");
  const alias = String(i ? i.value : UI.alias || "").trim().toLowerCase();
  UI.alias = alias;
  if (!alias){ UI.err = "Escribí el nombre de tu link."; repintarConfig(); enfocar("#cpagAlias"); return; }
  if (alias === p.alias){ Object.assign(UI, { editando: false, alias: null, err: "" }); repintarConfig(); enfocar('[data-cpag="cambiar"]'); return; }
  UI.ocupado = true; UI.err = ""; repintarConfig();
  const err = await guardar(alias, null, null);
  UI.ocupado = false;
  if (err){ UI.err = err; repintarConfig(); enfocar("#cpagAlias"); return; }
  Object.assign(UI, { editando: false, alias: null, err: "" });
  repintarConfig();
  alert("Listo: tu link nuevo es " + alias + ". Acordate de cambiarlo en tu Instagram.");
}

async function interruptor(b, cual){
  const p = CoachState.pagina; if (!p || UI.ocupado) return;
  UI.ocupado = true; b.disabled = true;
  const err = await guardar(null, cual === "activa" ? !p.activa : null, cual === "foto" ? !p.con_foto : null);
  UI.ocupado = false;
  repintarConfig(); enfocar('[data-cpag="' + cual + '"]');
  // guardar() ya devuelve el aviso entero (el de la base o «No se pudo guardar. Revisá…»).
  if (err) alert(err);
}

async function copiarTexto(txt){
  try { await navigator.clipboard.writeText(txt); return true; }
  catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove();
      return ok !== false;
    } catch (e2) { return false; }
  }
}

function plugShare(){
  try { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Share; } catch (e) { return null; }
}

// «Compartir»: la hoja del sistema (en las apps, el plugin Share; en la web, la del navegador si la
// tiene). Si no hay, se copia el texto con el link.
async function compartir(){
  const p = CoachState.pagina; if (!p || !p.alias) return;
  const url = BASE_LINK + p.alias, cod = codigo();
  const text = cod ? "Entrená conmigo en GIZE. Bajate la app y sumate con mi código " + cod + ":" : "Entrená conmigo en GIZE. Bajate la app y sumate desde mi página:";
  const Sh = plugShare();
  try {
    if (Sh){ await Sh.share({ title: "Entrená conmigo en GIZE", text, url, dialogTitle: "Compartir tu página" }); return; }
    if (navigator.share){ await navigator.share({ title: "Entrená conmigo en GIZE", text, url }); return; }
  } catch (e) { if (/cancel|abort/i.test(String((e && (e.name + " " + e.message)) || e))) return; }
  if (await copiarTexto(text + " " + url)) alert("Copiamos el link de tu página con tu código. Pegalo en tu bio de Instagram o en un mensaje.");
  else if (appNativa()) alert("No se pudo copiar el link. Probá de nuevo.");
  else await pedir("Copiá este texto y compartilo:", text + " " + url, { titulo: "Tu página", ok: "Listo", cancelar: "Cerrar" });
}

async function copiarLink(b){
  const p = CoachState.pagina; if (!p || !p.alias) return;
  if (!await copiarTexto(BASE_LINK + p.alias)){ alert("No se pudo copiar el link. Probá de nuevo."); return; }
  const prev = b.innerHTML;
  b.innerHTML = checkSvg + ' ¡Copiado!'; b.classList.add("copied");
  setTimeout(() => { if (b.isConnected){ b.innerHTML = prev; b.classList.remove("copied"); } }, 1600);
}

// ---- El QR (una ventana encima, #coachPagHost) ----
let qrVolver = null;
function hostQr(){
  let h = document.getElementById("coachPagHost");
  if (!h){ h = document.createElement("div"); h.id = "coachPagHost"; document.body.appendChild(h); }
  return h;
}
function teclaQr(e){
  if (e.key === "Escape"){ e.preventDefault(); cerrarQr(); return; }
  if (e.key === "Tab"){ e.preventDefault(); const x = document.querySelector('#coachPagHost .cp-x'); if (x) x.focus(); }
}
async function abrirQr(b){
  const p = CoachState.pagina; if (!p || !p.alias) return;
  qrVolver = b;
  const h = hostQr(), cod = codigo();
  h.innerHTML = '<div class="cp-bg" data-cpag="cerrar-qr"></div><div class="cp-ccard cpag-qr-card" role="dialog" aria-modal="true" aria-labelledby="cpagQrTit">' +
    '<div class="cp-head"><div class="cp-title" id="cpagQrTit">Tu QR</div><button class="cp-x" data-cpag="cerrar-qr" aria-label="Cerrar">✕</button></div>' +
    '<p class="cs-sub">Que lo escaneen con la cámara del celular para abrir tu página.</p>' +
    '<div class="cpag-qr" role="status">Cargando…</div>' +
    (cod ? '<p class="cpag-qr-cod">o que pongan tu código <b>' + esc(cod) + '</b></p>' : '') + '</div>';
  document.addEventListener("keydown", teclaQr, true);
  const x = h.querySelector(".cp-x"); if (x) x.focus();
  // La librería del QR se pide recién ahora (screens/gym/qr.js), no al abrir el panel.
  let svg = "";
  try { svg = await (await import("../gym/qr.js")).qrSvg(BASE_LINK + p.alias, 220); } catch (e) {}
  const q = h.querySelector(".cpag-qr");
  if (q){ q.removeAttribute("role"); q.innerHTML = svg || '<span>No se pudo dibujar el QR. Probá de nuevo.</span>'; }
}
function cerrarQr(){
  document.removeEventListener("keydown", teclaQr, true);
  const h = document.getElementById("coachPagHost"); if (h) h.innerHTML = "";
  if (qrVolver && qrVolver.isConnected) try { qrVolver.focus({ preventScroll: true }); } catch (e) {}
  qrVolver = null;
}

document.addEventListener("input", e => {
  const i = e.target.closest && e.target.closest("[data-cpag-in]");
  if (i) UI.alias = i.value;
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const i = e.target.closest && e.target.closest("[data-cpag-in]"); if (!i) return;
  e.preventDefault();
  if (UI.ocupado) return;
  if (CoachState.pagina) cambiarLink(); else crear();
});

document.body.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-cpag]"); if (!b) return;
  const a = b.dataset.cpag;
  if (a === "ver") return; // el link abre la página en otra pestaña
  e.preventDefault();
  if (a === "cerrar-qr"){ cerrarQr(); return; }
  if (UI.ocupado && a !== "compartir" && a !== "copiar" && a !== "qr") return;
  if (a === "crear"){ crear(); return; }
  if (a === "foto-nueva"){ UI.foto = !UI.foto; const i = document.getElementById("cpagAlias"); if (i) UI.alias = i.value; repintarConfig(); enfocar('[data-cpag="foto-nueva"]'); return; }
  if (a === "activa" || a === "foto"){ interruptor(b, a); return; }
  if (a === "cambiar"){ Object.assign(UI, { editando: true, alias: CoachState.pagina && CoachState.pagina.alias, err: "" }); repintarConfig(); enfocar("#cpagAlias"); return; }
  if (a === "cancelar"){ Object.assign(UI, { editando: false, alias: null, err: "" }); repintarConfig(); enfocar('[data-cpag="cambiar"]'); return; }
  if (a === "guardar"){ cambiarLink(); return; }
  if (a === "compartir"){ compartir(); return; }
  if (a === "copiar"){ copiarLink(b); return; }
  if (a === "qr"){ abrirQr(b); return; }
});
