// La hoja «Entrená con …»: la invitación de un coach que llegó por su link (#coach=<alias>, ver
// core/invitacion-coach.js). Se carga con import() solo cuando hay una invitación guardada.
//
// Pide coach_pagina_ver (supabase/pagina-coach.sql) con la sesión y, según lo que contesta y la cuenta:
//   ofrecer   alumno sin coach: la foto, el nombre, qué va a ver el coach y [Sumarme con …] / [Ahora no].
//             Al aceptar corre join_coach con el código de la página y hace lo mismo que «Vincular» en
//             Ajustes (app/main.js): el perfil, loadCloud y la marca del coach.
//   listo     «¡Listo! Ya entrenás con …», y recién al cerrarla sigue la bienvenida (que ya no pide el código).
//   aviso     ya es su coach; tiene otro coach (nunca se cambia solo: primero se desvincula en Ajustes);
//             es una cuenta de coach (o su propio link); o la página ya no se ve.
//   error     sin señal: [Reintentar].
// Los errores de join_coach (cupo lleno, la cuenta del coach no activa, el equipo de un gimnasio, el socio
// con profe del gimnasio…) se muestran tal cual y, en las apps, sin hablar del plan (core/tienda.js).
// Es una hoja propia (#coachInvHost), encima de todo (también de la bienvenida), como la del socio del
// gimnasio (app/screens/gym/socio.js). Se cierre como se cierre, la invitación se borra.
// No muestra nada que venga escrito en el link: solo lo que devuelve la base. Sin precios ni planes.
import { State } from '../core/state.js';
import { esc } from '../core/utils.js';
import { avatarHtml, resolveAvatars } from '../core/avatar.js';
import { joinMsgTienda } from '../core/tienda.js';
import { Gym, esSocioGym, releerGym, rolGym } from '../core/gimnasio.js';
import { applyBrand, loadCloud } from '../core/supabase.js';
import { olvidarInvitacionCoach } from '../core/invitacion-coach.js';
import { circular } from './avisos.js';
import { renderApp } from '../main.js';

const NO_SALIO = "No se pudo: revisá tu conexión y probá de nuevo.";
// La base todavía no tiene supabase/pagina-coach.sql (o se volvió atrás), o GIZE apagó las páginas
// sacándole el permiso a coach_pagina_ver (42501, como dice ese archivo): no es la señal.
const sinFuncion = e => /^(PGRST202|42883|42501)$/.test(String((e && e.code) || ""));
const primerNombre = n => String(n || "").trim().split(/\s+/)[0] || "";
const iniciales = n => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() : ""; };
// El socio con un profe del gimnasio: lo deja en Ajustes → Tu gimnasio, y eso lo explica join_coach.
const profeDelGym = () => { const f = rolGym() === "socio" && Gym.info && Gym.info.ficha; return !!(f && f.profe && !f.coach_externo); };

// La hoja abierta: { modo, alias, datos (lo de coach_pagina_ver), titulo, texto, error, ocupado, fin, p }.
let S = null, cierre = 0, volver = null;

function host(){
  let h = document.getElementById("coachInvHost");
  if (!h){ h = document.createElement("div"); h.id = "coachInvHost"; document.body.appendChild(h); }
  return h;
}

// Abre la hoja con la invitación de ese link. Devuelve una promesa que se cumple al cerrarla.
export function abrirInvitacionCoach(alias){
  if (S) return S.p;
  S = { modo: "cargando", alias, datos: null, titulo: "", texto: "", error: "", ocupado: false };
  S.p = new Promise(ok => { S.fin = ok; });
  volver = document.activeElement;
  cierre++;
  host().innerHTML = '<div class="sheet-bg" data-cinv="fondo"></div><div class="sheet cinv-sheet" role="dialog" aria-modal="true" aria-labelledby="cinvT">' + cuerpo() + '</div>';
  document.removeEventListener("keydown", alTeclado, true);
  document.addEventListener("keydown", alTeclado, true);
  enfocar();
  cargar();
  return S.p;
}

