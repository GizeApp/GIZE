// El socio de un gimnasio en la app (etapa 1, parte 3; SPEC §1.3 y §3.2). Se carga con import() solo
// cuando hace falta (core/gimnasio.js cargarSocio): un código que resultó ser de un gimnasio, un link
// #codigo= o #unirme=, o un botón de la tarjeta «Tu gimnasio» (Entreno) o de Ajustes → Tu gimnasio
// (data-gys). Para quien no está en un gimnasio, este archivo ni se pide.
//
// Es una hoja propia (#gymSocioHost), encima de todo (también de la bienvenida), como «Bloquear»:
//   hoja      la hoja en dos partes (textos.js, con sus versiones): lo necesario para ser socio y la
//             casilla opcional «Compartir…», que siempre arranca sin marcar. Sirve para pedir sumarse
//             con el código (gym_unirse), para el link de la ficha (gym_unirse_token), para confirmar
//             (cuenta convertida o pedido hecho con la app vieja: gym_confirmar_hoja) y, sin casilla,
//             para «Qué ve el gimnasio».
//   dni       el link #unirme= de una ficha con DNI: los últimos 3 números, antes de mostrar nada.
//   enviado   «Pedido enviado a …», con [Cancelar el pedido] y la foto (opcional).
//   listo     ya es socio (aprobó solo, su mail coincidía con una ficha o el link de su ficha).
//   salir     «Salir del gimnasio», con «Seguir con mi profe como alumno propio» si corresponde.
//   vencido   el link ya no sirve.
// Las reglas (un gimnasio por persona, coach externo, el equipo no se suma, el tope de pedidos…) son
// del servidor: sus textos (P0001) se muestran tal cual. La app no muestra precios ni planes de GIZE
// en ningún lado de acá (iPhone y Android).
import { State } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { Gym, releerGym, rolGym, codigoInfo } from '../../core/gimnasio.js';
import { applyBrand, loadCloud } from '../../core/supabase.js';
import { joinMsgTienda } from '../../core/tienda.js';
import { cropAvatar } from '../../ui/recorte.js';
import { circular } from '../../ui/avisos.js';
import { renderApp } from '../../main.js';
import { VERSIONES, HOJA_NECESARIO, HOJA_COMPARTIR, HOJA_COMPARTIR_FINO, HOJA_SALIR, FOTO_GYM } from './textos.js';

const PRIVACIDAD = "https://gize.ar/privacidad/?app=1";
const NO_SALIO = "No se pudo: revisá tu conexión y probá de nuevo.";
const LINK_MUERTO = "El link ya no sirve: pedile otro al gimnasio.";

// La hoja abierta: { modo, accion ('unirse' | 'token' | 'confirmar' | 'ver'), gym {name, city}, code,
// token, dni3, pideDni, compartir, seguir, error, ocupado, resultado, listo (la promesa) }.
let S = null, cierre = 0, volver = null;

const info = () => Gym.info || {};
const ficha = () => info().ficha || null;
const solicitud = () => info().solicitud || null;
const nombreGym = () => (S && S.gym && S.gym.name) || (info().gym && info().gym.name) || "el gimnasio";
const primerNombre = n => String(n || "").trim().split(/\s+/)[0] || "";
const msgDe = e => (e && e.code === "P0001" && e.message) ? joinMsgTienda(String(e.message)) : NO_SALIO;

async function rpc(f, args){
  if (!State.sb || !State.cloudUser) return { error: { code: "red" }, msg: NO_SALIO };
  try {
    const r = await State.sb.rpc(f, args || {});
    return r.error ? { error: r.error, msg: msgDe(r.error) } : { data: r.data };
  } catch (e) { return { error: e, msg: NO_SALIO }; }
}

// El perfil y lo de la nube al día (cambió el coach: se sumó con un profe, salió del gimnasio).
async function perfilAlDia(){
  if (!State.sb || !State.cloudUser) return;
  try {
    const pr = await State.sb.from("profiles").select("*").eq("id", State.cloudUser.id).maybeSingle();
    if (pr.data) State.cloudProfile = pr.data;
    await loadCloud();
    const cn = await State.sb.rpc("my_coach_name"); State.brandName = (cn && cn.data) || "";
  } catch (e) {}
  applyBrand();
}
async function alDia(perfil){
  await releerGym();
  if (perfil) await perfilAlDia();
  renderApp();
  focoEstable();
}

