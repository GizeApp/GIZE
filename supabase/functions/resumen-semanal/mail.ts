// Texto del resumen de los lunes para el coach (función resumen-semanal): el mail y el aviso. Está
// aparte de index.ts para poder probarlo sin Deno (tests/resumen-semanal.test.mjs).
// Los datos los arma la base (resumen_semanal_datos, supabase/resumen-semanal.sql) con el nombre
// completo de cada alumno; acá se acortan al nombre de pila (con la inicial del apellido si hay dos
// iguales). Nunca lleva peso, comidas, respuestas, fotos ni pasos, ni habla de planes, pagos o precios:
// es un aviso del servicio (lo que hicieron sus alumnos) y vale igual para las apps de las tiendas.

export type Records = { nombre: string; items: { ej: string; kg: number; antes: number }[]; total: number };
export type Datos = {
  semana: string; alumnos: number; entrenaron: number; entrenos: number; checkins: number;
  sin_entrenar: { nombre: string; dias: number }[]; sin_entrenar_mas: number;
  sin_empezar: string[]; sin_empezar_mas: number; sin_actividad: number;
  records: Records[]; records_total: number;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const APP = "https://gize.ar/app/";
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// Largo máximo del aviso (lo que entra en la notificación sin cortarse en la mayoría de los celulares).
export const AVISO_MAX = 180;

const num = (v: unknown) => Number(v) || 0;
const plural = (n: number, uno: string, varios: string) => n + " " + (n === 1 ? uno : varios);

// Kilos con coma y sin decimales de más: 100 → «100 kg», 102.5 → «102,5 kg».
export function kg(n: number): string {
  return String(Math.round(num(n) * 100) / 100).replace(".", ",") + " kg";
}

// «del lunes 19 al domingo 25 de octubre»; si cruza de mes, «del lunes 28 de septiembre al domingo 4
// de octubre». semana: el lunes, AAAA-MM-DD.
export function semanaEnPalabras(semana: string): string {
  const [a, m, d] = String(semana).split("-").map(Number);
  const lun = new Date(Date.UTC(a, m - 1, d)), dom = new Date(Date.UTC(a, m - 1, d + 6));
  const fecha = (x: Date) => DIAS[x.getUTCDay()] + " " + x.getUTCDate();
  return lun.getUTCMonth() === dom.getUTCMonth()
    ? "del " + fecha(lun) + " al " + fecha(dom) + " de " + MESES[dom.getUTCMonth()]
    : "del " + fecha(lun) + " de " + MESES[lun.getUTCMonth()] + " al " + fecha(dom) + " de " + MESES[dom.getUTCMonth()];
}

// El lunes de la semana pasada (en hora de Argentina), para la muestra del panel.
export function semanaPasada(ahora = Date.now()): string {
  const ar = new Date(ahora - 3 * 3600_000); // Argentina: UTC-3, sin horario de verano
  const lunes = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() - ((ar.getUTCDay() + 6) % 7) - 7));
  return lunes.toISOString().slice(0, 10);
}

// Nombre de pila de cada alumno. Si dos alumnos distintos tienen el mismo, va la inicial del apellido
// («Juan P.» y «Juan G.»); si también coincide, el apellido entero. Sin nombre: «Un alumno».
export function cortos(nombres: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const partes = (n: string) => String(n || "").trim().split(/\s+/).filter(Boolean);
  const pila = (n: string) => (partes(n)[0] || "").toLowerCase();
  const distintos = [...new Set(nombres.map((n) => String(n || "").trim()))];
  for (const n of distintos) {
    const p = partes(n);
    if (!p.length) { out.set(n, "Un alumno"); continue; }
    const mismos = distintos.filter((x) => x !== n && pila(x) === pila(n));
    if (!mismos.length || p.length === 1) { out.set(n, p[0]); continue; }
    const ini = (x: string) => { const q = partes(x); return q.length > 1 ? q[q.length - 1][0].toUpperCase() : ""; };
    const choca = mismos.some((x) => ini(x) === ini(n));
    out.set(n, p[0] + " " + (choca ? p[p.length - 1] : ini(n) + "."));
  }
  return out;
}

function nombresDe(r: Datos): Map<string, string> {
  return cortos([...(r.sin_entrenar || []).map((x) => x.nombre), ...(r.sin_empezar || []), ...(r.records || []).map((x) => x.nombre)]);
}

