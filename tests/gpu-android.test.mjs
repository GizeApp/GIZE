// La placa de video (Play Console: ANR «La GPU no responde» al abrir la app en un Galaxy A13).
// - Mientras está el splash no se dibuja el fondo de partículas ni corren las animaciones
//   infinitas de atrás; arrancan cuando el splash se va.
// - Con la app en segundo plano (Capacitor manda "pause"/"resume") el fondo se frena.
// - App de Android (html.android-app): ningún backdrop-filter, con cualquier apariencia.
// - Android de gama baja (4 núcleos o menos, o placa de video lenta) → modo liviano, salvo que
//   se haya elegido a mano en Ajustes. En la web no cambia nada.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };

// Cuenta los círculos que se dibujan en un canvas, antes y después de que se vaya el splash,
// y anota cómo está la aurora (animación) mientras el splash está.
const SPY = () => {
  window.__arc = { boot: 0, after: 0 };
  const o = CanvasRenderingContext2D.prototype.arc;
  CanvasRenderingContext2D.prototype.arc = function () {
    if (document.body && document.body.classList.contains('is-booting')) window.__arc.boot++; else window.__arc.after++;
    return o.apply(this, arguments);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.querySelector('.app-aurora span');
    window.__auroraBoot = s ? getComputedStyle(s).animationPlayState : 'falta';
  });
};

// Navegador del celular (memoria y núcleos) y, si android, el Capacitor de la app.
const device = ({ android, mem, cores }) => `
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => ${mem}, configurable: true });
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => ${cores}, configurable: true });
  ${android ? `window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };` : ''}`;

async function open(base, init){
  const r = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init });
  await r.p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), x => x.abort());
  return r;
}

export default async function ({ base, t }){
  // ---- Web, equipo bueno: el fondo espera al splash y se frena en segundo plano ----
  {
    const { p, errs, close } = await open(base, `localStorage.setItem('gize_lite','0');(${SPY})();`);
    await p.goto(base + '/app/'); await wait(3500);
    const v = await p.evaluate(() => ({ arc: window.__arc, aurora: window.__auroraBoot, cls: document.documentElement.className,
      nav: getComputedStyle(document.querySelector('.navbar')).backdropFilter, splash: !!document.getElementById('splash') }));
    t.ok(!v.splash, 'web: el splash se fue');
    t.eq(v.arc.boot, 0, 'web: mientras está el splash no se dibuja el fondo de partículas');
    t.ok(v.arc.after > 0, 'web: cuando se va el splash el fondo arranca: ' + JSON.stringify(v.arc));
    t.eq(v.aurora, 'paused', 'web: la aurora espera quieta detrás del splash');
    t.ok(!/android-app|lite/.test(v.cls), 'web: ni android-app ni liviano en un equipo bueno: ' + v.cls);
    t.ok(v.nav && v.nav !== 'none', 'web: la barra de abajo conserva el desenfoque: ' + v.nav);

    // Segundo plano (Capacitor "pause"): no se dibuja más y las animaciones se frenan.
    await p.evaluate(() => document.dispatchEvent(new Event('pause'))); await wait(200);
    const a0 = await p.evaluate(() => window.__arc.after); await wait(500);
    const s = await p.evaluate(() => ({ arc: window.__arc.after, cls: document.documentElement.classList.contains('app-pausada'),
      ps: getComputedStyle(document.querySelector('.app-aurora span')).animationPlayState }));
    t.eq([s.arc - a0, s.cls, s.ps], [0, true, 'paused'], 'web: en segundo plano el fondo y las animaciones se frenan');
    await p.evaluate(() => document.dispatchEvent(new Event('resume'))); await wait(500);
    const r = await p.evaluate(() => ({ arc: window.__arc.after, cls: document.documentElement.classList.contains('app-pausada') }));
    t.ok(r.arc > s.arc && !r.cls, 'web: al volver el fondo sigue');
    t.eq(errs, [], 'web: errores de la página');
    await close();
  }

  // ---- Android, equipo bueno: sin backdrop-filter (en todas las apariencias), sin liviano ----
  for (const tema of ['oscuro', 'azul', 'rosa', 'luz']){
    const { p, errs, close } = await open(base, device({ android: true, mem: 8, cores: 8 }) +
      `localStorage.setItem('gize_gpu_lenta','0');${tema === 'oscuro' ? '' : "localStorage.setItem('gize_tema','" + tema + "');"}`);
    await p.goto(base + '/app/'); await wait(3000);
    const v = await p.evaluate(() => ({ cls: document.documentElement.className,
      blur: [...document.querySelectorAll('*')].filter(e => ['', '::before', '::after'].some(ps => { const b = getComputedStyle(e, ps || null).backdropFilter; return b && b !== 'none'; }))
        .map(e => String(e.className || e.tagName)).slice(0, 5),
      w: document.getElementById('silkCanvas').width, iw: innerWidth, nav: getComputedStyle(document.querySelector('.navbar')).backgroundColor }));
    t.ok(/android-app/.test(v.cls) && !/\blite\b/.test(v.cls), tema + ': Android bueno → android-app, sin liviano: ' + v.cls);
    t.eq(v.blur, [], tema + ': en Android nada usa backdrop-filter');
    t.ok(!/rgba\(.*, 0\.\d+\)$/.test(v.nav), tema + ': la barra de abajo es sólida: ' + v.nav);
    t.ok(v.w <= v.iw, tema + ': el fondo va a un píxel por punto: ' + v.w + ' / ' + v.iw);
    t.eq(errs, [], tema + ' (Android): errores de la página');
    await close();
  }

  // ---- Detección de gama baja ----
  const cases = [
    ['Android con 4 núcleos', device({ android: true, mem: 8, cores: 4 }) + "localStorage.setItem('gize_gpu_lenta','0');", true],
    ['Android con 4 GB (Galaxy A13)', device({ android: true, mem: 4, cores: 8 }) + "localStorage.setItem('gize_gpu_lenta','0');", true],
    ['Android con placa lenta', device({ android: true, mem: 8, cores: 8 }) + "localStorage.setItem('gize_gpu_lenta','1');", true],
    ['Android de gama baja pero eligió «no» en Ajustes', device({ android: true, mem: 4, cores: 4 }) + "localStorage.setItem('gize_lite','0');", false],
    ['web con 4 núcleos', device({ android: false, mem: 8, cores: 4 }), false],
  ];
  for (const [name, init, lite] of cases){
    const { p, close } = await open(base, init);
    await p.goto(base + '/app/'); await wait(400);
    t.eq(await p.evaluate(() => document.documentElement.classList.contains('lite')), lite, name + (lite ? ' → liviano' : ' → sin liviano'));
    await close();
  }
}
