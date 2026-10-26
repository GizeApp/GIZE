// Supabase Edge Function «ia»: la IA de Anthropic en GIZE. La IA nunca publica ni anota nada sola:
// devuelve valores para que una persona los revise.
//
// Recibe, con el token del usuario logueado (supabase.functions.invoke):
//   { modo: "etiqueta", pedido: <id de product_requests> }  (también acepta modo "tabla")
//     Panel (gize.ar/admin → Productos → Pedidos → «Leer con IA»), solo administradores: lee la
//     foto de la tabla nutricional del pedido y devuelve los valores cada 100 g o ml
//     → { ok: true, encontrada, unidad, columna, porcion, por_porcion, kcal, p, c, f, revisar,
//         dudosos, modelo, modelo_nombre } y guarda lo leído en product_requests.ai_*.
//   { modo: "plato", imagen: <JPEG en base64, 1024 px>, texto?: <aclaración, hasta 200> }
//     App (Comida → «Foto del plato»), cualquier persona con sesión que aceptó el aviso
//     (supabase/ia.sql → ia_permiso):
//     → { ok: true, hay_comida, nota, items: [{ nombre, gramos, kcal, p, c, f, cantidad, unidad,
//         dudoso, base: { id, nombre, cocido, kcal, p, c, f, unit } | null }], modelo_nombre }.
//         Con «base», los valores cada 100 g salen de la base de GIZE; sin ella, son la
//         estimación de la IA. La app los muestra para revisar y no anota nada sin «Agregar».
//   { modo: "texto" } («Contame qué comiste»): se sacó de GIZE (solo fotos). Contesta 400
//     { ok: false, codigo: "no_disponible" } sin mirar nada más ni llamar a la API.
//   { modo: "estado" } → { ok: true, clave, modelos }: si está cargada la clave y qué modelos se
//     pueden elegir, con lo que cuesta una tabla con cada uno (para el panel). No llama a la API.
// Si algo no deja: { ok: false, codigo, mensaje, motivo?, vuelve?, tope? } (los códigos, en
// supabase/ia.sql; la app traduce por código).
//
// La guardia de gasto está en la base (supabase/ia.sql): antes de llamar, ia_reservar controla el
// interruptor, el ciclo de los créditos, el ritmo del día y los topes, y aparta lo máximo que
// podría costar; después, ia_cerrar anota lo que costó de verdad («usage» de la respuesta). Si la
// API no contesta, se cobra la reserva entera. Sin la clave o con el interruptor apagado no se
// llama nunca. Nunca se manda nada de la persona: solo la foto (de la tabla o del plato) y, en el
// plato, la aclaración que escribió si la puso; nunca su nombre, su mail ni su id.
// En los registros (console.error) van solo códigos: nunca la clave, ni datos de la persona, ni
// la foto, ni lo que contestó la IA.
//
// Secret: ANTHROPIC_API_KEY (Console de Anthropic → workspace «gize-produccion» → API Keys). Va en
// GitHub (Environment «production») y llega a Supabase con el workflow «Supabase» → tarea
// «secrets». SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya vienen puestas.
// Va sin «Verify JWT» (como las demás) y valida la sesión con auth.getUser().

import { createClient } from "npm:@supabase/supabase-js@2";
import { costo, ENTRADA_TOPE, MODELOS, modeloDe, reserva, type Modelo, type Uso } from "./precios.ts";
import { costoTablaTipica, ENTRADA_MAX_ETIQUETA, entradaEtiqueta, etiquetaPost, FOTO_MAX, LADO_MAX, MAX_TOKENS_ETIQUETA, pedidoEtiqueta, TIEMPO_ETIQUETA } from "./modos.ts";
import { jpegTamano } from "./jpeg.ts";
import { clasificarError, llamar } from "./api.ts";
import { B64_MAX_PLATO, baseTexto, comidaPost, ENTRADA_MAX_PLATO, entradaComida, LADO_MAX_PLATO, MAX_TOKENS_PLATO, pedidoComida, TEXTO_MAX_PLATO, TIEMPO_COMIDA, type Base } from "./comida.ts";
// La base de alimentos de la app (app/core/foods*.js): el workflow «Supabase» la copia acá antes de
// publicar (no se sube al repo: supabase/functions/ia/.gitignore). Es la misma lista que ve la persona.
import { cookVariant, FOODS } from "./foods.js";