// La cifra principal, para el asunto y el aviso: «entrenaron 12 de tus 15 alumnos».
function cifra(r: Datos): string {
  const al = num(r.alumnos), en = num(r.entrenaron);
  if (al === 1) return en ? "tu alumno entrenó" : "tu alumno no entrenó";
  if (en >= al) return "entrenaron tus " + al + " alumnos";
  if (en === 0) return "ninguno de tus " + al + " alumnos entrenó";
  return (en === 1 ? "entrenó 1" : "entrenaron " + en) + " de tus " + al + " alumnos";
}
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Las secciones del mail, como texto (el HTML las escapa).
function secciones(r: Datos, corto: (n: string) => string) {
  const al = num(r.alumnos), en = num(r.entrenaron), veces = num(r.entrenos), ci = num(r.checkins);
  const rango = semanaEnPalabras(r.semana);
  let principal: string;
  if (al === 1) principal = en ? "La semana pasada (" + rango + ") tu alumno entrenó " + plural(veces, "vez", "veces") + "."
    : "La semana pasada (" + rango + ") tu alumno no registró entrenos.";
  else if (en >= al) principal = "La semana pasada (" + rango + ") entrenaron tus " + al + " alumnos, con " + veces + " entrenos entre todos. ¡Muy buena semana!";
  else if (en === 0) principal = "La semana pasada (" + rango + ") ninguno de tus " + al + " alumnos registró entrenos.";
  else principal = "La semana pasada (" + rango + ") " + (en === 1 ? "entrenó 1" : "entrenaron " + en) + " de tus " + al + " alumnos, con "
    + plural(veces, "entreno", "entrenos") + (en > 1 ? " entre todos." : ".");
  if (ci > 0) principal += " " + (ci === 1 ? (al === 1 ? "Te mandó su check-in." : "1 te mandó su check-in.") : ci + " te mandaron su check-in.");

  // Para escribirles: si entrenaron todos, no hay.
  // Hasta 6 que llevan días sin entrenar y 3 nuevos; los demás, en un número.
  const escribir: string[] = [];
  if (en < al) {
    const sin = r.sin_entrenar || [], nue = r.sin_empezar || [];
    for (const x of sin.slice(0, 6)) escribir.push(corto(x.nombre) + " lleva " + num(x.dias) + " días sin entrenar");
    const mas = num(r.sin_entrenar_mas) + Math.max(0, sin.length - 6);
    if (mas > 0) escribir.push(mas === 1 ? "Y 1 alumno más lleva más de una semana sin entrenar" : "Y " + mas + " alumnos más llevan más de una semana sin entrenar");
    for (const n of nue.slice(0, 3)) escribir.push(corto(n) + " todavía no registró su primer entreno");
    const nuevos = num(r.sin_empezar_mas) + Math.max(0, nue.length - 3);
    if (nuevos > 0) escribir.push(nuevos === 1 ? "Y 1 alumno nuevo más todavía no registró su primer entreno" : "Y " + nuevos + " alumnos nuevos más todavía no registraron su primer entreno");
  }
  const quietos = en < al ? num(r.sin_actividad) : 0;
  const ademas = quietos > 0
    ? (quietos === 1 ? "Además, 1 alumno no entrena hace más de 2 meses o nunca registró entrenos." : "Además, " + quietos + " alumnos no entrenan hace más de 2 meses o nunca registraron entrenos.")
    : "";

  // Récords: hasta 5 alumnos y 2 ejercicios por alumno.
  const records: string[] = [];
  let mostrados = 0;
  for (const x of (r.records || []).slice(0, 5)) {
    const items = (x.items || []).slice(0, 2);
    if (!items.length) continue;
    mostrados += items.length;
    records.push(corto(x.nombre) + " hizo récord " + items.map((i) => "en " + String(i.ej || "").trim() + ": " + kg(i.kg) + " (" + kg(num(i.kg) - num(i.antes)) + " más que su mejor marca)").join(" y "));
  }
  const resto = Math.max(0, num(r.records_total) - mostrados);
  const masRecords = resto > 0 ? (resto === 1 ? "Y 1 récord más." : "Y " + resto + " récords más.") : "";
  return { principal, escribir, ademas, records, masRecords };
}

// El aviso: «Entrenaron 12 de tus 15 alumnos. Martina lleva 9 días sin entrenar. Juan hizo récord en
// Sentadilla.» Hasta AVISO_MAX letras: lo que no entra se deja afuera (el detalle está en el mail).
export function avisoResumen(r: Datos): { title: string; body: string } {
  const m = nombresDe(r), corto = (n: string) => m.get(String(n || "").trim()) || "Un alumno";
  const partes = [mayus(cifra(r)) + "."];
  if (num(r.entrenaron) < num(r.alumnos)) {
    const s = (r.sin_entrenar || [])[0], n = (r.sin_empezar || [])[0];
    if (s) partes.push(corto(s.nombre) + " lleva " + num(s.dias) + " días sin entrenar.");
    else if (n !== undefined) partes.push(corto(n) + " todavía no registró su primer entreno.");
  }
  const rec = (r.records || [])[0];
  if (rec && rec.items && rec.items[0]) partes.push(corto(rec.nombre) + " hizo récord en " + String(rec.items[0].ej || "").trim() + ".");
  let body = "";
  for (const p of partes) if ((body ? body + " " + p : p).length <= AVISO_MAX) body = body ? body + " " + p : p;
  if (!body) body = partes[0].slice(0, AVISO_MAX);
  return { title: "Tu semana en GIZE", body };
}

