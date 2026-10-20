// Gimnasios, etapa 1 (parte 3): la tarjeta de confirmación cuando falta aceptar la hoja (terms_at vacío,
// SPEC §1.5 y §3.4). Cuenta convertida: «Tu coach ahora es Gimnasio Fuerza…» [Entendido] → la hoja →
// gym_confirmar_hoja (la casilla sin marcar), [Salir del gimnasio] con «Seguir con mi profe». Quien
// entró con la app vieja: «Confirmá tu lugar en…»; con el pedido todavía pendiente: «Confirmá tu
// pedido…» con [Cancelar el pedido]. Mientras falta, Ajustes no ofrece «Compartir».
import { wait } from './lib.mjs';
import { entrarSocio, miGimnasioSocio, hojaTxt, gymCfgTxt, rpcs, captura, DUENA, M, D } from './gym-comun.mjs';

const tarjeta = p => p.evaluate(() => { const e = document.querySelector('#view .gym-card'); return e ? { conf: e.classList.contains('gym-card-conf'), txt: e.innerText.replace(/\s+/g, ' ').trim(), btns: [...e.querySelectorAll('button')].map(b => b.textContent) } : null; });
const CONVERTIDA = { terms_at: null, terms_version: null, origen: 'conversion', profe: { id: DUENA.id, name: 'Carla Dueña' } };

async function abrir(base, extra, o = {}){
  const st = { gym: o.rol === 'pendiente' ? miGimnasioSocio(extra, 'pendiente') : miGimnasioSocio(extra) };
  const pg = await entrarSocio(base, Object.assign({}, o, { gym: st.gym, rpc: Object.assign({
    mi_gimnasio: () => st.gym,
    gym_confirmar_hoja: b => { if (st.gym.ficha) Object.assign(st.gym.ficha, { terms_at: new Date().toISOString(), terms_version: b.hoja_version, share_admin: b.share_admin }); else st.gym.solicitud.terms = true; return { ok: true, share_admin: b.share_admin }; },
    gym_salir: b => { st.gym = null; return { ok: true, sigue_con_profe: b.seguir_con_profe }; },
    gym_cancelar_solicitud: () => { st.gym = null; return { ok: true }; },
  }, o.rpc || {}) }));
  return Object.assign(pg, { g: st });
}

