// Pedir un producto: validaciones, subida de las fotos, alta del pedido, avisos al entrar
// (publicado y rechazado) y volver a mandar el rechazado con los datos cargados.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';
const IMG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icon-192.png');

export default async function ({ base, t }){
  const inserts = [], uploads = [], seen = [];
  let resolved = [{ id: 7, name: 'Barra proteica', brand: 'Marca A', code: null, status: 'cargado', note: null },
                  { id: 8, name: 'Galletitas X', brand: 'Marca Y', code: '7791112223', status: 'rechazado', note: 'La foto no se lee' }];
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: {
      '/profiles': profile('client'),
      '/product_requests': (r, J, i) => i.m === 'POST' ? (inserts.push(JSON.parse(i.body)), r.fulfill({ status: 201, body: '' })) : J(resolved.splice(0)),
      '/product_request_seen': (r, J, i) => (seen.push(JSON.parse(i.body).rid), J(null)),
    } });
  await p.route(/supabase\.co\/storage\//, r => { uploads.push(new URL(r.request().url()).pathname); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"x"}' }); });
  await p.goto(base + '/app/'); await wait(6000);

  // Avisos al entrar: el publicado, y el rechazado ofrece mandarlo de nuevo (se acepta).
  t.has(dialogs.join(' | '), 'Ya agregamos a GIZE el producto que pediste: «Barra proteica»', 'aviso de producto publicado');
  t.has(dialogs.join(' | '), 'No pudimos agregar «Galletitas X»: La foto no se lee', 'aviso de producto rechazado con el motivo');
  t.eq(seen.sort(), [7, 8], 'pedidos marcados como vistos');
  t.eq([await p.inputValue('[data-field="name"]').catch(() => ''), await p.inputValue('[data-field="brand"]').catch(() => '')], ['Galletitas X', 'Marca Y'], 'volver a mandar: nombre y marca cargados');
  await p.click('[data-action="rq-cancel"]'); await wait(300);
  dialogs.length = 0;

  // Pedido nuevo desde la búsqueda.
  await p.click('[data-action="search-open"]'); await wait(300);
  await p.fill('#foodSearch', 'yogur griego'); await wait(600);
  await p.click('[data-action="rq-open"]'); await wait(300);
  t.eq(await p.inputValue('[data-field="name"]'), 'yogur griego', 'el nombre viene de lo buscado');
  t.ok(!(await p.$('[data-action="rq-manual"]')), 'no tiene que estar "cargar los valores solo para mí"');
  await p.click('[data-action="rq-send"]'); await wait(200);
  await p.fill('[data-field="brand"]', 'Ser');
  await p.click('[data-action="rq-send"]'); await wait(200);
  t.eq(dialogs.splice(0), ['Poné la marca del producto.', 'Falta la foto de la tabla nutricional (suele estar atrás del paquete).'], 'validaciones');
  await p.setInputFiles('[data-action="rq-photo"][data-k="label"]:not([capture])', IMG); await wait(400);
  await p.setInputFiles('[data-action="rq-photo"][data-k="front"]:not([capture])', IMG); await wait(400);
  t.eq(await p.inputValue('[data-field="name"]'), 'yogur griego', 'el nombre sigue después de elegir las fotos');
  await p.click('[data-action="rq-send"]'); await wait(2000);
  t.has(dialogs.join(' | '), 'Tu producto fue enviado a administración', 'cartel de enviado');
  t.eq(uploads.length, 2, 'fotos subidas (tabla y frente)');
  t.eq(inserts.length, 1, 'pedidos guardados');
  if (inserts[0]){
    t.eq([inserts[0].name, inserts[0].brand, inserts[0].code], ['yogur griego', 'Ser', null], 'datos del pedido');
    t.ok(/^11111111-1111-1111-1111-111111111111\/pedido-tabla-/.test(inserts[0].label_path), 'la foto de la tabla va a la carpeta del usuario');
  }
  t.eq(errs, [], 'errores de la página');
  await close();
}
