// IA en Comida: la foto del plato, con Supabase y la función «ia» simulados. Solo fotos:
// «Contame qué comiste» se sacó. Revisa:
// - apagada (o sin poder preguntar el estado): no aparece nada nuevo, ni en Comida ni en Ajustes;
// - prendida: al lado del buscador queda solo «Foto» (el escáner sale solo con la IA apagada);
// - el permiso: sale antes de abrir la cámara; con «Ahora no» no se guarda ni se llama a nada y
//   vuelve a preguntar la próxima vez; al aceptar se guarda con la versión del aviso y no se vuelve
//   a preguntar;
// - el plato de punta a punta: la foto va achicada en JPEG; la hoja muestra «Base GIZE» o
//   «Estimado con IA» y «Revisá»; editar los gramos (escribiendo y con − / +) recalcula en vivo;
//   ✕ quita; «+1 cda» suma aceite; «Cambiar» reemplaza por un alimento de la base; la comida
//   elegida; nada se anota hasta «Agregar» y lo anotado lleva fuente ia / ia-editado;
// - solo fotos: aunque el panel todavía tenga prendido «texto», no hay «Contame qué comiste» ni
//   «¿No está? Contalo con tus palabras»; doble toque en «Agregar» anota una sola vez;
// - «¿Está mal? Avisanos» manda lo que estimó la IA, sin la foto.
// Con SHOTS=<carpeta> guarda capturas de cada paso.
import { wait, ALUMNO, saved } from './lib.mjs';
import { ESTADO_ON, PLATO, base, pagina, abrirComida, abrirBuscador, fotoJpeg } from './comida-ia-comun.mjs';

const SHOTS = process.env.SHOTS;
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: SHOTS + '/' + n + '.png' }); };

