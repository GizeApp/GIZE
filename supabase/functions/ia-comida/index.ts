// Supabase Edge Function "ia-comida": analiza una foto con Claude (Anthropic).
//   modo "etiqueta": la tabla nutricional de un paquete → valores cada 100 g o ml.
//   modo "plato":    una foto de la comida → qué hay en el plato, gramos y macros estimados.
// Recibe { modo, imagen (JPEG en base64, ya achicada por la app), texto? } con el token del
// usuario logueado (supabase.functions.invoke). Cada usuario tiene un tope de fotos por día
// (supabase/ia-comida.sql), así el gasto no se dispara.
//
// Secret: ANTHROPIC_API_KEY (console.anthropic.com → API Keys). Se carga desde GitHub con el
// workflow "Supabase" → tarea "secrets". SUPABASE_URL, SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY ya vienen puestas.

import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const TOPE_DIARIO = 40; // fotos por usuario por día (etiquetas + platos)
const MAX_B64 = 3_000_000; // ~2,2 MB de imagen: la app manda ~300 KB

const num = { anyOf: [{ type: "number" }, { type: "null" }] };
const ETIQUETA = {
  type: "object",
  additionalProperties: false,
  required: ["encontrada", "unidad", "columna", "porcion", "kcal", "proteinas", "carbohidratos", "grasas"],
  properties: {
    encontrada: { type: "boolean", description: "Si en la foto se ve una tabla de información nutricional legible" },
    unidad: { type: "string", enum: ["g", "ml"], description: "ml si el producto es líquido y la tabla habla de ml" },
    columna: { type: "string", enum: ["100", "porcion"], description: "De qué columna salen los valores: cada 100 g/ml si la tabla la trae; si no, la de la porción" },
    porcion: { ...num, description: "Tamaño de la porción en g o ml, tal como figura (ej: 13 para 'Porción 13 ml'). null si no figura" },
    kcal: { ...num, description: "Valor energético en kcal de esa columna (no kJ)" },
    proteinas: { ...num, description: "Proteínas en g de esa columna" },
    carbohidratos: { ...num, description: "Carbohidratos en g de esa columna" },
    grasas: { ...num, description: "Grasas totales en g de esa columna" },
  },
};
const PLATO = {
  type: "object",
  additionalProperties: false,
  required: ["hay_comida", "items", "nota"],
  properties: {
    hay_comida: { type: "boolean", description: "Si en la foto se ve comida" },
    items: {
      type: "array",
      description: "Cada alimento que se ve en el plato, por separado (ej: milanesa, puré, ensalada)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nombre", "gramos", "kcal", "proteinas", "carbohidratos", "grasas"],
        properties: {
          nombre: { type: "string", description: "Nombre corto en español de Argentina, con la cocción si importa (ej: 'Milanesa de carne frita')" },
          gramos: { type: "number", description: "Gramos estimados de lo que se ve en la foto (cocido, como está servido)" },
          kcal: { type: "number", description: "kcal de esos gramos" },
          proteinas: { type: "number", description: "g de proteína de esos gramos" },
          carbohidratos: { type: "number", description: "g de carbohidratos de esos gramos" },
          grasas: { type: "number", description: "g de grasa de esos gramos" },
        },
      },
    },
    nota: { type: "string", description: "Una frase corta si algo no se ve bien o se supuso (ej: 'Supuse aceite en la ensalada'). Vacío si no hace falta" },
  },
};

const PROMPT_ETIQUETA =
  "Leé la tabla de información nutricional de la foto (envases de Argentina: 'Información nutricional', 'Cantidad por porción', 'Valor energético', " +
  "'Carbohidratos', 'Proteínas', 'Grasas totales'). Si la tabla trae una columna cada 100 g o 100 ml, usá esa. Si solo trae la porción, usá la " +
  "porción y anotá su tamaño. El valor energético va en kcal, no en kJ. Copiá los números como figuran, sin calcular nada. Si no se ve una tabla " +
  "legible, encontrada = false.";
