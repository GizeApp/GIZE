// «Personas bloqueadas» (app/ui/bloquear.js) en Configuración del alumno y del coach: la lista de
// a quiénes bloqueé (solo el nombre con que los veía, de my_blocks) y «Desbloquear» en cada uno.
// - Sin conexión: «No se pudo, probá de nuevo.» y «Reintentar»; desbloquear sin conexión deja a la
//   persona en la lista con el mismo aviso.
// - «Desbloquear» llama a unblock_user con el id del bloqueo y la saca de la lista; sin nadie,
//   «No bloqueaste a nadie.».
// - En el coach, la hoja va encima de su Configuración; Escape y el «Atrás» de Android cierran la
//   hoja y la Configuración queda abierta.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const B1 = '8d8d8d8d-0000-4000-8000-000000000001', B2 = '8d8d8d8d-0000-4000-8000-000000000002';
const LISTA = () => [{ id: B1, nombre: 'Coach Prueba', created_at: '2026-10-09T12:00:00Z' }, { id: B2, nombre: 'Bruno', created_at: '2026-10-08T12:00:00Z' }];

function bloqueos(s){
  return {
    '/rpc/my_blocks': (r, J) => { s.lecturas++; return s.modo === 'sin señal' ? r.abort('internetdisconnected') : J(s.lista); },
    '/rpc/unblock_user': (r, J, i) => {
      s.envios.push(JSON.parse(i.body));
      if (s.modo === 'sin señal') return r.abort('internetdisconnected');
      const id = JSON.parse(i.body).p_id; s.lista = s.lista.filter(x => x.id !== id);
      return J(true);
    },
  };
}
const filas = p => p.$$eval('#blockHost .blq-row', l => l.map(r => ({ n: r.querySelector('.blq-name').textContent, b: r.querySelector('.blq-un').innerText.trim() })));