// Adónde va el foco cuando lo que lo tenía ya no está: lo reemplazó renderApp (confirmar desde la
// tarjeta, salir, «Compartir») o era un botón que se deshabilitó antes de abrir la hoja («Vinculando…»
// en la bienvenida). Sin esto, el teclado y el lector de pantalla vuelven al principio de la página.
// Solo actúa si el foco quedó en el body y no hay una hoja abierta.
const FOCO_ESTABLE = ['#onbCode', '#onbTit', '#view .gym-card[data-gys]', '#gymCardT', '#cfgGym [data-gys="compartir"]', '#cfgGym .cfg-sub', '#joinCode'];
function focoEstable(sels = FOCO_ESTABLE){
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  if (document.querySelector("#gymSocioHost .gys-sheet:not(.closing)")) return;
  for (const sel of sels){
    const el = document.querySelector(sel);
    if (!el || el.disabled) continue;
    if (!/^(BUTTON|INPUT|A|SELECT|TEXTAREA)$/.test(el.tagName) && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try { el.focus({ preventScroll: true }); } catch (e) {}
    return;
  }
}

// ---- La hoja ----
function host(){
  let h = document.getElementById("gymSocioHost");
  if (!h){ h = document.createElement("div"); h.id = "gymSocioHost"; document.body.appendChild(h); }
  return h;
}
// Abre la hoja (o, si ya hay una abierta, pasa a este paso con la misma promesa). Devuelve una promesa
// con el resultado al cerrarse.
function abrir(o){
  const ya = S;
  S = Object.assign({ compartir: false, seguir: false, error: "", ocupado: false, resultado: null }, o);
  if (ya){ S.fin = ya.fin; S.p = ya.p; }
  else { S.p = new Promise(ok => { S.fin = ok; }); volver = document.activeElement; }
  cierre++;
  const h = host();
  if (!ya || !h.querySelector(".gys-sheet:not(.closing)")){
    h.innerHTML = '<div class="sheet-bg" data-gys-h="cancel"></div><div class="sheet gys-sheet" role="dialog" aria-modal="true" aria-labelledby="gysT">' + cuerpo() + '</div>';
    document.removeEventListener("keydown", alTeclado, true);
    document.addEventListener("keydown", alTeclado, true);
  } else pintar();
  enfocar();
  return S.p;
}
function pintar(){
  const c = document.querySelector("#gymSocioHost .gys-sheet");
  if (c && S) c.innerHTML = cuerpo();
}
function enfocar(){
  requestAnimationFrame(() => {
    const c = document.querySelector("#gymSocioHost .gys-sheet"); if (!c) return;
    const f = c.querySelector("#gysDni") || c.querySelector(".gys-err") && c.querySelector("[data-gys-h='ok'], [data-gys-h='seguir']") || c.querySelector(".sheet-title");
    if (f){ if (f.classList.contains("sheet-title")) f.setAttribute("tabindex", "-1"); try { f.focus({ preventScroll: true }); } catch (e) {} }
  });
}
function cerrar(){
  if (!S) return;
  const fin = S.fin, res = S.resultado;
  S = null;
  document.removeEventListener("keydown", alTeclado, true);
  const h = document.getElementById("gymSocioHost");
  const listo = () => {
    if (h) h.innerHTML = "";
    if (volver && volver.isConnected && volver !== document.body && !volver.disabled) try { volver.focus({ preventScroll: true }); } catch (e) {}
    volver = null;
    focoEstable();
  };
  const card = h && h.querySelector(".sheet"), bg = h && h.querySelector(".sheet-bg");
  if (!card || matchMedia("(prefers-reduced-motion: reduce)").matches) listo();
  else { card.classList.add("closing"); if (bg) bg.classList.add("closing"); const n = ++cierre; setTimeout(() => { if (n === cierre && !S) listo(); }, 220); }
  if (fin) fin(res);
}
function alTeclado(e){
  if (!S) return;
  if (document.querySelector(".av-bg:not(.closing), .crp")) return; // un cartel o el recorte de la foto, encima
  if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); cancelar(); }
  else if (e.key === "Tab"){
    const c = document.querySelector("#gymSocioHost .gys-sheet"); if (!c) return;
    e.preventDefault(); e.stopPropagation(); circular(c, "button:not([disabled]), input:not([disabled]), a[href]", e.shiftKey);
  }
  else if (e.key === "Enter" && e.target && e.target.id === "gysDni"){ e.preventDefault(); seguirDni(); }
}
function cancelar(){ if (S && S.ocupado) return; cerrar(); }

