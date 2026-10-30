// «Cobros» en el panel del coach (app/screens/coach/cobros.js, con supabase/cobros-coach.sql). SIN COBRO
// ONLINE: el coach anota lo que ya le pagaron.
// - Sin la base (cobros_resumen da 404 PGRST202), con el interruptor de la web apagado o con el coach sin
//   plan al día: no hay botón, ni tira en Inicio, ni tarjeta en la ficha, no se pide nada del panel del
//   gimnasio (módulos ni estilos), no se vuelve a preguntar al cambiar de pantalla y no hay errores.
// - Con la base: el botón «Cobros», la tira de Inicio sin montos, la pantalla con lo cobrado y lo que falta
//   cobrar, los chips con cuántos hay en cada estado (arranca en «Vencidas») y las filas con su semáforo.
//   «Cargar cuotas» manda {alumnos, monto, meses, vence} con los alumnos sin cuota tildados. «Anotar
//   cobro» trae el monto de la cuota y un «Cubre hasta» igual al del servidor; después de un error de red
//   el reintento manda el mismo id; «Listo…» y la lista se vuelve a leer. «Recordarle» abre el chat con el
//   texto ya escrito (nombre y fecha, sin montos), igual que el link de WhatsApp. La ficha en «Cuota»
//   (tocando la fila), su tarjeta y anular con el motivo. «Cobros del mes» y el CSV (BOM, «;» y columnas).
//   Escape cierra la ventana y el foco vuelve al botón.
// - Pasado un minuto se le vuelve a preguntar a la base; sin la base, recién a los 10 minutos.
// - El profe de un gimnasio que solo tiene socios no ve el botón ni se le pregunta a la base. El que tiene un
//   alumno propio lo ve, también en el celular de 320 px con Clases y Recepción, sin que los botones de
//   arriba le tapen el logo.
// Celular (320 y 390 px) y compu, Oscuro y Claro: sin scroll de costado, contraste de 4,5:1 y la ventana
// opaca.
import fs from 'node:fs';
import { wait, contraste } from './lib.mjs';
import { entrarProfe, alumnosProfe, miGimnasioProfe, PROPIO, ID, M, D, hostTxt, sinScrollHorizontal, rpcs } from './gym-comun.mjs';
import { hoyAR, ymd, ddmm, masMeses, MESES, mesHoy, A, NOMBRES, resumen, rpcCobros, entrarCoach, modalTxt, recursosGym, opaca } from './cobros-coach-comun.mjs';

const SIN_BASE = { error: 'PGRST202', msg: 'Could not find the function public.cobros_resumen without parameters in the schema cache', status: 404 };
const chatTxt = p => p.evaluate(() => { const t = document.getElementById('chatText'); return t ? t.value : null; });
async function irCobros(p){ await p.click('#coachHost [data-coach="cobros-ir"]'); await wait(900); }

