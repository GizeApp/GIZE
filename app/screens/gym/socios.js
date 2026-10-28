// Socios (SPEC §2.3, sin cuotas ni visitas): la lista sale de gym_socios_resumen. En la compu es una
// tabla y en el celular, tarjetas (el mismo marcado; lo cambia el CSS). Pestañas Socios · Solicitudes ·
// Bajas, filtros, buscador, acciones en grupo (asignar profe, pausar, exportar) y «Sumar socio»
// (compartir el código, cargar una ficha y mandarle el link).
import { esc } from '../../core/utils.js';
import { rolGym } from '../../core/gimnasio.js';
import { GS, gym, info, yo, soyCoach, fotoHtml, cuando, fecha, diasDesde, hoyAR, plural, APP_URL } from './estado.js';
import { cabeza, btn, btn2, vacio, cargando } from './marco.js';
import { renderSolicitudes } from './solicitudes.js';

export const ESTADOS = { activo: "Activo", pausado: "Pausado", baja: "De baja", visita: "Visita" };
export function estadoTxt(s){
  if (s.estado === "pausado") return "Pausado" + (s.paused_until ? " hasta el " + fecha(s.paused_until) : "");
  return ESTADOS[s.estado] || s.estado;
}
// Profe: nombre, «Sin profe» (ámbar) o «Coach externo» (sin nombre).
export function profeTxt(s){
  if (s.estado === "baja") return '<span class="gy-mut">—</span>';
  if (s.coach_externo) return '<span class="gy-tag">Coach externo</span>';
  if (s.profe) return esc(s.profe.name || "Profe");
  if (s.sin_app) return '<span class="gy-mut">Sin app</span>';
  return '<span class="gy-ambar">Sin profe</span>';
}
export const aptoVencido = s => !!(s.apto_medico_vence && s.apto_medico_vence < hoyAR());
export const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// ¿Puede ver «Último entreno»? Solo si compartió o es su socio asignado (lo decide el servidor: si no, viene null).
const entreno = s => s.ultimo_entreno ? cuando(s.ultimo_entreno) : '<span class="gy-mut">—</span>';

export function filtrar(lista){
  const f = GS.filtros, q = norm(f.q).trim(), qd = q.replace(/\D/g, "");
  return lista.filter(s => {
    if (GS.tab === "bajas" ? s.estado !== "baja" : s.estado === "baja") return false;
    if (q && !(norm(s.nombre).includes(q) || norm(s.email).includes(q) || (qd.length >= 3 && (String(s.dni || "").includes(qd) || String(s.phone || "").replace(/\D/g, "").includes(qd))))) return false;
    // En Bajas no se ven los filtros (ni «Sacar los filtros»): ahí solo cuenta lo buscado.
    if (GS.tab === "bajas") return true;
    if (f.profe && (f.profe === "-" ? !!(s.profe || s.coach_externo) : !(s.profe && s.profe.id === f.profe))) return false;
    if (f.estado && s.estado !== f.estado) return false;
    if (f.sinProfe && (s.profe || s.coach_externo || s.sin_app || s.estado === "baja")) return false;
    if (f.externo && !s.coach_externo) return false;
    if (f.noViene && !(s.ultimo_ingreso === null || diasDesde(s.ultimo_ingreso) >= 14)) return false;
    if (f.faltaConf && !s.falta_confirmacion) return false;
    if (f.sinApp && !s.sin_app) return false;
    if (f.fotoPend && !s.foto_pendiente) return false;
    if (f.aptoVencido && !aptoVencido(s)) return false;
    if (f.appVieja && !s.app_vieja) return false;
    if (f.mios && !(s.profe && s.profe.id === yo())) return false;
    return true;
  });
}

const CHIPS = [["sinProfe", "Sin profe"], ["externo", "Coach externo"], ["noViene", "No viene hace 14 días"], ["faltaConf", "Falta confirmación"],
  ["sinApp", "Sin app"], ["fotoPend", "Foto pendiente"], ["aptoVencido", "Apto vencido"], ["appVieja", "App vieja"]];

export function profesDelEquipo(){
  // Quien puede tener socios asignados: profes, y dueño o administración con cuenta de coach.
  return (GS.equipo || []).filter(p => p.rol === "profe" || ((p.rol === "owner" || p.rol === "admin") && p.coach));
}

