// Socios → Solicitudes (SPEC §2.3): quién pidió sumarse, cómo entró, si coincide con una ficha ya
// cargada («¿Es Juan Pérez, DNI …123?») y la foto que propuso. [Socio nuevo] (con profe o sin profe, y
// «Aprobar la foto») · [Es la ficha de…] (une el pedido con esa ficha) · [Rechazar].
// La recepción (con «La recepción aprueba solicitudes y carga fichas») no lee el equipo: elige entre el
// profe por defecto del gimnasio (SPEC §2.8; el servidor lo valida con gym_profe_no_puede) y «Sin profe».
import { esc } from '../../core/utils.js';
import { rolGym } from '../../core/gimnasio.js';
import { GS, gym, fotoHtml, fotoUrl, fecha } from './estado.js';
import { btn, btn2, vacio, cargando } from './marco.js';
import { profesDelEquipo, norm } from './socios.js';

const VIA = { codigo: "Con el código del gimnasio", ficha: "Con el link de su ficha", csv: "Importado", conversion: "Era alumno del dueño" };
const viaTxt = s => s.unir_sugerida ? VIA.ficha : (VIA[s.via] || VIA.codigo);

// Lo elegido para cada pedido: GS.solForm guarda solo lo que se tocó; lo demás sale en el momento (el
// profe por defecto, si ya llegó el equipo, y «Aprobar la foto» marcado si propuso una). Así, si el
// equipo llega después que las solicitudes, el profe por defecto aparece igual.
const esRecepcion = () => rolGym() === "recepcion";
export function solElegido(s){
  const f = GS.solForm[s.id] || {}, def = gym().default_trainer_id || "";
  const porDefecto = esRecepcion() || profesDelEquipo().some(p => p.user_id === def) ? def : "";
  return { profe: f.profe !== undefined ? f.profe : porDefecto, foto: f.foto !== undefined ? f.foto : !!s.foto_pend_path };
}
// Las opciones del profe: el equipo (dueño y administración) o, para la recepción, el profe por defecto.
function opcionesProfe(f, profes){
  const op = (v, txt) => '<option value="' + esc(v) + '"' + (f.profe === v ? ' selected' : '') + '>' + esc(txt) + '</option>';
  if (esRecepcion()){
    const def = gym().default_trainer_id || "";
    return (def ? op(def, "Profe por defecto del gimnasio") : "") + op("", "Sin profe");
  }
  return op("", "Sin profe") + profes.map(p => op(p.user_id, p.nombre || "Profe")).join("");
}

export function renderSolicitudes(){
  const L0 = GS.solicitudes;
  if (L0 === null) return GS.solicitudesError ? vacio(esc(GS.solicitudesError), btn2('data-gym="reintentar"', "Reintentar")) : cargando("Cargando las solicitudes…");
  if (!L0.length) return vacio("No hay pedidos para sumarse. Cuando alguien ponga el código del gimnasio, aparece acá.");
  // El buscador de arriba (nombre o mail).
  const q = norm(GS.filtros.q).trim();
  const L = q ? L0.filter(s => norm(s.nombre).includes(q) || norm(s.email).includes(q)) : L0;
  if (!L.length) return vacio("Ningún pedido con esa búsqueda.");
  // Sin el equipo todavía no se sabe a quién se puede asignar: se espera (el botón, también).
  const profes = profesDelEquipo(), sinEquipo = GS.equipo === null;
  return '<div class="gy-sols">' + L.map(s => {
    const f = solElegido(s);
    const foto = s.foto_pend_path ? '<div class="gy-sol-foto">' + fotoHtml(s.foto_pend_path, s.nombre, "gy-av-l") +
      '<label class="gy-check"><input type="checkbox" data-gym-sol="foto" data-id="' + esc(s.id) + '"' + (f.foto ? ' checked' : '') + '> Aprobar la foto</label></div>'
      : '<div class="gy-sol-foto">' + fotoHtml(null, s.nombre, "gy-av-l") + '<span class="gy-fino">Sin foto propuesta</span></div>';
    const coinc = (s.coincidencias || []).map(o => '<div class="gy-coinc"><span>¿Es <b>' + esc(o.nombre) + '</b>' + (o.dni_fin ? ', DNI …' + esc(o.dni_fin) : '') + '?' +
      (o.motivo === "link" ? ' <i>(abrió el link de esa ficha)</i>' : o.motivo === "mail" ? ' <i>(mismo mail)</i>' : '') + '</span>' +
      btn2('data-gym="sol-unir" data-id="' + esc(s.id) + '" data-a="' + esc(o.id) + '"' + (GS.busy ? ' disabled' : ''), 'Es la ficha de ' + esc(String(o.nombre || "").split(" ")[0])) + '</div>').join("");
    return '<article class="cv-card gy-sol" data-sol="' + esc(s.id) + '">' + foto +
      '<div class="gy-sol-t"><h3>' + esc(s.nombre || "Sin nombre") + '</h3>' +
        '<div class="gy-fino">' + esc(s.email || "Sin mail") + ' · ' + fecha(s.requested_at) + ' · ' + esc(viaTxt(s)) + '</div>' +
        (!s.terms ? '<div class="gy-fino gy-ambar">Todavía no aceptó lo que ve el gimnasio (entró con una versión vieja de la app).</div>' : '') +
        (s.share_admin ? '<div class="gy-fino">Compartió sus registros con la administración.</div>' : '') +
        coinc +
        '<div class="gy-sol-acc"><label class="gy-f gy-f-in"><span>Profe</span><select class="gy-sel" data-gym-sol="profe" data-id="' + esc(s.id) + '"' + (sinEquipo ? ' disabled' : '') + '>' +
          (sinEquipo ? '<option value="">Cargando los profes…</option>' : opcionesProfe(f, profes)) + '</select></label>' +
          btn('data-gym="sol-nuevo" data-id="' + esc(s.id) + '"' + (GS.busy || sinEquipo ? ' disabled' : ''), GS.busy === s.id ? "Aprobando…" : "Socio nuevo") +
          '<button class="cv-link gy-peligro" data-gym="sol-rechazar" data-id="' + esc(s.id) + '"' + (GS.busy ? ' disabled' : '') + '>Rechazar</button></div>' +
      '</div></article>';
  }).join("") + '</div>';
}
export const fotosDeSolicitudes = () => (GS.solicitudes || []).map(s => s.foto_pend_path).filter(p => p && !fotoUrl(p));
