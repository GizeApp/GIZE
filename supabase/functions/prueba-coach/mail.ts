// Texto de los mails de la prueba gratis (función prueba-coach): el del día 3 («¿Ya sumaste tu
// primer alumno?») y el del día 10 («Te quedan 4 días»). Está aparte de index.ts para poder
// probarlo sin Deno (tests/mails-prueba.test.mjs).
// Va por mail y no dentro de las apps de las tiendas: puede llevar el link a la web y nombrar las
// formas de pago. No lleva precios.

import { diaVence } from "../vence-plan/mail.ts";

export type MailPrueba = { dia: number; nombre?: string | null; codigo?: string | null; clientes: number; vence: string; ahora?: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const APP = "https://gize.ar/app/";

// Mismo diseño que el mail «tu plan vence mañana» (vence-plan/mail.ts).
function armar(subject: string, hola: string, parrafos: string[], boton: string, pie: string) {
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0B0D11;font-size:15px;line-height:1.5">'
    + '<div style="height:4px;background:linear-gradient(90deg,#22D3EE,#A855F7,#EC4899);border-radius:4px"></div>'
    + '<h2 style="margin:20px 0 12px;font-size:20px">' + esc(subject) + '</h2>'
    + '<p>' + esc(hola) + '</p>'
    + parrafos.map((p) => '<p>' + esc(p) + '</p>').join("")
    + '<p style="margin:24px 0"><a href="' + APP + '" style="background:#0B0D11;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">' + esc(boton) + '</a></p>'
    + '<p style="margin-top:20px;font-size:12px;color:#9CA3AF">' + esc(pie) + '</p></div>';
  const text = [hola, ...parrafos, APP, pie].join("\n\n");
  return { subject, html, text };
}

export function mailPrueba(a: MailPrueba): { subject: string; html: string; text: string } {
  const hola = a.nombre && a.nombre.trim() ? "Hola " + a.nombre.trim().split(/\s+/)[0] + ":" : "Hola:";
  const codigo = a.codigo && a.codigo.trim() ? a.codigo.trim() : "";
  const alumnos = a.clientes === 1 ? "tu alumno" : "tus " + a.clientes + " alumnos";

  if (a.dia === 10) {
    // Días que quedan, redondeando para arriba (el mail sale cuando quedan 4 o un poco menos).
    const ms = new Date(a.vence).getTime() - (a.ahora ?? Date.now());
    const dias = Math.max(1, Math.ceil(ms / 864e5));
    const subject = "Te quedan " + dias + (dias === 1 ? " día" : " días") + " de prueba gratis";
    const parrafos = [
      "Tu prueba gratis de GIZE termina en " + dias + (dias === 1 ? " día" : " días") + " (cubre hasta " + diaVence(a.vence) + ").",
      a.clientes > 0
        ? "Cuando termine, dejás de ver lo que hacen " + alumnos + " y nadie más se puede vincular con tu código. Si en 4 días más no elegiste un plan, " + (a.clientes === 1 ? "tu alumno pasa" : "tus alumnos pasan") + " a usar GIZE por su cuenta, con todo lo que les armaste."
        : "Cuando termine, nadie se va a poder vincular con tu código hasta que elijas un plan.",
      "Para seguir, elegí tu plan en gize.ar desde la compu o el navegador del celular → Mi plan. Podés activar la renovación automática con tarjeta (Mercado Pago) o pagar por transferencia hablándonos por WhatsApp. Si usás GIZE en el iPhone, también podés suscribirte desde la app con tu cuenta de Apple.",
      "¿No sabés qué plan te conviene? Respondé este mail y te ayudamos.",
    ];
    return armar(subject, hola, parrafos, "Elegir mi plan", "Mail automático de GIZE. Si ya elegiste tu plan, no tenés que hacer nada.");
  }

  const comoSumar = "Pasale tu código de invitación" + (codigo ? ", " + codigo + "," : " (lo ves en tu panel, en «Clientes»)")
    + " a tu alumno. Se baja GIZE (o entra a gize.ar), se crea la cuenta y pone el código cuando la app se lo pide. Apenas lo hace, te aparece en el panel.";
  const subject = a.clientes > 0 ? "¿Cómo vas con GIZE?" : "¿Ya sumaste tu primer alumno?";
  const parrafos = a.clientes > 0
    ? ["Ya llevás unos días con GIZE y tenés " + (a.clientes === 1 ? "tu primer alumno" : a.clientes + " alumnos") + ": ¡buen arranque!",
       "Para sumar más: " + comoSumar[0].toLowerCase() + comoSumar.slice(1)]
    : ["Ya llevás unos días probando GIZE. Lo mejor se ve cuando tenés alumnos adentro: les armás la rutina y el plan de comidas, y ves cómo entrenan y qué comen.",
       "Sumar el primero es fácil. " + comoSumar];
  parrafos.push("¿Querés que te demos una mano para arrancar? Respondé este mail y coordinamos una llamada corta para dejarte todo andando.");
  return armar(subject, hola, parrafos, "Ir a mi panel", "Mail automático de GIZE. Te escribimos porque estás en tu prueba gratis de 14 días.");
}
