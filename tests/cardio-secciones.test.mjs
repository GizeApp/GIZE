// Cardio dividido en secciones (pedido: «tu cardio de esta semana ARRIBA DE TODO, los pasos lo más
// importante, salir a moverte último, todo desplegable»):
// a) El orden: «Tu cardio de esta semana», «Pasos», «Tus salidas», «Cronómetro y temporizador» y,
//    último, «Salir a moverte» (un botón). Sin plan del coach, sin esa sección.
// b) «Pasos»: los de hoy en grande (el número más grande de la sección, sin pasarse: 36 a 40 px) y
//    abajo «Ayer», «Prom. semana» y «Prom. mes» (solo los días con datos; sin datos, «—»), las
//    barras de los últimos 7 días y «Competí con tus amigos», que abre Progreso → «Competencia de
//    pasos». En la web, que se cargan solos desde la app.
// c) Desplegables: el título con la flecha abre y cierra (sin redibujar); arrancan abiertas todas
//    menos «Cronómetro y temporizador»; cerrada, «Pasos» muestra los de hoy en el título; quedan
//    como las dejaron al recargar (localStorage) y sin localStorage la pantalla anda igual.
// d) «Salir a moverte» abre la hoja de abajo (con «A pie» / «En bici»); «Cancelar» la cierra y el
//    «Atrás» de Android también; «Empezar» arranca la salida, la hoja se cierra y la salida en vivo
//    queda ARRIBA DE TODO (antes que el plan del coach), sin «Salir a moverte» abajo.
// e) App instalada (iPhone simulado): en «Pasos» el botón «Conectar Salud de Apple» (corazón,
//    título y subtítulo), «Conectando…» mientras pide el permiso y, conectado, «Conectado a Salud de
//    Apple · Actualizar ahora · Desconectar». El texto con contraste AA en Oscuro, Azul, Rosa,
//    Claro y sin neón; 360 px sin scroll de costado y los textos de las casillas enteros.
// f) Salud manda en los pasos de hoy (no hay pasos a mano que respetar): si dice menos que lo que
//    había, queda lo de Salud. Y al conectar, «Conectando…» y los números no esperan a que salgan
//    los envíos de cada día (van por la cola, uno detrás de otro): conectado y al día enseguida,
//    y los envíos salen igual después.
import { newPage, wait, text, ALUMNO, profile, abrirSalir, empezarSalida } from './lib.mjs';

const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const hace = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
// Ayer 9100; en la semana además 6400 (hace 2) y 11200 (hace 4); en el mes además 4300 (hace 14)
// y 10400 (hace 20); hace 35 (fuera del mes) 99999. Hoy 7342.
const DIAS = [[1, 9100], [2, 6400], [4, 11200], [14, 4300], [20, 10400], [35, 99999]];
const PROM_SEM = Math.round((7342 + 9100 + 6400 + 11200) / 4), PROM_MES = Math.round((7342 + 9100 + 6400 + 11200 + 4300 + 10400) / 6);
const fmt = n => n.toLocaleString('es-AR');
const STATE = () => ({ days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, steps: 7342, stepsDate: hace(0),
  salidas: [{ id: 's1', mode: 'pie', date: hace(1), startedAt: Date.now() - 864e5, dur: 2700, moving: 2600, dist: 5230, kcal: 310, points: 0, breakdown: {} }] });
const PLAN = (r, J, i) => { if (i.m !== 'GET') return undefined; const np = { client_id: ALUMNO.id, kcal: null, plan: { cardio: { text: '30 min de cinta', items: ['Martes: 20 min de bici'] } } }; return J(i.one ? np : [np]); };
const LOGS = (r, J, i) => i.m === 'GET' && !i.one ? J(DIAS.map(([n, s]) => ({ client_id: ALUMNO.id, log_date: hace(n), steps: s, answers: {} }))) : undefined;
const H = (plan = true) => Object.assign({ '/profiles': profile('client'), '/daily_logs': LOGS }, plan ? { '/nutrition': PLAN } : {});
const FAKE_GPS = () => {
  window.__geo = { n: 0 };
  Object.defineProperty(navigator, 'geolocation', { value: { watchPosition(){ return ++window.__geo.n; }, clearWatch(){}, getCurrentPosition(){} }, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => ({ addEventListener(){}, release: async () => {} }) }, configurable: true });
};
// iPhone con el plugin de Salud (simulado). on: ya conectado.
const IOS = on => `window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
  App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null, addListener: () => Promise.resolve({ remove(){} }) },
  Health: { isAvailable: async () => ({ available: true }), requestAuthorization: () => new Promise(ok => { window.__permOk = ok; }), readSamples: async () => ({ samples: [] }) } } };
  ${on ? "localStorage.setItem('gize_salud_" + ALUMNO.id + "','1');" : ''}`;

