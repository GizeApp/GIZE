// Compara la huella del esquema de producción con la de la base de pruebas (ver tests/pg/README.md,
// «Dónde la base de pruebas puede no ser producción»).
//   node tests/pg/comparar-huella.mjs <huella-de-produccion.json> [--con | <otra-huella.json>]
// La huella de producción es el JSON que devuelve supabase/esquema-huella.sql en el SQL Editor (el
// valor solo, o la fila exportada: [{"huella": {…}}] también sirve). Sin segundo argumento, arma la
// base de pruebas (tests/pg.mjs, con Postgres local o GIZE_PSQL) y le saca la huella a la base de hoy
// (gize_sin); con --con, a la base con los gimnasios (para cuando estén aplicados en producción).
// Lista lo que está solo en producción, lo que está solo en la base de pruebas y lo que difiere,
// agrupado por tipo (col, fn, pol…), y muestra aparte los conteos «dato:» (no se comparan). No
// imprime datos de nadie: la huella no los tiene. Sale con 1 si hay diferencias.
import fs from 'node:fs';
import { pg, huella, diferencias } from '../pg.mjs';

const leerHuella = f => {
  let j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (Array.isArray(j)) j = j[0];
  if (j && typeof j.huella === 'object') j = j.huella;
  if (j && typeof j.huella === 'string') j = JSON.parse(j.huella);
  if (!j || typeof j !== 'object' || !('version' in j)) throw new Error(f + ' no parece una huella de supabase/esquema-huella.sql');
  return j;
};

const [archivo, otro] = process.argv.slice(2);
if (!archivo) { console.log('Uso: node tests/pg/comparar-huella.mjs <huella-de-produccion.json> [--con | <otra-huella.json>]'); process.exit(2); }
const prod = leerHuella(archivo);
let prueba;
if (otro && otro !== '--con') prueba = leerHuella(otro);
else {
  const h = await pg();
  if (h.saltear) { console.log('No se puede armar la base de pruebas: ' + h.saltear); process.exit(2); }
  prueba = await huella(h.base(otro === '--con' ? 'gize_con' : 'gize_sin'));
}

const datos = k => k.startsWith('dato:');
const d = diferencias(Object.fromEntries(Object.entries(prod).filter(([k]) => !datos(k))), Object.fromEntries(Object.entries(prueba).filter(([k]) => !datos(k))));
const tipo = k => k.split(':')[0];
const porTipo = ks => ks.reduce((o, k) => ((o[tipo(k)] = o[tipo(k)] || []).push(k), o), {});
const mostrar = (titulo, ks, fn) => {
  console.log('\n' + titulo + ': ' + ks.length);
  for (const [t, xs] of Object.entries(porTipo(ks))) { console.log('  ' + t + ' (' + xs.length + ')'); for (const k of xs) console.log('    ' + fn(k)); }
};
console.log('Producción: Postgres ' + prod.version + ', ' + Object.keys(prod).length + ' claves. Base de pruebas: Postgres ' + prueba.version + ', ' + Object.keys(prueba).length + ' claves.');
mostrar('Solo en producción (no lo crea ningún archivo del repo)', d.faltan, k => k + ' = ' + prod[k]);
mostrar('Solo en la base de pruebas (en el repo, no en producción)', d.nuevas, k => k + ' = ' + prueba[k]);
mostrar('Distinto', d.cambian, k => k + '\n      producción: ' + prod[k] + '\n      pruebas:    ' + prueba[k]);
console.log('\nConteos de producción (no se comparan):');
for (const k of Object.keys(prod).filter(datos).sort()) console.log('  ' + k.slice(5) + ': ' + prod[k]);
const total = d.faltan.length + d.nuevas.length + d.cambian.length;
console.log('\n' + (total ? total + ' diferencias.' : 'Sin diferencias.'));
process.exit(total ? 1 : 0);
