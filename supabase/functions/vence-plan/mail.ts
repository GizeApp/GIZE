// Texto del mail «tu plan vence mañana» (función vence-plan). Está aparte de index.ts para
// poder probarlo sin Deno (tests/aviso-vence-mail.test.mjs).
// Va por mail y no dentro de las apps de las tiendas: puede nombrar las formas de pago.

export type AvisoVence = { nombre?: string | null; vence: string; prueba: boolean; clientes: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// Último día cubierto, en hora de Argentina: lo pago vence a las 00:00 del día siguiente
// (por eso se le resta un instante). «el martes 6 de octubre».
export function diaVence(iso: string): string {
  const t = new Date(new Date(iso).getTime() - 1);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(t).split("-").map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return "el " + DIAS[d.getUTCDay()] + " " + p[2] + " de " + MESES[p[1] - 1];
}

export function mailVence(a: AvisoVence): { subject: string; html: string; text: string } {
  const que = a.prueba ? "tu prueba gratis de GIZE" : "tu plan de GIZE";
  const subject = a.prueba ? "Tu prueba gratis de GIZE termina mañana" : "Tu plan de GIZE vence mañana";
  const hola = a.nombre && a.nombre.trim() ? "Hola " + a.nombre.trim().split(/\s+/)[0] + ":" : "Hola:";
  const parrafos = [
    "Te avisamos que " + que + " " + (a.prueba ? "termina" : "vence") + " mañana (cubre hasta " + diaVence(a.vence) + ").",
    "Para seguir sin cortes, entrá a gize.ar desde la compu o el navegador del celular → Mi plan. Podés activar la renovación automática con tarjeta (Mercado Pago) y no tener que pagar a mano cada mes, o pagar por transferencia hablándonos por WhatsApp.",
  ];
  if (a.clientes > 0) parrafos.push("Si no se renueva, tenés 4 días más para hacerlo. Después, " + (a.clientes === 1 ? "tu cliente pasa" : "tus " + a.clientes + " clientes pasan") + " a usar GIZE por su cuenta, con todo lo que les armaste.");
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0B0D11;font-size:15px;line-height:1.5">'
    + '<div style="height:4px;background:linear-gradient(90deg,#22D3EE,#A855F7,#EC4899);border-radius:4px"></div>'
    + '<h2 style="margin:20px 0 12px;font-size:20px">' + esc(subject) + '</h2>'
    + '<p>' + esc(hola) + '</p>'
    + parrafos.map((p) => '<p>' + esc(p) + '</p>').join("")
    + '<p style="margin:24px 0"><a href="https://gize.ar/app/" style="background:#0B0D11;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Ir a Mi plan</a></p>'
    + '<p style="margin-top:20px;font-size:12px;color:#9CA3AF">Mail automático de GIZE. Si ya lo renovaste, no tenés que hacer nada.</p></div>';
  const text = [hola, ...parrafos, "https://gize.ar/app/", "Si ya lo renovaste, no tenés que hacer nada."].join("\n\n");
  return { subject, html, text };
}
