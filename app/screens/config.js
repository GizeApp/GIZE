// Pantalla de Configuración (cuenta, vínculo con coach, borrado de datos locales).
// Antes vivía como un "addon" pegado al final del index.html que parcheaba
// renderApp por monkey-patching para no tocar el original; con módulos reales
// ya no hace falta el parche: main.js llama a renderConfig() directamente
// cuando State.view === "config".
import { Gym, rolGym, esSocioGym, fotoSocio, releerGym, cuotaSocio, clasesSocio } from '../core/gimnasio.js';
import { State } from '../core/state.js';
import { KEY, save } from '../core/storage.js';
import { appleCodeForDelete, clearAccountLeftovers, forgetStoredSession, loadCloud, deleteMyStorageFiles, deleteMyAccount, PROFILE_KEY } from '../core/supabase.js';
import { esc } from '../core/utils.js';
import { avatarHtml, avatarUrl } from '../core/avatar.js';
import { showLogin } from './auth.js';
import { pushOnHere, enablePush, disablePush, pushLogout, isIOS, isStandalone } from '../core/push.js';
import { renderApp } from '../main.js';
import { adminEntry, checkAdmin } from './admin-productos.js';
import { isLite, setLite } from '../ui/background.js';
import { releaseForReload, stopForLogout } from '../ui/gps.js';
import { TRACK_KEY } from '../core/salidas.js';
import { deleteShareFile } from '../ui/compartir.js';
import { temaOptionsHtml } from '../ui/tema.js';
import { neonSwitchHtml } from '../ui/neon.js';
import { appNativa } from '../core/tienda.js';
import { IA_POR_GIMNASIO, iaAlguna, iaEstado, iaGuardarPermiso, iaPermiso, iaPorGimnasio } from '../core/ia.js';
import { iaToast, pedirPermisoIA } from '../ui/ia-permiso.js';
import { plusAjustesHtml, plusInfo } from '../ui/ia-plus.js';
import { bellSvg, fileTextSvg, instagramSvg, globeSvg, auIcoMail, whatsappSvg, chevronRightSvg, pencilSvg, checkSvg } from '../core/icons.js';

const cameraSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const moonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const sparkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';
// Personas bloqueadas: un círculo tachado.
const blockSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
const zapSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';

// El estado de la IA para Ajustes: si cambió lo que se ve, se redibuja (una vez por pedido).
let _iaCfg = "";
function iaConfigRefrescar() {
  iaEstado().then(() => {
    const v = iaAlguna() + "|" + iaPermiso() + "|" + JSON.stringify(plusInfo());
    if (v === _iaCfg) return;
    _iaCfg = v;
    if (State.view === "config") renderApp();
  });
}

function cfgRoleLabel(p) { return (p && p.role === "coach") ? "Coach" : "Cliente"; }

