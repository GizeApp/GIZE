// Progreso → «Competencia de pasos»: grupos de amigos que compiten por pasos en la semana (de lunes
// a domingo, hora de Argentina). Arriba de cada grupo, el campeón de la semana pasada con la copa
// dorada. Los datos salen de supabase/pasos-grupos.sql (core/grupos.js); los pasos son los del
// día de siempre (daily_logs.steps), los que suben solos de Salud / Health Connect en la app de la
// tienda (core/salud.js). No se anotan a mano en ningún lado (pedido).
//
// Las acciones van con data-pg (no data-action): se manejan acá, sin pasar por main.js.

import { trophySvg, xSvg, chevronRightSvg } from '../core/icons.js';
import { State, state } from '../core/state.js';
import { esc, today } from '../core/utils.js';
import { borrarGrupo, cambiarMiNombre, campeonGrupo, codigoValido, crearGrupo, linkInvitacion, mensajeError, misGrupos, pasosTxt,
  rankingGrupo, sacarMiembro, salirGrupo, semanaAR, textoSemana, tomarInvitacion, unirseGrupo } from '../core/grupos.js';
import { SaludState, apagarSalud, prenderSalud, saludDisponible, syncSalud } from '../core/salud.js';
import { ProgresoState } from './progreso.js';
import { saludHtml } from '../ui/saludboton.js';
import { renderApp } from '../main.js';

export const PasosState = {
  grupo: null,     // id del grupo abierto (null: la lista de grupos)
  grupos: null,    // mis grupos (null: todavía no se leyeron)
  datos: {},       // por grupo: { ranking, campeon }
  cargando: false,
  error: "",
  ocupado: false,  // crear / unirse / guardar en curso
  sacando: false,  // el dueño eligiendo a quién sacar (aparece la ✕ en cada fila)
  leido: false,    // ya se intentó leer los grupos (para el resumen de la tarjeta)
};

const grupoAbierto = () => (PasosState.grupos || []).find(g => g.id === PasosState.grupo) || null;
const aVista = () => State.view === "progreso" && ProgresoState.section === "pasos";
const puestoTxt = n => n ? n + "º" : "";

// ---- Lectura ----
export async function cargarGrupos(){
  if (!State.cloudUser) return;
  PasosState.cargando = true; PasosState.leido = true; PasosState.error = "";
  try { PasosState.grupos = await misGrupos(); }
  catch (e) { PasosState.error = mensajeError(e); console.warn("pasos grupos", e); }
  PasosState.cargando = false;
  // En el menú de Progreso: el resumen de la tarjeta.
  if (State.view === "progreso" && !ProgresoState.section){ const t = document.querySelector('[data-v="pasos"] .ptile-s'); if (t) t.textContent = pasosResumen(); }
  pintar();
}
export async function cargarGrupo(id){
  if (!State.cloudUser || !id) return;
  try {
    const [ranking, campeon] = await Promise.all([rankingGrupo(id), campeonGrupo(id)]);
    PasosState.datos[id] = { ranking, campeon };
    // Ya no soy del grupo (me sacaron o lo borraron): vuelvo a la lista.
    if (!ranking.length && PasosState.grupo === id){ PasosState.grupo = null; delete PasosState.datos[id]; cargarGrupos(); return; }
  } catch (e) { PasosState.error = mensajeError(e); console.warn("pasos ranking", e); }
  pintar();
}
function refrescar(){ cargarGrupos(); if (PasosState.grupo) cargarGrupo(PasosState.grupo); }

// Lo que llega de la base se pinta en su lugar, sin redibujar la pantalla entera (no se pierde lo
// que se está escribiendo en un campo).
function pintar(){
  if (!aVista()) return;
  const a = document.getElementById("pgData"), b = document.getElementById("pgMas");
  if (!a){ renderApp(); return; }
  a.innerHTML = PasosState.grupo ? grupoHtml() : listaHtml();
  if (b) b.innerHTML = PasosState.grupo ? grupoPieHtml() : "";
  const t = document.querySelector("#view .pg-head .form-title"); if (t) t.textContent = tituloSeccion();
}

// ---- Pantalla ----
function tituloSeccion(){ const g = grupoAbierto(); return PasosState.grupo ? (g ? g.nombre : "Grupo") : "Competencia de pasos"; }

