// Hábitos con días y aviso (⏰): cada hábito puede ir todos los días o días elegidos y tener
// hora de aviso. Los del coach traen sus días (el alumno puede cambiarlos y ponerles hora).
// En la web se ve la lista (al guardar una hora avisa que ahí no suena); en la app de Android se
// programan las notificaciones del celular.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const ARG = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' });
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[ARG.format(new Date())];
const OTHER = (DOW + 2) % 7; // un día que no es hoy
// El plugin guarda lo programado aparte (sigue en su lista al volver a abrir la app, aunque
// Android haya borrado las alarmas). __log: lo que se le pidió; __shown: ids en la barra.
const NATIVE = () => {
  const sched = JSON.parse(localStorage.getItem('__ln') || '[]'), keep = () => localStorage.setItem('__ln', JSON.stringify(sched));
  window.__sched = sched; window.__perm = 'granted'; window.__log = [];
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999' }), addListener: () => {} },
    LocalNotifications: {
      checkPermissions: async () => ({ display: window.__perm }), requestPermissions: async () => ({ display: window.__perm }),
      getPending: async () => ({ notifications: sched.map(n => ({ id: n.id })) }),
      getDeliveredNotifications: async () => ({ notifications: JSON.parse(sessionStorage.getItem('__shown') || '[]').map(id => ({ id })) }),
      cancel: async o => { const ids = o.notifications.map(n => n.id); window.__log.push('cancel ' + ids); for (let i = sched.length - 1; i >= 0; i--) if (ids.includes(sched[i].id)) sched.splice(i, 1); keep(); },
      createChannel: async () => {}, schedule: async o => { window.__log.push('schedule ' + o.notifications.map(n => n.id)); o.notifications.forEach(n => sched.push(n)); keep(); }, addListener: () => {},
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
// ¿Hay algún color con tinte (no gris) en este valor de CSS? rgb()/rgba() y color(srgb …), que es
// como sale un color-mix() calculado; canales de 0 a 255. Los transparentes no cuentan.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);
const FILETE = /linear-gradient\(155deg/;

export default async function ({ base, t }){
  // --- Web ---
  let { p, errs, dialogs, prefs, close } = await open(base);
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
  const nDialogs = dialogs.length;
  await pickTime(p, '09:00'); await p.click('[data-action="hba-save"]'); await wait(400);
  t.has(await text(p, '.hb-list'), '09:00 · Todos los días', 'se ve la hora del aviso');
  // En la web no suena: se avisa al guardar (la hora queda para la app del celular).
  t.has(dialogs.slice(nDialogs).join(' | '), 'El aviso suena solo en la app de GIZE para Android o iPhone', 'web: avisa que acá no suena');
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
  // Apariencia tranquila (css/ui/calma.css): las notas (del coach, propias y de otros días) con el
  // mismo filete fino con un toque de color en el borde (ya no el neón a dos colores), quietas y
  // con una sombra neutra, sin resplandor de color.
  const notas = await p.evaluate(() => Object.fromEntries([['coach', '.hb-list .hb-item.coach'], ['own', '.hb-list .hb-item:not(.coach):not(.later)'], ['later', '.hb-item.later']].map(([k, sel]) => {
    const e = document.querySelector(sel); if (!e) return [k, null];
    const cs = getComputedStyle(e); return [k, { ring: cs.backgroundImage, shadow: cs.boxShadow, anim: cs.animationName }];
  })));
  for (const [k, nombre] of [['coach', 'nota del coach'], ['own', 'nota propia'], ['later', 'nota de otro día']]) {
    const x = notas[k];
    t.ok(!!x, nombre + ': está en la pantalla');
    if (!x) continue;
    t.ok(FILETE.test(x.ring) && !x.ring.includes('conic-gradient') && conTinte(x.ring) && x.ring.includes('rgba(255, 255, 255'), nombre + ': borde con el filete fino y un toque de color, no el neón: ' + x.ring.slice(0, 120));
    t.ok(x.shadow !== 'none' && !conTinte(x.shadow), nombre + ': sombra neutra, sin resplandor de color: ' + x.shadow);
    t.eq(x.anim, 'none', nombre + ': quieta (no gira)');
  }
  t.eq(notas.own && notas.own.ring, notas.coach && notas.coach.ring, 'las del coach y las propias con el mismo filete (sin el neón a dos colores)');
  t.eq(errs, [], 'errores de la página (web)');
  await close();

  // --- App de Android: se programan las notificaciones ---
  ({ p, errs, dialogs, close } = await open(base, { native: true }));
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
  // «Forzar detención» borra las alarmas de Android, pero el plugin las sigue listando. Al volver a
  // abrir la app se programan de nuevo aunque la lista no cambió, menos la que está a la vista en
  // la barra (programarla la borraría; su alarma sigue).
  const ids = await p.evaluate(() => window.__sched.map(n => n.id).sort());
  await p.evaluate(id => sessionStorage.setItem('__shown', JSON.stringify([id])), ids[0]);
  await p.reload(); await wait(3500);
  t.eq(await p.evaluate(() => window.__log), ['cancel ' + ids.slice(1), 'schedule ' + ids.slice(1)], 'al abrir la app se vuelven a programar (sin tocar el de la barra)');
  t.eq(await p.evaluate(() => window.__sched.map(n => n.id).sort()), ids, 'quedan los mismos avisos');
  await p.evaluate(async () => { (await import('/app/ui/habitnotif.js')).syncHabitAlarms(); }); await wait(1000);
  t.eq(await p.evaluate(() => window.__log.length), 2, 'una sola vez por arranque');
  await p.evaluate(() => sessionStorage.removeItem('__shown'));
  await p.click('#nav-habitos'); await wait(400);
  // Borrar el hábito saca su aviso.
  await p.click(`[data-action="habit-remove"][data-id="${id2}"]`); await wait(1200);
  sched = await p.evaluate(() => window.__sched.map(n => n.title));
  t.eq(sched, ['Caminar 30 min'], 'al borrar un hábito se borra su aviso');
  t.ok(!dialogs.some(d => /solo en la app/.test(d)), 'Android: no avisa que no suena');
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
