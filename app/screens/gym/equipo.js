// Profes (el equipo, SPEC §2.4) y aceptar una invitación (#equipo=, §1.3).
// Pestañas Profes · Administración · Recepción; arriba «N de M profes sin cargo»; cada persona con su
// foto, rol, socios asignados, última vez y versión de la app; las invitaciones sin aceptar con
// [Link nuevo] y [Anular]. [Invitar]: el rol y qué va a poder hacer, después el link para copiar o
// mandar por WhatsApp (el mail llega en la etapa 2). El detalle: sus socios con «Pasar todos a…»,
// [Cambiar rol] y [Quitar del gimnasio], que no se confirma sin elegir a quién pasan sus socios.
import { esc } from '../../core/utils.js';
import { avatarHtml } from '../../core/avatar.js';
import { appNativa } from '../../core/tienda.js';
import { GS, info, gym, yo, esDueno, enApp, fecha, cuando, iniciales, plural, waLink, APP_URL } from './estado.js';
import { cabeza, btn, btn2, vacio, cargando } from './marco.js';
import { ROLES, rolNombre } from './textos.js';
import { profesDelEquipo } from './socios.js';

const TABS = [["profe", "Profes"], ["admin", "Administración"], ["recepcion", "Recepción"]];
export const linkEquipo = (token, rol) => APP_URL + "#equipo=" + token + "&rol=" + rol;
// En las apps, sin hablar de lo que cuesta o no (nada del plan de GIZE).
const puede = r => enApp() ? ROLES[r].puede.replace(" Entra sin cargo con su cuenta de coach.", " Entra con su cuenta de coach.").replace(" Ve el estado del plan de GIZE pero no lo cambia, y no puede cerrar el gimnasio.", " No puede cerrar el gimnasio.") : ROLES[r].puede;
const enTab = (p, tab) => tab === "admin" ? (p.rol === "admin" || p.rol === "owner") : p.rol === tab;

export function topeTxt(){
  const pl = info().plan || {};
  if (pl.profes_tope == null) return "";
  return enApp() ? plural(pl.profes_usados || 0, "profe", "profes") + " de " + pl.profes_tope + " lugares para profes"
    : (pl.profes_usados || 0) + " de " + pl.profes_tope + " profes sin cargo en tu plan";
}

function persona(p){
  const vieja = p.app_vieja ? ' <i class="gy-tag gy-tag-ambar">versión vieja</i>' : '';
  const app = p.app_platform && p.app_platform !== "web" ? (p.app_platform === "ios" ? "iPhone" : "Android") + " " + esc(String(p.app_version || "").split(" ")[0]) : "Web";
  return '<button class="gy-row gy-row-eq" data-gym="eq-abrir" data-id="' + esc(p.user_id) + '">' +
    '<div class="gy-td gy-td-socio">' + avatarHtml(p.avatar_path, iniciales(p.nombre), "gy-av") + '<div class="gy-socio-t"><b>' + esc(p.nombre || "Sin nombre") + (p.user_id === yo() ? ' <span class="gy-mut">(vos)</span>' : '') + '</b><span class="gy-fino">' + esc(rolNombre(p.rol)) + '</span></div></div>' +
    '<div class="gy-td" data-l="Socios">' + (p.rol === "recepcion" ? '<span class="gy-mut">—</span>' : plural(p.socios || 0, "socio", "socios")) + '</div>' +
    '<div class="gy-td" data-l="Última vez">' + (p.last_seen_at ? cuando(p.last_seen_at) : '<span class="gy-mut">—</span>') + '</div>' +
    '<div class="gy-td" data-l="App">' + app + vieja + '</div>' +
    '<div class="gy-td" data-l="Estado"><span class="gy-estado activo">Activo</span></div></button>';
}
function invitacion(i){
  const puede = !(i.role === "admin" && !esDueno());
  return '<div class="gy-row gy-row-eq gy-inv"><div class="gy-td gy-td-socio"><span class="gy-av" aria-hidden="true">?</span><div class="gy-socio-t"><b>Invitación de ' + esc(ROLES[i.role] ? ROLES[i.role].corto : i.role) + '</b><span class="gy-fino">Enviada el ' + fecha(i.created_at) + ' · vence el ' + fecha(i.expires_at) + '</span></div></div>' +
    '<div class="gy-td gy-td-acc">' + (puede ? btn2('data-gym="inv-nuevo" data-id="' + esc(i.id) + '" data-rol="' + esc(i.role) + '"', "Copiar link nuevo") + '<button class="gy-btn-anular" data-gym="inv-anular" data-id="' + esc(i.id) + '">Anular</button>' : '') + '</div>' +
    '<div class="gy-td" data-l="Estado"><span class="gy-estado pausado">Invitación enviada</span></div></div>';
}