export function renderPasosSeccion(){
  if (PasosState.grupos === null && !PasosState.cargando) setTimeout(cargarGrupos, 0);
  const back = PasosState.grupo ? 'data-pg="volver" aria-label="Volver a mis grupos"' : 'data-action="psec-close" aria-label="Volver a Progreso"';
  const body = PasosState.grupo
    ? `<div id="pgData">${grupoHtml()}</div>${hoyHtml()}<div id="pgMas">${grupoPieHtml()}</div>`
    : `${hoyHtml()}<div id="pgData">${listaHtml()}</div>${formsHtml()}`;
  return `<div class="form-head pg-head"><button class="form-back" ${back}>‹</button><div class="form-title">${esc(tituloSeccion())}</div></div>
    <div class="psec pg">${body}</div>`;
}

// Resumen de la tarjeta en el menú de Progreso.
export function pasosResumen(){
  if (!PasosState.leido && !PasosState.cargando && State.cloudUser) setTimeout(cargarGrupos, 0);
  const n = (PasosState.grupos || []).length;
  return PasosState.grupos && n ? n + (n === 1 ? " grupo" : " grupos") + " · " + pasosTxt(state.steps) + " hoy" : "Competí con tus amigos";
}

// Mis pasos de hoy: el número y de dónde salen. No se anotan a mano (pedido): en la app se cargan
// solos desde Salud de Apple / Health Connect (el botón para conectar, o ya conectado la fila con
// «Actualizar ahora» y «Desconectar»: ui/saludboton.js, el mismo de Cardio); en la web, se avisa
// que es desde la app.
function hoyHtml(){
  const n = state.stepsDate === today() ? (state.steps || 0) : 0;
  const fuente = saludDisponible() ? saludHtml()
    : '<div class="pg-note">Tus pasos se cargan solos desde la app de GIZE en tu celular, conectada a Salud de Apple o Health Connect.</div>';
  return `<div class="join-box pg-hoy">
      <div class="pg-hoy-top"><span class="join-t">Tus pasos de hoy</span><b class="pg-hoy-n" id="pgHoyN">${pasosTxt(n)}</b></div>
      ${fuente}
    </div>`;
}

function listaHtml(){
  if (!State.cloudUser) return `<div class="cal-hint">Ingresá con tu cuenta para competir con tus amigos.</div>`;
  const err = PasosState.error ? `<div class="pg-err" role="alert">${esc(PasosState.error)}</div>` : "";
  if (PasosState.grupos === null) return err || `<div class="cal-hint">Cargando tus grupos…</div>`;
  const sem = semanaAR();
  const items = PasosState.grupos.map(g => `<button class="pg-grupo" data-pg="abrir" data-id="${esc(g.id)}">
      <span class="pg-grupo-main"><span class="pg-grupo-n">${esc(g.nombre)}</span>
      <span class="pg-grupo-s">${g.miembros} ${g.miembros === 1 ? "persona" : "personas"}${g.mi_puesto ? " · vas " + puestoTxt(g.mi_puesto) : ""}</span></span>
      <span class="pg-grupo-go" aria-hidden="true">${chevronRightSvg}</span></button>`).join("");
  return `${err}<div class="pg-sec-t">Mis grupos <span>· semana del ${esc(textoSemana(sem.desde, sem.hasta))}</span></div>
    ${items || `<div class="cal-hint pg-vacio">Todavía no estás en ningún grupo. Armá uno e invitá a tus amigos, o sumate con el código que te pasaron.</div>`}`;
}

function formsHtml(){
  if (!State.cloudUser) return "";
  const dis = PasosState.ocupado ? " disabled" : "";
  return `<div class="join-box pg-form">
      <div class="join-t">Crear un grupo</div>
      <div class="join-row"><input id="pgNombre" class="form-input" maxlength="40" placeholder="Nombre del grupo" aria-label="Nombre del grupo" autocomplete="off"><button class="form-save join-btn" data-pg="crear"${dis}>Crear</button></div>
    </div>
    <div class="join-box pg-form">
      <div class="join-t">Sumarme con un código</div>
      <div class="join-row"><input id="pgCodigo" class="form-input" maxlength="12" placeholder="Código del grupo" aria-label="Código del grupo" autocomplete="off" autocapitalize="characters"><button class="form-save join-btn" data-pg="unirme"${dis}>Unirme</button></div>
    </div>
    <p class="foot">La semana va de lunes a domingo. Tus amigos ven solo tu nombre y el total de pasos de la semana.</p>`;
}

