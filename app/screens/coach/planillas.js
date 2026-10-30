// «Pasar mis planillas», en el panel del coach (Rutinas → la franja «Con IA», y los llamados de Rutinas
// vacía e Inicio sin clientes). El coach sube sus planillas (.xlsx, .xlsm, .ods o .csv), elige qué
// hojas pasar y de qué alumno es cada una, y GIZE arma una rutina por hoja con la IA (función «ia»,
// modo «planilla»: supabase/functions/ia/planilla.ts). El coach revisa cada rutina («Ver cómo la leyó»
// y las marcas «Revisar»), la corrige en el editor de siempre y la guarda en «Mis rutinas» o, si es
// de un alumno vinculado, además se la aplica. Nada se guarda ni le llega a un alumno hasta que toca
// «Guardar».
//   · La planilla se lee en el equipo (core/planilla.js). A la IA va solo el texto de textoHoja(), el
//     mismo que muestra «Ver qué se manda»: sin mails, teléfonos, documentos, links ni filas de datos
//     personales o de salud, y con los nombres de la hoja, del archivo, de los alumnos vinculados y del
//     coach cambiados por «[alumno]». Es lo que dice la política (privacidad/index.html#ia-coach): si
//     cambia lo que se manda, cambia la política en el mismo cambio.
//   · Antes de la primera hoja, el permiso «Usar IA en tus rutinas» (ui/ia-permiso-rutinas.js): con
//     «Ahora no» no se manda nada.
//   · Las hojas van de a 2 a la vez. Con un código que hoy no tiene arreglo (el tope del día, la pausa,
//     el permiso apagado…) la cola frena y las que faltan quedan sin pasar.
//   · Lo que ya se pasó queda en el equipo hasta 7 días (localStorage, gize_rt_draft_planillas_<uid>,
//     que se borra al cerrar sesión: core/supabase.js → accountKeys), sin la planilla: la rutina que
//     armó la IA y los renglones (ya limpios) de donde salió cada ejercicio.
// Se ve solo si ia_coach_estado() dice que «planilla» anda para el coach (core/ia-coach.js). Los textos
// son los mismos en la web y en las apps: sin la prueba, el plan ni precios (reglas de las tiendas).
// No es una vista nueva del panel: se dibuja en lugar de Rutinas (coach/index.js), así el panel del
// gimnasio la toma como Rutinas sin cambios.
import { State } from '../../core/state.js';
import { esc, norm, uid } from '../../core/utils.js';
import { IA_COACH, iaCoachEstado, iaCoachMensaje, iaCoachVisible } from '../../core/ia-coach.js';
import { iaPedir, iaReportar } from '../../core/ia.js';
import { diasDesdeIA } from '../../core/rutina-borrador.js';
import { adivinarAlumno, leerArchivos, LIMITES, textoHoja, tildadas } from '../../core/planilla.js';
import { pedirPermisoRutinas } from '../../ui/ia-permiso-rutinas.js';
import { copySvg, fileTextSvg, shieldSvg, sparkleSvg } from '../../core/icons.js';
import { CoachState } from './state.js';
import { loadTpls } from './rutinas.js';
import { renderCoach } from './index.js';

const POLITICA = "https://gize.ar/privacidad/?app=1#ia-coach";
const CLAVE = "gize_rt_draft_planillas_";
const DIAS_7 = 7 * 864e5;
// Los códigos con los que hoy no tiene sentido seguir mandando hojas: la cola frena.
const FRENAN = ["pausada", "ahorro", "ritmo", "tope_dia", "tope_persona", "tope_mes", "sin_plan", "no_habilitado", "sin_permiso", "sin_sesion"];
const ACEPTA = ".xlsx,.xlsm,.ods,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12," +
  "application/vnd.oasis.opendocument.spreadsheet,application/vnd.ms-excel,text/csv";
const ERROR_ARCHIVO = {
  grande: "Pesa más de " + LIMITES.mb + " MB: partila en archivos más chicos.",
  xls: "Es un .xls viejo: abrilo y guardalo como .xlsx.",
  formato: "No es una planilla .xlsx, .xlsm, .ods ni .csv.",
  clave: "Tiene contraseña: sacásela y probá de nuevo.",
  sin_lector: "No se pudo cargar el lector de planillas. Revisá la conexión y probá de nuevo.",
  no_se_pudo: "No se pudo leer: puede estar dañada.",
};

// La pantalla, una por cuenta mientras la app está abierta (si se cierra con hojas en camino, siguen
// y quedan para cuando vuelva a entrar). CoachState.planillas apunta a esta mientras se ve.
//   paso: "archivos" | "hojas" | "pasar". items: una por hoja, con su estado: "elegir" (paso 2),
//   "cola", "leyendo", "lista", "no_rutina", "error", "frenada" o "cancelada".
let P0 = null;

