// Bienvenida al estilo de Aera (app/screens/onboarding.js): una pregunta por pantalla, con la
// flecha para volver, la barra de avance y «n/N» arriba y «Continuar» fijo abajo. Camino de quien
// entrena por su cuenta y elige una rutina armada (11 pasos): disciplina, código del coach, sexo,
// cumpleaños, estatura, peso (las tres con ruedas), objetivo, actividad, experiencia, cómo
// arrancar y la rutina. Lo que contesta completa la meta de Comida (calProfile y calTarget, con la
// fórmula de Comida), anota el peso de hoy (Progreso, «Tu peso») y pone la meta de pasos según la
// actividad; la experiencia deja sugeridos los días de la lista (y de «Ver rutinas armadas»).
// También el camino de «Empezar vacío» (12 pasos: días por semana y el nombre del primer día) y
// «Prefiero arrancar vacío» desde la lista.
import { newPage, wait, saved, text, ALUMNO, perfil, onbPaso, onbSiguiente, onbAhoraNo } from './lib.mjs';

const NUEVO = () => Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
const ordenado = o => Object.keys(o || {}).sort().reduce((x, k) => { x[k] = o[k]; return x; }, {});
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

function pagina(viewport){
  const posts = { prefs: [], pesos: [] };
  const pg = newPage({ user: NUEVO(), viewport, handlers: { '/profiles': perfil('client'),
    '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined,
    '/client_prefs': (r, J, i) => { if (i.m !== 'GET') posts.prefs.push(JSON.parse(i.body)); return undefined; },
    '/body_weights': (r, J, i) => { if (i.m !== 'GET') posts.pesos.push(JSON.parse(i.body)); return undefined; } } });
  return pg.then(x => Object.assign(x, { posts }));
}
const foco = p => p.evaluate(() => (document.activeElement || {}).id || '');
const principal = p => p.$eval('#authHost .onb-main', b => ({ txt: b.textContent, dis: b.disabled, op: getComputedStyle(b).opacity }));

