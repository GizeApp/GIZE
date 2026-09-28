// Hábitos con días y aviso (⏰): cada hábito puede ir todos los días o días elegidos y tener
// hora de aviso. Los del coach traen sus días (el alumno puede cambiarlos y ponerles hora).
// En la web se ve la lista; en la app de Android se programan las notificaciones del celular.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const ARG = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' });
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[ARG.format(new Date())];
const OTHER = (DOW + 2) % 7; // un día que no es hoy
const NATIVE = () => {
  const sched = []; window.__sched = sched; window.__perm = 'granted';
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999' }), addListener: () => {} },
    LocalNotifications: {
      checkPermissions: async () => ({ display: window.__perm }), requestPermissions: async () => ({ display: window.__perm }),
      getPending: async () => ({ notifications: sched.map(n => ({ id: n.id })) }),
      cancel: async o => { const ids = o.notifications.map(n => n.id); for (let i = sched.length - 1; i >= 0; i--) if (ids.includes(sched[i].id)) sched.splice(i, 1); },
      createChannel: async () => {}, schedule: async o => { o.notifications.forEach(n => sched.push(n)); }, addListener: () => {},
    } } };
};

async function open(base, { native = false } = {}){
  const prefs = [];
  const pg = await newPage({ user: ALUMNO, init: native ? NATIVE : undefined,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, habits: [] },
    handlers: {
      '/profiles': profile('client', { coach_id: 'c1' }),
      // maybeSingle() pide un arreglo y se queda con el primero (según la versión de supabase-js).
      '/nutrition': (r, J, i) => { if (i.m !== 'GET') return undefined; const np = { kcal: null, plan: { habits: ['Caminar 30 min', 'Creatina 5 g'], habitDays: [[OTHER], null] } }; return J(i.one ? np : [np]); },
      '/client_prefs': (r, J, i) => i.m === 'GET' ? J(i.one ? null : []) : (prefs.push(JSON.parse(i.body)), r.fulfill({ status: 201, body: '[]' })),
    } });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('#nav-habitos'); await wait(400);
  return Object.assign(pg, { prefs });
}
// La hora se elige con la rueda (la misma del temporizador, en modo hora del día).
const pickTime = async (p, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  await p.click('[data-action="hba-pick"]'); await wait(300);
  await p.evaluate(([h, m]) => { document.getElementById('twMin').scrollTop = h * 44; document.getElementById('twSec').scrollTop = m * 44; }, [h, m]); await wait(150);
  await p.click('#timePick [data-tp="ok"]'); await wait(250);
};
const addHabit = async (p, name) => { await p.fill('#habitInput', name); await p.click('[data-action="habit-add"]'); await wait(300); };

