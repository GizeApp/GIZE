// Gimnasios, etapa 1: quién abre qué (SPEC §2.1). Dueña (cuenta de coach) y administración (también
// con una cuenta común) → panel del gimnasio; profe → el panel de coach de siempre (la parte 4 le suma
// lo del gimnasio); recepción → la recepción (un cartel hasta la parte 4); socio y pedido pendiente →
// la app de siempre. Sin señal, la dueña entra con la copia guardada. Si el módulo del panel no llega
// (una versión vieja de la app, la red), la dueña ve su panel de coach de siempre. Si mi_gimnasio llega
// tarde y dice que es dueña, el panel aparece solo. gize.ar/gimnasio lleva a /app/#gimnasio, y #gimnasio
// de alguien que ya es del equipo abre su panel.
import fs from 'node:fs';
import { wait } from './lib.mjs';
import { entrar, miGimnasio, DUENA, ADMIN_G, PROFE, RECEP, ALUMNO, S, hostTxt, ir, D, M } from './gym-comun.mjs';

const enPanel = p => p.evaluate(() => ({ gym: !!document.querySelector('#coachHost .gy-shell'), coach: !!document.querySelector('#coachHost .cv-shell:not(.gy-shell)'),
  app: getComputedStyle(document.getElementById('coachHost')).display === 'none' && !!document.getElementById('nav-entreno'), solo: !!document.querySelector('#coachHost .gy-solo') }));