// ---- Ajustes → Tu gimnasio (etapa 1, parte 3; SPEC §3.2) ----
// Solo para quien tiene ficha en un gimnasio (socio) o un pedido pendiente: lo dice mi_gimnasio()
// (core/gimnasio.js). Para cualquier otra cuenta no se dibuja nada. Los botones (data-gys) los
// atiende app/screens/gym/socio.js, que se carga recién al tocarlos.
const gymFicha = () => (rolGym() === "socio" && Gym.info && Gym.info.ficha) || null;
// El profe del socio es del gimnasio (no un coach de afuera): «Dejar a tu profe» lo deja sin profe
// pero socio (el trigger profiles_gym_sync, supabase/gimnasios-vinculo.sql).
const profeDelGym = () => { const f = gymFicha(); return !!(f && f.profe && !f.coach_externo); };
function ddmm(d){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? m[3] + "/" + m[2] : ""; }
function gymFotoHtml(f){
  // La que usa el gimnasio (aprobada); si todavía no hay, la que propuso. Proponer otra no la cambia.
  const path = f.foto_path || (f.foto === "pendiente" ? f.foto_pend_path : null);
  const url = path ? fotoSocio(path) : "";
  const estado = f.foto === "ok" ? "La aprobó el gimnasio."
    : f.foto === "pendiente" ? (f.foto_path ? "Mandaste otra: esperando que el gimnasio la apruebe. Mientras, sigue esta." : "Esperando que el gimnasio la apruebe.")
    : f.foto === "rechazada" ? "El gimnasio no la aprobó" + (f.foto_rechazo ? ": " + f.foto_rechazo : ".")
    : "Todavía no tenés foto del gimnasio.";
  const boton = f.foto === "ok" ? "Pedir cambio de foto" : f.foto === "pendiente" ? "Mandar otra" : "Mandar una foto";
  return '<div class="cfg-gym-foto">' +
      '<span class="cfg-gym-av' + (url ? ' has-photo' : '') + '">' + (url ? '<img src="' + esc(url) + '" alt="Tu foto del gimnasio">' : '<span aria-hidden="true">' + cameraSvg + '</span>') + '</span>' +
      '<div class="cfg-gym-foto-txt"><div class="cfg-notif-label">Foto del gimnasio</div>' +
        '<div class="cfg-notif-desc' + (f.foto === "rechazada" ? ' cfg-gym-mal' : '') + '" role="status">' + esc(estado) + '</div>' +
        '<div class="cfg-notif-desc">La ve la recepción. Tu foto de perfil no cambia.</div></div>' +
      // El selector de archivos: un <label> con el input escondido a la vista (no con «hidden»), así se
      // llega con el teclado y se abre en el mismo toque (como «Sacar foto» del panel).
      '<label class="cfg-gym-btn cfg-gym-foto-acc">' + boton + '<input type="file" accept="image/*" data-gys-foto class="gys-foto-in"></label>' +
    '</div>';
}
// Tu cuota (etapa 2): lo que anotó el gimnasio (gym_mi_cuota). En la web, la cuota con su monto y tus
// últimos pagos; en las apps de Android y iPhone, solo si está al día y la fecha (nada de precios ni
// pagos adentro de la app de una tienda). Sin cuota, nada. Nunca un link ni un botón para pagar.
const CUOTA_EST = { al_dia: ["Al día", ""], por_vencer: ["Por vencer", "cfg-gym-ambar"], vencida: ["Vencida", "cfg-gym-mal"], sin_pagos: ["Sin pagos cargados", "cfg-gym-ambar"] };
const CUOTA_POR = { 1: "por mes", 2: "cada 2 meses", 3: "cada 3 meses", 6: "cada 6 meses", 12: "por año" };
const CUOTA_MEDIO = { efectivo: "efectivo", transferencia: "transferencia", otro: "otro medio" };
const pesos = n => { try { return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0); } catch (e) { return "$ " + n; } };
function gymCuotaHtml(){
  const q = cuotaSocio();
  if (!q || !CUOTA_EST[q.estado]) return "";
  const [txt, cls] = CUOTA_EST[q.estado];
  const cuando = q.vence ? (q.estado === "vencida" ? "Venció el " : "Paga hasta el ") + ddmm(q.vence) + "/" + String(q.vence).slice(2, 4) + "." : "";
  let h = '<div class="cfg-gym-row"><span class="cfg-gym-k">Cuota</span><span class="cfg-gym-v cfg-gym-cuota ' + cls + '">' + txt + '</span></div>' +
    (cuando ? '<div class="cfg-notif-desc">' + cuando + '</div>' : '');
  if (appNativa()) return '<div class="cfg-gym-cuota-box">' + h + '</div>';
  const c = q.cuota, pagos = (q.pagos || []).slice(0, 5);
  if (c) h += '<div class="cfg-notif-desc">' + esc(c.name || "") + ' · ' + pesos(c.amount) + ' ' + (CUOTA_POR[c.months] || "") + '</div>';
  if (pagos.length) h += '<div class="cfg-notif-label cfg-gym-pagos-t">Tus pagos</div><ul class="cfg-gym-pagos">' +
    pagos.map(p => '<li>' + ddmm(p.fecha) + "/" + String(p.fecha).slice(2, 4) + ' · ' + pesos(p.monto) + ' · ' + esc(CUOTA_MEDIO[p.medio] || "") + '</li>').join("") + '</ul>';
  return '<div class="cfg-gym-cuota-box">' + h + '<div class="cfg-notif-desc">Lo anota el gimnasio cuando le pagás.</div></div>';
}
// Tus clases (etapa 3): si el gimnasio tiene clases, «Clases» abre la hoja para reservar (screens/gym/
// socio.js) y abajo van tus próximas reservas. Sin clases, nada. Sin precios: en las apps es igual.
const calSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>';
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function gymClasesHtml(){
  const q = clasesSocio();
  if (!q || !Array.isArray(q.clases) || !q.clases.length) return "";
  const mias = q.clases.filter(c => c.reserva).slice(0, 4);
  const dia = f => DIA_CORTO[new Date(f + "T12:00:00Z").getUTCDay()] + " " + ddmm(f);
  const estado = c => c.cancelada ? '<span class="cfg-gym-mal">la canceló el gimnasio</span>'
    : c.estado === "espera" ? '<span class="cfg-gym-ambar">en espera (' + c.posicion + '°)</span>'
    : c.promovida ? '<span class="cfg-gym-ok">¡tenés lugar! Saliste de la espera</span>' : 'reservada';
  return '<button type="button" class="cfg-link-row" data-gys="clases"><span class="cfg-link-ic">' + calSvg + '</span><span class="cfg-link-label">Clases</span><span class="cfg-link-chev">' + chevronRightSvg + '</span></button>' +
    (mias.length ? '<ul class="cfg-gym-clases" aria-label="Tus próximas clases">' + mias.map(c => '<li><b>' + esc(c.nombre) + '</b> · ' + dia(c.fecha) + ' ' + esc(c.hora) + ' · ' + estado(c) + '</li>').join("") + '</ul>' : '');
}
function gymSection(){
  const gi = Gym.info, rol = rolGym();
  if (!gi || !gi.gym || !esSocioGym()) return "";
  const g = gi.gym, nom = esc(g.name || "");
  const cab = '<div class="cfg-sub">Tu gimnasio</div>';
  if (rol === "pendiente"){
    const sol = gi.solicitud || {};
    return '<div class="card cfg-card cfg-gym" id="cfgGym">' + cab +
      '<div class="cfg-gym-name">Pedido enviado a ' + nom + '</div>' +
      '<div class="cfg-notif-desc">Cuando te acepten, vas a ver acá a tu profe. Mientras, seguís usando GIZE como siempre.</div>' +
      (!sol.terms ? '<div class="cfg-gym-aviso"><div class="cfg-notif-desc">Falta que confirmes qué ve el gimnasio.</div><button type="button" class="form-save cfg-gym-go" data-gys="confirmar">Ver y confirmar</button></div>' : '') +
      gymFotoHtml({ foto: sol.foto === "pendiente" ? "pendiente" : "falta", foto_pend_path: sol.foto_pend_path }) +
      '<button class="logout-btn cfg-danger" data-gys="cancelar-pedido">Cancelar el pedido</button>' +
    '</div>';
  }
  const f = gi.ficha || {};
  const quien = f.coach_externo
    ? '<div class="cfg-gym-row"><span class="cfg-gym-k">Coach</span><span class="cfg-gym-v">Coach externo</span></div><div class="cfg-notif-desc">Tu coach no es del gimnasio: sigue igual que siempre.</div>'
    : f.profe
      ? '<div class="cfg-gym-row"><span class="cfg-gym-k">Profe</span><span class="cfg-gym-v">' + esc(f.profe.name || "") + '</span><button type="button" class="cfg-gym-btn" data-action="cfg-unlink-coach">Dejar a tu profe</button></div>'
      : '<div class="cfg-gym-row"><span class="cfg-gym-k">Profe</span><span class="cfg-gym-v cfg-gym-sin">Sin profe</span></div><div class="cfg-notif-desc">El gimnasio te puede asignar uno. Si tenés el código de un profe del gimnasio, ponelo arriba.</div>';
  const share = !!f.share_admin;
  const confirmado = !!f.terms_at;
  return '<div class="card cfg-card cfg-gym" id="cfgGym">' + cab +
    '<div class="cfg-gym-name">' + nom + (g.city ? '<span class="cfg-gym-city"> · ' + esc(g.city) + '</span>' : '') + '</div>' +
    (f.status === "pausado" ? '<div class="cfg-notif-desc">Tu ficha está pausada' + (f.paused_until ? ' hasta el ' + ddmm(f.paused_until) : '') + '.</div>' : '') +
    quien + gymCuotaHtml() + gymClasesHtml() +
    (confirmado
      ? '<div class="cfg-notif-row">' +
          '<div class="cfg-notif-txt"><div class="cfg-notif-label" id="cfgGymShare">Compartir mis registros con la administración</div>' +
          '<div class="cfg-notif-desc">Entrenos, comidas, peso, registro diario y check-ins, con el dueño y los encargados. Sin tus pasos ni tus recorridos.</div></div>' +
          '<button class="cfg-switch' + (share ? ' on' : '') + '" data-gys="compartir" role="switch" aria-checked="' + share + '" aria-labelledby="cfgGymShare"><span class="cfg-switch-knob"></span></button>' +
        '</div>'
      : '<div class="cfg-gym-aviso"><div class="cfg-notif-desc">Falta que confirmes qué ve el gimnasio.</div><button type="button" class="form-save cfg-gym-go" data-gys="confirmar">Ver y confirmar</button></div>') +
    '<button type="button" class="cfg-link-row" data-gys="ver-hoja"><span class="cfg-link-ic">' + fileTextSvg + '</span><span class="cfg-link-label">Qué ve el gimnasio</span><span class="cfg-link-chev">' + chevronRightSvg + '</span></button>' +
    gymFotoHtml(f) +
    '<button class="logout-btn cfg-danger" data-gys="salir">Salir del gimnasio</button>' +
  '</div>';
}

