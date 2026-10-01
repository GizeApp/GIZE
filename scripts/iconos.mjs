// Genera los íconos de la app (web, Android e iPhone) a partir de brand/logo/gize-icono.png
// (el logo oficial «Oscuro»: una copia de brand/logo/gize-logo-oscuro.png, ver brand/BRAND.md)
// y las pantallas de arranque nativas (splash de Android y de iPhone): el logo, quieto, en el
// centro de un fondo negro #000000.
// Uso (hace falta Playwright con Chromium, ver tests/README.md):
//   PW=/ruta/a/playwright/index.mjs node scripts/iconos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PW || 'playwright');
// El ícono viene de una imagen (brand/logo/gize-icono.png, 1080×1080: la G blanca con el orbe
// iridiscente, sobre negro). Para los íconos que el sistema recorta (círculo, gota…: maskable y
// adaptable de Android) va gize-icono-maskable.png, el mismo achicado al 78 % sobre negro: así la
// G y el orbe ocupan menos de la mitad del lado y entran enteros en la zona segura (el 66 % del
// centro en Android, el 80 % en los maskable de la web).
const png = n => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'brand/logo', n)).toString('base64');
const FULL = png('gize-icono.png'), MASK = png('gize-icono-maskable.png');
// Para los splash nativos: el ícono en el centro del fondo negro (su fondo ya es negro).
const FREE = `<img src="${FULL}" style="display:block;width:100%;height:100%">`;
const BG = '#000000';

// forma: 'full' (cuadrado entero), 'legacy' (cuadrado con margen, como el ícono viejo de
// Android), 'round' (círculo), 'solid' (solo el fondo).
const jobs = [
  ['icon-512.png', 512, FULL, 'full'], ['icon-192.png', 192, FULL, 'full'], ['apple-touch-icon.png', 180, FULL, 'full'],
  ['icon-maskable-512.png', 512, MASK, 'full'],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, FULL, 'full'],
];
for (const [d, px] of [['ldpi', 36], ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]){
  const dir = 'android/app/src/main/res/mipmap-' + d + '/';
  jobs.push([dir + 'ic_launcher.png', px, FULL, 'legacy'], [dir + 'ic_launcher_round.png', px, MASK, 'round'],
    [dir + 'ic_launcher_foreground.png', px, MASK, 'full'], [dir + 'ic_launcher_background.png', px, null, 'solid']);
}
// Splash nativos: mismo tamaño que los que había; el logo (con su fondo negro) ocupa un 40 % del
// lado corto, así la G queda en un 26 % (en iPhone la imagen cuadrada se recorta para llenar la
// pantalla: ahí un 28 %).
const RES = 'android/app/src/main/res';
for (const d of fs.readdirSync(path.join(ROOT, RES))){
  const f = path.join(RES, d, 'splash.png');
  if (d.startsWith('drawable') && fs.existsSync(path.join(ROOT, f))) jobs.push([f, null, FULL, 'splash', .4]);
}
for (const n of fs.readdirSync(path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset')))
  if (n.startsWith('Default') && n.endsWith('.png')) jobs.push(['ios/App/App/Assets.xcassets/Splash.imageset/' + n, null, FULL, 'splash', .28]);

// Ancho y alto de un PNG (leídos del encabezado, sin dependencias).
const pngSize = f => { const h = fs.readFileSync(path.join(ROOT, f)).subarray(16, 24); return [h.readUInt32BE(0), h.readUInt32BE(4)]; };

const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 1 });
for (const [out, px, src, shape, k] of jobs){
  if (shape === 'splash'){
    const [w, h] = pngSize(out), side = Math.round(Math.min(w, h) * k);
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:${BG};display:grid;place-items:center"><div style="width:${side}px;height:${side}px">${FREE}</div></body></html>`);
    await p.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    await p.screenshot({ path: path.join(ROOT, out), clip: { x: 0, y: 0, width: w, height: h } });
    console.log(out, w + 'x' + h);
    continue;
  }
  const m = shape === 'legacy' ? Math.round(px * 8 / 192) : 0; // mismo margen que el ícono anterior
  const inner = px - 2 * m;
  const box = shape === 'solid' ? `<div style="width:${px}px;height:${px}px;background:${BG}"></div>`
    : `<div style="width:${inner}px;height:${inner}px;margin:${m}px;overflow:hidden;${shape === 'round' ? 'border-radius:50%;' : ''}"><img src="${src}" style="display:block;width:${inner}px;height:${inner}px"></div>`;
  await p.setViewportSize({ width: px, height: px });
  await p.setContent(`<html><body style="margin:0;background:transparent">${box}</body></html>`);
  await p.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  // El ícono completo va sin transparencia (iPhone no la acepta); el redondo y el de margen, con.
  await p.screenshot({ path: path.join(ROOT, out), omitBackground: shape === 'legacy' || shape === 'round', clip: { x: 0, y: 0, width: px, height: px } });
  console.log(out, px + 'px');
}
await b.close();
