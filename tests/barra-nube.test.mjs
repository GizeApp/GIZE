// La barra de abajo como «nube» (pedido: «que los botones de abajo sean como los de Instagram,
// una nubecita que se achica al bajar y crece un poco al subir»; css/core/layout.css y
// app/ui/nube.js). Flota despegada de los bordes (margen a los costados y abajo), la pestaña
// elegida va en una píldora interna más clara (en «Claro», negra), al bajar se achica (.compacta y
// una caja más chica) y al subir o al llegar al final vuelve a su tamaño. Lo último de una pantalla
// larga se puede ver entero por encima de la barra, y la barra del descanso va justo arriba de ella
// (y baja con ella cuando se achica). Con movimiento reducido cambia sin animación. En GIZE básico
// (Android) no hay desenfoque: relleno sólido, pero la misma forma y el mismo achique.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const EX = Array.from({ length: 8 }, (_, i) => ({ id: 'e' + i, name: 'Ejercicio ' + (i + 1), rest: '1:30',
  sets: [{ id: 's' + i + 'a', kg: '60', reps: '8' }, { id: 's' + i + 'b', kg: '60', reps: '8' }] }));
const STATE = { days: [{ id: 'd1', name: 'Torso', exercises: EX }], sessions: [], weights: [], daily: {} };

const caja = p => p.evaluate(() => { const n = document.querySelector('.navbar'), r = n.getBoundingClientRect();
  return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight,
    compacta: n.classList.contains('compacta'), blur: getComputedStyle(n).backdropFilter, radio: getComputedStyle(n).borderTopLeftRadius,
    fondo: getComputedStyle(n).backgroundColor, dur: getComputedStyle(n).transitionDuration }; });
const pildora = (p, id) => p.evaluate(id => { const s = getComputedStyle(document.getElementById(id)); return { bg: s.backgroundColor, radio: s.borderTopLeftRadius, color: s.color }; }, id);
const bajar = async (p, y) => { await p.evaluate(y => window.scrollTo(0, y), y); await wait(650); };