const btnH = (a, t, cls, extra) => '<button type="button" class="ctrl ' + (cls || "ghost") + '" data-gys-h="' + a + '"' + (extra || "") + '>' + t + '</button>';
const errHtml = () => S.error ? '<div class="gys-err rep-err" role="alert">' + esc(S.error) + '</div>' : "";

function cuerpo(){
  switch (S.modo){
    case "cargando": return '<div class="sheet-title" id="gysT">Link del gimnasio</div><p class="gys-p" aria-busy="true">Cargando…</p>' +
      '<div class="sheet-btns">' + btnH("cancel", "Cancelar") + '</div>';
    case "vencido": return '<div class="sheet-title" id="gysT">Link del gimnasio</div><p class="gys-p" role="alert">' + esc(S.texto || LINK_MUERTO) + '</p>' +
      '<div class="sheet-btns">' + btnH("cancel", "Entendido", "primary") + '</div>';
    // Sin conexión al abrir el link: el token ya salió de la dirección, así que se reintenta desde acá.
    case "sinred": return '<div class="sheet-title" id="gysT">Link del gimnasio</div><p class="gys-p" role="alert">' + esc(NO_SALIO) + '</p>' +
      '<div class="sheet-btns">' + btnH("cancel", "Cancelar") + btnH("reintentar", "Reintentar", "primary") + '</div>';
    case "dni": return dniHtml();
    case "enviado": return enviadoHtml();
    case "listo": return listoHtml();
    case "salir": return salirHtml();
    default: return hojaHtml();
  }
}

function hojaHtml(){
  const g = S.gym || {}, nom = esc(g.name || nombreGym()), ver = S.accion === "ver", conf = S.accion === "confirmar";
  let titulo, intro = "";
  if (ver) titulo = "Qué ve " + nom;
  else if (conf && S.conversion){
    titulo = "Tu coach ahora es " + nom;
    intro = '<p class="gys-p">Tu coach pasó a trabajar con «' + nom + '» y sigue siendo tu coach. Esto es lo que ve el gimnasio:</p>';
  }
  else if (conf){
    titulo = "Confirmá qué ve " + nom;
    intro = '<p class="gys-p">Te sumaste con una versión anterior de la app. Antes de seguir, mirá qué ve el gimnasio:</p>';
  }
  else titulo = "Te vas a sumar a «" + nom + "»" + (g.city ? " (" + esc(g.city) + ")" : "") + ".";
  const opcional = ver
    ? '<p class="gys-p"><b>' + esc(HOJA_COMPARTIR) + '</b> ' + ((ficha() && ficha().share_admin) ? "Lo tenés prendido." : "Lo tenés apagado.") + ' ' + esc(HOJA_COMPARTIR_FINO) + '</p>'
    : '<label class="gys-check"><input type="checkbox" data-gys-in="compartir"' + (S.compartir ? " checked" : "") + (S.ocupado ? " disabled" : "") + '>' +
        '<span><b>' + esc(HOJA_COMPARTIR) + '</b> <span class="gys-fino">' + esc(HOJA_COMPARTIR_FINO) + '</span></span></label>';
  const ok = S.accion === "unirse" ? "Pedir sumarme" : S.accion === "token" ? "Sumarme" : "Confirmar";
  const oc = S.ocupado ? (S.accion === "confirmar" ? "Confirmando…" : "Enviando…") : ok;
  return '<div class="sheet-title" id="gysT">' + titulo + '</div>' + intro +
    '<div class="gys-sec">Para ser socio:</div><ul class="gys-lista">' + HOJA_NECESARIO.map(t => '<li>' + esc(t) + '</li>').join("") + '</ul>' +
    '<div class="gys-sec">Opcional:</div>' + opcional +
    '<p class="gys-p gys-fino">' + esc(HOJA_SALIR) + '</p>' + errHtml() +
    '<div class="sheet-btns">' + (ver ? btnH("cancel", "Cerrar", "primary")
      : btnH("cancel", "Cancelar", "ghost", S.ocupado ? " disabled" : "") + btnH("ok", oc, "primary", S.ocupado ? " disabled" : "")) + '</div>' +
    '<a class="gys-link" href="' + PRIVACIDAD + '" target="_blank" rel="noopener">¿Qué datos se guardan?</a>';
}

