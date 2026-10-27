// Elegir o cambiar ejercicio en el editor del coach (pedido del dueño, 27/10: «el panel se va
// agrandando y achicando dependiendo de cuánta información tiene»). La ventana tiene alto fijo: no
// cambia con lo que se busca (con muchos resultados, uno o ninguno), ni al entrar a un grupo. Arriba
// quedan fijos el título y el buscador; lo de abajo se desliza adentro. En la compu y en el celular.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const NOMBRES = ['Sentadilla libre', 'Prensa 45°', 'Peso muerto rumano', 'Camilla de cuádriceps', 'Sillón de isquiotibiales', 'Gemelos parado'];
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: '', exercises: NOMBRES.map((name, k) => Object.assign(
  { id: 'e' + k, name, sets: [0, 1, 2].map(j => ({ id: 'e' + k + 's' + j, kg: '', reps: '', target: '8-10' })) },
  k === 3 ? { ss: true } : {})) }, { id: 'd1', name: 'Torso', subtitle: '', exercises: [] }]; // Camilla + Sillón: superserie A
const monday = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10); };

async function abrir(base, viewport, touch){
  const ACTUAL = rutina();
  const pg = await newPage({ user: COACH, viewport, touch,
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_templates': (r, J, i) => i.m === 'GET' ? J([{ id: 't1', coach_id: COACH.id, name: 'Pierna fuerte', days: rutina() }]) : undefined,
      '/routine_schedule': (r, J) => J([]),
      '/blocks': (r, J, i) => i.m === 'GET' ? J([{ id: 'b1', client_id: A1, active: true, name: 'Bloque', start_date: monday(), weeks: 6, deloads: [4] }]) : undefined,
    } });
  await pg.p.goto(base + '/app/'); await wait(3500);
  await pg.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await pg.p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
  return pg;
}
const medir = p => p.evaluate(() => { const m = document.querySelector('.cp-modal').getBoundingClientRect(), q = document.querySelector('.cp-search').getBoundingClientRect();
  return { top: Math.round(m.top), h: Math.round(m.height), q: Math.round(q.top) }; });

export default async function ({ base, t }){
  for (const [tag, vp, touch] of [['compu', { width: 1280, height: 900 }, false], ['celular', { width: 390, height: 844 }, true]]){
    const { p, errs, close } = await abrir(base, vp, touch);
    await p.evaluate(() => document.querySelector('[data-coach="rt-swap"]').click()); await wait(500);
    t.ok(await p.$('.cp-modal'), tag + ': se abre «Cambiar ejercicio»');
    const m0 = await medir(p), vistas = [m0];
    for (const q of ['press', 'sentadilla búlgara', 'zzzz', '']){ await p.fill('.cp-search', q); await wait(300); vistas.push(await medir(p)); }
    await p.click('.cp-cat'); await wait(300); vistas.push(await medir(p));
    t.ok(vistas.every(v => v.h === m0.h && v.top === m0.top && v.q === m0.q), tag + ': la ventana y el buscador no se mueven ni cambian de alto: ' + JSON.stringify(vistas));
    t.ok(m0.h >= Math.min(600, vp.height * 0.8), tag + ': alto fijo cómodo (' + m0.h + ' px)');
    await p.fill('.cp-search', 'con'); await wait(300);
    const sc = await p.evaluate(() => { const b = document.querySelector('.cp-modal .cp-body'); return b && b.scrollHeight > b.clientHeight && getComputedStyle(b).overflowY === 'auto'; });
    t.ok(sc, tag + ': con muchos resultados se desliza la lista, no la ventana');
    t.eq(errs, [], tag + ': sin errores');
    await close();
  }
}
