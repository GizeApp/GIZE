// Panel del coach: el mismo ahorro de batería que la app del alumno y el interruptor de «Neón».
// - La apariencia tranquila (css/ui/calma.css) también en el panel: fondo liso con el degradé de la
//   apariencia (sin manchas de color y sin partículas: el canvas está oculto y nunca se dibuja),
//   bordes con el filete fino de un toque de color (linear-gradient a 155°, ya no la gama RGB en
//   conic-gradient), nada gira y sin brillos de colores (solo sombras neutras; lo elegido lleva un
//   resplandor suave y quieto de la marca: css/screens/coach/neon.css).
// - Nada en pantalla gira ni late sin parar.
// - A los ~6 s sin tocar se pone html.fondo-quieto y se saca al deslizar adentro de #coachHost (que
//   tiene su propio scroll, no el del documento); el fondo sigue sin dibujarse.
// - Con la app en segundo plano ("pause") no se dibuja y las animaciones se frenan.
// - Con el neón apagado (gize_neon = "0") ningún borde ni brillo del panel lleva color (queda el
//   azul de acción y el rojo de borrar). El interruptor («Toque de color en los bordes») está en
//   Configuración y cambia html.sin-neon.
// - En «Oscuro» el panel va en vidrio sobre su propia capa de fondo (body.silk-coach::after,
//   css/screens/coach/vidrio.css): quieta (sin animación ni transición), fija detrás de #coachHost.
//   Arriba, dos luces radiales suaves de la marca (alfa ≤ .2: un tinte, no manchas; sin neón, solo
//   grises) que se mueven muy despacio: son lo único que se mueve sin parar en el panel, cada una en
//   su capa chica (.app-aurora::before/::after), sin animación de CSS: app/ui/background.js les
//   cambia solo transform y opacity una vez por segundo, con idas de 40 a 90 s distintas para cada
//   una, corriéndose unos pocos puntos de la pantalla. La aurora de siempre queda tapada y sin
//   pintarse (una sola capa fija de pantalla completa). Las luces se revisan en el celular y en la
//   compu (cada ancho tiene las suyas), con y sin neón. Sin tocar (html.fondo-quieto) siguen; se
//   frenan (y después siguen desde donde quedaron) a los 3 minutos sin tocar, con la app en segundo
//   plano, con la pestaña oculta y detrás del splash.
import { newPage, wait, configCoach } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const SPY = `window.__arc = 0; { const o = CanvasRenderingContext2D.prototype.arc;
  CanvasRenderingContext2D.prototype.arc = function () { window.__arc++; return o.apply(this, arguments); }; }`;

const open = (init, viewport = { width: 390, height: 844 }) => newPage({ user: COACH, viewport, init: `localStorage.setItem('gize_lite','0');${SPY}${init || ''}`,
  handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  } });

// El fondo: el degradé de la apariencia (calculado con un elemento de prueba), las manchas de la
// aurora, el canvas de partículas y cuántas veces se dibujó.
const fondo = () => {
  const ref = document.createElement('div'); ref.style.background = 'var(--gize-calm-bg)'; document.body.appendChild(ref);
  const calm = getComputedStyle(ref).backgroundImage; ref.remove();
  const a = document.querySelector('.app-aurora');
  return { calm, bg: getComputedStyle(a).backgroundImage, spans: [...a.querySelectorAll('span')].map(s => getComputedStyle(s).display),
    canvas: getComputedStyle(document.getElementById('silkCanvas')).display, arc: window.__arc };
};