const orden = p => p.evaluate(() => [...document.querySelectorAll('#view > section')].map(s =>
  s.id === 'salLive' ? 'en vivo' : s.classList.contains('sal-salir') ? 'salir' : (s.querySelector('details.csec') || {}).dataset.sec || s.className));
const abiertas = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#view details.csec')].map(d => [d.dataset.sec, d.open])));
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Contraste del texto visible de la sección «Pasos» contra el fondo que tiene detrás (como en
// pasos-grupos.test.mjs). Devuelve el mínimo y los que no llegan a 4,5 (AA).
const contraste = p => p.evaluate(() => {
  const rgb = s => { const m = String(s).match(/rgba?\(([^)]*)\)/); if (!m) return null; const n = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: n[0], g: n[1], b: n[2], a: n[3] === undefined ? 1 : n[3] }; };
  const lum = c => [c.r, c.g, c.b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const fondo = e => {
    const capas = [];
    for (let x = e; x; x = x.parentElement) {
      const cs = getComputedStyle(x), img = cs.backgroundImage;
      const liso = /^linear-gradient\((?:[^,]*deg, )?(rgba?\([^)]*\))[^,]*, (rgba?\([^)]*\))/.exec(img);
      if (liso) { const a = rgb(liso[1]), b = rgb(liso[2]); const c = a.a <= b.a ? a : b; capas.push(c); if (c.a >= 1) break; }
      const c = rgb(cs.backgroundColor); if (c && c.a > 0) { capas.push(c); if (c.a >= 1) break; }
    }
    let base = rgb(getComputedStyle(document.body).backgroundColor);
    for (let i = capas.length - 1; i >= 0; i--) base = capas[i].a >= 1 ? capas[i] : mix(capas[i], base);
    return base;
  };
  const malos = []; let min = 99, n = 0;
  const els = [...document.querySelectorAll('#view .csec-pasos *')].filter(e => !e.closest('svg') && e.tagName !== 'svg'
    && [...e.childNodes].some(t => t.nodeType === 3 && t.textContent.trim()) && !e.closest('[disabled]'));
  for (const e of els) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const c = rgb(getComputedStyle(e).color); if (!c || c.a < .95) continue;
    const L1 = lum(c), L2 = lum(fondo(e)), k = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    n++; if (k < min) min = k;
    if (k < 4.5) malos.push(e.textContent.trim().slice(0, 30) + ' (' + k.toFixed(2) + ')');
  }
  return { n, min: Math.round(min * 100) / 100, malos };
});

