// Mi configuración de cada ejercicio (supabase/ejercicios-coach.sql): el coach guarda para un
// ejercicio las series con su rango de reps, si se mide por tiempo, el descanso y el RIR. Al
// agregar ese ejercicio a una rutina (o cambiar uno por él) arranca con eso; después se cambia para
// cada cliente sin tocar lo guardado. No se guardan el peso propuesto, la nota, el video ni el audio
// (son de cada cliente). Sin la tabla (falta correr el SQL) los botones no aparecen.
import { State } from '../../core/state.js';
import { mkSet } from '../../core/utils.js';
import { CoachState } from './state.js';

// Mismo ejercicio sin importar mayúsculas, tildes ni espacios de más.
export const presetClave = n => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);

// Lo que se guarda de un ejercicio.
export function cfgDeEj(ex){
  const c = { sets: (ex.sets || []).slice(0, 20).map(s => String(s.target || "").slice(0, 20)) };
  if (typeof ex.timed === "boolean") c.timed = ex.timed;
  if (ex.rest) c.rest = String(ex.rest).slice(0, 30);
  if (ex.rir) c.rir = String(ex.rir).slice(0, 20);
  return c;
}

// ¿El ejercicio ya está como lo guardado?
export function igualQue(ex, cfg){
  if (!cfg) return false;
  const a = cfgDeEj(ex);
  return JSON.stringify([a.sets, !!a.timed, a.rest || "", a.rir || ""]) === JSON.stringify([cfg.sets || [], !!cfg.timed, cfg.rest || "", cfg.rir || ""]);
}

// Carga lo guardado en el ejercicio: las series que ya tenía conservan su id (lo que el cliente
// cargó en ellas no se pierde) y su peso propuesto; las que sobran se sacan y las que faltan se suman.
export function aplicar(ex, cfg){
  if (!ex || !cfg || !Array.isArray(cfg.sets) || !cfg.sets.length) return false;
  const viejas = ex.sets || [];
  ex.sets = cfg.sets.map((t, j) => { const s = viejas[j] || mkSet(); if (t) s.target = t; else delete s.target; return s; });
  if (typeof cfg.timed === "boolean") ex.timed = cfg.timed; else delete ex.timed;
  if (cfg.rest) ex.rest = cfg.rest; else delete ex.rest;
  if (cfg.rir) ex.rir = cfg.rir; else delete ex.rir;
  return true;
}

// La guardada de un ejercicio (por su nombre), o null.
export const presetDe = name => (CoachState.exPresets && CoachState.exPresets.get(presetClave(name))) || null;
// Si la tabla está (se cargó bien al menos una vez).
export const hayPresets = () => !!CoachState.exPresets;

export async function cargarPresets(){
  if (!State.sb || !State.cloudUser) return;
  try{
    const r = await State.sb.from("coach_ex_presets").select("clave,nombre,cfg").eq("coach_id", State.cloudUser.id);
    if (r.error){ CoachState.exPresets = null; return; }
    CoachState.exPresets = new Map((r.data || []).map(x => [x.clave, Object.assign({ nombre: x.nombre }, x.cfg || {})]));
  }catch(e){ CoachState.exPresets = null; }
}

export async function guardarPreset(ex){
  const clave = presetClave(ex && ex.name);
  if (!clave || !State.sb || !State.cloudUser) throw new Error("Sin conexión a la cuenta.");
  const cfg = cfgDeEj(ex), nombre = String(ex.name).trim().slice(0, 120);
  const r = await State.sb.from("coach_ex_presets").upsert({ coach_id: State.cloudUser.id, clave, nombre, cfg, updated_at: new Date().toISOString() }, { onConflict: "coach_id,clave" });
  if (r.error) throw r.error;
  if (!CoachState.exPresets) CoachState.exPresets = new Map();
  CoachState.exPresets.set(clave, Object.assign({ nombre }, cfg));
}

export async function borrarPreset(name){
  const clave = presetClave(name);
  if (!clave || !State.sb || !State.cloudUser) throw new Error("Sin conexión a la cuenta.");
  const r = await State.sb.from("coach_ex_presets").delete().eq("coach_id", State.cloudUser.id).eq("clave", clave);
  if (r.error) throw r.error;
  if (CoachState.exPresets) CoachState.exPresets.delete(clave);
}
