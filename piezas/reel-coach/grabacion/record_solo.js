// Graba la app de un usuario SIN coach (Supabase simulado, datos ficticios) en formato celular, escena por escena.
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { setupPage } = require('./common');
const mock = require('./mock_solo');
const OUT = path.join(__dirname, 'frames_solo');
const BASE = process.env.BASE || 'http://localhost:8766';
const ONLY = process.argv.slice(2);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

(async () => {
  const browser = await chromium.launch();
  const { page, ctx } = await setupPage(browser, { serviceWorkers: 'block' });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '/privacidad/');
  await mock.install(ctx, page);
  await ctx.route(/openfoodfacts/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ count: 0, products: [] }) }));
  await ctx.addInitScript(s => localStorage.setItem('sb-wegptuzhsrwppbknqstf-auth-token', JSON.stringify(s)), mock.SESSION);
  await page.goto(BASE + '/app/', { waitUntil: 'networkidle' });
  const css = `#fx-touch{position:fixed;z-index:99999;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
    background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.75);box-shadow:0 0 18px rgba(255,255,255,.35);pointer-events:none;
    opacity:0;transition:opacity .2s, transform .15s}#fx-touch.on{opacity:1}#fx-touch.tap{transform:scale(.72)}
    .gi-bar,.pwa-install,[class*="install"]{display:none!important}
    .ex-note{display:none!important}`;
  await page.addStyleTag({ content: css });
  await page.waitForTimeout(2500);

  const cdp = await ctx.newCDPSession(page);
  let frames = [], rec = false, t0 = 0;
  cdp.on('Page.screencastFrame', f => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); if (rec) frames.push({ t: f.metadata.timestamp, data: f.data }); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 780, maxHeight: 1612 });

  const ensureTouch = () => page.evaluate(() => { if (!document.getElementById('fx-touch')) { const d = document.createElement('div'); d.id = 'fx-touch'; document.body.appendChild(d); } });
  const touch = (on, x, y, tap) => page.evaluate(([on, x, y, tap]) => { const d = document.getElementById('fx-touch'); if (!d) return; d.classList.toggle('on', on);
    if (x != null) { d.style.left = x + 'px'; d.style.top = y + 'px'; } if (tap) { d.classList.add('tap'); setTimeout(() => d.classList.remove('tap'), 160); } }, [on, x, y, tap]);
  const scrollTo = (y, ms) => page.evaluate(([y, ms]) => new Promise(res => { const y0 = scrollY, t0 = performance.now(), e = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const st = n => { const t = Math.min(1, (n - t0) / ms); window.scrollTo(0, y0 + (y - y0) * e(t)); t < 1 ? requestAnimationFrame(st) : res(); }; requestAnimationFrame(st); }), [y, ms]);
  const topOf = sel => page.evaluate(s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; }, sel);
  const scrollToSel = async (sel, off, ms) => { const t = await topOf(sel); if (t != null) await scrollTo(Math.max(0, t - off), ms); else console.log('no', sel); };
  const center = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const tapOn = async (sel, click = true) => {
    await ensureTouch(); const c = await center(sel); if (!c) { console.log('no', sel); return; } const [x, y] = c;
    await touch(true, x - 40, y + 60); await page.waitForTimeout(160);
    for (let i = 1; i <= 10; i++) { await touch(true, x - 40 + 40 * ease(i / 10), y + 60 - 60 * ease(i / 10)); await page.waitForTimeout(22); }
    await page.waitForTimeout(100); await touch(true, x, y, true); if (click) await page.click(sel); await page.waitForTimeout(200); await touch(false);
  };
  const selectOpt = async (sel, idx) => { await tapOn(sel, false); await page.evaluate(([s, i]) => { const e = document.querySelector(s); e.selectedIndex = i; e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, idx]); };
  const typeInto = async (sel, text) => { await tapOn(sel); await page.fill(sel, ''); await page.type(sel, text, { delay: 34 }); };
  const quiet = async fn => { rec = false; await fn(); };                       // pasos que no se graban
  const scene = async (name, fn) => {
    if (ONLY.length && !ONLY.includes(name)) { await fn(); return; }
    frames = []; t0 = Date.now() / 1000; rec = true; await fn(); rec = false; await page.waitForTimeout(100);
    const dir = path.join(OUT, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const times = frames.map((f, i) => { fs.writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.data, 'base64')); return f.t; });
    fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify({ start: t0, end: Date.now() / 1000, times }));
    console.log(name, frames.length, (Date.now() / 1000 - t0).toFixed(1) + 's');
  };
  const openSec = async v => { await tapOn(`[data-coach="sec-open"][data-v="${v}"]`); await page.waitForTimeout(700); };
  const closeSec = () => page.click('[data-coach="sec-close"]').then(() => page.waitForTimeout(400)).catch(() => {});

  const nav = async v => { await tapOn('#nav-' + v); await page.waitForTimeout(700); };
  await scene('racha', async () => { await page.waitForTimeout(400); await tapOn('#streakBtn'); await page.waitForTimeout(1700); });
  await quiet(async () => { await page.evaluate(() => { const b = document.querySelector('.stk-bg'); b && b.click(); }); await page.waitForTimeout(700); });
  await scene('entreno', async () => {
    await tapOn('[data-action="wk-start"]'); await page.waitForTimeout(700);
    await typeInto('[data-action="kg"]', '16,5'); await typeInto('[data-action="reps"]', '13'); await page.waitForTimeout(300);
    await tapOn('[data-action="sug-use"]'); await page.waitForTimeout(700);
  });
  await scene('descanso', async () => { await scrollToSel('[data-action="rest-from-ex"]', 420, 900); await tapOn('[data-action="rest-from-ex"]'); await page.waitForTimeout(2000); });
  await quiet(async () => { await page.evaluate(() => { const b = document.querySelector('[data-action="rest-stop"]'); b && b.click(); }); await page.waitForTimeout(400); await scrollTo(0, 10); });
  await scene('habitos', async () => {
    await nav('habitos'); await typeInto('#habitInput', 'Tomar 3 L de agua'); await tapOn('[data-action="habit-add"]'); await page.waitForTimeout(400);
    await typeInto('#habitInput', 'Dormir 8 horas'); await tapOn('[data-action="habit-add"]'); await page.waitForTimeout(400);
    await tapOn('[data-action="habit-toggle"]'); await page.waitForTimeout(800);
  });
  await scene('cardio', async () => { await nav('cardio'); await tapOn('[data-action="sw-toggle"]'); await page.waitForTimeout(2200); });
  await scene('meta', async () => {
    await nav('comida'); await tapOn('[data-action="cal-open"]'); await page.waitForTimeout(600);
    await tapOn('[data-action="cal-sex"][data-val="m"]');
    await typeInto('[data-action="cal-field"][data-field="age"]', '28'); await typeInto('[data-action="cal-field"][data-field="height"]', '178');
    await typeInto('[data-action="cal-field"][data-field="weight"]', '78');
    await tapOn('[data-action="cal-activity"][data-val="mod"]'); await tapOn('[data-action="cal-goal"][data-val="bajar"]');
    await tapOn('[data-action="cal-calc"]'); await page.waitForTimeout(1400);
  });
  await quiet(async () => { await scrollTo(0, 10); });
  await scene('comida', async () => {
    const t = await topOf('[data-action="meal-add"][data-meal="cena"]'); if (t != null) await scrollTo(Math.max(0, t - 520), 1000);
    await tapOn('[data-action="meal-add"][data-meal="cena"]'); await page.waitForTimeout(500);
    await page.type('[data-action="food-search"]', 'salmón', { delay: 80 }); await page.waitForTimeout(800);
    await tapOn('[data-action="food-pick"]'); await page.waitForTimeout(700);
    await tapOn('[data-action="portion-add"]'); await page.waitForTimeout(600); await scrollTo(0, 1000); await page.waitForTimeout(600);
  });
  await scene('progreso', async () => {
    await nav('progreso'); await tapOn('[data-action="psec-open"][data-v="cargas"]'); await page.waitForTimeout(700);
    await selectOpt('[data-action="load-ex"]', 2); await page.waitForTimeout(1300);
  });
  await browser.close();
})();
