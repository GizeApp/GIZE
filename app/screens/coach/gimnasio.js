// Lo del gimnasio en el panel de coach (etapa 1, parte 4; SPEC §3.1). El profe de un gimnasio usa el
// mismo panel de hoy con estos cambios, todos a partir de mi_gimnasio() (core/gimnasio.js):
//   · el chip «Gimnasio Fuerza» en la barra;
//   · Clientes en dos grupos, «Socios de Gimnasio Fuerza» (mi_gimnasio().mis_socios) y «Alumnos
//     propios», cuando tiene de los dos (la lista sigue saliendo de profiles.coach_id = yo);
//   · la tarjeta «Gimnasio» en la ficha de un socio (gym_ficha_profe: estado, semáforo sin montos,
//     apto médico y últimos ingresos) y «Dejar de ser su profe» (gym_dejar_socio) en lugar de
//     «Desvincular»: el socio sigue en el gimnasio, sin profe;
//   · la caja del código con el del gimnasio primero; el personal, solo con alumnos propios o un plan
//     propio (core: billing().propio en plan.js);
//   · los carteles de gracia y de pausa del gimnasio, con el mismo texto en la web, Android e iPhone
//     (sin planes ni precios);
//   · «Recepción», si el gimnasio prendió «Los profes pueden abrir la recepción» (la recepción se carga
//     con import() recién al abrirla: app/screens/gym/recepcion.js);
//   · «Clases» (etapa 3): sus clases de la semana con la lista y el presente (app/screens/gym/clases.js,
//     también con import() recién al abrirla).
// La dueña y la administración con cuenta de coach («Como profe → Mis alumnos» del panel del gimnasio)
// también ven los dos grupos y la tarjeta de sus socios asignados. Para un coach que no está en un
// gimnasio (Gym.info null) nada de esto se dibuja ni se pide: todo devuelve "" o null.
import { State } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { copySvg } from '../../core/icons.js';
import { appNativa } from '../../core/tienda.js';
import { Gym, rolGym, releerGym } from '../../core/gimnasio.js';
import { CoachState } from './state.js';
import { renderCoach, clientUnsaved, tplDirty } from './index.js';

const info = () => Gym.info || {};
// En el equipo de un gimnasio con cuenta de coach (atiende socios).
export const enGym = () => !!(info().gym && ["owner", "admin", "profe"].includes(rolGym()));
// Profe del gimnasio en su panel de coach (la dueña y la administración usan el panel del gimnasio).
export const esProfeGym = () => rolGym() === "profe" && !!info().gym;
export const nombreGym = () => (info().gym && info().gym.name) || "tu gimnasio";
const misSocios = () => new Set(info().mis_socios || []);
export const esSocioGym = id => !!id && enGym() && misSocios().has(id);
// Los alumnos propios del profe (los de la lista que no son socios del gimnasio que atiende).
export function propios(){ const s = misSocios(); return CoachState.coachClients.filter(c => !s.has(c.id)); }
// El acceso del profe a los socios: activo, en gracia (plan del gimnasio vencido hace menos de 5 días)
// o pausado (de ahí en adelante).
export function accesoGym(){
  if (!esProfeGym()) return "activo";
  const e = (info().plan || {}).estado;
  return e === "gracia" ? "gracia" : e === "operativo" || e === "liberado" ? "pausado" : "activo";
}

// Día y mes en hora de Argentina («8/11»).
const AR = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric" });
const dm = iso => iso ? AR.format(new Date(iso)) : "";
const AR_HORA = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
const AR_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
function cuando(iso){
  const n = Math.round((new Date(AR_DIA.format(new Date()) + "T00:00:00Z") - new Date(AR_DIA.format(new Date(iso)) + "T00:00:00Z")) / 864e5);
  return n <= 0 ? "Hoy " + AR_HORA.format(new Date(iso)) : n === 1 ? "Ayer " + AR_HORA.format(new Date(iso)) : "Hace " + n + " días";
}
const fechaLarga = ymd => { if (!ymd) return ""; const [y, m, d] = String(ymd).slice(0, 10).split("-"); return d + "/" + m + "/" + y.slice(2); };

// Los estilos del gimnasio (css/screens/gym.css), solo para quien está en uno.
export function cssGym(){
  if (!enGym() || document.querySelector('link[data-gym-css]')) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/screens/gym.css"; l.setAttribute("data-gym-css", "1");
  document.head.appendChild(l);
}