// ---------- El borrador en el equipo ----------
const GUARDA = ["id", "archivo", "hoja", "nombre", "para", "days", "revisar", "ia", "lineas", "cortada"];
function leerBorrador(uid){
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE + uid) || "null");
    if (!d || !Array.isArray(d.items) || !d.ts || Date.now() - d.ts > DIAS_7) { localStorage.removeItem(CLAVE + uid); return { ts: 0, items: [] }; }
    const items = d.items.filter(x => x && x.id && Array.isArray(x.days) && x.days.length)
      .map(x => Object.assign(x, { estado: "lista", revisar: Array.isArray(x.revisar) ? x.revisar : [] }));
    return { ts: d.ts, items };
  } catch (e) { return { ts: 0, items: [] }; }
}
// Solo para la cuenta que lo armó y con su sesión abierta: al cerrar sesión (o al borrar la cuenta, o
// si entra otra) la app borra el borrador (core/supabase.js → accountKeys) y recarga, y al recargar se
// dispara «pagehide» (alSalir, acá abajo): si se guardara ahí, volvía a quedar en el equipo.
const deLaCuenta = P => !!(P && State.cloudUser && State.cloudUser.id === P.uid && !State.signingOut);
// Las rutinas listas y sin guardar (sin la planilla). Si no entran, sin lo de «Ver cómo la leyó».
function guardarBorrador(P){
  if (!deLaCuenta(P)) return;
  const items = P.items.filter(x => x.estado === "lista").map(x => { const o = {}; GUARDA.forEach(k => { if (x[k] !== undefined) o[k] = x[k]; }); return o; });
  try {
    if (!items.length) { P.ts = 0; localStorage.removeItem(P.clave); return; }
    if (!P.ts) P.ts = Date.now();
    try { localStorage.setItem(P.clave, JSON.stringify({ ts: P.ts, items })); }
    catch (e) { localStorage.setItem(P.clave, JSON.stringify({ ts: P.ts, items: items.map(({ ia, lineas, ...o }) => o) })); }
  } catch (e) {}
}
// Lo que se cambió en el editor (está en la misma rutina) también queda al salir de la app.
const alSalir = () => { if (P0) guardarBorrador(P0); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") alSalir(); });
window.addEventListener("pagehide", alSalir);
// Con hojas en camino, recargar las pierde (y el uso igual cuenta): se pregunta.
window.addEventListener("beforeunload", ev => { if (P0 && !State.signingOut && P0.items.some(x => x.estado === "cola" || x.estado === "leyendo")) { ev.preventDefault(); ev.returnValue = ""; } });

// ---------- Ayudas ----------
const clientes = () => (CoachState.coachClients || []).filter(c => c && c.id);
const cliente = id => (id && clientes().find(c => c.id === id)) || null;
const nombreDe = id => { const c = cliente(id); return (c && (c.full_name || c.email)) || "tu alumno"; };
const yLista = l => l.length > 1 ? l.slice(0, -1).join(", ") + " y " + l[l.length - 1] : (l[0] || "");
const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
const estadoIA = () => iaCoachVisible("planilla") ? IA_COACH.estado : null;
function quedan(){
  const e = estadoIA(), q = e && e.quedan && e.quedan.planilla;
  return typeof q === "number" ? Math.max(0, q) : null;
}
// Si hoy no se puede pasar ninguna hoja: el texto (neutro) que lo dice.
function bloqueo(){
  const e = estadoIA(); if (!e) return "";
  if (e.estado && e.estado !== "normal") return iaCoachMensaje({ codigo: e.estado, vuelve: e.vuelve }, "planilla");
  if (quedan() === 0) return iaCoachMensaje({ codigo: "tope_dia", tope: e.tope && e.tope.planilla }, "planilla");
  return "";
}
const enCurso = P => P.items.some(x => x.estado === "cola" || x.estado === "leyendo");
const contar = days => (days || []).reduce((n, d) => n + ((d && d.exercises) || []).length, 0);
const vivos = it => { const ids = new Set(); (it.days || []).forEach(d => (d.exercises || []).forEach(e => ids.add(e.id))); return (it.revisar || []).filter(id => ids.has(id)); };
const propios = it => ((it.ia && it.ia.dias) || []).reduce((n, d) => n + ((d && d.ejercicios) || []).filter(x => x && x.propio === true).length, 0);
// Una hoja con el nombre de siempre («Hoja1», «Sheet 2»): la rutina toma el nombre que propone la IA.
const generica = s => /^(hoja|sheet|hoja de calculo|planilla|libro|tabla)\s*\d*$/.test(norm(String(s || "")).replace(/\s+/g, " ").trim());

// ---------- Dibujar ----------
// La franja «Con IA» y los llamados: el botón, si «planilla» anda para el coach (si el estado cambia
// al llegar, se vuelve a dibujar Rutinas o Inicio).
export function botonPlanillas(){
  pedirEstado();
  return iaCoachVisible("planilla") ? '<button class="co-copy-btn cv-sec-btn pp-ir" data-coach="pp-open">' + fileTextSvg + ' Pasar mis planillas</button>' : "";
}
function pedirEstado(){
  const antes = iaCoachVisible("planilla");
  iaCoachEstado().then(() => {
    if (iaCoachVisible("planilla") === antes || CoachState.planillas) return;
    if (CoachState.coachSel || CoachState.coachTplEdit || CoachState.coachMealEdit || !["tpls", "home"].includes(CoachState.coachView)) return;
    renderCoach();
  });
}

const volver = P => '<div class="co-head cv-head"><button class="co-back" data-coach="pp-back">‹ ' + (P.paso === "hojas" ? "Elegir otras planillas" : "Volver") + '</button></div>' +
  '<h1 class="cv-title pp-title">Pasar mis planillas</h1>';
const privacidad = () => '<div class="pp-priv">' + shieldSvg + '<span>La planilla se lee en tu equipo. A la IA le mandamos solo los ejercicios, sin nombres de tus alumnos, mails, teléfonos ni links. ' +
  '<a href="' + POLITICA + '" target="_blank" rel="noopener">Política de privacidad</a></span></div>';
function opcionesPara(id){
  const l = clientes().slice().sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "es"));
  const sel = cliente(id) ? id : "";
  return '<option value=""' + (sel ? '' : ' selected') + '>Nadie todavía (queda en Mis rutinas)</option>' +
    l.map(c => '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.full_name || c.email || "Sin nombre") + '</option>').join("");
}
const para = it => '<label class="pp-para"><span>Para</span><select class="co-note pp-sel" data-pp="para" data-id="' + esc(it.id) + '" aria-label="Para quién es «' + esc(it.hoja || "la hoja") + '»">' + opcionesPara(it.para) + '</select></label>';
function erroresArchivos(P){
  const l = (P.archivos || []).filter(a => a.error || a.sobran);
  if (!l.length) return "";
  return '<ul class="pp-errs" role="alert">' + l.map(a => '<li><b>' + esc(a.archivo) + ':</b> ' +
    (a.error ? esc(ERROR_ARCHIVO[a.error] || ERROR_ARCHIVO.no_se_pudo) : esc(plural(a.sobran, "hoja no entró", "hojas no entraron") + " (hasta " + LIMITES.hojas + " por vez).")) + '</li>').join("") + '</ul>';
}

