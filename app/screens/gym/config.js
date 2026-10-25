// Configuración del gimnasio (SPEC §2.8): datos; código (copiar, link, QR para imprimir, cambiar);
// profe por defecto y «Aprobar solas»; los interruptores del equipo (con «La recepción registra pagos»
// desde la etapa 2; los profes nunca ven montos); el ingreso: uno cada N horas y, con las cuotas, «No
// dejar entrar con la cuota vencida» (gym_cuotas_bloquear); privacidad (texto fijo:
// nadie del gimnasio lee los chats); el contrato de encargo; la marca (próximamente); exportar; y la
// zona de cuidado, solo para el dueño (pedir cambio de dueño y cerrar el gimnasio).
import { esc } from '../../core/utils.js';
import { GS, info, gym, esDueno, enApp, fecha } from './estado.js';
import { cabeza, btn, btn2 } from './marco.js';
import { PRIVACIDAD } from './textos.js';
import { profesDelEquipo, linkCodigo } from './socios.js';

const WA_GIZE = "5493413490705";
const TOGGLES = [
  ["aprobar_solas", "Aprobar solas las solicitudes", "Quien pone el código del gimnasio entra directo, con el profe por defecto. Apagado: las revisás en Socios → Solicitudes."],
  ["recepcion_altas", "La recepción aprueba solicitudes y carga fichas", "También puede sacar la foto del gimnasio."],
  ["profes_recepcion", "Los profes pueden abrir la recepción", "Para que un profe registre ingresos cuando no hay nadie en el mostrador."],
  ["recepcion_cobra", "La recepción registra pagos", "Anota los pagos de las cuotas y ve el historial de cada socio. Apagado: solo ve si la cuota está al día."],
];

