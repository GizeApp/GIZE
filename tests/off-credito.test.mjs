// Productos que vienen de Open Food Facts: la ficha muestra el crédito con link (lo pide
// su licencia, ODbL). Los de GIZE no.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const products = [
    { id: 'o1', code: '7790010001', name: 'Galletitas zeta de prueba', brand: 'Marca Uno', kcal: 450, protein: 7, carbs: 70, fat: 15, unit: 'g', verified: false, source: 'off' },
    { id: 'g1', code: '7790010002', name: 'Galletitas zeta caseras', brand: 'Marca Dos', kcal: 430, protein: 6, carbs: 68, fat: 14, unit: 'g', verified: true, source: 'gize' }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: { '/profiles': profile('client'), '/products': (r, J, i) => i.m === 'GET' ? J(products) : undefined } });
  await p.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"products":[]}' }));
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="search-open"]'); await wait(300);
  await p.fill('#foodSearch', 'galletitas zeta'); await wait(1800);
  const rows = await p.$$('#foodResults .food-row');
  const names = await p.evaluate(() => [...document.querySelectorAll('#foodResults .food-row .food-name')].map(e => e.innerText));
  const iOff = names.findIndex(n => /de prueba/.test(n)), iGize = names.findIndex(n => /caseras/.test(n));
  t.ok(iOff >= 0 && iGize >= 0, 'aparecen los dos productos: ' + names.join(' | '));
  if (iOff >= 0){
    await rows[iOff].click(); await wait(500);
    t.has(await text(p, '.sheet-src'), 'Datos de Open Food Facts (ODbL)', 'crédito en un producto de Open Food Facts');
    const href = await p.evaluate(() => { const a = document.querySelector('.sheet-src a'); return a && a.href; });
    t.eq(href, 'https://world.openfoodfacts.org/product/7790010001', 'link a la página del producto en Open Food Facts');
    await p.click('[data-action="portion-cancel"]'); await wait(600);
  }
  if (iGize >= 0){
    if (!(await p.$('#foodSearch'))) { await p.click('[data-action="search-open"]'); await wait(300); await p.fill('#foodSearch', 'galletitas zeta'); await wait(1800); }
    const r2 = await p.$$('#foodResults .food-row'); const n2 = await p.evaluate(() => [...document.querySelectorAll('#foodResults .food-row .food-name')].map(e => e.innerText));
    await r2[n2.findIndex(n => /caseras/.test(n))].click(); await wait(500);
    const s = await text(p, '.sheet-src');
    t.has(s, 'Verificado por GIZE', 'producto de GIZE verificado');
    t.ok(!/Open Food Facts/.test(s), 'un producto de GIZE no lleva el crédito de Open Food Facts');
  }
  t.eq(errs, [], 'errores de la página');
  await close();
}
