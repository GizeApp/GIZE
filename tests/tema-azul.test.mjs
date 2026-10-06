// Apariencia «Azul» (html.tema-claro, css/ui/tema-claro.css; antes se llamaba «Claro»): es
// opcional. Sin elegirla la app se ve exactamente como siempre («Oscuro»); se elige en Ajustes
// del cliente y en la Configuración del coach, se aplica al toque, queda guardada en el
// dispositivo ("gize_tema" = "azul") y la clase ya está puesta antes de la primera pintada (sin
// parpadeo). Quien la eligió cuando se llamaba «Claro» (guardado "claro") la sigue viendo igual,
// con «Azul» marcado. El splash (el logo tranquilo, con el orbe en los colores de «Azul») se va
// solo y respeta movimiento reducido y modo liviano.
// Con la apariencia tranquila (css/ui/calma.css): el fondo de «Azul» es un degradé liso de marino
// (sin los círculos de color), el borde de las cajas es un filete fino y quieto con apenas un toque
// violeta y azul en las puntas (nada de conic-gradient ni de giro) y la sombra es neutra, sin
// resplandor de colores. La gama entera de «Azul» (azul, violeta, cian) sigue en las barras de
// progreso (--gize-rgb-line).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca', sets: [{ id: 's1', kg: '80', reps: '8', done: true }] }] }], sessions: [], weights: [], daily: {} };
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const COACH_H = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
};

// Valores del look de «Oscuro» (el tranquilo de css/ui/calma.css), con la misma medición.
const OSCURO = {
  body: 'rgb(0, 0, 0)',
  // Las cajas con un filete fino (relleno liso + el filete como border-box) en vez del borde RGB.
  card: 'linear-gradient(rgb(11, 13, 17), rgb(11, 13, 17)), linear-gradient(155deg, color(srgb 0.689655 0.431616 1 / 0.506078) 0%, rgba(255, 255, 255, 0.1) 28%, rgba(255, 255, 255, 0.08) 72%, color(srgb 0.30084 0.680672 1 / 0.373333) 100%)',
  cardFill: 'rgba(0, 0, 0, 0)', blur: 'none', logo: 'normal',
  // El filete de «Oscuro»: degradé lineal quieto, blanco fino con un toque del violeta (#A65CFF) y
  // del azul (#2FA0FF) de la gama en las puntas (nada de conic-gradient).
  ring: 'linear-gradient(155deg, color-mix(in srgb, #A65CFF 45%, rgba(255,255,255,.10)) 0%, rgba(255,255,255,.10) 28%, rgba(255,255,255,.08) 72%, color-mix(in srgb, #2FA0FF 32%, rgba(255,255,255,.08)) 100%)',
  // Sombra neutra (sin resplandor de colores) y el fondo en un degradé liso, sin círculos.
  shadow: 'rgba(0, 0, 0, 0.28) 0px 8px 22px 0px',
  aurora: 'linear-gradient(rgb(14, 20, 36) 0%, rgb(8, 11, 21) 38%, rgb(5, 7, 13) 100%)', manchas: 0,
  // La barra de abajo es la «nube» de vidrio oscuro (css/core/layout.css).
  nav: 'rgba(20, 24, 34, 0.64)',
};
const deOscuro = l => ({ body: l.body, card: l.card, cardFill: l.cardFill, blur: l.blur, logo: l.logo, ring: l.ring, shadow: l.shadow, aurora: l.aurora, manchas: l.manchas, nav: l.nav });

