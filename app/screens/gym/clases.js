// Clases del gimnasio (etapa 3; supabase/gimnasios-clases.sql). La pantalla «Clases» la usan:
//   · el dueño y la administración desde su panel (editar: la grilla, cancelar una fecha, cómo se
//     reserva; anotar y sacar socios; el presente);
//   · la recepción, en su pestaña «Clases» (todas las clases; anota, saca y marca el presente);
//   · el profe, desde «Clases» de su panel de coach (solo las suyas, con la lista y el presente;
//     screens/coach/gimnasio.js la carga con import() recién al abrirla).
// Arriba, la semana (7 días desde hoy, con ‹ y ›): cada clase con su hora, profe, sala, lugares y
// cuántos esperan. Al tocar una, su lista: quién tiene lugar (con el presente: lo marca el profe o la
// recepción; si nadie lo marcó, sale del ingreso al gimnasio en el horario de la clase) y quién espera,
// en orden. La lista de espera se llena sola en el servidor cuando alguien cancela.
// Los botones de acá llevan data-gyc="…" y los atiende este archivo; quien muestra la pantalla avisa
// cómo redibujarse (alRepintar). Nunca montos ni datos de salud.
import { esc } from '../../core/utils.js';
import { GS, rpc, fecha, hoyAR, horaAR, plural, fotoHtml, pedirFotos } from './estado.js';

export const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
// desde: el primer día de la semana a la vista; semana: gym_clases_semana; sel: la clase abierta
// ({ clase, fecha }); lista: gym_clase_alumnos; grilla: gym_clases (dueño y administración); form: la
// clase que se está creando o cambiando; q y res: buscar a quién anotar; busy: lo que se está guardando.
export const KS = { desde: null, semana: null, error: "", sel: null, lista: null, listaError: "", grilla: null, form: null, q: "", res: null, busy: "", seq: 0 };
// o: { editar (dueño y administración), anotar (y la recepción), profe }. La última con la que se dibujó.
let O = {};
let repintarFuera = () => {};
export function alRepintar(f){ repintarFuera = typeof f === "function" ? f : () => {}; }
const repintar = () => { try { repintarFuera(); } catch (e) {} };

// ---- Fechas ----
const masDias = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const diaSemana = d => { const n = new Date(d + "T12:00:00Z").getUTCDay(); return n === 0 ? 7 : n; };
export const diaLargo = d => DIAS[diaSemana(d)] + " " + fecha(d);
const desde = () => KS.desde || hoyAR();

// ---- Datos ----
export async function cargarSemana(){
  const d = desde(), n = ++KS.seq;
  const r = await rpc("gym_clases_semana", { desde: d });
  if (n !== KS.seq) return;
  if (r.error){ if (!KS.semana) KS.error = r.msg; }
  else { KS.semana = r.data && typeof r.data === "object" ? r.data : { clases: [] }; KS.error = ""; }
  repintar();
}
export async function cargarGrilla(){
  const r = await rpc("gym_clases");
  if (!r.error) KS.grilla = Array.isArray(r.data) ? r.data : [];
  repintar();
}
async function cargarLista(){
  const s = KS.sel; if (!s) return;
  const r = await rpc("gym_clase_alumnos", { clase: s.clase, dia: s.fecha });
  if (KS.sel !== s) return;
  if (r.error){ KS.listaError = r.msg; KS.lista = null; }
  else { KS.lista = r.data || null; KS.listaError = ""; pedirFotos(((r.data || {}).alumnos || []).map(a => a.foto_path)).then(ok => { if (ok) repintar(); }); }
  repintar();
}
// Al entrar a la pantalla: la semana (y la grilla, si puede editarla).
export function cargarClases(o){
  if (o) O = o;
  cargarSemana();
  if (O.editar) cargarGrilla();
  if (KS.sel) cargarLista();
}
async function equipo(){
  if (GS.equipo !== null) return;
  const r = await rpc("gym_equipo");
  if (!r.error){ GS.equipo = Array.isArray(r.data) ? r.data : []; repintar(); }
}

