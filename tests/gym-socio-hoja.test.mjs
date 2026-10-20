// Gimnasios, etapa 1 (parte 3): la hoja en dos partes antes de pedir sumarse (SPEC §1.3). Lo necesario
// para ser socio (los textos de app/screens/gym/textos.js), la casilla opcional «Compartir…» sin
// marcar, el link a la política y «Podés salir…». Al pedir se manda la versión vigente (la misma que
// gym_versiones() del servidor) y la de «compartir» solo si se marcó. Queda «Pedido enviado» con
// [Cancelar el pedido]; con «aprobar solas» o el mail coincidente, «¡Listo! Ya sos socio». Cancelar,
// Escape y tocar afuera no piden nada; el foco no sale de la hoja.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wait } from './lib.mjs';
import { entrarSocio, miGimnasioSocio, hojaTxt, gymCfgTxt, rpcs, captura, sinScrollHorizontal, M, D } from './gym-comun.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TX = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(ROOT, 'app/screens/gym/textos.js'), 'utf8')));
const GYM = { name: 'Gimnasio Fuerza', city: 'Rosario' };

// Sin gimnasio; pone el código del gimnasio en Ajustes y se abre la hoja. estado: lo que contesta gym_unirse.
async function abrir(base, o = {}){
  const st = { fase: 'nada' };
  const resp = o.resp || (() => ({ estado: 'pendiente', gym: GYM }));
  const pg = await entrarSocio(base, Object.assign({ gym: null }, o, { rpc: Object.assign({
    gym_codigo_info: () => ({ tipo: 'gym', gym: GYM }),
    gym_unirse: b => { const v = resp(b); if (v && v.estado) st.fase = v.estado; return v; },
    gym_cancelar_solicitud: () => { st.fase = 'nada'; return { ok: true }; },
    mi_gimnasio: () => st.fase === 'pendiente' ? miGimnasioSocio({}, 'pendiente') : st.fase === 'activo' || st.fase === 'unida' ? miGimnasioSocio() : null,
  }, o.rpc || {}) }));
  const p = pg.p;
  await p.click('#nav-config'); await wait(500);
  await p.fill('#joinCode', 'FUERZA22');
  await p.click('[data-auth="join"]'); await wait(900);
  return Object.assign(pg, { fase: st });
}
const hoja = p => p.$('#gymSocioHost .gys-sheet');
const marcada = p => p.evaluate(() => { const c = document.querySelector('#gymSocioHost input[data-gys-in="compartir"]'); return c ? c.checked : null; });

