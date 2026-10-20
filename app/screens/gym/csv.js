// Exportar a CSV (Socios, Configuración → Exportar todo, y el aviso antes de borrar la cuenta del
// dueño). Separado por punto y coma y con BOM, para que Excel en castellano lo abra en columnas y con
// las tildes bien. Sin fórmulas: un valor que empieza con = + - @ va con un apóstrofo adelante.
import { rpc } from './estado.js';

const celda = v => {
  let s = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "sí" : "no") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function aCsv(filas, cols){
  const ks = cols || (filas[0] ? Object.keys(filas[0]) : []);
  return "﻿" + [ks.map(celda).join(";")].concat(filas.map(f => ks.map(k => celda(f[k])).join(";"))).join("\r\n");
}
export function descargar(nombre, texto){
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = nombre; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const hoy = () => new Date().toISOString().slice(0, 10);
// gym_exportar: «socios», «ingresos» o «equipo». Devuelve "" si salió bien o el texto del error.
export async function exportar(tipo){
  const r = await rpc("gym_exportar", { tipo });
  if (r.error) return r.msg;
  descargar("gimnasio-" + tipo + "-" + hoy() + ".csv", aCsv(Array.isArray(r.data) ? r.data : []));
  return "";
}
export async function exportarTodo(){
  for (const t of ["socios", "ingresos", "equipo"]){ const e = await exportar(t); if (e) return e; }
  return "";
}