// En las apps de Android y iPhone ningún link puede llevar a precios ni a links de pago
// (reglas de Apple y Google): la página de inicio tiene los planes y el botón para contratar.
const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// Links externos de la pantalla de Configuración. Placeholders a propósito: reemplazar
// cada uno por el real (instagram/website: URL completa; email: solo la casilla;
// whatsapp: solo número con código de país, sin "+" ni espacios ni guiones) y listo,
// los botones ya redirigen solos — no hace falta tocar nada más de este archivo.
const LINKS = {
  // ?app=1: la página no muestra la barra de arriba, que lleva a la página de inicio.
  privacy: "https://gize.ar/privacidad/?app=1",
  instagram: "https://instagram.com/gize.app",
  website: "https://gize.ar/",
  email: "contacto@gize.ar",
  whatsapp: "5493413490705",
};

function cfgLinkRow(icon, label, href) {
  return '<a class="cfg-link-row" href="' + esc(href) + '" target="_blank" rel="noopener">' +
    '<span class="cfg-link-ic">' + icon + '</span>' +
    '<span class="cfg-link-label">' + esc(label) + '</span>' +
    '<span class="cfg-link-chev">' + chevronRightSvg + '</span>' +
  '</a>';
}

// Notificaciones: push de verdad (ver app/core/push.js). El switch refleja permiso dado
// + preferencia de la app; la suscripción se crea/borra al tocarlo.
function notifOn() {
  return pushOnHere();
}

