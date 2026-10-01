// Genera los logos oficiales de GIZE en vector (brand/logo/) a partir de una sola definición:
// la G (el mismo arco de siempre) y el ORBE, la esfera iridiscente que hace de punto.
//   gize-logo-oscuro.svg  G blanca sobre negro, orbe original (el logo por defecto, el de Instagram)
//   gize-logo-claro.svg   G casi negra sobre blanco, mismo orbe
//   gize-logo-azul.svg    G blanca sobre marino #030814, orbe con la paleta «Azul»
//   gize-logo-rosa.svg    G blanca sobre ciruela #14060F, orbe con la paleta «Rosa»
//   gize-marca-blanca.svg / gize-marca-negra.svg / gize-marca-azul.svg / gize-marca-rosa.svg
//                         solo la marca (G + orbe), fondo transparente, para usar dentro de la app
//   gize-firma-horizontal[-oscuro|-azul|-rosa].svg  la marca + la palabra GIZE
//   gize-logotipo-oscuro.svg  la palabra sola en casi negro (para «Claro»)
// los PNG de los mails (brand/mail/)
// y los PNG de 1080 × 1080 de «Azul» y «Rosa» (los de «Oscuro» y «Claro» son los originales del
// dueño de la marca: gize-logo-oscuro.png y gize-logo-claro.png, no se pisan).
// Uso (Playwright con Chromium solo para los PNG, ver tests/README.md):
//   PW=/ruta/a/playwright/index.mjs node scripts/logos.mjs [carpeta para PNG de 2048]
// El orbe es puro degradé (sin filtros): se dibuja igual de rápido en cualquier celular y se ve
// nítido de 16 px a 2048 px.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'brand/logo');

// La G: mismo arco de siempre (caja de 100 u). El orbe va en el lugar del punto.
export const ARC = 'M81.53,62.74 A34,34 0 1 1 67,20.55';
export const ORB = { cx: 60.6, cy: 50, r: 9.6 };

// Paletas del orbe. Cada color va en un lugar de la esfera (en radios desde el centro):
// abajo a la izquierda (bi), izquierda (iz), arriba (ar), arriba a la derecha (ad), derecha (de),
// el centro claro (nu) y la sombra del borde (so). halo = colores del resplandor de alrededor.
export const PALETAS = {
  original: { bi: '#1BCDB6', iz: '#45C0E2', ar: '#6E8EF4', ad: '#9A55EE', de: '#E03AAE', nu: '#CBCCF2', base: '#9AA2E0', so: '#100A26',
    halo: ['#22C6C8', '#5468E8', '#D23CB4'] },
  azul: { bi: '#29C2EC', iz: '#3FA3F2', ar: '#5B7CF2', ad: '#8E5CF5', de: '#2B3FC0', nu: '#C8D8FA', base: '#7D9BEA', so: '#0A1033',
    halo: ['#29C2EC', '#3F7FF2', '#8E5CF5'] },
  rosa: { bi: '#FF8CBE', iz: '#FF4F9E', ar: '#DE6CEA', ad: '#B84CF0', de: '#E23DB4', nu: '#F4C6E6', base: '#DE78C0', so: '#3A0A26',
    halo: ['#FF7DB8', '#D65CF5', '#E84DBE'] },
};

