// La app del alumno con un poco del neón del panel (css/ui/neon-app.css) en «Claro», «Azul» y «Rosa», sin
// neón, en liviano, la app de Android, GIZE básico, «reducir movimiento» y colores forzados. La otra
// mitad («Oscuro»: qué lleva el filete, lo pintado, el foco, el mouse) está en tests/neon-app.test.mjs;
// van separadas para que cada una quede lejos del tope de tiempo de cada prueba. Lo común, en
// tests/neon-app-comun.mjs.
// - «Claro», «Azul» y «Rosa»: el filete y los cantos con el tono de la gama de cada una (salen de los
//   tokens: si se cambian, cambian), lo elegido con el resplandor y lo demás sin él. En «Claro» el
//   filete va encima de la línea blanca del vidrio y los cantos con esa línea, la portada lleva un solo
//   filete (el suyo del ::before lo reemplaza este) y los bordes se ven sobre el celeste igual que antes
//   o más (medidos en la captura). Nada se mueve.
// - Sin neón: lo elegido y la portada con el filete blanco y gris (a 160°, sin color), lo elegido más
//   claro, sin resplandor; lo demás (los botones y los otros días), gris como siempre: la hoja no lo
//   toca.
// - Liviano y la app de Android: líneas lisas (sin máscaras, cantos ni resplandor; lo elegido con el
//   tono de la marca, lo demás con su borde de siempre). En «Claro» lo elegido queda como siempre (la
//   pastilla negra, con su sombra en la barra de abajo). GIZE básico: la hoja no cambia nada.
//   «Reducir movimiento»: nada de esto se anima. Colores forzados: sin filete, cantos ni resplandor,
//   con los bordes del sistema.
import { wait } from './lib.mjs';
import { leer, colores, conTinte, tinte, tono, dTono, hex, conNeon, gris, brillo, transparente, fuerza, seMueve, sinCambios, contrasteIgual, pixeles, caja, hoja } from './coach-neon-comun.mjs';
import { abrir, ir, HOJA_APP, QUE, cantos, ZONA } from './neon-app-comun.mjs';

