// Apariencia «Rosa» (html.tema-claro + html.tema-rosa, css/ui/tema-rosa.css): el mismo vidrio
// de «Azul» (la que antes se llamaba «Claro») con la paleta rosa. Es la cuarta opción del selector
// Apariencia (Ajustes del cliente y Configuración del coach, que entra en 320 px), se aplica al toque, queda guardada
// ("gize_tema" = "rosa") y las dos clases ya están antes de la primera pintada (sin parpadeo).
// Con la apariencia tranquila (css/ui/calma.css): fondo ciruela en un degradé liso (sin los
// círculos de color), el borde de las cajas es un filete fino y quieto con apenas un toque de
// orquídea y rosa en las puntas (nada de azul ni cian) y la sombra es neutra, sin resplandor de
// colores; el splash sigue con el orbe rosa. Pasar a «Azul» saca solo tema-rosa (vuelve el toque
// violeta y azul); pasar a «Oscuro», las dos. Anda con el neón apagado (blancos y grises) y con el
// modo liviano (sin desenfoques).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca', sets: [{ id: 's1', kg: '80', reps: '8', done: true }] }] }], sessions: [], weights: [], daily: {} };
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const COACH_H = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
};

const PLUM = 'rgb(20, 6, 15)', NAVY = 'rgb(3, 8, 20)', BLACK = 'rgb(0, 0, 0)';
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
// ¿Azul o cian? (el azul le saca mucho al rojo, o es un cian: verde y azul altos, rojo bajo). La orquídea no cuenta.
const azules = v => colores(v).filter(([r, g, b]) => (b > r + 60 && b >= g) || (g > r + 60 && b > r + 60));
// ¿Rosa u orquídea? (el rojo le saca mucho al verde).
const rosados = v => colores(v).filter(([r, g]) => r > g + 60);
// El filete tranquilo: un degradé lineal quieto (nada de conic-gradient), blanco fino en el medio y
// apenas un toque de color (dos tintes, bien transparentes) en las puntas.
const filete = v => /^linear-gradient\(155deg/.test(v || '') && !/conic-gradient/.test(v) && /rgba\(255, 255, 255, 0\.1\) 28%/.test(v)
  && tintes(v).length === 2 && tintes(v).every(c => c[3] !== undefined && c[3] < 0.6);
// El fondo tranquilo de «Rosa»: el degradé liso de ciruela (--gize-calm-bg), sin círculos ni manchas de color.
const fondoCiruela = v => /^linear-gradient\(rgb\(44, 13, 34\) 0%, rgb\(27, 8, 22\) 40%, rgb\(20, 6, 15\) 100%\)$/.test(v || '')
  && !/radial|vmax|rgba\(255, 95, 168/.test(v) && !azules(v).length;

// Estilos clave de la pantalla de Ajustes.
const look = p => p.evaluate(() => {
  const cs = (s, pe) => { const e = document.querySelector(s); return e ? getComputedStyle(e, pe || null) : null; };
  const c = cs('.cfg-card'), ring = cs('.cfg-card', '::after'), root = document.documentElement, logo = cs('img.brand-logo');
  return { claro: root.classList.contains('tema-claro'), rosa: root.classList.contains('tema-rosa'), body: cs('body').backgroundColor,
    ring: ring && ring.backgroundImage, ringGira: ring && ring.animationName, card: c && c.backgroundImage + ' ' + c.backgroundColor, blur: c && c.backdropFilter, shadow: c && c.boxShadow,
    aurora: cs('.app-aurora') && cs('.app-aurora').backgroundImage,
    manchas: [...document.querySelectorAll('.app-aurora span')].filter(s => getComputedStyle(s).display !== 'none').length, logo: logo && logo.content, nav: cs('.navbar') && cs('.navbar').backgroundColor,
    accent: cs('.cfg-seg-opt.on') && cs('.cfg-seg-opt.on').backgroundColor,
    meta: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content),
    saved: localStorage.getItem('gize_tema'), on: [...document.querySelectorAll('[data-tema].on')].map(b => b.getAttribute('data-tema')) };
});

// ¿Entran las cuatro opciones en su caja, cada una en un renglón, sin que la página se corra a los costados?
const entra = (p, grp, box) => p.evaluate(([grp, box]) => {
  const g = document.querySelector(grp); if (!g) return 'no está';
  const b = g.closest(box).getBoundingClientRect(), bs = [...g.querySelectorAll('[data-tema]')];
  // En un solo renglón: el texto no se parte (un rango del texto da un solo rectángulo).
  const malos = bs.filter(x => { const r = x.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(x);
    return r.left < b.left - 0.5 || r.right > b.right + 0.5 || x.scrollWidth > x.clientWidth + 1 || rg.getClientRects().length > 1; }).map(x => x.textContent);
  return { n: bs.length, malos, anchoPagina: document.documentElement.scrollWidth <= innerWidth };
}, [grp, box]);

const spy = () => {
  document.addEventListener('DOMContentLoaded', () => { const c = document.documentElement.classList; window.__dcl = [c.contains('tema-claro'), c.contains('tema-rosa')]; });
  new MutationObserver((ms, o) => { const s = document.getElementById('splash'); if (!s) return; o.disconnect();
    const cs = q => { const e = s.querySelector(q); return e ? getComputedStyle(e) : null; };
    window.__splash = { marca: !!s.querySelector('.sp-marca .sp-orbe'), bg: getComputedStyle(s).backgroundColor,
      arc: cs('.sp-arco') && cs('.sp-arco').stroke, color: cs('.sp-color') && cs('.sp-color').backgroundImage, halo: cs('.sp-halo') && cs('.sp-halo').backgroundImage,
      palabra: cs('.sp-palabra .sp-l') && cs('.sp-palabra .sp-l').fill, respira: cs('.sp-halo') && cs('.sp-halo').animationName };
  }).observe(document, { childList: true, subtree: true });
};

export default async function ({ base, t }){
  // 1) Ajustes del cliente: cuatro opciones; «Rosa» se aplica al toque, sin recargar.
  let pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => localStorage.setItem('gize_lite', '0') });
  await pg.p.addInitScript(spy);
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-config'); await wait(500);
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('.cfg-seg [data-tema]')].map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))), ['Oscuro*', 'Claro', 'Azul', 'Rosa'], 'Ajustes: Apariencia con Oscuro (elegido), Claro, Azul y Rosa');
  await pg.p.evaluate(() => { window.__sinRecargar = 1; });
  await pg.p.click('.cfg-seg [data-tema="rosa"]'); await wait(150);
  let l = await look(pg.p);
  t.ok(l.claro && l.rosa && await pg.p.evaluate(() => window.__sinRecargar === 1), 'Rosa: html.tema-claro + html.tema-rosa al toque, sin recargar');
  t.eq([l.saved, l.on], ['rosa', ['rosa']], 'Rosa: queda guardado y marcado');
  t.eq(l.body, PLUM, 'Rosa: fondo ciruela');
  t.ok(filete(l.ring) && l.ringGira === 'none' && rosados(l.ring).length === 2 && !azules(l.ring).length, 'Rosa: el borde de la caja es el filete fino y quieto, con apenas un toque de orquídea y rosa (nada de azul): ' + l.ring);
  t.ok(/blur\(22px\)/.test(l.blur || '') && /rgba\(255, 255, 255, 0\.19\)/.test(l.card || ''), 'Rosa: la caja es el mismo vidrio de Azul: ' + l.blur);
  t.ok(fondoCiruela(l.aurora) && l.manchas === 0, 'Rosa: el fondo es un degradé liso de ciruela, sin círculos ni manchas de color: ' + l.aurora);
  t.ok(/gize-marca-rosa\.svg/.test(l.logo || ''), 'Rosa: el logo «Rosa» (G blanca, orbe rosa): ' + l.logo);
  t.ok(!azules(l.nav).length && !azules(l.accent).length && l.shadow && l.shadow !== 'none' && !conTinte(l.shadow), 'Rosa: barra y opción elegida sin azul, y la caja con una sombra neutra, sin resplandor de colores: ' + [l.nav, l.accent, l.shadow].join(' / '));
  t.eq(l.meta.every(m => m.toUpperCase() === '#14060F'), true, 'Rosa: la barra del sistema en ciruela: ' + l.meta);

  // 2) Las cuatro opciones entran en 320 px.
  await pg.p.setViewportSize({ width: 320, height: 640 }); await wait(300);
  t.eq(await entra(pg.p, '.cfg-seg', '.cfg-card'), { n: 4, malos: [], anchoPagina: true }, 'Ajustes en 320 px: las cuatro opciones entran');
  t.eq(await pg.p.evaluate(() => { const d = document.querySelector('#cfgTemaLbl + .cfg-notif-desc'), rg = document.createRange(); rg.selectNodeContents(d);
    return new Set([...rg.getClientRects()].map(r => Math.round(r.top))).size; }), 1, 'Ajustes en 320 px: el selector no aprieta el texto de al lado («Solo en este dispositivo» en un renglón)');
  await pg.p.setViewportSize({ width: 390, height: 844 }); await wait(200);

  // 3) Queda al recargar, con las dos clases antes de la primera pintada y el splash rosa.
  await pg.p.reload();
  await pg.p.waitForFunction(() => window.__splash, null, { timeout: 3000 }).catch(() => {});
  const sp = await pg.p.evaluate(() => window.__splash || {});
  t.eq(await pg.p.evaluate(() => window.__dcl), [true, true], 'Rosa: las dos clases ya están al terminar de leer el HTML (sin parpadeo)');
  t.eq([sp.marca, sp.bg, sp.arc], [true, PLUM, 'rgb(255, 255, 255)'], 'Rosa: splash del logo sobre ciruela, con la G blanca');
  t.ok(/rgb\(255, 79, 158\)/.test(sp.color || '') && /rgb\(184, 76, 240\)/.test(sp.color || ''), 'Rosa: el orbe del splash rosa y orquídea: ' + sp.color);
  t.eq(azules(sp.color + ' ' + sp.halo), [], 'Rosa: nada de azul ni cian en el orbe ni en su resplandor');
  t.eq([sp.palabra, sp.respira], ['rgb(255, 255, 255)', 'sp-respira'], 'Rosa: la palabra GIZE blanca y el resplandor del orbe que respira');
  await wait(2500);
  await pg.p.click('#nav-config'); await wait(500);
  l = await look(pg.p);
  t.eq([l.claro, l.rosa, l.saved, l.on, l.body], [true, true, 'rosa', ['rosa'], PLUM], 'Rosa: sigue después de recargar');

  // 4) A «Azul»: se va solo tema-rosa y vuelven el toque de color y el fondo de Azul; a «Oscuro», las dos.
  await pg.p.click('.cfg-seg [data-tema="azul"]'); await wait(150);
  l = await look(pg.p);
  t.eq([l.claro, l.rosa, l.saved, l.on, l.body], [true, false, 'azul', ['azul'], NAVY], 'Azul: se saca tema-rosa y vuelve el marino');
  t.ok(filete(l.ring) && l.ringGira === 'none' && azules(l.ring).length === 2 && !rosados(l.ring).length, 'Azul: el filete vuelve con el toque violeta y azul de Azul (nada de rosa): ' + l.ring);
  t.ok(/^linear-gradient\(rgb\(13, 27, 58\) 0%/.test(l.aurora || '') && !/radial|vmax/.test(l.aurora) && l.manchas === 0, 'Azul: el fondo vuelve al degradé liso de marino: ' + l.aurora);
  t.eq(l.meta.every(m => m.toUpperCase() === '#030814'), true, 'Azul: la barra del sistema en marino');
  await pg.p.click('.cfg-seg [data-tema="oscuro"]'); await wait(150);
  l = await look(pg.p);
  t.eq([l.claro, l.rosa, l.saved, l.on, l.body], [false, false, null, ['oscuro'], BLACK], 'Oscuro: se sacan las dos clases y lo guardado');
  t.eq(pg.errs, [], 'errores de la página (cliente)');
  await pg.close();

  // 5) Neón apagado con «Rosa»: vidrio, pero filetes blancos y sombras neutras (como Azul sin neón);
  //    el fondo es el mismo degradé liso de ciruela.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => { localStorage.setItem('gize_tema', 'rosa'); localStorage.setItem('gize_neon', '0'); localStorage.setItem('gize_lite', '0'); } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-config'); await wait(500);
  l = await look(pg.p);
  const flame = await pg.p.evaluate(() => [...document.querySelectorAll('#streakBtn .flame stop')].map(s => getComputedStyle(s).stopColor));
  t.ok(l.claro && l.rosa && await pg.p.evaluate(() => document.documentElement.classList.contains('sin-neon')), 'Rosa sin neón: las tres clases');
  t.eq(l.body, PLUM, 'Rosa sin neón: fondo ciruela');
  t.ok(/blur/.test(l.blur || ''), 'Rosa sin neón: la caja sigue siendo vidrio');
  t.ok(!/conic/.test(l.ring || '') && /rgba\(255, 255, 255, 0\.18\)/.test(l.ring || ''), 'Rosa sin neón: el borde de la caja es un filete blanco: ' + l.ring);
  t.ok(!conTinte(l.shadow) && !flame.some(conTinte), 'Rosa sin neón: sin resplandores de colores');
  t.ok(fondoCiruela(l.aurora) && l.manchas === 0, 'Rosa sin neón: el mismo degradé liso de ciruela, sin círculos ni el rosa del neón: ' + l.aurora);
  t.eq(pg.errs, [], 'errores de la página (sin neón)');
  await pg.close();

  // 6) Modo liviano con «Rosa»: ningún desenfoque y vidrio casi sólido en ciruela.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => { localStorage.setItem('gize_tema', 'rosa'); localStorage.setItem('gize_lite', '1'); } });
  await pg.p.goto(base + '/app/'); await wait(2000);
  await pg.p.click('#nav-config'); await wait(500);
  l = await look(pg.p);
  t.ok(l.rosa && /rgb\(40, 15, 33\)/.test(l.card || ''), 'liviano: vidrio casi sólido en ciruela: ' + l.card);
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).length), 0, 'liviano: ningún elemento con backdrop-filter');
  t.eq(pg.errs, [], 'errores de la página (liviano)');
  await pg.close();

  // 7) Coach: las cuatro opciones en su Configuración (también en 320 px) y «Rosa» se aplica.
  pg = await newPage({ user: COACH, handlers: COACH_H, viewport: { width: 320, height: 640 }, init: () => localStorage.setItem('gize_lite', '0') });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('[data-coach="open-settings"]'); await wait(500);
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('#coachSheetHost .cs-tema [data-tema]')].map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))), ['Oscuro*', 'Claro', 'Azul', 'Rosa'], 'coach: Apariencia con Oscuro (elegido), Claro, Azul y Rosa');
  t.eq(await entra(pg.p, '#coachSheetHost .cs-tema', '.cs-field'), { n: 4, malos: [], anchoPagina: true }, 'coach en 320 px: las cuatro opciones entran');
  const estado = () => pg.p.evaluate(() => { const c = document.documentElement.classList; return [c.contains('tema-claro'), c.contains('tema-rosa'), getComputedStyle(document.body).backgroundColor, localStorage.getItem('gize_tema')]; });
  await pg.p.click('#coachSheetHost [data-tema="rosa"]'); await wait(150);
  t.eq(await estado(), [true, true, PLUM, 'rosa'], 'coach: Rosa se aplica y se guarda');
  t.ok(/blur/.test(await pg.p.evaluate(() => getComputedStyle(document.querySelector('.cp-ccard')).backdropFilter)), 'coach: la ventana de Configuración es vidrio');
  t.eq(await pg.p.evaluate(() => [...document.querySelectorAll('#coachSheetHost .cs-tema .on')].map(b => b.textContent)), ['Rosa'], 'coach: queda marcada Rosa');
  await pg.p.click('#coachSheetHost [data-tema="oscuro"]'); await wait(150);
  t.eq(await estado(), [false, false, BLACK, null], 'coach: Oscuro saca las dos clases');
  t.eq(pg.errs, [], 'errores de la página (coach)');
  await pg.close();
}
