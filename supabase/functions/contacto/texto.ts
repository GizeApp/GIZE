// Texto de un mail que llega solo en HTML (función contacto). Está aparte de index.ts para
// poder probarlo sin Deno (tests/contacto-html.test.mjs).

const NAMED: Record<string, string> = {
  nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iquest: "¿", iexcl: "¡", ordm: "º", ordf: "ª", laquo: "«", raquo: "»", euro: "€", hellip: "…", mdash: "—", ndash: "–", deg: "°",
};

// Saca los comentarios y los bloques <style>, <script> y <head> en una sola pasada. Antes eran
// expresiones que, desde cada "<!--", buscaban el "-->" hasta el final: con muchos sin cerrar,
// cada uno recorría el resto del mail y un mail armado a propósito dejaba la función
// trabajando hasta que la cortaban. Acá cada parte se mira una vez: un cierre que no está se
// busca una sola vez.
function stripBlocks(html: string): string {
  const lo = html.replace(/[A-Z]+/g, (c) => c.toLowerCase()); // mismo largo: solo ASCII
  const open = /<!--|<(style|script|head)\b/g, noClose = new Set<string>();
  let out = "", at = 0, m: RegExpExecArray | null;
  while ((m = open.exec(lo))) {
    const close = m[1] ? "</" + m[1] + ">" : "-->";
    const end = noClose.has(close) ? -1 : lo.indexOf(close, m.index + m[0].length);
    if (end < 0) noClose.add(close);
    // Un <head> sin cerrar no esconde lo que sigue (el navegador lo muestra): queda solo la
    // etiqueta, que se saca después. Un comentario, <style> o <script> sin cerrar llega hasta
    // el final, como en el navegador.
    if (end < 0 && m[1] === "head") continue;
    out += html.slice(at, m.index);
    if (end < 0) return out;
    at = open.lastIndex = end + close.length;
  }
  return out + html.slice(at);
}

// El resto son patrones que no vuelven a recorrer lo ya mirado: el costo crece con el largo.
export function htmlToText(html: string): string {
  return stripBlocks(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^<>]*>/g, "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => {
      const c = n[0] === "x" || n[0] === "X" ? parseInt(n.slice(1), 16) : Number(n);
      return c > 0 && c <= 0x10ffff && (c < 0xd800 || c > 0xdfff) ? String.fromCodePoint(c) : "";
    })
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n] ?? m)
    .replace(/&amp;/g, "&");
}
