// Gimnasios, etapa 1 (parte 4): Asistencia del panel del gimnasio (SPEC §2.7; app/screens/gym/asistencia.js).
// - Los ingresos de hoy (gym_ingresos con la fecha de hoy en Argentina): hora, socio, «Manual», el estado
//   al entrar con su color y quién lo registró. Sin montos.
// - Vacía: «Cuando registres ingresos en la recepción, los vas a ver acá.» y Exportar deshabilitado.
// - [Abrir recepción] va a la recepción; [Ingreso manual] abre la recepción en una ventana: registra y la
//   lista de hoy se vuelve a leer.
// - [Exportar CSV]: separado por punto y coma, con BOM, una fila por ingreso.
// Celular y compu, Oscuro y Claro (capturas en GYM_CAPTURAS).
import { wait } from './lib.mjs';
import { entrar, DUENA, ADMIN_G, miGimnasio, F, M, D, ir, hostTxt, modalTxt, rpcs, ingresosHoy, busqueda, buscarRec, captura, sinScrollHorizontal } from './gym-comun.mjs';

const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default async function ({ base, t }){
  for (const [vp, tema] of [[D, 'oscuro'], [M, 'claro'], [D, 'claro'], [M, 'oscuro']]){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    let lista = ingresosHoy();
    const pg = await entrar(base, DUENA, { vp, tema, touch: vp === M,
      rpc: { gym_ingresos: () => lista, buscar_socio: () => busqueda(),
        gym_ingreso_manual: b => { const e = { id: b.id, result: 'ok', repetido: false, at: new Date().toISOString() };
          lista = [{ id: b.id, at: e.at, ficha: b.ficha, nombre: 'Martina Sosa', metodo: 'manual', resultado: 'ok', por: 'Carla Dueña' }].concat(lista); return e; } } });
    const p = pg.p;
    await ir(p, 'asistencia'); await wait(400);
    let h = await hostTxt(p);
    t.eq(rpcs(pg.st, 'gym_ingresos').map(b => b.desde), [hoyAR()], donde + ': pide los ingresos de hoy (fecha de Argentina)');
    t.ok(/Asistencia/.test(h) && /3 ingresos hoy/.test(h), donde + ': el título dice cuántos hubo hoy');
    t.ok(/09:05/.test(h) && /Martina Sosa/.test(h) && /Manual/.test(h) && /Rocío Recepción/.test(h), donde + ': hora, socio, «Manual» y quién lo registró');
    t.ok(/Activo/.test(h) && /Pausado/.test(h), donde + ': el estado al entrar');
    t.eq(await p.$$eval('.gy-tabla-ing .gy-sem', l => l.map(e => e.className.replace('gy-sem', '').trim())), ['verde', 'ambar', 'verde'], donde + ': con su color');
    t.ok(!/\$|monto|cuota/i.test(h), donde + ': sin montos');
    t.ok(/Abrir recepción/.test(h) && /Ingreso manual/.test(h) && /Exportar CSV/.test(h), donde + ': las tres acciones');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': sin scroll horizontal');
    await captura(p, 'asistencia-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    // Exportar CSV.
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#coachHost [data-gym="asis-csv"]')]);
    const csv = (await import('node:fs')).readFileSync(await dl.path(), 'utf8');
    t.eq(dl.suggestedFilename(), 'ingresos-' + hoyAR() + '.csv', donde + ': el nombre del archivo con la fecha');
    const filas = csv.replace(/^﻿/, '').split('\r\n');
    t.eq(filas[0], 'fecha;hora;socio;metodo;estado;registro', donde + ': CSV con encabezado, punto y coma y BOM');
    t.eq(filas.length, 4, donde + ': una fila por ingreso');
    t.eq(filas[1], hoyAR() + ';09:05;Martina Sosa;Manual;Activo;Rocío Recepción', donde + ': la primera fila');
    // Ingreso manual: la recepción en una ventana.
    await p.click('#coachHost [data-gym="ingreso-manual"]'); await wait(400);
    t.has(await modalTxt(p), 'Ingreso manual', donde + ': abre la ventana');
    t.ok(await p.evaluate(() => document.activeElement && document.activeElement.matches('#gymModal input[data-rec-q]')), donde + ': con el foco en el buscador');
    await buscarRec(p, 'mart');
    await p.click('#gymModal [data-rec="elegir"][data-id="' + F.A1 + '"]'); await wait(200);
    t.ok(!/Cargar ficha|Solicitudes/.test(await modalTxt(p)), donde + ': la ventana es la recepción compacta (sin altas)');
    if (tema === 'oscuro') await captura(p, 'asistencia-ingreso-manual-' + (vp === M ? 'cel' : 'compu'));
    await p.click('#gymModal [data-rec="ingreso"]'); await wait(700);
    t.has(await modalTxt(p), 'Ingreso registrado a las', donde + ': registra');
    t.eq(rpcs(pg.st, 'gym_ingreso_manual').length, 1, donde + ': una vez');
    await p.click('#gymModal .gy-x'); await wait(400);
    h = await hostTxt(p);
    t.ok(/4 ingresos hoy/.test(h), donde + ': al cerrar, la lista de hoy ya tiene el ingreso nuevo');
    t.ok(rpcs(pg.st, 'gym_ingresos').length >= 2, donde + ': volvió a leer los ingresos');
    // Abrir recepción.
    await p.click('#coachHost .gy-head [data-gym="ir"][data-v="recepcion"]'); await wait(500);
    t.ok(!!await p.$('#coachHost input[data-rec-q]'), donde + ': [Abrir recepción] va a la recepción');
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // Vacía, y la administración igual.
  for (const [user, rol] of [[DUENA, 'owner'], [ADMIN_G, 'admin']]){
    const pg = await entrar(base, user, { gym: miGimnasio(rol), rol: rol === 'admin' ? 'client' : 'coach', vp: D, rpc: { gym_ingresos: () => [] } });
    await ir(pg.p, 'asistencia'); await wait(400);
    const h = await hostTxt(pg.p);
    t.has(h, 'Cuando registres ingresos en la recepción, los vas a ver acá.', rol + ': vacía, el texto de §2.7');
    t.ok(await pg.p.$eval('#coachHost [data-gym="asis-csv"]', b => b.disabled), rol + ': sin ingresos, no se exporta');
    if (rol === 'owner') await captura(pg.p, 'asistencia-vacia-compu');
    await pg.close();
  }
  // Sin conexión: el error y [Reintentar].
  {
    let falla = true;
    const pg = await entrar(base, DUENA, { vp: M, rpc: { gym_ingresos: () => falla ? { error: 'red', msg: 'Failed', status: 503 } : ingresosHoy() } });
    await ir(pg.p, 'asistencia'); await wait(400);
    t.has(await hostTxt(pg.p), 'No se pudo: revisá tu conexión y probá de nuevo.', 'sin conexión: lo dice');
    falla = false;
    await pg.p.click('#coachHost [data-gym="reintentar"]'); await wait(600);
    t.has(await hostTxt(pg.p), '3 ingresos hoy', 'Reintentar vuelve a leer');
    await pg.close();
  }
}
