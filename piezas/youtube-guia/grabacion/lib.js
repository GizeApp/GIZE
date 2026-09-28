// Grabador de escenas lento y con «marcas»: cada marca es el texto que explica lo que pasa en pantalla
// en ese momento. Se guardan con su tiempo en times.json y el video las muestra sincronizadas.
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { setupPage } = require('./common');
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

async function start({ mock, out, extraCss = '' }) {
  const BASE = process.env.BASE || 'http://localhost:8766';
  const ONLY = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const { page, ctx } = await setupPage(browser, { serviceWorkers: 'block' });
  await ctx.grantPermissions(['microphone'], { origin: BASE }).catch(() => {});
  page.on('pageerror', e => console.log('ERR', e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE + '/privacidad/');
  await mock.install(ctx, page);
  await ctx.route(/openfoodfacts/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ count: 0, products: [] }) }));
  await ctx.addInitScript(s => localStorage.setItem('sb-wegptuzhsrwppbknqstf-auth-token', JSON.stringify(s)), mock.SESSION);
  await page.goto(BASE + '/app/', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: `#fx-touch{position:fixed;z-index:99999;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
    background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.75);box-shadow:0 0 18px rgba(255,255,255,.35);pointer-events:none;
    opacity:0;transition:opacity .25s, transform .15s}#fx-touch.on{opacity:1}#fx-touch.tap{transform:scale(.72)}
    .gi-bar,.pwa-install,[class*="install"]{display:none!important}` + extraCss });
  await page.waitForTimeout(2500);

  const cdp = await ctx.newCDPSession(page);
  let frames = [], rec = false, t0 = 0, marks = [];
  cdp.on('Page.screencastFrame', f => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); if (rec) frames.push({ t: f.metadata.timestamp, data: f.data }); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 780, maxHeight: 1612 });

  const A = {};
  A.page = page;
  A.wait = ms => page.waitForTimeout(ms);
  A.mark = text => { if (rec) marks.push({ t: Date.now() / 1000 - t0, text }); };
  const ensureTouch = () => page.evaluate(() => { if (!document.getElementById('fx-touch')) { const d = document.createElement('div'); d.id = 'fx-touch'; document.body.appendChild(d); } });
  const touch = (on, x, y, tap) => page.evaluate(([on, x, y, tap]) => { const d = document.getElementById('fx-touch'); if (!d) return; d.classList.toggle('on', on);
    if (x != null) { d.style.left = x + 'px'; d.style.top = y + 'px'; } if (tap) { d.classList.add('tap'); setTimeout(() => d.classList.remove('tap'), 180); } }, [on, x, y, tap]);
  // El panel del coach a veces scrollea adentro de #coachHost y no en la ventana: se usa el que scrollee.
  const SCROLLER = `const h = document.getElementById('coachHost'); const inner = h && h.scrollHeight > h.clientHeight + 5;
    const get = () => inner ? h.scrollTop : scrollY; const set = v => inner ? (h.scrollTop = v) : window.scrollTo(0, v);
    const base = () => inner ? h.getBoundingClientRect().top : 0;`;
  A.scrollTo = (y, ms = 1400) => page.evaluate(([y, ms, S]) => new Promise(res => { eval(S + `
    const y0 = get(), t0 = performance.now(), e = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const st = n => { const t = Math.min(1, (n - t0) / ms); set(y0 + (y - y0) * e(t)); t < 1 ? requestAnimationFrame(st) : res(); }; requestAnimationFrame(st);`); }), [y, ms, SCROLLER]);
  A.topOf = (sel, n = 0) => page.evaluate(([s, n, S]) => eval(S + `
    const e = document.querySelectorAll(s)[n]; e ? Math.round(e.getBoundingClientRect().top - base() + get()) : null;`), [sel, n, SCROLLER]);
  A.scrollToSel = async (sel, off = 200, ms = 1400, n = 0) => { const t = await A.topOf(sel, n); if (t != null) await A.scrollTo(Math.max(0, t - off), ms); else console.log('  no', sel); };
  const center = (sel, n) => page.evaluate(([s, n]) => { const e = document.querySelectorAll(s)[n]; if (!e) return null; e.scrollIntoView({ block: 'nearest' });
    const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [sel, n]);
  A.point = async (sel, n = 0, hold = 900) => {           // señala sin tocar
    await ensureTouch(); const c = await center(sel, n); if (!c) { console.log('  no', sel); return false; } const [x, y] = c;
    await touch(true, x - 50, y + 70); await A.wait(200);
    for (let i = 1; i <= 16; i++) { await touch(true, x - 50 + 50 * ease(i / 16), y + 70 - 70 * ease(i / 16)); await A.wait(24); }
    await A.wait(hold); await touch(false); return true;
  };
  A.tap = async (sel, n = 0, { click = true, after = 500 } = {}) => {
    await ensureTouch(); const c = await center(sel, n); if (!c) { console.log('  no', sel); return false; } const [x, y] = c;
    await touch(true, x - 50, y + 70); await A.wait(220);
    for (let i = 1; i <= 16; i++) { await touch(true, x - 50 + 50 * ease(i / 16), y + 70 - 70 * ease(i / 16)); await A.wait(24); }
    await A.wait(260); await touch(true, x, y, true);
    if (click) await page.evaluate(([s, n]) => { const e = document.querySelectorAll(s)[n]; e && e.click(); }, [sel, n]);
    await A.wait(240); await touch(false); await A.wait(after); return true;
  };
  A.select = async (sel, idx, n = 0) => { await A.tap(sel, n, { click: false, after: 200 });
    await page.evaluate(([s, i, n]) => { const e = document.querySelectorAll(s)[n]; if (!e) return; e.selectedIndex = i; e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, idx, n]); await A.wait(600); };
  A.type = async (sel, text, n = 0) => { await A.tap(sel, n, { click: false, after: 100 });
    const h = (await page.$$(sel))[n]; if (!h) return; await h.focus(); await h.fill(''); await h.type(text, { delay: 75 }); await A.wait(400); };
  A.quiet = async fn => { const r = rec; rec = false; try { await fn(); } catch (e) { console.log('  quiet', e.message.split('\n')[0]); } rec = r; };
  A.scene = async (name, fn) => {
    const on = !ONLY.length || ONLY.includes(name);
    frames = []; marks = []; t0 = Date.now() / 1000; rec = on;
    try { await fn(); } catch (e) { console.log('  ERROR en', name, e.message.split('\n')[0]); }
    rec = false; await A.wait(120);
    if (!on) return;
    const dir = path.join(out, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const times = frames.map((f, i) => { fs.writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.data, 'base64')); return f.t; });
    fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify({ start: t0, end: Date.now() / 1000, times, marks }));
    console.log(name, frames.length, (Date.now() / 1000 - t0).toFixed(1) + 's', marks.length + ' marcas');
  };
  A.done = () => browser.close();
  return A;
}
module.exports = { start };
