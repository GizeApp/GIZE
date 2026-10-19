// Política de privacidad (privacidad/index.html) con la IA: antes de leer con IA cualquier pedido
// (etapa 1, solo el panel) la política tiene que decir que la foto de la tabla puede ir a
// Anthropic, en Estados Unidos, con la sección «Funciones con inteligencia artificial» y la fecha
// nueva (pedidos_desde, en el panel, es esa fecha). Lo de los pasos automáticos no cambia: los
// pasos nunca se mandan a la IA.
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
  t.has(ia, 'Nunca tu nombre, tu mail, tu peso', 'qué no se manda');
  t.has(ia, 'nunca tus pasos', 'los pasos no se mandan');
  t.has(ia, 'No son un consejo médico ni nutricional', 'son estimaciones, no consejo médico');
  t.has(ia, 'mayores de 18 años', 'solo para mayores de 18');
  t.has(ia, 'Ajustes → Funciones con IA', 'cómo apagarlas');
  t.has(ia, 'solo los pedidos que llegan desde la fecha de esta política', 'solo los pedidos posteriores a la política');
  // Los arreglos de la sección de fotos, la lista de empresas, lo que se borra y los derechos.
  t.ok(!/las ve solo el equipo de GIZE/.test(txt), 'las fotos de productos ya no dicen que las ve solo el equipo de GIZE');
  t.has(txt, 'la foto de la tabla se envía a Anthropic para leerla', '«Cámara y fotos» dice que la tabla puede ir a Anthropic');
  t.ok(/<li><b>Anthropic:<\/b>/.test(html), 'Anthropic en la lista de empresas');
  t.has(txt, 'Estos proveedores están obligados por contrato a proteger tus datos', 'la frase de los proveedores');
  t.has(txt, 'tu permiso y tu uso de las funciones con IA', '«Qué se borra» incluye lo de la IA');
  t.has(txt, 'atiende las denuncias y reclamos', 'el derecho a reclamar ante la AAIP');
  t.ok(/href="https:\/\/www\.argentina\.gob\.ar\/aaip\/datospersonales"/.test(html), 'con el contacto de la AAIP');
  // Los pasos automáticos: igual que antes.
  t.has(txt, 'Se usan únicamente para cargar los pasos de cada día', 'la sección de los pasos sigue igual');
};
