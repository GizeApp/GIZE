// Gimnasios, etapa 1 (parte 3): Ajustes → Tu gimnasio (SPEC §3.2). El gimnasio, el profe («Sin profe»,
// «Coach externo»), «Compartir mis registros con la administración» (gym_compartir_admin, se ve al
// instante), «Qué ve el gimnasio» (el texto de la hoja), «Salir del gimnasio» con y sin «Seguir con mi
// profe como alumno propio» (gym_salir; el texto del servidor si no puede) y «Dejar a tu profe:
// seguís en Gimnasio Fuerza, sin profe».
import { wait } from './lib.mjs';
import { entrarSocio, miGimnasioSocio, hojaTxt, gymCfgTxt, rpcs, captura, sinScrollHorizontal, M, D } from './gym-comun.mjs';

const sw = p => p.evaluate(() => { const b = document.querySelector('#cfgGym [data-gys="compartir"]'); return b ? [b.getAttribute('aria-checked'), b.classList.contains('on')] : null; });
const ultimo = pg => pg.dialogs[pg.dialogs.length - 1];

async function abrir(base, o = {}){
  const st = { gym: o.gym === undefined ? miGimnasioSocio() : o.gym };
  const pg = await entrarSocio(base, Object.assign({}, o, { gym: st.gym, rpc: Object.assign({ mi_gimnasio: () => st.gym }, o.rpc ? o.rpc(st) : {}) }));
  await pg.p.click('#nav-config'); await wait(600);
  return Object.assign(pg, { g: st });
}

