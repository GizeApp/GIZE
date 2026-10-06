// Competencia de pasos (Progreso → «Competencia de pasos», app/screens/pasos.js, core/grupos.js y
// supabase/pasos-grupos.sql): crear un grupo y conseguir el código y el link para invitar,
// sumarse con el link gize.ar/app/#grupo=CODIGO (después de entrar), el ranking de la semana en
// orden con la barra relativa al primero y mi fila marcada, el campeón de la semana pasada con la
// copa y el texto en dorado (#FFC940, también la copa chica al lado de su nombre), la semana de
// lunes a domingo en hora de Argentina (aunque el celular esté en otra zona), los pasos anotados a
// mano que suben a daily_logs y el contraste del texto en «Oscuro» y «Claro».
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const SEM = { desde: '2026-10-05', hasta: '2026-10-11' };
const GRUPO = { id: 'g1', nombre: 'Los del laburo', codigo: 'ABCD2345', soy_dueno: true, miembros: 5, mi_puesto: 2 };
const RANKING = [
  { miembro: 'm1', nombre: 'Bruno', pasos: 71240, puesto: 1, soy_yo: false },
  { miembro: 'm2', nombre: 'Prueba', pasos: 52300, puesto: 2, soy_yo: true },
  { miembro: 'm3', nombre: 'Caro', pasos: 35620, puesto: 3, soy_yo: false },
  { miembro: 'm4', nombre: 'Dani', pasos: 17810, puesto: 4, soy_yo: false },
  { miembro: 'm5', nombre: 'Euge', pasos: 0, puesto: 5, soy_yo: false },
].map(r => Object.assign(r, SEM));
const CAMPEON = { miembro: 'm3', nombre: 'Caro', pasos: 84210, soy_yo: false, desde: '2026-09-28', hasta: '2026-10-04' };
const GOLD = 'rgb(255, 201, 64)';

// Supabase simulado con los grupos en memoria. rpcs: lo que se llamó, con su cuerpo.
function mock({ grupos = [], ranking = {}, campeon = {}, onCrear, onUnirse } = {}){
  const rpcs = [], posts = [];
  const db = { grupos: grupos.slice() };
  const handlers = {
    '/profiles': profile('client', { full_name: 'Prueba Alumno' }),
    '/rpc/pasos_mis_grupos': (r, J) => (rpcs.push('mis_grupos'), J(db.grupos)),
    '/rpc/pasos_crear_grupo': (r, J, i) => { rpcs.push('crear ' + i.body); const g = onCrear(JSON.parse(i.body)); db.grupos.push(g); return J([{ id: g.id, codigo: g.codigo }]); },
    '/rpc/pasos_unirse': (r, J, i) => { rpcs.push('unirse ' + i.body); const g = onUnirse(JSON.parse(i.body)); db.grupos.push(g); return J(g.id); },
    '/rpc/pasos_sacar_miembro': (r, J, i) => (rpcs.push('sacar ' + i.body), J(null)),
    '/rpc/pasos_ranking': (r, J, i) => (rpcs.push('ranking ' + i.body), J(ranking[JSON.parse(i.body).p_grupo] || [])),
    '/rpc/pasos_campeon': (r, J, i) => { rpcs.push('campeon ' + i.body); const c = campeon[JSON.parse(i.body).p_grupo]; return J(c ? [].concat(c) : []); },
    '/daily_logs': (r, J, i) => { if (i.m !== 'GET') posts.push(i.body || ''); return undefined; },
  };
  return { handlers, rpcs, posts, db };
}
const SHARE = `Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared = d; } });`;
const abrirPasos = async p => {
  await p.click('#nav-progreso'); await wait(300);
  await p.click('[data-action="psec-open"][data-v="pasos"]'); await wait(700);
};

