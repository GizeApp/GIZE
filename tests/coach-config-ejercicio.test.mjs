// Mi configuración de cada ejercicio (app/screens/coach/presets.js, supabase/ejercicios-coach.sql).
// Pedido del dueño: no escribir siempre el rango de reps: con un toque guardar en «Vuelos laterales
// sentado» las series con sus reps, el descanso y el RIR; al agregar ese ejercicio a cualquier
// rutina arranca así, y después se cambia para cada cliente sin tocar lo guardado.
// - «Guardar como mi configuración» manda series, reps, «por tiempo», descanso y RIR (no el peso
//   propuesto ni la nota) con el nombre sin tildes ni mayúsculas como clave; queda la marca
//   «Mi configuración».
// - Cambiarlo para el cliente no cambia lo guardado: aparece «Usar mi configuración» para volver.
// - Al agregar (o cambiar por) un ejercicio guardado, arranca con su configuración.
// - «Actualizar» y «Borrar mi configuración» en el menú ⋯.
// - Sin la tabla (falta correr el SQL), no aparece nada y el editor anda igual.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const ex = (id, name, targets, extra) => Object.assign({ id, name, sets: targets.map((t, j) => ({ id: id + 's' + j, kg: '', reps: '', target: t, targetKg: j === 0 ? '12' : '' })) }, extra || {});
const rutina = () => [{ id: 'd0', name: 'Torso', subtitle: '', exercises: [
  ex('e0', 'Vuelos laterales sentado', ['12-15', '12-15', '10-12'], { rest: '60 seg', rir: '1', note: 'Codos apenas flexionados' }),
  ex('e1', 'Remo con barra', ['8-10', '8-10', '8-10']),
] }];

async function abrir(base, presets){
  const ACTUAL = rutina(), posts = [], deletes = [];
  const pg = await newPage({ user: COACH, viewport: { width: 1280, height: 900 },
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
      '/coach_ex_presets': (r, J, i) => {
        if (presets === null) return J({ code: 'PGRST205', message: "Could not find the table 'public.coach_ex_presets' in the schema cache" }, 404);
        if (i.m === 'GET') return J(presets);
        if (i.m === 'POST') { posts.push({ search: decodeURIComponent(i.url.search), body: JSON.parse(i.body) }); return J([], 201); }
        if (i.m === 'DELETE') { deletes.push(decodeURIComponent(i.url.search)); return J([], 200); }
        return undefined;
      },
    } });
  pg.posts = posts; pg.deletes = deletes;
  await pg.p.goto(base + '/app/'); await wait(3500);
  await pg.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await pg.p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(800);
  return pg;
}
const ejs = p => p.evaluate(async () => { const { rtDays } = await import('/app/screens/coach/rutinas.js'); const { CoachState } = await import('/app/screens/coach/state.js');
  return JSON.parse(JSON.stringify(rtDays()[CoachState.coachEditDay].exercises)); });
const abrirEj = async (p, id) => { await p.click(`.co-exc-collapsed[data-id="${id}"] .co-exc-cname`); await wait(500); };
const txt = (p, sel) => p.$eval(sel, e => e.textContent.trim()).catch(() => null);