export function vistaPlanillas(){
  const P = CoachState.planillas;
  if (!P) return "";
  if (P.paso === "hojas") return volver(P) + pasoHojas(P);
  if (P.paso === "pasar") return volver(P) + pasoPasar(P);
  return volver(P) + pasoArchivos(P);
}

// Paso 1: elegir los archivos (y, si quedó algo de antes, seguir con eso).
function pasoArchivos(P){
  const listas = P.items.filter(x => x.estado === "lista");
  const otras = P.items.length > listas.length;
  const de = [...new Set(listas.map(x => x.archivo).filter(Boolean))];
  const seguir = P.items.length ? '<div class="cv-card pp-card pp-seguir" role="status"><b>' +
      (listas.length ? "Tenés " + plural(listas.length, "rutina", "rutinas") + " sin guardar" + (de.length ? " de " + esc(yLista(de)) : "") : "Tenés hojas que estabas pasando") + '</b>' +
      '<div class="pp-acc"><button class="gize-btn cv-btn" data-coach="pp-seguir">Seguir con ' + (listas.length === 1 && !otras ? "esa rutina" : "esas rutinas") + '</button>' +
      (listas.length && !enCurso(P) ? '<button class="co-copy-btn" data-coach="pp-descartar-todas">Descartarlas</button>' : '') + '</div></div>' : '';
  const q = quedan(), bl = bloqueo();
  return seguir +
    '<div class="cv-card pp-card">' +
      '<p class="pp-lead">Subí tus planillas y GIZE arma una rutina por hoja para que la revises. No se guarda nada hasta que toques «Guardar».</p>' +
      (P.leyendo ? '<div class="pp-leyendo" role="status">Leyendo tus planillas…</div>'
        : '<label class="gize-btn cv-btn pp-elegir">' + fileTextSvg + 'Elegir planillas<input class="pp-file" type="file" multiple data-pp="archivos" accept="' + ACEPTA + '"></label>') +
      '<ul class="pp-ayuda"><li>Excel (.xlsx o .xlsm), .ods o .csv, de hasta ' + LIMITES.mb + ' MB cada una.</li>' +
        '<li>¿Está en Google Sheets? Archivo → Descargar → Microsoft Excel (.xlsx).</li>' +
        '<li>¿Es un .xls viejo? Abrilo y guardalo como .xlsx.</li></ul>' +
      erroresArchivos(P) +
    '</div>' +
    privacidad() +
    (bl ? '<div class="pp-aviso" role="status">' + esc(bl) + '</div>' : q !== null ? '<div class="pp-quedan">Hoy te ' + (q === 1 ? 'queda ' : 'quedan ') + plural(q, "hoja", "hojas") + ' para pasar con IA.</div>' : '');
}

// Paso 2: las hojas de cada archivo, cuáles pasar y para quién.
function pasoHojas(P){
  const hojas = P.items.filter(x => x.estado === "elegir");
  const porArchivo = [];
  hojas.forEach(it => { let g = porArchivo.find(x => x.archivo === it.archivo); if (!g) porArchivo.push(g = { archivo: it.archivo, l: [] }); g.l.push(it); });
  const fila = it => {
    const meta = [it.filas ? plural(it.filas, "fila", "filas") : "Sin nada para pasar", it.oculta ? "oculta" : "", it.cortada ? "no entra entera" : ""].filter(Boolean).join(" · ");
    const ver = P.ver === it.id;
    return '<div class="pp-hoja' + (it.elegida ? ' on' : '') + '">' +
      '<label class="pp-hoja-sel"><input type="checkbox" data-pp="tilde" data-id="' + esc(it.id) + '"' + (it.elegida ? ' checked' : '') + (it.filas ? '' : ' disabled') + '>' +
        '<span class="pp-hoja-n"><b>' + esc(it.hoja || "Hoja") + '</b><small>' + esc(meta) + '</small></span></label>' +
      (it.filas ? para(it) + '<button class="cv-link pp-ver" data-coach="pp-ver" data-id="' + esc(it.id) + '" aria-expanded="' + ver + '">' + (ver ? 'Ocultar lo que se manda' : 'Ver qué se manda') + '</button>' : '') +
      (ver ? '<pre class="pp-texto" tabindex="0" aria-label="Lo que se manda a la IA de «' + esc(it.hoja || "la hoja") + '»">' + esc(it.texto) + '</pre>' : '') +
    '</div>';
  };
  const n = hojas.filter(x => x.elegida && x.filas).length, q = quedan(), bl = bloqueo();
  const pasa = q !== null && n > q;
  return '<p class="pp-lead pp-lead-solo">Elegí las hojas que querés pasar y de quién es cada una. Las que parecen rutinas ya vienen tildadas.</p>' +
    erroresArchivos(P) +
    porArchivo.map(g => '<section class="cv-card pp-arch"><h2 class="pp-arch-t">' + fileTextSvg + '<span>' + esc(g.archivo) + '</span></h2>' + g.l.map(fila).join("") + '</section>').join("") +
    (hojas.length ? '' : '<div class="cal-hint">No hay hojas para pasar en estas planillas.</div>') +
    privacidad() +
    (bl ? '<div class="pp-aviso" role="status">' + esc(bl) + '</div>' : pasa ? '<div class="pp-aviso" role="status">Elegiste ' + plural(n, "hoja", "hojas") + ' y hoy te ' + (q === 1 ? 'queda ' : 'quedan ') + q + ': destildá algunas.</div>' : '') +
    '<div class="pp-acc pp-pie"><button class="gize-btn cv-btn" data-coach="pp-pasar"' + (!n || pasa || bl ? ' disabled' : '') + '>' + sparkleSvg + 'Pasar ' + plural(n, "hoja", "hojas") + ' con IA</button></div>';
}

