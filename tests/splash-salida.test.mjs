// Salida del splash (el logo armándose): primero se va la marca y después se funde el fondo.
// Antes se iba todo junto y en un iPhone el ícono quedaba como un fantasma encima de la app;
// además nada del splash lleva backdrop-filter (Safari no lo funde con la opacidad de arriba).
// El impacto cuando se cierra la G (la marca late, destello, dos ondas, rayos de luz) y la palabra
// GIZE que sube letra por letra: pasan después de que se traza la G y antes de la salida, y solo
// animan transform/opacity (nada de filter). En la app de Android no van las capas más grandes;
// en el modo liviano y con movimiento reducido no hay impacto y la palabra queda quieta.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const SPY = () => {
  new MutationObserver((ms, o) => { const s = document.getElementById('splash'); if (!s) return; o.disconnect();
    const g = e => e ? getComputedStyle(e) : null, sp = g(s), ic = g(s.querySelector('.sp-marca'));
    const q = sel => g(s.querySelector(sel)) || {};
    const fin = sel => { const c = q(sel); return parseFloat(c.animationDelay) + parseFloat(c.animationDuration); };
    const ini = sel => parseFloat(q(sel).animationDelay);
    window.__sal = { out: sp.animationName, outDelay: parseFloat(sp.animationDelay), icon: ic && ic.animationName, iconDelay: ic && parseFloat(ic.animationDelay),
      iconDur: ic && parseFloat(ic.animationDuration), blur: [s, ...s.querySelectorAll('*')].filter(e => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).length,
      filtro: [s, ...s.querySelectorAll('*')].filter(e => { const f = getComputedStyle(e).filter; return f && f !== 'none'; }).length,
      piezas: [s.querySelectorAll('.sp-onda').length, s.querySelectorAll('.sp-destello').length, s.querySelectorAll('.sp-luces').length,
        s.querySelectorAll('.sp-palabra .sp-l').length, s.querySelectorAll('.sp-polvo i').length, s.querySelectorAll('.sp-carga').length],
      anims: ['.sp-carga', '.sp-pulso', '.sp-destello', '.sp-onda', '.sp-luces', '.sp-palabra .sp-l', '.sp-brillo'].map(x => q(x).animationName),
      visibles: ['.sp-luces', '.sp-onda2', '.sp-onda', '.sp-destello', '.sp-palabra'].map(x => q(x).display !== 'none'),
      arcoFin: fin('.sp-arco'), impacto: ini('.sp-onda'), palabraIni: ini('.sp-palabra .sp-l'),
      ultLetra: fin('.sp-palabra .sp-l:nth-of-type(4)'), brilloFin: fin('.sp-brillo'),
      nodos: s.getAnimations ? s.getAnimations({ subtree: true }).map(a => a.effect && a.effect.target).filter((e, i, a) => a.indexOf(e) === i).length : 0 };
  }).observe(document, { childList: true, subtree: true });
};

export default async function ({ base, t }){
  for (const tema of ['oscuro', 'azul', 'luz', 'rosa']){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [], sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') },
      init: `localStorage.setItem('gize_lite','0');${tema === 'oscuro' ? '' : "localStorage.setItem('gize_tema','" + tema + "');"}` });
    await p.addInitScript(SPY);
    await p.goto(base + '/app/'); await wait(3500);
    const v = await p.evaluate(() => window.__sal || {});
    t.eq([v.icon, v.blur, v.filtro], ['sp-exit', 0, 0], tema + ': la marca tiene su propia salida y nada del splash usa backdrop-filter ni filter');
    t.ok(v.out === 'splash-out' && v.iconDelay + v.iconDur <= v.outDelay + 0.001, tema + ': la marca ya se fue cuando empieza a fundirse el fondo: ' + JSON.stringify([v.iconDelay, v.iconDur, v.outDelay]));
    t.ok(v.outDelay + 0.28 <= 2.25 + 0.001, tema + ': todo en menos de 2,25 s: ' + v.outDelay);
    if (tema === 'oscuro'){
      t.eq(v.piezas, [2, 1, 1, 4, 6, 1], 'el impacto (dos ondas, destello, rayos de luz), la palabra GIZE, las chispas y el anillo de carga');
      t.eq(v.anims, ['sp-carga', 'sp-pulso', 'sp-destello', 'sp-onda', 'sp-luces', 'sp-letra', 'sp-brillo'], 'carga, impacto y palabra animados');
      t.eq(v.visibles, [true, true, true, true, true], 'en la web van todas las luces');
      t.ok(Math.abs(v.impacto - v.arcoFin) <= 0.06, 'el impacto llega cuando se cierra la G: ' + JSON.stringify([v.arcoFin, v.impacto]));
      t.ok(v.palabraIni >= v.impacto && v.ultLetra <= v.iconDelay + 0.001 && v.brilloFin <= v.iconDelay + 0.001,
        'la palabra sube después del impacto y termina antes de la salida: ' + JSON.stringify([v.palabraIni, v.ultLetra, v.brilloFin, v.iconDelay]));
      t.ok(v.nodos > 0 && v.nodos <= 40, 'pocos elementos animados (' + v.nodos + ')');
    }
    t.ok(await p.evaluate(() => !document.getElementById('splash')), tema + ': el splash se va');
    t.eq(errs, [], tema + ': errores de la página');
    await close();
  }

  // App de Android: sin las capas más grandes (rayos de luz y segunda onda); el resto del impacto sí.
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [], sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') },
      init: `Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8, configurable: true });
        Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8, configurable: true });
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
        localStorage.setItem('gize_gpu_lenta','0');` });
    await p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), x => x.abort());
    await p.addInitScript(SPY);
    await p.goto(base + '/app/'); await wait(3000);
    const v = await p.evaluate(() => Object.assign(window.__sal || {}, { cls: document.documentElement.className }));
    t.ok(/android-app/.test(v.cls) && !/\blite\b/.test(v.cls), 'Android: android-app sin liviano: ' + v.cls);
    t.eq(v.visibles, [false, false, true, true, true], 'Android: sin rayos de luz ni segunda onda; la onda, el destello y la palabra sí');
    t.eq(errs, [], 'Android: errores de la página');
    await close();
  }

  // Liviano y movimiento reducido: sin luces del impacto y la palabra quieta y a la vista.
  for (const [nombre, opts, init] of [['liviano', {}, "localStorage.setItem('gize_lite','1');"], ['movimiento reducido', { reducedMotion: 'reduce' }, "localStorage.setItem('gize_lite','0');"]]){
    const { p, errs, close } = await newPage(Object.assign({ user: ALUMNO, state: { days: [], sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') }, init }, opts));
    await p.addInitScript(SPY);
    await p.goto(base + '/app/'); await wait(2500);
    const v = await p.evaluate(() => window.__sal || {});
    t.eq(v.visibles, [false, false, false, false, true], nombre + ': sin luces del impacto, con la palabra');
    t.eq(v.anims.slice(0, 6), ['none', 'none', 'none', 'none', 'none', 'none'], nombre + ': nada del impacto se anima y la palabra queda quieta');
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }
}
