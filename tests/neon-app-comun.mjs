// Lo común de tests/neon-app.test.mjs y tests/neon-app-temas.test.mjs (un poco del neón del panel del
// coach en la app del alumno, css/ui/neon-app.css): el alumno de prueba (con la rutina de su coach o
// con la propia), cómo abrir la app en cada apariencia y moverse por las pantallas, y qué lleva el
// filete en cada una. Lo que lee el filete, el resplandor, las cajas, el contraste y lo pintado es lo
// mismo que en el panel (tests/coach-neon-comun.mjs), con esta hoja. No es una prueba (no termina en
// .test.mjs): la importan las dos.
import { newPage, wait, ALUMNO } from './lib.mjs';

const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
const lunes = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const COACH_ID = '33333333-3333-3333-3333-333333333333';
const series = (k, n) => Array.from({ length: n }, (_, j) => ({ id: k + 's' + j, kg: '', reps: '', target: j ? '8-10' : '10-12' }));
const hoy = (new Date().getDay() + 6) % 7 + 1; // 1 = lunes
// Cuatro días (como en el video del dueño): el de hoy primero, con su nota del coach.
const DIAS = [
  { id: 'd1', name: 'Torso', dias: [hoy], note: 'Día pesado: priorizá técnica en los básicos.', exercises: [
    { id: 'a1', name: 'Vuelos laterales sentado', sets: series('a1', 3) }, { id: 'a2', name: 'Jalón unilateral en estocada', sets: series('a2', 3) },
    { id: 'a3', name: 'Remo neutro abierto en polea baja', sets: series('a3', 2) }, { id: 'a4', name: 'Press inclinado con mancuernas', sets: series('a4', 3) }] },
  { id: 'd2', name: 'Piernas', dias: [(hoy % 7) + 1], exercises: [{ id: 'b1', name: 'Sentadilla en Smith', sets: series('b1', 3) }] },
  { id: 'd3', name: 'Pecho/Espalda/Hombro', exercises: [{ id: 'c1', name: 'Press plano en Smith', sets: series('c1', 3) }] },
  { id: 'd4', name: 'Hombro', exercises: [{ id: 'e1', name: 'Vuelos laterales con mancuernas', sets: series('e1', 4) }] },
];
const BLOQUE = { id: 'b1', client_id: ALUMNO.id, active: true, name: 'Bloque', start_date: lunes(), weeks: 24, deloads: [], phase: 'Definición', calories: 'Déficit', notes: 'Déficit calórico' };
const handlers = coach => ({
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined;
    const me = { id: ALUMNO.id, role: 'client', full_name: 'Alumno Prueba', coach_id: coach ? COACH_ID : null }; return J(i.one ? me : [me]); },
  '/blocks': (r, J, i) => i.m === 'GET' ? J(coach ? [BLOQUE] : []) : undefined,
  '/routines': (r, J, i) => { if (i.m !== 'GET') return undefined; const row = { days: DIAS }; return J(i.one ? row : [row]); },
});
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };
const TEMA = { oscuro: '', claro: "localStorage.setItem('gize_tema','luz');", azul: "localStorage.setItem('gize_tema','azul');", rosa: "localStorage.setItem('gize_tema','rosa');" };
// coach: la rutina es la de su coach (con la semana del bloque, «Rutina asignada por tu coach» y la
// nota del día); sin coach, la propia (con «+ Agregar ejercicio», los días de la semana y las rutinas
// armadas).
const abrir = (base, { vp = M, tema = 'oscuro', neon = true, touch = vp === M, reducedMotion, coach = true, init = '' } = {}) =>
  newPage({ user: ALUMNO, viewport: vp, touch, reducedMotion, handlers: handlers(coach),
    state: { days: DIAS, sessions: [], weights: [], daily: {}, block: coach ? BLOQUE : null },
    init: "localStorage.setItem('gize_lite','0');" + TEMA[tema] + (neon ? '' : "localStorage.setItem('gize_neon','0');") + init });

