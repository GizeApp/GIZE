// Ficha del socio (SPEC §2.3): datos editables, notas internas, Gimnasio (profe con [Cambiar], pausar,
// dar de baja, reactivar), Cuota (etapa 2: app/screens/gym/cuotas.js), Foto del gimnasio (aprobar,
// rechazar, sacar), Asistencia
// (ingresos del último mes en el calendario de siempre) y Entrenamiento en sus tres modos:
//   · su socio asignado: la ficha de coach de siempre, editable (con el chat);
//   · compartió con la administración: la misma ficha en modo lectura («Lo edita su profe…»);
//   · no compartió: «El socio no compartió sus registros con la administración».
// En la compu es una pantalla con dos columnas; en el celular, una debajo de la otra.
import { esc } from '../../core/utils.js';
import { renderCoachCalendar } from '../coach/calendario.js';
import { GS, yo, soyCoach, fotoHtml, fotoUrl, fecha, cuando, hoyAR, diaAR, horaAR, primerNombre } from './estado.js';
import { btn, btn2, cargando, vacio } from './marco.js';
import { estadoTxt, profeTxt, aptoVencido } from './socios.js';
import { seccionCuota } from './cuotas.js';

// Por qué no se puede cambiar el profe (y no aparece [Cambiar]).
export function sinCambiarProfe(s){
  if (s.estado === "baja") return "Está de baja.";
  if (s.sin_app) return "Todavía no usa la app: el profe se asigna cuando se sume con su link.";
  if (s.coach_externo) return "Tiene un coach de afuera del gimnasio: mientras lo tenga, el gimnasio no le asigna profe.";
  if (s.falta_confirmacion) return "Todavía no confirmó lo que ve el gimnasio en su app: hasta entonces no se lo puede pasar a otro profe.";
  return "";
}