// Defs + dibujo del orbe (y su resplandor) en coordenadas de la caja de 100 u. `p` = prefijo
// para que los id no choquen si hay varios en la misma página.
export function orbe(p, pal, { halo = 1, haloSobre = 'oscuro' } = {}){
  const { cx, cy, r } = ORB;
  const at = (dx, dy) => `cx="${(cx + dx * r).toFixed(2)}" cy="${(cy + dy * r).toFixed(2)}"`;
  const blob = (id, c, dx, dy, rr, a = 1) =>
    `<radialGradient id="${p}${id}" gradientUnits="userSpaceOnUse" ${at(dx, dy)} r="${(rr * r).toFixed(2)}">` +
    `<stop offset="0" stop-color="${c}" stop-opacity="${a}"/><stop offset=".45" stop-color="${c}" stop-opacity="${(a * .72).toFixed(2)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  const ha = haloSobre === 'claro' ? .55 : 1; // sobre blanco el resplandor es más pálido
  const haloG = (id, c, a, dx, dy) =>
    `<radialGradient id="${p}${id}" gradientUnits="userSpaceOnUse" ${at(dx, dy)} r="${(r * 2.2).toFixed(2)}">` +
    `<stop offset=".3" stop-color="${c}" stop-opacity="${(a * ha).toFixed(3)}"/><stop offset=".52" stop-color="${c}" stop-opacity="${(a * .45 * ha).toFixed(3)}"/>` +
    `<stop offset=".76" stop-color="${c}" stop-opacity="${(a * .12 * ha).toFixed(3)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  const defs =
    `<radialGradient id="${p}b" gradientUnits="userSpaceOnUse" ${at(-.1, -.15)} r="${(r * 1.1).toFixed(2)}"><stop offset="0" stop-color="${pal.nu}"/><stop offset="1" stop-color="${pal.base}"/></radialGradient>` +
    blob('c1', pal.bi, -.55, .55, 1.0) + blob('c2', pal.iz, -.75, -.1, .85) + blob('c3', pal.ar, -.15, -.85, .9) +
    blob('c4', pal.ad, .6, -.55, .95) + blob('c5', pal.de, .72, .3, .88) +
    `<radialGradient id="${p}n" gradientUnits="userSpaceOnUse" ${at(-.05, -.1)} r="${(r * .55).toFixed(2)}"><stop offset="0" stop-color="${pal.nu}" stop-opacity=".6"/><stop offset="1" stop-color="${pal.nu}" stop-opacity="0"/></radialGradient>` +
    // Sombra del borde, más fuerte abajo (la luz viene de arriba a la izquierda).
    `<radialGradient id="${p}s" gradientUnits="userSpaceOnUse" ${at(-.1, -.42)} r="${(r * 1.45).toFixed(2)}"><stop offset=".6" stop-color="${pal.so}" stop-opacity="0"/><stop offset=".84" stop-color="${pal.so}" stop-opacity=".28"/><stop offset="1" stop-color="${pal.so}" stop-opacity=".7"/></radialGradient>` +
    `<radialGradient id="${p}k" gradientUnits="userSpaceOnUse" ${at(0, 0)} r="${r}"><stop offset=".78" stop-color="${pal.so}" stop-opacity="0"/><stop offset="1" stop-color="${pal.so}" stop-opacity=".22"/></radialGradient>` +
    // Brillo suave alrededor del reflejo y el reflejo blanco.
    `<radialGradient id="${p}h" gradientUnits="userSpaceOnUse" ${at(-.4, -.45)} r="${(r * .6).toFixed(2)}"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${p}e"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".0"/></radialGradient>` +
    haloG('g1', pal.halo[0], .3, -.4, .15) + haloG('g2', pal.halo[1], .12, 0, -.4) + haloG('g3', pal.halo[2], .26, .4, .1);
  const R = (r * 2.2).toFixed(2), c = `r="${r}"`;
  const glow = halo ? `<g class="o-halo" opacity="${halo}">` +
    `<circle ${at(-.4, .15)} r="${R}" fill="url(#${p}g1)"/><circle ${at(0, -.4)} r="${R}" fill="url(#${p}g2)"/><circle ${at(.4, .1)} r="${R}" fill="url(#${p}g3)"/></g>` : '';
  const body = `<g class="o-esfera"><circle ${at(0, 0)} ${c} fill="url(#${p}b)"/>` +
    ['c1', 'c2', 'c3', 'c4', 'c5'].map(k => `<circle ${at(0, 0)} ${c} fill="url(#${p}${k})"/>`).join('') +
    `<circle ${at(0, 0)} ${c} fill="url(#${p}n)"/><circle ${at(0, 0)} ${c} fill="url(#${p}s)"/><circle ${at(0, 0)} ${c} fill="url(#${p}k)"/><circle ${at(0, 0)} ${c} fill="url(#${p}h)"/>` +
    `<ellipse cx="${(cx - .39 * r).toFixed(2)}" cy="${(cy - .47 * r).toFixed(2)}" rx="${(r * .2).toFixed(2)}" ry="${(r * .125).toFixed(2)}" transform="rotate(-24 ${(cx - .39 * r).toFixed(2)} ${(cy - .47 * r).toFixed(2)})" fill="url(#${p}e)"/></g>`;
  return { defs, glow, body };
}