// Paso 3 y 4: la cola y, a medida que llegan, las rutinas para revisar y guardar.
function pasoPasar(P){
  const l = P.items.filter(x => x.estado !== "elegir");
  const listas = l.filter(x => x.estado === "lista");
  const andando = enCurso(P), hechas = l.filter(x => !["cola", "leyendo"].includes(x.estado)).length;
  const fin = P.fin && P.fin.n ? finHtml(P.fin) : '';
  return fin +
    (P.frenada ? '<div class="pp-aviso" role="status">' + esc(iaCoachMensaje(P.frenada, "planilla")) + '</div>' : '') +
    (andando ? '<div class="pp-progreso" role="status"><span>Pasando con IA: ' + hechas + ' de ' + l.length + '…</span><button class="cv-link" data-coach="pp-cancelar">Cancelar lo que falta</button></div>' : '') +
    (P.guardando ? '<div class="pp-progreso" role="status"><span>Guardando…</span></div>' : '') +
    l.map(it => tarjeta(P, it)).join("") +
    (!l.length && !fin ? '<div class="cal-hint">No hay rutinas para revisar.</div>' : '') +
    '<div class="pp-acc pp-pie">' +
      (listas.length > 1 ? '<button class="gize-btn cv-btn" data-coach="pp-guardar-todas"' + (P.guardando ? ' disabled' : '') + '>Guardar todas (' + listas.length + ')</button>' : '') +
      (andando ? '' : '<button class="co-copy-btn" data-coach="pp-otras">Pasar otras planillas</button>') +
    '</div>';
}
function finHtml(f){
  const m = f.n - f.aplicadas;
  const txt = "Guardaste " + plural(f.n, "rutina", "rutinas") + (f.aplicadas && m ? ": " + f.aplicadas + (f.aplicadas === 1 ? " aplicada" : " aplicadas") + " y " + m + " en Mis rutinas para cuando se vinculen."
    : f.aplicadas ? (f.n === 1 ? ", aplicada a tu alumno." : ", aplicadas a tus alumnos.") : " en Mis rutinas.");
  const invitar = m && CoachState.coachInvite ? '<button class="co-copy-btn" data-coach="copy-invite">' + copySvg + ' Invitar a tus alumnos</button>' : '';
  return '<div class="cv-card pp-card pp-fin" role="status"><b>' + esc(txt) + '</b>' +
    (invitar ? '<span>Pasales tu código: cuando se vinculen, les aplicás la rutina desde su ficha.</span>' : '') +
    '<div class="pp-acc">' + invitar + '<button class="co-copy-btn" data-coach="pp-back">Ver Mis rutinas</button></div></div>';
}
const CHIP = { cola: "En cola", leyendo: "Leyendo…", no_rutina: "No parece una rutina", error: "No se pudo", cancelada: "Cancelada" };
function tarjeta(P, it){
  const id = esc(it.id), de = '<div class="pp-rt-de">' + fileTextSvg + '<span>' + esc(it.archivo || "") + (it.hoja && it.hoja !== it.archivo ? ' · hoja «' + esc(it.hoja) + '»' : '') + '</span></div>';
  if (it.estado !== "lista"){
    const chip = it.estado === "frenada" ? (P.frenada && ["tope_dia", "ritmo"].includes(P.frenada.codigo) ? "Para mañana" : "Sin pasar") : CHIP[it.estado] || "";
    const reintentar = (it.estado === "error" && it.reintento) || it.estado === "cancelada";
    return '<article class="cv-card pp-rt pp-' + it.estado + '" data-id="' + id + '"><div class="pp-rt-h"><b class="pp-rt-t">' + esc(it.hoja || it.archivo || "Hoja") + '</b>' +
        '<span class="pp-chip">' + esc(chip) + '</span></div>' + de +
      (it.estado === "error" && it.error ? '<p class="pp-rt-msg">' + esc(it.error) + '</p>' : '') +
      (it.estado === "no_rutina" ? '<p class="pp-rt-msg">' + esc(it.nota || "La IA no encontró una rutina de entrenamiento en esta hoja.") + '</p>' : '') +
      (["cola", "leyendo"].includes(it.estado) ? '' : '<div class="pp-acc">' +
        (reintentar && !P.frenada ? '<button class="co-copy-btn" data-coach="pp-reintentar" data-id="' + id + '">' + (it.estado === "cancelada" ? "Pasarla" : "Reintentar") + '</button>' : '') +
        '<button class="co-copy-btn" data-coach="pp-quitar" data-id="' + id + '">Quitar</button></div>') +
    '</article>';
  }
  const nd = (it.days || []).length, ne = contar(it.days), rev = vivos(it).length, pr = propios(it), ia = it.ia || {};
  const avisos = [rev ? plural(rev, "ejercicio para revisar", "ejercicios para revisar") + ": la IA no estaba segura." : "",
    pr ? plural(pr, "con nombre propio", "con nombre propio") + ": sin video de GIZE." : "",
    ia.semanas > 1 ? "La progresión por semanas quedó en «Objetivo de progreso» de cada ejercicio." : "",
    ia.varias ? "La hoja tenía más de una rutina: se pasó solo la primera." : "",
    it.cortada ? "La hoja no entró entera: revisá que estén todos los días." : "",
    ia.nota ? "Nota de la IA: " + ia.nota : ""].filter(Boolean);
  const leyo = P.leyo && P.leyo[it.id];
  const cl = cliente(it.para);
  return '<article class="cv-card pp-rt pp-lista" data-id="' + id + '">' +
    '<div class="pp-rt-h"><input class="co-note pp-nombre" data-pp="nombre" data-id="' + id + '" value="' + esc(it.nombre || "") + '" maxlength="80" aria-label="Nombre de la rutina">' +
      '<span class="pp-chip ok">' + esc("Lista: " + plural(nd, "día", "días") + " · " + plural(ne, "ejercicio", "ejercicios")) + '</span></div>' + de +
    (avisos.length ? '<ul class="pp-avisos">' + avisos.map(a => '<li>' + esc(a) + '</li>').join("") + '</ul>' : '') +
    para(it) +
    '<div class="pp-acc">' +
      '<button class="gize-btn cv-btn" data-coach="pp-guardar" data-id="' + id + '"' + (P.guardando ? ' disabled' : '') + '>' + (cl ? 'Guardar y aplicar' : 'Guardar') + '</button>' +
      '<button class="co-copy-btn" data-coach="pp-editar" data-id="' + id + '">Revisar y editar</button>' +
      (ia.dias ? '<button class="co-copy-btn" data-coach="pp-leyo" data-id="' + id + '" aria-expanded="' + !!leyo + '">' + (leyo ? 'Ocultar cómo la leyó' : 'Ver cómo la leyó') + '</button>' : '') +
      '<button class="co-copy-btn" data-coach="pp-descartar" data-id="' + id + '">Descartar</button>' +
      (ia.dias ? '<button class="cv-link pp-mal" data-coach="pp-reportar" data-id="' + id + '">¿Está mal? Avisanos</button>' : '') +
    '</div>' +
    (leyo ? comoLaLeyo(it) : '') +
  '</article>';
}
// Fila por fila: lo que decía la planilla (ya limpio, lo que vio la IA) y lo que quedó.
function comoLaLeyo(it){
  const lineas = it.lineas || {};
  const orig = f => { const t = f && lineas[f]; return t ? t.split("|").map(s => s.trim()).filter(Boolean).join(" · ") : ""; };
  const leido = x => {
    const s = Array.isArray(x.series) ? x.series : [];
    const obj = [...new Set(s.map(y => y && y.objetivo).filter(Boolean))].join(" / "), kg = [...new Set(s.map(y => y && y.kg).filter(Boolean))].join(" / ");
    return [x.nombre, s.length ? s.length + " × " + (obj || "—") : "", kg ? kg + (/kg/i.test(kg) ? "" : " kg") : "", x.descanso ? "desc. " + x.descanso : "", x.rir ? "RIR " + x.rir : ""].filter(Boolean).join(" · ");
  };
  return '<div class="pp-leyo" role="region" aria-label="Cómo la leyó la IA">' + (it.ia.dias || []).map(d =>
    '<div class="pp-leyo-d">' + esc((d && d.nombre) || "Día") + '</div>' + ((d && d.ejercicios) || []).map(x =>
      '<div class="pp-leyo-f"><div class="pp-leyo-o"><small>' + (x.fila ? 'Fila ' + esc(String(x.fila)) : 'Sin fila') + '</small>' + esc(orig(x.fila) || "—") + '</div>' +
      '<div class="pp-leyo-a">' + esc(leido(x)) + (x.dudoso ? '<span class="co-exc-rev">Revisar</span>' : '') + (x.propio ? '<span class="pp-propio">Nombre propio</span>' : '') + '</div></div>').join("")).join("") +
  '</div>';
}

