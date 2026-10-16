// Rutinas armadas sin notas: el catálogo (rutinas_catalogo) se había cargado copiando plantillas
// de un coach, con lo que ese coach le escribe a una alumna, y quien elegía una de esas rutinas
// veía esas notas en su Entreno. Ahora la copia (copiarDias, app/core/rutinas-ejemplo.js) lleva
// solo lo que hace a la rutina: ni notas del día o del ejercicio, ni objetivo de progreso, ni el
// video o el audio del coach, ni kilos propuestos o anotados, ni «sin sugerencias». Se prueba al
// elegirla en la bienvenida, desde Entreno → "Ver rutinas armadas" y al importarla un coach.
import { newPage, wait, saved, text, ALUMNO } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
// Una fila del catálogo como quedó al copiar la plantilla de un coach.
const FILA = { id: 'c0ffee00-0000-4000-8000-000000000001', nombre: 'Plantilla copiada · 2 días', para: 'todos', descripcion: 'Copiada de las rutinas de un coach', days: [
  { id: 'cd1', name: 'Pierna', subtitle: 'Lunes · Pierna', note: 'Ana: hoy tranqui por la rodilla', noSug: true, exercises: [
    { id: 'ce1', name: 'Sentadilla libre', mus: 'cuadriceps', rir: '2-1', rest: "2'-3'", ss: true, noSug: true,
      note: 'Ana, bajá lento y cuidá la rodilla izquierda', goal: 'Ana: llegar a 60 kg en diciembre',
      video: 'https://youtu.be/ana-sentadilla', videoFor: 'Sentadilla libre', audio: COACH.id + '/ex/abcdefgh12.webm', audioSecs: 21,
      sets: [{ id: 'cs1', kg: '40', reps: '10', targetKg: '45', done: true, target: '8-10' }, { id: 'cs2', kg: '40', reps: '9', targetKg: '45', done: true, target: '8-10' }] },
    { id: 'ce2', name: 'Prensa 45', mus: 'cuadriceps', rir: '2-1', rest: "2'", sets: [{ id: 'cs3', kg: '100', reps: '12', done: false, target: '10-12' }] }] },
  { id: 'cd2', name: 'Core', subtitle: 'Jueves · Abdominales', note: 'Ana: traé la banda', exercises: [
    { id: 'ce3', name: 'Plancha', mus: 'abs', rest: '1:30', timed: true, note: 'Ana: sin arquear la espalda', sets: [{ id: 'cs4', kg: '', reps: '', secs: '50', done: true, target: '45 s' }] }] },
] };
// Lo único que tiene que llegar a la rutina de quien la elige (sin los id, que son nuevos).
const ESPERADA = [
  { name: 'Pierna', subtitle: 'Lunes · Pierna', dias: [1], exercises: [
    { name: 'Sentadilla libre', mus: 'cuadriceps', rir: '2-1', rest: "2'-3'", ss: true, sets: [{ kg: '', reps: '', done: false, target: '8-10' }, { kg: '', reps: '', done: false, target: '8-10' }] },
    { name: 'Prensa 45', mus: 'cuadriceps', rir: '2-1', rest: "2'", sets: [{ kg: '', reps: '', done: false, target: '10-12' }] }] },
  { name: 'Core', subtitle: 'Jueves · Abdominales', dias: [4], exercises: [
    { name: 'Plancha', mus: 'abs', rest: '1:30', timed: true, sets: [{ kg: '', reps: '', done: false, target: '45 s' }] }] },
];
const sinIds = v => Array.isArray(v) ? v.map(sinIds) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter(k => k !== 'id').sort().map(k => [k, sinIds(v[k])])) : v;
const PERSONAL = /Ana|"note"|"goal"|"video|"audio|"noSug"|"targetKg"|"secs"|"40"|"45"|"100"|"done":true/;
const catalogo = (r, J, i) => i.m === 'GET' ? J([FILA]) : undefined;
const perfilSinCoach = (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); };

function revisar(t, days, donde){
  t.eq(sinIds(days), sinIds(ESPERADA), donde + ': solo lo que hace a la rutina');
  t.ok(!PERSONAL.test(JSON.stringify(days)), donde + ': sin notas, objetivos, video, audio ni kilos: ' + JSON.stringify(days).slice(0, 200));
  t.ok((days || []).every(d => /^[a-z0-9]+$/.test(d.id) && d.exercises.every(e => /^[a-z0-9]+$/.test(e.id))), donde + ': ids nuevos');
}

