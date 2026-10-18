// Editor de rutina del coach en la compu (css/screens/coach/editor.css, «Compu»). El dueño: «en el
// celular se ve bien, el tema es en la PC, se ve como más angosto», «están muy juntos los botones de
// agregar ejercicio y la línea azul hace que se vea raro» y después «quiero más espacio entre el más y
// los ejercicios, en la computadora aparecen muy pegados y no quiero que desaparezca, quiero que esté
// visible para el usuario». En la compu (900 px o más, con mouse):
// - Más aire, a 1100, 1280, 1440 y 1920 px: una columna de lectura de 960 px como máximo (la lista,
//   la cabecera, las pestañas y «Programar una rutina nueva» terminan en el mismo borde: sin franja
//   vacía y sin tiras de punta a punta), tarjetas de al menos 72 px de alto con relleno cómodo y no
//   más finitas que antes (menos de 13 veces más anchas que altas), la letra de siempre (nombre 16 px,
//   resumen 14 px) y el nombre a la altura de la flecha. Reps y kg de la tarjeta abierta, de 240 px
//   como máximo. Sin scroll de costado. Las otras pestañas del alumno siguen con el ancho del panel.
// - Entre tarjeta y tarjeta, 48 a 56 px (todos iguales) y un «+» redondo de 22 a 26 px que se ve
//   siempre, en el medio, con al menos 12 px libres hasta la tarjeta de arriba y hasta la de abajo
//   (también en la superserie). Quieto, gris (no del color de la marca); al pasar el mouse por el
//   hueco (también por una punta) o llegar con el teclado (:focus-visible) se prende con el color de
//   la marca (en «Claro», al revés: lleno de marino, o de negro sin neón, con la cruz blanca), y con
//   el teclado lleva anillo de foco. Sin texto y sin línea en ningún estado (fuera del
//   «+», el hueco se pinta igual que sin el botón). El botón tapa todo el hueco (de una tarjeta a la
//   otra, del ancho de la tarjeta), con title «Agregar ejercicio acá» y aria-label «Agregar ejercicio
//   acá, entre <el de arriba> y <el de abajo>». Una sola parada de Tab por hueco. Con «reducir
//   movimiento», sin fundido. Tocarlo (también en una punta del hueco) abre el buscador y agrega ahí;
//   con el teclado, Enter o Espacio también (en la superserie, lo agregado queda adentro).
// - Arrastrando una tarjeta con el mouse para armar una superserie, los «+» se apagan como las
//   tarjetas y no se prenden al pasar (soltar en un hueco no hace nada); soltarla sobre otra arma la
//   superserie y queda como cambio sin guardar.
// - Adentro de una superserie, «sin descanso» se lee siempre (también con el mouse) y no pisa el «+»
//   (queda a la izquierda, sin las rayas); lo agregado queda en la superserie.
// - Se ve: la cruz ≥ 3:1 contra su relleno y el aro ≥ 3:1 contra el fondo de alrededor, quieto y con
//   el mouse, en Oscuro, Claro, Claro sin neón, Azul, Rosa, sin neón, liviano y básico. En «Claro» (con
//   y sin neón), con el mouse la cruz se ve más que quieto y el aro no menos.
// - Celular y tableta (pantalla táctil) y la compu con menos de 900 px quedan como antes: la línea
//   con «+ Agregar ejercicio» a la vista en lo táctil y tenue hasta pasar el mouse en la ventana
//   angosta, la grilla de 860 px como máximo y las tarjetas de siempre.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const NOMBRES = ['Sentadilla libre', 'Prensa 45°', 'Peso muerto rumano', 'Camilla de cuádriceps', 'Sillón de isquiotibiales', 'Gemelos parado'];
const nombreDe = i => 'Agregar ejercicio acá, entre ' + NOMBRES[i - 1] + ' y ' + NOMBRES[i];
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: '', exercises: NOMBRES.map((name, k) => Object.assign(
  { id: 'e' + k, name, rir: '2', rest: '90 seg', sets: [0, 1, 2].map(j => ({ id: 'e' + k + 's' + j, kg: '', reps: '', target: '8-10' })) },
  k === 3 ? { ss: true } : {})) }]; // Camilla + Sillón: superserie A
const TEMA = { Oscuro: '', Claro: "localStorage.setItem('gize_tema','luz');", Azul: "localStorage.setItem('gize_tema','azul');",
  'Claro sin neón': "localStorage.setItem('gize_tema','luz');localStorage.setItem('gize_neon','0');",
  Rosa: "localStorage.setItem('gize_tema','rosa');", 'sin neón': "localStorage.setItem('gize_neon','0');" };

async function abrir(base, { vp, touch = false, init = '', reducedMotion } = {}){
  const ACTUAL = rutina();
  const pg = await newPage({ user: COACH, viewport: vp, touch, reducedMotion, init: "localStorage.setItem('gize_lite','0');" + init,
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
    } });
  await pg.p.goto(base + '/app/'); await wait(3500);
  await pg.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await pg.p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
  return pg;
}
const nombres = p => p.evaluate(async () => { const { rtDays } = await import('/app/screens/coach/rutinas.js'); const { CoachState } = await import('/app/screens/coach/state.js');
  return rtDays()[CoachState.coachEditDay].exercises.map(e => e.name + (e.ss ? '+' : '')); });