export default async function ({ base, t }){
  // --- Web ---
  let { p, errs, prefs, close } = await open(base);
  t.has(await text(p, '.hb-list'), 'Creatina 5 g', 'hábito del coach de todos los días, hoy');
  t.ok(!!(await p.$('.hb-later-t')) && /Caminar/.test(await text(p, 'body')), 'sección "Otros días" con el del coach que no es hoy');
  t.ok(!(await text(p, '.hb-list')).includes('Caminar') || (await p.$$('.hb-list')).length > 1, 'el de otro día no está en la lista de hoy');

  await addHabit(p, 'Tomar agua');
  const ownId = await p.evaluate(() => document.querySelector('[data-action="habit-toggle"]')?.dataset.id);
  await p.click(`[data-action="habit-alarm"][data-kind="own"][data-key="${ownId}"]`); await wait(300);
  t.ok(!/suena|Android|iPhone/.test(await text(p, '.hba-sheet')), 'la hoja no tiene carteles sobre la alarma (web)');
  // Cambiar días u hora no vuelve a abrir la hoja (se actualiza en el lugar: es la misma hoja).
  await p.evaluate(() => { document.querySelector('.hba-sheet').dataset.marca = '1'; });
  await p.click('[data-action="hba-day"][data-d="1"]'); await wait(150);
  await p.click('[data-action="hba-all"]'); await wait(150);
  await pickTime(p, '07:30');
  t.eq(await p.evaluate(() => { const h = document.querySelector('.hba-sheet'); return h && h.dataset.marca; }), '1', 'la hoja no se vuelve a abrir al tocar días u hora');
  t.has(await text(p, '.hba-sheet'), '07:30', 'la hora elegida se ve en la hoja');
  await p.click('[data-action="hba-pick"]'); await wait(300);
  t.eq(await p.evaluate(() => [...document.querySelectorAll('#timePick .tw-unit')].map(e => e.textContent)), ['hora', 'min'], 'la rueda de la hora tiene horas y minutos');
  t.eq(await p.evaluate(() => [document.querySelectorAll('#twMin .tw-item').length, document.querySelectorAll('#twSec .tw-item').length]), [24, 60], 'de 00 a 23 horas y de 00 a 59 minutos');
  await p.click('#timePick [data-tp="close"]'); await wait(200);
  await pickTime(p, '09:00'); await p.click('[data-action="hba-save"]'); await wait(400);
  t.has(await text(p, '.hb-list'), '09:00 · Todos los días', 'se ve la hora del aviso');
  t.ok(!(await text(p, 'body')).includes('⏰'), 'sin el reloj en ningún lado');

  // Cardio solo otro día: pasa a "Otros días" y no cuenta hoy.
  await addHabit(p, 'Cardio 30 min');
  const cardioId = await p.evaluate(() => [...document.querySelectorAll('[data-action="habit-toggle"]')].find(e => /Cardio/.test(e.innerText))?.dataset.id);
  await p.click(`[data-action="habit-alarm"][data-key="${cardioId}"]`); await wait(300);
  await p.click(`[data-action="hba-day"][data-d="${OTHER}"]`); await wait(200);
  await pickTime(p, '18:30'); await p.click('[data-action="hba-save"]'); await wait(400);
  const listToday = await p.evaluate(() => document.querySelector('.hb-list').innerText);
  t.ok(!/Cardio/.test(listToday), 'el cardio de otro día no está en la lista de hoy');
  t.has(await text(p, 'body'), 'Cardio 30 min', 'el cardio aparece en "Otros días"');
  t.eq(await text(p, '.count'), '0/2', 'hoy cuentan solo los de hoy (creatina del coach y agua)');

  // El alumno cambia los días del hábito del coach y le pone hora.
  await p.click('[data-action="habit-alarm"][data-kind="coach"][data-key="Caminar 30 min"]'); await wait(300);
  t.has(await text(p, '.hba-sheet'), 'Tu coach lo puso para', 'muestra los días que eligió el coach');
  await p.click('[data-action="hba-all"]'); await pickTime(p, '07:15'); await p.click('[data-action="hba-save"]'); await wait(1800);
  t.has(await text(p, '.hb-list'), 'Caminar 30 min', 'con "todos los días" el del coach pasa a hoy');
  const last = prefs[prefs.length - 1];
  t.ok(last && last.habit_alarms && last.habit_alarms.own && last.habit_alarms.own[ownId] && last.habit_alarms.own[ownId].time === '09:00', 'los avisos viajan a la nube (client_prefs.habit_alarms): ' + JSON.stringify(last && last.habit_alarms));
  t.eq(last && last.habit_alarms && last.habit_alarms.coach && last.habit_alarms.coach['Caminar 30 min'], { time: '07:15', days: [0, 1, 2, 3, 4, 5, 6] }, 'el cambio del alumno sobre el hábito del coach');
  // Tachado: el nombre ocupa su lugar (no el cuadradito de 44 px de las series).
  await p.click(`[data-action="habit-toggle"][data-id="${ownId}"]`); await wait(300);
  const w = await p.evaluate(() => document.querySelector('.hb-name.done')?.getBoundingClientRect().width || 0);
  t.ok(w > 120, 'un hábito tachado se ve entero: ' + w);
  t.eq(await p.evaluate(() => getComputedStyle(document.querySelector('.hb-name.done')).borderTopStyle), 'none', 'el nombre tachado no tiene borde');
  // Neón por fuera: las del coach azul/violeta, las propias rosa/verde agua.
  const neon = await p.evaluate(() => { const bg = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).backgroundImage : ''; };
    return { coach: bg('.hb-list .hb-item.coach'), own: bg('.hb-list .hb-item:not(.coach)') }; });
  t.ok(/rgb\(47, 160, 255\)/.test(neon.coach) && /rgb\(166, 92, 255\)/.test(neon.coach), 'nota del coach con neón azul y violeta: ' + neon.coach.slice(0, 120));
  t.ok(/rgb\(255, 61, 174\)/.test(neon.own) && /rgb\(37, 232, 200\)/.test(neon.own), 'nota propia con neón rosa y verde agua: ' + neon.own.slice(0, 120));
  t.eq(errs, [], 'errores de la página (web)');
  await close();

  // --- App de Android: se programan las notificaciones ---
  ({ p, errs, close } = await open(base, { native: true }));
  await addHabit(p, 'Creatina propia');
  const id2 = await p.evaluate(() => document.querySelector('[data-action="habit-toggle"]')?.dataset.id);
  await p.click(`[data-action="habit-alarm"][data-key="${id2}"]`); await wait(300);
  t.ok(!/suena|cerrada/.test(await text(p, '.hba-sheet')), 'la hoja no tiene carteles sobre la alarma (Android)');
  await pickTime(p, '09:05'); await p.click('[data-action="hba-save"]'); await wait(1200);
  let sched = await p.evaluate(() => window.__sched.map(n => ({ title: n.title, on: n.schedule.on })));
  t.eq(sched, [{ title: 'Creatina propia', on: { hour: 9, minute: 5 } }], 'aviso diario programado');
  await p.click('[data-action="habit-alarm"][data-kind="coach"][data-key="Caminar 30 min"]'); await wait(300);
  await pickTime(p, '18:00'); await p.click('[data-action="hba-save"]'); await wait(1200);
  sched = await p.evaluate(() => window.__sched.map(n => ({ title: n.title, on: n.schedule.on })));
  t.eq(sched.find(n => n.title === 'Caminar 30 min'), { title: 'Caminar 30 min', on: { weekday: OTHER + 1, hour: 18, minute: 0 } }, 'aviso del hábito del coach solo el día que eligió el coach');
  // Borrar el hábito saca su aviso.
  await p.click(`[data-action="habit-remove"][data-id="${id2}"]`); await wait(1200);
  sched = await p.evaluate(() => window.__sched.map(n => n.title));
  t.eq(sched, ['Caminar 30 min'], 'al borrar un hábito se borra su aviso');
  t.eq(errs, [], 'errores de la página (Android)');
  await close();

  // --- Panel del coach: días de cada hábito ---
  const c = await newPage({});
  await c.p.goto(base + '/app/'); await wait(1500);
  const chips = await c.p.evaluate(async () => { const m = await import('/app/screens/coach/rutinas.js'); const d = document.createElement('div');
    d.innerHTML = m.habitsEditor({ habits: ['A', 'B'], habitDays: [null, [4]] }); return { all: [...d.querySelectorAll('.hd-all.on')].map(b => b.dataset.i), on: [...d.querySelectorAll('.hd-day.on')].map(b => b.dataset.i + ':' + b.dataset.d) }; });
  t.eq(chips, { all: ['0'], on: ['1:4'] }, 'el editor del coach marca los días de cada hábito');
  await c.close();
}