export function renderConfig() {
  const logged = !!State.cloudUser;
  const profile = State.cloudProfile;
  const name = (profile && profile.full_name) || (logged && State.cloudUser.email) || "";
  const email = logged ? State.cloudUser.email : "";
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  // Nombre "de fábrica" quedaba pegado si el cliente se equivocó al escribirlo al
  // registrarse (o directamente lo quiere cambiar más adelante) — antes solo el coach
  // podía corregirlo desde SU panel; ahora el propio cliente lo edita acá.
  const editingName = logged && !!State.cfgEditingName;
  const whoInner = editingName
    ? '<div class="cfg-name-edit">' +
        '<input id="cfgNameInput" class="form-input cfg-name-input" value="' + esc(name) + '" placeholder="Tu nombre" maxlength="60">' +
        '<div class="cfg-name-edit-actions">' +
          '<button class="form-save cfg-name-save-btn" data-action="cfg-name-save">Guardar</button>' +
          '<button class="logout-btn cfg-name-cancel-btn" data-action="cfg-name-cancel">Cancelar</button>' +
        '</div>' +
      '</div>'
    : '<div class="cfg-name-row">' +
        '<span class="cfg-name">' + esc(name || "Sin nombre") + '</span>' +
        '<button class="cfg-edit-name-btn" data-action="cfg-edit-name" title="Editar nombre">' + pencilSvg + '</button>' +
      '</div>' +
      '<div class="cfg-email">' + esc(email) + '</div>';

  const account = logged
    ? '<div class="card cfg-card">' +
        '<div class="cfg-row">' +
          // Tocando la foto (o las iniciales) se elige una nueva: galería o cámara.
          '<label class="cfg-avatar-pick" title="Cambiar foto de perfil">' +
            avatarHtml(profile && profile.avatar_path, initial, 'cfg-avatar') +
            '<span class="avatar-cam" aria-hidden="true">' + cameraSvg + '</span>' +
            '<input type="file" accept="image/*" data-action="avatar-pick" aria-label="Cambiar foto de perfil" hidden>' +
          '</label>' +
          '<div class="cfg-who">' + whoInner + '</div>' +
          (!editingName && profile ? '<div class="cfg-badge">' + esc(cfgRoleLabel(profile)) + '</div>' : '') +
        '</div>' +
        (profile && profile.avatar_path && avatarUrl(profile.avatar_path) ? '<button class="cfg-photo-rm" data-action="avatar-remove">Quitar foto de perfil</button>' : '') +
        '<button class="logout-btn" data-auth="logout">Cerrar sesión</button>' +
      '</div>'
    : '<div class="card cfg-card">' +
        '<div class="cfg-empty">No iniciaste sesión.</div>' +
        '<button class="form-save" data-action="cfg-login">Iniciar sesión</button>' +
      '</div>';

  const needsLink = logged && profile && profile.role !== "coach" && !profile.coach_id;
  const linked = logged && profile && profile.role !== "coach" && !!profile.coach_id;

  // El socio con un profe del gimnasio lo ve (y lo deja) en «Tu gimnasio», más abajo.
  const coachSection = !logged ? "" :
    linked && profeDelGym() ? "" :
    linked
      ? '<div class="card cfg-card"><div class="cfg-row-simple"><span>Tu coach</span><button class="cfg-ok" data-action="cfg-unlink-coach" title="Desvincularte de tu coach">Vinculado' + checkSvg + '</button></div></div>'
      : needsLink
        // Card normal (no .join-box) para que tenga el mismo espaciado que el resto; input y
        // botón en una fila así "Vincular" no queda como una pastilla gigante a todo el ancho.
        ? '<div class="card cfg-card">' +
            '<div class="cfg-sub" id="joinCodeLbl">Código de tu coach o gimnasio</div>' +
            '<div class="join-row">' +
              '<input id="joinCode" class="form-input" placeholder="Código" aria-labelledby="joinCodeLbl" autocomplete="off" autocapitalize="characters">' +
              '<button class="form-save join-btn" data-auth="join">Vincular</button>' +
            '</div>' +
          '</div>'
        : "";

  const notifOnNow = notifOn();
  // Lo de la pantalla de inicio es solo para Safari: la app de la tienda tiene push nativo.
  const notifSection = '<div class="card cfg-card">' +
      '<div class="cfg-notif-row">' +
        '<span class="cfg-notif-ic">' + bellSvg + '</span>' +
        '<div class="cfg-notif-txt">' +
          '<div class="cfg-notif-label">Notificaciones</div>' +
          '<div class="cfg-notif-desc">Avisos de tu coach y recordatorios</div>' +
          (!notifOnNow && !IS_NATIVE && isIOS() && !isStandalone() ? '<div class="cfg-notif-desc cfg-notif-ios">En iPhone, primero agregá GIZE a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí.</div>' : '') +
        '</div>' +
        '<button class="cfg-switch' + (notifOnNow ? ' on' : '') + '" data-action="cfg-notif-toggle" role="switch" aria-checked="' + notifOnNow + '"><span class="cfg-switch-knob"></span></button>' +
      '</div>' +
    '</div>';

  // Modo liviano: lo prende solo index.html en equipos de gama baja; acá se puede forzar.
  const liteOnNow = isLite();
  const liteSection = '<div class="card cfg-card">' +
      '<div class="cfg-notif-row">' +
        '<span class="cfg-notif-ic">' + zapSvg + '</span>' +
        '<div class="cfg-notif-txt">' +
          '<div class="cfg-notif-label">Modo liviano</div>' +
          '<div class="cfg-notif-desc">' + (document.documentElement.classList.contains("android-app") ? 'Sin sombras, brillos ni animaciones: mucho más fluida' : 'Menos animaciones y más fluidez') + '</div>' +
        '</div>' +
        '<button class="cfg-switch' + (liteOnNow ? ' on' : '') + '" data-action="cfg-lite-toggle" role="switch" aria-checked="' + liteOnNow + '"><span class="cfg-switch-knob"></span></button>' +
      '</div>' +
    '</div>';

  // Apariencia: «Oscuro» (la de siempre), «Claro» (blanco), «Azul» o «Rosa» (vidrio). Se guarda
  // en este dispositivo y se aplica al toque (app/ui/tema.js escucha los botones data-tema).
  const temaSection = '<div class="card cfg-card">' +
      '<div class="cfg-notif-row cfg-tema-row">' +
        '<span class="cfg-notif-ic">' + moonSvg + '</span>' +
        '<div class="cfg-notif-txt">' +
          '<div class="cfg-notif-label" id="cfgTemaLbl">Apariencia</div>' +
          '<div class="cfg-notif-desc">Solo en este dispositivo</div>' +
        '</div>' +
        '<div class="cfg-seg" role="radiogroup" aria-labelledby="cfgTemaLbl">' + temaOptionsHtml("cfg-seg-opt") + '</div>' +
      '</div>' +
    '</div>';

  // Neón: los bordes y brillos de colores. Prendido por defecto; se guarda en este dispositivo
  // y se aplica al toque (app/ui/neon.js escucha el interruptor data-neon-toggle).
  const neonSection = '<div class="card cfg-card">' +
      '<div class="cfg-notif-row">' +
        '<span class="cfg-notif-ic">' + sparkSvg + '</span>' +
        '<div class="cfg-notif-txt">' +
          '<div class="cfg-notif-label" id="cfgNeonLbl">Neón</div>' +
          '<div class="cfg-notif-desc">Toque de color en los bordes</div>' +
        '</div>' +
        neonSwitchHtml("cfgNeonLbl") +
      '</div>' +
    '</div>';

  // Personas bloqueadas desde el chat con el coach o desde un grupo de pasos, para desbloquearlas.
  // La lista es una hoja de app/ui/bloquear.js (la abre cualquier botón con data-bloqueados).
  const blockSection = !logged ? "" : '<div class="card cfg-card">' +
      '<button type="button" class="cfg-link-row" data-bloqueados>' +
        '<span class="cfg-link-ic">' + blockSvg + '</span>' +
        '<span class="cfg-link-label">Personas bloqueadas</span>' +
        '<span class="cfg-link-chev">' + chevronRightSvg + '</span>' +
      '</button>' +
    '</div>';

  // Funciones con IA (la foto del plato): solo si está prendida en el
  // panel, o si la persona ya la había aceptado (para que la pueda apagar). Apagarla guarda que no
  // quiere (ia_permiso) y desde ahí no se manda nada; prenderla vuelve a mostrar el aviso.
  if (logged) iaConfigRefrescar();
  const iaOn = iaPermiso() === "ok";
  const iaSection = !logged || !iaAlguna() ? "" : '<div class="card cfg-card">' +
      '<div class="cfg-notif-row">' +
        '<span class="cfg-notif-ic">' + sparkSvg + '</span>' +
        '<div class="cfg-notif-txt">' +
          '<div class="cfg-notif-label" id="cfgIaLbl">Funciones con IA</div>' +
          '<div class="cfg-notif-desc" id="cfgIaDesc">Envía a Anthropic (EE. UU.) la foto de cada consulta. Apagado: no se manda nada. ' + (iaPorGimnasio() ? IA_POR_GIMNASIO + ' ' : '') + '<a class="cfg-ia-link" href="' + LINKS.privacy + '#ia" target="_blank" rel="noopener">Política de privacidad</a></div>' +
        '</div>' +
        '<button class="cfg-switch' + (iaOn ? ' on' : '') + '" data-action="cfg-ia-toggle" role="switch" aria-checked="' + iaOn + '" aria-labelledby="cfgIaLbl" aria-describedby="cfgIaDesc"><span class="cfg-switch-knob"></span></button>' +
      '</div>' +
    '</div>';

  // Mi IA Plus (ui/ia-plus.js): solo con IA Plus prendido en el panel o con uno vigente.
  const plusSection = logged ? plusAjustesHtml() : "";

  // Botón de arrepentimiento y botón de baja (suscripciones contratadas en la web): solo en la web,
  // sin iniciar sesión (gize.ar/baja/). En las apps no: ahí no se vende nada por fuera de la tienda.
  const legalSection = '<div class="card cfg-card">' +
      cfgLinkRow(fileTextSvg, "Política de privacidad", LINKS.privacy) +
      (appNativa() ? "" : cfgLinkRow(fileTextSvg, "Botón de arrepentimiento", "https://gize.ar/baja/?tipo=arrepentimiento") + cfgLinkRow(fileTextSvg, "Botón de baja", "https://gize.ar/baja/?tipo=baja")) +
    '</div>';

  const contactSection = '<div class="card cfg-card">' +
      '<div class="cfg-sub">Contacto</div>' +
      cfgLinkRow(instagramSvg, "Instagram", LINKS.instagram) +
      (IS_NATIVE ? '' : cfgLinkRow(globeSvg, "Sitio web", LINKS.website)) +
      cfgLinkRow(auIcoMail, "Email", "mailto:" + LINKS.email) +
      cfgLinkRow(whatsappSvg, "WhatsApp", "https://wa.me/" + LINKS.whatsapp) +
    '</div>';

  // Las dos acciones destructivas juntas en una sola card (antes eran dos cards rojas seguidas).
  const dangerSection = '<div class="card cfg-card">' +
      '<div class="cfg-sub">Zona de peligro</div>' +
      '<button class="logout-btn cfg-danger" data-action="cfg-clear-local">Borrar datos de este dispositivo</button>' +
      (logged ? '<button class="logout-btn cfg-danger" data-action="cfg-delete-account">Eliminar cuenta</button>' : '') +
    '</div>';

  const about = '<div class="cfg-about"><img src="brand/logo/gize-logotipo.svg" alt="GIZE"></div>';

  checkAdmin(renderApp); // solo las cuentas administradoras ven «Revisar productos»
  return '<div class="hb-head"><div class="hb-title">Configuración</div><div class="title-accent"></div></div>' +
    account + adminEntry() + coachSection + gymSection() + notifSection + temaSection + neonSection + liteSection + iaSection + plusSection + blockSection + legalSection + contactSection + dangerSection + about;
}