// ---- La pantalla ----
// o: { editar, anotar, profe }. Devuelve el cuerpo (sin el título: lo pone quien la muestra).
export function renderClases(o){
  O = o || {};
  if (KS.sel) return lista();
  const d = desde(), hasta = masDias(d, 6);
  const nav = '<div class="gy-cl-nav" role="group" aria-label="Semana">' +
    '<button class="co-copy-btn cv-sec-btn gy-btn2" data-gyc="semana" data-v="-7" aria-label="Semana anterior">‹</button>' +
    '<b class="gy-cl-rango">' + fecha(d) + ' al ' + fecha(hasta) + '</b>' +
    '<button class="co-copy-btn cv-sec-btn gy-btn2" data-gyc="semana" data-v="7" aria-label="Semana siguiente">›</button>' +
    (d !== hoyAR() ? '<button class="cv-link" data-gyc="semana" data-v="0">Hoy</button>' : '') +
    (O.editar ? '<button class="gize-btn cv-btn gy-cl-nueva" data-gyc="nueva">Nueva clase</button>' : '') + '</div>';
  let cuerpo;
  if (!KS.semana) cuerpo = KS.error ? '<div class="cv-card gy-vacio"><p>' + esc(KS.error) + '</p><button class="co-copy-btn cv-sec-btn gy-btn2" data-gyc="reintentar">Reintentar</button></div>'
    : '<div class="cv-card gy-vacio" aria-busy="true"><p>Cargando las clases…</p></div>';
  else {
    const L = KS.semana.clases || [];
    if (!L.length) cuerpo = '<div class="cv-card gy-vacio"><p>' + (O.profe ? "No tenés clases asignadas esta semana." : O.editar ? "Todavía no hay clases esta semana. Creá la primera con «Nueva clase»: se repite todas las semanas." : "No hay clases esta semana.") + '</p></div>';
    else {
      const dias = [];
      for (let i = 0; i < 7; i++){ const f = masDias(d, i), cs = L.filter(c => c.fecha === f); if (cs.length) dias.push([f, cs]); }
      cuerpo = '<div class="gy-cl-semana">' + dias.map(([f, cs]) => '<section class="cv-card gy-sec gy-cl-dia" aria-label="' + esc(diaLargo(f)) + '"><h2 class="gy-h">' +
        esc(diaLargo(f)) + (f === hoyAR() ? ' <span class="gy-tag">Hoy</span>' : '') + '</h2><ul class="gy-cl-lista">' + cs.map(item).join("") + '</ul></section>').join("") + '</div>';
    }
  }
  return (KS.form ? formulario() : '') + nav + cuerpo + (O.editar ? grilla() + reservas() : '') +
    '<p class="gy-pie">Las reservas las hacen los socios desde su app. Si alguien cancela, el primero de la lista de espera pasa solo y le llega un aviso.</p>';
}
function lugares(c){
  const t = c.confirmadas + " de " + c.cupo + (c.espera ? " · " + plural(c.espera, "en espera", "en espera") : "");
  return c.termino && c.confirmadas ? t + " · " + plural(c.presentes || 0, "presente", "presentes") : t;
}
function item(c){
  const est = c.cancelada ? '<span class="gy-tag gy-tag-rojo">Cancelada</span>' : c.confirmadas >= c.cupo ? '<span class="gy-tag gy-tag-ambar">Llena</span>' : '';
  return '<li><button class="gy-cl-i' + (c.cancelada ? ' gy-cl-cancelada' : '') + '" data-gyc="abrir" data-id="' + esc(c.clase) + '" data-f="' + esc(c.fecha) + '">' +
    '<span class="gy-cl-hora">' + esc(c.hora) + '</span><span class="gy-cl-t"><b>' + esc(c.nombre) + '</b><span>' +
      [c.profe ? esc(c.profe.name || "") : "Sin profe", c.sala ? esc(c.sala) : ""].filter(Boolean).join(" · ") + '</span></span>' +
    '<span class="gy-cl-n">' + esc(lugares(c)) + est + '</span></button></li>';
}

