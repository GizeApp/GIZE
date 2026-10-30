// Cobros del coach (supabase/cobros-coach.sql): lo que comparten el panel del coach
// (app/screens/coach/cobros.js) y Ajustes del alumno. GIZE no cobra ni mueve plata: el coach anota lo
// que ya le pagaron sus alumnos.
// El interruptor (app_config 'cobros', lo cambia el admin) dice en qué plataforma se ve: { web, android,
// ios }. Nace con la web prendida y las apps apagadas; apagado, en esa plataforma no se ve nada de
// Cobros. Así, si una tienda lo objeta, se apaga solo ahí, al instante y sin sacar otra versión.
import { appIOS, appNativa } from './tienda.js';

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
