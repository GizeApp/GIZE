// Buscar alimento con el teclado abierto en el iPhone (pedido del dueño, 27/10): «se me abre el
// teclado y la app se va para arriba; tengo que scrollear para ver el buscador», y «me aparece una
// sola opción: crear alimento propio y pedir un producto ocupan mucho lugar».
// - Con el teclado abierto el iPhone corre la vista (visualViewport.offsetTop): la ventana medía
//   «pantalla − teclado» y su parte de arriba quedaba escondida. Ahora mide lo que se ve (--vvh).
// - «Crear alimento propio» y «Pedí que lo agreguemos» van al final de la lista (se desplazan con
//   los resultados), no fijos abajo.
// El teclado se simula con un visualViewport falso (el de Chromium no cambia sin teclado de verdad).
import { newPage, wait, ALUMNO, perfil } from './lib.mjs';

const VV = () => {
  const ls = [];
  const vv = { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, pageTop: 0, scale: 1,
    addEventListener: (t, f) => ls.push(f), removeEventListener() {} };
  window.__vv = vv; window.__vvFire = () => ls.forEach(f => f({ type: 'resize' }));
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
};

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, diary: [], calTarget: 2000 },
    handlers: { '/profiles': perfil('client') }, init: VV, touch: true });
  await p.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"products":[]}' }));
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(500);
  await p.click('[data-action="search-open"]'); await wait(700);

  // Los dos botones van dentro de lo que se desliza, después de los resultados.
  t.eq(await p.$$eval('#sheetHost .search-sheet .cal-create', bs => bs.map(b => !!b.closest('.ss-scroll') && !!b.previousElementSibling)), [true, true],
    '«Crear alimento propio» y «Pedí que lo agreguemos» van al final de la lista');

  // Se abre el teclado (tapa 216 px) y el iPhone corre la vista 120 px para mostrar el campo.
  await p.focus('#foodSearch');
  await p.evaluate(() => { window.__vv.height = innerHeight - 336; window.__vv.offsetTop = 120; window.__vvFire(); });
  await p.fill('#foodSearch', 'pollo'); await wait(600);
  const m = await p.evaluate(() => {
    const s = document.querySelector('#sheetHost .search-sheet').getBoundingClientRect(), vv = window.__vv;
    const arriba = vv.offsetTop, abajo = vv.offsetTop + vv.height, sc = document.querySelector('#sheetHost .ss-scroll').getBoundingClientRect();
    const filas = [...document.querySelectorAll('#foodResults .food-row')].filter(r => { const b = r.getBoundingClientRect(); return b.top >= sc.top - 0.5 && b.bottom <= sc.bottom + 0.5; }).length;
    const q = document.getElementById('foodSearch').getBoundingClientRect();
    return { kb: document.documentElement.classList.contains('kb-open'), top: s.top, bottom: s.bottom, arriba, abajo, filas, buscador: q.top >= arriba && q.bottom <= abajo };
  });
  t.ok(m.kb, 'con el teclado abierto');
  t.ok(m.top >= m.arriba && m.bottom <= m.abajo + 0.5, 'la ventana entra entera en lo que se ve (' + Math.round(m.top) + '–' + Math.round(m.bottom) + ' en ' + m.arriba + '–' + m.abajo + ')');
  t.ok(m.buscador, 'el buscador se ve sin tener que scrollear');
  t.ok(m.filas >= 3, 'se ven al menos 3 resultados enteros (' + m.filas + ')');

  // Se cierra el teclado: vuelve a su alto de siempre.
  await p.evaluate(() => { window.__vv.height = innerHeight; window.__vv.offsetTop = 0; document.activeElement.blur(); window.__vvFire(); }); await wait(300);
  t.ok(!(await p.evaluate(() => document.documentElement.classList.contains('kb-open'))), 'con el teclado cerrado, sin kb-open');
  t.eq(errs, [], 'sin errores');
  await close();
}
