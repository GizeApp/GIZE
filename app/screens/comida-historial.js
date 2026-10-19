// Días anteriores en Comida: se navega en la misma pantalla (deslizando o con las flechas,
// como en Fitia) y se ve ese día entero: calorías, macros y las 4 comidas. También se puede
// cargar, cambiar o borrar lo de ese día (se sube con cloudSaveFoods).
// Los días anteriores están en la nube (food_entries); en el celular solo queda el total de
// calorías de cada día (state.kcalLog). Lo que se trae queda en memoria mientras la app
// está abierta.
import { State, state } from '../core/state.js';
import { foodsLoaded, pendingFoods } from '../core/supabase.js';
import { fmtDate, today, ymd } from '../core/utils.js';

const cache = new Map(); // fecha → { status: "loading" | "done" | "error", items, msg }

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };

// "Hoy", "Ayer", "Anteayer" o "Mié 23 sep".
export function dayLabel(s) {
  const t = today();
  if (s === t) return "Hoy";
  if (s === addDays(t, -1)) return "Ayer";
  if (s === addDays(t, -2)) return "Anteayer";
  return dayShort(s);
}
export const dayShort = s => DIAS[new Date(s + "T12:00:00").getDay()] + " " + fmtDate(s);

export function pastDay(date) { return cache.get(date) || { status: "loading", items: [] }; }

export async function loadDay(date, rerender) {
  const c = cache.get(date);
  if (c && (c.status === "done" || c.status === "loading")) return;
  cache.set(date, { status: "loading", items: [] });
  if (!State.sb || !State.cloudUser) {
    cache.set(date, { status: "error", items: [], msg: "Iniciá sesión para ver los días anteriores." });
    rerender(); return;
  }
  try {
    // Con base (valores cada 100 g): al cambiar algo del día se vuelve a subir entero, y sin ella
    // quedaba en null en la nube y al editar los gramos se recalculaba de lo redondeado.
    const r = await State.sb.from("food_entries").select("id, name, grams, kcal, protein, carbs, fat, unit, meal, base")
      .eq("client_id", State.cloudUser.id).eq("log_date", date).order("pos");
    if (r.error) throw r.error;
    const items = (r.data || []).map(x => ({
      id: x.id, meal: x.meal || undefined, name: x.name, grams: Number(x.grams) || 0, unit: x.unit || "g",
      kcal: Math.round(Number(x.kcal) || 0), p: Number(x.protein) || 0, c: Number(x.carbs) || 0, f: Number(x.fat) || 0, base: x.base || undefined,
    }));
    // Lo cargado o borrado sin señal todavía no está en la nube: manda lo del celular.
    const pend = pendingFoods(date);
    cache.set(date, { status: "done", items: pend || items });
    foodsLoaded(date, (pend || items).map(x => x.id)); // lo que se borre de esta lista se borra en la nube
    // Si el total guardado en el celular no estaba (otro dispositivo), se completa.
    const tot = items.reduce((a, e) => a + e.kcal, 0);
    if (tot > 0 && !(state.kcalLog && state.kcalLog[date])) state.kcalLog = Object.assign({}, state.kcalLog || {}, { [date]: tot });
  } catch (e) {
    cache.set(date, { status: "error", items: [], msg: "No se pudo cargar ese día. Revisá tu conexión y volvé a intentar." });
  }
  rerender();
}

// Lista editable del día (Comida permite cargar y borrar en días anteriores).
export function dayItems(date) { const c = cache.get(date); return c && c.status === "done" ? c.items : null; }
export function setDayItems(date, items) { const c = cache.get(date); if (c) c.items = items; }

// Un día que dio error se vuelve a pedir la próxima vez que se lo mira.
export function retryDay(date) { const c = cache.get(date); if (c && c.status === "error") cache.delete(date); }
