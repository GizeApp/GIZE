// Editor de rutina del coach: «Borrar día» (menú «⋯» del día) pregunta antes si el día tiene
// ejercicios. Está justo debajo de «Mover después» y se llevaba el día entero de un toque; la única
// forma de recuperarlo era salir sin guardar y perder también todo lo demás. Un día vacío se borra
// sin preguntar.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const ex = (id, name) => ({ id, name, sets: [{ id: id + 's0', kg: '', reps: '', target: '10' }] });
const rutina = () => [
  { id: 'd0', name: 'Pierna', subtitle: '', exercises: [ex('e0', 'Sentadilla libre'), ex('e1', 'Prensa 45°')] },
  { id: 'd1', name: 'Torso', subtitle: '', exercises: [ex('f0', 'Remo con barra')] },
  { id: 'd2', name: 'Día vacío', subtitle: '', exercises: [] },
];

export default async function ({ base, t }){
  const ACTUAL = rutina();
  const { p, errs, dialogs, close } = await newPage({ user: COACH, viewport: { width: 390, height: 844 }, touch: true,
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
    } });
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
  const dias = () => p.$$eval('.co-daytab[data-coach="edit-day"]', l => l.map(b => b.childNodes[0].textContent.trim()));
  const borrar = async () => { await p.tap('.co-day-bar .co-day-menu summary'); await wait(250); await p.tap('[data-coach="day-del"]'); await wait(400); };

  // Cancelando, el día sigue.
  await p.evaluate(() => { window.__conf = window.confirm; window.confirm = m => { window.__pregunta = m; return false; }; });
  await borrar();
  t.eq(await p.evaluate(() => window.__pregunta || ''), '¿Borrar el día «Pierna» con sus 2 ejercicios?', 'pregunta antes de borrar un día con ejercicios');
  t.eq(await dias(p), ['Pierna', 'Torso', 'Día vacío'], 'cancelando, el día sigue');
  await p.evaluate(() => { window.confirm = window.__conf; });
  // Aceptando, se borra.
  await borrar();
  t.eq(await dias(p), ['Torso', 'Día vacío'], 'aceptando, se borra');
  t.ok(dialogs.some(d => d === '¿Borrar el día «Pierna» con sus 2 ejercicios?'), 'la pregunta nativa: ' + JSON.stringify(dialogs));
  // Un día vacío se borra sin preguntar.
  await p.tap('.co-daytab[data-i="1"]'); await wait(300);
  const n = dialogs.length;
  await borrar();
  t.eq(await dias(p), ['Torso'], 'un día vacío se borra');
  t.eq(dialogs.length, n, 'un día vacío se borra sin preguntar');
  t.eq(errs, [], 'errores de la página');
  await close();
}
