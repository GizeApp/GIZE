// Cartel de versión nueva (apps de las tiendas): queda arriba del panel del coach y el
// botón abre la página de la tienda.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  const TIENDA = 'https://play.google.com/store/apps/details?id=ar.com.gize.app';
  const { p, errs, close } = await newPage({
    init: () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { App: { getInfo: async () => ({ build: '26' }), addListener: () => {} } } }; },
    handlers: { '/app_config': (r, J) => J([{ value: { android: { ultima: 27, version: '1.1.3', tienda: TIENDA } } }]) } });
  let nav = null; await p.route(/play\.google\.com/, r => { nav = r.request().url(); return r.fulfill({ status: 200, body: 'play' }); });
  await p.goto(base + '/app/'); await wait(4500);
  t.ok(!!(await p.$('#updBox .upd-go')), 'aparece el cartel de versión nueva (build 26 < 27)');
  await p.evaluate(() => { const h = document.getElementById('coachHost'); h.style.display = 'block'; h.innerHTML = '<div style="height:2000px"></div>'; document.getElementById('auth')?.remove(); document.querySelectorAll('.auth-wrap,.auth-card').forEach(e => e.remove()); });
  const top = await p.evaluate(() => { const g = document.querySelector('#updBox .upd-go'); if (!g) return 'sin cartel'; const b = g.getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e && e.closest('.upd-go') ? 'ok' : (e && (e.id || e.className)); });
  t.eq(top, 'ok', 'el botón Actualizar queda arriba del panel del coach');
  await p.click('#updBox .upd-go', { timeout: 3000 }).catch(() => {}); await wait(800);
  t.eq(nav, TIENDA, 'Actualizar abre la página de la tienda');
  t.eq(errs, [], 'errores de la página');
  await close();
}
