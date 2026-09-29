// Pedir un producto con una foto que el navegador no puede abrir (HEIC en Chrome/Android o un
// archivo roto): se avisa al elegirla, con una salida (la cámara u otra foto), no se guarda y
// no se sube nada. Antes quedaba la vista previa rota y al enviar decía «Revisá tu conexión».
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const uploads = [], inserts = [];
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: {
      '/profiles': profile('client'),
      '/product_requests': (r, J, i) => i.m === 'POST' ? (inserts.push(1), r.fulfill({ status: 201, body: '' })) : J([]),
    } });
  await p.route(/supabase\.co\/storage\//, r => { uploads.push(1); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"x"}' }); });
  await p.goto(base + '/app/'); await wait(5000);
  dialogs.length = 0;
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="search-open"]'); await wait(300);
  await p.fill('#foodSearch', 'yogur griego'); await wait(600);
  await p.click('[data-action="rq-open"]'); await wait(300);
  await p.fill('[data-field="brand"]', 'Ser');
  const heic = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(64)]) };
  await p.setInputFiles('[data-action="rq-photo"][data-k="label"]:not([capture])', heic); await wait(800);
  t.eq(dialogs.slice(), ['No pudimos abrir esa foto (puede ser un formato no compatible, como HEIC). Sacala con el botón de la cámara o elegí otra.'], 'aviso al elegir la foto, con una salida');
  dialogs.length = 0;
  await p.click('[data-action="rq-send"]'); await wait(1500);
  t.ok(!dialogs.join(' | ').includes('Revisá tu conexión'), 'no culpa a la conexión');
  t.eq(dialogs.slice(), ['Falta la foto de la tabla nutricional (suele estar atrás del paquete).'], 'la foto rota no quedó guardada');
  t.eq([uploads.length, inserts.length], [0, 0], 'no se sube nada');
  t.eq(errs, [], 'errores de la página');
  await close();
}
