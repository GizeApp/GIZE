// Inicio del panel del gimnasio (SPEC §2.2, sin cuotas ni clases): qué hay que hacer hoy. Conteos y
// listas para operar, sin gráficos. Los carteles del plan van solo en la web (en las apps, nada de
// planes ni vencimientos de GIZE). Sin nada cargado, la lista de los primeros pasos que se tachan sola.
import { esc } from '../../core/utils.js';
import { GS, info, gym, enApp, fecha, plural } from './estado.js';
import { cabeza, btn, btn2 } from './marco.js';

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function hoyLargo(){
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES[d.getMonth()];
}
const diasA = iso => iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5) : null;

// Carteles del plan (solo en la web; dueño y administración).
export function cartelesPlan(){
  if (enApp()) return "";
  const pl = info().plan; if (!pl) return "";
  const out = [], ver = '<button class="cv-link" data-gym="ir" data-v="plan">Ver el plan</button>';
  const vence = pl.vence ? fecha(pl.vence) : "", d = diasA(pl.vence);
  if (pl.estado === "gracia") out.push(["warn", "El plan venció el " + vence + ": tus profes pierden el acceso a los socios el " + fecha(pl.pausa_profes_el) + "."]);
  else if (pl.estado === "operativo") out.push(["bad", "El plan venció: tus profes y la administración ya no ven los datos de los socios. La recepción sigue andando hasta el " + fecha(pl.libera_el) + "."]);
  else if (pl.estado === "liberado") out.push(["bad", "El plan venció y tus socios quedaron sin profe. Al renovarlo vuelven solos con su profe."]);
  else if (pl.plan === "trial" && d !== null && d <= 14) out.push([d <= 3 ? "warn" : "", "Tu prueba termina en " + plural(Math.max(d, 1), "día", "días") + " (el " + vence + ")."]);
  else if (pl.plan !== "cortesia" && d !== null && d <= 7) out.push(["warn", "El plan vence el " + vence + "."]);
  if (pl.sobre_cupo) out.push(["warn", "Tenés " + pl.seats_used + " socios y tu plan es de " + pl.max + ": no podés sumar socios."]);
  return out.map(([c, t]) => '<div class="gy-cartel ' + c + '" role="status"><span>' + esc(t) + '</span>' + ver + '</div>').join("");
}

export function renderInicio(){
  const c = info().contadores || {}, pl = info().plan || {}, socios = GS.socios || [], equipo = GS.equipo || [];
  const activos = socios.filter(s => s.estado === "activo" || s.estado === "pausado");
  const usados = pl.seats_used != null ? pl.seats_used : activos.length;
  const tarjeta = (titulo, n, sub, attrs) => '<button class="cv-card cv-stat gy-stat" ' + attrs + '><div class="cv-stat-l">' + titulo + '</div><div class="cv-stat-n">' + n + '</div><div class="gy-stat-s">' + sub + '</div></button>';
  const stats = '<div class="cv-stats gy-stats">' +
    tarjeta("Socios", enApp() || !pl.max ? usados : usados + '<small> / ' + pl.max + '</small>', c.sin_profe ? '<span class="gy-ambar">' + plural(c.sin_profe, "sin profe", "sin profe") + '</span>' : "Todos con profe", 'data-gym="ir" data-v="socios"') +
    tarjeta("Ingresos hoy", c.ingresos_hoy || 0, "En la recepción", 'data-gym="ir" data-v="asistencia"') +
    tarjeta("Solicitudes", c.solicitudes || 0, c.solicitudes ? "Para revisar" : "Ninguna pendiente", 'data-gym="socios-tab" data-v="solicitudes"') +
  '</div>';
  // Para hacer
  const viejos = socios.filter(s => s.app_vieja).length, profesViejos = equipo.filter(p => p.app_vieja).length;
  const L = [];
  const item = (n, txt, accion, attrs) => n ? L.push('<div class="cv-li gy-todo"><span class="cv-li-n">' + txt + '</span><button class="co-copy-btn cv-sec-btn gy-btn2" ' + attrs + '>' + accion + '</button></div>') : 0;
  item(c.solicitudes, plural(c.solicitudes, "pedido para sumarse", "pedidos para sumarse"), "Revisar", 'data-gym="socios-tab" data-v="solicitudes"');
  item(c.sin_profe, plural(c.sin_profe, "socio sin profe", "socios sin profe"), "Asignar", 'data-gym="filtro" data-k="sinProfe"');
  item(c.falta_confirmacion, plural(c.falta_confirmacion, "socio no confirmó", "socios no confirmaron") + " lo que ve el gimnasio", "Ver", 'data-gym="filtro" data-k="faltaConf"');
  item(c.fotos_pendientes, plural(c.fotos_pendientes, "foto para aprobar", "fotos para aprobar"), "Revisar", 'data-gym="filtro" data-k="fotoPend"');
  item(c.invitaciones, plural(c.invitaciones, "invitación sin aceptar", "invitaciones sin aceptar"), "Ver", 'data-gym="ir" data-v="profes"');
  item(c.aptos_vencidos, plural(c.aptos_vencidos, "apto médico vencido", "aptos médicos vencidos"), "Ver", 'data-gym="filtro" data-k="aptoVencido"');
  item(viejos + profesViejos, [viejos ? plural(viejos, "socio", "socios") : "", profesViejos ? plural(profesViejos, "persona del equipo", "personas del equipo") : ""].filter(Boolean).join(" y ") + " con una versión vieja de la app", "Ver", 'data-gym="filtro" data-k="appVieja"');
  const todo = '<section class="gy-col"><h2 class="cv-h2">Para hacer</h2><div class="cv-card cv-list">' + (L.length ? L.join("") : '<div class="cv-empty">Nada pendiente por hoy.</div>') + '</div></section>';
  // Primeros pasos: se tachan solos.
  const pasos = [
    [equipo.some(p => p.rol !== "owner") || (c.invitaciones || 0) > 0, "Invitá a tus profes", 'data-gym="ir" data-v="profes"'],
    [usados > 0 || socios.length > 0, "Sumá socios: compartí el código o cargalos", 'data-gym="sumar"'],
    [(c.ingresos_hoy || 0) > 0 || recepcionProbada(), "Probá la recepción con tu celular", 'data-gym="ir" data-v="recepcion"'],
  ];
  const primer = pasos.every(p => p[0]) || GS.socios === null ? "" : '<section class="cv-card gy-pasos"><h2 class="cv-h2">Para arrancar</h2><ol>' +
    pasos.map(p => '<li class="' + (p[0] ? "hecho" : "") + '"><button class="gy-paso" ' + p[2] + '>' + (p[0] ? '<s>' + p[1] + '</s>' : p[1]) + '</button></li>').join("") + '</ol></section>';
  return cabeza("Inicio", btn('data-gym="sumar"', "Sumar socio") + btn2('data-gym="ir" data-v="recepcion"', "Abrir recepción"), esc(gym().name || "") + " · " + hoyLargo()) +
    cartelesPlan() + primer + stats + '<div class="gy-cols">' + todo + '</div>';
}
const PROBADA = "gize_gym_recepcion_vista";
export function recepcionProbada(){ try { return localStorage.getItem(PROBADA) === "1"; } catch (e) { return false; } }
export function marcarRecepcion(){ try { localStorage.setItem(PROBADA, "1"); } catch (e) {} }
