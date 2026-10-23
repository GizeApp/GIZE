// Editor de rutina del coach: cambiar el orden de los días (app/screens/coach/rutinas.js, «Días:
// arrastrar»). Se arrastra la pestaña del día: con mouse, apretar y mover; en el celular, mantenerla
// apretada y deslizar. En el menú «⋯» del día siguen «Mover antes» / «Mover después».
// - Cada día se mueve con todo lo suyo: ejercicios, nota, audio de un ejercicio y días de la semana.
// - Queda como cambio sin guardar (el aviso de siempre) y «Guardar rutina» manda el orden nuevo.
// - El día que se estaba viendo sigue elegido; soltar no cuenta como tocar otra pestaña.
// - Igual en una de «Mis rutinas» y en la rutina de descarga (mismo editor).
// Se arrastran los días sin días de la semana: con días asignados el orden es solo de lunes a domingo
// y no se arrastran (tests/dias-orden-semana.test.mjs).
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const AUDIO = COACH.id + '/ex/abcdefgh12.webm';
const ex = (id, name, extra) => Object.assign({ id, name, sets: [{ id: id + 's0', kg: '', reps: '', target: '8-10' }] }, extra || {});
const rutina = () => [
  { id: 'd0', name: 'Pierna', subtitle: '', note: 'Entrar en calor', exercises: [ex('e0', 'Sentadilla libre', { audio: AUDIO, audioSecs: 20 }), ex('e1', 'Prensa 45°')] },
  { id: 'd1', name: 'Torso', subtitle: '', exercises: [ex('f0', 'Press banca plano con barra', { note: 'Codos a 45°' })] },
  { id: 'd2', name: 'Brazos', subtitle: '', exercises: [ex('g0', 'Curl con barra')] },
];
const monday = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10); };

async function abrir(base, viewport, touch){
  const ACTUAL = rutina(), writes = [];
  const pg = await newPage({ user: COACH, viewport, touch,
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => { if (i.m === 'GET') return J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]); writes.push(JSON.parse(i.body)); return J([]); },
      '/routine_templates': (r, J, i) => i.m === 'GET' ? J([{ id: 't1', coach_id: COACH.id, name: 'PPL', days: rutina() }]) : undefined,
      '/routine_schedule': (r, J) => J([]),
      '/blocks': (r, J, i) => i.m === 'GET' ? J([{ id: 'b1', client_id: A1, active: true, name: 'Bloque', start_date: monday(), weeks: 6, deloads: [4] }]) : undefined,
    } });
  pg.writes = writes;
  await pg.p.goto(base + '/app/'); await wait(3500);
  await pg.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await pg.p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
  return pg;
}
const pestanas = p => p.$$eval('.co-daytab[data-coach="edit-day"]', l => l.map(b => b.childNodes[0].textContent.trim()));
const elegido = p => p.$eval('.co-daytab.on', b => b.childNodes[0].textContent.trim());
const dias = p => p.evaluate(async () => { const { rtDays } = await import('/app/screens/coach/rutinas.js'); return JSON.parse(JSON.stringify(rtDays())); });
const centro = (p, nombre) => p.$$eval('.co-daytab[data-coach="edit-day"]', (l, n) => { const b = l.find(x => x.childNodes[0].textContent.trim() === n); b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right }; }, nombre);
// Con mouse: apretar en una pestaña y soltar a la izquierda (antes) o a la derecha (después) de otra.
async function arrastrarMouse(p, de, a, lado){
  const o = await centro(p, de), d = await centro(p, a), x = lado === 'antes' ? d.l + 4 : d.r - 4;
  await p.mouse.move(o.x, o.y); await p.mouse.down();
  for (let k = 1; k <= 12; k++){ await p.mouse.move(o.x + (x - o.x) * k / 12, o.y + 2); await wait(16); }
  await wait(120); await p.mouse.up(); await wait(450);
}
// Con el dedo (CDP): mantener apretado ~0,6 s y deslizar.
async function arrastrarDedo(p, cdp, de, a, lado){
  const o = await centro(p, de), d = await centro(p, a), x = lado === 'antes' ? d.l + 4 : d.r - 4;
  const t = (type, px, py) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }] });
  await t('touchStart', o.x, o.y); await wait(650);
  for (let k = 1; k <= 12; k++){ await t('touchMove', o.x + (x - o.x) * k / 12, o.y + 2); await wait(20); }
  await wait(120); await t('touchEnd'); await wait(450);
}
// Lo de cada día, sin importar el orden: ejercicios (con nota y audio), nota y días de la semana.
// (sin «mus»: el grupo muscular se completa solo al dibujar cada día).
const huella = D => Object.fromEntries(D.map(d => [d.name, JSON.stringify([d.id, d.dias || [], d.note || '', d.exercises], (k, v) => k === 'mus' ? undefined : v)]).sort((a, b) => a[0] < b[0] ? -1 : 1));

