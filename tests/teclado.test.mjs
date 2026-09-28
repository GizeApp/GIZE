// Teclado en la app de Android: el WebView se achica entero (adjustResize), así que la cuenta
// del teclado "que tapa" da 0. Igual tiene que esconderse la barra de abajo mientras se
// escribe. En la compu, achicar la ventana no la esconde.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

async function scenario(base, touch){
  const pg = await newPage({ user: ALUMNO, touch, viewport: { width: 390, height: 800 },
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  const { p } = pg;
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-progreso'); await wait(300);
  await p.click('[data-action="psec-open"][data-v="registro"]'); await wait(300);
  await p.focus('#dKg'); await wait(100);
  await p.setViewportSize({ width: 390, height: 440 }); await wait(400); // se abre el teclado: la ventana se achica
  const open = await p.evaluate(() => ({ kb: document.documentElement.classList.contains('kb-open'), nav: getComputedStyle(document.querySelector('.navbar')).display }));
  await p.evaluate(() => document.activeElement.blur()); await p.setViewportSize({ width: 390, height: 800 }); await wait(400); // se cierra
  const closed = await p.evaluate(() => ({ kb: document.documentElement.classList.contains('kb-open'), nav: getComputedStyle(document.querySelector('.navbar')).display }));
  return Object.assign(pg, { open, closed });
}

export default async function ({ base, t }){
  let r = await scenario(base, true);
  t.ok(r.open.kb && r.open.nav === 'none', 'celular: con el teclado abierto se esconde la barra de abajo: ' + JSON.stringify(r.open));
  t.ok(!r.closed.kb && r.closed.nav !== 'none', 'celular: al cerrar el teclado vuelve la barra: ' + JSON.stringify(r.closed));
  t.eq(r.errs, [], 'errores de la página (celular)'); await r.close();
  r = await scenario(base, false);
  t.ok(!r.open.kb && r.open.nav !== 'none', 'compu: achicar la ventana no esconde la barra: ' + JSON.stringify(r.open));
  await r.close();
}
