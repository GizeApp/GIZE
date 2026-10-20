// Gimnasios, etapa 1: la ficha del socio en el panel (SPEC §2.3). Datos y nota interna (con sus RPC),
// Gimnasio (cambiar profe, que no aparece y dice por qué con coach externo, falta de confirmación o
// sin app; pausar, dar de baja, reactivar, mandar el link), la foto del gimnasio (aprobar la propuesta,
// sacarla con la cámara: queda aprobada), la asistencia del último mes y Entrenamiento en sus tres modos:
//   · su socio (la dueña es su profe): la ficha de coach de siempre, editable y con el chat;
//   · compartió: la misma ficha en modo lectura, sin apply_due_routines, sin chat ni botones de editar,
//     con el registro diario de gym_registro_lectura (sin pasos) y «Lo edita su profe, Lucía»;
//   · no compartió: «El socio no compartió sus registros con la administración».
import { wait } from './lib.mjs';
import { entrar, DUENA, F, S, G, TOKEN, hostTxt, modalTxt, rpcs, ir } from './gym-comun.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQElEQVR42u3OMQ0AAAgDsPk3DRZ4SFoHzUcR0NLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0nqwAeKbAQHk/s0wAAAAAElFTkSuQmCC', 'base64');

export default async function ({ base, t }){
  const pg = await entrar(base, DUENA), p = pg.p;
  const abrir = async id => { await ir(p, 'socios'); await p.click('#coachHost .gy-row[data-id="' + id + '"] .gy-socio-t'); await wait(900); };
  const calls = () => pg.calls.map(c => c.replace(/\?.*$/, ''));

  // ---- Martina: compartió, su profe es Lucía ----
  await abrir(F.A1);
  let txt = await hostTxt(p);
  for (const s of ['Martina Sosa', 'Datos', 'Notas internas', 'Gimnasio', 'Foto del gimnasio', 'Asistencia', 'Entrenamiento', 'Lucía Profe', 'Compartió sus registros con la administración: los ves sin poder editarlos; los edita su profe, Lucía'])
    t.has(txt, s, 'ficha: «' + s + '»');
  t.eq(await p.$eval('#coachHost [data-gym-nota]', x => x.value), 'Prefiere entrenar a la tarde', 'la nota interna guardada');
  t.ok(await p.$('#coachHost [data-gym="cambiar-profe"]'), 'con profe del gimnasio: [Cambiar]');
  t.ok(await p.$('#coachHost .gy-sec .cal-x .cal-x-day.on'), 'asistencia: los días con ingreso marcados en el calendario');
  // Datos: solo lo que cambió.
  t.ok(await p.isDisabled('#coachHost [data-gym="ficha-guardar"]'), 'sin cambios, «Guardar cambios» apagado');
  await p.fill('#coachHost [data-gym-ff="telefono"]', '341 555 9999'); await wait(100);
  await p.click('#coachHost [data-gym="ficha-guardar"]'); await wait(700);
  t.eq(rpcs(pg.st, 'gym_ficha_editar'), [{ id: F.A1, patch: { telefono: '341 555 9999' } }], 'gym_ficha_editar con lo que cambió');
  await p.fill('#coachHost [data-gym-nota]', 'Lesión de rodilla: nada de saltos'); await wait(100);
  await p.click('#coachHost [data-gym="nota-guardar"]'); await wait(600);
  t.eq(rpcs(pg.st, 'gym_nota_guardar'), [{ id: F.A1, body: 'Lesión de rodilla: nada de saltos' }], 'gym_nota_guardar con la nota');
  // Entrenamiento en modo lectura.
  pg.calls.length = 0;
  await p.click('#coachHost [data-gym="entreno"][data-m="lectura"]'); await wait(1500);
  txt = await hostTxt(p);
  t.has(txt, 'Lo edita su profe, Lucía', 'modo lectura: quién la edita');
  t.ok(await p.$('#coachHost .gy-shell') && /Ficha del cliente/.test(txt), 'la ficha de siempre, adentro del marco del gimnasio');
  t.ok(!/Chat con|Desvincular alumno/.test(txt), 'modo lectura: sin chat ni «Desvincular»');
  t.ok(!calls().includes('POST /rest/v1/rpc/apply_due_routines'), 'modo lectura: no aplica las rutinas programadas');
  t.ok(calls().includes('POST /rest/v1/rpc/gym_registro_lectura') && !calls().includes('GET /rest/v1/daily_logs'), 'modo lectura: el registro diario sale de gym_registro_lectura, no de daily_logs');
  t.ok(calls().includes('POST /rest/v1/rpc/gym_cardio_lectura') && !calls().includes('GET /rest/v1/cardio_outings'), 'modo lectura: las salidas de gym_cardio_lectura (sin recorrido)');
  t.ok(!calls().some(c => /coach_messages|notify/.test(c)), 'modo lectura: no lee el chat');
  await p.click('#coachHost [data-coach="client-tab"][data-t="rutina"]'); await wait(500);
  t.eq(await p.evaluate(() => [...document.querySelectorAll('#coachHost .cv-main [data-coach]')].map(b => b.dataset.coach).filter(a => !/^(back|refresh|client-tab|sec-open|sec-close|plsec-open|plsec-close|edit-day|rt-toggle|wk-open|wk-close|ex|dayfilter|ea-play|cal-.+)$/.test(a))), [], 'modo lectura, Rutina: ningún botón de editar');
  t.ok(await p.evaluate(() => [...document.querySelectorAll('#coachHost .cv-main input, #coachHost .cv-main textarea')].every(x => x.disabled)), 'modo lectura: los campos no se pueden editar');
  await p.click('#coachHost [data-coach="client-tab"][data-t="stats"]'); await wait(400);
  await p.click('#coachHost [data-coach="sec-open"][data-v="daily"]'); await wait(400);
  t.ok(!/pasos/i.test(await hostTxt(p)), 'modo lectura: el seguimiento diario sin los pasos');
  await p.click('#coachHost [data-coach="sec-close"]'); await wait(300);
  await p.click('#coachHost [data-coach="client-tab"][data-t="ficha"]'); await wait(300);
  await p.click('#coachHost [data-coach="back"]'); await wait(700);
  t.has(await hostTxt(p), 'Notas internas', '«Volver» desde la ficha de entrenamiento vuelve a la ficha del gimnasio');

  // ---- Juan: no compartió, pausado, con foto propuesta ----
  await abrir(F.A2);
  txt = await hostTxt(p);
  t.has(txt, 'El socio no compartió sus registros con la administración.', 'no compartió: el texto, sin botón');
  t.ok(!(await p.$('#coachHost [data-gym="entreno"]')), 'no compartió: no se abre su ficha de entrenamiento');
  t.ok(await p.$('#coachHost [data-gym="reactivar"]') && !(await p.$('#coachHost [data-gym="pausar"]')), 'pausado: [Reactivar], no [Pausar]');
  t.has(txt, 'Propuesta', 'la foto que propuso, para aprobar');
  await p.click('#coachHost [data-gym="foto-aprobar"]'); await wait(600);
  t.eq(rpcs(pg.st, 'gym_foto_resolver'), [{ ficha: F.A2, aprobar: true, motivo: null }], 'aprobar la foto: gym_foto_resolver');
  p.contestar = q => q.tipo === 'pedir' ? 'Está borrosa' : true;
  await p.click('#coachHost [data-gym="foto-rechazar"]'); await wait(700);
  t.eq(rpcs(pg.st, 'gym_foto_resolver')[1], { ficha: F.A2, aprobar: false, motivo: 'Está borrosa' }, 'rechazarla, con el motivo');
  await p.click('#coachHost [data-gym="reactivar"]'); await wait(600);
  t.eq(rpcs(pg.st, 'gym_reactivar'), [{ ficha: F.A2 }], 'reactivar: gym_reactivar');

  // ---- «Sacar foto» con el teclado: Tab llega al botón (antes el input estaba con «hidden») ----
  {
    await p.focus('#coachHost [data-gym="foto-aprobar"], #coachHost [data-gym="reactivar"]');
    let llega = false;
    for (let i = 0; i < 40 && !llega; i++){ await p.keyboard.press('Tab'); llega = await p.evaluate(id => !!(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.gymFoto === id), F.A2); }
    t.ok(llega, '«Sacar foto»: se llega con Tab (y se abre con Enter o espacio)');
  }
  // ---- Sacar la foto con la cámara: queda aprobada ----
  await p.setInputFiles('#coachHost [data-gym-foto="' + F.A2 + '"]', { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('.crp .crp-ok', { timeout: 5000 }).catch(() => {});
  await p.click('.crp .crp-ok').catch(() => {}); await wait(1200);
  const fs = rpcs(pg.st, 'gym_foto_staff');
  t.ok(fs.length === 1 && fs[0].ficha === F.A2 && new RegExp('^' + G + '/' + F.A2 + '/[0-9a-f-]{36}\\.jpg$').test(fs[0].path), 'sacar foto: se sube a gym-fotos/{gimnasio}/{ficha}/… y gym_foto_staff la deja aprobada: ' + JSON.stringify(fs));
  t.ok(pg.calls.some(c => /POST \/storage\/v1\/object\/gym-fotos\//.test(c)), 'la foto va al bucket gym-fotos');

  // ---- Sofía: coach externo → sin [Cambiar], y dice por qué ----
  await abrir(F.A5);
  txt = await hostTxt(p);
  t.ok(!(await p.$('#coachHost [data-gym="cambiar-profe"]')), 'coach externo: sin [Cambiar]');
  t.has(txt, 'Tiene un coach de afuera del gimnasio: mientras lo tenga, el gimnasio no le asigna profe.', 'coach externo: el motivo');

  // ---- Pedro: falta confirmación; la dueña es su profe → su ficha de coach, editable y con chat ----
  await abrir(F.A7);
  txt = await hostTxt(p);
  t.ok(!(await p.$('#coachHost [data-gym="cambiar-profe"]')), 'falta confirmación: sin [Cambiar]');
  t.has(txt, 'Todavía no confirmó lo que ve el gimnasio en su app', 'falta confirmación: el motivo');
  pg.calls.length = 0;
  await p.click('#coachHost [data-gym="entreno"][data-m="profe"]'); await wait(1500);
  txt = await hostTxt(p);
  t.ok(/Chat con Pedro/.test(txt) && !/Solo lectura/.test(txt), 'su socio: la ficha de siempre, con el chat y editable');
  t.ok(calls().includes('POST /rest/v1/rpc/apply_due_routines'), 'su socio: como cualquier alumno (aplica las rutinas programadas)');
  await p.click('#coachHost [data-coach="back"]'); await wait(700);

  // ---- Raúl: sin app → el link para mandarle ----
  await abrir(F.A4);
  txt = await hostTxt(p);
  t.has(txt, 'Todavía no usa la app: el profe se asigna cuando se sume con su link.', 'sin app: por qué no hay [Cambiar]');
  await p.click('#coachHost [data-gym="ficha-link"]'); await wait(600);
  t.eq(rpcs(pg.st, 'gym_ficha_link'), [{ id: F.A4 }], 'mandarle el link: gym_ficha_link');
  t.has(await modalTxt(p), 'https://gize.ar/app/#unirme=' + TOKEN, 'con el link #unirme');
  await p.click('#gymModal .gy-x'); await wait(300);

  // ---- Lucía Gómez: activa sin profe → pausar y dar de baja ----
  await abrir(F.A3);
  await p.click('#coachHost [data-gym="pausar"]'); await wait(300);
  const hasta = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  await p.fill('#gymModal [data-gym-in="pausa-hasta"]', hasta); await p.click('#gymModal [data-gym="pausar-ok"]'); await wait(700);
  t.eq(rpcs(pg.st, 'gym_pausar'), [{ ficha: F.A3, hasta }], 'pausar hasta una fecha: gym_pausar');
  p.contestar = q => q.tipo === 'pedir' ? 'Se mudó' : true;
  await p.click('#coachHost [data-gym="baja"]'); await wait(700);
  t.eq(rpcs(pg.st, 'gym_baja'), [{ ficha: F.A3, motivo: 'Se mudó' }], 'dar de baja: gym_baja con el motivo');
  await p.click('#coachHost [data-gym="cambiar-profe"]'); await wait(300);
  t.has(await modalTxt(p), 'Cambiar el profe', '[Cambiar] abre la elección de profe');
  t.eq(pg.errs, [], 'sin errores');
  await pg.close();
}