// La capa del fondo del panel en «Oscuro» (body.silk-coach::after): cómo está puesta, si algo la
// anima, sus luces radiales (los colores que no son negro: el negro es la viñeta de los bordes) y
// todos los colores que pinta. Las luces que se mueven son .app-aurora::before/::after: sus colores
// cuentan como luces de la capa, y mov dice cómo se mueven (ver movimiento()).
const capa = () => {
  const s = getComputedStyle(document.body, '::after');
  if (s.content === 'none') return null;
  const colores = v => (String(v || '').match(/rgba?\([^)]*\)/g) || []).map(c => c.match(/[\d.]+/g).map(Number));
  const radiales = v => (String(v).match(/radial-gradient\((?:[^()]|\([^()]*\))*\)/g) || []);
  const au = document.querySelector('.app-aurora'), ps = ['::before', '::after'].map(p => getComputedStyle(au, p)).filter(q => q.content !== 'none');
  const fondos = [s.backgroundImage, ...ps.map(q => q.backgroundImage)];
  const luces = fondos.flatMap(radiales).map(colores).map(cs => cs.filter(([r, g, b]) => r + g + b > 0)).filter(cs => cs.length);
  const anims = document.getAnimations().filter(a => a.effect && a.effect.target === document.body && a.effect.pseudoElement === '::after').length;
  // Las capas de las luces: animación de CSS (no tiene que haber), will-change y tamaño (en partes de la pantalla).
  const mov = ['::before', '::after'].map(p => [p, getComputedStyle(au, p)]).filter(([, q]) => q.content !== 'none').map(([p, q]) => ({ ps: p,
    anim: q.animationName, trans: q.transitionDuration, will: q.willChange, area: parseFloat(q.width) * parseFloat(q.height) / (innerWidth * innerHeight) }));
  const cssAnims = document.getAnimations().filter(a => a.effect && a.effect.target === au).length;
  return { pos: s.position, z: s.zIndex, pe: s.pointerEvents, inset: [s.top, s.right, s.bottom, s.left].join(' '),
    anim: s.animationName, trans: s.transitionDuration.split(',').every(d => parseFloat(d) === 0), anims, conic: /conic-gradient/.test(s.backgroundImage),
    luces, colores: fondos.flatMap(colores), host: +getComputedStyle(document.getElementById('coachHost')).zIndex, mov, cssAnims,
    aurora: getComputedStyle(au).visibility, bg: s.backgroundImage.replace(/url\("data:[^"]{40}[^"]*"\)/, 'url(grano)').slice(0, 400) };
};
// Las luces (app/ui/background.js): su reloj (segundos de recorrido), si andan y cómo están ahora.
const BG = '/app/ui/background.js';
const luzAhora = async bg => { const m = await import(bg), au = document.querySelector('.app-aurora');
  return Object.assign(m.lucesEstado(), { a: getComputedStyle(au, '::before').transform + ' ' + getComputedStyle(au, '::before').opacity }); };
// Las luces en un punto de su recorrido (0 = una punta, .5 = el medio, 1 = la otra): cuánto se
// corrieron (en % del lado más largo de la pantalla), cuánto crecieron, su brillo y el resto de sus
// estilos (que no tienen que cambiar). Se las pone ahí y se lee en el mismo momento (en el próximo
// segundo vuelven a donde estaban).
const enPunto = async ([bg, f]) => { const m = await import(bg), au = document.querySelector('.app-aurora'), lado = Math.max(innerWidth, innerHeight);
  m.pintarLuces([f, f]);
  return ['::before', '::after'].map(ps => { const q = getComputedStyle(au, ps), mm = new DOMMatrixReadOnly(q.transform === 'none' ? undefined : q.transform);
    return { ps, dx: Math.abs(mm.m41) / lado * 100, dy: Math.abs(mm.m42) / lado * 100, esc: mm.m11, op: +q.opacity, m: q.transform,
      resto: [...q].filter(k => !/^(transform|opacity|--)/.test(k)).map(k => k + ':' + q.getPropertyValue(k)).join(';') }; }); };

