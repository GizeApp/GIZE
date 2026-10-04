// Rutinas armadas de 1 a 5 días por semana. Quien entra por primera vez sin coach arranca
// sin rutina (ya no con la «Meso 2») y en la bienvenida se le ofrece elegir una, con un filtro
// por días por semana; lo mismo desde Entreno → "Ver rutinas armadas". Las cuentas que ya
// tienen la rutina de ejemplo vieja no la pierden. El coach las importa en «Mis rutinas».
import { newPage, wait, saved, text, ALUMNO } from './lib.mjs';

const OLD = [
  ['Vuelos laterales sentado', 'Jalón unilateral en estocada', 'Remo neutro abierto en polea baja', 'Press inclinado con mancuernas', 'Peck deck', 'Curl bíceps en polea baja frontal', 'Extensión de tríceps parado en polea'],
  ['Camilla de isquios', 'Aductores en máquina', 'Sentadilla en Smith', 'Prensa 45°', 'Cuadricera', 'Gemelos en máquina', 'Crunch en banco'],
  ['Elevaciones laterales', 'Press plano en Smith', 'Jalón prono', 'Vuelo lateral en polea (énfasis estiramiento)', 'Remo T', 'Cruce de poleas descendente', 'Remo en polea baja unilateral'],
  ['Peso muerto rumano', 'Prensa 45°', 'Cuadricera', 'Press francés con mancuernas', 'Curl predicador', 'Extensión de tríceps parado en polea', 'Curl Bayesian'],
];
const OLD_DAYS = OLD.map((l, i) => ({ id: 'd' + (i + 1), name: 'Día ' + (i + 1), subtitle: '', exercises: l.map((n, j) => ({ id: 'e' + i + j, name: n, sets: [{ id: 's' + i + j, kg: '', reps: '', done: false }] })) }));
// Perfil de alumno sin coach (también para lecturas que piden una lista).
const perfil = (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); };
const names = days => days.map(d => d.exercises.map(e => e.name).join(',')).join('|');