export default async function ({ base, t }){
  // ===== Sin nada de Cobros: sin la base, con la web apagada o con el coach sin plan al día =====
  for (const [caso, res] of [['sin la base', SIN_BASE], ['web apagada', resumen({ interruptor: { web: false, android: true, ios: true } })],
    ['sin plan al día', { interruptor: { web: true, android: false, ios: false }, activo: false }], ['sin respuesta', null]]){
    const pg = await entrarCoach(base, { resumen: res, vp: D });
    const p = pg.p, nada = async donde => {
      t.eq(await p.$$eval('[data-coach="cobros-ir"], .cb-tira, #cobrosModal', l => l.length), 0, caso + ', ' + donde + ': sin botón, tira ni ventana de Cobros');
      t.ok(!/cobros/i.test(await hostTxt(p)), caso + ', ' + donde + ': no aparece «Cobros»');
    };
    await nada('Clientes');
    await p.click('#coachHost [data-coach="view-home"]'); await wait(400); await nada('Inicio');
    await p.click('#coachHost [data-coach="view-clients"]'); await wait(300);
    await p.click('#coachHost .co-trow[data-id="' + A.mar + '"]'); await wait(1500);
    t.eq(await p.$$eval('#coachHost [data-coach="sec-open"]', l => l.map(b => b.dataset.v)), ['chat', 'ficha', 'habitos'], caso + ': la ficha sin la tarjeta «Cuota»');
    await p.click('#coachHost [data-coach="back"]'); await wait(400);
    t.eq(rpcs(pg.st, 'cobros_resumen').length, 1, caso + ': se le pregunta una sola vez a la base (no en cada pantalla)');
    // Pasado un minuto se vuelve a preguntar; sin la base (la función no existe), recién a los 10 minutos.
    const correr = ms => p.evaluate(async ms => { const c = (await import('/app/screens/coach/cobros.js')).CB; c.t -= ms; c.sinBase -= ms; }, ms);
    const sinBase = res === SIN_BASE;
    await correr(61e3); await p.click('#coachHost [data-coach="view-home"]'); await wait(400);
    t.eq(rpcs(pg.st, 'cobros_resumen').length, sinBase ? 1 : 2, caso + (sinBase ? ': pasado un minuto, todavía no se vuelve a preguntar' : ': pasado un minuto, se vuelve a preguntar'));
    await correr(540e3); await p.click('#coachHost [data-coach="view-clients"]'); await wait(400);
    t.eq(rpcs(pg.st, 'cobros_resumen').length, sinBase ? 2 : 3, caso + ': pasados 10 minutos, se vuelve a preguntar');
    await nada('Clientes, después de volver a preguntar');
    t.eq(rpcs(pg.st, 'cobros_alumno').length + rpcs(pg.st, 'cobros_mes').length, 0, caso + ': nada más de Cobros');
    t.eq(await recursosGym(p), [], caso + ': no se pide nada del panel del gimnasio (módulos ni estilos)');
    t.eq(pg.errs, [], caso + ': sin errores en la página');
    await pg.close();
  }

  // ===== Con la base: la pantalla en el celular y en la compu, Oscuro y Claro =====
  for (const [vp, tema] of [[D, 'oscuro'], [M, 'claro'], [{ width: 320, height: 640 }, 'oscuro'], [D, 'claro'], [M, 'oscuro']]){
    const donde = (vp === D ? 'compu' : 'celular ' + vp.width) + ', ' + tema;
    const pg = await entrarCoach(base, { vp, tema, touch: vp !== D }), p = pg.p;
    t.ok(await p.isVisible('#coachHost [data-coach="cobros-ir"]'), donde + ': el botón «Cobros» en la barra');
    // Inicio: la tira, sin montos.
    await p.click('#coachHost [data-coach="view-home"]'); await wait(400);
    const tira = await p.$eval('#coachHost .cb-tira', e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
    t.eq(tira, 'Cobros 1 vencida · 1 por vencer ›', donde + ': la tira de Inicio');
    await p.click('#coachHost .cb-tira [data-coach="cobros-ir"]'); await wait(900);
    let h = await hostTxt(p);
    t.ok(/Cobros/.test(h) && /GIZE no cobra: lo anotás vos cuando te pagan/.test(h), donde + ': la tira lleva a Cobros, que dice que GIZE no cobra');
    t.has(h, 'Cobrado en ' + MESES[Number(hoyAR().slice(5, 7)) - 1], donde + ': lo cobrado en el mes');
    t.ok(/\$\s?150\.000/.test(h) && /5 cobros/.test(h) && /\$\s?70\.000/.test(h) && /3 alumnos este mes/.test(h), donde + ': cobrado y por cobrar, con cuántos');
    const chips = await p.$$eval('#coachHost [data-coach="cobros-tab"]', l => l.map(b => [b.dataset.v, b.innerText.replace(/\s+/g, ' ').trim(), b.getAttribute('aria-pressed')]));
    t.eq(chips, [['vencida', 'Vencidas 1', 'true'], ['por_vencer', 'Por vencer 1', 'false'], ['sin_pagos', 'Sin pagos 1', 'false'], ['al_dia', 'Al día 1', 'false'],
      ['sin_cuota', 'Sin cuota 1', 'false'], ['todos', 'Todos 5', 'false']], donde + ': los chips con cuántos hay; arranca en «Vencidas»');
    t.eq(await p.$$eval('#coachHost .gy-row[data-coach="cobros-abrir"]', l => l.map(r => r.dataset.id)), [A.juan], donde + ': en «Vencidas», solo Juan');
    t.has(h, ddmm(ymd(-3)), donde + ': con su vencimiento');
    await p.click('#coachHost [data-coach="cobros-tab"][data-v="todos"]'); await wait(300);
    h = await hostTxt(p);
    t.ok(Object.values(NOMBRES).every(n => h.includes(n)), donde + ': «Todos»: los cinco');
    t.eq(await p.$$eval('#coachHost .gy-tabla-cuotas .gy-sem', l => l.map(e => e.className.replace('gy-sem', '').trim())), ['rojo', 'ambar', 'verde', 'ambar'], donde + ': el semáforo de Cuotas');
    t.eq(await p.$$eval('#coachHost .gy-tabla-cuotas [data-coach="cobro-recordar"]', l => l.map(b => b.dataset.id)), [A.juan, A.luc, A.raul], donde + ': «Recordarle» en vencidas, por vencer y sin pagos');
    t.ok(await p.$('#coachHost [data-coach="cobro-cuota"][data-id="' + A.sof + '"]'), donde + ': sin cuota, «Cargar cuota» en vez de «Anotar cobro»');
    if (vp !== D) t.ok(await sinScrollHorizontal(p), donde + ': sin scroll de costado');
    let c = await contraste(p, '#coachHost .cv-main');
    t.ok(c.min >= 4.5, donde + ': la pantalla con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    // La ventana «Anotar cobro»: opaca, sin scroll de costado y con contraste.
    await p.click('#coachHost [data-coach="cobro-anotar"][data-id="' + A.luc + '"]'); await wait(500);
    t.ok(await p.isVisible('#cobrosModal .gy-modal'), donde + ': se abre «Anotar cobro»');
    t.ok(await opaca(p, '#cobrosModal .gy-modal'), donde + ': la ventana es opaca');
    if (vp !== D) t.ok(await sinScrollHorizontal(p), donde + ': la ventana sin scroll de costado');
    c = await contraste(p, '#cobrosModal .gy-modal');
    t.ok(c.min >= 4.5, donde + ': la ventana con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    await p.keyboard.press('Escape'); await wait(300);
    t.ok(!(await p.$('#cobrosModal')), donde + ': Escape cierra la ventana');
    // «Cobros del mes»
    await p.click('#coachHost [data-coach="cobros-parte"][data-v="mes"]'); await wait(700);
    if (vp !== D) t.ok(await sinScrollHorizontal(p), donde + ': «Cobros del mes» sin scroll de costado');
    c = await contraste(p, '#coachHost .cv-main');
    t.ok(c.min >= 4.5, donde + ': «Cobros del mes» con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    t.eq(pg.errs, [], donde + ': sin errores en la página');
    await pg.close();
  }

  // ===== Cargar cuotas, anotar un cobro, recordarle, la ficha, el mes y el CSV (compu) =====
  {
    const reg = [];
    const pg = await entrarCoach(base, { vp: D, handlers: {
      // La primera vez se corta la red: el reintento tiene que mandar el mismo id.
      '/rpc/cobro_registrar': (r, J, i) => { const b = JSON.parse(i.body || '{}'); reg.push(b);
        if (reg.length === 1) return r.abort('internetdisconnected');
        return J({ id: b.id, desde: ymd(0), hasta: masMeses(ymd(0), 1), repetido: reg.length > 2 }); },
    } }), p = pg.p, st = pg.st;
    await irCobros(p);
    const leidas = rpcs(st, 'cobros_resumen').length;
    // Cargar cuotas: vienen tildados los que no tienen cuota.
    await p.click('#coachHost [data-coach="cobros-cargar"]'); await wait(500);
    t.has(await modalTxt(p), 'Cargar cuotas', 'cargar: se abre la ventana');
    const tildados = () => p.$$eval('#cobrosModal [data-cb="al"]', l => l.filter(x => x.checked).map(x => x.value));
    t.eq(await tildados(), [A.sof], 'cargar: viene tildada la que no tiene cuota');
    t.ok(await p.$eval('#cobrosModal [data-coach="cobro-cuotas-ok"]', b => b.disabled), 'cargar: sin monto, «Guardar» no se puede tocar');
    await p.click('#cobrosModal [data-cb="todos"]'); await wait(200);
    t.eq((await tildados()).length, 5, 'cargar: «Elegir todos» los tilda a todos');
    await p.click('#cobrosModal [data-cb="todos"]'); await wait(200);
    t.eq(await tildados(), [], 'cargar: y los destilda');
    await p.click('#cobrosModal [data-cb="al"][value="' + A.sof + '"]'); await wait(150);
    await p.click('#cobrosModal [data-cb="al"][value="' + A.raul + '"]'); await wait(150);
    await p.fill('#cobrosModal [data-cb="monto"]', '22000');
    await p.selectOption('#cobrosModal [data-cb="meses"]', '3');
    await p.click('#cobrosModal [data-coach="cobro-cuotas-ok"]'); await wait(700);
    t.eq(rpcs(st, 'cobro_cuota_guardar'), [{ alumnos: [A.sof, A.raul], monto: 22000, meses: 3, vence: null }], 'cargar: manda los alumnos, el monto, cada cuánto y sin «ya están al día»');
    t.has(await modalTxt(p), 'Listo: 2 alumnos quedaron con su cuota.', 'cargar: «Listo»');
    t.ok(rpcs(st, 'cobros_resumen').length > leidas, 'cargar: la lista se vuelve a leer');
    await p.click('#cobrosModal .gy-acc [data-coach="cobro-cerrar"]'); await wait(300);
    t.ok(!(await p.$('#cobrosModal')), 'cargar: «Listo» cierra la ventana');

    // Anotar cobro: Juan, con la cuota vencida (cubre desde hoy).
    await p.click('#coachHost [data-coach="cobro-anotar"][data-id="' + A.juan + '"]'); await wait(500);
    let m = await modalTxt(p);
    t.ok(/Juan Pérez/.test(m) && /vence el/.test(m), 'anotar: el alumno y su vencimiento');
    t.eq(await p.inputValue('#cobrosModal [data-cb="monto"]'), '25000', 'anotar: trae el monto de su cuota');
    t.eq(await p.inputValue('#cobrosModal [data-cb="fecha"]'), hoyAR(), 'anotar: con la fecha de hoy');
    t.eq(await p.getAttribute('#cobrosModal [data-cb="fecha"]', 'max'), hoyAR(), 'anotar: no se puede poner una fecha futura');
    t.eq(await p.inputValue('#cobrosModal [data-cb="hasta"]'), masMeses(hoyAR(), 1), 'anotar: vencida, cubre desde hoy un mes (como el servidor)');
    t.eq(await p.$eval('#cobrosModal [data-cb="medio"]:checked', x => x.value), 'transferencia', 'anotar: viene marcada «Transferencia»');
    t.eq(await p.$$eval('#cobrosModal [data-cb="medio"]', l => l.map(x => x.value)), ['transferencia', 'efectivo', 'otro'], 'anotar: los medios, sin Mercado Pago');
    // Con otra fecha, «Cubre hasta» se vuelve a calcular.
    await p.fill('#cobrosModal [data-cb="fecha"]', ymd(-1)); await wait(150);
    t.eq(await p.inputValue('#cobrosModal [data-cb="hasta"]'), masMeses(ymd(-1), 1), 'anotar: otra fecha, otro «Cubre hasta»');
    await p.fill('#cobrosModal [data-cb="fecha"]', hoyAR()); await wait(150);
    await p.check('#cobrosModal [data-cb="medio"][value="efectivo"]'); await wait(100);
    await p.fill('#cobrosModal [data-cb="nota"]', 'en mano');
    await p.click('#cobrosModal [data-coach="cobro-ok"]'); await wait(900);
    t.ok(pg.dialogs.some(x => /revisá tu conexión/.test(x)), 'anotar: sin red, avisa: ' + pg.dialogs.join(' | '));
    t.ok(await p.isVisible('#cobrosModal [data-coach="cobro-ok"]'), 'anotar: la ventana sigue abierta para reintentar');
    const antes = rpcs(st, 'cobros_resumen').length;
    await p.click('#cobrosModal [data-coach="cobro-ok"]'); await wait(900);
    t.eq(reg.length, 2, 'anotar: dos intentos');
    t.ok(reg[0] && reg[1] && reg[0].id && reg[0].id === reg[1].id, 'anotar: el reintento manda el mismo id');
    t.eq(reg[1] && Object.assign({}, reg[1], { id: 'x' }), { id: 'x', alumno: A.juan, monto: 25000, medio: 'efectivo', fecha: hoyAR(), hasta: null, nota: 'en mano' }, 'anotar: lo que manda');
    t.has(await modalTxt(p), 'Listo: Juan queda al día hasta el ' + ddmm(masMeses(ymd(0), 1)) + '.', 'anotar: «Listo»');
    t.ok(rpcs(st, 'cobros_resumen').length > antes, 'anotar: la lista se vuelve a leer');
    // Tocar «Listo» dos veces no anota otro.
    await p.click('#cobrosModal .gy-acc [data-coach="cobro-cerrar"]'); await wait(300);
    t.eq(reg.length, 2, 'anotar: cerrar no anota de nuevo');
    // Lucía, por vencer y trimestral: cubre desde su vencimiento, tres meses.
    await p.click('#coachHost [data-coach="cobros-tab"][data-v="por_vencer"]'); await wait(300);
    await p.click('#coachHost [data-coach="cobro-anotar"][data-id="' + A.luc + '"]'); await wait(500);
    t.eq(await p.inputValue('#cobrosModal [data-cb="hasta"]'), masMeses(ymd(5), 3), 'anotar: por vencer, desde su vencimiento más los meses de la cuota');
    // Escape cierra y el foco vuelve al botón que la abrió.
    await p.keyboard.press('Escape'); await wait(300);
    t.eq(await p.evaluate(() => document.activeElement && [document.activeElement.dataset.coach, document.activeElement.dataset.id]), ['cobro-anotar', A.luc], 'Escape: el foco vuelve a «Anotar cobro»');

    // Recordarle: el chat con el texto ya escrito, sin montos.
    await p.click('#coachHost [data-coach="cobros-tab"][data-v="vencida"]'); await wait(300);
    const wa = await p.$eval('#coachHost [data-coach="cobro-wa"]', a => [a.getAttribute('href'), a.target]).catch(() => ['', '']);
    await p.click('#coachHost [data-coach="cobro-recordar"][data-id="' + A.juan + '"]'); await wait(800);
    const txtChat = 'Hola Juan, te recuerdo que tu cuota venció el ' + ddmm(ymd(-3)) + '. Cualquier cosa avisame.';
    t.eq(await chatTxt(p), txtChat, 'recordarle: abre el chat con el texto ya escrito');
    t.ok(await p.$eval('#chatHost .ch-send', b => b.dataset.chat === 'send').catch(() => false), 'recordarle: listo para mandar (no se manda solo)');
    t.eq(pg.calls.filter(x => /rapid-worker|notificar-cliente/.test(x)), [], 'recordarle: no se mandó nada');
    t.eq(wa[0], 'https://wa.me/?text=' + encodeURIComponent(txtChat), 'recordarle: «Por WhatsApp» con el mismo texto (el coach elige el contacto)');
    t.eq(wa[1], '_blank', 'recordarle: WhatsApp en otra pestaña');
    t.ok(!/\$|25\.?000/.test(decodeURIComponent(wa[0])) && !/\$|25\.?000/.test(txtChat), 'recordarle: sin montos');
    await p.click('#chatHost [data-chat="close"]'); await wait(400);

    // Tocar la fila: la ficha en «Cuota».
    await p.click('#coachHost [data-coach="cobros-tab"][data-v="al_dia"]'); await wait(300);
    await p.click('#coachHost .gy-row[data-id="' + A.mar + '"] .gy-td-socio'); await wait(1800);
    let h = await hostTxt(p);
    t.ok(/Martina Sosa/.test(h) && /Cuota/.test(h) && /\$\s?25\.000 por mes/.test(h), 'ficha: abre en «Cuota» con su cuota: ' + h.slice(0, 200));
    t.ok(/Cambiar/.test(h) && /Anotar cobro/.test(h) && /Sacar la cuota/.test(h), 'ficha: cambiar, anotar y sacar la cuota');
    t.ok(/Pagó junto con la remera/.test(h) && /Anulado: Repetido/.test(h), 'ficha: el historial, con el anulado y su motivo');
    t.eq(rpcs(st, 'cobros_alumno'), [{ alumno: A.mar }], 'ficha: lee sus cobros');
    t.eq(await p.$$eval('#coachHost .gy-pagos [data-coach="cobro-anular"]', l => l.map(b => b.dataset.id)), [ID('b1')], 'ficha: «Anular» solo en el que no está anulado');
    p.contestar = q => q.tipo === 'pedir' ? 'Lo cargué mal' : true;
    await p.click('#coachHost [data-coach="cobro-anular"][data-id="' + ID('b1') + '"]'); await wait(800);
    t.eq(rpcs(st, 'cobro_anular'), [{ id: ID('b1'), motivo: 'Lo cargué mal' }], 'ficha: anular manda el motivo');
    t.ok(pg.preguntas.some(q => q.tipo === 'pedir' && /Anular este cobro/.test(q.texto) && q.peligro), 'ficha: pregunta antes de anular');
    t.ok(rpcs(st, 'cobros_alumno').length >= 2, 'ficha: después de anular, se vuelve a leer');
    // La tarjeta de la ficha.
    await p.click('#coachHost [data-coach="sec-close"]'); await wait(400);
    t.eq(await p.$$eval('#coachHost [data-coach="sec-open"]', l => l.map(b => b.dataset.v)), ['chat', 'cuota', 'ficha', 'habitos'], 'ficha: la tarjeta «Cuota» después del chat');
    t.eq(await p.$eval('#coachHost [data-coach="sec-open"][data-v="cuota"] .ptile-s', e => e.innerText.trim()).catch(() => ''), 'Al día hasta el ' + ddmm(ymd(20)), 'ficha: la tarjeta dice hasta cuándo');
    // Volver: a Cobros.
    await p.click('#coachHost [data-coach="back"]'); await wait(500);
    t.ok(await p.$('#coachHost [data-coach="cobros-parte"]'), 'ficha: «Volver» lleva a Cobros');

    // Cobros del mes y el CSV.
    await p.click('#coachHost [data-coach="cobros-parte"][data-v="mes"]'); await wait(700);
    h = await hostTxt(p);
    t.eq(rpcs(st, 'cobros_mes')[0], { mes: mesHoy() }, 'mes: pide el mes de hoy');
    t.ok(/Pablo Viejo/.test(h) && /ya no es tu alumno/.test(h), 'mes: con los cobros de un ex alumno, marcado');
    t.ok(/Anulado: Repetido/.test(h) && await p.$('#coachHost .gy-pago-anulado s'), 'mes: el anulado, tachado');
    t.ok(/Cobrado: \$\s?43\.000 · 2 cobros/.test(h), 'mes: lo cobrado sin los anulados');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#coachHost [data-coach="cobros-csv"]')]);
    const crudo = dl ? fs.readFileSync(await dl.path(), 'utf8') : '';
    t.ok(dl && dl.suggestedFilename() === 'cobros-' + hoyAR().slice(0, 7) + '.csv', 'csv: el nombre del archivo: ' + (dl && dl.suggestedFilename()));
    t.ok(crudo.startsWith('﻿'), 'csv: con BOM (Excel lo abre con las tildes bien)');
    const csv = crudo.replace(/^﻿/, '').split('\r\n');
    t.eq(csv[0], 'fecha;alumno;monto;medio;cubre_desde;cubre_hasta;nota;anulado;motivo;ex_alumno', 'csv: el encabezado');
    t.eq(csv[1], ymd(0) + ';Martina Sosa;25000;Transferencia;' + ymd(0) + ';' + masMeses(ymd(0), 1) + ";'=1+1;no;;no", 'csv: una fila por cobro, sin fórmulas');
    t.ok(/;sí;Repetido;no$/.test(csv[3] || ''), 'csv: el anulado con su motivo: ' + csv[3]);
    t.ok(/Pablo Viejo.*;sí$/.test(csv[2] || ''), 'csv: el ex alumno marcado: ' + csv[2]);
    // El mes anterior.
    await p.click('#coachHost [data-coach="cobros-mes"][data-v="-1"]'); await wait(600);
    t.eq(rpcs(st, 'cobros_mes').map(x => x.mes).pop(), masMeses(mesHoy(), -1), 'mes: ‹ pide el mes anterior');
    t.has(await hostTxt(p), MESES[Number(masMeses(mesHoy(), -1).slice(5, 7)) - 1].replace(/^./, x => x.toUpperCase()), 'mes: con su nombre');
    t.ok(await p.$eval('#coachHost [data-coach="cobros-mes"][data-v="1"]', b => !b.disabled), 'mes: desde un mes pasado se puede volver');
    await p.click('#coachHost [data-coach="cobros-mes"][data-v="1"]'); await wait(500);
    t.ok(await p.$eval('#coachHost [data-coach="cobros-mes"][data-v="1"]', b => b.disabled), 'mes: no se puede ir a un mes que no llegó');
    t.eq(pg.errs, [], 'sin errores en la página');
    await pg.close();
  }

  // ===== La primera vez: sin cuotas cargadas =====
  {
    const al = resumen().alumnos.map(a => Object.assign({}, a, { cuota: null, vence: null, estado: null }));
    const pg = await entrarCoach(base, { vp: M, resumen: resumen({ alumnos: al, cobrado: 0, cobros_mes: 0, por_cobrar: 0, alumnos_por_cobrar: 0, conteo: { al_dia: 0, por_vencer: 0, vencida: 0, sin_pagos: 0, sin_cuota: 5 } }) }), p = pg.p;
    await p.click('#coachHost [data-coach="view-home"]'); await wait(400);
    t.ok(!(await p.$('#coachHost .cb-tira')), 'primera vez: sin tira en Inicio (no hay vencidas)');
    await irCobros(p);
    const h = await hostTxt(p);
    t.ok(/Anotá cuánto te paga cada alumno/.test(h) && /GIZE no cobra ni hace facturas: lo anotás vos cuando te pagan\./.test(h), 'primera vez: qué es y que GIZE no cobra');
    await p.click('#coachHost .cb-primera [data-coach="cobros-cargar"]'); await wait(500);
    t.eq((await p.$$eval('#cobrosModal [data-cb="al"]', l => l.filter(x => x.checked).length)), 5, 'primera vez: «Cargar cuotas» con todos tildados');
    t.eq(pg.errs, [], 'primera vez: sin errores');
    await pg.close();
  }

  // ===== El profe de un gimnasio que solo tiene socios: nada de Cobros =====
  {
    const pg = await entrarProfe(base, { alumnos: alumnosProfe(false), vp: D, rpc: rpcCobros() });
    const b = await pg.p.$('[data-onb="done"]'); if (b) { await b.click(); await wait(400); }
    await wait(500);
    t.eq(await pg.p.$$eval('[data-coach="cobros-ir"], .cb-tira', l => l.length), 0, 'profe solo con socios: sin «Cobros»');
    t.eq(rpcs(pg.st, 'cobros_resumen').length, 0, 'profe solo con socios: no se le pregunta a la base');
    t.eq(pg.errs, [], 'profe solo con socios: sin errores');
    await pg.close();
  }

  // ===== El profe de un gimnasio con un alumno propio, en el celular: Cobros, sin tapar el logo =====
  // Con Clases, Recepción y Cobros arriba, los botones van más juntos (css/screens/coach/panel.css).
  for (const w of [320, 360]){
    const al = [{ id: PROPIO.id, nombre: PROPIO.full_name, avatar_path: null, cuota: { monto: 30000, meses: 1 }, vence: null, estado: 'sin_pagos', ultimo_cobro: null }];
    const pg = await entrarProfe(base, { vp: { width: w, height: 640 }, touch: true, gym: miGimnasioProfe({ settings: { profes_recepcion: true } }),
      rpc: rpcCobros({ resumen: resumen({ alumnos: al, conteo: { al_dia: 0, por_vencer: 0, vencida: 0, sin_pagos: 1, sin_cuota: 0 } }) }) }), p = pg.p;
    const b = await p.$('[data-onb="done"]'); if (b) { await b.click(); await wait(400); }
    const q = 'profe con un alumno propio, celular ' + w;
    t.ok(await p.isVisible('#coachHost [data-coach="cobros-ir"]') && await p.isVisible('#coachHost [data-coach="gym-recepcion"]'), q + ': «Cobros» junto a Clases y Recepción');
    const [logo, util] = await p.evaluate(() => ['#coachHost .cv-brand .brand-logo', '#coachHost .cv-util'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }));
    t.ok(util[0] >= logo[1], q + ': los botones de arriba no tapan el logo (logo hasta ' + logo[1] + ', botones desde ' + util[0] + ')');
    t.ok(await sinScrollHorizontal(p), q + ': sin scroll de costado');
    await irCobros(p);
    t.eq(await p.$$eval('#coachHost .gy-row[data-coach="cobros-abrir"]', l => l.map(r => r.dataset.id)), [PROPIO.id], q + ': en Cobros, su alumno propio');
    t.eq(pg.errs, [], q + ': sin errores');
    await pg.close();
  }
}
