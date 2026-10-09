// Productos de Open Food Facts: los guarda GIZE desde el servidor (función "productos-off").
// Al escanear un código que no está en la base, la app le pide a la función que lo busque y lo
// guarde: nunca carga ella el producto en la tabla (antes hacía POST /rest/v1/products con
// source 'off' y datos que la base no podía comprobar). Si la función falla o todavía no está
// publicada, el alimento se anota igual con los datos de Open Food Facts, sin guardarlo.
// Además: la función revisa los datos de OFF con las mismas reglas que la importación mensual.
// Lo que la función rechaza por valores imposibles o porque está oculto (reportado o sacado por
// un administrador) no se trae igual desde OFF: se ofrece pedirlo. Y lo que llega directo de OFF
// (búsqueda por nombre o sin la función) pasa por los mismos límites.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newPage, saved, wait, text, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE = '7791234567895';
const OFF_PRODUCT = { code: CODE, product_name: 'Galletitas de Open Food Facts', brands: 'Marca Off', quantity: '200 g', serving_quantity: '30',
  nutriments: { 'energy-kcal_100g': 450, proteins_100g: 7, carbohydrates_100g: 70, fat_100g: 15 } };

// Abre Comida, escanea (escribe) el código y devuelve lo que pasó.
async function scan(base, fnReply, offProduct = OFF_PRODUCT){
  const posts = [], fnBodies = [], offCalls = [], rpcs = [];
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: {
      '/profiles': profile('client'),
      '/products': (r, J, i) => i.m === 'GET' ? J(i.one ? null : []) : (posts.push(i.m + ' ' + (i.body || '')), r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })),
      '/productos-off': (r, J, i) => { fnBodies.push(JSON.parse(i.body || 'null')); return fnReply(r, J); },
      '/product_use': (r, J, i) => (rpcs.push(JSON.parse(i.body || 'null')), J(null)),
    } });
  await p.route(/openfoodfacts\.org/, r => {
    offCalls.push(r.request().url());
    return /\/api\/v2\/product\//.test(r.request().url())
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 1, product: offProduct }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: '{"products":[]}' });
  });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="scan-open"]'); await wait(500);
  await p.fill('#scanCode', CODE);
  await p.click('[data-action="scan-manual"]'); await wait(1500);
  const title = await text(p, '.sheet .sheet-title'), src = await text(p, '.sheet .sheet-src');
  let diary = [];
  if (await p.$('[data-action="portion-add"]')){
    await p.fill('#portionGrams', '50');
    await p.click('[data-action="portion-add"]'); await wait(900);
    diary = ((await saved(p)).diary || []).map(e => [e.name, e.grams, e.kcal]);
  }
  await close();
  return { posts, fnBodies, offCalls, rpcs, title, src, diary, dialogs, errs };
}

