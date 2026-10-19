// Pasos por día: hoy, ayer y los promedios de la semana y del mes (Cardio → «Pasos»). Puro: sin
// imports, sin pantalla y sin reloj (la fecha de hoy entra por parámetro), así se prueba solo
// (tests/pasos-promedios.test.mjs).
//
// De dónde salen: hoy, de state.steps (si state.stepsDate es hoy); los días anteriores, del
// registro diario (state.daily[AAAA-MM-DD].steps): lo que bajó de la nube (daily_logs) y, en la
// app instalada, lo que se leyó de Salud de Apple / Health Connect (core/salud.js, 31 días).
//
// Los promedios (pedido):
//   · «Promedio de la semana»: los últimos 7 días, hoy incluido (hoy y los 6 anteriores).
//   · «Promedio del mes»: los últimos 30 días, hoy incluido (hoy y los 29 anteriores).
//   En los dos se promedian SOLO los días con datos (más de 0 pasos): un día sin el celular o
//   antes de conectar Salud no baja el promedio. Sin ningún día con datos, no hay promedio
//   (null → la pantalla muestra «—»). Se redondea al paso.
//   · «Ayer»: los pasos de ayer; 0 o sin dato → null («—»).

export const DIAS_SEMANA = 7, DIAS_MES = 30;

// "AAAA-MM-DD" ± k días (en UTC: sin saltos por el cambio de hora).
export function sumarDias(ymdStr, k){
  const p = String(ymdStr).split("-").map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + k)).toISOString().slice(0, 10);
}

// Pasos de un día. daily: { fecha: { steps } }; hoy / hoyN: la fecha de hoy y sus pasos.
export function pasosDe(daily, hoy, hoyN, d){
  if (d === hoy) return Math.max(0, Math.round(Number(hoyN) || 0));
  if (d > hoy) return 0;
  const r = daily && daily[d];
  return Math.max(0, parseInt(r && r.steps, 10) || 0);
}

// Promedio de los últimos `dias` días (hoy incluido), solo los días con datos.
// → { prom: número o null, conDatos: cuántos días tenían pasos, dias }
export function promedio(daily, hoy, hoyN, dias){
  let suma = 0, con = 0;
  for (let i = 0; i < dias; i++){
    const n = pasosDe(daily, hoy, hoyN, sumarDias(hoy, -i));
    if (n > 0){ suma += n; con++; }
  }
  return { prom: con ? Math.round(suma / con) : null, conDatos: con, dias };
}

// Todo lo de la sección: hoy, ayer, la semana y el mes.
export function resumenPasos(daily, hoy, hoyN){
  const ayer = pasosDe(daily, hoy, hoyN, sumarDias(hoy, -1));
  return {
    hoy: pasosDe(daily, hoy, hoyN, hoy),
    ayer: ayer > 0 ? ayer : null,
    semana: promedio(daily, hoy, hoyN, DIAS_SEMANA),
    mes: promedio(daily, hoy, hoyN, DIAS_MES),
  };
}