// ---- Barra ----
const icoGym = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>';
export function chipGym(){
  if (!esProfeGym()) return "";
  return '<div class="cv-gymchip" title="Sos profe de ' + esc(nombreGym()) + '">' + icoGym + '<span>' + esc(nombreGym()) + '</span></div>';
}
// «Recepción» en la barra: solo con el interruptor del gimnasio prendido.
export const puedeRecepcion = () => esProfeGym() && !!(info().settings || {}).profes_recepcion;
const icoRec = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h18M5 10v10M19 10v10M8 6h8l1 4H7z"/></svg>';
export function botonRecepcion(active){
  if (!puedeRecepcion()) return "";
  const on = active === "gym-recepcion";
  return '<button class="cv-util-i' + (on ? ' on' : '') + '" data-coach="gym-recepcion"' + (on ? ' aria-current="page"' : '') + ' title="Recepción de ' + esc(nombreGym()) + '">' + icoRec + '<span>Recepción</span></button>';
}

// «Clases» en la barra: el profe ve las clases que tiene asignadas (si no tiene, lo dice la pantalla).
const icoClases = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h2M14 13.5h2M8 17h2"/></svg>';
export function botonClases(active){
  if (!esProfeGym()) return "";
  const on = active === "gym-clases";
  return '<button class="cv-util-i' + (on ? ' on' : '') + '" data-coach="gym-clases"' + (on ? ' aria-current="page"' : '') + ' title="Tus clases en ' + esc(nombreGym()) + '">' + icoClases + '<span>Clases</span></button>';
}

// ---- Carteles del gimnasio (iguales en todas las plataformas: sin planes, precios ni «renovar») ----
export function cartelGym(){
  const a = accesoGym();
  if (a === "gracia") return '<div class="gy-cartel warn cv-gymcartel" role="status"><span>Avisá a la administración del gimnasio: tu acceso a los socios se pausa el ' + esc(dm((info().plan || {}).pausa_profes_el)) + '.</span></div>';
  if (a === "pausado") return '<div class="gy-cartel bad cv-gymcartel" role="status"><span>El acceso del gimnasio está pausado. Hablá con la administración.</span></div>';
  return "";
}
// Los alumnos propios con el plan propio del profe vencido (el panel sigue, por el gimnasio): en las
// apps, sin nombrar el plan.
export function notaPropios(activo){
  if (!esProfeGym() || activo || !propios().length) return "";
  return '<div class="gy-cartel warn cv-gymcartel" role="note"><span>' + (appNativa()
    ? "Tu cuenta de coach no está activa: por ahora no podés ver a tus alumnos propios. Tus socios del gimnasio siguen igual."
    : "Tu plan de coach venció: tus alumnos propios vuelven cuando lo renueves. Tus socios del gimnasio siguen igual.") + '</span>' +
    (appNativa() ? '' : '<button class="cv-link" data-plan="open">Mi plan</button>') + '</div>';
}

// ---- Clientes en dos grupos ----
// null: una sola lista, como hoy (sin gimnasio, o todos del mismo grupo).
export function grupos(list){
  if (!enGym()) return null;
  const s = misSocios(), gym = list.filter(c => s.has(c.id)), own = list.filter(c => !s.has(c.id));
  if (!gym.length || !own.length) return null;
  return [{ k: "gym", t: "Socios de " + nombreGym(), list: gym }, { k: "propios", t: "Alumnos propios", list: own }];
}

// ---- Caja del código: el del gimnasio primero ----
// personal: la caja de hoy con su código (solo si tiene alumnos propios o un plan propio; si no, "").
export function inviteGym(personal){
  const pl = info().plan || {}, code = info().codigo || "";
  const caja = pl.cupo_lleno
    ? '<div class="co-invite co-invite-full cv-gyminv"><b>El gimnasio no puede sumar socios en este momento.</b><div class="co-invite-sub">Si alguien quiere sumarse, avisale a la administración.</div></div>'
    : '<div class="co-invite cv-gyminv">Código de ' + esc(nombreGym()) + '<br><span class="co-code">' + esc(code || "—") + '</span>' +
      (code ? '<button class="co-copy-btn co-invite-copy" data-coach="copy-gym-code">' + copySvg + ' Copiar código</button>' : '') +
      '<div class="co-invite-sub">Para los socios nuevos: lo ponen en la app y piden sumarse. El gimnasio los aprueba y les asigna profe.</div></div>';
  return caja + (personal || "");
}

