// Entreno del alumno con menos colores (pedido: con verde, azul y violeta a la vez se veía
// infantil). Recomendación, propuesta del coach, serie hecha, objetivo, número del ejercicio y
// pestaña del día van en blanco y grises. Con la apariencia tranquila (css/ui/calma.css), video y
// audio del coach llevan el filete fino con un toque de color en el borde (linear-gradient a 155°,
// ya no la gama de neón en conic-gradient), letras blancas y una sombra neutra sin resplandor de
// colores. El botón del chat, igual: el filete quieto (no gira) y sin brillos de la gama. La serie
// hecha (pedido): relleno oscuro y tilde blanca, con el filete fino de neón de todos lados en el borde.
import { newPage, wait, ALUMNO, profile, openAllEx } from './lib.mjs';

// Colores con "tinte": un canal le saca más de 40 a otro (el blanco y los grises no).
const tinted = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).map(Number); return Math.max(r, g, b) - Math.min(r, g, b) > 40; };
// ¿Hay algún color con tinte (no gris) en este valor de CSS? rgb()/rgba() y color(srgb …), que es
// como sale un color-mix() calculado; canales de 0 a 255. Los transparentes no cuentan.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);
// El filete de la apariencia tranquila: degradé lineal a 155°, sin la gama de neón.
const filete = v => /linear-gradient\(155deg/.test(v) && !/conic-gradient/.test(v) && conTinte(v);

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [
    { id: 'e1', name: 'Press de banca plano (barra)', audio: '11111111-1111-1111-1111-111111111111/ex/abcdefgh12.webm', audioSecs: 42, sets: [
      { id: 's1', kg: '80', reps: '8', done: true, target: '6-8' }, { id: 's2', kg: '', reps: '', target: '6-8' }] },
    { id: 'e2', name: 'Remo con barra', sets: [{ id: 's3', kg: '', reps: '', targetKg: '70', target: '8' }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500); await openAllEx(p);
  await p.evaluate(() => { document.getElementById('chatBtn').hidden = false; });
  const m = await p.evaluate(() => {
    const out = {};
    const put = (name, el, props) => { if (!el) { out[name] = 'no está'; return; } const cs = getComputedStyle(el); out[name] = props.map(k => cs[k]); };
    put('pestaña del día', document.querySelector('.tabs .tab.active'), ['backgroundColor', 'borderTopColor', 'color']);
    put('ver video', document.querySelector('.ex-video'), ['color']);
    put('ícono del video', document.querySelector('.ex-video svg'), ['color']);
    put('audio del coach', document.querySelector('.ex-audio'), ['color']);
    out.botones = ['.ex-video', '.ex-audio'].map(q => { const e = document.querySelector(q); if (!e) return null; const cs = getComputedStyle(e); return { ring: cs.backgroundImage, shadow: cs.boxShadow }; });
    put('ícono del audio', document.querySelector('.ex-audio svg'), ['color']);
    put('propuesta del coach', document.querySelector('.prog-sug'), ['backgroundColor', 'borderTopColor']);
    put('ícono de la propuesta', document.querySelector('.prog-sug .ps-ic'), ['backgroundColor', 'color']);
    put('serie hecha', document.querySelector('.set .done.on'), ['backgroundColor', 'borderTopColor', 'color']);
    { const d = document.querySelector('.set .done.on'); out.hechaRing = d ? [getComputedStyle(d).backgroundImage, getComputedStyle(d).boxShadow, getComputedStyle(d).animationName] : null; }
    put('objetivo de la serie', document.querySelector('.set .goal'), ['color']);
    put('número del ejercicio', document.querySelector('.ex-num'), ['backgroundColor', 'color']);
    const chat = document.getElementById('chatBtn'), cb = getComputedStyle(chat, '::before');
    out.chatRing = cb.backgroundImage;
    out.chatAnim = [cb.animationName, getComputedStyle(chat).animationName];
    out.chatShadow = getComputedStyle(chat).boxShadow;
    out.chatIcon = getComputedStyle(chat.querySelector('svg')).filter;
    return out;
  });
  for (const [k, v] of Object.entries(m)){
    if (k.startsWith('chat') || k === 'botones' || k === 'hechaRing') continue;
    t.ok(Array.isArray(v), k + ': está en la pantalla');
    if (Array.isArray(v)) t.eq(v.filter(tinted), [], k + ': sin color (blanco o gris)');
  }
  t.ok(m.hechaRing && /linear-gradient\(155deg/.test(m.hechaRing[0]), 'serie hecha: el filete fino de neón: ' + (m.hechaRing && m.hechaRing[0]));
  t.ok(m.hechaRing && m.hechaRing[1] === 'none' && m.hechaRing[2] === 'none', 'serie hecha: sin resplandor y quieta: ' + (m.hechaRing && m.hechaRing.slice(1)));
  for (const [i, name] of ['ver video', 'escuchar a tu coach'].entries()){
    const b = m.botones[i];
    t.ok(!!b, name + ': está en la pantalla');
    if (!b) continue;
    t.ok(filete(b.ring), name + ': borde con el filete fino y un toque de color, no la gama de neón: ' + b.ring.slice(0, 80));
    t.ok(b.shadow !== 'none' && !conTinte(b.shadow), name + ': sombra neutra, sin resplandor de colores: ' + b.shadow);
  }
  t.ok(filete(m.chatRing), 'chat: el borde es el filete fino con un toque de color, no la gama de neón: ' + m.chatRing.slice(0, 80));
  t.eq(m.chatAnim, ['none', 'none'], 'chat: el borde queda quieto (no gira ni late)');
  t.ok(m.chatShadow !== 'none' && !conTinte(m.chatShadow), 'chat: sombra neutra, sin el resplandor de la gama: ' + m.chatShadow);
  t.ok(!conTinte(m.chatIcon), 'chat: el ícono sin brillo de color: ' + m.chatIcon);

  // Adentro del chat no queda nada en azul solo (mi mensaje, mandar y reproducir siguen la apariencia).
  const css = await p.evaluate(() => [...document.styleSheets].filter(s => s.href && s.href.includes('/css/ui/chat.css'))
    .flatMap(s => [...s.cssRules].map(r => r.cssText)).join('\n'));
  t.ok(!/gize-blue/.test(css), 'chat: no queda nada en azul solo');
  t.eq(errs, [], 'errores de la página');
  await close();
}
