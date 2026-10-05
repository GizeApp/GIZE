// Ahorro de batería:
// - El fondo es liso en degradé en todas las apariencias (css/ui/calma.css): el canvas de partículas
//   está oculto y nunca se dibuja. Igual, a los ~6 s sin tocar nada se pone html.fondo-quieto y se
//   saca con el primer toque.
// - Nada gira: el borde de «Iniciar entrenamiento» y el del chat son el filete quieto (sin animación).
// - El reloj interno (main.js) no se programa si no hay nada corriendo; sí con el entreno en curso,
//   y se frena con la app en segundo plano ("pause" de Capacitor, Android o iPhone).
// - El chat no consulta en segundo plano ni con el chat cerrado; al volver revisa en el acto.
// - Batería baja (navigator.getBattery) → modo liviano solo; si se eligió «no» en Ajustes, manda eso.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Torso', exercises: [
  { id: 'e1', name: 'Press de banca plano (barra)', sets: [{ id: 's1', kg: '', reps: '' }] }] }], sessions: [], weights: [], daily: {} };

// Cuenta los círculos que dibujan los canvas.
const SPY = `window.__arc = 0; { const o = CanvasRenderingContext2D.prototype.arc;
  CanvasRenderingContext2D.prototype.arc = function () { window.__arc++; return o.apply(this, arguments); }; }`;

// Batería simulada: window.__bat se puede cambiar y avisar con levelchange/chargingchange.
const BATTERY = (level, charging) => `
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8, configurable: true });
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8, configurable: true });
  { const b = new EventTarget(); b.level = ${level}; b.charging = ${charging}; window.__bat = b;
  Object.defineProperty(Navigator.prototype, 'getBattery', { value: () => Promise.resolve(b), configurable: true }); }`;

async function open(base, init){
  const r = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init });
  await r.p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), x => x.abort());
  return r;
}

