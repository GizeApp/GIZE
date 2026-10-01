// Logos oficiales (brand/BRAND.md → «Logo»): la G con el orbe iridiscente. Cada apariencia muestra
// su marca en la barra de arriba y en el login («Oscuro»: G blanca y orbe original; «Claro»: G
// casi negra; «Azul» y «Rosa»: G blanca con el orbe de su paleta); los favicon, el manifest y los
// íconos apuntan a archivos que existen y son el logo nuevo (no la G con el punto azul); la
// landing usa la marca con orbe y su hoja de «Instalar» muestra el ícono; y el splash es el logo que aparece tranquilo, con los colores de
// cada apariencia, sale primero la marca y después el fondo, quieto con movimiento reducido, corto en
// el modo liviano y siempre se va.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = { days: [], sessions: [], weights: [], daily: {} };
const TEMAS = [
  // apariencia, marca, color de la G del splash, un color del orbe que tiene que estar, uno que no
  ['oscuro', 'gize-marca-blanca.svg', 'rgb(255, 255, 255)', 'rgb(224, 58, 174)', 'rgb(43, 63, 192)'],
  ['luz', 'gize-marca-negra.svg', 'rgb(11, 13, 17)', 'rgb(224, 58, 174)', 'rgb(43, 63, 192)'],
  ['azul', 'gize-marca-azul.svg', 'rgb(255, 255, 255)', 'rgb(43, 63, 192)', 'rgb(224, 58, 174)'],
  ['rosa', 'gize-marca-rosa.svg', 'rgb(255, 255, 255)', 'rgb(255, 79, 158)', 'rgb(224, 58, 174)'],
];
const init = (tema, lite = '0') => `localStorage.setItem('gize_lite','${lite}');${tema === 'oscuro' ? '' : "localStorage.setItem('gize_tema','" + tema + "');"}`;

// Imagen que se ve de verdad en un <img> (el content: url(…) de la apariencia, o su src).
const marcaDe = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null;
  const c = getComputedStyle(e).content; return /url\(/.test(c) ? c : e.getAttribute('src'); }, sel);

// Mide el splash apenas aparece.
const spy = () => {
  window.__t0 = performance.now();
  new MutationObserver((ms, o) => { const s = document.getElementById('splash'); if (!s) return; o.disconnect();
    const cs = q => { const e = s.querySelector(q); return e ? getComputedStyle(e) : null; };
    const marca = cs('.sp-marca'), ult = v => parseFloat(String(v).split(',').pop());
    window.__sp = { marca: !!s.querySelector('.sp-marca[role="img"][aria-label="GIZE"] .sp-orbe .sp-color'), luces: s.querySelectorAll('.sp-rayos, .sp-onda, .sp-luces, .sp-destello').length,
      viejo: !!s.querySelector('.sp-icon, .splash-logo, .sp-glass, .sl-dot'), bg: getComputedStyle(s).backgroundColor,
      arc: cs('.sp-arco') && cs('.sp-arco').stroke, dash: cs('.sp-arco') && cs('.sp-arco').strokeDashoffset, color: cs('.sp-color') && cs('.sp-color').backgroundImage,
      anims: ['.sp-orbe', '.sp-arco', '.sp-halo'].map(q => cs(q) && cs(q).animationName),
      out: getComputedStyle(s).animationName, outDelay: parseFloat(getComputedStyle(s).animationDelay), outDur: parseFloat(getComputedStyle(s).animationDuration),
      exit: marca && marca.animationName.split(',').pop().trim(), exitEnd: marca && ult(marca.animationDelay) + ult(marca.animationDuration) };
    new MutationObserver((m2, o2) => { if (document.getElementById('splash')) return; o2.disconnect(); window.__gone = performance.now() - window.__t0; })
      .observe(document.body, { childList: true, subtree: true });
  }).observe(document, { childList: true, subtree: true });
};

// Píxeles de un PNG (en el navegador): ¿la G blanca y el orbe con turquesa y magenta?
const iconoNuevo = (p, url) => p.evaluate(async u => {
  const im = new Image(); im.src = u; await im.decode();
  const c = document.createElement('canvas'); c.width = c.height = 200; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 200, 200);
  const px = (a, b) => [...x.getImageData(a, b, 1, 1).data];
  // Orbe del logo «Oscuro»: centro en (56,9 % ; 50 %), radio 6,2 %.
  const orbe = []; for (let dx = -10; dx <= 10; dx += 2) for (let dy = -10; dy <= 10; dy += 2) orbe.push(px(114 + dx, 100 + dy));
  const teal = orbe.some(([r, g, b]) => g > 150 && b > 130 && r < 110), magenta = orbe.some(([r, g, b]) => r > 150 && b > 120 && g < 110);
  const [r, g, b] = px(55, 100); // el arco de la G, a la izquierda
  return { teal, magenta, gBlanca: r > 240 && g > 240 && b > 240, fondo: px(4, 4).slice(0, 3).join(',') };
}, url);

