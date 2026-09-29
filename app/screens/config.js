// Pantalla de Configuración (cuenta, vínculo con coach, borrado de datos locales).
// Antes vivía como un "addon" pegado al final del index.html que parcheaba
// renderApp por monkey-patching para no tocar el original; con módulos reales
// ya no hace falta el parche: main.js llama a renderConfig() directamente
// cuando State.view === "config".
import { State } from '../core/state.js';
import { KEY } from '../core/storage.js';
import { clearAccountLeftovers, loadCloud, deleteMyStorageFiles, deleteMyAccount, PROFILE_KEY } from '../core/supabase.js';
import { esc } from '../core/utils.js';
import { avatarHtml, avatarUrl } from '../core/avatar.js';
import { showLogin } from './auth.js';
import { pushOnHere, enablePush, disablePush, isIOS, isStandalone } from '../core/push.js';
import { renderApp } from '../main.js';
import { adminEntry, checkAdmin } from './admin-productos.js';
import { isLite, setLite } from '../ui/background.js';
import { bellSvg, fileTextSvg, instagramSvg, globeSvg, auIcoMail, whatsappSvg, chevronRightSvg, pencilSvg, checkSvg } from '../core/icons.js';

const cameraSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const zapSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';

function cfgRoleLabel(p) { return (p && p.role === "coach") ? "Coach" : "Cliente"; }

// Links externos de la pantalla de Configuración. Placeholders a propósito: reemplazar
// cada uno por el real (instagram/website: URL completa; email: solo la casilla;
// whatsapp: solo número con código de país, sin "+" ni espacios ni guiones) y listo,
// los botones ya redirigen solos — no hace falta tocar nada más de este archivo.
const LINKS = {
  terms: "https://gize.ar/privacidad/",
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
  const notifSection = '<div class="card cfg-card">' +
      '<div class="cfg-notif-row">' +
        '<span class="cfg-notif-ic">' + bellSvg + '</span>' +
        '<div class="cfg-notif-txt">' +
          '<div class="cfg-notif-label">Notificaciones</div>' +
          '<div class="cfg-notif-desc">Avisos de tu coach y recordatorios</div>' +
          (!notifOnNow && isIOS() && !isStandalone() ? '<div class="cfg-notif-desc cfg-notif-ios">En iPhone, primero agregá GIZE a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí.</div>' : '') +
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
          '<div class="cfg-notif-desc">Menos animaciones y más fluidez</div>' +
        '</div>' +
        '<button class="cfg-switch' + (liteOnNow ? ' on' : '') + '" data-action="cfg-lite-toggle" role="switch" aria-checked="' + liteOnNow + '"><span class="cfg-switch-knob"></span></button>' +
      '</div>' +
    '</div>';

  const legalSection = '<div class="card cfg-card">' +
      cfgLinkRow(fileTextSvg, "Términos y condiciones", LINKS.terms) +
    '</div>';

  const contactSection = '<div class="card cfg-card">' +
      '<div class="cfg-sub">Contacto</div>' +
      cfgLinkRow(instagramSvg, "Instagram", LINKS.instagram) +
      cfgLinkRow(globeSvg, "Sitio web", LINKS.website) +
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
    account + adminEntry() + coachSection + notifSection + liteSection + legalSection + contactSection + dangerSection + about;
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
    if (confirm("¿Seguro? Se va a borrar todo lo guardado en este dispositivo (rutinas, pesos, hábitos). Esta acción no se puede deshacer.")) {
      try { localStorage.removeItem(KEY); } catch (err) {}
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
      ? "¿Seguro que querés eliminar tu cuenta de coach? Se borran tus rutinas guardadas, tus plantillas y tus datos de forma permanente, y se cancela tu suscripción de GIZE. Tus alumnos no pierden nada: quedan sin coach y conservan su rutina y sus registros. Esta acción no se puede deshacer."
      : "¿Seguro que querés eliminar tu cuenta? Se va a borrar tu rutina, tus registros y tu vínculo con tu coach de forma permanente. Esta acción no se puede deshacer.")) return;
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
          if (rc.error || (rc.data && rc.data.error)) throw new Error("no se pudo cancelar tu suscripción en Mercado Pago. Probá de nuevo o escribinos a contacto@gize.ar");
        }
      }
      // Primero las fotos (check-in y perfil). Si esto falla se corta acá, con la cuenta
      // intacta, para poder reintentar en vez de dejar fotos sin dueño.
      await deleteMyStorageFiles();
      // Después la función borrar-audios: borra los mensajes de voz y la cuenta (llama a
      // delete_own_account, ver supabase/pagos-seguros.sql, que borra auth.users y en cascada
      // todo lo que depende de él).
      await deleteMyAccount();
      try { localStorage.removeItem(KEY); localStorage.removeItem(PROFILE_KEY); } catch (err) {}
      clearAccountLeftovers(State.cloudUser && State.cloudUser.id);
      try { await State.sb.auth.signOut(); } catch (err) {}
      alert("Tu cuenta fue eliminada.");
      location.reload();
    } catch (err) {
      alert("No se pudo eliminar la cuenta: " + ((err && err.message) || err));
      delAccBtn.disabled = false; delAccBtn.innerHTML = prevHtml;
    }
    return;
  }
});
