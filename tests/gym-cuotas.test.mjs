// Gimnasios, etapa 2: las cuotas en las pantallas (app/screens/gym/cuotas.js y lo que tocan). Sin cobro
// online: el gimnasio anota lo que le pagan.
// - Cuotas (dueña), en dos secciones: «Estados» (de entrada: vencidas y los filtros por estado) e «Ingresos
//   y cuotas» (cobrado y por cobrar del mes, los tipos de cuota para crear y archivar, y los pagos del mes
//   en CSV). [Registrar pago] con el monto de su cuota y hasta cuándo cubre (como el servidor), el medio,
//   un solo pago con dos toques, «Listo» y la lista que se vuelve a leer. A quien no tiene cuota se le
//   puede elegir una en la misma ventana: queda asignada (gym_cuota_asignar) antes del pago.
// - La ficha del socio: su cuota (cambiarla: gym_cuota_asignar), cuándo vence, el historial con quién
//   cargó cada pago y anular (con motivo).
// - Configuración: «La recepción registra pagos» (gym_config) y «No dejar entrar con la cuota vencida»
//   (gym_cuotas_bloquear).
// - La recepción: con «registra pagos», [Registrar pago] en la ficha del socio; sin eso, no. El ingreso
//   con la cuota vencida avisa; bloqueado, dice que no se registró. Asistencia: «Cuota vencida».
// - El socio (Ajustes → Tu gimnasio): en la web, su cuota, el monto y sus pagos; en las apps de iPhone y
//   Android, solo si está al día y la fecha (sin precios, montos ni pagos). Sin cuota, nada.
// - El profe: el semáforo con la cuota, sin montos.
// Celular y compu, Oscuro y Claro: sin scroll de costado y con contraste de 4,5:1.
import fs from 'node:fs';
import { wait, contraste } from './lib.mjs';
import { entrar, entrarSocio, entrarProfe, miGimnasio, fichaProfe, DUENA, RECEP, F, S, ID, IOS, ANDROID, M, D, hostTxt, modalTxt, rpcs, ir, busqueda,
  buscarRec, recTxt, gymCfgTxt, ingresosHoy, sinScrollHorizontal, captura } from './gym-comun.mjs';