async function web(base, t){
  const pg = await newPage({ user: ALUMNO, state: STATE(), handlers: H(), init: FAKE_GPS });
  const p = pg.p;
  await p.addInitScript("localStorage.setItem('gize_mapa_off','1'); localStorage.setItem('gize_lite','0'); localStorage.setItem('gize_salida_aviso','1');");
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(500);

  // a) El orden.
  t.eq(await orden(p), ['rx', 'pasos', 'salidas', 'tools', 'salir'], 'el orden: tu cardio de esta semana, pasos, tus salidas, cronómetro y temporizador, salir a moverte');
  t.eq(await p.$$eval('#view .csec-sum .csec-t', l => l.map(e => e.textContent)), ['Tu cardio de esta semana', 'Pasos', 'Tus salidas', 'Cronómetro y temporizador'], 'los títulos de las secciones');
  t.has(await text(p, '.csec-rx'), 'Martes: 20 min de bici', 'el plan del coach arriba de todo');
  t.eq(await p.$$eval('#view .sal-salir .ctrl.primary', l => l.map(b => [b.textContent, b.dataset.action])), [['Salir a moverte', 'sal-sheet']], '«Salir a moverte»: un solo botón, que abre la hoja');
  t.eq(await p.$$eval('#view [data-action="sal-start"], #view [data-action="sal-mode"]', l => l.length), 0, 'en la pantalla no está «Empezar» ni la elección: van en la hoja');

  // b) Pasos: hoy grande y los tres números.
  t.eq(await text(p, '#cpasN'), '7.342', 'pasos de hoy');
  const big = await p.evaluate(() => {
    const n = document.getElementById('cpasN'), fs = parseFloat(getComputedStyle(n).fontSize);
    const others = [...document.querySelectorAll('#view .csec-pasos *')].filter(e => e !== n && e.childNodes.length && [...e.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize));
    return { fs, fw: getComputedStyle(n).fontWeight, max: Math.max(...others), u: [n.getBoundingClientRect().bottom, document.querySelector('.cpas-u').getBoundingClientRect().bottom] };
  });
  t.ok(big.fs >= 36 && big.fs <= 40 && big.fw === '800', 'pasos de hoy grandes pero no tanto (36–40 px, 800): ' + big.fs + ' / ' + big.fw);
  t.ok(big.fs > big.max * 1.6, 'pasos de hoy: el número más grande de la sección (' + big.fs + ' contra ' + big.max + ')');
  const stats = await p.$$eval('.cpas-st', l => l.map(e => [e.querySelector('.cpas-st-l').textContent, e.querySelector('.cpas-st-v').textContent, (e.querySelector('.cpas-st-s') || {}).textContent || '']));
  t.eq(stats.map(s => s.slice(0, 2)), [['Ayer', '9.100'], ['Prom. semana', fmt(PROM_SEM)], ['Prom. mes', fmt(PROM_MES)]], 'ayer, promedio de la semana y del mes (solo días con datos; lo de hace 35 días no cuenta)');
  t.eq(stats.map(s => s[2]).slice(1), ['4 de 7 días', '6 de 30 días'], 'cuántos días con datos cubre cada promedio');
  t.eq(await p.$$eval('.cpas-dia', l => l.length), 7, 'las barras de los últimos 7 días');
  t.ok(await p.$eval('.cpas-dia:last-child', e => e.classList.contains('hoy')), 'hoy, la última barra');
  t.has(await text(p, '.csec-pasos .pg-note'), 'Tus pasos se cargan solos desde la app de GIZE', 'web: se cargan solos desde la app');
  t.eq(await p.$$eval('.csec-pasos [data-pg="salud-on"], .csec-pasos .salud-ok', l => l.length), 0, 'web: sin botón de Salud');

  // c) Desplegables.
  t.eq(await abiertas(p), { rx: true, pasos: true, salidas: true, tools: false }, 'al empezar: abiertas todas menos «Cronómetro y temporizador»');
  t.ok(await p.$eval('.csec-tools .csec-sum', e => !!e.querySelector('.csec-chev svg')), 'el título con la flecha');
  t.eq(await p.$eval('.csec-tools [data-action="sw-toggle"]', e => e.checkVisibility()), false, 'cerrada: el cronómetro no se ve');
  await p.evaluate(() => { window.__renders = 0; new MutationObserver(() => window.__renders++).observe(document.getElementById('view'), { childList: true }); });
  await p.click('.csec-tools .csec-sum'); await wait(200);
  await p.click('.csec-pasos .csec-sum'); await wait(200);
  t.eq(await abiertas(p), { rx: true, pasos: false, salidas: true, tools: true }, 'tocar el título abre o cierra');
  t.eq(await p.evaluate(() => window.__renders), 0, 'abrir y cerrar no redibuja la pantalla');
  t.ok(await p.$eval('.csec-tools [data-action="sw-toggle"]', e => e.checkVisibility()), 'abierta: el cronómetro se ve');
  t.eq(await text(p, '.csec-pasos .csec-m'), '7.342 hoy', 'cerrada, «Pasos» muestra los de hoy en el título');
  t.eq(await p.evaluate(() => JSON.parse(localStorage.getItem('gize_cardio_secs'))), { tools: true, pasos: false }, 'queda guardado en el dispositivo');
  await p.reload(); await wait(2500);
  await p.click('#nav-cardio'); await wait(500);
  t.eq(await abiertas(p), { rx: true, pasos: false, salidas: true, tools: true }, 'al recargar quedan como las dejó');
  await p.focus('.csec-pasos .csec-sum'); await p.keyboard.press('Enter'); await wait(200);
  t.eq((await abiertas(p)).pasos, true, 'con el teclado (Enter en el título) también se abre');

  // b) «Competí con tus amigos» → Progreso → «Competencia de pasos».
  await p.click('.csec-pasos [data-action="cardio-pasos"]'); await wait(700);
  t.ok(await p.$eval('#nav-progreso', e => e.classList.contains('active')), '«Competí con tus amigos» lleva a Progreso');
  t.eq(await text(p, '#view .pg-head .form-title'), 'Competencia de pasos', 'y abre «Competencia de pasos»');
  await p.click('#nav-cardio'); await wait(500);

  // d) La hoja para empezar.
  await abrirSalir(p);
  t.ok(await p.$('#salSheet.ssh .ssh-card[role="dialog"]'), '«Salir a moverte» abre la hoja de abajo');
  t.eq(await p.$$eval('#salSheet [data-action="sal-mode"]', l => l.map(b => b.dataset.mode)), ['pie', 'bici'], 'la hoja: «A pie» y «En bici»');
  t.ok(await p.$('#salSheet [data-action="sal-start"]'), 'la hoja: «Empezar»');
  await p.click('#salSheet [data-action="sal-mode"][data-mode="bici"]'); await wait(200);
  t.eq(await p.$$eval('#salSheet .sal-mode.active', l => l.map(b => b.dataset.mode)), ['bici'], 'elegir «En bici» en la hoja');
  await p.click('#salSheet [data-action="sal-sheet-close"].ssh-close'); await wait(200);
  t.eq(await p.$$eval('#salSheet', l => l.length), 0, '«Cancelar» cierra la hoja');
  await abrirSalir(p);
  await p.evaluate(async () => (await import('/app/ui/atras.js')).handleBack()); await wait(200);
  t.eq(await p.$$eval('#salSheet', l => l.length), 0, 'el «Atrás» de Android cierra la hoja');
  await empezarSalida(p); await wait(600);
  t.eq(await p.evaluate(() => window.__geo.n), 1, '«Empezar» arranca la salida (mira la ubicación)');
  t.eq(await p.$$eval('#salSheet', l => l.length), 0, 'la hoja se cierra');
  t.eq((await orden(p))[0], 'en vivo', 'en vivo: arriba de todo, antes del plan del coach');
  t.eq(await p.evaluate(() => Math.round(window.scrollY)), 0, 'en vivo: la pantalla vuelve arriba, con la salida a la vista');
  t.has(await text(p, '#salLive'), 'En bici', 'en vivo: con el modo elegido');
  t.eq(await p.$$eval('#view [data-action="sal-sheet"]', l => l.length), 0, 'en vivo: sin «Salir a moverte» abajo');
  await p.click('[data-action="sal-pause"]'); await wait(300);
  t.eq((await orden(p))[0], 'en vivo', 'en pausa: sigue arriba de todo');
  t.eq(pg.errs, [], 'errores de la página (web)');
  await pg.close();

  // Sin plan del coach: sin «Tu cardio de esta semana».
  const pg2 = await newPage({ user: ALUMNO, state: STATE(), handlers: H(false) });
  await pg2.p.goto(base + '/app/'); await wait(2500);
  await pg2.p.click('#nav-cardio'); await wait(500);
  t.eq(await orden(pg2.p), ['pasos', 'salidas', 'tools', 'salir'], 'sin plan del coach: arranca con «Pasos»');
  t.eq(pg2.errs, [], 'errores de la página (sin plan)');
  await pg2.close();

  // Sin localStorage (navegación privada que lo bloquea): anda igual, con las de siempre.
  const pg3 = await newPage({ user: ALUMNO, state: STATE(), handlers: H(), viewport: { width: 360, height: 760 } });
  await pg3.p.goto(base + '/app/'); await wait(2500);
  await pg3.p.evaluate(() => { const g = Storage.prototype.getItem, s = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k){ if (k === 'gize_cardio_secs') throw new Error('bloqueado'); return g.call(this, k); };
    Storage.prototype.setItem = function (k, v){ if (k === 'gize_cardio_secs') throw new Error('bloqueado'); return s.call(this, k, v); }; });
  await pg3.p.click('#nav-cardio'); await wait(500);
  t.eq(await abiertas(pg3.p), { rx: true, pasos: true, salidas: true, tools: false }, 'sin localStorage: las de siempre');
  await pg3.p.click('.csec-tools .csec-sum'); await wait(200);
  t.eq((await abiertas(pg3.p)).tools, true, 'sin localStorage: abrir anda igual');
  t.ok(await noHScroll(pg3.p), '360 px: sin scroll de costado');
  const tiles = await pg3.p.$$eval('.cpas-st', l => l.map(e => e.scrollWidth <= e.clientWidth + 1));
  t.eq(tiles, [true, true, true], '360 px: los tres números entran en sus casillas');
  // Cada texto entero (el de la casilla tiene overflow:hidden propio: antes «Prom. semana» se
  // cortaba en «Prom. sema…» y la casilla no se enteraba) y los tres números a la misma altura.
  const cortados = await pg3.p.$$eval('.cpas-st-l, .cpas-st-v, .cpas-st-s', l => l.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent + ' ' + e.scrollWidth + '>' + e.clientWidth));
  t.eq(cortados, [], '360 px: «Prom. semana» y los demás textos de las casillas, enteros');
  const altos = await pg3.p.$$eval('.cpas-st-v', l => l.map(e => Math.round(e.getBoundingClientRect().top)));
  t.ok(altos.length === 3 && altos.every(y => y === altos[0]), '360 px: los tres números alineados: ' + altos.join(', '));
  t.eq(pg3.errs, [], 'errores de la página (sin localStorage)');
  await pg3.close();
}