export function renderEquipo(){
  const L = GS.equipo, tab = GS.equipoTab;
  const head = cabeza("Profes", btn('data-gym="invitar"', "Invitar"), esc(topeTxt()));
  if (L === null) return head + (GS.equipoError ? vacio(esc(GS.equipoError), btn2('data-gym="reintentar"', "Reintentar")) : cargando("Cargando el equipo…"));
  if (GS.equipoSel) return head + detalle(L.find(p => p.user_id === GS.equipoSel));
  const inv = GS.invitaciones || [];
  const tabs = '<div class="cv-pills gy-tabs" role="tablist">' + TABS.map(t => {
    const n = L.filter(p => enTab(p, t[0])).length + inv.filter(i => i.role === t[0]).length;
    return '<button class="cv-pill' + (tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (tab === t[0]) + '" data-gym="eq-tab" data-v="' + t[0] + '">' + t[1] + (n ? ' <span class="gy-n">' + n + '</span>' : '') + '</button>';
  }).join("") + '</div>';
  const filas = L.filter(p => enTab(p, tab)).map(persona).concat(inv.filter(i => i.role === tab).map(invitacion));
  const sinNadie = tab === "profe" && !L.some(p => p.rol === "profe") && !inv.some(i => i.role === "profe");
  const cuerpo = sinNadie ? vacio((enApp() ? "Sumá a tus profes." : "Sumá a tus profes: entran sin cargo.") + " Cada uno ve a sus socios y vos ves lo que tus socios compartan.", btn('data-gym="invitar" data-v="profe"', "Invitar profe"))
    : filas.length ? '<div class="cv-card gy-tabla gy-tabla-eq">' + filas.join("") + '</div>' : vacio("Nadie en " + (tab === "admin" ? "la administración" : "la recepción") + " todavía.", btn2('data-gym="invitar" data-v="' + tab + '"', "Invitar"));
  return head + tabs + cuerpo;
}

// Lo elegido en «Pasar todos a» y en «Rol» (GS.pasarA, GS.rolNuevo) sigue elegido en cada redibujo:
// si no, se veía la opción de siempre y el botón usaba la elegida antes.
const sel = si => si ? ' selected' : '';
function detalle(p){
  if (!p) return vacio("Esa persona ya no está en el equipo.", '<button class="cv-link" data-gym="eq-cerrar">Volver</button>');
  const socios = (GS.socios || []).filter(s => s.profe && s.profe.id === p.user_id && (s.estado === "activo" || s.estado === "pausado"));
  const otros = profesDelEquipo().filter(x => x.user_id !== p.user_id);
  const yoMismo = p.user_id === yo(), dueno = p.rol === "owner";
  const puedeTocar = !dueno && !(p.rol === "admin" && !esDueno() && !yoMismo);
  const roles = ["profe", "admin", "recepcion"].filter(r => r !== p.rol && (r !== "admin" || esDueno()) && (r !== "profe" || p.coach));
  return '<div class="co-head cv-chead"><button class="co-back cv-back" data-gym="eq-cerrar" aria-label="Volver" title="Volver">‹</button>' + avatarHtml(p.avatar_path, iniciales(p.nombre), "gy-av gy-av-l") +
    '<div class="cv-cname"><div class="co-client-name">' + esc(p.nombre || "Sin nombre") + '</div><div class="gy-fino">' + esc(rolNombre(p.rol)) + ' · desde el ' + fecha(p.joined_at) + '</div></div></div>' +
    '<div class="gy-ficha"><div class="gy-ficha-col">' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Sus socios</h2>' + (socios.length ? '<ul class="gy-ul">' + socios.map(s => '<li><button class="cv-link" data-gym="abrir" data-id="' + esc(s.id) + '">' + esc(s.nombre) + '</button></li>').join("") + '</ul>' +
      ('<div class="gy-acc"><label class="gy-f gy-f-in"><span>Pasar todos a</span><select class="gy-sel" data-gym-in="pasar-a"><option value="">Elegí…</option><option value="-"' + sel(GS.pasarA === "-") + '>Sin profe</option>' +
        otros.map(o => '<option value="' + esc(o.user_id) + '"' + sel(GS.pasarA === o.user_id) + '>' + esc(o.nombre) + '</option>').join("") + '</select></label>' + btn2('data-gym="eq-pasar" data-id="' + esc(p.user_id) + '"', "Pasar") + '</div>')
      : '<p class="gy-fino">' + (p.rol === "recepcion" ? "La recepción no tiene socios asignados." : "No tiene socios asignados.") + '</p>') + '</section></div>' +
    '<div class="gy-ficha-col"><section class="cv-card gy-sec"><h2 class="gy-h">En el gimnasio</h2>' +
      (puedeTocar && roles.length ? '<div class="gy-acc"><label class="gy-f gy-f-in"><span>Rol</span><select class="gy-sel" data-gym-in="rol-nuevo"><option value="">' + esc(rolNombre(p.rol)) + '</option>' +
        roles.map(r => '<option value="' + r + '"' + sel(GS.rolNuevo === r) + '>' + esc(rolNombre(r)) + '</option>').join("") + '</select></label>' + btn2('data-gym="eq-rol" data-id="' + esc(p.user_id) + '"', "Cambiar rol") + '</div>' : '') +
      (puedeTocar ? '<div class="gy-acc"><button class="cv-link gy-peligro" data-gym="eq-quitar" data-id="' + esc(p.user_id) + '">' + (yoMismo ? "Dejar el gimnasio" : "Quitar del gimnasio") + '</button></div>' : '<p class="gy-fino">' + (dueno ? "Al dueño no se le cambia el rol ni se lo quita." : "La administración no cambia a otra persona de la administración.") + '</p>') +
    '</section></div></div>';
}