function dniHtml(){
  const g = S.gym || {};
  return '<div class="sheet-title" id="gysT">Sumate a «' + esc(g.name || "tu gimnasio") + '»' + (g.city ? " (" + esc(g.city) + ")" : "") + '</div>' +
    '<p class="gys-p">Para confirmar que sos vos, escribí los últimos 3 números de tu DNI.</p>' +
    '<label class="gys-dni"><span class="gys-sr">Últimos 3 números de tu DNI</span><input id="gysDni" class="form-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" value="' + esc(S.dni3 || "") + '"' +
      (S.error ? ' aria-invalid="true" aria-describedby="gysErr"' : "") + '></label>' +
    (S.error ? '<div class="gys-err rep-err" id="gysErr" role="alert">' + esc(S.error) + '</div>' : "") +
    '<div class="sheet-btns">' + btnH("cancel", "Cancelar") + btnH("seguir", "Seguir", "primary") + '</div>';
}

// La foto del gimnasio (opcional al pedir sumarse): el socio la propone, el gimnasio la aprueba.
function fotoBloque(){
  const f = ficha() || solicitud();
  if (!f) return "";
  const pend = f.foto === "pendiente";
  return '<div class="gys-foto"><div class="gys-sec">Tu foto para el gimnasio (opcional)</div>' +
    '<p class="gys-p gys-fino">' + esc(FOTO_GYM) + '</p>' +
    (pend ? '<p class="gys-p gys-ok" role="status">Foto enviada: esperando que el gimnasio la apruebe.</p>'
      : '<label class="ctrl ghost gys-foto-btn">Sacar o elegir foto<input type="file" accept="image/*" data-gys-foto class="gys-foto-in"></label>') + '</div>';
}

function enviadoHtml(){
  return '<div class="sheet-title" id="gysT">Pedido enviado a ' + esc(nombreGym()) + '</div>' +
    '<p class="gys-p">Cuando te acepten, vas a ver a tu profe en la app. Mientras, seguís usando GIZE como siempre. Si cambiás de idea, lo cancelás desde Ajustes → Tu gimnasio.</p>' +
    fotoBloque() + errHtml() +
    '<div class="sheet-btns">' + btnH("cancelar-pedido", "Cancelar el pedido", "ghost", S.ocupado ? " disabled" : "") + btnH("cancel", "Listo", "primary") + '</div>';
}

function listoHtml(){
  const f = ficha(), p = f && f.profe;
  return '<div class="sheet-title" id="gysT">¡Listo! Ya sos socio de ' + esc(nombreGym()) + '</div>' +
    '<p class="gys-p">' + (p ? "Tu profe es " + esc(p.name || "") + "." : (f && f.coach_externo) ? "Tu coach sigue igual." : "Cuando el gimnasio te asigne un profe, lo vas a ver acá.") + '</p>' +
    (f && f.foto !== "ok" ? fotoBloque() : "") +
    '<div class="sheet-btns">' + btnH("cancel", "Listo", "primary") + '</div>';
}

