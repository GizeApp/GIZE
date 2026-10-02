// «Ver variantes»: con la ventana abierta la pantalla de atrás no se mueve (en iPhone arrastrar
// el fondo o la ventana movía la página de atrás), y el botón tiene un toque de neón (filete de
// la gama), salvo con el neón apagado.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const SHOT = process.env.SHOT_DIR;

export default async function ({ base, t }){
  const ex = (id, name) => ({ id, name, mus: 'pecho', sets: [1, 2, 3].map(i => ({ id: id + 's' + i, kg: '', reps: '', target: '8-10' })) });
  const days = [{ id: 'd1', name: 'Torso', exercises: [ex('e1', 'Press de banca plano (barra)'), ex('e2', 'Aperturas con mancuernas'), ex('e3', 'Fondos en paralelas'), ex('e4', 'Press inclinado con mancuernas')] }];
  for (const neon of [true, false]){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') },
      init: neon ? undefined : `localStorage.setItem('gize_neon','0')` });
    await p.goto(base + '/app/'); await wait(4000);
    await p.click('.ex-collapsed[data-ex="e1"]'); await wait(300);
    const btn = await p.evaluate(() => { const b = document.querySelector('[data-ex-id="e1"] .ex-var-btn'), cs = getComputedStyle(b); return { bg: cs.backgroundImage, shadow: cs.boxShadow }; });
    const tag = neon ? 'con neón' : 'sin neón';
    t.ok(/gradient/.test(btn.bg) && btn.bg.split('gradient').length > 2, tag + ': el botón tiene filete con degradé: ' + btn.bg.slice(0, 80));
    t.ok(btn.shadow && btn.shadow !== 'none', tag + ': y un brillo suave');
    if (SHOT && neon) await p.screenshot({ path: SHOT + '/variantes-boton.png' });

    const antes = await p.evaluate(() => getComputedStyle(document.documentElement).overflow);
    await p.click('[data-ex-id="e1"] .ex-var-btn'); await wait(500);
    const abierta = await p.evaluate(() => ({ html: getComputedStyle(document.documentElement).overflow, body: getComputedStyle(document.body).overflow,
      bgTouch: getComputedStyle(document.querySelector('#sheetHost .sheet-bg')).touchAction }));
    t.ok(!/hidden/.test(antes), tag + ': sin ventana la página scrollea normal');
    t.eq([abierta.html, abierta.body], ['hidden', 'hidden'], tag + ': con la ventana abierta la página de atrás queda quieta');
    t.eq(abierta.bgTouch, 'none', tag + ': arrastrar el fondo oscuro no mueve nada');
    // Intentar scrollear la página de atrás con la rueda no la mueve.
    const y0 = await p.evaluate(() => window.scrollY);
    await p.mouse.move(195, 120); await p.mouse.wheel(0, 600); await wait(300);
    t.eq(await p.evaluate(() => window.scrollY), y0, tag + ': la página de atrás no se desplaza');
    if (SHOT && neon) await p.screenshot({ path: SHOT + '/variantes-ventana.png' });
    await p.click('#sheetHost [data-action="var-cancel"].ctrl'); await wait(600);
    t.ok(!/hidden/.test(await p.evaluate(() => getComputedStyle(document.documentElement).overflow)), tag + ': al cerrar, la página vuelve a scrollear');
    t.eq(errs, [], tag + ': errores de la página');
    await close();
  }
}
