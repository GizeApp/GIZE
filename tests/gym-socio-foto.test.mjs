// Gimnasios, etapa 1 (parte 3): la foto del gimnasio del socio (decisión del 20/10). La saca o la
// aprueba el gimnasio; el socio solo la propone: elige o saca una, la acomoda (ui/recorte.js), se sube
// a gym-fotos/{gimnasio}/{ficha}/… y gym_foto_proponer la deja «esperando que el gimnasio la apruebe»;
// la aprobada no cambia hasta que la aprueben. Cambiar la foto de perfil no toca la del gimnasio. Al
// pedir sumarse también se puede proponer (con la ficha del pedido).
import { wait } from './lib.mjs';
import { entrarSocio, miGimnasioSocio, hojaTxt, gymCfgTxt, rpcs, captura, storageGym, PNG, G, F, M, D } from './gym-comun.mjs';

const RUTA = (f) => new RegExp('^' + G + '/' + f + '/[0-9a-f-]{36}\\.jpg$');
const foto = p => p.evaluate(() => { const i = document.querySelector('#cfgGym .cfg-gym-av img'); return i ? i.getAttribute('src') : ''; });

async function abrir(base, extra, o = {}){
  const subidas = [];
  const st = { gym: o.rol === 'pendiente' ? miGimnasioSocio(extra, 'pendiente') : miGimnasioSocio(extra) };
  const pg = await entrarSocio(base, Object.assign({}, o, { gym: st.gym, handlers: storageGym(subidas), rpc: Object.assign({
    mi_gimnasio: () => st.gym,
    gym_foto_proponer: b => { const f = st.gym.ficha || st.gym.solicitud; Object.assign(f, { foto: 'pendiente', foto_pend_path: b.path }); return { foto: 'pendiente' }; },
  }, o.rpc || {}) }));
  if (o.rol !== 'pendiente'){ await pg.p.click('#nav-config'); await wait(600); }
  return Object.assign(pg, { g: st, subidas });
}
async function elegir(p, sel){
  await p.setInputFiles(sel, { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('.crp .crp-ok', { timeout: 5000 }).catch(() => {});
  await p.click('.crp .crp-ok').catch(() => {}); await wait(1500);
}

export default async function ({ base, t }){
  // ---- Sin foto: la propone ----
  for (const vp of [M, D]){
    const donde = vp === M ? 'celular' : 'compu';
    const pg = await abrir(base, {}, { vp, touch: vp === M }), p = pg.p;
    let txt = await gymCfgTxt(p);
    t.has(txt, 'Todavía no tenés foto del gimnasio.', donde + ': sin foto');
    t.has(txt, 'La ve la recepción. Tu foto de perfil no cambia.', donde + ': para qué es');
    t.has(txt, 'Mandar una foto', donde + ': [Mandar una foto]');
    await p.evaluate(() => document.getElementById('cfgGym').scrollIntoView({ block: 'center' })); await wait(200);
    await captura(p, 'P3-foto-falta-' + donde);
    await elegir(p, '#cfgGym input[data-gys-foto]');
    t.eq(pg.subidas.length, 1, donde + ': se sube una foto a gym-fotos');
    t.ok(RUTA(F.A1).test(pg.subidas[0] || ''), donde + ': a la carpeta de su ficha: ' + pg.subidas[0]);
    t.eq(rpcs(pg.st, 'gym_foto_proponer'), [{ path: pg.subidas[0] }], donde + ': gym_foto_proponer con esa ruta');
    txt = await gymCfgTxt(p);
    t.has(txt, 'Esperando que el gimnasio la apruebe.', donde + ': «Esperando que el gimnasio la apruebe»');
    t.ok(!(await p.$('.crp')), donde + ': se cerró el recorte');
    await wait(600);
    await captura(p, 'P3-foto-pendiente-' + donde);
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ---- Aprobada: se ve; proponer otra no la cambia ----
  {
    const ok = G + '/' + F.A1 + '/' + 'b0000000-0000-4000-8000-000000000001.jpg';
    const pg = await abrir(base, { foto: 'ok', foto_path: ok }), p = pg.p;
    await wait(800);
    t.has(await foto(p), '/object/sign/gym-fotos/foto', 'aprobada: se ve (link firmado de gym-fotos)');
    const txt = await gymCfgTxt(p);
    t.has(txt, 'La aprobó el gimnasio.', 'aprobada: lo dice');
    t.has(txt, 'Pedir cambio de foto', 'aprobada: [Pedir cambio de foto]');
    await p.evaluate(() => document.getElementById('cfgGym').scrollIntoView({ block: 'center' })); await wait(200);
    await captura(p, 'P3-foto-aprobada');
    await elegir(p, '#cfgGym input[data-gys-foto]');
    t.eq(rpcs(pg.st, 'gym_foto_proponer').length, 1, 'pedir cambio: la propone');
    t.has(await gymCfgTxt(p), 'Mandaste otra: esperando que el gimnasio la apruebe. Mientras, sigue esta.', 'pedir cambio: sigue la aprobada mientras tanto');
    t.ok(pg.g.gym.ficha.foto_path === ok, 'la foto aprobada no cambia sola');
    await pg.close();
  }
  // ---- Rechazada: el motivo ----
  {
    const pg = await abrir(base, { foto: 'rechazada', foto_rechazo: 'No se ve bien la cara.' }), p = pg.p;
    const txt = await gymCfgTxt(p);
    t.has(txt, 'El gimnasio no la aprobó: No se ve bien la cara.', 'rechazada: con el motivo');
    t.has(txt, 'Mandar una foto', 'rechazada: [Mandar una foto]');
    await pg.close();
  }
  // ---- No se pudo subir: no la propone ----
  {
    const pg = await abrir(base, {}), p = pg.p;
    await p.route(/\/storage\/v1\/object\/gym-fotos\//, r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":"500","error":"x","message":"x"}' }));
    await elegir(p, '#cfgGym input[data-gys-foto]');
    t.eq(rpcs(pg.st, 'gym_foto_proponer'), [], 'sin subir: no se llama a gym_foto_proponer');
    t.has(pg.dialogs.join(' | '), 'No se pudo subir la foto. Revisá tu conexión y probá de nuevo.', 'sin subir: lo avisa');
    await pg.close();
  }
  // ---- Con el teclado: Tab llega a «Mandar una foto» ----
  {
    const pg = await abrir(base, {}), p = pg.p;
    await p.focus('#cfgGym [data-gys="ver-hoja"]');
    let llega = false;
    for (let i = 0; i < 6 && !llega; i++){ await p.keyboard.press('Tab'); llega = await p.evaluate(() => !!(document.activeElement && document.activeElement.matches('#cfgGym input[data-gys-foto]'))); }
    t.ok(llega, 'la foto se elige también con el teclado');
    await pg.close();
  }

  // ---- La foto de perfil no toca la del gimnasio ----
  {
    const pg = await abrir(base, {}), p = pg.p;
    await p.setInputFiles('input[data-action="avatar-pick"]', { name: 'perfil.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('.crp .crp-ok', { timeout: 5000 }).catch(() => {});
    await p.click('.crp .crp-ok').catch(() => {}); await wait(1500);
    t.ok(pg.calls.some(c => /POST \/storage\/v1\/object\/avatars\//.test(c)), 'perfil: la foto va a avatars, como siempre');
    t.eq([pg.subidas.length, rpcs(pg.st, 'gym_foto_proponer').length], [0, 0], 'perfil: nada en gym-fotos ni gym_foto_proponer');
    t.has(await gymCfgTxt(p), 'Todavía no tenés foto del gimnasio.', 'perfil: la del gimnasio sigue igual');
    await pg.close();
  }

  // ---- Al pedir sumarse: la foto del pedido (opcional) ----
  {
    const subidas = [], st = { gym: null };
    const pg = await entrarSocio(base, { gym: null, vp: M, handlers: storageGym(subidas), rpc: {
      mi_gimnasio: () => st.gym,
      gym_codigo_info: () => ({ tipo: 'gym', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' } }),
      gym_unirse: () => { st.gym = miGimnasioSocio({}, 'pendiente'); return { estado: 'pendiente', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' } }; },
      gym_foto_proponer: b => { Object.assign(st.gym.solicitud, { foto: 'pendiente', foto_pend_path: b.path }); return { foto: 'pendiente' }; },
    } }), p = pg.p;
    await p.click('#nav-config'); await wait(500);
    await p.fill('#joinCode', 'FUERZA22');
    await p.click('[data-auth="join"]'); await wait(900);
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1500);
    t.has(await hojaTxt(p), 'Tu foto para el gimnasio (opcional)', 'pedido: ofrece la foto');
    await elegir(p, '#gymSocioHost input[data-gys-foto]');
    t.ok(RUTA(F.A6).test(subidas[0] || ''), 'pedido: se sube a la carpeta de la ficha del pedido: ' + subidas[0]);
    t.eq(rpcs(pg.st, 'gym_foto_proponer'), [{ path: subidas[0] }], 'pedido: gym_foto_proponer');
    t.has(await hojaTxt(p), 'Foto enviada: esperando que el gimnasio la apruebe.', 'pedido: «Foto enviada…»');
    await captura(p, 'P3-foto-pedido');
    t.eq(pg.errs, [], 'pedido: sin errores');
    await pg.close();
  }
}
