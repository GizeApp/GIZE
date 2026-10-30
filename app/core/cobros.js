// Cobros del coach (supabase/cobros-coach.sql): lo que comparten el panel del coach
// (app/screens/coach/cobros.js) y Ajustes del alumno. GIZE no cobra ni mueve plata: el coach anota lo
// que ya le pagaron sus alumnos.
// El interruptor (app_config 'cobros', lo cambia el admin) dice en qué plataforma se ve: { web, android,
// ios }. Nace con la web prendida y las apps apagadas; apagado, en esa plataforma no se ve nada de
// Cobros. Así, si una tienda lo objeta, se apaga solo ahí, al instante y sin sacar otra versión.
import { appIOS, appNativa } from './tienda.js';
import { State } from './state.js';

// Dónde corre GIZE: la app de iPhone, la de Android (con Capacitor o solo con su puente:
// core/plataforma.js appAndroid) o la web (también la agregada a la pantalla de inicio).
export function plataformaCobros(){
  if (appIOS()) return "ios";
  return appNativa() ? "android" : "web";
}

// ¿Cobros se ve en esta plataforma? Solo con su interruptor en true: sin interruptor, o con otra cosa,
// no se ve.
export function cobrosVisibles(interruptor){
  return !!(interruptor && typeof interruptor === "object" && interruptor[plataformaCobros()] === true);
}

// ---- El alumno: su cuota con el coach (cobro_mi_cuota), para Ajustes → Tu coach ----
// Como la cuota del socio de un gimnasio (core/gimnasio.js cuotaSocio): se pide al dibujar, como mucho
// una vez por minuto, y cuando cambia lo que se ve se llama a redibujar. Devuelve lo que se ve en esta
// plataforma: undefined mientras no contestó; null sin coach, sin cuota, sin señal o con Cobros apagado
// acá. Si la base todavía no tiene Cobros (la función no existe), no se vuelve a preguntar por 10
// minutos. Solo se pide desde Ajustes: la cuota no aparece en otra pantalla ni bloquea nada.
const sinFuncion = e => /^(PGRST202|42883)$/.test(String((e && e.code) || ""));
const seVe = v => (v && typeof v === "object" && cobrosVisibles(v.interruptor) ? v : v === undefined ? undefined : null);
let _cuota = { k: null, v: undefined, t: 0, pidiendo: false, sinBase: 0 };
export function cuotaCoach(redibujar){
  const u = State.cloudUser, p = State.cloudProfile;
  if (!u || !State.sb || !p || p.role === "coach" || !p.coach_id) return null;
  // Si cambia la cuenta o el coach, se vuelve a preguntar.
  const k = u.id + "|" + p.coach_id;
  if (_cuota.k !== k) _cuota = { k, v: undefined, t: 0, pidiendo: false, sinBase: 0 };
  const c = _cuota, ahora = Date.now();
  if (!c.pidiendo && ahora - c.t > 60e3 && ahora - c.sinBase > 600e3){
    c.pidiendo = true;
    const antes = JSON.stringify(seVe(c.v) || null);
    Promise.resolve(State.sb.rpc("cobro_mi_cuota")).then(r => {
      if (!r.error) c.v = r.data && typeof r.data === "object" ? r.data : null;
      else { if (sinFuncion(r.error)) c.sinBase = Date.now(); if (c.v === undefined || sinFuncion(r.error)) c.v = null; }
    }, () => { if (c.v === undefined) c.v = null; }).then(() => {
      c.pidiendo = false; c.t = Date.now();
      if (_cuota === c && JSON.stringify(seVe(c.v) || null) !== antes && redibujar) redibujar();
    });
  }
  return seVe(c.v);
}