// Arriba del editor (coach/index.js), con una rutina de la planilla abierta.
export function avisoEditor(){
  const e = CoachState.coachTplEdit, P = CoachState.planillas, it = e && P && P.items.find(x => x.id === e.planilla);
  if (!it) return "";
  const rev = vivos(it).length, cl = cliente(it.para);
  return '<div class="co-sched-sub pp-ed">Rutina pasada de ' + (it.hoja ? 'la hoja «' + esc(it.hoja) + '»' : 'tu planilla') + (it.archivo && it.archivo !== it.hoja ? ' (' + esc(it.archivo) + ')' : '') + '. ' +
    (rev ? (rev === 1 ? 'Mirá el ejercicio marcado' : 'Mirá los ' + rev + ' ejercicios marcados') + ' «Revisar»: la IA no estaba segura. ' : '') +
    (cl ? 'Al guardarla queda en Mis rutinas y se la aplicás a ' + esc(nombreDe(cl.id)) + '.' : 'Al guardarla queda en Mis rutinas.') + '</div>';
}

// Vuelve a dibujar solo la pantalla (si se ve), sin perder el foco de lo que se estaba tocando.
function repintar(P){
  const Q = CoachState.planillas;
  if (!Q || (P && P !== Q) || CoachState.coachView !== "tpls" || CoachState.coachSel || CoachState.coachTplEdit || CoachState.coachMealEdit) return;
  const w = document.querySelector("#coachHost .cv-wrap"); if (!w) return;
  const a = document.activeElement, dentro = !!(a && a !== document.body && a.dataset && w.contains(a));
  const k = dentro ? (a.dataset.pp ? '[data-pp="' + a.dataset.pp + '"]' : a.dataset.coach ? '[data-coach="' + a.dataset.coach + '"]' : "") + (a.dataset.id ? '[data-id="' + a.dataset.id + '"]' : "") : "";
  const sel = dentro && typeof a.selectionStart === "number" ? [a.selectionStart, a.selectionEnd] : null;
  w.innerHTML = vistaPlanillas();
  if (!k) return;
  const b = w.querySelector(k);
  if (b) try { b.focus({ preventScroll: true }); if (sel && b.setSelectionRange) b.setSelectionRange(sel[0], sel[1]); } catch (e) {}
}

// ---------- Abrir y cerrar ----------
function abrir(){
  if (!State.cloudUser || !iaCoachVisible("planilla")) return;
  const u = State.cloudUser.id;
  if (!P0 || P0.uid !== u){ const b = leerBorrador(u); P0 = { uid: u, clave: CLAVE + u, ts: b.ts, paso: "archivos", items: b.items, archivos: [], frenada: null, fin: null, leyo: {}, ver: null }; }
  const P = P0, andando = enCurso(P);
  // Lo que quedó de otra vez: lo que sigue en camino y las rutinas listas (lo demás ya no sirve).
  P.items = P.items.filter(x => andando ? x.estado !== "elegir" : x.estado === "lista");
  P.paso = andando ? "pasar" : "archivos"; P.archivos = []; P.ver = null; P.fin = null;
  if (!andando) P.frenada = null;
  // Desde Inicio, «Mis rutinas» todavía no se leyó (para volver a Rutinas y para no repetir nombres).
  if (CoachState.coachView !== "tpls") loadTpls();
  CoachState.planillas = P; CoachState.coachView = "tpls"; CoachState.coachSeedOpen = false;
  renderCoach(); window.scrollTo(0, 0);
  // Cuántas quedan hoy, al día.
  iaCoachEstado(true).then(() => repintar(P));
}
// Se va de la pantalla (lo que ya se pasó queda en el equipo; lo que está en camino sigue).
export function cerrarPlanillas(){
  const P = CoachState.planillas; if (!P) return;
  P.items = P.items.filter(x => x.estado !== "elegir");
  guardarBorrador(P);
  CoachState.planillas = null;
}
function volverArchivos(P){
  P.items = P.items.filter(x => x.estado !== "elegir");
  P.paso = "archivos"; P.ver = null; P.archivos = [];
  repintar(P); window.scrollTo(0, 0);
}