// ---- La lista de una clase ----
function lista(){
  const s = KS.sel, L = KS.lista;
  const volver = '<div class="gy-cl-nav"><button class="cv-link" data-gyc="volver">‹ Volver a la semana</button></div>';
  if (!L) return volver + (KS.listaError ? '<div class="cv-card gy-vacio"><p>' + esc(KS.listaError) + '</p></div>' : '<div class="cv-card gy-vacio" aria-busy="true"><p>Cargando la lista…</p></div>');
  const c = L.clase || {}, A = L.alumnos || [], conf = A.filter(a => a.estado === "confirmada"), esp = A.filter(a => a.estado === "espera");
  const datos = [diaLargo(s.fecha), (L.hora || "") + " a " + (L.fin || ""), c.sala || "", c.profe ? "Profe: " + (c.profe.name || "") : "Sin profe"].filter(Boolean).map(esc).join(" · ");
  const pres = conf.filter(a => a.presente).length;
  const cab = '<section class="cv-card gy-sec gy-cl-cab"><h2 class="gy-h">' + esc(c.nombre || "Clase") + '</h2><p class="gy-fino">' + datos + '</p>' +
    (L.cancelada ? '<div class="gy-cartel bad" role="status"><span>Cancelada' + (L.motivo ? ': ' + esc(L.motivo) : '') + '. A quien había reservado le llegó un aviso.</span></div>' : '') +
    '<p class="gy-p gy-cl-cuenta"><b>' + conf.length + ' de ' + c.cupo + '</b> lugares' + (esp.length ? ' · ' + plural(esp.length, "en espera", "en espera") : '') +
      (L.empezo && conf.length ? ' · ' + plural(pres, "presente", "presentes") : '') + (L.canceladas ? ' · ' + plural(L.canceladas, "canceló", "cancelaron") : '') + '</p>' +
    (O.editar && !L.empezo ? '<div class="gy-acc">' + (L.cancelada ? '<button class="co-copy-btn cv-sec-btn gy-btn2" data-gyc="reabrir">Volver a darla</button>'
      : '<button class="cv-link gy-peligro" data-gyc="cancelar-fecha">Cancelar esta fecha</button>') + '</div>' : '') + '</section>';
  const marca = !L.cancelada && L.se_marca;
  const fila = a => {
    const quitar = O.anotar && !L.termino ? '<button class="cv-link gy-peligro" data-gyc="quitar" data-id="' + esc(a.reserva) + '">Sacar</button>' : '';
    const extra = [a.sin_app ? '<span class="gy-tag">Sin app</span>' : '', a.promovida ? '<span class="gy-tag">Salió de la espera</span>' : ''].join("");
    if (a.estado === "espera") return '<li class="gy-cl-al"><span class="gy-cl-pos">' + a.posicion + '</span>' + fotoHtml(a.foto_path, a.nombre) + '<span class="gy-cl-al-t"><b>' + esc(a.nombre || "Sin nombre") + '</b>' + extra + '</span>' + quitar + '</li>';
    const auto = a.marcado === null || a.marcado === undefined;
    const estado = a.presente ? '<span class="gy-sem verde"><i aria-hidden="true"></i>Presente' + (auto && a.ingreso ? ' (entró ' + esc(horaAR(a.ingreso)) + ')' : '') + '</span>'
      : L.empezo ? '<span class="gy-sem ' + (a.marcado === false ? 'rojo' : 'gris') + '"><i aria-hidden="true"></i>' + (a.marcado === false ? 'Ausente' : 'Sin presente') + '</span>' : '';
    const botones = marca ? '<span class="gy-cl-pres" role="group" aria-label="Presente de ' + esc(a.nombre || "") + '">' +
      '<button class="gy-chip' + (a.marcado === true ? ' on' : '') + '" data-gyc="presente" data-id="' + esc(a.reserva) + '" data-v="' + (a.marcado === true ? '' : '1') + '" aria-pressed="' + (a.marcado === true) + '"' + (KS.busy === a.reserva ? ' disabled' : '') + '>Presente</button>' +
      '<button class="gy-chip' + (a.marcado === false ? ' on' : '') + '" data-gyc="presente" data-id="' + esc(a.reserva) + '" data-v="' + (a.marcado === false ? '' : '0') + '" aria-pressed="' + (a.marcado === false) + '"' + (KS.busy === a.reserva ? ' disabled' : '') + '>Ausente</button></span>' : '';
    return '<li class="gy-cl-al">' + fotoHtml(a.foto_path, a.nombre) + '<span class="gy-cl-al-t"><b>' + esc(a.nombre || "Sin nombre") + '</b>' + extra + estado + '</span>' + botones + quitar + '</li>';
  };
  const confHtml = '<section class="cv-card gy-sec"><h3 class="gy-h3">Con lugar</h3>' + (conf.length ? '<ul class="gy-cl-als">' + conf.map(fila).join("") + '</ul>' : '<p class="gy-fino">Todavía nadie reservó.</p>') +
    (!L.cancelada && !marca && !L.termino ? '<p class="gy-fino">El presente se marca desde una hora antes. Si nadie lo marca, cuenta el ingreso al gimnasio en el horario de la clase.</p>' : '') + '</section>';
  const espHtml = esp.length ? '<section class="cv-card gy-sec"><h3 class="gy-h3">Lista de espera</h3><ul class="gy-cl-als">' + esp.map(fila).join("") + '</ul>' +
    '<p class="gy-fino">Si se libera un lugar, pasa el primero y le llega un aviso.</p></section>' : '';
  return volver + cab + confHtml + espHtml + (O.anotar && !L.cancelada && !L.termino ? anotar() : '');
}
// Anotar a un socio desde el mostrador (también uno sin app).
function anotar(){
  const res = KS.res;
  let r = "";
  if (KS.q.trim().length >= 2){
    if (res === null) r = '<p class="gy-fino" aria-busy="true">Buscando…</p>';
    else if (res.error) r = '<p class="gy-fino">' + esc(res.error) + '</p>';
    else if (!res.length) r = '<p class="gy-fino">Nadie con «' + esc(KS.q.trim()) + '».</p>';
    else {
      const ya = new Set(((KS.lista || {}).alumnos || []).map(a => a.ficha));
      r = '<ul class="gy-cl-als">' + res.map(s => '<li class="gy-cl-al">' + fotoHtml(s.foto_path, s.nombre) + '<span class="gy-cl-al-t"><b>' + esc(s.nombre || "") + '</b></span>' +
        (ya.has(s.id) ? '<span class="gy-fino">Ya está</span>' : '<button class="co-copy-btn cv-sec-btn gy-btn2" data-gyc="anotar" data-id="' + esc(s.id) + '"' + (KS.busy ? ' disabled' : '') + '>Anotar</button>') + '</li>').join("") + '</ul>';
    }
  }
  return '<section class="cv-card gy-sec"><h3 class="gy-h3">Anotar a un socio</h3>' +
    '<label class="gy-f"><span>Nombre o DNI</span><input class="co-note" type="search" data-gyc-q="1" autocomplete="off" value="' + esc(KS.q) + '"></label>' + r +
    '<p class="gy-fino">Para quien no usa la app o reserva en el mostrador. Si la clase está llena, queda en la lista de espera.</p></section>';
}