function salirHtml(){
  const f = ficha() || {}, p = f.profe, nom = esc(nombreGym());
  return '<div class="sheet-title" id="gysT">¿Salir de ' + nom + '?</div>' +
    '<p class="gys-p">Tu ficha pasa a baja y el gimnasio deja de ver tus datos al instante. Tus entrenos, comidas y registros siguen siendo tuyos.</p>' +
    (p ? '<label class="gys-check"><input type="checkbox" data-gys-in="seguir"' + (S.seguir ? " checked" : "") + (S.ocupado ? " disabled" : "") + '>' +
          '<span><b>Seguir con ' + esc(primerNombre(p.name) || "mi profe") + ' como alumno propio</b> <span class="gys-fino">' +
          (f.origen === "conversion" ? 'Seguís con ' + esc(primerNombre(p.name) || "tu coach") + ' como hasta ahora; destildalo si querés salir también de su coaching.'
            : 'Solo si tiene lugar para sumarte. Si no lo tildás, salís sin profe.') + '</span></span></label>'
      : f.coach_externo ? '<p class="gys-p gys-fino">Tu coach de afuera del gimnasio sigue igual.</p>' : "") +
    errHtml() +
    '<div class="sheet-btns">' + btnH("cancel", "Cancelar", "ghost", S.ocupado ? " disabled" : "") +
      btnH("salir-si", S.ocupado ? "Saliendo…" : "Salir del gimnasio", "gys-peligro", S.ocupado ? " disabled" : "") + '</div>';
}

// ---- Abrir ----
// El código de un gimnasio (Ajustes, la bienvenida, el código guardado al registrarse, el link
// #codigo=): la hoja y, al aceptar, gym_unirse. Devuelve una promesa con el resultado al cerrar
// ('pendiente' | 'activo' | 'unida', o null si no pidió nada).
export async function abrirCodigo(code, gym){
  if (!gym){
    const ci = await codigoInfo(code);
    if (ci && ci.error){ alert(msgDe(ci.error)); return null; }
    if (!ci || ci.tipo !== "gym"){ alert("Ese código ya no es de un gimnasio. Revisalo en recepción."); return null; }
    gym = ci.gym;
  }
  return abrir({ modo: "hoja", accion: "unirse", code: String(code).trim().toUpperCase(), gym: gym || {} });
}

// El link #unirme=<token> de una ficha cargada por el gimnasio: primero el gimnasio y si pide DNI
// (nada de la ficha), después los últimos 3 del DNI y la hoja, y al final gym_unirse_token.
export async function abrirUnirme(token){
  const p = abrir({ modo: "cargando", accion: "token", token });
  const r = await rpc("gym_unirse_token_info", { token });
  if (!S || S.token !== token) return p;
  // Un texto del servidor (P0001) es definitivo; sin conexión (o cualquier otro error) se puede reintentar.
  if (r.error){ if (r.error.code === "P0001"){ S.modo = "vencido"; S.texto = r.msg; } else S.modo = "sinred"; pintar(); enfocar(); return p; }
  const d = r.data || {};
  if (d.estado !== "ok"){ S.modo = "vencido"; pintar(); enfocar(); return p; }
  S.gym = d.gym || {}; S.pideDni = !!d.pide_dni;
  S.modo = S.pideDni ? "dni" : "hoja";
  pintar(); enfocar();
  return p;
}

// Confirmar la hoja (terms_at vacío): cuenta convertida o pedido hecho con la app vieja.
export function abrirConfirmar(){
  const f = ficha();
  return abrir({ modo: "hoja", accion: "confirmar", gym: info().gym || {}, conversion: !!(f && f.origen === "conversion") });
}
export function abrirVerHoja(){ return abrir({ modo: "hoja", accion: "ver", gym: info().gym || {} }); }
// A una cuenta convertida (alumno del coach desde antes del gimnasio) salir no le quita su coach (§1.5,
// M2): «Seguir con…» viene tildado y lo destilda solo si quiere dejar también el coaching.
export function abrirSalir(){
  const f = ficha();
  return abrir({ modo: "salir", gym: info().gym || {}, seguir: !!(f && f.profe && f.origen === "conversion") });
}

