// Gimnasios, etapa 1: el panel en el celular (390 × 844) y en la compu (1440 × 900), con «Oscuro» y
// «Claro». En el celular la píldora de abajo tiene Inicio, Socios, Asistencia y «Más» (lo demás va en
// una hoja), Socios son tarjetas, las ventanas salen de abajo y nada se corre de costado. En la compu,
// la barra lateral con todas las opciones y Socios como tabla. Todo el texto se lee (contraste 4,5:1 o
// más, como pide WCAG AA) en las dos apariencias.
import { wait, contraste } from './lib.mjs';
import { entrar, DUENA, F, M, D, captura, aLaVista } from './gym-comun.mjs';

const VISTAS = ['inicio', 'socios', 'ficha', 'profes', 'asistencia', 'recepcion', 'config', 'plan'];

export default async function ({ base, t }){
  for (const tema of ['oscuro', 'claro']){
    for (const vp of [M, D]){
      const cel = vp === M, donde = tema + (cel ? ', celular' : ', compu');
      const pg = await entrar(base, DUENA, { tema, vp, touch: cel }), p = pg.p;
      t.eq(await p.evaluate(() => document.documentElement.classList.contains('tema-luz')), tema === 'claro', donde + ': la apariencia elegida');
      // La navegación
      const nav = await p.$$eval('#coachHost .gy-nav .cv-nav-i', l => l.filter(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0).map(b => b.innerText.replace(/\s+/g, ' ').replace(/\s*\d+$/, '').trim()));
      if (cel) t.eq(nav, ['Inicio', 'Socios', 'Asistencia', 'Más'], donde + ': la píldora con Inicio, Socios, Asistencia y Más');
      else t.ok(['Inicio', 'Socios', 'Profes', 'Asistencia', 'Rutinas', 'Recepción', 'Configuración', 'Plan de GIZE'].every(x => nav.includes(x)) && !nav.includes('Más'), donde + ': la barra lateral con todas las opciones: ' + nav.join(', '));
      for (const v of VISTAS){
        if (v === 'ficha'){ await p.evaluate(id => { const r = document.querySelector('#coachHost .gy-row[data-id="' + id + '"]'); if (r) r.click(); }, F.A1); await wait(900); }
        else if (cel && !['inicio', 'socios', 'asistencia'].includes(v)){
          await p.tap('#coachHost [data-gym="mas"]'); await wait(400);
          t.ok(await p.$('#gymModal .gy-sheet'), donde + ': «Más» abre la hoja');
          await p.tap('#gymModal .gy-mas-i[data-v="' + v + '"]'); await wait(800);
        } else { await p.click('#coachHost .gy-nav [data-gym="ir"][data-v="' + v + '"]'); await wait(800); }
        const r = await p.evaluate(() => { const h = document.getElementById('coachHost'); return { doc: document.documentElement.scrollWidth, w: innerWidth, h: h.scrollWidth, hc: h.clientWidth, titulo: (document.querySelector('#coachHost .cv-title, #coachHost .co-client-name') || {}).textContent }; });
        t.ok(r.doc <= r.w && r.h <= r.hc, donde + ' · ' + v + ': sin scroll de costado (' + JSON.stringify(r) + ')');
        const c = await contraste(p, '#coachHost');
        t.ok(c.min >= 4.5, donde + ' · ' + v + ': todo el texto con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
        await captura(p, 'P2-' + (cel ? 'celular' : 'compu') + '-' + tema + '-' + v);
      }
      // Socios: tarjetas en el celular, tabla en la compu.
      await p.evaluate(() => document.querySelector('#coachHost [data-gym="ir"][data-v="socios"]').click()); await wait(700);
      const tabla = await p.evaluate(() => { const th = document.querySelector('#coachHost .gy-th'); const fila = document.querySelector('#coachHost .gy-row[data-id]'); return { th: th && getComputedStyle(th).display !== 'none', cols: fila && getComputedStyle(fila).gridTemplateColumns.split(' ').length }; });
      t.ok(cel ? !tabla.th && tabla.cols === 2 : tabla.th && tabla.cols === 7, donde + ': Socios como ' + (cel ? 'tarjetas' : 'tabla') + ' (' + JSON.stringify(tabla) + ')');
      // La ventana de Sumar socio: abajo en el celular, al medio en la compu. «Sumar socio» va en la fila del
      // buscador (ya no en el título), a la vista y sin nada encima: se toca de verdad.
      const sumar = '#coachHost .gy-filtros-bar [data-gym="sumar"]';
      t.eq(await aLaVista(p, sumar), 'a la vista', donde + ': «Sumar socio» a la vista');
      if (cel) await p.tap(sumar); else await p.click(sumar);
      await wait(700);
      const box = await p.$eval('#gymModal .gy-modal', e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, left: r.left, w: r.width }; });
      t.ok(cel ? Math.abs(box.bottom - box.h) < 2 : box.top > 20 && box.bottom < box.h - 20, donde + ': la ventana ' + (cel ? 'sale de abajo' : 'va al medio') + ' (' + JSON.stringify(box) + ')');
      const cm = await contraste(p, '#gymModal');
      t.ok(cm.min >= 4.5, donde + ' · Sumar socio: contraste de 4,5:1 o más (' + cm.min + ': ' + cm.malos.slice(0, 4).join(' | ') + ')');
      await captura(p, 'P2-' + (cel ? 'celular' : 'compu') + '-' + tema + '-sumar');
      await p.keyboard.press('Escape'); await wait(300);
      t.eq(pg.errs, [], donde + ': sin errores');
      await pg.close();
    }
  }
}