async function elegir(p, q){ await p.fill('.cp-search', q); await wait(300); await p.click('.cp-ex'); await wait(600); }
const alCentro = (p, sel) => p.$eval(sel, e => e.scrollIntoView({ block: 'center' }));

// Columna, tarjetas, huecos y letra del editor.
const medidas = p => p.evaluate(() => {
  const R = e => e.getBoundingClientRect(), mid = e => R(e).top + R(e).height / 2;
  const grid = document.querySelector('.co-exc-grid'), head = document.querySelector('.cv-chead'), sched = document.querySelector('.co-sched'), tabs = document.querySelector('.cv-ctabs');
  const top = [...grid.children].filter(e => e.matches('.co-exc, .co-ss-group'));
  const cards = [...document.querySelectorAll('.co-exc-grid .co-exc-collapsed')], c = cards[0], s = getComputedStyle(c);
  const nm = c.querySelector('.co-exc-ctext'), sum = c.querySelector('.co-exc-sum'), chev = c.querySelector('.co-exc-chev'), h = document.getElementById('coachHost');
  return { ancho: Math.round(R(grid).width), izq: Math.round(R(grid).left), der: Math.round(R(grid).right),
    cabecera: [Math.round(R(head).left), Math.round(R(head).right)], programar: Math.round(R(sched).right), pestanas: Math.round(R(tabs).right),
    altos: cards.map(e => Math.round(R(e).height)), relleno: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat),
    huecos: top.slice(1).map((e, i) => Math.round(R(e).top - R(top[i]).bottom)),
    letra: [parseFloat(getComputedStyle(nm).fontSize), parseFloat(getComputedStyle(sum).fontSize)],
    nombreFlecha: Math.round(Math.abs(mid(nm) - mid(chev)) * 10) / 10, scroll: h.scrollWidth > h.clientWidth };
});
// Cada botón para agregar: dónde está respecto de lo de arriba y lo de abajo, qué dice y cómo se ve.
const botones = p => p.evaluate(() => { const q = document.body.appendChild(document.createElement('i')); q.style.color = 'var(--gize-text)';
  const tinta = getComputedStyle(q).color; q.remove(); return [...document.querySelectorAll('.co-exc-grid .co-ins')].map(b => {
  // Abajo: la tarjeta (o la superserie) que sigue, salteando «sin descanso» (.ss-div).
  let sig = b.nextElementSibling; while (sig && !sig.matches('.co-exc, .co-ss-group')) sig = sig.nextElementSibling;
  const R = e => e.getBoundingClientRect(), r = R(b), a = R(b.previousElementSibling), z = R(sig);
  const m = b.querySelector('.co-ins-b'), mr = R(m), ms = getComputedStyle(m), t = b.querySelector('.co-ins-t');
  return { i: +b.dataset.i, top: r.top, bottom: r.bottom, left: r.left, width: r.width, arriba: a.bottom, abajo: z.top, cardLeft: a.left, cardWidth: a.width,
    enSS: !!b.closest('.co-ss-group'), label: b.getAttribute('aria-label'), title: b.getAttribute('title'), tab: b.tabIndex,
    linea: [getComputedStyle(b, '::before').content, getComputedStyle(b, '::after').content], texto: !!t && t.getClientRects().length > 0,
    op: +ms.opacity, vis: ms.visibility, mas: { x: mr.left + mr.width / 2, y: mr.top + mr.height / 2, w: mr.width, h: mr.height, radio: ms.borderRadius, top: mr.top, bottom: mr.bottom, left: mr.left, right: mr.right },
    // Lo libre entre el «+» y cada tarjeta; el color de la cruz y del aro, y el de la marca (el del botón).
    libre: [Math.round((mr.top - a.bottom) * 10) / 10, Math.round((z.top - mr.bottom) * 10) / 10],
    color: ms.color, aro: ms.borderTopColor, fondo: ms.backgroundColor, acento: getComputedStyle(b).color, tinta,
    trans: ms.transitionDuration, foco: b.matches(':focus-visible'), hover: b.matches(':hover') };
}); });
// Prendido (mouse o teclado): la cruz del color de la marca; en «Claro», al revés: lleno de marino
// (sin neón, del negro de la letra) con la cruz blanca.
const prendido = (b, nombre = '') => /^Claro/.test(nombre)
  ? b.color === 'rgb(255, 255, 255)' && b.fondo === (nombre === 'Claro' ? b.acento : b.tinta)
  : b.color === b.acento;