// ---- Lo que hace cada botón de la hoja ----
async function enviar(){
  if (!S || S.ocupado) return;
  const sh = !!S.compartir, base = { hoja_version: VERSIONES.hoja, share_admin: sh, compartir_version: sh ? VERSIONES.compartir : null };
  S.ocupado = true; S.error = ""; pintar();
  let r;
  if (S.accion === "unirse") r = await rpc("gym_unirse", Object.assign({ code: S.code }, base));
  else if (S.accion === "token") r = await rpc("gym_unirse_token", Object.assign({ token: S.token, dni3: S.pideDni ? S.dni3 : null }, base));
  else r = await rpc("gym_confirmar_hoja", base);
  if (!S) return;
  S.ocupado = false;
  if (r.error){ S.error = r.msg; pintar(); enfocar(); return; }
  const d = r.data || {};
  if (S.accion === "confirmar"){ S.resultado = "confirmada"; cerrar(); await alDia(false); return; }
  if (d.gym) S.gym = Object.assign({}, S.gym, d.gym);
  const e = d.estado;
  if (e === "no_existe"){ cerrar(); alert("Código inválido. Revisalo con tu coach."); return; }
  if (e === "dni_mal"){
    const q = +d.quedan || 0;
    S.modo = "dni"; S.dni3 = ""; S.error = "Esos números no coinciden. Te " + (q === 1 ? "queda 1 intento." : "quedan " + q + " intentos.");
    pintar(); enfocar(); return;
  }
  if (e === "bloqueado" || e === "vencido"){ S.modo = "vencido"; pintar(); enfocar(); return; }
  S.resultado = e || "pendiente";
  S.ocupado = true; pintar();
  await releerGym();
  if (e === "activo" || e === "unida") await perfilAlDia();
  if (!S) { renderApp(); return; }
  S.ocupado = false;
  S.modo = e === "activo" || e === "unida" ? "listo" : "enviado";
  pintar(); enfocar();
  renderApp();
}

function seguirDni(){
  if (!S || S.modo !== "dni") return;
  const v = ((document.getElementById("gysDni") || {}).value || "").replace(/\D/g, "");
  if (!/^\d{3}$/.test(v)){ S.dni3 = v; S.error = "Escribí los últimos 3 números de tu DNI."; pintar(); enfocar(); return; }
  S.dni3 = v; S.error = ""; S.modo = "hoja"; pintar(); enfocar();
}

async function salirSi(){
  if (!S || S.ocupado) return;
  const seguir = !!S.seguir, nom = nombreGym(), f = ficha(), p = f && f.profe;
  S.ocupado = true; S.error = ""; pintar();
  const r = await rpc("gym_salir", { seguir_con_profe: seguir });
  if (!S) return;
  S.ocupado = false;
  if (r.error){ S.error = r.msg; pintar(); enfocar(); return; }
  S.resultado = "salio";
  cerrar();
  await alDia(true);
  alert((r.data && r.data.sigue_con_profe) ? "Saliste de " + nom + ". Seguís con " + (primerNombre(p && p.name) || "tu profe") + " como alumno propio." : "Saliste de " + nom + ".");
}

async function cancelarPedido(desdeHoja){
  const nom = nombreGym();
  if (!await window.confirmar("¿Cancelar el pedido a " + nom + "? Si después querés sumarte, vas a tener que pedirlo de nuevo.", { titulo: "Cancelar el pedido", ok: "Cancelar el pedido", cancelar: "Volver" })) return;
  if (desdeHoja && S){ S.ocupado = true; pintar(); }
  const r = await rpc("gym_cancelar_solicitud", {});
  if (desdeHoja && S) S.ocupado = false;
  if (r.error){ if (desdeHoja && S){ S.error = r.msg; pintar(); } else alert(r.msg); return; }
  if (desdeHoja && S){ S.resultado = null; cerrar(); }
  await alDia(false);
}