const visible = (p, sel) => p.isVisible(sel).catch(() => false);
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
export default async function ({ base: url, t }){
  // ---------- apagada: nada nuevo ----------
  for (const [nombre, o] of [['apagada', { estado: { activa: false, funciones: { plato: false, texto: false }, permiso_comida: null, aviso_version: 1 } }], ['sin ia.sql', { sinEstado: true }]]){
    const { p, errs, S, close } = await pagina(o);
    await abrirComida(p, url); await abrirBuscador(p);
    t.ok(!(await p.$('[data-action="ia-plato"]')) && !(await p.$('[data-action="ia-texto"]')), nombre + ': el buscador no muestra la IA');
    await p.fill('#foodSearch', 'zzzz inexistente'); await wait(600);
    t.ok(!(await p.$('.ia-nores')), nombre + ': la búsqueda sin resultados no ofrece la IA');
    if (nombre === 'apagada') await shot(p, '01-apagada-buscador');
    await p.click('.ss-x[data-action="search-close"]'); await wait(400);
    await p.click('#nav-config'); await wait(900);
    t.ok(!(await p.$('[data-action="cfg-ia-toggle"]')), nombre + ': Ajustes no muestra «Funciones con IA»');
    // Si falla (la base todavía sin ia.sql), no se vuelve a preguntar en cada redibujo.
    for (let i = 0; i < 3; i++) { await p.click('#nav-comida'); await wait(300); await abrirBuscador(p); await p.click('.ss-x[data-action="search-close"]'); await wait(400); await p.click('#nav-config'); await wait(300); }
    t.eq(S.nEstado, 1, nombre + ': ia_mi_estado se pregunta una sola vez usando Comida y Ajustes');
    t.eq(S.llamadas.length, 0, nombre + ': no se llama a la función');
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }

  // ---------- el estado llega mientras se escribe en el buscador ----------
  for (const [nombre, est] of [['apagada', { activa: false, funciones: { plato: false, texto: false }, permiso_comida: null, aviso_version: 1 }], ['prendida', ESTADO_ON]]){
    const pg = await pagina({ estado: est, estadoTarde: 2500 });
    await pg.p.goto(url + '/app/'); await wait(2500);
    await pg.p.click('#nav-comida'); await wait(300);
    await pg.p.click('[data-action="search-open"]'); await wait(500);
    await pg.p.keyboard.type('pol', { delay: 60 }); await wait(2600);
    await pg.p.keyboard.type('lo', { delay: 60 }); await wait(300);
    t.eq(await pg.p.evaluate(() => [document.activeElement && document.activeElement.id, document.getElementById('foodSearch').value]), ['foodSearch', 'pollo'],
      nombre + ': al llegar el estado, el buscador sigue con el foco y lo escrito');
    t.eq(!!(await pg.p.$('#sheetHost [data-action="ia-plato"]')), nombre === 'prendida', nombre + ': «Foto» ' + (nombre === 'prendida' ? 'aparece' : 'no aparece'));
    t.eq(!!(await pg.p.$('#sheetHost .search-sheet [data-action="scan-open"]')), nombre === 'apagada', nombre + ': el escáner ' + (nombre === 'apagada' ? 'queda en la barra' : 'se va de la barra'));
    t.eq(pg.errs, [], nombre + ' (estado tarde): errores de la página');
    await pg.close();
  }

  // ---------- prendida: el permiso ----------
  const { p, errs, S, close, preguntas } = await pagina();
  await abrirComida(p, url); await abrirBuscador(p);
  t.ok(await visible(p, '#sheetHost [data-action="ia-plato"]'), 'prendida: «Foto» al lado del buscador');
  t.ok(!(await p.$('#sheetHost .search-sheet [data-action="scan-open"]')), 'prendida: sin el escáner en la barra (queda solo «Foto»)');
  t.eq(await p.getAttribute('#sheetHost [data-action="ia-plato"]', 'aria-label'), 'Registrar con una foto (IA)', '«Foto» con su aria-label');
  t.has(await txt(p, '#sheetHost [data-action="ia-plato"]'), 'Foto', '«Foto» con la etiqueta visible');
  t.ok(!(await p.$('[data-action="ia-texto"]')) && !(await txt(p, '#sheetHost .search-sheet')).includes('Contame'), 'prendida: sin «Contame qué comiste» (solo fotos)');
  await shot(p, '02-buscador-con-ia');
  const caja = await p.evaluate(() => { const b = document.querySelector('#sheetHost [data-action="ia-plato"]').getBoundingClientRect(); return [b.width, b.height]; });
  t.ok(caja[0] >= 44 && caja[1] >= 44, '«Foto» se toca bien (≥ 44 × 44): ' + caja);
  t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal (390 px)');

  await p.click('#sheetHost [data-action="ia-plato"]'); await wait(600);
  t.ok(await visible(p, '#iaPermHost .ia-perm'), 'antes de la cámara sale el permiso');
  const hoja = await txt(p, '#iaPermHost .ia-perm');
  for (const f of ['Usar IA en Comida', 'Anthropic', 'Estados Unidos', 'no tu nombre, tu mail', '30 días', 'GIZE no guarda la foto del plato', 'Ajustes → Funciones con IA', 'Aceptar y usar IA', 'Ahora no', 'Política de privacidad'])
    t.has(hoja, f, 'el permiso dice «' + f + '»');
  t.ok(!(await p.$('#sheetHost input[data-action="plate-file"]')), 'la cámara no se abre antes de aceptar');
  await shot(p, '03-permiso');
  await p.click('#iaPermHost .ctrl[data-ia="no"]'); await wait(600);
  t.ok(!(await visible(p, '#iaPermHost .ia-perm')) && !(await p.$('#sheetHost .plate-sheet')), '«Ahora no»: cierra y no abre la hoja');
  t.has(await txt(p, '#iaToast'), 'Sin problema. La podés activar cuando quieras en Ajustes.', '«Ahora no»: el aviso');
  t.eq([S.permisos.length, S.llamadas.length], [0, 0], '«Ahora no»: no guarda nada ni llama a la IA');
  await shot(p, '04-ahora-no');

  await p.click('#sheetHost [data-action="ia-plato"]'); await wait(600);
  t.ok(await visible(p, '#iaPermHost .ia-perm'), 'después de «Ahora no» vuelve a preguntar');
  await p.click('#iaPermHost [data-ia="si"]'); await wait(800);
  t.eq(S.permisos, [{ p_tipo: 'comida', p_acepta: true, p_version: 1 }], 'aceptar guarda el permiso con la versión del aviso');
  t.ok(await visible(p, '#sheetHost .plate-sheet') && !!(await p.$('#sheetHost input[data-action="plate-file"][capture="environment"]')) && !!(await p.$('#sheetHost input[data-action="plate-file"]:not([capture])')),
    'después de aceptar: sacar foto o elegir de la galería');
  await shot(p, '05-elegir-foto');

  // ---------- la foto ----------
  let soltar; const espera = new Promise(r => { soltar = r; });
  S.demora = espera;
  await p.route(/functions\/v1\/ia/, async r => { await espera; await r.fallback(); });
  await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(900);
  t.has(await txt(p, '#sheetHost .pl8-wait'), 'Analizando la foto…', 'mientras tanto: «Analizando la foto…»');
  t.ok(!!(await p.$('#sheetHost .pl8-photo')), 'se ve la foto');
  await shot(p, '06-analizando');
  await wait(2200);
  t.has(await txt(p, '#sheetHost .pl8-wait'), 'Buscando en la base de GIZE…', 'después: «Buscando en la base de GIZE…»');
  soltar(); await wait(1200);
  const ll = S.llamadas[0] || {};
  t.ok(ll.modo === 'plato' && /^\/9j\//.test(ll.imagen || '') && ll.texto === '', 'manda la foto en JPEG (base64) y sin aclaración');
  t.ok(!JSON.stringify(ll).includes(ALUMNO.id) && !JSON.stringify(ll).includes(ALUMNO.email), 'no manda el id ni el mail');
  const tam = await p.evaluate(async b64 => { const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode(); return Math.max(i.naturalWidth, i.naturalHeight); }, ll.imagen || '');
  t.ok(tam > 0 && tam <= 1024, 'la foto va achicada a 1024 px como mucho (' + tam + ')');

  const filas = async () => p.$$eval('#sheetHost .pl8-row', rs => rs.map(r => ({ n: r.querySelector('.pl8-name').textContent, src: r.querySelector('.pl8-src').textContent.replace(/\s+/g, ' ').trim(),
    g: r.querySelector('input').value, v: r.querySelector('.pl8-vals').textContent })));
  let fs = await filas();
  t.eq(fs.map(f => f.n), ['Milanesa de carne frita', 'Puré de papa (con leche y manteca)', 'Salsa criolla'], 'la lista: las de la base con su nombre GIZE');
  t.ok(/Base GIZE/.test(fs[0].src) && /Base GIZE/.test(fs[1].src) && /Estimado con IA/.test(fs[2].src), 'el origen de cada una: «Base GIZE» o «Estimado con IA»');
  t.ok(/Revisá/.test(fs[1].src) && !/Revisá/.test(fs[0].src), '«Revisá» en la dudosa');
  t.eq(fs[0].v, '465 kcal · P 31,5 · C 18 · G 30', 'la milanesa con los valores de la base (150 g × 310 kcal cada 100 g)');
  t.has(await txt(p, '#pl8Tot'), '707 kcal', 'los totales');
  t.has(await txt(p, '#pl8Go'), 'Agregar', 'el botón «Agregar»');
  t.has(await txt(p, '#sheetHost .plate-sheet'), 'Estimado con IA. Puede equivocarse', 'el texto chico de la estimación');
  t.has(await txt(p, '#sheetHost .plate-sheet'), 'Supuse que el puré lleva manteca.', 'la nota de la IA');
  const desc = await p.evaluate(() => { const b = document.querySelector('#sheetHost .pl8-chg'); const id = b.getAttribute('aria-describedby'); return !!document.getElementById(id) && document.getElementById(id).textContent; });
  t.ok(/Base GIZE/.test(desc || ''), '«Cambiar» lee el origen con aria-describedby');
  const chicos = await p.$$eval('#sheetHost .pl8-x, #sheetHost .pl8-step, #sheetHost .pl8-chg, #sheetHost .ss-x, #sheetHost .pl8-foot .meal-chip', bs => bs.map(b => b.getBoundingClientRect()).filter(r => r.width < 44 - 0.5 || r.height < 44 - 0.5).length);
  t.eq(chicos, 0, 'los controles de la hoja miden al menos 44 × 44');
  t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'la hoja no hace scroll horizontal');
  await shot(p, '07-revision');

  // Nada anotado todavía.
  t.eq(((await saved(p)) || {}).diary || [], [], 'nada se anota antes de «Agregar»');
  t.eq(S.posts.length, 0, 'nada sube a la nube antes de «Agregar»');

  // Más de 5000 g: el campo queda en 5000 (lo mismo que se anotaría).
  await p.fill('#sheetHost input[data-action="plate-grams"][data-i="0"]', '6000'); await wait(300);
  t.eq(await p.inputValue('#sheetHost input[data-action="plate-grams"][data-i="0"]'), '5000', 'más de 5000 g: el campo queda en 5000');
  // Gramos: escribir y − / +.
  await p.fill('#sheetHost input[data-action="plate-grams"][data-i="0"]', '200'); await wait(300);
  fs = await filas();
  t.eq(fs[0].v, '620 kcal · P 42 · C 24 · G 40', 'escribir los gramos recalcula la fila en vivo');
  t.has(await txt(p, '#pl8Tot'), '862 kcal', 'y los totales');
  await p.click('#sheetHost [data-action="plate-step"][data-d="1"][data-i="2"]'); await wait(300);
  fs = await filas();
  t.eq(fs[2].g, '50', '+ suma de a 10 g en lo estimado');
  // ✕ quita.
  await p.click('#sheetHost [data-action="plate-remove"][data-i="2"]'); await wait(400);
  fs = await filas();
  t.eq(fs.map(f => f.n), ['Milanesa de carne frita', 'Puré de papa (con leche y manteca)'], '✕ quita la fila');
  // Aceite.
  await p.click('#sheetHost [data-action="plate-oil"]'); await wait(400);
  fs = await filas();
  t.ok(fs.length === 3 && fs[2].n === 'Aceite de girasol' && fs[2].g === '10', '«+1 cda» suma 10 g de aceite de la base');
  // Cambiar el puré por otro de la base.
  await p.click('#sheetHost [data-action="plate-change"][data-i="1"]'); await wait(700);
  t.ok(await visible(p, '#sheetHost .search-sheet'), '«Cambiar» abre el buscador');
  t.ok(!(await p.$('#sheetHost [data-action="ia-plato"]')) && !(await p.$('#sheetHost [data-action="food-create-open"]')), 'el buscador para cambiar no ofrece la IA ni crear');
  await p.fill('#foodSearch', 'calabaza'); await wait(500);
  await shot(p, '08-cambiar');
  const elegido = await p.$eval('#foodResults [data-action="food-pick"] .food-name', e => e.childNodes[0].textContent.trim());
  await p.click('#foodResults [data-action="food-pick"]'); await wait(800);
  fs = await filas();
  t.ok(await visible(p, '#sheetHost .plate-sheet') && fs.length === 3 && fs[1].n.startsWith(elegido.split(' (')[0]) && /Base GIZE/.test(fs[1].src) && fs[1].g === '200',
    'vuelve a la hoja con el alimento cambiado (mismos gramos): ' + JSON.stringify(fs[1]) + ' / ' + elegido);
  // La comida.
  await p.click('#sheetHost .pl8-foot [data-action="plate-meal"][data-meal="cena"]'); await wait(300);
  t.has(await txt(p, '#pl8Go'), 'Agregar a la cena', 'el botón dice la comida elegida');
  await shot(p, '09-editado');

  // ¿Está mal?
  p.dialogAnswer = 'El puré era de calabaza';
  await p.click('#sheetHost [data-action="plate-report"]'); await wait(900);
  const rep = S.reportes[0] || {};
  t.ok(rep.p_funcion === 'plato' && rep.p_comentario === 'El puré era de calabaza' && rep.p_respuesta && Array.isArray(rep.p_respuesta.items), '«¿Está mal?» manda lo que estimó la IA y el comentario');
  t.ok(!JSON.stringify(rep).includes('/9j/'), '«¿Está mal?» no manda la foto');

  // Agregar.
  await p.click('#pl8Go'); await wait(1200);
  const d = ((await saved(p)) || {}).diary || [];
  t.eq(d.map(e => [e.name, e.grams, e.meal, e.fuente || null]), [['Milanesa de carne frita', 200, 'cena', 'ia-editado'], [fs[1].n, 200, 'cena', 'ia-editado'], ['Aceite de girasol', 10, 'cena', null]],
    '«Agregar» anota cada fila: lo editado como ia-editado, lo agregado a mano sin fuente');
  t.ok(d[0] && d[0].kcal === 620 && d[0].base && d[0].base.kcal === 310, 'con las calorías y la base cada 100 g');
  t.ok(!(await p.$('#sheetHost .plate-sheet')), 'la hoja se cierra');
  t.ok(await p.$eval('.diary-item .ia-chip', e => /IA/.test(e.textContent)).catch(() => false), 'en el diario: el chip «IA»');
  await shot(p, '10-diario');

  t.has(await txt(p, '#iaToast'), 'agregados a la cena.', 'el aviso: «agregados a la cena»');
  // La segunda vez no pregunta el permiso, y el buscador vuelve a la comida según la hora.
  await abrirBuscador(p);
  const ahora = await p.evaluate(() => { const h = new Date().getHours(); return h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : h < 20 ? 'merienda' : 'cena'; });
  t.eq(await p.$$eval('#sheetHost [data-action="search-meal"].on', bs => bs.map(b => b.dataset.meal)), [ahora], 'después del plato, el buscador no queda con la comida elegida');
  await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
  t.ok(!(await visible(p, '#iaPermHost .ia-perm')) && await visible(p, '#sheetHost .plate-sheet'), 'aceptado: no vuelve a preguntar');
  t.eq(S.permisos.length, 1, 'el permiso se guardó una sola vez');
  await p.click('#sheetHost .ss-x[data-action="plate-cancel"]'); await wait(500);

  // ---------- solo fotos: sin «Contame qué comiste» ----------
  // El panel puede tener todavía «texto» prendido (ESTADO_ON lo trae): la app no lo muestra.
  const pt = await pagina({ estado: Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' }) });
  await abrirComida(pt.p, url);
  t.ok(!(await pt.p.$('[data-action="ia-texto"]')), 'solo fotos: la pantalla de Comida sin «Contame qué comiste»');
  await abrirBuscador(pt.p);
  await pt.p.fill('#foodSearch', 'empanada de algo raro que no existe'); await wait(600);
  t.ok(!(await pt.p.$('.ia-nores')) && !(await pt.p.$('[data-action="ia-texto"]')), 'solo fotos: la búsqueda sin resultados no ofrece contarlo con palabras');
  const ss = await txt(pt.p, '#sheetHost .search-sheet');
  t.ok(!/Contame|Contalo|con tus palabras/.test(ss), 'solo fotos: sin resultados, nada de texto con IA: ' + ss.slice(0, 160));
  await shot(pt.p, '11-sin-texto');
  // La foto sigue de punta a punta, y el doble toque en «Agregar» anota una sola vez.
  await pt.p.fill('#foodSearch', ''); await wait(300);
  await pt.p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
  t.ok(!(await txt(pt.p, '#sheetHost .plate-sheet')).includes('Contá qué comiste'), 'solo fotos: la hoja es la de la foto');
  await pt.p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(pt.p)); await wait(1500);
  t.eq(pt.S.llamadas.map(b => b.modo), ['plato'], 'solo fotos: la app llama solo en modo plato');
  t.eq((await pt.p.$$('#sheetHost .pl8-row')).length, 3, 'solo fotos: la hoja con las filas');
  await pt.p.dblclick('#pl8Go'); await wait(1000);
  const dt = ((await saved(pt.p)) || {}).diary || [];
  t.eq(dt.map(e => [e.grams, e.fuente]), [[150, 'ia'], [200, 'ia'], [40, 'ia']], 'la foto se anota como «ia» (sin tocar), una sola vez aunque toque dos veces');
  t.eq(pt.errs, [], 'solo fotos: errores de la página');
  await pt.close();

  t.eq(errs, [], 'errores de la página');
  t.eq(preguntas.filter(q => q.respuesta !== true && q.respuesta !== 'El puré era de calabaza').length, 0, 'preguntas inesperadas: ' + JSON.stringify(preguntas));
  await close();
}
