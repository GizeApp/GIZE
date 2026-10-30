// Lo común de las pruebas de Cobros del coach (tests/cobros-coach*.test.mjs): un coach sin gimnasio con
// cinco alumnos (nombres inventados) y la base de Cobros simulada (supabase/cobros-coach.sql), con la
// forma que devuelven sus funciones. No es una prueba (no termina en .test.mjs).
import { wait } from './lib.mjs';
import { entrar, COACH, ID } from './gym-comun.mjs';

export const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const ymd = n => { const d = new Date(hoyAR() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// «05/11» (con el año si no es este), como lo muestra la app.
export const ddmm = d => d.slice(8, 10) + '/' + d.slice(5, 7) + (d.slice(0, 4) !== hoyAR().slice(0, 4) ? '/' + d.slice(2, 4) : '');
// Sumar meses como Postgres (el 31 de enero + 1 mes = el 28 o 29 de febrero).
export const masMeses = (d, n) => { const [y, m, dd] = d.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1)); const ult = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(dd, ult)); return t.toISOString().slice(0, 10); };
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const mesHoy = () => hoyAR().slice(0, 8) + '01';

export const A = { mar: ID('a1'), juan: ID('a2'), luc: ID('a3'), raul: ID('a4'), sof: ID('a5') };
export const NOMBRES = { [A.mar]: 'Martina Sosa', [A.juan]: 'Juan Pérez', [A.luc]: 'Lucía Gómez', [A.raul]: 'Raúl Díaz', [A.sof]: 'Sofía Ruiz' };
const LISTA = Object.keys(NOMBRES).map(id => ({ id, full_name: NOMBRES[id], role: 'client', coach_id: COACH.id }));

// Lo que contesta cobros_resumen: uno en cada estado.
export function resumen(o = {}){
  return Object.assign({ interruptor: { web: true, android: false, ios: false }, activo: true, hoy: hoyAR(), mes: mesHoy(),
    alumnos: [
      { id: A.juan, nombre: 'Juan Pérez', avatar_path: null, cuota: { monto: 25000, meses: 1 }, vence: ymd(-3), estado: 'vencida', ultimo_cobro: ymd(-33) },
      { id: A.luc, nombre: 'Lucía Gómez', avatar_path: null, cuota: { monto: 60000, meses: 3 }, vence: ymd(5), estado: 'por_vencer', ultimo_cobro: ymd(-85) },
      { id: A.mar, nombre: 'Martina Sosa', avatar_path: null, cuota: { monto: 25000, meses: 1 }, vence: ymd(20), estado: 'al_dia', ultimo_cobro: ymd(-10) },
      { id: A.raul, nombre: 'Raúl Díaz', avatar_path: null, cuota: { monto: 20000, meses: 1 }, vence: null, estado: 'sin_pagos', ultimo_cobro: null },
      { id: A.sof, nombre: 'Sofía Ruiz', avatar_path: null, cuota: null, vence: null, estado: null, ultimo_cobro: null },
    ], cobrado: 150000, cobros_mes: 5, por_cobrar: 70000, alumnos_por_cobrar: 3,
    conteo: { al_dia: 1, por_vencer: 1, vencida: 1, sin_pagos: 1, sin_cuota: 1 } }, o);
}
// cobros_alumno: dos cobros, uno anulado.
export const fichaDe = id => ({ alumno: id, cuota: { monto: 25000, meses: 1 }, vence: ymd(20), estado: 'al_dia', cobros: [
  { id: ID('b1'), fecha: ymd(-10), monto: 25000, medio: 'transferencia', desde: ymd(-10), hasta: ymd(20), nota: 'Pagó junto con la remera', cargado: new Date().toISOString(), anulado: null, motivo: null },
  { id: ID('b2'), fecha: ymd(-12), monto: 25000, medio: 'efectivo', desde: ymd(-12), hasta: ymd(18), nota: null, cargado: new Date().toISOString(), anulado: new Date().toISOString(), motivo: 'Repetido' }] });
// cobros_mes: uno común (con una nota que parece fórmula), uno de un ex alumno y uno anulado.
export const delMes = () => [
  { id: ID('b1'), fecha: ymd(0), alumno: A.mar, nombre: 'Martina Sosa', monto: 25000, medio: 'transferencia', desde: ymd(0), hasta: masMeses(ymd(0), 1), nota: '=1+1', anulado: null, motivo: null, ex_alumno: false },
  { id: ID('b3'), fecha: ymd(0), alumno: ID('a9'), nombre: 'Pablo Viejo', monto: 18000, medio: 'efectivo', desde: ymd(0), hasta: masMeses(ymd(0), 1), nota: null, anulado: null, motivo: null, ex_alumno: true },
  { id: ID('b2'), fecha: ymd(0), alumno: A.mar, nombre: 'Martina Sosa', monto: 25000, medio: 'otro', desde: ymd(0), hasta: masMeses(ymd(0), 1), nota: null, anulado: new Date().toISOString(), motivo: 'Repetido', ex_alumno: false },
];
// La base de Cobros simulada. o.resumen: lo que contesta cobros_resumen (o { error, status }).
export function rpcCobros(o = {}){
  return {
    cobros_resumen: () => o.resumen === undefined ? resumen() : o.resumen,
    cobros_alumno: b => fichaDe(b.alumno),
    cobros_mes: () => delMes(),
    cobro_cuota_guardar: b => ({ ok: (b.alumnos || []).length }),
    cobro_registrar: b => ({ id: b.id, desde: ymd(0), hasta: b.hasta || masMeses(ymd(0), 1), repetido: false }),
    cobro_anular: () => ({ ok: true, vence: ymd(18) }),
  };
}
// Entra como el coach (sin gimnasio, con el plan al día) con sus cinco alumnos. o: lo de entrar (vp, tema,
// init, handlers, espera…) y resumen.
export async function entrarCoach(base, o = {}){
  const pg = await entrar(base, COACH, Object.assign({ gym: null, nombre: 'Martín Coach', alumnos: LISTA, rpc: rpcCobros(o) }, o));
  const b = await pg.p.$('[data-onb="done"]'); if (b) { await b.click(); await wait(400); }
  return pg;
}
export const modalTxt = p => p.evaluate(() => { const m = document.getElementById('cobrosModal'); return m ? m.innerText.replace(/\s+/g, ' ').trim() : ''; });
// Lo que se pidió del panel del gimnasio (sus módulos y sus estilos).
export const recursosGym = p => p.evaluate(() => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname).filter(u => /\/app\/screens\/gym\/|gym\.css/.test(u)));
// ¿El relleno de la ventana es opaco? (rgb(), rgba() o color(srgb … / a), como carteles-opacos-comun.mjs)
export const opaca = (p, sel) => p.$eval(sel, e => { const c = getComputedStyle(e).backgroundColor;
  const m = String(c).match(/\/\s*([\d.]+)\s*\)$/) || String(c).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/); return (m ? parseFloat(m[1]) : /^(rgb|color)\(/.test(c) ? 1 : 0) === 1; }).catch(() => false);