async function cargar(){
  const s = S; if (!s) return;
  s.modo = "cargando"; s.error = ""; pintar();
  let r;
  try { r = State.sb ? await State.sb.rpc("coach_pagina_ver", { p_alias: s.alias }) : { error: { code: "red" } }; }
  catch (e) { r = { error: e }; }
  if (S !== s) return;
  if (r.error && !sinFuncion(r.error)){ s.modo = "error"; pintar(); return; }
  const d = !r.error && r.data && typeof r.data === "object" && r.data.codigo ? r.data : null;
  if (!d) return aviso("Esta invitación ya no está disponible", "Pedile a tu coach su código para sumarte en GIZE.");
  s.datos = d;
  const p = State.cloudProfile || {}, corto = primerNombre(d.nombre) || "tu coach";
  if (d.soy_yo) return aviso("Este es tu link", "Compartilo para que tus alumnos se sumen.");
  if (p.role === "coach") return aviso("Este link es para alumnos", "Tu cuenta es de coach, así que no se puede sumar con otro coach.");
  if (d.es_mi_coach) return aviso("Ya entrenás con " + corto, "No hace falta hacer nada más.");
  if (p.coach_id && !profeDelGym()) return aviso("Ya entrenás con otro coach", "Para sumarte con " + corto + ", primero desvinculate en Ajustes → Tu coach.");
  if (d.foto) await resolveAvatars([d.foto]).catch(() => false);
  if (S !== s) return;
  s.modo = "ofrecer"; pintar();
}
function aviso(titulo, texto){
  if (!S) return;
  Object.assign(S, { modo: "aviso", titulo, texto });
  pintar();
}

// [Sumarme con …]: join_coach con el código de la página, y todo al día como «Vincular» en Ajustes.
async function aceptar(){
  const s = S;
  if (!s || s.modo !== "ofrecer" || s.ocupado) return;
  s.ocupado = true; s.error = ""; pintar();
  let msg = "";
  try {
    const r = await State.sb.rpc("join_coach", { code: s.datos.codigo });
    if (r.data === true) await alDia();
    else if (r.error && r.error.code === "P0001" && r.error.message) msg = joinMsgTienda(String(r.error.message));
    else msg = r.error ? NO_SALIO : "No pudimos sumarte con este link. Pedile a tu coach su código y ponelo en Ajustes.";
  } catch (e) { msg = NO_SALIO; }
  if (S !== s) return;
  s.ocupado = false;
  if (msg){ s.error = msg; pintar(); return; }
  s.modo = "listo"; pintar();
}
async function alDia(){
  try {
    const pr = await State.sb.from("profiles").select("*").eq("id", State.cloudUser.id).maybeSingle();
    if (pr.data) State.cloudProfile = pr.data;
    await loadCloud();
    if (esSocioGym()) await releerGym();
    const cn = await State.sb.rpc("my_coach_name"); State.brandName = (cn && cn.data) || "";
  } catch (e) { console.warn("invitación del coach: al día", e); }
  applyBrand();
  renderApp(); // la app de abajo ya queda con el coach
}

