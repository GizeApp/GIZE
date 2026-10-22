// Editor de rutina del coach: cambiar el orden de los ejercicios arrastrándolos (pedido del dueño: «en
// lugar de subirlos y bajarlos con botones»), con el mouse o con el dedo (mantener apretada la tarjeta
// cerrada). Soltarla en el borde de arriba o de abajo de otra la pone antes o después (una línea con
// «Mover antes / después de …» marca dónde); en el medio sigue armando la superserie
// (coach-editor-compu). Entre dos de una superserie se suma a ella; saliendo de una, la superserie que
// queda no se rompe. Queda como cambio sin guardar.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const NOMBRES = ['Sentadilla libre', 'Prensa 45°', 'Peso muerto rumano', 'Camilla de cuádriceps', 'Sillón de isquiotibiales', 'Gemelos parado'];
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: '', exercises: NOMBRES.map((name, k) => Object.assign(
  { id: 'e' + k, name, sets: [0, 1, 2].map(j => ({ id: 'e' + k + 's' + j, kg: '', reps: '', target: '8-10' })) },
  k === 3 ? { ss: true } : {})) }]; // Camilla + Sillón: superserie

async function abrir(base, vp, touch){
  const ACTUAL = rutina();
  const pg = await newPage({ user: COACH, viewport: vp, touch, init: "localStorage.setItem('gize_lite','0');",
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
    } });
  await pg.p.goto(base + '/app/'); await wait(3500);
  await pg.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await pg.p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
  return pg;
}
const nombres = p => p.evaluate(async () => { const { rtDays } = await import('/app/screens/coach/rutinas.js'); const { CoachState } = await import('/app/screens/coach/state.js');
  return rtDays()[CoachState.coachEditDay].exercises.map(e => e.name + (e.ss ? '+' : '')); });
// Un punto de la tarjeta: k = 0 arriba, 1 abajo (en su medio a lo ancho).
const punto = (p, id, k) => p.$eval(`.co-exc[data-id="${id}"]`, (e, k) => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left + Math.min(120, r.width / 2), r.top + r.height * k]; }, k);
async function arrastrar(p, de, a, k, mitad){
  const o = await punto(p, de, 0.5); await wait(100);
  const d = await p.$eval(`.co-exc[data-id="${a}"]`, (e, k) => { const r = e.getBoundingClientRect(); return [r.left + Math.min(120, r.width / 2), r.top + r.height * k]; }, k);
  await p.mouse.move(o[0], o[1]); await p.mouse.down(); await wait(650);
  for (let s = 1; s <= 12; s++){ await p.mouse.move(o[0] + (d[0] - o[0]) * s / 12, o[1] + (d[1] - o[1]) * s / 12); await wait(30); }
  await wait(200);
  if (mitad) await mitad();
  await p.mouse.up(); await wait(700);
}

