// IA en Comida por voz («Contá qué comiste»), con Supabase y la función «ia» simulados. La persona
// dicta con el micrófono del teclado (o escribe) y a la función va solo el texto. Revisa:
// - sin la base nueva (ia_mi_estado sin aviso_texto) o con «texto» apagado en el panel: no aparece
//   nada de la voz (ni en Comida, ni en el buscador, ni en Ajustes);
// - prendida: «Voz» al lado de «Foto» (barra y buscador), con aria-label y de 44 × 44, sin scroll
//   horizontal en 320 px; al tocarla, el foco queda en el campo en el mismo toque (sin esperar a la
//   red) y no se llama a nada;
// - vacío o sin conexión: avisa y no llama; el permiso (versión 3, el de la voz): con «Ahora no» no se
//   guarda ni se manda nada y lo escrito queda; al aceptar se guarda con p_version 3;
// - manda { modo: 'texto', texto } sin imagen; «2 empanadas» da 180 g (la cuenta la hace la app) y la
//   gaseosa va en ml; se ve lo que dijo; «en el almuerzo» elige Almuerzo; «¿O era …?» y − / + de a
//   90 g; «Agregar» anota con fuente ia una sola vez; «¿Está mal?» manda p_funcion 'texto' con dijo;
// - el vacío y los avisos de la voz (límite de hoy, ahorro); con las fotos gratis de la semana
//   agotadas la voz sigue andando y el aviso del límite de fotos ofrece «Contalo con tu voz»;
// - quien aceptó el aviso de la foto (versión 2) sigue con la foto sin que le pregunten, y la voz
//   le pregunta la primera vez.
// Con SHOTS=<carpeta> guarda capturas de cada paso.
import { wait, ALUMNO, saved } from './lib.mjs';
import { ESTADO_ON, ESTADO_VOZ, PLATO, base, pagina, abrirComida, abrirBuscador } from './comida-ia-comun.mjs';

const SHOTS = process.env.SHOTS;
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: SHOTS + '/' + n + '.png' }); };
const visible = (p, sel) => p.isVisible(sel).catch(() => false);
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);

const EMPANADA = base(1091, 'Empanada de carne al horno (1 u. ≈ 90 g)', 230, 10, 25, 11);
const FRITA = base(1117, 'Empanada de carne frita (1 u. ≈ 90 g)', 290, 10, 25, 17);
const COCA = base(914, 'Gaseosa cola', 42, 0, 10.6, 0, 'ml');
// La IA contesta con gramos que no cierran (150 g por dos empanadas): la app los pasa con la unidad de la base.
const VOZ = { ok: true, hay_comida: true, nota: '', modelo_nombre: 'IA', items: [
  { nombre: 'Empanada de carne', gramos: 150, kcal: 345, p: 15, c: 37, f: 16, cantidad: 2, unidad: 'empanadas', dudoso: true, base: EMPANADA, alternativa: FRITA },
  { nombre: 'Coca', gramos: 300, kcal: 126, p: 0, c: 32, f: 0, cantidad: 1, unidad: 'vaso', dudoso: false, base: COCA },
] };
const VACIO = { ok: true, hay_comida: false, nota: '', modelo_nombre: 'IA', items: [] };
const DIJO = 'en el almuerzo comí 2 empanadas de carne y una coca';
const OK2 = Object.assign({}, ESTADO_VOZ, { permiso_comida: 'ok', permiso_texto: 'ok' });