// ---- Cómo se ve ----
const btn = (a, t, cls, extra) => '<button type="button" class="ctrl ' + (cls || "ghost") + '" data-cinv="' + a + '"' + (extra || "") + '>' + t + '</button>';
function foto(d){
  const ini = iniciales(d.nombre);
  if (!d.foto && !ini) return "";
  return '<div class="cinv-cara">' + avatarHtml(d.foto, ini, "cinv-foto") + '</div>';
}
function cuerpo(){
  const d = S.datos || {}, nom = String(d.nombre || "").trim(), corto = primerNombre(nom);
  switch (S.modo){
    case "cargando": return '<div class="sheet-title" id="cinvT">Invitación de tu coach</div><p class="cinv-p" aria-busy="true">Cargando…</p>' +
      '<div class="sheet-btns">' + btn("no", "Ahora no") + '</div>';
    case "error": return '<div class="sheet-title" id="cinvT">Invitación de tu coach</div><p class="cinv-p" role="alert">' + esc(NO_SALIO) + '</p>' +
      '<div class="sheet-btns">' + btn("no", "Ahora no") + btn("reintentar", "Reintentar", "primary") + '</div>';
    case "aviso": return '<div class="sheet-title" id="cinvT">' + esc(S.titulo) + '</div><p class="cinv-p">' + esc(S.texto) + '</p>' +
      '<div class="sheet-btns">' + btn("no", "Entendido", "primary") + '</div>';
    case "listo": return foto(d) + '<div class="sheet-title" id="cinvT">¡Listo! Ya entrenás con ' + esc(corto || "tu coach") + '.</div>' +
      '<p class="cinv-p">' + (corto ? esc(corto) + " ya puede armarte la rutina." : "Tu coach ya puede armarte la rutina.") + '</p>' +
      '<div class="sheet-btns">' + btn("no", "Seguir", "primary") + '</div>';
    default: {
      const oc = S.ocupado ? " disabled" : "";
      return foto(d) + '<div class="sheet-title" id="cinvT">Entrená con ' + esc(nom || "tu coach") + '</div>' +
        '<p class="cinv-p">Al sumarte, ' + esc(corto || "tu coach") + ' va a ver tus entrenos, tu comida y tu progreso, y te va a armar la rutina. Lo podés dejar cuando quieras en Ajustes.</p>' +
        (S.error ? '<div class="cinv-err rep-err" id="cinvErr" role="alert">' + esc(S.error) + '</div>' : "") +
        '<div class="sheet-btns">' + btn("no", "Ahora no", "ghost", oc) + btn("si", S.ocupado ? "Sumando…" : "Sumarme con " + esc(corto || "tu coach"), "primary", oc) + '</div>';
    }
  }
}
function pintar(){
  const c = document.querySelector("#coachInvHost .cinv-sheet");
  if (!c || !S) return;
  c.innerHTML = cuerpo();
  enfocar();
}
// El foco va al título (lo lee el lector de pantalla); con un error, al botón para volver a probar.
function enfocar(){
  requestAnimationFrame(() => {
    const c = document.querySelector("#coachInvHost .cinv-sheet:not(.closing)"); if (!c || !S) return;
    const f = (S.error && !S.ocupado && c.querySelector('[data-cinv="si"]')) || c.querySelector(".sheet-title");
    if (!f) return;
    if (f.classList.contains("sheet-title")) f.setAttribute("tabindex", "-1");
    try { f.focus({ preventScroll: true }); } catch (e) {}
  });
}

function cerrar(){
  if (!S) return;
  const fin = S.fin;
  S = null;
  olvidarInvitacionCoach();
  document.removeEventListener("keydown", alTeclado, true);
  const h = document.getElementById("coachInvHost");
  const listo = () => {
    if (h) h.innerHTML = "";
    if (volver && volver.isConnected && volver !== document.body && !volver.disabled) try { volver.focus({ preventScroll: true }); } catch (e) {}
    volver = null;
  };
  const card = h && h.querySelector(".sheet"), bg = h && h.querySelector(".sheet-bg");
  if (!card || matchMedia("(prefers-reduced-motion: reduce)").matches) listo();
  else { card.classList.add("closing"); if (bg) bg.classList.add("closing"); const n = ++cierre; setTimeout(() => { if (n === cierre && !S) listo(); }, 220); }
  if (fin) fin();
}
// Mientras se suma no se cierra: la base pudo haberlo vinculado igual.
function cancelar(){ if (S && !S.ocupado) cerrar(); }
function alTeclado(e){
  if (!S) return;
  if (document.querySelector(".av-bg:not(.closing)")) return; // un cartel, encima
  if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); cancelar(); }
  else if (e.key === "Tab"){
    const c = document.querySelector("#coachInvHost .cinv-sheet"); if (!c) return;
    e.preventDefault(); e.stopPropagation(); circular(c, "button:not([disabled])", e.shiftKey);
  }
}

// Los toques de adentro de la hoja. El «Atrás» de Android toca [data-cinv="no"] (ui/atras.js).
document.addEventListener("click", e => {
  const b = e.target && e.target.closest && e.target.closest("#coachInvHost [data-cinv]");
  if (!b || b.disabled || !S) return;
  const a = b.dataset.cinv;
  if (a === "no" || a === "fondo") return cancelar();
  if (a === "si") return aceptar();
  if (a === "reintentar") return cargar();
});

// Para las pruebas.
export const hojaCoachAbierta = () => !!S;
