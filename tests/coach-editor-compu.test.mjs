// Editor de rutina del coach en la compu (css/screens/coach/editor.css, «Compu»). El dueño: «en el
// celular se ve bien, el tema es en la PC, se ve como más angosto» y «están muy juntos los botones de
// agregar ejercicio y la línea azul hace que se vea raro». En la compu (900 px o más, con mouse):
// - Más aire, a 1100, 1280, 1440 y 1920 px: una columna de lectura de 960 px como máximo (la lista,
//   la cabecera, las pestañas y «Programar una rutina nueva» terminan en el mismo borde: sin franja
//   vacía y sin tiras de punta a punta), tarjetas de al menos 72 px de alto con relleno cómodo y no
//   más finitas que antes (menos de 13 veces más anchas que altas), 12 a 16 px entre una y otra, la
//   letra de siempre (nombre 16 px, resumen 14 px) y el nombre a la altura de la flecha. Reps y kg de
//   la tarjeta abierta, de 240 px como máximo. Sin scroll de costado. Las otras pestañas del alumno
//   siguen con el ancho del panel.
// - Entre tarjeta y tarjeta, un botón que tapa todo el hueco (de una tarjeta a la otra, del ancho de
//   la tarjeta) y no se ve: no pinta nada en el hueco y no hay línea azul en ningún estado. Al pasar
//   el mouse por el hueco (también por una punta) o llegar con el teclado (:focus-visible) aparece en
//   el medio un «+» redondo de 22 a 26 px, sin texto, con title «Agregar ejercicio acá» y aria-label
//   «Agregar ejercicio acá, entre <el de arriba> y <el de abajo>». Una sola parada de Tab por hueco.
//   Con «reducir movimiento», sin fundido. Tocarlo (también en una punta del hueco) abre el buscador
//   y agrega ahí. Adentro de una superserie el hueco es de 44 a 48 px y el botón lo tapa entero
//   (también abajo de «sin descanso»): el «+» aparece en el medio, sobre la raya, y el cartelito se
//   apaga mientras tanto; lo agregado queda en la superserie.
// - El «+» se ve: ≥ 3:1 contra su relleno en Oscuro, Claro, Azul, Rosa, sin neón, liviano y básico.
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
const botones = p => p.evaluate(() => [...document.querySelectorAll('.co-exc-grid .co-ins')].map(b => {
  // Abajo: la tarjeta (o la superserie) que sigue, salteando «sin descanso» (.ss-div).
  let sig = b.nextElementSibling; while (sig && !sig.matches('.co-exc, .co-ss-group')) sig = sig.nextElementSibling;
  const R = e => e.getBoundingClientRect(), r = R(b), a = R(b.previousElementSibling), z = R(sig);
  const m = b.querySelector('.co-ins-b'), mr = R(m), ms = getComputedStyle(m), t = b.querySelector('.co-ins-t');
  return { i: +b.dataset.i, top: r.top, bottom: r.bottom, left: r.left, width: r.width, arriba: a.bottom, abajo: z.top, cardLeft: a.left, cardWidth: a.width,
    enSS: !!b.closest('.co-ss-group'), label: b.getAttribute('aria-label'), title: b.getAttribute('title'), tab: b.tabIndex,
    linea: [getComputedStyle(b, '::before').content, getComputedStyle(b, '::after').content], texto: !!t && t.getClientRects().length > 0,
    op: +ms.opacity, toca: ms.pointerEvents, mas: { x: mr.left + mr.width / 2, y: mr.top + mr.height / 2, w: mr.width, h: mr.height, radio: ms.borderRadius },
    trans: ms.transitionDuration, foco: b.matches(':focus-visible') };
}));
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
// Contraste del «+» (el trazo, con su color) contra su relleno: la captura con el «+» a la vista y el
// trazo escondido, el relleno de alrededor del centro.
async function contrasteMas(p){
  const ic = await p.$eval('.co-ins:hover .co-ins-b svg', e => { const r = e.getBoundingClientRect(); let op = 1; for (let a = e; a; a = a.parentElement) op *= +getComputedStyle(a).opacity;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, color: getComputedStyle(e).color, op }; });
  const st = await p.addStyleTag({ content: '.co-ins svg { visibility: hidden !important; }' }); await wait(120);
  const png = (await p.screenshot({ clip: { x: Math.round(ic.x) - 3, y: Math.round(ic.y) - 3, width: 6, height: 6 }, animations: 'disabled' })).toString('base64');
  await st.evaluate(e => e.remove()); await wait(120);
  return p.evaluate(async ({ png, ic }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data; let r = 0, gg = 0, b = 0; const n = d.length / 4;
    for (let k = 0; k < d.length; k += 4) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; } r /= n; gg /= n; b /= n;
    const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, L = (x, y, z) => .2126 * lin(x) + .7152 * lin(y) + .0722 * lin(z);
    const [cr, cg, cb, ca = 1] = ic.color.match(/[\d.]+/g).map(Number), al = ca * ic.op;
    const Li = L(cr * al + r * (1 - al), cg * al + gg * (1 - al), cb * al + b * (1 - al)), Lf = L(r, gg, b);
    return Math.round((Math.max(Li, Lf) + .05) / (Math.min(Li, Lf) + .05) * 100) / 100;
  }, { png, ic });
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
    t.ok(m.huecos.length === 4 && m.huecos.every(h => h >= 12 && h <= 16), k + ': 12 a 16 px entre una tarjeta y la otra: ' + JSON.stringify(m.huecos));
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

  // ---- Compu (1440 px): el «+» del hueco ----
  {
    const { p, errs, close } = await abrir(base, { vp: { width: 1440, height: 900 } });
    await p.mouse.move(1436, 896); await alCentro(p, '.co-exc-grid > .co-ins[data-i="2"]'); await wait(300);
    let B = await botones(p);
    t.eq(B.map(b => b.i), [1, 2, 3, 4, 5], 'un botón por hueco (5 para 6 ejercicios)');
    t.ok(B.every(b => Math.abs(b.top - b.arriba) <= 1 && Math.abs(b.bottom - b.abajo) <= 1 && Math.abs(b.left - b.cardLeft) <= 1 && Math.abs(b.width - b.cardWidth) <= 1),
      'cada botón tapa todo el hueco, de una tarjeta a la otra y del ancho de la tarjeta: ' + JSON.stringify(B.map(b => [b.i, Math.round(b.top - b.arriba), Math.round(b.bottom - b.abajo), Math.round(b.width - b.cardWidth)])));
    t.ok(B.every(b => b.label === nombreDe(b.i) && b.title === 'Agregar ejercicio acá'), 'title «Agregar ejercicio acá» y aria-label con entre qué ejercicios queda: ' + JSON.stringify(B.map(b => [b.label, b.title])));
    t.ok(B.every(b => b.tab === 0), 'una parada de Tab por hueco (botones comunes, sin tabindex de más)');
    t.ok(B.every(b => b.linea.every(c => c === 'none')), 'quieto: sin la línea azul (ni ::before ni ::after): ' + JSON.stringify(B.map(b => b.linea)));
    t.ok(B.every(b => b.op === 0 && b.toca === 'none' && !b.texto), 'quieto: el «+» no se ve ni se toca, y no hay texto: ' + JSON.stringify(B.map(b => [b.op, b.toca, b.texto])));
    // Quieto no pinta nada en el hueco: la misma tira con los botones y sin ellos.
    const b2 = B.find(b => b.i === 2);
    const quieto = await sinMedio(p, await tira(p, b2), b2.width);
    let st = await p.addStyleTag({ content: '.co-ins { visibility: hidden !important; }' }); await wait(150);
    const sinBoton = await sinMedio(p, await tira(p, b2), b2.width);
    await st.evaluate(e => e.remove()); await wait(150);
    t.ok(quieto === sinBoton, 'quieto: en el hueco no se pinta nada');

    // Al pasar el mouse por una punta del hueco: aparece el «+» en el medio, sin línea.
    await p.mouse.move(b2.left + 30, (b2.top + b2.bottom) / 2); await wait(400);
    t.ok(await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('.co-ins[data-i="2"]'); }, [b2.left + 30, (b2.top + b2.bottom) / 2]),
      'la punta izquierda del hueco también es el botón');
    B = await botones(p);
    let x = B.find(b => b.i === 2);
    t.ok(x.op === 1 && x.toca === 'auto', 'con el mouse en el hueco aparece el «+»: ' + JSON.stringify([x.op, x.toca]));
    t.ok(x.mas.w >= 22 && x.mas.w <= 26 && x.mas.h === x.mas.w && x.mas.radio === '50%', 'un «+» redondo de 22 a 26 px: ' + JSON.stringify(x.mas));
    t.ok(Math.abs(x.mas.x - (x.left + x.width / 2)) <= 1 && Math.abs(x.mas.y - (x.top + x.bottom) / 2) <= 1, 'en el medio del hueco: ' + JSON.stringify([x.mas, x.left, x.width, x.top, x.bottom]));
    t.ok(!x.texto && x.linea.every(c => c === 'none'), 'con el mouse: sin texto ni línea');
    t.ok(B.filter(b => b.i !== 2).every(b => b.op === 0), 'los otros huecos siguen sin nada');
    // Con el mouse, solo cambia el medio: el resto del hueco es igual que quieto (no aparece ninguna línea).
    t.ok(await sinMedio(p, await tira(p, x), x.width) === quieto, 'con el mouse: el hueco, fuera del «+», igual que quieto (sin línea)');
    // Sobre una tarjeta no aparece ninguno.
    const card = await p.$eval('.co-exc-grid > .co-exc[data-id="e1"]', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.mouse.move(card[0], card[1]); await wait(400);
    t.ok((await botones(p)).every(b => b.op === 0), 'con el mouse sobre una tarjeta no aparece ningún «+»');

    // Con el teclado: Tab desde la flecha de la segunda tarjeta llega al hueco de abajo (pasando por
    // los botones que aparecen al pasar el mouse) y el «+» se ve, con su anillo de foco.
    await p.mouse.move(1436, 896); await wait(200);
    await p.focus('.co-exc[data-id="e1"] .co-exc-chev');
    let tabs = 0;
    while (tabs < 8 && !await p.evaluate(() => document.activeElement.matches('.co-ins'))) { await p.keyboard.press('Tab'); tabs++; }
    await wait(400);
    B = await botones(p); x = B.find(b => b.foco);
    t.ok(!!x && x.i === 2, 'con Tab se llega al hueco que sigue: ' + JSON.stringify(x && x.i));
    t.ok(!!x && x.op === 1 && x.linea.every(c => c === 'none'), 'con el teclado el «+» se ve, sin línea: ' + JSON.stringify(x && [x.op, x.linea]));
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
    // Adentro de la superserie: 44 a 48 px entre las dos tarjetas y el botón tapa todo ese hueco
    // (también abajo de «sin descanso», que no toma el mouse). Con el mouse en la parte de abajo
    // aparece el «+» en el medio, sobre la raya, y «sin descanso» se apaga mientras tanto (no se
    // pisan). Lo agregado queda en la superserie.
    await alCentro(p, '.co-ss-group .co-ins'); await p.mouse.move(1436, 896); await wait(300);
    x = (await botones(p)).find(b => b.enSS);
    const cartel = () => p.$eval('.co-ss-group .ss-div span', e => +getComputedStyle(e).opacity);
    t.ok(x.abajo - x.arriba >= 44 && x.abajo - x.arriba <= 48, 'superserie: 44 a 48 px entre las dos tarjetas: ' + Math.round(x.abajo - x.arriba));
    t.eq(await cartel(), 1, 'superserie: quieto se ve «sin descanso»');
    const todo = await p.evaluate(([x0, y0, y1]) => { const out = []; for (let y = Math.ceil(y0) + 1; y < y1 - 1; y += 2) { const e = document.elementFromPoint(x0, y); out.push(!!e && !!e.closest('.co-ss-group .co-ins')); } return out; },
      [x.left + 30, x.arriba, x.abajo]);
    t.ok(todo.length >= 20 && todo.every(Boolean), 'superserie: todo el hueco es el botón (arriba, encima y abajo de «sin descanso»): ' + todo.map(Number).join(''));
    await p.mouse.move(x.left + 30, x.abajo - 6); await wait(400);
    x = (await botones(p)).find(b => b.enSS);
    const div = await p.$eval('.co-ss-group .ss-div', e => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
    t.ok(x.op === 1 && Math.abs(x.mas.y - (x.arriba + x.abajo) / 2) <= 1 && Math.abs(x.mas.y - div) <= 1 && Math.abs(x.mas.x - (x.left + x.width / 2)) <= 1,
      'superserie: con el mouse abajo de «sin descanso» aparece el «+», en el medio del hueco y sobre la raya: ' + JSON.stringify([x.mas, x.arriba, x.abajo, div]));
    t.eq(await cartel(), 0, 'superserie: mientras se ve el «+», «sin descanso» se apaga');
    await p.mouse.down(); await p.mouse.up(); await wait(500);
    await elegir(p, 'Zancada inversa');
    n = await nombres(p);
    t.ok(n[4] === 'Camilla de cuádriceps+' && /Zancada inversa/.test(n[5]) && /\+$/.test(n[5]) && n[6] === 'Sillón de isquiotibiales',
      'superserie: lo agregado queda adentro, entre Camilla y Sillón: ' + JSON.stringify(n));
    t.eq(errs, [], '1440 px: errores de la página');
    await close();
  }

  // ---- «Reducir movimiento»: aparece de una ----
  {
    const { p, errs, close } = await abrir(base, { vp: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await alCentro(p, '.co-exc-grid > .co-ins[data-i="2"]'); await wait(200);
    const x = (await botones(p)).find(b => b.i === 2);
    t.ok(x.trans.split(',').every(s => parseFloat(s) === 0), 'con «reducir movimiento», el «+» aparece sin fundido: ' + x.trans);
    const tc = await p.$eval('.co-ss-group .ss-div span', e => getComputedStyle(e).transitionDuration);
    t.ok(tc.split(',').every(s => parseFloat(s) === 0), 'con «reducir movimiento», «sin descanso» se apaga sin fundido: ' + tc);
    await p.mouse.move(x.left + 30, (x.top + x.bottom) / 2); await wait(50);
    t.eq((await botones(p)).find(b => b.i === 2).op, 1, 'con «reducir movimiento», se ve apenas llega el mouse');
    t.eq(errs, [], 'reducir movimiento: errores de la página');
    await close();
  }

  // ---- El «+» se ve en cada apariencia (≥ 3:1 contra su relleno) ----
  for (const [nombre, init, clases] of [...Object.entries(TEMA).map(([k, v]) => [k, v, null]), ['liviano', '', ['lite']], ['básico', '', ['lite', 'basico']]]){
    const { p, errs, close } = await abrir(base, { vp: { width: 1440, height: 900 }, init });
    if (clases) { await p.evaluate(c => document.documentElement.classList.add(...c), clases); await wait(300); }
    await alCentro(p, '.co-exc-grid > .co-ins[data-i="2"]'); await wait(200);
    const x = (await botones(p)).find(b => b.i === 2);
    await p.mouse.move(x.left + 30, (x.top + x.bottom) / 2); await wait(400);
    const y = (await botones(p)).find(b => b.i === 2);
    t.ok(y.op === 1 && y.linea.every(c => c === 'none') && !y.texto, nombre + ': con el mouse aparece el «+», sin línea ni texto');
    const cr = await contrasteMas(p);
    t.ok(cr >= 3, nombre + ': el «+» se ve (≥ 3:1 contra su relleno): ' + cr + ':1');
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
