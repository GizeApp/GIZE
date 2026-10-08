// Guardar entreno: los kg y reps de la rutina quedan cargados de una vez a la otra. Antes se
// guardaba cualquier serie con reps aunque no estuviera tildada (las de la vez pasada, de un
// ejercicio que hoy se salteó, quedaban como hechas hoy) y, como guardar no destildaba nada, la
// semana siguiente todo seguía tildado. Ahora: con alguna serie tildada se guardan solo las
// tildadas, y al guardar se destilda el día («Seguir entrenando» lo vuelve a tildar).
import { newPage, saved, wait, ALUMNO, profile } from './lib.mjs';

const set = (id, kg, reps, done) => ({ id, kg, reps, done });

export default async function ({ base, t }){
  // 1) Tildó Sentadilla, se salteó Prensa (con los números de la vez pasada).
  {
    const days = [{ id: 'd1', name: 'Piernas', exercises: [
      { id: 'e1', name: 'Sentadilla en Smith', sets: [set('s1', '105', '8', true), set('s2', '105', '8', true)] },
      { id: 'e2', name: 'Prensa 45°', sets: [set('s3', '150', '10', false), set('s4', '150', '10', false)] },
    ] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-action="save-session"]'); await wait(800);
    let st = await saved(p);
    t.eq(st.sessions.length, 1, 'se guarda el entreno');
    t.eq(st.sessions[0].exercises.map(e => e.name + ' ' + e.sets.map(s => s.kg + 'x' + s.reps).join(',')), ['Sentadilla en Smith 105x8,105x8'], 'solo las series tildadas (Prensa no se hizo)');
    t.eq(st.days[0].exercises.flatMap(e => e.sets.map(s => !!s.done)), [false, false, false, false], 'al guardar se destilda el día');
    t.eq(st.days[0].exercises.flatMap(e => e.sets.map(s => s.kg + 'x' + s.reps)), ['105x8', '105x8', '150x10', '150x10'], 'los kg y reps quedan de punto de partida');
    await p.click('#fbHost [data-action="fb-undo"]'); await wait(500);
    st = await saved(p);
    t.eq(st.sessions.length, 0, 'seguir entrenando: se saca el entreno');
    t.eq(st.days[0].exercises.flatMap(e => e.sets.map(s => !!s.done)), [true, true, false, false], 'seguir entrenando: vuelven las tildes como estaban');
    t.eq(errs, [], '1: errores de la página');
    await close();
  }

  // 2) Quien nunca tilda: se guardan las series con reps, como siempre.
  {
    const days = [{ id: 'd1', name: 'Torso', exercises: [
      { id: 'e1', name: 'Remo con barra', sets: [set('s1', '60', '8', false), set('s2', '60', '', false)] },
    ] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-action="save-session"]'); await wait(800);
    const st = await saved(p);
    t.eq((st.sessions[0] || { exercises: [] }).exercises.map(e => e.name + ' ' + e.sets.map(s => s.kg + 'x' + s.reps).join(',')), ['Remo con barra 60x8'], 'sin tildes: las que tienen reps');
    t.eq(errs, [], '2: errores de la página');
    await close();
  }
}
