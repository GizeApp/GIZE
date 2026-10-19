// La bienvenida sigue donde quedó (app/screens/onboarding.js): lo contestado va a un borrador en
// el dispositivo (gize_onb_draft_<uid>); si se recarga la página, vuelve al mismo paso, sin
// «¡Bienvenido!», con lo que había contestado. El borrador se borra al terminar, al salir de la
// cuenta y en las cuentas de más de 7 días. Y los cuidados con lo que ya está en la cuenta: una
// meta de calorías puesta a mano no se pisa; si hoy ya tiene un peso anotado (de otro
// dispositivo) no se cambia; y si no se pudo leer la nube, no se anota ningún peso (al leerla
// después lo pisaría). El peso que anotó la bienvenida se puede corregir también después de
// recargar (la nube lo trae con otro id).
import { newPage, wait, text, ALUMNO, perfil, onbPaso, onbSiguiente, onbAhoraNo } from './lib.mjs';

const KEY = 'gize_onb_draft_' + ALUMNO.id;
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const usuario = dias => Object.assign({}, ALUMNO, { created_at: new Date(Date.now() - dias * 864e5).toISOString() });
const borrador = p => p.evaluate(k => localStorage.getItem(k), KEY);
async function abrir(base, extra, dias = 0, init){
  const pg = await newPage({ user: usuario(dias), init, handlers: Object.assign({ '/profiles': perfil('client'), '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined }, extra || {}) });
  await pg.p.goto(base + '/app/'); await wait(2500);
  return pg;
}
// Hasta el peso, salteando el cumpleaños y la estatura.
async function hastaElPeso(p, sexo = 'f'){
  await p.click('[data-onb="start"]'); await wait(300);
  await p.click('[data-onb="dskip"]'); await wait(250);
  await p.click('[data-onb="solo"]'); await wait(250);
  await p.click('[data-onb="sex"][data-v="' + sexo + '"]'); await onbSiguiente(p);
  await onbAhoraNo(p); await onbAhoraNo(p);
}
const estado = p => p.evaluate(async () => { const { state } = await import('/app/core/state.js'); return { cp: state.calProfile, t: state.calTarget, w: state.weights.map(x => ({ date: x.date, kg: x.kg })) }; });

export default async function ({ base, t }){
  // 1) Recargar la página: sigue en el mismo paso, con lo contestado.
  {
    const { p, errs, close } = await abrir(base);
    await hastaElPeso(p);
    await p.focus('#onbPeso'); for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowUp');
    await wait(900); await onbSiguiente(p);
    t.eq((await onbPaso(p)).n, '7/11', 'llega al objetivo');
    t.ok(!!(await borrador(p)), 'hay un borrador');
    await p.reload(); await wait(3000);
    t.ok(!/Bienvenido/.test(await text(p, '#authHost')), 'al recargar no vuelve a «¡Bienvenido!»');
    t.eq(await onbPaso(p), { n: '7/11', titulo: '¿Cuál es tu objetivo principal?' }, 'sigue en el mismo paso');
    await p.click('[data-onb="back"]'); await wait(400);
    t.eq(await p.getAttribute('#onbPeso', 'data-v'), '72.5', 'Atrás: el peso que había elegido');
    t.eq(await p.$eval('#authHost .onb-main', b => b.disabled), false, 'y «Continuar» habilitado');
    await onbSiguiente(p);
    for (let i = 0; i < 3; i++) await onbAhoraNo(p);
    await onbSiguiente(p); await wait(500);
    await p.click('.onb-routine'); await wait(200);
    await onbSiguiente(p); await wait(1500);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'termina');
    t.eq(await borrador(p), null, 'al terminar se borra el borrador');
    t.eq((await estado(p)).w, [{ date: hoy(), kg: 72.5 }], 'el peso elegido antes de recargar se anota igual');
    t.eq(errs, [], 'recargar: errores de la página');
    await close();
  }

  // 2) Salir de la cuenta borra el borrador.
  {
    const { p, errs, close } = await abrir(base);
    await p.click('[data-onb="start"]'); await wait(300);
    t.ok(!!(await borrador(p)), 'al empezar hay borrador');
    await p.evaluate(async id => (await import('/app/core/supabase.js')).clearAccountLeftovers(id), ALUMNO.id);
    t.eq(await borrador(p), null, 'salir de la cuenta lo borra');
    t.eq(errs, [], 'salir: errores de la página');
    await close();
  }

  // 3) Cuenta de hace 8 días con un borrador viejo: sin bienvenida y sin borrador.
  {
    const viejo = JSON.stringify({ v: 1, t: Date.now() - 8 * 864e5, paso: 'sexo', detour: false, linked0: false, work0: false, body0: true, ans: { start: 'rutina' }, flags: { tocado: {} } });
    const { p, errs, close } = await abrir(base, null, 8, `(() => { if (sessionStorage.getItem('onbViejo')) return; sessionStorage.setItem('onbViejo', '1'); localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(viejo)}); })()`);
    t.ok(!(await p.$('#authHost .onb-card')), 'cuenta de antes: sin bienvenida');
    t.eq(await borrador(p), null, 'y el borrador viejo se borra');
    t.eq(errs, [], 'cuenta de antes: errores de la página');
    await close();
  }

  // 4) Meta puesta a mano (sin los datos del cuerpo): pregunta igual, pero no la pisa.
  {
    const prefs = { client_id: ALUMNO.id, cal_target: 1800 };
    const { p, errs, close } = await abrir(base, { '/client_prefs': (r, J, i) => i.m === 'GET' ? J(i.one ? prefs : [prefs]) : undefined });
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(250);
    await p.click('[data-onb="solo"]'); await wait(250);
    t.eq((await onbPaso(p)).titulo, '¿Cuál es tu sexo?', 'meta a mano: pregunta los datos del cuerpo');
    await p.click('[data-onb="sex"][data-v="m"]'); await onbSiguiente(p);
    await p.focus('#onbAnio'); await p.keyboard.press('ArrowDown'); await wait(600); await onbSiguiente(p);
    await p.click('#onbAltura .rd-item.on'); await wait(300); await onbSiguiente(p);
    await p.click('#onbPeso .rd-item.on'); await wait(300); await onbSiguiente(p);
    await p.click('[data-onb="goal"][data-v="fuerza"]'); await onbSiguiente(p);
    await p.click('[data-onb="act"][data-v="mod"]'); await onbSiguiente(p);
    await onbAhoraNo(p); await wait(300); // experiencia: se aplica lo del cuerpo
    const e = await estado(p);
    t.eq(e.t, 1800, 'meta a mano: queda 1800');
    t.ok(e.cp && e.cp.age && e.cp.height === '170' && e.cp.weight === '70' && e.cp.sex === 'm', 'meta a mano: los datos sí se guardan: ' + JSON.stringify(e.cp));
    t.eq(errs, [], 'meta a mano: errores de la página');
    await close();
  }

  // 5) Hoy ya tiene un peso en la nube (de otro dispositivo): no se cambia.
  {
    const fila = { id: 'w1', client_id: ALUMNO.id, measured_on: hoy(), kg: 80 };
    const subidos = [];
    const { p, errs, close } = await abrir(base, { '/body_weights': (r, J, i) => { if (i.m === 'GET') return J([fila]); subidos.push(i.body); return undefined; } });
    await hastaElPeso(p, 'm');
    t.eq(await text(p, '#authHost .onb-body .onb-text'), 'Lo usamos para calcular tus calorías.', 'peso de hoy en la nube: no dice que lo guarda en Progreso');
    t.eq(await p.getAttribute('#onbPeso', 'data-v'), '80', 'arranca en su último peso');
    t.eq(await p.$eval('#authHost .onb-main', b => b.disabled), false, 'y como es un dato real, ya cuenta como respondido');
    await p.focus('#onbPeso'); await p.keyboard.press('ArrowUp'); await wait(600); await onbSiguiente(p);
    for (let i = 0; i < 3; i++) await onbAhoraNo(p);
    await wait(800);
    const e = await estado(p);
    t.eq(e.w, [{ date: hoy(), kg: 80 }], 'el peso de hoy sigue en 80');
    t.eq(e.cp && e.cp.weight, '80.5', 'para la meta sí usa el que eligió');
    t.eq(subidos, [], 'no se sube ningún peso');
    t.eq(errs, [], 'peso de hoy: errores de la página');
    await close();
  }

  // 6) No se pudieron leer las preferencias de la nube: no se anota el peso (y nada se rompe).
  {
    const { p, errs, close } = await abrir(base, { '/client_prefs': (r, J, i) => i.m === 'GET' ? J({ message: 'sin conexión' }, 500) : undefined });
    t.ok(/Bienvenido/.test(await text(p, '#authHost')), 'sin nube: igual ve la bienvenida');
    await hastaElPeso(p, 'm');
    t.eq(await text(p, '#authHost .onb-body .onb-text'), 'Lo usamos para calcular tus calorías.', 'sin nube: no promete guardar el peso');
    await p.focus('#onbPeso'); await p.keyboard.press('ArrowUp'); await wait(600); await onbSiguiente(p);
    for (let i = 0; i < 3; i++) await onbAhoraNo(p);
    await wait(500);
    const e = await estado(p);
    t.eq(e.w, [], 'sin nube: no anota el peso de hoy');
    t.eq(e.cp && e.cp.weight, '70.5', 'sin nube: el peso queda para la meta');
    t.eq(errs, [], 'sin nube: errores de la página');
    await close();
  }

  // 7) El peso que anotó la bienvenida, después de recargar: la nube lo trae con su propio id,
  //    pero sigue siendo el de la bienvenida y se puede corregir (antes Progreso se quedaba con el
  //    viejo y la meta usaba el nuevo).
  {
    const filas = [], subidos = [];
    const { p, errs, close } = await abrir(base, { '/body_weights': (r, J, i) => {
      if (i.m === 'GET') return J(filas);
      const b = JSON.parse(i.body);
      (Array.isArray(b) ? b : [b]).forEach(x => { subidos.push(x.kg); const f = filas.find(y => y.measured_on === x.measured_on); if (f) f.kg = x.kg; else filas.push(Object.assign({ id: 'nube-' + filas.length }, x)); });
      return undefined; } });
    await hastaElPeso(p, 'm');
    await p.focus('#onbPeso'); for (let i = 0; i < 2; i++) await p.keyboard.press('ArrowUp'); await wait(900); // 71
    await onbSiguiente(p);
    for (let i = 0; i < 3; i++) await onbAhoraNo(p); // objetivo, actividad y experiencia: se aplica
    t.eq((await onbPaso(p)).n, '10/11', 'corregir tras recargar: llega a cómo arrancar');
    await wait(2500);
    t.ok(subidos.includes(71), 'se sube el peso de hoy (71): ' + subidos.join(', '));
    await p.reload(); await wait(3000);
    t.eq((await estado(p)).w, [{ date: hoy(), kg: 71 }], 'al recargar, el peso de hoy viene de la nube');
    for (let i = 0; i < 4; i++){ await p.click('[data-onb="back"]'); await wait(300); }
    t.eq((await onbPaso(p)).titulo, '¿Cuánto pesás?', 'vuelve al peso');
    t.has(await text(p, '#authHost .onb-body .onb-text'), 'Lo guardamos en Progreso', 'sigue diciendo que lo guarda en Progreso');
    await p.focus('#onbPeso'); for (let i = 0; i < 2; i++) await p.keyboard.press('ArrowUp'); await wait(900); // 72
    await onbSiguiente(p);
    for (let i = 0; i < 3; i++) await onbAhoraNo(p);
    const e = await estado(p);
    t.eq([e.cp && e.cp.weight, e.w], ['72', [{ date: hoy(), kg: 72 }]], 'corregido: la meta y el peso de hoy, 72');
    await wait(2500);
    t.ok(subidos.includes(72), 'y se sube el 72: ' + subidos.join(', '));
    t.eq(errs, [], 'corregir tras recargar: errores de la página');
    await close();
  }
}
