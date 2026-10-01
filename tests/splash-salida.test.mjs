// El splash tranquilo (el logo oficial que aparece suave, la G que se traza, el orbe que respira
// una vez y la palabra GIZE): primero se va la marca y después se funde el fondo. Antes se iba
// todo junto y en un iPhone el ícono quedaba como un fantasma encima de la app; además nada del
// splash lleva backdrop-filter (Safari no lo funde con la opacidad de arriba).
// Liviano para la placa de video (en un iPhone la app quedaba en blanco al arrancar, por falta de
// memoria para capas): pocas piezas chicas animadas, solo transform/opacity/stroke-dashoffset,
// nada de filter, mix-blend ni will-change, y al terminar no queda nada del splash en el DOM.
// En el modo liviano y con movimiento reducido la marca queda quieta y completa.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const SPY = () => {
  new MutationObserver((ms, o) => { const s = document.getElementById('splash'); if (!s) return; o.disconnect();
    const todos = [s, ...s.querySelectorAll('*')], cs = e => getComputedStyle(e);
    const q = sel => { const e = s.querySelector(sel); return e ? cs(e) : {}; };
    // Listas de animaciones ("a, b" / "0.02s, 1.1s") → la última (la salida).
    const ult = v => String(v || '').split(',').pop().trim();
    const fin = c => parseFloat(ult(c.animationDelay)) + parseFloat(ult(c.animationDuration));
    const sp = cs(s), marca = q('.sp-marca');
    const anims = s.getAnimations ? s.getAnimations({ subtree: true }) : [];
    const props = new Set(); anims.forEach(a => a.effect && a.effect.getKeyframes().forEach(k => Object.keys(k).forEach(p => props.add(p))));
    ['offset', 'computedOffset', 'easing', 'composite'].forEach(p => props.delete(p));
    const vw = innerWidth * innerHeight;
    window.__sal = { out: sp.animationName, outDelay: parseFloat(sp.animationDelay), outEnd: fin(sp),
      exit: ult(marca.animationName), exitEnd: fin(marca), palabraEnd: fin(q('.sp-palabra')), txtEnd: fin(q('.splash-txt')),
      filtros: todos.filter(e => { const c = cs(e); return [c.filter, c.backdropFilter, c.webkitBackdropFilter].some(v => v && v !== 'none') || (c.mixBlendMode && c.mixBlendMode !== 'normal'); }).length,
      willChange: todos.filter(e => cs(e).willChange !== 'auto').length,
      viejas: s.querySelectorAll('.sp-luces, .sp-onda, .sp-destello, .sp-rayos, .sp-polvo, .sp-carga, .sp-chispa, .sp-barrido, .sp-estela, .sp-estela-luz, .sp-brillo').length,
      piezas: [!!s.querySelector('.sp-marca[role="img"][aria-label="GIZE"] .sp-orbe .sp-color'), !!s.querySelector('.sp-halo'), s.querySelectorAll('.sp-palabra .sp-l').length],
      quietas: ['.sp-arco', '.sp-orbe', '.sp-halo'].map(x => q(x).animationName), dash: q('.sp-arco').strokeDashoffset,
      nodos: anims.map(a => a.effect && a.effect.target).filter((e, i, a) => e && a.indexOf(e) === i),
      props: [...props].sort() };
    // Ninguna pieza animada (salvo el fondo, que solo se funde al final) es grande.
    window.__sal.grandes = window.__sal.nodos.filter(e => e !== s && (() => { const r = e.getBoundingClientRect(); return r.width * r.height > vw / 4; })()).length;
    window.__sal.nodos = window.__sal.nodos.length;
  }).observe(document, { childList: true, subtree: true });
};

// Después de que se fue: el host vacío y nada en todo el documento con will-change.
const DESPUES = () => ({ splash: !!document.getElementById('splash'), host: document.getElementById('splashHost').childNodes.length,
  booting: document.body.classList.contains('is-booting'),
  willChange: [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).willChange !== 'auto').map(e => String(e.className || e.tagName)).slice(0, 5) });

const STATE = { days: [], sessions: [], weights: [], daily: {} };

