// La política de privacidad dice la misma edad que Google Play (Contenido de la app → Público
// objetivo: solo «A partir de 18 años»). Si una dice una cosa y la otra otra, la revisión de la
// tienda lo marca.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async ({ t }) => {
  const html = fs.readFileSync(path.join(ROOT, 'privacidad/index.html'), 'utf8');
  const sec = (html.match(/<h2>Menores de edad<\/h2>\s*<p>([^<]+)<\/p>/) || [])[1] || '';
  t.ok(/mayores de 18 años/.test(sec), 'la política dice que GIZE es para mayores de 18: ' + sec);
  t.ok(!/13 años|permiso de tus padres/.test(html), 'no habla de usarla desde los 13 ni con permiso de los padres');
};
