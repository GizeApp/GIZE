// Gimnasios, etapa 1: Inicio del panel (SPEC §2.2 sin cuotas ni clases). Las tarjetas (socios del plan
// y sin profe, ingresos de hoy, solicitudes), «Para hacer» con cada contador de mi_gimnasio y la versión
// vieja de la app (de gym_socios_resumen y gym_equipo), y cada botón lleva a su lista filtrada. Los
// carteles del plan van solo en la web (gracia, prueba, sobre cupo); en las apps no. Sin nada cargado,
// la lista de los primeros pasos, que se tachan solos.
import { wait } from './lib.mjs';
import { entrar, miGimnasio, DUENA, ADMIN_G, hostTxt, IOS, ANDROID } from './gym-comun.mjs';

const dias = n => new Date(Date.now() + n * 864e5).toISOString();

export default async function ({ base, t }){
  {
    const pg = await entrar(base, DUENA), p = pg.p;
    const txt = await hostTxt(p);
    for (const s of ['182 / 250', '1 sin profe', 'Ingresos hoy 7', 'Solicitudes 2', '2 pedidos para sumarse', '1 socio sin profe', '1 socio no confirmó lo que ve el gimnasio',
      '1 foto para aprobar', '1 invitación sin aceptar', '1 apto médico vencido', '1 socio y 1 persona del equipo con una versión vieja de la app'])
      t.has(txt, s, 'Inicio: «' + s + '»');
    t.ok(!/Para arrancar/.test(txt), 'con socios y equipo, sin la lista de los primeros pasos');
    t.ok(!/venció|prueba termina/.test(txt), 'plan al día: sin carteles del plan');
    // «Asignar» de «sin profe» abre Socios con ese filtro.
    await p.click('#coachHost .gy-todo:has-text("sin profe") button'); await wait(700);
    let s = await hostTxt(p);
    t.ok(/Lucía Gómez/.test(s) && !/Martina Sosa/.test(s), '«Asignar» abre Socios filtrado por «Sin profe»');
    t.ok(await p.evaluate(() => document.querySelector('[data-gym="filtro"][data-k="sinProfe"]').classList.contains('on')), 'con el filtro marcado');
    await p.click('#coachHost [data-gym="ir"][data-v="inicio"]'); await wait(500);
    await p.click('#coachHost .gy-todo:has-text("pedidos para sumarse") button'); await wait(800);
    t.has(await hostTxt(p), 'Tomás Ríos', '«Revisar» abre Socios → Solicitudes');
    await p.click('#coachHost [data-gym="ir"][data-v="inicio"]'); await wait(500);
    await p.click('#coachHost .gy-todo:has-text("versión vieja") button'); await wait(700);
    s = await hostTxt(p);
    t.ok(/Juan Pérez/.test(s) && !/Martina Sosa/.test(s), '«Ver» de la versión vieja filtra los socios con la app vieja');
    // «Sumar socio» abre la ventana con el código.
    await p.click('#coachHost [data-gym="ir"][data-v="inicio"]'); await wait(500);
    await p.click('#coachHost .gy-head [data-gym="sumar"]'); await wait(500);
    t.ok(/FUERZA22/.test(await p.evaluate(() => document.getElementById('gymModal').innerText)), '«Sumar socio» abre la ventana con el código');
    t.eq(pg.errs, [], 'sin errores');
    await pg.close();
  }
  // Carteles del plan, solo en la web.
  const gracia = miGimnasio('owner', { plan: { estado: 'gracia', vence: dias(-2), pausa_profes_el: dias(3), libera_el: dias(8), plan: 'p250', seats_used: 260, max: 250, sobre_cupo: true, profes_usados: 3, profes_tope: 15 } });
  {
    const pg = await entrar(base, DUENA, { gym: gracia });
    const txt = await hostTxt(pg.p);
    t.has(txt, 'tus profes pierden el acceso a los socios el', 'web, en gracia: cuándo pierden el acceso los profes');
    t.has(txt, 'Tenés 260 socios y tu plan es de 250: no podés sumar socios.', 'web, sobre el cupo: el cartel fijo');
    t.ok(await pg.p.$('.gy-cartel [data-gym="ir"][data-v="plan"]'), 'con el link a Plan de GIZE');
    await pg.close();
  }
  {
    const trial = miGimnasio('owner', { plan: { estado: 'activo', vence: dias(4.5), pausa_profes_el: dias(9), libera_el: dias(14), plan: 'trial', seats_used: 12, max: 100, sobre_cupo: false, profes_usados: 1, profes_tope: 8 } });
    const pg = await entrar(base, DUENA, { gym: trial });
    t.has(await hostTxt(pg.p), 'Tu prueba termina en 5 días', 'web, en la prueba: cuántos días le quedan');
    await pg.close();
  }
  for (const [nombre, init] of [['iPhone', IOS], ['Android', ANDROID]]){
    const pg = await entrar(base, DUENA, { gym: gracia, init });
    const txt = await hostTxt(pg.p);
    t.ok(!pg.p.isClosed() && !(await pg.p.$('.gy-cartel')), nombre + ': sin carteles del plan');
    t.ok(!/\/ 250|venció|prueba|plan/i.test(txt.replace(/Planes alimenticios/g, '')), nombre + ': ni el tope del plan ni el vencimiento: ' + txt.slice(0, 200));
    await pg.close();
  }
  // Primer día: la lista que se tacha sola (invitar profes hecho; sumar socios y la recepción, no).
  {
    const g = miGimnasio('owner', { contadores: { solicitudes: 0, sin_profe: 0, falta_confirmacion: 0, fotos_pendientes: 0, ingresos_hoy: 0, invitaciones: 1, aptos_vencidos: 0 } });
    g.plan.seats_used = 0;
    const pg = await entrar(base, DUENA, { gym: g, rpc: { gym_socios_resumen: () => [], gym_equipo: () => [{ user_id: DUENA.id, nombre: 'Carla Dueña', rol: 'owner', coach: true, socios: 0 }] } });
    const pasos = await pg.p.$$eval('#coachHost .gy-pasos li', l => l.map(x => [x.innerText.trim(), x.classList.contains('hecho')]));
    t.eq(pasos, [['Invitá a tus profes', true], ['Sumá socios: compartí el código o cargalos', false], ['Probá la recepción con tu celular', false]], 'primer día: los tres pasos, «Invitá a tus profes» tachado (hay una invitación)');
    await pg.p.click('#coachHost .gy-paso:has-text("Probá la recepción")'); await wait(400);
    await pg.p.click('#coachHost [data-gym="ir"][data-v="inicio"]'); await wait(400);
    t.ok(await pg.p.evaluate(() => document.querySelectorAll('#coachHost .gy-pasos li.hecho').length === 1), 'abrir la recepción de ahora (un cartel: llega en la próxima actualización) no tacha «Probá la recepción»');
    await pg.close();
  }
  // La administración también ve Inicio con los contadores.
  {
    const pg = await entrar(base, ADMIN_G, { gym: miGimnasio('admin'), rol: 'client' });
    t.has(await hostTxt(pg.p), '2 pedidos para sumarse', 'administración: Inicio con los contadores');
    await pg.close();
  }
}