// Los colores de un valor de CSS, en canales de 0 a 255 (más el alfa si lo tiene): rgb()/rgba() y
// color(srgb …), que es como sale un color-mix() calculado (el toque de color del filete). Los
// transparentes no cuentan.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
// Los colores con tinte (no grises).
const tintes = v => colores(v).filter(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);
const conTinte = v => tintes(v).length > 0;
// ¿Azul o violeta? (el azul le saca mucho al rojo). ¿Rosa? (el rojo le saca mucho al verde y al azul).
const azules = v => colores(v).filter(([r, g, b]) => b > r + 60 && b >= g);
const rosados = v => colores(v).filter(([r, g, b]) => r > g + 60 && r > b);
// El filete tranquilo ya calculado (el ::after de la caja): un degradé lineal quieto (nada de
// conic-gradient), blanco fino en el medio y apenas un toque de color (dos tintes, bien
// transparentes) en las puntas.
const filete = v => /^linear-gradient\(155deg/.test(v || '') && !/conic-gradient/.test(v) && /rgba\(255, 255, 255, 0\.1\) 28%/.test(v)
  && tintes(v).length === 2 && tintes(v).every(c => c[3] !== undefined && c[3] < 0.6);

// Estilos clave de la pantalla actual (la de Ajustes tiene tarjetas .cfg-card).
const look = p => p.evaluate(() => {
  const cs = (s, pe) => { const e = document.querySelector(s); return e ? getComputedStyle(e, pe || null) : null; };
  const c = cs('.cfg-card'), borde = cs('.cfg-card', '::after'), logo = cs('#app img.brand-logo') || cs('img.brand-logo');
  const root = getComputedStyle(document.documentElement);
  return { claro: document.documentElement.classList.contains('tema-claro'), body: cs('body').backgroundColor,
    card: c && c.backgroundImage, cardFill: c && c.backgroundColor, blur: c && c.backdropFilter, shadow: c && c.boxShadow, logo: logo && logo.content,
    // El token del filete, con los espacios normalizados (sale tal cual está escrito en el CSS).
    ring: root.getPropertyValue('--gize-rgb-ring').trim().replace(/\s+/g, ' '),
    line: root.getPropertyValue('--gize-rgb-line').trim(),
    borde: borde && borde.backgroundImage, bordeGira: borde && borde.animationName,
    aurora: cs('.app-aurora') && cs('.app-aurora').backgroundImage,
    manchas: [...document.querySelectorAll('.app-aurora span')].filter(s => getComputedStyle(s).display !== 'none').length,
    nav: cs('.navbar') && cs('.navbar').backgroundColor,
    saved: localStorage.getItem('gize_tema'),
    on: [...document.querySelectorAll('[data-tema].on')].map(b => b.getAttribute('data-tema')) };
});

// Mide el splash apenas aparece y si la clase ya estaba puesta al terminar de leer el HTML.
const spy = () => {
  document.addEventListener('DOMContentLoaded', () => { window.__dcl = document.documentElement.classList.contains('tema-claro'); });
  new MutationObserver((ms, o) => { const s = document.getElementById('splash'); if (!s) return; o.disconnect();
    const cs = q => { const e = s.querySelector(q); return e ? getComputedStyle(e) : null; };
    const arc = cs('.sp-arco'), orbe = cs('.sp-orbe');
    window.__splash = { nuevo: !!s.querySelector('.sp-marca .sp-orbe .sp-color'), viejo: !!s.querySelector('.splash-logo, .sp-icon'),
      luces: s.querySelectorAll('.sp-rayos, .sp-onda, .sp-luces, .sp-destello').length, label: (s.querySelector('[aria-label]') || {}).getAttribute?.('aria-label'),
      arcStroke: arc && arc.stroke, orbAnim: orbe && orbe.animationName, arcAnim: arc && arc.animationName, halo: cs('.sp-halo') && cs('.sp-halo').animationName,
      dash: arc && arc.strokeDashoffset, color: cs('.sp-color') && cs('.sp-color').backgroundImage,
      blur: [...s.querySelectorAll('*')].filter(e => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).length };
  }).observe(document, { childList: true, subtree: true });
};

async function splashGone(p, ms){
  await p.waitForFunction(() => { const s = document.getElementById('splash'); return !s || getComputedStyle(s).visibility === 'hidden'; }, null, { timeout: ms }).catch(() => {});
  return p.evaluate(() => { const s = document.getElementById('splash'); return !s || getComputedStyle(s).visibility === 'hidden'; });
}

export default async function ({ base, t }){
  // 1) Por defecto: el look de siempre, el splash del logo con el orbe original, y «Oscuro» elegido.
  let pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => localStorage.setItem('gize_lite', '0') });
  await pg.p.addInitScript(spy);
  await pg.p.goto(base + '/app/');
  await pg.p.waitForFunction(() => window.__splash, null, { timeout: 3000 }).catch(() => {});
  let sp = await pg.p.evaluate(() => window.__splash || {});
  t.eq([sp.nuevo, sp.viejo, sp.luces, sp.arcStroke], [true, false, 0, 'rgb(255, 255, 255)'], 'por defecto (Oscuro): el splash del logo tranquilo (la G blanca y el orbe, sin rayos)');
  t.ok(/rgb\(224, 58, 174\)/.test(sp.color || '') && /rgb\(27, 205, 182\)/.test(sp.color || ''), 'por defecto (Oscuro): el orbe con los colores originales: ' + sp.color);
  t.eq([sp.orbAnim, sp.arcAnim, sp.halo], ['sp-orbe', 'sp-trazo', 'sp-respira'], 'por defecto (Oscuro): el splash aparece animado');
  t.eq(await pg.p.evaluate(() => window.__dcl), false, 'por defecto: sin html.tema-claro');
  t.ok(await splashGone(pg.p, 6000), 'por defecto: el splash se va');
  await wait(400);
  await pg.p.click('#nav-config'); await wait(500);
  let l = await look(pg.p);
  t.eq(deOscuro(l), OSCURO, 'por defecto: fondo liso, caja de sección con el filete y sombra neutra, logo y barra de «Oscuro»');
  t.ok(/^linear-gradient\(155deg/.test(l.ring) && !/conic-gradient/.test(l.ring), 'por defecto: el borde es el filete quieto, sin conic-gradient: ' + l.ring);
  t.eq(l.on, ['oscuro'], 'Ajustes: «Oscuro» elegido por defecto');
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('.cfg-seg [data-tema]')].map(b => b.textContent)), ['Oscuro', 'Claro', 'Azul', 'Rosa'], 'Ajustes: el selector Apariencia con Oscuro, Claro, Azul y Rosa');

  // 2) «Azul»: se aplica al toque, sin recargar.
  await pg.p.evaluate(() => { window.__sinRecargar = 1; });
  await pg.p.click('.cfg-seg [data-tema="azul"]'); await wait(150);
  l = await look(pg.p);
  t.ok(l.claro && await pg.p.evaluate(() => window.__sinRecargar === 1), 'Azul: html.tema-claro al toque, sin recargar');
  t.eq(l.saved, 'azul', 'Azul: queda guardado en el dispositivo');
  t.eq(l.on, ['azul'], 'Azul: queda marcada la opción');
  t.eq(l.body, 'rgb(3, 8, 20)', 'Azul: fondo azul marino');
  t.ok(/blur\(22px\)/.test(l.blur || ''), 'Azul: la caja de sección es vidrio (backdrop-filter): ' + l.blur);
  t.ok(/rgba\(255, 255, 255, 0\.19\)/.test(l.card || '') && l.card !== OSCURO.card, 'Azul: relleno de vidrio blanco translúcido: ' + l.card);
  t.ok(/^linear-gradient\(155deg/.test(l.ring) && !/conic-gradient/.test(l.ring) && /#A474F7/i.test(l.ring) && /#3FA3F2/i.test(l.ring)
    && !/#A65CFF|#2FA0FF|#FF3DAE/i.test(l.ring), 'Azul: el filete con el toque violeta y azul de Azul (no el de Oscuro), sin conic-gradient: ' + l.ring);
  t.ok(filete(l.borde) && l.bordeGira === 'none' && azules(l.borde).length === 2 && !rosados(l.borde).length, 'Azul: el borde de la caja es el filete fino y quieto, con apenas un toque violeta y azul: ' + l.borde);
  t.ok(l.shadow && l.shadow !== 'none' && !conTinte(l.shadow), 'Azul: la caja con una sombra neutra, sin resplandor de colores: ' + l.shadow);
  t.ok(/#3FA3F2/i.test(l.line) && /#A474F7/i.test(l.line) && /#2EC6EE/i.test(l.line) && !/#FF3DAE/i.test(l.line), 'Azul: la gama de Azul (azul, violeta, cian) sigue en las barras de progreso: ' + l.line);
  t.ok(/gize-marca-azul\.svg/.test(l.logo || ''), 'Azul: el logo «Azul» (G blanca, orbe azul): ' + l.logo);
  t.ok(/^linear-gradient\(rgb\(13, 27, 58\) 0%, rgb\(8, 17, 41\) 40%, rgb\(3, 8, 20\) 100%\)$/.test(l.aurora || '') && !/radial|vmax/.test(l.aurora) && l.manchas === 0,
    'Azul: el fondo es un degradé liso de marino, sin círculos ni manchas de color: ' + l.aurora);

  // 3) Queda al recargar, puesta antes de la primera pintada, con el splash nuevo que se va solo.
  const t0 = Date.now();
  await pg.p.reload();
  await pg.p.waitForFunction(() => window.__splash, null, { timeout: 3000 }).catch(() => {});
  sp = await pg.p.evaluate(() => window.__splash || {});
  t.eq(await pg.p.evaluate(() => window.__dcl), true, 'Azul: la clase ya está al terminar de leer el HTML (sin parpadeo)');
  t.eq([sp.nuevo, sp.viejo, sp.label, sp.arcStroke], [true, false, 'GIZE', 'rgb(255, 255, 255)'], 'Azul: splash del logo, con la G blanca');
  t.ok(/rgb\(43, 63, 192\)/.test(sp.color || '') && !/224, 58, 174/.test(sp.color || ''), 'Azul: el orbe con los colores de Azul: ' + sp.color);
  t.eq([sp.orbAnim, sp.arcAnim, sp.halo, sp.blur], ['sp-orbe', 'sp-trazo', 'sp-respira', 0], 'Azul: el splash aparece animado, sin backdrop-filter');
  t.ok(await splashGone(pg.p, 6000), 'Azul: el splash se va solo (' + (Date.now() - t0) + ' ms)');
  await wait(600);
  t.ok(await pg.p.evaluate(() => !document.getElementById('splash') && !document.body.classList.contains('is-booting')), 'Azul: el splash sale del DOM');
  await pg.p.click('#nav-config'); await wait(500);
  l = await look(pg.p);
  t.ok(l.claro && l.saved === 'azul', 'Azul: sigue después de recargar');
  t.eq(l.on, ['azul'], 'Azul: después de recargar, la opción marcada es Azul');

  // 4) Volver a «Oscuro» deja todo como siempre.
  await pg.p.click('.cfg-seg [data-tema="oscuro"]'); await wait(150);
  l = await look(pg.p);
  t.eq([l.claro, l.saved], [false, null], 'Oscuro: se saca la clase y lo guardado');
  t.ok(l.shadow && !conTinte(l.shadow), 'Oscuro: al toque, la sombra de la caja ya es neutra: ' + l.shadow);
  // La sombra de la caja pasa con una transición (--duration-standard): se mide cuando terminó.
  await wait(600); l = await look(pg.p);
  t.eq(deOscuro(l), OSCURO,'Oscuro: vuelve su look (fondo liso, filete, sombra neutra, logo y barra)');
  t.eq(pg.errs, [], 'errores de la página (cliente)');
  await pg.close();

  // 5) Modo liviano con «Azul», guardado con el nombre viejo ("claro"): sin backdrop-filter en
  // ningún lado y splash quieto y corto; lo guardado pasa a "azul" y la opción marcada es Azul.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => { localStorage.setItem('gize_tema', 'claro'); localStorage.setItem('gize_lite', '1'); } });
  await pg.p.addInitScript(spy);
  const t1 = Date.now();
  await pg.p.goto(base + '/app/');
  await pg.p.waitForFunction(() => window.__splash, null, { timeout: 3000 }).catch(() => {});
  sp = await pg.p.evaluate(() => window.__splash || {});
  t.eq([sp.nuevo, sp.orbAnim, sp.arcAnim, sp.halo, sp.dash, sp.blur], [true, 'none', 'none', 'none', '0px', 0], 'liviano (Azul): la marca quieta, completa y sin desenfoque');
  t.ok(await splashGone(pg.p, 3000), 'liviano (Azul): el splash se va enseguida (' + (Date.now() - t1) + ' ms)');
  await wait(400);
  await pg.p.click('#nav-config'); await wait(500);
  l = await look(pg.p);
  t.ok(l.claro && l.blur === 'none', 'liviano (Azul): la caja de sección sin backdrop-filter: ' + l.blur);
  t.eq([l.saved, l.on], ['azul', ['azul']], 'guardado viejo "claro": pasa a "azul" y queda marcada Azul');
  t.ok(/rgb\(14, 22, 43\)/.test(l.card + ' ' + l.cardFill), 'liviano (Azul): vidrio casi sólido: ' + l.card + ' / ' + l.cardFill);
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).length), 0, 'liviano (Azul): ningún elemento con backdrop-filter');
  t.eq(pg.errs, [], 'errores de la página (liviano)');
  await pg.close();

  // 6) Movimiento reducido con «Azul» (guardado "claro"): la marca quieta y el splash se va.
  pg = await newPage({ reducedMotion: 'reduce', user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => { localStorage.setItem('gize_tema', 'claro'); localStorage.setItem('gize_lite', '0'); } });
  await pg.p.addInitScript(spy);
  await pg.p.goto(base + '/app/');
  await pg.p.waitForFunction(() => window.__splash, null, { timeout: 3000 }).catch(() => {});
  sp = await pg.p.evaluate(() => window.__splash || {});
  t.eq([sp.nuevo, sp.orbAnim, sp.arcAnim, sp.halo, sp.dash], [true, 'none', 'none', 'none', '0px'], 'movimiento reducido: la marca quieta y completa');
  t.ok(await splashGone(pg.p, 3000), 'movimiento reducido: el splash se va');
  t.eq(pg.errs, [], 'errores de la página (movimiento reducido)');
  await pg.close();

  // 7) Coach: el mismo selector en su Configuración.
  pg = await newPage({ user: COACH, handlers: COACH_H, init: () => localStorage.setItem('gize_lite', '0') });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('[data-coach="open-settings"]'); await wait(500);
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('#coachSheetHost .cs-tema [data-tema]')].map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))), ['Oscuro*', 'Claro', 'Azul', 'Rosa'], 'coach: Apariencia con Oscuro (elegido), Claro, Azul y Rosa');
  const bodyCoach = () => pg.p.evaluate(() => [document.documentElement.classList.contains('tema-claro'), getComputedStyle(document.body).backgroundColor, localStorage.getItem('gize_tema')]);
  t.eq(await bodyCoach(), [false, 'rgb(0, 0, 0)', null], 'coach: por defecto el look de siempre');
  await pg.p.click('#coachSheetHost [data-tema="azul"]'); await wait(150);
  t.eq(await bodyCoach(), [true, 'rgb(3, 8, 20)', 'azul'], 'coach: Azul se aplica y se guarda');
  t.ok(/blur/.test(await pg.p.evaluate(() => getComputedStyle(document.querySelector('.cp-ccard')).backdropFilter)), 'coach: la ventana de Configuración es vidrio');
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('#coachSheetHost .cs-tema .on')].map(b => b.textContent)), ['Azul'], 'coach: queda marcada Azul');
  await pg.p.click('#coachSheetHost [data-tema="oscuro"]'); await wait(150);
  t.eq(await bodyCoach(), [false, 'rgb(0, 0, 0)', null], 'coach: Oscuro vuelve al look de siempre');
  t.eq(pg.errs, [], 'errores de la página (coach)');
  await pg.close();
}