// Paso 1 → 2: leer los archivos en el equipo y armar lo que iría a la IA de cada hoja.
async function elegirArchivos(P, files){
  if (!files || !files.length || P.leyendo) return;
  P.leyendo = true; P.archivos = []; repintar(P);
  let leidos = [];
  try { leidos = await leerArchivos(files); } catch (e) { leidos = Array.from(files).map(f => ({ archivo: (f && f.name) || "Planilla", hojas: [], error: "no_se_pudo" })); }
  P.leyendo = false;
  const cl = clientes();
  // Se tapan los nombres de los alumnos vinculados y el del coach (además de la hoja y el archivo).
  const nombres = cl.map(c => c.full_name).concat((State.cloudProfile && State.cloudProfile.full_name) || []).filter(Boolean);
  P.archivos = leidos.map(r => ({ archivo: r.archivo, error: r.error || null, sobran: r.sobran || 0 }));
  P.items = P.items.filter(x => x.estado !== "elegir");
  for (const r of leidos){
    const tilde = tildadas(r.hojas || []);
    (r.hojas || []).forEach((h, i) => {
      const t = textoHoja(h, { archivo: r.archivo, nombres });
      P.items.push({ id: uid(), archivo: r.archivo, hoja: h.nombre, oculta: !!h.oculta, filas: t.filas, cortada: !!t.cortada, texto: t.texto, links: h.links || {},
        elegida: !!tilde[i] && t.filas > 0, para: adivinarAlumno(h.nombre, r.archivo, cl), estado: "elegir" });
    });
  }
  P.paso = P.items.some(x => x.estado === "elegir") ? "hojas" : "archivos";
  repintar(P); window.scrollTo(0, 0);
}

// Paso 2 → 3: el permiso (una sola vez) y la cola.
async function pasar(P){
  if (P.pidiendo || bloqueo()) return;
  const l = P.items.filter(x => x.estado === "elegir" && x.elegida && x.filas > 0), q = quedan();
  if (!l.length || (q !== null && l.length > q)) return;
  P.pidiendo = true;
  let ok = false;
  try { ok = await pedirPermisoRutinas(); } finally { P.pidiendo = false; }
  if (!ok || CoachState.planillas !== P || P.paso !== "hojas") return;
  P.frenada = null; P.fin = null;
  l.forEach(x => { x.estado = "cola"; });
  P.items = P.items.filter(x => x.estado !== "elegir");
  P.paso = "pasar";
  repintar(P); window.scrollTo(0, 0);
  correr(P);
}

// De a 2 a la vez. Lo que ya está en camino termina aunque se cancele o se cierre la pantalla.
async function correr(P){
  if (P.corriendo) return;
  P.corriendo = true;
  const uno = async () => {
    for (;;){
      if (P.frenada) return;
      const it = P.items.find(x => x.estado === "cola");
      if (!it) return;
      it.estado = "leyendo"; it.error = null; repintar(P);
      try { recibir(it, await iaPedir("planilla", { hoja: it.texto || "" })); }
      catch (e) {
        const c = (e && e.codigo) || "error", x = { codigo: c, vuelve: (e && e.vuelve) || null, tope: e && e.tope, motivo: e && e.motivo };
        if (FRENAN.includes(c)){ it.estado = "cola"; if (!P.frenada) P.frenada = x; }
        else { it.estado = "error"; it.error = iaCoachMensaje(x, "planilla"); it.reintento = c !== "hoja_grande"; }
      }
      guardarBorrador(P); repintar(P);
    }
  };
  try { await Promise.all([uno(), uno()]); }
  finally {
    P.corriendo = false;
    if (P.frenada) P.items.forEach(x => { if (x.estado === "cola") x.estado = "frenada"; });
    guardarBorrador(P); repintar(P);
    if (!P.frenada && P.items.some(x => x.estado === "cola")) correr(P);
    else iaCoachEstado(true).then(() => repintar(P));
  }
}

// Lo que contestó la función → la rutina para revisar (o «no parece una rutina»).
function recibir(it, r){
  if (!r || r.hay_rutina !== true){ it.estado = "no_rutina"; it.nota = (r && typeof r.nota === "string" && r.nota) || ""; return; }
  const { days, revisar } = diasDesdeIA(r, { propios: true, links: it.links });
  if (!days.length){ it.estado = "no_rutina"; it.nota = ""; return; }
  const ia = Object.assign({}, r); delete ia.ok; delete ia.modelo_nombre;
  // De cada ejercicio, el renglón de donde salió (lo que vio la IA, ya limpio): para «Ver cómo la leyó».
  const filas = new Set(), lineas = {};
  (ia.dias || []).forEach(d => ((d && d.ejercicios) || []).forEach(x => { if (x && Number.isInteger(x.fila)) filas.add(x.fila); }));
  String(it.texto || "").split("\n").forEach(l => { const m = /^(\d+)\|(.*)$/.exec(l); if (m && filas.has(+m[1])) lineas[m[1]] = m[2]; });
  Object.assign(it, { estado: "lista", ia, days, revisar, lineas, nombre: String((generica(it.hoja) ? r.nombre || it.hoja : it.hoja) || r.nombre || "Rutina").slice(0, 80) });
}