export default async function ({ base, t }){
  // 1) Archivos: los logos oficiales y las marcas existen, y todo lo que se referencia también.
  const L = n => path.join(ROOT, 'brand/logo', n);
  for (const n of ['oscuro', 'claro', 'azul', 'rosa']) t.ok(fs.existsSync(L('gize-logo-' + n + '.svg')) && fs.existsSync(L('gize-logo-' + n + '.png')), 'logo oficial ' + n + ' (SVG y PNG)');
  for (const n of ['blanca', 'negra', 'azul', 'rosa']){
    const s = fs.existsSync(L('gize-marca-' + n + '.svg')) ? fs.readFileSync(L('gize-marca-' + n + '.svg'), 'utf8') : '';
    t.ok(s.includes('M81.53,62.74 A34,34 0 1 1 67,20.55') && (s.match(/<radialGradient/g) || []).length >= 8 && !/#2FA0FF/i.test(s), 'marca ' + n + ': la G con el orbe de degradés');
  }
  t.ok(fs.existsSync(L('gize-marca-negra.svg')) && /stroke="#0B0D11"/.test(fs.readFileSync(L('gize-marca-negra.svg'), 'utf8')), 'marca negra: la G casi negra');
  const archivos = ['index.html', 'app/index.html', 'admin/index.html', 'admin/admin.js', 'privacidad/index.html', 'install.js', 'sw.js', 'manifest.json', 'landing.js',
    ...['app/screens', 'app/ui', 'app/screens/coach', 'css/ui', 'css/core', 'css/screens'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => /\.(js|css)$/.test(f)).map(f => d + '/' + f))];
  const faltan = [], viejos = [];
  for (const f of archivos){
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/(?:brand\/(?:logo|mail)\/[\w.-]+\.(?:svg|png)|(?:icon-(?:192|512|maskable-512)|apple-touch-icon)\.png)/g))
      if (!fs.existsSync(path.join(ROOT, m[0]))) faltan.push(f + ' → ' + m[0]);
    if (/gize-monograma(-oscuro)?\.svg|gize-icono-(negro|vidrio)|r="9\.5" fill="#2FA0FF"/.test(s)) viejos.push(f);
  }
  t.eq(faltan, [], 'todo logo o ícono referenciado existe');
  t.eq(viejos, [], 'nada usa la G vieja (monograma con el punto azul)');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  t.ok(man.icons.length >= 3 && man.icons.every(i => fs.existsSync(path.join(ROOT, i.src))), 'manifest: los íconos existen');
  for (const f of ['supabase/mails/confirmacion.html', 'supabase/mails/recuperar.html'])
    t.ok(fs.readFileSync(path.join(ROOT, f), 'utf8').includes('https://gize.ar/brand/mail/gize-logo.png') && fs.existsSync(path.join(ROOT, 'brand/mail/gize-logo.png')), f + ': el logo nuevo');

  // 2) Íconos: la G blanca con el orbe (turquesa y magenta) sobre negro, no el punto azul.
  let pg = await newPage({});
  await pg.p.goto(base + '/privacidad/');
  for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'brand/logo/gize-icono.png', 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png']){
    const v = await iconoNuevo(pg.p, base + '/' + f);
    t.eq(v, { teal: true, magenta: true, gBlanca: true, fondo: '0,0,0' }, f + ': el logo «Oscuro»');
  }
  // Favicon de cada página: el PNG del ícono nuevo.
  for (const u of ['/', '/app/', '/admin/', '/privacidad/']){
    await pg.p.goto(base + u, { waitUntil: 'domcontentloaded' });
    const href = await pg.p.evaluate(() => { const l = document.querySelector('link[rel="icon"]'); return l && l.href; });
    t.ok(/\/icon-192\.png$/.test(href || ''), u + ': favicon con el ícono nuevo: ' + href);
  }
  await pg.close();

  // 3) Landing: la marca (#g-mono) con el orbe, en el encabezado, y los degradés definidos.
  pg = await newPage({});
  await pg.p.goto(base + '/'); await wait(300);
  const land = await pg.p.evaluate(() => {
    const sym = document.getElementById('g-mono'), fills = sym ? [...sym.querySelectorAll('[fill^="url(#"]')].map(e => e.getAttribute('fill').slice(5, -1)) : [];
    return { orbe: fills.length >= 8 && fills.every(id => document.getElementById(id)), punto: !!(sym && sym.querySelector('circle[fill="#2FA0FF"]')),
      nav: !!document.querySelector('header .logo use[href="#g-mono"]') };
  });
  t.eq(land, { orbe: true, punto: false, nav: true }, 'landing: la marca con el orbe en el encabezado');
  // La hoja de «Instalar» (install.js): el ícono nuevo, cargado (desde la landing pedía app/icon-192.png).
  await pg.p.click('header [data-install]'); await wait(500);
  t.ok(await pg.p.evaluate(async () => { const i = document.querySelector('.gi-head img'); if (!i) return false; await i.decode().catch(() => {});
    return i.naturalWidth > 0 && /\/icon-192\.png$/.test(i.src); }), 'landing: la hoja de instalar muestra el ícono nuevo');
  t.eq(pg.errs, [], 'landing: errores de la página');
  await pg.close();

  // 4) Cada apariencia: su marca en el login y en la barra de arriba; su splash.
  for (const [tema, marca, g, si, no] of TEMAS){
    pg = await newPage({ init: init(tema) });
    await pg.p.goto(base + '/app/'); await wait(2400);
    t.ok(new RegExp(marca.replace('.', '\\.')).test(await marcaDe(pg.p, '.auth-brand-ic img') || ''), tema + ': la marca del login es ' + marca);
    t.eq(pg.errs, [], tema + ': errores (login)');
    await pg.close();

    pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: init(tema) });
    await pg.p.addInitScript(spy);
    await pg.p.goto(base + '/app/');
    await pg.p.waitForFunction(() => window.__sp, null, { timeout: 3000 }).catch(() => {});
    const sp = await pg.p.evaluate(() => window.__sp || {});
    t.eq([sp.marca, sp.luces, sp.viejo, sp.arc], [true, 0, false, g], tema + ': el splash es el logo tranquilo (la G y el orbe, sin rayos ni ondas)');
    t.ok((sp.color || '').includes(si) && !(sp.color || '').includes(no), tema + ': el orbe del splash con su paleta: ' + sp.color);
    t.eq(sp.anims, ['sp-orbe', 'sp-trazo', 'sp-respira'], tema + ': aparece animado (el orbe, la G que se traza y el resplandor que respira)');
    t.ok(sp.out === 'splash-out' && sp.exit === 'sp-exit' && sp.exitEnd <= sp.outDelay + 0.001 && sp.outDelay + sp.outDur <= 3.05 + 0.001,
      tema + ': sale primero la marca y después el fondo, en 3 s: ' + JSON.stringify([sp.exitEnd, sp.outDelay]));
    await pg.p.waitForFunction(() => window.__gone, null, { timeout: 7000 }).catch(() => {});
    const gone = await pg.p.evaluate(() => window.__gone);
    t.ok(gone > 2700 && gone < 5000 && await pg.p.evaluate(() => !document.body.classList.contains('is-booting')), tema + ': el splash se va (' + Math.round(gone) + ' ms)');
    await wait(300);
    t.ok(new RegExp(marca.replace('.', '\\.')).test(await marcaDe(pg.p, '.topbar img.brand-logo') || ''), tema + ': la marca de la barra de arriba es ' + marca);
    t.eq(pg.errs, [], tema + ': errores (app)');
    await pg.close();
  }

  // 5) Modo liviano: la marca ya armada y quieta, y el splash se va enseguida.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: init('oscuro', '1') });
  await pg.p.addInitScript(spy);
  await pg.p.goto(base + '/app/');
  await pg.p.waitForFunction(() => window.__gone, null, { timeout: 5000 }).catch(() => {});
  let sp = await pg.p.evaluate(() => window.__sp || {});
  let gone = await pg.p.evaluate(() => window.__gone);
  t.eq([sp.marca, sp.dash, sp.anims], [true, '0px', ['none', 'none', 'none']], 'liviano: la marca completa y quieta');
  t.ok(sp.exitEnd <= sp.outDelay + 0.001 && sp.outDelay + 0.25 <= 0.9, 'liviano: sale primero la marca, todo en menos de 0,9 s: ' + JSON.stringify([sp.exitEnd, sp.outDelay]));
  t.ok(gone && gone < 1600, 'liviano: el splash se va enseguida (' + Math.round(gone) + ' ms)');
  await pg.close();

  // 6) Movimiento reducido: la marca quieta y el splash se va.
  pg = await newPage({ reducedMotion: 'reduce', user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: init('rosa') });
  await pg.p.addInitScript(spy);
  await pg.p.goto(base + '/app/');
  await pg.p.waitForFunction(() => window.__gone, null, { timeout: 5000 }).catch(() => {});
  sp = await pg.p.evaluate(() => window.__sp || {});
  gone = await pg.p.evaluate(() => window.__gone);
  t.eq([sp.marca, sp.dash, sp.anims], [true, '0px', ['none', 'none', 'none']], 'movimiento reducido: la marca completa y quieta');
  t.ok(gone && gone < 1600, 'movimiento reducido: el splash se va (' + Math.round(gone) + ' ms)');
  await pg.close();
}
