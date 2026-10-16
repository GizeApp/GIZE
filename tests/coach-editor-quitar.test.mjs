// Editor de rutina del coach: «Quitar ejercicio» en el menú «⋯» del ejercicio abierto
// (app/screens/coach/rutinas.js, css/screens/coach/editor.css).
// - El menú no queda recortado por la tarjeta (que tiene overflow:hidden por el filete): con
//   pocas series «Quitar» quedaba cortado abajo y había que abrir «Más opciones» para que la tarjeta
//   creciera y apareciera. Ahora se ve entero con «Más opciones» cerrado o abierto, en la compu y en
//   el celular (sin quedar debajo de la barra de abajo); si abajo no entra, abre para arriba.
// - Dice «Quitar ejercicio», va último, separado y en rojo.
// - Pregunta antes de quitar (se pierden sus series, nota, video y audio); cancelando no pasa nada.
// - El menú se cierra al tocar afuera, con Escape y al elegir una opción (también «Más acciones»).
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
// Prensa con una sola serie: la tarjeta abierta más corta (donde se cortaba el menú).
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: '', exercises: [
  { id: 'e0', name: 'Sentadilla libre', sets: [0, 1, 2].map(j => ({ id: 'e0s' + j, kg: '', reps: '', target: '6-8' })) },
  { id: 'e1', name: 'Prensa 45°', rest: '90', sets: [{ id: 'e1s0', kg: '', reps: '', target: '10-12' }], note: 'Pies altos' },
  { id: 'e2', name: 'Peso muerto rumano', sets: [0, 1].map(j => ({ id: 'e2s' + j, kg: '', reps: '', target: '8-10' })) },
  { id: 'e3', name: 'Gemelos parado', sets: [{ id: 'e3s0', kg: '', reps: '', target: '15' }] },
] }];

