// Cuotas del gimnasio (etapa 2; supabase/gimnasios-cuotas.sql). SIN COBRO ONLINE: GIZE no cobra; acá
// el gimnasio anota lo que le pagan en el mostrador (efectivo, transferencia u otro).
// - La pantalla «Cuotas» (dueño y administración): lo cobrado y lo que falta cobrar en el mes, los
//   socios por estado (vencidas, por vencer, sin pagos, al día, sin cuota) con [Registrar pago], los
//   tipos de cuota (crear, cambiar, archivar) y los pagos del mes en CSV.
// - La sección «Cuota» de la ficha del socio: su cuota (cambiarla), cuándo vence, [Registrar pago] y el
//   historial (con quién cargó cada pago; anular, solo dueño y administración).
// - La ventana «Registrar pago»: la abren la pantalla Cuotas, la ficha y la recepción (si puede cobrar).
//   El id del pago lo genera la app y se guarda mientras la ventana está abierta: tocar dos veces o
//   reintentar sin señal no anota dos.
// Los profes nunca ven montos: ven si la cuota está al día en el semáforo (recepción y su panel).
import { esc } from '../../core/utils.js';
import { GS, fecha, hoyAR, plural, plata, fotoHtml, puedeCobrar, manejaCuotas } from './estado.js';
import { cabeza, btn, btn2, vacio, cargando } from './marco.js';

export const MEDIOS = { efectivo: "Efectivo", transferencia: "Transferencia", otro: "Otro" };
export const CADA = { 1: "Mensual", 2: "Bimestral", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
const POR = { 1: "por mes", 2: "cada 2 meses", 3: "cada 3 meses", 6: "cada 6 meses", 12: "por año" };
export const ESTADO_CUOTA = { vencida: ["rojo", "Vencida"], por_vencer: ["ambar", "Por vencer"], sin_pagos: ["ambar", "Sin pagos"], al_dia: ["verde", "Al día"] };
const TABS = [["vencida", "Vencidas"], ["por_vencer", "Por vencer"], ["sin_pagos", "Sin pagos"], ["al_dia", "Al día"], ["sin_cuota", "Sin cuota"], ["todos", "Todos"]];

export const cuotaTxt = c => c ? esc(c.name) + ' · ' + plata(c.amount) + ' ' + (POR[c.months] || "") : '<span class="gy-mut">Sin cuota</span>';
export function estadoCuota(e){
  const x = ESTADO_CUOTA[e];
  return x ? '<span class="gy-sem ' + x[0] + '"><i aria-hidden="true"></i>' + x[1] + '</span>' : '<span class="gy-mut">Sin cuota</span>';
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
// Sumar meses a una fecha AAAA-MM-DD como Postgres (el 31 de enero + 1 mes = el 28 o 29 de febrero).
export function masMeses(d, n){
  const [y, m, dd] = d.split("-").map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1));
  const ult = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(dd, ult));
  return t.toISOString().slice(0, 10);
}

