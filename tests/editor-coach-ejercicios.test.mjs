// Editor de rutina del coach (app/screens/coach/rutinas.js, css/screens/coach/rutinas.css): las
// tarjetas de ejercicio de la grilla.
// - Flecha para abrir y cerrar (.co-exc-chev): botón de 36 px arriba a la derecha, en el mismo
//   lugar cerrada y abierta, con aria-expanded y «Abrir ejercicio» / «Cerrar ejercicio».
// - Uno abierto a la vez: abrir otro (con la flecha o tocando la tarjeta cerrada) cierra el que
//   estaba; al agregar, duplicar o insertar, el nuevo es el único abierto. El contador de series y
//   el botón de cambiar no la abren.
// - La abierta se queda en su casillero de la grilla (no ocupa toda la fila) y crece hacia abajo,
//   con el nombre del mismo tamaño que cerrada y campos chicos con letra de 16 px (el iPhone no
//   hace zoom). En el celular, la flecha queda en el renglón del nombre.
// - El filete de neón de las cajas de la app (--gize-rgb-ring) en cada tarjeta (también adentro de
//   una superserie) y en el contador de series, en «Oscuro», «Azul», «Rosa» y «Claro»; con el neón
//   apagado (html.sin-neon), el filete blanco sin color.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const NOMBRES = ['Sentadilla libre', 'Prensa 45°', 'Peso muerto rumano', 'Camilla de cuádriceps', 'Sillón de isquiotibiales', 'Gemelos parado'];
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: '', exercises: NOMBRES.map((name, k) => Object.assign(
  { id: 'e' + k, name, rir: '2', rest: '90 seg', sets: [0, 1, 2].map(j => ({ id: 'e' + k + 's' + j, kg: '', reps: '', target: '8-10' })) },
  k === 3 ? { ss: true } : {})) }]; // Camilla + Sillón: superserie A

