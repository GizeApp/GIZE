// Editor de rutina del coach en la compu, con muchos días: todas las pestañas de los días y el «+»
// para agregar uno se ven y se pueden tocar. La fila de días se deslizaba de costado sin barra y con
// mouse no había forma de moverla (la ruedita mueve la página): con siete días, los últimos y el «+»
// quedaban afuera. Ahora, con mouse, las pestañas van en varios renglones (en el celular sigue la
// fila que se desliza con el dedo) y arrastrar un día de un renglón a otro también lo cambia de lugar.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const NOMBRES = ['Empuje (pecho y hombros)', 'Tracción (espalda y bíceps)', 'Piernas cuádriceps', 'Empuje B (hombros)', 'Tracción B', 'Piernas isquios y glúteos', 'Brazos y core'];
const rutina = () => NOMBRES.map((name, k) => ({ id: 'd' + k, name, subtitle: '', dias: [(k + 1) % 7],
  exercises: [{ id: 'x' + k, name: 'Press banca plano con barra', sets: [{ id: 'x' + k + 's0', kg: '', reps: '', target: '8' }] }] }));

export default async function ({ base, t }){
  for (const vp of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }]){
    const ACTUAL = rutina();
    const { p, errs, close } = await newPage({ user: COACH, viewport: vp,
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
        '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
      } });
    const w = vp.width + ' px';
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
    // Cada pestaña (y el «+»): ¿se ve entera y lo que hay en su centro es ella?
    const pestanas = () => p.$$eval('.co-daytabs .co-daytab', l => l.map(b => { const r = b.getBoundingClientRect(), s = b.parentNode.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { t: b.dataset.coach === 'day-add' ? '+' : b.childNodes[0].textContent.trim(), ve: r.left >= s.left - 1 && r.right <= s.right + 1 && r.right <= innerWidth && !!h && b.contains(h) }; }));
    let L = await pestanas();
    t.eq(L.map(x => x.t), NOMBRES.concat('+'), w + ': los siete días y el «+»');
    t.ok(L.every(x => x.ve), w + ': todas las pestañas y el «+» se ven y se pueden tocar con el mouse: ' + JSON.stringify(L.filter(x => !x.ve)));
    await p.click('.co-daytab[data-i="6"]'); await wait(300);
    t.eq(await p.$eval('.co-daytab.on', b => b.childNodes[0].textContent.trim()), 'Brazos y core', w + ': el séptimo día se elige con un click');
    await p.click('.co-daytab.add'); await wait(400);
    t.eq((await pestanas()).length, 9, w + ': el «+» agrega un día');
    // Arrastrar el último día (en otro renglón) al principio.
    const o = await p.$eval('.co-daytab[data-i="6"]', b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const d = await p.$eval('.co-daytab[data-i="0"]', b => { const r = b.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; });
    await p.mouse.move(o.x, o.y); await p.mouse.down();
    for (let k = 1; k <= 15; k++){ await p.mouse.move(o.x + (d.x - o.x) * k / 15, o.y + (d.y - o.y) * k / 15); await wait(16); }
    await wait(100); await p.mouse.up(); await wait(450);
    L = await pestanas();
    t.eq(L.slice(0, 2).map(x => x.t), ['Brazos y core', 'Empuje (pecho y hombros)'], w + ': arrastrar un día de otro renglón al principio lo cambia de lugar');
    t.ok(await p.evaluate(() => { const h = document.getElementById('coachHost'); return h.scrollWidth <= h.clientWidth; }), w + ': sin scroll de costado');
    t.eq(errs, [], 'errores de la página (' + w + ')');
    await close();
  }
}