function datos(f){
  const d = f.datos || {}, x = f.form || {};
  const v = k => x[k] !== undefined ? x[k] : (k === "nombre" ? d.full_name : k === "telefono" ? d.phone : k === "nacimiento" ? d.birthdate : d[k]) || "";
  const campo = (k, label, tipo, extra) => '<label class="gy-f"><span>' + label + '</span><input class="co-note" type="' + (tipo || "text") + '" data-gym-ff="' + k + '" value="' + esc(v(k)) + '"' + (extra || "") + '></label>';
  const tel = v("telefono");
  return '<section class="cv-card gy-sec"><h2 class="gy-h">Datos</h2><div class="gy-form">' +
    campo("nombre", "Nombre y apellido") + campo("dni", "DNI", "text", ' inputmode="numeric"') +
    '<div class="gy-f-row">' + campo("telefono", "Teléfono", "tel") + (tel ? '<a class="co-copy-btn cv-sec-btn gy-btn2 gy-wa" href="https://wa.me/' + esc(String(tel).replace(/\D/g, "")) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + '</div>' +
    campo("email", "Mail", "email") + campo("nacimiento", "Fecha de nacimiento", "date", ' max="' + hoyAR() + '"') + campo("apto_medico_vence", "Apto médico: vence el", "date") +
    '</div><div class="gy-acc">' + btn('data-gym="ficha-guardar"' + (f.form && Object.keys(f.form).length && !GS.busy ? '' : ' disabled'), GS.busy === "datos" ? "Guardando…" : "Guardar cambios") + '</div></section>';
}

function nota(f){
  const v = f.notaForm !== undefined ? f.notaForm : ((f.nota && f.nota.body) || "");
  return '<section class="cv-card gy-sec"><h2 class="gy-h">Notas internas</h2><p class="gy-fino">Las ven el dueño, la administración y su profe. El socio nunca.</p>' +
    '<textarea class="co-note gy-nota" data-gym-nota="1" maxlength="2000" rows="3" placeholder="Por ejemplo: prefiere entrenar a la tarde">' + esc(v) + '</textarea>' +
    '<div class="gy-acc">' + btn2('data-gym="nota-guardar"' + (f.notaForm === undefined || GS.busy ? ' disabled' : ''), GS.busy === "nota" ? "Guardando…" : "Guardar nota") +
    (f.nota && f.nota.updated_at ? '<span class="gy-fino">Última vez: ' + fecha(f.nota.updated_at) + '</span>' : '') + '</div></section>';
}

function gimnasio(s){
  const motivo = sinCambiarProfe(s);
  const acc = [];
  if (s.estado === "activo") acc.push(btn2('data-gym="pausar"', "Pausar hasta…"));
  if (s.estado === "activo" || s.estado === "pausado") acc.push('<button class="cv-link gy-peligro" data-gym="baja">Dar de baja</button>');
  if (s.estado === "pausado" || s.estado === "baja") acc.push(btn2('data-gym="reactivar"', "Reactivar"));
  if (s.sin_app && s.estado !== "baja") acc.push(btn2('data-gym="ficha-link"', "Mandarle el link de la app"));
  return '<section class="cv-card gy-sec"><h2 class="gy-h">Gimnasio</h2>' +
    '<div class="gy-kv"><span>Profe</span><div><b>' + profeTxt(s) + '</b>' + (motivo ? '<div class="gy-fino">' + esc(motivo) + '</div>' : ' ' + '<button class="cv-link" data-gym="cambiar-profe">Cambiar</button>') + '</div></div>' +
    '<div class="gy-kv"><span>Estado</span><div><span class="gy-estado ' + esc(s.estado) + '">' + esc(estadoTxt(s)) + '</span></div></div>' +
    '<div class="gy-kv"><span>Socio desde</span><div>' + fecha(s.joined_at) + '</div></div>' +
    (s.left_at && s.estado === "baja" ? '<div class="gy-kv"><span>De baja desde</span><div>' + fecha(s.left_at) + '</div></div>' : '') +
    '<div class="gy-kv"><span>Compartió sus registros</span><div>' + (s.sin_app ? '—' : s.share_admin ? 'Sí, con la administración' : 'No') + '</div></div>' +
    '<div class="gy-acc">' + acc.join("") + '</div></section>';
}

function foto(s, d){
  const pend = d && d.foto_pend_path;
  return '<section class="cv-card gy-sec"><h2 class="gy-h">Foto del gimnasio</h2><p class="gy-fino">Es la que ve la recepción. La saca o la aprueba el gimnasio; el socio solo puede proponer una.</p>' +
    '<div class="gy-fotos"><figure>' + fotoHtml(s.foto_path, s.nombre, "gy-av-xl") + '<figcaption>' + (s.foto_path ? 'Aprobada' : 'Sin foto') + '</figcaption></figure>' +
    (pend ? '<figure class="gy-pend">' + fotoHtml(pend, s.nombre, "gy-av-xl") + '<figcaption>Propuesta' + (d.foto_pend_at ? ' el ' + fecha(d.foto_pend_at) : '') + '</figcaption></figure>' : '') + '</div>' +
    (d && d.foto_rechazo && !pend ? '<p class="gy-fino">Última rechazada: ' + esc(d.foto_rechazo) + '</p>' : '') +
    '<div class="gy-acc">' + (pend ? btn('data-gym="foto-aprobar"', "Aprobar") + '<button class="cv-link gy-peligro" data-gym="foto-rechazar">Rechazar</button>' : '') +
    (s.estado !== "baja" ? '<label class="co-copy-btn cv-sec-btn gy-btn2 gy-foto-btn">' + (s.foto_path ? 'Sacar otra foto' : 'Sacar foto') + '<input type="file" accept="image/*" capture="user" data-gym-foto="' + esc(s.id) + '" class="gy-foto-in"></label>' : '') +
    '</div></section>';
}

function asistencia(f){
  const ing = f.ingresos;
  if (!ing) return '<section class="cv-card gy-sec"><h2 class="gy-h">Asistencia</h2>' + (f.ingresosError ? '<p class="gy-fino">No se pudieron leer los ingresos.</p>' : '<p class="gy-fino">Cargando…</p>') + '</section>';
  const dias = ing.map(e => diaAR(e.at));
  const sel = f.cal.d, delDia = sel ? ing.filter(e => diaAR(e.at) === sel) : [];
  return '<section class="cv-card gy-sec"><h2 class="gy-h">Asistencia</h2><p class="gy-fino">Ingresos del último mes.</p>' +
    renderCoachCalendar("gy-asis", dias, hoyAR(), ["ingreso", "ingresos"], { st: f.cal, act: "gy-cal" }) +
    (sel ? '<div class="gy-ing">' + (delDia.length ? delDia.map(e => '<div>' + horaAR(e.at) + ' · ' + (e.method === "manual" ? "Manual" : esc(e.method || "")) + '</div>').join("") : 'Ese día no entró.') + '</div>' : '') +
  '</section>';
}

function entrenamiento(s){
  let cuerpo;
  if (s.sin_app) cuerpo = '<p class="gy-p">Todavía no usa la app: cuando se sume con su link, acá vas a ver sus registros.</p>';
  else if (s.estado === "baja") cuerpo = '<p class="gy-p">Está de baja: el gimnasio ya no ve sus registros.</p>';
  else if (s.profe && s.profe.id === yo() && soyCoach()) cuerpo = '<p class="gy-p">Es tu socio: su ficha de entrenamiento, como la de cualquier alumno (rutina, registros y chat).</p>' + btn('data-gym="entreno" data-m="profe"', "Abrir su ficha de entrenamiento");
  else if (s.share_admin) cuerpo = '<p class="gy-p">Compartió sus registros con la administración: los ves sin poder editarlos' + (s.profe ? '; los edita su profe, ' + esc(primerNombre(s.profe.name)) : '') + '. Sin los pasos ni los recorridos.</p>' + btn2('data-gym="entreno" data-m="lectura"', "Ver sus registros");
  else cuerpo = '<p class="gy-p">El socio no compartió sus registros con la administración.</p>';
  return '<section class="cv-card gy-sec"><h2 class="gy-h">Entrenamiento</h2>' + cuerpo + '</section>';
}

export function renderFicha(){
  const f = GS.ficha;
  if (!f) return vacio("No encontramos esa ficha.");
  const s = (GS.socios || []).find(x => x.id === f.id);
  const volver = '<button class="co-back cv-back" data-gym="ir" data-v="socios" aria-label="Volver a Socios" title="Volver">‹</button>';
  if (!s) return '<div class="co-head cv-chead">' + volver + '</div>' + (GS.socios === null ? cargando() : vacio("Esa ficha ya no está en la lista."));
  const marcas = [s.sin_app ? "Sin app" : "", s.falta_confirmacion ? "Falta confirmación" : "", s.coach_externo ? "Coach externo" : "", aptoVencido(s) ? "Apto médico vencido" : ""].filter(Boolean);
  const head = '<div class="co-head cv-chead gy-ficha-h">' + volver + fotoHtml(s.foto_path, s.nombre, "gy-av-l") +
    '<div class="cv-cname"><div class="co-client-name">' + esc(s.nombre || "Sin nombre") + '</div><div class="gy-fino">' + esc(estadoTxt(s)) +
    (s.ultimo_ingreso ? ' · último ingreso ' + cuando(s.ultimo_ingreso).toLowerCase() : '') + '</div>' +
    (marcas.length ? '<span class="gy-marcas">' + marcas.map(m => '<i>' + m + '</i>').join("") + '</span>' : '') + '</div></div>';
  if (f.error) return head + vacio(esc(f.error), btn2('data-gym="reintentar"', "Reintentar"));
  return head + '<div class="gy-ficha">' +
    '<div class="gy-ficha-col">' + gimnasio(s) + seccionCuota(f, s) + entrenamiento(s) + foto(s, f.datos) + '</div>' +
    '<div class="gy-ficha-col">' + (f.datos ? datos(f) : '<section class="cv-card gy-sec"><p class="gy-fino">Cargando…</p></section>') + nota(f) + asistencia(f) + '</div>' +
  '</div>';
}
export const fotosDeFicha = () => { const f = GS.ficha, d = f && f.datos; return d ? [d.foto_path, d.foto_pend_path].filter(p => p && !fotoUrl(p)) : []; };