export default async function ({ base, t }){
  for (const tema of ['oscuro', 'azul', 'luz', 'rosa']){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') },
      init: `localStorage.setItem('gize_lite','0');${tema === 'oscuro' ? '' : "localStorage.setItem('gize_tema','" + tema + "');"}` });
    await p.addInitScript(SPY);
    await p.goto(base + '/app/'); await wait(3000);
    const v = await p.evaluate(() => window.__sal || {});
    t.eq([v.exit, v.filtros, v.willChange], ['sp-exit', 0, 0], tema + ': la marca tiene su propia salida; nada del splash usa filter, backdrop-filter, mix-blend ni will-change');
    t.ok(v.out === 'splash-out' && Math.max(v.exitEnd, v.palabraEnd, v.txtEnd) <= v.outDelay + 0.001,
      tema + ': la marca, la palabra y el texto ya se fueron cuando empieza a fundirse el fondo: ' + JSON.stringify([v.exitEnd, v.palabraEnd, v.txtEnd, v.outDelay]));
    t.ok(v.outEnd >= 1.35 && v.outEnd <= 1.65, tema + ': tranquilo, entre 1,35 y 1,65 s: ' + v.outEnd);
    t.eq([v.viejas, v.piezas], [0, [true, true, 4]], tema + ': ni rayos, ni ondas, ni destellos, ni chispas: la marca con su orbe y su resplandor, y la palabra GIZE');
    t.ok(v.nodos > 0 && v.nodos <= 12 && v.grandes === 0, tema + ': pocas piezas animadas y chicas (' + v.nodos + ', grandes: ' + v.grandes + ')');
    t.eq(v.props.filter(x => !['opacity', 'transform', 'strokeDashoffset', 'visibility'].includes(x)), [], tema + ': solo se anima opacity, transform y stroke-dashoffset: ' + v.props);
    const d = await p.evaluate(DESPUES);
    t.eq([d.splash, d.host, d.booting], [false, 0, false], tema + ': el splash sale del DOM y el host queda vacío');
    t.eq(d.willChange, [], tema + ': nada en la app queda con will-change');
    t.eq(errs, [], tema + ': errores de la página');
    await close();
  }

  // App de Android: el mismo splash (ya es liviano), y se va.
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') },
      init: `Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8, configurable: true });
        Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8, configurable: true });
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
        localStorage.setItem('gize_gpu_lenta','0');` });
    await p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), x => x.abort());
    await p.addInitScript(SPY);
    await p.goto(base + '/app/'); await wait(3000);
    const v = await p.evaluate(() => Object.assign(window.__sal || {}, { cls: document.documentElement.className }));
    t.ok(/android-app/.test(v.cls) && !/\blite\b/.test(v.cls), 'Android: android-app sin liviano: ' + v.cls);
    t.eq([v.viejas, v.filtros, v.quietas], [0, 0, ['sp-trazo', 'sp-orbe', 'sp-respira']], 'Android: el splash tranquilo, animado y sin filtros');
    const d = await p.evaluate(DESPUES);
    t.eq([d.splash, d.host, d.willChange], [false, 0, []], 'Android: el splash sale del DOM y nada queda con will-change');
    t.eq(errs, [], 'Android: errores de la página');
    await close();
  }

  // Liviano y movimiento reducido: la marca quieta y completa, y se va enseguida.
  for (const [nombre, opts, init, max] of [['liviano', {}, "localStorage.setItem('gize_lite','1');", 0.85], ['movimiento reducido', { reducedMotion: 'reduce' }, "localStorage.setItem('gize_lite','0');", 1]]){
    const { p, errs, close } = await newPage(Object.assign({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init }, opts));
    await p.addInitScript(SPY);
    await p.goto(base + '/app/'); await wait(2500);
    const v = await p.evaluate(() => window.__sal || {});
    t.eq([v.quietas, v.dash, v.piezas[2]], [['none', 'none', 'none'], '0px', 4], nombre + ': la marca quieta y completa, con la palabra');
    t.ok(v.exitEnd <= v.outDelay + 0.001 && v.outEnd <= max + 0.001, nombre + ': sale primero la marca, todo en ' + max + ' s: ' + JSON.stringify([v.exitEnd, v.outDelay, v.outEnd]));
    const d = await p.evaluate(DESPUES);
    t.eq([d.splash, d.host, d.willChange], [false, 0, []], nombre + ': el splash sale del DOM y nada queda con will-change');
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }
}