// ---- Ventanas ----
export function ventanaInvitar(m){
  const rol = m.rol || "profe";
  const roles = ["profe", "admin", "recepcion"].filter(r => r !== "admin" || esDueno());
  if (m.creada){
    const url = linkEquipo(m.creada.token, rol), r = ROLES[rol];
    const txt = "Hola! Te invito a sumarte a " + (gym().name || "nuestro gimnasio") + " en GIZE como " + r.corto + ". Abrí este link para aceptar: " + url;
    return '<div class="gy-modal-h"><h2>Invitar · ' + esc(r.nombre) + '</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
      '<p class="gy-p">Mandale este link. Vale 7 días (hasta el ' + fecha(m.creada.expires_at) + ') y sirve una sola vez.</p>' +
      '<div class="gy-codigo gy-link"><span class="gy-url">' + esc(url) + '</span></div>' +
      '<div class="gy-acc">' + btn2('data-gym="copiar" data-v="' + esc(url) + '"', "Copiar link") + '<a class="gize-btn cv-btn" href="' + esc(waLink(txt)) + '" target="_blank" rel="noopener">Abrir WhatsApp</a></div>' +
      (rol !== "recepcion" ? '<p class="gy-fino">' + (appNativa() ? "Si todavía no tiene cuenta de coach, la crea desde gize.ar en la compu." : "Si todavía no tiene cuenta, la crea al abrir el link (como coach).") + '</p>' : '<p class="gy-fino">Si todavía no tiene cuenta, la crea al abrir el link.</p>');
  }
  return '<div class="gy-modal-h"><h2>Invitar al equipo</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<div class="gy-radios" role="radiogroup" aria-label="Rol">' + roles.map(r => '<label class="gy-radio' + (r === rol ? ' on' : '') + '"><input type="radio" name="gyRol" value="' + r + '" data-gym-in="inv-rol"' + (r === rol ? ' checked' : '') + '><b>' + ROLES[r].nombre + '</b><span>' + puede(r) + '</span></label>').join("") + '</div>' +
    (topeTxt() && rol !== "recepcion" ? '<p class="gy-fino">' + esc(topeTxt()) + '.</p>' : '') +
    '<div class="gy-acc">' + btn('data-gym="inv-crear"' + (GS.busy ? ' disabled' : ''), GS.busy === "invitar" ? "Creando el link…" : "Crear link de invitación") + '</div>';
}

