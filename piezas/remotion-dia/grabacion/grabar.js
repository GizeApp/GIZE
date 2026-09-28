// Grabaciones para «Un día con GIZE»: el diario de hoy arranca vacío y se completa comida por comida,
// y el peso corporal que baja. Usa el grabador y el Supabase simulado de las guías de YouTube.
process.env.HOY_VACIO = '1'; process.env.BAJA = '1';
const path = require('path');
const G = path.join(__dirname, '..', '..', 'youtube-guia', 'grabacion');
const { start } = require(path.join(G, 'lib'));
const mock = require(path.join(G, 'mock_solo'));

(async () => {
  const A = await start({ mock, out: path.join(__dirname, 'frames'), extraCss: '.ex-note,.daynotes{display:none!important}' });
  const { wait, tap, scrollTo, quiet, scene, page } = A;
  const click = s => page.evaluate(s => document.querySelector(s)?.click(), s);
  // Toca el resultado del buscador cuyo nombre empieza con «nombre».
  const pick = async nombre => {
    const i = await page.evaluate(n => [...document.querySelectorAll('[data-action="food-pick"]')].findIndex(e => e.textContent.toLowerCase().includes(n.toLowerCase())), nombre);
    if (i < 0) console.log('  no encontré', nombre);
    await tap('[data-action="food-pick"]', Math.max(0, i), { after: 700 });
  };
  const agregar = async (comida, busqueda, nombre, masUnidades = 0) => {
    const t = await A.topOf(`[data-action="meal-add"][data-meal="${comida}"]`); if (t != null) await scrollTo(Math.max(0, t - 560), 700);
    await tap(`[data-action="meal-add"][data-meal="${comida}"]`, 0, { after: 500 });
    await page.type('[data-action="food-search"]', busqueda, { delay: 60 }); await wait(900);
    await pick(nombre);
    for (let k = 0; k < masUnidades; k++) await tap('[data-action="portion-step"][data-d="1"]', 0, { after: 350 });
    await tap('[data-action="portion-add"]', 0, { after: 700 });
  };
  const arriba = async () => { await scrollTo(0, 900); await wait(1500); };

  // meta de calorías (sin grabar)
  await quiet(async () => {
    await click('#nav-comida'); await wait(900); await click('[data-action="cal-open"]'); await wait(500);
    await click('[data-action="cal-sex"][data-val="m"]');
    for (const [f, v] of [['age', '28'], ['height', '178'], ['weight', '80']]) { const h = await page.$(`[data-action="cal-field"][data-field="${f}"]`); await h.fill(v); await h.dispatchEvent('input'); }
    await click('[data-action="cal-activity"][data-val="mod"]'); await click('[data-action="cal-goal"][data-val="bajar"]'); await click('[data-action="cal-calc"]'); await wait(1200);
    await scrollTo(0, 10);
  });
  await scene('desayuno', async () => {
    await wait(1200);
    await agregar('desayuno', 'pan integral', 'Pan integral');
    await agregar('desayuno', 'huevo entero', 'Huevo entero', 1);
    await arriba();
  });
  await scene('almuerzo', async () => {
    await agregar('almuerzo', 'pechuga', 'Pechuga / suprema');
    await agregar('almuerzo', 'arroz blanco', 'Arroz blanco');
    await arriba();
  });
  await scene('merienda', async () => {
    await agregar('merienda', 'yogur con', 'Yogur con cereales');
    await agregar('merienda', 'banana', 'Banana');
    await arriba();
  });
  await scene('cena', async () => {
    await wait(900);
    await agregar('cena', 'salmón', 'Salmón rosado');
    await agregar('cena', 'puré mixto', 'Puré mixto');
    await arriba(); await wait(800);
  });
  await scene('peso', async () => {
    await tap('#nav-progreso', 0, { after: 900 });
    await tap('[data-action="psec-open"][data-v="peso"]', 0, { after: 2200 });
    await scrollTo(260, 1400); await wait(1200);
  });
  await A.done();
})();
