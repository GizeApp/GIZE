// Configuración del propio coach (tuerca de la barra lateral): una pantalla más del panel, con un
// menú de secciones a la izquierda (arriba en el celular) y el contenido de la elegida a la derecha.
// Antes era un modal angosto con todo en una sola lista larga.
//
// Las acciones son las de siempre (data-coach="settings-name-save", "notif-toggle", "q-open"…, ver
// main.js y preguntas.js): acá solo se dibuja. La sección abierta vive en CoachState.coachSetSec.
import { State } from '../../core/state.js';

import { esc } from '../../core/utils.js';

import { avatarHtml, avatarUrl } from '../../core/avatar.js';

import { coachInitials } from './clientes.js';

import { CoachState } from './state.js';

import { pushOnHere } from '../../core/push.js';

import { adminEntry, checkAdmin } from '../admin-productos.js';

import { temaOptionsHtml } from '../../ui/tema.js';
import { neonSwitchHtml } from '../../ui/neon.js';

import { appNativa } from '../../core/tienda.js';
import { comprasApple } from '../../core/compras-apple.js';

import { alRepintar, renderQuestionsEditor } from './preguntas.js';

const ic = d => '<svg class="cs-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const IC = {
  user: ic('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>'),
  palette: ic('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4C21 7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>'),
  bell: ic('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>'),
  card: ic('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/>'),
  help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.1"/>'),
  shield: ic('<path d="M12 3l8 3v5.5c0 4.5-3.2 8-8 9.5-4.8-1.5-8-5-8-9.5V6z"/><path d="M9 12l2 2 4-4"/>'),
  out: ic('<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>'),
  mail: ic('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>'),
  go: ic('<path d="M9 6l6 6-6 6"/>')
};

// Secciones del menú: [clave, título, ícono, resumen corto].
function secciones(){
  const l = [["perfil", "Perfil", IC.user, "Foto y nombre"], ["apariencia", "Apariencia", IC.palette, "Tema y neón"], ["avisos", "Avisos", IC.bell, pushOnHere() ? "Activados" : "Apagados"]];
  if(!appNativa() || comprasApple()) l.push(["plan", "Mi plan", IC.card, "Plan y clientes"]);
  l.push(["preguntas", "Preguntas", IC.help, "Registro y check-in"], ["privacidad", "Privacidad", IC.shield, "Bloqueos y políticas"], ["cuenta", "Cuenta", IC.out, "Sesión y baja"]);
  return l;
}

// Una fila de la pantalla: ícono + título/descripción + el control a la derecha.
const fila = (icon, titulo, desc, control) => '<div class="cs-row"><span class="cs-row-ic">' + icon + '</span><div class="cs-row-t"><b>' + titulo + '</b>' + (desc ? '<span>' + desc + '</span>' : '') + '</div>' + (control ? '<div class="cs-row-c">' + control + '</div>' : '') + '</div>';
const card = (titulo, desc, inner) => '<section class="cv-card cs-card"><h2 class="cs-h">' + titulo + '</h2>' + (desc ? '<p class="cs-sub">' + desc + '</p>' : '') + inner + '</section>';

function secPerfil(){
  const name = (State.cloudProfile && State.cloudProfile.full_name) || (State.cloudUser && State.cloudUser.email) || "";
  const draft = CoachState.coachNameForm != null ? CoachState.coachNameForm : name;
  const tieneFoto = State.cloudProfile && State.cloudProfile.avatar_path && avatarUrl(State.cloudProfile.avatar_path);
  const email = State.cloudUser && State.cloudUser.email;
  return card("Foto de perfil", "La ven tus clientes en el chat y en su lista.",
      '<div class="cs-avatar-row">' + avatarHtml(State.cloudProfile && State.cloudProfile.avatar_path, coachInitials(name), 'co-avatar cs-avatar-big') +
        '<div class="cs-avatar-col"><label class="cp-copt cs-photo-btn">' + (tieneFoto ? 'Cambiar foto' : 'Subir foto') + '<input type="file" accept="image/*" data-action="avatar-pick" hidden></label>' +
        (tieneFoto ? '<button class="cs-photo-rm" data-action="avatar-remove">Quitar foto</button>' : '') + '</div></div>') +
    card("Nombre de usuario", "Así te ven tus clientes.",
      '<div class="cs-field"><input class="co-note cs-name" data-coach="settings-name" value="' + esc(draft) + '" aria-label="Nombre de usuario" autocomplete="name"></div>' +
      '<button class="co-save-rt cs-save" data-coach="settings-name-save">Guardar nombre</button>') +
    (email ? card("Cuenta de acceso", "", fila(IC.mail, esc(email), "El mail con el que entrás a GIZE.", "")) : "");
}

function secApariencia(){
  return card("Tema", "Se aplica al toque y queda guardado solo en este dispositivo.",
      '<div class="cs-tema" role="radiogroup" aria-label="Apariencia">' + temaOptionsHtml("cp-copt cs-tema-opt") + '</div>') +
    card("Neón", "Los bordes y brillos de colores.",
      '<div class="cs-neon"><span id="csNeonLbl">Toque de color en los bordes</span>' + neonSwitchHtml("csNeonLbl") + '</div>');
}