// ---- Tarjeta «Gimnasio» de la ficha del socio ----
// d.gymF: undefined (sin pedir), { cargando }, { error } o lo que devuelve gym_ficha_profe (null: no
// es un socio que atiende).
export function cargarFichaGym(d){
  if (!d || !d.id || d.lectura || d.gymF !== undefined || !esSocioGym(d.id) || !State.sb) return;
  d.gymF = { cargando: true };
  Promise.resolve(State.sb.rpc("gym_ficha_profe", { socio: d.id })).then(r => {
    if (CoachState.coachData !== d) return;
    d.gymF = r.error ? { error: r.error.code === "P0001" && r.error.message ? r.error.message : "No se pudo leer: revisá tu conexión." } : (r.data || null);
    renderCoach();
  }, () => { if (CoachState.coachData === d){ d.gymF = { error: "No se pudo leer: revisá tu conexión." }; renderCoach(); } });
}
export const conTarjetaGym = d => !!(d && !d.lectura && esSocioGym(d.id));
export function tileGym(d){
  const f = d.gymF;
  if (!f || f.cargando) return "Cargando…";
  if (f.error) return f.error;
  const u = f.ingresos && f.ingresos[0];
  return [f.motivo || "—", f.apto_vencido ? "apto médico vencido" : "", u ? "último ingreso " + cuando(u.at).toLowerCase() : "sin ingresos"].filter(Boolean).join(" · ");
}
const RES = { ok: "", cuota_vencida: " · con la cuota vencida", pausado: " · estaba pausado", baja: " · estaba de baja", visita: " · visita", rechazado: " · todavía no era socio" };
export function seccionGym(d){
  const f = d.gymF;
  if (!f || f.cargando) return '<div class="cal-hint">Cargando…</div>';
  if (f.error) return '<div class="gy-cartel bad" role="alert"><span>' + esc(f.error) + '</span></div>';
  const sem = '<span class="gy-sem ' + esc(f.semaforo || "gris") + '"><i aria-hidden="true"></i>' + esc(f.motivo || "—") + '</span>';
  const apto = !f.apto_medico_vence ? '<span class="gy-mut">Sin cargar</span>'
    : f.apto_vencido ? '<span class="gy-ambar">Vencido el ' + esc(fechaLarga(f.apto_medico_vence)) + '</span>' : 'Vence el ' + esc(fechaLarga(f.apto_medico_vence));
  const ing = (f.ingresos || []).length ? '<ul class="gy-ul cv-gym-ing">' + f.ingresos.map(e => '<li>' + esc(cuando(e.at)) + esc(RES[e.resultado] || "") + '</li>').join("") + '</ul>' : '<span class="gy-mut">Todavía no registró ingresos.</span>';
  return '<div class="cv-card gy-sec cv-gymcard">' +
    '<div class="gy-kv"><span>En ' + esc(nombreGym()) + '</span><div>' + sem + '</div></div>' +
    '<div class="gy-kv"><span>Apto médico</span><div>' + apto + '</div></div>' +
    '<div class="gy-kv"><span>Socio desde</span><div>' + esc(fechaLarga(f.alta)) + '</div></div>' +
    '<div class="gy-kv"><span>Últimos ingresos</span><div>' + ing + '</div></div>' +
    '<p class="gy-fino">Lo carga el gimnasio. Ves si la cuota está al día; los pagos y los datos de contacto los ve la administración.</p></div>';
}

// ---- La recepción, para el profe (carga diferida) ----
let rec = null, cargandoRec = null;
function cargarRecepcion(){
  if (rec) return Promise.resolve(rec);
  if (!cargandoRec) cargandoRec = import("../gym/recepcion.js").then(m => { rec = m; m.alRepintar(() => renderCoach()); return m; }, e => { console.error("recepción", e); cargandoRec = null; return null; });
  return cargandoRec;
}
export function vistaRecepcion(pageHead){
  const head = pageHead("Recepción");
  if (!puedeRecepcion()) return head + '<div class="cal-hint">La recepción no está abierta para los profes de ' + esc(nombreGym()) + '.</div>';
  if (!rec){ cargarRecepcion().then(m => { if (m) renderCoach(); }); return head + '<div class="cal-hint">Cargando…</div>'; }
  return head + '<p class="gy-fino cv-gym-rec-sub">Buscá por nombre o DNI, mirá la foto y registrá el ingreso en ' + esc(nombreGym()) + '.</p>' + rec.renderRecepcion({ altas: false });
}
// ---- Las clases, para el profe (carga diferida) ----
let cla = null, cargandoCla = null;
function cargarClasesProfe(){
  if (cla) return Promise.resolve(cla);
  if (!cargandoCla) cargandoCla = import("../gym/clases.js").then(m => { cla = m; m.alRepintar(() => { if (CoachState.coachView === "gym-clases") renderCoach(); }); return m; },
    e => { console.error("clases", e); cargandoCla = null; return null; });
  return cargandoCla;
}
export function vistaClases(pageHead){
  const head = pageHead("Clases");
  if (!esProfeGym()) return head;
  if (!cla){ cargarClasesProfe().then(m => { if (m){ m.cargarClases({ profe: true }); renderCoach(); } }); return head + '<div class="cal-hint">Cargando…</div>'; }
  return head + '<p class="gy-fino cv-gym-rec-sub">Tus clases en ' + esc(nombreGym()) + ': quién reservó, quién espera y el presente.</p>' + cla.renderClases({ profe: true });
}