const svg = (vb, inner, defs) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><defs>${defs}</defs>${inner}</svg>\n`;

// Marca sola (caja de 100 u, fondo transparente).
export function marca(color, pal, op = {}){
  const o = orbe('o', pal, op);
  return svg('0 0 100 100', o.glow + `<path d="${ARC}" fill="none" stroke="${color}" stroke-width="20" stroke-linecap="round"/>` + o.body, o.defs);
}

// Logo cuadrado con fondo: la marca ocupa `k` del lado (65 % como el original), centrada.
export function logo(bg, color, pal, { k = .651, halo = 1, haloSobre = 'oscuro', vineta } = {}){
  const o = orbe('o', pal, { halo, haloSobre });
  const s = 100 / k, m = (s - 100) / 2;
  // Viñeta muy suave detrás de la marca (como en el original): apenas más claro en el centro.
  const v = vineta ? `<radialGradient id="v" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${vineta}"/><stop offset="1" stop-color="${bg}"/></radialGradient>` : '';
  return svg(`${-m} ${-m} ${s} ${s}`,
    `<rect x="${-m}" y="${-m}" width="${s}" height="${s}" fill="${vineta ? 'url(#v)' : bg}"/>` + o.glow +
    `<path d="${ARC}" fill="none" stroke="${color}" stroke-width="20" stroke-linecap="round"/>` + o.body, v + o.defs);
}

// Firma horizontal: la marca + la palabra GIZE (Bigger Display en curvas, igual que
// gize-logotipo.svg). Símbolo 100 u, aire 44 u, altura de mayúscula 74 u (brand/BRAND.md).
const PALABRA = color => `<g transform="translate(143.01,87.00) scale(0.09427,-0.09427)" fill="${color}"><path transform="translate(0.0,0)" d="M357.5 648.2001953125C357.5 732.0 289.5 800.0 205.7001953125 800.0H162.2998046875C78.5 800.0 10.5 732.0 10.5 648.2001953125V130.900390625C10.5 107.599609375 15.099609375 85.2998046875 23.5 65.0C42.5 18.7998046875 87.599609375 -1.599609375 130.5 -1.599609375C167.599609375 -1.599609375 202.900390625 14.2998046875 218.7001953125 41.599609375H230.7001953125L221.0 13.099609375H357.5V469.599609375H196.0V330.7998046875H218.7001953125V171.7001953125C218.7001953125 153.2998046875 204.400390625 138.2998046875 186.2998046875 137.099609375C166.2001953125 135.7998046875 149.2998046875 152.400390625 149.2998046875 172.599609375V625.900390625C149.2998046875 644.900390625 164.2001953125 660.7998046875 183.099609375 661.2998046875C193.0 661.5 202.0 657.599609375 208.5 651.099609375C214.7998046875 644.900390625 218.7001953125 636.2001953125 218.7001953125 626.599609375V551.099609375H357.5Z"/><path transform="translate(391.6,0)" d="M10.6025390625 13.1298828125H149.3974609375V785.17578125H10.6025390625Z"/><path transform="translate(575.1,0)" d="M160.2998046875 164.900390625 344.5 646.400390625V785.2001953125H23.5V646.400390625H194.7998046875V633.400390625L10.5 150.599609375V13.099609375H357.5V151.900390625H160.2998046875Z"/><path transform="translate(966.7,0)" d="M147.7001953125 646.400390625H321.099609375V785.2001953125H8.900390625V13.099609375H321.099609375V151.900390625H147.7001953125V329.7998046875H298.400390625V468.5H147.7001953125Z"/></g>`;
export function firma(color, pal, op = {}){
  const o = orbe('o', pal, op);
  return svg('0 0 269.4 100', o.glow + `<path d="${ARC}" fill="none" stroke="${color}" stroke-width="20" stroke-linecap="round"/>` + o.body + PALABRA(color), o.defs);
}