function fila(s){
  const marcas = [s.sin_app ? "sin app" : "", s.falta_confirmacion ? "falta confirmación" : "", s.foto_pendiente ? "foto pendiente" : "", s.app_vieja ? "app vieja" : ""].filter(Boolean);
  const sel = GS.sel.has(s.id);
  return '<div class="gy-row' + (sel ? ' sel' : '') + '" data-gym="abrir" data-id="' + esc(s.id) + '" tabindex="0" role="row">' +
    '<label class="gy-td gy-td-chk" data-gym-no="1"><input type="checkbox" data-gym="elegir" data-id="' + esc(s.id) + '"' + (sel ? ' checked' : '') + ' aria-label="Elegir a ' + esc(s.nombre || "") + '"></label>' +
    '<div class="gy-td gy-td-socio">' + fotoHtml(s.foto_path, s.nombre) + '<div class="gy-socio-t"><b>' + esc(s.nombre || "Sin nombre") + '</b>' +
      (marcas.length ? '<span class="gy-marcas">' + marcas.map(m => '<i>' + m + '</i>').join("") + '</span>' : '') + '</div></div>' +
    '<div class="gy-td" data-l="Profe">' + profeTxt(s) + '</div>' +
    '<div class="gy-td" data-l="Último ingreso">' + (s.ultimo_ingreso ? cuando(s.ultimo_ingreso) : '<span class="gy-mut">Nunca</span>') + '</div>' +
    '<div class="gy-td" data-l="Último entreno">' + entreno(s) + '</div>' +
    '<div class="gy-td" data-l="Apto médico">' + (s.apto_medico_vence ? '<span class="' + (aptoVencido(s) ? 'gy-rojo' : '') + '">' + fecha(s.apto_medico_vence) + '</span>' : '<span class="gy-mut">—</span>') + '</div>' +
    '<div class="gy-td" data-l="Estado"><span class="gy-estado ' + esc(s.estado) + '">' + esc(estadoTxt(s)) + '</span></div>' +
  '</div>';
}