// Prender o apagar «Compartir mis registros con la administración». Se ve al instante.
async function compartir(b){
  const f = ficha(); if (!f) return;
  const on = !f.share_admin;
  if (b) b.disabled = true;
  const r = await rpc("gym_compartir_admin", { encendido: on, compartir_version: on ? VERSIONES.compartir : null });
  if (b) b.disabled = false;
  if (r.error){ alert(r.msg); return; }
  f.share_admin = !!(r.data && "share_admin" in r.data ? r.data.share_admin : on);
  // renderApp reemplaza el interruptor: el foco vuelve a él (si no, queda en el body).
  const SW = ['#cfgGym [data-gys="compartir"]'];
  renderApp(); focoEstable(SW);
  releerGym().then(() => { renderApp(); focoEstable(SW); }); // la copia guardada, al día
}

// ---- La foto del gimnasio: el socio la propone (gym-fotos/{gimnasio}/{ficha}/…) ----
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
let subiendo = false;
export async function proponerFoto(file){
  const gi = info(), f = ficha() || solicitud(), g = gi.gym && gi.gym.id;
  if (!f || !g || !State.sb || subiendo) return;
  let blob;
  try { blob = await cropAvatar(file); } catch (e) { alert("No se pudo leer esa imagen. Probá con otra."); return; }
  if (!blob) return;
  subiendo = true;
  try {
    const path = g + "/" + f.id + "/" + uuid() + ".jpg";
    const up = await State.sb.storage.from("gym-fotos").upload(path, blob, { contentType: "image/jpeg", upsert: false }).catch(e => ({ error: e }));
    if (up.error){ alert(/cupo|l[ií]mite|limit/i.test(String(up.error.message || "")) ? "Llegaste al límite de fotos por hoy. Probá mañana." : "No se pudo subir la foto. Revisá tu conexión y probá de nuevo."); return; }
    const r = await rpc("gym_foto_proponer", { path });
    if (r.error){ alert(r.msg); return; }
    f.foto = "pendiente"; f.foto_pend_path = path; if ("foto_rechazo" in f) f.foto_rechazo = null;
    if (S) pintar();
    renderApp();
    await releerGym();
    if (S) pintar();
    renderApp();
  } finally { subiendo = false; }
}

// ---- Botones (data-gys) de la tarjeta de Entreno y de Ajustes → Tu gimnasio ----
export function accion(a, b){
  if (a === "ajustes"){
    State.view = "config"; renderApp();
    requestAnimationFrame(() => { const c = document.getElementById("cfgGym"); if (c) try { c.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { c.scrollIntoView(); } });
    return;
  }
  if (a === "confirmar") return abrirConfirmar();
  if (a === "ver-hoja") return abrirVerHoja();
  if (a === "salir") return rolGym() === "pendiente" ? cancelarPedido(false) : abrirSalir();
  if (a === "cancelar-pedido") return cancelarPedido(false);
  if (a === "compartir") return compartir(b);
}

// Los toques de adentro de la hoja.
document.addEventListener("click", e => {
  const t = e.target && e.target.closest && e.target.closest("#gymSocioHost [data-gys-h]");
  if (!t || t.disabled || !S) return;
  const a = t.dataset.gysH;
  if (a === "cancel") return cancelar();
  if (a === "ok") return enviar();
  if (a === "seguir") return seguirDni();
  if (a === "reintentar") return S.token && abrirUnirme(S.token);
  if (a === "salir-si") return salirSi();
  if (a === "cancelar-pedido") return cancelarPedido(true);
});
document.addEventListener("change", e => {
  const i = e.target;
  if (!i || !i.closest || !i.closest("#gymSocioHost") || !S) return;
  if (i.dataset.gysIn === "compartir") S.compartir = i.checked;
  else if (i.dataset.gysIn === "seguir") S.seguir = i.checked;
});
document.addEventListener("input", e => {
  if (e.target && e.target.id === "gysDni" && S){ S.dni3 = e.target.value.replace(/\D/g, "").slice(0, 3); if (S.error){ S.error = ""; e.target.removeAttribute("aria-invalid"); e.target.removeAttribute("aria-describedby"); const er = document.getElementById("gysErr"); if (er) er.remove(); } }
});

// Para las pruebas y para cerrar desde afuera (Atrás de Android: ui/atras.js toca [data-gys-h="cancel"]).
export const hojaAbierta = () => !!S;