export const LOGOS = {
  'gize-logo-oscuro': logo('#000000', '#FFFFFF', PALETAS.original, { vineta: '#05060A' }),
  'gize-logo-claro': logo('#FFFFFF', '#0B0D11', PALETAS.original, { k: .629, haloSobre: 'claro' }),
  'gize-logo-azul': logo('#030814', '#FFFFFF', PALETAS.azul, { vineta: '#0A1430' }),
  'gize-logo-rosa': logo('#14060F', '#FFFFFF', PALETAS.rosa, { vineta: '#26091C' }),
};
export const MARCAS = {
  'gize-marca-blanca': marca('#FFFFFF', PALETAS.original),
  'gize-marca-negra': marca('#0B0D11', PALETAS.original, { haloSobre: 'claro' }),
  'gize-marca-azul': marca('#FFFFFF', PALETAS.azul),
  'gize-marca-rosa': marca('#FFFFFF', PALETAS.rosa),
  'gize-firma-horizontal': firma('#FFFFFF', PALETAS.original),
  'gize-firma-horizontal-oscuro': firma('#0B0D11', PALETAS.original, { haloSobre: 'claro' }),
  'gize-firma-horizontal-azul': firma('#FFFFFF', PALETAS.azul),
  'gize-firma-horizontal-rosa': firma('#FFFFFF', PALETAS.rosa),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])){
  for (const [n, s] of Object.entries({ ...LOGOS, ...MARCAS })){ fs.writeFileSync(path.join(DIR, n + '.svg'), s); console.log('brand/logo/' + n + '.svg'); }
  // La palabra sola en casi negro, para «Claro» (gize-logotipo.svg es blanca).
  fs.writeFileSync(path.join(DIR, 'gize-logotipo-oscuro.svg'), fs.readFileSync(path.join(DIR, 'gize-logotipo.svg'), 'utf8').replace('fill="#FFFFFF"', 'fill="#0B0D11"'));
  console.log('brand/logo/gize-logotipo-oscuro.svg');
  const out = process.argv[2];
  const { chromium } = await import(process.env.PW || 'playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  const png = async (s, px, file) => {
    await p.setViewportSize({ width: px, height: px });
    await p.setContent(`<html><body style="margin:0">${s.replace('<svg ', `<svg width="${px}" height="${px}" style="display:block" `)}</body></html>`);
    await p.screenshot({ path: file, clip: { x: 0, y: 0, width: px, height: px } });
    console.log(path.relative(ROOT, file) || file);
  };
  await png(LOGOS['gize-logo-azul'], 1080, path.join(DIR, 'gize-logo-azul.png'));
  await png(LOGOS['gize-logo-rosa'], 1080, path.join(DIR, 'gize-logo-rosa.png'));
  // Mails (supabase/mails/*.html): el logo «Oscuro» con las puntas redondeadas (algunos clientes
  // de mail ignoran border-radius) y la firma sobre el gris de las tarjetas oscuras.
  {
    const MAIL = path.join(ROOT, 'brand/mail');
    for (const [n, px] of [['gize-logo.png', 192], ['gize-icono.png', 144]]){
      await p.setViewportSize({ width: px, height: px });
      await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${px}px;height:${px}px;border-radius:22.5%;overflow:hidden">${LOGOS['gize-logo-oscuro'].replace('<svg ', `<svg width="${px}" height="${px}" style="display:block" `)}</div></body></html>`);
      await p.screenshot({ path: path.join(MAIL, n), omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
      console.log('brand/mail/' + n);
    }
    await p.setViewportSize({ width: 720, height: 268 });
    await p.setContent(`<html><body style="margin:0;background:#0B0D11;display:grid;place-items:center;width:720px;height:268px">${MARCAS['gize-firma-horizontal'].replace('<svg ', '<svg width="510" height="189" ')}</body></html>`);
    await p.screenshot({ path: path.join(MAIL, 'gize-firma.png'), clip: { x: 0, y: 0, width: 720, height: 268 } });
    console.log('brand/mail/gize-firma.png');
  }
  if (out){
    fs.mkdirSync(out, { recursive: true });
    for (const [n, s] of Object.entries(LOGOS)){ await png(s, 2048, path.join(out, n + '-2048.png')); fs.writeFileSync(path.join(out, n + '.svg'), s); }
  }
  await b.close();
}