// ---- La grilla (dueño y administración) ----
const nombreDia = n => DIAS[n] || "";
function grilla(){
  const L = KS.grilla;
  const cab = '<h2 class="gy-h">La grilla</h2>';
  if (L === null) return '<section class="cv-card gy-sec">' + cab + '<p class="gy-fino">Cargando…</p></section>';
  if (!L.length) return '<section class="cv-card gy-sec">' + cab + '<p class="gy-p">Cada clase se repite todas las semanas, el mismo día y a la misma hora.</p></section>';
  return '<section class="cv-card gy-sec">' + cab + '<ul class="gy-tipos">' + L.map(c =>
    '<li class="' + (c.archivada ? 'gy-tipo-arch' : '') + '"><div class="gy-tipo-t"><b>' + esc(c.nombre) + '</b><span>' + esc(nombreDia(c.dia)) + ' ' + esc(c.hora) + ' · ' + c.duracion + ' min · cupo ' + c.cupo +
      (c.sala ? ' · ' + esc(c.sala) : '') + ' · ' + (c.profe ? esc(c.profe.name || "") : "sin profe") + (c.archivada ? ' · archivada' : '') + '</span></div>' +
      (c.archivada ? '' : '<div class="gy-td-acc"><button class="cv-link" data-gyc="editar" data-id="' + esc(c.id) + '">Cambiar</button><button class="cv-link gy-peligro" data-gyc="archivar" data-id="' + esc(c.id) + '">Archivar</button></div>') + '</li>').join("") +
    '</ul><p class="gy-fino">Archivar una clase la saca de la grilla; si alguien había reservado una fecha que venía, se cancela y le llega un aviso.</p></section>';
}
function reservas(){
  const c = (KS.semana && KS.semana.cfg) || { reservar_horas: 0, cancelar_horas: 2, dias: 7, cuota_bloquea: false };
  const num = (k, v, min, max, txt, sub) => '<label class="gy-f"><span>' + txt + '</span><span class="gy-horas"><input class="co-note" type="number" min="' + min + '" max="' + max + '" step="1" inputmode="numeric" data-gyc-cfg="' + k + '" value="' + esc(String(v)) + '"> ' + sub + '</span></label>';
  return '<section class="cv-card gy-sec"><h2 class="gy-h">Cómo se reserva</h2>' +
    num("clases_dias", c.dias, 1, 28, "Se ve y se reserva hasta", "días para adelante") +
    num("clases_reservar_horas", c.reservar_horas, 0, 72, "Las reservas cierran", "horas antes (0: cuando empieza)") +
    num("clases_cancelar_horas", c.cancelar_horas, 0, 72, "Se puede cancelar hasta", "horas antes") +
    '<label class="gy-sw"><span class="gy-sw-t"><b>No reservar con la cuota vencida</b><span>Quien tiene la cuota vencida ve las clases pero no puede reservar hasta que pague.</span></span>' +
      '<input type="checkbox" role="switch" data-gyc-cfg="clases_cuota_bloquea"' + (c.cuota_bloquea ? ' checked' : '') + '><i aria-hidden="true"></i></label></section>';
}
function formulario(){
  const f = KS.form;
  const profes = (GS.equipo || []).filter(p => ["owner", "admin", "profe"].includes(p.rol) && (p.coach || p.rol === "profe"));
  const listo = String(f.nombre || "").trim().length >= 2 && f.hora && Number(f.cupo) >= 1 && Number(f.duracion) >= 15;
  return '<section class="cv-card gy-sec gy-cl-form" aria-label="' + (f.id ? "Cambiar la clase" : "Nueva clase") + '"><h2 class="gy-h">' + (f.id ? "Cambiar la clase" : "Nueva clase") + '</h2><div class="gy-form">' +
    '<label class="gy-f"><span>Nombre</span><input class="co-note" type="text" maxlength="60" data-gyc-f="nombre" value="' + esc(f.nombre || "") + '" placeholder="Por ejemplo: Spinning"></label>' +
    '<label class="gy-f"><span>Profe</span><select class="gy-sel" data-gyc-f="profe"><option value="">Sin profe</option>' +
      profes.map(p => '<option value="' + esc(p.user_id) + '"' + (f.profe === p.user_id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join("") + '</select></label>' +
    '<label class="gy-f"><span>Día</span><select class="gy-sel" data-gyc-f="dia"' + (f.id ? ' disabled' : '') + '>' + [1, 2, 3, 4, 5, 6, 7].map(n => '<option value="' + n + '"' + (Number(f.dia) === n ? ' selected' : '') + '>' + DIAS[n] + '</option>').join("") + '</select></label>' +
    '<label class="gy-f"><span>Hora</span><input class="co-note" type="time" step="300" data-gyc-f="hora" value="' + esc(f.hora || "") + '"></label>' +
    '<label class="gy-f"><span>Duración (minutos)</span><input class="co-note" type="number" min="15" max="240" step="5" inputmode="numeric" data-gyc-f="duracion" value="' + esc(String(f.duracion || "")) + '"></label>' +
    '<label class="gy-f"><span>Cupo</span><input class="co-note" type="number" min="1" max="500" step="1" inputmode="numeric" data-gyc-f="cupo" value="' + esc(String(f.cupo || "")) + '"></label>' +
    '<label class="gy-f"><span>Sala (opcional)</span><input class="co-note" type="text" maxlength="60" data-gyc-f="sala" value="' + esc(f.sala || "") + '"></label>' +
    (f.id ? '' : '<label class="gy-f"><span>Desde</span><input class="co-note" type="date" data-gyc-f="desde" min="' + hoyAR() + '" value="' + esc(f.desde || hoyAR()) + '"></label>') +
    '</div>' + (f.id ? '<p class="gy-fino">El día no se cambia: para otro día, archivá esta y creá otra. Si cambiás la hora, vale para las fechas que vienen; si subís el cupo, pasan los que esperaban.</p>' : '<p class="gy-fino">Se repite todas las semanas, el mismo día y a la misma hora.</p>') +
    '<div class="gy-acc"><button class="gize-btn cv-btn" data-gyc="guardar"' + (listo && !KS.busy ? '' : ' disabled') + '>' + (KS.busy === "guardar" ? "Guardando…" : "Guardar") + '</button>' +
      '<button class="co-copy-btn cv-sec-btn gy-btn2" data-gyc="form-cerrar">Cancelar</button></div></section>';
}

// ---- Acciones ----
async function hacer(clave, f){
  if (KS.busy) return;
  KS.busy = clave; repintar();
  try { return await f(); } finally { KS.busy = ""; repintar(); }
}
async function guardar(){
  const f = KS.form; if (!f) return;
  const datos = { nombre: String(f.nombre || "").trim(), profe: f.profe || null, hora: f.hora, duracion: Number(f.duracion), cupo: Number(f.cupo), sala: String(f.sala || "").trim() };
  if (!f.id){ datos.dia = Number(f.dia); datos.desde = f.desde || hoyAR(); }
  await hacer("guardar", async () => {
    const r = await rpc("gym_clase_guardar", { id: f.id || null, datos });
    if (r.error) return alert(r.msg);
    KS.form = null; cargarGrilla(); cargarSemana();
  });
}
let relojQ = null, seqQ = 0;
function buscarAnotar(q){
  KS.q = q; clearTimeout(relojQ);
  if (q.trim().length < 2){ KS.res = null; pintarAnotar(); return; }
  KS.res = null; pintarAnotar();
  relojQ = setTimeout(async () => {
    const n = ++seqQ;
    const r = await rpc("buscar_socio", { q: q.trim() });
    if (n !== seqQ) return;
    KS.res = r.error ? { error: r.msg } : (Array.isArray(r.data) ? r.data.filter(s => s.estado === "activo" || s.estado === "visita") : []);
    pintarAnotar();
    if (Array.isArray(KS.res)) pedirFotos(KS.res.map(s => s.foto_path)).then(ok => { if (ok) pintarAnotar(); });
  }, 280);
}
// Redibuja todo sin perder lo escrito en el buscador.
function pintarAnotar(){
  const a = document.activeElement, en = a && a.matches && a.matches("input[data-gyc-q]"), ini = en ? a.selectionStart : null;
  repintar();
  if (en){ const i = document.querySelector("input[data-gyc-q]"); if (i){ i.focus({ preventScroll: true }); try { i.setSelectionRange(ini, ini); } catch (e) {} } }
}
function guardarFoco(){
  const a = document.activeElement;
  return a && a.dataset && (a.dataset.gycF || a.dataset.gycCfg) ? (a.dataset.gycF ? '[data-gyc-f="' + a.dataset.gycF + '"]' : '[data-gyc-cfg="' + a.dataset.gycCfg + '"]') : null;
}

document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("[data-gyc]");
  if (!b || b.disabled) return;
  const a = b.dataset.gyc, id = b.dataset.id;
  if (a === "semana"){ const n = Number(b.dataset.v); KS.desde = n ? masDias(desde(), n) : null; KS.semana = null; repintar(); cargarSemana(); return; }
  if (a === "reintentar"){ KS.error = ""; cargarClases(); return; }
  if (a === "abrir"){ KS.sel = { clase: id, fecha: b.dataset.f }; KS.lista = null; KS.listaError = ""; KS.q = ""; KS.res = null; repintar(); cargarLista(); try { (document.getElementById("coachHost") || window).scrollTo(0, 0); } catch (er) {} return; }
  if (a === "volver"){ KS.sel = null; KS.lista = null; repintar(); cargarSemana(); return; }
  if (a === "nueva"){ KS.form = { id: null, nombre: "", profe: "", dia: diaSemana(hoyAR()), hora: "", duracion: 60, cupo: 20, sala: "", desde: hoyAR() }; equipo(); repintar();
    const i = document.querySelector('[data-gyc-f="nombre"]'); if (i) i.focus(); return; }
  if (a === "editar"){
    const c = (KS.grilla || []).find(x => x.id === id); if (!c) return;
    KS.form = { id: c.id, nombre: c.nombre, profe: c.profe ? c.profe.id : "", dia: c.dia, hora: c.hora, duracion: c.duracion, cupo: c.cupo, sala: c.sala || "" }; equipo(); repintar();
    try { (document.getElementById("coachHost") || window).scrollTo(0, 0); } catch (er) {}
    return;
  }
  if (a === "form-cerrar"){ KS.form = null; repintar(); return; }
  if (a === "guardar") return guardar();
  if (a === "archivar"){
    const c = (KS.grilla || []).find(x => x.id === id);
    if (!await confirmar("¿Archivar «" + (c ? c.nombre : "la clase") + "»? Sale de la grilla. Si alguien reservó una fecha que viene, se cancela y le llega un aviso.", { ok: "Archivar" })) return;
    const r = await rpc("gym_clase_archivar", { id });
    if (r.error) return alert(r.msg);
    if (r.data && r.data.avisados) alert("Listo. " + plural(r.data.avisados, "persona tenía", "personas tenían") + " reserva: les llegó un aviso.");
    cargarGrilla(); cargarSemana(); return;
  }
  const s = KS.sel;
  if (a === "cancelar-fecha" && s){
    const mot = await pedir("¿Cancelar " + ((KS.lista && KS.lista.clase && KS.lista.clase.nombre) || "la clase") + " del " + diaLargo(s.fecha).toLowerCase() + "? A quien reservó le llega un aviso. Las demás semanas siguen igual.\n\nMotivo (opcional, lo ven los socios):", "", { titulo: "Cancelar esta fecha", ok: "Cancelar la clase", peligro: true });
    if (mot === null) return;
    const r = await rpc("gym_clase_cancelar", { clase: s.clase, dia: s.fecha, motivo: mot || null, cancelar: true });
    if (r.error) return alert(r.msg);
    cargarLista(); return;
  }
  if (a === "reabrir" && s){
    const r = await rpc("gym_clase_cancelar", { clase: s.clase, dia: s.fecha, motivo: null, cancelar: false });
    if (r.error) return alert(r.msg);
    cargarLista(); return;
  }
  if (a === "presente"){
    const v = b.dataset.v === "1" ? true : b.dataset.v === "0" ? false : null;
    await hacer(id, async () => {
      const r = await rpc("gym_clase_presente", { reserva: id, presente: v });
      if (r.error) return alert(r.msg);
      const al = ((KS.lista || {}).alumnos || []).find(x => x.reserva === id);
      if (al && r.data){ al.marcado = r.data.marcado; al.presente = r.data.presente; }
    });
    const otro = document.querySelector('[data-gyc="presente"][data-id="' + id + '"][data-v="' + (v === true ? "" : v === false ? "" : "1") + '"]');
    if (otro) otro.focus({ preventScroll: true });
    return;
  }
  if (a === "quitar"){
    const al = ((KS.lista || {}).alumnos || []).find(x => x.reserva === id);
    if (!await confirmar("¿Sacar a " + ((al && al.nombre) || "esta persona") + " de la clase?" + (al && al.estado === "confirmada" ? " Si alguien espera, pasa a tener lugar." : ""), { ok: "Sacar" })) return;
    const r = await rpc("gym_clase_quitar", { reserva: id });
    if (r.error) return alert(r.msg);
    cargarLista(); return;
  }
  if (a === "anotar" && s){
    await hacer("anotar", async () => {
      const r = await rpc("gym_clase_anotar", { clase: s.clase, dia: s.fecha, ficha: id });
      if (r.error) return alert(r.msg);
      if (r.data && r.data.estado === "espera") alert("La clase está llena: quedó en la lista de espera (lugar " + r.data.posicion + ").");
      KS.q = ""; KS.res = null;
      await cargarLista();
    });
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (!t || !t.dataset) return;
  if (t.dataset.gycQ) return buscarAnotar(t.value);
  if (t.dataset.gycF && KS.form){
    KS.form[t.dataset.gycF] = t.value;
    const g = document.querySelector('[data-gyc="guardar"]'), f = KS.form;
    if (g) g.disabled = !(String(f.nombre || "").trim().length >= 2 && f.hora && Number(f.cupo) >= 1 && Number(f.duracion) >= 15) || !!KS.busy;
  }
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (!t || !t.dataset) return;
  if (t.dataset.gycF && KS.form){ KS.form[t.dataset.gycF] = t.value; return; }
  const k = t.dataset.gycCfg; if (!k) return;
  const v = t.type === "checkbox" ? t.checked : parseInt(t.value, 10);
  if (t.type !== "checkbox" && !Number.isFinite(v)) return;
  const foco = guardarFoco();
  const r = await rpc("gym_clases_config", { patch: { [k]: v } });
  if (r.error){ alert(r.msg); repintar(); return; }
  if (KS.semana && r.data && r.data.clases) KS.semana.cfg = r.data.clases;
  repintar();
  if (foco){ const el = document.querySelector(foco); if (el) el.focus({ preventScroll: true }); }
});

// Empezar de cero (otra cuenta).
export function limpiar(){ Object.assign(KS, { desde: null, semana: null, error: "", sel: null, lista: null, listaError: "", grilla: null, form: null, q: "", res: null, busy: "" }); }