export default async function ({ base, t }){
  // ---- Compu (mouse) ----
  {
    const { p, errs, dialogs, writes, close } = await abrir(base, { width: 1280, height: 800 });
    const antes = huella(await dias(p));
    t.eq(await pestanas(p), ['Pierna', 'Torso', 'Brazos'], 'arranca Pierna, Torso, Brazos');
    // (El texto «Para cambiar el orden de los días, arrastralos» se sacó al simplificar el editor, #335.)
    t.ok(!(await p.$('.co-unsaved')), 'sin cambios todavía');
    await arrastrarMouse(p, 'Brazos', 'Pierna', 'antes');
    t.eq(await pestanas(p), ['Brazos', 'Pierna', 'Torso'], 'arrastrando con el mouse, Brazos pasa a ser el primero');
    t.eq(await elegido(p), 'Pierna', 'el día que se estaba viendo (Pierna) sigue elegido');
    t.eq(huella(await dias(p)), antes, 'cada día conserva sus ejercicios, nota y audio');
    t.ok(await p.$('.co-unsaved'), 'queda como cambio sin guardar');
    t.eq(await p.$$('.co-drag-ghost'), [], 'al soltar no queda la pestaña fantasma');
    await arrastrarMouse(p, 'Pierna', 'Torso', 'despues');
    t.eq(await pestanas(p), ['Brazos', 'Torso', 'Pierna'], 'Pierna al final');
    // Un toque común sigue eligiendo el día.
    await p.click('.co-daytab[data-i="1"]'); await wait(300);
    t.eq(await elegido(p), 'Torso', 'tocar una pestaña (sin arrastrar) la elige');
    // «Mover antes» del menú ⋯ del día también.
    await p.click('.co-day-bar .co-day-menu summary'); await wait(200);
    await p.click('[data-coach="day-left"]'); await wait(300);
    t.eq(await pestanas(p), ['Torso', 'Brazos', 'Pierna'], '«Mover antes» del menú ⋯ también cambia el orden');
    t.eq(huella(await dias(p)), antes, 'con el menú tampoco se pierde nada');
    await p.click('[data-coach="save-routine"]'); await wait(800);
    const w = writes[writes.length - 1];
    t.eq(w && w.days.map(d => d.name), ['Torso', 'Brazos', 'Pierna'], '«Guardar rutina» manda el orden nuevo');
    t.eq(w && w.days.find(d => d.name === 'Pierna').note, 'Entrar en calor', 'con lo de cada día');
    t.ok(!(await p.$('.co-unsaved')), 'guardada, ya no hay cambios sin guardar');
    t.ok(dialogs.every(d => /Rutina guardada/.test(d)), 'sin preguntas en el medio: ' + JSON.stringify(dialogs));

    // En una de «Mis rutinas».
    await p.click('[data-coach="view-tpls"]'); await wait(800);
    await p.click('[data-coach="tpl-open"]'); await wait(600);
    await arrastrarMouse(p, 'Torso', 'Pierna', 'antes');
    t.eq(await pestanas(p), ['Torso', 'Pierna', 'Brazos'], 'en «Mis rutinas» también se arrastran los días');
    const n0 = dialogs.length;
    await p.click('[data-coach="tpl-back"]'); await wait(400);
    t.ok(dialogs.slice(n0).some(d => /cambios sin guardar/.test(d)), 'en «Mis rutinas» cuenta como cambio sin guardar (avisa al salir)');
    t.eq(errs, [], 'errores de la página (compu)');
    await close();
  }

  // ---- Rutina de descarga ----
  {
    const { p, errs, dialogs, close } = await abrir(base, { width: 1280, height: 800 });
    await p.click('[data-coach="client-tab"][data-t="stats"]'); await wait(300);
    await p.click('[data-coach="sec-open"][data-v="bloque"]'); await wait(400);
    await p.click('[data-coach="wk-open"][data-w="4"]'); await wait(400);
    await p.click('[data-coach="dl-new"][data-from="rutina"]'); await wait(600);
    await arrastrarMouse(p, 'Brazos', 'Torso', 'antes');
    t.eq(await pestanas(p), ['Pierna', 'Brazos', 'Torso'], 'en la rutina de descarga también se arrastran los días');
    await p.click('[data-coach="tpl-back"]'); await wait(400);
    t.ok(dialogs.some(d => /Salir sin guardar la rutina de descarga/.test(d)), 'en la descarga cuenta como cambio sin guardar');
    t.eq(errs, [], 'errores de la página (descarga)');
    await close();
  }

  // ---- Celular (con el dedo) ----
  {
    const { p, errs, close } = await abrir(base, { width: 390, height: 844 }, true);
    const cdp = await p.context().newCDPSession(p);
    const antes = huella(await dias(p));
    await arrastrarDedo(p, cdp, 'Torso', 'Pierna', 'antes');
    t.eq(await pestanas(p), ['Torso', 'Pierna', 'Brazos'], 'celular: manteniendo apretado y deslizando, Torso pasa adelante');
    t.eq(await elegido(p), 'Pierna', 'celular: sigue elegido el día que se veía');
    t.eq(huella(await dias(p)), antes, 'celular: cada día conserva lo suyo');
    t.ok(await p.$('.co-unsaved'), 'celular: queda como cambio sin guardar');
    // Deslizar sin esperar no mueve nada (es para correr la fila).
    const o = await centro(p, 'Brazos');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: o.x, y: o.y, id: 2 }] });
    for (let k = 1; k <= 6; k++){ await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: o.x - k * 25, y: o.y, id: 2 }] }); await wait(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(450);
    t.eq(await pestanas(p), ['Torso', 'Pierna', 'Brazos'], 'celular: deslizar rápido no cambia el orden');
    t.eq(errs, [], 'errores de la página (celular)');
    await close();
  }
}