export default async function ({ base, t }){
  // ---- La cuenta (exMoveTo) ----
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/app/'); await wait(800);
    const r = await p.evaluate(async () => {
      const { exMoveTo } = await import('/app/screens/coach/rutinas.js');
      const L = s => s.split(' ').map(x => ({ n: x.replace('+', ''), ss: x.endsWith('+') || undefined }));
      const S = a => a.map(x => x.n + (x.ss ? '+' : '')).join(' ');
      const m = (s, f, to) => { const a = L(s); const ok = exMoveTo(a, f, to); return [ok, S(a)]; };
      return [m('A B C D', 0, 3), m('A B C D', 3, 0), m('A B+ C D', 3, 2), m('A B+ C D', 2, 0), m('A B+ C+ D', 1, 4), m('A B C', 0, 1), m('A B C', 1, 1), m('A B C', 0, 9)];
    });
    t.eq(r[0], [true, 'B C A D'], 'el primero a antes del último');
    t.eq(r[1], [true, 'D A B C'], 'el último al principio');
    t.eq(r[2], [true, 'A B+ D+ C'], 'entre dos de una superserie se suma a ella');
    t.eq(r[3], [true, 'C A B D'], 'el último de una superserie sale suelto y la de arriba queda cerrada');
    t.eq(r[4], [true, 'A C+ D B'], 'el del medio de una superserie sale y la superserie sigue con los otros');
    t.eq([r[5][0], r[6][0], r[7][0]], [false, false, false], 'a su mismo lugar o a uno que no existe: no hace nada');
    t.eq(errs, [], 'errores de la página (cuenta)');
    await close();
  }

  // ---- Compu, con el mouse ----
  {
    const { p, errs, close } = await abrir(base, { width: 1440, height: 900 });
    t.ok(!(await p.$('.co-unsaved')), 'compu: sin cambios todavía');
    let linea = null;
    await arrastrar(p, 'e0', 'e2', 0.92, async () => { linea = await p.$eval('.co-drop-line', e => !e.hidden && e.textContent).catch(() => null); });
    t.eq(linea, 'Mover después de Peso muerto rumano', 'compu: en el borde de abajo, una línea dice dónde queda');
    t.eq(await nombres(p), ['Prensa 45°', 'Peso muerto rumano', 'Sentadilla libre', 'Camilla de cuádriceps+', 'Sillón de isquiotibiales', 'Gemelos parado'],
      'compu: al soltar en el borde de abajo, Sentadilla queda después de Peso muerto rumano');
    t.ok(!!(await p.$('.co-unsaved')), 'compu: queda como cambio sin guardar');
    t.ok(!(await p.$('.co-drop-line')) && !(await p.$('.co-drag-ghost')), 'compu: al soltar no queda ni la línea ni la tarjeta fantasma');
    t.ok(!(await p.$('.cp-modal')), 'compu: no abre el buscador');
    await arrastrar(p, 'e1', 'e0', 0.92);
    t.eq((await nombres(p)).slice(0, 3), ['Peso muerto rumano', 'Sentadilla libre', 'Prensa 45°'], 'compu: Prensa pasa después de Sentadilla');
    await arrastrar(p, 'e5', 'e4', 0.08);
    t.eq((await nombres(p)).slice(3), ['Camilla de cuádriceps+', 'Gemelos parado+', 'Sillón de isquiotibiales'], 'compu: en el borde de arriba del segundo de una superserie, se suma a ella');
    await arrastrar(p, 'e2', 'e1', 0.5);
    t.eq((await nombres(p)).slice(0, 3), ['Sentadilla libre', 'Prensa 45°+', 'Peso muerto rumano'], 'compu: en el medio de otra sigue armando la superserie');
    t.eq(errs, [], 'errores de la página (compu)');
    await close();
  }

  // ---- Celular, con el dedo ----
  {
    const { p, errs, close } = await abrir(base, { width: 390, height: 844 }, true);
    const cdp = await p.context().newCDPSession(p);
    const o = await punto(p, 'e1', 0.5); await wait(150);
    const d = await p.$eval('.co-exc[data-id="e0"]', e => { const r = e.getBoundingClientRect(); return [r.left + 100, r.top + r.height * 0.08]; });
    const tch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await tch('touchStart', o[0], o[1]); await wait(650);
    for (let s = 1; s <= 12; s++){ await tch('touchMove', o[0] + (d[0] - o[0]) * s / 12, o[1] + (d[1] - o[1]) * s / 12); await wait(30); }
    await wait(200); await tch('touchEnd'); await wait(700);
    t.eq((await nombres(p)).slice(0, 2), ['Prensa 45°', 'Sentadilla libre'], 'celular: manteniendo apretado y llevándola arriba de Sentadilla, Prensa queda primera');
    t.ok(!!(await p.$('.co-unsaved')), 'celular: queda como cambio sin guardar');
    t.eq(errs, [], 'errores de la página (celular)');
    await close();
  }
}
