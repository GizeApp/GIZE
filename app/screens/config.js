// Pantalla de Configuración (cuenta, vínculo con coach, borrado de datos locales).
// Antes vivía como un "addon" pegado al final del index.html que parcheaba
// renderApp por monkey-patching para no tocar el original; con módulos reales
// ya no hace falta el parche: main.js llama a renderConfig() directamente
// cuando State.view === "config".
import { State } from '../core/state.js';
import { KEY, save } from '../core/storage.js';
import { DISCIPLINAS, myDisciplinas, toggleDisciplina } from '../core/disciplinas.js';
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
import { bellSvg, fileTextSvg, instagramSvg, globeSvg, auIcoMail, whatsappSvg, chevronRightSvg, pencilSvg, checkSvg } from '../core/icons.js';

const cameraSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const moonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const sparkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';
const zapSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';

function cfgRoleLabel(p) { return (p && p.role === "coach") ? "Coach" : "Cliente"; }

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

  const coachSection = !logged ? "" :
    linked
      ? '<div class="card cfg-card"><div class="cfg-row-simple"><span>Tu coach</span><button class="cfg-ok" data-action="cfg-unlink-coach" title="Desvincularte de tu coach">Vinculado' + checkSvg + '</button></div></div>'
      : needsLink
        // Card normal (no .join-box) para que tenga el mismo espaciado que el resto; input y
        // botón en una fila así "Vincular" no queda como una pastilla gigante a todo el ancho.
        ? '<div class="card cfg-card">' +
            '<div class="cfg-sub">Vinculate a tu coach</div>' +
            '<div class="join-row">' +
              '<input id="joinCode" class="form-input" placeholder="Código del coach">' +
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
  // El selector va en su propio renglón, debajo del título (cuatro opciones no entran al lado
  // del texto en un celular angosto).
  // Disciplina: el buscador de ejercicios muestra primero lo de su rubro (app/core/disciplinas.js).
  const mine = myDisciplinas().map(d => d.id);
  const discSection = (profile && profile.role === "coach") ? "" : '<div class="card cfg-card" id="cfgDisc">' +
      '<div class="cfg-sub">Tu disciplina</div>' +
      '<div class="cfg-disc-desc">Elegí qué entrenás (podés marcar más de una). Al armar tu rutina te mostramos primero esos ejercicios.</div>' +
      '<div class="cfg-disc">' + DISCIPLINAS.map(d => '<button class="ex-chip' + (mine.includes(d.id) ? ' on' : '') + '" data-action="cfg-disc" data-id="' + d.id + '" aria-pressed="' + mine.includes(d.id) + '">' + esc(d.name) + '</button>').join("") + '</div>' +
    '</div>';

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

  const legalSection = '<div class="card cfg-card">' +
      cfgLinkRow(fileTextSvg, "Política de privacidad", LINKS.privacy) +
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
    account + adminEntry() + coachSection + discSection + notifSection + temaSection + neonSection + liteSection + legalSection + contactSection + dangerSection + about;
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
    if (!confirm("¿Seguro que te querés desvincular de tu coach? Vas a necesitar su código de invitación de nuevo si te querés volver a vincular.")) return;
    const prevHtml = unlinkBtn.innerHTML;
    unlinkBtn.disabled = true; unlinkBtn.innerHTML = "Desvinculando…";
    try {
      const r = await State.sb.from("profiles").update({ coach_id: null }).eq("id", State.cloudUser.id);
      if (r.error) throw r.error;
      await loadCloud();
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
    if (confirm(State.cloudUser
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

  const discBtn = e.target.closest('[data-action="cfg-disc"]');
  if (discBtn) {
    toggleDisciplina(discBtn.dataset.id);
    save();
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
    if (!confirm(isCoach
      ? "¿Seguro que querés eliminar tu cuenta de coach? Se borran tus rutinas guardadas, tus plantillas y tus datos de forma permanente, y se da de baja tu cuenta de coach. Tus alumnos quedan sin coach y conservan su rutina y sus registros, pero se borran el chat que tenían con vos y tus explicaciones de voz de los ejercicios. Esta acción no se puede deshacer."
      : "¿Seguro que querés eliminar tu cuenta? Se va a borrar tu rutina, tus registros, tus salidas de Cardio (con sus recorridos) y tu vínculo con tu coach de forma permanente. Esta acción no se puede deshacer.")) return;
    const typed = prompt('Para confirmar, escribí ELIMINAR (en mayúsculas):');
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
      alert("Tu cuenta fue eliminada.");
      location.reload();
    } catch (err) {
      alert("No se pudo eliminar la cuenta: " + ((err && err.message) || err));
      delAccBtn.disabled = false; delAccBtn.innerHTML = prevHtml;
    }
    return;
  }
});
