// Salida del splash (el ícono de vidrio): primero se va el ícono y después se funde el fondo.
// Antes se iba todo junto y en un iPhone el ícono quedaba como un fantasma encima de la app;
// además el vidrio no lleva backdrop-filter (Safari no lo funde con la opacidad de arriba).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  for (const tema of ['oscuro', 'claro']){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [], sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') },
      init: `localStorage.setItem('gize_lite','0');${tema === 'claro' ? "localStorage.setItem('gize_tema','claro');" : ''}` });
    await p.addInitScript(() => {
      new MutationObserver((ms, o) => { const s = document.getElementById('splash'); if (!s) return; o.disconnect();
        const g = e => e ? getComputedStyle(e) : null, sp = g(s), ic = g(s.querySelector('.sp-icon')), gl = g(s.querySelector('.sp-glass'));
        window.__sal = { out: sp.animationName, outDelay: parseFloat(sp.animationDelay), icon: ic && ic.animationName, iconDelay: ic && parseFloat(ic.animationDelay),
          iconDur: ic && parseFloat(ic.animationDuration), blur: gl && gl.backdropFilter };
      }).observe(document, { childList: true, subtree: true });
    });
    await p.goto(base + '/app/'); await wait(3500);
    const v = await p.evaluate(() => window.__sal || {});
    t.eq([v.icon, v.blur], ['sp-exit', 'none'], tema + ': el ícono tiene su propia salida y el vidrio no usa backdrop-filter');
    t.ok(v.out === 'splash-out' && v.iconDelay + v.iconDur <= v.outDelay + 0.001, tema + ': el ícono ya se fue cuando empieza a fundirse el fondo: ' + JSON.stringify(v));
    t.ok(await p.evaluate(() => !document.getElementById('splash')), tema + ': el splash se va');
    t.eq(errs, [], tema + ': errores de la página');
    await close();
  }
}
