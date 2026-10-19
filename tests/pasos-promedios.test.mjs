// Cardio → «Pasos»: las cuentas de app/core/pasosdia.js, sin pantalla.
// · «Ayer»: los pasos de ayer; 0 o sin dato → null («—»).
// · «Promedio de la semana»: los últimos 7 días con hoy incluido; «del mes»: los últimos 30. En los
//   dos solo cuentan los días con datos (> 0): los huecos y los días en 0 no bajan el promedio; sin
//   ningún día con datos → null («—»). Redondeado al paso.
// · Las ventanas cruzan el cambio de mes (y de año) y no se corren con el cambio de hora; los días
//   después de hoy no cuentan.
import { DIAS_MES, DIAS_SEMANA, pasosDe, promedio, resumenPasos, sumarDias } from '../app/core/pasosdia.js';

export default async function ({ t }){
  // Fechas.
  t.eq([sumarDias('2026-10-01', -1), sumarDias('2026-03-01', -1), sumarDias('2024-03-01', -1), sumarDias('2027-01-01', -1), sumarDias('2026-12-31', 1)],
    ['2026-09-30', '2026-02-28', '2024-02-29', '2026-12-31', '2027-01-01'], 'sumarDias: cambio de mes, bisiesto y cambio de año');
  t.eq(sumarDias('2026-10-04', 1), '2026-10-05', 'sumarDias: sin saltos por el cambio de hora');
  t.eq([DIAS_SEMANA, DIAS_MES], [7, 30], 'las ventanas: 7 y 30 días');

  // Pasos de un día: hoy de state.steps; antes, del registro (texto o número); después de hoy, 0.
  const daily = { '2026-10-06': { steps: '9100' }, '2026-10-05': { steps: 8000 }, '2026-10-04': { steps: '' }, '2026-10-03': { comment: 'x' }, '2026-10-08': { steps: '5000' } };
  t.eq(['2026-10-07', '2026-10-06', '2026-10-05', '2026-10-04', '2026-10-03', '2026-10-02', '2026-10-08'].map(d => pasosDe(daily, '2026-10-07', 1234, d)),
    [1234, 9100, 8000, 0, 0, 0, 0], 'pasosDe: hoy, registro en texto y en número, vacío, sin pasos, sin día y el futuro en 0');
  t.eq(pasosDe({ '2026-10-06': { steps: '-50' } }, '2026-10-07', -3, '2026-10-06'), 0, 'pasosDe: nunca negativo');

  // Semana con huecos: solo los días con datos.
  // Hoy 1000, ayer 9100, anteayer 8000, 04 vacío, 03 sin pasos, 02 nada, 01 6000 → (1000+9100+8000+6000)/4.
  const d2 = Object.assign({}, daily, { '2026-10-01': { steps: '6000' }, '2026-09-30': { steps: '50000' } });
  t.eq(promedio(d2, '2026-10-07', 1000, 7), { prom: 6025, conDatos: 4, dias: 7 }, 'semana: promedia solo los 4 días con datos (no cuenta el 30/9, que es el octavo día)');
  t.eq(promedio(d2, '2026-10-07', 0, 7), { prom: 7700, conDatos: 3, dias: 7 }, 'semana: hoy en 0 no baja el promedio');
  t.eq(promedio({}, '2026-10-07', 0, 7), { prom: null, conDatos: 0, dias: 7 }, 'semana sin ningún dato: null («—»)');
  t.eq(promedio({ '2026-10-05': { steps: '0' }, '2026-10-04': { steps: '' } }, '2026-10-07', 0, 7).prom, null, 'semana con días en 0 o vacíos: null («—»)');
  t.eq(promedio({ '2026-10-06': { steps: '3' } }, '2026-10-07', 2, 7).prom, 3, 'redondea al paso (2,5 → 3)');

  // Mes: 30 días con hoy incluido, cruzando el cambio de mes.
  const m = {};
  for (let i = 1; i <= 40; i++) m[sumarDias('2026-10-05', -i)] = { steps: String(1000 * i) };
  // Hoy 5/10 (500) + del 4/10 (1000) al 7/9 (29000): 29 días anteriores → (500 + 1000·(1+…+29)) / 30.
  t.eq(promedio(m, '2026-10-05', 500, 30), { prom: Math.round((500 + 1000 * 435) / 30), conDatos: 30, dias: 30 }, 'mes: los últimos 30 días con hoy, cruzando septiembre');
  t.eq(promedio(m, '2026-10-05', 0, 30), { prom: Math.round(1000 * 435 / 29), conDatos: 29, dias: 30 }, 'mes: sin pasos hoy, 29 días con datos');
  t.eq(promedio({ '2026-09-05': { steps: '7000' }, '2026-09-06': { steps: '9000' } }, '2026-10-05', 0, 30), { prom: 9000, conDatos: 1, dias: 30 }, 'mes: el día 31 hacia atrás ya no entra (6/9 sí, 5/9 no)');
  t.eq(promedio({ '2025-12-31': { steps: '4000' }, '2026-01-01': { steps: '6000' } }, '2026-01-02', 0, 7).prom, 5000, 'semana que cruza el año');

  // Todo junto.
  const r = resumenPasos(d2, '2026-10-07', 1000);
  t.eq([r.hoy, r.ayer, r.semana.prom, r.mes.prom, r.mes.conDatos], [1000, 9100, 6025, Math.round((1000 + 9100 + 8000 + 6000 + 50000) / 5), 5], 'resumenPasos: hoy, ayer, semana y mes');
  t.eq(resumenPasos({}, '2026-10-07', 0), { hoy: 0, ayer: null, semana: { prom: null, conDatos: 0, dias: 7 }, mes: { prom: null, conDatos: 0, dias: 30 } }, 'resumenPasos sin datos: ayer y promedios en null («—»)');
  t.eq(resumenPasos({ '2026-10-06': { steps: '0' } }, '2026-10-07', 0).ayer, null, 'ayer en 0: null («—»)');
  t.eq(resumenPasos(null, '2026-10-07', 10).semana.prom, 10, 'sin registro (null): solo hoy');
}