// Contraste del texto visible dentro de la sección contra el fondo que tiene detrás (como en
// tema-luz.test.mjs). Devuelve el mínimo y los que no llegan a 4,5 (AA).
const contraste = p => p.evaluate(() => {
  const rgb = s => { const m = String(s).match(/rgba?\(([^)]*)\)/); if (!m) return null; const n = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: n[0], g: n[1], b: n[2], a: n[3] === undefined ? 1 : n[3] }; };
  const lum = c => [c.r, c.g, c.b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const fondo = e => {
    const capas = [];
    for (let x = e; x; x = x.parentElement) {
      const cs = getComputedStyle(x), img = cs.backgroundImage;
      // Degradé liso (filete) o el primer color de un degradé de dos tonos (la tarjeta dorada).
      const liso = /^linear-gradient\((?:[^,]*deg, )?(rgba?\([^)]*\))[^,]*, (rgba?\([^)]*\))/.exec(img);
      if (liso) { const a = rgb(liso[1]), b = rgb(liso[2]); const c = a.a <= b.a ? a : b; capas.push(c); if (c.a >= 1) break; }
      const c = rgb(cs.backgroundColor); if (c && c.a > 0) { capas.push(c); if (c.a >= 1) break; }
    }
    let base = rgb(getComputedStyle(document.body).backgroundColor);
    for (let i = capas.length - 1; i >= 0; i--) base = capas[i].a >= 1 ? capas[i] : mix(capas[i], base);
    return base;
  };
  const malos = []; let min = 99, n = 0;
  const els = [...document.querySelectorAll('#view .pg *, #view .pg-head *')].filter(e => !e.closest('svg') && e.tagName !== 'svg'
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

export default async function ({ base, t }){
  // 1) La semana: de lunes a domingo en hora de Argentina, aunque el celular esté en Tokio.
  {
    const { p, errs, close } = await newPage({ timezoneId: 'Asia/Tokyo' });
    await p.goto(base + '/app/'); await wait(1200);
    const r = await p.evaluate(async () => {
      const g = await import('/app/core/grupos.js');
      const at = s => g.semanaAR(Date.parse(s));
      return {
        domingoNoche: at('2026-10-11T23:59:00-03:00'),     // en UTC ya es lunes 02:59
        lunes: at('2026-10-12T00:00:00-03:00'),
        martes: at('2026-10-06T10:00:00-03:00'),
        pasada: g.semanaAR(Date.parse('2026-10-06T10:00:00-03:00'), 1),
        finDeAnio: at('2027-01-01T12:00:00-03:00'),
        fecha: g.fechaAR(Date.parse('2026-10-12T02:30:00Z')),
        texto: [g.textoSemana('2026-10-05', '2026-10-11'), g.textoSemana('2026-09-28', '2026-10-04')],
        pasos: g.pasosTxt(52300), link: g.linkInvitacion('abcd-2345'),
        codigos: [g.codigoValido('ABCD2345'), g.codigoValido('abcd 2345'), g.codigoValido('ABCD0123'), g.codigoValido('ABC')],
      };
    });
    t.eq(r.domingoNoche, { desde: '2026-10-05', hasta: '2026-10-11' }, 'domingo 23:59 en Argentina sigue siendo la semana del lunes 5');
    t.eq(r.lunes, { desde: '2026-10-12', hasta: '2026-10-18' }, 'el lunes 00:00 de Argentina empieza la semana nueva');
    t.eq(r.martes, { desde: '2026-10-05', hasta: '2026-10-11' }, 'un martes cae en su semana (lunes a domingo)');
    t.eq(r.pasada, { desde: '2026-09-28', hasta: '2026-10-04' }, 'la semana pasada');
    t.eq(r.finDeAnio, { desde: '2026-12-28', hasta: '2027-01-03' }, 'la semana que cruza el año');
    t.eq(r.fecha, '2026-10-11', 'las 02:30 UTC del lunes son todavía domingo en Argentina');
    t.eq(r.texto, ['5 al 11 de oct', '28 de sep al 4 de oct'], 'texto de la semana');
    t.eq(r.pasos, '52.300', 'pasos con punto de miles');
    t.eq(r.link, 'https://gize.ar/app/#grupo=ABCD2345', 'link de invitación');
    t.eq(r.codigos, [true, true, false, false], 'códigos válidos: 8 letras y números sin 0, 1, I, L ni O');
    t.eq(errs, [], 'errores de la página (semana)');
    await close();
  }

  // 2) Crear un grupo: el nombre va a la base y aparece el código para invitar (arriba, porque
  //    estoy solo), con «Invitar» que comparte el link.
  {
    const m = mock({ onCrear: b => ({ id: 'g9', nombre: b.p_nombre, codigo: 'QRST6789', soy_dueno: true, miembros: 1, mi_puesto: 1 }),
      ranking: { g9: [Object.assign({ miembro: 'y', nombre: 'Prueba', pasos: 0, puesto: 1, soy_yo: true }, SEM)] } });
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers, init: SHARE });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    t.has(await text(p, '[data-action="psec-open"][data-v="pasos"]'), 'Competencia de pasos', 'Progreso tiene la tarjeta «Competencia de pasos»');
    await p.click('[data-action="psec-open"][data-v="pasos"]'); await wait(700);
    t.has(await text(p, '#pgData'), 'Todavía no estás en ningún grupo', 'sin grupos: lo explica');
    await p.fill('#pgNombre', 'Los del barrio');
    await p.click('[data-pg="crear"]'); await wait(900);
    t.ok(m.rpcs.some(x => x.startsWith('crear ') && x.includes('"p_nombre":"Los del barrio"')), 'crear manda el nombre: ' + m.rpcs.join(' | '));
    t.eq(await text(p, '.pg-head .form-title'), 'Los del barrio', 'queda abierto el grupo nuevo');
    t.eq(await text(p, '#pgData .pg-inv .pg-code'), 'QRST6789', 'el código del grupo, arriba de todo');
    t.has(await text(p, '#pgData .pg-inv .join-t'), 'invitá a tus amigos', 'invita a sumar amigos');
    await p.click('[data-pg="invitar"]'); await wait(300);
    const sh = await p.evaluate(() => window.__shared);
    t.eq(sh && sh.url, 'https://gize.ar/app/#grupo=QRST6789', 'Invitar comparte el link con el código');
    t.has(sh && sh.text, 'QRST6789', 'el mensaje también lleva el código');
    t.eq(dialogs, [], 'sin carteles al crear');
    t.eq(errs, [], 'errores de la página (crear)');
    await close();
  }

  // 3) Sumarse con el link: gize.ar/app/#grupo=CODIGO. Al entrar se suma solo y abre el grupo.
  {
    const m = mock({ onUnirse: b => Object.assign({}, GRUPO, { id: 'g2', nombre: 'Running club', codigo: b.p_codigo, soy_dueno: false }),
      ranking: { g2: RANKING }, campeon: { g2: CAMPEON } });
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers });
    await p.goto(base + '/app/#grupo=wxyz-2345'); await wait(3200);
    t.ok(m.rpcs.some(x => x === 'unirse {"p_codigo":"WXYZ2345","p_apodo":null}'), 'el link llama a pasos_unirse con el código limpio: ' + m.rpcs.join(' | '));
    t.eq(await p.evaluate(() => location.hash), '', 'el #grupo= se saca de la dirección');
    t.eq(await text(p, '.pg-head .form-title'), 'Running club', 'abre el grupo al que se sumó');
    t.eq(await p.$$eval('.pg-row', l => l.length), 5, 'con su ranking');
    t.eq(await p.$$('[data-pg="borrar"]').then(l => l.length), 0, 'quien no es dueño no puede borrar el grupo');
    t.eq(await p.$$('.pg-rm').then(l => l.length), 0, 'ni sacar gente');
    t.eq(dialogs, [], 'sin carteles al sumarse');
    t.eq(errs, [], 'errores de la página (link)');
    await close();
  }

  // 4) El grupo: campeón dorado arriba, ranking en orden con barras relativas al primero, mi
  //    fila marcada, la semana que dice la base y lo del dueño (sacar gente, borrar).
  {
    const m = mock({ grupos: [GRUPO], ranking: { g1: RANKING }, campeon: { g1: CAMPEON } });
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers, init: "localStorage.setItem('gize_lite','0');" });
    await p.goto(base + '/app/'); await wait(2500);
    await abrirPasos(p);
    t.has(await text(p, '.pg-grupo'), 'Los del laburo', 'la lista muestra mis grupos');
    t.has(await text(p, '.pg-grupo'), '5 personas · vas 2º', 'con cuántos son y en qué puesto voy');
    await p.click('[data-pg="abrir"][data-id="g1"]'); await wait(700);
    const r = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.pg-row')];
      const champ = document.querySelector('#pgData > .pg-champ');
      const cs = s => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
      return {
        first: document.querySelector('#pgData').firstElementChild === champ,
        champ: champ && champ.innerText.replace(/\s+/g, ' ').trim(),
        champT: cs('.pg-champ-t') && cs('.pg-champ-t').color, trofeo: cs('.pg-champ .pg-trofeo') && cs('.pg-champ .pg-trofeo').color,
        trofeoSvg: !!document.querySelector('.pg-champ .pg-trofeo svg'),
        copa: rows.filter(x => x.querySelector('.pg-copa')).map(x => x.querySelector('.pg-name-t').textContent),
        copaColor: cs('.pg-row .pg-copa') && cs('.pg-row .pg-copa').color,
        names: rows.map(x => x.querySelector('.pg-name-t').textContent), pos: rows.map(x => x.querySelector('.pg-pos').textContent),
        n: rows.map(x => x.querySelector('.pg-n').textContent),
        bars: rows.map(x => x.querySelector('.pg-bar i').style.width),
        barPx: rows.map(x => Math.round(x.querySelector('.pg-bar i').getBoundingClientRect().width / x.querySelector('.pg-bar').getBoundingClientRect().width * 100)),
        me: rows.filter(x => x.classList.contains('me')).map(x => x.querySelector('.pg-name-t').textContent),
        meBg: rows.find(x => x.classList.contains('me')) && getComputedStyle(rows.find(x => x.classList.contains('me'))).backgroundImage,
        sem: document.querySelectorAll('.pg-sec-t')[0] && document.querySelectorAll('.pg-sec-t')[0].innerText,
        rm: document.querySelectorAll('.pg-rm').length, sacando: !!document.querySelector('[data-pg="sacando"]'), borrar: !!document.querySelector('[data-pg="borrar"]'),
        code: cs('.pg-code') && document.querySelector('.pg-code').textContent,
        over: document.documentElement.scrollWidth > innerWidth,
      };
    });
    t.ok(r.first, 'el campeón de la semana pasada va arriba de todo');
    t.has(r.champ, 'Campeón de la semana pasada', 'dice «Campeón de la semana pasada»');
    t.has(r.champ, 'Caro · 84.210 pasos', 'con el nombre y los pasos del campeón');
    t.eq(r.champT, GOLD, 'el texto del campeón en dorado (#FFC940)');
    t.ok(r.trofeoSvg && r.trofeo === GOLD, 'la copa del campeón en dorado: ' + r.trofeo);
    t.eq(r.copa, ['Caro'], 'la copa chica al lado del nombre del campeón (y de nadie más)');
    t.eq(r.copaColor, GOLD, 'la copa chica también dorada');
    t.eq(r.names, ['Bruno', 'Prueba', 'Caro', 'Dani', 'Euge'], 'ranking ordenado por pasos');
    t.eq(r.pos, ['1', '2', '3', '4', '5'], 'con el puesto');
    t.eq(r.n, ['71.240', '52.300', '35.620', '17.810', '0'], 'y los pasos de la semana');
    t.eq(r.bars, ['100%', '73%', '50%', '25%', '0%'], 'la barra es relativa al primero');
    t.ok(Math.abs(r.barPx[1] - 73) <= 2 && r.barPx[0] >= 99, 'las barras se ven de ese largo: ' + r.barPx);
    t.eq(r.me, ['Prueba'], 'mi fila marcada');
    t.ok(/linear-gradient\(155deg/.test(r.meBg || ''), 'mi fila con el filete fino de neón: ' + r.meBg);
    t.eq(r.sem, 'Esta semana · 5 al 11 de oct', 'la semana del ranking (de lunes a domingo)');
    t.ok(r.rm === 0 && r.sacando, 'las ✕ para sacar gente aparecen recién con «Sacar a alguien del grupo»');
    t.ok(r.borrar, 'el dueño puede borrar el grupo');
    t.eq(r.code, 'ABCD2345', 'el código para invitar');
    t.ok(!r.over, 'sin scroll de costado a 390 px');
    const a = await contraste(p);
    t.ok(a.n > 15 && !a.malos.length, 'Oscuro: todo el texto con contraste AA (mín. ' + a.min + '): ' + a.malos.join(' | '));
    // Sacar a alguien: el dueño a los demás (no a sí mismo), con confirmación, y llama a la base.
    await p.click('[data-pg="sacando"]'); await wait(200);
    t.eq(await p.$$eval('.pg-rm', l => l.map(b => b.dataset.n)), ['Bruno', 'Caro', 'Dani', 'Euge'], 'el dueño puede sacar a los demás (no a sí mismo)');
    await p.click('.pg-rm[data-n="Euge"]'); await wait(600);
    t.ok(m.rpcs.some(x => x === 'sacar {"p_grupo":"g1","p_miembro":"m5"}'), 'sacar llama a pasos_sacar_miembro: ' + m.rpcs.join(' | '));
    t.ok(m.rpcs.some(x => x === 'ranking {"p_grupo":"g1","p_atras":0}'), 'pide el ranking de esta semana');
    t.eq(errs, [], 'errores de la página (grupo)');
    await close();
  }

  // 4b) Empate en la semana pasada: ganan todos (pedido). «Campeones», los dos nombres y la copa
  //     chica al lado de cada uno.
  {
    const TIE = [CAMPEON, { ...CAMPEON, miembro: 'm1', nombre: 'Bruno' }];
    const m = mock({ grupos: [GRUPO], ranking: { g1: RANKING }, campeon: { g1: TIE } });
    const { p, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers, init: "localStorage.setItem('gize_lite','0');" });
    await p.goto(base + '/app/'); await wait(2500);
    await abrirPasos(p);
    await p.click('[data-pg="abrir"][data-id="g1"]'); await wait(700);
    const champ = (await text(p, '#pgData > .pg-champ')).replace(/\s+/g, ' ');
    t.has(champ, 'Campeones de la semana pasada', 'empate: «Campeones de la semana pasada»');
    t.has(champ, 'Caro y Bruno · 84.210 pasos cada uno', 'empate: los dos nombres con sus pasos');
    const copas = await p.evaluate(() => [...document.querySelectorAll('.pg-row')].filter(x => x.querySelector('.pg-copa')).map(x => x.querySelector('.pg-name-t').textContent));
    t.eq(copas.sort(), ['Bruno', 'Caro'], 'empate: la copa chica al lado de los dos');
    await close();
  }

  // 5) «Claro»: el mismo grupo legible, con el dorado más oscuro en el texto y la copa dorada sobre
  //    su insignia oscura.
  {
    const m = mock({ grupos: [GRUPO], ranking: { g1: RANKING }, campeon: { g1: CAMPEON } });
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers, init: "localStorage.setItem('gize_lite','0');localStorage.setItem('gize_tema','luz');" });
    await p.goto(base + '/app/'); await wait(2500);
    await abrirPasos(p);
    await p.click('[data-pg="abrir"][data-id="g1"]'); await wait(700);
    const r = await p.evaluate(() => ({ luz: document.documentElement.classList.contains('tema-luz'),
      trofeo: getComputedStyle(document.querySelector('.pg-champ .pg-trofeo')).color, t: getComputedStyle(document.querySelector('.pg-champ-t')).color }));
    t.ok(r.luz, 'Claro: html.tema-luz');
    t.eq(r.trofeo, GOLD, 'Claro: la copa sigue dorada');
    t.eq(r.t, 'rgb(122, 82, 0)', 'Claro: el texto dorado más oscuro, para que se lea');
    const a = await contraste(p);
    t.ok(a.n > 15 && !a.malos.length, 'Claro: todo el texto con contraste AA (mín. ' + a.min + '): ' + a.malos.join(' | '));
    t.eq(errs, [], 'errores de la página (Claro)');
    await close();
  }

  // 6) Los pasos anotados a mano («8.500») suben a daily_logs (solo los pasos de hoy) y se ven.
  {
    const m = mock({ grupos: [GRUPO], ranking: { g1: RANKING }, campeon: { g1: CAMPEON } });
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers });
    await p.goto(base + '/app/'); await wait(2500);
    await abrirPasos(p);
    t.has(await text(p, '.pg-hoy .pg-note'), 'Anotá el total de hoy', 'en la web: anotalos a mano');
    await p.fill('#pgSteps', '8.500');
    await p.click('[data-pg="pasos"]'); await wait(1500);
    const hoy = await p.evaluate(async () => (await import('/app/core/utils.js')).today());
    const b = m.posts.map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).flat().filter(Boolean);
    t.ok(b.some(x => x.steps === 8500 && x.log_date === hoy && x.client_id === ALUMNO.id), 'sube 8500 pasos a daily_logs con la fecha de hoy: ' + JSON.stringify(b));
    t.ok(!b.some(x => x.steps === 8500 && 'water_ml' in x), 'van los pasos solos (sin la foto del día)');
    t.eq(await text(p, '#pgHoyN'), '8.500', 'el número de hoy se actualiza');
    t.eq((await p.evaluate(() => JSON.parse(localStorage.getItem('rutina_jero_v1')).steps)), 8500, 'y es el mismo contador de pasos de siempre');
    t.ok(m.rpcs.filter(x => x === 'mis_grupos').length >= 2, 'después de guardar se actualizan los grupos');
    t.eq(dialogs, [], 'sin carteles');
    t.eq(errs, [], 'errores de la página (pasos a mano)');
    await close();
  }

  // 7) iPhone en la web: una línea que explica que ahí los pasos no se cuentan solos.
  {
    const m = mock({ grupos: [] });
    const { p, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers,
      init: "Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });" });
    await p.goto(base + '/app/'); await wait(2500);
    await abrirPasos(p);
    t.has(await text(p, '.pg-hoy .pg-note'), 'En el iPhone la web no cuenta pasos', 'iPhone web: avisa que hay que copiarlos de Salud');
    t.ok(!(await text(p, '.pg-hoy .pg-note')).includes('se cargan solos'), 'no promete que en la app se cargan solos (falta el permiso de Salud en la app)');
    await close();
  }

  // 9) App de Android con el plugin de Health Connect (simulado): sin permiso aparece «Conectar
  //    Health Connect»; al conectar pide SOLO leer pasos, lee 8 días, por día toma la fuente que
  //    más contó (no las suma) y sube los pasos; «Desconectar» deja de leer.
  {
    const m = mock({ grupos: [GRUPO], ranking: { g1: RANKING }, campeon: { g1: CAMPEON } });
    const NATIVE = () => {
      window.__health = { pedidos: [], lecturas: [] };
      const hoy = new Date(); hoy.setHours(10, 0, 0, 0);
      const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
        App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null, addListener: () => Promise.resolve({ remove(){} }) },
        Health: {
          isAvailable: async () => ({ available: true, platform: 'android' }),
          requestAuthorization: async o => { window.__health.pedidos.push(o); return { readAuthorized: ['steps'], readDenied: [], writeAuthorized: [], writeDenied: [] }; },
          readSamples: async o => { window.__health.lecturas.push(o); return { samples: [
            { dataType: 'steps', value: 4000, unit: 'count', startDate: hoy.toISOString(), endDate: hoy.toISOString(), sourceId: 'android' },
            { dataType: 'steps', value: 3000, unit: 'count', startDate: hoy.toISOString(), endDate: hoy.toISOString(), sourceId: 'com.android.healthconnect.phone.x' },
            { dataType: 'steps', value: 6500, unit: 'count', startDate: hoy.toISOString(), endDate: hoy.toISOString(), sourceId: 'com.reloj' },
            { dataType: 'steps', value: 9100, unit: 'count', startDate: ayer.toISOString(), endDate: ayer.toISOString(), sourceId: 'android' },
          ] }; },
        } } };
    };
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers, init: NATIVE });
    await p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), r => r.abort());
    await p.goto(base + '/app/'); await wait(2500);
    await abrirPasos(p);
    t.has(await text(p, '.pg-hoy .pg-note'), 'Conectá Health Connect', 'Android sin permiso: ofrece conectar Health Connect');
    t.ok(!!(await p.$('[data-pg="salud-on"]')), 'botón «Conectar Health Connect»');
    t.eq(await p.evaluate(() => window.__health.lecturas.length), 0, 'sin permiso no lee nada');
    await p.click('[data-pg="salud-on"]'); await wait(1500);
    const h = await p.evaluate(() => window.__health);
    t.eq(h.pedidos, [{ read: ['steps'], write: [] }], 'pide solo leer pasos (nada de escribir)');
    t.ok(h.lecturas.length === 1 && h.lecturas[0].dataType === 'steps' && h.lecturas[0].limit === 0, 'lee los pasos: ' + JSON.stringify(h.lecturas));
    const dias = h.lecturas[0] ? Math.round((Date.parse(h.lecturas[0].endDate) - Date.parse(h.lecturas[0].startDate)) / 864e5) : -1;
    t.ok(dias >= 7 && dias <= 8, 'lee los últimos 8 días (' + dias + ')');
    t.eq(await text(p, '#pgHoyN'), '7.000', 'hoy: la fuente que más contó (el celular, 4000 + 3000), sin sumar el reloj');
    const b = m.posts.map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).flat().filter(Boolean);
    t.ok(b.some(x => x.steps === 7000) && b.some(x => x.steps === 9100), 'sube hoy y ayer a daily_logs: ' + JSON.stringify(b));
    t.has(await text(p, '.pg-hoy .pg-note'), 'Se cargan solos desde Health Connect', 'conectado: avisa que se cargan solos');
    t.ok(!!(await p.$('[data-pg="salud-off"]')), 'con «Desconectar»');
    t.ok(dialogs.length === 1 && /solo el total de la semana/.test(dialogs[0]), 'antes del permiso explica qué se lee y quién lo ve: ' + JSON.stringify(dialogs));
    await p.click('[data-pg="salud-off"]'); await wait(800);
    t.has(dialogs[dialogs.length - 1] || '', 'Health Connect → Permisos de apps → GIZE', 'al desconectar explica cómo quitar el permiso');
    t.ok(!!(await p.$('[data-pg="salud-on"]')), 'desconectado: vuelve a ofrecer «Conectar»');
    t.eq(errs, [], 'errores de la página (Health Connect)');
    await close();
  }

  // 10) En la web no hay nada de Salud: ni el botón, ni lecturas.
  {
    const m = mock({ grupos: [] });
    const { p, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers });
    await p.goto(base + '/app/'); await wait(2500);
    await abrirPasos(p);
    t.ok(!(await p.$('[data-pg="salud-on"]')) && !(await p.$('[data-pg="salud-off"]')), 'web: sin «Conectar» ni «Desconectar»');
    t.ok(!(await p.evaluate(async () => (await import('/app/core/salud.js')).saludDisponible())), 'web: Salud no disponible');
    await close();
  }

  // 11) Apps nativas: el plugin, solo lectura de pasos y lo que piden Health Connect y HealthKit.
  {
    const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const pkg = JSON.parse(rd('package.json'));
    t.ok(/^7\./.test(pkg.dependencies['@capgo/capacitor-health'] || ''), 'package.json: @capgo/capacitor-health 7.x (Capacitor 7)');
    t.ok(/minSdkVersion = 26/.test(rd('android/variables.gradle')), 'Android: minSdk 26 (lo pide Health Connect)');
    t.ok(/':capgo-capacitor-health'/.test(rd('android/capacitor.settings.gradle')) && /':capgo-capacitor-health'/.test(rd('android/app/capacitor.build.gradle')), 'Android: el plugin está en Gradle');
    const man = rd('android/app/src/main/AndroidManifest.xml');
    const health = [...man.matchAll(/<uses-permission android:name="android\.permission\.health\.(\w+)"( tools:node="remove")? \/>/g)];
    t.eq(health.filter(x => !x[2]).map(x => x[1]), ['READ_STEPS'], 'Android: de Health Connect solo READ_STEPS');
    t.ok(['WRITE_STEPS', 'READ_WEIGHT', 'WRITE_WEIGHT', 'READ_DISTANCE', 'READ_HEART_RATE', 'READ_ACTIVE_CALORIES_BURNED'].every(k => health.some(x => x[1] === k && x[2])), 'Android: los demás permisos del plugin se sacan');
    t.ok(/androidx\.health\.ACTION_SHOW_PERMISSIONS_RATIONALE/.test(man) && /android\.intent\.action\.VIEW_PERMISSION_USAGE/.test(man) && /android\.intent\.category\.HEALTH_PERMISSIONS/.test(man), 'Android: pantalla de privacidad de Health Connect (Android 13 y 14+)');
    t.ok(/gize\.ar\/privacidad\/#salud/.test(rd('android/app/src/main/java/ar/com/gize/app/PermisosSaludActivity.java')), 'Android: la pantalla abre la política en #salud');
    t.ok(/id="salud"/.test(rd('privacidad/index.html')), 'la política tiene la sección #salud');
    const ent = rd('ios/App/App/App.entitlements'), info = rd('ios/App/App/Info.plist');
    t.ok(/<key>com\.apple\.developer\.healthkit<\/key>\s*<true\/>/.test(ent), 'iPhone: entitlement de HealthKit');
    t.ok(/<key>NSHealthShareUsageDescription<\/key>\s*<string>[^<]*pasos[^<]*<\/string>/.test(info), 'iPhone: texto del permiso de Salud (pasos)');
    t.ok(/CapgoCapacitorHealth/.test(rd('ios/App/CapApp-SPM/Package.swift')), 'iPhone: el plugin está en el paquete de Swift');
  }

  // 8) La base: tablas sin acceso directo, funciones seguras, límites y semana de Argentina.
  {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/pasos-grupos.sql'), 'utf8');
    const defs = [...sql.matchAll(/create or replace function public\.(\w+)\([^)]*\)[\s\S]*?\$\$;|create or replace function public\.(\w+)\([^)]*\)[\s\S]*?end \$\$;/g)].map(x => x[0]);
    t.ok(defs.length >= 14, 'define las funciones (' + defs.length + ')');
    t.ok(defs.filter(d => /security definer/.test(d)).every(d => /set search_path = public/.test(d)), 'toda función security definer con search_path fijo');
    t.ok(/revoke all on public\.pasos_grupos from anon, authenticated/.test(sql) && /revoke all on public\.pasos_miembros from anon, authenticated/.test(sql), 'sin acceso directo a las tablas');
    t.ok(/enable row level security/.test(sql), 'con RLS');
    t.ok(/revoke all on function public\.pasos_totales\(uuid, date, date\) from public, anon, authenticated/.test(sql), 'los totales de otros solo por las funciones');
    t.ok(/>= 10 then/.test(sql) && />= 30 then/.test(sql), 'límites: 10 grupos por persona y 30 por grupo');
    t.ok(/America\/Argentina\/Buenos_Aires/.test(sql) && /isodow/.test(sql), 'semana de lunes a domingo en hora de Argentina');
    t.ok(/create table if not exists/.test(sql) && !/drop table/i.test(sql), 'se puede volver a correr sin borrar nada');
    t.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(sql), 'sin mails en el SQL');
  }
}
