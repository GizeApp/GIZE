// Foto de perfil: antes de subirla se acomoda dentro del círculo (mover y agrandar). Se usa
// una foto vertical de prueba (arriba roja, al medio verde, abajo azul) para ver qué parte
// se sube de verdad.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const uploads = [];
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client') } });
  await p.route(/supabase\.co\/storage\/v1\/object\/avatars\//, r => { uploads.push(r.request().postDataBuffer()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"x"}' }); });
  await p.goto(base + '/app/'); await wait(2500);
  const png = Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 1200; const x = c.getContext('2d');
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, 400, 400); x.fillStyle = '#00ff00'; x.fillRect(0, 400, 400, 400); x.fillStyle = '#0000ff'; x.fillRect(0, 800, 400, 400);
    return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  const file = { name: 'vertical.png', mimeType: 'image/png', buffer: png };
  // Color del centro de la foto subida (se decodifica en la página).
  // supabase-js manda el archivo dentro de un formulario (multipart): se saca el JPEG de adentro.
  const jpeg = buf => { const a = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff])), z = buf.lastIndexOf(Buffer.from([0xff, 0xd9])); return a >= 0 && z > a ? buf.subarray(a, z + 2) : buf; };
  const center = async raw => p.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(img.width / 2, img.height / 2, 1, 1).data; return { w: img.width, h: img.height, rgb: [d[0], d[1], d[2]] }; }, jpeg(raw).toString('base64'));
  const main = rgb => rgb[0] > 180 && rgb[1] < 80 ? 'rojo' : rgb[1] > 180 && rgb[0] < 80 ? 'verde' : rgb[2] > 180 && rgb[0] < 80 ? 'azul' : JSON.stringify(rgb);

  await p.click('#nav-config'); await wait(500);
  const pick = '[data-action="avatar-pick"]';

  // 1) Cancelar: no sube nada.
  await p.setInputFiles(pick, file); await wait(600);
  t.ok(!!(await p.$('.crp .crp-stage')), 'se abre la pantalla para acomodar la foto');
  await p.click('.crp-cancel'); await wait(300);
  t.ok(!(await p.$('.crp')), 'Cancelar cierra la pantalla'); t.eq(uploads.length, 0, 'Cancelar no sube la foto');

  // 2) Sin tocar: queda el centro (verde), 320 × 320.
  await p.setInputFiles(pick, file); await wait(600);
  await p.click('.crp-ok'); await wait(1200);
  t.eq(uploads.length, 1, 'Usar foto la sube');
  if (uploads[0]){ const c = await center(uploads[0]); t.eq([c.w, c.h], [320, 320], 'tamaño de la foto subida'); t.eq(main(c.rgb), 'verde', 'sin moverla queda el centro'); }

  // 3) Arrastrada hacia abajo: queda la parte de arriba (roja).
  await p.setInputFiles(pick, file); await wait(600);
  const r = await (await p.$('.crp-stage')).boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + 20); await p.mouse.down();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height - 5, { steps: 8 }); await p.mouse.move(r.x + r.width / 2, r.y + r.height + 300, { steps: 8 }); await p.mouse.up();
  await p.click('.crp-ok'); await wait(1200);
  if (uploads[1]) t.eq(main((await center(uploads[1])).rgb), 'rojo', 'movida hacia abajo sube la parte de arriba');

  // 4) Agrandada al máximo con la barra y arrastrada hacia arriba: queda dentro del azul.
  await p.setInputFiles(pick, file); await wait(600);
  await p.fill('.crp-zoom input', '4'); await wait(100);
  const r2 = await (await p.$('.crp-stage')).boundingBox();
  await p.mouse.move(r2.x + r2.width / 2, r2.y + r2.height - 10); await p.mouse.down();
  await p.mouse.move(r2.x + r2.width / 2, r2.y - 2000, { steps: 20 }); await p.mouse.up();
  await p.click('.crp-ok'); await wait(1200);
  if (uploads[2]) t.eq(main((await center(uploads[2])).rgb), 'azul', 'agrandada y movida hacia arriba sube la parte de abajo');

  t.eq(dialogs, [], 'sin carteles de error');
  t.eq(errs, [], 'errores de la página');
  await close();
}
