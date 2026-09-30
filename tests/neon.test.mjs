// Neón prendido / apagado (html.sin-neon, css/ui/sin-neon.css, app/ui/neon.js). Prendido por
// defecto: la app se ve exactamente como siempre. Apagado desde Ajustes del cliente o desde la
// Configuración del coach: se aplica al toque (sin recargar), queda guardado en el dispositivo
// ("gize_neon" = "0"), la clase ya está antes de la primera pintada, y no queda nada de la gama:
// ni anillos que giran, ni bordes de colores, ni resplandores de colores (chat y racha). Anda
// igual con «Azul».
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca', sets: [{ id: 's1', kg: '80', reps: '8' }] }] }], sessions: [], weights: [], daily: {} };
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const COACH_H = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
};

// Los valores de siempre (origin/main) con neón.
const RING_OSCURO = 'linear-gradient(rgb(11, 13, 17), rgb(11, 13, 17)), conic-gradient(rgb(47, 160, 255), rgb(166, 92, 255), rgb(255, 61, 174), rgb(37, 232, 200), rgb(47, 160, 255))';

// ¿Hay algún color con tinte (no gris) en este valor de CSS? rgb()/rgba() y color(srgb …), que es
// como sale un color-mix() calculado; canales de 0 a 255.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);

// Lo que se mide en cada pantalla (lo que no está, vuelve null).
const mide = p => p.evaluate(() => {
  const el = s => document.querySelector(s);
  const cs = (s, pseudo) => { const e = el(s); return e ? getComputedStyle(e, pseudo || null) : null; };
  const pick = (s, pseudo, props) => { const c = cs(s, pseudo); if (!c) return null; const o = {}; props.forEach(k => { o[k] = c[k]; }); return o; };
  const root = document.documentElement;
  return {
    sinNeon: root.classList.contains('sin-neon'), claro: root.classList.contains('tema-claro'),
    saved: localStorage.getItem('gize_neon'),
    r2: getComputedStyle(root).getPropertyValue('--gize-r2').trim(),
    card: pick('.cfg-card', null, ['backgroundImage', 'boxShadow', 'backdropFilter']),
    cardAfter: pick('.cfg-card', '::after', ['backgroundImage', 'content']),
    exCard: pick('.card', null, ['backgroundImage']),
    wkStart: pick('.wk-start', null, ['backgroundColor', 'boxShadow', 'color']),
    wkStartRing: pick('.wk-start', '::before', ['backgroundImage', 'animationName']),
    wkLive: pick('.wk-live', null, ['backgroundImage', 'boxShadow']),
    primary: pick('.ctrl.primary', null, ['backgroundImage', 'backgroundColor', 'animationName', 'boxShadow']),
    chat: pick('#chatBtn', null, ['boxShadow', 'backgroundColor']),
    chatRing: pick('#chatBtn', '::before', ['backgroundImage', 'animationName']),
    chatIcon: pick('#chatBtn svg', null, ['filter']),
    streak: pick('#streakBtn', null, ['boxShadow', 'borderTopColor', 'backgroundColor']),
    streakNum: pick('#streakBtn b', null, ['textShadow']),
    flame: pick('#streakBtn .flame', null, ['filter']),
    flameStops: [...document.querySelectorAll('#streakBtn .flame stop')].map(s => getComputedStyle(s).stopColor),
    sw: [...document.querySelectorAll('[data-neon-toggle]')].map(b => b.getAttribute('aria-checked')),
  };
});

// El orden de las tarjetas de Ajustes (por el título).
const tarjetas = p => p.evaluate(() => [...document.querySelectorAll('.cfg-card .cfg-notif-label')].map(e => e.textContent));

const spy = () => { document.addEventListener('DOMContentLoaded', () => { window.__dcl = document.documentElement.classList.contains('sin-neon'); }); };