// e) App instalada: el botón de Salud de Apple en «Pasos», en las apariencias.
async function nativo(base, t){
  const LOOKS = [['Oscuro', ''], ['Azul', "localStorage.setItem('gize_tema','azul');"], ['Rosa', "localStorage.setItem('gize_tema','rosa');"],
    ['Claro', "localStorage.setItem('gize_tema','luz');"], ['sin neón', "localStorage.setItem('gize_neon','0');"]];
  for (const [name, init] of LOOKS){
    const pg = await newPage({ user: ALUMNO, state: STATE(), handlers: H() });
    const p = pg.p;
    await p.addInitScript("localStorage.setItem('gize_lite','0');" + init + IOS(false));
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-cardio'); await wait(500);
    const b = await p.evaluate(() => { const e = document.querySelector('#view .csec-pasos .salud-btn[data-pg="salud-on"]'); if (!e) return null;
      const be = getComputedStyle(e, '::before'), s = getComputedStyle(e);
      return { ico: !!e.querySelector('.salud-ico svg'), t: e.querySelector('.salud-t').textContent, s: e.querySelector('.salud-s').textContent, go: !!e.querySelector('.salud-go svg'),
        w: Math.round(e.getBoundingClientRect().width), cw: Math.round(e.closest('.csec-b').clientWidth), ring: be.backgroundImage, anim: be.animationName, glow: s.boxShadow }; });
    t.ok(b, name + ': en «Pasos», el botón para conectar Salud de Apple');
    if (!b){ await pg.close(); continue; }
    t.eq([b.ico, b.t, b.s, b.go], [true, 'Conectar Salud de Apple', 'Tus pasos se cargan solos, aunque no abras GIZE', true], name + ': con el corazón, el título, el subtítulo y la flecha');
    t.ok(b.cw - b.w <= 32, name + ': el botón ocupa todo el ancho: ' + b.w + ' de ' + b.cw);
    t.ok(/linear-gradient/.test(b.ring) && !/conic/.test(b.ring) && b.anim === 'none' && b.glow === 'none', name + ': con el filete fino, quieto y sin resplandor: ' + b.ring.slice(0, 80) + ' / ' + b.glow);
    const k = await contraste(p);
    t.ok(k.n > 10 && !k.malos.length, name + ': «Pasos» con contraste AA (mín. ' + k.min + ', ' + k.n + ' textos): ' + k.malos.join(' | '));
    // Conectando: el permiso queda pendiente.
    await p.click('#view .csec-pasos [data-pg="salud-on"]'); await wait(400);
    const busy = await p.evaluate(() => { const e = document.querySelector('#view .csec-pasos .salud-btn'); return e && [e.disabled, e.textContent.includes('Conectando…')]; });
    t.eq(busy, [true, true], name + ': mientras pide el permiso, «Conectando…» y desactivado');
    await p.evaluate(() => window.__permOk && window.__permOk({})); await wait(1200);
    t.has(await text(p, '#view .csec-pasos .salud-ok'), 'Conectado a Salud de Apple', name + ': conectado, «Conectado a Salud de Apple»');
    t.eq(await p.$$eval('#view .csec-pasos .salud-ok [data-pg]', l => l.map(e => e.textContent)), ['Actualizar ahora', 'Desconectar'], name + ': con «Actualizar ahora» y «Desconectar»');
    t.ok(await p.$eval('#view .csec-pasos .salud-ok-ico', e => !!e.querySelector('svg')), name + ': con el tilde');
    const k2 = await contraste(p);
    t.ok(!k2.malos.length, name + ': conectado, contraste AA (mín. ' + k2.min + '): ' + k2.malos.join(' | '));
    t.eq(pg.errs, [], 'errores de la página (' + name + ')');
    await pg.close();
  }
  // También en «Competencia de pasos», el mismo botón.
  const pg = await newPage({ user: ALUMNO, state: STATE(), handlers: H() });
  await pg.p.addInitScript(IOS(false));
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-progreso'); await wait(300);
  await pg.p.click('[data-action="psec-open"][data-v="pasos"]'); await wait(600);
  t.has(await text(pg.p, '#view .pg-hoy .salud-btn .salud-t'), 'Conectar Salud de Apple', '«Competencia de pasos»: el mismo botón');
  await pg.close();
}

