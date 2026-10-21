// Texto del mail «tu plan vence mañana» (función vence-plan). Está aparte de index.ts para
// poder probarlo sin Deno (tests/aviso-vence-mail.test.mjs).
// Va por mail y no dentro de las apps de las tiendas: puede nombrar las formas de pago.
// Gimnasios (supabase/gimnasios-admin.sql): al dueño le llega a 7, 3 y 1 día (dias), con el nombre del
// gimnasio y sus socios, y qué pasa si no se renueva (5 días con todo andando, después los profes
// dejan de ver a los socios y a los 10 días los socios quedan sin profe). La administración del
// gimnasio lo recibe en copia (index.ts). «dias» es el escalón del aviso (7, 3 o 1); el texto usa
// «faltan», los días que faltan de verdad (en días de Argentina): un plan que entra a la ventana con
// 5 días dice «en 5 días», no «en 7 días».

export type AvisoVence = { nombre?: string | null; vence: string; prueba: boolean; clientes: number;
  gimnasio?: string | null; socios?: number | null; dias?: number | null; faltan?: number | null };

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

// El mail para el dueño de un gimnasio.
function mailGimnasio(a: AvisoVence): { subject: string; parrafos: string[]; boton: string; pie: string } {
  const g = String(a.gimnasio || "").trim();
  // Sin «faltan» (SQL de antes), el escalón.
  const n = Number.isInteger(a.faltan) && (a.faltan as number) >= 0 ? a.faltan as number : (a.dias === 3 || a.dias === 7 ? a.dias : 1);
  const cuando = n === 0 ? "hoy" : n === 1 ? "mañana" : "en " + n + " días";
  const que = a.prueba ? "La prueba gratis de GIZE de " + g : "El plan de GIZE de " + g;
  const subject = que + (a.prueba ? " termina " : " vence ") + cuando;
  const socios = Number(a.socios) || 0;
  const parrafos = [
    que + (a.prueba ? " termina " : " vence ") + cuando + " (cubre hasta " + diaVence(a.vence) + ")" + (socios > 0 ? ". Hoy tiene " + (socios === 1 ? "1 socio" : socios + " socios") + "." : "."),
    "Para seguir sin cortes, entrá a gize.ar/app desde la compu o el navegador del celular → Plan de GIZE. Podés activar la renovación automática con tarjeta (Mercado Pago) o pagar por transferencia hablándonos por WhatsApp.",
    "Si no se renueva, durante 5 días todo sigue andando. Después, los profes y la administración dejan de ver los registros de los socios (la recepción y exportar siguen), y a los 10 días los socios quedan sin profe. Al pagar, todo vuelve solo.",
  ];
  return { subject, parrafos, boton: "Ir a Plan de GIZE", pie: "Mail automático de GIZE para la administración de " + g + ". Si ya lo renovaron, no tienen que hacer nada." };
}

export function mailVence(a: AvisoVence): { subject: string; html: string; text: string } {
  if (a.gimnasio && String(a.gimnasio).trim()) return armar(a, mailGimnasio(a));
  const que = a.prueba ? "tu prueba gratis de GIZE" : "tu plan de GIZE";
  const subject = a.prueba ? "Tu prueba gratis de GIZE termina mañana" : "Tu plan de GIZE vence mañana";
  const parrafos = [
    "Te avisamos que " + que + " " + (a.prueba ? "termina" : "vence") + " mañana (cubre hasta " + diaVence(a.vence) + ").",
    "Para seguir sin cortes, entrá a gize.ar desde la compu o el navegador del celular → Mi plan. Podés activar la renovación automática con tarjeta (Mercado Pago) y no tener que pagar a mano cada mes, o pagar por transferencia hablándonos por WhatsApp.",
  ];
  if (a.clientes > 0) parrafos.push("Si no se renueva, tenés 4 días más para hacerlo. Después, " + (a.clientes === 1 ? "tu cliente pasa" : "tus " + a.clientes + " clientes pasan") + " a usar GIZE por su cuenta, con todo lo que les armaste.");
  return armar(a, { subject, parrafos, boton: "Ir a Mi plan", pie: "Mail automático de GIZE. Si ya lo renovaste, no tenés que hacer nada." });
}

function armar(a: AvisoVence, m: { subject: string; parrafos: string[]; boton: string; pie: string }): { subject: string; html: string; text: string } {
  const { subject, parrafos } = m;
  const hola = a.nombre && a.nombre.trim() ? "Hola " + a.nombre.trim().split(/\s+/)[0] + ":" : "Hola:";
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0B0D11;font-size:15px;line-height:1.5">'
    + '<div style="height:4px;background:linear-gradient(90deg,#22D3EE,#A855F7,#EC4899);border-radius:4px"></div>'
    + '<h2 style="margin:20px 0 12px;font-size:20px">' + esc(subject) + '</h2>'
    + '<p>' + esc(hola) + '</p>'
    + parrafos.map((p) => '<p>' + esc(p) + '</p>').join("")
    + '<p style="margin:24px 0"><a href="https://gize.ar/app/" style="background:#0B0D11;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">' + esc(m.boton) + '</a></p>'
    + '<p style="margin-top:20px;font-size:12px;color:#9CA3AF">' + esc(m.pie) + '</p></div>';
  const text = [hola, ...parrafos, "https://gize.ar/app/", m.pie.replace(/^Mail automático de GIZE[^.]*\. /, "")].join("\n\n");
  return { subject, html, text };
}