export default async function ({ base, t }){
  // 1) Por defecto: neón prendido, sin clase ni nada guardado, y todo como siempre.
  let pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => localStorage.setItem('gize_lite', '0') });
  const p = pg.p;
  await p.addInitScript(spy);
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('.ex-collapsed'); await wait(400); // abre el ejercicio (arrancan cerrados)
  t.eq(await p.evaluate(() => window.__dcl), false, 'por defecto: sin html.sin-neon');
  let m = await mide(p);
  t.eq([m.sinNeon, m.saved, m.r2], [false, null, '#A65CFF'], 'por defecto: sin clase, nada guardado y la gama de siempre');
  t.eq(m.exCard && m.exCard.backgroundImage, RING_OSCURO, 'por defecto: el ejercicio con el borde RGB de siempre');
  t.ok(/conic-gradient/.test(m.wkStartRing && m.wkStartRing.backgroundImage) && m.wkStartRing.animationName === 'gize-spin', 'por defecto: «Iniciar entrenamiento» con el anillo RGB que gira');
  t.ok(conTinte(m.chat && m.chat.boxShadow) && /conic-gradient/.test(m.chatRing && m.chatRing.backgroundImage) && m.chatRing.animationName === 'gize-spin', 'por defecto: el chat con neón de colores');
  t.ok(conTinte(m.streak && m.streak.boxShadow) && conTinte(m.flame && m.flame.filter), 'por defecto: la racha con resplandor de colores');
  await p.click('#nav-cardio'); await wait(500);
  m = await mide(p);
  t.ok(/conic-gradient/.test(m.primary && m.primary.backgroundImage) && m.primary.animationName === 'gize-spin', 'por defecto: el botón principal (Cardio) con el anillo que gira');
  await p.click('#nav-config'); await wait(500);
  m = await mide(p);
  t.eq(m.card && m.card.backgroundImage, RING_OSCURO, 'por defecto: la caja de Ajustes con el borde RGB de siempre');
  const orden = await tarjetas(p);
  t.eq(orden.slice(orden.indexOf('Apariencia'), orden.indexOf('Apariencia') + 3), ['Apariencia', 'Neón', 'Modo liviano'], 'Ajustes: «Neón» va justo después de «Apariencia»: ' + orden.join(', '));
  t.eq(m.sw, ['true'], 'Ajustes: el interruptor de Neón, prendido');
  t.eq(await p.evaluate(() => { const b = document.querySelector('[data-neon-toggle]'); return [b.getAttribute('role'), b.closest('.cfg-card').querySelector('.cfg-notif-desc').textContent]; }), ['switch', 'Bordes y brillos de colores'], 'Ajustes: es un interruptor con su subtítulo');

  // 2) Apagarlo: al toque, sin recargar, y queda guardado.
  await p.evaluate(() => { window.__sinRecargar = 1; });
  await p.click('[data-neon-toggle]'); await wait(200);
  m = await mide(p);
  t.ok(m.sinNeon && await p.evaluate(() => window.__sinRecargar === 1), 'apagado: html.sin-neon al toque, sin recargar');
  t.eq([m.saved, m.sw], ['0', ['false']], 'apagado: guardado en el dispositivo y el interruptor apagado');
  t.ok(m.card && !/conic/.test(m.card.backgroundImage) && /rgba\(255, 255, 255, 0\.18\)/.test(m.card.backgroundImage), 'apagado: la caja de Ajustes con un filete blanco fino: ' + (m.card && m.card.backgroundImage));
  t.ok(!conTinte(m.card && m.card.boxShadow), 'apagado: la sombra de la caja sin color: ' + (m.card && m.card.boxShadow));
  t.ok(!conTinte(m.chat.boxShadow) && !/conic/.test(m.chatRing.backgroundImage) && m.chatRing.animationName === 'none' && !conTinte(m.chatIcon.filter), 'apagado: el chat blanco y gris, quieto: ' + m.chat.boxShadow + ' / ' + m.chatRing.backgroundImage);
  t.ok(!conTinte(m.streak.boxShadow) && !conTinte(m.streak.borderTopColor) && !conTinte(m.streakNum.textShadow) && !conTinte(m.flame.filter), 'apagado: la racha sin resplandor de colores: ' + m.streak.boxShadow + ' / ' + m.flame.filter);
  t.ok(m.flameStops.length > 0 && !m.flameStops.some(conTinte), 'apagado: la llama en blanco y gris: ' + m.flameStops.join(' '));

  // 3) Queda al recargar, puesta antes de la primera pintada, y sin nada que gire.
  await p.reload(); await wait(2500);
  if (!await p.$('.card')) { await p.click('.ex-collapsed'); await wait(400); }
  t.eq(await p.evaluate(() => window.__dcl), true, 'apagado: la clase ya está al terminar de leer el HTML (sin parpadeo)');
  m = await mide(p);
  t.ok(m.sinNeon && m.saved === '0', 'apagado: sigue después de recargar');
  t.ok(m.exCard && !/conic/.test(m.exCard.backgroundImage) && /rgba\(255, 255, 255, 0\.18\)/.test(m.exCard.backgroundImage), 'apagado: el ejercicio con filete neutro: ' + (m.exCard && m.exCard.backgroundImage));
  t.ok(m.wkStartRing && !/conic/.test(m.wkStartRing.backgroundImage) && m.wkStartRing.animationName === 'none', 'apagado: «Iniciar entrenamiento» sin anillo ni giro: ' + JSON.stringify(m.wkStartRing));
  t.ok(m.wkStart && m.wkStart.backgroundColor === 'rgb(255, 255, 255)' && !conTinte(m.wkStart.boxShadow), 'apagado: «Iniciar entrenamiento» blanco, sin brillo de colores: ' + JSON.stringify(m.wkStart));
  await p.click('[data-action="wk-start"]'); await wait(400);
  m = await mide(p);
  t.ok(m.wkLive && !/conic/.test(m.wkLive.backgroundImage) && !conTinte(m.wkLive.boxShadow), '«Entrenando hace…» sin neón: ' + JSON.stringify(m.wkLive));
  await p.click('#nav-cardio'); await wait(500);
  m = await mide(p);
  t.ok(m.primary && !/conic/.test(m.primary.backgroundImage) && m.primary.animationName === 'none' && m.primary.backgroundColor === 'rgb(255, 255, 255)' && !conTinte(m.primary.boxShadow), 'apagado: el botón principal blanco, sin anillo ni giro: ' + JSON.stringify(m.primary));
  // Nada de la página sigue girando con la gama.
  t.eq(await p.evaluate(() => [...document.querySelectorAll('body *')].flatMap(e => [null, '::before', '::after'].map(ps => getComputedStyle(e, ps)))
    .filter(c => c.animationName.split(',').includes('gize-spin') && c.display !== 'none').length), 0, 'apagado: nada gira');

  // 4) Con «Azul»: vidrio de siempre, pero con filete neutro.
  await p.click('#nav-config'); await wait(500);
  await p.click('.cfg-seg [data-tema="azul"]'); await wait(200);
  m = await mide(p);
  t.ok(m.claro && m.sinNeon, 'Azul sin neón: las dos clases');
  t.ok(/blur/.test(m.card.backdropFilter || ''), 'Azul sin neón: la caja sigue siendo vidrio');
  t.ok(m.cardAfter && !/conic/.test(m.cardAfter.backgroundImage) && /rgba\(255, 255, 255, 0\.18\)/.test(m.cardAfter.backgroundImage), 'Azul sin neón: el borde de la caja es un filete blanco: ' + (m.cardAfter && m.cardAfter.backgroundImage));
  t.ok(!conTinte(m.card.boxShadow) && !conTinte(m.chat.boxShadow) && !conTinte(m.streak.boxShadow) && !conTinte(m.flame.filter) && !m.flameStops.some(conTinte), 'Azul sin neón: sin resplandores de colores');
  t.ok(!/rgba\(63, 163, 242/.test(await p.evaluate(() => getComputedStyle(document.querySelector('.app-aurora')).backgroundImage)), 'Azul sin neón: los círculos del fondo sin el azul de la gama');

  // 5) Volver a prenderlo: todo como siempre.
  await p.click('[data-neon-toggle]'); await wait(200);
  m = await mide(p);
  t.eq([m.sinNeon, m.saved, m.sw], [false, null, ['true']], 'prendido otra vez: sin clase ni nada guardado');
  t.ok(/conic-gradient/.test(m.cardAfter.backgroundImage) && conTinte(m.chat.boxShadow), 'prendido otra vez (Azul): vuelven el borde y el brillo de colores');
  await p.click('.cfg-seg [data-tema="oscuro"]'); await wait(200);
  m = await mide(p);
  t.eq(m.card && m.card.backgroundImage, RING_OSCURO, 'prendido otra vez (Oscuro): la caja como siempre');
  t.eq(m.r2, '#A65CFF', 'prendido otra vez: la gama de siempre');
  t.eq(pg.errs, [], 'errores de la página (cliente)');
  await pg.close();

  // 6) Modo liviano sin neón: siguen andando los dos.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init: () => { localStorage.setItem('gize_lite', '1'); localStorage.setItem('gize_neon', '0'); } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('.ex-collapsed'); await wait(400);
  t.eq(await pg.p.evaluate(() => ['lite', 'sin-neon'].map(c => document.documentElement.classList.contains(c))), [true, true], 'liviano y sin neón a la vez');
  m = await mide(pg.p);
  t.ok(m.wkStartRing && m.wkStartRing.animationName === 'none' && !/conic/.test(m.exCard.backgroundImage), 'liviano sin neón: sin giro ni gama');
  t.eq(pg.errs, [], 'errores de la página (liviano)');
  await pg.close();

  // 7) Coach: el mismo interruptor en su Configuración.
  pg = await newPage({ user: COACH, handlers: COACH_H, init: () => localStorage.setItem('gize_lite', '0') });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('[data-coach="open-settings"]'); await wait(500);
  const coach = () => pg.p.evaluate(() => {
    const sw = document.querySelector('#coachSheetHost [data-neon-toggle]'), save = document.querySelector('#coachSheetHost .co-save-rt');
    const lbl = sw && document.getElementById(sw.getAttribute('aria-labelledby'));
    const cs = save && getComputedStyle(save);
    return { sw: sw && sw.getAttribute('aria-checked'), lbl: lbl && lbl.textContent, clase: document.documentElement.classList.contains('sin-neon'),
      saved: localStorage.getItem('gize_neon'), save: cs && [/conic/.test(cs.backgroundImage), cs.animationName] };
  });
  let c = await coach();
  t.eq([c.sw, c.lbl, c.clase, c.saved], ['true', 'Neón en este dispositivo', false, null], 'coach: el interruptor de Neón, prendido');
  t.ok(await pg.p.evaluate(() => { const a = document.querySelector('#coachSheetHost .cs-tema'), b = document.querySelector('#coachSheetHost [data-neon-toggle]'); return !!(a && b && a.closest('.cs-field').nextElementSibling === b.closest('.cs-field')); }), 'coach: va al lado de «Apariencia en este dispositivo»');
  t.eq(c.save, [true, 'gize-spin'], 'coach: «Guardar nombre» con el anillo que gira');
  await pg.p.click('#coachSheetHost [data-neon-toggle]'); await wait(200);
  c = await coach();
  t.eq([c.sw, c.clase, c.saved], ['false', true, '0'], 'coach: se apaga al toque y queda guardado');
  t.eq(c.save, [false, 'none'], 'coach: «Guardar nombre» sin anillo ni giro');
  await pg.p.click('#coachSheetHost [data-neon-toggle]'); await wait(200);
  c = await coach();
  t.eq([c.sw, c.clase, c.saved, c.save], ['true', false, null, [true, 'gize-spin']], 'coach: se vuelve a prender');
  t.eq(pg.errs, [], 'errores de la página (coach)');
  await pg.close();
}
