// Entreno del alumno con menos colores (pedido: con verde, azul y violeta a la vez se veía
// infantil). Video, audio del coach, recomendación, propuesta del coach, serie hecha,
// objetivo y pestaña del día van en blanco y grises; el neón de la marca queda en
// «Iniciar entrenamiento» y en el botón del chat, que pasa de azul a toda la gama.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

// Colores con "tinte": un canal le saca más de 40 a otro (el blanco y los grises no).
const tinted = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).map(Number); return Math.max(r, g, b) - Math.min(r, g, b) > 40; };

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [
    { id: 'e1', name: 'Press de banca plano (barra)', audio: '11111111-1111-1111-1111-111111111111/ex/abcdefgh12.webm', audioSecs: 42, sets: [
      { id: 's1', kg: '80', reps: '8', done: true, target: '6-8' }, { id: 's2', kg: '', reps: '', target: '6-8' }] },
    { id: 'e2', name: 'Remo con barra', sets: [{ id: 's3', kg: '', reps: '', targetKg: '70', target: '8' }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.evaluate(() => { document.getElementById('chatBtn').hidden = false; });
  const m = await p.evaluate(() => {
    const out = {};
    const put = (name, el, props) => { if (!el) { out[name] = 'no está'; return; } const cs = getComputedStyle(el); out[name] = props.map(k => cs[k]); };
    put('pestaña del día', document.querySelector('.tabs .tab.active'), ['backgroundColor', 'borderTopColor', 'color']);
    put('ver video', document.querySelector('.ex-video'), ['backgroundColor', 'borderTopColor', 'color']);
    put('ícono del video', document.querySelector('.ex-video svg'), ['color']);
    put('audio del coach', document.querySelector('.ex-audio'), ['backgroundColor', 'borderTopColor', 'color']);
    put('ícono del audio', document.querySelector('.ex-audio svg'), ['color']);
    put('propuesta del coach', document.querySelector('.prog-sug'), ['backgroundColor', 'borderTopColor']);
    put('ícono de la propuesta', document.querySelector('.prog-sug .ps-ic'), ['backgroundColor', 'color']);
    put('serie hecha', document.querySelector('.set .done.on'), ['backgroundColor', 'borderTopColor', 'color']);
    put('objetivo de la serie', document.querySelector('.set .goal'), ['color']);
    put('número del ejercicio', document.querySelector('.ex-num'), ['backgroundColor', 'color']);
    const chat = document.getElementById('chatBtn');
    out.chatRing = getComputedStyle(chat, '::before').backgroundImage;
    out.chatShadow = getComputedStyle(chat).boxShadow;
    return out;
  });
  for (const [k, v] of Object.entries(m)){
    if (k.startsWith('chat')) continue;
    t.ok(Array.isArray(v), k + ': está en la pantalla');
    if (Array.isArray(v)) t.eq(v.filter(tinted), [], k + ': sin color (blanco o gris)');
  }
  t.ok(m.chatRing.includes('conic-gradient'), 'chat: el borde es la gama de neón');
  const cols = new Set((m.chatShadow.match(/rgba?\([^)]*\)/g) || []).map(c => c.replace(/\s/g, '')));
  t.ok(cols.size >= 3, 'chat: el resplandor tiene varios colores de la gama: ' + m.chatShadow);

  // Adentro del chat, lo que era azul (mi mensaje, mandar, reproducir) va con la gama.
  const css = await p.evaluate(() => [...document.styleSheets].filter(s => s.href && s.href.includes('/css/ui/chat.css'))
    .flatMap(s => [...s.cssRules].map(r => r.cssText)).join('\n'));
  t.ok(!/gize-blue/.test(css), 'chat: no queda nada en azul solo');
  t.eq(errs, [], 'errores de la página');
  await close();
}
