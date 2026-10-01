// Salida del splash (el logo armándose): primero se va la marca y después se funde el fondo.
// Antes se iba todo junto y en un iPhone el ícono quedaba como un fantasma encima de la app;
// además nada del splash lleva backdrop-filter (Safari no lo funde con la opacidad de arriba).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  for (const tema of ['oscuro', 'azul', 'luz', 'rosa']){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [], sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') },
      init: `localStorage.setItem('gize_lite','0');${tema === 'oscuro' ? '' : "localStorage.setItem('gize_tema','" + tema + "');"}` });
    await p.addInitScript(() => {
      new MutationObserver((ms, o) => { const s = document.getElementById('splash'); if (!s) return; o.disconnect();
        const g = e => e ? getComputedStyle(e) : null, sp = g(s), ic = g(s.querySelector('.sp-marca'));
        window.__sal = { out: sp.animationName, outDelay: parseFloat(sp.animationDelay), icon: ic && ic.animationName, iconDelay: ic && parseFloat(ic.animationDelay),
          iconDur: ic && parseFloat(ic.animationDuration), blur: [s, ...s.querySelectorAll('*')].filter(e => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).length };
      }).observe(document, { childList: true, subtree: true });
    });
    await p.goto(base + '/app/'); await wait(3500);
    const v = await p.evaluate(() => window.__sal || {});
    t.eq([v.icon, v.blur], ['sp-exit', 0], tema + ': la marca tiene su propia salida y nada del splash usa backdrop-filter');
    t.ok(v.out === 'splash-out' && v.iconDelay + v.iconDur <= v.outDelay + 0.001, tema + ': la marca ya se fue cuando empieza a fundirse el fondo: ' + JSON.stringify(v));
    t.ok(await p.evaluate(() => !document.getElementById('splash')), tema + ': el splash se va');
    t.eq(errs, [], tema + ': errores de la página');
    await close();
  }
}