export default async function ({ base: url, t }){
  // ---------- sin la base nueva o apagada: nada de la voz ----------
  for (const [nombre, est] of [['sin aviso_texto', Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' })], ['texto apagado', Object.assign({}, OK2, { funciones: { plato: true, texto: false } })]]){
    const { p, errs, S, close } = await pagina({ estado: est });
    await abrirComida(p, url);
    t.ok(!(await p.$('[data-action="ia-voz"]')), nombre + ': la barra no muestra «Voz»');
    await abrirBuscador(p);
    t.ok(!(await p.$('#sheetHost [data-action="ia-voz"]')) && await visible(p, '#sheetHost [data-action="ia-plato"]'), nombre + ': el buscador con «Foto» y sin «Voz»');
    await p.fill('#foodSearch', 'zzzz inexistente'); await wait(600);
    t.ok(!(await p.$('.ia-nores')), nombre + ': sin resultados no ofrece la voz');
    await p.click('.ss-x[data-action="search-close"]'); await wait(400);
    await p.click('#nav-config'); await wait(900);
    t.eq(await txt(p, '#cfgIaDesc'), 'Envía a Anthropic (EE. UU.) la foto de cada consulta. Apagado: no se manda nada. Política de privacidad', nombre + ': Ajustes sigue diciendo solo la foto');
    t.eq(S.llamadas.length, 0, nombre + ': no llama');
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }

  // ---------- prendida: el botón, el campo y el permiso ----------
  const { p, errs, S, close } = await pagina({ estado: ESTADO_VOZ, estadoTarde: 1500, touch: true, funcion: b => [200, b.modo === 'texto' ? VOZ : PLATO] });
  await p.goto(url + '/app/'); await wait(3200);
  await p.click('#nav-comida'); await wait(2200);
  t.ok(await visible(p, '#view .comida-barra [data-action="ia-voz"]') && await visible(p, '#view .comida-barra [data-action="ia-plato"]') && !(await p.$('#view .comida-barra [data-action="scan-open"]')),
    'la barra: «Foto» y «Voz» (sin el escáner)');
  t.eq(await p.getAttribute('#view [data-action="ia-voz"]', 'aria-label'), 'Contar lo que comiste, con tu voz o escrito (IA)', '«Voz» con su aria-label');
  t.has(await txt(p, '#view [data-action="ia-voz"]'), 'Voz', '«Voz» con la etiqueta visible');
  const caja = await p.evaluate(() => { const b = document.querySelector('#view [data-action="ia-voz"]').getBoundingClientRect(); return [b.width, b.height]; });
  t.ok(caja[0] >= 44 && caja[1] >= 44, '«Voz» se toca bien (≥ 44 × 44): ' + caja);
  await p.setViewportSize({ width: 320, height: 700 }); await wait(300);
  t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal en 320 px');
  const cajas = await p.$$eval('#view .comida-barra .ia-foto-btn', bs => bs.map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  t.ok(cajas.length === 2 && cajas.every(x => x >= 44), 'en 320 px los dos siguen de 44 × 44: ' + cajas);
  await shot(p, '30-barra-320');
  await p.setViewportSize({ width: 390, height: 844 }); await wait(300);
  await abrirBuscador(p);
  t.ok(await visible(p, '#sheetHost .search-sheet [data-action="ia-voz"]'), 'el buscador también tiene «Voz»');
  t.has(await txt(p, '#sheetHost .search-sheet'), 'O tocá «Foto» o «Voz» y la IA lo arma por vos.', 'el buscador vacío nombra las dos');
  await p.click('.ss-x[data-action="search-close"]'); await wait(500);

  // El foco en el campo en el mismo toque: ia_mi_estado tarda 1,5 s y el foco ya está.
  await p.click('#view [data-action="ia-voz"]');
  t.eq(await p.evaluate(() => document.activeElement && document.activeElement.id), 'pl8Txt', 'al tocar «Voz» el foco queda en el campo en el mismo toque');
  const hojaTxt = await txt(p, '#sheetHost .plate-sheet');
  for (const f of ['Contá qué comiste', 'Tocá el micrófono del teclado y decí lo que comiste.', 'Ej: dos empanadas de carne y una coca', 'Calcular con IA', '¿No ves el micrófono?'])
    t.has(hojaTxt, f, 'la hoja dice «' + f + '»');
  t.eq(await p.$eval('#pl8Txt', e => [e.tagName, e.maxLength, e.getAttribute('enterkeyhint')]), ['TEXTAREA', 400, 'send'], 'el campo: hasta 400 letras y «Enviar» en el teclado');
  t.eq([S.llamadas.length, S.permisos.length], [0, 0], 'abrir la hoja no llama a nada ni guarda nada');
  t.ok(!(await visible(p, '#iaPermHost .ia-perm')), 'abrir la hoja no pregunta el permiso');
  await wait(1700);
  await shot(p, '31-contar');

  // Vacío: avisa y no llama.
  await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(400);
  t.has(await txt(p, '#sheetHost .plate-sheet'), 'Contá qué comiste (por ejemplo: dos empanadas de carne y una coca).', 'vacío: pide que cuente qué comió');
  t.ok(!(await visible(p, '#iaPermHost .ia-perm')) && S.llamadas.length === 0, 'vacío: ni permiso ni llamada');
  // Sin conexión: avisa, no llama y lo escrito queda.
  await p.fill('#pl8Txt', DIJO); await wait(200);
  t.eq(await txt(p, '#pl8Cnt'), String(DIJO.length), 'el contador de letras');
  await p.context().setOffline(true);
  await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(400);
  t.has(await txt(p, '#sheetHost .plate-sheet'), 'Sin conexión. La IA necesita internet', 'sin conexión: el aviso');
  t.ok(S.llamadas.length === 0 && !(await visible(p, '#iaPermHost .ia-perm')), 'sin conexión: no llama ni pregunta');
  t.eq(await p.inputValue('#pl8Txt'), DIJO, 'sin conexión: lo escrito queda');
  await p.context().setOffline(false); await wait(300);

  // El permiso, versión 3.
  await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(600);
  t.ok(await visible(p, '#iaPermHost .ia-perm'), 'antes de mandar sale el permiso');
  const hoja = await txt(p, '#iaPermHost .ia-perm');
  for (const f of ['Usar IA en Comida', 'la foto que elegís o lo que contás (escrito o dictado)', 'Solo se manda la foto o tu texto', 'GIZE no graba tu voz', 'GIZE no guarda la foto del plato ni lo que contás', 'aceptás que tu foto o tu texto se envíen a Anthropic'])
    t.has(hoja, f, 'el permiso de la voz dice «' + f + '»');
  await shot(p, '32-permiso-v3');
  await p.click('#iaPermHost .ctrl[data-ia="no"]'); await wait(600);
  t.eq([S.permisos.length, S.llamadas.length], [0, 0], '«Ahora no»: no guarda nada ni manda nada');
  t.ok(await visible(p, '#sheetHost .plate-sheet'), '«Ahora no»: la hoja sigue');
  t.eq(await p.inputValue('#pl8Txt'), DIJO, '«Ahora no»: lo escrito queda');

  // Aceptar y mandar (con Enter, el «Enviar» del teclado).
  let soltar; const espera = new Promise(r => { soltar = r; });
  await p.route(/functions\/v1\/ia/, async r => { await espera; await r.fallback(); });
  await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(600);
  await p.click('#iaPermHost [data-ia="si"]'); await wait(900);
  t.eq(S.permisos, [{ p_tipo: 'comida', p_acepta: true, p_version: 3 }], 'aceptar guarda el permiso con la versión 3');
  t.has(await txt(p, '#sheetHost .pl8-wait'), 'Leyendo lo que comiste…', 'mientras tanto: «Leyendo lo que comiste…»');
  t.has(await txt(p, '#sheetHost .pl8-dijo'), DIJO, 'mientras tanto se ve lo que dijo');
  await shot(p, '33-leyendo');
  soltar(); await wait(1200);
  await p.unroute(/functions\/v1\/ia/);
  const ll = S.llamadas[0] || {};
  t.eq(Object.keys(ll).sort(), ['modo', 'texto'], 'manda solo el modo y el texto (sin imagen)');
  t.eq([ll.modo, ll.texto], ['texto', DIJO], 'manda { modo: texto, texto }');
  t.ok(!JSON.stringify(ll).includes(ALUMNO.id) && !JSON.stringify(ll).includes(ALUMNO.email), 'no manda el id ni el mail');

  // La revisión.
  const filas = async () => p.$$eval('#sheetHost .pl8-row', rs => rs.map(r => ({ n: r.querySelector('.pl8-name').textContent, g: r.querySelector('input').value, u: r.querySelector('.pl8-g span').textContent })));
  let fs = await filas();
  t.eq(fs, [{ n: 'Empanada de carne al horno', g: '180', u: 'g' }, { n: 'Gaseosa cola', g: '250', u: 'ml' }], '«2 empanadas» da 180 g (2 × 90 g) y la gaseosa va en ml: ' + JSON.stringify(fs));
  t.has(await txt(p, '#sheetHost .pl8-dijo'), DIJO, 'en la revisión se ve lo que dijo');
  t.eq(await p.$$eval('#sheetHost .pl8-foot [data-action="plate-meal"].on', bs => bs.map(b => b.dataset.meal)), ['almuerzo'], '«en el almuerzo» elige Almuerzo');
  t.has(await txt(p, '#pl8Go'), 'Agregar al almuerzo', 'el botón dice la comida');
  t.has(await txt(p, '#sheetHost .plate-sheet'), 'Estimado con IA. Puede equivocarse', 'el texto chico de la estimación');
  t.ok(!(await txt(p, '#sheetHost .plate-sheet')).includes('Las fotos suelen'), 'sin la frase de las fotos');
  t.has(await txt(p, '#sheetHost .pl8-again'), 'Contar de nuevo', 'abajo: «Contar de nuevo»');
  await shot(p, '34-revision');
  await p.click('#sheetHost [data-action="plate-step"][data-d="1"][data-i="0"]'); await wait(300);
  t.eq((await filas())[0].g, '270', '+ suma una empanada (90 g)');
  await p.click('#sheetHost [data-action="plate-step"][data-d="-1"][data-i="0"]'); await wait(300);
  t.eq((await filas())[0].g, '180', '− resta una empanada');
  t.has(await txt(p, '#sheetHost [data-action="plate-alt"][data-i="0"]'), '¿O era empanada de carne frita', '«¿O era …?» cuando la IA dudó');
  await p.click('#sheetHost [data-action="plate-alt"][data-i="0"]'); await wait(300);
  fs = await filas();
  t.eq([fs[0].n, fs[0].g], ['Empanada de carne frita', '180'], '«¿O era …?» la cambia con los mismos gramos');

  // ¿Está mal?
  p.dialogAnswer = 'Eran de carne cortada a cuchillo';
  await p.click('#sheetHost [data-action="plate-report"]'); await wait(900);
  const rep = S.reportes[0] || {};
  t.ok(rep.p_funcion === 'texto' && rep.p_respuesta && rep.p_respuesta.dijo === DIJO && Array.isArray(rep.p_respuesta.items) && rep.p_comentario === 'Eran de carne cortada a cuchillo',
    '«¿Está mal?» manda p_funcion texto con lo que dijo, lo que calculó la IA y el comentario');

  // Agregar (dos toques: una sola vez).
  await p.dblclick('#pl8Go'); await wait(1200);
  const d = ((await saved(p)) || {}).diary || [];
  t.eq(d.map(e => [e.name.split(' (')[0], e.grams, e.unit, e.meal, e.fuente]), [['Empanada de carne frita', 180, 'g', 'almuerzo', 'ia-editado'], ['Gaseosa cola', 250, 'ml', 'almuerzo', 'ia']],
    '«Agregar» anota una sola vez, en el almuerzo, con fuente ia (o ia-editado)');
  t.ok(!(await p.$('#sheetHost .plate-sheet')), 'la hoja se cierra');
  // La segunda vez no pregunta el permiso.
  await p.click('#view [data-action="ia-voz"]'); await wait(300);
  await p.fill('#pl8Txt', 'un yogur'); await p.press('#pl8Txt', 'Enter'); await wait(1200);
  t.ok(!(await visible(p, '#iaPermHost .ia-perm')) && S.permisos.length === 1, 'aceptado: no vuelve a preguntar');
  t.eq(S.llamadas.length, 2, 'Enter (el «Enviar» del teclado) calcula');
  await p.click('#sheetHost [data-action="plate-again"].pl8-again'); await wait(400);
  t.eq([await p.inputValue('#pl8Txt'), await p.evaluate(() => document.activeElement && document.activeElement.id)], ['un yogur', 'pl8Txt'], '«Contar de nuevo» vuelve al campo con lo dicho');
  t.eq(errs, [], 'prendida: errores de la página');
  await close();

  // ---------- la ayuda «¿No ves el micrófono?» según el celular ----------
  {
    const ayuda = p => p.evaluate(() => { const e = document.querySelector('#sheetHost .pl8-ayuda p'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
    const abrirVoz = async p => { await abrirComida(p, url); await p.click('#view [data-action="ia-voz"]'); await wait(300); };
    const IOS = `window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };`;
    const ANDROID = 'window.androidBridge = {};';
    const IPHONE = 'En el iPhone: Ajustes → General → Teclado → Activar dictado.';
    const GBOARD = 'En Android con Gboard: el micrófono está arriba a la derecha del teclado.';
    // En la web, los dos pasos.
    {
      const { p, errs, close } = await pagina({ estado: OK2, touch: true });
      await abrirVoz(p);
      const a = await ayuda(p);
      t.has(a, IPHONE, 'web: los pasos del iPhone');
      t.has(a, GBOARD, 'web: y los de Android');
      t.eq(errs, [], 'web: errores de la página');
      await close();
    }
    // En el iPhone, solo el del iPhone.
    {
      const { p, errs, close } = await pagina({ estado: OK2, touch: true, init: IOS });
      await abrirVoz(p);
      const a = await ayuda(p);
      t.has(a, 'Ajustes → General → Teclado → Activar dictado.', 'iPhone: los pasos del iPhone');
      t.ok(!/Android|Gboard/.test(a), 'iPhone: sin Android ni Gboard: ' + a);
      t.eq(errs, [], 'iPhone: errores de la página');
      await close();
    }
    // En Android, solo el de Gboard.
    {
      const { p, errs, close } = await pagina({ estado: OK2, touch: true, init: ANDROID });
      await abrirVoz(p);
      const a = await ayuda(p);
      t.has(a, 'el micrófono está arriba a la derecha del teclado.', 'Android: los pasos de Gboard');
      t.ok(!/iPhone|Ajustes/.test(a), 'Android: sin el iPhone: ' + a);
      t.eq(errs, [], 'Android: errores de la página');
      await close();
    }
  }

  // ---------- la búsqueda sin resultados: «¿No está? Decilo con tu voz» ----------
  {
    const { p, errs, close } = await pagina({ estado: OK2 });
    await p.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"products":[]}' }));
    await abrirComida(p, url); await abrirBuscador(p);
    await p.fill('#foodSearch', 'guiso de lentejas de mi abuela'); await wait(1500);
    t.has(await txt(p, '#sheetHost .ia-nores'), '¿No está? Decilo con tu voz', 'sin resultados ofrece la voz');
    await p.click('#sheetHost .ia-nores'); await wait(400);
    t.eq(await p.inputValue('#pl8Txt'), 'guiso de lentejas de mi abuela', 'la hoja arranca con lo buscado');
    t.eq(errs, [], 'sin resultados: errores de la página');
    await close();
  }

  // ---------- el vacío y los avisos de la voz ----------
  {
    const { p, errs, S, close } = await pagina({ estado: OK2, funcion: () => [200, VACIO] });
    await abrirComida(p, url);
    await p.click('#view [data-action="ia-voz"]'); await wait(300);
    await p.fill('#pl8Txt', 'nada, me tomé un rato'); await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(1200);
    t.has(await txt(p, '#sheetHost .plate-sheet'), 'No encontramos comida en lo que contaste. Probá así: un plato de fideos con tuco y una manzana.', 'vacío: su texto');
    t.ok(!!(await p.$('#sheetHost [data-action="plate-again"]')) && !!(await p.$('#sheetHost [data-action="plate-manual"]')), 'vacío: contar de nuevo o buscar');
    t.eq(S.llamadas.length, 1, 'vacío: una llamada');
    t.eq(errs, [], 'vacío: errores de la página');
    await close();
  }
  for (const [nombre, est, texto] of [
    ['límite de hoy', { quedan: { plato: 3, texto: 0 }, usados: { plato: 0, texto: 15, total: 15 } }, 'Llegaste al límite de hoy (15 comidas contadas con IA). Mañana se renueva.'],
    ['límite de hoy (total)', { quedan: { plato: 0, texto: 0 }, usados: { plato: 20, texto: 5, total: 25 } }, 'Llegaste al límite de hoy (25 usos con IA).'],
    ['ahorro', { estado: 'ahorro' }, 'Por este mes, contar lo que comiste con IA queda para alumnos con coach. Buscalo o escaneá el código.'],
  ]){
    const { p, errs, S, close } = await pagina({ estado: Object.assign({}, OK2, est) });
    await abrirComida(p, url);
    await p.click('#view [data-action="ia-voz"]'); await wait(300);
    await p.fill('#pl8Txt', DIJO); await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(600);
    t.has(await txt(p, '#sheetHost .plate-sheet'), texto, nombre + ': el aviso');
    t.eq(S.llamadas.length, 0, nombre + ': no llama');
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }
  // La comida según lo que contó, sin depender de la hora a la que corre la prueba: se nombra una que
  // no es la de la hora (si se nombra una sola, se elige esa; si nombra dos, queda la de la hora).
  {
    const { p, errs, close } = await pagina({ estado: OK2, funcion: () => [200, VOZ] });
    await abrirComida(p, url);
    const ahora = await p.evaluate(() => { const h = new Date().getHours(); return h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : h < 20 ? 'merienda' : 'cena'; });
    const en = { desayuno: 'en el desayuno', almuerzo: 'en el almuerzo', merienda: 'en la merienda', cena: 'en la cena' };
    const otras = Object.keys(en).filter(m => m !== ahora);
    for (const [dijo, quiere] of [[en[otras[0]] + ' comí 2 empanadas', otras[0]], [en[otras[1]] + ' y ' + en[otras[2]] + ' comí 2 empanadas', ahora]]){
      await p.click('#view [data-action="ia-voz"]'); await wait(300);
      await p.fill('#pl8Txt', dijo); await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(1200);
      t.eq(await p.$$eval('#sheetHost .pl8-foot [data-action="plate-meal"].on', bs => bs.map(b => b.dataset.meal)), [quiere], '«' + dijo + '» elige ' + quiere + ' (la hora da ' + ahora + ')');
      // «¿Cerrar sin agregar?» se contesta solo (lib.mjs: p.contestar = true).
      await p.click('#sheetHost .ss-x[data-action="plate-cancel"]'); await wait(900);
      t.ok(!(await p.$('#sheetHost .plate-sheet')), '«' + dijo + '»: la hoja se cierra');
    }
    t.eq(errs, [], 'la comida según lo que contó: errores de la página');
    await close();
  }
  // El límite de hoy que contesta la función (sin decir cuál): con el número del total dice «usos con
  // IA»; con el de la voz, «comidas contadas».
  for (const [nombre, tope, texto] of [['total', 25, 'Llegaste al límite de hoy (25 usos con IA).'], ['de la voz', 15, 'Llegaste al límite de hoy (15 comidas contadas con IA).']]){
    const { p, errs, S, close } = await pagina({ estado: OK2, funcion: () => [429, { ok: false, codigo: 'tope_dia', mensaje: 'x', tope }] });
    await abrirComida(p, url);
    await p.click('#view [data-action="ia-voz"]'); await wait(300);
    await p.fill('#pl8Txt', DIJO); await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(1200);
    t.has(await txt(p, '#sheetHost .plate-sheet'), texto, 'la función frena (' + nombre + '): el aviso');
    t.eq(S.llamadas.length, 1, 'la función frena (' + nombre + '): una llamada');
    t.eq(errs, [], 'la función frena (' + nombre + '): errores de la página');
    await close();
  }
  // «Te quedan N con IA hoy» con 3 o menos.
  {
    const { p, close } = await pagina({ estado: Object.assign({}, OK2, { quedan: { plato: 8, texto: 2 } }) });
    await abrirComida(p, url);
    await p.click('#view [data-action="ia-voz"]'); await wait(800);
    t.has(await txt(p, '#sheetHost .plate-sheet'), 'Te quedan 2 con IA hoy', '«Te quedan 2 con IA hoy»');
    t.has(await txt(p, '#sheetHost .plate-sheet'), 'Escribí lo que comiste.', 'en la compu pide que lo escriba');
    await close();
  }

  // ---------- sin fotos gratis de la semana: la voz sigue ----------
  {
    const PLUS = { activa: true, estado: 'gratis', gratis_semana: 3, quedan_semana: 0, semana_vuelve: '2026-11-02T03:00:00Z' };
    const { p, errs, S, close } = await pagina({ estado: Object.assign({}, OK2, { estado: 'tope_semana', vuelve: '2026-11-02T03:00:00Z', quedan: { plato: 0, texto: 12 }, plus: PLUS }), funcion: b => [200, b.modo === 'texto' ? VOZ : PLATO] });
    await abrirComida(p, url);
    await p.click('#view [data-action="ia-plato"]'); await wait(900);
    t.has(await txt(p, '#sheetHost .plate-sheet'), 'Usaste tus 3 fotos gratis con IA de esta semana', 'la foto: el límite de la semana');
    t.has(await txt(p, '#sheetHost .pl8-voz'), 'Contalo con tu voz', 'el límite de fotos ofrece «Contalo con tu voz»');
    await shot(p, '35-tope-semana');
    await p.click('#sheetHost .pl8-voz'); await wait(300);
    t.eq(await p.evaluate(() => document.activeElement && document.activeElement.id), 'pl8Txt', '«Contalo con tu voz» abre la voz');
    await p.fill('#pl8Txt', DIJO); await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(1300);
    t.eq(S.llamadas.map(b => b.modo), ['texto'], 'la voz sigue andando sin fotos gratis');
    t.eq((await p.$$('#sheetHost .pl8-row')).length, 2, 'con su revisión');
    t.eq(errs, [], 'sin fotos gratis: errores de la página');
    await close();
  }

  // ---------- aceptó el aviso de la foto (versión 2) ----------
  {
    const { p, errs, S, close } = await pagina({ estado: Object.assign({}, ESTADO_VOZ, { permiso_comida: 'ok', permiso_texto: 'viejo' }), funcion: b => [200, b.modo === 'texto' ? VOZ : PLATO] });
    await abrirComida(p, url);
    await p.click('#view [data-action="ia-plato"]'); await wait(800);
    t.ok(!(await visible(p, '#iaPermHost .ia-perm')) && !!(await p.$('#sheetHost input[data-action="plate-file"]:not([capture])')), 'con la versión 2: la foto no vuelve a pedir permiso');
    t.has(await txt(p, '#sheetHost .pl8-voz'), 'Contalo con tu voz', 'la hoja de la foto ofrece la voz');
    await p.click('#sheetHost .pl8-voz'); await wait(300);
    await p.fill('#pl8Txt', DIJO); await p.click('#sheetHost [data-action="plate-text-go"]'); await wait(700);
    t.ok(await visible(p, '#iaPermHost .ia-perm'), 'con la versión 2: la voz pide el aviso nuevo');
    t.eq(S.llamadas.length, 0, 'antes de aceptar no manda nada');
    await p.click('#iaPermHost [data-ia="si"]'); await wait(1300);
    t.eq([S.permisos.map(b => b.p_version), S.llamadas.map(b => b.modo)], [[3], ['texto']], 'al aceptar guarda la 3 y manda');
    await p.click('#sheetHost .ss-x[data-action="plate-cancel"]'); await wait(300);
    await wait(600);
    await p.click('#nav-config'); await wait(900);
    t.eq(await txt(p, '#cfgIaDesc'), 'Envía a Anthropic (EE. UU.) la foto o lo que contás en cada consulta. Apagado: no se manda nada. Política de privacidad', 'Ajustes con la voz: «la foto o lo que contás»');
    t.eq(errs, [], 'versión 2: errores de la página');
    await close();
  }
}
