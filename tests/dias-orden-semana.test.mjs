// Las pestañas de los días van de lunes a domingo según los días de la semana asignados
// (app/core/diasemana.js → ordenSemana), aunque se hayan cargado en otro orden: «Pecho» del martes
// aparecía antes que «Espalda» del lunes. Los que no tienen día van al final. La rutina no se
// reordena (no queda como cambio sin guardar) y tocar una pestaña abre ese día. Con días asignados no
// se arrastran ni se mueven con «Mover antes / después» (el orden lo dan los días). Igual en Entreno.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const ex = (id, name) => ({ id, name, sets: [{ id: id + 's0', kg: '', reps: '', target: '8-10' }] });
// Como en la captura: cargados Pecho (martes), Espalda (lunes), Pecho/Espalda/Hombro (jueves),
// Pierna/Brazo (viernes), y uno sin día.
const rutina = () => [
  { id: 'd0', name: 'Pecho', dias: [2], exercises: [ex('a', 'Press banca plano con barra')] },
  { id: 'd1', name: 'Espalda', dias: [1], exercises: [ex('b', 'Remo con barra')] },
  { id: 'd2', name: 'Core', exercises: [ex('c', 'Plancha')] },
  { id: 'd3', name: 'Pierna/Brazo', dias: [5], exercises: [ex('d', 'Sentadilla libre')] },
  { id: 'd4', name: 'Pecho/Espalda/Hombro', dias: [4, 0], exercises: [ex('e', 'Press militar')] },
];
const ORDEN = ['Espalda', 'Pecho', 'Pecho/Espalda/Hombro', 'Pierna/Brazo', 'Core'];

export default async function ({ base, t }){
  // ---- La ayuda ----
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/app/'); await wait(800);
    const r = await p.evaluate(async () => {
      const { ordenSemana } = await import('/app/core/diasemana.js');
      return [ordenSemana([{ dias: [2] }, { dias: [1] }, {}, { dias: [5] }, { dias: [4, 0] }]), ordenSemana([{}, {}, {}]), ordenSemana([{ dias: [0] }, { dias: [6] }]), ordenSemana(null)];
    });
    t.eq(r[0], [1, 0, 4, 3, 2], 'ordenSemana: lunes, martes, jueves, viernes y el sin día al final');
    t.eq(r[1], [0, 1, 2], 'ordenSemana: sin días, el orden de siempre');
    t.eq(r[2], [1, 0], 'ordenSemana: el domingo va después del sábado');
    t.eq(r[3], [], 'ordenSemana: sin rutina, nada');
    t.eq(errs, [], 'errores de la página (ayuda)');
    await close();
  }

  // ---- Editor del coach ----
  {
    const ACTUAL = rutina(), writes = [];
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1280, height: 800 },
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/routines': (r, J, i) => { if (i.m === 'GET') return J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]); writes.push(JSON.parse(i.body)); return J([]); },
        '/routine_templates': (r, J) => J([]),
        '/routine_schedule': (r, J) => J([]),
      } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
    const pestanas = () => p.$$eval('.co-daytab[data-coach="edit-day"]', l => l.map(b => b.childNodes[0].textContent.trim()));
    t.eq(await pestanas(), ORDEN, 'coach: las pestañas van de lunes a domingo y el día sin asignar al final');
    t.ok(!(await p.$('.co-unsaved')), 'coach: mostrarlas en orden no deja cambios sin guardar');
    // Tocar «Espalda» (la primera) abre Espalda, aunque en la rutina sea el segundo.
    await p.click('.co-daytab[data-coach="edit-day"]:first-child'); await wait(300);
    t.eq(await p.$eval('.co-daytab.on', b => b.childNodes[0].textContent.trim()), 'Espalda', 'coach: tocar la primera pestaña la elige');
    t.ok(!(await p.$('.co-daytab[data-coach="edit-day"][title]')), 'coach: con días asignados no dice «Arrastralo»');
    await p.click('.co-day-bar .co-day-menu summary'); await wait(200);
    t.ok(!(await p.$('[data-coach="day-left"]')) && !(await p.$('[data-coach="day-right"]')), 'coach: sin «Mover antes / después» (el orden lo dan los días)');
    t.ok(!!(await p.$('[data-coach="day-del"]')) && !!(await p.$('[data-coach="day-dup"]')), 'coach: «Duplicar» y «Borrar día» siguen');
    await p.keyboard.press('Escape'); await p.click('.co-daytab.on'); await wait(200);
    // Arrastrar no hace nada.
    const box = async n => p.$$eval('.co-daytab[data-coach="edit-day"]', (l, n) => { const r = l.find(b => b.childNodes[0].textContent.trim() === n).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left }; }, n);
    const o = await box('Core'), d = await box('Espalda');
    await p.mouse.move(o.x, o.y); await p.mouse.down();
    for (let k = 1; k <= 12; k++){ await p.mouse.move(o.x + (d.l + 4 - o.x) * k / 12, o.y + 2); await wait(16); }
    await p.mouse.up(); await wait(400);
    t.eq(await pestanas(), ORDEN, 'coach: arrastrar no cambia el orden');
    t.ok(!(await p.$('.co-unsaved')), 'coach: ni deja cambios sin guardar');
    // Cambiar el día de Core a lunes la pone al lado de Espalda.
    await p.click('.co-daytab[data-coach="edit-day"]:nth-child(5)'); await wait(300);
    await p.click('[data-coach="day-dow"][data-d="1"]'); await wait(300);
    t.eq(await pestanas(), ['Espalda', 'Core', 'Pecho', 'Pecho/Espalda/Hombro', 'Pierna/Brazo'], 'coach: al darle el lunes a Core pasa después de Espalda');
    t.eq(await p.$eval('.co-daytab.on', b => b.childNodes[0].textContent.trim()), 'Core', 'coach: sigue abierto el mismo día');
    await p.click('[data-coach="save-routine"]'); await wait(800);
    const w = writes[writes.length - 1];
    t.eq(w && w.days.map(x => x.id), ['d0', 'd1', 'd2', 'd3', 'd4'], 'coach: «Guardar rutina» manda los días como estaban (solo cambia cómo se muestran)');
    t.eq(w && w.days[2].dias, [1], 'coach: con el día nuevo de Core');
    t.eq(errs, [], 'errores de la página (coach)');
    await close();
  }

  // ---- Entreno del alumno ----
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: rutina(), sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(await p.$$eval('.tabs .tab[data-action="tab"], .tab[data-action="tab"]', l => [...new Set(l.map(b => b.textContent.trim()))]), ORDEN, 'Entreno: las pestañas también van de lunes a domingo');
    t.eq(errs, [], 'errores de la página (alumno)');
    await close();
  }
}
