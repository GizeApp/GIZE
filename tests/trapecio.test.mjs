// Ejercicios de trapecio (pedido del dueño): una categoría «Trapecio» después de Hombros, con los
// encogimientos (barra, mancuernas, Smith, máquina, polea, barra hexagonal, detrás del cuerpo y en banco
// inclinado), remo al mentón, remo alto, las Y para el trapecio de abajo, la retracción escapular, la
// caminata del granjero y el rack pull. Cada uno con su equipo (para «Ver variantes»), elegido desde
// Trapecio suma al volumen semanal de Trapecio, y en el buscador del coach aparece la categoría.
// «Encogimientos de hombros» sigue en Hombros, así las rutinas que ya lo tienen no cambian.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({});
  await p.goto(base + '/app/'); await wait(800);
  const r = await p.evaluate(async () => {
    const { EX_DB, EX_CATS } = await import('/app/core/data.js');
    const { equipOf } = await import('/app/core/variantes.js');
    const { volumeGroups } = await import('/app/core/subgrupos.js');
    const { pickMuscle, searchExercises } = await import('/app/core/utils.js');
    const cats = EX_CATS.map(c => c[0]);
    return { cats: cats.slice(cats.indexOf('hombros'), cats.indexOf('hombros') + 2), label: (EX_CATS.find(c => c[0] === 'trapecio') || [])[1],
      lista: EX_DB.trapecio, sinEquipo: (EX_DB.trapecio || []).filter(n => equipOf(n) === 'otro'),
      equipos: ['Encogimientos con barra', 'Encogimientos con mancuernas', 'Encogimientos en Smith', 'Encogimientos en máquina', 'Encogimientos en polea'].map(equipOf),
      repetidos: (EX_DB.trapecio || []).filter((n, i, a) => a.indexOf(n) !== i),
      vol: volumeGroups({ name: 'Encogimientos con barra', mus: pickMuscle('Encogimientos con barra', 'trapecio') }),
      volMenton: volumeGroups({ name: 'Remo al mentón', mus: pickMuscle('Remo al mentón', 'trapecio') }),
      viejo: EX_DB.hombros.includes('Encogimientos de hombros'),
      busca: searchExercises(n => /^encogimientos con mancuernas$/i.test(n), EX_CATS).map(x => x.cat) };
  });
  t.eq(r.cats, ['hombros', 'trapecio'], 'Trapecio va después de Hombros');
  t.eq(r.label, 'Trapecio', 'con su nombre');
  t.ok(Array.isArray(r.lista) && r.lista.length >= 12, 'con al menos 12 ejercicios: ' + (r.lista || []).length);
  t.eq(r.sinEquipo, [], 'todos con su equipo (para «Ver variantes»)');
  t.eq(r.equipos, ['barra', 'mancuernas', 'smith', 'maquina', 'polea'], 'los encogimientos de cada equipo');
  t.eq(r.repetidos, [], 'sin repetidos');
  t.eq(r.vol, ['trapecio'], 'un encogimiento elegido desde Trapecio suma a Trapecio');
  t.eq(r.volMenton, ['trapecio'], 'el remo al mentón elegido desde Trapecio también');
  t.ok(r.viejo, '«Encogimientos de hombros» sigue en Hombros (las rutinas viejas no cambian)');
  t.ok(r.busca.includes('trapecio'), 'el buscador lo encuentra en Trapecio: ' + JSON.stringify(r.busca));
  t.eq(errs, [], 'errores de la página');
  await close();
}