async function abrir(base, viewport, touch){
  const ACTUAL = rutina();
  const pg = await newPage({ user: COACH, viewport, touch,
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
const ids = p => p.$$eval('.co-exc-grid .co-exc', l => l.map(e => e.dataset.id));
// Cada opción del menú abierto: texto, clase y si se ve de verdad (lo que hay en su centro es ella,
// adentro de la pantalla y por encima de la barra de abajo del celular).
const opciones = p => p.evaluate(() => {
  const pop = document.querySelector('details.co-exc-menu2[open] .co-day-pop'); if (!pop) return null;
  const nav = document.querySelector('.cv-nav'), nr = nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect() : null;
  const piso = Math.min(innerHeight, nr && nr.height ? nr.top : innerHeight);
  return [...pop.children].map(b => {
    if (b.tagName === 'HR') return { sep: true };
    const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
    return { t: b.textContent.trim(), danger: b.classList.contains('danger'), ve: !!hit && b.contains(hit) && r.top >= 0 && r.bottom <= piso + 1 };
  });
});
async function abrirMenu(p, id, touch){
  const sel = `.co-exc[data-id="${id}"] .co-exc-menu2 summary`;
  await p.$eval(sel, s => s.closest('.co-exc').scrollIntoView({ block: 'end' })); await wait(250);
  if (touch) await p.tap(sel); else await p.click(sel);
  await wait(350);
}

export default async function ({ base, t }){
  for (const [donde, viewport, touch] of [['compu', { width: 1280, height: 800 }, false], ['celular', { width: 390, height: 844 }, true]]){
    const { p, errs, dialogs, close } = await abrir(base, viewport, touch);
    // Abierta y con «Más opciones» cerrado: la tarjeta más corta (una serie).
    await p.click('.co-exc[data-id="e1"] .co-exc-chev'); await wait(400);
    t.eq(await p.$eval('.co-exc[data-id="e1"] .co-more-panel', e => e.hidden), true, donde + ': «Más opciones» cerrado');
    await abrirMenu(p, 'e1', touch);
    let o = await opciones(p);
    t.ok(o, donde + ': se abre el menú ⋯');
    const items = (o || []).filter(x => !x.sep);
    t.eq(items.map(x => x.t).pop(), 'Quitar ejercicio', donde + ': la última opción es «Quitar ejercicio»');
    t.ok((o || []).length >= 2 && o[o.length - 2].sep, donde + ': «Quitar ejercicio» va separado de las otras');
    t.ok(items.length && items[items.length - 1].danger, donde + ': «Quitar ejercicio» en rojo (danger)');
    t.ok(items.length >= 6 && items.every(x => x.ve), donde + ': con «Más opciones» cerrado se ven todas las opciones, también «Quitar ejercicio»: ' + JSON.stringify(o));

    // Tocar afuera lo cierra; Escape también.
    await p.mouse.click(5, viewport.height / 2); await wait(300);
    t.eq(await p.$$eval('details.co-day-menu[open]', l => l.length), 0, donde + ': tocar afuera cierra el menú');
    await abrirMenu(p, 'e1', touch);
    await p.keyboard.press('Escape'); await wait(300);
    t.eq(await p.$$eval('details.co-day-menu[open]', l => l.length), 0, donde + ': Escape cierra el menú');

    // Con «Más opciones» abierto también.
    await p.click('.co-exc[data-id="e1"] .co-more-btn'); await wait(300);
    await abrirMenu(p, 'e1', touch);
    o = await opciones(p);
    t.ok(o && o.filter(x => !x.sep).every(x => x.ve), donde + ': con «Más opciones» abierto también se ve todo: ' + JSON.stringify(o));

    // Quitar: pregunta antes. Cancelando no pasa nada.
    await p.evaluate(() => { window.__conf = window.confirm; window.confirm = m => { window.__pregunta = m; return false; }; });
    await p.click('details.co-exc-menu2[open] [data-coach="rt-del"]'); await wait(400);
    t.has(await p.evaluate(() => window.__pregunta || ''), '¿Quitar «Prensa 45°»', donde + ': pregunta antes de quitar, con el nombre');
    t.eq(await ids(p), ['e0', 'e1', 'e2', 'e3'], donde + ': cancelando, el ejercicio sigue');
    t.eq(await p.$$eval('details.co-day-menu[open]', l => l.length), 0, donde + ': elegir una opción cierra el menú');
    await p.evaluate(() => { window.confirm = window.__conf; });
    // Aceptando, se quita y queda como cambio sin guardar.
    await abrirMenu(p, 'e1', touch);
    if (touch) await p.tap('details.co-exc-menu2[open] [data-coach="rt-del"]'); else await p.click('details.co-exc-menu2[open] [data-coach="rt-del"]');
    await wait(500);
    t.eq(await ids(p), ['e0', 'e2', 'e3'], donde + ': «Quitar ejercicio» lo saca de la rutina');
    t.ok(dialogs.some(d => /¿Quitar «Prensa 45°» de «Pierna»\?/.test(d)), donde + ': la pregunta nativa: ' + JSON.stringify(dialogs));
    t.ok(await p.$('.co-unsaved'), donde + ': queda como cambio sin guardar');

    // El último de la lista (una serie, al fondo): el menú entra igual (abre para arriba si hace falta).
    await p.click('.co-exc[data-id="e3"] .co-exc-chev'); await wait(400);
    await abrirMenu(p, 'e3', touch);
    o = await opciones(p);
    t.ok(o && o.filter(x => !x.sep).every(x => x.ve), donde + ': en el último ejercicio también se ve «Quitar ejercicio»: ' + JSON.stringify(o));
    await p.keyboard.press('Escape'); await wait(200);

    // «Más acciones»: elegir «Copiar a otro cliente» cierra el menú (antes quedaba abierto detrás).
    await p.click('.co-more-actions summary'); await wait(250);
    await p.click('[data-coach="rt-copy"]'); await wait(400);
    t.eq(await p.$$eval('details.co-day-menu[open]', l => l.length), 0, donde + ': «Más acciones» se cierra al elegir una opción');
    t.eq(errs, [], 'errores de la página (' + donde + ')');
    await close();
  }
}
