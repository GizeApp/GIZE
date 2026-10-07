// Días de la semana de cada día de la rutina (app/core/diasemana.js): el alumno sin coach los
// elige en la portada del día y viajan con la rutina a la nube; al abrir la app (o al volver otro
// día) Entreno arranca en el día que toca hoy, salvo en medio de un entreno o si hoy ya eligió
// otro a mano; sin coincidencia queda como siempre. El coach los pone en su editor (se guardan
// con la rutina) y el alumno con coach los ve sin poder cambiarlos.
import { newPage, wait, saved, text, ALUMNO, profile } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const ex = (id, name) => ({ id, name, sets: [{ id: id + 's', kg: '', reps: '', done: false }] });
const CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONFIRST = a => [1, 2, 3, 4, 5, 6, 0].filter(n => a.includes(n));
// Hoy en Argentina (lo mismo que usa la app: today() con la zona del celular).
const dowAR = ms => new Date(new Date(ms).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })).getDay();
const T = dowAR(Date.now()), T1 = (T + 1) % 7, T2 = (T + 2) % 7, T3 = (T + 3) % 7;
const active = p => p.evaluate(async () => (await import('/app/core/state.js')).State.activeId);
const visible = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
// La sesión simulada vence en una hora: al adelantar el reloj un día se estira para que no se cierre.
const longSession = () => { try { const k = 'sb-wegptuzhsrwppbknqstf-auth-token', s = JSON.parse(localStorage.getItem(k)); if (s) { s.expires_at = Math.floor(Date.now() / 1000) + 9 * 86400; localStorage.setItem(k, JSON.stringify(s)); } } catch (e) {} };