export default async function ({ base, t }){
  // ---- Lo que muestra (celular y compu, oscuro y claro) ----
  for (const vp of [M, D]) for (const tema of ['oscuro', 'claro']){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    const pg = await abrir(base, { vp, tema, touch: vp === M }), p = pg.p;
    const txt = await gymCfgTxt(p);
    t.has(txt.toLowerCase(), 'tu gimnasio', donde + ': «Tu gimnasio»');
    for (const x of ['Gimnasio Fuerza · Rosario', 'Profe Lucía Profe', 'Dejar a tu profe', 'Compartir mis registros con la administración', 'Sin tus pasos ni tus recorridos', 'Qué ve el gimnasio', 'Foto del gimnasio', 'Salir del gimnasio'])
      t.has(txt, x, donde + ': «' + x + '»');
    t.ok(!/cuota|pase|clases|\$|pagar/i.test(txt), donde + ': sin cuota, pase, clases ni pagos (etapas 2 y 3)');
    t.eq(await sw(p), ['false', false], donde + ': «Compartir» apagado');
    t.ok(!(await p.$('[data-action="cfg-unlink-coach"].cfg-ok')), donde + ': sin la fila «Tu coach · Vinculado» (el profe del gimnasio está en «Tu gimnasio»)');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': sin scroll de costado');
    await p.evaluate(() => document.getElementById('cfgGym').scrollIntoView({ block: 'start' })); await wait(300);
    await captura(p, 'P3-ajustes-' + (vp === M ? 'celular' : 'compu') + '-' + tema);
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ---- Compartir: prender y apagar, al instante ----
  {
    const pg = await abrir(base, { rpc: st => ({ gym_compartir_admin: b => { st.gym.ficha.share_admin = b.encendido; return { share_admin: b.encendido }; } }) }), p = pg.p;
    await p.click('#cfgGym [data-gys="compartir"]'); await wait(700);
    t.eq(rpcs(pg.st, 'gym_compartir_admin'), [{ encendido: true, compartir_version: '2026-10-borrador' }], 'prender: gym_compartir_admin(true) con la versión de «compartir»');
    t.eq(await sw(p), ['true', true], 'prender: el interruptor queda prendido al instante');
    await p.click('#cfgGym [data-gys="compartir"]'); await wait(700);
    t.eq(rpcs(pg.st, 'gym_compartir_admin')[1], { encendido: false, compartir_version: null }, 'apagar: gym_compartir_admin(false)');
    t.eq(await sw(p), ['false', false], 'apagar: queda apagado al instante');
    t.eq(pg.errs, [], 'compartir: sin errores');
    await pg.close();
  }
  {
    const pg = await abrir(base, { rpc: st => ({ gym_compartir_admin: () => ({ error: 'P0001', msg: 'Primero confirmá la hoja del gimnasio.' }) }) }), p = pg.p;
    await p.click('#cfgGym [data-gys="compartir"]'); await wait(700);
    t.eq([ultimo(pg), await sw(p)], ['Primero confirmá la hoja del gimnasio.', ['false', false]], 'si el servidor no deja: su texto, y el interruptor no cambia');
    await pg.close();
  }

  // ---- Qué ve el gimnasio ----
  {
    const pg = await abrir(base, { vp: M, gym: miGimnasioSocio({ share_admin: true }) }), p = pg.p;
    await p.click('#cfgGym [data-gys="ver-hoja"]'); await wait(600);
    const h = await hojaTxt(p);
    t.has(h, 'Qué ve Gimnasio Fuerza', '«Qué ve el gimnasio»: el título');
    t.has(h, 'Recepción ve tu nombre, tu foto y si tu cuota está al día.', 'el mismo texto de la hoja');
    t.has(h, 'Lo tenés prendido.', 'y si comparte o no');
    t.ok(!(await p.$('#gymSocioHost input[type="checkbox"]')), 'sin casilla (se cambia con el interruptor)');
    await captura(p, 'P3-que-ve-celular');
    await p.click('#gymSocioHost button[data-gys-h="cancel"]'); await wait(500);
    await pg.close();
  }

  // ---- Salir del gimnasio, siguiendo con el profe ----
  {
    const pg = await abrir(base, { vp: M, rpc: st => ({ gym_salir: b => { st.gym = null; return { ok: true, sigue_con_profe: b.seguir_con_profe }; } }) }), p = pg.p;
    await p.click('#cfgGym [data-gys="salir"]'); await wait(600);
    const h = await hojaTxt(p);
    t.has(h, '¿Salir de Gimnasio Fuerza?', 'salir: pregunta');
    t.has(h, 'el gimnasio deja de ver tus datos al instante', 'salir: qué pasa');
    t.has(h, 'Seguir con Lucía como alumno propio', 'salir: «Seguir con Lucía como alumno propio»');
    t.eq(await p.evaluate(() => document.querySelector('#gymSocioHost input[data-gys-in="seguir"]').checked), false, 'salir: sin marcar');
    await captura(p, 'P3-salir-celular');
    await p.click('#gymSocioHost .gys-check'); await wait(100);
    const perfiles = pg.calls.filter(c => /GET \/rest\/v1\/profiles/.test(c)).length;
    await p.click('#gymSocioHost [data-gys-h="salir-si"]'); await wait(1800);
    t.eq(rpcs(pg.st, 'gym_salir'), [{ seguir_con_profe: true }], 'gym_salir(true)');
    t.eq(ultimo(pg), 'Saliste de Gimnasio Fuerza. Seguís con Lucía como alumno propio.', 'avisa que sigue con su profe');
    t.eq(await gymCfgTxt(p), '', 'ya no aparece «Tu gimnasio»');
    t.ok(pg.calls.filter(c => /GET \/rest\/v1\/profiles/.test(c)).length > perfiles, 'se vuelve a leer el perfil');
    t.eq(pg.errs, [], 'salir: sin errores');
    await pg.close();
  }
  // Sin seguir con el profe.
  {
    const pg = await abrir(base, { rpc: st => ({ gym_salir: b => { st.gym = null; return { ok: true, sigue_con_profe: false }; } }) }), p = pg.p;
    await p.click('#cfgGym [data-gys="salir"]'); await wait(600);
    await p.click('#gymSocioHost [data-gys-h="salir-si"]'); await wait(1500);
    t.eq([rpcs(pg.st, 'gym_salir'), ultimo(pg)], [[{ seguir_con_profe: false }], 'Saliste de Gimnasio Fuerza.'], 'salir sin seguir: gym_salir(false) y «Saliste de Gimnasio Fuerza.»');
    await pg.close();
  }
  // El profe no tiene lugar: el texto del servidor, en la hoja.
  {
    const m = 'Tu profe no puede sumarte como alumno propio en este momento. Podés salir sin seguir con tu profe.';
    const pg = await abrir(base, { rpc: st => ({ gym_salir: () => ({ error: 'P0001', msg: m }) }) }), p = pg.p;
    await p.click('#cfgGym [data-gys="salir"]'); await wait(600);
    await p.click('#gymSocioHost .gys-check');
    await p.click('#gymSocioHost [data-gys-h="salir-si"]'); await wait(900);
    t.eq(await p.evaluate(() => (document.querySelector('#gymSocioHost .gys-err') || {}).textContent), m, 'sin lugar: el texto del servidor');
    t.has(await gymCfgTxt(p), 'Gimnasio Fuerza', 'y sigue en el gimnasio');
    await pg.close();
  }
  // Coach externo: sin la casilla; su coach sigue igual. «Tu coach» sigue arriba, como hoy.
  {
    const pg = await abrir(base, { gym: miGimnasioSocio({ profe: null, coach_externo: true }), perfil: { coach_id: '33333333-3333-3333-3333-333333333333' } }), p = pg.p;
    t.has(await gymCfgTxt(p), 'Coach Coach externo', 'coach externo: «Coach externo»');
    t.ok(!!(await p.$('[data-action="cfg-unlink-coach"].cfg-ok')), 'coach externo: la fila «Tu coach · Vinculado» de siempre');
    await p.click('#cfgGym [data-gys="salir"]'); await wait(600);
    const h = await hojaTxt(p);
    t.ok(!(await p.$('#gymSocioHost input[data-gys-in="seguir"]')), 'coach externo: sin «Seguir con mi profe»');
    t.has(h, 'Tu coach de afuera del gimnasio sigue igual.', 'coach externo: su coach sigue igual');
    await pg.close();
  }
  // Sin profe: «Sin profe», y la caja del código queda arriba.
  {
    const pg = await abrir(base, { gym: miGimnasioSocio({ profe: null }) }), p = pg.p;
    t.has(await gymCfgTxt(p), 'Profe Sin profe', 'sin profe: «Sin profe»');
    t.ok(!!(await p.$('#joinCode')), 'sin profe: la caja del código');
    await pg.close();
  }
  // Pausado.
  {
    const pg = await abrir(base, { gym: miGimnasioSocio({ status: 'pausado', paused_until: '2026-11-10' }) }), p = pg.p;
    t.has(await gymCfgTxt(p), 'Tu ficha está pausada hasta el 10/11.', 'pausado: hasta cuándo');
    await pg.close();
  }

  // ---- Dejar a tu profe: sigue en el gimnasio, sin profe ----
  {
    const pg = await abrir(base, { vp: M }), p = pg.p;
    pg.p.contestar = q => { pg.g.gym = miGimnasioSocio({ profe: null }); return true; };
    await p.click('#cfgGym [data-action="cfg-unlink-coach"]'); await wait(1500);
    const q = pg.preguntas[pg.preguntas.length - 1] || {};
    t.has(q.texto, '¿Dejar a tu profe? Seguís en Gimnasio Fuerza, sin profe.', 'dejar a tu profe: «Seguís en Gimnasio Fuerza, sin profe»');
    t.eq([q.ok, q.titulo], ['Dejar a tu profe', 'Dejar a tu profe'], 'dejar a tu profe: el botón y el título');
    t.ok(pg.calls.some(c => c === 'PATCH /rest/v1/profiles'), 'deja al profe como hoy (coach_id en null)');
    t.has(await gymCfgTxt(p), 'Profe Sin profe', 'y queda en el gimnasio, sin profe');
    t.eq(pg.errs, [], 'dejar a tu profe: sin errores');
    await pg.close();
  }
}
