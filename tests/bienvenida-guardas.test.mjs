// Bienvenida (app/screens/onboarding.js): los cuidados con lo que ya está en la cuenta y con el
// lector de pantalla.
//   · La ficha del coach (edad y estatura) cuenta como respondida. Su meta de pasos manda: la
//     actividad no la cambia y la pregunta no la promete.
//   · El peso que arranca en un dato real (su último peso, de hace días) y no se toca no se anota
//     hoy: ahí no promete Progreso y la ayuda dice cómo anotarlo. Tocando la rueda, sí.
//   · Una meta de pasos propia (otra que la de siempre, 10.000) no se pisa.
//   · «Cargando rutinas…» (lo que oye el lector de pantalla) no queda dicho con la lista ya puesta.
//   · El Tab no sale de la tarjeta.
import { newPage, wait, text, ALUMNO, perfil, onbPaso, onbSiguiente, onbAhoraNo, onbSinCuerpo } from './lib.mjs';

const COACH_ID = '33333333-3333-3333-3333-333333333333';
const NUEVO = () => Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
const ymd = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
const RUTINAS = { '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined };
const estado = p => p.evaluate(async () => { const { state } = await import('/app/core/state.js'); return { cp: state.calProfile, pasos: state.stepsGoal, w: state.weights.map(x => ({ date: x.date, kg: x.kg })) }; });

// Ya vinculado, con la ficha del coach (35 años, 172 cm, 9.000 pasos) y un peso de hace 3 días.
function conFicha(){
  const pesos = [], ficha = { client_id: ALUMNO.id, age: 35, height_cm: 172, steps_goal: 9000 };
  const viejo = { id: 'w0', client_id: ALUMNO.id, measured_on: ymd(new Date(Date.now() - 3 * 864e5)), kg: 77.3 };
  return newPage({ user: NUEVO(), handlers: Object.assign({
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: COACH_ID }; return J(i.one ? me : [me]); },
    '/client_info': (r, J, i) => i.m === 'GET' ? J(i.one ? ficha : [ficha]) : undefined,
    '/body_weights': (r, J, i) => { if (i.m === 'GET') return J([viejo]); pesos.push(JSON.parse(i.body)); return undefined; },
  }, RUTINAS) }).then(pg => Object.assign(pg, { pesos }));
}
async function hastaElPeso(p){
  await p.click('[data-onb="start"]'); await wait(300);
  await p.click('[data-onb="dskip"]'); await wait(250);
  await p.click('[data-onb="sex"][data-v="m"]'); await onbSiguiente(p);
}
const listo = p => p.$eval('#authHost .onb-main', b => !b.disabled);