export default async function ({ base, t }){
  // ---- Las versiones: un solo lugar en la app, iguales a las del servidor ----
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/gimnasios-socios.sql'), 'utf8');
  const sv = (sql.match(/jsonb_build_object\('hoja', '([^']+)', 'compartir', '([^']+)'/) || []).slice(1);
  t.eq([TX.VERSIONES.hoja, TX.VERSIONES.compartir], sv, 'las versiones de la hoja y de «compartir» son las de gym_versiones()');

  // ---- Lo que dice la hoja (celular y compu, oscuro y claro) ----
  for (const vp of [M, D]) for (const tema of ['oscuro', 'claro']){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    const pg = await abrir(base, { vp, tema, touch: vp === M }), p = pg.p;
    const txt = await hojaTxt(p);
    t.has(txt, 'Te vas a sumar a «Gimnasio Fuerza» (Rosario).', donde + ': el título con el gimnasio y la ciudad');
    for (const l of TX.HOJA_NECESARIO) t.has(txt, l, donde + ': «' + l.slice(0, 40) + '…»');
    t.has(txt, 'Para ser socio:', donde + ': primera parte'); t.has(txt, 'Opcional:', donde + ': segunda parte');
    t.has(txt, TX.HOJA_COMPARTIR, donde + ': la casilla opcional'); t.has(txt, TX.HOJA_COMPARTIR_FINO, donde + ': sin pasos ni recorridos');
    t.has(txt, TX.HOJA_SALIR, donde + ': «Podés salir…»');
    t.eq(await marcada(p), false, donde + ': la casilla opcional viene sin marcar');
    t.eq(await p.getAttribute('#gymSocioHost .gys-link', 'href'), 'https://gize.ar/privacidad/?app=1', donde + ': «¿Qué datos se guardan?» lleva a la política');
    t.eq(await p.evaluate(() => [...document.querySelectorAll('#gymSocioHost .sheet-btns button')].map(b => b.textContent)), ['Cancelar', 'Pedir sumarme'], donde + ': [Cancelar] [Pedir sumarme]');
    t.ok(await p.evaluate(() => { const s = document.querySelector('#gymSocioHost .gys-sheet'); return s.getAttribute('role') === 'dialog' && s.getAttribute('aria-modal') === 'true' && !!document.getElementById(s.getAttribute('aria-labelledby')); }), donde + ': es una ventana con su título');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': sin scroll de costado');
    await captura(p, 'P3-hoja-' + (vp === M ? 'celular' : 'compu') + '-' + tema);
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ---- Pedir (sin marcar): pendiente → «Pedido enviado» → cancelar ----
  {
    const pg = await abrir(base, { vp: M, rpc: { gym_unirse: b => ({ demora: 700, valor: { estado: 'pendiente', gym: GYM } }) } }), p = pg.p;
    // gym_unirse con demora: la respuesta no cambia la fase sola, se fija acá.
    pg.fase.fase = 'pendiente';
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(200);
    t.eq(await p.evaluate(() => [...document.querySelectorAll('#gymSocioHost .sheet-btns button')].map(b => [b.textContent, b.disabled])), [['Cancelar', true], ['Enviando…', true]], 'mientras pide: «Enviando…» y nada más anda');
    await wait(1500);
    t.eq(rpcs(pg.st, 'gym_unirse'), [{ code: 'FUERZA22', hoja_version: '2026-10-borrador', share_admin: false, compartir_version: null }], 'gym_unirse con la versión vigente y sin compartir');
    const txt = await hojaTxt(p);
    t.has(txt, 'Pedido enviado a Gimnasio Fuerza', '«Pedido enviado a Gimnasio Fuerza»');
    t.has(txt, 'Cancelar el pedido', 'con [Cancelar el pedido]');
    t.has(txt, 'Tu foto para el gimnasio (opcional)', 'y la foto, opcional');
    await captura(p, 'P3-pedido-enviado-celular');
    await p.click('#gymSocioHost [data-gys-h="cancel"].primary'); await wait(600);
    t.ok(!(await hoja(p)), '[Listo] cierra la hoja');
    t.has(await gymCfgTxt(p), 'Pedido enviado a Gimnasio Fuerza', 'Ajustes → Tu gimnasio: el pedido');
    await captura(p, 'P3-ajustes-pedido-celular');
    t.eq(rpcs(pg.st, 'gym_cancelar_solicitud'), [], 'todavía no canceló');
    await p.click('#cfgGym [data-gys="cancelar-pedido"]'); await wait(1200);
    const q = pg.preguntas[pg.preguntas.length - 1];
    t.has(q && q.texto, '¿Cancelar el pedido a Gimnasio Fuerza?', 'cancelar pide confirmación');
    t.eq(rpcs(pg.st, 'gym_cancelar_solicitud'), [{}], 'gym_cancelar_solicitud');
    t.eq(await gymCfgTxt(p), '', 'sin pedido: Ajustes ya no muestra «Tu gimnasio»');
    t.eq(pg.errs, [], 'pedir y cancelar: sin errores');
    await pg.close();
  }
  // Cancelar el pedido desde la misma hoja de «Pedido enviado».
  {
    const pg = await abrir(base), p = pg.p;
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1200);
    await p.click('#gymSocioHost [data-gys-h="cancelar-pedido"]'); await wait(1200);
    t.eq(rpcs(pg.st, 'gym_cancelar_solicitud'), [{}], 'desde «Pedido enviado»: gym_cancelar_solicitud');
    t.ok(!(await hoja(p)), 'y se cierra la hoja');
    await pg.close();
  }

  // ---- Marcando la casilla: con la versión de «compartir» ----
  {
    const pg = await abrir(base), p = pg.p;
    await p.click('#gymSocioHost .gys-check'); await wait(100);
    t.eq(await marcada(p), true, 'se puede marcar tocando el texto');
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1200);
    t.eq(rpcs(pg.st, 'gym_unirse'), [{ code: 'FUERZA22', hoja_version: '2026-10-borrador', share_admin: true, compartir_version: '2026-10-borrador' }], 'marcada: share_admin y la versión de «compartir»');
    await pg.close();
  }

  // ---- Entra directo (aprobar solas, o el mail coincidía con una ficha) ----
  for (const e of ['activo', 'unida']){
    const pg = await abrir(base, { resp: () => ({ estado: e, gym: GYM }) }), p = pg.p;
    const antes = pg.calls.filter(c => /GET \/rest\/v1\/profiles/.test(c)).length;
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1800);
    const txt = await hojaTxt(p);
    t.has(txt, '¡Listo! Ya sos socio de Gimnasio Fuerza', e + ': «¡Listo! Ya sos socio de Gimnasio Fuerza»');
    t.has(txt, 'Tu profe es Lucía Profe.', e + ': con su profe');
    t.ok(pg.calls.filter(c => /GET \/rest\/v1\/profiles/.test(c)).length > antes, e + ': se vuelve a leer el perfil (cambió el coach)');
    if (e === 'activo') await captura(p, 'P3-listo-socio');
    await p.click('#gymSocioHost button[data-gys-h="cancel"]'); await wait(500);
    await p.click('#nav-entreno'); await wait(400);
    t.has(await p.evaluate(() => (document.querySelector('#view .gym-card') || {}).innerText || ''), 'Gimnasio Fuerza', e + ': aparece la tarjeta en Entreno');
    t.eq(pg.errs, [], e + ': sin errores');
    await pg.close();
  }

  // ---- Errores del servidor, en la hoja ----
  {
    const m = 'Actualizá la página: cambió el texto que tenés que aceptar.';
    const pg = await abrir(base, { resp: () => ({ error: 'P0001', msg: m }) }), p = pg.p;
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(900);
    t.eq(await p.evaluate(() => (document.querySelector('#gymSocioHost .gys-err') || {}).textContent), m, 'la versión vieja: el texto del servidor en la hoja');
    await pg.close();
  }
  {
    const pg = await abrir(base, { resp: () => ({ estado: 'no_existe', gym: null }) }), p = pg.p;
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(900);
    t.ok(!(await hoja(p)), 'el código dejó de existir: se cierra la hoja');
    t.eq(pg.dialogs[pg.dialogs.length - 1], 'Código inválido. Revisalo con tu coach.', 'y avisa que el código no anda');
    await pg.close();
  }

  // ---- Cancelar, Escape y tocar afuera: no piden nada; Tab no sale de la hoja ----
  {
    const pg = await abrir(base), p = pg.p;
    await p.click('#gymSocioHost button[data-gys-h="cancel"]'); await wait(500);
    t.ok(!(await hoja(p)), '[Cancelar] cierra');
    await p.click('[data-auth="join"]'); await wait(900);
    let fuera = false;
    for (let i = 0; i < 12; i++){ await p.keyboard.press('Tab'); if (!(await p.evaluate(() => !!document.activeElement.closest('#gymSocioHost')))) fuera = true; }
    t.ok(!fuera, 'Tab da la vuelta adentro de la hoja');
    await p.keyboard.press('Escape'); await wait(500);
    t.ok(!(await hoja(p)), 'Escape cierra');
    await p.click('[data-auth="join"]'); await wait(900);
    await p.mouse.click(195, 30); await wait(500);
    t.ok(!(await hoja(p)), 'tocar afuera cierra');
    t.eq(rpcs(pg.st, 'gym_unirse'), [], 'nada de eso pide sumarse');
    t.eq(pg.errs, [], 'cerrar: sin errores');
    await pg.close();
  }
}
