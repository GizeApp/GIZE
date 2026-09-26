// Graba el panel de coach actual (Supabase simulado, datos ficticios) en formato celular, escena por escena.
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { setupPage } = require('./common');
const mock = require('./mock');
const OUT = path.join(__dirname, 'frames');
const BASE = process.env.BASE || 'http://localhost:8766';
const ONLY = process.argv.slice(2);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

(async () => {
  const browser = await chromium.launch();
  const { page, ctx } = await setupPage(browser, { serviceWorkers: 'block' });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '/privacidad/');
  await mock.install(ctx, page);
  await ctx.addInitScript(s => localStorage.setItem('sb-wegptuzhsrwppbknqstf-auth-token', JSON.stringify(s)), mock.SESSION);
  await page.goto(BASE + '/app/', { waitUntil: 'networkidle' });
  const css = `#fx-touch{position:fixed;z-index:99999;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
    background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.75);box-shadow:0 0 18px rgba(255,255,255,.35);pointer-events:none;
    opacity:0;transition:opacity .2s, transform .15s}#fx-touch.on{opacity:1}#fx-touch.tap{transform:scale(.72)}
    .gi-bar,.pwa-install,[class*="install"]{display:none!important}`;
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

  await scene('lista', async () => { await page.waitForTimeout(500); await scrollTo(420, 1300); await page.waitForTimeout(500); await scrollTo(0, 900); });
  await scene('codigo', async () => { await tapOn('[data-coach="copy-invite"]'); await page.waitForTimeout(1300); });
  await scene('plantillas', async () => {
    await tapOn('[data-coach="view-tpls"]'); await page.waitForTimeout(900);
    await tapOn('[data-coach="tpl-open"]:last-of-type'); await page.waitForTimeout(900); await scrollTo(360, 1200); await page.waitForTimeout(300);
  });
  await quiet(async () => { await scrollTo(0, 10); await page.click('[data-coach="tpl-back"]').catch(() => {}); await page.waitForTimeout(400);
    await page.click('[data-coach="view-clients"]').catch(() => {}); await page.waitForTimeout(500); });
  await scene('alumno', async () => { await tapOn('.co-trow[data-coach="open"]'); await page.waitForTimeout(1500); });
  await scene('notif', async () => { await openSec('notif'); await typeInto('[data-coach="nt-text"]', 'Mañana subimos 2,5 kg en sentadilla 💪'); await page.waitForTimeout(250);
    await tapOn('[data-coach="nt-send"]'); await page.waitForTimeout(900); });
  await quiet(closeSec);
  await scene('bloque', async () => { await openSec('bloque'); await scrollToSel('.bw', 380, 900); await tapOn('.bw[data-w="5"]'); await page.waitForTimeout(900); });
  await quiet(async () => { await page.click('[data-coach="wk-close"]').catch(() => {}); await scrollTo(0, 10); await closeSec(); });
  await scene('diario', async () => { await openSec('daily'); await selectOpt('select.co-select', 1); await page.waitForTimeout(900); await scrollTo(260, 1100); await page.waitForTimeout(300); });
  await quiet(async () => { await scrollTo(0, 10); await closeSec(); });
  await scene('checkin', async () => { await openSec('checkin'); await selectOpt('select.co-select', 1); await page.waitForTimeout(700); await scrollTo(420, 1500); await page.waitForTimeout(300); });
  await quiet(async () => { await scrollTo(0, 10); await closeSec(); });
  await scene('historial', async () => { await openSec('hist'); await selectOpt('select.co-select', 1); await page.waitForTimeout(700); await scrollTo(300, 1300); await page.waitForTimeout(300); });
  await quiet(async () => { await scrollTo(0, 10); await closeSec(); });
  await scene('volumen', async () => { await openSec('volumen'); await page.waitForTimeout(600); await scrollTo(160, 900); await page.waitForTimeout(500); });
  await quiet(async () => { await scrollTo(0, 10); await closeSec(); });
  await scene('peso', async () => { await openSec('peso'); await page.waitForTimeout(900); await scrollTo(380, 1300); await page.waitForTimeout(300); });
  await quiet(async () => { await scrollTo(0, 10); await closeSec(); });
  await scene('rutina', async () => { await tapOn('[data-coach="client-tab"][data-t="rutina"]'); await page.waitForTimeout(800); await scrollToSel('.co-exc', 200, 1300); await page.waitForTimeout(400); });
  await scene('video', async () => {
    const ex = '.co-exc-collapsed .co-exc-cmain';
    await tapOn(ex); await page.waitForTimeout(700);
    await scrollToSel('.co-exc-open details.co-exc-fold', 300, 800);
    await tapOn('.co-exc-open details.co-exc-fold summary'); await page.waitForTimeout(300);
    await typeInto('.co-exc-open [data-coach="rt-video"]', 'https://youtu.be/k7Qx2LmVb9s'); await page.waitForTimeout(700);
  });
  await quiet(async () => { await scrollTo(0, 10); });
  await scene('programada', async () => { await page.waitForTimeout(300); await tapOn('[data-coach="sched-open"]'); await page.waitForTimeout(1200); await scrollTo(250, 1000); await page.waitForTimeout(300); });
  await quiet(async () => { await scrollTo(0, 10); await page.click('[data-coach="tpl-back"]').catch(() => {}); await page.waitForTimeout(500); });
  await scene('plan', async () => { await scrollTo(0, 10); await tapOn('[data-coach="client-tab"][data-t="plan"]'); await page.waitForTimeout(900);
    await tapOn('[data-coach="plsec-open"]'); await page.waitForTimeout(1300); });
  await quiet(async () => { await page.click('[data-coach="plsec-close"]').catch(() => {}); await page.click('[data-coach="back"]').catch(() => {}); await page.waitForTimeout(800); await scrollTo(0, 10); });
  await scene('preguntas', async () => { await tapOn('[data-coach="q-open"]'); await page.waitForTimeout(1300); });
  await browser.close();
})();
