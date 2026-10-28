// El marco del panel del gimnasio: el mismo de coachShell (app/screens/coach/panel.js: barra lateral en
// la compu, píldora abajo en el celular) con otras opciones y la marca del gimnasio. En el celular la
// píldora tiene Inicio, Socios, Asistencia y «Más» (el resto, en una hoja).
// Las opciones «Como profe» (Mis alumnos, Rutinas y Planes alimenticios) y «Mi cuenta» abren las
// pantallas de hoy del panel de coach (data-coach), adentro de este mismo marco; solo con cuenta de
// coach. «Mis alumnos» es la lista de Clientes de hoy (sus alumnos propios, de afuera del gimnasio, y
// los socios que atiende como profe), con su ficha y el chat: sin esto, la dueña o la administración
// con alumnos propios no tenía cómo llegar a ellos.
import { esc } from '../../core/utils.js';
import { gearSvg } from '../../core/icons.js';
import { CoachState } from '../coach/state.js';
import { GS, info, gym, soyCoach, enApp } from './estado.js';

const ico = d => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
export const I = {
  home: ico('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>'),
  users: ico('<circle cx="9" cy="8" r="3.3"/><path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5"/><path d="M16 4.9a3.2 3.2 0 0 1 0 6.2"/><path d="M18 14.9c1.9.7 3 2.4 3 4.6"/>'),
  team: ico('<circle cx="12" cy="7.5" r="3.2"/><path d="M5.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2"/><path d="M4 11.5l2 1.2M20 11.5l-2 1.2"/>'),
  check: ico('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16 9.6"/>'),
  dumbbell: ico('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  fork: ico('<path d="M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 11.5V21"/><path d="M17 3c-2.2 1.8-3 4.5-3 8h3v10"/>'),
  desk: ico('<path d="M3 10h18M5 10v10M19 10v10M8 6h8l1 4H7z"/>'),
  star: ico('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  more: ico('<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>'),
  user: ico('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>'),
  cash: ico('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>'),
  cal: ico('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h2M14 13.5h2M8 17h2"/>'),
  alumnos: ico('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h3.5M14.5 13.5h3.5"/>'),
};

// [clave, texto, ícono, atributos, en la píldora del celular]
function opciones(){
  const c = info().contadores || {}, coach = soyCoach();
  const L = [
    ["-", "Gimnasio"],
    ["inicio", "Inicio", I.home, 'data-gym="ir" data-v="inicio"', true],
    ["socios", "Socios", I.users, 'data-gym="ir" data-v="socios"', true, (c.solicitudes || 0) + (c.fotos_pendientes || 0)],
    ["profes", "Profes", I.team, 'data-gym="ir" data-v="profes"', false],
    ["recepcion", "Recepción", I.desk, 'data-gym="ir" data-v="recepcion"', false],
    ["asistencia", "Asistencia", I.check, 'data-gym="ir" data-v="asistencia"', true],
    // Cuotas (etapa 2): lo que le pagan al gimnasio en el mostrador; en el celular, en «Más».
    ["cuotas", "Cuotas", I.cash, 'data-gym="ir" data-v="cuotas"', false],
    // Clases (etapa 3): la grilla de la semana, las reservas y el presente; en el celular, en «Más».
    ["clases", "Clases", I.cal, 'data-gym="ir" data-v="clases"', false],
  ];
  if (coach) L.push(["-", "Como profe"]);
  if (coach && CoachState.coachClients.length) L.push(["alumnos", "Mis alumnos", I.alumnos, 'data-coach="view-clients" data-gy-coach="1"', false]);
  if (coach) L.push(
    ["tpls", "Rutinas", I.dumbbell, 'data-coach="view-tpls" data-gy-coach="1"', false],
    ["meals", "Planes<span class=\"cv-more\"> alimenticios</span>", I.fork, 'data-coach="view-meals" data-gy-coach="1"', false]);
  L.push(["-", "Más"],
    ["config", "Configuración", gearSvg, 'data-gym="ir" data-v="config"', false],
    // En las apps, sin nombrar el plan (pantalla neutra: app/screens/gym/plan.js).
    ["plan", enApp() ? "Acceso a GIZE" : "Plan de GIZE", I.star, 'data-gym="ir" data-v="plan"', false]);
  return L;
}
// Lo que dibuja el panel de coach adentro del marco (coachShell): su opción marcada.
// La ficha de entrenamiento abierta desde la ficha de un socio va con Socios; desde «Mis alumnos», con esa.
const DE_COACH = { home: "inicio", tpls: "tpls", meals: "meals", settings: "cuenta" };

export function marcoGym(active, inner){
  const on = active === "clients" ? (GS.vuelta === "ficha" ? "socios" : "alumnos") : DE_COACH[active] || active;
  const ops = opciones(), g = gym();
  const boton = o => {
    if (o[0] === "-") return o[1] ? '<div class="gy-nav-sec" aria-hidden="true">' + esc(o[1]) + '</div>' : '<div class="gy-nav-sep" aria-hidden="true"></div>';
    const marcado = o[0] === on;
    return '<button class="cv-nav-i' + (o[4] ? '' : ' gy-solo-compu') + (marcado ? ' on' : '') + '" ' + o[3] + (marcado ? ' aria-current="page"' : '') + '>' + o[2] +
      (o[5] ? '<i class="cv-pip" aria-hidden="true"></i>' : '') + '<span>' + o[1] + '</span>' + (o[5] ? '<b class="gy-nav-n" aria-label="' + o[5] + ' para revisar">' + o[5] + '</b>' : '') + '</button>';
  };
  const masOn = !ops.some(o => o[4] && o[0] === on);
  return '<div class="cv-shell gy-shell">' +
    '<aside class="cv-side">' +
      '<div class="co-brand cv-brand gy-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="gy-brand-n" title="' + esc(g.name || "") + '">' + esc(g.name || "Tu gimnasio") + '</span></div>' +
      '<nav class="cv-nav gy-nav" aria-label="Panel del gimnasio">' + ops.map(boton).join("") +
        '<button class="cv-nav-i gy-solo-cel' + (masOn ? ' on' : '') + '" data-gym="mas" aria-haspopup="dialog">' + I.more + '<span>Más</span></button></nav>' +
      '<div class="cv-util">' +
        (soyCoach() ? '<button class="cv-util-i' + (on === "cuenta" ? ' on' : '') + '" data-coach="open-settings" data-gy-coach="1" title="Tu cuenta: perfil, apariencia y avisos">' + I.user + '<span>Mi cuenta</span></button>' : '') +
        '<button class="cv-util-i cv-out" data-auth="logout"><span>Salir</span></button>' +
      '</div>' +
    '</aside>' +
    '<main class="cv-main"><div class="co-wrap cv-wrap gy-wrap">' + inner + '</div></main>' +
  '</div>';
}

// La hoja «Más» del celular: lo que no entra en la píldora.
export function hojaMas(){
  const ops = opciones().filter(o => o[0] !== "-" && !o[4]);
  return '<div class="gy-sheet-bg" data-gym="cerrar"></div><div class="gy-sheet" role="dialog" aria-modal="true" aria-label="Más opciones">' +
    '<div class="gy-sheet-h"><b>Más</b><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<div class="gy-mas">' + ops.map(o => '<button class="gy-mas-i" ' + o[3] + '>' + o[2] + '<span>' + o[1].replace(/<[^>]+>/g, "") + '</span></button>').join("") +
    (soyCoach() ? '<button class="gy-mas-i" data-coach="open-settings" data-gy-coach="1">' + I.user + '<span>Mi cuenta</span></button>' : '') +
    '<button class="gy-mas-i" data-auth="logout"><span>Salir</span></button></div></div>';
}

export const cabeza = (titulo, acciones, sub) => '<div class="co-head cv-head gy-head"><div class="gy-head-t"><h1 class="cv-title">' + titulo + '</h1>' + (sub ? '<div class="gy-head-sub">' + sub + '</div>' : '') + '</div>' + (acciones ? '<div class="cv-head-actions">' + acciones + '</div>' : '') + '</div>';
export const btn = (attrs, texto, cls) => '<button class="' + (cls || "gize-btn cv-btn") + '" ' + attrs + '>' + texto + '</button>';
export const btn2 = (attrs, texto) => '<button class="co-copy-btn cv-sec-btn gy-btn2" ' + attrs + '>' + texto + '</button>';
export const vacio = (t, extra) => '<div class="cv-card gy-vacio"><p>' + t + '</p>' + (extra || "") + '</div>';
export const cargando = (t) => '<div class="cv-card gy-vacio" aria-busy="true"><p>' + (t || "Cargando…") + '</p></div>';
export { GS };
