const fs = require('fs'), path = require('path');
const FONTS = path.join(__dirname, 'fonts')  // woff2 de Outfit 400–700 (@fontsource/outfit);
async function setupPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 806 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', ...opts });
  await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ contentType: 'text/css', body:
    [400, 500, 600, 700].map(w => `@font-face{font-family:'Outfit';font-weight:${w};font-style:normal;font-display:block;src:url(https://fonts.gstatic.com/outfit-${w}.woff2) format('woff2')}`).join('\n') }));
  await ctx.route(/fonts\.gstatic\.com\/outfit-(\d+)\.woff2/, (r) => {
    const w = r.request().url().match(/outfit-(\d+)/)[1];
    r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(path.join(FONTS, `outfit-latin-${w}-normal.woff2`)) });
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8766' });
  const page = await ctx.newPage();
  return { ctx, page };
}
module.exports = { setupPage };
