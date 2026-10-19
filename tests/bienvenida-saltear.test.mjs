// Bienvenida salteando todo lo del cuerpo («Prefiero no decir» y «Ahora no» en cada paso): no se
// guarda nada inventado. Las ruedas arrancan en un valor de ejemplo (70 kg, 170 cm, 25 años) que
// no cuenta como respuesta: hasta moverlas «Continuar» no anda y, salteadas, no llegan a la meta
// de Comida ni al peso de hoy. Queda anotado que ya se le preguntó (bodyAsked, así otro
// dispositivo no vuelve a preguntar) y los días por semana de la rutina que eligió.
import { newPage, wait, saved, text, ALUMNO, perfil, onbPaso, onbSiguiente, onbAhoraNo } from './lib.mjs';

const ordenado = o => Object.keys(o || {}).sort().reduce((x, k) => { x[k] = o[k]; return x; }, {});

export default async function ({ base, t }){
  const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
  const pesos = [];
  const { p, errs, close } = await newPage({ user: NUEVO, handlers: { '/profiles': perfil('client'),
    '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined,
    '/body_weights': (r, J, i) => { if (i.m !== 'GET') pesos.push(i.body); return undefined; } } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('[data-onb="start"]'); await wait(300);
  await p.click('[data-onb="dskip"]'); await wait(250);
  await p.click('[data-onb="solo"]'); await wait(250);
  t.eq((await onbPaso(p)).titulo, '¿Cuál es tu sexo?', 'sexo');
  t.ok(!(await p.$('#authHost [data-onb="later"]')), 'el sexo no tiene «Ahora no» (está «Prefiero no decir»)');
  t.has(await text(p, '[data-onb="sex"][data-v="x"]'), 'Te mostramos todas las rutinas', '«Prefiero no decir» explica qué rutinas ve');
  await p.click('[data-onb="sex"][data-v="x"]'); await onbSiguiente(p);
  for (const [paso, titulo] of [['nac', '¿Cuándo es tu cumpleaños?'], ['altura', '¿Cuánto medís?'], ['peso', '¿Cuánto pesás?']]){
    t.eq((await onbPaso(p)).titulo, titulo, paso + ': el paso');
    t.eq(await p.$eval('#authHost .onb-main', b => b.disabled), true, paso + ': sin mover la rueda, «Continuar» no anda');
    t.ok(await p.isVisible('#authHost .onb-hint'), paso + ': y la ayuda se ve');
    await onbAhoraNo(p);
  }
  for (let i = 0; i < 3; i++) await onbAhoraNo(p); // objetivo, actividad, experiencia
  t.eq(await onbPaso(p), { n: '10/11', titulo: '¿Cómo querés arrancar?' }, 'llega a cómo arrancar');
  await onbSiguiente(p); await wait(400);
  t.eq(await p.getAttribute('[data-onb="dias"][data-v="0"]', 'aria-pressed'), 'true', 'sin experiencia, el filtro arranca en «Todas»');
  const l = await p.$$eval('.onb-routine b', x => x.map(b => b.innerText.trim()));
  t.ok(l.some(n => /Glúteos/.test(n)) && l.some(n => /PPL/.test(n)), '«Prefiero no decir»: todas las rutinas: ' + l.join(', '));
  await p.click('.onb-routine:has-text("PPL")'); await wait(200);
  await onbSiguiente(p); await wait(1500);
  t.ok(!(await p.isVisible('#authHost .onb-card')), 'se cierra la bienvenida');

  const st = await saved(p);
  const n = st.days.filter(d => d.exercises.length).length;
  t.eq(ordenado(st.calProfile), ordenado({ bodyAsked: true, daysPerWeek: n }), 'calProfile: solo que ya se le preguntó y los días por semana');
  t.eq(st.calTarget, null, 'sin meta de calorías');
  t.eq(st.weights, [], 'sin peso de hoy');
  t.eq(pesos, [], 'no se sube ningún peso');
  t.eq([st.sex, st.stepsGoal], ['x', 10000], 'sexo «Prefiero no decir» para las rutinas y la meta de pasos de siempre');
  await p.click('#nav-comida'); await wait(500);
  t.has(await text(p, '#view'), 'Configurá tu meta', 'Comida sigue pidiendo configurar la meta');
  t.eq(errs, [], 'errores de la página');
  await close();
}
