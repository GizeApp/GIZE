// La parte que comparten «Pasar mis planillas» y «Armar con IA» en la función «ia»
// (supabase/functions/ia/rutina.ts), corrida en Node con la lista de ejercicios de la app. Revisa:
// - la lista EJERCICIOS: numerada «número;nombre;grupo», cada nombre una vez (con todos sus grupos),
//   sin los que la app renombra a otro de la lista, siempre igual (para la caché de 1 hora) y que
//   llega por parámetro desde index.ts (así las pruebas de la función la pueden simular);
// - el esquema: todos los objetos cerrados y con todo obligatorio, sin lo que la API no acepta y
//   sin un enum con los nombres de los ejercicios;
// - la elección de cada ejercicio: número + nombre copiado + al menos una palabra en común, y los
//   alias de la app («Hip Thrust», «RDL») sin depender de la IA;
// - rutinaPost: nombres fuera de la lista (afuera o propios), grupos, series («4x10», «12-10-8-6»,
//   cargas por serie, % a la nota), tiempo, superseries, días de la semana, recortes y topes, y que
//   «[alumno]» no quede en ningún nombre;
// - limpiarTexto: lo mismo que la limpieza de la app (app/core/planilla.js) con mails, teléfonos y
//   documentos, renglón por renglón.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EX_DB, EX_CATS, ES_MAP } from '../app/core/data.js';
import { limpiar } from '../app/core/planilla.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