type SupabaseClient = ReturnType<typeof createClient>;
const BASE: Base = { foods: FOODS, cocido: cookVariant };
let baseTxt = "";
const laBase = () => baseTxt || (baseTxt = baseTexto(BASE));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// HTTP y texto de cada código (los textos del panel; la app traduce por código).
const HTTP: Record<string, number> = {
  sin_sesion: 401, sin_permiso: 403, persona_sin_ia: 403, no_habilitado: 403, pausada: 503, ahorro: 503, ritmo: 503,
  tope_semana: 429, tope_dia: 429, tope_persona: 429, tope_mes: 503, ocupada: 503, foto_invalida: 400, no_se_pudo: 422, no_disponible: 400, error: 502,
};
const MENSAJE: Record<string, string> = {
  sin_sesion: "Iniciá sesión para usar la IA.",
  sin_permiso: "Falta el permiso para usar la IA.",
  persona_sin_ia: "Esta persona desactivó la IA: cargalo a mano.",
  no_habilitado: "Este pedido llegó antes del cambio de la política: cargalo a mano.",
  pausada: "La IA está pausada por ahora. Cargalo a mano.",
  ahorro: "Por este mes, la IA queda para alumnos con coach.",
  ritmo: "Por hoy la IA llegó a su límite. Mañana vuelve. Mientras, cargalo a mano.",
  tope_semana: "Usaste tus fotos gratis con IA de esta semana. Se renuevan el lunes.",
  tope_dia: "Llegaste al límite de hoy con IA. Mañana se renueva.",
  tope_persona: "Llegaste a tu límite personal de este mes con IA.",
  tope_mes: "La IA de GIZE llegó a su límite de este mes: cargalo a mano.",
  ocupada: "La IA está con mucha demanda. Probá en un minuto.",
  foto_invalida: "La foto no es válida o es muy grande. Cargalo a mano.",
  no_se_pudo: "No se pudo analizar esta foto.",
  no_disponible: "«Contame qué comiste» ya no está en GIZE: usá la foto del plato o cargalo a mano.",
  error: "La IA está tardando más de lo normal o falló. Probá de nuevo en un rato.",
};
const no = (codigo: string, extra: { mensaje?: string; motivo?: string; vuelve?: string | null; tope?: number } = {}, status?: number) =>
  json({ ok: false, codigo, mensaje: extra.mensaje || MENSAJE[codigo] || MENSAJE.error, ...(extra.motivo ? { motivo: extra.motivo } : {}), ...(extra.vuelve ? { vuelve: extra.vuelve } : {}),
    ...(typeof extra.tope === "number" ? { tope: extra.tope } : {}) },
    status || HTTP[codigo] || 502);
const log = (...a: unknown[]) => console.error("ia", ...a);

function base64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

