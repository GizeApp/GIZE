// Entreno → «Ver variantes»: el mismo músculo con otro equipo, por si la máquina está ocupada o
// no está. Elegir una cambia el ejercicio SOLO POR HOY: la rutina (y la del coach) no se toca,
// las series del coach quedan, el entreno guardado dice qué se hizo y en lugar de qué, y al día
// siguiente vuelve el original.
import { newPage, saved, text, wait, ALUMNO, profile } from './lib.mjs';

const BANCA = 'Press de banca plano (barra)', MANC = 'Press plano con mancuernas';

export default async function ({ base, t }){
  const mk = () => [{ id: 'd1', name: 'Torso', exercises: [
    { id: 'e1', name: BANCA, mus: 'pecho', rir: '2', note: 'Bajá controlado.', ss: true,
      sets: [{ id: 's1', kg: '50', reps: '', target: '8-10' }, { id: 's2', kg: '50', reps: '', target: '8-10' }] },
    { id: 'e2', name: 'Remo con barra', mus: 'espalda', sets: [{ id: 's3', kg: '', reps: '', target: '10' }] },
    { id: 'e3', name: 'Mi ejercicio raro', sets: [{ id: 's4', kg: '', reps: '' }] }] }];
  const ts = d => Date.parse(d + 'T12:00:00Z');
  const sessions = [{ id: 'a', date: '2026-09-20', ts: ts('2026-09-20'), day: 'Torso', exercises: [{ name: MANC, sets: [{ kg: 24, reps: 10 }, { kg: 22, reps: 9 }] }] }];

  const card = p => p.evaluate(() => {
    const c = document.querySelector('[data-ex-id="e1"]'); if (!c) return null;
    return { name: c.querySelector('.ex-name').value, chip: c.querySelector('.ex-var-chip') ? c.querySelector('.ex-var-chip').innerText.replace(/\s+/g, ' ') : '',
      btn: !!c.querySelector('.ex-var-btn'), goals: [...c.querySelectorAll('.goal')].map(g => g.textContent), rir: !!c.querySelector('.ep-chip'),
      note: c.querySelector('.ex-note') ? c.querySelector('.ex-note').textContent : '', kgs: [...c.querySelectorAll('input.kg')].map(i => i.value),
      inSS: !!c.closest('.ss-group') && !!c.closest('.ss-group').querySelector('[data-ex-id="e2"]') };
  });
  const open = async p => { await p.click('.ex-collapsed[data-ex="e1"]'); await wait(250); };
  const sheet = p => p.evaluate(() => {
    const s = document.querySelector('#sheetHost .var-sheet'); if (!s) return null;
    return { title: s.querySelector('.sheet-title').textContent, hint: s.querySelector('.var-hint').textContent,
      items: [...s.querySelectorAll('.var-pick')].map(b => ({ n: b.querySelector('.vp-n').textContent, eq: (b.querySelector('.vp-eq') || {}).textContent || '', own: (b.querySelector('.vp-own') || {}).textContent || '' })) };
  });
  const pick = async (p, name) => { await p.click('#sheetHost .var-pick[data-name="' + name + '"]'); await wait(450); };

  // ---- Rutina propia ----
  {
    const dayPosts = [];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: mk(), sessions, weights: [], daily: {} }, handlers: { '/profiles': profile('client'), '/sessions': (r, J, i) => i.m === 'GET' ? J({ message: 'sin red' }, 500) : undefined,
      '/daily_logs': (r, J, i) => { if (i.m === 'POST') dayPosts.push(i.body || ''); return undefined; } } });
    await p.goto(base + '/app/'); await wait(2500); await open(p);
    let c = await card(p);
    t.ok(c && c.btn, 'el ejercicio abierto tiene «Ver variantes»');
    const raro = await p.evaluate(async () => { const e = await import('/app/screens/entreno.js'), m = await import('/app/main.js'); e.expandedOverride.add('e3'); m.renderApp(); return !!document.querySelector('[data-ex-id="e3"] .ex-var-btn'); });
    t.ok(!raro, 'un ejercicio con nombre propio (sin variantes) no muestra el botón');

    await p.click('[data-ex-id="e1"] .ex-var-btn'); await wait(400);
    const sh = await sheet(p);
    t.ok(sh, 'se abre la hoja de variantes');
    if (sh){
      t.eq(sh.title, 'Variantes · Pecho', 'título de la hoja');
      t.has(sh.hint, 'Tu rutina no cambia: es solo por hoy.', 'la hoja explica que es solo por hoy');
      t.eq(sh.items[0], { n: BANCA, eq: 'Barra', own: 'En tu rutina' }, 'primero el de la rutina, marcado');
      const rest = sh.items.slice(1);
      t.ok(rest.length >= 4 && rest.length <= 8, 'entre 4 y 8 variantes — llegaron ' + rest.length);
      t.ok(rest.some(x => x.eq === 'Mancuernas' && /press/i.test(x.n)), 'hay un press con mancuernas: ' + JSON.stringify(rest));
      t.ok(rest.some(x => x.eq === 'Máquina' && /pecho|peck|aperturas/i.test(x.n)), 'hay uno de pecho en máquina: ' + JSON.stringify(rest));
      t.ok(!rest.some(x => x.n === BANCA), 'no repite el mismo ejercicio');
      t.ok(!rest.some(x => x.eq === 'Barra'), 'primero otro equipo (no sale otro con barra)');
      const pecho = await p.evaluate(async () => (await import('/app/core/data.js')).EX_DB.pecho);
      t.ok(rest.every(x => pecho.includes(x.n)), 'todas son de pecho: ' + rest.map(x => x.n).join(', '));
    }
    await pick(p, MANC);
    c = await card(p);
    t.eq(c && c.name, MANC, 'el ejercicio de hoy pasa a ser la variante');
    t.has(c && c.chip, 'Variante de hoy · en lugar de ' + BANCA, 'aviso de variante con el original');
    t.has(c && c.chip, 'Volver al original', 'con «Volver al original»');
    t.eq(c && c.goals, ['8-10', '8-10'], 'quedan las series y repeticiones del coach');
    t.ok(c && c.rir && c.note.includes('Bajá controlado'), 'quedan el RIR y la nota');
    t.eq(c && c.kgs, ['24', '22'], 'los kg pasan a los de la vez pasada de la variante');
    t.ok(c && c.inSS, 'la superserie sigue armada');
    let st = await saved(p);
    t.eq(st.days[0].exercises[0].name, BANCA, 'la rutina no cambia');
    t.eq(st.exVariant && st.exVariant.map.e1 && st.exVariant.map.e1.name, MANC, 'la variante queda guardada para hoy');

    // Volver al original: vuelve el nombre y el peso que había.
    await p.click('[data-ex-id="e1"] [data-action="var-back"]'); await wait(300);
    c = await card(p);
    t.eq(c && [c.name, c.chip, c.kgs], [BANCA, '', ['50', '50']], '«Volver al original» deja todo como estaba');
    st = await saved(p);
    t.ok(!st.exVariant, 'y no queda variante guardada');

    // Guardar el entreno con la variante.
    await p.click('[data-ex-id="e1"] .ex-var-btn'); await wait(400);
    await pick(p, MANC);
    await p.fill('[data-ex-id="e1"] input.reps[data-set="s1"]', '10'); await wait(100);
    await p.click('[data-ex-id="e1"] [data-action="toggle"][data-set="s1"]'); await wait(400);
    await p.evaluate(async () => (await import('/app/screens/checkin.js')).saveSession()); await wait(600);
    st = await saved(p);
    t.eq(st.days[0].exercises[0].sets.map(s => s.kg), ['50', '50'], 'al guardar vuelve el peso del original (no queda el de la variante)');
    // «Seguir entrenando»: vuelve la variante con sus kg; y se guarda de nuevo.
    await p.click('#fbHost [data-action="fb-undo"]'); await wait(400);
    st = await saved(p);
    t.eq([st.exVariant && st.exVariant.map.e1 && st.exVariant.map.e1.name, st.days[0].exercises[0].sets.map(s => s.kg)], [MANC, ['24', '22']], '«Seguir entrenando»: vuelve la variante con sus kg');
    await wait(1200);
    await p.evaluate(async () => (await import('/app/screens/checkin.js')).saveSession()); await wait(600);
    st = await saved(p);
    t.eq(st.days[0].exercises[0].sets.map(s => s.kg), ['50', '50'], 'guardado otra vez: de nuevo el peso del original');
    const last = st.sessions[st.sessions.length - 1];
    t.eq(last && last.exercises[0], { name: MANC, originalName: BANCA, sets: [{ kg: 24, reps: 10 }] }, 'el entreno guardado tiene la variante y el original');
    t.ok(!st.exVariant, 'al guardar se borra la variante de hoy');
    t.eq(st.exSubs && st.exSubs.list, [{ day: 'Torso', n: MANC, o: BANCA }], 'queda anotado lo que se cambió (para el coach)');
    await p.evaluate(async () => { const { CheckinState } = await import('/app/screens/checkin.js'); CheckinState.fbSession = null; (await import('/app/main.js')).renderApp(); }); await wait(200);
    c = await card(p);
    t.eq(c && c.name, BANCA, 'después de guardar vuelve el ejercicio de la rutina');
    // Lo que ve el historial (y el coach): «Hizo X en lugar de Y».
    const det = await p.evaluate(async s => { const m = await import('/app/ui/sessiondetail.js'); const d = document.createElement('div'); d.innerHTML = m.renderSessionItem(s, { open: true }); return d.innerText.replace(/\s+/g, ' '); }, last);
    t.has(det, 'Hizo ' + MANC + ' en lugar de ' + BANCA, 'el historial muestra «en lugar de»');
    // El registro del día que sube a la nube lleva lo cambiado.
    const snap = await p.evaluate(async () => { const v = await import('/app/core/variantes.js'); return v.todaySubs(); });
    t.eq(snap, [{ day: 'Torso', n: MANC, o: BANCA }], 'lo cambiado de hoy está listo para subir con el día');
    await wait(2200);
    t.ok(dayPosts.some(b => b.includes('"subs"') && b.includes(BANCA)), 'el registro del día sube con lo cambiado (habits_done.subs)');

    // Al día siguiente vuelve el original (aunque no haya guardado el entreno).
    await p.click('[data-ex-id="e1"] .ex-var-btn'); await wait(400);
    await pick(p, MANC);
    t.eq((await card(p)).name, MANC, 'elegida otra vez');
    await p.evaluate(async () => { const { state } = await import('/app/core/state.js'); state.exVariant.date = '2020-01-01'; delete state.wkStart; (await import('/app/main.js')).renderApp(); }); await wait(200);
    t.eq((await card(p)).name, BANCA, 'al día siguiente vuelve el original');
    t.eq((await card(p)).kgs, ['50', '50'], 'al día siguiente vuelve también su peso');
    t.ok(!(await saved(p)).exVariant, 'y la variante vencida se borra');
    t.eq(errs, [], 'errores de la página');
    await close();
  }

  // ---- Rutina del coach (bloqueada) ----
  {
    const days = mk();
    let routinePosts = 0;
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: '99999999-9999-9999-9999-999999999999' }; return J(i.one ? me : [me]); },
        '/routines': (r, J, i) => { if (i.m !== 'GET'){ routinePosts++; return undefined; } return J(i.one ? { days, updated_at: new Date().toISOString() } : [{ days }]); } } });
    await p.goto(base + '/app/'); await wait(2500); await open(p);
    const locked = await p.evaluate(() => ({ banner: !!document.querySelector('.coach-banner'), swap: !!document.querySelector('[data-ex-id="e1"] [data-action="ex-swap"]') }));
    t.ok(locked.banner && !locked.swap, 'rutina del coach: bloqueada (sin «Cambiar ejercicio») — ' + JSON.stringify(locked));
    t.ok((await card(p)).btn, 'rutina del coach: igual tiene «Ver variantes»');
    await p.click('[data-ex-id="e1"] .ex-var-btn'); await wait(400);
    await pick(p, MANC);
    const c = await card(p);
    t.eq(c && c.name, MANC, 'rutina del coach: se puede usar la variante por hoy');
    t.eq(c && c.goals, ['8-10', '8-10'], 'rutina del coach: quedan las series del coach');
    const st = await saved(p);
    t.eq(st.days[0].exercises[0].name, BANCA, 'rutina del coach: la rutina no cambia');
    t.eq(routinePosts, 0, 'rutina del coach: no se sube ninguna rutina');
    // El coach, al bajar los entrenos (solo nombres), los marca con el registro del día.
    const coach = await p.evaluate(async ([MANC, BANCA]) => {
      const v = await import('/app/core/variantes.js'), m = await import('/app/ui/sessiondetail.js');
      const ses = [{ date: '2026-10-01', day: 'Torso', ts: 1, exercises: [{ name: MANC, sets: [{ kg: 24, reps: 10 }] }, { name: 'Remo con barra', sets: [{ kg: 60, reps: 8 }] }] }];
      v.markSubs(ses, [{ log_date: '2026-10-01', habits_done: { own: [], coach: [], subs: [{ day: 'Torso', n: MANC, o: BANCA }] } }]);
      const d = document.createElement('div'); d.innerHTML = m.renderSessionItem(ses[0], { open: true, history: ses });
      return { orig: ses[0].exercises.map(e => e.originalName || null), txt: d.innerText.replace(/\s+/g, ' ') };
    }, [MANC, BANCA]);
    t.eq(coach.orig, [BANCA, null], 'coach: el entreno de la nube se marca con el original');
    t.has(coach.txt, 'Hizo ' + MANC + ' en lugar de ' + BANCA, 'coach: ve «en lugar de»');
    t.eq(errs, [], 'rutina del coach: errores de la página');
    await close();
  }
}