// Lo que se ve: animaciones sin fin y lo que gira (en toda la página); y en el panel, la gama RGB
// (conic-gradient), los brillos de color, los filetes y los bordes/brillos/degradés con color.
const scan = () => {
  // Colores de un valor de CSS en 0–255: rgb()/rgba() y color(srgb …), que es como sale un
  // color-mix() calculado. Los casi transparentes no cuentan.
  const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
    const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
    return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
  }).filter(([, , , a = 1]) => a > 0.05);
  const tinte = (v, u) => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > u);
  const sat = v => tinte(v, 70); // color de verdad (la gama, el azul de acción), no un gris azulado
  const FILETE = /linear-gradient\(155deg/;
  const name = (e, ps) => String(e.className && e.className.baseVal === undefined ? e.className : e.tagName).trim().split(/\s+/)[0] + (ps || '');
  const inf = new Set(), spin = new Set(), conic = new Set(), brillos = new Set(), neon = new Set(), filete = [];
  // Las sombras de neon.css tal como quedan calculadas (una caja de prueba en el body, que hereda los tokens).
  const ref = document.createElement('div'); document.body.appendChild(ref);
  const permitidas = new Set(['var(--nn-brillo)', 'var(--nn-brillo-in)', 'var(--nn-raya-brillo)'].map(v => { ref.style.boxShadow = v; return getComputedStyle(ref).boxShadow; })
    .filter(v => v && v !== 'none'));
  ref.remove();
  document.querySelectorAll('*').forEach(e => {
    if (!e.getClientRects().length) return; // no se ve: no anima
    for (const ps of [null, '::before', '::after']){
      const s = getComputedStyle(e, ps);
      if (ps && s.content === 'none') continue;
      const n = name(e, ps);
      if (s.animationName !== 'none' && s.animationIterationCount === 'infinite' && s.animationPlayState !== 'paused') inf.add(n + ':' + s.animationName);
      if (/spin/i.test(s.animationName)) spin.add(n + ':' + s.animationName);
      if (/conic-gradient/.test(s.backgroundImage)) conic.add(n);
      if (!e.closest('#coachHost')) continue;
      // El filete fino: un toque de color en la punta y el resto neutro (blanco translúcido en las
      // apariencias oscuras, rgba(11,13,17,…) en «Claro»); quieto.
      if (FILETE.test(s.backgroundImage)){
        const f = s.backgroundImage.slice(s.backgroundImage.search(FILETE));
        filete.push({ n, toque: tinte(f, 24), neutro: /rgba\((255, 255, 255|11, 13, 17), 0?\.\d+\)/.test(f), anim: s.animationName });
        if (s.animationName !== 'none') spin.add(n + ':' + s.animationName);
      }
      // Brillos: box-shadow, text-shadow y drop-shadow sin ningún color con tinte (sombras neutras).
      // Salvo el resplandor suave y quieto de lo elegido (css/screens/coach/neon.css: el ::before de la
      // pestaña, el día o la opción elegida y la rayita de la pestaña elegida de la ficha), pedido por
      // el dueño («neón a casi todo»): solo si es exactamente una de las sombras de esa hoja
      // (--nn-brillo, --nn-brillo-in, --nn-raya-brillo) y no tiene transición ni animación. Que no gire
      // ni lata lo revisa lo de arriba; sin neón no está.
      const elegido = ((ps === '::before' && e.matches('.on')) || (ps === '::after' && e.matches('.cv-ctab.on'))) && permitidas.has(s.boxShadow) &&
        s.transitionDuration.split(',').every(d => parseFloat(d) === 0) && s.animationName === 'none';
      for (const k of ['boxShadow', 'textShadow', 'filter']) if (tinte(s[k], 24) && !(k === 'boxShadow' && elegido)) brillos.add(n + ' ' + k + ': ' + s[k]);
      // Con el neón apagado no debería quedar ningún borde, brillo ni degradé con color. El rojo de
      // borrar no es neón: se deja.
      if (e.closest('.cfg-danger')) continue;
      if (/conic-gradient/.test(s.backgroundImage) || sat(s.boxShadow) || sat(s.backgroundImage) ||
          (sat(s.borderTopColor) && s.borderTopWidth !== '0px' && s.borderTopStyle !== 'none')) neon.add(n);
    }
  });
  neon.delete('co-tabs::after'); // la rayita azul de la pestaña elegida: color de acción, no neón
  // Lo que mueve app/ui/background.js (las variables de las luces): solo en .app-aurora.
  const mueve = [...document.querySelectorAll('[style*="--cg-"]')].map(e => name(e));
  return { inf: [...inf], mueve, spin: [...spin], conic: [...conic], brillos: [...brillos], neon: [...neon], filete };
};