// Una tira de la pantalla a lo ancho del hueco (sin el medio, donde va el «+»): para ver que no se pinta nada.
const tira = (p, b) => p.screenshot({ clip: { x: Math.round(b.left), y: Math.round((b.top + b.bottom) / 2) - 2, width: Math.round(b.width), height: 4 }, animations: 'disabled' })
  .then(buf => buf.toString('base64'));
const sinMedio = (p, png, w) => p.evaluate(async ({ png, w }) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data, out = [];
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) { if (Math.abs(x - w / 2) < 40) continue; const k = (y * img.width + x) * 4; out.push(d[k], d[k + 1], d[k + 2]); }
  return out.join(',');
}, { png, w });
// Contraste del «+» (sel: su .co-ins-b). Una captura alrededor con el aro transparente y la cruz
// escondida: el relleno (en el centro y por dentro del aro) y el fondo de afuera. La cruz, con su color
// y su opacidad, sobre el relleno del centro; el aro (1 px, con su color y su opacidad) sobre el
// relleno de adentro, contra el fondo de afuera, en 8 sectores alrededor: vale el peor.
async function contrasteMas(p, sel){
  const m = await p.$eval(sel, e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); let op = 1; for (let a = e; a; a = a.parentElement) op *= +getComputedStyle(a).opacity;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rad: r.width / 2, aro: s.borderTopColor, cruz: getComputedStyle(e.querySelector('svg')).color, op }; });
  const H = Math.ceil(m.rad) + 8, x0 = Math.round(m.x) - H, y0 = Math.round(m.y) - H;
  const st = await p.addStyleTag({ content: '.co-ins-b { border-color: transparent !important; } .co-ins svg { visibility: hidden !important; }' }); await wait(150);
  const png = (await p.screenshot({ clip: { x: x0, y: y0, width: 2 * H, height: 2 * H }, animations: 'disabled' })).toString('base64');
  await st.evaluate(e => e.remove()); await wait(150);
  return p.evaluate(async ({ png, m, cx, cy }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const prom = (r0, r1, sec) => { const s = [0, 0, 0]; let n = 0;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const dx = x + .5 - cx, dy = y + .5 - cy, r = Math.hypot(dx, dy); if (r < r0 || r > r1) continue;
        if (sec !== undefined && Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8) % 8 !== sec) continue;
        const k = (y * img.width + x) * 4; s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; n++; }
      return s.map(v => v / n); };
    // rgb(), rgba() o color(srgb …) → [r, g, b, a] en 0-255.
    const col = t => { const v = t.match(/[\d.]+/g).map(Number), f = /^color\(srgb/.test(t) ? 255 : 1; return [v[0] * f, v[1] * f, v[2] * f, v.length > 3 ? v[3] : 1]; };
    const sobre = (cc, al, f) => cc.slice(0, 3).map((v, k) => v * al + f[k] * (1 - al));
    const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, L = q => .2126 * lin(q[0]) + .7152 * lin(q[1]) + .0722 * lin(q[2]);
    const cr = (a, b) => Math.round((Math.max(L(a), L(b)) + .05) / (Math.min(L(a), L(b)) + .05) * 100) / 100;
    const ic = col(m.cruz), ar = col(m.aro), centro = prom(0, 4);
    const cruz = cr(sobre(ic, ic[3] * m.op, centro), centro);
    const aro = Math.min(...[0, 1, 2, 3, 4, 5, 6, 7].map(sec => { const adentro = prom(m.rad - 3.5, m.rad - 2, sec), afuera = prom(m.rad + 1.5, m.rad + 4, sec);
      return cr(sobre(ar, ar[3] * m.op, adentro), afuera); }));
    return { cruz, aro };
  }, { png, m, cx: m.x - x0, cy: m.y - y0 });
}

