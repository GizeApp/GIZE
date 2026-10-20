// Gimnasios, etapa 1: Socios (SPEC §2.3, sin cuotas). La lista de gym_socios_resumen con sus columnas
// (profe, «Sin profe», «Coach externo», último ingreso, último entreno solo si lo manda el servidor, apto
// médico, estado), las pestañas Socios · Solicitudes · Bajas, los filtros y el buscador, las acciones en
// grupo (asignar profe con las saltadas y su motivo, pausar, exportar CSV) y «Sumar socio»: el código,
// su link y el QR, y cargar una ficha sin app con el link #unirme para mandarle por WhatsApp.
import fs from 'node:fs';
import { wait } from './lib.mjs';
import { entrar, DUENA, F, TOKEN, hostTxt, modalTxt, rpcs, ir } from './gym-comun.mjs';

const nombres = p => p.$$eval('#coachHost .gy-tabla .gy-row:not(.gy-th) .gy-socio-t b', l => l.map(x => x.textContent));

export default async function ({ base, t }){
  const pg = await entrar(base, DUENA), p = pg.p;
  await ir(p, 'socios');
  let txt = await hostTxt(p);
  t.eq(await nombres(p), ['Martina Sosa', 'Juan Pérez', 'Lucía Gómez', 'Raúl Díaz', 'Sofía Ruiz', 'Pedro Álvarez'], 'Socios: activos y pausados (sin las bajas)');
  for (const s of ['Socios 6', 'Solicitudes 2', 'Bajas 1', 'Sin profe', 'Coach externo', 'Pausado hasta el', 'último entreno', 'apto médico', 'falta confirmación', 'sin app', 'foto pendiente'])
    t.has(txt.toLowerCase(), s.toLowerCase(), 'Socios: «' + s + '»');
  const fila = n => p.evaluate(n => { const r = [...document.querySelectorAll('#coachHost .gy-row')].find(x => x.innerText.includes(n)); return r ? r.innerText.replace(/\s+/g, ' ') : ''; }, n);
  t.has(await fila('Sofía Ruiz'), 'Coach externo', 'coach de afuera: «Coach externo», sin nombre');
  t.ok(!/Ayer.*Ayer/.test(await fila('Juan Pérez')) && /Hace 20 días —/.test(await fila('Juan Pérez')), 'último entreno «—» si el servidor no lo manda (no compartió ni es suyo)');
  // Filtros
  const filtro = async k => { await p.click('#coachHost [data-gym="filtro"][data-k="' + k + '"]'); await wait(250); };
  await filtro('sinProfe'); t.eq(await nombres(p), ['Lucía Gómez'], 'filtro «Sin profe»'); await filtro('sinProfe');
  await filtro('externo'); t.eq(await nombres(p), ['Sofía Ruiz'], 'filtro «Coach externo»'); await filtro('externo');
  await filtro('faltaConf'); t.eq(await nombres(p), ['Pedro Álvarez'], 'filtro «Falta confirmación»'); await filtro('faltaConf');
  await filtro('sinApp'); t.eq(await nombres(p), ['Raúl Díaz'], 'filtro «Sin app»'); await filtro('sinApp');
  await filtro('noViene'); t.eq(await nombres(p), ['Juan Pérez', 'Lucía Gómez', 'Pedro Álvarez'], 'filtro «No viene hace 14 días» (o nunca)'); await filtro('noViene');
  await filtro('mios'); t.eq(await nombres(p), ['Pedro Álvarez'], 'filtro «Mis socios» (los de la dueña como profe)'); await filtro('mios');
  await p.selectOption('#coachHost [data-gym-in="estado"]', 'pausado'); await wait(250);
  t.eq(await nombres(p), ['Juan Pérez'], 'filtro por estado'); await p.selectOption('#coachHost [data-gym-in="estado"]', ''); await wait(200);
  await p.fill('#coachHost [data-gym-in="q"]', '555444'); await wait(250);
  t.eq(await nombres(p), ['Juan Pérez'], 'buscador por DNI');
  t.eq(await p.evaluate(() => document.activeElement && document.activeElement.dataset.gymIn), 'q', 'el buscador no pierde el foco al filtrar');
  await p.fill('#coachHost [data-gym-in="q"]', 'lucia'); await wait(250);
  t.eq(await nombres(p), ['Lucía Gómez'], 'buscador por nombre, sin acentos');
  await p.fill('#coachHost [data-gym-in="q"]', ''); await wait(250);
  // Bajas
  await p.click('#coachHost [data-gym="socios-tab"][data-v="bajas"]'); await wait(300);
  t.eq(await nombres(p), ['Ana Torres'], 'pestaña Bajas');
  await p.click('#coachHost [data-gym="socios-tab"][data-v="socios"]'); await wait(300);
  // En grupo: asignar profe (las saltadas dicen por qué)
  for (const id of [F.A1, F.A5, F.A7]) await p.check('#coachHost [data-gym="elegir"][data-id="' + id + '"]');
  await wait(200);
  t.has(await hostTxt(p), '3 elegidos', 'acciones en grupo con los elegidos');
  await p.click('#coachHost [data-gym="grupo-asignar"]'); await wait(300);
  t.ok(await p.isDisabled('#gymModal [data-gym="asignar-ok"]'), 'asignar: sin elegir profe no se confirma');
  await p.check('#gymModal input[value="' + 'a0000000-0000-4000-8000-0000000000b2' + '"]'); await wait(200);
  await p.click('#gymModal [data-gym="asignar-ok"]'); await wait(700);
  t.eq(rpcs(pg.st, 'gym_asignar_profe'), [{ fichas: [F.A1, F.A5, F.A7], profe: 'a0000000-0000-4000-8000-0000000000b2' }], 'gym_asignar_profe con las fichas elegidas y el profe');
  const m = await modalTxt(p);
  t.has(m, 'Listo: 1 socio con su profe nuevo.', 'cuántos cambiaron');
  t.has(m, 'Sofía Ruiz: tiene un coach de afuera del gimnasio.', 'saltada por coach externo, con el motivo');
  t.has(m, 'Pedro Álvarez: no confirmó lo que ve el gimnasio.', 'saltada por falta de confirmación, con el motivo');
  await p.click('#gymModal .gy-x'); await wait(300);
  // Pausar en grupo
  await p.check('#coachHost [data-gym="elegir"][data-id="' + F.A1 + '"]'); await p.check('#coachHost [data-gym="elegir"][data-id="' + F.A3 + '"]'); await wait(200);
  await p.click('#coachHost [data-gym="grupo-pausar"]'); await wait(300);
  const hasta = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  await p.fill('#gymModal [data-gym-in="pausa-hasta"]', hasta); await wait(100);
  await p.click('#gymModal [data-gym="pausar-ok"]'); await wait(800);
  t.eq(rpcs(pg.st, 'gym_pausar'), [{ ficha: F.A1, hasta }, { ficha: F.A3, hasta }], 'pausar en grupo: gym_pausar por cada ficha');
  // Exportar CSV de los elegidos
  await p.check('#coachHost [data-gym="elegir"][data-id="' + F.A1 + '"]'); await wait(200);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#coachHost [data-gym="grupo-exportar"]')]);
  const csv = dl ? fs.readFileSync(await dl.path(), 'utf8') : '';
  t.ok(/^﻿nombre;dni;telefono;email;estado;profe/.test(csv) && /Martina Sosa;30111222/.test(csv), 'exportar CSV de los elegidos (con BOM y punto y coma): ' + csv.slice(0, 120));
  await p.click('#coachHost [data-gym="grupo-limpiar"]'); await wait(200);
  // Abrir la ficha desde la fila
  await p.click('#coachHost .gy-row:has-text("Martina Sosa") .gy-socio-t'); await wait(800);
  t.has(await hostTxt(p), 'Notas internas', 'tocar la fila abre la ficha');
  await ir(p, 'socios');
  // Sumar socio: código, link y QR
  await p.click('#coachHost .gy-head [data-gym="sumar"]'); await wait(900);
  let mt = await modalTxt(p);
  t.has(mt, 'FUERZA22', 'Sumar socio: el código del gimnasio'); t.has(mt, 'https://gize.ar/app/#codigo=FUERZA22', 'su link');
  t.ok(await p.$('#gymModal .gy-qr svg'), 'y el QR del link');
  t.has(mt, 'no controla el ingreso', 'el QR no controla el ingreso');
  // Cargar una ficha sin app
  await p.click('#gymModal [data-gym="sumar-tab"][data-v="ficha"]'); await wait(300);
  await p.fill('#gymModal [data-gym-f="nombre"]', 'Gabriel Núñez'); await p.fill('#gymModal [data-gym-f="dni"]', '28.555.444');
  await p.fill('#gymModal [data-gym-f="telefono"]', '341 555 1234');
  await p.click('#gymModal [data-gym="ficha-crear"]'); await wait(800);
  t.eq(rpcs(pg.st, 'gym_ficha_crear'), [{ datos: { nombre: 'Gabriel Núñez', dni: '28.555.444', telefono: '341 555 1234' } }], 'gym_ficha_crear con lo escrito');
  mt = await modalTxt(p);
  t.has(mt, 'Listo: Gabriel Núñez ya es socio.', 'la ficha quedó cargada');
  t.has(mt, 'https://gize.ar/app/#unirme=' + TOKEN, 'el link #unirme para mandarle');
  const wa = await p.$eval('#gymModal a[href^="https://wa.me/"]', a => a.href);
  t.ok(wa.startsWith('https://wa.me/3415551234?text=') && decodeURIComponent(wa).includes('#unirme=' + TOKEN), 'WhatsApp a su teléfono con el link: ' + wa.slice(0, 80));
  await p.keyboard.press('Escape'); await wait(300);
  t.ok(!(await p.$('#gymModal')), 'Escape cierra la ventana');
  // El P0001 del servidor tal cual (cupo lleno)
  pg.st.rpcs.length = 0;
  await p.evaluate(() => { const b = document.querySelector('#coachHost .gy-head [data-gym="sumar"]'); b.click(); }); await wait(300);
  await p.click('#gymModal [data-gym="sumar-tab"][data-v="ficha"]'); await wait(200);
  await p.route(/rpc\/gym_ficha_crear/, r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'El gimnasio no puede sumar socios en este momento.' }) }));
  await p.fill('#gymModal [data-gym-f="nombre"]', 'Otra Persona'); await p.click('#gymModal [data-gym="ficha-crear"]'); await wait(700);
  t.ok(pg.dialogs.includes('El gimnasio no puede sumar socios en este momento.'), 'cupo lleno: el texto del servidor, tal cual');
  t.eq(pg.errs, [], 'sin errores');
  await pg.close();

  // Sin socios: el vacío con «Compartir código» y «Cargar socio».
  const pv = await entrar(base, DUENA, { rpc: { gym_socios_resumen: () => [] } });
  await ir(pv.p, 'socios');
  txt = await hostTxt(pv.p);
  t.has(txt, 'Todavía no hay socios. Compartí el código del gimnasio o cargalos a mano.', 'vacío: qué hacer');
  t.ok(await pv.p.$('#coachHost [data-gym="sumar"][data-v="codigo"]') && await pv.p.$('#coachHost [data-gym="sumar"][data-v="ficha"]'), 'vacío: «Compartir código» y «Cargar socio»');
  await pv.close();
}
