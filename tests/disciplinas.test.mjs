// Disciplinas (app/core/disciplinas.js): la persona elige en Ajustes qué entrena y el buscador
// de ejercicios le muestra primero lo suyo («Para vos» y los grupos de su disciplina).
import { newPage, wait, ALUMNO } from './lib.mjs';

const profile = (r, J, i) => i.m === 'GET' ? J(i.one ? { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null } : [{ id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }]) : undefined;

export default async function ({ base, t }){
  // La base: grupos nuevos, ejercicios clave que existen, running por tiempo y sin volumen.
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile } });
  const posts = [];
  await p.route(/client_prefs/, r => { if (r.request().method() !== 'GET') posts.push(r.request().postData()); r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); });
  await p.goto(base + '/app/'); await wait(2500);
  const b = await p.evaluate(async () => {
    const { EX_DB, EX_CATS } = await import('/app/core/data.js');
    const { DISCIPLINAS } = await import('/app/core/disciplinas.js');
    const { isTimedEx, exMuscle } = await import('/app/core/utils.js');
    const { volumeGroups } = await import('/app/core/subgrupos.js');
    const { libVideo } = await import('/app/core/videos.js');
    const all = new Set(Object.values(EX_DB).flat());
    return { cats: ['olimpicos', 'crossfit', 'running'].filter(c => EX_CATS.some(x => x[0] === c) && EX_DB[c].length >= 9),
      missing: DISCIPLINAS.flatMap(d => d.top.filter(n => !all.has(n))),
      timed: ['Rodaje suave', 'Fondo largo', 'Air bike'].map(n => isTimedEx({ name: n })).concat(isTimedEx({ name: 'Fondos en paralelas' })),
      sinVideo: ['olimpicos', 'crossfit', 'running'].flatMap(c => EX_DB[c]).concat(DISCIPLINAS.flatMap(d => d.top)).filter(n => !libVideo(n)),
      vol: volumeGroups({ name: 'Fartlek', mus: 'running' }), frontal: exMuscle({ name: 'Sentadilla frontal' }) };
  });
  t.eq(b.cats, ['olimpicos', 'crossfit', 'running'], 'grupos nuevos: Halterofilia, CrossFit y Running');
  t.eq(b.missing, [], 'los ejercicios clave de cada disciplina existen');
  t.eq(b.timed, [true, true, true, false], 'correr y las máquinas de cardio van por tiempo (los fondos no)');
  t.eq(b.vol, [], 'correr no suma al volumen de fuerza');
  t.eq(b.sinVideo, [], 'todos los ejercicios nuevos y los clave tienen video');
  t.eq(b.frontal, 'cuadriceps', 'la sentadilla frontal sigue contando para cuádriceps');

  // Sin disciplina: el buscador invita a elegirla.
  await p.click('#view [data-action="ex-add-open"]'); await wait(500);
  t.ok(await p.isVisible('.ex-disc-hint'), 'sin disciplina: invitación a elegirla');
  t.eq(await p.$eval('.ex-chip.on', e => e.textContent), 'Pecho', 'sin disciplina abre en Pecho, como siempre');
  await p.click('.ex-disc-hint'); await wait(900);
  t.ok(await p.isVisible('#cfgDisc'), 'la invitación lleva a «Tu disciplina» en Ajustes');

  // Elige CrossFit.
  await p.click('#cfgDisc [data-id="crossfit"]'); await wait(400);
  t.ok(await p.$eval('#cfgDisc [data-id="crossfit"]', e => e.classList.contains('on')), 'CrossFit queda marcado');
  await wait(2500);
  t.ok(posts.some(x => /"disciplines":\["crossfit"\]/.test(x || '')), 'se guarda con las preferencias');

  await p.click('#nav-entreno'); await wait(500);
  await p.click('#view [data-action="ex-add-open"]'); await wait(500);
  const chips = await p.$$eval('.ex-chip', l => l.slice(0, 4).map(e => e.textContent));
  t.eq(chips, ['Para vos', 'CrossFit', 'Halterofilia', 'Pecho'], 'primero «Para vos» y los grupos de su disciplina');
  t.ok(!(await p.$('.ex-disc-hint')), 'con disciplina ya no invita');
  const list = await p.$$eval('#exList .ex-pick', l => l.map(e => e.textContent));
  t.ok(list.includes('Thruster con barra') && list.includes('Wall ball'), '«Para vos» trae los ejercicios clave');
  await p.click('#exList .ex-pick[data-name="Wall ball"]'); await wait(700);
  const ex = await p.evaluate(() => JSON.parse(localStorage.getItem('rutina_jero_v1')).days[0].exercises.map(e => [e.name, e.mus]));
  t.eq(ex, [['Wall ball', 'crossfit']], 'el ejercicio elegido desde «Para vos» cuenta para su grupo');
  t.eq(errs, [], 'errores de la página');
  await close();

  // Si la columna todavía no existe en la base, el resto de las preferencias se sube igual.
  {
    const { p, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', exercises: [] }], sessions: [], weights: [], daily: {}, disciplinas: ['running'] },
      handlers: { '/profiles': profile } });
    const bodies = [];
    await p.route(/client_prefs/, r => { const m = r.request().method(); if (m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      const d = r.request().postData() || ''; bodies.push(d);
      if (/disciplines/.test(d)) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'disciplines' column of 'client_prefs' in the schema cache" }) });
      r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-config'); await wait(400);
    await p.click('#cfgDisc [data-id="fuerza"]'); await wait(3000);
    t.ok(bodies.some(x => !/disciplines/.test(x) && /rest_default|habits/.test(x)), 'sin la columna nueva, se reintenta sin la disciplina');
    await close();
  }
}