// ---------- Guardar ----------
// Ids nuevos para la rutina del alumno (como al copiar una rutina a otro cliente).
function copia(days){
  const d = JSON.parse(JSON.stringify(days || []));
  d.forEach(x => { x.id = uid(); (x.exercises || []).forEach(ex => { ex.id = uid(); (ex.sets || []).forEach(s => { s.id = uid(); s.kg = ""; s.reps = ""; s.done = false; }); }); });
  return d;
}
function unico(nombre, usados){
  let n = nombre, i = 2;
  while (usados.has(norm(n))) n = nombre.slice(0, 74) + " (" + (i++) + ")";
  usados.add(norm(n));
  return n;
}
// Cada rutina queda en «Mis rutinas» y, si es de un alumno vinculado, además se le aplica (antes se
// pregunta si eso reemplaza la rutina que ya tenía, nombrándolo).
async function guardar(P, lista){
  if (P.guardando) return false;
  lista = lista.filter(x => x.estado === "lista" && P.items.includes(x));
  if (!lista.length) return false;
  if (lista.some(x => !String(x.nombre || "").trim())){ alert("Ponele un nombre a " + (lista.length > 1 ? "cada rutina." : "la rutina.")); return false; }
  if (!State.sb || !State.cloudUser){ alert("Iniciá sesión para guardar."); return false; }
  // Cada alumno tiene una sola rutina: si dos de las que se guardan juntas son para el mismo (pasa con
  // un archivo con su nombre y una hoja por día), la segunda le reemplazaría la primera sin avisar.
  const porAlumno = new Map();
  lista.forEach(x => { const c = cliente(x.para); if (c) porAlumno.set(c.id, (porAlumno.get(c.id) || []).concat(x)); });
  const repetidos = [...porAlumno].filter(([, l]) => l.length > 1);
  if (repetidos.length){
    alert(repetidos.map(([id, l]) => yLista(l.map(x => "«" + String(x.nombre).trim() + "»")) + " son para " + nombreDe(id)).join(". ") +
      ". Cada alumno tiene una sola rutina: dejale una y en las otras elegí «Nadie todavía» (quedan en Mis rutinas).");
    return false;
  }
  P.guardando = true; repintar(P);
  try {
    const ids = [...new Set(lista.map(x => cliente(x.para)).filter(Boolean).map(c => c.id))];
    if (ids.length){
      let r;
      try { r = await State.sb.from("routines").select("client_id,days").in("client_id", ids); } catch (e) { r = { error: e }; }
      if (r.error){ alert("No se pudo revisar las rutinas de tus alumnos. Revisá tu conexión y probá de nuevo."); return false; }
      const con = (r.data || []).filter(x => x && Array.isArray(x.days) && x.days.length).map(x => nombreDe(x.client_id));
      if (con.length && !await confirmar("Reemplaza la rutina de " + yLista(con) + ". La que " + (con.length > 1 ? "tienen deja" : "tiene deja") + " de verse (sus entrenos quedan en el historial).",
        { titulo: lista.length > 1 ? "Guardar rutinas" : "Guardar rutina", ok: "Guardar y reemplazar" })) return false;
    }
    await loadTpls();
    const usados = new Set((CoachState.coachTpls || []).map(t => norm(String(t.name || ""))));
    const fin = P.fin || (P.fin = { n: 0, aplicadas: 0 }), malos = [];
    for (const it of lista){
      const name = unico(String(it.nombre).trim().slice(0, 80), usados);
      let r;
      try { r = await State.sb.from("routine_templates").insert({ coach_id: State.cloudUser.id, name, days: it.days, updated_at: new Date().toISOString() }).select(); } catch (e) { r = { error: e }; }
      // El tope de 200 rutinas guardadas (o lo que sea) se muestra tal cual y no se sigue.
      if (r.error){ alert("No se pudo guardar «" + name + "»: " + ((r.error && r.error.message) || "revisá tu conexión y probá de nuevo.")); break; }
      fin.n++;
      const cl = cliente(it.para);
      if (cl){
        let a;
        try { a = await State.sb.from("routines").upsert({ client_id: cl.id, days: copia(it.days), updated_at: new Date().toISOString(), updated_by: State.cloudUser.id }, { onConflict: "client_id" }); } catch (e) { a = { error: e }; }
        if (a.error) malos.push(nombreDe(cl.id)); else fin.aplicadas++;
      }
      P.items = P.items.filter(x => x !== it);
    }
    if (malos.length) alert("Quedaron en Mis rutinas, pero no se pudieron aplicar a " + yLista(malos) + ". Aplicáselas desde su ficha.");
    await loadTpls();
    return true;
  } finally {
    P.guardando = false;
    guardarBorrador(P); repintar(P);
  }
}

// «¿Está mal? Avisanos»: la rutina que armó la IA (nunca la planilla) y un comentario.
async function reportar(it){
  if (!it || !it.ia) return;
  const com = await pedir("¿Qué está mal? Contanos (opcional). Mandamos la rutina que armó la IA, sin la planilla.", "", { titulo: "¿Está mal?", ok: "Enviar", placeholder: "Ej: el día 2 tenía otro ejercicio" });
  if (com === null) return;
  const resp = JSON.parse(JSON.stringify(it.ia));
  while (JSON.stringify(resp).length > 59000 && Array.isArray(resp.dias) && resp.dias.length > 1) resp.dias.pop();
  try { await iaReportar("planilla", resp, String(com).slice(0, 300)); alert("Gracias, lo vamos a revisar."); }
  catch (e) { alert((e && e.message) || "No se pudo enviar. Probá de nuevo."); }
}