// El buscador de la recepción no pierde el foco cuando el panel se redibuja.
export function focoRec(){
  const a = document.activeElement;
  return a && a.matches && a.matches("#coachHost input[data-rec-q]") ? { ini: a.selectionStart, fin: a.selectionEnd } : null;
}
export function volverFocoRec(f){
  if (!f) return;
  const i = document.querySelector("#coachHost input[data-rec-q]"); if (!i) return;
  i.focus({ preventScroll: true }); try { i.setSelectionRange(f.ini, f.fin); } catch (e) {}
}

// La lista de clientes se volvió a leer: mis_socios también (el gimnasio le pudo asignar o sacar socios).
export function refrescarGym(){ if (esProfeGym()) releerGym().then(() => renderCoach()); }

// ---- Acciones (data-coach; main.js no las conoce) ----
async function copiar(txt){
  try { await navigator.clipboard.writeText(txt); return true; }
  catch (e) {
    try { const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; }
    catch (e2) { return false; }
  }
}
async function dejar(b){
  const d = CoachState.coachData; if (!d || !d.id || !esSocioGym(d.id)) return;
  const nm = d.name || "este socio", gym = nombreGym();
  if (!await confirmar("¿Dejar de ser el profe de " + nm + "?\n\n" + nm + " sigue en " + gym + ", sin profe: la administración le asigna otro. Dejás de ver sus entrenos, sus registros y su chat; " + nm + " no pierde nada.", { ok: "Dejar de ser su profe" })) return;
  b.disabled = true;
  const err = e => e && e.code === "P0001" && e.message ? e.message : "No se pudo: revisá tu conexión y probá de nuevo.";
  try {
    let ficha = d.gymF && d.gymF.ficha;
    if (!ficha){
      const r0 = await State.sb.rpc("gym_ficha_profe", { socio: d.id });
      if (r0.error || !r0.data){ alert(r0.error ? err(r0.error) : "Ya no sos el profe de " + nm + "."); b.disabled = false; return; }
      ficha = r0.data.ficha;
    }
    const r = await State.sb.rpc("gym_dejar_socio", { ficha });
    if (r.error){ alert(err(r.error)); b.disabled = false; return; }
  } catch (e) { alert(err(null)); b.disabled = false; return; }
  CoachState.coachClients = CoachState.coachClients.filter(c => c.id !== d.id);
  if (Gym.info) Gym.info.mis_socios = (Gym.info.mis_socios || []).filter(x => x !== d.id);
  CoachState.coachSel = null; CoachState.coachData = null;
  renderCoach();
  releerGym().then(() => renderCoach());
  alert("Listo: " + nm + " sigue en " + gym + ", sin profe. La administración le asigna otro.");
}
try {
  document.addEventListener("click", async e => {
    const b = e.target.closest && e.target.closest('[data-coach="copy-gym-code"], [data-coach="gym-dejar"], [data-coach="gym-recepcion"], [data-coach="gym-clases"]');
    if (!b || b.disabled || !enGym()) return;
    const a = b.dataset.coach;
    if (a === "copy-gym-code"){
      const code = info().codigo || ""; if (!code) return;
      if (!await copiar(code)){ alert("No se pudo copiar. Código: " + code); return; }
      const t = b.innerHTML; b.innerHTML = "¡Copiado!"; b.classList.add("copied");
      setTimeout(() => { if (b.isConnected){ b.innerHTML = t; b.classList.remove("copied"); } }, 1600);
      return;
    }
    if (a === "gym-dejar") return dejar(b);
    if (a === "gym-clases"){
      if (!esProfeGym()) return;
      const sin = (CoachState.coachSel && clientUnsaved()) || (tplDirty() && "la rutina") || "";
      if (sin && !await confirmar("Tenés cambios sin guardar en " + sin + ". ¿Salir igual y perderlos?")) return;
      CoachState.coachView = "gym-clases"; CoachState.coachSel = null; CoachState.coachData = null; CoachState.coachTplEdit = null; CoachState.coachMealEdit = null;
      renderCoach();
      const m = await cargarClasesProfe();
      if (m){ m.cargarClases({ profe: true }); renderCoach(); }
      return;
    }
    if (a === "gym-recepcion"){
      if (!puedeRecepcion()) return;
      const sin = (CoachState.coachSel && clientUnsaved()) || (tplDirty() && "la rutina") || "";
      if (sin && !await confirmar("Tenés cambios sin guardar en " + sin + ". ¿Salir igual y perderlos?")) return;
      CoachState.coachView = "gym-recepcion"; CoachState.coachSel = null; CoachState.coachData = null; CoachState.coachTplEdit = null; CoachState.coachMealEdit = null;
      renderCoach();
      const m = await cargarRecepcion();
      if (m){ renderCoach(); const i = document.querySelector("#coachHost input[data-rec-q]"); if (i) i.focus({ preventScroll: true }); }
    }
  });
} catch (e) {}