export default async function ({ base, t }){
  // ---- Compu: más aire a 1100, 1280, 1440 y 1920 px ----
  for (const vp of [{ width: 1100, height: 800 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]){
    const { p, errs, close } = await abrir(base, { vp });
    const m = await medidas(p), k = vp.width + ' px';
    t.ok(m.izq === m.cabecera[0] && Math.abs(m.der - m.cabecera[1]) <= 1 && Math.abs(m.der - m.programar) <= 1 && Math.abs(m.der - m.pestanas) <= 1,
      k + ': la lista termina donde terminan la cabecera, las pestañas y «Programar una rutina nueva» (sin franja vacía al costado): ' + JSON.stringify(m));
    t.ok(vp.width >= 1280 ? m.ancho === 960 : m.ancho >= 760 && m.ancho <= 960, k + ': una columna de lectura de 960 px como máximo: ' + m.ancho + ' px');
    t.ok(m.altos.every(h => h >= 72), k + ': tarjetas de al menos 72 px de alto: ' + JSON.stringify(m.altos));
    t.ok(m.ancho / m.altos[0] < 13, k + ': las tarjetas no quedan más finitas que antes (menos de 13 veces más anchas que altas): ' + (m.ancho / m.altos[0]).toFixed(1));
    t.ok(m.relleno[0] >= 14 && m.relleno[2] >= 14 && m.relleno[3] >= 18, k + ': relleno cómodo (arriba y abajo ≥ 14 px, a la izquierda ≥ 18): ' + JSON.stringify(m.relleno));
    t.ok(m.huecos.length === 4 && m.huecos.every(h => h >= 48 && h <= 56 && h === m.huecos[0]), k + ': 48 a 56 px entre una tarjeta y la otra, todos iguales (lugar para el «+» y aire): ' + JSON.stringify(m.huecos));
    t.ok(m.letra[0] >= 16 && m.letra[1] >= 14, k + ': la letra de siempre (nombre ≥ 16 px, resumen ≥ 14): ' + JSON.stringify(m.letra));
    t.ok(m.nombreFlecha <= 2, k + ': el nombre a la altura de la flecha: ' + m.nombreFlecha + ' px');
    t.ok(!m.scroll, k + ': sin scroll de costado');
    // La tarjeta abierta: reps y kg de 240 px como máximo, con la ✕ al lado.
    await p.click('.co-exc[data-id="e1"] .co-exc-chev'); await wait(400);
    const fila = await p.$eval('.co-exc-open .co-set-row', r => [...r.children].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width)]; }));
    t.ok(fila[1][1] <= 240 && fila[2][1] <= 240 && fila[1][1] >= 160 && fila[3][0] - (fila[2][0] + fila[2][1]) <= 16,
      k + ': reps y kg de 160 a 240 px, con la ✕ al lado: ' + JSON.stringify(fila));
    if (vp.width === 1440){
      // Las otras pestañas del alumno (Ficha) siguen con el ancho del panel.
      await p.click('[data-coach="client-tab"][data-t="ficha"]'); await wait(500);
      const der = await p.$eval('.cv-chead', e => Math.round(e.getBoundingClientRect().right));
      t.ok(der > m.der + 100, k + ': en Ficha la cabecera sigue con el ancho del panel: ' + der);
    }
    t.eq(errs, [], k + ': errores de la página');
    await close();
  }

  // ---- Compu (1440 px): el «+» a la vista en cada hueco ----
  {
    const { p, errs, close } = await abrir(base, { vp: { width: 1440, height: 900 } });
    await p.mouse.move(1436, 896); await alCentro(p, '.co-exc-grid > .co-ins[data-i="2"]'); await wait(300);
    let B = await botones(p);
    const quietos = L => L.every(b => b.color !== b.acento);
    t.eq(B.map(b => b.i), [1, 2, 3, 4, 5], 'un botón por hueco (5 para 6 ejercicios)');
    t.ok(B.every(b => Math.abs(b.top - b.arriba) <= 1 && Math.abs(b.bottom - b.abajo) <= 1 && Math.abs(b.left - b.cardLeft) <= 1 && Math.abs(b.width - b.cardWidth) <= 1),
      'cada botón tapa todo el hueco, de una tarjeta a la otra y del ancho de la tarjeta: ' + JSON.stringify(B.map(b => [b.i, Math.round(b.top - b.arriba), Math.round(b.bottom - b.abajo), Math.round(b.width - b.cardWidth)])));
    t.ok(B.every(b => b.label === nombreDe(b.i) && b.title === 'Agregar ejercicio acá'), 'title «Agregar ejercicio acá» y aria-label con entre qué ejercicios queda: ' + JSON.stringify(B.map(b => [b.label, b.title])));
    t.ok(B.every(b => b.tab === 0), 'una parada de Tab por hueco (botones comunes, sin tabindex de más)');
    t.ok(B.every(b => b.linea.every(c => c === 'none')), 'quieto: sin la línea azul (ni ::before ni ::after): ' + JSON.stringify(B.map(b => b.linea)));
    // Quieto se ve en todos los huecos (también en la superserie), sin texto, gris (no del color de la marca).
    t.ok(B.every(b => b.op === 1 && b.vis === 'visible' && !b.texto), 'quieto: el «+» se ve en cada hueco, sin texto: ' + JSON.stringify(B.map(b => [b.op, b.vis, b.texto])));
    t.ok(quietos(B), 'quieto: el «+» es gris, no del color de la marca: ' + JSON.stringify(B.map(b => [b.color, b.aro, b.acento])));
    t.ok(B.every(b => b.mas.w >= 22 && b.mas.w <= 26 && b.mas.h === b.mas.w && b.mas.radio === '50%'), 'un «+» redondo de 22 a 26 px: ' + JSON.stringify(B.map(b => b.mas)));
    t.ok(B.every(b => Math.abs(b.mas.x - (b.left + b.width / 2)) <= 1 && Math.abs(b.mas.y - (b.arriba + b.abajo) / 2) <= 1),
      'en el medio del hueco (a lo ancho y a lo alto): ' + JSON.stringify(B.map(b => [b.i, Math.round(b.mas.x - (b.left + b.width / 2)), Math.round(b.mas.y - (b.arriba + b.abajo) / 2)])));
    t.ok(B.every(b => b.libre[0] >= 12 && b.libre[1] >= 12), 'al menos 12 px libres entre el «+» y la tarjeta de arriba y la de abajo: ' + JSON.stringify(B.map(b => [b.i, b.libre])));
    // Fuera del «+» no se pinta nada en el hueco (ninguna línea): la misma tira con los botones y sin ellos.
    const b2 = B.find(b => b.i === 2);
    // Las luces del fondo de «Oscuro» cambian una vez por segundo (app/ui/background.js): para comparar
    // las tiras del hueco píxel a píxel se las frena como con la app en segundo plano ("pause").
    await p.evaluate(() => document.dispatchEvent(new Event('pause'))); await wait(1200);
    const quieto = await sinMedio(p, await tira(p, b2), b2.width);
    let st = await p.addStyleTag({ content: '.co-ins { visibility: hidden !important; }' }); await wait(150);
    const sinBoton = await sinMedio(p, await tira(p, b2), b2.width);
    await st.evaluate(e => e.remove()); await wait(150);
    t.ok(quieto === sinBoton, 'quieto: fuera del «+», el hueco no se pinta (sin línea)');

    // Al pasar el mouse por una punta del hueco: el «+» de ese hueco se prende con el color de la marca, sin línea.
    await p.mouse.move(b2.left + 30, (b2.top + b2.bottom) / 2); await wait(400);
    t.ok(await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('.co-ins[data-i="2"]'); }, [b2.left + 30, (b2.top + b2.bottom) / 2]),
      'la punta izquierda del hueco también es el botón');
    B = await botones(p);
    let x = B.find(b => b.i === 2);
    t.ok(x.op === 1 && x.color === x.acento && x.aro === x.acento, 'con el mouse en el hueco, el «+» (cruz y aro) se prende con el color de la marca: ' + JSON.stringify([x.op, x.color, x.aro, x.acento]));
    t.ok(Math.abs(x.mas.x - (x.left + x.width / 2)) <= 1 && Math.abs(x.mas.y - (x.top + x.bottom) / 2) <= 1 && x.libre.every(v => v >= 12), 'con el mouse, en el mismo lugar: ' + JSON.stringify([x.mas, x.libre]));
    t.ok(!x.texto && x.linea.every(c => c === 'none'), 'con el mouse: sin texto ni línea');
    t.ok(quietos(B.filter(b => b.i !== 2)) && B.every(b => b.op === 1), 'los otros huecos siguen con su «+» gris');
    // Con el mouse, solo cambia el medio: el resto del hueco es igual que quieto (no aparece ninguna línea).
    t.ok(await sinMedio(p, await tira(p, x), x.width) === quieto, 'con el mouse: el hueco, fuera del «+», igual que quieto (sin línea)');
    await p.evaluate(() => document.dispatchEvent(new Event('resume')));
    // Sobre una tarjeta no se prende ninguno (y siguen a la vista).
    const card = await p.$eval('.co-exc-grid > .co-exc[data-id="e1"]', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.mouse.move(card[0], card[1]); await wait(400);
    B = await botones(p);
    t.ok(quietos(B) && B.every(b => b.op === 1), 'con el mouse sobre una tarjeta, los «+» siguen grises y a la vista');

    // Con el teclado: Tab desde la flecha de la segunda tarjeta llega al hueco de abajo (pasando por
    // los botones que aparecen al pasar el mouse) y el «+» se prende, con su anillo de foco.
    await p.mouse.move(1436, 896); await wait(200);
    await p.focus('.co-exc[data-id="e1"] .co-exc-chev');
    let tabs = 0;
    while (tabs < 8 && !await p.evaluate(() => document.activeElement.matches('.co-ins'))) { await p.keyboard.press('Tab'); tabs++; }
    await wait(400);
    B = await botones(p); x = B.find(b => b.foco);
    t.ok(!!x && x.i === 2, 'con Tab se llega al hueco que sigue: ' + JSON.stringify(x && x.i));
    t.ok(!!x && x.op === 1 && x.color === x.acento && x.linea.every(c => c === 'none'), 'con el teclado el «+» se prende, sin línea: ' + JSON.stringify(x && [x.op, x.color, x.linea]));
    t.ok(await p.$eval('.co-ins:focus-visible .co-ins-b', e => getComputedStyle(e).outlineStyle !== 'none' && parseFloat(getComputedStyle(e).outlineWidth) >= 2), 'con el teclado, el «+» lleva anillo de foco');
    await p.keyboard.press('Tab'); await wait(100);
    t.ok(await p.evaluate(() => !!document.activeElement.closest('.co-exc[data-id="e2"]')), 'el Tab siguiente ya es la tarjeta de abajo (una parada por hueco)');

    // Tocarlo en la punta derecha del hueco agrega ahí (entre «Prensa 45°» y «Peso muerto rumano»).
    await alCentro(p, '.co-exc-grid > .co-ins[data-i="2"]'); await wait(200);
    x = (await botones(p)).find(b => b.i === 2);
    await p.mouse.move(x.left + x.width - 30, (x.top + x.bottom) / 2); await wait(300);
    await p.mouse.down(); await p.mouse.up(); await wait(500);
    t.ok(!!await p.$('.cp-modal'), 'tocar el hueco abre el buscador de ejercicios');
    await elegir(p, 'Zancada');
    let n = await nombres(p);
    t.ok(n.length === 7 && n[1] === 'Prensa 45°' && /Zancada/.test(n[2]) && n[3] === 'Peso muerto rumano', 'se agrega en ese hueco: ' + JSON.stringify(n));
    // Adentro de la superserie: el mismo hueco, el «+» en el medio con aire, y el botón tapa todo el
    // hueco (también «sin descanso», que no toma el mouse). «Sin descanso» se lee siempre (también
    // con el mouse), sin rayas que crucen el «+», y no lo pisa. Lo agregado queda en la superserie.
    await alCentro(p, '.co-ss-group .co-ins'); await p.mouse.move(1436, 896); await wait(300);
    x = (await botones(p)).find(b => b.enSS);
    const cartel = () => p.$eval('.co-ss-group .ss-div', d => { const e = d.querySelector('span'), r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return { op: +s.opacity, vis: s.visibility, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width,
        rayas: [getComputedStyle(d, '::before').content, getComputedStyle(d, '::after').content] }; });
    const separados = (c, m) => c.right + 8 <= m.left || c.left >= m.right + 8 || c.bottom <= m.top || c.top >= m.bottom;
    let c = await cartel();
    t.ok(x.abajo - x.arriba >= 48 && x.abajo - x.arriba <= 56, 'superserie: 48 a 56 px entre las dos tarjetas: ' + Math.round(x.abajo - x.arriba));
    t.ok(x.op === 1 && x.libre.every(v => v >= 12) && Math.abs(x.mas.x - (x.left + x.width / 2)) <= 1, 'superserie: quieto se ve el «+», en el medio, con 12 px libres o más: ' + JSON.stringify([x.mas, x.libre]));
    t.ok(c.op === 1 && c.vis === 'visible' && c.w > 40 && c.top >= x.arriba && c.bottom <= x.abajo, 'superserie: quieto se lee «sin descanso», en el hueco: ' + JSON.stringify(c));
    t.ok(separados(c, x.mas), 'superserie: «sin descanso» no pisa el «+» (al menos 8 px de costado): ' + JSON.stringify([c, x.mas]));
    t.ok(c.rayas.every(v => v === 'none'), 'superserie: sin rayas que crucen el «+»: ' + JSON.stringify(c.rayas));
    const todo = await p.evaluate(([x0, y0, y1]) => { const out = []; for (let y = Math.ceil(y0) + 1; y < y1 - 1; y += 2) { const e = document.elementFromPoint(x0, y); out.push(!!e && !!e.closest('.co-ss-group .co-ins')); } return out; },
      [x.left + 30, x.arriba, x.abajo]);
    t.ok(todo.length >= 20 && todo.every(Boolean), 'superserie: todo el hueco es el botón (también encima de «sin descanso»): ' + todo.map(Number).join(''));
    await p.mouse.move(x.left + 30, x.abajo - 6); await wait(400);
    x = (await botones(p)).find(b => b.enSS); c = await cartel();
    t.ok(x.color === x.acento && Math.abs(x.mas.y - (x.arriba + x.abajo) / 2) <= 1 && Math.abs(x.mas.x - (x.left + x.width / 2)) <= 1,
      'superserie: con el mouse en la parte de abajo se prende el «+», en el medio del hueco: ' + JSON.stringify([x.mas, x.color, x.arriba, x.abajo]));
    t.ok(c.op === 1 && separados(c, x.mas), 'superserie: con el mouse, «sin descanso» se sigue leyendo y no pisa el «+»: ' + JSON.stringify([c, x.mas]));
    await p.mouse.down(); await p.mouse.up(); await wait(500);
    await elegir(p, 'Zancada inversa');
    n = await nombres(p);
    t.ok(n[4] === 'Camilla de cuádriceps+' && /Zancada inversa/.test(n[5]) && /\+$/.test(n[5]) && n[6] === 'Sillón de isquiotibiales',
      'superserie: lo agregado queda adentro, entre Camilla y Sillón: ' + JSON.stringify(n));
    t.eq(errs, [], '1440 px: errores de la página');
    await close();
  }

  // ---- Con el teclado: Espacio en el hueco de la superserie agrega ahí, adentro ----
  {
    const { p, errs, close } = await abrir(base, { vp: { width: 1440, height: 900 } });
    await p.mouse.move(1436, 896); await alCentro(p, '.co-ss-group .co-ins'); await wait(200);
    await p.focus('.co-ss-group .co-ins[data-i="4"]'); await p.keyboard.press('Space'); await wait(500);
    t.ok(!!await p.$('.cp-modal'), 'teclado: Espacio en el hueco de la superserie abre el buscador');
    await elegir(p, 'Zancada');
    const n = await nombres(p);
    t.ok(n.length === 7 && n[3] === 'Camilla de cuádriceps+' && /Zancada.*\+$/.test(n[4]) && n[5] === 'Sillón de isquiotibiales',
      'teclado: lo agregado queda en ese hueco, adentro de la superserie: ' + JSON.stringify(n));
    await p.focus('.co-exc-grid > .co-ins[data-i="1"]'); await p.keyboard.press('Enter'); await wait(500);
    t.ok(!!await p.$('.cp-modal'), 'teclado: Enter en un hueco también abre el buscador');
    t.eq(errs, [], 'teclado: errores de la página');
    await close();
  }

  // ---- Arrastrar con el mouse para armar una superserie: los «+» se apagan y no se prenden ----
  {
    const { p, errs, close } = await abrir(base, { vp: { width: 1440, height: 900 } });
    await alCentro(p, '.co-exc-grid > .co-ins[data-i="1"]'); await wait(200);
    const centro = (sel, dx = 60) => p.$eval(sel, (e, dx) => { const r = e.getBoundingClientRect(); return [r.left + dx, r.top + r.height / 2]; }, dx);
    const src = await centro('.co-exc[data-id="e0"] .co-exc-cname');
    await p.mouse.move(src[0], src[1]); await p.mouse.down(); await wait(650);
    // Pasando por el hueco de abajo de «Prensa 45°»: ningún «+» se prende y todos se apagan.
    const g = await centro('.co-exc-grid > .co-ins[data-i="2"]', 200);
    for (let s = 1; s <= 10; s++){ await p.mouse.move(src[0] + (g[0] - src[0]) * s / 10, src[1] + (g[1] - src[1]) * s / 10); await wait(30); }
    await wait(250);
    const d = await p.evaluate(() => ({ on: document.body.classList.contains('co-drag-on'), hover: [...document.querySelectorAll('.co-ins')].filter(e => e.matches(':hover')).length,
      op: [...document.querySelectorAll('.co-exc-grid .co-ins-b')].map(e => +getComputedStyle(e).opacity) }));
    t.ok(d.on && d.hover === 0 && d.op.every(o => o < 1), 'arrastrando: los «+» se apagan como las tarjetas y el del hueco no se prende: ' + JSON.stringify(d));
    const tg = await centro('.co-exc[data-id="e2"]', 300);
    for (let s = 1; s <= 8; s++){ await p.mouse.move(g[0] + (tg[0] - g[0]) * s / 8, g[1] + (tg[1] - g[1]) * s / 8); await wait(30); }
    await wait(200);
    t.ok(!!await p.$('.co-exc[data-id="e2"] .co-drop-target, .co-exc[data-id="e2"].co-drop-target'), 'arrastrando: sobre «Peso muerto rumano» se marca el destino');
    await p.mouse.up(); await wait(700);
    const n = await nombres(p);
    t.ok(n[0] === 'Prensa 45°' && n[1] === 'Peso muerto rumano+' && n[2] === 'Sentadilla libre', 'arrastrando: al soltar sobre otra tarjeta arma la superserie: ' + JSON.stringify(n));
    t.ok(!await p.$('.cp-modal') && !!await p.$('.co-unsaved'), 'arrastrando: no abre el buscador y queda como cambio sin guardar');
    const fin = await p.evaluate(() => [...document.querySelectorAll('.co-exc-grid .co-ins-b')].map(e => +getComputedStyle(e).opacity));
    t.ok(fin.every(o => o === 1), 'después de soltar, los «+» vuelven a verse enteros: ' + JSON.stringify(fin));
    t.eq(errs, [], 'arrastrando: errores de la página');
    await close();
  }

  // ---- «Reducir movimiento»: cambia de una ----
  {
    const { p, errs, close } = await abrir(base, { vp: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await alCentro(p, '.co-exc-grid > .co-ins[data-i="2"]'); await wait(200);
    const x = (await botones(p)).find(b => b.i === 2);
    t.ok(x.trans.split(',').every(s => parseFloat(s) === 0), 'con «reducir movimiento», el «+» cambia sin fundido: ' + x.trans);
    t.ok(x.op === 1, 'con «reducir movimiento», el «+» también se ve quieto');
    await p.mouse.move(x.left + 30, (x.top + x.bottom) / 2); await wait(50);
    const y = (await botones(p)).find(b => b.i === 2);
    t.ok(y.color === y.acento, 'con «reducir movimiento», se prende apenas llega el mouse: ' + JSON.stringify([y.color, y.acento]));
    t.eq(errs, [], 'reducir movimiento: errores de la página');
    await close();
  }

  // ---- El «+» se ve en cada apariencia: quieto y con el mouse, la cruz ≥ 3:1 contra su relleno y el
  // aro ≥ 3:1 contra el fondo de alrededor ----
  for (const [nombre, init, clases] of [...Object.entries(TEMA).map(([k, v]) => [k, v, null]), ['liviano', '', ['lite']], ['básico', '', ['lite', 'basico']]]){
    const { p, errs, close } = await abrir(base, { vp: { width: 1440, height: 900 }, init });
    if (clases) { await p.evaluate(c => document.documentElement.classList.add(...c), clases); await wait(300); }
    await p.mouse.move(1436, 896); await alCentro(p, '.co-exc-grid > .co-ins[data-i="2"]'); await wait(300);
    const SEL = '.co-exc-grid > .co-ins[data-i="2"] .co-ins-b';
    const x = (await botones(p)).find(b => b.i === 2);
    t.ok(x.op === 1 && x.color !== x.acento && x.linea.every(c => c === 'none') && !x.texto, nombre + ': quieto se ve el «+», gris, sin línea ni texto: ' + JSON.stringify([x.op, x.color, x.acento]));
    const q = await contrasteMas(p, SEL);
    t.ok(q.cruz >= 3 && q.aro >= 3, nombre + ': quieto, el «+» se ve (cruz ≥ 3:1 contra su relleno, aro ≥ 3:1 contra el fondo): ' + JSON.stringify(q));
    // También arriba y abajo de la pantalla (el fondo cambia: en «Claro» va de celeste a azul).
    for (const [donde, block] of [['arriba', 'start'], ['abajo', 'end']]){
      await p.$eval('.co-exc-grid > .co-ins[data-i="2"]', (e, block) => e.scrollIntoView({ block }), block); await wait(300);
      const r = await contrasteMas(p, SEL);
      t.ok(r.cruz >= 3 && r.aro >= 3, nombre + ': quieto, ' + donde + ' de la pantalla, el «+» se ve (cruz y aro ≥ 3:1): ' + JSON.stringify(r));
    }
    await alCentro(p, '.co-exc-grid > .co-ins[data-i="2"]'); await wait(300);
    await p.mouse.move(x.left + 30, (x.top + x.bottom) / 2); await wait(400);
    const y = (await botones(p)).find(b => b.i === 2);
    t.ok(y.op === 1 && prendido(y, nombre) && y.linea.every(c => c === 'none') && !y.texto,
      nombre + ': con el mouse se prende (con el color de la marca; en «Claro», lleno con la cruz blanca), sin línea ni texto: ' + JSON.stringify([y.color, y.fondo, y.acento]));
    const m = await contrasteMas(p, SEL);
    t.ok(m.cruz >= 3 && m.aro >= 3, nombre + ': con el mouse, el «+» se ve (cruz ≥ 3:1 contra su relleno, aro ≥ 3:1 contra el fondo): ' + JSON.stringify(m));
    // En «Claro» el azul de la marca es casi el gris de quieto: con el mouse no puede verse menos.
    if (/^Claro/.test(nombre)) t.ok(m.cruz > q.cruz && m.aro >= q.aro, nombre + ': con el mouse, la cruz se ve más que quieto y el aro no menos: ' + JSON.stringify({ quieto: q, mouse: m }));
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }

  // ---- Celular, tableta y la compu angosta: como antes ----
  const comoAntes = p => p.evaluate(() => {
    const g = document.querySelector('.co-exc-grid'), gs = getComputedStyle(g), c = getComputedStyle(document.querySelector('.co-exc-grid .co-exc-collapsed'));
    const b = document.querySelector('.co-exc-grid > .co-ins'), bs = getComputedStyle(b), bb = getComputedStyle(b, '::before'), m = getComputedStyle(b.querySelector('.co-ins-b'));
    return { max: gs.maxWidth, gap: gs.rowGap, pad: c.padding, minH: c.minHeight, h: b.getBoundingClientRect().height, margen: bs.marginTop,
      linea: bb.content !== 'none' ? +bb.opacity : null, op: +m.opacity, texto: b.innerText.trim(), radio: m.borderRadius, label: b.getAttribute('aria-label') };
  });
  for (const [nombre, vp, touch, esperado] of [
    ['celular', { width: 390, height: 844 }, true, { h: 28, linea: .6, op: .85 }],
    ['tableta (táctil)', { width: 1024, height: 768 }, true, { h: 28, linea: .6, op: .85 }],
    ['compu angosta (820 px, mouse)', { width: 820, height: 900 }, false, { h: 20, linea: .45, op: .6 }],
  ]){
    const { p, errs, close } = await abrir(base, { vp, touch });
    const a = await comoAntes(p);
    t.ok(a.max === '860px' && a.gap === '10px' && a.pad === '12px 12px 12px 16px' && a.minH === '62px', nombre + ': grilla y tarjetas de siempre: ' + JSON.stringify(a));
    t.ok(a.h === esperado.h && a.margen === '-10px' && a.linea === esperado.linea && a.op === esperado.op && a.radio === '999px',
      nombre + ': la línea con la píldora de siempre: ' + JSON.stringify(a));
    t.ok(/Agregar ejercicio/.test(a.texto) && a.label === nombreDe(1), nombre + ': con «+ Agregar ejercicio» a la vista y su nombre: ' + JSON.stringify([a.texto, a.label]));
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }
}