function secAvisos(){
  const on = pushOnHere();
  return card("Avisos en este dispositivo", "Te avisamos cuando un alumno manda su check-in semanal o lleva 4 días sin entrenar.",
    fila(IC.bell, on ? "Avisos activados" : "Avisos apagados", on ? "Este dispositivo recibe los avisos." : "Activalos para no perderte un check-in.",
      '<button class="cs-pill cs-notif' + (on ? ' on' : '') + '" data-coach="notif-toggle">' + (on ? 'Apagar' : 'Activar') + '</button>'));
}

function secPlan(){
  return card("Plan de GIZE", "Tu plan actual, cuántos clientes podés tener y cómo cambiarlo.",
    '<button class="cs-link" data-plan="open"><span class="cs-row-ic">' + IC.card + '</span><span class="cs-row-t"><b>Ver mi plan y cantidad de clientes</b></span>' + IC.go + '</button>');
}

const secPreguntas = renderQuestionsEditor;

function secPrivacidad(){
  // La lista de bloqueados es una hoja de ui/bloquear.js (la abre cualquier botón con data-bloqueados).
  return card("Bloqueos", "Personas que bloqueaste desde el chat.",
      '<button class="cs-link" data-bloqueados><span class="cs-row-ic">' + IC.shield + '</span><span class="cs-row-t"><b>Personas bloqueadas</b></span>' + IC.go + '</button>') +
    card("Privacidad", "Cómo cuida GIZE tus datos y los de tus clientes.",
      '<a class="cs-link" href="https://gize.ar/privacidad/?app=1" target="_blank" rel="noopener"><span class="cs-row-ic">' + IC.shield + '</span><span class="cs-row-t"><b>Política de privacidad</b></span>' + IC.go + '</a>') +
    (adminEntry() ? card("Administración de GIZE", "", adminEntry()) : "");
}

function secCuenta(){
  return card("Sesión", "Salís de GIZE en este dispositivo.", '<button class="logout-btn cs-out" data-auth="logout">Cerrar sesión</button>') +
    card("Eliminar cuenta", "Se borra tu cuenta y no se puede deshacer.", '<button class="logout-btn cfg-danger cs-out" data-action="cfg-delete-account">Eliminar cuenta</button>');
}

const BODY = { perfil: secPerfil, apariencia: secApariencia, avisos: secAvisos, plan: secPlan, preguntas: secPreguntas, privacidad: secPrivacidad, cuenta: secCuenta };

// Contenido de la pantalla (lo envuelve coachShell en index.js).
// En el celular el menú de secciones es una fila que se desliza: al redibujar volvía al principio y
// la sección elegida («Privacidad», «Cuenta», o «Preguntas» desde el «?») quedaba afuera de la
// pantalla. Después de dibujar, la elegida se corre a la vista.
function mostrarElegida(){
  const nav = document.querySelector("#coachHost .cs-nav"), on = nav && nav.querySelector(".cs-nav-i.on");
  if(!on || nav.scrollWidth <= nav.clientWidth) return;
  const nr = nav.getBoundingClientRect(), r = on.getBoundingClientRect();
  if(r.left < nr.left || r.right > nr.right) nav.scrollLeft += (r.left + r.width / 2) - (nr.left + nr.width / 2);
}

export function renderSettingsView(){
  checkAdmin(renderCoachSettings);
  queueMicrotask(mostrarElegida);
  const secs = secciones();
  let k = CoachState.coachSetSec;
  if(!secs.some(s => s[0] === k)) k = "perfil";
  const menu = secs.map(s => '<button class="cs-nav-i' + (s[0] === k ? ' on' : '') + '" data-coach="settings-sec" data-k="' + s[0] + '"' + (s[0] === k ? ' aria-current="page"' : '') + '>' +
    s[2] + '<span class="cs-nav-t"><b>' + s[1] + '</b><small>' + s[3] + '</small></span></button>').join("");
  return '<div class="co-head cv-head"><button class="co-back" data-coach="settings-back">‹ Volver</button></div>' +
    '<h1 class="cv-title cs-title">Configuración</h1>' +
    '<div class="cs-layout"><nav class="cs-nav" aria-label="Secciones de configuración">' + menu + '</nav><div class="cs-body" data-sec="' + k + '">' + BODY[k]() + '</div></div>';
}

// Vuelve a dibujar solo el contenido de la pantalla (si está abierta) sin armar el panel entero:
// lo llaman la foto, los avisos, el editor de preguntas al cerrarse y la carga del acceso de admin.
// Si quedó una hoja del panel montada (el editor de preguntas), se saca.
export function renderCoachSettings(){
  const host = document.getElementById("coachSheetHost"); if(host) host.innerHTML = "";
  if(CoachState.coachView !== "settings" || CoachState.coachSel) return;
  const w = document.querySelector(".cv-wrap"); if(!w) return;
  const y = window.scrollY;
  w.innerHTML = renderSettingsView();
  window.scrollTo(0, y);
}

alRepintar(renderCoachSettings);
