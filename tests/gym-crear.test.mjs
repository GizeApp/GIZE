// Gimnasios, etapa 1: crear un gimnasio (gize.ar/gimnasio → /app/#gimnasio). Solo en la web, para un
// coach sin gimnasio, con el interruptor del servidor prendido (mi_gimnasio().puede_crear) y con la
// casilla del contrato de encargo (la versión que manda es la de textos.js: '2026-10-borrador').
// Apagado: no hay formulario. En las apps de iPhone y Android: «El gimnasio se crea desde gize.ar en
// la compu». Sin sesión: la pantalla de ingreso dice para qué. El P0001 del servidor se muestra tal cual.
import { newPage, wait } from './lib.mjs';
import { entrar, COACH, miGimnasio, hostTxt, rpcs, IOS, ANDROID } from './gym-comun.mjs';

const PUEDE = { gym: null, rol: null, puede_crear: true };

export default async function ({ base, t }){
  // Interruptor prendido, en la web: el formulario con la casilla obligatoria.
  {
    let creado = false;
    const pg = await entrar(base, COACH, { url: '/app/#gimnasio', gym: PUEDE, nombre: 'Coach Prueba',
      rpc: { gym_crear: () => { creado = true; return { gym_id: 'g', code: 'FUERZA22' }; }, mi_gimnasio: () => creado ? miGimnasio('owner', { contadores: { solicitudes: 0, sin_profe: 0, falta_confirmacion: 0, fotos_pendientes: 0, ingresos_hoy: 0, invitaciones: 0, aptos_vencidos: 0 } }) : PUEDE,
        gym_socios_resumen: () => [], gym_equipo: () => [], gym_invitaciones: () => [] } });
    const p = pg.p;
    let txt = await hostTxt(p);
    t.has(txt, 'Creá tu gimnasio en GIZE', 'el formulario para crear el gimnasio');
    t.has(txt, 'Contrato de encargo de datos', 'con el resumen del contrato de encargo');
    t.has(txt, 'versión 2026-10-borrador', 'y su versión');
    t.eq(new URL(p.url()).hash, '', 'el #gimnasio se saca de la dirección');
    await p.fill('[data-gym-cr="nombre"]', 'Gimnasio Fuerza'); await p.fill('[data-gym-cr="ciudad"]', 'Rosario');
    await p.selectOption('[data-gym-cr="provincia"]', 'Santa Fe');
    t.ok(await p.isDisabled('[data-gym="crear-si"]'), 'sin la casilla del contrato no se puede crear');
    await p.check('[data-gym-cr="acepto"]'); await wait(200);
    t.ok(!(await p.isDisabled('[data-gym="crear-si"]')), 'con la casilla, sí');
    await p.click('[data-gym="crear-si"]'); await wait(1500);
    t.eq(rpcs(pg.st, 'gym_crear'), [{ nombre: 'Gimnasio Fuerza', ciudad: 'Rosario', provincia: 'Santa Fe', dpa_version: '2026-10-borrador' }], 'gym_crear con los datos y la versión del contrato');
    txt = await hostTxt(p);
    t.ok(await p.evaluate(() => !!document.querySelector('#coachHost .gy-shell')), 'después de crear, el panel del gimnasio');
    t.has(txt, 'Para arrancar', 'con la lista de los primeros pasos');
    t.has(txt, 'Invitá a tus profes', 'primer paso: invitar a los profes');
    t.eq(pg.errs, [], 'sin errores');
    await pg.close();
  }
  // El P0001 del servidor, tal cual.
  {
    const pg = await entrar(base, COACH, { url: '/app/#gimnasio', gym: PUEDE, rpc: { gym_crear: () => ({ error: 'P0001', msg: 'Para crear un gimnasio escribinos por WhatsApp.' }) } });
    await pg.p.fill('[data-gym-cr="nombre"]', 'Gimnasio Fuerza'); await pg.p.check('[data-gym-cr="acepto"]');
    await pg.p.click('[data-gym="crear-si"]'); await wait(800);
    t.ok(pg.dialogs.includes('Para crear un gimnasio escribinos por WhatsApp.'), 'el texto del servidor se muestra tal cual: ' + JSON.stringify(pg.dialogs));
    // «Volver»: el panel de coach de siempre.
    await pg.p.click('[data-gym="crear-no"]'); await wait(600);
    t.ok(await pg.p.evaluate(() => !!document.querySelector('#coachHost .cv-shell') && !document.querySelector('#coachHost .gy-solo')), '«Volver» lleva al panel de coach');
    await pg.close();
  }
  // Interruptor apagado (mi_gimnasio null): sin formulario.
  {
    const pg = await entrar(base, COACH, { url: '/app/#gimnasio', gym: null });
    const txt = await hostTxt(pg.p);
    t.has(txt, 'la creación de gimnasios está cerrada', 'apagado: no se puede crear');
    t.ok(!(await pg.p.$('[data-gym="crear-si"]')), 'apagado: sin el botón de crear');
    await pg.close();
  }
  // En las apps: no se ofrece.
  for (const [nombre, init] of [['iPhone', IOS], ['Android', ANDROID]]){
    const pg = await entrar(base, COACH, { url: '/app/#gimnasio', gym: PUEDE, init });
    const txt = await hostTxt(pg.p);
    t.has(txt, 'El gimnasio se crea desde gize.ar en la compu', nombre + ': se crea desde la web');
    t.ok(!(await pg.p.$('[data-gym-cr]')), nombre + ': sin el formulario');
    t.eq(rpcs(pg.st, 'gym_crear'), [], nombre + ': no llama a gym_crear');
    await pg.close();
  }
  // Sin sesión: la pantalla de ingreso explica para qué.
  {
    const pg = await newPage({ viewport: { width: 1440, height: 900 } });
    await pg.p.goto(base + '/app/#gimnasio'); await wait(1800);
    const txt = await pg.p.evaluate(() => document.getElementById('authHost').innerText);
    t.has(txt, 'Para crear tu gimnasio, ingresá con tu cuenta de coach.', 'sin sesión: la pantalla de ingreso dice para qué');
    await pg.close();
  }
}
