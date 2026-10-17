// Bienvenida en un segundo dispositivo: la cuenta es nueva (menos de 7 días) y ya armó su rutina
// en otro lado. La marca de "bienvenida vista" es por dispositivo, así que la bienvenida vuelve a
// aparecer, pero no le ofrece elegir otra rutina: antes cualquier salida (rutina armada, empezar
// vacío) pisaba la suya acá y en la nube. Sí le pregunta los datos del cuerpo (para su meta de
// Comida) si todavía no los tiene: si en su cuenta ya están completos, o ya se los preguntó otro
// dispositivo (bodyAsked), la bienvenida termina en la disciplina, como antes.
import { newPage, wait, saved, text, ALUMNO, onbPaso, onbSinCuerpo } from './lib.mjs';

const perfil = (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); };
const MIA = [{ id: 'da', name: 'Mi día', subtitle: '', exercises: [{ id: 'ea', name: 'Sentadilla en Smith', mus: 'cuadriceps', sets: [{ id: 'sa', kg: '100', reps: '8', target: '6-8', done: false }] }] }];
const names = days => days.map(d => d.name + ':' + d.exercises.map(e => e.name).join(',')).join('|');

async function abrir(base, prefs){
  const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
  const ups = [];
  const handlers = { '/profiles': perfil,
    '/routines': (r, J, i) => {
      if (i.m === 'GET') return J({ days: MIA, updated_at: new Date(Date.now() - 86400000).toISOString() });
      const b = JSON.parse(i.body); ups.push((Array.isArray(b) ? b[0] : b).days); return undefined;
    } };
  if (prefs) handlers['/client_prefs'] = (r, J, i) => i.m === 'GET' ? J(i.one ? prefs : [prefs]) : undefined;
  const pg = await newPage({ user: NUEVO, handlers });
  pg.ups = ups;
  await pg.p.goto(base + '/app/'); await wait(2500);
  return pg;
}
async function rutinaIntacta(t, pg, tag){
  const st = await saved(pg.p);
  t.eq(names(st.days), names(MIA), tag + ': conserva su rutina');
  t.eq(st.days[0].exercises[0].sets[0].kg, '100', tag + ': con sus pesos');
  t.ok(pg.ups.every(d => names(d) === names(MIA)), tag + ': no sube otra rutina encima de la suya');
}

export default async function ({ base, t }){
  for (const salida of ['next', 'dskip']){
    const pg = await abrir(base), p = pg.p;
    t.ok(/Bienvenido/.test(await text(p, '#authHost')), salida + ': ve la bienvenida (es otro dispositivo)');
    await p.click('[data-onb="start"]'); await wait(300);
    t.ok(/¿Qué entrenás\?/.test(await text(p, '#authHost')), salida + ': pregunta la disciplina');
    if (salida === 'next') { await p.click('[data-onb="disc"][data-v="fuerza"]'); await wait(200); }
    await p.click('[data-onb="' + salida + '"]'); await wait(500);
    t.eq(await onbPaso(p), { n: '2/7', titulo: '¿Cuál es tu sexo?' }, salida + ': sigue con los datos del cuerpo, sin el código ni cómo arrancar');
    await onbSinCuerpo(p); await wait(500);
    t.ok(!(await p.isVisible('#authHost .onb-card')), salida + ': con rutina propia la bienvenida termina ahí (no ofrece armar otra)');
    await rutinaIntacta(t, pg, salida);
    t.eq(pg.errs, [], salida + ': errores de la página');
    await pg.close();
  }

  // a) La cuenta ya tiene los datos de su meta (los cargó en otro dispositivo): termina en la disciplina.
  {
    const pg = await abrir(base, { client_id: ALUMNO.id, cal_profile: { sex: 'm', age: '30', height: '175', weight: '80' }, cal_target: 2500 }), p = pg.p;
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(600);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'meta completa: la bienvenida termina en la disciplina');
    t.eq(await p.evaluate(async () => (await import('/app/core/state.js')).state.calTarget), 2500, 'meta completa: su meta queda como estaba');
    await rutinaIntacta(t, pg, 'meta completa');
    t.eq(pg.errs, [], 'meta completa: errores de la página');
    await pg.close();
  }

  // b) Otro dispositivo ya se los preguntó (los salteó): tampoco.
  {
    const pg = await abrir(base, { client_id: ALUMNO.id, cal_profile: { bodyAsked: true } }), p = pg.p;
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="disc"][data-v="running"]'); await wait(200);
    t.eq((await onbPaso(p)).n, '1/1', 'ya preguntado: un solo paso');
    t.eq(await p.$eval('#authHost .onb-main', b => b.textContent), 'Completar', 'ya preguntado: el botón dice «Completar»');
    await p.click('[data-onb="next"]'); await wait(600);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'ya preguntado: la bienvenida termina en la disciplina');
    await rutinaIntacta(t, pg, 'ya preguntado');
    t.eq(pg.errs, [], 'ya preguntado: errores de la página');
    await pg.close();
  }
}