// Las pantallas: entreno (arriba), ejercicio (el primero abierto), variantes («Ver variantes» del
// primero), ajustes, habitos, cardio, comida, progreso; con la rutina propia, buscador (el de
// «+ Agregar ejercicio») y dias (los días de la semana del día).
async function ir(p, vista){
  const click = async sel => { await p.click(sel); await wait(700); };
  // Cierra lo que haya abierto (una ventana de abajo).
  await p.evaluate(() => { const b = document.querySelector('.sheet-bg'); if (b) b.click(); }); await wait(500);
  const nav = { entreno: 'entreno', ejercicio: 'entreno', variantes: 'entreno', buscador: 'entreno', dias: 'entreno', ajustes: 'config',
    habitos: 'habitos', cardio: 'cardio', comida: 'comida', progreso: 'progreso' }[vista];
  if (!await p.$('#nav-' + nav + '.active')) await click('#nav-' + nav);
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(200);
  if (['ejercicio', 'variantes'].includes(vista)) {
    if (!await p.$('.card[data-ex-id="a1"]')) await click('.ex-collapsed[data-ex="a1"]');
    await p.evaluate(() => { const c = document.querySelector('.card[data-ex-id="a1"]'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 140); });
    await wait(300);
    if (vista === 'variantes') await click('.card[data-ex-id="a1"] .ex-var-btn');
  }
  if (vista === 'buscador') await click('[data-action="ex-add-open"]');
  if (vista === 'dias' && !await p.$('.dd-chip')) await click('[data-action="dias-open"]');
  await wait(300);
}

// Lo que lleva el filete en cada pantalla: [nombre, selector, cómo] (cómo: 'on' lo elegido, con el
// filete claro y el resplandor; 'hi' la portada, un poco más claro que el resto; nada, el tenue).
const HOJA_APP = 'link[href$="ui/neon-app.css"]';
const QUE = {
  entreno: [['días', '.tabs .tab:not(.active)'], ['día elegido', '.tabs .tab.active', 'on'], ['portada del día', '.day-head', 'hi'],
    ['«Limpiar»', '.day-head .clear'], ['pestaña elegida de la barra', '.nav-item.active', 'on']],
  ejercicio: [['«Iniciar descanso»', '.card .rest-btn-full'], ['tiempo de descanso', '.card .rest-edit']],
  variantes: [['variante elegida', '.var-sheet .var-pick.on', 'on'], ['«Cerrar»', '.var-sheet .ctrl.ghost']],
  ajustes: [['«Cerrar sesión»', '.logout-btn:not(.cfg-danger)'], ['pestaña elegida de la barra', '.nav-item.active', 'on']],
};
// Con la rutina propia.
const QUE_PROPIA = {
  entreno: [['«+ Agregar ejercicio»', '.add-ex'], ['«Ver rutinas armadas»', '.load-def'], ['agregar día', '.tabs .tab-add']],
  buscador: [['categorías', '.ex-chip:not(.on)'], ['categoría elegida', '.ex-chip.on', 'on']],
  dias: [['días de la semana', '.dd-chip:not(.on)'], ['día de la semana elegido', '.dd-chip.on', 'on']],
};
// Las tarjetas y filas que ya tenían el filete tenue (no cambian) y los principales (tampoco).
const YA = [['la semana del bloque', '.blk'], ['«Rutina asignada por tu coach»', '.coach-banner'], ['un ejercicio', '.ex-collapsed'], ['la nota del coach', '.daynotes']];
const PRINCIPALES = [['«Iniciar entrenamiento»', '.wk-start'], ['«Guardar entreno de hoy»', '.save-session']];
// Lo que se pinta con y sin la hoja (estilos calculados de un elemento y sus ::before/::after).
const PINTA = sel => { const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length); if (!e) return null;
  return [null, '::before', '::after'].map(ps => { const s = getComputedStyle(e, ps); return ps && s.content === 'none' ? 'none'
    : ['backgroundColor', 'backgroundImage', 'borderTopColor', 'borderBottomColor', 'borderTopWidth', 'boxShadow', 'maskImage', 'color', 'position', 'zIndex'].map(k => s[k]).join('|'); }); };
// Para medir el contraste: los textos se borran en toda la página.
const ZONA = 'body';
// Lo que no puede recortar lo de adentro (el filete sobre el borde y el resplandor de afuera).
const ZONA_RECORTE = '#view *, .navbar *, .sheet *';

export { DIAS, BLOQUE, handlers, D, M, TEMA, abrir, ir, HOJA_APP, QUE, QUE_PROPIA, YA, PRINCIPALES, PINTA, ZONA, ZONA_RECORTE };
