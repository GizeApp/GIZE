// Apariencia «Claro» (html.tema-luz, css/ui/tema-luz.css): la contracara de «Oscuro», blanca con
// texto oscuro. Es la segunda opción del selector Apariencia (Oscuro, Claro, Azul, Rosa), se
// aplica al toque, queda guardada ("gize_tema" = "luz") y la clase ya está antes de la primera
// pintada (sin parpadeo). Fondo claro, texto oscuro legible (contraste AA de todo el texto en
// Entreno, Comida, Ajustes y la lista de clientes del coach), botón principal negro con letras
// blancas, la G oscura y el splash sobre fondo claro. Quien tenía guardada la «Claro» vieja
// ("claro") sigue viendo «Azul» (el vidrio sobre marino), con «Azul» marcado. Anda con el neón
// apagado (negros y grises, sin gama) y con el modo liviano (sin desenfoques).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca', note: 'Bajá controlado', sets: [{ id: 's1', kg: '80', reps: '8', done: true }, { id: 's2', kg: '80', reps: '8' }] },
  { id: 'e2', name: 'Remo con barra', sets: [{ id: 's3', kg: '60', reps: '10' }] }] }], sessions: [], weights: [], daily: {} };
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const COACH_H = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
    if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
};
const LUZ_BG = 'rgb(244, 245, 248)', NAVY = 'rgb(3, 8, 20)', PLUM = 'rgb(20, 6, 15)', BLACK = 'rgb(0, 0, 0)';

// Contraste de todo el texto visible de la pantalla contra el fondo que tiene detrás (el primer
// color de fondo, o el color liso de un degradé, subiendo por los padres). Devuelve el mínimo y
// los que no llegan a 4,5 (AA). No cuenta el texto de campos vacíos (placeholder), lo
// deshabilitado ni lo que está transparente a propósito.
const contraste = p => p.evaluate(() => {
  const rgb = s => { const m = String(s).match(/rgba?\(([^)]*)\)/); if (!m) return null; const n = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: n[0], g: n[1], b: n[2], a: n[3] === undefined ? 1 : n[3] }; };
  const lum = c => [c.r, c.g, c.b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const fondo = e => {
    const capas = [];
    for (let x = e; x; x = x.parentElement) {
      const cs = getComputedStyle(x), img = cs.backgroundImage;
      const liso = /^linear-gradient\((rgba?\([^)]*\)), \1\)/.exec(img);
      if (liso) { capas.push(rgb(liso[1])); if (capas[capas.length - 1].a >= 1) break; }
      const c = rgb(cs.backgroundColor); if (c && c.a > 0) { capas.push(c); if (c.a >= 1) break; }
    }
    let base = rgb(getComputedStyle(document.body).backgroundColor);
    for (let i = capas.length - 1; i >= 0; i--) base = capas[i].a >= 1 ? capas[i] : mix(capas[i], base);
    return base;
  };
  const visible = e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false;
    for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < .95) return false; }
    return true; };
  const malos = []; let min = 99, n = 0;
  const els = [...document.querySelectorAll('body *')].filter(e => !['SCRIPT', 'STYLE', 'svg', 'SVG', 'OPTION'].includes(e.tagName) && !e.closest('svg')
    && [...e.childNodes].some(t => t.nodeType === 3 && t.textContent.trim()) && !e.closest('[disabled], [aria-hidden="true"], #splashHost'));
  const campos = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=range]), textarea')].filter(e => e.value);
  for (const e of els.concat(campos)) {
    if (!visible(e)) continue;
    const c = rgb(getComputedStyle(e).color); if (!c || c.a < .95) continue;
    const bg = fondo(e), L1 = lum(c), L2 = lum(bg), k = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    n++; if (k < min) min = k;
    if (k < 4.5) malos.push((e.textContent || e.value).trim().slice(0, 30) + ' (' + k.toFixed(2) + ')');
  }
  return { n, min: Math.round(min * 100) / 100, malos };
});

const look = p => p.evaluate(() => {
  const cs = (s, pe) => { const e = document.querySelector(s); return e ? getComputedStyle(e, pe || null) : null; };
  const c = document.documentElement.classList, card = cs('.cfg-card');
  return { luz: c.contains('tema-luz'), claro: c.contains('tema-claro'), rosa: c.contains('tema-rosa'), body: cs('body').backgroundColor, text: cs('body').color,
    saved: localStorage.getItem('gize_tema'), on: [...document.querySelectorAll('[data-tema].on')].map(b => b.getAttribute('data-tema')),
    logo: cs('img.brand-logo') && cs('img.brand-logo').content, card: card && card.backgroundImage, shadow: card && card.boxShadow,
    nav: cs('.navbar') && cs('.navbar').backgroundColor, meta: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content.toUpperCase()) };
});

