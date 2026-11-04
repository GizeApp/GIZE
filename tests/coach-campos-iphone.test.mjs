// Panel del coach en el celular (la web agregada al inicio del iPhone): Safari agranda la página al
// tocar un campo con letra de menos de 16 px y la deja agrandada y corrible de costado, como si fuera
// la vista de computadora. En pantalla táctil, todos los campos del panel (Buscar…, nombre y nota del
// día, preguntas, Configuración) van en 16 px o más, y el body no hace zoom al tocar dos veces.
import { newPage, wait, configCoach } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: 'Semana fuerte', dias: [1, 3], exercises: [{ id: 'e0', name: 'Sentadilla', sets: [{ id: 's0', kg: '80', reps: '10', target: '10-12' }] }] }];

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 390, height: 844 }, touch: true, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna', role: 'client', coach_id: COACH.id }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: rutina() } : [{ days: rutina() }]) : undefined,
    '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
  } });
  // Los campos que se ven en el panel con letra de menos de 16 px.
  const chicos = () => p.evaluate(() => [...document.querySelectorAll('#coachHost input, #coachHost select, #coachHost textarea')]
    .filter(e => e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) < 16)
    .map(e => e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/).slice(0, 2).join('.') + ' ' + Math.round(parseFloat(getComputedStyle(e).fontSize)) + 'px'));
  const vistas = [];
  const vista = async (nombre) => { await wait(500); vistas.push([nombre, await chicos()]); };

  await p.goto(base + '/app/'); await wait(3500);
  await vista('Inicio');
  await p.click('[data-coach="view-clients"]'); await vista('Clientes');
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1000);
  await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
  await p.click('[data-coach="edit-day"]'); await vista('Editor del día');
  await p.click('[data-coach="back"]'); await wait(500);
  await p.click('[data-coach="q-open"]'); await vista('Preguntas');
  await p.keyboard.press('Escape'); await wait(300);
  await configCoach(p, 'perfil'); await vista('Configuración · perfil');
  await configCoach(p, 'preguntas'); await vista('Configuración · preguntas');

  for (const [nombre, l] of vistas) t.eq(l, [], nombre + ': ningún campo con letra menor a 16 px (Safari haría zoom)');
  t.eq(await p.evaluate(() => getComputedStyle(document.body).touchAction), 'manipulation', 'el body no hace zoom al tocar dos veces');
  t.ok(vistas.length === 6, 'se recorrieron las seis vistas');
  t.eq(errs, [], 'errores de la página');
  await close();

  // En un celular angosto (320 px), las tarjetas de Estadísticas del alumno no se pasan de ancho.
  const q = await newPage({ user: COACH, viewport: { width: 320, height: 700 }, touch: true, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna', role: 'client', coach_id: COACH.id }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: rutina() } : [{ days: rutina() }]) : undefined,
    '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
  } });
  await q.p.goto(base + '/app/'); await wait(3500);
  await q.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1000);
  await q.p.click('[data-coach="client-tab"][data-t="stats"]'); await wait(800);
  const m = await q.p.evaluate(() => { const h = document.getElementById('coachHost'); return { ancho: h.scrollWidth, visible: h.clientWidth, tiles: document.querySelectorAll('#coachHost .ptile').length }; });
  t.ok(m.tiles >= 2, '320 px: hay tarjetas de Estadísticas');
  t.ok(m.ancho <= m.visible, '320 px: Estadísticas sin scroll de costado: ' + JSON.stringify(m));
  t.eq(q.errs, [], 'errores de la página (320 px)');
  await q.close();
}