const PROMPT_PLATO =
  "Sos nutricionista en Argentina. Mirá la foto de la comida y estimá qué hay en el plato: cada alimento por separado, los gramos que se ven " +
  "(cocidos, como están servidos) y sus calorías y macros para esos gramos. Usá tamaños de porción realistas (el plato, los cubiertos y el vaso " +
  "sirven de referencia) y contá el aceite, la manteca o las salsas que se vean. Si no hay comida en la foto, hay_comida = false e items vacío.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);

  let input: { modo?: string; imagen?: string; texto?: string };
  try { input = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const modo = input.modo === "plato" ? "plato" : input.modo === "etiqueta" ? "etiqueta" : "";
  const img = String(input.imagen || "");
  if (!modo || !img) return json({ error: "Falta la foto." }, 400);
  if (img.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(img)) return json({ error: "La foto no es válida o es muy grande." }, 400);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "La lectura con IA todavía no está configurada." }, 503);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: puede, error: topeErr } = await db.rpc("ia_contar", { uid: u.user.id, tope: TOPE_DIARIO });
  if (topeErr) return json({ error: "La lectura con IA todavía no está configurada." }, 503);
  if (!puede) return json({ error: "Llegaste al máximo de fotos con IA por hoy. Mañana podés seguir." }, 429);

  const texto = String(input.texto || "").trim().slice(0, 200);
  const client = new Anthropic();
  let r;
  try {
    r = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Tarea acotada: esfuerzo bajo alcanza y baja el costo de cada foto.
      output_config: { effort: "low", format: { type: "json_schema", schema: modo === "plato" ? PLATO : ETIQUETA } },
      system: modo === "plato" ? PROMPT_PLATO : PROMPT_ETIQUETA,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } },
          { type: "text", text: modo === "plato"
            ? (texto ? "El usuario aclara: " + texto : "Estimá lo que hay en este plato.")
            : "Leé la tabla nutricional de este envase." },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "La IA está con mucha demanda. Probá en un minuto." }, 503);
    if (e instanceof Anthropic.APIError) { console.error("anthropic", e.status); return json({ error: "No se pudo analizar la foto. Probá de nuevo." }, 502); }
    console.error("anthropic", e);
    return json({ error: "No se pudo analizar la foto. Probá de nuevo." }, 502);
  }
  if (r.stop_reason === "refusal") return json({ error: "No se pudo analizar esta foto." }, 422);
  if (r.stop_reason === "max_tokens") return json({ error: "No se pudo analizar la foto. Probá de nuevo." }, 502);
  // deno-lint-ignore no-explicit-any
  const txt = (r.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
  // deno-lint-ignore no-explicit-any
  let out: any;
  try { out = JSON.parse(txt); } catch { return json({ error: "No se pudo analizar la foto. Probá de nuevo." }, 502); }

  const n = (v: unknown, max: number) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.min(max, Math.round(x * 10) / 10) : null; };
  if (modo === "etiqueta") {
    if (!out.encontrada) return json({ ok: true, etiqueta: { encontrada: false } });
    const porcion = n(out.porcion, 2000);
    let v = { kcal: n(out.kcal, 5000), p: n(out.proteinas, 1000), c: n(out.carbohidratos, 1000), f: n(out.grasas, 1000) };
    const porPorcion = out.columna === "porcion";
    // Solo por porción: se pasa a cada 100 con el tamaño de la porción (la cuenta la hace el
    // código, no el modelo). Sin porción no se puede: se devuelve por porción para que la app la pida.
    if (porPorcion && porcion && porcion > 0) {
      const k = 100 / porcion;
      v = { kcal: v.kcal == null ? null : Math.round(v.kcal * k), p: v.p == null ? null : Math.round(v.p * k * 10) / 10,
        c: v.c == null ? null : Math.round(v.c * k * 10) / 10, f: v.f == null ? null : Math.round(v.f * k * 10) / 10 };
    }
    return json({ ok: true, etiqueta: { encontrada: true, unidad: out.unidad === "ml" ? "ml" : "g", porcion,
      cada100: !porPorcion || !!(porcion && porcion > 0), ...v } });
  }
  const items = (Array.isArray(out.items) ? out.items : []).slice(0, 12).map((it: Record<string, unknown>) => ({
    nombre: String(it.nombre || "Alimento").slice(0, 80), gramos: n(it.gramos, 3000) || 0,
    kcal: n(it.kcal, 5000) || 0, p: n(it.proteinas, 500) || 0, c: n(it.carbohidratos, 800) || 0, f: n(it.grasas, 500) || 0,
  })).filter((it: { gramos: number; kcal: number }) => it.gramos > 0 || it.kcal > 0);
  return json({ ok: true, plato: { items, nota: String(out.nota || "").slice(0, 200) } });
});
