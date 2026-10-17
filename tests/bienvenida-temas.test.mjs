// La bienvenida (css/screens/bienvenida.css y css/ui/rueda.css) en todas las apariencias: Oscuro,
// Claro, Azul y Rosa, con el neón prendido y apagado, el modo liviano, GIZE básico y el
// movimiento reducido, en 390 × 844 y en los Android angostos (320 × 640 y 360 × 800). En cada
// pantalla (bienvenida, disciplina, código con error, cumpleaños, peso, objetivo, la lista de
// rutinas y la bienvenida del coach): nada se sale de la pantalla, «Continuar» se ve entero, el
// texto de las opciones no se corta (tampoco «Weightlifting» en 320 y 360), las tres ruedas de la
// fecha entran en la tarjeta y todo el texto tiene contraste AA. «Continuar» deshabilitado se ve
// pálido (también en básico y con movimiento reducido); en básico todo se ve sin animaciones.
// Con el teclado abierto «Continuar» queda arriba del teclado (iPhone: --kb; Android: la
// ventana se achica). Las capturas van a la carpeta SHOTS si está puesta.
import { newPage, wait, ALUMNO, perfil, contraste, onbAhoraNo, onbSiguiente } from './lib.mjs';

const SHOTS = process.env.SHOTS;
const NUEVO = () => Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString() };
const TEMAS = { oscuro: [], claro: ['tema-luz'], azul: ['tema-claro'], rosa: ['tema-claro', 'tema-rosa'] };
const CLASES = ['tema-luz', 'tema-claro', 'tema-rosa', 'sin-neon', 'lite', 'basico'];
// Sin el modo liviano automático (la máquina de las pruebas puede parecer «de gama baja»).
const SIN_LITE = `localStorage.setItem('gize_lite', '0');`;

const poner = async (p, clases) => { await p.evaluate(([todas, cl]) => { const h = document.documentElement.classList; todas.forEach(c => h.remove(c)); cl.forEach(c => h.add(c)); }, [CLASES, clases]); await wait(350); };

async function revisar(t, p, tag){
  const r = await p.evaluate(() => {
    const host = document.getElementById('authHost'), card = host.querySelector('.onb-card'), cr = card.getBoundingClientRect();
    const m = host.querySelector('.onb-main'), mr = m.getBoundingClientRect(), vis = m.getClientRects().length > 0;
    const cortados = [...host.querySelectorAll('.onb-opt b, .onb-opt small, .onb-routine b, .onb-routine small, .onb-num, .onb-fecha-val, .onb-edad')]
      .filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim());
    const wl = host.querySelector('.onb-tile[data-v="weightlifting"] b');
    return { hscroll: document.documentElement.scrollWidth > innerWidth || host.scrollWidth > host.clientWidth,
      main: !vis || (mr.top >= 0 && mr.bottom <= innerHeight + .5 && mr.left >= 0 && mr.right <= innerWidth + .5),
      cortados, wl: wl ? Math.round(wl.getBoundingClientRect().height) : 0,
      ruedas: [...host.querySelectorAll('.rd-row .rd')].every(e => { const x = e.getBoundingClientRect(); return x.left >= cr.left - .5 && x.right <= cr.right + .5 && x.width > 40; }) };
  });
  t.ok(!r.hscroll, tag + ': nada se sale para el costado');
  t.ok(r.main, tag + ': «Continuar» se ve entero');
  t.eq(r.cortados, [], tag + ': ningún texto cortado');
  if (r.wl) t.ok(r.wl <= 22, tag + ': «Weightlifting» en una línea (' + r.wl + ' px)');
  t.ok(r.ruedas, tag + ': las ruedas de la fecha entran en la tarjeta');
  const k = await contraste(p, '#authHost .onb-card');
  t.ok(k.n > 0 && !k.malos.length, tag + ': contraste AA (mín. ' + k.min + '): ' + k.malos.join(' | '));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/' + tag + '.png' });
}