export function renderConfig(){
  const g = gym(), st = info().settings || {}, form = GS.cfg || {}, code = info().codigo || "";
  const v = k => form[k] !== undefined ? form[k] : (g[k] || "");
  const campo = (k, label, tipo, extra) => '<label class="gy-f"><span>' + label + '</span><input class="co-note" type="' + (tipo || "text") + '" data-gym-cfg="' + k + '" value="' + esc(v(k)) + '"' + (extra || "") + '></label>';
  const sw = ([k, t, sub]) => '<label class="gy-sw"><span class="gy-sw-t"><b>' + t + '</b><span>' + sub + '</span></span><input type="checkbox" role="switch" data-gym="cfg-set" data-k="' + k + '"' + (st[k] ? ' checked' : '') + (GS.busy ? ' disabled' : '') + '><i aria-hidden="true"></i></label>';
  const profes = profesDelEquipo();
  const cambios = Object.keys(form).length > 0;
  const dpa = GS.dpa || {};
  return cabeza("Configuración", "", esc(g.name || "")) + '<div class="gy-ficha"><div class="gy-ficha-col">' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Datos del gimnasio</h2><div class="gy-form">' +
      campo("name", "Nombre", "text", ' maxlength="80"') + campo("address", "Dirección", "text", ' maxlength="160"') + campo("city", "Ciudad", "text", ' maxlength="80"') + campo("province", "Provincia", "text", ' maxlength="80"') +
      campo("whatsapp", "WhatsApp del gimnasio", "tel") + campo("contact_email", "Mail de contacto", "email") +
    '</div><div class="gy-acc">' + btn('data-gym="cfg-guardar"' + (cambios && !GS.busy ? '' : ' disabled'), GS.busy === "cfg" ? "Guardando…" : "Guardar cambios") + '</div></section>' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Código del gimnasio</h2><p class="gy-fino">Tus socios lo ponen en la app para pedir sumarse.</p>' +
      '<div class="gy-codigo"><span class="co-code">' + esc(code || "—") + '</span>' + btn2('data-gym="copiar" data-v="' + esc(code) + '"', "Copiar") + btn2('data-gym="copiar" data-v="' + esc(linkCodigo(code)) + '"', "Copiar link") + btn2('data-gym="qr-imprimir"', "QR para imprimir") + '</div>' +
      '<div class="gy-acc"><button class="cv-link" data-gym="codigo-rotar">Cambiar código</button></div>' +
      '<label class="gy-f gy-f-in"><span>Profe por defecto para las solicitudes</span><select class="gy-sel" data-gym="cfg-profe"><option value="">Sin profe</option>' +
        profes.map(p => '<option value="' + esc(p.user_id) + '"' + (g.default_trainer_id === p.user_id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join("") + '</select></label>' +
      sw(TOGGLES[0]) + '</section>' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Equipo</h2>' + TOGGLES.slice(1).map(sw).join("") + '</section>' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Ingreso</h2><label class="gy-f gy-f-in"><span>Un ingreso cada</span><span class="gy-horas"><input class="co-note" type="number" min="1" max="24" step="1" inputmode="numeric" data-gym="cfg-horas" value="' + esc(String(st.ingreso_horas || 3)) + '"> horas</span></label>' +
      '<p class="gy-fino">Si se registra otro ingreso del mismo socio antes, la recepción ve que ya entró.</p>' +
      '<label class="gy-sw"><span class="gy-sw-t"><b>No dejar entrar con la cuota vencida</b><span>La recepción no puede registrar el ingreso hasta que pague. Apagado: lo registra y ve el aviso de la cuota vencida.</span></span>' +
        '<input type="checkbox" role="switch" data-gym="cfg-bloquea"' + (st.cuota_bloquea ? ' checked' : '') + (GS.busy ? ' disabled' : '') + '><i aria-hidden="true"></i></label></section>' +
  '</div><div class="gy-ficha-col">' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Privacidad</h2><dl class="gy-dl">' + PRIVACIDAD.map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join("") + '</dl>' +
      '<p class="gy-fino">La administración ve los registros solo de quien los compartió. <a class="cv-link" href="https://gize.ar/privacidad/" target="_blank" rel="noopener">Política de privacidad</a></p></section>' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Contrato de encargo</h2><p class="gy-p">' + (dpa.dpa_version ? 'Versión ' + esc(dpa.dpa_version) + ', aceptada el ' + fecha(dpa.dpa_at) + '.' : 'El que se aceptó al crear el gimnasio.') + '</p>' +
      '<p class="gy-fino">GIZE guarda los datos de tus socios por encargo del gimnasio y solo para prestar el servicio.</p></section>' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Marca</h2><p class="gy-p">Próximamente: tu logo y tus colores en la app de tus socios.</p></section>' +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Exportar</h2><p class="gy-fino">Socios, ingresos y equipo en CSV (se abre con Excel o Google Sheets). Anda siempre' + (enApp() ? '.' : ', aunque venza el plan.') + '</p>' +
      '<div class="gy-acc">' + btn2('data-gym="exportar" data-v="todo"', "Exportar todo") + btn2('data-gym="exportar" data-v="socios"', "Socios") + btn2('data-gym="exportar" data-v="ingresos"', "Ingresos") + btn2('data-gym="exportar" data-v="equipo"', "Equipo") + '</div></section>' +
    (esDueno() ? '<section class="cv-card gy-sec gy-cuidado"><h2 class="gy-h">Zona de cuidado</h2>' +
      '<div class="gy-kv"><span>Cambio de dueño</span><div><p class="gy-fino">Lo hace el equipo de GIZE.</p><a class="co-copy-btn cv-sec-btn gy-btn2" href="' + esc("https://wa.me/" + WA_GIZE + "?text=" + encodeURIComponent("Hola! Quiero pasar el gimnasio " + (g.name || "") + " a otra persona.")) + '" target="_blank" rel="noopener">Pedir cambio de dueño</a></div></div>' +
      '<div class="gy-kv"><span>Cerrar el gimnasio</span><div><p class="gy-fino">Los socios conservan sus cuentas y quedan sin profe del gimnasio. Te pide escribir el nombre.</p><button class="gize-btn cv-btn gy-btn-peligro" data-gym="cerrar-gym">Cerrar el gimnasio</button></div></div></section>' : '') +
    '<section class="cv-card gy-sec"><h2 class="gy-h">Tu cuenta</h2><div class="gy-acc"><button class="co-copy-btn cv-sec-btn gy-btn2" data-auth="logout">Cerrar sesión</button><button class="cv-link gy-peligro" data-action="cfg-delete-account">Eliminar mi cuenta</button></div></section>' +
  '</div></div>';
}

export function ventanaQr(){
  const code = info().codigo || "", g = gym();
  return '<div class="gy-modal-h"><h2>QR para imprimir</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<div class="gy-imprimir"><h3>' + esc(g.name || "") + '</h3><p>Escaneá para sumarte en la app GIZE</p><div class="gy-qr" data-gy-qr="' + esc(linkCodigo(code)) + '" data-tam="240"></div><p>o poné el código <b>' + esc(code) + '</b></p></div>' +
    '<p class="gy-fino">Este QR sirve para pedir sumarse; no controla el ingreso.</p><div class="gy-acc">' + btn('data-gym="imprimir"', "Imprimir") + '</div>';
}