function campeonHtml(cs){
  if (!cs || !cs.length) return `<div class="pg-champ off"><span class="pg-trofeo" aria-hidden="true">${trophySvg}</span><div class="pg-champ-txt"><div class="pg-champ-t">Campeón de la semana pasada</div><div class="pg-champ-n">Todavía no hay. El lunes se corona el de esta semana.</div></div></div>`;
  // Con empate ganan todos: «Campeones de la semana pasada» y los nombres juntos.
  const nombres = cs.map(c => `<b>${esc(c.nombre)}</b>${c.soy_yo ? " (vos)" : ""}`);
  const lista = nombres.length > 1 ? nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1] : nombres[0];
  return `<div class="pg-champ"><span class="pg-trofeo" aria-hidden="true">${trophySvg}</span><div class="pg-champ-txt">
      <div class="pg-champ-t">${cs.length > 1 ? "Campeones de la semana pasada" : "Campeón de la semana pasada"}</div>
      <div class="pg-champ-n">${lista} · ${pasosTxt(cs[0].pasos)} pasos${cs.length > 1 ? " cada uno" : ""}</div></div></div>`;
}

function grupoHtml(){
  const id = PasosState.grupo, d = PasosState.datos[id], g = grupoAbierto();
  const err = PasosState.error ? `<div class="pg-err" role="alert">${esc(PasosState.error)}</div>` : "";
  if (!d) return err || `<div class="cal-hint">Cargando el ranking…</div>`;
  const r = d.ranking || [], top = Math.max(0, ...r.map(x => x.pasos || 0));
  const sem = r[0] && r[0].desde ? { desde: r[0].desde, hasta: r[0].hasta } : semanaAR();
  const soyDueno = !!(g && g.soy_dueno), campeones = new Set((d.campeon || []).map(c => c.miembro));
  const rows = r.map(x => {
    const pct = top > 0 ? Math.max(x.pasos > 0 ? 3 : 0, Math.round((x.pasos || 0) / top * 100)) : 0;
    const copa = campeones.has(x.miembro) ? `<span class="pg-copa" title="Campeón de la semana pasada" aria-label="Campeón de la semana pasada">${trophySvg}</span>` : "";
    const rm = soyDueno && PasosState.sacando && !x.soy_yo ? `<button class="pg-rm" data-pg="sacar" data-m="${esc(x.miembro)}" data-n="${esc(x.nombre)}" aria-label="Sacar a ${esc(x.nombre)} del grupo">${xSvg}</button>` : "";
    return `<div class="pg-row${x.soy_yo ? " me" : ""}"${x.soy_yo ? ' aria-current="true"' : ""}>
        <span class="pg-pos">${x.puesto || ""}</span>
        <div class="pg-mid"><div class="pg-name"><span class="pg-name-t">${esc(x.nombre)}</span>${x.soy_yo ? '<span class="pg-vos">vos</span>' : ""}${copa}</div>
          <div class="pg-bar" role="presentation"><i style="width:${pct}%"></i></div></div>
        <span class="pg-n">${pasosTxt(x.pasos)}</span>${rm}
      </div>`;
  }).join("");
  return `${err}${solo(g) ? invitarHtml(g) : ""}${campeonHtml(d.campeon)}
    <div class="pg-sec-t">Esta semana <span>· ${esc(textoSemana(sem.desde, sem.hasta))}</span></div>
    <div class="pg-rank">${rows}</div>`;
}

// El código y el botón para invitar. Recién creado (solo yo en el grupo) va arriba de todo.
const solo = g => !!g && g.miembros <= 1;
function invitarHtml(g){
  return `<div class="join-box pg-inv">
      <div class="join-t">${solo(g) ? "¡Grupo listo! Ahora invitá a tus amigos" : "Invitá a tus amigos"}</div>
      <div class="pg-inv-row"><span class="pg-code" aria-label="Código del grupo">${esc(g.codigo)}</span><button class="form-save join-btn" data-pg="invitar">Invitar</button></div>
      <div class="pg-note">Mandales el link, o que pongan el código en Progreso → Competencia de pasos.</div>
    </div>`;
}