export default async function ({ base, t }){
  // ---- Cuenta convertida ----
  for (const vp of [M, D]) for (const tema of ['oscuro', 'claro']){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    const pg = await abrir(base, CONVERTIDA, { vp, tema, touch: vp === M }), p = pg.p;
    const c = await tarjeta(p);
    t.ok(c && c.conf, donde + ': la tarjeta para confirmar, arriba de Entreno');
    t.has(c && c.txt, 'Tu coach ahora es Gimnasio Fuerza', donde + ': «Tu coach ahora es Gimnasio Fuerza»');
    t.has(c && c.txt, 'Esto es lo que ve el gimnasio', donde + ': «Esto es lo que ve el gimnasio…»');
    t.eq(c && c.btns, ['Entendido', 'Salir del gimnasio'], donde + ': [Entendido] [Salir del gimnasio]');
    await captura(p, 'P3-confirmar-tarjeta-' + (vp === M ? 'celular' : 'compu') + '-' + tema);
    if (vp === M && tema === 'oscuro'){
      await p.click('#view .gym-card [data-gys="confirmar"]'); await wait(700);
      const h = await hojaTxt(p);
      t.has(h, 'Tu coach ahora es Gimnasio Fuerza', '[Entendido]: la hoja');
      t.has(h, 'sigue siendo tu coach', 'la hoja: su coach no cambia');
      t.has(h, 'Recepción ve tu nombre, tu foto y si tu cuota está al día.', 'la hoja: lo necesario');
      t.eq(await p.evaluate(() => document.querySelector('#gymSocioHost input[data-gys-in="compartir"]').checked), false, 'la hoja: la casilla sin marcar');
      await captura(p, 'P3-confirmar-hoja-celular');
      await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1500);
      t.eq(rpcs(pg.st, 'gym_confirmar_hoja'), [{ hoja_version: '2026-10-borrador', share_admin: false, compartir_version: null }], 'gym_confirmar_hoja con la versión vigente, sin compartir');
      t.ok(!(await p.$('#gymSocioHost .gys-sheet')), 'se cierra la hoja');
      const d = await tarjeta(p);
      t.ok(d && !d.conf && d.txt === 'Gimnasio Fuerza · Profe: Carla', 'después: la tarjeta de siempre «Gimnasio Fuerza · Profe: Carla» (' + (d && d.txt) + ')');
    }
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }
  // Confirmar marcando «Compartir».
  {
    const pg = await abrir(base, CONVERTIDA), p = pg.p;
    await p.click('#view .gym-card [data-gys="confirmar"]'); await wait(600);
    await p.click('#gymSocioHost .gys-check');
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1300);
    t.eq(rpcs(pg.st, 'gym_confirmar_hoja'), [{ hoja_version: '2026-10-borrador', share_admin: true, compartir_version: '2026-10-borrador' }], 'confirmar marcando: con la versión de «compartir»');
    await pg.close();
  }
  // [Salir del gimnasio] desde la tarjeta: puede seguir con su coach (la dueña) como alumno propio.
  {
    const pg = await abrir(base, CONVERTIDA), p = pg.p;
    await p.click('#view .gym-card [data-gys="salir"]'); await wait(600);
    t.has(await hojaTxt(p), 'Seguir con Carla como alumno propio', 'salir: ofrece seguir con su coach');
    await p.click('#gymSocioHost .gys-check');
    await p.click('#gymSocioHost [data-gys-h="salir-si"]'); await wait(1500);
    t.eq(rpcs(pg.st, 'gym_salir'), [{ seguir_con_profe: true }], 'salir siguiendo con su coach: gym_salir(true)');
    t.eq(await tarjeta(p), null, 'y ya no hay tarjeta');
    await pg.close();
  }
  // Mientras falta confirmar, Ajustes no ofrece «Compartir»: pide confirmar.
  {
    const pg = await abrir(base, CONVERTIDA), p = pg.p;
    await p.click('#nav-config'); await wait(500);
    const txt = await gymCfgTxt(p);
    t.has(txt, 'Falta que confirmes qué ve el gimnasio.', 'Ajustes: «Falta que confirmes…»');
    t.ok(!(await p.$('#cfgGym [data-gys="compartir"]')), 'Ajustes: sin el interruptor «Compartir»');
    await p.click('#cfgGym [data-gys="confirmar"]'); await wait(600);
    t.has(await hojaTxt(p), 'Tu coach ahora es Gimnasio Fuerza', 'Ajustes: [Ver y confirmar] abre la hoja');
    await pg.close();
  }

  // ---- Entró con la app vieja (ya socio) ----
  {
    const pg = await abrir(base, { terms_at: null, origen: 'codigo' }, { vp: M }), p = pg.p;
    const c = await tarjeta(p);
    t.has(c && c.txt, 'Confirmá tu lugar en Gimnasio Fuerza', 'app vieja: «Confirmá tu lugar en Gimnasio Fuerza»');
    t.eq(c && c.btns, ['Ver y confirmar', 'Salir del gimnasio'], 'app vieja: [Ver y confirmar] [Salir del gimnasio]');
    await captura(p, 'P3-confirmar-app-vieja');
    await p.click('#view .gym-card [data-gys="confirmar"]'); await wait(600);
    t.has(await hojaTxt(p), 'Confirmá qué ve Gimnasio Fuerza', 'app vieja: la hoja');
    await pg.close();
  }
  // ---- Pidió sumarse con la app vieja (pedido pendiente, sin la hoja) ----
  {
    const pg = await abrir(base, { terms: false }, { rol: 'pendiente', vp: M }), p = pg.p;
    const c = await tarjeta(p);
    t.has(c && c.txt, 'Confirmá tu pedido a Gimnasio Fuerza', 'pedido con la app vieja: «Confirmá tu pedido a Gimnasio Fuerza»');
    t.eq(c && c.btns, ['Ver y confirmar', 'Cancelar el pedido'], 'pedido: [Ver y confirmar] [Cancelar el pedido]');
    await captura(p, 'P3-confirmar-pedido');
    await p.click('#view .gym-card [data-gys="confirmar"]'); await wait(600);
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1300);
    t.eq(rpcs(pg.st, 'gym_confirmar_hoja').length, 1, 'pedido: confirma con gym_confirmar_hoja');
    t.eq(await tarjeta(p), null, 'pedido confirmado: sin tarjeta (el pedido sigue en Ajustes)');
    await pg.close();
  }
  {
    const pg = await abrir(base, { terms: false }, { rol: 'pendiente' }), p = pg.p;
    await p.click('#view .gym-card [data-gys="salir"]'); await wait(1300);
    t.eq(rpcs(pg.st, 'gym_cancelar_solicitud'), [{}], 'pedido: [Cancelar el pedido] (con confirmación) cancela');
    t.eq(await tarjeta(p), null, 'y la tarjeta se va');
    await pg.close();
  }
}