// Llama a la API con una reserva ya hecha y la cierra con lo que costó. Devuelve la respuesta del
// modelo (el JSON con el esquema) y cerrar(estado) para anotar si sirvió; o, si algo falló, la
// respuesta para la app o el panel, con la llamada ya cerrada.
type Cerrar = (estado: "ok" | "vacia") => Promise<void>;
async function usarIA(db: SupabaseClient, o: { llamada: number; ciclo: number; modelo: Modelo; body: unknown; tope: number; clave: string }):
  Promise<Response | { out: Record<string, unknown>; cerrar: Cerrar }> {
  const cerrar = async (estado: "ok" | "vacia" | "error", codigo: string | null, usd: number | null, uso: Uso | null, ms: number) => {
    const x = await db.rpc("ia_cerrar", {
      p_id: o.llamada, p_estado: estado, p_codigo: codigo, p_usd: usd,
      p_in: uso ? uso.input_tokens ?? null : null, p_out: uso ? uso.output_tokens ?? null : null,
      p_cw: uso ? uso.cache_creation_input_tokens ?? null : null, p_cr: uso ? uso.cache_read_input_tokens ?? null : null, p_ms: ms,
    });
    // Si no se pudo cerrar, la base la cierra sola a los 10 minutos cobrando la reserva entera.
    if (x.error) log("cerrar", x.error.code || "");
  };

  const res = await llamar(o.body, o.clave, o.tope);
  // Sin respuesta (tiempo o red): no se sabe cuánto costó, se cobra la reserva (usd = null).
  if (res.tipo === "tiempo" || res.tipo === "red") {
    log("sin respuesta", res.tipo);
    await cerrar("error", res.tipo, null, null, res.ms);
    return no("error");
  }
  if (res.tipo === "http") {
    const e = clasificarError(res.status, res.error);
    log("api", res.status, (res.error && res.error.type) || "", e.registro);
    if (e.cortar) {
      const x = await db.rpc("ia_cortar", { p_ciclo: o.ciclo, p_motivo: e.cortar.motivo, p_vuelve: e.cortar.vuelve.toISOString() });
      if (x.error) log("cortar", x.error.code || "");
    }
    await cerrar("error", e.registro, 0, null, res.ms);
    return no(e.codigo, { motivo: e.motivo, vuelve: e.codigo === "tope_mes" && e.cortar ? e.cortar.vuelve.toISOString() : null });
  }

  const m = res.json as { stop_reason?: string; usage?: Uso; content?: unknown };
  // Sin «usage» no se sabe cuánto costó: se cobra la reserva.
  const usd = m.usage && typeof m.usage === "object" ? costo(m.usage, o.modelo) : null;
  const uso = m.usage && typeof m.usage === "object" ? m.usage : null;
  if (m.stop_reason === "refusal") { log("rechazo"); await cerrar("error", "refusal", usd, uso, res.ms); return no("no_se_pudo"); }
  if (m.stop_reason === "max_tokens") { log("cortada"); await cerrar("error", "max_tokens", usd, uso, res.ms); return no("error"); }
  // La respuesta puede empezar con bloques de razonamiento: se toman solo los de texto.
  const txt = (Array.isArray(m.content) ? m.content : [])
    .filter((b): b is { type: string; text: string } => !!b && (b as { type?: string }).type === "text" && typeof (b as { text?: unknown }).text === "string")
    .map((b) => b.text).join("");
  let out: Record<string, unknown> | null = null;
  try { out = JSON.parse(txt); } catch { out = null; }
  if (!out || typeof out !== "object" || Array.isArray(out)) { log("json inválido"); await cerrar("error", "json", usd, uso, res.ms); return no("error"); }
  return { out, cerrar: (estado) => cerrar(estado, null, usd, uso, res.ms) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return no("error", { mensaje: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return no("sin_sesion");
  const me = u.user.id;

  let input: { modo?: unknown; pedido?: unknown; imagen?: unknown; texto?: unknown } | null = null;
  try { input = await req.json(); } catch { return no("error", { mensaje: "Pedido inválido." }, 400); }
  if (!input || typeof input !== "object") return no("error", { mensaje: "Pedido inválido." }, 400);
  const modo = input.modo === "tabla" ? "etiqueta" : String(input.modo || "");
  // «Contame qué comiste» se sacó (solo fotos): no se mira la base ni se llama a la API.
  if (modo === "texto") return no("no_disponible");
  if (modo === "plato") return comida(input, me, url);
  if (modo !== "etiqueta" && modo !== "estado") return no("error", { mensaje: "Modo desconocido." }, 400);

  // Por ahora, solo administradores (las etapas que siguen suman a quien mandó el pedido).
  const { data: esAdmin, error: eAdmin } = await asUser.rpc("is_app_admin");
  if (eAdmin || esAdmin !== true) return no("no_habilitado", { motivo: "solo_admin", mensaje: "Por ahora la lectura con IA es solo para el equipo de GIZE." });

  const clave = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (modo === "estado") {
    // Para cada modelo: si sirve para las tablas y cuánto sale una tabla típica (el panel lo muestra).
    return json({ ok: true, clave: !!clave, modelos: (Object.keys(MODELOS) as Modelo[]).map((id) => ({ id, nombre: MODELOS[id].nombre, defecto: MODELOS[id].defecto,
      tabla: MODELOS[id].tabla, usd_tabla: costoTablaTipica(id) })) });
  }
  const pedido = Number(input && input.pedido);
  if (!Number.isSafeInteger(pedido) || pedido <= 0) return no("error", { mensaje: "Falta el pedido." }, 400);
  // Sin la clave no se toca nada: ni la base, ni la foto, ni la API.
  if (!clave) return no("pausada", { motivo: "sin_clave", mensaje: "Falta la clave de la IA (ANTHROPIC_API_KEY): cargala en GitHub y corré la tarea «secrets» del workflow «Supabase»." });

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // El interruptor (también lo mira ia_reservar; acá se mira antes de bajar la foto).
  const cfg = await db.from("ia_config").select("activa,funciones,modelos,pedidos_desde").eq("id", 1).maybeSingle();
  if (cfg.error || !cfg.data) {
    log("config", (cfg.error && cfg.error.code) || "sin fila");
    return no("pausada", { motivo: "sin_base", mensaje: "Falta preparar la base: correr supabase/ia.sql con el workflow «Supabase»." });
  }
  const c = cfg.data as { activa: boolean; funciones: Record<string, unknown> | null; modelos: Record<string, unknown> | null; pedidos_desde: string | null };
  if (c.activa !== true || !c.funciones || c.funciones.etiqueta_admin !== true) {
    return no("pausada", { motivo: "apagada", mensaje: "La IA está apagada. Se prende en el panel, en IA." });
  }
  const modelo = modeloDe(c.modelos && c.modelos.etiqueta);

  // El pedido: pendiente y posterior al cambio de la política de privacidad (pedidos_desde).
  const pq = await db.from("product_requests").select("id,user_id,label_path,status,created_at").eq("id", pedido).maybeSingle();
  if (pq.error) { log("pedido", pq.error.code || ""); return no("error", { mensaje: "No se pudo leer el pedido. Probá de nuevo." }, 500); }
  const r = pq.data as { id: number; user_id: string | null; label_path: string; status: string; created_at: string } | null;
  if (!r) return no("error", { mensaje: "Ese pedido ya no existe." }, 404);
  if (r.status !== "pendiente") return no("error", { mensaje: "Ese pedido ya se resolvió." }, 409);
  if (!c.pedidos_desde || !(Date.parse(r.created_at) >= Date.parse(c.pedidos_desde))) return no("no_habilitado");
  // Si quien lo mandó apagó la IA en Ajustes, su foto no se manda.
  if (r.user_id) {
    const pm = await db.from("ia_permisos").select("comida_ok_at,comida_no_at").eq("user_id", r.user_id).maybeSingle();
    if (pm.error) { log("permisos", pm.error.code || ""); return no("error", { mensaje: "No se pudo comprobar el permiso. Probá de nuevo." }, 500); }
    const p = pm.data as { comida_ok_at: string | null; comida_no_at: string | null } | null;
    if (p && p.comida_no_at && (!p.comida_ok_at || Date.parse(p.comida_no_at) > Date.parse(p.comida_ok_at))) return no("persona_sin_ia");
  }

  // La foto de la tabla, la misma que subió «Pedir un producto» (bucket privado «productos»).
  const dl = await db.storage.from("productos").download(r.label_path);
  if (dl.error || !dl.data) { log("foto", "no se pudo bajar"); return no("error", { mensaje: "No se pudo bajar la foto del pedido. Probá de nuevo." }, 502); }
  if (dl.data.size > FOTO_MAX) return no("foto_invalida");
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const tam = jpegTamano(bytes);
  if (!tam || Math.max(tam.ancho, tam.alto) > LADO_MAX) return no("foto_invalida");
  const entrada = entradaEtiqueta(tam.ancho, tam.alto, modelo);
  if (entrada > ENTRADA_MAX_ETIQUETA) return no("foto_invalida");

  // La reserva: si la guardia no deja, no se llama.
  const rs = await db.rpc("ia_reservar", { p_uid: me, p_rol: "admin", p_funcion: "etiqueta", p_modelo: modelo, p_max_usd: reserva(modelo, entrada, MAX_TOKENS_ETIQUETA), p_pedido: pedido });
  if (rs.error || !rs.data) { log("reservar", (rs.error && rs.error.code) || "sin respuesta"); return no("error", { mensaje: "No se pudo reservar el uso de la IA. Probá de nuevo." }, 500); }
  const res0 = rs.data as { ok: boolean; codigo?: string; motivo?: string; vuelve?: string; llamada_id?: number; ciclo_id?: number };
  if (!res0.ok) return no(res0.codigo || "error", { motivo: res0.motivo, vuelve: res0.vuelve || null });

  const r1 = await usarIA(db, { llamada: res0.llamada_id!, ciclo: res0.ciclo_id!, modelo, body: pedidoEtiqueta(modelo, base64(bytes)), tope: TIEMPO_ETIQUETA, clave });
  if (r1 instanceof Response) return r1;
  const { out, cerrar } = r1;
  const et = etiquetaPost(out);
  await cerrar(et.encontrada ? "ok" : "vacia");
  // Lo leído queda en el pedido: el panel lo muestra si se vuelve a abrir y, al publicar, se
  // anota si el administrador lo corrigió (admin_request_publish).
  const ai = et.encontrada
    ? { ai_encontrada: true, ai_kcal: et.kcal, ai_protein: et.p, ai_carbs: et.c, ai_fat: et.f, ai_unit: et.unidad, ai_portion: et.porcion,
        ai_por_porcion: et.por_porcion, ai_revisar: et.revisar, ai_dudosos: et.dudosos, ai_columna: et.columna }
    : { ai_encontrada: false, ai_kcal: null, ai_protein: null, ai_carbs: null, ai_fat: null, ai_unit: null, ai_portion: null,
        ai_por_porcion: null, ai_revisar: null, ai_dudosos: null, ai_columna: null };
  const up = await db.from("product_requests").update({ ...ai, ai_modelo: modelo, ai_at: new Date().toISOString(), ai_corregido: null, ai_corregidos: null }).eq("id", pedido);
  if (up.error) log("guardar", up.error.code || "");
  return json({ ok: true, ...et, modelo, modelo_nombre: MODELOS[modelo].nombre });
});

// ---------- foto del plato (la app) ----------
// Para cualquier persona con sesión que haya aceptado el aviso (ia_permiso_estado = 'ok'), con la
// función prendida en el panel. Topes de la persona: los de su rol (ia_rol: «coach» con plan o
// profe de un gimnasio con el plan al día, «coach por gimnasio»; si no «alumno»). No se guarda la foto ni la aclaración: van a la API y se olvidan.
async function comida(input: { imagen?: unknown; texto?: unknown }, me: string, url: string): Promise<Response> {
  const modo = "plato";
  const texto = typeof input.texto === "string" ? input.texto.replace(/\s+/g, " ").trim().slice(0, TEXTO_MAX_PLATO) : "";
  const imagen = typeof input.imagen === "string" ? input.imagen : "";
  // Solo un JPEG en base64 (empieza con /9j/), de hasta ~1 MB y 1024 px: lo que manda la app.
  if (!imagen || imagen.length > B64_MAX_PLATO || !imagen.startsWith("/9j/") || !/^[A-Za-z0-9+/]+={0,2}$/.test(imagen)) return no("foto_invalida");
  let cab: Uint8Array;
  try { const b = atob(imagen.slice(0, 65536 - (Math.min(imagen.length, 65536) % 4))); cab = Uint8Array.from(b, (ch) => ch.charCodeAt(0)); } catch { return no("foto_invalida"); }
  const tam = jpegTamano(cab);
  if (!tam || Math.max(tam.ancho, tam.alto) > LADO_MAX_PLATO) return no("foto_invalida");

  const clave = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!clave) return no("pausada", { motivo: "sin_clave" });
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // El interruptor (también lo mira ia_reservar; acá se mira antes de todo lo demás).
  const cfg = await db.from("ia_config").select("activa,funciones,modelos").eq("id", 1).maybeSingle();
  if (cfg.error || !cfg.data) { log("config", (cfg.error && cfg.error.code) || "sin fila"); return no("pausada", { motivo: "sin_base" }); }
  const c = cfg.data as { activa: boolean; funciones: Record<string, unknown> | null; modelos: Record<string, unknown> | null };
  if (c.activa !== true || !c.funciones || c.funciones[modo] !== true) return no("pausada", { motivo: "apagada" });

  // El permiso de la persona (el aviso vigente, aceptado y no apagado en Ajustes).
  const pm = await db.rpc("ia_permiso_estado", { p_uid: me });
  if (pm.error) { log("permiso", pm.error.code || ""); return no("error", { mensaje: "No se pudo comprobar el permiso. Probá de nuevo." }, 500); }
  if (pm.data !== "ok") return no("sin_permiso", { motivo: pm.data === "no" ? "apagada" : pm.data === "viejo" ? "aviso_nuevo" : "sin_preguntar" });
  const rl = await db.rpc("ia_rol", { p_uid: me });
  if (rl.error) { log("rol", rl.error.code || ""); return no("error", { mensaje: "No se pudo comprobar tu cuenta. Probá de nuevo." }, 500); }
  const rol = rl.data === "coach" ? "coach" : "alumno";

  const modelo = modeloDe(c.modelos && c.modelos[modo]);
  const base = laBase();
  const entrada = entradaComida(base, texto, tam, modelo);
  if (entrada > ENTRADA_MAX_PLATO || entrada > ENTRADA_TOPE) { log("entrada", modo, entrada); return no("foto_invalida"); }

  const rs = await db.rpc("ia_reservar", { p_uid: me, p_rol: rol, p_funcion: modo, p_modelo: modelo, p_max_usd: reserva(modelo, entrada, MAX_TOKENS_PLATO), p_pedido: null });
  if (rs.error || !rs.data) { log("reservar", (rs.error && rs.error.code) || "sin respuesta"); return no("error", { mensaje: "No se pudo reservar el uso de la IA. Probá de nuevo." }, 500); }
  const r0 = rs.data as { ok: boolean; codigo?: string; motivo?: string; vuelve?: string; tope?: number; llamada_id?: number; ciclo_id?: number };
  if (!r0.ok) return no(r0.codigo || "error", { motivo: r0.motivo, vuelve: r0.vuelve || null, tope: r0.tope });

  const r = await usarIA(db, { llamada: r0.llamada_id!, ciclo: r0.ciclo_id!, modelo, body: pedidoComida(modelo, base, texto, imagen), tope: TIEMPO_COMIDA, clave });
  if (r instanceof Response) return r;
  const res = comidaPost(r.out, BASE);
  await r.cerrar(res.hay_comida ? "ok" : "vacia");
  return json({ ok: true, ...res, modelo_nombre: MODELOS[modelo].nombre });
}