export default async function ({ base, t }){
  // ---- Fondo que no se dibuja, bordes quietos, reloj interno ----
  {
    // «Azul» antes tenía partículas; ahora, como todas las apariencias, va con fondo liso en degradé.
    const { p, errs, close } = await open(base, `localStorage.setItem('gize_lite','0');localStorage.setItem('gize_tema','azul');${SPY}`);
    await p.goto(base + '/app/'); await wait(3000);
    const a0 = await p.evaluate(() => window.__arc); await wait(400);
    const bg = await p.evaluate(() => ({ arc: window.__arc, canvas: getComputedStyle(document.getElementById('silkCanvas')).display,
      aurora: getComputedStyle(document.querySelector('.app-aurora')).backgroundImage }));
    t.eq([a0, bg.arc - a0, bg.canvas], [0, 0, 'none'], 'recién abierta el fondo no se dibuja (canvas oculto, sin partículas)');
    t.ok(/^linear-gradient\(/.test(bg.aurora) && !/radial-gradient/.test(bg.aurora), 'el fondo es el degradé liso: ' + bg.aurora.slice(0, 60));

    // El borde de «Iniciar entrenamiento»: el filete fino (linear-gradient 155deg), quieto.
    const be = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.wk-start'), '::before'); return { anim: s.animationName, bg: s.backgroundImage }; });
    t.eq(be.anim, 'none', 'el borde de «Iniciar entrenamiento» no gira');
    t.ok(/linear-gradient\(155deg/.test(be.bg) && !/conic-gradient/.test(be.bg), 'el borde de «Iniciar entrenamiento» es el filete quieto: ' + be.bg.slice(0, 60));
    const chat = await p.evaluate(() => { const b = document.getElementById('chatBtn'); return b ? [getComputedStyle(b).animationName, getComputedStyle(b, '::before').animationName] : null; });
    t.eq(chat, ['none', 'none'], 'el botón del chat tampoco gira');

    // Reloj interno: sin entreno ni cardio no hay nada programado.
    const tk0 = await p.evaluate(async () => (await import('/app/main.js')).tickActive());
    t.eq(tk0, false, 'sin nada corriendo el reloj interno no se programa');

    // ~6 s sin tocar: html.fondo-quieto (el fondo sigue sin dibujarse).
    await wait(6500);
    const q = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('fondo-quieto'), arc: window.__arc }));
    await wait(600);
    const q2 = await p.evaluate(() => window.__arc);
    t.ok(q.cls, 'sin tocar nada: html.fondo-quieto');
    t.eq([q.arc, q2 - q.arc], [0, 0], 'sin tocar nada el fondo no se dibuja');

    // Un toque (el de «Iniciar entrenamiento»): sale de fondo-quieto (sin dibujar nada) y el reloj arranca.
    await p.click('[data-action="wk-start"]'); await wait(500);
    const r = await p.evaluate(async () => ({ cls: document.documentElement.classList.contains('fondo-quieto'), arc: window.__arc,
      tk: (await import('/app/main.js')).tickActive(), time: (document.getElementById('wkTime') || {}).textContent }));
    t.eq([r.cls, r.arc - q2], [false, 0], 'al tocar sale de html.fondo-quieto y el fondo sigue sin dibujarse');
    t.eq(r.tk, true, 'con el entreno en curso el reloj interno está programado');
    await wait(1600);
    const time2 = await p.evaluate(() => (document.getElementById('wkTime') || {}).textContent);
    t.ok(time2 && time2 !== r.time && /^00:0[1-3]$/.test(time2), 'el reloj del entreno avanza de a segundo: ' + r.time + ' → ' + time2);

    // Segundo plano (Capacitor "pause", igual en Android y iPhone): nada programado ni dibujando.
    await p.evaluate(() => document.dispatchEvent(new Event('pause'))); await wait(300);
    const s = await p.evaluate(async () => ({ tk: (await import('/app/main.js')).tickActive(), arc: window.__arc,
      cls: document.documentElement.classList.contains('app-pausada') }));
    await wait(500);
    t.eq([s.tk, s.cls, (await p.evaluate(() => window.__arc)) - s.arc], [false, true, 0], 'en segundo plano: sin reloj, sin fondo, animaciones frenadas');
    await p.evaluate(() => document.dispatchEvent(new Event('resume'))); await wait(300);
    t.eq(await p.evaluate(async () => (await import('/app/main.js')).tickActive()), true, 'al volver, el reloj sigue');
    t.eq(errs, [], 'errores de la página');
    await close();
  }

  // ---- Chat: sin consultas en segundo plano ni con el chat cerrado ----
  {
    const { p, errs, calls, close } = await open(base, `localStorage.setItem('gize_lite','0');`);
    await p.goto(base + '/app/'); await wait(2500);
    await p.evaluate(async () => { const c = await import('/app/ui/chat.js');
      await c.openChat({ clientId: '11111111-1111-1111-1111-111111111111', coachId: '33333333-3333-3333-3333-333333333333', name: 'Coach', role: 'client' }); });
    await wait(300);
    const chat = () => p.evaluate(async () => (await import('/app/ui/chat.js')).chatPolling());
    const msgs = () => calls.filter(c => c.startsWith('GET') && c.includes('coach_messages')).length;
    t.eq(await chat(), true, 'chat abierto: revisión de respaldo programada');

    // Pestaña oculta (visibilitychange) → no consulta; al volver, revisa en el acto.
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    t.eq(await chat(), false, 'pestaña oculta: no se consulta el chat');
    const m0 = msgs();
    await p.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await wait(300);
    t.ok(await chat() && msgs() > m0, 'al volver: revisa en el acto y sigue la revisión');

    // "pause" de Capacitor (Android y iPhone).
    await p.evaluate(() => document.dispatchEvent(new Event('pause')));
    t.eq(await chat(), false, 'app en pausa: no se consulta el chat');
    await p.evaluate(() => document.dispatchEvent(new Event('resume'))); await wait(300);
    t.eq(await chat(), true, 'al volver de la pausa la revisión sigue');

    // Chat cerrado: nada periódico.
    await p.evaluate(async () => (await import('/app/ui/chat.js')).closeChat());
    t.eq(await chat(), false, 'chat cerrado: sin revisión periódica');
    t.eq(errs, [], 'chat: errores de la página');
    await close();
  }

  // ---- Batería baja → modo liviano (salvo elección a mano) ----
  {
    const { p, errs, close } = await open(base, BATTERY(0.15, false));
    await p.goto(base + '/app/'); await wait(1200);
    const lite = () => p.evaluate(() => document.documentElement.classList.contains('lite'));
    t.eq(await lite(), true, 'batería al 15 % sin cargar → modo liviano');
    t.eq(await p.evaluate(() => localStorage.getItem('gize_lite')), null, 'no queda anotado como elección');
    // 25 %: sigue liviano (no va y viene); enchufado: sale.
    await p.evaluate(() => { window.__bat.level = 0.25; window.__bat.dispatchEvent(new Event('levelchange')); });
    t.eq(await lite(), true, 'al 25 % sigue liviano (sin ir y venir)');
    await p.evaluate(() => { window.__bat.charging = true; window.__bat.dispatchEvent(new Event('chargingchange')); });
    t.eq(await lite(), false, 'enchufado: vuelve el modo normal');
    t.eq(errs, [], 'batería: errores de la página');
    await close();
  }
  {
    const { p, close } = await open(base, BATTERY(0.1, false) + `localStorage.setItem('gize_lite','0');`);
    await p.goto(base + '/app/'); await wait(1200);
    t.eq(await p.evaluate(() => document.documentElement.classList.contains('lite')), false, 'eligió «no» en Ajustes: aunque haya poca batería, sin liviano');
    await close();
  }
}