// El mail. baja: el link de «Dejar de recibirlo» (gize.ar/resumen/?t=…).
export function mailResumen(a: { nombre?: string | null; r: Datos; baja: string }): { subject: string; html: string; text: string } {
  const r = a.r;
  const m = nombresDe(r), corto = (n: string) => m.get(String(n || "").trim()) || "Un alumno";
  const s = secciones(r, corto);
  const subject = "Tu semana: " + cifra(r);
  const hola = a.nombre && a.nombre.trim() ? "Hola " + a.nombre.trim().split(/\s+/)[0] + ":" : "Hola:";
  const previa = avisoResumen(r).body;
  const pie = "Te llega los lunes porque sos coach en GIZE. Para no recibirlo más, apagalo en Configuración → Avisos o tocá Dejar de recibirlo.";
  const lista = (xs: string[]) => '<ul style="margin:0 0 8px;padding-left:20px">' + xs.map((x) => '<li style="margin:4px 0">' + esc(x) + "</li>").join("") + "</ul>";
  const titulo = (t: string) => '<h3 style="margin:24px 0 8px;font-size:16px">' + esc(t) + "</h3>";

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0B0D11;font-size:15px;line-height:1.5">'
    + '<div style="display:none;max-height:0;overflow:hidden">' + esc(previa) + "</div>"
    + '<div style="height:4px;background:linear-gradient(90deg,#22D3EE,#A855F7,#EC4899);border-radius:4px"></div>'
    + '<h2 style="margin:20px 0 12px;font-size:20px">' + esc(subject) + "</h2>"
    + "<p>" + esc(hola) + "</p>"
    + "<p>" + esc(s.principal) + "</p>";
  const text = [hola, s.principal];
  if (s.escribir.length || s.ademas) {
    html += titulo("Para escribirles") + (s.escribir.length ? lista(s.escribir) : "") + (s.ademas ? "<p>" + esc(s.ademas) + "</p>" : "");
    text.push("Para escribirles:\n" + s.escribir.map((x) => "· " + x).join("\n") + (s.ademas ? (s.escribir.length ? "\n" : "") + s.ademas : ""));
  }
  if (s.records.length) {
    html += titulo("Récords de la semana") + lista(s.records) + (s.masRecords ? "<p>" + esc(s.masRecords) + "</p>" : "");
    text.push("Récords de la semana:\n" + s.records.map((x) => "· " + x).join("\n") + (s.masRecords ? "\n" + s.masRecords : ""));
  }
  html += '<p style="margin:24px 0"><a href="' + APP + '" style="background:#0B0D11;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Abrir mi panel</a></p>'
    + '<p style="margin-top:20px;font-size:12px;color:#9CA3AF">' + esc(pie.replace(/ o tocá Dejar de recibirlo\.$/, " o tocá "))
    + '<a href="' + esc(a.baja) + '" style="color:#9CA3AF">Dejar de recibirlo</a>.</p></div>';
  text.push("Abrir mi panel: " + APP, pie + "\nDejar de recibirlo: " + a.baja);
  return { subject, html, text: text.join("\n\n") };
}

// Datos INVENTADOS para «Ver cómo queda» y «Mandármelo» del panel: nunca los de un coach de verdad.
export const MUESTRA: Datos = {
  semana: "2026-10-19", alumnos: 15, entrenaron: 12, entrenos: 41, checkins: 8,
  sin_entrenar: [{ nombre: "Martina Ejemplo", dias: 9 }, { nombre: "Carlos Muestra", dias: 8 }], sin_entrenar_mas: 0,
  sin_empezar: ["Ana Inventada"], sin_empezar_mas: 0, sin_actividad: 1,
  records: [
    { nombre: "Juan Ejemplo", items: [{ ej: "Sentadilla", kg: 100, antes: 95 }], total: 1 },
    { nombre: "Lucía Muestra", items: [{ ej: "Peso muerto", kg: 102.5, antes: 97.5 }, { ej: "Press banca", kg: 45, antes: 42.5 }], total: 2 },
  ],
  records_total: 3,
};
