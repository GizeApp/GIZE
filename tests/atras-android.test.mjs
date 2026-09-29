// «Atrás» de Android (gesto o botón): cierra la hoja o ventana abierta; si no hay nada
// abierto vuelve a la pantalla anterior y, en el inicio, la app pasa a segundo plano.
// Se simula el plugin App de Capacitor y se llama a su listener de «backButton».
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const NATIVE = () => {
  window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } };
};

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ALUMNO, init: NATIVE,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client') } });
  await p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), r => r.abort());
  await p.goto(base + '/app/'); await wait(3000);
  const back = async (canGoBack = false) => { await p.evaluate(c => (window.__ls.backButton || []).forEach(f => f({ canGoBack: c })), canGoBack); await wait(500); };

  t.eq(await p.evaluate(() => (window.__ls.backButton || []).length), 1, 'la app escucha el «Atrás» de Android');

  // Hoja abierta (elegir ejercicio): «Atrás» la cierra y la app sigue abierta.
  await p.click('[data-action="ex-add-open"]'); await wait(500);
  t.ok(!!(await p.$('#sheetHost .ex-sheet')), 'se abrió el selector de ejercicios');
  await back();
  t.ok(!(await p.$('#sheetHost .ex-sheet')), '«Atrás» cierra el selector de ejercicios');
  t.eq(await p.evaluate(() => window.__min), 0, 'cerrar una hoja no saca de la app');

  // Una sección de Progreso: primero se cierra la sección, después vuelve a Entreno.
  await p.click('#nav-progreso'); await wait(400);
  await p.click('[data-action="psec-open"]'); await wait(400);
  t.ok(!!(await p.$('[data-action="psec-close"]')), 'se abrió una sección de Progreso');
  await back();
  t.ok(!(await p.$('[data-action="psec-close"]')), '«Atrás» cierra la sección');
  t.ok(await p.evaluate(() => document.getElementById('nav-progreso').classList.contains('active')), 'y se queda en Progreso');
  await back();
  t.ok(await p.evaluate(() => document.getElementById('nav-entreno').classList.contains('active')), 'desde otra pestaña, «Atrás» vuelve a Entreno');
  t.eq(await p.evaluate(() => window.__min), 0, 'todavía no sale de la app');

  // En el inicio sin nada abierto: la app pasa a segundo plano.
  await back();
  t.eq(await p.evaluate(() => window.__min), 1, 'en el inicio, «Atrás» saca de la app');

  // Con el panel del coach encima, las pestañas del alumno de abajo no cuentan: sale de la app.
  await p.click('#nav-progreso'); await wait(300);
  await p.evaluate(() => { const h = document.getElementById('coachHost'); h.style.display = 'block'; });
  await back();
  t.eq(await p.evaluate(() => window.__min), 2, 'en la lista del coach, «Atrás» saca de la app');
  await p.evaluate(() => { document.getElementById('coachHost').style.display = ''; });
  await p.click('#nav-entreno'); await wait(300);

  // Si hay historial (por ejemplo, el chat abierto), retrocede en vez de salir.
  await p.evaluate(() => { window.__pop = 0; addEventListener('popstate', () => window.__pop++); history.pushState({ x: 1 }, ''); });
  await back(true);
  t.eq(await p.evaluate(() => [window.__pop, window.__min]), [1, 2], 'con historial, «Atrás» retrocede');
  t.eq(errs, [], 'sin errores en la página');
  await close();
}