async function abrir(base, viewport, init){
  const ACTUAL = rutina();
  const pg = await newPage({ user: COACH, viewport, init,
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

// Las tarjetas, en orden: id, abierta o no y su flecha.
const tarjetas = p => p.evaluate(() => [...document.querySelectorAll('.co-exc-grid .co-exc')].map(e => {
  const b = e.querySelector(':scope > .co-exc-head > .co-exc-chev');
  return { id: e.dataset.id, open: e.classList.contains('co-exc-open'),
    chev: b ? { exp: b.getAttribute('aria-expanded'), label: b.getAttribute('aria-label'), w: b.offsetWidth, h: b.offsetHeight } : null };
}));
const abiertas = async p => (await tarjetas(p)).filter(x => x.open).map(x => x.id);
// Medidas de una tarjeta: su caja, dónde está la flecha (desde arriba y desde la derecha) y la letra del nombre.
// (top, desde arriba de la grilla).
const medir = (p, id) => p.evaluate(id => {
  const c = document.querySelector('.co-exc[data-id="' + id + '"]'); if (!c) return null;
  const r = c.getBoundingClientRect(), b = c.querySelector('.co-exc-chev').getBoundingClientRect(), g = document.querySelector('.co-exc-grid').getBoundingClientRect();
  const nm = c.querySelector('.co-exc-ctext, .co-exc-name');
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), top: Math.round(r.top - g.top),
    chevTop: Math.round(b.top - r.top), chevRight: Math.round(r.right - b.right), chevMid: Math.round(b.top + b.height / 2),
    nameMid: Math.round(nm.getBoundingClientRect().top + nm.getBoundingClientRect().height / 2), nameFont: parseFloat(getComputedStyle(nm).fontSize) };
}, id);
// Los campos visibles de la tarjeta abierta (alto y letra) y el alto de los botones de la cabecera.
const campos = (p, id) => p.evaluate(id => {
  const c = document.querySelector('.co-exc-open[data-id="' + id + '"]');
  const vis = e => e.getClientRects().length > 0;
  return {
    inputs: [...c.querySelectorAll('input, textarea')].filter(vis).map(e => ({ k: e.dataset.coach, tag: e.tagName, h: Math.round(e.getBoundingClientRect().height), font: getComputedStyle(e).fontSize })),
    ctrls: [...c.querySelectorAll('.co-exc-head summary, .co-exc-chev, .co-seg, .co-set-add, .co-tile-btn')].filter(vis).map(e => ({ c: e.className, h: Math.round(e.getBoundingClientRect().height) })),
  };
}, id);

// Colores con tinte (no gris) en un valor de CSS (como en neon.test.mjs): rgb()/rgba() y
// color(srgb …), que es como sale un color-mix() calculado.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([, , , a = 1]) => a > 0.05);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);
const FILETE = /linear-gradient\(155deg/;
// El filete de las cajas: un linear-gradient a 155° con un toque de color en la punta.
const neon = v => FILETE.test(v || '') && conTinte(v.slice(v.search(FILETE)));
// Dónde lleva el filete cada tarjeta: en el fondo (border-box), en el ::after o en el ::before.
const filetes = p => p.evaluate(() => {
  const sel = { cerrada: '.co-exc-grid > .co-exc-collapsed', abierta: '.co-exc-open', superserie: '.co-ss-group .co-exc-collapsed', contador: '.co-exc-step' };
  const o = {};
  for (const k in sel){
    const e = document.querySelector(sel[k]); if (!e){ o[k] = null; continue; }
    const s = getComputedStyle(e), a = getComputedStyle(e, '::after'), b = getComputedStyle(e, '::before');
    o[k] = { bg: s.backgroundImage, borde: s.borderTopColor, after: a.content !== 'none' ? a.backgroundImage : null, before: b.content !== 'none' ? b.backgroundImage : null };
  }
  return o;
});

export default async function ({ base, t }){
  // ---- Compu (1280 px, tres columnas) ----
  {
    const { p, errs, dialogs, close } = await abrir(base, { width: 1280, height: 900 });
    let s = await tarjetas(p);
    t.eq(s.map(x => x.id), ['e0', 'e1', 'e2', 'e3', 'e4', 'e5'], 'las seis tarjetas, en orden');
    t.eq(s.filter(x => x.open), [], 'arrancan todas cerradas');
    t.ok(s.every(x => x.chev && x.chev.exp === 'false' && x.chev.label === 'Abrir ejercicio' && x.chev.w >= 36 && x.chev.h >= 36),
      'cerradas: flecha «Abrir ejercicio» con aria-expanded="false" y 36 px para tocar: ' + JSON.stringify(s.map(x => x.chev)));
    t.eq(await p.$$eval('.co-exc-chev', b => b.every(x => x.tagName === 'BUTTON' && x.type === 'button')), true, 'la flecha es un botón');
    t.eq(await p.evaluate(() => getComputedStyle(document.querySelector('.co-exc-grid')).gridTemplateColumns.split(' ').length), 3, 'tres columnas a 1280 px');
    const c0 = await medir(p, 'e0'), c1 = await medir(p, 'e1'), c2 = await medir(p, 'e2');

    // Abrir con la flecha: crece hacia abajo en su casillero.
    await p.click('.co-exc[data-id="e1"] .co-exc-chev'); await wait(350);
    t.eq(await abiertas(p), ['e1'], 'la flecha abre el ejercicio');
    const ch = (await tarjetas(p)).find(x => x.id === 'e1').chev;
    t.eq([ch && ch.exp, ch && ch.label], ['true', 'Cerrar ejercicio'], 'abierta: la flecha dice «Cerrar ejercicio» (aria-expanded="true")');
    t.ok(await p.$eval('.co-exc-open .co-exc-chev svg', e => getComputedStyle(e).transform !== 'none'), 'abierta, la flecha apunta para arriba (girada)');
    const o1 = await medir(p, 'e1');
    t.eq([o1.chevTop, o1.chevRight], [c1.chevTop, c1.chevRight], 'la flecha queda en el mismo lugar (arriba a la derecha) cerrada y abierta');
    t.ok(Math.abs(o1.w - c1.w) <= 1 && Math.abs(o1.w - c0.w) <= 1 && o1.x === c1.x, 'abierta, del mismo ancho que cerrada y en su casillero: ' + JSON.stringify({ abierta: o1.w, cerrada: c0.w, x: [o1.x, c1.x] }));
    const fila = await p.evaluate(() => document.querySelector('.co-exc-grid').getBoundingClientRect().width);
    t.ok(o1.w < fila / 2, 'no ocupa toda la fila: ' + o1.w + ' de ' + Math.round(fila));
    t.ok(o1.h > c1.h + 200, 'crece hacia abajo: ' + c1.h + ' → ' + o1.h);
    const v0 = await medir(p, 'e0'), v2 = await medir(p, 'e2');
    t.eq([v0.h, v2.h, v0.top, v2.top], [c0.h, c2.h, c0.top, c2.top], 'las de al lado no se estiran ni se mueven');
    t.ok(o1.nameFont <= c1.nameFont, 'el nombre, del mismo tamaño que cerrada (no más grande): ' + c1.nameFont + ' → ' + o1.nameFont);
    let f = await campos(p, 'e1');
    t.ok(f.inputs.length >= 8 && f.inputs.every(x => x.h <= 44 && x.font === '16px'), 'campos de hasta 44 px de alto y letra de 16 px: ' + JSON.stringify(f.inputs));
    t.ok(f.ctrls.length >= 7 && f.ctrls.every(x => x.h <= 44), 'botones chicos (Reps/Tiempo, ⋯, flecha, + Serie, casilleros): ' + JSON.stringify(f.ctrls));
    await p.click('.co-exc[data-id="e1"] .co-tile-btn[data-tile="note"]'); await wait(200);
    f = await campos(p, 'e1');
    t.ok(f.inputs.some(x => x.tag === 'TEXTAREA') && f.inputs.every(x => x.font === '16px'), 'la nota también con letra de 16 px');
    t.ok(await p.evaluate(() => { const h = document.getElementById('coachHost'); return h.scrollWidth <= h.clientWidth; }), 'sin scroll de costado');

    // Abrir otro (tocando la tarjeta cerrada) cierra el anterior.
    await p.click('.co-exc[data-id="e2"] .co-exc-cname'); await wait(350);
    t.eq(await abiertas(p), ['e2'], 'tocar otra tarjeta la abre y cierra la que estaba abierta');
    await p.click('.co-exc[data-id="e0"] .co-exc-chev'); await wait(350);
    t.eq(await abiertas(p), ['e0'], 'abrir otra con la flecha también cierra la anterior');

    // El contador de series y cambiar ejercicio no abren ni cierran.
    const nSets = () => p.$eval('.co-exc[data-id="e5"] .co-exc-step b', e => e.textContent);
    await p.click('.co-exc[data-id="e5"] .co-exc-step b'); await wait(300);
    await p.click('.co-exc[data-id="e5"] [data-coach="rt-setadd"]'); await wait(300);
    t.eq([await abiertas(p), await nSets()], [['e0'], '4 series'], 'el contador suma una serie y no abre la tarjeta (ni tocando el texto del medio)');
    await p.click('.co-exc[data-id="e5"] [data-coach="rt-swap"]'); await wait(400);
    t.ok(!!await p.$('.cp-modal'), 'cambiar ejercicio abre el buscador');
    await p.click('.cp-x'); await wait(400);
    t.eq(await abiertas(p), ['e0'], 'cambiar ejercicio no abre ni cierra tarjetas');

    // Cerrar con la flecha.
    await p.click('.co-exc[data-id="e0"] .co-exc-chev'); await wait(350);
    t.eq(await abiertas(p), [], 'la flecha cierra el ejercicio abierto');

    // Duplicar: la copia es la única abierta.
    await p.click('.co-exc[data-id="e2"] .co-exc-chev'); await wait(350);
    await p.click('.co-exc[data-id="e2"] .co-exc-menu2 summary'); await wait(200);
    await p.click('.co-exc[data-id="e2"] [data-coach="rt-dup"]'); await wait(400);
    s = await tarjetas(p);
    const copia = s[3];
    t.ok(copia && !/^e\d$/.test(copia.id) && copia.open, 'duplicar abre la copia (justo después)');
    t.eq(s.filter(x => x.open).length, 1, 'duplicar: la copia es la única abierta');

    // Agregar: el nuevo es el único abierto.
    await p.click('[data-coach="rt-add"]'); await wait(400);
    await p.fill('.cp-search', 'Sentadilla'); await wait(300);
    await p.click('.cp-ex'); await wait(600);
    s = await tarjetas(p);
    t.ok(s.length === 8 && s[7].open && !/^e\d$/.test(s[7].id), 'agregar abre el ejercicio nuevo (al final)');
    t.eq(s.filter(x => x.open).length, 1, 'agregar: el nuevo es el único abierto');

    // Insertar uno antes: el insertado es el único abierto.
    await p.click('.co-exc[data-id="e0"] .co-exc-chev'); await wait(350);
    await p.click('.co-exc[data-id="e0"] .co-exc-menu2 summary'); await wait(200);
    await p.click('.co-exc[data-id="e0"] [data-coach="rt-ins"]'); await wait(400);
    await p.fill('.cp-search', 'Zancada'); await wait(300);
    await p.click('.cp-ex'); await wait(600);
    s = await tarjetas(p);
    t.ok(s.length === 9 && s[0].open && !/^e\d$/.test(s[0].id), 'insertar abre el ejercicio insertado (antes)');
    t.eq(s.filter(x => x.open).length, 1, 'insertar: el insertado es el único abierto');

    // Adentro de una superserie: la abierta va con los mismos tamaños.
    const cs = await medir(p, 'e3');
    await p.click('.co-exc[data-id="e3"] .co-exc-chev'); await wait(350);
    t.eq(await abiertas(p), ['e3'], 'en la superserie también se abre una sola');
    t.ok(await p.$('.co-ss-group .co-exc-open[data-id="e3"]'), 'la abierta sigue adentro de su superserie');
    const os = await medir(p, 'e3');
    t.ok(os.nameFont <= cs.nameFont, 'superserie: el nombre no se agranda (' + cs.nameFont + ' → ' + os.nameFont + ')');
    f = await campos(p, 'e3');
    t.ok(f.inputs.every(x => x.h <= 44 && x.font === '16px') && f.ctrls.every(x => x.h <= 44), 'superserie: campos y botones chicos: ' + JSON.stringify(f));
    t.ok(await p.evaluate(() => { const c = document.querySelector('.co-exc-open'), n = c.querySelector('.co-exc-name'), s = c.querySelector('.co-sets-panel');
      return n.getBoundingClientRect().width <= 440 && s.getBoundingClientRect().width < c.getBoundingClientRect().width * .6; }), 'superserie: ni el nombre ni las series se estiran a todo el ancho');

    t.eq(dialogs, [], 'sin avisos');
    t.eq(errs, [], 'errores de la página (compu)');
    await close();
  }

  // ---- Celular (390 px, una columna) ----
  {
    const { p, errs, close } = await abrir(base, { width: 390, height: 844 }, undefined);
    const c = await medir(p, 'e1');
    t.ok(Math.abs(c.chevMid - c.nameMid) <= 4, 'celular cerrada: la flecha en el renglón del nombre: ' + JSON.stringify(c));
    await p.click('.co-exc[data-id="e1"] .co-exc-chev'); await wait(350);
    const o = await medir(p, 'e1');
    t.ok(Math.abs(o.chevMid - o.nameMid) <= 4, 'celular abierta: la flecha en el renglón del nombre, no sola abajo: ' + JSON.stringify(o));
    t.eq([o.chevTop, o.chevRight], [c.chevTop, c.chevRight], 'celular: la flecha en el mismo lugar cerrada y abierta');
    t.ok(Math.abs(o.w - c.w) <= 1, 'celular: del mismo ancho que cerrada (' + c.w + ' / ' + o.w + ')');
    t.ok(o.nameFont <= c.nameFont, 'celular: el nombre no se agranda');
    const f = await campos(p, 'e1');
    t.ok(f.inputs.every(x => x.h <= 44 && x.font === '16px') && f.ctrls.every(x => x.h <= 44), 'celular: campos y botones chicos: ' + JSON.stringify(f));
    t.ok(await p.evaluate(() => { const h = document.getElementById('coachHost'), c = document.querySelector('.co-exc-open');
      return h.scrollWidth <= h.clientWidth && c.scrollWidth <= c.clientWidth + 1; }), 'celular: sin scroll de costado');
    await p.click('.co-exc[data-id="e2"] .co-exc-cname'); await wait(350);
    t.eq(await abiertas(p), ['e2'], 'celular: abrir otro cierra el anterior');
    t.eq(errs, [], 'errores de la página (celular)');
    await close();
  }

  // ---- El filete de neón en cada apariencia ----
  const APARIENCIAS = [
    ['Oscuro', ''], ['Azul', "localStorage.setItem('gize_tema','azul');"], ['Rosa', "localStorage.setItem('gize_tema','rosa');"],
    ['Claro', "localStorage.setItem('gize_tema','luz');"], ['Oscuro sin neón', "localStorage.setItem('gize_neon','0');"],
    ['Azul sin neón', "localStorage.setItem('gize_tema','azul'); localStorage.setItem('gize_neon','0');"],
    ['Claro sin neón', "localStorage.setItem('gize_tema','luz'); localStorage.setItem('gize_neon','0');"],
  ];
  for (const [nombre, init] of APARIENCIAS){
    const { p, errs, close } = await abrir(base, { width: 1280, height: 900 }, init);
    await p.click('.co-exc[data-id="e1"] .co-exc-chev'); await wait(350);
    const fl = await filetes(p);
    const sinNeon = /sin neón/.test(nombre);
    for (const k of ['cerrada', 'abierta', 'superserie', 'contador']){
      const x = fl[k];
      if (!x){ t.ok(false, nombre + ': no está la ' + k); continue; }
      // Dónde va el filete según la apariencia (como las otras cajas).
      const donde = nombre.startsWith('Azul') || nombre.startsWith('Rosa') ? x.after : nombre.startsWith('Claro') ? x.before : x.bg;
      if (!sinNeon){
        t.ok(neon(donde), nombre + ', ' + k + ': lleva el filete de neón de las cajas: ' + JSON.stringify(x));
        if (donde !== x.bg) t.eq(x.borde, 'rgba(0, 0, 0, 0)', nombre + ', ' + k + ': el borde propio queda transparente debajo del filete');
      } else {
        t.ok(![x.bg, x.after, x.before].some(conTinte), nombre + ', ' + k + ': sin neón, ningún color en el borde: ' + JSON.stringify(x));
        if (!nombre.startsWith('Claro')) t.ok(/rgba\(255, 255, 255, 0\.18\)/.test(donde || ''), nombre + ', ' + k + ': sin neón, el filete blanco de las cajas: ' + JSON.stringify(x));
      }
    }
    // Igual que la caja del día (.co-day-card), que ya lo tenía.
    const dia = await p.evaluate(() => { const e = document.querySelector('.co-day-card'), s = getComputedStyle(e), a = getComputedStyle(e, '::after'), b = getComputedStyle(e, '::before');
      return [s.backgroundImage, a.content !== 'none' ? a.backgroundImage : '', b.content !== 'none' ? b.backgroundImage : ''].join(' | '); });
    t.eq(neon(dia), !sinNeon, nombre + ': la caja del día, igual que las tarjetas');
    t.eq(errs, [], 'errores de la página (' + nombre + ')');
    await close();
  }
}