export function renderSocios(){
  const L = GS.socios, c = info().contadores || {};
  const nSol = GS.solicitudes ? GS.solicitudes.length : (c.solicitudes || 0);
  const nBajas = (L || []).filter(s => s.estado === "baja").length, nSoc = (L || []).filter(s => s.estado !== "baja").length;
  const tabs = '<div class="cv-pills gy-tabs" role="tablist">' + [["socios", "Socios", nSoc], ["solicitudes", "Solicitudes", nSol], ["bajas", "Bajas", nBajas]].map(t =>
    '<button class="cv-pill' + (GS.tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (GS.tab === t[0]) + '" data-gym="socios-tab" data-v="' + t[0] + '">' + t[1] + (t[2] ? ' <span class="gy-n">' + t[2] + '</span>' : '') + '</button>').join("") + '</div>';
  const head = cabeza("Socios", "");
  // «Sumar socio» va en la fila del buscador, a la derecha y bien a la vista.
  const sumar = btn('data-gym="sumar"', '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Sumar socio', "gize-btn cv-btn gy-sumar");
  const buscar = '<label class="cv-find gy-buscar"><input class="co-search cv-search" type="search" placeholder="Buscar por nombre, DNI, mail o teléfono" aria-label="Buscar socio" data-gym-in="q" value="' + esc(GS.filtros.q) + '"></label>';
  if (GS.tab === "solicitudes") return head + tabs + '<div class="gy-filtros-bar">' + buscar + sumar + '</div>' + renderSolicitudes();
  if (L === null) return head + tabs + (GS.sociosError ? vacio(esc(GS.sociosError), btn2('data-gym="reintentar"', "Reintentar")) : cargando("Cargando los socios…"));
  const f = GS.filtros, profes = profesDelEquipo();
  const chips = CHIPS.concat(soyCoach() ? [["mios", "Mis socios"]] : []);
  const nAct = chips.filter(([k]) => f[k]).length + (f.profe ? 1 : 0) + (f.estado ? 1 : 0), abierto = !!GS.filtrosAbierto;
  const filtros = GS.tab === "bajas" ? '<div class="gy-filtros-bar">' + buscar + sumar + '</div>' : '<div class="gy-filtros-bar">' + buscar + '<button class="gy-chip gy-filtros-btn' + (abierto || nAct ? ' on' : '') + '" data-gym="filtros-toggle" aria-expanded="' + abierto + '"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filtros' + (nAct ? ' <span class="gy-n">' + nAct + '</span>' : '') + '</button>' +
    (nAct ? '<button class="cv-link" data-gym="filtros-limpiar">Sacar los filtros</button>' : '') + sumar + '</div>' + (!abierto ? "" : '<div class="gy-filtros">' +
    '<select class="gy-sel" data-gym-in="profe" aria-label="Profe"><option value="">Todos los profes</option><option value="-"' + (f.profe === "-" ? " selected" : "") + '>Sin profe</option>' +
      profes.map(p => '<option value="' + esc(p.user_id) + '"' + (f.profe === p.user_id ? " selected" : "") + '>' + esc(p.nombre || "Profe") + '</option>').join("") + '</select>' +
    '<select class="gy-sel" data-gym-in="estado" aria-label="Estado"><option value="">Activos y pausados</option><option value="activo"' + (f.estado === "activo" ? " selected" : "") + '>Activos</option><option value="pausado"' + (f.estado === "pausado" ? " selected" : "") + '>Pausados</option></select>' +
    chips.map(([k, t]) => '<button class="gy-chip' + (f[k] ? ' on' : '') + '" data-gym="filtro" data-k="' + k + '" aria-pressed="' + !!f[k] + '">' + t + '</button>').join("") +
  '</div>');
  const lista = filtrar(L);
  const visibles = lista.map(s => s.id);
  GS.sel.forEach(id => { if (!visibles.includes(id)) GS.sel.delete(id); });
  const grupo = GS.sel.size ? '<div class="cv-card gy-grupo" role="toolbar" aria-label="Acciones con los elegidos"><b>' + plural(GS.sel.size, "elegido", "elegidos") + '</b>' +
    btn2('data-gym="grupo-asignar"', "Asignar profe") + btn2('data-gym="grupo-pausar"', "Pausar") + btn2('data-gym="grupo-exportar"', "Exportar CSV") +
    '<button class="cv-link" data-gym="grupo-limpiar">Quitar la selección</button></div>' : '';
  let cuerpo;
  if (!L.length) cuerpo = vacio("Todavía no hay socios. Compartí el código del gimnasio o cargalos a mano.", '<div class="gy-acc">' + btn('data-gym="sumar" data-v="codigo"', "Compartir código") + btn2('data-gym="sumar" data-v="ficha"', "Cargar socio") + '</div>');
  else if (!lista.length) cuerpo = vacio(GS.tab === "bajas" ? "No hay bajas." : "Ningún socio con esos filtros.", GS.tab === "bajas" ? "" : '<button class="cv-link" data-gym="filtros-limpiar">Sacar los filtros</button>');
  else cuerpo = '<div class="cv-card gy-tabla" role="table" aria-label="Socios">' +
    '<div class="gy-row gy-th" role="row"><label class="gy-td gy-td-chk"><input type="checkbox" data-gym="elegir-todos"' + (lista.length && lista.every(s => GS.sel.has(s.id)) ? ' checked' : '') + ' aria-label="Elegir todos"></label>' +
    '<div class="gy-td">Socio</div><div class="gy-td">Profe</div><div class="gy-td">Último ingreso</div><div class="gy-td">Último entreno</div><div class="gy-td">Apto médico</div><div class="gy-td">Estado</div></div>' +
    lista.map(fila).join("") + '</div><div class="gy-pie">' + plural(lista.length, "socio", "socios") + (lista.length !== L.filter(s => GS.tab === "bajas" ? s.estado === "baja" : s.estado !== "baja").length ? " con esos filtros" : "") + '</div>';
  return head + tabs + filtros + grupo + cuerpo;
}

// ---- «Sumar socio» ----
export const linkCodigo = code => APP_URL + "#codigo=" + encodeURIComponent(code || "");
export function ventanaSumar(m){
  const code = info().codigo || "", tab = m.tab || "codigo";
  const tabs = '<div class="cv-pills gy-tabs" role="tablist">' + [["codigo", "Compartir el código"], ["ficha", "Cargar una ficha"]].map(t =>
    '<button class="cv-pill' + (tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (tab === t[0]) + '" data-gym="sumar-tab" data-v="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>';
  let cuerpo;
  if (tab === "codigo") {
    cuerpo = '<p class="gy-p">Tus socios ponen este código en la app (Ajustes) o abren el link. Te llega el pedido a Socios → Solicitudes.</p>' +
      '<div class="gy-codigo"><span class="co-code">' + esc(code || "—") + '</span>' + btn2('data-gym="copiar" data-v="' + esc(code) + '"', "Copiar código") + '</div>' +
      '<div class="gy-codigo gy-link"><span class="gy-url">' + esc(linkCodigo(code)) + '</span>' + btn2('data-gym="copiar" data-v="' + esc(linkCodigo(code)) + '"', "Copiar link") + '</div>' +
      '<div class="gy-qr" data-gy-qr="' + esc(linkCodigo(code)) + '" data-tam="168"></div>' +
      '<p class="gy-fino">Este QR sirve para pedir sumarse; no controla el ingreso. Para imprimirlo, andá a Configuración → Código del gimnasio.</p>';
  } else if (m.creada) {
    const url = APP_URL + "#unirme=" + m.creada.token, txt = "Hola " + (m.creada.nombre || "").split(" ")[0] + "! Ya te cargamos en " + (gym().name || "el gimnasio") + ". Para usar la app GIZE, abrí este link: " + url;
    cuerpo = '<div class="gy-ok" role="status"><b>Listo: ' + esc(m.creada.nombre) + ' ya es socio.</b> Ocupa un lugar desde hoy.</div>' +
      '<p class="gy-p">Mandale el link para que use la app. Sirve una sola vez y vence en 7 días.</p>' +
      '<div class="gy-codigo gy-link"><span class="gy-url">' + esc(url) + '</span></div>' +
      '<div class="gy-acc"><a class="gize-btn cv-btn" href="' + esc("https://wa.me/" + String(m.creada.tel || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(txt)) + '" target="_blank" rel="noopener">Mandar por WhatsApp</a>' +
      btn2('data-gym="copiar" data-v="' + esc(url) + '"', "Copiar link") +
      '<label class="co-copy-btn cv-sec-btn gy-btn2 gy-foto-btn">Sacar foto<input type="file" accept="image/*" capture="user" data-gym-foto="' + esc(m.creada.id) + '" class="gy-foto-in"></label></div>' +
      '<button class="cv-link" data-gym="sumar-otra">Cargar otra ficha</button>';
  } else {
    const d = m.datos || {};
    const campo = (k, label, tipo, extra) => '<label class="gy-f"><span>' + label + '</span><input class="co-note" type="' + (tipo || "text") + '" data-gym-f="' + k + '" value="' + esc(d[k] || "") + '"' + (extra || "") + '></label>';
    cuerpo = '<p class="gy-p">Para quien todavía no usa GIZE. Queda como socio activo (ocupa un lugar) y después le mandás el link para que use la app.</p>' +
      '<div class="gy-form">' + campo("nombre", "Nombre y apellido", "text", ' autocomplete="off" required') + campo("dni", "DNI (opcional)", "text", ' inputmode="numeric"') +
      campo("telefono", "Teléfono", "tel") + campo("email", "Mail", "email") + campo("alta", "Fecha de alta", "date", ' max="' + hoyAR() + '"') +
      campo("apto_medico_vence", "Apto médico: vence el", "date") + '</div>' +
      // La recepción no asigna profes (no lee el equipo): lo hace la administración.
      '<p class="gy-fino">' + (rolGym() === "recepcion" ? "El profe se lo asigna la administración" : "El profe se lo asignás") + ' cuando empiece a usar la app. La foto la sacás en el paso que sigue.</p>' +
      '<div class="gy-acc">' + btn('data-gym="ficha-crear"' + (GS.busy ? ' disabled' : ''), GS.busy === "ficha" ? "Guardando…" : "Cargar socio") + '</div>';
  }
  return '<div class="gy-modal-h"><h2>Sumar socio</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' + tabs + cuerpo;
}
