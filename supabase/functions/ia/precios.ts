// Modelos que puede usar la función «ia», cuánto cuesta cada uno y las cuentas de la guardia de
// gasto (supabase/ia.sql). Es la única lista de modelos: el panel la pide a la función (modo
// «estado») y la base guarda solo lo que se elige ahí; uno que no esté acá no se usa nunca.
//
// Precios en US$ por millón de tokens, para pedidos de hasta 100.000 tokens (página de precios de
// Anthropic, revisada el 19/10/2026): entrada (in), escritura de caché de 5 minutos (w5) y de 1
// hora (w1h), lectura de caché (rd) y salida (out). «largo»: cuánto se multiplica todo pasando los
// 100.000 tokens (igual la función rechaza antes cualquier pedido de más de 90.000). «imgMax»: lo
// máximo que puede costar una imagen en tokens (una más grande se achica antes de leerla).
// «sinPensar»: el valor de «thinking» que apaga el razonamiento en ese modelo (uno no acepta
// «disabled» y su mínimo es «between_tools», con el esfuerzo de fábrica). «esfuerzo»: si acepta
// output_config.effort (el plato y el texto van con esfuerzo bajo; el que no lo acepta, sin él).
// «defecto»: el que se usa si el panel no eligió otro. «tabla»: si se ofrece en el panel para leer
// tablas (el más barato y el más capaz; el otro es el plan B del plato y el texto). «planilla»: lo
// mismo para pasar las planillas de los coaches (el de siempre y el más capaz, por si lee mal).
// «rutina»: lo mismo para «Armar con IA» (el de siempre y el más capaz, por si arma mejores
// borradores); uno sin la marca no se usa para las rutinas aunque esté elegido en el panel.
export const MODELOS = {
  "claude-haiku-5-5": { nombre: "Haiku 5.5", defecto: true, tabla: true, planilla: true, rutina: true, in: 0.10, w5: 0.125, w1h: 0.20, rd: 0.01, out: 0.50, largo: 5, imgMax: 4784, sinPensar: "disabled", esfuerzo: true },
  "claude-sonnet-5-5": { nombre: "Sonnet 5.5", defecto: false, tabla: true, planilla: true, rutina: true, in: 2.00, w5: 2.50, w1h: 4.00, rd: 0.10, out: 10.0, largo: 1, imgMax: 4784, sinPensar: "between_tools", esfuerzo: true },
  "claude-haiku-4-5": { nombre: "Haiku 4.5", defecto: false, tabla: false, planilla: false, rutina: false, in: 1.00, w5: 1.25, w1h: 2.00, rd: 0.10, out: 5.00, largo: 1, imgMax: 1568, sinPensar: "disabled", esfuerzo: false },
} as const;

export type Modelo = keyof typeof MODELOS;
export type Uso = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
};

// 10 % de margen sobre la cuenta: si el precio o los tokens se corren un poco, la cuenta propia
// queda por encima de lo que cobra Anthropic y no por debajo.
export const MARGEN = 1.10;
// Pasando los 100.000 tokens un modelo cobra todo más caro: no se llega nunca.
export const ENTRADA_TOPE = 90_000;

export const esModelo = (m: unknown): m is Modelo => typeof m === "string" && Object.prototype.hasOwnProperty.call(MODELOS, m);
export const modeloDefecto = (): Modelo => (Object.keys(MODELOS) as Modelo[]).find((k) => MODELOS[k].defecto) as Modelo;
// El modelo elegido en el panel, si es uno de la lista; si no, el de siempre.
export const modeloDe = (m: unknown): Modelo => esModelo(m) ? m : modeloDefecto();

// Redondeo para arriba a millonésimas de dólar (la base guarda numeric(10,6)).
const arriba = (usd: number) => Math.ceil(usd * 1e6 - 1e-9) / 1e6;

// Lo que costó una llamada, con lo que devuelve la API en «usage». output_tokens ya incluye el
// razonamiento. Si no viene el desglose de la escritura en caché, se cobra todo como la de 1 hora
// (la más cara).
export function costo(u: Uso, modelo: Modelo, batch = false): number {
  const p = MODELOS[modelo];
  const ent = u.input_tokens || 0, sal = u.output_tokens || 0, lee = u.cache_read_input_tokens || 0;
  const escribe = u.cache_creation_input_tokens || 0;
  const cc = u.cache_creation || null;
  let w5 = 0, w1h = escribe;
  if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
    w5 = cc.ephemeral_5m_input_tokens || 0;
    w1h = Math.max(cc.ephemeral_1h_input_tokens || 0, escribe - w5);
  }
  const k = ent + escribe + lee > 100_000 ? p.largo : 1;
  let usd = k * (ent * p.in + w5 * p.w5 + w1h * p.w1h + lee * p.rd + sal * p.out) / 1e6;
  if (batch) usd *= 0.5;
  return arriba(usd * MARGEN);
}

// Lo máximo que puede costar una llamada (la reserva): toda la entrada al precio de entrada más
// alto del modelo (la escritura de caché de 1 hora) y todos los max_tokens de salida, más el margen.
export function reserva(modelo: Modelo, entrada: number, maxTokens: number): number {
  const p = MODELOS[modelo];
  const k = entrada > 100_000 ? p.largo : 1;
  return arriba(k * (entrada * p.w1h + maxTokens * p.out) / 1e6 * MARGEN);
}

// Tokens de una imagen: ⌈ancho/28⌉ × ⌈alto/28⌉, con el tope del modelo.
export function imagenTokens(ancho: number, alto: number, modelo: Modelo): number {
  return Math.min(Math.ceil(ancho / 28) * Math.ceil(alto / 28), MODELOS[modelo].imgMax);
}