function grupoPieHtml(){
  const g = grupoAbierto(); if (!g) return "";
  return `${solo(g) ? "" : invitarHtml(g)}
    <div class="pg-acts">
      <button class="pg-link" data-pg="nombre">Cambiar mi nombre en el grupo</button>
      ${g.soy_dueno && g.miembros > 1 ? `<button class="pg-link" data-pg="sacando">${PasosState.sacando ? "Listo, no sacar a nadie" : "Sacar a alguien del grupo"}</button>` : ""}
      <button class="pg-link" data-pg="salir">Salir del grupo</button>
      ${g.soy_dueno ? '<button class="pg-link danger" data-pg="borrar">Borrar el grupo</button>' : ""}
    </div>`;
}

// ---- Acciones ----
async function ocupado(fn){
  if (PasosState.ocupado) return;
  PasosState.ocupado = true; PasosState.error = "";
  document.querySelectorAll('#view .pg [data-pg="crear"], #view .pg [data-pg="unirme"]').forEach(b => { b.disabled = true; });
  try { await fn(); }
  catch (e) { console.warn("pasos", e); alert(mensajeError(e)); }
  finally { PasosState.ocupado = false; if (aVista()) renderApp(); }
}

export function abrirGrupo(id){
  PasosState.grupo = id; PasosState.sacando = false; PasosState.error = "";
  State.view = "progreso"; ProgresoState.section = "pasos";
  renderApp(); window.scrollTo(0, 0);
  cargarGrupo(id);
}

async function invitar(g){
  const url = linkInvitacion(g.codigo);
  const text = `Sumate a mi grupo «${g.nombre}» en GIZE y competimos por pasos. Código: ${g.codigo}`;
  const Sh = (() => { try { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.Share; } catch (e) { return null; } })();
  try {
    if (Sh){ await Sh.share({ title: "Competencia de pasos", text, url, dialogTitle: "Invitar al grupo" }); return; }
    if (navigator.share){ await navigator.share({ title: "Competencia de pasos", text, url }); return; }
  } catch (e) { if (/cancel|abort/i.test(String((e && (e.name + " " + e.message)) || e))) return; }
  try { await navigator.clipboard.writeText(text + "\n" + url); alert("Copiamos el link para invitar. Pegalo en un mensaje a tus amigos."); }
  catch (e) { prompt("Copiá este link y mandáselo a tus amigos:", url); }
}


