// Panel de administración → Avisos → «Resumen de los lunes para coaches» (supabase/resumen-semanal.sql
// y la función resumen-semanal): los números de la última semana (admin_resumen_semanal), prender
// (con confirmación que dice a cuántos coaches les llegaría y cuándo sale el próximo) y apagar
// (admin_resumen_semanal_config), el tope por día, «Ver cómo queda» (muestra con datos inventados,
// sin mandar nada) y «Mandármelo» (enviar: true, a tu propio mail), la etiqueta del registro de
// acciones, y qué pasa sin el SQL o sin la función publicada.
import { newPage, wait, text, ADMIN } from './lib.mjs';

// Relojes fijos (en el pasado: la sesión simulada vence una hora después de la hora real).
// Argentina es UTC-3 todo el año.
const JUEVES = Date.parse('2026-10-22T18:00:00Z');           // jueves 22/10, 15:00
const LUNES = Date.parse('2026-10-26T13:00:00Z');            // lunes 26/10, 10:00
const MARTES_TEMPRANO = Date.parse('2026-10-27T10:00:00Z');  // martes 27/10, 7:00
const MARTES_TARDE = Date.parse('2026-10-27T18:00:00Z');     // martes 27/10, 15:00
const MIERCOLES_TARDE = Date.parse('2026-10-28T18:00:00Z');  // miércoles 28/10, 15:00

// Lo que devuelve admin_resumen_semanal un jueves, apagado (la última semana resumida es la del 12/10).
const JUEVES_ST = { activo: false, tope_dia: 60, semana: '2026-10-12', en_ventana: false, proximo_lunes: '2026-10-26T09:00:00-03:00', cupo_hoy: 60,
  pendientes: 14, candidatos: 14, enviados: 11, con_mail: 10, con_aviso: 6, sin_novedades: 2, reintentar: 1, en_curso: 0, fallidos: 1, apagados: 3 };
// Y un lunes a las 10, dentro de la ventana (semana del 19/10), con 5 coaches que faltan.
const LUNES_ST = Object.assign({}, JUEVES_ST, { semana: '2026-10-19', en_ventana: true, proximo_lunes: '2026-11-02T09:00:00-03:00', pendientes: 5, enviados: 9, en_curso: 2 });

const MAIL = { subject: 'Tu semana: entrenaron 12 de tus 15 alumnos',
  html: '<div style="color:#0B0D11"><h2>Tu semana: entrenaron 12 de tus 15 alumnos</h2><p>Martina lleva 9 días sin entrenar</p><p><a href="https://gize.ar/app/">Abrir mi panel</a></p></div>',
  text: 'Tu semana' };

function manejadores(st, cfgs, fnBodies, extra){
  return Object.assign({
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_resumen_semanal_config': (r, J, i) => {
      const b = JSON.parse(i.body); cfgs.push(b);
      if (b.p_activo != null) st.activo = b.p_activo;
      if (b.p_tope != null) st.tope_dia = b.p_tope;
      return J(Object.assign({}, st));
    },
    '/admin_resumen_semanal': (r, J) => J(Object.assign({}, st)),
    '/functions/v1/resumen-semanal': (r, J, i) => { const b = JSON.parse(i.body || '{}'); fnBodies.push(b); return J(Object.assign({ ok: true }, b.enviar ? { enviado: true } : {}, MAIL)); },
  }, extra || {});
}
// Los avisos de abajo (toast) se van solos: se anotan al aparecer.
async function anotarToasts(p){
  const toasts = [];
  await p.exposeFunction('anotarToast', s => toasts.push(s));
  await p.evaluate(() => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains('toast') && window.anotarToast(n.textContent))))
    .observe(document.body, { childList: true }));
  return toasts;
}
const kpis = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#avRes .kpi')].map(k => [k.querySelector('span').textContent, k.querySelector('b').textContent])));
const llave = p => p.getAttribute('[data-a="resOn"]', 'aria-checked');
const ultima = preguntas => (preguntas[preguntas.length - 1] || {}).texto || '';
// Los scripts que la prueba agrega a cada página (la sesión, los carteles y el bloqueo del service
// worker de Playwright) también corren adentro del iframe de la muestra, y ahí fallan porque el
// iframe va aislado (sandbox, sin scripts propios): esos errores son de la prueba, no del panel.
const sinSandbox = errs => errs.filter(e => !/sandboxed and lacks the 'allow-same-origin' flag/.test(e));