export default async function ({ base, t }){
  // 1) copiarDias sola: también con datos raros (sin días, con cosas que no son objetos).
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/app/'); await wait(800);
    const r = await p.evaluate(async (fila) => {
      const m = await import('/app/core/rutinas-ejemplo.js');
      return { cp: m.copiarDias(fila.days), vacio: m.copiarDias(null), raros: m.copiarDias([null, 'x', { name: 'D', note: 'n', exercises: [null, { name: 'E', note: 'n', sets: [null, { target: '5', note: 'n' }] }] }]), igual: JSON.stringify(fila) };
    }, FILA);
    revisar(t, r.cp, 'copiarDias');
    t.eq(r.vacio, [], 'copiarDias(null): nada');
    t.eq(sinIds(r.raros), sinIds([{ name: 'D', exercises: [{ name: 'E', sets: [{ kg: '', reps: '', done: false, target: '5' }] }] }]), 'saltea lo que no es un objeto y no copia notas');
    t.eq(r.igual, JSON.stringify(FILA), 'no cambia la rutina del catálogo');
    t.eq(errs, [], 'copiarDias: errores de la página');
    await close();
  }

  // 2) Cuenta nueva sin coach: la elige en la bienvenida.
  {
    const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
    const ups = [];
    const { p, errs, close } = await newPage({ user: NUEVO, handlers: { '/profiles': perfilSinCoach, '/rutinas_catalogo': catalogo,
      '/routines': (r, J, i) => { if (i.m === 'GET') return J(null); const b = JSON.parse(i.body); ups.push((Array.isArray(b) ? b[0] : b).days); return undefined; } } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(300);
    await p.click('[data-onb="solo"]'); await wait(300);
    await p.click('[data-onb="next"]'); await wait(300);
    await p.click('[data-onb="sex"][data-v="x"]'); await wait(800);
    t.ok(await p.isVisible('.onb-routine[data-v="' + FILA.id + '"]'), 'bienvenida: ofrece la rutina del catálogo');
    await p.click('.onb-routine[data-v="' + FILA.id + '"]'); await wait(1500);
    revisar(t, (await saved(p)).days, 'bienvenida');
    t.ok(ups.length > 0, 'bienvenida: la rutina se sube a la cuenta');
    t.ok(ups.length && !ups.some(d => PERSONAL.test(JSON.stringify(d))), 'bienvenida: lo que se sube tampoco las tiene');
    const txt = await text(p, '#view');
    t.ok(/Sentadilla libre|Plancha/.test(txt) && !/Ana|Nota de tu coach/.test(txt), 'bienvenida: Entreno no muestra las notas: ' + txt.slice(0, 160));
    t.eq(errs, [], 'bienvenida: errores de la página');
    await close();
  }

  // 3) Entreno → "Ver rutinas armadas".
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', subtitle: '', exercises: [] }], sessions: [], weights: [], daily: {}, sex: 'x' },
      handlers: { '/profiles': perfilSinCoach, '/rutinas_catalogo': catalogo } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('.empty-pick [data-action="open-routines"]'); await wait(800);
    await p.click('.onb-routine[data-v="' + FILA.id + '"]'); await wait(800);
    revisar(t, (await saved(p)).days, 'Entreno');
    t.ok(!/Ana|Nota de tu coach/.test(await text(p, '#view')), 'Entreno: no muestra las notas');
    t.eq(errs, [], 'Entreno: errores de la página');
    await close();
  }

  // 4) Coach: «Importar rutina armada» en Mis rutinas.
  {
    const { p, errs, close } = await newPage({ user: COACH, handlers: { '/rutinas_catalogo': catalogo,
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click('[data-coach="view-tpls"]'); await wait(800);
    await p.click('[data-coach="tpl-seed-open"]'); await wait(300);
    await p.click('[data-coach="tpl-seed-cat"][data-id="' + FILA.id + '"]'); await wait(500);
    const days = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); return CoachState.coachTplEdit && CoachState.coachTplEdit.days; });
    revisar(t, days, 'coach');
    t.eq(errs, [], 'coach: errores de la página');
    await close();
  }
}
