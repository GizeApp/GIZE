// La invitación de un coach que llega por su link. La página pública del coach (gize.ar/c/<alias>,
// 404.html con pagina-coach/pagina.js) tiene «¿En la compu? Usá GIZE en la web», que abre la app con
// #coach=<alias>. Se lee acá, al cargar el módulo (antes de mirar la sesión), se guarda en el
// dispositivo (gize_coach_pend, como { a: alias, t: cuándo }, como gize_grupo_pend en core/grupos.js)
// y se saca de la dirección. Así sobrevive a crear la cuenta, a la vuelta de Google y al link del mail
// de confirmación si se abre en el mismo navegador. Vale 7 días.
//   · Sin sesión: la pantalla de ingreso abre en «Crear cuenta» y explica para qué hay que entrar
//     (ingresoCoach, en cloudBoot de core/supabase.js). Nunca muestra nada que venga en el link.
//   · Al entrar (afterLogin): antes de la bienvenida aparece la hoja «Entrená con …»
//     (app/ui/invitacion-coach.js, que se carga con import() solo si hay una invitación). Nunca se
//     vincula sin que la persona toque «Sumarme».
// Se borra al cerrar la hoja, al vencer y al cerrar sesión; si entra otra cuenta en el dispositivo,
// también, salvo la de un link recién abierto, que es de quien está entrando (accountKeys en
// core/supabase.js).
// No importa de core/supabase.js (que importa este), para no hacer ciclos.
import { State } from './state.js';

export const COACH_PEND = "gize_coach_pend";
const VALE_MS = 7 * 864e5;
// El mismo formato de link que acepta la base (supabase/pagina-coach.sql).
const aliasOk = a => /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(a) && !/[._-]{2}/.test(a);

export function guardarInvitacionCoach(alias){
  const a = String(alias || "").trim().toLowerCase();
  if (!aliasOk(a)) return false;
  try { localStorage.setItem(COACH_PEND, JSON.stringify({ a, t: Date.now() })); return true; } catch (e) { return false; }
}
export function olvidarInvitacionCoach(){ try { localStorage.removeItem(COACH_PEND); } catch (e) {} }
// La invitación guardada si sigue valiendo. Una vencida (o rota) se borra.
export function invitacionCoach(){
  try {
    const o = JSON.parse(localStorage.getItem(COACH_PEND) || "null");
    if (!o) return null;
    if (typeof o.a === "string" && aliasOk(o.a) && Date.now() - o.t < VALE_MS) return o;
  } catch (e) {}
  olvidarInvitacionCoach();
  return null;
}
export const hayInvitacionCoach = () => !!invitacionCoach();

// Sin sesión y con una invitación: la pantalla de ingreso explica para qué hay que entrar (cloudBoot).
export function ingresoCoach(){
  if (!hayInvitacionCoach()) return null;
  return { msg: "Te invitaron a entrenar en GIZE con tu coach. Creá tu cuenta o ingresá con la tuya para sumarte.", modo: "up", vals: {} };
}

// Abre la hoja «Entrená con …» (app/ui/invitacion-coach.js) y devuelve una promesa que se cumple
// cuando se cierra (nunca falla). Si ya está abierta, la misma promesa. Sin invitación, nada.
let abierta = null;
export function ofrecerCoach(){
  if (abierta) return abierta;
  const inv = invitacionCoach();
  if (!inv || !State.cloudUser) return Promise.resolve();
  abierta = import("../ui/invitacion-coach.js").then(m => m.abrirInvitacionCoach(inv.a))
    .catch(e => { console.warn("invitación del coach", e); })
    .finally(() => { abierta = null; });
  return abierta;
}

// ---- El link ----
function leerLink(){
  try {
    const m = /^#coach=([^&#]*)$/i.exec(location.hash || "");
    if (!m) return false;
    history.replaceState(history.state, "", location.pathname + location.search);
    let a = ""; try { a = decodeURIComponent(m[1]); } catch (e) {}
    return guardarInvitacionCoach(a);
  } catch (e) { return false; }
}
leerLink();
// Con la app ya abierta y la sesión iniciada, alguien abre el link en la misma pestaña: la hoja ahí mismo.
try {
  window.addEventListener("hashchange", () => { if (leerLink() && State.cloudUser && State.cloudProfile && !State.sessionLost) ofrecerCoach(); });
} catch (e) {}