export default async function ({ base, t }){
  // ===== Un jueves, apagado: los números, prender, el tope, la muestra y apagar =====
  {
    const st = Object.assign({}, JUEVES_ST), cfgs = [], fnBodies = [];
    const { p, errs, preguntas, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(st, cfgs, fnBodies) });
    await p.clock.setFixedTime(JUEVES);
    await p.goto(base + '/admin/#avisos'); await wait(1500);
    const toasts = await anotarToasts(p);

    t.has(await text(p, '#avResB > summary'), 'Resumen de los lunes para coaches', 'la tarjeta está en Avisos');
    t.eq(await text(p, '#avResB-s'), 'apagado', 'plegado dice que está apagado');
    t.eq(await llave(p), 'false', 'el interruptor arranca apagado');
    t.has(await text(p, '#avRes'), 'Apagado: no le llega a nadie.', 'dice qué quiere decir apagado');
    t.has(await text(p, '#avRes'), 'Semana del lunes 12 de octubre', 'dice de qué semana son los números');
    t.eq(await kpis(p), { 'Coaches con alumnos': '14', 'Enviados': '11', 'Sin novedades': '2', 'Por reintentar': '1', 'Fallidos': '1', 'Lo apagaron': '3' }, 'los números de admin_resumen_semanal');
    t.has(await text(p, '#avRes'), '10 con mail · 6 con aviso', 'enviados: con mail y con aviso');
    t.eq(await p.inputValue('#resTope'), '60', 'el tope por día de la base');

    // Prender, pero «Cancelar»: no cambia nada.
    p.contestar = false;
    await p.click('[data-a="resOn"]'); await wait(400);
    t.eq(cfgs, [], 'cancelar: no se prende');
    t.has(ultima(preguntas), 'Le llegaría a 14 coaches con alumnos', 'la pregunta dice a cuántos coaches les llegaría');
    t.has(ultima(preguntas), 'El próximo sale el lunes 26 de octubre a las 9, con un tope de 60 mails por día.', 'y cuándo sale el próximo, con el tope');
    t.eq(await llave(p), 'false', 'cancelar: sigue apagado');

    // Un tope que no es un número de 0 a 5000, o 0, no deja prenderlo (ni pregunta).
    p.contestar = true;
    const antes = preguntas.length;
    await p.fill('#resTope', 'abc'); await p.click('[data-a="resOn"]'); await wait(300);
    await p.fill('#resTope', '0'); await p.click('[data-a="resOn"]'); await wait(300);
    t.eq([cfgs.length, preguntas.length], [0, antes], 'tope inválido o 0: no pregunta ni prende');
    t.has(toasts.join(' | '), 'El tope va de 0 a 5000 mails por día.', 'avisa el tope inválido');
    t.has(toasts.join(' | '), 'Con el tope en 0 no sale ninguno', 'avisa el tope en 0');

    // Prender con el tope escrito.
    await p.fill('#resTope', '50');
    await p.click('[data-a="resOn"]'); await wait(500);
    t.eq(cfgs[0], { p_activo: true, p_tope: 50 }, 'prender llama a admin_resumen_semanal_config con el tope');
    t.has(ultima(preguntas), 'con un tope de 50 mails por día', 'la pregunta usa el tope escrito');
    t.eq(await llave(p), 'true', 'queda prendido');
    t.eq(await text(p, '#avResB-s'), 'prendido · 11 enviados', 'plegado dice prendido');
    t.has(await text(p, '#avRes'), 'Prendido: el próximo sale el lunes 26 de octubre a las 9.', 'dice cuándo sale el próximo');
    t.eq(await p.evaluate(() => document.activeElement && document.activeElement.dataset.a), 'resOn', 'el foco vuelve al interruptor');

    // Guardar el tope solo.
    await p.fill('#resTope', '6000'); await p.click('[data-a="resTope"]'); await wait(300);
    t.eq(cfgs.length, 1, 'tope de más de 5000: no se guarda');
    await p.fill('#resTope', '80'); await p.click('[data-a="resTope"]'); await wait(400);
    t.eq(cfgs[1], { p_activo: null, p_tope: 80 }, 'guardar el tope no toca el interruptor');
    t.eq(await p.inputValue('#resTope'), '80', 'queda el tope nuevo');
    t.eq(await llave(p), 'true', 'sigue prendido');

    // «Ver cómo queda»: pide la muestra sin mandar nada y la muestra en un iframe sin scripts.
    await p.click('[data-a="resVer"]'); await wait(600);
    t.eq(fnBodies[0], { action: 'muestra' }, '«Ver cómo queda» no manda nada');
    t.has(await text(p, '#resMuestra'), 'Asunto: Tu semana: entrenaron 12 de tus 15 alumnos', 'muestra el asunto');
    const fr = p.frameLocator('#resMuestra iframe');
    t.has(await fr.locator('body').innerText(), 'Martina lleva 9 días sin entrenar', 'muestra el mail que devuelve la función');
    t.eq(await fr.locator('base').getAttribute('target'), '_blank', 'los links del mail se abren en otra pestaña');
    const sandbox = await p.getAttribute('#resMuestra iframe', 'sandbox');
    t.ok(sandbox !== null && !/allow-scripts|allow-same-origin/.test(sandbox), 'el iframe va sin scripts (sandbox): ' + sandbox);

    // «Mandármelo»: con enviar, a tu propio mail.
    await p.click('[data-a="resMandar"]'); await wait(600);
    t.eq(fnBodies[1], { action: 'muestra', enviar: true }, '«Mandármelo» pide mandarlo');
    t.eq(fnBodies.length, 2, 'una llamada por botón');
    t.has(toasts.join(' | '), 'Listo: te lo mandamos a admin@prueba.test', 'avisa a qué mail lo mandó');

    // Apagar (un jueves no hay nada en curso: no habla de frenar).
    await p.click('[data-a="resOn"]'); await wait(500);
    t.has(ultima(preguntas), '¿Apagar el resumen de los lunes?', 'apagar pregunta');
    t.ok(!ultima(preguntas).includes('Frena'), 'fuera de la ventana no dice que frena algo');
    t.eq(cfgs[2], { p_activo: false, p_tope: null }, 'apagar no toca el tope');
    t.eq(await llave(p), 'false', 'queda apagado');
    t.ok(!!(await p.$('#resMuestra iframe')), 'la muestra sigue a la vista después de apagar');
    t.eq(sinSandbox(errs), [], 'errores de la página');
    await close();
  }

  // ===== Cuándo sale el próximo, según el día y la hora (prendido) =====
  {
    const st = Object.assign({}, LUNES_ST, { activo: true }), cfgs = [], fnBodies = [];
    const { p, errs, preguntas, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(st, cfgs, fnBodies) });
    await p.clock.setFixedTime(LUNES);
    await p.goto(base + '/admin/#avisos'); await wait(1500);
    t.has(await text(p, '#avRes'), 'Prendido: el próximo sale hoy, en los próximos minutos.', 'lunes 10:00 con coaches pendientes: sale ahora');
    t.has(await text(p, '#avRes'), 'Esta semana faltan 5.', 'cuántos faltan esta semana');
    t.has(await text(p, '#avRes'), 'Saliendo ahora: 2.', 'cuántos están saliendo');
    t.has(await text(p, '#avRes'), 'Hoy quedan 60.', 'cuántos entran hoy en el tope');
    // Apagar en la ventana avisa que frena lo que falta (y «Cancelar» no lo apaga).
    p.contestar = false;
    await p.click('[data-a="resOn"]'); await wait(400);
    t.has(ultima(preguntas), 'Frena lo que falta mandar esta semana (5 coaches).', 'apagar en la ventana: frena lo que falta');
    t.eq(cfgs, [], 'cancelar: no se apaga');
    const casos = [
      [LUNES, { cupo_hoy: 0 }, 'mañana a las 9', 'lunes sin lugar en el tope'],
      [LUNES, { pendientes: 0 }, 'el lunes 2 de noviembre a las 9', 'lunes sin coaches pendientes'],
      [MARTES_TEMPRANO, {}, 'hoy a las 9', 'martes a las 7'],
      [MARTES_TARDE, {}, 'mañana a las 9', 'martes a las 15'],
      [MIERCOLES_TARDE, {}, 'el lunes 2 de noviembre a las 9', 'miércoles a las 15 (ya no sale esta semana)'],
    ];
    for (const [hora, cambio, esperado, msg] of casos){
      Object.assign(st, LUNES_ST, { activo: true }, cambio);
      await p.clock.setFixedTime(hora);
      await p.click('[data-go="avisos"]'); await wait(800);
      t.has(await text(p, '#avRes'), 'Prendido: el próximo sale ' + esperado + '.', msg);
    }
    // Apagado y en la ventana: prender dice cuántos faltan y que sale ahora.
    Object.assign(st, LUNES_ST, { activo: false });
    await p.clock.setFixedTime(LUNES);
    await p.click('[data-go="avisos"]'); await wait(800);
    await p.click('[data-a="resOn"]'); await wait(400);
    t.has(ultima(preguntas), 'Le llegaría a 14 coaches con alumnos (esta semana faltan 5)', 'prender en la ventana: cuántos faltan');
    t.has(ultima(preguntas), 'El próximo sale hoy, en los próximos minutos', 'prender en la ventana: sale ahora');
    t.eq(errs, [], 'cuándo sale: errores de la página');
    await close();
  }

  // ===== El registro de acciones =====
  {
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(true),
      '/admin_contact_unread': (r, J) => J(0),
      '/admin_audit_list': (r, J) => J([{ created_at: new Date(JUEVES).toISOString(), admin_name: 'Admin', action: 'resumen_semanal', target: null, detail: { activo: true, tope_dia: 60 } }]),
    } });
    await p.clock.setFixedTime(JUEVES);
    await p.goto(base + '/admin/#seguridad'); await wait(1500);
    t.has(await text(p, '#aud'), 'Cambió el resumen de los lunes', 'el registro dice qué se cambió');
    t.has(await text(p, '#aud'), 'prendido · tope 60 por día', 'y cómo quedó');
    t.eq(errs, [], 'registro: errores de la página');
    await close();
  }

  // ===== Sin el SQL en la base: dice qué correr y el resto de Avisos sigue andando =====
  {
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(true),
      '/admin_contact_unread': (r, J) => J(0),
      '/admin_resumen_semanal': (r, J) => J({ code: 'PGRST202', message: 'Could not find the function public.admin_resumen_semanal without parameters in the schema cache' }, 404),
    } });
    await p.goto(base + '/admin/#avisos'); await wait(1500);
    t.has(await text(p, '#avRes'), 'supabase/resumen-semanal.sql', 'sin el SQL: dice qué correr');
    t.ok(!(await p.$('[data-a="resOn"]')), 'sin el SQL: no hay interruptor');
    t.ok(await p.isVisible('#avTitle'), 'sin el SQL: la notificación a los usuarios sigue');
    t.eq(errs, [], 'sin el SQL: errores de la página');
    await close();
  }

  // ===== La función sin publicar, o una cuenta que no es admin para la función =====
  {
    const st = Object.assign({}, JUEVES_ST), cfgs = [], fnBodies = [];
    let resp = { status: 404, body: { code: 'NOT_FOUND', message: 'Requested function was not found' } };
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(st, cfgs, fnBodies, {
      '/functions/v1/resumen-semanal': (r, J) => J(resp.body, resp.status),
    }) });
    await p.clock.setFixedTime(JUEVES);
    await p.goto(base + '/admin/#avisos'); await wait(1500);
    const toasts = await anotarToasts(p);
    await p.click('[data-a="resVer"]'); await wait(600);
    t.has(toasts.join(' | '), 'La función resumen-semanal todavía no está publicada', 'sin la función: dice qué hacer');
    resp = { status: 403, body: { error: 'Solo administradores.' } };
    await p.click('[data-a="resMandar"]'); await wait(600);
    t.has(toasts.join(' | '), 'Solo administradores.', 'el error que devuelve la función');
    t.ok(!(await p.$('#resMuestra iframe')), 'sin muestra no queda un iframe vacío');
    t.eq(await p.isEnabled('[data-a="resMandar"]'), true, 'el botón se puede volver a tocar');
    t.eq(errs, [], 'sin la función: errores de la página');
    await close();
  }

  // ===== En el celular: la tarjeta y la muestra no corren la página de costado =====
  {
    const st = Object.assign({}, JUEVES_ST), cfgs = [], fnBodies = [];
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 390, height: 844 }, touch: true, handlers: manejadores(st, cfgs, fnBodies) });
    await p.clock.setFixedTime(JUEVES);
    await p.goto(base + '/admin/#avisos'); await wait(1500);
    await p.click('[data-a="resVer"]'); await wait(600);
    t.ok(await p.isVisible('#resMuestra iframe'), '390 px: se ve la muestra');
    t.eq(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '390 px: la página no se corre de costado');
    t.eq(sinSandbox(errs), [], '390 px: errores de la página');
    await close();
  }
}