document.body.addEventListener("keydown", function (e) {
  if (e.key !== "Enter" || !e.target || e.target.id !== "cfgNameInput") return;
  e.preventDefault();
  const btn = document.querySelector('[data-action="cfg-name-save"]');
  if (btn) btn.click();
});

document.body.addEventListener("click", async function (e) {
  const loginBtn = e.target.closest('[data-action="cfg-login"]');
  if (loginBtn) { showLogin("", "in"); return; }

  const editNameBtn = e.target.closest('[data-action="cfg-edit-name"]');
  if (editNameBtn) {
    State.cfgEditingName = true; renderApp();
    const i = document.getElementById("cfgNameInput"); if (i) { i.focus(); i.select(); }
    return;
  }

  const cancelNameBtn = e.target.closest('[data-action="cfg-name-cancel"]');
  if (cancelNameBtn) { State.cfgEditingName = false; renderApp(); return; }

  const saveNameBtn = e.target.closest('[data-action="cfg-name-save"]');
  if (saveNameBtn) {
    if (!State.sb || !State.cloudUser) { alert("Iniciá sesión para poder cambiar tu nombre."); return; }
    const input = document.getElementById("cfgNameInput");
    const val = ((input && input.value) || "").trim();
    if (!val) { alert("Poné un nombre."); return; }
    const prevHtml = saveNameBtn.innerHTML;
    saveNameBtn.disabled = true; saveNameBtn.innerHTML = "Guardando…";
    try {
      const r = await State.sb.from("profiles").update({ full_name: val }).eq("id", State.cloudUser.id);
      if (r.error) throw r.error;
      await loadCloud();
      State.cfgEditingName = false;
      renderApp();
    } catch (err) {
      alert("No se pudo guardar: " + ((err && err.message) || err));
      saveNameBtn.disabled = false; saveNameBtn.innerHTML = prevHtml;
    }
    return;
  }

  const unlinkBtn = e.target.closest('[data-action="cfg-unlink-coach"]');
  if (unlinkBtn) {
    // Socio con un profe del gimnasio: deja al profe pero sigue en el gimnasio (para irse está «Salir
    // del gimnasio»).
    const gymProfe = profeDelGym(), gymNom = gymProfe ? ((Gym.info.gym || {}).name || "el gimnasio") : "";
    if (gymProfe
      ? !await confirmar("¿Dejar a tu profe? Seguís en " + gymNom + ", sin profe. Para tener otro, pedíselo al gimnasio o poné el código de otro profe del gimnasio.", { titulo: "Dejar a tu profe", ok: "Dejar a tu profe", peligro: true })
      : !await confirmar("¿Seguro que te querés desvincular de tu coach? Vas a necesitar su código de invitación de nuevo si te querés volver a vincular.")) return;
    const prevHtml = unlinkBtn.innerHTML;
    unlinkBtn.disabled = true; unlinkBtn.innerHTML = gymProfe ? "Dejando…" : "Desvinculando…";
    try {
      const r = await State.sb.from("profiles").update({ coach_id: null }).eq("id", State.cloudUser.id);
      if (r.error) throw r.error;
      await loadCloud();
      if (esSocioGym()) await releerGym();
      renderApp();
    } catch (err) {
      alert("No se pudo desvincular: " + ((err && err.message) || err));
      unlinkBtn.disabled = false; unlinkBtn.innerHTML = prevHtml;
    }
    return;
  }

  const clearBtn = e.target.closest('[data-action="cfg-clear-local"]');
  if (clearBtn) {
    // Con la cuenta iniciada solo se borra la copia del celular: la sesión sigue y los datos
    // se vuelven a bajar de la cuenta. Para dejar el celular limpio está «Cerrar sesión».
    if (await confirmar(State.cloudUser
      ? "¿Seguro? Se borra la copia guardada en este dispositivo (rutinas, pesos, hábitos) y se vuelve a bajar de tu cuenta. Lo que todavía no se subió a tu cuenta puede perderse.\n\nTu sesión sigue iniciada: para dejar el dispositivo limpio usá «Cerrar sesión»."
      : "¿Seguro? Se va a borrar todo lo guardado en este dispositivo (rutinas, pesos, hábitos). Esta acción no se puede deshacer.")) {
      try { localStorage.removeItem(KEY); } catch (err) {}
      // Cardio: con la cuenta, la salida en curso queda (se retoma al recargar) y solo se suelta
      // el GPS antes de recargar. Sin cuenta se borra todo: la salida en curso, los recorridos
      // guardados y la imagen compartida.
      if (State.cloudUser) releaseForReload();
      else {
        stopForLogout(); deleteShareFile();
        try { localStorage.removeItem(TRACK_KEY); } catch (err) {}
      }
      location.reload();
    }
    return;
  }

  const notifBtn = e.target.closest('[data-action="cfg-notif-toggle"]');
  if (notifBtn) {
    if (notifBtn.disabled) return;
    notifBtn.disabled = true;
    if (notifBtn.classList.contains("on")) {
      await disablePush();
    } else {
      const err = await enablePush();
      if (err) alert(err);
    }
    notifBtn.disabled = false;
    renderApp();
    return;
  }

  const iaBtn = e.target.closest('[data-action="cfg-ia-toggle"]');
  if (iaBtn) {
    if (iaBtn.disabled) return;
    iaBtn.disabled = true;
    try {
      if (iaPermiso() === "ok") { await iaGuardarPermiso(false); iaToast("Listo: las funciones con IA quedaron apagadas. No se manda nada."); }
      else if (await pedirPermisoIA({ desdeAjustes: true })) iaToast("Listo: las funciones con IA quedaron prendidas.");
    } catch (err) { alert((err && err.message) || "No se pudo guardar. Probá de nuevo."); }
    iaBtn.disabled = false;
    renderApp();
    return;
  }

  const liteBtn = e.target.closest('[data-action="cfg-lite-toggle"]');
  if (liteBtn) {
    setLite(!isLite());
    renderApp();
    return;
  }

  const delAccBtn = e.target.closest('[data-action="cfg-delete-account"]');
  if (delAccBtn) {
    if (!State.sb || !State.cloudUser) { alert("Iniciá sesión para poder eliminar tu cuenta."); return; }
    const isCoach = !!(State.cloudProfile && State.cloudProfile.role === "coach");
    // Plan de coach con una suscripción de Apple que se renueva sola (app de iPhone,
    // supabase/compras-apple.sql): Apple la sigue cobrando aunque se borre la cuenta, y solo la
    // puede cancelar el coach desde su cuenta de Apple. Se le avisa antes.
    let appleAviso = "";
    if (isCoach) {
      try {
        const ab = await State.sb.from("coach_billing").select("*").eq("coach_id", State.cloudUser.id).maybeSingle();
        if (ab.data && ab.data.apple_renueva && ab.data.apple_vence && new Date(ab.data.apple_vence).getTime() > Date.now())
          appleAviso = "Ojo: tu suscripción de Apple no se cancela al eliminar la cuenta y Apple te la sigue cobrando. Cancelala antes desde los Ajustes de tu cuenta de Apple (Ajustes → tu nombre → Suscripciones).\n\n";
      } catch (err) {}
    }
    // IA Plus con Apple que se renueva: tampoco se cancela al borrar la cuenta. Se pregunta el estado
    // de nuevo (si no, con IA Plus de Mercado Pago sin leer, no se cancelaba).
    try { await iaEstado(true); } catch (err) {}
    const pl = plusInfo();
    if (!appleAviso && pl && pl.fuente === "apple" && pl.renueva)
      appleAviso = "Ojo: tu suscripción de IA Plus de Apple no se cancela al eliminar la cuenta y Apple te la sigue cobrando. Cancelala antes desde los Ajustes de tu cuenta de Apple (Ajustes → tu nombre → Suscripciones).\n\n";
    // Dueño de un gimnasio (core/gimnasio.js): se cierra el gimnasio. Antes se le ofrece exportar todo en
    // CSV (socios, ingresos y equipo). El borrado no se frena (Apple 5.1.1(v)).
    let gymAviso = "";
    if (rolGym() === "owner") {
      const n = (Gym.info && Gym.info.gym && Gym.info.gym.name) || "tu gimnasio";
      gymAviso = "Se cierra el gimnasio «" + n + "»: sus socios conservan sus cuentas y quedan sin profe del gimnasio. Si el gimnasio sigue, pedile a GIZE que lo pase a otra persona antes de eliminar tu cuenta.\n\n";
      if (await confirmar(gymAviso + "¿Querés exportar todo antes (socios, ingresos y equipo en CSV)?", { titulo: "Se cierra el gimnasio", ok: "Exportar todo", cancelar: "Seguir sin exportar" })) {
        try { const { exportarTodo } = await import("./gym/csv.js"); const err = await exportarTodo(); if (err) alert("No se pudo exportar: " + err); } catch (err) { alert("No se pudo exportar. Probá de nuevo."); }
      }
    }
    if (!await confirmar(isCoach
      ? gymAviso + appleAviso + "¿Seguro que querés eliminar tu cuenta de coach? Se borran tus rutinas guardadas, tus plantillas y tus datos de forma permanente, y se da de baja tu cuenta de coach. Tus alumnos quedan sin coach y conservan su rutina y sus registros, pero se borran el chat que tenían con vos y tus explicaciones de voz de los ejercicios. Esta acción no se puede deshacer."
      : appleAviso + "¿Seguro que querés eliminar tu cuenta? Se va a borrar tu rutina, tus registros, tus salidas de Cardio (con sus recorridos) y tu vínculo con tu coach de forma permanente. Esta acción no se puede deshacer.")) return;
    const typed = await pedir('Para confirmar, escribí ELIMINAR (en mayúsculas):', "", { titulo: "Eliminar cuenta", ok: "Eliminar" });
    if (typed !== "ELIMINAR") { if (typed !== null) alert("No coincide, no se eliminó nada."); return; }
    const prevHtml = delAccBtn.innerHTML;
    delAccBtn.disabled = true; delAccBtn.innerHTML = "Eliminando…";
    try {
      // Coach con suscripción activa en Mercado Pago: se cancela antes, así no le sigue
      // cobrando. Si no se puede, no se borra nada (se puede reintentar).
      if (isCoach) {
        const bl = await State.sb.from("coach_billing").select("mp_status, mp_preapproval_id").eq("coach_id", State.cloudUser.id).maybeSingle();
        if (bl.data && bl.data.mp_preapproval_id && bl.data.mp_status === "authorized") {
          const rc = await State.sb.functions.invoke("suscripcion", { body: { action: "cancel" } });
          if (rc.error || (rc.data && rc.data.error)) throw new Error(appNativa() ? "no se pudo dar de baja tu cuenta de coach. Probá de nuevo o escribinos a contacto@gize.ar" : "no se pudo cancelar tu suscripción en Mercado Pago. Probá de nuevo o escribinos a contacto@gize.ar");
        }
      }
      // IA Plus con Mercado Pago que se renueva: se cancela antes, así no le sigue cobrando.
      if (pl && pl.fuente === "mp" && pl.renueva) {
        const rp = await State.sb.functions.invoke("suscripcion", { body: { action: "iaplus_cancel" } });
        if (rp.error || (rp.data && rp.data.error)) throw new Error("no se pudo cancelar tu suscripción de IA Plus. Probá de nuevo o escribinos a contacto@gize.ar");
      }
      // Primero las fotos (perfil y productos): la función de abajo no puede borrar archivos
      // de Storage. Si esto falla se corta acá, con la cuenta intacta, para poder reintentar
      // en vez de dejar fotos sin dueño.
      await deleteMyStorageFiles();
      // Cuenta de Apple (app de iPhone): un código nuevo de Apple para revocar el acceso de GIZE.
      const appleCode = await appleCodeForDelete();
      // Después la función borrar-audios: borra los mensajes de voz y la cuenta (llama a
      // delete_own_account, ver supabase/pagos-seguros.sql, que borra auth.users y en cascada
      // todo lo que depende de él).
      await deleteMyAccount(appleCode);
      State.signingOut = true; // la sesión se cierra a propósito: no pedir ingresar de nuevo (core/supabase.js → watchAuth)
      // Como al cerrar sesión: se da de baja este dispositivo para que la próxima cuenta que
      // entre acá no quede con las notificaciones prendidas sin haberlas activado. Va después
      // de borrar la cuenta: si eso falla, el celular no pierde sus notificaciones.
      try { await pushLogout(); } catch (err) {}
      try { localStorage.removeItem(KEY); localStorage.removeItem(PROFILE_KEY); } catch (err) {}
      stopForLogout(); // deja de mirar el GPS y borra la salida en curso
      clearAccountLeftovers(State.cloudUser && State.cloudUser.id);
      try { await Promise.race([State.sb.auth.signOut(), new Promise(r => setTimeout(r, 5000))]); } catch (err) {}
      forgetStoredSession(); // la cuenta ya no existe: que no quede su sesión guardada en el dispositivo
      // Se recarga recién cuando cierra el aviso: alert() ya no frena la app (ui/avisos.js) y,
      // si no, la recarga lo sacaba antes de que se pudiera leer.
      await alert("Tu cuenta fue eliminada.");
      location.reload();
    } catch (err) {
      alert("No se pudo eliminar la cuenta: " + ((err && err.message) || err));
      delAccBtn.disabled = false; delAccBtn.innerHTML = prevHtml;
    }
    return;
  }
});
