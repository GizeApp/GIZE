// Política de privacidad (privacidad/index.html) con la IA: antes de leer con IA cualquier pedido
// (etapa 1, solo el panel) la política tiene que decir que la foto de la tabla puede ir a
// Anthropic, en Estados Unidos, con la sección «Funciones con inteligencia artificial» y la fecha
// nueva (pedidos_desde, en el panel, es esa fecha). Lo de los pasos automáticos no cambia: los
// pasos nunca se mandan a la IA. Las funciones para coaches («Pasar mis planillas» y «Armar con
// IA») tienen su párrafo (#ia-coach), su permiso (app/ui/ia-permiso-rutinas.js) y su línea en
// los términos, y los tres dicen lo mismo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export default async ({ t }) => {
  const html = fs.readFileSync(path.join(ROOT, 'privacidad/index.html'), 'utf8');
  const txt = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = /Última actualización: (\d{1,2}) de (\w+) de (\d{4})/.exec(txt);
  const fecha = m ? new Date(Date.UTC(+m[3], MESES.indexOf(m[2]), +m[1])) : null;
  t.ok(fecha && fecha >= new Date(Date.UTC(2026, 9, 19)), 'la fecha de la política es la del cambio de la IA (o posterior): ' + (m && m[0]));
  t.ok(/<h2 id="ia">Funciones con inteligencia artificial \(opcional\)<\/h2>/.test(html), 'la sección «Funciones con inteligencia artificial (opcional)»');
  const ia = txt.slice(txt.indexOf('Funciones con inteligencia artificial (opcional)'), txt.indexOf('Dónde se guardan'));
  t.has(ia, 'Anthropic, PBC', 'nombra a Anthropic');
  t.has(ia, 'Estados Unidos', 'dice que los datos van a Estados Unidos');
  t.has(ia, 'consentimiento expreso', 'la transferencia: consentimiento expreso');
  t.has(ia, 'artículo 12 de la Ley 25.326 y su Decreto 1558/2001', 'cita la ley y el decreto');
  t.has(ia, 'no usa estos datos para entrenar', 'Anthropic no entrena con estos datos');
  t.has(ia, '30 días', 'cuánto los guarda Anthropic');
  t.has(ia, 'Qué se envía en las funciones de comida', 'lo que no se manda vale para la comida');
  t.has(ia, 'Nunca tu nombre, tu mail, tu peso', 'qué no se manda');
  t.has(ia, 'El resumen para tu coach es aparte y lleva otros datos', 'el resumen del coach es la excepción, y lo dice');
  // El «nunca tu peso» no puede valer para todo: el resumen del coach sí lo manda.
  const nunca = ia.indexOf('Nunca tu nombre, tu mail, tu peso'), resumen = ia.indexOf('Resumen para tu coach');
  t.ok(nunca > 0 && resumen > nunca && /se envían a Anthropic tus números de la semana \(entrenos, comidas, peso/.test(ia.slice(resumen)), 'el resumen del coach dice que manda el peso');
  t.has(ia, 'nunca tus pasos', 'los pasos no se mandan');
  t.has(ia, 'No son un consejo médico ni nutricional', 'son estimaciones, no consejo médico');
  t.has(ia, 'mayores de 18 años', 'solo para mayores de 18');
  t.has(ia, 'Ajustes → Funciones con IA', 'cómo apagarlas');
  t.has(ia, 'solo los pedidos que llegan desde el 19 de octubre de 2026', 'solo los pedidos desde una fecha fija (no se mueve al actualizar la política)');
  t.has(txt, 'si activás las funciones con IA, sacar la foto de un plato para calcularlo', '«Cámara y fotos» incluye la foto del plato');
  t.has(txt, 'La foto del plato también se envía a Anthropic para calcularlo, y GIZE no la guarda', '«Cámara y fotos» dice adónde va la foto del plato');
  // Los arreglos de la sección de fotos, la lista de empresas, lo que se borra y los derechos.
  t.ok(!/las ve solo el equipo de GIZE/.test(txt), 'las fotos de productos ya no dicen que las ve solo el equipo de GIZE');
  t.has(txt, 'la foto de la tabla se envía a Anthropic para leerla', '«Cámara y fotos» dice que la tabla puede ir a Anthropic');
  t.ok(/<li><b>Anthropic:<\/b>/.test(html), 'Anthropic en la lista de empresas');
  t.has(txt, 'recibe la foto de cada consulta, el texto de las planillas o el pedido que escribe el coach o, en el resumen para tu coach, tus números de la semana', 'la lista de empresas dice qué recibe Anthropic: la foto, lo de las funciones para coaches y el resumen');
  // Solo la foto: la aclaración escrita («¿Qué es?») se sacó de la app.
  t.has(ia, 'solo la foto que elegís y, para calcular un plato, la lista de alimentos de GIZE', 'en la comida se envía solo la foto');
  t.has(ia, 'GIZE no guarda la foto del plato; la foto de un producto', 'qué no guarda GIZE, sin texto');
  for (const viejo of ['o lo que escribís', 'ni lo que escribas', 'la foto o el texto de cada consulta'])
    t.ok(!txt.includes(viejo), 'la política ya no dice «' + viejo + '»');
  t.has(txt, 'Estos proveedores están obligados por contrato a proteger tus datos', 'la frase de los proveedores');
  t.has(txt, 'tu permiso para usar las funciones con IA y tus avisos de «¿Está mal?». No conservamos', '«Qué se borra» incluye el permiso de la IA y los avisos de «¿Está mal?»');
  t.has(ia, 'Si tocás «¿Está mal? Avisanos», guardamos lo que estimó la IA y tu comentario (nunca la foto)', 'dice qué guarda «¿Está mal?» (sin la foto)');
  t.has(ia, 'se borra a los 180 días', 'y cuánto tiempo (ia_limpiar)');
  // La hoja del permiso de la app (app/ui/ia-permiso.js) promete lo mismo que la política.
  const hoja = fs.readFileSync(path.join(ROOT, 'app/ui/ia-permiso.js'), 'utf8');
  for (const frase of ['Anthropic, la empresa que hace la IA Claude, en Estados Unidos', 'no tu nombre, tu mail ni otros datos de tu cuenta', 'no la usa para entrenar su IA',
    'la borra dentro de los 30 días', 'Solo se manda la foto: no tu nombre', 'aceptás que tu foto se envíe a Anthropic', 'GIZE no guarda la foto del plato', 'No es consejo médico ni nutricional', 'Ajustes → Funciones con IA', 'Aceptar y usar IA', 'privacidad/?app=1#ia'])
    t.has(hoja, frase, 'la hoja del permiso dice: ' + frase);
  const textos = (hoja.match(/export const PERMISO_[A-Z]+ = [\s\S]*?;\n/g) || []).join('\n');
  t.ok(textos.length > 200 && !/lo que escribas|tu texto/.test(textos), 'la hoja del permiso ya no dice que se manda texto');
  const ajustes = fs.readFileSync(path.join(ROOT, 'app/screens/config.js'), 'utf8');
  t.ok(ajustes.includes('Envía a Anthropic (EE. UU.) la foto de cada consulta.') && !ajustes.includes('la foto o el texto'), 'Ajustes → Funciones con IA: solo la foto');
  // Las funciones para coaches («Pasar mis planillas» y «Armar con IA»): qué se manda, qué se saca, que
  // GIZE no guarda la planilla ni el pedido, el permiso propio y dónde se apaga.
  t.ok(/<p id="ia-coach"><b>Qué se envía en las funciones para coaches<\/b>/.test(html), 'el párrafo de las funciones para coaches, con su ancla (#ia-coach)');
  const coach = ia.slice(ia.indexOf('Qué se envía en las funciones para coaches'));
  t.has(ia, 'Para coaches, cuando estén disponibles: pasar sus planillas a GIZE («Pasar mis planillas») y armar una rutina con IA («Armar con IA»)', 'la lista nombra las dos funciones para coaches');
  t.has(ia, '«Usar IA en tus rutinas», uno solo para las dos', 'un solo permiso para las dos');
  t.has(ia, 'lo puede apagar cuando quiera en Configuración → Privacidad', 'dónde lo apaga el coach');
  t.has(coach, 'con «Armar con IA», el pedido que escribe el coach', 'en «Armar con IA» va el pedido que escribe el coach');
  t.has(coach, 'la planilla se lee en el equipo del coach y a la IA van solo los ejercicios de las hojas que elige', 'de las planillas, solo los ejercicios');
  t.has(coach, 'GIZE saca los mails, teléfonos, números de documento y links que encuentra y las filas de datos personales o de salud', 'qué saca GIZE de las planillas');
  t.has(coach, 'cambia por «[alumno]» los nombres de las hojas, del archivo y de los alumnos vinculados', 'los nombres pasan a «[alumno]»');
  t.has(coach, 'Nunca se envían el nombre, el mail ni otros datos de la cuenta del coach o de sus alumnos', 'qué no se manda nunca');
  t.has(coach, 'GIZE no guarda la planilla ni el pedido', 'GIZE no guarda la planilla ni el pedido');
  // Salvo lo que el coach mande con «¿Está mal? Avisanos» (que sí guarda el pedido): lo dice ahí mismo,
  // como la hoja del permiso, y no solo más abajo en «Cuánto tiempo».
  t.has(coach, 'guarda solo las rutinas que el coach decide guardar y lo que mande con «¿Está mal? Avisanos»', 'lo que no guarda GIZE dice también lo de «¿Está mal?», como la hoja');
  t.has(ia, '«¿Está mal? Avisanos» guarda la rutina que armó la IA, el comentario y, en «Armar con IA», el pedido (nunca la planilla)', 'qué guarda «¿Está mal?» en las funciones para coaches');
  // La hoja del permiso del coach (app/ui/ia-permiso-rutinas.js) promete lo mismo que la política, y
  // la fila de Configuración → Privacidad también.
  const hojaCoach = fs.readFileSync(path.join(ROOT, 'app/ui/ia-permiso-rutinas.js'), 'utf8');
  for (const frase of ['Usar IA en tus rutinas', 'Anthropic, la empresa que hace la IA Claude, en Estados Unidos', 'No se manda tu nombre, tu mail ni otros datos de tu cuenta o de tus alumnos',
    'Con «Armar con IA» va el pedido que escribís', 'De tus planillas van solo los ejercicios', 'La planilla se lee en tu equipo', 'por «[alumno]»', 'no lo usa para entrenar su IA',
    'lo borra dentro de los 30 días', 'GIZE no guarda tus planillas ni tus pedidos', 'No es consejo médico', 'Configuración → Privacidad', 'aceptás que esto se envíe a Anthropic', 'Aceptar y usar IA', 'privacidad/?app=1#ia-coach'])
    t.has(hojaCoach, frase, 'la hoja del permiso del coach dice: ' + frase);
  const configCoach = fs.readFileSync(path.join(ROOT, 'app/screens/coach/settings.js'), 'utf8');
  t.has(configCoach, 'envía a Anthropic (EE. UU.) el pedido que escribís y los ejercicios de tus planillas, sin datos tuyos ni de tus alumnos. Apagado: no se manda nada.', 'Configuración → Privacidad del coach dice qué se manda');
  // Los términos: lo que arma la IA es un borrador que el coach revisa, y la rutina es suya.
  const terminos = fs.readFileSync(path.join(ROOT, 'terminos/index.html'), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  t.has(terminos, 'lo que arma es un borrador que puede tener errores: lo revisás y lo ajustás vos antes de guardarlo o dárselo a un alumno, y la rutina que le das es tuya', 'los términos: el borrador lo revisa el coach y la rutina es suya');
  t.has(terminos, 'Subí solo planillas que tengas derecho a usar', 'los términos: solo planillas que puede usar');
  t.has(txt, 'El registro de cuándo se usó la IA (la fecha, la función y lo que costó) queda sin tu cuenta', 'y dice que el registro de uso queda sin la cuenta (ia_llamadas: on delete set null)');
  t.ok(!/tu uso de las funciones con IA\. No conservamos/.test(txt), 'no dice que el uso se borra');
  t.has(txt, 'atiende las denuncias y reclamos', 'el derecho a reclamar ante la AAIP');
  t.ok(/href="https:\/\/www\.argentina\.gob\.ar\/aaip\/datospersonales"/.test(html), 'con el contacto de la AAIP');
  // Los pasos automáticos: igual que antes.
  t.has(txt, 'Se usan únicamente para cargar los pasos de cada día', 'la sección de los pasos sigue igual');
};
