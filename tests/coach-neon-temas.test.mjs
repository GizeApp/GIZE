// Panel del coach: el filete de neón (css/screens/coach/neon.css) en «Claro», «Azul» y «Rosa», en
// liviano, la app de Android, GIZE básico, «reducir movimiento» y colores forzados. La otra mitad (la
// de «Oscuro», sin neón y la app del alumno) está en tests/coach-neon-todo.test.mjs; van separadas
// para que cada una quede lejos del tope de tiempo de cada prueba. Lo común, en tests/coach-neon-comun.mjs.
// - Los colores salen de los tokens de cada apariencia (--gize-r1 / --gize-r2): en «Claro», «Azul» y
//   «Rosa» el filete tiene el tono de su gama, y si se cambian los tokens, cambia el filete. En
//   «Claro» los bordes se ven (medidos en la captura): lo elegido a 4.5:1 o más y lo demás no menos
//   que antes. La rayita de la pestaña elegida de la ficha, a 3:1 o más en todas. Nada se mueve.
// - Liviano y la app de Android: líneas lisas (sin máscaras ni resplandor; lo elegido con el tono de
//   la marca, lo demás con su borde de siempre; las ventanas, una línea lisa). GIZE básico: sin
//   filete (los bordes de siempre). «Reducir movimiento»: nada se anima. Colores forzados: sin
//   filete ni resplandor, sin la línea en degradé de la barra (también en «Azul» y «Claro») y sin
//   las capas de las ventanas.
import { wait } from './lib.mjs';
import { D, M, abrir, go, hoja, leer, colores, conTinte, tono, dTono, hex, conNeon, brillo, transparente, seMueve, contrasteIgual, pixeles, caja, rayita, QUE, QUE_CEL } from './coach-neon-comun.mjs';

