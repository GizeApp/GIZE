// Apariencia «Azul» (html.tema-claro, css/ui/tema-claro.css; antes se llamaba «Claro»): es
// opcional. Sin elegirla la app se ve exactamente como siempre («Oscuro»); se elige en Ajustes
// del cliente y en la Configuración del coach, se aplica al toque, queda guardada en el
// dispositivo ("gize_tema" = "azul") y la clase ya está puesta antes de la primera pintada (sin
// parpadeo). Quien la eligió cuando se llamaba «Claro» (guardado "claro") la sigue viendo igual,
// con «Azul» marcado. El splash (el logo tranquilo, con el orbe en los colores de «Azul») se va
// solo y respeta movimiento reducido y modo liviano.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca', sets: [{ id: 's1', kg: '80', reps: '8', done: true }] }] }], sessions: [], weights: [], daily: {} };
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const COACH_H = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
};

// Valores del look de siempre, leídos de origin/main (faec7b6) con la misma medición.
const OSCURO = {
  body: 'rgb(0, 0, 0)',
  card: 'linear-gradient(rgb(11, 13, 17), rgb(11, 13, 17)), conic-gradient(rgb(47, 160, 255), rgb(166, 92, 255), rgb(255, 61, 174), rgb(37, 232, 200), rgb(47, 160, 255))',
  cardFill: 'rgba(0, 0, 0, 0)', blur: 'none', logo: 'normal',
  ring: 'conic-gradient(from 0deg,#2FA0FF,#A65CFF,#FF3DAE,#25E8C8,#2FA0FF)',
  nav: 'rgba(6, 9, 17, 0.82)',
};

// Estilos clave de la pantalla actual (la de Ajustes tiene tarjetas .cfg-card).
const look = p => p.evaluate(() => {
  const cs = s => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
  const c = cs('.cfg-card'), logo = cs('#app img.brand-logo') || cs('img.brand-logo');
  return { claro: document.documentElement.classList.contains('tema-claro'), body: cs('body').backgroundColor,
    card: c && c.backgroundImage, cardFill: c && c.backgroundColor, blur: c && c.backdropFilter, logo: logo && logo.content,
    ring: getComputedStyle(document.documentElement).getPropertyValue('--gize-rgb-ring').trim(), nav: cs('.navbar') && cs('.navbar').backgroundColor,
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
  t.ok(await splashGone(pg.p, 5000), 'por defecto: el splash se va');
  await wait(400);
  await pg.p.click('#nav-config'); await wait(500);
  let l = await look(pg.p);
  t.eq({ body: l.body, card: l.card, cardFill: l.cardFill, blur: l.blur, logo: l.logo, ring: l.ring, nav: l.nav }, OSCURO, 'por defecto: fondo, caja de sección, anillo de neón, logo y barra iguales a los de siempre');
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
  t.ok(/#3FA3F2/i.test(l.ring) && /#A474F7/i.test(l.ring) && /#2EC6EE/i.test(l.ring) && /#5B6CF2/i.test(l.ring) && !/#FF3DAE/i.test(l.ring), 'Azul: gama nueva (azul, violeta, cian, índigo): ' + l.ring);
  t.ok(/gize-marca-azul\.svg/.test(l.logo || ''), 'Azul: el logo «Azul» (G blanca, orbe azul): ' + l.logo);
  t.ok(await pg.p.evaluate(() => /62vmax/.test(getComputedStyle(document.querySelector('.app-aurora')).backgroundImage)), 'Azul: los círculos grandes de fondo');

  // 3) Queda al recargar, puesta antes de la primera pintada, con el splash nuevo que se va solo.
  const t0 = Date.now();
  await pg.p.reload();
  await pg.p.waitForFunction(() => window.__splash, null, { timeout: 3000 }).catch(() => {});
  sp = await pg.p.evaluate(() => window.__splash || {});
  t.eq(await pg.p.evaluate(() => window.__dcl), true, 'Azul: la clase ya está al terminar de leer el HTML (sin parpadeo)');
  t.eq([sp.nuevo, sp.viejo, sp.label, sp.arcStroke], [true, false, 'GIZE', 'rgb(255, 255, 255)'], 'Azul: splash del logo, con la G blanca');
  t.ok(/rgb\(43, 63, 192\)/.test(sp.color || '') && !/224, 58, 174/.test(sp.color || ''), 'Azul: el orbe con los colores de Azul: ' + sp.color);
  t.eq([sp.orbAnim, sp.arcAnim, sp.halo, sp.blur], ['sp-orbe', 'sp-trazo', 'sp-respira', 0], 'Azul: el splash aparece animado, sin backdrop-filter');
  t.ok(await splashGone(pg.p, 4000), 'Azul: el splash se va solo (' + (Date.now() - t0) + ' ms)');
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
  t.eq({ body: l.body, card: l.card, cardFill: l.cardFill, blur: l.blur, logo: l.logo, ring: l.ring, nav: l.nav }, OSCURO, 'Oscuro: vuelve el look de siempre');
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