// f) Salud manda y no se esperan los envíos.
async function saludManda(base, t){
  let soltar; const compuerta = new Promise(ok => { soltar = ok; });
  const posts = [];
  const logs = (r, J, i) => {
    if (i.m === 'POST'){ posts.push(i.body); return compuerta.then(() => J([], 201)); }
    return LOGS(r, J, i);
  };
  const pg = await newPage({ user: ALUMNO, state: STATE(), handlers: Object.assign(H(false), { '/daily_logs': logs }) });
  const p = pg.p;
  // Salud: hoy 5.000 (menos que los 7.342 que había) y los 12 días anteriores (12 envíos más).
  await p.addInitScript(() => {
    const hoy = new Date(); hoy.setHours(10, 0, 0, 0);
    const s = [{ value: 5000, startDate: hoy.toISOString(), sourceId: 'iphone' }];
    for (let i = 1; i <= 12; i++){ const d = new Date(hoy); d.setDate(d.getDate() - i); s.push({ value: 12000 + i, startDate: d.toISOString(), sourceId: 'iphone' }); }
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
      App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null, addListener: () => Promise.resolve({ remove(){} }) },
      Health: { isAvailable: async () => ({ available: true }), requestAuthorization: async () => ({}), readSamples: async () => ({ samples: s }) } } };
  });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(500);
  t.eq(await text(p, '#cpasN'), '7.342', 'antes de conectar: los de hoy que había');
  await p.click('#view .csec-pasos [data-pg="salud-on"]'); await wait(900);
  const ya = await p.evaluate(async () => ({ busy: (await import('/app/core/salud.js')).SaludState.busy, conectando: !!document.querySelector('#view .salud-btn[data-pg="salud-on"]'),
    ok: (document.querySelector('#view .csec-pasos .salud-ok') || {}).textContent || '' }));
  t.ok(!ya.busy && !ya.conectando && /Conectado a Salud de Apple/.test(ya.ok), 'con los envíos todavía en camino: ya conectado, sin «Conectando…»: ' + JSON.stringify(ya));
  t.eq(await text(p, '#cpasN'), '5.000', 'hoy: manda Salud aunque diga menos que lo que había');
  t.eq(await text(p, '.cpas-st-ayer .cpas-st-v'), '12.001', 'ayer: desde Salud, sin esperar los envíos');
  t.ok(posts.length >= 1, 'los envíos ya arrancaron (esperando la respuesta): ' + posts.length);
  soltar(); await wait(2500);
  const filas = posts.map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).flat().filter(x => x && 'steps' in x && !('water_ml' in x));
  const hoy = await p.evaluate(async () => (await import('/app/core/utils.js')).today());
  t.ok(filas.some(x => x.log_date === hoy && x.steps === 5000), 'después sale el de hoy (5.000): ' + JSON.stringify(filas.map(x => x.log_date + ':' + x.steps)));
  t.ok(filas.filter(x => x.log_date !== hoy).length >= 12, 'y los 12 días anteriores: ' + filas.length);
  t.eq(await text(p, '#cpasN'), '5.000', 'después de los envíos, hoy sigue en lo de Salud');
  t.eq(pg.errs, [], 'errores de la página (Salud manda)');
  await pg.close();
}

export default async function ({ base, t }){
  await web(base, t);
  await nativo(base, t);
  await saludManda(base, t);
}