export default async function ({ base, t }){
  // 1) La ficha del coach y un peso de hace días, sin tocar nada.
  {
    const pg = await conFicha(), p = pg.p;
    await p.goto(base + '/app/'); await wait(2500);
    await hastaElPeso(p);
    t.eq([await text(p, '#authHost .onb-edad'), await listo(p)], ['35 años', true], 'ficha: la edad cuenta como respondida');
    await onbSiguiente(p);
    t.eq([await p.getAttribute('#onbAltura', 'data-v'), await listo(p)], ['172', true], 'ficha: la estatura también');
    await onbSiguiente(p);
    t.eq(await onbPaso(p), { n: '5/7', titulo: '¿Cuánto pesás?' }, 'el peso');
    t.eq([await p.getAttribute('#onbPeso', 'data-v'), await listo(p)], ['77.5', true], 'arranca en su último peso (cuenta como respondido)');
    t.eq(await text(p, '#authHost .onb-body .onb-text'), 'Lo usamos para calcular tus calorías.', 'sin tocarlo no promete Progreso (no se anota hoy)');
    t.eq(await text(p, '#authHost .onb-hint'), 'Mové la rueda o tocá el número del medio para anotarlo hoy en Progreso.', 'y la ayuda dice cómo anotarlo');
    await onbSiguiente(p);
    await p.click('[data-onb="goal"][data-v="salud"]'); await onbSiguiente(p);
    t.eq(await text(p, '#authHost .onb-body .onb-text'), 'Con esto calculamos cuántas calorías gastás por día.', 'ficha con pasos: la actividad no promete la meta de pasos');
    await p.click('[data-onb="act"][data-v="muy"]'); await onbSiguiente(p); await wait(2500);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'termina');
    const e = await estado(p);
    t.eq([e.cp.age, e.cp.height, e.cp.weight], ['35', '172', '77.5'], 'la meta usa la ficha y su último peso');
    t.eq(e.pasos, 10000, 'la meta de pasos no la cambia la bienvenida (manda la de la ficha)');
    t.eq([e.w.length, pg.pesos.length], [1, 0], 'sin tocar la rueda, no se anota ni se sube un peso de hoy');
    t.eq(pg.errs, [], 'ficha: errores de la página');
    await pg.close();
  }

  // 2) Lo mismo, pero toca la rueda: ahí sí promete Progreso y lo anota.
  {
    const pg = await conFicha(), p = pg.p;
    await p.goto(base + '/app/'); await wait(2500);
    await hastaElPeso(p);
    await onbSiguiente(p); await onbSiguiente(p);
    await p.click('#onbPeso .rd-item.on'); await wait(300);
    t.eq(await text(p, '#authHost .onb-body .onb-text'), 'Lo guardamos en Progreso y tu coach lo ve.', 'tocada la rueda, promete Progreso');
    t.eq(await text(p, '#authHost .onb-hint'), '', 'y la ayuda se va');
    await onbSiguiente(p); await onbAhoraNo(p); await onbAhoraNo(p); await wait(2500);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'tocada: termina');
    t.ok((await estado(p)).w.some(x => x.date === ymd(new Date()) && x.kg === 77.5), 'tocada: el peso de hoy, 77,5');
    t.ok(pg.pesos.some(b => (Array.isArray(b) ? b : [b]).some(x => x.kg === 77.5)), 'tocada: y se sube');
    t.eq(pg.errs, [], 'tocada: errores de la página');
    await pg.close();
  }

  // 3) Una meta de pasos propia (7.000) no se pisa con la de la actividad.
  {
    const prefs = { client_id: ALUMNO.id, steps_goal: 7000 };
    const { p, errs, close } = await newPage({ user: NUEVO(), handlers: Object.assign({ '/profiles': perfil('client'),
      '/client_prefs': (r, J, i) => i.m === 'GET' ? J(i.one ? prefs : [prefs]) : undefined }, RUTINAS) });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(250);
    await p.click('[data-onb="solo"]'); await wait(250);
    await p.click('[data-onb="sex"][data-v="m"]'); await onbSiguiente(p);
    for (let i = 0; i < 4; i++) await onbAhoraNo(p);
    t.eq((await onbPaso(p)).titulo, 'Tu nivel de actividad', 'la actividad');
    await p.click('[data-onb="act"][data-v="muy"]'); await onbSiguiente(p); await onbAhoraNo(p); await wait(300);
    t.eq((await estado(p)).pasos, 7000, 'la meta de pasos propia queda en 7.000');
    t.eq(errs, [], 'pasos propios: errores de la página');
    await close();
  }

  // 4) «Cargando rutinas…»: al elegir para quién son las rutinas se avisa, pero con la lista ya
  //    puesta no queda dicho (en la bienvenida y en «Ver rutinas armadas» desde Entreno).
  {
    const { p, errs, close } = await newPage({ user: NUEVO(), handlers: Object.assign({ '/profiles': perfil('client') }, RUTINAS) });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(250);
    await p.click('[data-onb="solo"]'); await wait(250);
    await onbSinCuerpo(p, 'm');
    await onbSiguiente(p); await wait(800);
    t.eq((await onbPaso(p)).titulo, 'Elegí tu rutina', 'la lista');
    await p.click('[data-onb="sexagain"]'); await wait(300);
    await p.click('[data-onb="sex"][data-v="f"]'); await wait(800);
    const r = await p.evaluate(() => ({ t: document.querySelector('#onbTit').textContent, sr: document.querySelector('#authHost .onb-sr').textContent, n: document.querySelectorAll('.onb-routine').length }));
    t.ok(r.t === 'Elegí tu rutina' && r.n > 0 && r.sr === '', 'bienvenida: de vuelta en la lista, ya no dice «Cargando rutinas…»: ' + JSON.stringify(r));
    t.eq(errs, [], 'cargando (bienvenida): errores de la página');
    await close();
  }
  {
    const viejo = Object.assign({}, ALUMNO, { created_at: new Date(Date.now() - 30 * 864e5).toISOString() });
    const { p, errs, close } = await newPage({ user: viejo, handlers: Object.assign({ '/profiles': perfil('client') }, RUTINAS) });
    await p.goto(base + '/app/'); await wait(2500);
    await p.evaluate(async () => (await import('/app/screens/onboarding.js')).openRoutinePicker()); await wait(300);
    await p.click('#authHost [data-onb="sex"][data-v="m"]'); await wait(1500);
    const r = await p.evaluate(() => ({ t: document.querySelector('#onbTit').textContent, sr: document.querySelector('#authHost .onb-sr').textContent, n: document.querySelectorAll('.onb-routine').length }));
    t.ok(r.t === 'Elegí tu rutina' && r.n > 0 && r.sr === '', 'desde Entreno: con la lista puesta, ya no dice «Cargando rutinas…»: ' + JSON.stringify(r));
    t.eq(errs, [], 'cargando (Entreno): errores de la página');
    await close();
  }

  // 5) El Tab (y Mayús+Tab) no sale de la tarjeta: en la disciplina y en una rueda.
  {
    const { p, errs, close } = await newPage({ user: NUEVO(), handlers: Object.assign({ '/profiles': perfil('client') }, RUTINAS) });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-onb="start"]'); await wait(300);
    const fuera = async (tag, n) => {
      const out = [];
      for (const k of ['Tab', 'Shift+Tab']) for (let i = 0; i < n; i++){
        await p.keyboard.press(k);
        if (!(await p.evaluate(() => !!(document.activeElement && document.activeElement.closest('#authHost .onb-card'))))) out.push(k + ' ' + i);
      }
      t.eq(out, [], tag + ': el foco no sale de la tarjeta');
    };
    await fuera('disciplina', 12);
    await p.click('[data-onb="disc"][data-v="fuerza"]'); await onbSiguiente(p);
    await p.click('[data-onb="solo"]'); await wait(300);
    await p.click('[data-onb="sex"][data-v="x"]'); await onbSiguiente(p); await onbAhoraNo(p);
    await fuera('estatura', 6);
    t.eq(errs, [], 'Tab: errores de la página');
    await close();
  }
}