const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ymd = n => { const d = new Date(hoyAR() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ddmm = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const masMes = d => { const [y, m, dd] = d.split('-').map(Number), t = new Date(Date.UTC(y, m, 1)); const ult = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(dd, ult)); return t.toISOString().slice(0, 10); };
const CM = ID('c01'), CT = ID('c03');
const MUSC = { id: CM, name: 'Musculación', amount: 30000, months: 1, archivada: false };
const tipos = () => [Object.assign({ socios: 4 }, MUSC), { id: CT, name: 'Trimestral', amount: 81000, months: 3, archivada: true, socios: 0 }];
const cuota = c => c && { id: c.id, name: c.name, amount: c.amount, months: c.months };
function resumen(){
  return { hoy: hoyAR(), mes: hoyAR().slice(0, 8) + '01', cobrado: 150000, pagos_mes: 5, por_cobrar: 90000, socios_por_cobrar: 3,
    conteo: { al_dia: 1, por_vencer: 1, vencida: 1, sin_pagos: 1, sin_cuota: 1 },
    socios: [
      { id: F.A1, nombre: 'Martina Sosa', foto_path: null, estado: 'activo', cuota: cuota(MUSC), vence: ymd(20), cuota_estado: 'al_dia', ultimo_pago: ymd(-10) },
      { id: F.A2, nombre: 'Juan Pérez', foto_path: null, estado: 'activo', cuota: cuota(MUSC), vence: ymd(-3), cuota_estado: 'vencida', ultimo_pago: ymd(-33) },
      { id: F.A3, nombre: 'Lucía Gómez', foto_path: null, estado: 'activo', cuota: cuota(MUSC), vence: ymd(5), cuota_estado: 'por_vencer', ultimo_pago: ymd(-25) },
      { id: F.A4, nombre: 'Raúl Díaz', foto_path: null, estado: 'activo', cuota: cuota(MUSC), vence: null, cuota_estado: 'sin_pagos', ultimo_pago: null },
      { id: F.A5, nombre: 'Sofía Ruiz', foto_path: null, estado: 'activo', cuota: null, vence: null, cuota_estado: null, ultimo_pago: null },
    ] };
}
const pagosDe = ficha => ({ ficha, cuota: Object.assign({}, MUSC), vence: ficha === F.A1 ? ymd(20) : ymd(-3), estado: ficha === F.A1 ? 'al_dia' : 'vencida',
  pagos: [{ id: ID('e1a'), fecha: ymd(-10), monto: 30000, medio: 'efectivo', cuota: 'Musculación', desde: ymd(-10), hasta: ymd(20), nota: null, por: 'Rocío Recepción', anulado: null },
    { id: ID('e1b'), fecha: ymd(-12), monto: 30000, medio: 'transferencia', cuota: 'Musculación', desde: ymd(-12), hasta: ymd(18), nota: 'Cargado dos veces', por: 'Carla Dueña', anulado: ymd(-11), motivo: 'Repetido' }] });
const RPC = (st = {}) => ({
  gym_cuotas_resumen: () => resumen(), gym_cuotas_tipos: () => tipos(), gym_pagos_ficha: b => pagosDe(b.ficha),
  gym_pago_registrar: b => { st.pagos = (st.pagos || 0) + 1; return { id: b.id, desde: ymd(0), hasta: b.hasta || masMes(ymd(0)), repetido: false }; },
  gym_cuota_tipo_guardar: b => ({ id: ID('c09'), name: b.nombre, amount: b.monto, months: b.meses, archivada: false }),
  gym_cuota_tipo_archivar: b => ({ id: b.id, archivada: b.archivar }), gym_cuota_asignar: b => ({ ok: b.fichas.length }), gym_pago_anular: () => ({ ok: true, vence: ymd(18) }),
  gym_cuotas_bloquear: b => ({ gym: miGimnasio().gym, settings: Object.assign({}, miGimnasio().settings, { cuota_bloquea: b.bloquear }) }),
  gym_pagos_mes: () => [{ id: ID('e1a'), fecha: ymd(0), ficha: F.A1, socio: 'Martina Sosa', monto: 30000, medio: 'efectivo', cuota: 'Musculación', desde: ymd(0), hasta: masMes(ymd(0)), nota: '=1+1', por: 'Carla Dueña', anulado: null }],
});

export default async function ({ base, t }){
  // ===== Cuotas (la dueña), celular y compu =====
  for (const [vp, tema] of [[D, 'oscuro'], [M, 'claro'], [D, 'claro'], [M, 'oscuro']]){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    const st = {};
    const pg = await entrar(base, DUENA, { vp, tema, touch: vp === M, rpc: Object.assign(RPC(st), { gym_pago_registrar: b => { st.pagos = (st.pagos || 0) + 1; return { demora: 400, valor: { id: b.id, desde: ymd(-3) > ymd(0) ? ymd(-3) : ymd(0), hasta: masMes(ymd(0)), repetido: false } }; } }) });
    const p = pg.p;
    if (vp === D) t.ok(await p.$('#coachHost [data-gym="ir"][data-v="cuotas"]'), donde + ': «Cuotas» en el menú');
    await ir(p, 'cuotas'); await wait(400);
    let h = await hostTxt(p);
    t.ok(/Cuotas/.test(h) && /GIZE no cobra/.test(h), donde + ': la pantalla dice que GIZE no cobra');
    // Dos secciones; arranca en «Estados».
    const partes = () => p.$$eval('#coachHost [data-gym="cuotas-parte"]', l => l.map(b => [b.textContent.trim(), b.getAttribute('aria-selected')]));
    t.eq(await partes(), [['Estados', 'true'], ['Ingresos y cuotas', 'false']], donde + ': las dos secciones, arranca en «Estados»');
    t.ok(/Juan Pérez/.test(h) && !/Martina Sosa/.test(h.split('Tipos de cuota')[0]), donde + ': arranca en «Vencidas»: Juan, no Martina');
    t.has(h, ddmm(ymd(-3)), donde + ': con el vencimiento');
    await p.click('#coachHost [data-gym="cuotas-tab"][data-v="todos"]'); await wait(200);
    h = await hostTxt(p);
    t.ok(['Martina Sosa', 'Juan Pérez', 'Lucía Gómez', 'Raúl Díaz', 'Sofía Ruiz'].every(n => h.includes(n)), donde + ': «Todos»: los cinco');
    t.ok(/Al día/.test(h) && /Vencida/.test(h) && /Por vencer/.test(h) && /Sin pagos/.test(h) && /Sin cuota/.test(h), donde + ': cada uno con su estado');
    t.eq(await p.$$eval('.gy-tabla-cuotas .gy-sem', l => l.map(e => e.className.replace('gy-sem', '').trim())), ['verde', 'rojo', 'ambar', 'ambar'], donde + ': con su color');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': sin scroll de costado');
    let c = await contraste(p, '#coachHost .cv-main');
    t.ok(c.min >= 4.5, donde + ': todo el texto con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    await captura(p, 'cuotas-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    // «Ingresos y cuotas»: lo cobrado, lo que falta cobrar, los tipos de cuota y el CSV de los pagos del mes.
    await p.click('#coachHost [data-gym="cuotas-parte"][data-v="ingresos"]'); await wait(300);
    t.eq(await partes(), [['Estados', 'false'], ['Ingresos y cuotas', 'true']], donde + ': «Ingresos y cuotas» elegida');
    h = await hostTxt(p);
    t.ok(/Cobrado este mes/.test(h) && /\$\s?150\.000/.test(h) && /5 pagos/.test(h), donde + ': lo cobrado en el mes: ' + h.slice(0, 200));
    t.ok(/Por cobrar/.test(h) && /\$\s?90\.000/.test(h) && /3 socios este mes/.test(h), donde + ': lo que falta cobrar');
    t.ok(/Musculación/.test(h) && /Trimestral/.test(h) && /archivada/.test(h), donde + ': los tipos de cuota, con la archivada');
    t.ok(await p.isVisible('#coachHost [data-gym="cuotas-csv"]') && await p.isVisible('#coachHost [data-gym="tipo-nuevo"]'), donde + ': «Pagos del mes (CSV)» y «Nueva cuota» a la vista');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': «Ingresos y cuotas» sin scroll de costado');
    c = await contraste(p, '#coachHost .cv-main');
    t.ok(c.min >= 4.5, donde + ': «Ingresos y cuotas» con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    await captura(p, 'cuotas-ingresos-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    // De vuelta en «Estados», sigue en «Todos».
    await p.click('#coachHost [data-gym="cuotas-parte"][data-v="estados"]'); await wait(300);
    t.eq(await p.$eval('#coachHost [data-gym="cuotas-tab"][data-v="todos"]', b => b.getAttribute('aria-pressed')), 'true', donde + ': de vuelta en «Estados», sigue en «Todos»');
    // Registrar un pago (Juan, vencida): el monto de su cuota y hasta cuándo cubre, como el servidor.
    await p.click('#coachHost [data-gym="cuota-pago"][data-id="' + F.A2 + '"]'); await wait(600);
    let m = await modalTxt(p);
    t.ok(/Registrar pago/.test(m) && /Juan Pérez/.test(m) && /Musculación/.test(m), donde + ': la ventana con el socio y su cuota');
    t.eq(rpcs(pg.st, 'gym_pagos_ficha').map(b => b.ficha), [F.A2], donde + ': lee la cuota y los pagos del socio');
    t.eq(await p.$eval('#gymModal [data-gym-pg="monto"]', i => i.value), '30000', donde + ': el monto de su cuota');
    t.eq(await p.$eval('#gymModal [data-gym-pg="hasta"]', i => i.value), masMes(ymd(0)), donde + ': vencida: cubre un mes desde hoy');
    t.eq(await p.$eval('#gymModal [data-gym-pg="fecha"]', i => i.value), hoyAR(), donde + ': la fecha del pago, hoy');
    await p.click('#gymModal .gy-medios label:has([value="transferencia"])'); await wait(150);
    if (tema === 'oscuro') await captura(p, 'cuotas-pago-' + (vp === M ? 'cel' : 'compu'));
    const cm = await contraste(p, '#gymModal .gy-modal');
    t.ok(cm.min >= 4.5, donde + ': la ventana con contraste de 4,5:1 o más (mínimo ' + cm.min + ': ' + cm.malos.slice(0, 4).join(' | ') + ')');
    await p.evaluate(() => { const b = document.querySelector('#gymModal [data-gym="pago-ok"]'); b.click(); b.click(); }); await wait(900);
    const pr = rpcs(pg.st, 'gym_pago_registrar');
    t.eq(pr.length, 1, donde + ': dos toques, un solo pago');
    t.ok(/^[0-9a-f-]{36}$/.test(pr[0].id), donde + ': con un id generado en la app');
    t.eq(Object.assign({}, pr[0], { id: 'x' }), { id: 'x', ficha: F.A2, monto: 30000, medio: 'transferencia', fecha: hoyAR(), hasta: null, nota: null }, donde + ': gym_pago_registrar con la ficha, el monto, el medio y la fecha (lo que cubre lo calcula el servidor)');
    m = await modalTxt(p);
    t.ok(/Listo: pago de Juan Pérez registrado\. La cuota queda paga hasta el/.test(m), donde + ': dice hasta cuándo quedó paga: ' + m);
    t.ok(rpcs(pg.st, 'gym_cuotas_resumen').length >= 2, donde + ': vuelve a leer las cuotas');
    await p.click('#gymModal [data-gym="cerrar"].gize-btn'); await wait(300);
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ===== Tipos de cuota, «cubre hasta» a mano, CSV, ficha y Configuración (compu) =====
  {
    const pg = await entrar(base, DUENA, { rpc: RPC() }), p = pg.p;
    await ir(p, 'cuotas'); await wait(400);
    await p.click('#coachHost [data-gym="cuotas-parte"][data-v="ingresos"]'); await wait(300);
    await p.click('#coachHost [data-gym="tipo-nuevo"]'); await wait(300);
    t.ok(await p.isDisabled('#gymModal [data-gym="tipo-ok"]'), 'nueva cuota: sin nombre ni monto, «Guardar» apagado');
    await p.fill('#gymModal [data-gym-tp="nombre"]', '  Pase libre '); await p.fill('#gymModal [data-gym-tp="monto"]', '45000');
    await p.selectOption('#gymModal [data-gym-tp="meses"]', '3'); await wait(100);
    await p.click('#gymModal [data-gym="tipo-ok"]'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_cuota_tipo_guardar'), [{ id: null, nombre: 'Pase libre', monto: 45000, meses: 3 }], 'gym_cuota_tipo_guardar con nombre, monto y cada cuánto');
    t.ok(!await p.$('#gymModal .gy-modal'), 'y se cierra');
    p.contestar = true;
    await p.click('#coachHost [data-gym="tipo-archivar"][data-id="' + CM + '"]'); await wait(600);
    t.ok(pg.preguntas.some(q => /los socios que la tienen la conservan/.test(q.texto)), 'archivar pregunta antes (los socios la conservan)');
    t.eq(rpcs(pg.st, 'gym_cuota_tipo_archivar'), [{ id: CM, archivar: true }], 'gym_cuota_tipo_archivar');
    await p.click('#coachHost [data-gym="tipo-archivar"][data-id="' + CT + '"]'); await wait(500);
    t.eq(rpcs(pg.st, 'gym_cuota_tipo_archivar')[1], { id: CT, archivar: false }, '«Volver a usar» una archivada');
    // «Cubre hasta» a mano y una nota.
    await p.click('#coachHost [data-gym="cuotas-parte"][data-v="estados"]'); await wait(300);
    await p.click('#coachHost [data-gym="cuotas-tab"][data-v="al_dia"]'); await wait(200);
    await p.click('#coachHost [data-gym="cuota-pago"][data-id="' + F.A1 + '"]'); await wait(600);
    t.eq(await p.$eval('#gymModal [data-gym-pg="hasta"]', i => i.value), masMes(ymd(20)), 'al día: cubre un mes desde el vencimiento');
    await p.fill('#gymModal [data-gym-pg="hasta"]', ymd(60)); await p.fill('#gymModal [data-gym-pg="nota"]', 'Pagó dos meses'); await p.fill('#gymModal [data-gym-pg="monto"]', '55000'); await wait(100);
    await p.click('#gymModal [data-gym="pago-ok"]'); await wait(700);
    t.eq(Object.assign({}, rpcs(pg.st, 'gym_pago_registrar')[0], { id: 'x' }), { id: 'x', ficha: F.A1, monto: 55000, medio: 'efectivo', fecha: hoyAR(), hasta: ymd(60), nota: 'Pagó dos meses' },
      '«cubre hasta» a mano, otro monto y la nota');
    await p.click('#gymModal .gy-x'); await wait(200);
    // CSV de los pagos del mes (en «Ingresos y cuotas»).
    await p.click('#coachHost [data-gym="cuotas-parte"][data-v="ingresos"]'); await wait(300);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#coachHost [data-gym="cuotas-csv"]')]);
    const csv = dl ? fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\r\n') : [];
    t.ok(dl && /^pagos-\d{4}-\d{2}\.csv$/.test(dl.suggestedFilename()), 'los pagos del mes en CSV: ' + (dl && dl.suggestedFilename()));
    t.eq(csv[0], 'fecha;socio;monto;medio;cuota;cubre_desde;cubre_hasta;nota;cargo;anulado', 'con encabezado');
    t.ok(/^\d{4}-\d{2}-\d{2};Martina Sosa;30000;Efectivo;Musculación;.*;'=1\+1;Carla Dueña;no$/.test(csv[1] || ''), 'una fila por pago (sin fórmulas): ' + csv[1]);
    // La ficha: su cuota, el historial y anular.
    await p.click('#coachHost [data-gym="cuotas-parte"][data-v="estados"]'); await wait(300);
    await p.evaluate(() => { const b = document.querySelector('#coachHost .gy-row-cuota[data-id]'); b.click(); }); await wait(900);
    let h = await hostTxt(p);
    t.ok(/Cuota/.test(h) && /Pagos/.test(h) && /Rocío Recepción/.test(h) && /Anulado: Repetido/.test(h), 'la ficha: cuota, pagos con quién los cargó y los anulados con el motivo');
    t.ok(await p.$('#coachHost select[data-gym="cuota-asignar"]'), 'la dueña cambia la cuota desde la ficha');
    await p.selectOption('#coachHost select[data-gym="cuota-asignar"]', ''); await wait(600);
    const asig = rpcs(pg.st, 'gym_cuota_asignar');
    t.ok(asig.length === 1 && asig[0].tipo === null && asig[0].vence === null && asig[0].fichas.length === 1, 'sacar la cuota: gym_cuota_asignar con la ficha y sin cuota: ' + JSON.stringify(asig));
    p.contestar = q => q.tipo === 'pedir' ? 'Lo cargué mal' : true;
    await p.click('#coachHost [data-gym="pago-anular"][data-id="' + ID('e1a') + '"]'); await wait(700);
    t.ok(pg.preguntas.some(q => /Anular el pago/.test(q.titulo) && q.peligro), 'anular pregunta antes');
    t.eq(rpcs(pg.st, 'gym_pago_anular'), [{ id: ID('e1a'), motivo: 'Lo cargué mal' }], 'gym_pago_anular con el motivo');
    t.ok(!await p.$('#coachHost [data-gym="pago-anular"][data-id="' + ID('e1b') + '"]'), 'un pago anulado no se anula de nuevo');
    // Configuración.
    await ir(p, 'config'); await wait(400);
    h = await hostTxt(p);
    t.ok(/La recepción registra pagos/.test(h) && /No dejar entrar con la cuota vencida/.test(h), 'Configuración: los dos interruptores de las cuotas');
    t.ok(!/montos/i.test(h.replace(/los montos, los pagos/g, '')), 'sin un interruptor para que los profes vean montos (nunca los ven)');
    await p.click('#coachHost label.gy-sw:has([data-k="recepcion_cobra"])'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_config').pop(), { patch: { settings: { recepcion_cobra: true } } }, '«La recepción registra pagos»: gym_config');
    await p.click('#coachHost label.gy-sw:has([data-gym="cfg-bloquea"])'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_cuotas_bloquear'), [{ bloquear: true }], '«No dejar entrar»: gym_cuotas_bloquear');
    t.ok(await p.$eval('#coachHost [data-gym="cfg-bloquea"]', x => x.checked), 'queda prendido');
    // Inicio: las cuotas vencidas para hacer.
    await ir(p, 'inicio'); await wait(600);
    t.has(await hostTxt(p), '1 cuota vencida', 'Inicio: «1 cuota vencida» en Para hacer');
    t.eq(pg.errs, [], 'sin errores');
    await pg.close();
  }

  // ===== Registrar pago a quien no tiene cuota: se elige ahí mismo y queda asignada =====
  for (const [vp, tema] of [[D, 'oscuro'], [M, 'claro']]){
    const donde = 'sin cuota, ' + (vp === M ? 'celular' : 'compu') + ', ' + tema;
    // En la compu la primera asignación falla: el pago no se registra hasta que la cuota quede asignada.
    let falla = vp === D;
    const pg = await entrar(base, DUENA, { vp, tema, touch: vp === M, rpc: Object.assign(RPC(), {
      gym_pagos_ficha: b => b.ficha === F.A5 ? { ficha: F.A5, cuota: null, vence: null, estado: null, pagos: [] } : pagosDe(b.ficha),
      gym_cuota_asignar: b => falla ? (falla = false, { error: 'P0001', msg: 'Esa cuota no está (o está archivada).' }) : { ok: b.fichas.length } }) }), p = pg.p;
    await ir(p, 'cuotas'); await wait(400);
    await p.click('#coachHost [data-gym="cuotas-tab"][data-v="sin_cuota"]'); await wait(200);
    await p.click('#coachHost [data-gym="cuota-pago"][data-id="' + F.A5 + '"]'); await wait(700);
    const sel = '#gymModal [data-gym-pg="cuotaId"]', val = k => p.$eval('#gymModal [data-gym-pg="' + k + '"]', i => i.value);
    t.has(await modalTxt(p), 'Sofía Ruiz', donde + ': la ventana con el socio');
    t.eq(await p.$$eval(sel + ' option', l => l.map(o => o.value)), ['', CM], donde + ': para elegir, solo las cuotas en uso (la archivada no)');
    t.ok(/Musculación/.test(await p.$eval(sel + ' option[value="' + CM + '"]', o => o.textContent)), donde + ': con su nombre');
    t.eq([await val('monto'), await val('hasta')], ['', ''], donde + ': sin elegir, ni monto ni «cubre hasta»');
    t.ok(await p.isDisabled('#gymModal [data-gym="pago-ok"]'), donde + ': sin cuota ni «cubre hasta», no se registra');
    await p.selectOption(sel, CM); await wait(300);
    t.eq([await val('monto'), await val('hasta')], ['30000', masMes(ymd(0))], donde + ': al elegirla, el monto de la cuota y cubre un mes desde hoy');
    t.ok(!await p.isDisabled('#gymModal [data-gym="pago-ok"]'), donde + ': y ya se puede registrar');
    await p.selectOption(sel, ''); await wait(300);
    t.eq([await val('monto'), await val('hasta')], ['', ''], donde + ': volver a «Sin cuota» borra el monto y «cubre hasta»');
    await p.selectOption(sel, CM); await wait(300);
    const cm = await contraste(p, '#gymModal .gy-modal');
    t.ok(cm.min >= 4.5, donde + ': la ventana con contraste de 4,5:1 o más (mínimo ' + cm.min + ': ' + cm.malos.slice(0, 4).join(' | ') + ')');
    if (vp === D){
      await p.click('#gymModal [data-gym="pago-ok"]'); await wait(800);
      t.ok(pg.dialogs.includes('Esa cuota no está (o está archivada).'), donde + ': si no se puede asignar, lo dice');
      t.eq(rpcs(pg.st, 'gym_pago_registrar').length, 0, donde + ': y no registra el pago');
    }
    await p.click('#gymModal [data-gym="pago-ok"]'); await wait(900);
    const orden = pg.st.rpcs.map(x => x[0]).filter(n => n === 'gym_cuota_asignar' || n === 'gym_pago_registrar');
    t.eq(orden, (vp === D ? ['gym_cuota_asignar'] : []).concat(['gym_cuota_asignar', 'gym_pago_registrar']), donde + ': primero asigna la cuota y después registra el pago');
    t.eq(rpcs(pg.st, 'gym_cuota_asignar').pop(), { fichas: [F.A5], tipo: CM, vence: null }, donde + ': gym_cuota_asignar con la cuota elegida (sin tocar el vencimiento)');
    t.eq(Object.assign({}, rpcs(pg.st, 'gym_pago_registrar')[0], { id: 'x' }), { id: 'x', ficha: F.A5, monto: 30000, medio: 'efectivo', fecha: hoyAR(), hasta: null, nota: null },
      donde + ': gym_pago_registrar con el monto de la cuota (lo que cubre lo calcula el servidor)');
    t.ok(/Listo: pago de Sofía Ruiz registrado/.test(await modalTxt(p)), donde + ': listo');
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ===== La recepción: cobra solo con el interruptor; el ingreso con la cuota vencida =====
  for (const cobra of [true, false]){
    const g = miGimnasio('recepcion', { plan: undefined, contadores: undefined, mis_fichas: undefined, mis_socios: undefined });
    g.settings = Object.assign({}, g.settings, { recepcion_cobra: cobra });
    let modo = 'aviso';
    const lista = () => busqueda().map(s => s.id === busqueda()[0].id ? Object.assign({}, s, { semaforo: 'rojo', motivo: 'Cuota vencida el ' + ddmm(ymd(-3)) }) : s);
    const pg = await entrar(base, RECEP, { gym: g, rol: 'client', nombre: 'Rocío Recepción', vp: M, touch: true,
      rpc: Object.assign(RPC(), { buscar_socio: () => lista(),
        gym_ingreso_manual: b => modo === 'bloquea' ? { id: null, result: 'cuota_vencida', bloqueado: true, repetido: false, vence: ymd(-3), at: new Date().toISOString() }
          : { id: b.id, result: 'cuota_vencida', repetido: false, at: new Date().toISOString() } }) });
    const p = pg.p, donde = cobra ? 'recepción que cobra' : 'recepción sin cobrar';
    await buscarRec(p, 'mart');
    await p.click('[data-rec="elegir"][data-id="' + F.A1 + '"]'); await wait(300);
    let r = await recTxt(p);
    t.has(r, 'Cuota vencida el ' + ddmm(ymd(-3)), donde + ': el semáforo dice que la cuota está vencida');
    t.ok(!/\$|monto|30\.000/i.test(r), donde + ': sin montos');
    t.eq(!!await p.$('.gy-rec-res [data-gym="cuota-pago"]'), cobra, donde + ': [Registrar pago] ' + (cobra ? 'sí' : 'no'));
    await p.click('.gy-rec-res [data-rec="ingreso"]'); await wait(600);
    t.has(await recTxt(p), 'pero la cuota está vencida', donde + ': registra y avisa que la cuota está vencida');
    modo = 'bloquea';
    await buscarRec(p, 'marti'); await p.click('[data-rec="elegir"][data-id="' + F.A1 + '"]'); await wait(200);
    await p.click('.gy-rec-res [data-rec="ingreso"]'); await wait(600);
    r = await recTxt(p);
    t.has(r, 'No se registró el ingreso: la cuota venció el ' + ddmm(ymd(-3)), donde + ': bloqueado: dice que no se registró');
    if (cobra){
      await captura(p, 'cuotas-recepcion-bloqueado-cel');
      await p.click('.gy-rec-res [data-gym="cuota-pago"]'); await wait(700);
      t.has(await modalTxt(p), 'Registrar pago', 'la recepción abre la ventana del pago');
      await p.click('#gymModal [data-gym="pago-ok"]'); await wait(700);
      t.eq(rpcs(pg.st, 'gym_pago_registrar').length, 1, 'y registra el pago');
      t.ok(rpcs(pg.st, 'buscar_socio').length >= 3, 'después del pago vuelve a buscar (el semáforo se actualiza)');
      t.ok(await sinScrollHorizontal(p), 'sin scroll de costado');
    }
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ===== Asistencia: «Cuota vencida» =====
  {
    const L = ingresosHoy(); L[0].resultado = 'cuota_vencida';
    const pg = await entrar(base, DUENA, { rpc: { gym_ingresos: () => L } }), p = pg.p;
    await ir(p, 'asistencia'); await wait(400);
    t.has(await hostTxt(p), 'Cuota vencida', 'Asistencia: el ingreso con la cuota vencida');
    t.eq(await p.$eval('.gy-tabla-ing .gy-sem', e => e.className.replace('gy-sem', '').trim()), 'rojo', 'en rojo');
    await pg.close();
  }

  // ===== El socio: web y apps =====
  const miCuota = estado => ({ estado, vence: estado === 'vencida' ? ymd(-3) : ymd(20), cuota: { name: 'Musculación', amount: 30000, months: 1 },
    pagos: [{ fecha: ymd(-10), monto: 30000, medio: 'efectivo', hasta: ymd(20) }] });
  for (const [plat, init] of [['web', ''], ['iPhone', IOS], ['Android', ANDROID]]){
    for (const estado of ['al_dia', 'vencida']){
      const pg = await entrarSocio(base, { init, vp: M, touch: true, rpc: { gym_mi_cuota: () => miCuota(estado) } }), p = pg.p;
      await p.click('#nav-config'); await wait(900);
      const txt = await gymCfgTxt(p), donde = plat + ', ' + estado;
      t.has(txt, estado === 'al_dia' ? 'Cuota Al día' : 'Cuota Vencida', donde + ': el estado de la cuota');
      t.has(txt, estado === 'al_dia' ? 'Paga hasta el ' + ddmm(ymd(20)) : 'Venció el ' + ddmm(ymd(-3)), donde + ': y la fecha');
      if (plat === 'web'){
        t.ok(/Musculación/.test(txt) && /\$\s?30\.000 por mes/.test(txt) && /Tus pagos/.test(txt) && /efectivo/.test(txt), donde + ': en la web, la cuota con su monto y los pagos: ' + txt);
      } else {
        t.ok(!/\$|30\.000|Musculación|Tus pagos|efectivo|pag[aá]r|precio/i.test(txt.replace(/Paga hasta/g, '')), donde + ': en la app, sin precios, montos ni pagos: ' + txt);
      }
      t.ok(!/mercado|link|http/i.test(txt) && !await p.$('#cfgGym a[href*="pag"]'), donde + ': ningún link para pagar');
      if (estado === 'vencida' && plat !== 'Android') await captura(p, 'cuotas-socio-' + plat.toLowerCase());
      t.eq(rpcs(pg.st, 'gym_mi_cuota').length, 1, donde + ': pide su cuota una vez');
      t.eq(pg.errs, [], donde + ': sin errores');
      await pg.close();
    }
  }
  {
    const pg = await entrarSocio(base, { vp: M, rpc: { gym_mi_cuota: () => ({ estado: null, vence: null, cuota: null, pagos: [] }) } }), p = pg.p;
    await p.click('#nav-config'); await wait(800);
    t.ok(!/cuota/i.test(await gymCfgTxt(p)), 'sin cuota: no se muestra nada de cuotas');
    await pg.close();
  }

  // ===== El profe: el semáforo con la cuota, sin montos =====
  {
    const pg = await entrarProfe(base, { vp: D, rpc: { gym_ficha_profe: () => fichaProfe({ semaforo: 'rojo', motivo: 'Cuota vencida el ' + ddmm(ymd(-3)), ingresos: [{ at: new Date().toISOString(), resultado: 'cuota_vencida' }] }) } }), p = pg.p;
    await p.click('[data-coach="view-clients"]'); await wait(600);
    await p.evaluate(id => document.querySelector('#coachHost [data-coach="open"][data-id="' + id + '"]').click(), S.A1); await wait(1200);
    await p.click('[data-coach="sec-open"][data-v="gimnasio"]'); await wait(400);
    const h = await hostTxt(p);
    t.ok(/Cuota vencida el/.test(h) && /con la cuota vencida/.test(h), 'el profe ve que la cuota está vencida (y cómo entró): ' + h.slice(0, 300));
    t.ok(!/\$|30\.000/.test(h), 'sin montos');
    t.has(h, 'Ves si la cuota está al día; los pagos', 'y que los pagos los ve la administración');
    t.eq(await p.$eval('#coachHost .cv-gymcard .gy-sem', e => e.className), 'gy-sem rojo', 'el semáforo en rojo');
    t.eq(pg.errs, [], 'el profe: sin errores');
    await pg.close();
  }
}