export default async function ({ base, t }){
  // ===== Alumno: Configuración → Personas bloqueadas =====
  {
    const s = { modo: 'sin señal', lista: LISTA(), envios: [], lecturas: 0 };
    const { p, errs, close } = await newPage({ user: ALUMNO,
      state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: Object.assign({ '/profiles': profile('client') }, bloqueos(s)) });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-config'); await wait(500);
    t.has(await text(p, '#view [data-bloqueados]'), 'Personas bloqueadas', 'Configuración: está «Personas bloqueadas»');
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Configuración sin scroll de costado a 390 px');

    // Sin conexión: el aviso y «Reintentar».
    await p.click('#view [data-bloqueados]'); await wait(700);
    t.eq(await text(p, '#blockHost .sheet-title'), 'Personas bloqueadas', 'se abre la hoja «Personas bloqueadas»');
    t.eq(await text(p, '#blockHost .rep-err'), 'No se pudo, probá de nuevo.', 'sin conexión: «No se pudo, probá de nuevo.»');
    s.modo = 'ok';
    await p.click('#blockHost [data-blq="cargar"]'); await wait(700);
    t.eq(await filas(p), [{ n: 'Coach Prueba', b: 'Desbloquear' }, { n: 'Bruno', b: 'Desbloquear' }], 'la lista: el nombre y «Desbloquear»');
    t.eq(await p.getAttribute(`#blockHost [data-blq="des"][data-id="${B2}"]`, 'aria-label'), 'Desbloquear a Bruno', '«Desbloquear» dice a quién');
    t.ok(!(await p.$('#blockHost .rep-err')), 'con conexión: sin el aviso');

    // Desbloquear sin conexión: queda en la lista.
    s.modo = 'sin señal';
    await p.click(`#blockHost [data-blq="des"][data-id="${B1}"]`); await wait(700);
    t.eq(await text(p, '#blockHost .rep-err'), 'No se pudo, probá de nuevo.', 'desbloquear sin conexión: el aviso');
    t.eq((await filas(p)).length, 2, 'desbloquear sin conexión: sigue en la lista');
    // Con conexión: sale de la lista.
    s.modo = 'ok';
    await p.click(`#blockHost [data-blq="des"][data-id="${B1}"]`); await wait(700);
    t.eq(s.envios[s.envios.length - 1], { p_id: B1 }, 'unblock_user con el id del bloqueo');
    t.eq(await filas(p), [{ n: 'Bruno', b: 'Desbloquear' }], 'sale de la lista');
    t.ok(!(await p.$('#blockHost .rep-err')), 'sin el aviso de antes');
    await p.click(`#blockHost [data-blq="des"][data-id="${B2}"]`); await wait(700);
    t.eq(await text(p, '#blockHost .blq-vacio'), 'No bloqueaste a nadie.', 'sin nadie: «No bloqueaste a nadie.»');
    await p.click('#blockHost .sheet-btns [data-blq="cancel"]'); await wait(400);
    t.ok(!(await p.$('#blockHost .sheet')), '«Cerrar» cierra la hoja');
    t.ok(await p.isVisible('#view [data-bloqueados]'), 'y queda Configuración');
    // Al abrirla de nuevo se vuelve a leer.
    const n = s.lecturas;
    await p.click('#view [data-bloqueados]'); await wait(700);
    t.ok(s.lecturas === n + 1 && await p.isVisible('#blockHost .blq-vacio'), 'al abrirla de nuevo se vuelve a leer');
    t.eq(errs, [], 'errores de la página (alumno)');
    await close();
  }

  // ===== Coach: Configuración → Personas bloqueadas, encima de su Configuración =====
  {
    const s = { modo: 'ok', lista: [{ id: B1, nombre: 'Ana Alumna', created_at: '2026-10-09T12:00:00Z' }], envios: [], lecturas: 0 };
    const { p, errs, close } = await newPage({ user: COACH, init: () => {
      window.__ls = {};
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
        App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
          addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
          minimizeApp: async () => {}, exitApp: async () => {} } } };
    }, handlers: Object.assign({
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    }, bloqueos(s)) });
    await p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), r => r.abort());
    await p.goto(base + '/app/'); await wait(3500);
    await p.click('[data-coach="open-settings"]'); await wait(500);
    t.has(await text(p, '#coachSheetHost [data-bloqueados]'), 'Personas bloqueadas', 'coach: en su Configuración está «Personas bloqueadas»');
    await p.click('#coachSheetHost [data-bloqueados]'); await wait(700);
    t.eq(await filas(p), [{ n: 'Ana Alumna', b: 'Desbloquear' }], 'coach: la lista');
    const arriba = await p.evaluate(() => { const b = document.querySelector('#blockHost .blq-un').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!(e && e.closest('#blockHost')); });
    t.ok(arriba, 'coach: la hoja está encima de su Configuración');
    // «Atrás» de Android: cierra la hoja y deja la Configuración.
    await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(500);
    t.ok(!(await p.$('#blockHost .sheet')), 'coach: «Atrás» cierra la hoja');
    t.ok(await p.isVisible('#coachSheetHost .cp-ccard'), 'coach: la Configuración sigue abierta');
    await p.click('#coachSheetHost [data-bloqueados]'); await wait(700);
    await p.click(`#blockHost [data-blq="des"][data-id="${B1}"]`); await wait(700);
    t.eq(s.envios, [{ p_id: B1 }], 'coach: unblock_user');
    t.eq(await text(p, '#blockHost .blq-vacio'), 'No bloqueaste a nadie.', 'coach: lista vacía');
    await p.keyboard.press('Escape'); await wait(400);
    t.ok(!(await p.$('#blockHost .sheet')) && await p.isVisible('#coachSheetHost .cp-ccard'), 'coach: Escape cierra la hoja y la Configuración queda');
    t.eq(errs, [], 'errores de la página (coach)');
    await close();
  }
}