export default async function ({ base, t }){
  // ---- Guardar, cambiar para el cliente, volver, actualizar y borrar ----
  {
    const { p, errs, dialogs, posts, deletes, close } = await abrir(base, []);
    await abrirEj(p, 'e0');
    t.eq(await txt(p, '.co-exc-open [data-coach="rt-preset-save"]'), 'Guardar como mi configuración', 'sin guardada: el botón para guardarla, al lado de «+ Serie»');
    await p.click('.co-exc-open [data-coach="rt-preset-save"]'); await wait(600);
    const w = posts[0];
    t.ok(w && /on_conflict=coach_id,clave/.test(w.search), 'guardar: una fila por coach y ejercicio (upsert) ' + (w && w.search));
    t.eq(w && { clave: w.body.clave, nombre: w.body.nombre, coach: w.body.coach_id, cfg: w.body.cfg },
      { clave: 'vuelos laterales sentado', nombre: 'Vuelos laterales sentado', coach: COACH.id, cfg: { sets: ['12-15', '12-15', '10-12'], rest: '60 seg', rir: '1' } },
      'guardar: series con sus reps, descanso y RIR (sin el peso propuesto ni la nota)');
    t.eq(await txt(p, '.co-exc-open .co-preset.ok'), 'Mi configuración', 'guardada: queda la marca «Mi configuración»');
    t.ok(!(await p.$('.co-unsaved')), 'guardar la configuración no toca la rutina del cliente');

    // Para este cliente, otra cosa: lo guardado no cambia y aparece «Usar mi configuración».
    await p.fill('.co-exc-open [data-coach="rt-target"][data-j="2"]', '6-8'); await p.press('.co-exc-open [data-coach="rt-target"][data-j="2"]', 'Tab'); await wait(400);
    t.eq(await txt(p, '.co-exc-open [data-coach="rt-preset-use"]'), 'Usar mi configuración', 'cambiado para el cliente: aparece «Usar mi configuración»');
    t.eq(posts.length, 1, 'cambiarlo para el cliente no guarda nada en la configuración');
    await p.click('.co-exc-open [data-coach="rt-preset-use"]'); await wait(400);
    const e0 = (await ejs(p))[0];
    t.eq(e0.sets.map(s => s.target), ['12-15', '12-15', '10-12'], '«Usar mi configuración» vuelve a las reps guardadas');
    t.eq([e0.sets[0].id, e0.sets[0].targetKg, e0.note], ['e0s0', '12', 'Codos apenas flexionados'], 'y conserva las series (lo cargado por el cliente), el peso propuesto y la nota');

    // Actualizarla desde el menú ⋯ con 4 series.
    await p.click('.co-exc-open [data-coach="rt-setadd"]'); await wait(300);
    await p.fill('.co-exc-open [data-coach="rt-target"][data-j="3"]', '15-20'); await p.press('.co-exc-open [data-coach="rt-target"][data-j="3"]', 'Tab'); await wait(300);
    await p.click('.co-exc-open .co-exc-menu2 summary'); await wait(200);
    await p.click('.co-exc-open [data-coach="rt-preset-save"]:is(.co-pop-item)'); await wait(600);
    t.eq(posts[1] && posts[1].body.cfg.sets, ['12-15', '12-15', '10-12', '15-20'], '«Actualizar mi configuración» guarda las 4 series');
    t.eq(await txt(p, '.co-exc-open .co-preset.ok'), 'Mi configuración', 'actualizada: vuelve la marca');

    // Agregar el mismo ejercicio a la rutina: arranca con lo guardado.
    await p.click('[data-coach="rt-add"]'); await wait(500);
    await p.fill('.cp-search', 'Vuelos laterales sentado'); await wait(300);
    await p.click('.cp-ex[data-name="Vuelos laterales sentado"]'); await wait(700);
    const nuevo = (await ejs(p)).slice(-1)[0];
    t.eq([nuevo.name, nuevo.sets.map(s => s.target), nuevo.rest, nuevo.rir], ['Vuelos laterales sentado', ['12-15', '12-15', '10-12', '15-20'], '60 seg', '1'],
      'agregado de nuevo: arranca con la configuración guardada');
    t.ok(nuevo.sets.every(s => !s.targetKg) && !nuevo.note, 'sin peso propuesto ni nota (son de cada cliente)');

    // Borrarla.
    await p.click('.co-exc-open .co-exc-menu2 summary'); await wait(200);
    await p.click('.co-exc-open [data-coach="rt-preset-del"]'); await wait(600);
    t.ok(deletes.length === 1 && /clave=eq\.vuelos[+ ]laterales[+ ]sentado/.test(deletes[0]) && /coach_id=eq\.3333/.test(deletes[0]), 'borrar: la fila del coach y del ejercicio ' + deletes[0]);
    t.eq(await txt(p, '.co-exc-open [data-coach="rt-preset-save"]'), 'Guardar como mi configuración', 'borrada: vuelve el botón para guardarla');
    t.ok(dialogs.some(d => /Borrar tu configuración/.test(d)), 'borrar pregunta antes: ' + JSON.stringify(dialogs));
    t.eq(errs, [], 'errores de la página');
    await close();
  }

  // ---- Guardada desde antes (otro dispositivo): al cambiar un ejercicio por ese, arranca así ----
  {
    const { p, errs, close } = await abrir(base, [{ clave: 'press militar con barra', nombre: 'Press militar con barra', cfg: { sets: ['6-8', '6-8', '8-10', '8-10'], rest: '2 min', rir: '2' } }]);
    await abrirEj(p, 'e1');
    await p.click('.co-exc-open .co-exc-menu2 summary'); await wait(200);
    await p.click('.co-exc-open [data-coach="rt-swap"]'); await wait(500);
    await p.fill('.cp-search', 'Press militar con barra'); await wait(300);
    await p.click('.cp-ex[data-name="Press militar con barra"]'); await wait(700);
    const e1 = (await ejs(p))[1];
    t.eq([e1.name, e1.sets.map(s => s.target), e1.rest, e1.rir], ['Press militar con barra', ['6-8', '6-8', '8-10', '8-10'], '2 min', '2'], 'cambiar por uno guardado: arranca con su configuración');
    t.eq(await txt(p, '.co-exc-open .co-preset.ok'), 'Mi configuración', 'y muestra la marca');
    t.eq(errs, [], 'errores de la página (guardada de antes)');
    await close();
  }

  // ---- Sin la tabla ----
  {
    const { p, errs, close } = await abrir(base, null);
    await abrirEj(p, 'e0');
    t.ok(!(await p.$('.co-preset')) && !(await p.$('[data-coach^="rt-preset"]')), 'sin la tabla: no aparece nada de «mi configuración»');
    t.ok(!!(await p.$('.co-exc-open [data-coach="rt-setadd"]')), 'sin la tabla: el editor anda igual');
    t.eq(errs.filter(e => !/coach_ex_presets|404/.test(e)), [], 'errores de la página (sin la tabla)');
    await close();
  }
}