export default async function ({ base, t }){
  // 1) El catálogo.
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/app/'); await wait(1500);
    const r = await p.evaluate(async () => {
      const m = await import('/app/core/rutinas-ejemplo.js'), d = await import('/app/core/data.js');
      const out = { dias: {}, malos: [], series: [], reps: [], porDia: [], volumen: [], cuantas: m.CATALOGO.length, sql: [] };
      for (const r of m.CATALOGO){
        const n = m.diasDeEntreno(r); (out.dias[n] = out.dias[n] || []).push(r.nombre);
        const vol = {};
        for (const day of r.days){
          if (day.exercises.length && (day.exercises.length < 5 || day.exercises.length > 7)) out.porDia.push(r.nombre + ' / ' + day.name + ': ' + day.exercises.length);
          for (const ex of day.exercises){
            if (!(d.EX_DB[ex.mus] || []).includes(ex.name) || d.ES_MAP[ex.name]) out.malos.push(ex.name + ' (' + ex.mus + ')');
            const want = m.GRANDES.includes(ex.mus) ? 2 : 3;
            if (ex.sets.length !== want) out.series.push(r.nombre + ' / ' + ex.name + ': ' + ex.sets.length);
            if (ex.sets.some(s => s.target !== '8-12')) out.reps.push(r.nombre + ' / ' + ex.name);
            if (!ex.rir || !ex.rest) out.reps.push(r.nombre + ' / ' + ex.name + ' sin rir o descanso');
            vol[ex.mus] = (vol[ex.mus] || 0) + ex.sets.length;
          }
        }
        // De 3 días en adelante: pecho, espalda y cuádriceps con un volumen razonable por semana.
        if (n >= 3) for (const k of r.para === 'mujer' ? ['espalda', 'cuadriceps', 'gluteos'] : ['pecho', 'espalda', 'cuadriceps'])
          if (!(vol[k] >= 6 && vol[k] <= 20)) out.volumen.push(r.nombre + ' ' + k + ': ' + vol[k]);
      }
      // El SQL para Supabase tiene las mismas rutinas (id, nombre, ejercicios y series).
      const sql = await (await fetch('/supabase/rutinas-catalogo-1a5.sql')).text();
      const rows = [...sql.matchAll(/\('([0-9a-f-]{36})'::uuid, '((?:[^']|'')*)', '(\w+)', '(?:[^']|'')*',\s*'((?:[^']|'')*)'::jsonb/g)]
        .map(x => ({ id: x[1], nombre: x[2].replace(/''/g, "'"), para: x[3], days: JSON.parse(x[4].replace(/''/g, "'")) }));
      const shape = days => days.map(dd => dd.name + ':' + dd.exercises.map(e => e.name + '×' + e.sets.length + '@' + e.sets.map(s => s.target).join('/')).join(',')).join('|');
      out.sqlN = rows.length;
      for (const r of m.CATALOGO){
        const row = rows.find(x => x.id === r.id);
        if (!row || row.nombre !== r.nombre || row.para !== r.para || shape(row.days) !== shape(r.days)) out.sql.push(r.nombre);
      }
      out.meso = /set activa = false where nombre ilike '%Meso 2%'/.test(sql);
      // Filtro por días: rutinasDeDias.
      out.filtro = [1, 2, 3, 4, 5].map(k => m.rutinasDeDias(m.CATALOGO, k).every(x => m.diasDeEntreno(x) === k));
      out.todas = m.rutinasDeDias(m.CATALOGO, 0).map(x => m.diasDeEntreno(x));
      return out;
    });
    for (const n of [1, 2, 3, 4, 5]) t.ok((r.dias[n] || []).length >= 1, 'hay rutina de ' + n + ' día(s): ' + JSON.stringify(r.dias));
    t.ok(r.cuantas <= 9, 'la lista es corta: ' + r.cuantas);
    t.eq(r.malos, [], 'todos los ejercicios están en la lista (EX_DB) con su músculo');
    t.eq(r.series, [], 'músculos grandes 2 series por ejercicio, chicos 3');
    t.eq(r.reps, [], 'todas las series de 8-12, con RIR y descanso');
    t.eq(r.porDia, [], 'de 5 a 7 ejercicios por día');
    t.eq(r.volumen, [], 'volumen semanal razonable');
    t.eq(r.sql, [], 'el SQL tiene las mismas rutinas que la app');
    t.eq(r.sqlN, r.cuantas, 'el SQL carga todas');
    t.ok(r.meso, 'el SQL esconde la Meso 2');
    t.eq(r.filtro, [true, true, true, true, true], 'rutinasDeDias filtra por días');
    t.eq(r.todas, r.todas.slice().sort((a, b) => a - b), 'sin filtro van de menos a más días');
    t.eq(errs, [], 'catálogo: errores de la página');
    await close();
  }

  // 2) Cuenta nueva sin coach: arranca sin rutina y elige una en la bienvenida.
  {
    const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
    const ups = [];
    const { p, errs, close } = await newPage({ user: NUEVO, handlers: { '/profiles': perfil,
      '/routines': (r, J, i) => { if (i.m === 'GET') return J(null); const b = JSON.parse(i.body); ups.push((Array.isArray(b) ? b[0] : b).days); return undefined; } } });
    await p.goto(base + '/app/'); await wait(2500);
    const st0 = await p.evaluate(async () => (await import('/app/core/state.js')).state.days);
    t.ok(st0.length === 1 && !st0[0].exercises.length, 'arranca con un día vacío, sin la Meso 2: ' + names(st0));
    t.ok(/Bienvenido/.test(await text(p, '#authHost')), 've la bienvenida');
    await p.click('[data-onb="start"]'); await wait(300);
    t.ok(/¿Qué entrenás\?/.test(await text(p, '#authHost')), 'pregunta la disciplina');
    await p.click('[data-onb="disc"][data-v="crossfit"]'); await wait(200);
    t.ok(await p.$eval('[data-onb="disc"][data-v="crossfit"]', e => e.classList.contains('on')), 'la disciplina queda marcada');
    await p.click('[data-onb="dnext"]'); await wait(300);
    t.eq(await p.evaluate(async () => (await import('/app/core/state.js')).state.disciplinas), ['crossfit'], 'y se guarda');
    await p.click('[data-onb="solo"]'); await wait(300);
    t.eq(await p.getAttribute('.onb-opt.on', 'data-v'), 'rutina', 'elegir una rutina armada viene marcado');
    t.ok(/Recomendado/.test(await text(p, '.onb-opt.on')), 'y es la recomendada');
    await p.click('[data-onb="next"]'); await wait(300);
    await p.click('[data-onb="sex"][data-v="m"]'); await wait(600);
    t.ok(/¿Cuántos días por semana entrenás\?/.test(await text(p, '#authHost')), 'pregunta los días por semana');
    const chips = await p.$$eval('[data-onb="dias"]', l => l.map(b => b.innerText.trim()));
    t.eq(chips, ['Todas', '1', '2', '3', '4', '5'], 'botones de días');
    const lista = () => p.$$eval('.onb-routine b', l => l.map(b => b.innerText.trim()));
    const todas = await lista();
    t.ok(todas.length >= 5 && !todas.some(n => /Glúteos/.test(n)), 'hombre: todas menos las de mujer: ' + todas.join(', '));
    for (const n of [1, 2, 3, 4, 5]){
      await p.click('[data-onb="dias"][data-v="' + n + '"]'); await wait(150);
      const l = await lista();
      t.ok(l.length >= 1 && l.every(x => x.includes('· ' + n + ' día')), n + ' día(s): ' + l.join(', '));
      t.eq(await p.getAttribute('[data-onb="dias"][data-v="' + n + '"]', 'aria-pressed'), 'true', n + ': queda marcado');
    }
    await p.click('[data-onb="dias"][data-v="3"]'); await wait(150);
    await p.click('[data-onb="sexagain"]'); await wait(300);
    await p.click('[data-onb="sex"][data-v="f"]'); await wait(600);
    const fem = await lista();
    t.ok(fem.includes('Glúteos y piernas · 3 días') && fem.includes('Cuerpo completo · 3 días') && fem.every(x => /3 días/.test(x)), 'mujer, 3 días: ' + fem.join(', '));
    await p.click('.onb-routine:has-text("Cuerpo completo · 3 días")'); await wait(1500);
    const st = await saved(p);
    t.eq(st.days.map(d => d.name), ['Día A', 'Día B', 'Día C'], 'cargó los días de la rutina elegida');
    t.eq(st.days[0].exercises[0].name, 'Sentadilla en Smith', 'con sus ejercicios');
    t.eq(st.days[0].exercises[0].sets.map(s => s.target), ['8-12', '8-12'], 'y las series de 8-12');
    t.ok(st.days.every(d => /^[a-z0-9]+$/.test(d.id)), 'ids nuevos');
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'se cierra la bienvenida');
    t.ok(/Sentadilla en Smith/.test(await text(p, '#view')), 'Entreno muestra la rutina');
    t.ok(ups.some(d => names(d) === names(st.days)), 'la rutina elegida se sube a la cuenta');
    t.eq(errs, [], 'bienvenida: errores de la página');
    await close();
  }

  // 3) Entreno sin rutina: invita a elegir una; "Ver rutinas armadas" con el mismo filtro.
  {
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', subtitle: '', exercises: [] }], sessions: [], weights: [], daily: {}, sex: 'x' },
      handlers: { '/profiles': perfil } });
    await p.goto(base + '/app/'); await wait(2500);
    t.ok(await p.isVisible('.empty-pick [data-action="open-routines"]'), 'Entreno vacío: botón para elegir una rutina armada');
    await p.click('.empty-pick [data-action="open-routines"]'); await wait(800);
    const l1 = await p.$$eval('.onb-routine b', l => l.map(b => b.innerText.trim()));
    t.ok(l1.some(n => /Glúteos/.test(n)) && l1.some(n => /PPL/.test(n)), 'prefiero no decir: todas: ' + l1.join(', '));
    await p.click('[data-onb="dias"][data-v="1"]'); await wait(150);
    t.eq(await p.$$eval('.onb-routine b', l => l.map(b => b.innerText.trim())), ['Cuerpo completo · 1 día'], 'filtro 1 día');
    await p.click('.onb-routine'); await wait(800);
    let st = await saved(p);
    t.eq(st.days.map(d => d.name), ['Cuerpo completo'], 'cargó la de 1 día sin preguntar (no tenía ejercicios)');
    t.eq(dialogs, [], 'sin confirmación');
    t.ok(!(await p.$('.empty-pick')), 'ya no invita a elegir');
    await p.click('.load-def[data-action="open-routines"]'); await wait(800);
    await p.click('[data-onb="dias"][data-v="4"]'); await wait(150);
    await p.click('.onb-routine:has-text("Torso / Pierna · 4 días")'); await wait(800);
    st = await saved(p);
    t.eq(st.days.map(d => d.name), ['Torso A', 'Pierna A', 'Torso B', 'Pierna B'], 'cambió a la de 4 días');
    t.ok(dialogs.length === 1 && /reemplaza/.test(dialogs[0]), 'con ejercicios cargados pide confirmar');
    t.eq(errs, [], 'Entreno: errores de la página');
    await close();
  }

  // 4) Cuentas de antes con la rutina de ejemplo vieja: no se les borra.
  {
    // a) Este celular la tiene (sin huella de sincronización) y la nube también.
    const posts = [];
    const cloud = { days: OLD_DAYS, updated_at: new Date(Date.now() - 86400e3).toISOString() };
    const routines = (r, J, i) => { if (i.m === 'GET') return J(i.one ? cloud : [cloud]); posts.push(JSON.parse(i.body)); return undefined; };
    let pg = await newPage({ user: ALUMNO, state: { days: OLD_DAYS, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': perfil, '/routines': routines } });
    await pg.p.goto(base + '/app/'); await wait(2500);
    let st = await saved(pg.p);
    t.ok(st.days.length === 4 && names([st.days[0]]) === names([OLD_DAYS[0]]), 'celular con la rutina vieja: la conserva: ' + names(st.days).slice(0, 80));
    t.ok(!(await pg.p.$('#authHost .onb-card')), 'cuenta de antes: no ve la bienvenida');
    t.ok(!(await pg.p.$('.empty-pick')), 'ni la invitación a elegir rutina');
    t.eq(pg.errs, [], 'rutina vieja: errores de la página');
    await pg.close();
    // b) Celular nuevo (sin nada guardado): toma la de la nube y no sube un día vacío encima.
    posts.length = 0;
    pg = await newPage({ user: ALUMNO, handlers: { '/profiles': perfil, '/routines': routines } });
    await pg.p.goto(base + '/app/'); await wait(2500);
    st = await saved(pg.p);
    t.ok(/Vuelos laterales sentado/.test(names(st.days)) && st.days.length === 4, 'celular nuevo: toma la rutina vieja de la nube: ' + names(st.days).slice(0, 80));
    t.ok(!posts.some(b => { const row = Array.isArray(b) ? b[0] : b; return !(row.days || []).some(d => (d.exercises || []).length); }), 'no sube una rutina vacía encima');
    t.eq(pg.errs, [], 'celular nuevo: errores de la página');
    await pg.close();
  }

  // 5) Coach: «Importar rutina armada» en Mis rutinas.
  {
    const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
    const { p, errs, close } = await newPage({ user: COACH, handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click('[data-coach="view-tpls"]'); await wait(800);
    t.ok(!(await p.$('[data-coach="tpl-seed-cat"]')), 'la lista arranca cerrada');
    await p.click('[data-coach="tpl-seed-open"]'); await wait(300);
    const l = await p.$$eval('[data-coach="tpl-seed-cat"] .co-name', x => x.map(e => e.innerText.trim()));
    t.ok(l.length >= 5 && l.includes('Cuerpo completo · 2 días') && l.includes('PPL · 5 días') && !l.some(n => /Meso/.test(n)), 'rutinas para importar: ' + l.join(', '));
    await p.click('[data-coach="tpl-seed-cat"]:has-text("Cuerpo completo · 2 días")'); await wait(500);
    const e = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); const x = CoachState.coachTplEdit; return x && { id: x.id, name: x.name, days: x.days.map(d => d.name), n: x.days[0].exercises.length, sets: x.days[0].exercises[0].sets.length }; });
    t.eq(e, { id: null, name: 'Cuerpo completo · 2 días', days: ['Día A', 'Día B'], n: 7, sets: 2 }, 'abre el editor con la rutina importada');
    t.eq(errs, [], 'coach: errores de la página');
    await close();
  }
}