export default async function ({ base, t }){
  // 1) La función lo guarda: la app usa lo que devuelve (ya es de la base de GIZE).
  const a = await scan(base, (r, J) => J({ saved: true, product: { id: 'p-off-1', code: CODE, name: 'Galletitas guardadas por GIZE', brand: 'Marca Off',
    kcal: 450, protein: 7, carbs: 70, fat: 15, unit: 'g', portion: 30, source: 'off', verified: false } }));
  t.eq(a.fnBodies, [{ code: CODE }], 'al escanear, la app le pide a la función solo el código');
  t.eq(a.posts, [], 'la app no carga productos directo en la tabla');
  t.eq(a.offCalls, [], 'con la función andando, la app no busca en Open Food Facts');
  t.has(a.title, 'Galletitas guardadas por GIZE', 'se abre el producto que guardó la función');
  t.has(a.src, 'Open Food Facts', 'lleva el crédito de Open Food Facts');
  t.eq(a.diary, [['Galletitas guardadas por GIZE · Marca Off', 50, 225]], 'se anota en el diario');
  t.eq(a.rpcs, [{ pid: 'p-off-1' }], 'suma un uso al producto de la base');
  t.eq(a.errs, [], 'errores de la página (función andando)');

  // 2) La función todavía no está publicada (404): se anota igual con los datos de OFF, sin guardarlo.
  const b = await scan(base, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"NOT_FOUND","message":"Requested function was not found"}' }));
  t.ok(b.fnBodies.length >= 1, 'sin la función publicada, igual se intenta con la función');
  t.eq(b.posts, [], 'sin la función, la app no carga el producto en la tabla');
  t.ok(b.offCalls.some(u => u.includes('/api/v2/product/' + CODE)), 'sin la función, se busca en Open Food Facts desde el celular');
  t.has(b.title, 'Galletitas de Open Food Facts', 'sin la función, se abre el producto de OFF');
  t.eq(b.diary, [['Galletitas de Open Food Facts · Marca Off', 50, 225]], 'sin la función, se anota igual en el diario');
  t.eq(b.errs, [], 'errores de la página (sin la función)');

  // 3) La función falla (error del servidor): lo mismo.
  const c = await scan(base, r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"No se pudo guardar el producto."}' }));
  t.eq(c.posts, [], 'con error de la función, la app no carga el producto en la tabla');
  t.eq(c.diary, [['Galletitas de Open Food Facts · Marca Off', 50, 225]], 'con error de la función, se anota igual en el diario');

  // 4) Open Food Facts no lo tiene: se ofrece pedirlo, sin volver a buscar desde el celular.
  const d = await scan(base, (r, J) => J({ missing: true }));
  t.eq(d.offCalls, [], 'si la función dice que OFF no lo tiene, no se busca de nuevo');
  t.has(d.dialogs.join(' | '), 'Todavía no tenemos el código ' + CODE, 'ofrece pedir el producto');
  t.eq(d.posts, [], 'no carga nada en la tabla');

  // 4b) La función no lo guardó porque está oculto o sus valores no pueden ser: tampoco se trae
  //     desde el celular (volvían los mismos datos malos), se ofrece pedirlo.
  for (const why of ['oculto', 'valores imposibles', 'calorías no cierran']){
    const x = await scan(base, (r, J) => J({ skipped: why }));
    t.eq(x.offCalls, [], why + ': no se busca en Open Food Facts desde el celular');
    t.eq(x.diary, [], why + ': no se abre el producto');
    t.has(x.dialogs.join(' | '), 'Todavía no tenemos el código ' + CODE, why + ': ofrece pedir el producto');
  }
  // Con la tabla incompleta en OFF sí se anota con lo que trae OFF (como antes).
  const inc = await scan(base, (r, J) => J({ skipped: 'tabla incompleta' }));
  t.eq(inc.diary, [['Galletitas de Open Food Facts · Marca Off', 50, 225]], 'tabla incompleta: se anota igual con los datos de OFF');

  // 4c) Sin la función, un producto de OFF con los kJ en el lugar de las kcal no se anota.
  const KJ = Object.assign({}, OFF_PRODUCT, { nutriments: { 'energy-kcal_100g': 1590, proteins_100g: 8, carbohydrates_100g: 75, fat_100g: 2 } });
  const kj = await scan(base, r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }), KJ);
  t.eq(kj.diary, [], 'valores imposibles de OFF: no se abre el producto');
  t.has(kj.dialogs.join(' | '), 'Todavía no tenemos el código ' + CODE, 'valores imposibles de OFF: ofrece pedirlo');

  // 4d) Lo que llega directo de OFF (también la búsqueda por nombre) pasa por los mismos límites.
  {
    const { p, close } = await newPage({});
    await p.goto(base + '/app/'); await wait(1000);
    const out = await p.evaluate(async list => { const m = await import('/app/core/off.js'); return list.map(x => !!m.offToFood(x)); }, [
      OFF_PRODUCT, KJ,
      { code: '1', product_name: 'Cerveza', nutriments: { 'energy-kcal_100g': 43, proteins_100g: 0.5, carbohydrates_100g: 3.6, fat_100g: 0, alcohol_100g: 5 } },
      { code: '2', product_name: 'Solo calorías y proteína', nutriments: { 'energy-kcal_100g': 120, proteins_100g: 10 } },
      { code: '3', product_name: 'No cierra', nutriments: { 'energy-kcal_100g': 50, proteins_100g: 20, carbohydrates_100g: 20, fat_100g: 20 } },
      { code: '4', product_name: 'Macros de más', nutriments: { 'energy-kcal_100g': 900, proteins_100g: 60, carbohydrates_100g: 60, fat_100g: 10 } },
    ]);
    t.eq(out, [true, false, true, true, false, false], 'offToFood descarta los valores imposibles o que no cierran');
    await close();
  }

  // 5) La función revisa los datos de OFF con las mismas reglas que la importación mensual.
  let fn = null, lib = null;
  try {
    fn = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/productos-off/producto.ts')).href);
    lib = await import(pathToFileURL(path.join(ROOT, 'scripts/off-import-lib.mjs')).href);
  } catch (e) { t.ok(false, 'no se pudo cargar la revisión de la función (supabase/functions/productos-off/producto.ts): ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  if (fn && lib){
    const n = (kcal, pr, c, f, extra) => Object.assign({ 'energy-kcal_100g': kcal, proteins_100g: pr, carbohydrates_100g: c, fat_100g: f }, extra);
    const samples = [
      OFF_PRODUCT,
      { code: '7790001000028', product_name_es: 'Leche entera', quantity: '1 L', nutriments: { energy_100g: 255, proteins_100g: '3,1', carbohydrates_100g: 4.8, fat_100g: 3 } },
      { code: '7790001000035', product_name: 'Cerveza', quantity: '473 ml', nutriments: n(43, 0.5, 3.6, 0, { alcohol_100g: 5 }) },
      { code: '7790001000042', product_name: 'Sin grasas cargadas', nutriments: { 'energy-kcal_100g': 300, proteins_100g: 10, carbohydrates_100g: 60 } },
      { code: '7790001000059', product_name: 'Inventado', nutriments: n(2000, 10, 10, 10) },
      { code: '7790001000066', product_name: 'No cierra', nutriments: n(50, 20, 20, 20) },
      { code: '7790001000073', product_name: '', nutriments: n(100, 5, 10, 4) },
      { code: '2001234567890', product_name: 'Pesado en el local', nutriments: n(100, 5, 10, 4) },
      { code: '123456', product_name: 'Código corto', nutriments: n(100, 5, 10, 4) },
      { code: '7790001000080', product_name: 'Macros de más', nutriments: n(900, 60, 60, 10) },
    ];
    samples.forEach((s, i) => t.eq(fn.offToRow(s), lib.offToRow(s), 'muestra ' + (i + 1) + ': la función y la importación revisan igual'));
    t.eq(fn.offToRow(OFF_PRODUCT), { code: CODE, name: 'Galletitas de Open Food Facts', brand: 'Marca Off', kcal: 450, protein: 7, carbs: 70, fat: 15, unit: 'g', portion: 30, scans: 0 }, 'producto de OFF que sirve');
    t.eq(fn.offToRow(samples[4]), { skip: 'valores imposibles' }, 'calorías imposibles no se guardan');
    t.eq(fn.offToRow(samples[3]), { skip: 'tabla incompleta' }, 'sin la tabla completa no se guarda');
  }
}