// Quitar del gimnasio: obliga a elegir a dónde van sus socios (otro profe o «sin profe»).
export function ventanaQuitar(m){
  const p = (GS.equipo || []).find(x => x.user_id === m.id) || {};
  const n = (GS.socios || []).filter(s => s.profe && s.profe.id === p.user_id && (s.estado === "activo" || s.estado === "pausado")).length || p.socios || 0;
  const otros = profesDelEquipo().filter(x => x.user_id !== p.user_id);
  const listo = !n || m.a !== undefined;
  return '<div class="gy-modal-h"><h2>' + (p.user_id === yo() ? "Dejar el gimnasio" : "Quitar a " + esc(p.nombre || "esta persona")) + '</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    (n ? '<p class="gy-p">Tiene ' + plural(n, "socio asignado", "socios asignados") + '. Elegí a quién pasan (es obligatorio):</p>' +
      '<div class="gy-radios" role="radiogroup" aria-label="A quién pasan sus socios">' +
      otros.map(o => '<label class="gy-radio' + (m.a === o.user_id ? ' on' : '') + '"><input type="radio" name="gyA" value="' + esc(o.user_id) + '" data-gym-in="quitar-a"' + (m.a === o.user_id ? ' checked' : '') + '><b>' + esc(o.nombre) + '</b><span>' + esc(rolNombre(o.rol)) + '</span></label>').join("") +
      '<label class="gy-radio' + (m.a === null ? ' on' : '') + '"><input type="radio" name="gyA" value="" data-gym-in="quitar-a"' + (m.a === null ? ' checked' : '') + '><b>Sin profe</b><span>Quedan en el gimnasio sin profe hasta que les asignes uno.</span></label></div>'
      : '<p class="gy-p">No tiene socios asignados.</p>') +
    '<p class="gy-fino">Deja de ver a los socios del gimnasio y sus chats. Sus alumnos propios (fuera del gimnasio) no cambian.</p>' +
    '<div class="gy-acc">' + btn('data-gym="quitar-ok"' + (listo && !GS.busy ? '' : ' disabled'), GS.busy === "quitar" ? "Quitando…" : (p.user_id === yo() ? "Dejar el gimnasio" : "Quitar del gimnasio"), "gize-btn cv-btn gy-btn-peligro") + '</div>';
}

// ---- Aceptar una invitación (#equipo=) ----
const ESTADO = {
  vencida: "La invitación venció o la anularon: pedile otra al gimnasio.",
  usada: "Esa invitación ya se usó: pedile otra al gimnasio.",
  ya_staff: "Ya sos del equipo de un gimnasio. En GIZE, cada persona es del equipo de un solo gimnasio.",
  es_socio: "Sos socio de un gimnasio: para sumarte al equipo, primero salí desde Ajustes → Tu gimnasio.",
  tope: "El gimnasio llegó al tope de profes. Escribinos para sumar más profes.",
  recepcion_coach: "Con tu cuenta de coach tenés alumnos: para la recepción usá otra cuenta (otro mail), así seguís atendiéndolos con esta.",
};
export function renderAceptar(){
  const a = GS.aceptar || {};
  const marco = c => '<div class="gy-solo"><div class="co-brand cv-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"></div><div class="cv-card gy-solo-card">' + c + '</div></div>';
  if (a.cargando || !a.info) return marco(a.error ? '<p class="gy-p">' + esc(a.error) + '</p>' + btn2('data-gym="aceptar-reintentar"', "Reintentar") + ' <button class="cv-link" data-gym="aceptar-no">Ahora no</button>' : '<p class="gy-p">Buscando la invitación…</p>');
  const i = a.info, r = ROLES[i.role] || { nombre: "", corto: "", puede: "" }, g = i.gym || {};
  const titulo = g.name ? '<h1 class="gy-solo-t">' + esc(g.name) + (g.city ? ' <span class="gy-mut">(' + esc(g.city) + ')</span>' : '') + ' te invitó como ' + esc(r.corto) + '</h1>' : '<h1 class="gy-solo-t">Invitación al equipo de un gimnasio</h1>';
  const salir = '<button class="cv-link" data-gym="aceptar-no">Ahora no</button>';
  let cuerpo;
  if (i.estado === "ok") cuerpo = '<p class="gy-p">' + esc(ROLES[i.role] ? puede(i.role) : "") + '</p><div class="gy-acc">' + btn('data-gym="aceptar-si"' + (GS.busy ? ' disabled' : ''), GS.busy === "aceptar" ? "Aceptando…" : "Aceptar") + salir + '</div>';
  else if (i.estado === "es_alumno") cuerpo = '<p class="gy-p">' + (i.role === "profe" ? "Para ser profe primero desvinculate de tu coach." : "Para sumarte al equipo del gimnasio primero desvinculate de tu coach en Ajustes.") + '</p><div class="gy-acc">' + salir + '</div>';
  else if (i.estado === "necesita_coach") cuerpo = '<p class="gy-p">Para ser profe necesitás una cuenta de coach.' +
    (appNativa() ? ' Creala desde gize.ar en la compu y después abrí este link de nuevo.' : ' Salí y creá una cuenta de coach con tu mail de trabajo, y después abrí este link de nuevo.') + '</p><div class="gy-acc">' + btn2('data-auth="logout"', "Salir") + salir + '</div>';
  else cuerpo = '<p class="gy-p">' + esc(ESTADO[i.estado] || "No se pudo usar esta invitación.") + '</p><div class="gy-acc">' + salir + '</div>';
  return marco(titulo + cuerpo);
}