export default async ({ t }) => {
  const R = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/ia/rutina.ts')).href);
  const EJ = R.ejercicios(EX_DB, EX_CATS, ES_MAP);
  const num = n => EJ.lista.findIndex(e => e.nombre === n);

  // ---------- la lista ----------
  const unicos = [...new Set(Object.values(EX_DB).flat())];
  const renombrados = unicos.filter(n => ES_MAP[n] && unicos.includes(ES_MAP[n]));
  t.eq(renombrados.sort(), ['Curl Bayesian', 'Sentadilla goblet', 'Toes to bar'], 'los que la app renombra a otro de la lista (ES_MAP)');
  t.eq(EJ.lista.length, unicos.length - renombrados.length, 'cada nombre de EX_DB una vez, sin los renombrados: ' + EJ.lista.length);
  t.ok(EJ.lista.length > 260, 'más de 260 ejercicios en la lista');
  const lineas = EJ.texto.split('\n');
  t.eq(lineas[0], 'EJERCICIOS (número;nombre;grupo):', 'el bloque arranca diciendo qué es cada columna');
  t.eq(lineas.length - 1, EJ.lista.length, 'un renglón por ejercicio');
  t.ok(lineas.slice(1).every((l, i) => l === i + ';' + EJ.lista[i].nombre + ';' + EJ.lista[i].grupos.join(',')), 'cada renglón es número;nombre;grupo, numerado desde 0 en orden');
  t.eq(lineas[1], '0;Press de banca plano (barra);pecho', 'el primero');
  t.ok(lineas.includes(num('Curl martillo') + ';Curl martillo;biceps,antebrazo'), 'un nombre que está en dos grupos va una vez, con los dos');
  t.ok(lineas.includes(num('Caminata del granjero') + ';Caminata del granjero;trapecio,antebrazo,crossfit'), 'y con tres');
  t.ok(!renombrados.some(n => lineas.some(l => l.split(';')[1] === n)), 'los renombrados no aparecen en la lista');
  const grupos = EX_CATS.map(c => c[0]);
  t.ok(EJ.lista.every(e => e.grupos.length && e.grupos.every(g => grupos.includes(g) && EX_DB[g].includes(e.nombre))), 'cada grupo es una clave de EX_CATS donde está el nombre');
  const claves = EJ.lista.map(e => R.clave(e.nombre));
  t.eq(claves.length, new Set(claves).size, 'no hay dos nombres de la lista que sean iguales sin tildes, mayúsculas ni paréntesis');
  // Todo nombre de EX_DB se encuentra: los renombrados, por su alias.
  for (const n of unicos) {
    const i = EJ.porClave.get(R.clave(n)), d = R.eleccion(EJ, -1, '', n);
    t.ok(i !== undefined && (EJ.lista[i].nombre === n || EJ.lista[i].nombre === ES_MAP[n]), 'se encuentra ' + n);
    t.eq(d && d.i, i, 'y escrito tal cual en la planilla, sin la IA: ' + n);
  }
  t.eq(EJ.lista[EJ.porClave.get(R.clave('Curl Bayesian'))].nombre, 'Curl en polea detrás del cuerpo', '«Curl Bayesian» va al nombre que usa la app');
  t.ok(num('Pullover en polea') >= 0, 'uno que la app renombra a un nombre que no está en la lista queda con el suyo («Pullover en polea»)');
  // Siempre el mismo texto (la caché depende de eso) y más de lo mínimo para cachear (512 tokens:
  // 4.000 caracteres es menos de la mitad de lo que mide).
  t.eq(R.ejercicios(EX_DB, EX_CATS, ES_MAP).texto, EJ.texto, 'la lista sale igual cada vez');
  t.ok(EJ.texto.length > 4000 && EJ.texto.length < 12000, 'la lista mide ' + EJ.texto.length + ' caracteres');
  t.eq(R.bloqueEjercicios(EJ), { type: 'text', text: EJ.texto, cache_control: { type: 'ephemeral', ttl: '1h' } }, 'el bloque de la lista va con caché de 1 hora');
  // Llega por parámetro: rutina.ts no importa data.js (las pruebas de la función solo simulan lo que
  // importa index.ts) e index.ts sí, y se la pasa.
  const rutinaTs = leer('supabase/functions/ia/rutina.ts'), indexTs = leer('supabase/functions/ia/index.ts');
  t.ok(!/^\s*import\b[^;]*data\.js/m.test(rutinaTs), 'rutina.ts no importa data.js: la lista le llega por parámetro');
  t.ok(/^import \{ ES_MAP, EX_CATS, EX_DB \} from "\.\/data\.js";$/m.test(indexTs), 'index.ts importa EX_DB, EX_CATS y ES_MAP de ./data.js');
  t.ok(/ejercicios\(EX_DB, EX_CATS, ES_MAP\)/.test(indexTs), 'index.ts se las pasa a rutina.ts');
  const chica = R.ejercicios({ pecho: ['Press A', 'Press B'], biceps: ['Curl A', 'Press A'] }, [['pecho', 'Pecho'], ['biceps', 'Bíceps']], { 'Press viejo': 'Press B' });
  t.eq(chica.texto, 'EJERCICIOS (número;nombre;grupo):\n0;Press A;pecho,biceps\n1;Press B;pecho\n2;Curl A;biceps', 'arma la lista con lo que recibe');
  t.eq(chica.porClave.get('press viejo'), 1, 'y los alias con el ES_MAP que recibe');

  // ---------- el esquema ----------
  const NO_VA = ['anyOf', 'oneOf', 'allOf', 'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format'];
  const recorrer = (s, f, ruta = '') => { f(s, ruta); for (const [k, v] of Object.entries(s.properties || {})) recorrer(v, f, ruta + '.' + k); if (s.items) recorrer(s.items, f, ruta + '[]'); };
  for (const [nombre, esq] of [['rutina', R.esquemaRutina()], ['planilla', R.esquemaRutina({ fila: true, extra: { semanas: { type: 'integer' } } })]]) {
    const mal = [];
    recorrer(esq, (s, ruta) => {
      if (s.type === 'object' && (s.additionalProperties !== false || JSON.stringify(s.required) !== JSON.stringify(Object.keys(s.properties)))) mal.push(ruta + ': objeto abierto o con algo opcional');
      for (const k of NO_VA) if (k in s) mal.push(ruta + ': ' + k);
      if (s.enum && s.enum.length > 7) mal.push(ruta + ': enum de ' + s.enum.length);
    });
    t.eq(mal, [], 'esquema de ' + nombre + ': todo cerrado y obligatorio, sin lo que la API no acepta ni enums grandes');
  }
  const esq = R.esquemaRutina(), dia = esq.properties.dias.items, ejer = dia.properties.ejercicios.items;
  t.eq(Object.keys(esq.properties), ['hay_rutina', 'nombre', 'nota', 'dias'], 'la rutina: hay_rutina, nombre, nota y días');
  t.eq(Object.keys(R.esquemaRutina({ extra: { semanas: { type: 'integer' } } }).properties), ['hay_rutina', 'nombre', 'nota', 'semanas', 'dias'], 'lo propio de cada modo va antes de los días');
  t.eq(Object.keys(dia.properties), ['nombre', 'dias_semana', 'nota', 'ejercicios'], 'el día');
  t.eq(dia.properties.dias_semana.items.enum, ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'], 'los días de la semana por nombre');
  t.eq(Object.keys(ejer.properties), ['nombre', 'numero', 'nombre_lista', 'grupo', 'series', 'descanso', 'rir', 'progresion', 'nota', 'ss', 'dudoso'], 'el ejercicio: primero lo que dice, después lo que elige de la lista');
  t.eq(ejer.properties.numero.type, 'integer', 'el número de la lista es un entero');
  t.ok(!ejer.properties.nombre_lista.enum, 'el nombre copiado no es un enum');
  t.eq(ejer.properties.series.items, R.SERIE, 'las series, con su propio esquema');
  t.eq(Object.keys(R.SERIE.properties), ['objetivo', 'kg'], 'la serie: objetivo y kg');
  t.eq(Object.keys(R.esquemaEjercicio({ fila: true }).properties)[0], 'fila', 'en las planillas, primero la fila de donde sale');
  t.ok(!('fila' in ejer.properties), 'sin planilla no hay fila');
  t.ok(/numero/.test(R.COMO_EJERCICIOS) && /nombre_lista/.test(R.COMO_EJERCICIOS) && /-1/.test(R.COMO_EJERCICIOS), 'las instrucciones dicen cómo elegir de la lista');

  // ---------- la elección ----------
  const pm = num('Press plano con mancuernas');
  t.eq(R.eleccion(EJ, pm, 'Press plano con mancuernas', 'Press mancuernas'), { i: pm, dudoso: false }, 'número y nombre copiado coinciden y comparten una palabra');
  t.eq(R.eleccion(EJ, pm + 1, 'Press plano con mancuernas', 'Press mancuernas'), { i: pm, dudoso: false }, 'número corrido: vale el nombre copiado');
  t.eq(R.eleccion(EJ, 9999, 'PRESS PLANO con  mancuernas', 'press con mancuernas'), { i: pm, dudoso: false }, 'número fuera de la lista y el nombre sin mayúsculas: por el nombre');
  t.eq(R.eleccion(EJ, pm, 'Press inventado', 'Press'), null, 'nombre copiado que no está en la lista: ninguno');
  t.eq(R.eleccion(EJ, pm, '', 'Algo'), null, 'sin nombre copiado: ninguno (el número solo no alcanza)');
  t.eq(R.eleccion(EJ, -1, '', 'Algo'), null, 'número -1: ninguno');
  const vp = num('Vuelos posteriores');
  t.eq(R.eleccion(EJ, vp, 'Vuelos posteriores', 'Pájaros'), { i: vp, dudoso: true }, 'sin ninguna palabra en común: para revisar');
  const rp = num('Remo en polea baja');
  t.eq(R.eleccion(EJ, rp, 'Remo en polea baja', 'Jalón en polea'), { i: rp, dudoso: true }, 'el elemento (polea, barra, máquina) no cuenta como palabra en común');
  t.eq(R.eleccion(EJ, num('Sentadilla libre'), 'Sentadilla libre', 'Sentadillas'), { i: num('Sentadilla libre'), dudoso: false }, 'el plural cuenta como la misma palabra');
  t.eq(R.eleccion(EJ, num('Remo T'), 'Remo T', 'Hip Thrust'), { i: num('Empuje de cadera'), dudoso: false }, 'un alias de la app gana sin depender de la IA («Hip Thrust»)');
  t.eq(R.eleccion(EJ, -1, '', 'RDL'), { i: num('Peso muerto rumano'), dudoso: false }, '«RDL»');
  t.eq(R.eleccion(EJ, -1, '', 'sentadilla búlgara'), { i: num('Sentadilla búlgara'), dudoso: false }, 'el nombre de la lista tal cual, aunque la IA no lo eligiera');
  t.eq(R.eleccion(EJ, -1, '', 'Prensa 45°'), { i: num('Prensa 45'), dudoso: false }, 'sin signos («Prensa 45°»)');
  // Lo de entre paréntesis de la planilla suele ser el elemento: no se tira para buscar el nombre
  // sin la IA («Press de banca plano (mancuernas)» no es «Press de banca plano (barra)»).
  const pb = num('Press de banca plano (barra)');
  t.eq([R.eleccion(EJ, -1, '', 'Press de banca plano'), R.eleccion(EJ, -1, '', 'press de banca plano (BARRA)')], [{ i: pb, dudoso: false }, { i: pb, dudoso: false }],
    'el nombre de la lista con o sin su paréntesis');
  t.eq(R.eleccion(EJ, pm, 'Press plano con mancuernas', 'Press de banca plano (mancuernas)'), { i: pm, dudoso: false }, 'con otro paréntesis vale lo que eligió la IA');
  t.eq([R.eleccion(EJ, -1, '', 'Press de banca plano (Smith)'), R.eleccion(EJ, -1, '', 'Chest press (mancuernas)')], [null, null], 'y sin elección de la IA, ninguno');
  t.eq(R.eleccion(EJ, num('Empuje de cadera en máquina'), 'Empuje de cadera en máquina', 'Hip thrust (máquina)').i, num('Empuje de cadera en máquina'), 'un alias con otro paréntesis tampoco gana («Hip thrust (máquina)»)');
  t.eq([R.eleccion(EJ, -1, '', 'Peso muerto rumano (RDL)'), R.eleccion(EJ, -1, '', 'Chest Press (máquina)')].map(e => e && EJ.lista[e.i].nombre), ['Peso muerto rumano', 'Press de pecho en máquina'],
    'los alias de la app con paréntesis, enteros');

  // ---------- rutinaPost ----------
  const x = o => Object.assign({ nombre: '', numero: -1, nombre_lista: '', grupo: '', series: [{ objetivo: '10', kg: '' }], descanso: '', rir: '', progresion: '', nota: '', ss: false, dudoso: false }, o);
  const deLista = (n, o) => x(Object.assign({ nombre: n, numero: num(n), nombre_lista: n }, o));
  const out = (dias, o) => Object.assign({ hay_rutina: true, nombre: 'Hipertrofia · 3 días', nota: 'Supuse 60 minutos', dias }, o);
  const d = (ejercicios, o) => Object.assign({ nombre: 'Día', dias_semana: [], nota: '', ejercicios }, o);

  t.eq(R.rutinaPost({ hay_rutina: false, nombre: 'x', nota: 'No es una rutina', dias: [d([deLista('Remo T')])] }, EJ), { hay_rutina: false, nombre: '', nota: 'No es una rutina', dias: [] }, 'hay_rutina false: sin días, con la nota');
  t.eq(R.rutinaPost(null, EJ).hay_rutina, false, 'sin respuesta: no hay rutina');

  let b = R.rutinaPost(out([d([deLista('Remo T'), x({ nombre: 'Press raro', numero: 3, nombre_lista: 'Press raro' }), x({ nombre: 'Burpee con giro', grupo: 'CrossFit' })])]), EJ);
  t.eq(b.dias[0].ejercicios.map(e => e.nombre), ['Remo T'], 'sin propios, lo que no es de la lista se saca');
  b = R.rutinaPost(out([d([deLista('Remo T'), x({ nombre: 'Burpee con giro', grupo: 'CrossFit' }), x({ nombre: 'Algo [alumno]', grupo: 'inventado' })])]), EJ, { propios: true });
  t.eq(b.dias[0].ejercicios.map(e => [e.nombre, e.propio, e.grupo]), [['Remo T', false, 'espalda'], ['Burpee con giro', true, 'crossfit'], ['Algo', true, '']],
    'con propios (planillas) quedan con su nombre, marcados, con un grupo válido o ninguno');

  b = R.rutinaPost(out([d([deLista('Curl martillo', { grupo: 'Antebrazo' }), deLista('Curl martillo', { grupo: 'pecho' }), deLista('Curl martillo', { grupo: 'Bíceps' }),
    deLista('Press de banca plano (barra)', { grupo: 'espalda' })])]), EJ);
  t.eq(b.dias[0].ejercicios.map(e => e.grupo), ['antebrazo', 'biceps', 'biceps', 'pecho'], 'grupo: el elegido si es uno de los del ejercicio (por clave o por nombre), si no el primero');
  t.eq(b.dias[0].ejercicios.map(e => e.dudoso), [false, false, false, false], 'sin dudas');
  b = R.rutinaPost(out([d([deLista('Vuelos posteriores', { nombre: 'Pájaros' }), deLista('Remo T', { dudoso: true }), x({ nombre: 'Hip Thrust', numero: num('Remo T'), nombre_lista: 'Remo T' })])]), EJ);
  t.eq(b.dias[0].ejercicios.map(e => [e.nombre, e.dudoso]), [['Vuelos posteriores', true], ['Remo T', true], ['Empuje de cadera', false]], 'dudoso: sin palabra en común o si la IA dudó; el alias gana');

  const series = (ss, kg) => R.rutinaPost(out([d([deLista('Remo T', { series: ss })])]), EJ).dias[0].ejercicios[0][kg ? 'nota' : 'series'];
  const so = s => s.map(x => x.objetivo + (x.kg ? '@' + x.kg : ''));
  t.eq(so(series([{ objetivo: '4x10', kg: '' }])), ['10', '10', '10', '10'], '«4x10»: 4 series de 10');
  t.eq(so(series([{ objetivo: '3 x 8-12', kg: '40 kg' }])), ['8-12@40', '8-12@40', '8-12@40'], '«3 x 8-12» con la carga en cada una');
  t.eq(so(series([{ objetivo: '12-10-8-6', kg: '' }])), ['12', '10', '8', '6'], '«12-10-8-6»: una por número');
  t.eq(so(series([{ objetivo: '8-12', kg: '' }])), ['8-12'], '«8-12» es un rango, no dos series');
  t.eq(so(series([{ objetivo: '4x10', kg: '60-65-70-75' }])), ['10@60', '10@65', '10@70', '10@75'], 'una carga por serie');
  t.eq(so(series([{ objetivo: '10', kg: '60-65-70' }])), ['10@60', '10@65', '10@70'], 'las cargas también arman las series');
  t.eq(so(series([{ objetivo: '8@70.5kg', kg: '' }])), ['8@70.5'], '«8@70.5kg»');
  t.eq(so(series([{ objetivo: '10', kg: '22,5kg' }, { objetivo: '10', kg: '-30' }])), ['10@22,5', '10@-30'], 'la carga, solo el número (también la asistida)');
  t.eq(so(series([{ objetivo: '10', kg: '75%' }, { objetivo: '8', kg: 'RPE 8' }, { objetivo: '8', kg: 'RPE 8' }])), ['10', '8', '8'], 'un % o un RPE no es una carga');
  t.eq(series([{ objetivo: '10', kg: '75%' }, { objetivo: '8', kg: 'RPE 8' }, { objetivo: '8', kg: 'RPE 8' }], true), 'Carga: 75%, RPE 8', 'van a la nota, una vez');
  t.eq(so(series([])), ['', '', ''], 'sin series: 3 para completar');
  t.eq(series(Array.from({ length: 14 }, () => ({ objetivo: '5', kg: '' }))).length, 10, 'hasta 10 series');
  t.eq(series([{ objetivo: 'al fallo con pausa de 2 segundos arriba', kg: '' }])[0].objetivo.length, 20, 'objetivo hasta 20 letras');

  const tiempo = ss => R.rutinaPost(out([d([deLista('Plancha', { series: ss })])]), EJ).dias[0].ejercicios[0].timed;
  t.eq([tiempo([{ objetivo: '45 s', kg: '' }, { objetivo: '1 min', kg: '' }]), tiempo([{ objetivo: '30-45 s', kg: '' }]), tiempo([{ objetivo: '0:45', kg: '' }]), tiempo([{ objetivo: "2'", kg: '' }])],
    [true, true, true, true], 'series de tiempo');
  t.eq([tiempo([{ objetivo: '10', kg: '' }]), tiempo([{ objetivo: '45 s', kg: '' }, { objetivo: '10', kg: '' }]), tiempo([{ objetivo: '', kg: '' }])], [false, false, false], 'de repeticiones, mezcladas o vacías no');

  b = R.rutinaPost(out([d([deLista('Remo T', { ss: true }), x({ nombre: 'Inventado', ss: false }), deLista('Jalón al pecho', { ss: true }), x({ nombre: 'Inventado', ss: true }),
    deLista('Press Arnold', { ss: true }), deLista('Curl con barra', { ss: true })])]), EJ);
  t.eq(b.dias[0].ejercicios.map(e => [e.nombre, e.ss]), [['Remo T', false], ['Jalón al pecho', true], ['Press Arnold', true], ['Curl con barra', false]],
    'superseries: el último nunca; si se saca el que seguía, sigue unida solo si el sacado también iba con el siguiente');

  b = R.rutinaPost(out([
    d([deLista('Remo T')], { nombre: 'Torso A', dias_semana: ['domingo', 'jueves', 'Lunes', 'feriado', 'LUNES'] }),
    d([], { nombre: 'Vacío', dias_semana: ['martes'] }),
    d([x({ nombre: 'Inventado' })], { nombre: 'Sin nada de la lista' }),
    d([deLista('Sentadilla libre')], { nombre: '', dias_semana: ['miércoles', 'sabado'], nota: 'Calentar bien' }),
  ]), EJ);
  t.eq(b.dias.map(x => [x.nombre, x.dias, x.nota]), [['Torso A', [1, 4, 0], ''], ['Día 2', [3, 6], 'Calentar bien']],
    'días de la semana a números (domingo 0, de lunes a domingo, sin repetir); días vacíos afuera; sin nombre, «Día N»');
  t.eq([b.nombre, b.nota], ['Hipertrofia · 3 días', 'Supuse 60 minutos'], 'nombre y nota de la rutina');
  t.eq(R.rutinaPost(out([d([x({ nombre: 'Inventado' })])], { nota: '' }), EJ), { hay_rutina: false, nombre: '', nota: R.SIN_EJERCICIOS, dias: [] }, 'si no queda ningún ejercicio, no hay rutina');
  t.eq(R.rutinaPost(out([d([deLista('Remo T')])], { nombre: '' }), EJ).nombre, 'Rutina con IA', 'sin nombre: «Rutina con IA»');

  // «[alumno]» y las otras marcas de la limpieza no quedan en la rutina.
  b = R.rutinaPost(out([d([deLista('Remo T', { nota: 'Avisarle a [alumno]: [tel]' })], { nombre: '[alumno] - Día 1', nota: 'Para [alumno]' })], { nombre: 'Rutina de [alumno]', nota: 'Hoja de [alumno]' }), EJ);
  t.eq([b.nombre, b.nota, b.dias[0].nombre, b.dias[0].nota, b.dias[0].ejercicios[0].nota], ['Rutina', 'Hoja', 'Día 1', '', 'Avisarle'], 'sin «[alumno]» ni «[tel]» en nombres y notas');

  // Recortes.
  const largo = 'x'.repeat(400);
  b = R.rutinaPost(out([d([deLista('Remo T', { descanso: largo, rir: largo, nota: largo, progresion: largo })], { nombre: largo, nota: largo })], { nombre: largo, nota: largo }), EJ, { propios: true });
  const e0 = b.dias[0].ejercicios[0];
  t.eq([b.nombre.length, b.nota.length, b.dias[0].nombre.length, b.dias[0].nota.length, e0.descanso.length, e0.rir.length, e0.nota.length, e0.progresion.length],
    [60, 200, 60, 160, 20, 10, 160, 120], 'textos recortados');
  t.eq(R.rutinaPost(out([d([x({ nombre: 'y'.repeat(200) })])]), EJ, { propios: true }).dias[0].ejercicios[0].nombre.length, 60, 'nombre propio hasta 60');
  t.eq(R.rutinaPost(out([d([12, -3, 'x', 0, 100000, 100001].map(f => deLista('Remo T', { fila: f })))]), EJ).dias[0].ejercicios.map(e => e.fila), [12, undefined, undefined, undefined, 100000, undefined],
    'la fila de la planilla, si es un número de fila');

  // Topes: 14 días, 25 ejercicios por día, 200 en total (y los de cada modo).
  const muchos = n => Array.from({ length: n }, () => deLista('Remo T'));
  b = R.rutinaPost(out(Array.from({ length: 16 }, () => d(muchos(30)))), EJ);
  t.eq([b.dias.length, b.dias[0].ejercicios.length, b.dias.reduce((a, x) => a + x.ejercicios.length, 0)], [8, 25, 200], 'hasta 25 ejercicios por día y 200 en total');
  b = R.rutinaPost(out(Array.from({ length: 16 }, () => d(muchos(3)))), EJ);
  t.eq(b.dias.length, 14, 'hasta 14 días');
  b = R.rutinaPost(out(Array.from({ length: 4 }, () => d(muchos(30)))), EJ, { topes: { total: 60 } });
  t.eq(b.dias.map(x => x.ejercicios.length), [25, 25, 10], 'el total corta también a mitad de un día');
  b = R.rutinaPost(out(Array.from({ length: 9 }, () => d(muchos(15)))), EJ, { topes: { dias: 7, ejercicios: 12, series: 8 } });
  t.eq([b.dias.length, b.dias[0].ejercicios.length], [7, 12], 'cada modo puede pedir menos («Armar con IA»: 7 días y 12 por día)');
  t.ok(b.dias.every(x => x.ejercicios.every(e => !e.ss || e !== x.ejercicios[x.ejercicios.length - 1])), 'el último de un día recortado tampoco queda unido');

  // ---------- limpiarTexto ----------
  // La misma regla que la app (app/core/planilla.js → limpiar) con mails, teléfonos y documentos.
  const casos = ['60-65-70-75', '12-10-8-6', '4x8@70.5kg', '1000 800 600 400', '15-03-2026', '+54 9 351 456-7890', '(0351) 456-7890', 'CUIT 20-30123456-7',
    'Su DNI es 30.123.456', 'Tel 1145678901', 'mail: a.b@correo.prueba.test', 'WhatsApp 11 4567 8901 18hs', 'Cel 11-4567-8901 (2 veces)', 'Uruguay: +598 99 123 456',
    'Del 15-03-2026 al 30-03-2026', 'Press 4x10 60kg descanso 90"', 'DNI 12345678 y CUIL 27-12345678-3'];
  t.eq(casos.map(R.limpiarTexto), casos.map(s => limpiar(s)), 'limpiarTexto saca lo mismo que la app');
  t.eq(R.limpiarTexto('12|Press de banca|4|8-10|75%|2\'\n13|Llamar al 11 4567-8901|a.b@correo.prueba.test\r\n14|Ver https://youtu.be/abc y www.algo.test/x\r15|Remo'),
    '12|Press de banca|4|8-10|75%|2\'\n13|Llamar al [tel]|[mail]\n14|Ver [link] y [link]\n15|Remo', 'renglón por renglón: quedan los renglones y los «|»; los links, «[link]»');
  t.eq(R.limpiarTexto('hipertrofia,\u0000 4 días\u200b\t con  mancuernas'), 'hipertrofia, 4 días con mancuernas', 'sin caracteres raros ni espacios de más');
  t.eq(R.limpiarTexto(null), '', 'nada → vacío');
};
