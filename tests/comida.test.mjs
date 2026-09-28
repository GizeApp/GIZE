// Comida: genéricos antes que marcas, gramos con coma y meta con peso con coma.
import { newPage, saved, wait, text, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const products = [
    { id: 'x1', code: '7790001', name: 'Carne picada especial', brand: 'Paty', kcal: 250, protein: 18, carbs: 0, fat: 20, unit: 'g', verified: true, source: 'gize' }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: { '/profiles': profile('client'), '/products': (r, J, i) => i.m === 'GET' ? J(products) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="search-open"]'); await wait(300);

  await p.fill('#foodSearch', 'carne picada'); await wait(1500);
  const names = await p.evaluate(() => [...document.querySelectorAll('#foodResults .food-row .food-name')].map(e => e.innerText.replace(/\s+/g, ' ')));
  t.ok(names.length > 1, 'buscar "carne picada" no trajo resultados');
  const firstBrand = names.findIndex(n => /Paty/.test(n)), firstGeneric = names.findIndex(n => !/Paty/.test(n));
  t.ok(firstGeneric >= 0 && (firstBrand < 0 || firstGeneric < firstBrand), 'los genéricos tienen que ir antes que las marcas: ' + names.slice(0, 4).join(' | '));

  await p.fill('#foodSearch', 'aceite de oliva'); await wait(800);
  await p.click('[data-action="food-pick"]'); await wait(400);
  await p.fill('#portionGrams', '2,5'); await wait(100);
  t.has(await text(p, '#portionPreview'), '23 kcal', 'vista previa con "2,5" g de aceite');
  await p.click('[data-action="portion-add"]'); await wait(800);
  const d = (await saved(p)).diary.map(e => [e.name, e.grams, e.kcal]);
  t.eq(d, [['Aceite de oliva', 2.5, 23]], 'diario con "2,5" g');

  t.eq(errs, [], 'errores de la página');
  await close();
}