export default async function ({ base, t }){
  const shots = process.env.SHOTS;

  // ---- Ayudas puras ----
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/app/'); await wait(800);
    const r = await p.evaluate(async () => {
      const m = await import('/app/core/diasemana.js'), c = await import('/app/core/rutinas-ejemplo.js');
      const cp = c.copiarDias([{ id: 'x', name: 'Torso', subtitle: 'Miércoles · Pecho', exercises: [] }, { id: 'y', name: 'Full', subtitle: 'Una vez por semana · Todo', exercises: [] }, { id: 'z', name: 'Z', subtitle: 'Sábado · X', dias: [2], exercises: [] }]);
      const d = {}; m.toggleDia(d, 4); m.toggleDia(d, 0); m.toggleDia(d, 1); const a = d.dias.slice(); m.toggleDia(d, 0); m.toggleDia(d, 1); m.toggleDia(d, 4);
      return { txt: [m.diasTexto({ dias: [4, 1] }), m.diasTexto({ dias: [3] }), m.diasTexto({ dias: [0, 1, 2, 3, 4, 5, 6] }), m.diasTexto({}), m.diasTexto({ dias: ['<b>', 9, 1, 1] })],
        a, vacio: 'dias' in d, cp: cp.map(x => x.dias || null) };
    });
    t.eq(r.txt, ['Lun · Jue', 'Miércoles', 'Todos los días', '', 'Lunes'], 'textos de los días (de lunes a domingo, limpios)');
    t.eq(r.a, [1, 4, 0], 'toggleDia guarda de lunes a domingo (0 = domingo, como Date.getDay)');
    t.eq(r.vacio, false, 'sin ningún día el campo se borra (queda como antes)');
    t.eq(r.cp, [[3], null, [2]], 'rutinas armadas: el día del subtítulo queda asignado (sin pisar uno puesto)');
    t.eq(errs, [], 'errores de la página (ayudas)');
    await close();
  }

  // ---- Sin coach: elegir los días en la portada, se guardan y suben; al volver a abrir, el de hoy ----
  {
    const posts = [];
    const days = [{ id: 'd1', name: 'Día A', subtitle: '', exercises: [ex('e1', 'Sentadilla libre')] }, { id: 'd2', name: 'Día B', subtitle: '', exercises: [ex('e2', 'Press de banca plano (barra)')] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': profile('client'), '/routines': (r, J, i) => { if (i.m === 'GET') return undefined; posts.push(i.body); return J([], 201); } } });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(await active(p), 'd1', 'sin días asignados abre como siempre (el primero)');
    t.has(await text(p, '.day-head .day-dias.empty'), 'Elegir días de la semana', 'la portada invita a elegir los días');
    if (shots) await p.screenshot({ path: shots + '/dias-cliente-invitacion.png' });
    await p.click('[data-action="tab"][data-day="d2"]'); await wait(400);
    await p.click('.day-head .day-dias'); await wait(300);
    t.eq(await p.$$eval('.dd-chip', b => b.map(x => x.textContent)), ['L', 'M', 'M', 'J', 'V', 'S', 'D'], 'siete botones de lunes a domingo');
    await p.click(`.dd-chip[data-d="${T3}"]`); await wait(250);
    await p.click(`.dd-chip[data-d="${T}"]`); await wait(250);
    t.eq(await p.$$eval('.dd-chip.on', b => b.map(x => +x.dataset.d)), MONFIRST([T, T3]), 'los dos quedan marcados');
    if (shots) await p.screenshot({ path: shots + '/dias-cliente-elegir.png' });
    const st = await saved(p);
    t.eq(st.days[1].dias, MONFIRST([T, T3]), 'se guardan en el día (de lunes a domingo)');
    t.ok(!('dias' in st.days[0]), 'el otro día queda sin días');
    await p.click('[data-action="dias-close"]'); await wait(300);
    const lbl = await text(p, '.day-head .day-dias');
    t.has(lbl, MONFIRST([T, T3]).map(n => CORTO[n]).join(' · '), 'debajo del nombre: los días cortos');
    t.has(lbl, 'hoy', 'y que hoy toca este día');
    await wait(2500);
    const last = posts.length ? JSON.parse(posts[posts.length - 1]) : null, row = Array.isArray(last) ? last[0] : last;
    t.eq(row && row.days && row.days[1] && row.days[1].dias, MONFIRST([T, T3]), 'suben a la nube adentro de la rutina (days)');
    // Al volver a abrir la app (hoy toca el Día B), arranca en ese.
    await p.reload(); await wait(2500);
    t.eq(await active(p), 'd2', 'al abrir la app arranca en el día que toca hoy');
    if (shots) await p.screenshot({ path: shots + '/dias-cliente-oscuro.png' });
    if (shots) {
      await p.evaluate(() => { document.documentElement.classList.add('tema-luz'); }); await wait(300);
      await p.screenshot({ path: shots + '/dias-cliente-claro.png' });
      await p.click('.day-head .day-dias'); await wait(300);
      await p.screenshot({ path: shots + '/dias-cliente-claro-elegir.png' });
      await p.evaluate(() => { document.documentElement.classList.remove('tema-luz'); document.documentElement.classList.add('tema-claro'); }); await wait(300);
      await p.screenshot({ path: shots + '/dias-cliente-azul-elegir.png' });
      await p.evaluate(() => { document.documentElement.classList.remove('tema-claro'); }); await p.click('[data-action="dias-close"]'); await wait(300);
    }
    t.eq(errs, [], 'errores de la página (sin coach)');
    await close();
  }

  // ---- En medio de un entreno no se mueve; sin coincidencia queda el de ahora ----
  {
    const days = [{ id: 'd1', name: 'Día A', exercises: [ex('e1', 'Sentadilla libre')] }, { id: 'd2', name: 'Día B', dias: [T], exercises: [ex('e2', 'Remo con barra')] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {}, wkStart: { date: '2000-01-01', day: 'd1', ts: Date.now() - 10 * 60000, manual: true } },
      handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(await active(p), 'd1', 'entrenando: no salta al día de hoy');
    t.ok(await p.$('.wk-live'), 'el entreno sigue en curso');
    await visible(p); await wait(300);
    t.eq(await active(p), 'd1', 'entrenando: al volver a la app tampoco');
    // Termina el entreno (Cancelar): recién al volver otra vez pasa al de hoy.
    await p.evaluate(async () => { const { state } = await import('/app/core/state.js'); state.wkStart = null; });
    await visible(p); await wait(300);
    t.eq(await active(p), 'd2', 'sin entreno en curso, al volver pasa al día de hoy');
    t.eq(errs, [], 'errores de la página (entreno)');
    await close();
  }
  {
    const days = [{ id: 'd1', name: 'Día A', dias: [T1], exercises: [] }, { id: 'd2', name: 'Día B', dias: [T2], exercises: [] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(await active(p), 'd1', 'ningún día tiene hoy: abre como siempre');
    await p.evaluate(async () => { (await import('/app/core/state.js')).State.activeId = 'd2'; });
    await visible(p); await wait(300);
    t.eq(await active(p), 'd2', 'ningún día tiene hoy: queda el día que estaba');
    t.eq(errs, [], 'errores de la página (sin coincidencia)');
    await close();
  }

  // ---- Elegido a mano hoy: no se mueve; al día siguiente, sí ----
  {
    const days = [{ id: 'd1', name: 'Día A', dias: [T], exercises: [] }, { id: 'd2', name: 'Día B', dias: [T1], exercises: [] }, { id: 'd3', name: 'Día C', exercises: [] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') }, init: longSession });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(await active(p), 'd1', 'abre en el día de hoy');
    await p.click('[data-action="tab"][data-day="d3"]'); await wait(400);
    await visible(p); await wait(300);
    t.eq(await active(p), 'd3', 'elegido a mano hoy: al volver no lo mueve');
    await p.clock.setFixedTime(Date.now() + 86400000);
    await visible(p); await wait(400);
    t.eq(await active(p), 'd2', 'al día siguiente vuelve a abrir en el día que toca');
    t.has(await text(p, '.day-head .day-dias'), 'hoy', 'y lo marca como el de hoy');
    t.eq(errs, [], 'errores de la página (a mano)');
    await close();
  }

  // ---- Coach: los días en su editor, se guardan con la rutina ----
  {
    const ACTUAL = [{ id: 'cd1', name: 'Torso', subtitle: '', exercises: [ex('ce1', 'Remo con barra')] }, { id: 'cd2', name: 'Pierna', subtitle: '', exercises: [ex('ce2', 'Sentadilla libre')] }];
    const posts = [];
    const { p, errs, close } = await newPage({ user: COACH, handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => { if (i.m === 'GET') return J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]); posts.push(JSON.parse(i.body)); return J([], 201); } } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(400);
    t.eq(await p.$$eval('.co-dias .hd-day', b => b.map(x => x.textContent)), ['L', 'M', 'M', 'J', 'V', 'S', 'D'], 'el editor del coach tiene los 7 días');
    t.has(await text(p, '.co-dias-hint'), 'Sin días', 'sin días: elige a mano');
    await p.click('.co-dias .hd-day[data-d="1"]'); await wait(250);
    await p.click('.co-dias .hd-day[data-d="4"]'); await wait(250);
    t.eq(await p.$$eval('.co-dias .hd-day.on', b => b.map(x => +x.dataset.d)), [1, 4], 'quedan marcados lunes y jueves');
    t.has(await text(p, '.co-daytab.on'), 'Lun · Jue', 'la pestaña del día los muestra');
    t.has(await text(p, '.co-unsaved'), 'Cambios sin guardar', 'cuenta como cambio sin guardar');
    if (shots) { await p.evaluate(() => { const e = document.querySelector('.co-day-card'); if (e) e.scrollIntoView({ block: 'center' }); }); await wait(200); await p.screenshot({ path: shots + '/dias-coach.png' }); }
    await p.click('[data-coach="save-routine"]'); await wait(1200);
    const row = posts.length ? (Array.isArray(posts[0]) ? posts[0][0] : posts[0]) : null;
    t.eq(row && row.days.map(d => d.dias || null), [[1, 4], null], 'la rutina guardada lleva los días de la semana');
    t.eq(errs, [], 'errores de la página (coach)');
    await close();
  }

  // ---- Alumno con coach: los ve, no los cambia, y abre en el de hoy ----
  {
    const CLOUD = [{ id: 'k1', name: 'Torso', exercises: [ex('ke1', 'Remo con barra')] }, { id: 'k2', name: 'Pierna', dias: [T, T2], exercises: [ex('ke2', 'Sentadilla libre')] }];
    const ups = [];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'k1', name: 'Torso', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Ana Alumna', coach_id: COACH.id }; return J(i.one ? me : [me]); },
        '/routines': (r, J, i) => { if (i.m === 'GET') return J(i.one ? { days: CLOUD, updated_at: '2026-10-01T00:00:00Z' } : [{ days: CLOUD }]); ups.push(i.body); return J([], 201); } } });
    await p.goto(base + '/app/'); await wait(3000);
    t.eq(await active(p), 'k2', 'con coach: la rutina llega de la nube y abre en el día de hoy');
    const lbl = await text(p, '.day-head .day-dias.ro');
    t.has(lbl, MONFIRST([T, T2]).map(n => CORTO[n]).join(' · '), 've los días que puso el coach');
    t.ok(!(await p.$('.day-head button.day-dias')) && !(await p.$('.dd-chip')), 'no los puede cambiar');
    if (shots) await p.screenshot({ path: shots + '/dias-cliente-coach.png' });
    await p.evaluate(async () => { const e = await import('/app/screens/entreno.js'); e.EntrenoState.diasOpen = 'k2'; (await import('/app/main.js')).renderApp(); });
    await wait(200);
    t.ok(!(await p.$('.dd-chip')), 'tampoco forzando el editor abierto');
    t.eq(ups.length, 0, 'el alumno con coach no sube la rutina');
    t.eq(errs, [], 'errores de la página (alumno con coach)');
    await close();
  }
}