// ---------- Acciones (data-coach="pp-…", desde main.js) ----------
// «pp-» y no «pl-»: «pl-» es del plan alimenticio del alumno (pl-mealadd, pl-listadd…, en main.js).
// También «‹ Volver», «Guardar rutina» y «Descartar» del editor con una rutina de la planilla abierta
// (CoachState.coachTplEdit.planilla): Volver vuelve a la planilla con los cambios, Guardar la guarda
// (y la aplica si tiene alumno) y Descartar la saca de la lista. Devuelve true si la manejó.
export async function planillaAction(a, b){
  const e = CoachState.coachTplEdit;
  if (e && e.planilla && /^tpl-(back|save|del)$/.test(a)) return accionEditor(a, b, e);
  if (a === "pp-open"){ abrir(); return true; }
  const P = CoachState.planillas;
  if (!P) return true;
  const it = b && b.dataset && b.dataset.id ? P.items.find(x => x.id === b.dataset.id) : null;
  if (a === "pp-back"){
    if (P.paso === "hojas"){ volverArchivos(P); return true; }
    cerrarPlanillas(); CoachState.coachView = "tpls"; renderCoach(); window.scrollTo(0, 0); return true;
  }
  if (a === "pp-otras"){ volverArchivos(P); return true; }
  if (a === "pp-seguir"){ P.paso = "pasar"; repintar(P); window.scrollTo(0, 0); return true; }
  if (a === "pp-descartar-todas"){
    const n = P.items.filter(x => x.estado === "lista").length;
    if (!n || !await confirmar("¿Descartar " + (n === 1 ? "la rutina sin guardar" : "las " + n + " rutinas sin guardar") + "? No quedan en ningún lado.", { titulo: "Descartar", ok: "Descartar", peligro: true })) return true;
    P.items = P.items.filter(x => x.estado !== "lista");
    guardarBorrador(P); repintar(P); return true;
  }
  if (a === "pp-ver"){ P.ver = P.ver === b.dataset.id ? null : b.dataset.id; repintar(P); return true; }
  if (a === "pp-pasar"){ await pasar(P); return true; }
  if (a === "pp-cancelar"){ P.items.forEach(x => { if (x.estado === "cola") x.estado = "cancelada"; }); repintar(P); return true; }
  if (a === "pp-guardar-todas"){ await guardar(P, P.items.filter(x => x.estado === "lista")); return true; }
  if (!it) return true;
  if (a === "pp-reintentar"){ if (P.frenada) return true; it.estado = "cola"; it.error = null; repintar(P); correr(P); return true; }
  if (a === "pp-quitar"){ P.items = P.items.filter(x => x !== it); repintar(P); return true; }
  if (a === "pp-leyo"){ P.leyo[it.id] = !P.leyo[it.id]; repintar(P); return true; }
  if (a === "pp-reportar"){ await reportar(it); return true; }
  if (it.estado !== "lista") return true;
  if (a === "pp-descartar"){
    if (!await confirmar("¿Descartar «" + (it.nombre || it.hoja || "esta rutina") + "»? No se guarda.", { titulo: "Descartar rutina", ok: "Descartar", peligro: true })) return true;
    P.items = P.items.filter(x => x !== it); guardarBorrador(P); repintar(P); return true;
  }
  if (a === "pp-editar"){
    CoachState.coachTplEdit = { planilla: it.id, id: null, name: it.nombre || "", days: it.days, revisar: (it.revisar || []).slice() };
    CoachState.coachEditDay = 0; CoachState.coachExpandedEx = new Set();
    renderCoach(); window.scrollTo(0, 0); return true;
  }
  if (a === "pp-guardar"){ await guardar(P, [it]); return true; }
  return true;
}
async function accionEditor(a, b, e){
  const P = CoachState.planillas, it = P && P.items.find(x => x.id === e.planilla);
  const salir = () => { CoachState.coachTplEdit = null; CoachState.coachEditDay = 0; CoachState.coachView = "tpls"; renderCoach(); window.scrollTo(0, 0); };
  if (!it){ salir(); return true; }
  // Los cambios del editor ya están en la rutina (son los mismos días); el nombre se copia.
  it.nombre = String(e.name || "").slice(0, 80); it.days = e.days;
  if (a === "tpl-back"){ guardarBorrador(P); salir(); return true; }
  if (a === "tpl-del"){
    if (!await confirmar("¿Descartar esta rutina? No se guarda.", { titulo: "Descartar rutina", ok: "Descartar", peligro: true })) return true;
    P.items = P.items.filter(x => x !== it); guardarBorrador(P); salir(); return true;
  }
  if (b) b.disabled = true;
  await guardar(P, [it]);
  if (!P.items.includes(it)){ salir(); return true; }
  if (b && b.isConnected) b.disabled = false;
  return true;
}

// Lo que se toca en la pantalla (no son data-coach: main.js no los conoce).
document.addEventListener("change", e => {
  const t = e.target, P = CoachState.planillas;
  if (!P || !t || !t.closest || !t.closest("#coachHost") || !t.dataset || !t.dataset.pp) return;
  const k = t.dataset.pp, it = t.dataset.id ? P.items.find(x => x.id === t.dataset.id) : null;
  if (k === "archivos"){ const f = Array.from(t.files || []); t.value = ""; elegirArchivos(P, f); return; }
  if (!it) return;
  if (k === "tilde"){ it.elegida = !!t.checked; repintar(P); return; }
  if (k === "para"){ it.para = t.value || null; guardarBorrador(P); repintar(P); return; }
  if (k === "nombre"){ it.nombre = t.value.slice(0, 80); guardarBorrador(P); }
});
// El nombre de la tarjeta y el del editor con una rutina de la planilla abierta: así queda aunque se
// salga del editor por la barra lateral, sin «‹ Volver a la planilla» (los días ya son los mismos).
document.addEventListener("input", e => {
  const t = e.target, P = CoachState.planillas, ed = CoachState.coachTplEdit;
  if (!P || !t || !t.dataset) return;
  const id = t.dataset.pp === "nombre" ? t.dataset.id : t.dataset.coach === "tpl-name" && ed && ed.planilla ? ed.planilla : null;
  const it = id && P.items.find(x => x.id === id);
  if (it) it.nombre = t.value.slice(0, 80);
});

// Para las pruebas y para depurar.
export const _planillas = () => P0;