async function abrir(base, init, extra){
  const r = await newPage(Object.assign({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') }, init }, extra));
  await r.p.goto(base + '/app/'); await wait(3000);
  return r;
}

export default async function ({ base, t }){
  // ---- «Oscuro», web ----
  {
    const { p, errs, close } = await abrir(base, "localStorage.setItem('gize_lite','0');");
    const a = await caja(p);
    t.ok(a.l >= 8 && a.iw - a.r >= 8, 'flota con margen a los costados: ' + a.l + ' / ' + (a.iw - a.r));
    t.ok(a.ih - a.b >= 8, 'flota con margen abajo: ' + (a.ih - a.b));
    t.ok(parseFloat(a.radio) >= a.h / 2, 'es una píldora (bordes redondos): ' + a.radio);
    t.ok(a.blur && a.blur !== 'none', 'vidrio esmerilado (backdrop-filter): ' + a.blur);
    t.ok(/rgba\(.*, 0\.\d+\)$/.test(a.fondo), 'el relleno es translúcido (se ve pasar el contenido): ' + a.fondo);
    t.ok(!a.compacta, 'arriba de todo va abierta');
    const on = await pildora(p, 'nav-entreno'), off = await pildora(p, 'nav-habitos');
    t.ok(on.bg !== 'rgba(0, 0, 0, 0)' && parseFloat(on.radio) >= 20, 'la pestaña elegida lleva la píldora interna: ' + JSON.stringify(on));
    t.eq(off.bg, 'rgba(0, 0, 0, 0)', 'las otras pestañas sin píldora');
    t.ok(await p.evaluate(() => [...document.querySelectorAll('.nav-item span')].every(s => getComputedStyle(s).opacity === '1' && s.offsetWidth > 0)), 'abierta: con los nombres');

    // Bajar → se achica.
    await bajar(p, 200);
    const c = await caja(p);
    t.ok(c.compacta, 'al bajar se achica (.compacta)');
    t.ok(c.w < a.w - 20 && c.h < a.h - 4, 'compacta: más angosta y más baja: ' + [a.w, a.h] + ' → ' + [Math.round(c.w), Math.round(c.h)]);
    t.ok(c.ih - c.b >= 8 && c.l > a.l, 'compacta sigue flotando');
    t.ok(await p.evaluate(() => [...document.querySelectorAll('.nav-item span')].every(s => getComputedStyle(s).opacity === '0')), 'compacta: sin los nombres');
    // Un temblor de pocos píxeles no la cambia.
    await bajar(p, 196);
    t.ok((await caja(p)).compacta, 'un movimiento de pocos píxeles hacia arriba no la abre');
    // Subir → vuelve.
    await bajar(p, 120);
    const s = await caja(p);
    t.ok(!s.compacta && Math.abs(s.w - a.w) < 1 && Math.abs(s.h - a.h) < 1, 'al subir vuelve a su tamaño: ' + [Math.round(s.w), Math.round(s.h)]);
    await bajar(p, 400);
    t.ok((await caja(p)).compacta, 'bajando otra vez se achica');

    // Al final de la pantalla: abierta, y lo último se ve entero por encima de la barra.
    await bajar(p, 1e6);
    const f = await p.evaluate(() => { const v = document.getElementById('view'), u = v.lastElementChild.getBoundingClientRect(), n = document.querySelector('.navbar');
      return { u: u.bottom, n: n.getBoundingClientRect().top, compacta: n.classList.contains('compacta'), alto: document.documentElement.scrollHeight > innerHeight + 200 }; });
    t.ok(f.alto, 'la pantalla de prueba es larga');
    t.ok(!f.compacta, 'al llegar al final se abre');
    t.ok(f.u <= f.n - 8, 'lo último de la pantalla queda por encima de la barra: ' + Math.round(f.u) + ' / ' + Math.round(f.n));

    // La barra del descanso, justo arriba de la nube, y baja con ella cuando se achica.
    await bajar(p, 0);
    await p.evaluate(async () => { const { state, State } = await import('/app/core/state.js'); const e = await import('/app/screens/entreno.js'), m = await import('/app/main.js');
      state.days[0].exercises.forEach(x => e.expandedOverride.add(x.id)); m.renderApp(); });
    await wait(300); await p.click('.done[data-set="s0a"]'); await wait(700);
    const rb = () => p.evaluate(() => { const r = document.querySelector('#restBar .rest-inner'), n = document.querySelector('.navbar').getBoundingClientRect();
      return r ? { r: r.getBoundingClientRect().bottom, n: n.top } : null; });
    const r1 = await rb();
    t.ok(r1 && r1.r <= r1.n - 4 && r1.n - r1.r < 30, 'el descanso va justo arriba de la barra: ' + JSON.stringify(r1));
    await bajar(p, 300);
    const r2 = await rb();
    t.ok(r2 && (await caja(p)).compacta && r2.r <= r2.n - 4 && r2.r > r1.r, 'con la barra achicada el descanso baja con ella: ' + JSON.stringify(r2));
    await bajar(p, 1e6);
    const r3 = await p.evaluate(() => ({ u: document.getElementById('view').lastElementChild.getBoundingClientRect().bottom, r: document.querySelector('#restBar .rest-inner').getBoundingClientRect().top }));
    t.ok(r3.u <= r3.r, 'con el descanso abierto lo último también queda a la vista: ' + JSON.stringify(r3));

    // Los botones siguen andando (ids y data-view de siempre) y al tocar uno va abierta.
    await bajar(p, 300);
    await p.click('#nav-habitos'); await wait(500);
    t.ok(await p.evaluate(() => document.getElementById('nav-habitos').classList.contains('active') && document.getElementById('nav-habitos').dataset.view === 'habitos'), 'tocar Hábitos la elige');
    t.ok(!(await caja(p)).compacta, 'al cambiar de pestaña queda abierta');
    t.eq(errs, [], 'errores de la página');
    await close();
  }

  // ---- «Claro»: vidrio claro con la píldora elegida negra ----
  {
    const { p, errs, close } = await abrir(base, "localStorage.setItem('gize_lite','0');localStorage.setItem('gize_tema','luz');");
    const a = await caja(p), on = await pildora(p, 'nav-entreno');
    t.ok(a.blur && a.blur !== 'none' && /rgba\(255, 255, 255/.test(await p.evaluate(() => getComputedStyle(document.querySelector('.navbar')).backgroundImage)), 'Claro: vidrio esmerilado blanco: ' + a.blur);
    t.eq([on.bg, on.color], ['rgb(11, 13, 17)', 'rgb(255, 255, 255)'], 'Claro: la pestaña elegida en una píldora negra');
    await bajar(p, 300);
    t.ok((await caja(p)).compacta, 'Claro: también se achica');
    t.eq(errs, [], 'Claro: errores de la página');
    await close();
  }

  // ---- Movimiento reducido: el mismo cambio, sin animación ----
  {
    const { p, close } = await abrir(base, "localStorage.setItem('gize_lite','0');", { reducedMotion: 'reduce' });
    t.eq((await caja(p)).dur.split(', ')[0], '0s', 'movimiento reducido: sin animación');
    await bajar(p, 300);
    t.ok((await caja(p)).compacta, 'movimiento reducido: igual se achica');
    await close();
  }

  // ---- GIZE básico (Android): sin desenfoque, relleno sólido, misma forma y mismo achique ----
  {
    const { p, errs, close } = await abrir(base, 'window.androidBridge = {};');
    const a = await caja(p);
    t.ok(await p.evaluate(() => document.documentElement.classList.contains('basico')), 'básico: prendido');
    t.eq(a.blur, 'none', 'básico: sin backdrop-filter');
    t.ok(!/rgba\(.*, 0\.\d+\)$/.test(a.fondo), 'básico: relleno sólido: ' + a.fondo);
    t.ok(a.l >= 8 && a.ih - a.b >= 8 && parseFloat(a.radio) >= a.h / 2, 'básico: la misma píldora flotante');
    await bajar(p, 300);
    const c = await caja(p);
    t.ok(c.compacta && c.w < a.w - 20, 'básico: se achica igual');
    t.eq(errs, [], 'básico: errores de la página');
    await close();
  }
}
