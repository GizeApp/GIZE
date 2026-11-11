// Tienda de rutinas: lo que habla con la base (supabase/tienda-rutinas.sql). Todo gratis: no hay
// precios ni compras, así que vale igual en la web y en las apps de las tiendas.
// El interruptor (app_config 'tienda', lo cambia el admin) dice en qué plataforma se ve: { web, android,
// ios }. Nace con la web prendida y las apps apagadas.
import { State } from './state.js';
import { plataformaCobros } from './cobros.js';
import { migrateNames } from './storage.js';

const msg = e => String((e && e.message) || "No se pudo. Probá de nuevo.");
const sinFuncion = e => /^(PGRST202|42883)$/.test(String((e && e.code) || ""));

// ---- ¿Se ve la Tienda? ----
// Se pregunta una vez por sesión (y otra si cambia la cuenta). Hasta que contesta, o si la base todavía no
// la tiene, no se ve. Cuando llega la respuesta se llama a redibujar.
let _cfg = { uid: null, v: undefined, pidiendo: false };
export function tiendaActiva(redibujar){
  const u = State.cloudUser;
  if (!u || !State.sb) return false;
  if (_cfg.uid !== u.id) _cfg = { uid: u.id, v: undefined, pidiendo: false };
  const c = _cfg;
  if (c.v === undefined && !c.pidiendo) {
    c.pidiendo = true;
    Promise.resolve(State.sb.rpc("tienda_config")).then(r => {
      c.v = !r.error && r.data && typeof r.data === "object" ? r.data : null;
    }, () => { c.v = null; }).then(() => {
      c.pidiendo = false;
      if (_cfg === c && c.v && c.v[plataformaCobros()] === true && redibujar) redibujar();
    });
  }
  return !!(c.v && c.v[plataformaCobros()] === true);
}

// ---- Pedidos ----
async function rpc(nombre, args){
  if (!State.sb || !State.cloudUser) throw new Error("Entrá a tu cuenta para usar la Tienda.");
  let r;
  try { r = await State.sb.rpc(nombre, args); } catch (e) { throw new Error("No hay conexión. Probá de nuevo."); }
  if (r.error) throw new Error(sinFuncion(r.error) ? "La Tienda todavía no está lista." : msg(r.error));
  return r.data;
}

export async function listarRutinas(){
  const d = await rpc("tienda_listar");
  return Array.isArray(d) ? d : [];
}
export async function detalleRutina(id){
  const d = await rpc("tienda_detalle", { p_id: id });
  if (d && Array.isArray(d.days)) migrateNames(d.days);
  return d;
}
export async function publicarRutina(f, days){
  return rpc("tienda_publicar", { p_titulo: f.nombre.trim(), p_descripcion: f.desc.trim(), p_nivel: f.nivel, p_objetivo: f.obj, p_days: days });
}
export async function sacarRutina(id){ await rpc("tienda_despublicar", { p_id: id }); }
export async function agregarRutina(id){
  const d = await rpc("tienda_agregar", { p_id: id });
  if (Array.isArray(d)) migrateNames(d);
  return d;
}
export async function denunciarRutina(id, motivo){ await rpc("tienda_reportar", { p_id: id, p_motivo: motivo }); }