export default async function ({ base, t }){
  // ---- «Claro», «Azul» y «Rosa»: el filete con los tokens de cada una ----
  for (const tema of ['claro', 'azul', 'rosa']){
    for (const vp of [D, M]){
      const cel = vp === M, donde = tema + (cel ? ', celular' : ', compu');
      const { p, errs, close } = await abrir(base, { tema, vp, touch: cel });
      await p.goto(base + '/app/'); await wait(3500);
      const [r1, r2] = (await p.evaluate(() => ['--gize-r1', '--gize-r2'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()))).map(hex);
      await go(p, 'editor'); if (!cel) await p.mouse.move(1436, 896); await wait(250);
      const lista = cel ? QUE_CEL.editor : QUE.editor.concat(QUE.inicio);
      for (const [n, sel, on] of lista){
        const v = await leer(p, sel);
        t.ok(conNeon(v), donde + ': ' + n + ' lleva el filete: ' + (v && v.after ? v.after.bg.slice(0, 120) : 'sin ::after'));
        if (conNeon(v)) {
          const cs = colores(v.after.bg).filter(conTinte);
          t.ok(dTono(tono(cs[0]), tono(r2)) <= 20 && dTono(tono(cs[cs.length - 1]), tono(r1)) <= 20,
            donde + ': ' + n + ': el filete tiene el tono de la gama de ' + tema + ' (' + tono(cs[0]).toFixed(0) + '° / ' + tono(r2).toFixed(0) + '°, ' + tono(cs[cs.length - 1]).toFixed(0) + '° / ' + tono(r1).toFixed(0) + '°)');
        }
        t.eq(brillo(v), !!on, donde + ': ' + n + (on ? ' (elegido) tiene' : ' no tiene') + ' resplandor');
      }
      if (!cel){
        // La barra de la izquierda: la línea de la derecha en degradé de la gama.
        const side = await leer(p, '.cv-side');
        const cs = colores(side.lado).filter(conTinte);
        t.ok(/^linear-gradient\((?!\d+deg)/.test(side.lado) && cs.length >= 2 && dTono(tono(cs[0]), tono(r2)) <= 20, donde + ': la barra de la izquierda con la línea en degradé de su gama: ' + side.lado.slice(0, 120));
        // Sale de los tokens: si se cambian, cambia el filete.
        await p.evaluate(() => { document.documentElement.style.setProperty('--gize-r2', '#00FF00'); document.documentElement.style.setProperty('--gize-r1', '#FF0000'); }); await wait(150);
        const v = await leer(p, '.co-daytab.on'), cs2 = colores(v.after.bg).filter(conTinte);
        t.ok(dTono(tono(cs2[0]), 120) <= 10 && dTono(tono(cs2[cs2.length - 1]), 0) <= 10, donde + ': el filete sale de --gize-r1 / --gize-r2 (con otros tokens, otros colores): ' + v.after.bg.slice(0, 120));
        await p.evaluate(() => { document.documentElement.style.removeProperty('--gize-r2'); document.documentElement.style.removeProperty('--gize-r1'); }); await wait(150);
        await contrasteIgual(t, p, donde + ', editor', [['días', '.co-daytab'], ['«Se repite»', '.hd-day'], ['«+ Programar una rutina nueva»', '.co-sched-new']]);
        // La rayita de la pestaña elegida de la ficha: un indicador de estado, a 3:1 o más contra su fondo.
        const [raya] = await pixeles(p, [{ k: 'raya', r: await rayita(p) }]);
        t.ok(raya >= 3, donde + ': la rayita de la pestaña elegida se ve (' + raya + ':1, el más bajo a lo largo)');
        if (tema === 'claro'){
          // «Claro»: los bordes se ven sobre el celeste (medidos en la captura, arriba y abajo a la mitad).
          // Lo elegido, a 4.5:1 o más (antes, el azul marino a 5:1); lo demás, no menos que antes.
          const BORDES = [['día elegido', '.co-daytab.on', true], ['«Se repite» elegido', '.hd-day.on', true], ['navegación elegida', '.cv-nav-i.on', true],
            ['«+ Programar una rutina nueva»', '.co-sched-new'], ['días', '.co-daytab:not(.on):not(.add)'], ['«Se repite»', '.hd-day:not(.on)']];
          const jobs = []; for (const [, sel] of BORDES) jobs.push({ k: 'borde', r: await caja(p, sel) });
          const bc = await pixeles(p, jobs); await hoja(p, false); const bs = await pixeles(p, jobs); await hoja(p, true);
          BORDES.forEach(([n, , on], i) => {
            const con = Math.min(...bc[i]), sin = Math.min(...bs[i]);
            t.ok(on ? con >= 4.5 : con >= sin - .15, donde + ': el borde de ' + n + ' se ve sobre el celeste: ' + bs[i].join('/') + ' → ' + bc[i].join('/') + ':1');
          });
        }
      }
      const d = await seMueve(p);
      t.eq(d.slice(0, 4), [], donde + ', editor: nada cambia de lugar ni de tamaño (' + d.length + ')');
      t.eq(errs, [], donde + ': errores de la página');
      await close();
    }
  }

  // ---- Liviano, app de Android, GIZE básico, «reducir movimiento» y colores forzados ----
  {
    const { p, errs, close } = await abrir(base, { reducedMotion: 'reduce' });
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'editor'); await p.mouse.move(1436, 896); await wait(200);
    // Liviano y la app de Android: líneas lisas. Sin el ::after con máscara (cuesta al deslizar en un
    // celular modesto) ni el resplandor; lo elegido, una línea lisa con el tono de la marca; lo demás,
    // su borde de siempre; las ventanas, una línea lisa sin cortes.
    for (const cls of ['lite', 'android-app']){
      await p.evaluate(c => document.documentElement.classList.add(c), cls); await wait(700); // que terminen las transiciones de los bordes
      const lisos = async () => ({ on: await leer(p, '.co-daytab.on'), resto: await leer(p, '.co-daytab:not(.on):not(.add)'), se: await leer(p, '.hd-day.on'), prog: await leer(p, '.co-sched-new') });
      const v = await lisos(); await hoja(p, false); await wait(600); const v0 = await lisos(); await hoja(p, true); await wait(600);
      t.ok(['on', 'resto', 'se', 'prog'].every(k => v[k] && !v[k].after && !v[k].before), cls + ': sin el filete con máscara ni el resplandor');
      t.ok([v.on, v.se].every(x => !transparente(x.bordes[0]) && colores(x.bordes[0]).some(conTinte) && x.bordes.every(b => b === x.bordes[0])),
        cls + ': lo elegido, una línea lisa con el tono de la marca: ' + v.on.bordes[0] + ' / ' + v.se.bordes[0]);
      t.eq([v.resto.bordes, v.prog.bordes], [v0.resto.bordes, v0.prog.bordes], cls + ': lo demás, con su borde de siempre');
      await p.evaluate(c => document.documentElement.classList.remove(c), cls); await wait(150);
    }
    await p.evaluate(() => document.documentElement.classList.add('lite', 'basico')); await wait(150);
    const bas = await leer(p, '.co-daytab:not(.on):not(.add)'); await hoja(p, false); const basSin = await leer(p, '.co-daytab:not(.on):not(.add)'); await hoja(p, true);
    t.ok(!bas.after && bas.bordes[0] === basSin.bordes[0], 'GIZE básico: sin filete, el borde liso de siempre: ' + bas.bordes[0]);
    await p.evaluate(() => document.documentElement.classList.remove('lite', 'basico')); await wait(150);
    // «Reducir movimiento»: los campos no animan su resplandor; nada de lo nuevo tiene animación.
    const campo = await leer(p, '.co-dayname');
    t.ok(campo.trans[1].split(',').every(d => parseFloat(d) === 0), 'reducir movimiento: el resplandor del foco no se anima: ' + campo.trans.join(' '));
    // (lo que ya se animaba antes, como la perilla de «Sugerencia de peso», no es de esta hoja)
    const ANIMA = () => [...document.querySelectorAll('#coachHost *')].flatMap((e, i) => ['::before', '::after'].map(ps => [e, ps, getComputedStyle(e, ps), i]))
      .filter(([, , s]) => s.content !== 'none' && (s.animationName !== 'none' || s.transitionDuration.split(',').some(d => parseFloat(d) > 0)))
      .map(([e, ps, , i]) => i + ' ' + e.tagName + '.' + String(e.className).split(' ')[0] + ps);
    const anima = await p.evaluate(ANIMA); await hoja(p, false); const animaSin = await p.evaluate(ANIMA); await hoja(p, true);
    t.eq(anima.filter(x => !animaSin.includes(x)), [], 'reducir movimiento: ningún filete ni resplandor se anima');
    await p.evaluate(() => document.documentElement.classList.add('lite')); await go(p, 'programar');
    const vl = await p.evaluate(() => { const w = getComputedStyle(document.querySelector('#applyMount .cp-ccard'));
      return { bordes: [w.borderTopColor, w.borderRightColor, w.borderBottomColor, w.borderLeftColor], bg: w.backgroundImage }; });
    t.ok(vl.bordes.every(b => b === vl.bordes[0]) && colores(vl.bordes[0]).some(conTinte) && !/radial-gradient/.test(vl.bg),
      'lite: la ventana con una línea lisa con el tono de la marca (sin capas ni cortes): ' + vl.bordes[0]);
    await p.evaluate(() => document.documentElement.classList.remove('lite'));
    t.eq(errs, [], 'liviano / básico / reducir movimiento: errores de la página');
    await close();
  }
  {
    const { p, errs, close } = await abrir(base);
    await p.emulateMedia({ forcedColors: 'active' });
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'editor'); await p.mouse.move(1436, 896); await wait(200);
    for (const sel of ['.co-daytab.on', '.co-daytab:not(.on):not(.add)', '.hd-day.on', '.co-sched-new', '.cv-nav-i.on']){
      const v = await leer(p, sel);
      t.ok(v && !v.after && !brillo(v) && !v.bordes.some(transparente), 'colores forzados: ' + sel + ' sin filete ni resplandor, con su borde del sistema: ' + (v && v.bordes[0]));
    }
    t.eq(errs, [], 'colores forzados: errores de la página');
    await close();
  }
  // Colores forzados en «Oscuro», «Azul» y «Claro»: la barra con su borde del sistema (sin la línea en
  // degradé, que lo taparía) y las ventanas sin las capas del filete.
  for (const tema of ['oscuro', 'azul', 'claro']){
    const { p, errs, close } = await abrir(base, { tema });
    await p.emulateMedia({ forcedColors: 'active' });
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'programar');
    const f = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.cv-side')), w = getComputedStyle(document.querySelector('#applyMount .cp-ccard'));
      return { lado: s.borderImageSource, ventana: w.backgroundImage, borde: w.borderTopColor }; });
    t.eq(f.lado, 'none', 'colores forzados, ' + tema + ': la barra de la izquierda sin la línea en degradé (queda su borde del sistema)');
    t.ok(!/gradient/.test(f.ventana) && !transparente(f.borde), 'colores forzados, ' + tema + ': la ventana sin las capas del filete y con su borde del sistema: ' + f.ventana.slice(0, 60) + ' ' + f.borde);
    t.eq(errs, [], 'colores forzados, ' + tema + ': errores de la página');
    await close();
  }
}