export default async function ({ base, t }){
  // 1) Rutina armada: los 11 pasos.
  {
    const { p, errs, posts, close } = await pagina({ width: 390, height: 844 });
    await p.goto(base + '/app/'); await wait(2500);
    t.ok(/Bienvenido/.test(await text(p, '#authHost')), 've la bienvenida');
    t.has(await text(p, '#authHost'), 'Te hacemos unas preguntas cortas', 'la bienvenida dice qué viene');
    t.eq(await p.evaluate(() => document.querySelector('#authHost .onb-head').getClientRects().length), 0, 'la bienvenida no tiene cabecera');
    await p.click('[data-onb="start"]'); await wait(300);

    // Disciplina (1/11): sin elegir nada, «Continuar» pálido y deshabilitado; sin flecha para volver.
    t.eq(await onbPaso(p), { n: '1/11', titulo: '¿Qué entrenás?' }, '1/11: disciplina');
    t.eq(await p.evaluate(() => document.querySelector('#authHost .onb-back').getClientRects().length), 0, '1/11: la flecha para volver no se dibuja');
    t.eq(await foco(p), 'onbTit', '1/11: el foco va al título');
    t.eq(await principal(p), { txt: 'Continuar', dis: true, op: '0.45' }, '1/11: «Continuar» deshabilitado y pálido');
    await p.click('[data-onb="disc"][data-v="fuerza"]'); await wait(150);
    t.eq((await principal(p)).dis, false, '1/11: elegida una, se habilita');
    await onbSiguiente(p);

    t.eq(await onbPaso(p), { n: '2/11', titulo: '¿Tenés un código de tu coach?' }, '2/11: código del coach');
    await p.click('[data-onb="solo"]'); await wait(300);
    t.eq(await onbPaso(p), { n: '3/11', titulo: '¿Cuál es tu sexo?' }, '3/11: sexo');
    t.eq(await p.getAttribute('#authHost .onb-prog', 'aria-valuetext'), 'Paso 3 de 11', 'la barra de avance dice el paso');
    t.eq(await foco(p), 'onbTit', '3/11: el foco va al título');
    // Atrás: vuelve un paso y lo elegido sigue ahí.
    await p.click('[data-onb="back"]'); await wait(250);
    t.eq((await onbPaso(p)).n, '2/11', 'atrás: 2/11');
    await p.click('[data-onb="back"]'); await wait(250);
    t.eq((await onbPaso(p)).n, '1/11', 'atrás: 1/11');
    t.eq(await p.getAttribute('[data-onb="disc"][data-v="fuerza"]', 'aria-pressed'), 'true', 'atrás: la disciplina sigue elegida');
    await onbSiguiente(p);
    await p.click('[data-onb="solo"]'); await wait(300);

    await p.click('[data-onb="sex"][data-v="f"]'); await wait(150);
    await onbSiguiente(p);

    // Cumpleaños (4/11): hasta mover una rueda, «Continuar» no anda y la ayuda dice qué hacer.
    t.eq(await onbPaso(p), { n: '4/11', titulo: '¿Cuándo es tu cumpleaños?' }, '4/11: cumpleaños');
    t.eq((await principal(p)).dis, true, '4/11: sin tocar las ruedas, «Continuar» deshabilitado');
    t.ok(await p.isVisible('#authHost .onb-hint'), '4/11: se ve la ayuda');
    t.has(await text(p, '#authHost .onb-hint'), 'Mové las ruedas', '4/11: la ayuda dice qué hacer');
    await p.focus('#onbAnio');
    for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowDown');
    await wait(900);
    t.eq(await text(p, '#authHost .onb-edad'), '30 años', '4/11: cinco años antes, 30 años');
    t.has(await p.getAttribute('#onbAnio', 'aria-valuetext'), '30 años', '4/11: el año le dice la edad al lector de pantalla');
    t.eq((await principal(p)).dis, false, '4/11: tocada la rueda, se habilita');
    t.ok(!(await p.isVisible('#authHost .onb-hint')), '4/11: y la ayuda se va');
    await onbSiguiente(p);

    // Estatura (5/11): la rueda movida a mano (como el dedo).
    t.eq(await onbPaso(p), { n: '5/11', titulo: '¿Cuánto medís?' }, '5/11: estatura');
    await p.$eval('#onbAltura', e => { e.scrollTop = 45 * 44; e.dispatchEvent(new Event('scroll')); });
    await wait(500);
    t.eq(await p.getAttribute('#onbAltura', 'aria-valuetext'), '165 cm', '5/11: 165 cm');
    await onbSiguiente(p);

    // Peso (6/11): de 70 kg, cinco veces ↑ = 72,5 kg.
    t.eq(await onbPaso(p), { n: '6/11', titulo: '¿Cuánto pesás?' }, '6/11: peso');
    t.has(await text(p, '#authHost .onb-text'), 'Lo guardamos en Progreso', '6/11: dice que lo guarda en Progreso');
    await p.focus('#onbPeso');
    for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowUp');
    await wait(900);
    t.eq(await p.getAttribute('#onbPeso', 'aria-valuetext'), '72,5 kg', '6/11: 72,5 kg');
    await onbSiguiente(p);

    t.eq(await onbPaso(p), { n: '7/11', titulo: '¿Cuál es tu objetivo principal?' }, '7/11: objetivo');
    await p.click('[data-onb="goal"][data-v="grasa"]'); await onbSiguiente(p);
    t.eq(await onbPaso(p), { n: '8/11', titulo: 'Tu nivel de actividad' }, '8/11: actividad');
    await p.click('[data-onb="act"][data-v="lig"]'); await onbSiguiente(p);
    t.eq(await onbPaso(p), { n: '9/11', titulo: 'Tu experiencia entrenando' }, '9/11: experiencia');
    await p.click('[data-onb="nivel"][data-v="principiante"]'); await onbSiguiente(p);
    t.eq(await onbPaso(p), { n: '10/11', titulo: '¿Cómo querés arrancar?' }, '10/11: cómo arrancar');
    await onbSiguiente(p); await wait(400);

    // La lista (11/11): sugiere 3 días por ser principiante; tocar una la elige y «Empezar» la carga.
    t.eq(await onbPaso(p), { n: '11/11', titulo: 'Elegí tu rutina' }, '11/11: la lista');
    t.eq(await p.getAttribute('[data-onb="dias"][data-v="3"]', 'aria-pressed'), 'true', '11/11: el filtro arranca en 3 días');
    t.has(await text(p, '#authHost .onb-body'), 'Te sugerimos rutinas de 3 días por tu experiencia.', '11/11: dice por qué');
    t.eq(await principal(p), { txt: 'Empezar', dis: true, op: '0.45' }, '11/11: «Empezar» deshabilitado hasta elegir una');
    await p.click('.onb-routine:has-text("Cuerpo completo · 3 días")'); await wait(200);
    t.eq((await principal(p)).dis, false, '11/11: elegida, se habilita');
    await p.click('[data-onb="next"]'); await wait(2000);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'se cierra la bienvenida');

    const r = await p.evaluate(async () => {
      const { state } = await import('/app/core/state.js'), c = await import('/app/screens/comida.js');
      return { cp: state.calProfile, t: state.calTarget, calc: c.calcTarget(state.calProfile), w: state.weights.map(x => ({ date: x.date, kg: x.kg })), sex: state.sex, pasos: state.stepsGoal,
        visto: Object.keys(localStorage).filter(k => /^gize_onb_/.test(k)) };
    });
    t.eq(ordenado(r.cp), ordenado({ sex: 'f', age: '30', height: '165', weight: '72.5', activity: 'lig', goal: 'bajar', trainGoal: 'grasa', level: 'principiante', daysPerWeek: 3, bodyAsked: true }), 'calProfile con todo lo que contestó');
    t.ok(r.t > 1000 && r.t === r.calc, 'la meta de calorías sale de la fórmula de Comida: ' + r.t);
    t.eq(r.w, [{ date: hoy(), kg: 72.5 }], 'el peso de hoy');
    t.eq([r.sex, r.pasos], ['f', 8000], 'sexo para las rutinas y meta de pasos de «Ligero»');
    t.eq(r.visto, ['gize_onb_' + ALUMNO.id], 'queda vista y sin borrador');
    const pr = posts.prefs[posts.prefs.length - 1] || {};
    t.eq(ordenado(pr.cal_profile), ordenado(r.cp), 'se sube calProfile');
    t.eq([pr.cal_target, pr.steps_goal], [r.t, 8000], 'con la meta y los pasos');
    t.ok(posts.pesos.some(b => b.measured_on === hoy() && b.kg === 72.5), 'el peso de hoy se sube: ' + JSON.stringify(posts.pesos));

    // Comida: el anillo de la meta, y «Editar meta» con lo que contestó.
    await p.click('#nav-comida'); await wait(500);
    t.ok(!/Configurá tu meta/.test(await text(p, '#view')), 'Comida ya tiene la meta (no pide configurarla)');
    await p.click('[data-action="cal-open"]'); await wait(400);
    const form = await p.evaluate(() => ({ on: [...document.querySelectorAll('#view .seg button.on')].map(b => b.textContent.trim()),
      campos: ['age', 'height', 'weight'].map(k => (document.querySelector('#view [data-field="' + k + '"]') || {}).value) }));
    t.eq(form, { on: ['Mujer', 'Ligero', 'Bajar grasa'], campos: ['30', '165', '72.5'] }, '«Editar meta» viene completo');
    await p.click('[data-action="cal-cancel"]'); await wait(300);
    // Progreso: «Tu peso».
    await p.click('#nav-progreso'); await wait(500);
    t.has(await text(p, '#view'), 'Hoy: 72,5 kg', 'Progreso muestra el peso de hoy');
    // Entreno → «Ver rutinas armadas»: el filtro arranca en sus 3 días.
    await p.click('#nav-entreno'); await wait(500);
    await p.click('.load-def[data-action="open-routines"]'); await wait(800);
    t.eq(await p.getAttribute('[data-onb="dias"][data-v="3"]', 'aria-pressed'), 'true', '«Ver rutinas armadas» arranca en 3 días');
    await p.click('[data-onb="cancel"]'); await wait(300);
    t.eq(errs, [], 'rutina armada: errores de la página');
    await close();
  }

  // 2) Empezar vacío: 12 pasos; los días sugeridos por la experiencia y el nombre del primer día.
  {
    const { p, errs, close } = await pagina({ width: 390, height: 844 });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(250);
    await p.click('[data-onb="solo"]'); await wait(250);
    await p.click('[data-onb="sex"][data-v="m"]'); await onbSiguiente(p);
    for (let i = 0; i < 5; i++) await onbAhoraNo(p); // cumpleaños … actividad
    await p.click('[data-onb="nivel"][data-v="principiante"]'); await onbSiguiente(p);
    t.eq((await onbPaso(p)).n, '10/11', 'vacío: cómo arrancar, 10/11 con la rutina armada');
    await p.click('[data-onb="arranque"][data-v="vacio"]'); await wait(150);
    t.eq((await onbPaso(p)).n, '10/12', 'vacío: al elegir «Empezar vacío» son 12 pasos');
    await onbSiguiente(p);
    t.eq(await onbPaso(p), { n: '11/12', titulo: '¿Cuántos días por semana vas a entrenar?' }, 'vacío: días por semana');
    t.eq(await p.getAttribute('[data-onb="days"][data-v="3"]', 'aria-pressed'), 'true', 'vacío: sugiere 3 (principiante)');
    await p.click('[data-onb="days"][data-v="5"]'); await wait(150);
    await onbSiguiente(p);
    t.eq(await onbPaso(p), { n: '12/12', titulo: '¿Cómo se llama tu primer día?' }, 'vacío: nombre del primer día');
    t.eq(await p.$eval('#authHost .onb-main', b => b.textContent), 'Empezar', 'vacío: el último dice «Empezar»');
    await p.fill('#onbFirst', 'Piernas');
    await p.press('#onbFirst', 'Enter'); await wait(1200);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'vacío: se cierra la bienvenida');
    const st = await saved(p);
    t.eq(st.days.map(d => d.name), ['Piernas', 'Día 2', 'Día 3', 'Día 4', 'Día 5'], 'vacío: 5 días, el primero con su nombre');
    t.eq(ordenado(st.calProfile), ordenado({ sex: 'm', level: 'principiante', bodyAsked: true, daysPerWeek: 5 }), 'vacío: calProfile con lo que contestó y los días');
    t.eq(errs, [], 'vacío: errores de la página');
    await close();
  }

  // 3) «Prefiero arrancar vacío» desde la lista lleva a los días; Atrás vuelve a cómo arrancar, con vacío elegido.
  {
    const { p, errs, close } = await pagina({ width: 390, height: 844 });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(250);
    await p.click('[data-onb="solo"]'); await wait(250);
    await p.click('[data-onb="sex"][data-v="x"]'); await onbSiguiente(p);
    for (let i = 0; i < 6; i++) await onbAhoraNo(p);
    await onbSiguiente(p); await wait(400);
    t.eq((await onbPaso(p)).n, '11/11', 'lista: 11/11');
    await p.click('[data-onb="empty"]'); await wait(300);
    t.eq(await onbPaso(p), { n: '11/12', titulo: '¿Cuántos días por semana vas a entrenar?' }, '«Prefiero arrancar vacío»: los días, 11/12');
    t.eq(await p.getAttribute('[data-onb="days"][data-v="4"]', 'aria-pressed'), 'true', 'sin experiencia, sugiere 4');
    await p.click('[data-onb="back"]'); await wait(300);
    t.eq(await onbPaso(p), { n: '10/12', titulo: '¿Cómo querés arrancar?' }, 'atrás: cómo arrancar');
    t.eq(await p.getAttribute('[data-onb="arranque"][data-v="vacio"]', 'aria-pressed'), 'true', 'atrás: con «Empezar vacío» elegido');
    t.eq(errs, [], 'desde la lista: errores de la página');
    await close();
  }
}