// Recorre la bienvenida y en cada pantalla llama a pantalla(nombre).
async function recorrer(p, pantalla){
  await pantalla('intro');
  await p.click('[data-onb="start"]'); await wait(400);
  await p.click('[data-onb="disc"][data-v="weightlifting"]'); await wait(200);
  await pantalla('disciplina');
  await onbSiguiente(p);
  await p.fill('#onbCode', 'mal123');
  await p.click('[data-onb="next"]'); await wait(700);
  await pantalla('codigo');
  await p.click('[data-onb="solo"]'); await wait(300);
  await p.click('[data-onb="sex"][data-v="f"]'); await onbSiguiente(p); await wait(300);
  await pantalla('cumple');
  await onbAhoraNo(p); await onbAhoraNo(p); await wait(300);
  await pantalla('peso');
  await onbAhoraNo(p);
  await p.click('[data-onb="goal"][data-v="resistencia"]'); await wait(200);
  await pantalla('objetivo');
  await onbSiguiente(p); await onbAhoraNo(p); await onbAhoraNo(p);
  await onbSiguiente(p); await wait(600);
  await pantalla('rutinas');
}
async function cliente(base, viewport, extra){
  const pg = await newPage(Object.assign({ user: NUEVO(), viewport, init: SIN_LITE, handlers: { '/profiles': perfil('client'), '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined } }, extra || {}));
  await pg.p.goto(base + '/app/'); await wait(2500);
  return pg;
}
async function coach(base, viewport){
  const pg = await newPage({ user: COACH, viewport, init: SIN_LITE + `Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });`, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'trial', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/rpc/my_invite_code': (r, J) => J('GIZE-AB12'),
  } });
  await pg.p.goto(base + '/app/'); await wait(3500);
  return pg;
}

export default async function ({ base, t }){
  const opaco = p => p.$eval('#authHost .onb-main', b => [b.disabled, getComputedStyle(b).opacity]);

  // 1) 390 × 844: las cuatro apariencias, con y sin neón, y liviano / básico.
  {
    const pg = await cliente(base, { width: 390, height: 844 });
    const combos = [];
    for (const [nombre, cl] of Object.entries(TEMAS)) { combos.push([nombre, cl]); combos.push([nombre + '-sin-neon', cl.concat('sin-neon')]); }
    combos.push(['liviano', ['lite']], ['basico', ['lite', 'basico']], ['azul-liviano', ['tema-claro', 'lite']]);
    await recorrer(pg.p, async pantalla => {
      for (const [nombre, cl] of combos) { await poner(pg.p, cl); await revisar(t, pg.p, '390-' + pantalla + '-' + nombre); }
      await poner(pg.p, []);
    });
    t.eq(pg.errs, [], '390: errores de la página');
    await pg.close();
  }

  // 2) Android angostos: Oscuro y Claro.
  for (const vp of [{ width: 320, height: 640 }, { width: 360, height: 800 }]){
    const pg = await cliente(base, vp);
    await recorrer(pg.p, async pantalla => {
      for (const nombre of ['oscuro', 'claro']) { await poner(pg.p, TEMAS[nombre]); await revisar(t, pg.p, vp.width + '-' + pantalla + '-' + nombre); }
      await poner(pg.p, []);
    });
    t.eq(pg.errs, [], vp.width + ': errores de la página');
    await pg.close();
  }

  // 3) Disciplinas: una columna en 320, dos en 360.
  for (const [w, cols] of [[320, 1], [360, 2]]){
    const pg = await cliente(base, { width: w, height: 700 });
    await pg.p.click('[data-onb="start"]'); await wait(400);
    t.eq(await pg.p.$eval('.onb-tiles', e => getComputedStyle(e).gridTemplateColumns.split(' ').length), cols, w + ': disciplinas en ' + cols + ' columna(s)');
    await pg.close();
  }

  // 4) «Continuar» deshabilitado: pálido siempre; en básico todo visible sin animaciones; con
  //    movimiento reducido la barra de avance no anima.
  for (const [nombre, opts, cl] of [['normal', {}, []], ['basico', {}, ['lite', 'basico']], ['reducido', { reducedMotion: 'reduce' }, []]]){
    const pg = await cliente(base, { width: 390, height: 844 }, opts);
    await poner(pg.p, cl);
    await pg.p.click('[data-onb="start"]'); await wait(60);
    t.eq(await opaco(pg.p), [true, '0.45'], nombre + ': «Continuar» deshabilitado, pálido');
    if (nombre === 'basico') {
      const transparentes = await pg.p.evaluate(() => [...document.querySelectorAll('#authHost .onb-card *')].filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
        .filter(e => { for (let x = e; x; x = x.parentElement) if (+getComputedStyle(x).opacity < 1 && !x.disabled && !x.closest('[disabled]')) return true; return false; }).map(e => e.textContent.trim().slice(0, 20)));
      t.eq(transparentes, [], 'básico: recién cambiado el paso, todo el texto ya se ve');
    }
    if (nombre === 'reducido') t.eq(await pg.p.$eval('.onb-prog-fill', e => getComputedStyle(e).transitionDuration), '0s', 'reducido: la barra de avance no anima');
    t.eq(pg.errs, [], nombre + ': errores de la página');
    await pg.close();
  }

  // 5) Teclado abierto. iPhone: --kb (lo que tapa el teclado) y html.kb-open.
  {
    const pg = await cliente(base, { width: 375, height: 667 }), p = pg.p;
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(300);
    await p.evaluate(() => { const h = document.documentElement; h.style.setProperty('--kb', '300px'); h.classList.add('kb-open'); }); await wait(300);
    const b = await p.$eval('#authHost .onb-main', e => Math.round(e.getBoundingClientRect().bottom));
    t.ok(b <= 667 - 300, 'iPhone: con el teclado, «Continuar» queda arriba del teclado (' + b + ')');
    if (SHOTS) await p.screenshot({ path: SHOTS + '/375-codigo-teclado.png' });
    t.eq(pg.errs, [], 'iPhone teclado: errores de la página');
    await pg.close();
  }
  // Android: el teclado achica la ventana (adjustResize).
  {
    const pg = await cliente(base, { width: 360, height: 800 }, { touch: true }), p = pg.p;
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="dskip"]'); await wait(300);
    await p.focus('#onbCode');
    await p.setViewportSize({ width: 360, height: 340 }); await wait(600);
    const r = await p.$eval('#authHost .onb-main', e => { const x = e.getBoundingClientRect(); return { top: Math.round(x.top), bottom: Math.round(x.bottom), h: innerHeight, kb: document.documentElement.classList.contains('kb-open') }; });
    t.ok(r.kb && r.top >= 0 && r.bottom <= r.h, 'Android: con la ventana achicada, «Continuar» se ve entero: ' + JSON.stringify(r));
    if (SHOTS) await p.screenshot({ path: SHOTS + '/360x340-codigo-teclado.png' });
    t.eq(pg.errs, [], 'Android teclado: errores de la página');
    await pg.close();
  }

  // 6) Bienvenida del coach: sin cabecera, «Ir a mi panel» abajo y «Copiar» anda.
  {
    const pg = await coach(base, { width: 390, height: 844 }), p = pg.p;
    const c = await p.evaluate(() => {
      const host = document.getElementById('authHost'), card = host.querySelector('.onb-card').getBoundingClientRect(), m = host.querySelector('.onb-main');
      const mr = m.getBoundingClientRect();
      return { head: host.querySelector('.onb-head').getClientRects().length, txt: m.textContent, abajo: card.bottom - mr.bottom < 40 && mr.bottom <= innerHeight, sr: host.querySelector('.onb-sr').textContent };
    });
    t.eq(c, { head: 0, txt: 'Ir a mi panel', abajo: true, sr: '' }, 'coach: sin cabecera y con «Ir a mi panel» abajo');
    for (const [nombre, cl] of Object.entries(TEMAS)) for (const neon of [true, false]) {
      await poner(p, neon ? cl : cl.concat('sin-neon'));
      await revisar(t, p, '390-coach-' + nombre + (neon ? '' : '-sin-neon'));
    }
    await poner(p, []);
    await p.click('[data-onb="copy"]'); await wait(200);
    t.has(await p.$eval('[data-onb="copy"]', e => e.textContent), 'Copiado', 'coach: «Copiar» copia el código');
    t.eq(pg.errs, [], 'coach: errores de la página');
    await pg.close();
  }
}