export default async function ({ base, t }){
  const h = HOJA_APP;
  const ENTRENO = QUE.entreno;

  // ---- «Claro», «Azul» y «Rosa»: el filete con los tokens de cada una ----
  for (const tema of ['claro', 'azul', 'rosa']){
    const { p, errs, close } = await abrir(base, { tema });
    await p.goto(base + '/app/'); await wait(3500);
    const [r1, r2] = (await p.evaluate(() => ['--gize-r1', '--gize-r2'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()))).map(hex);
    for (const vista of ['entreno', 'variantes', 'pregunta', 'selector']){
      await ir(p, vista);
      for (const [n, sel, como] of QUE[vista]){
        const v = await leer(p, sel);
        if (como) {
          t.ok(conNeon(v), tema + ': ' + n + ' lleva el filete: ' + (v && v.after ? v.after.bg.slice(0, 120) : 'sin ::after'));
          if (conNeon(v)) {
            const cs = colores(v.after.bg).filter(conTinte);
            t.ok(dTono(tono(cs[0]), tono(r2)) <= 20 && dTono(tono(cs[cs.length - 1]), tono(r1)) <= 20,
              tema + ': ' + n + ': el filete tiene el tono de la gama (' + tono(cs[0]).toFixed(0) + '° / ' + tono(r2).toFixed(0) + '°, ' + tono(cs[cs.length - 1]).toFixed(0) + '° / ' + tono(r1).toFixed(0) + '°)');
            if (tema === 'claro') t.ok(/rgba\(255, 255, 255, 0\.7\)\)$/.test(v.after.bg.trim()), 'claro: ' + n + ': el filete va encima de la línea blanca del vidrio: …' + v.after.bg.slice(-60));
          }
        } else {
          const c = cantos(v);
          t.ok(c.ok && dTono(tono(c.a), tono(r2)) <= 20 && dTono(tono(c.b), tono(r1)) <= 20, tema + ': ' + n + ' lleva los cantos con el tono de la gama: ' + (v && v.sombra.slice(0, 150)));
          if (tema === 'claro') t.ok(c.linea === 'rgba(255, 255, 255, 0.7)', 'claro: ' + n + ': la línea de los cantos es la blanca del vidrio: ' + c.linea);
        }
        t.eq(brillo(v), como === 'on', tema + ': ' + n + (como === 'on' ? ' (elegido) tiene' : ' no tiene') + ' resplandor');
      }
    }
    await ir(p, 'entreno');
    // La portada: un solo filete (en «Claro» el del ::before se va; en «Azul» y «Rosa» se aclara el del ::after).
    const port = await p.evaluate(() => { const e = document.querySelector('.day-head'), b = getComputedStyle(e, '::before'), a = getComputedStyle(e, '::after');
      const filete = s => s.content !== 'none' && /linear-gradient\(1(55|60)deg/.test(s.backgroundImage); return [filete(b), filete(a)]; });
    t.eq(port, [false, true], tema + ': la portada lleva un solo filete (en el ::after)');
    // Sale de los tokens: con otros, otro color (el filete y los cantos).
    await p.evaluate(() => { document.documentElement.style.setProperty('--gize-r2', '#00FF00'); document.documentElement.style.setProperty('--gize-r1', '#FF0000'); }); await wait(150);
    const v = await leer(p, '.tabs .tab.active'), cs2 = colores(v.after.bg).filter(conTinte), c2 = cantos(await leer(p, '.day-head .clear'));
    t.ok(dTono(tono(cs2[0]), 120) <= 10 && dTono(tono(cs2[cs2.length - 1]), 0) <= 10, tema + ': el filete sale de --gize-r1 / --gize-r2 (con otros tokens, otros colores): ' + v.after.bg.slice(0, 120));
    t.ok(c2.ok && dTono(tono(c2.a), 120) <= 12 && dTono(tono(c2.b), 0) <= 12, tema + ': los cantos salen de --gize-r1 / --gize-r2 (' + tono(c2.a || [0, 0, 0]).toFixed(0) + '° / ' + tono(c2.b || [0, 0, 0]).toFixed(0) + '°)');
    await p.evaluate(() => { document.documentElement.style.removeProperty('--gize-r2'); document.documentElement.style.removeProperty('--gize-r1'); }); await wait(150);
    if (tema === 'claro'){
      // Los bordes se ven sobre el celeste (arriba y abajo, a la mitad): lo elegido a 4.5:1 o más (antes,
      // el negro de la pastilla); lo demás, no menos que antes.
      const BORDES = [['día elegido', '.tabs .tab.active', true], ['días', '.tabs .tab:not(.active)'], ['portada del día', '.day-head'], ['«Limpiar»', '.day-head .clear']];
      const jobs = []; for (const [, sel] of BORDES) jobs.push({ k: 'borde', r: await caja(p, sel) });
      const bc = await pixeles(p, jobs); await hoja(p, false, h); const bs = await pixeles(p, jobs); await hoja(p, true, h);
      BORDES.forEach(([n, , on], i) => {
        const con = Math.min(...bc[i]), sin = Math.min(...bs[i]);
        t.ok(on ? con >= 4.5 : con >= sin - .15, 'claro: el borde de ' + n + ' se ve sobre el celeste: ' + bs[i].join('/') + ' → ' + bc[i].join('/') + ':1');
      });
    }
    await contrasteIgual(t, p, tema + ', Entreno', [['días', '.tabs .tab'], ['«Limpiar»', '.day-head .clear'], ['barra de abajo', '.nav-item']], { h, zona: ZONA });
    for (const vista of ['entreno', 'ajustes']){
      await ir(p, vista);
      const d = await seMueve(p, h);
      t.eq(d.slice(0, 4), [], tema + ', ' + vista + ': nada cambia de lugar ni de tamaño (' + d.length + ')');
    }
    t.eq(errs, [], tema + ': errores de la página');
    await close();
  }

  // ---- Neón apagado: lo elegido y la portada con el filete blanco y gris, sin resplandor; lo demás, gris como siempre ----
  for (const tema of ['oscuro', 'claro']){
    const { p, errs, close } = await abrir(base, { tema, neon: false });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => document.documentElement.classList.contains('sin-neon')), 'sin neón (' + tema + '): html.sin-neon');
    const portada = [], elegidos = [];
    for (const vista of ['entreno', 'variantes', 'pregunta', 'selector']){
      await ir(p, vista);
      for (const [n, sel, como] of QUE[vista]){
        const v = await leer(p, sel);
        if (como) {
          t.ok(gris(v), 'sin neón (' + tema + '): ' + n + ' lleva el filete blanco y gris (160°, sin color): ' + (v && v.after ? v.after.bg.slice(0, 110) : 'sin ::after'));
          if (v && v.after) (como === 'on' ? elegidos : portada).push(v.after.bg);
        } else {
          await hoja(p, false, h); const v0 = await leer(p, sel); await hoja(p, true, h);
          t.eq([v.bordes, v.sombra, !!v.after], [v0.bordes, v0.sombra, !!v0.after], 'sin neón (' + tema + '): ' + n + ' queda gris como siempre (sin cantos de color): ' + v.bordes[0]);
        }
        t.ok(!brillo(v) && !tinte(v.sombra), 'sin neón (' + tema + '): ' + n + ' sin resplandor ni color');
      }
    }
    // Lo elegido se distingue: en las oscuras, un filete más claro que el de la portada; en «Claro»,
    // casi negro (la portada, el blanco del vidrio).
    const oscuro = bg => colores(bg).every(([r, g, b]) => r + g + b < 120), blanco = bg => colores(bg).every(([r, g, b]) => r + g + b > 720);
    t.ok(elegidos.length && portada.length && (tema === 'claro' ? elegidos.every(oscuro) && portada.every(blanco) : Math.min(...elegidos.map(fuerza)) > Math.max(...portada.map(fuerza))),
      'sin neón (' + tema + '): lo elegido se distingue (' + (tema === 'claro' ? 'casi negro' : 'más claro') + ')');
    await ir(p, 'entreno');
    const d = await seMueve(p, h);
    t.eq(d.slice(0, 4), [], 'sin neón (' + tema + '): nada cambia de lugar ni de tamaño (' + d.length + ')');
    t.eq(errs, [], 'sin neón (' + tema + '): errores de la página');
    await close();
  }

  // ---- Liviano, app de Android, GIZE básico y «reducir movimiento» ----
  {
    const { p, errs, close } = await abrir(base, { reducedMotion: 'reduce' });
    await p.goto(base + '/app/'); await wait(3500);
    // Liviano y la app de Android: líneas lisas. Sin el ::after con máscara (cuesta al deslizar en un
    // celular modesto) ni el resplandor; lo elegido, una línea lisa con el tono de la marca; lo demás,
    // su borde de siempre.
    for (const cls of ['lite', 'android-app']){
      await p.evaluate(c => document.documentElement.classList.add(c), cls); await wait(500);
      const lisos = async () => ({ dia: await leer(p, '.tabs .tab.active'), resto: await leer(p, '.tabs .tab:not(.active)'), port: await leer(p, '.day-head'),
        lim: await leer(p, '.day-head .clear'), pes: await leer(p, '.nav-item.active') });
      const v = await lisos(); await hoja(p, false, h); await wait(400); const v0 = await lisos(); await hoja(p, true, h); await wait(400);
      t.ok(['dia', 'resto', 'port', 'lim'].every(k => v[k] && !(v[k].after && /linear-gradient\(1(55|60)deg/.test(v[k].after.bg)) && !brillo(v[k])) && !v.pes.after && !brillo(v.pes),
        cls + ': sin el filete con máscara ni el resplandor');
      t.ok(!transparente(v.dia.bordes[0]) && colores(v.dia.bordes[0]).some(conTinte) && v.dia.bordes.every(b => b === v.dia.bordes[0]),
        cls + ': el día elegido, una línea lisa con el tono de la marca: ' + v.dia.bordes[0]);
      t.ok(/inset/.test(v.pes.sombra) && colores(v.pes.sombra).some(conTinte), cls + ': la pestaña elegida de la barra, una línea lisa por dentro con el tono de la marca: ' + v.pes.sombra);
      t.eq([v.resto.bordes, v.port.bordes, v.lim.bordes, v.resto.sombra, v.lim.sombra], [v0.resto.bordes, v0.port.bordes, v0.lim.bordes, v0.resto.sombra, v0.lim.sombra],
        cls + ': lo demás, con su borde de siempre (sin cantos)');
      await p.evaluate(c => document.documentElement.classList.remove(c), cls); await wait(300);
    }
    // GIZE básico: la hoja no cambia nada (en Entreno y en la ventana de variantes).
    await p.evaluate(() => document.documentElement.classList.add('lite', 'basico')); await wait(300);
    t.eq((await sinCambios(p, h)).slice(0, 5), [], 'GIZE básico: la hoja no cambia nada');
    await ir(p, 'variantes');
    t.eq((await sinCambios(p, h)).slice(0, 5), [], 'GIZE básico, variantes: la hoja no cambia nada');
    await p.evaluate(() => document.documentElement.classList.remove('lite', 'basico')); await wait(300);
    // «Reducir movimiento»: ningún filete ni resplandor se anima y el foco no anima su resplandor.
    await ir(p, 'entreno');
    const ANIMA = () => [...document.querySelectorAll('body *')].flatMap((e, i) => ['::before', '::after'].map(ps => [e, ps, getComputedStyle(e, ps), i]))
      .filter(([, , s]) => s.content !== 'none' && s.display !== 'none' && (s.animationName !== 'none' || s.transitionDuration.split(',').some(d => parseFloat(d) > 0)))
      .map(([e, ps, , i]) => i + ' ' + e.tagName + '.' + String(e.className).split(' ')[0] + ps);
    const anima = await p.evaluate(ANIMA); await hoja(p, false, h); const animaSin = await p.evaluate(ANIMA); await hoja(p, true, h);
    t.eq(anima.filter(x => !animaSin.includes(x)), [], 'reducir movimiento: ningún filete ni resplandor se anima');
    await ir(p, 'ejercicio');
    const campo = await leer(p, '.card[data-ex-id="a1"] .field input.kg');
    t.ok(campo && campo.trans[1].split(',').every(d => parseFloat(d) === 0), 'reducir movimiento: el resplandor del foco no se anima: ' + (campo && campo.trans.join(' ')));
    t.eq(errs, [], 'liviano / Android / básico / reducir movimiento: errores de la página');
    await close();
  }
  // La app de Android de verdad (Capacitor la marca con html.android-app al arrancar) con la apariencia
  // completa: líneas lisas, como arriba.
  {
    const { p, errs, close } = await abrir(base, { init: 'window.androidBridge = {};' });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => document.documentElement.classList.contains('android-app') && !document.documentElement.classList.contains('basico')), 'Android: html.android-app, con la apariencia completa');
    const dia = await leer(p, '.tabs .tab.active');
    t.ok(dia && !dia.after && !brillo(dia) && colores(dia.bordes[0]).some(conTinte), 'Android: el día elegido, una línea lisa con el tono de la marca (sin máscara ni resplandor): ' + (dia && dia.bordes[0]));
    t.eq(errs, [], 'Android: errores de la página');
    await close();
  }
  // «Claro» en liviano y en la app de Android: lo elegido ya es la pastilla negra. La hoja no le suma
  // la línea azul marino (casi no se ve sobre el negro) ni le saca a la de la barra de abajo la sombra
  // que la levanta: queda como sin la hoja.
  {
    const { p, errs, close } = await abrir(base, { tema: 'claro' });
    await p.goto(base + '/app/'); await wait(3500);
    for (const cls of ['lite', 'android-app']){
      await p.evaluate(c => document.documentElement.classList.add(c), cls); await wait(500);
      const sel = async () => ({ dia: await leer(p, '.tabs .tab.active'), pes: await leer(p, '.nav-item.active') });
      const v = await sel(); await hoja(p, false, h); await wait(300); const v0 = await sel(); await hoja(p, true, h); await wait(300);
      t.eq([v.dia.bordes, v.dia.sombra, v.pes.sombra], [v0.dia.bordes, v0.dia.sombra, v0.pes.sombra], 'claro + ' + cls + ': el día elegido y la pestaña de la barra quedan como siempre (' + v0.pes.sombra.slice(0, 60) + ')');
      t.ok(/0px 4px 12px -6px/.test(v.pes.sombra) && !/inset/.test(v.pes.sombra), 'claro + ' + cls + ': la pestaña elegida de la barra conserva su sombra: ' + v.pes.sombra);
      await p.evaluate(c => document.documentElement.classList.remove(c), cls); await wait(300);
    }
    t.eq(errs, [], 'claro + liviano / Android: errores de la página');
    await close();
  }
  // ---- Colores forzados: sin filete, cantos ni resplandor, con los bordes del sistema ----
  for (const tema of ['oscuro', 'claro']){
    const { p, errs, close } = await abrir(base, { tema });
    await p.emulateMedia({ forcedColors: 'active' });
    await p.goto(base + '/app/'); await wait(3500);
    for (const [n, sel] of ENTRENO){
      const v = await leer(p, sel);
      t.ok(v && !(v.after && /gradient/.test(v.after.bg)) && !brillo(v) && !tinte(v.sombra) && (v.ancho === 0 || !v.bordes.some(transparente)),
        'colores forzados (' + tema + '): ' + n + ' sin filete, cantos ni resplandor, con su borde del sistema: ' + (v && v.bordes[0]) + ' / ' + (v && v.sombra.slice(0, 60)));
    }
    t.eq(errs, [], 'colores forzados (' + tema + '): errores de la página');
    await close();
  }
}