// ¿Hay algún color con tinte (no gris) en este valor de CSS?
const conTinte = v => (String(v || '').match(/rgba?\([^)]*\)/g) || []).map(c => c.match(/[\d.]+/g).map(Number))
  .some(([r, g, b, a]) => (a === undefined || a > 0) && Math.max(r, g, b) - Math.min(r, g, b) > 24);

// Contraste de un color de letra sobre un color de fondo (rgb()).
const ratio = (a, b) => { const l = s => s.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const x = l(a), y = l(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

const spy = () => {
  document.addEventListener('DOMContentLoaded', () => { window.__dcl = document.documentElement.classList.contains('tema-luz'); });
  new MutationObserver((ms, o) => { const s = document.getElementById('splash'); if (!s) return; o.disconnect();
    const cs = q => { const e = s.querySelector(q); return e ? getComputedStyle(e) : null; };
    window.__splash = { marca: !!s.querySelector('.sp-marca .sp-orbe'), bg: getComputedStyle(s).backgroundColor, arc: cs('.sp-arco') && cs('.sp-arco').stroke,
      txt: cs('.splash-txt') && cs('.splash-txt').color, color: cs('.sp-color') && cs('.sp-color').backgroundImage,
      palabra: cs('.sp-palabra .sp-l') && cs('.sp-palabra .sp-l').fill, halo: cs('.sp-halo') && cs('.sp-halo').animationName };
  }).observe(document, { childList: true, subtree: true });
};

export default async function ({ base, t }){
  // 1) Ajustes: cuatro opciones; «Claro» se aplica al toque, sin recargar.
  let pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => localStorage.setItem('gize_lite', '0') });
  const p = pg.p;
  await p.addInitScript(spy);
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-config'); await wait(500);
  t.eq(await p.evaluate(() => [...document.querySelectorAll('.cfg-seg [data-tema]')].map(b => b.getAttribute('data-tema') + ':' + b.textContent)),
    ['oscuro:Oscuro', 'luz:Claro', 'azul:Azul', 'rosa:Rosa'], 'Ajustes: Oscuro, Claro, Azul y Rosa, en ese orden');
  await p.evaluate(() => { window.__sinRecargar = 1; });
  await p.click('.cfg-seg [data-tema="luz"]'); await wait(450);
  let l = await look(p);
  t.ok(l.luz && !l.claro && !l.rosa && await p.evaluate(() => window.__sinRecargar === 1), 'Claro: html.tema-luz al toque, sin recargar (y sin las clases de Azul)');
  t.eq([l.saved, l.on], ['luz', ['luz']], 'Claro: queda guardado ("luz") y marcado');
  t.eq([l.body, l.text], [LUZ_BG, 'rgb(11, 13, 17)'], 'Claro: fondo casi blanco y texto casi negro');
  t.ok(/gize-marca-negra\.svg/.test(l.logo || ''), 'Claro: la G oscura con el orbe: ' + l.logo);
  t.ok(/rgb\(255, 255, 255\)/.test(l.card || '') && /conic-gradient/.test(l.card), 'Claro: la caja blanca con el borde de neón: ' + l.card);
  t.eq(l.meta.every(m => m === '#F4F5F8'), true, 'Claro: la barra del sistema clara: ' + l.meta);
  let k = await contraste(p);
  t.ok(k.n > 10 && !k.malos.length, 'Ajustes: todo el texto con contraste AA (mín. ' + k.min + ', ' + k.n + ' textos): ' + k.malos.join(' | '));

  // 2) Queda al recargar, con la clase antes de la primera pintada y el splash claro.
  await p.reload();
  await p.waitForFunction(() => window.__splash, null, { timeout: 3000 }).catch(() => {});
  const sp = await p.evaluate(() => window.__splash || {});
  t.eq(await p.evaluate(() => window.__dcl), true, 'Claro: la clase ya está al terminar de leer el HTML (sin parpadeo)');
  t.eq([sp.marca, sp.bg, sp.arc], [true, LUZ_BG, 'rgb(11, 13, 17)'], 'Claro: splash del logo sobre fondo claro, con la G oscura');
  t.ok(/rgb\(224, 58, 174\)/.test(sp.color || '') && /rgb\(27, 205, 182\)/.test(sp.color || ''), 'Claro: el orbe del splash con los colores originales: ' + sp.color);
  t.ok(sp.txt && ratio(sp.txt, sp.bg) >= 4.5, 'Claro: el texto del splash se lee: ' + sp.txt);
  t.eq([sp.palabra, sp.halo], ['rgb(11, 13, 17)', 'sp-respira'], 'Claro: la palabra GIZE oscura y el resplandor del orbe que respira');
  await wait(2500);

  // 3) Entreno (ejercicio abierto): texto legible y la G oscura.
  await p.click('.ex-collapsed'); await wait(400);
  l = await look(p);
  t.eq([l.luz, l.saved, l.body], [true, 'luz', LUZ_BG], 'Claro: sigue después de recargar');
  k = await contraste(p);
  t.ok(k.n > 10 && !k.malos.length, 'Entreno: todo el texto con contraste AA (mín. ' + k.min + ', ' + k.n + ' textos): ' + k.malos.join(' | '));
  t.ok(/rgb\(255, 255, 255\)/.test(l.nav || '') || /255, 255, 255/.test(l.nav), 'Claro: la barra de abajo blanca: ' + l.nav);

  // 4) Comida y Cardio: texto legible; el botón principal negro con letras blancas.
  await p.click('#nav-comida'); await wait(600);
  k = await contraste(p);
  t.ok(k.n > 5 && !k.malos.length, 'Comida: todo el texto con contraste AA (mín. ' + k.min + ', ' + k.n + ' textos): ' + k.malos.join(' | '));
  await p.click('#nav-cardio'); await wait(600);
  const btn = await p.evaluate(() => { const b = getComputedStyle(document.querySelector('.ctrl.primary')); return { color: b.color, bg: (b.backgroundImage.match(/rgba?\([^)]*\)/) || [b.backgroundColor])[0], ring: b.backgroundImage }; });
  t.ok(ratio(btn.color, btn.bg) >= 7 && btn.color === 'rgb(255, 255, 255)', 'Cardio: el botón principal negro con letras blancas: ' + btn.color + ' sobre ' + btn.bg);
  t.ok(/conic-gradient/.test(btn.ring), 'Cardio: el botón principal con el anillo de neón');

  // 5) Pasar por las cuatro: cada una pone sus clases y su fondo.
  await p.click('#nav-config'); await wait(500);
  for (const [v, cls, bg] of [['azul', [false, true, false], NAVY], ['rosa', [false, true, true], PLUM], ['oscuro', [false, false, false], BLACK], ['luz', [true, false, false], LUZ_BG]]) {
    await p.click('.cfg-seg [data-tema="' + v + '"]'); await wait(150);
    l = await look(p);
    t.eq([[l.luz, l.claro, l.rosa], l.body, l.on], [cls, bg, [v]], 'selector: ' + v + ' pone sus clases y su fondo');
  }
  t.eq(pg.errs, [], 'errores de la página (cliente)');
  await pg.close();

  // 6) La «Claro» vieja ("claro" guardado): sigue el look de «Azul», con «Azul» marcado.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => { if (!sessionStorage.getItem('v')) { sessionStorage.setItem('v', 1); localStorage.setItem('gize_tema', 'claro'); } localStorage.setItem('gize_lite', '0'); } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-config'); await wait(500);
  l = await look(pg.p);
  t.eq([l.luz, l.claro, l.rosa, l.body], [false, true, false, NAVY], 'guardado viejo "claro": el look de Azul (vidrio sobre marino)');
  t.eq([l.saved, l.on], ['azul', ['azul']], 'guardado viejo "claro": pasa a "azul" y queda marcada Azul');
  t.ok(/gize-marca-azul\.svg/.test(l.logo || ''), 'guardado viejo "claro": el logo de Azul (no el oscuro): ' + l.logo);
  t.eq(pg.errs, [], 'errores de la página (guardado viejo)');
  await pg.close();

  // 7) Neón apagado con «Claro»: fondo claro, filetes negros finos y nada de la gama.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => { localStorage.setItem('gize_tema', 'luz'); localStorage.setItem('gize_neon', '0'); localStorage.setItem('gize_lite', '0'); } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-config'); await wait(500);
  l = await look(pg.p);
  t.ok(l.luz && await pg.p.evaluate(() => document.documentElement.classList.contains('sin-neon')), 'Claro sin neón: las dos clases');
  t.eq(l.body, LUZ_BG, 'Claro sin neón: fondo claro');
  t.ok(!/conic/.test(l.card || '') && /rgba\(11, 13, 17, 0\.13\)/.test(l.card || ''), 'Claro sin neón: el borde de la caja es un filete negro fino: ' + l.card);
  t.ok(!conTinte(l.card) && !conTinte(l.shadow), 'Claro sin neón: sin colores en la caja: ' + l.shadow);
  const flame = await pg.p.evaluate(() => [...document.querySelectorAll('#streakBtn .flame linearGradient[id$="o"] stop')].map(s => getComputedStyle(s).stopColor));
  t.ok(flame.length && !flame.some(conTinte) && !flame.includes('rgb(255, 255, 255)'), 'Claro sin neón: la llama gris (no blanca sobre blanco): ' + flame);
  k = await contraste(pg.p);
  t.ok(!k.malos.length, 'Claro sin neón: Ajustes con contraste AA (mín. ' + k.min + '): ' + k.malos.join(' | '));
  await pg.p.click('#nav-cardio'); await wait(600);
  const b2 = await pg.p.evaluate(() => { const b = getComputedStyle(document.querySelector('.ctrl.primary')); return [b.backgroundImage, b.color, b.animationName]; });
  t.ok(!/conic/.test(b2[0]) && b2[1] === 'rgb(255, 255, 255)' && b2[2] === 'none', 'Claro sin neón: el botón principal negro, sin anillo ni giro: ' + b2);
  t.eq(pg.errs, [], 'errores de la página (sin neón)');
  await pg.close();

  // 8) Modo liviano con «Claro»: ningún desenfoque, fondo claro y barra de abajo blanca sólida.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => { localStorage.setItem('gize_tema', 'luz'); localStorage.setItem('gize_lite', '1'); } });
  await pg.p.goto(base + '/app/'); await wait(2000);
  await pg.p.click('#nav-config'); await wait(500);
  l = await look(pg.p);
  t.eq([l.luz, l.body, l.nav], [true, LUZ_BG, 'rgb(255, 255, 255)'], 'liviano: fondo claro y barra de abajo blanca');
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).length), 0, 'liviano: ningún elemento con backdrop-filter');
  t.eq(await pg.p.evaluate(() => getComputedStyle(document.querySelector('.app-aurora span')).display), 'none', 'liviano: sin las manchas de la aurora (solo los brillos quietos)');
  k = await contraste(pg.p);
  t.ok(!k.malos.length, 'liviano: Ajustes con contraste AA (mín. ' + k.min + '): ' + k.malos.join(' | '));
  t.eq(pg.errs, [], 'errores de la página (liviano)');
  await pg.close();

  // 9) Coach: «Claro» desde su Configuración; la lista de clientes, legible.
  pg = await newPage({ user: COACH, handlers: COACH_H, init: () => localStorage.setItem('gize_lite', '0') });
  await pg.p.goto(base + '/app/'); await wait(3300);
  await pg.p.click('[data-coach="open-settings"]'); await wait(500);
  await pg.p.click('#coachSheetHost [data-tema="luz"]'); await wait(400);
  t.eq(await pg.p.evaluate(() => [document.documentElement.classList.contains('tema-luz'), getComputedStyle(document.body).backgroundColor, localStorage.getItem('gize_tema'),
    [...document.querySelectorAll('#coachSheetHost .cs-tema .on')].map(b => b.textContent)]), [true, LUZ_BG, 'luz', ['Claro']], 'coach: Claro se aplica, se guarda y queda marcada');
  k = await contraste(pg.p);
  t.ok(!k.malos.length, 'coach: Configuración con contraste AA (mín. ' + k.min + '): ' + k.malos.join(' | '));
  await pg.p.click('[data-coach="settings-cancel"]').catch(() => {}); await wait(400);
  await pg.p.evaluate(async () => { const s = document.getElementById('coachSheetHost'); if (s) s.innerHTML = ''; });
  await wait(200);
  t.ok(await pg.p.evaluate(() => /gize-firma-horizontal-oscuro\.svg/.test(getComputedStyle(document.querySelector('.co-brand .brand-logo')).content)), 'coach: el logo del panel, oscuro');
  k = await contraste(pg.p);
  t.ok(k.n > 5 && !k.malos.length, 'coach: la lista de clientes con contraste AA (mín. ' + k.min + ', ' + k.n + ' textos): ' + k.malos.join(' | '));
  t.eq(pg.errs, [], 'errores de la página (coach)');
  await pg.close();
}
