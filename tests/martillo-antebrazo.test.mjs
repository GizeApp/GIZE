// «Curl martillo en polea» también está en Antebrazo (como «Curl martillo»): al buscarlo sale una
// vez por grupo y elegido desde Antebrazo cuenta para antebrazo.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2000);
  const r = await p.evaluate(async () => {
    const { EX_DB } = await import('/app/core/data.js');
    const { searchExercises, pickMuscle } = await import('/app/core/utils.js');
    const { equipOf } = await import('/app/core/variantes.js');
    return { rot: ['Rotación de antebrazo con mancuerna', 'Rotación de antebrazo en polea'].map(n => EX_DB.antebrazo.includes(n) && equipOf(n)),
      ante: EX_DB.antebrazo.includes('Curl martillo en polea'), bi: EX_DB.biceps.includes('Curl martillo en polea'),
      labels: searchExercises(n => n === 'Curl martillo en polea', [['biceps', 'Bíceps'], ['antebrazo', 'Antebrazo']]).map(x => x.label),
      mus: pickMuscle('Curl martillo en polea', 'antebrazo') };
  });
  t.eq(r.rot, ['mancuernas', 'polea'], 'rotación de antebrazo (con mancuerna y en polea) en Antebrazo, con su equipo');
  t.ok(r.ante, 'está en Antebrazo');
  t.ok(r.bi, 'sigue en Bíceps');
  t.eq(r.labels.sort(), ['Curl martillo en polea · Antebrazo', 'Curl martillo en polea · Bíceps'], 'al buscarlo sale en los dos grupos');
  t.eq(r.mus, 'antebrazo', 'elegido desde Antebrazo cuenta para antebrazo');
  t.eq(errs, [], 'errores de la página');
  await close();
}