export default async function ({ base, t }){
  // Dueña: Inicio del panel del gimnasio.
  {
    const pg = await entrar(base, DUENA);
    const v = await enPanel(pg.p), txt = await hostTxt(pg.p);
    t.ok(v.gym, 'dueña: abre el panel del gimnasio');
    t.has(txt, 'Gimnasio Fuerza', 'dueña: con el nombre del gimnasio'); t.has(txt, 'Para hacer', 'dueña: en Inicio');
    t.has(txt.toLowerCase(), 'como profe', 'dueña con cuenta de coach: «Como profe» (rutinas y planes)');
    t.ok(await pg.p.evaluate(() => !!document.querySelector('link[data-gym-css]')), 'los estilos del panel se cargan recién para el equipo');
    // «Como profe → Rutinas» abre las rutinas de siempre adentro del mismo marco; volver a Socios.
    await pg.p.click('#coachHost [data-gy-coach][data-coach="view-tpls"]'); await wait(900);
    const r = await hostTxt(pg.p);
    t.ok(await pg.p.evaluate(() => !!document.querySelector('#coachHost .gy-shell')) && /Rutinas/.test(r) && /Crear rutina/.test(r), 'Rutinas del panel de coach adentro del marco del gimnasio');
    await pg.p.click('#coachHost [data-gym="ir"][data-v="socios"]'); await wait(700);
    t.has(await hostTxt(pg.p), 'Martina Sosa', 'y de ahí a Socios');
    t.eq(pg.errs, [], 'dueña: sin errores');
    await pg.close();
  }
  // Dueña con una alumna propia de antes (online, de afuera del gimnasio): «Como profe → Mis alumnos»
  // abre la lista de Clientes de hoy adentro del marco, con su ficha (y el chat); en el celular, en «Más».
  for (const vp of [D, M]){
    const VALERIA = { id: '44444444-4444-4444-4444-444444444444', full_name: 'Valeria Online', role: 'client', coach_id: DUENA.id };
    const pg = await entrar(base, DUENA, { vp, alumnos: [VALERIA, { id: S.A7, full_name: 'Pedro Álvarez', role: 'client', coach_id: DUENA.id }] });
    const n = vp === D ? 'compu' : 'celular';
    if (vp === M){ await pg.p.click('#coachHost [data-gym="mas"]'); await wait(400); }
    const b = vp === D ? '#coachHost [data-coach="view-clients"][data-gy-coach]' : '#gymModal [data-coach="view-clients"][data-gy-coach]';
    t.ok(!!(await pg.p.$(b)), n + ': «Mis alumnos» en el marco del gimnasio');
    await pg.p.click(b); await wait(900);
    let txt = await hostTxt(pg.p);
    t.ok((await enPanel(pg.p)).gym && txt.includes('Valeria Online'), n + ': «Mis alumnos» muestra a su alumna propia adentro del marco: ' + txt.slice(0, 200));
    if (vp === D) t.ok(await pg.p.evaluate(() => /Mis alumnos/.test((document.querySelector('#coachHost .gy-nav [aria-current="page"]') || {}).innerText || '')), 'compu: «Mis alumnos» marcada');
    await pg.p.click('#coachHost [data-coach="open"][data-id="' + VALERIA.id + '"]'); await wait(1500);
    txt = await hostTxt(pg.p);
    t.ok((await enPanel(pg.p)).gym && txt.includes('Valeria Online') && !!(await pg.p.$('#coachHost [data-coach="back"]')), n + ': abre su ficha (con el chat) adentro del marco');
    await pg.p.click('#coachHost [data-coach="back"]'); await wait(900);
    t.has(await hostTxt(pg.p), 'Valeria Online', n + ': «Volver» va a «Mis alumnos»');
    await ir(pg.p, 'socios');
    if (vp === D) t.has(await hostTxt(pg.p), 'Martina Sosa', n + ': y de ahí a Socios');
    t.eq(pg.errs, [], n + ': sin errores');
    await pg.close();
  }
  // Administración con una cuenta común (no de coach): el panel, sin «Como profe» ni «Mi cuenta».
  {
    const pg = await entrar(base, ADMIN_G, { gym: miGimnasio('admin'), rol: 'client', nombre: 'Diego Admin' });
    const v = await enPanel(pg.p), txt = await hostTxt(pg.p);
    t.ok(v.gym && !v.app, 'administración (cuenta común): abre el panel del gimnasio, no la app del alumno');
    t.ok(!/como profe|mi cuenta|mis alumnos/i.test(txt), 'sin «Como profe», «Mis alumnos» ni «Mi cuenta» (no es coach)');
    // La app redibuja seguido (renderApp): el panel sigue.
    await pg.p.evaluate(async () => { const m = await import('/app/main.js'); m.renderApp(); m.renderApp(); });
    await wait(300);
    t.ok((await enPanel(pg.p)).gym, 'un redibujo de la app no tapa el panel');
    t.eq(pg.errs, [], 'administración: sin errores');
    await pg.close();
  }
  // Profe: el panel de coach de siempre (la parte 4 suma lo del gimnasio).
  {
    const pg = await entrar(base, PROFE, { gym: miGimnasio('profe', { plan: { estado: 'activo', vence: null, pausa_profes_el: null }, contadores: undefined }), nombre: 'Lucía Profe' });
    const v = await enPanel(pg.p);
    t.ok(v.coach && !v.gym, 'profe: el panel de coach de siempre');
    t.ok(!(await pg.p.evaluate(() => !!document.querySelector('link[data-gym-css]'))), 'profe: no carga el panel del gimnasio');
    await pg.close();
  }
  // Recepción: la recepción (por ahora, un cartel con «Cerrar sesión»).
  {
    const pg = await entrar(base, RECEP, { gym: miGimnasio('recepcion', { plan: undefined, contadores: undefined }), rol: 'client', nombre: 'Rocío Recepción' });
    const v = await enPanel(pg.p), txt = await hostTxt(pg.p);
    t.ok(v.solo && !v.app, 'recepción: abre la recepción, no la app del alumno');
    t.has(txt, 'Recepción de Gimnasio Fuerza', 'recepción: con el nombre del gimnasio'); t.has(txt, 'Cerrar sesión', 'recepción: se sale cerrando la sesión');
    await pg.close();
  }
  // Socio y pedido pendiente: la app de siempre (la parte 3 suma «Tu gimnasio»).
  for (const [rol, info] of [['socio', { gym: { id: 'g', name: 'Gimnasio Fuerza' }, rol: 'socio', ficha: { id: 'f', status: 'activo', terms_at: '2026-10-01', share_admin: false, profe: null, coach_externo: false, foto: 'falta' } }],
    ['pendiente', { gym: { id: 'g', name: 'Gimnasio Fuerza' }, rol: 'pendiente', solicitud: { id: 'f', gym: 'Gimnasio Fuerza', requested_at: '2026-10-19', terms: true } }]]){
    const pg = await entrar(base, ALUMNO, { gym: info, rol: 'client', nombre: 'Martina Sosa', perfil: { coach_id: null } });
    const v = await enPanel(pg.p);
    t.ok(v.app && !v.gym, rol + ': la app de siempre');
    t.ok(!(await pg.p.evaluate(() => !!document.querySelector('link[data-gym-css]'))), rol + ': no carga el panel del gimnasio');
    await pg.close();
  }
  // Sin señal: la dueña entra con la copia guardada de mi_gimnasio.
  {
    const copia = `localStorage.setItem('gize_gym_v1', JSON.stringify({ uid: '${DUENA.id}', info: ${JSON.stringify(miGimnasio())}, t: 1 }));`;
    const pg = await entrar(base, DUENA, { init: copia, rpc: { mi_gimnasio: () => ({ error: 'PGRST000', status: 503, msg: 'sin conexión' }) } });
    t.ok((await enPanel(pg.p)).gym, 'sin respuesta de mi_gimnasio, la dueña entra a su panel con la copia guardada');
    await pg.close();
  }
  // El módulo del panel no llega: el panel de coach de siempre.
  {
    const { newPage } = await import('./lib.mjs');
    const { handlersGym } = await import('./gym-comun.mjs');
    const { handlers } = handlersGym(DUENA);
    const pg = await newPage({ user: DUENA, handlers, viewport: D });
    await pg.p.route(/\/app\/screens\/gym\/index\.js/, r => r.abort());
    await pg.p.goto(base + '/app/'); await wait(3200);
    const v = await enPanel(pg.p);
    t.ok(v.coach && !v.gym, 'sin el módulo del panel (app vieja o sin red), la dueña ve su panel de coach de siempre');
    await pg.close();
  }
  // La respuesta llega tarde (con la copia «sin gimnasio»): el panel aparece solo cuando llega.
  {
    const copia = `localStorage.setItem('gize_gym_v1', JSON.stringify({ uid: '${DUENA.id}', info: null, t: 1 }));`;
    const pg = await entrar(base, DUENA, { init: copia, espera: 800, rpc: { mi_gimnasio: () => ({ demora: 5000, valor: miGimnasio() }) } });
    const antes = await enPanel(pg.p);
    await wait(6000);
    const despues = await enPanel(pg.p);
    t.ok(antes.coach && !antes.gym && despues.gym, 'mi_gimnasio tarde: primero el panel de coach y, cuando llega, el del gimnasio: ' + JSON.stringify([antes, despues]));
    await pg.close();
  }
  // La respuesta llega a tiempo (1,5 s, antes del tope de 4 s) pero después de entrar con la copia:
  // también se redibuja. Copia «dueña» o «administración» y ya no es del equipo (la sacaron desde otro
  // dispositivo): la app de siempre, no la pantalla en blanco. Copia «sin gimnasio» y ahora es dueña:
  // el panel aparece solo.
  for (const [quien, user, rol, gymRol] of [['dueña (coach)', DUENA, 'coach', 'owner'], ['administración (cuenta común)', ADMIN_G, 'client', 'admin']]){
    const copia = `localStorage.setItem('gize_gym_v1', JSON.stringify({ uid: '${user.id}', info: ${JSON.stringify(miGimnasio(gymRol))}, t: 1 }));`;
    const pg = await entrar(base, user, { init: copia, rol, nombre: 'Diego Admin', espera: 800, rpc: { mi_gimnasio: () => ({ demora: 1500, valor: null }) } });
    await wait(4500);
    const v = await enPanel(pg.p);
    const algo = await pg.p.evaluate(() => (document.getElementById('coachHost').innerText + document.getElementById('view').innerText).trim().length);
    t.ok(!v.gym && (rol === 'coach' ? v.coach : v.app) && algo > 20, quien + ' que ya no es del equipo (respuesta en 1,5 s): la app de siempre, no la pantalla en blanco: ' + JSON.stringify(v));
    t.eq(pg.errs, [], quien + ': sin errores');
    await pg.close();
  }
  {
    const copia = `localStorage.setItem('gize_gym_v1', JSON.stringify({ uid: '${DUENA.id}', info: null, t: 1 }));`;
    const pg = await entrar(base, DUENA, { init: copia, espera: 800, rpc: { mi_gimnasio: () => ({ demora: 1500, valor: miGimnasio() }) } });
    const antes = await enPanel(pg.p);
    await wait(4000);
    const despues = await enPanel(pg.p);
    t.ok(!antes.gym && despues.gym, 'copia «sin gimnasio» y mi_gimnasio dice dueña en 1,5 s: el panel del gimnasio aparece solo: ' + JSON.stringify([antes, despues]));
    await pg.close();
  }
  // gize.ar/gimnasio → /app/#gimnasio; la dueña con #gimnasio entra a su panel (y el # se va).
  {
    const html = fs.readFileSync(new URL('../gimnasio/index.html', import.meta.url), 'utf8');
    t.ok(/http-equiv="refresh" content="0; url=\/app\/#gimnasio"/.test(html), 'gimnasio/index.html redirige a /app/#gimnasio');
    const pg = await entrar(base, DUENA, { url: '/gimnasio/', espera: 3500 });
    t.ok(/\/app\/$/.test(new URL(pg.p.url()).pathname) && (await enPanel(pg.p)).gym, 'gize.ar/gimnasio abre el panel de la dueña');
    t.eq(new URL(pg.p.url()).hash, '', 'el #gimnasio se saca de la dirección');
    await pg.close();
  }
}