// ---- La pantalla Cuotas ----
function stat(titulo, n, sub, attrs){
  const t = attrs ? "button" : "div";
  return '<' + t + ' class="cv-card cv-stat gy-stat" ' + (attrs || '') + '><div class="cv-stat-l">' + titulo + '</div><div class="cv-stat-n">' + n + '</div><div class="gy-stat-s">' + sub + '</div></' + t + '>';
}
const enTab = (s, tab) => tab === "todos" ? true : tab === "sin_cuota" ? !s.cuota_estado && s.estado === "activo" : s.cuota_estado === tab && s.estado === "activo";
function fila(s){
  const marca = s.estado === "pausado" ? "pausado" : s.estado === "visita" ? "visita" : "";
  return '<div class="gy-row gy-row-eq gy-row-cuota" data-gym="abrir" data-id="' + esc(s.id) + '" tabindex="0" role="row">' +
    '<div class="gy-td gy-td-socio" role="cell">' + fotoHtml(s.foto_path, s.nombre) + '<div class="gy-socio-t"><b>' + esc(s.nombre || "Sin nombre") + '</b>' +
      (marca ? '<span class="gy-marcas"><i>' + marca + '</i></span>' : '') + '</div></div>' +
    '<div class="gy-td" role="cell" data-l="Cuota">' + cuotaTxt(s.cuota) + '</div>' +
    '<div class="gy-td" role="cell" data-l="Vence">' + (s.vence ? fecha(s.vence) : '<span class="gy-mut">—</span>') + '</div>' +
    '<div class="gy-td" role="cell" data-l="Estado">' + estadoCuota(s.cuota_estado) + '</div>' +
    '<div class="gy-td gy-td-acc" role="cell" data-gym-no="1">' + btn2('data-gym="cuota-pago" data-id="' + esc(s.id) + '"', "Registrar pago") + '</div>' +
  '</div>';
}
function tipos(){
  const L = GS.tipos;
  const cab = '<div class="gy-sec-h"><h2 class="gy-h">Tipos de cuota</h2>' + btn2('data-gym="tipo-nuevo"', "Nueva cuota") + '</div>';
  if (L === null) return '<section class="cv-card gy-sec">' + cab + '<p class="gy-fino">Cargando…</p></section>';
  if (!L.length) return '<section class="cv-card gy-sec">' + cab + '<p class="gy-p">Todavía no cargaste cuotas. Creá la primera (por ejemplo «Musculación», mensual) y asignásela a tus socios desde su ficha o acá.</p></section>';
  return '<section class="cv-card gy-sec">' + cab + '<ul class="gy-tipos">' + L.map(c =>
    '<li class="' + (c.archivada ? 'gy-tipo-arch' : '') + '"><div class="gy-tipo-t"><b>' + esc(c.name) + '</b><span>' + plata(c.amount) + ' · ' + (CADA[c.months] || "") +
      ' · ' + plural(c.socios || 0, "socio", "socios") + (c.archivada ? ' · archivada' : '') + '</span></div>' +
      '<div class="gy-td-acc">' + (c.archivada ? '' : '<button class="cv-link" data-gym="tipo-editar" data-id="' + esc(c.id) + '">Cambiar</button>') +
      '<button class="cv-link" data-gym="tipo-archivar" data-id="' + esc(c.id) + '" data-v="' + (c.archivada ? "" : "1") + '">' + (c.archivada ? "Volver a usar" : "Archivar") + '</button></div></li>').join("") +
    '</ul><p class="gy-fino">Cambiar el monto no toca los pagos ya cargados. Una cuota archivada no se asigna más; quien la tiene, la conserva.</p></section>';
}
export function renderCuotas(){
  const R = GS.cuotas;
  const acc = btn2('data-gym="cuotas-csv"', "Pagos del mes (CSV)");
  const sub = "Lo que te pagan en el gimnasio. GIZE no cobra: acá lo anotás.";
  if (!R) return cabeza("Cuotas", acc, sub) + (GS.cuotasError ? vacio(esc(GS.cuotasError), btn2('data-gym="reintentar"', "Reintentar")) : cargando("Cargando las cuotas…"));
  const c = R.conteo || {}, L = Array.isArray(R.socios) ? R.socios : [];
  const stats = '<div class="cv-stats gy-stats">' +
    stat("Cobrado este mes", plata(R.cobrado), plural(R.pagos_mes || 0, "pago", "pagos")) +
    stat("Por cobrar", plata(R.por_cobrar), plural(R.socios_por_cobrar || 0, "socio", "socios") + " este mes") +
    stat("Vencidas", c.vencida || 0, c.por_vencer ? '<span class="gy-ambar">' + plural(c.por_vencer, "vence", "vencen") + ' en 7 días</span>' : "Ninguna por vencer", 'data-gym="cuotas-tab" data-v="vencida"') +
  '</div>';
  const n = { vencida: c.vencida, por_vencer: c.por_vencer, sin_pagos: c.sin_pagos, al_dia: c.al_dia, sin_cuota: c.sin_cuota, todos: L.length };
  const tab = GS.cuotasTab;
  const pills = '<div class="cv-pills gy-tabs" role="tablist" aria-label="Estado de la cuota">' + TABS.map(t =>
    '<button class="cv-pill' + (tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (tab === t[0]) + '" data-gym="cuotas-tab" data-v="' + t[0] + '">' + t[1] + (n[t[0]] ? ' <span class="gy-n">' + n[t[0]] + '</span>' : '') + '</button>').join("") + '</div>';
  const F = L.filter(s => enTab(s, tab));
  const VACIO = { vencida: "Nadie con la cuota vencida.", por_vencer: "Ninguna cuota vence en los próximos 7 días.", sin_pagos: "Nadie con cuota y sin pagos cargados.",
    al_dia: "Nadie al día todavía.", sin_cuota: "Todos los socios activos tienen cuota.", todos: "Todavía no hay socios." };
  const lista = F.length ? '<div class="cv-card gy-tabla gy-tabla-cuotas" role="table" aria-label="Socios y cuotas">' +
      '<div class="gy-row gy-row-eq gy-row-cuota gy-th" role="row"><div role="columnheader">Socio</div><div role="columnheader">Cuota</div><div role="columnheader">Vence</div><div role="columnheader">Estado</div><div role="columnheader"><span class="cv-sr">Acción</span></div></div>' +
      F.map(fila).join("") + '</div>'
    : vacio(VACIO[tab] || "");
  return cabeza("Cuotas", acc, sub) + stats + pills + lista +
    '<p class="gy-pie">Los activos cuentan en los totales; los pausados y las visitas se ven en «Todos». Por cobrar: la cuota de quien venció, vence este mes o no tiene pagos.</p>' + tipos();
}

// ---- La sección «Cuota» de la ficha ----
// f.cuota: undefined (cargando), { error } o lo que devuelve gym_pagos_ficha.
export function seccionCuota(f, s){
  if (!puedeCobrar()) return "";
  const q = f.cuota, cab = '<h2 class="gy-h">Cuota</h2>';
  if (!q) return '<section class="cv-card gy-sec">' + cab + '<p class="gy-fino">Cargando…</p></section>';
  if (q.error) return '<section class="cv-card gy-sec">' + cab + '<p class="gy-fino">' + esc(q.error) + '</p></section>';
  const activas = (GS.tipos || []).filter(c => !c.archivada || (q.cuota && c.id === q.cuota.id));
  const elegir = manejaCuotas() && s.estado !== "baja"
    ? '<select class="gy-sel" data-gym="cuota-asignar" aria-label="Cuota del socio"' + (GS.busy ? ' disabled' : '') + '><option value="">Sin cuota</option>' +
      activas.map(c => '<option value="' + esc(c.id) + '"' + (q.cuota && q.cuota.id === c.id ? ' selected' : '') + '>' + esc(c.name) + ' · ' + plata(c.amount) + '</option>').join("") + '</select>' +
      (!activas.length ? '<div class="gy-fino">Primero creá una cuota en <button class="cv-link" data-gym="ir" data-v="cuotas">Cuotas</button>.</div>' : '')
    : cuotaTxt(q.cuota);
  const pagos = q.pagos || [];
  const pago = p => '<li class="' + (p.anulado ? 'gy-pago-anulado' : '') + '"><div class="gy-pago-t">' + (p.anulado ? '<s>' : '') + '<b>' + fecha(p.fecha) + ' · ' + plata(p.monto) + '</b> · ' + esc(MEDIOS[p.medio] || p.medio) +
      (p.anulado ? '</s>' : '') + '<span>Cubre hasta el ' + fecha(p.hasta) + (p.por ? ' · cargó ' + esc(p.por) : '') + (p.nota ? ' · ' + esc(p.nota) : '') + '</span>' +
      (p.anulado ? '<span class="gy-rojo">Anulado' + (p.motivo ? ': ' + esc(p.motivo) : '') + '</span>' : '') + '</div>' +
      (!p.anulado && manejaCuotas() ? '<button class="cv-link gy-peligro" data-gym="pago-anular" data-id="' + esc(p.id) + '">Anular</button>' : '') + '</li>';
  return '<section class="cv-card gy-sec gy-cuota">' + cab +
    '<div class="gy-kv"><span>Cuota</span><div>' + elegir + '</div></div>' +
    '<div class="gy-kv"><span>Vence</span><div>' + (q.vence ? fecha(q.vence) + ' ' : '') + estadoCuota(q.estado) + '</div></div>' +
    (s.estado !== "baja" ? '<div class="gy-acc">' + btn('data-gym="cuota-pago" data-id="' + esc(s.id) + '"', "Registrar pago") + '</div>' : '') +
    '<h3 class="gy-h3">Pagos</h3>' + (pagos.length ? '<ul class="gy-pagos">' + pagos.map(pago).join("") + '</ul>' : '<p class="gy-fino">Todavía no hay pagos cargados.</p>') +
  '</section>';
}

// ---- La ventana «Registrar pago» ----
// m: { tipo: "pago", id (ficha), nombre, datos (gym_pagos_ficha) | null, error, pid (id del pago),
//      monto, medio, fecha, hasta, hastaTocado, nota, hecho }.
export function nuevoPago(id, nombre){ return { tipo: "pago", id, nombre: nombre || "", datos: null, pid: uuid(), monto: "", medio: "efectivo", fecha: hoyAR(), hasta: "", hastaTocado: false, nota: "" }; }
// Lo que va a cubrir, como lo calcula el servidor (gym_pago_registrar).
export function cubreHasta(m){
  const d = m.datos || {}, c = d.cuota, dia = m.fecha || hoyAR();
  if (!c) return "";
  const desde = d.vence && d.vence >= dia ? d.vence : dia;
  return masMeses(desde, c.months);
}
export function ventanaPago(m){
  const h = '<div class="gy-modal-h"><h2>Registrar pago</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>';
  if (m.hecho) return h + '<div class="gy-ok" role="status">Listo: pago de ' + esc(m.nombre || "el socio") + ' registrado. La cuota queda paga hasta el ' + fecha(m.hecho.hasta) + '.</div>' +
    '<div class="gy-acc">' + btn('data-gym="cerrar"', "Listo") + '</div>';
  if (m.error) return h + vacio(esc(m.error));
  if (!m.datos) return h + '<p class="gy-fino" aria-busy="true">Cargando…</p>';
  const d = m.datos, c = d.cuota;
  if (!m.monto && c && !m.montoTocado) m.monto = String(c.amount);
  if (!m.hastaTocado) m.hasta = cubreHasta(m);
  const listo = Number(m.monto) > 0 && !!m.hasta && !!m.fecha;
  return h +
    '<p class="gy-p"><b>' + esc(m.nombre || "Socio") + '</b><br><span class="gy-fino">' + cuotaTxt(c) + (d.vence ? ' · vence el ' + fecha(d.vence) : c ? ' · sin pagos' : '') + '</span></p>' +
    (!c ? '<p class="gy-fino">No tiene cuota asignada: elegí hasta cuándo cubre este pago.</p>' : '') +
    '<div class="gy-form gy-form-pago">' +
      '<label class="gy-f"><span>Monto (en pesos)</span><input class="co-note" type="number" min="1" step="0.01" inputmode="decimal" data-gym-pg="monto" value="' + esc(m.monto) + '"></label>' +
      '<label class="gy-f"><span>Fecha del pago</span><input class="co-note" type="date" data-gym-pg="fecha" max="' + hoyAR() + '" value="' + esc(m.fecha) + '"></label>' +
      '<label class="gy-f"><span>Cubre hasta</span><input class="co-note" type="date" data-gym-pg="hasta" value="' + esc(m.hasta) + '"></label>' +
    '</div>' +
    '<div class="gy-radios gy-medios" role="radiogroup" aria-label="Cómo pagó">' + Object.entries(MEDIOS).map(([k, t]) =>
      '<label class="gy-radio' + (m.medio === k ? ' on' : '') + '"><input type="radio" name="gyMedio" value="' + k + '" data-gym-pg="medio"' + (m.medio === k ? ' checked' : '') + '><b>' + t + '</b></label>').join("") + '</div>' +
    '<label class="gy-f gy-f-nota"><span>Nota (opcional)</span><input class="co-note" type="text" maxlength="200" data-gym-pg="nota" value="' + esc(m.nota) + '" placeholder="Por ejemplo: pagó con descuento"></label>' +
    '<p class="gy-fino">Queda en el historial del socio con tu nombre. El socio ve en su app hasta cuándo tiene paga la cuota.</p>' +
    '<div class="gy-acc">' + btn('data-gym="pago-ok"' + (listo && !GS.busy ? '' : ' disabled'), GS.busy === "pago" ? "Registrando…" : "Registrar pago") + '</div>';
}

// ---- La ventana del tipo de cuota ----
export function ventanaTipo(m){
  const listo = String(m.nombre || "").trim().length >= 2 && m.monto !== "" && Number(m.monto) >= 0;
  return '<div class="gy-modal-h"><h2>' + (m.id ? "Cambiar la cuota" : "Nueva cuota") + '</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<div class="gy-form">' +
      '<label class="gy-f"><span>Nombre</span><input class="co-note" type="text" maxlength="60" data-gym-tp="nombre" value="' + esc(m.nombre || "") + '" placeholder="Por ejemplo: Musculación"></label>' +
      '<label class="gy-f"><span>Monto (en pesos)</span><input class="co-note" type="number" min="0" step="0.01" inputmode="decimal" data-gym-tp="monto" value="' + esc(m.monto) + '"></label>' +
      '<label class="gy-f"><span>Cada cuánto</span><select class="gy-sel" data-gym-tp="meses">' + Object.entries(CADA).map(([k, t]) => '<option value="' + k + '"' + (String(m.meses) === k ? ' selected' : '') + '>' + t + '</option>').join("") + '</select></label>' +
    '</div>' +
    (m.id ? '<p class="gy-fino">El monto nuevo vale para los pagos que vengan; los que ya cargaste no cambian.</p>' : '') +
    '<div class="gy-acc">' + btn('data-gym="tipo-ok"' + (listo && !GS.busy ? '' : ' disabled'), GS.busy === "tipo" ? "Guardando…" : "Guardar") + '</div>';
}

// ---- Los pagos del mes en CSV ----
export function csvPagos(L){
  return L.map(p => ({ fecha: p.fecha, socio: p.socio || "", monto: p.monto, medio: MEDIOS[p.medio] || p.medio || "", cuota: p.cuota || "", cubre_desde: p.desde, cubre_hasta: p.hasta,
    nota: p.nota || "", cargo: p.por || "", anulado: !!p.anulado }));
}