export default async function ({ base, t }){
  // La apariencia tranquila (neón prendido): filetes quietos con un toque de color, sin la gama ni brillos.
  const calma = (s, donde, conFilete = true) => {
    t.eq(s.conic, [], donde + ': nada con la gama RGB (conic-gradient)');
    t.eq(s.spin, [], donde + ': nada gira (los bordes quedan quietos)');
    t.eq(s.brillos, [], donde + ': sin brillos de colores (box-shadow, text-shadow, drop-shadow)');
    if (conFilete) t.ok(s.filete.length > 0 && s.filete.every(f => f.toque && f.neutro && f.anim === 'none'),
      donde + ': los bordes son el filete fino con un toque de color: ' + JSON.stringify(s.filete.slice(0, 4)));
  };
  // Si las luces andan: el reloj avanza (~1 s por segundo) y cambian (a la vuelta de un segundo).
  const andan = async p => { const a = await p.evaluate(luzAhora, BG); await wait(2300); const b = await p.evaluate(luzAhora, BG);
    return { ok: a.andando && b.andando && b.t - a.t >= 1.5 && b.t - a.t <= 3.5 && a.a !== b.a, a, b }; };
  // Si están frenadas: no andan y en 1,5 s ni el reloj ni las luces cambian (el freno llega en el próximo segundo).
  const frenadas = async p => { await wait(1200); const a = await p.evaluate(luzAhora, BG); await wait(1500); const b = await p.evaluate(luzAhora, BG);
    return { ok: !a.andando && !b.andando && a.t === b.t && a.a === b.a, a, b }; };
  // Cómo se mueven: dos capas chicas con will-change, sin animación de CSS (con una, Chromium despierta
  // al compositor en cada cuadro y recalcula las capas en cada cuadro del scroll); las mueve
  // app/ui/background.js una vez por segundo, con idas largas (40–90 s) y distintas (no se ve un ciclo).
  const movimiento = async (p, c, donde) => {
    const m = (c && c.mov) || [];
    t.eq(m.map(x => x.ps), ['::before', '::after'], donde + ': las dos luces tienen su capa (.app-aurora::before/::after)');
    t.ok(m.length === 2 && m.every(x => x.anim === 'none' && parseFloat(x.trans) === 0) && c.cssAnims === 0,
      donde + ': sin animación ni transición de CSS: ' + JSON.stringify([m, c && c.cssAnims]));
    t.ok(m.length === 2 && m.every(x => x.will === 'transform, opacity' && x.area <= 0.4) && m.reduce((a, x) => a + x.area, 0) <= 0.6,
      donde + ': cada luz es una capa chica con will-change (≤ 40 % de la pantalla, las dos ≤ 60 %): ' + JSON.stringify(m.map(x => [x.will, +x.area.toFixed(2)])));
    const idas = await p.evaluate(async bg => (await import(bg)).LUCES.map(l => l.ida), BG);
    t.ok(idas.length === 2 && idas.every(x => x >= 40 && x <= 90) && idas[0] !== idas[1], donde + ': idas largas (40–90 s) y distintas: ' + JSON.stringify(idas));
    const an = await andan(p);
    t.ok(an.ok, donde + ': las luces andan (una vez por segundo): ' + JSON.stringify([an.a, an.b]));
  };
  // Dónde llegan: en una punta, en el medio y en la otra. Se corren unos pocos puntos de la pantalla
  // (≤ 5 % del lado más largo), crecen y se achican poco (±10 %) y respiran (35–100 % de brillo);
  // en el medio están como quietas (sin correrse, a 70 %); solo cambian transform y opacity.
  const recorrido = async (p, donde) => {
    const pts = []; for (const f of [0, 0.5, 1]) pts.push(await p.evaluate(enPunto, [BG, f]));
    const todas = pts.flat();
    t.ok(todas.length === 6 && todas.every(v => v.dx <= 5 && v.dy <= 5 && v.esc >= 0.9 && v.esc <= 1.1 && v.op >= 0.35 && v.op <= 1),
      donde + ': las luces se corren poco (≤ 5 %), cambian poco de tamaño y respiran: ' + JSON.stringify(todas.map(v => [v.ps, +v.dx.toFixed(2), +v.dy.toFixed(2), +v.esc.toFixed(3), v.op])));
    t.ok(pts[1].length === 2 && pts[1].every(v => v.dx === 0 && v.dy === 0 && v.esc === 1 && v.op === 0.7), donde + ': en el medio, como quietas: ' + JSON.stringify(pts[1].map(v => [v.m, v.op])));
    t.ok(pts[0].length === 2 && pts[0].every((v, i) => v.m !== pts[2][i].m && v.op !== pts[2][i].op), donde + ': y se mueven de verdad (de una punta a la otra cambian)');
    t.ok(pts[0].length === 2 && pts.every(pt => pt.every((v, i) => v.resto === pts[0][i].resto)), donde + ': de lo demás de las capas no cambia nada (solo transform y opacity)');
  };

  // ---- Neón prendido (apariencia tranquila): ahorro de batería en el panel ----
  {
    // «Azul» antes tenía partículas; ahora, como todas las apariencias, va con fondo liso en degradé.
    const { p, errs, close } = await open("localStorage.setItem('gize_tema','azul');");
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.$('#coachHost .co-wrap'), 'se ve el panel del coach');
    const f0 = await p.evaluate(fondo); await wait(400);
    t.ok(/^linear-gradient\(/.test(f0.calm) && f0.bg === f0.calm && !/radial-gradient/.test(f0.bg), 'el fondo del panel es el degradé liso de la apariencia: ' + f0.bg.slice(0, 70));
    t.ok(f0.spans.length > 0 && f0.spans.every(d => d === 'none'), 'sin las manchas de color de la aurora: ' + JSON.stringify(f0.spans));
    t.eq([f0.canvas, f0.arc, (await p.evaluate(() => window.__arc)) - f0.arc], ['none', 0, 0], 'sin partículas: el canvas oculto y nunca se dibuja');
    t.eq(await p.evaluate(capa), null, '«Azul»: sin la capa de vidrio del panel (es solo de «Oscuro»)');
    const s0 = await p.evaluate(scan);
    t.eq([s0.inf, s0.mueve], [[], []], 'lista: nada gira ni late sin parar (en «Azul» tampoco las luces del fondo)');
    t.eq((await p.evaluate(luzAhora, BG)).andando, false, '«Azul»: las luces del panel no andan');
    calma(s0, 'lista');
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
    const s1 = await p.evaluate(scan);
    t.eq(s1.inf, [], 'ficha: nada gira ni late sin parar');
    calma(s1, 'ficha');

    // ~6 s sin tocar: html.fondo-quieto (el fondo sigue sin dibujarse).
    await wait(6500);
    const q = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('fondo-quieto'), arc: window.__arc }));
    await wait(600);
    t.ok(q.cls, 'panel sin tocar: html.fondo-quieto');
    t.eq([q.arc, (await p.evaluate(() => window.__arc)) - q.arc], [0, 0], 'panel sin tocar: el fondo no se dibuja');

    // Deslizar adentro de #coachHost (scroll propio, no el del documento) saca html.fondo-quieto.
    await p.evaluate(() => { const h = document.getElementById('coachHost'), d = document.createElement('div'); d.style.height = '3000px'; h.appendChild(d); h.scrollTop = 300; });
    await wait(500);
    const w = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('fondo-quieto'), arc: window.__arc, top: document.getElementById('coachHost').scrollTop, doc: scrollY }));
    t.ok(w.top > 0 && w.doc === 0, 'el scroll es el de #coachHost: ' + JSON.stringify(w));
    t.eq([w.cls, w.arc - q.arc], [false, 0], 'al deslizar en el panel sale de html.fondo-quieto y el fondo sigue sin dibujarse');

    // Segundo plano.
    await p.evaluate(() => document.dispatchEvent(new Event('pause'))); await wait(200);
    const a0 = await p.evaluate(() => window.__arc); await wait(500);
    t.eq([(await p.evaluate(() => window.__arc)) - a0, await p.evaluate(() => document.documentElement.classList.contains('app-pausada'))], [0, true],
      'panel en segundo plano: no se dibuja y las animaciones se frenan');
    await p.evaluate(() => document.dispatchEvent(new Event('resume')));

    // Las pestañas de la ficha también tranquilas.
    for (const tab of ['rutina', 'plan']){
      await p.click(`[data-coach="client-tab"][data-t="${tab}"]`); await wait(600);
      const s = await p.evaluate(scan);
      t.eq(s.inf, [], 'pestaña ' + tab + ': nada gira ni late sin parar');
      calma(s, 'pestaña ' + tab, false);
    }
    t.eq(await p.evaluate(() => window.__arc), 0, 'en todo el recorrido el fondo nunca se dibujó');
    t.eq(errs, [], 'errores de la página');
    await close();
  }

  // ---- «Oscuro» con neón: el vidrio sobre su capa de fondo, quieta y con luces suaves ----
  {
    const { p, errs, close } = await open('');
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.$('#coachHost .co-wrap'), 'Oscuro: se ve el panel del coach');
    t.ok(!/tema-/.test(await p.evaluate(() => document.documentElement.className)), 'Oscuro: sin clase de otra apariencia');
    const f0 = await p.evaluate(fondo);
    t.ok(/^linear-gradient\(/.test(f0.calm) && f0.bg === f0.calm, 'Oscuro: la aurora sigue con el degradé liso de la apariencia (calma.css): ' + f0.bg.slice(0, 70));
    t.ok(f0.spans.length > 0 && f0.spans.every(d => d === 'none'), 'Oscuro: sin las manchas de color de la aurora: ' + JSON.stringify(f0.spans));
    t.eq([f0.canvas, f0.arc], ['none', 0], 'Oscuro: sin partículas');
    const c0 = await p.evaluate(capa);
    t.ok(!!c0, 'Oscuro: el panel tiene su capa de fondo (body.silk-coach::after)');
    if (c0){
      t.eq([c0.pos, c0.inset, c0.pe], ['fixed', '0px 0px 0px 0px', 'none'], 'la capa del fondo es fija, de pantalla completa y no recibe toques');
      t.ok(+c0.z < c0.host, 'la capa queda detrás de #coachHost: z ' + c0.z + ' < ' + c0.host);
      t.eq([c0.anim, c0.trans, c0.anims, c0.conic], ['none', true, 0, false], 'la capa del fondo está quieta: sin animación, sin transición y sin la gama (conic-gradient)');
      t.ok(c0.luces.length >= 1 && c0.luces.every(cs => cs.every(([, , , a = 1]) => a <= 0.2)),
        'las luces del fondo son suaves (alfa ≤ .2): ' + JSON.stringify(c0.luces));
      t.ok(c0.luces.some(cs => cs.some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24)), 'con neón, las luces llevan el tinte de la marca: ' + c0.bg);
      t.eq(c0.aurora, 'hidden', 'la aurora de abajo no se pinta (queda una sola capa fija de pantalla completa)');
      await movimiento(p, c0, 'Oscuro, celular');
      await recorrido(p, 'Oscuro, celular');
    }
    await wait(500);
    t.eq((await p.evaluate(capa) || {}).bg, c0 && c0.bg, 'la capa del fondo no cambia sola');
    const s0 = await p.evaluate(scan);
    t.eq(s0.inf, [], 'Oscuro, lista: nada gira ni late sin parar (tampoco las luces: no son una animación de CSS)');
    t.eq(s0.mueve, ['gize-aurora'], 'Oscuro, lista: lo único que se mueve son las dos luces del fondo (las variables de .app-aurora)');
    calma(s0, 'Oscuro, lista');
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
    const s1 = await p.evaluate(scan);
    t.eq([s1.inf, s1.mueve], [[], ['gize-aurora']], 'Oscuro, ficha: nada gira ni late sin parar (salvo las luces del fondo)');
    calma(s1, 'Oscuro, ficha');
    for (const tab of ['rutina', 'plan']){
      await p.click(`[data-coach="client-tab"][data-t="${tab}"]`); await wait(600);
      const s = await p.evaluate(scan);
      t.eq([s.inf, s.mueve], [[], ['gize-aurora']], 'Oscuro, pestaña ' + tab + ': nada gira ni late sin parar (salvo las luces del fondo)');
      calma(s, 'Oscuro, pestaña ' + tab, false);
    }
    // ~6 s sin tocar (html.fondo-quieto): la capa sigue igual, nada se dibuja y las luces siguen (van
    // tan despacio que mientras se usa el panel casi no se notan: frenarlas ahí sería no verlas nunca).
    await wait(6500);
    t.eq([await p.evaluate(() => document.documentElement.classList.contains('fondo-quieto')), (await p.evaluate(capa) || {}).bg], [true, c0 && c0.bg],
      'Oscuro sin tocar: html.fondo-quieto y la capa del fondo igual');
    { const r = await andan(p); t.ok(r.ok, 'Oscuro sin tocar: las luces siguen: ' + JSON.stringify([r.a, r.b])); }
    // A los 3 minutos sin tocar se frenan (se adelanta el reloj de la página); con el primer toque siguen.
    await p.evaluate(() => { const o = Date.now; window.__now = o; Date.now = () => o() + 4 * 60 * 1000; });
    { const r = await frenadas(p); t.ok(r.ok, 'Oscuro, 3 minutos sin tocar: las luces se frenan: ' + JSON.stringify([r.a, r.b])); }
    await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
    { const r = await andan(p); t.ok(r.ok, 'Oscuro, con el primer toque las luces siguen: ' + JSON.stringify([r.a, r.b])); }
    await p.evaluate(() => { Date.now = window.__now; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })); });
    // En segundo plano (Capacitor manda "pause") se frenan; al volver, siguen desde donde quedaron.
    await p.evaluate(() => document.dispatchEvent(new Event('pause')));
    { const r = await frenadas(p); t.ok(r.ok, 'Oscuro en segundo plano: las luces se frenan: ' + JSON.stringify([r.a, r.b]));
      await p.evaluate(() => document.dispatchEvent(new Event('resume'))); await wait(100);
      const v = await p.evaluate(luzAhora, BG); t.ok(v.andando && v.t === r.b.t && v.a === r.b.a, 'Oscuro de vuelta: siguen desde donde quedaron (sin saltar): ' + JSON.stringify([r.b, v])); }
    { const r = await andan(p); t.ok(r.ok, 'Oscuro de vuelta: las luces siguen: ' + JSON.stringify([r.a, r.b])); }
    // Con la pestaña oculta (visibilitychange) también se frenan; al volver, siguen.
    const oculta = h => p.evaluate(h => { if (h) { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); } else { delete document.visibilityState; delete document.hidden; }
      document.dispatchEvent(new Event('visibilitychange')); }, h);
    await oculta(true);
    { const r = await frenadas(p); t.ok(r.ok, 'Oscuro con la pestaña oculta: las luces se frenan: ' + JSON.stringify([r.a, r.b])); }
    await oculta(false);
    { const r = await andan(p); t.ok(r.ok, 'Oscuro, pestaña a la vista otra vez: las luces siguen: ' + JSON.stringify([r.a, r.b])); }
    // Mientras está el splash (body.is-booting) tampoco se mueven; arrancan cuando se va.
    await p.evaluate(() => document.body.classList.add('is-booting'));
    { const r = await frenadas(p); t.ok(r.ok, 'Oscuro detrás del splash: las luces quietas: ' + JSON.stringify([r.a, r.b])); }
    await p.evaluate(() => { document.body.classList.remove('is-booting'); document.dispatchEvent(new Event('gize:splash-fin')); });
    { const r = await andan(p); t.ok(r.ok, 'Oscuro, sin el splash: las luces andan: ' + JSON.stringify([r.a, r.b])); }
    t.eq(await p.evaluate(() => window.__arc), 0, 'Oscuro: en todo el recorrido el fondo de partículas nunca se dibujó');
    t.eq(errs, [], 'Oscuro: errores de la página');
    await close();
  }

  // ---- Neón apagado: el panel sobrio, y el interruptor en Configuración ----
  {
    const { p, errs, close } = await open(`localStorage.setItem('gize_neon','0');`);
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => document.documentElement.classList.contains('sin-neon')), 'gize_neon = 0 → html.sin-neon');
    const f = await p.evaluate(fondo);
    t.ok(/^linear-gradient\(/.test(f.calm) && f.bg === f.calm, 'sin neón: el fondo también es el degradé liso: ' + f.bg.slice(0, 70));
    t.eq([f.canvas, f.arc], ['none', 0], 'sin neón: sin partículas');
    const cs = await p.evaluate(capa);
    t.ok(!!cs, 'sin neón: el panel también tiene su capa de fondo');
    if (cs){
      t.eq([cs.anim, cs.trans, cs.anims], ['none', true, 0], 'sin neón: la capa del fondo está quieta');
      t.ok(cs.luces.length >= 1 && cs.luces.every(l => l.every(([, , , a = 1]) => a <= 0.2)), 'sin neón: luces suaves (alfa ≤ .2): ' + JSON.stringify(cs.luces));
      t.ok(cs.colores.every(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) <= 24), 'sin neón: la capa del fondo y las luces son solo gris (sin tinte): ' + cs.bg);
      await movimiento(p, cs, 'sin neón, celular');
    }
    const s0 = await p.evaluate(scan);
    t.eq(s0.neon, [], 'sin neón: la lista no tiene bordes ni brillos de colores');
    t.eq(s0.filete, [], 'sin neón: la lista sin el filete de color (blanco y gris)');
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
    t.eq((await p.evaluate(scan)).neon, [], 'sin neón: la ficha no tiene bordes ni brillos de colores');
    for (const tab of ['rutina', 'plan']){
      await p.click(`[data-coach="client-tab"][data-t="${tab}"]`); await wait(600);
      t.eq((await p.evaluate(scan)).neon, [], 'sin neón: pestaña ' + tab + ' sin bordes ni brillos de colores');
    }
    // Configuración → «Apariencia» (la pantalla de Configuración del coach, con su menú de secciones).
    await configCoach(p, 'apariencia'); await wait(500);
    const sw = await p.$('#coachHost [data-neon-toggle], [data-neon-toggle]');
    t.ok(!!sw, 'Configuración del coach tiene el interruptor de Neón');
    if (sw){
      t.has(await p.evaluate(() => { const e = document.querySelector('[data-neon-toggle]').closest('.cs-neon, .cs-field'); return e ? e.textContent : ''; }),
        'Toque de color en los bordes', 'el interruptor dice qué hace');
      t.eq(await sw.getAttribute('aria-checked'), 'false', 'el interruptor arranca apagado');
      await sw.click(); await wait(200);
      t.eq(await p.evaluate(() => [document.documentElement.classList.contains('sin-neon'), localStorage.getItem('gize_neon')]), [false, null], 'prenderlo saca html.sin-neon');
      calma(await p.evaluate(scan), 'neón prendido desde Configuración');
      const cp = await p.evaluate(capa);
      t.ok(!!cp && cp.luces.some(cs => cs.some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24)), 'neón prendido desde Configuración: las luces del fondo con el tinte de la marca');
      await sw.click(); await wait(200);
      t.eq(await p.evaluate(() => [document.documentElement.classList.contains('sin-neon'), localStorage.getItem('gize_neon')]), [true, '0'], 'apagarlo pone html.sin-neon y queda guardado');
      t.eq((await p.evaluate(scan)).filete, [], 'apagado otra vez: sin el filete de color');
      const ca = await p.evaluate(capa);
      t.ok(!!ca && ca.colores.every(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) <= 24), 'apagado otra vez: la capa del fondo vuelve a gris');
    }
    t.eq(errs, [], 'sin neón: errores de la página');
    await close();
  }
  // ---- La capa del fondo en la compu (1440 × 900): las luces de la compu, con y sin neón ----
  for (const [nombre, init] of [['con neón', ''], ['sin neón', "localStorage.setItem('gize_neon','0');"]]){
    const { p, errs, close } = await open(init, { width: 1440, height: 900 });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.$('#coachHost .co-wrap'), 'compu, ' + nombre + ': se ve el panel del coach');
    t.ok(await p.evaluate(() => matchMedia('(min-width: 900px)').matches), 'compu, ' + nombre + ': es el ancho de la compu (sus luces, no las del celular)');
    const c = await p.evaluate(capa);
    t.ok(!!c, 'compu, ' + nombre + ': el panel tiene su capa de fondo');
    if (c){
      t.eq([c.pos, c.inset, c.anim, c.trans, c.anims], ['fixed', '0px 0px 0px 0px', 'none', true, 0], 'compu, ' + nombre + ': la capa es fija, de pantalla completa y quieta');
      t.ok(c.luces.length >= 1 && c.luces.every(cs => cs.every(([, , , a = 1]) => a <= 0.2)), 'compu, ' + nombre + ': las luces del fondo son suaves (alfa ≤ .2): ' + JSON.stringify(c.luces));
      if (init) t.ok(c.colores.every(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) <= 24), 'compu, sin neón: la capa del fondo y las luces son solo gris (sin tinte): ' + c.bg);
      else t.ok(c.luces.some(cs => cs.some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24)), 'compu, con neón: las luces llevan el tinte de la marca: ' + c.bg);
      t.eq(c.aurora, 'hidden', 'compu, ' + nombre + ': la aurora de abajo no se pinta');
      await movimiento(p, c, 'compu, ' + nombre);
      await recorrido(p, 'compu, ' + nombre);
    }
    t.eq(errs, [], 'compu, ' + nombre + ': errores de la página');
    await close();
  }
}
