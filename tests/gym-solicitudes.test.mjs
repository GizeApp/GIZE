// Gimnasios, etapa 1: Socios → Solicitudes (SPEC §2.3). Cada pedido con su mail, fecha y cómo entró, si
// no aceptó la hoja (app vieja), las coincidencias con fichas cargadas («¿Es Raúl Díaz, DNI …888?») y la
// foto que propuso. [Socio nuevo] con el profe por defecto ya elegido (o «Sin profe») y «Aprobar la foto»;
// [Es la ficha de…] une el pedido con esa ficha; [Rechazar] con un motivo. Los P0001 del servidor (el cupo
// lleno, «ya no está pendiente») se muestran tal cual.
import { wait } from './lib.mjs';
import { entrar, DUENA, F, PROFE, ID, hostTxt, rpcs } from './gym-comun.mjs';

export default async function ({ base, t }){
  const pend = (extra = {}) => Object.assign({ id: ID('f21'), member_id: ID('21'), nombre: 'Clara Vidal', email: 'clara@prueba.test', requested_at: new Date().toISOString(), via: 'codigo', terms: true, share_admin: false,
    foto_pend_path: 'a0000000-0000-4000-8000-00000000aaaa/' + ID('f21') + '/' + ID('99') + '.jpg', unir_sugerida: null, coincidencias: [] }, extra);
  const pg = await entrar(base, DUENA, { rpc: { gym_solicitudes: (b, st) => st.solicitudes.concat(st.extra || []) } }), p = pg.p;
  pg.st.extra = [pend()];
  await p.click('#coachHost .gy-todo:has-text("pedidos para sumarse") button'); await wait(900);
  let txt = await hostTxt(p);
  for (const s of ['Tomás Ríos', 'tomas@prueba.test', 'Con el código del gimnasio', '¿Es Raúl Díaz, DNI …888?', 'Elena Paz', 'Todavía no aceptó lo que ve el gimnasio', 'Clara Vidal', 'Aprobar la foto', 'Sin foto propuesta'])
    t.has(txt, s, 'Solicitudes: «' + s + '»');
  t.eq(await p.$eval('#coachHost select[data-gym-sol="profe"][data-id="' + F.A6 + '"]', s => s.value), PROFE.id, 'el profe por defecto del gimnasio ya elegido');
  t.ok(await p.$eval('#coachHost input[data-gym-sol="foto"][data-id="' + ID('f21') + '"]', x => x.checked), '«Aprobar la foto» marcada cuando propuso una');
  // Socio nuevo, sin profe.
  await p.selectOption('#coachHost select[data-gym-sol="profe"][data-id="' + F.A6 + '"]', '');
  await p.click('#coachHost [data-gym="sol-nuevo"][data-id="' + F.A6 + '"]'); await wait(800);
  t.eq(rpcs(pg.st, 'gym_aprobar'), [{ ficha: F.A6, profe: null, unir_a_ficha: null, foto_ok: false }], 'Socio nuevo sin profe: gym_aprobar(ficha, null, null, false)');
  // Clara: con el profe por defecto y la foto aprobada.
  await p.click('#coachHost [data-gym="sol-nuevo"][data-id="' + ID('f21') + '"]'); await wait(800);
  t.eq(rpcs(pg.st, 'gym_aprobar')[1], { ficha: ID('f21'), profe: PROFE.id, unir_a_ficha: null, foto_ok: true }, 'Socio nuevo con su profe y la foto aprobada');
  // Es la ficha de… (Tomás de nuevo en la lista)
  pg.st.rpcs.length = 0;
  await p.evaluate(() => { const b = document.querySelector('[data-gym="reintentar"]'); if (b) b.click(); });
  await p.click('#coachHost [data-gym="socios-tab"][data-v="solicitudes"]'); await wait(800);
  await p.click('#coachHost [data-gym="sol-unir"][data-id="' + F.A6 + '"]'); await wait(800);
  t.ok(pg.preguntas.some(q => /Unir el pedido de Tomás Ríos con la ficha de Raúl Díaz/.test(q.texto)), 'pregunta antes de unir: ' + JSON.stringify(pg.preguntas.map(q => q.texto)));
  t.eq(rpcs(pg.st, 'gym_aprobar'), [{ ficha: F.A6, profe: PROFE.id, unir_a_ficha: F.A4, foto_ok: false }], 'Es la ficha de…: gym_aprobar con unir_a_ficha');
  // Rechazar con motivo
  p.contestar = q => q.tipo === 'pedir' ? 'No es del barrio' : true;
  await p.click('#coachHost [data-gym="socios-tab"][data-v="solicitudes"]'); await wait(800);
  await p.click('#coachHost [data-gym="sol-rechazar"][data-id="' + ID('f19') + '"]'); await wait(800);
  t.eq(rpcs(pg.st, 'gym_rechazar'), [{ ficha: ID('f19'), motivo: 'No es del barrio' }], 'Rechazar: gym_rechazar con el motivo');
  // Cancelar el rechazo no hace nada.
  p.contestar = false;
  await p.click('#coachHost [data-gym="socios-tab"][data-v="solicitudes"]'); await wait(800);
  await p.click('#coachHost [data-gym="sol-rechazar"][data-id="' + F.A6 + '"]'); await wait(500);
  t.eq(rpcs(pg.st, 'gym_rechazar').length, 1, 'cancelar el rechazo no llama a nada');
  // El P0001 del servidor tal cual.
  p.contestar = true;
  await p.route(/rpc\/gym_aprobar/, r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'El gimnasio no puede sumar socios en este momento.' }) }));
  await p.click('#coachHost [data-gym="sol-nuevo"][data-id="' + F.A6 + '"]'); await wait(700);
  t.ok(pg.dialogs.includes('El gimnasio no puede sumar socios en este momento.'), 'cupo lleno: el texto del servidor tal cual');
  t.eq(pg.errs, [], 'sin errores');
  await pg.close();

  // Sin pedidos.
  const pv = await entrar(base, DUENA, { rpc: { gym_solicitudes: () => [] } });
  await pv.p.click('#coachHost [data-gym="ir"][data-v="socios"]'); await wait(500);
  await pv.p.click('#coachHost [data-gym="socios-tab"][data-v="solicitudes"]'); await wait(700);
  t.has(await hostTxt(pv.p), 'No hay pedidos para sumarse.', 'sin pedidos: el vacío');
  await pv.close();
}
