// Gimnasios, etapa 1 (parte 3): la tarjeta «Tu gimnasio» arriba de Entreno (SPEC §3.2). Con ficha:
// «Gimnasio Fuerza · Profe: Lucía» (o «Sin profe», «Coach externo», «Pausado hasta…»), sin Cuota, Pase
// ni Clases todavía, y lleva a Ajustes → Tu gimnasio. Sin ficha (sin gimnasio, o un pedido ya
// confirmado) no hay tarjeta ni sección, y la barra de abajo no cambia. Si mi_gimnasio cambia la ficha
// (otra respuesta, que llega después de la copia guardada), la tarjeta se redibuja sola.
import { wait } from './lib.mjs';
import { entrarSocio, miGimnasioSocio, tarjetaTxt, gymCfgTxt, captura, M, D, ALUMNO } from './gym-comun.mjs';

const navBtns = p => p.evaluate(() => [...document.querySelectorAll('nav .nav-item, #nav .nav-item, .nav-item')].map(b => b.id).filter(Boolean));

export default async function ({ base, t }){
  // ---- Con profe: la tarjeta, sin Cuota/Pase/Clases, y lleva a Ajustes ----
  for (const vp of [M, D]) for (const tema of ['oscuro', 'claro']){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    const pg = await entrarSocio(base, { vp, tema, touch: vp === M }), p = pg.p;
    t.eq(await tarjetaTxt(p), 'Gimnasio Fuerza · Profe: Lucía', donde + ': «Gimnasio Fuerza · Profe: Lucía»');
    t.ok(await p.evaluate(() => { const c = document.querySelector('#view .gym-card'), v = document.getElementById('view'); return !!c && v.firstElementChild === c; }), donde + ': va arriba de todo en Entreno');
    const txt = await tarjetaTxt(p);
    t.ok(!/cuota|pase|clases/i.test(txt), donde + ': todavía sin Cuota, Pase ni Clases');
    await captura(p, 'P3-tarjeta-' + (vp === M ? 'celular' : 'compu') + '-' + tema);
    if (vp === M && tema === 'oscuro'){
      t.eq((await navBtns(p)).length, 6, 'la barra de abajo sigue con sus 6 botones');
      await p.click('#view .gym-card'); await wait(900);
      t.ok(await p.evaluate(() => document.getElementById('nav-config').classList.contains('active')), 'tocarla abre Ajustes');
      t.has(await gymCfgTxt(p), 'Tu gimnasio', 'en Ajustes, la sección «Tu gimnasio»');
      t.ok(await p.evaluate(() => { const r = document.getElementById('cfgGym').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), 'y la sección queda a la vista');
    }
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ---- Variantes: sin profe, coach externo, pausado ----
  const casos = [
    ['sin profe', { profe: null }, 'Gimnasio Fuerza · Sin profe', 'Gimnasio Fuerza, Sin profe. Abrir Tu gimnasio en Ajustes'],
    ['coach externo', { profe: null, coach_externo: true }, 'Gimnasio Fuerza · Coach externo', 'Gimnasio Fuerza, Coach externo. Abrir Tu gimnasio en Ajustes'],
    ['pausado', { status: 'pausado', paused_until: '2026-11-10' }, 'Gimnasio Fuerza · Profe: Lucía · Pausado hasta el 10/11', 'Gimnasio Fuerza, Profe: Lucía, pausado hasta el 10/11. Abrir Tu gimnasio en Ajustes'],
  ];
  for (const [n, extra, esperado, aria] of casos){
    const pg = await entrarSocio(base, { gym: miGimnasioSocio(extra), perfil: n === 'coach externo' ? { coach_id: '33333333-3333-3333-3333-333333333333' } : {} });
    t.eq(await tarjetaTxt(pg.p), esperado, n + ': «' + esperado + '»');
    // El aria-label reemplaza el texto: tiene que decir lo mismo (la pausa también).
    t.eq(await pg.p.$eval('#view .gym-card', b => b.getAttribute('aria-label')), aria, n + ': el lector de pantalla dice «' + aria + '»');
    t.eq(pg.errs, [], n + ': sin errores');
    await pg.close();
  }

  // ---- Sin ficha: sin tarjeta ni sección ----
  for (const [n, gym] of [['sin gimnasio', null], ['pedido confirmado', miGimnasioSocio({}, 'pendiente')]]){
    const pg = await entrarSocio(base, { gym }), p = pg.p;
    t.eq(await tarjetaTxt(p), '', n + ': sin tarjeta en Entreno');
    await p.click('#nav-config'); await wait(500);
    const cfg = await gymCfgTxt(p);
    if (n === 'sin gimnasio'){
      t.eq(cfg, '', n + ': sin «Tu gimnasio» en Ajustes');
      t.ok(!/gimnasio/i.test(await p.evaluate(() => document.getElementById('view').innerText.replace('Código de tu coach o gimnasio', ''))), n + ': fuera de la caja del código, no aparece «gimnasio»');
      t.eq(pg.st.rpcs.map(x => x[0]), ['mi_gimnasio'], n + ': la única llamada del gimnasio es mi_gimnasio');
    } else t.has(cfg, 'Pedido enviado a Gimnasio Fuerza', n + ': en Ajustes, el pedido');
    t.eq(pg.errs, [], n + ': sin errores');
    await pg.close();
  }

  // ---- La copia guardada decía otro profe: al llegar mi_gimnasio, se redibuja ----
  {
    const vieja = miGimnasioSocio({ profe: null });
    const pg = await entrarSocio(base, { gym: miGimnasioSocio(), espera: 400,
      init: `localStorage.setItem('gize_gym_v1', JSON.stringify({ uid: '${ALUMNO.id}', info: ${JSON.stringify(vieja)}, t: 1 }));`,
      rpc: { mi_gimnasio: () => ({ demora: 1500, valor: miGimnasioSocio() }) } }), p = pg.p;
    await wait(300);
    const antes = await tarjetaTxt(p);
    await wait(2500);
    t.eq([antes, await tarjetaTxt(p)], ['Gimnasio Fuerza · Sin profe', 'Gimnasio Fuerza · Profe: Lucía'], 'arranca con la copia guardada y se redibuja con la respuesta');
    t.eq(pg.errs, [], 'copia guardada: sin errores');
    await pg.close();
  }
}