document.body.addEventListener("click", async e => {
  const el = e.target.closest && e.target.closest("[data-pg]"); if (!el) return;
  const a = el.dataset.pg, g = grupoAbierto();
  if (a === "sacando"){ PasosState.sacando = !PasosState.sacando; pintar(); return; }
  if (a === "volver"){ PasosState.sacando = false; PasosState.grupo = null; PasosState.error = ""; renderApp(); window.scrollTo(0, 0); cargarGrupos(); return; }
  if (a === "abrir"){ abrirGrupo(el.dataset.id); return; }
  if (a === "crear"){
    const i = document.getElementById("pgNombre"), nombre = i ? i.value.trim() : "";
    if (!nombre){ alert("Ponele un nombre al grupo."); if (i) i.focus(); return; }
    await ocupado(async () => {
      const r = await crearGrupo(nombre);
      PasosState.grupos = await misGrupos();
      if (r && r.id){ PasosState.grupo = r.id; cargarGrupo(r.id); }
    });
    window.scrollTo(0, 0);
    return;
  }
  if (a === "unirme"){
    const i = document.getElementById("pgCodigo"), c = i ? i.value : "";
    if (!codigoValido(c)){ alert("Revisá el código: son 8 letras y números."); if (i) i.focus(); return; }
    await ocupado(async () => {
      const id = await unirseGrupo(c);
      PasosState.grupos = await misGrupos();
      if (id){ PasosState.grupo = id; cargarGrupo(id); }
    });
    window.scrollTo(0, 0);
    return;
  }
  if (a === "invitar" && g){ invitar(g); return; }
  if (a === "nombre" && g){
    const v = prompt("¿Con qué nombre te ven en este grupo? (vacío: tu primer nombre)", "");
    if (v === null) return;
    await ocupado(async () => { await cambiarMiNombre(g.id, v.trim().slice(0, 24)); cargarGrupo(g.id); });
    return;
  }
  if (a === "salir" && g){
    if (!confirm(`¿Salir de «${g.nombre}»?` + (g.soy_dueno && g.miembros > 1 ? " El grupo sigue y pasa a manos de quien está hace más tiempo." : ""))) return;
    await ocupado(async () => { await salirGrupo(g.id); PasosState.grupo = null; delete PasosState.datos[g.id]; PasosState.grupos = await misGrupos(); });
    return;
  }
  if (a === "borrar" && g){
    if (!confirm(`¿Borrar «${g.nombre}»? Se borra para todos los que están.`)) return;
    await ocupado(async () => { await borrarGrupo(g.id); PasosState.grupo = null; delete PasosState.datos[g.id]; PasosState.grupos = await misGrupos(); });
    return;
  }
  if (a === "sacar" && g){
    if (!confirm(`¿Sacar a ${el.dataset.n || "esta persona"} del grupo? No va a poder volver a sumarse con el código.`)) return;
    await ocupado(async () => { await sacarMiembro(g.id, el.dataset.m); PasosState.grupos = await misGrupos(); await cargarGrupo(g.id); });
    return;
  }
  if (a === "salud-on"){
    if (SaludState.connecting) return;
    SaludState.connecting = true; renderApp(); // «Conectando…»
    let msg = "";
    try { msg = await prenderSalud(); } finally { SaludState.connecting = false; }
    if (msg && msg !== "__silent") alert(msg);
    renderApp();
    refrescar();
    return;
  }
  if (a === "salud-sync"){
    const p = syncSalud(true);
    if (State.view === "cardio") renderApp(); // «Actualizando…» en la sección Pasos de Cardio
    await p; refrescar();
    if (State.view === "cardio") renderApp();
    return;
  }
  if (a === "salud-off"){ alert(apagarSalud()); renderApp(); return; }
});
// Enter en un campo hace lo de su botón.
document.body.addEventListener("keydown", e => {
  if (e.key !== "Enter" || !e.target || !e.target.id) return;
  const m = { pgNombre: "crear", pgCodigo: "unirme" }[e.target.id]; if (!m) return;
  e.preventDefault();
  const b = document.querySelector(`#view .pg [data-pg="${m}"]`); if (b) b.click();
});

// Al terminar una lectura de Salud / Health Connect: el número de hoy y el ranking al día.
// fase (core/salud.js): "subiendo" = leído pero los envíos siguen en camino (el ranking se lee
// cuando llega "subido"; si no, saldría sin lo nuevo); "subido" = ya salieron.
SaludState.onChange = fase => {
  // Cardio → «Pasos»: hoy y la semana al día (no con las ruedas del tiempo abiertas). Ahí no hay
  // ranking: «subido» no cambia nada que se vea.
  if (State.view === "cardio"){ if (fase !== "subido" && !SaludState.busy && !document.getElementById("timePick")) renderApp(); return; }
  if (!aVista()) return;
  const n = document.getElementById("pgHoyN"); if (n) n.textContent = pasosTxt(state.steps);
  if (!SaludState.busy && fase !== "subiendo") refrescar();
};

// Link de invitación (#grupo=CODIGO, ver core/grupos.js): al entrar con la cuenta, se suma y abre
// el grupo. Un coach no ve Progreso: se le avisa.
window.addEventListener("gize:login", async () => {
  const c = tomarInvitacion(); if (!c) return;
  if (State.cloudProfile && State.cloudProfile.role === "coach"){ setTimeout(() => alert("La competencia de pasos es para cuentas de alumno. Entrá con tu cuenta de alumno para sumarte al grupo."), 600); return; }
  try {
    const id = await unirseGrupo(c);
    PasosState.grupos = await misGrupos().catch(() => PasosState.grupos);
    if (id) abrirGrupo(id);
  } catch (e) { console.warn("pasos invitación", e); setTimeout(() => alert(mensajeError(e)), 600); }
});
// Al volver a la app con la sección abierta, el ranking al día.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && aVista() && State.cloudUser) refrescar(); });
