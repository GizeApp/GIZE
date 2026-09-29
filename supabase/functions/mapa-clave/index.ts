// Supabase Edge Function "mapa-clave": le pasa a la app la clave de MapTiler para dibujar el
// mapa de Cardio (el recorrido de una salida). La clave no está en el repo: vive solo en el
// secret MAPTILER_KEY (tarea "secrets" del workflow "Supabase").
//
// Devuelve { key } o { key: null } si el secret no está cargado: en ese caso la app dibuja el
// recorrido sin el mapa de fondo. Solo para usuarios con sesión.
// La clave igual termina en el navegador (el mapa la manda en cada pedido a MapTiler): por eso
// se restringe en MapTiler a los dominios de GIZE (gize.ar y los de las apps).
// Va sin "Verify JWT" (como las demás) y valida la sesión con auth.getUser().

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);

  const key = (Deno.env.get("MAPTILER_KEY") || "").trim();
  return json({ key: key || null });
});
