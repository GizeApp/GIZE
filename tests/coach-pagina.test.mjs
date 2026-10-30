// «Mi página» del coach (app/screens/coach/pagina.js, con supabase/pagina-coach.sql): el link para
// Instagram, gize.ar/c/<alias>.
// - Web: en Clientes, «Creá tu página para Instagram ›» abre la sección; el campo trae la sugerencia
//   armada con su nombre (sin acentos ni mayúsculas); «Crear mi página» llama a coach_pagina_guardar;
//   el error de la base (P0001) queda abajo del campo. Con la página: la vista previa (nombre, código),
//   el link entero, «Ver mi página», Compartir (hoja del navegador), Copiar link, el QR (sin el texto
//   del link, se cierra con Escape y devuelve el foco), los interruptores (prendida, foto) y cambiar el
//   link (y cuando no se puede, desde qué día). En Clientes, «Tu página para Instagram» con Compartir.
//   Si un interruptor no se puede guardar, un solo aviso claro.
// - Android e iPhone (Capacitor simulado): la sección y Clientes sin gize.ar, plan, prueba, gratis,
//   WhatsApp ni $; sin «Ver mi página»; Compartir usa el plugin Share con https://gize.ar/c/<alias>; el
//   «Atrás» de Android cierra el QR.
// - Sin la sección (y sin pedirle nada a la base): el profe de un gimnasio sin alumnos propios, la
//   dueña en el panel del gimnasio. Con la base sin la función (PGRST202), tampoco, sin errores y
//   sin volver a preguntar.
import { newPage, wait, configCoach, CONFIG_COACH } from './lib.mjs';
import { entrar, entrarProfe, alumnosProfe, miGimnasio, DUENA, rpcs, hostTxt } from './gym-comun.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated', created_at: new Date(Date.now() - 60 * 864e5).toISOString() };
// Lo que no se puede ver en las apps (tests/coach-iphone.test.mjs y compras-apple-app.test.mjs).
const PROHIBIDO = /prueba|gratis|\bplan\b|pago|precio|tarjeta|mercado|suscrip|contrat|whatsapp|\$|gize\.ar/i;
const PAG = { alias: 'toro', activa: true, con_foto: true, pausada: false, cambia_desde: null, codigo: 'K7XM2PQA', visible: true };
const COPIA = `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copiado = t; } } });`;
const WEB_SHARE = COPIA + `navigator.share = async o => { window.__share = o; };`;
// Las apps: el plugin Share y el App (para el «Atrás» de Android).
const APP = plat => `(() => { window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plat}', Plugins: {
    Share: { share: async o => { window.__share = o; } },
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } }; })();` + COPIA;

// Coach con su lista y la base simulada de «Mi página». o.pag: lo que contesta coach_pagina_mia
// (null: no tiene; 'sin': la base no tiene la función).
async function coach(base, o = {}){
  const st = { pag: o.pag === undefined ? null : o.pag, guardar: [], mia: 0 };
  const pg = await newPage({ user: COACH, init: o.init || COPIA, viewport: o.vp || { width: 390, height: 844 }, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([{ id: 'c1', full_name: 'Alumno Uno', role: 'client' }]);
      const me = { id: COACH.id, role: 'coach', full_name: 'Martín Pérez' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/rpc/my_invite_code': (r, J) => J('K7XM2PQA'),
    '/rpc/coach_pagina_mia': (r, J) => { st.mia++; return st.pag === 'sin' ? J({ code: 'PGRST202', message: 'Could not find the function public.coach_pagina_mia', details: null, hint: null }, 404) : J(st.pag); },
    '/rpc/coach_pagina_guardar': (r, J, i) => {
      const b = JSON.parse(i.body || '{}'); st.guardar.push(b);
      if (st.falla) return J({ code: 'XX000', message: 'falló el servidor', details: null, hint: null }, 500);
      if (b.p_alias === 'admin') return J({ code: 'P0001', message: 'Ese link no se puede usar. Probá con otro.', details: null, hint: null }, 400);
      if (b.p_alias === 'ocupado') return J({ code: 'P0001', message: 'Ese link ya lo usa otro coach. Probá con otro.', details: null, hint: null }, 400);
      st.pag = Object.assign({}, st.pag || PAG, b.p_alias ? { alias: b.p_alias } : {}, b.p_activa != null ? { activa: b.p_activa, visible: b.p_activa } : {}, b.p_con_foto != null ? { con_foto: b.p_con_foto } : {});
      return J(st.pag);
    },
  } });
  await pg.p.goto(base + '/app/'); await wait(3000);
  const onb = await pg.p.$('[data-onb="done"]'); if (onb) { await onb.click(); await wait(400); }
  return Object.assign(pg, { st });
}
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText).join(' ').replace(/\s+/g, ' ').trim(), sel);
const secs = p => p.$$eval('#coachHost .cs-nav [data-coach="settings-sec"]', l => l.map(b => b.dataset.k));
const linea = p => txt(p, '#coachHost .co-invite .cpag-linea');

export default async function ({ base, t }){
  // ===== Web =====
  {
    const pg = await coach(base, { init: WEB_SHARE }), p = pg.p, st = pg.st;
    t.eq(st.mia, 1, 'web: se pregunta una vez por la página');
    t.eq(await linea(p), 'Creá tu página para Instagram ›', 'web: en Clientes, sin página, «Creá tu página para Instagram ›»');
    await p.click('#coachHost .cpag-linea [data-sec="pagina"]'); await wait(500);
    t.eq(await p.$eval('#coachHost .cs-nav-i.on', b => b.dataset.k).catch(() => ''), 'pagina', 'web: abre Configuración en «Mi página»');
    let s = await txt(p, CONFIG_COACH);
    t.ok(/nombre de tu link/i.test(s) && await p.$('label[for="cpagAlias"]'), 'web: el campo del nombre del link, con su etiqueta');
    t.has(s, 'Usá el mismo que tu Instagram', 'web: el consejo');
    t.has(s, 'gize.ar/c/', 'web: con «gize.ar/c/» adelante');
    t.has(s, 'Tu nombre, tu foto y tu código de invitación se van a ver en esa página: cualquiera con el link los puede ver. La podés apagar cuando quieras.', 'web: el aviso de lo que se publica');
    t.has(s, 'Subí una foto en Perfil para que se vea.', 'web: sin foto, cómo subirla');
    t.eq(await p.inputValue('#cpagAlias'), 'martin-perez', 'web: la sugerencia sale del nombre, sin acentos ni mayúsculas');
    // Un nombre que la base no acepta: el error queda abajo del campo.
    await p.fill('#cpagAlias', 'admin'); await p.click(CONFIG_COACH + ' [data-cpag="crear"]'); await wait(600);
    t.eq(st.guardar[0], { p_alias: 'admin', p_activa: true, p_con_foto: true }, 'web: «Crear mi página» llama a coach_pagina_guardar');
    t.eq(await txt(p, '#cpagErr'), 'Ese link no se puede usar. Probá con otro.', 'web: el error de la base, abajo del campo');
    t.eq(await p.evaluate(() => [document.getElementById('cpagAlias').getAttribute('aria-invalid'), document.activeElement && document.activeElement.id]), ['true', 'cpagAlias'], 'web: el campo marcado y con el foco');
    t.eq(pg.dialogs, [], 'web: el error no sale en un cartel');
    // Sin la foto y con mayúsculas y espacios: se guarda en minúsculas.
    await p.click(CONFIG_COACH + ' [data-cpag="foto-nueva"]'); await wait(200);
    t.eq(await p.inputValue('#cpagAlias'), 'admin', 'web: tocar el interruptor no borra lo escrito');
    await p.fill('#cpagAlias', '  Toro '); await p.press('#cpagAlias', 'Enter'); await wait(600);
    t.eq(st.guardar[1], { p_alias: 'toro', p_activa: true, p_con_foto: false }, 'web: crea en minúsculas, sin la foto (Enter también crea)');
    s = await txt(p, CONFIG_COACH);
    for (const f of ['Martín Pérez', 'Entrená conmigo en GIZE', 'K7XM2PQA', 'Tu link: gize.ar/c/toro', 'Compartir', 'Copiar link', 'Mostrar QR', 'Página activa', 'Mostrar mi foto'])
      t.has(s, f, 'web: con la página se ve ' + f);
    t.eq(await p.$eval(CONFIG_COACH + ' a[data-cpag="ver"]', a => [a.getAttribute('href'), a.target, a.innerText.trim()]).catch(() => null), ['https://gize.ar/c/toro', '_blank', 'Ver mi página'], 'web: «Ver mi página» abre la página en otra pestaña');
    t.eq(await p.evaluate(() => document.activeElement && document.activeElement.dataset.cpag), 'compartir', 'web: después de crearla, el foco en «Compartir»');
    // Compartir, copiar y el QR.
    await p.click(CONFIG_COACH + ' [data-cpag="compartir"]'); await wait(300);
    t.eq(await p.evaluate(() => window.__share), { title: 'Entrená conmigo en GIZE', text: 'Entrená conmigo en GIZE. Bajate la app y sumate con mi código K7XM2PQA:', url: 'https://gize.ar/c/toro' }, 'web: Compartir abre la hoja del navegador con el texto y el link');
    await p.click(CONFIG_COACH + ' [data-cpag="copiar"]'); await wait(300);
    t.eq(await p.evaluate(() => window.__copiado), 'https://gize.ar/c/toro', 'web: «Copiar link» copia el link');
    t.has(await txt(p, CONFIG_COACH + ' [data-cpag="copiar"]'), '¡Copiado!', 'web: y lo avisa en el botón');
    await p.click(CONFIG_COACH + ' [data-cpag="qr"]'); await wait(1500);
    const qr = await p.evaluate(() => { const h = document.getElementById('coachPagHost'); return { svg: !!h.querySelector('.cpag-qr svg[role="img"]'), txt: h.innerText, foco: document.activeElement && document.activeElement.className }; });
    t.ok(qr.svg, 'web: «Mostrar QR» dibuja el QR');
    t.ok(!/gize\.ar|toro/.test(qr.txt) && /K7XM2PQA/.test(qr.txt), 'web: el QR sin el texto del link, con el código: ' + qr.txt);
    t.eq(qr.foco, 'cp-x', 'web: el foco en «Cerrar»');
    await p.keyboard.press('Escape'); await wait(300);
    t.eq(await p.evaluate(() => [document.getElementById('coachPagHost').innerHTML, document.activeElement && document.activeElement.dataset.cpag]), ['', 'qr'], 'web: Escape cierra el QR y el foco vuelve a «Mostrar QR»');
    // Los interruptores.
    await p.click(CONFIG_COACH + ' [data-cpag="activa"]'); await wait(500);
    t.eq(st.guardar[2], { p_alias: null, p_activa: false, p_con_foto: null }, 'web: «Página activa» la apaga');
    s = await txt(p, CONFIG_COACH);
    t.has(s, 'Tu página está apagada: quien abra el link ve que no está disponible.', 'web: apagada, lo dice');
    t.ok(!(await p.$(CONFIG_COACH + ' [data-cpag="compartir"]')), 'web: apagada, sin Compartir');
    t.eq(await p.$eval(CONFIG_COACH + ' [data-cpag="activa"]', b => [b.getAttribute('aria-checked'), b === document.activeElement]), ['false', true], 'web: el interruptor queda apagado y con el foco');
    await p.click(CONFIG_COACH + ' [data-cpag="activa"]'); await wait(500);
    await p.click(CONFIG_COACH + ' [data-cpag="foto"]'); await wait(500);
    t.eq(st.guardar.slice(3), [{ p_alias: null, p_activa: true, p_con_foto: null }, { p_alias: null, p_activa: null, p_con_foto: true }], 'web: la prende de nuevo y muestra la foto');
    // Cambiar el link: un error de la base, el cambio, y después hasta cuándo no se puede.
    t.has(await txt(p, CONFIG_COACH), 'Durante las primeras 24 horas lo podés cambiar las veces que quieras. Después, una vez por semana, y tu link anterior sigue llevando a tu página por 90 días.', 'web: la regla para cambiar el link');
    await p.click(CONFIG_COACH + ' [data-cpag="cambiar"]'); await wait(300);
    t.eq(await p.inputValue('#cpagAlias'), 'toro', 'web: «Cambiar el link» trae el actual');
    await p.fill('#cpagAlias', 'ocupado'); await p.click(CONFIG_COACH + ' [data-cpag="guardar"]'); await wait(500);
    t.eq(await txt(p, '#cpagErr'), 'Ese link ya lo usa otro coach. Probá con otro.', 'web: link ocupado, abajo del campo');
    await p.fill('#cpagAlias', 'toro.fit'); await p.click(CONFIG_COACH + ' [data-cpag="guardar"]'); await wait(800);
    t.eq(st.guardar[st.guardar.length - 1], { p_alias: 'toro.fit', p_activa: null, p_con_foto: null }, 'web: guarda el link nuevo');
    t.has(pg.dialogs.join(' | '), 'Listo: tu link nuevo es toro.fit. Acordate de cambiarlo en tu Instagram.', 'web: avisa que lo cambie en Instagram');
    t.has(await txt(p, CONFIG_COACH), 'Tu link: gize.ar/c/toro.fit', 'web: se ve el link nuevo');
    // En Clientes: la línea con Compartir.
    await p.click('[data-coach="settings-back"]'); await wait(500);
    t.eq(await linea(p), 'Tu página para Instagram · Compartir', 'web: en Clientes, «Tu página para Instagram» con Compartir');
    await p.evaluate(() => { window.__share = null; });
    await p.click('#coachHost .cpag-linea [data-cpag="compartir"]'); await wait(300);
    t.eq(await p.evaluate(() => window.__share && window.__share.url), 'https://gize.ar/c/toro.fit', 'web: Compartir desde Clientes');
    t.eq(pg.errs, [], 'web: sin errores');
    await pg.close();
  }
  // Ya lo cambió hace poco: la base dice desde cuándo se puede volver a cambiar (hora de Argentina).
  {
    const pg = await coach(base, { pag: Object.assign({}, PAG, { cambia_desde: '2026-11-06T02:00:00Z' }) }), p = pg.p;
    await configCoach(p, 'pagina');
    const s = await txt(p, CONFIG_COACH);
    t.has(s, 'Ya cambiaste tu link hace poco: lo vas a poder cambiar desde el 05/11.', 'cambiado hace poco: desde cuándo lo puede cambiar, con la fecha de Argentina');
    t.ok(!(await p.$(CONFIG_COACH + ' [data-cpag="cambiar"]')), 'cambiado hace poco: sin el botón para cambiarlo');
    t.eq(pg.errs, [], 'cambiado hace poco: sin errores');
    await pg.close();
  }
  // Pausada por GIZE: lo dice en Clientes y en la sección, sin Compartir.
  {
    const pg = await coach(base, { pag: Object.assign({}, PAG, { pausada: true, visible: false }) }), p = pg.p;
    t.eq(await linea(p), 'GIZE pausó tu página. Escribinos si querés saber por qué.', 'pausada: en Clientes');
    await configCoach(p, 'pagina');
    t.has(await txt(p, CONFIG_COACH), 'GIZE pausó tu página. Escribinos si querés saber por qué.', 'pausada: en la sección');
    t.ok(!(await p.$(CONFIG_COACH + ' [data-cpag="compartir"]')), 'pausada: sin Compartir');
    t.eq(pg.errs, [], 'pausada: sin errores');
    await pg.close();
  }
  // Si un interruptor no se puede guardar (sin señal, la base caída): un solo aviso, sin «No se pudo
  // guardar: No se pudo guardar…», y el interruptor queda como estaba.
  {
    const pg = await coach(base, { pag: PAG }), p = pg.p;
    await configCoach(p, 'pagina');
    pg.st.falla = true;
    await p.click(CONFIG_COACH + ' [data-cpag="foto"]'); await wait(600);
    t.eq(pg.dialogs, ['No se pudo guardar. Revisá tu conexión y probá de nuevo.'], 'falla al guardar: un solo aviso, claro');
    t.eq(await p.$eval(CONFIG_COACH + ' [data-cpag="foto"]', b => [b.getAttribute('aria-checked'), b.disabled]), ['true', false], 'falla al guardar: el interruptor queda como estaba y se puede volver a tocar');
    t.eq(pg.errs, [], 'falla al guardar: sin errores');
    await pg.close();
  }
  // Con el cupo lleno, la tarjeta del código ya dice que nadie más se puede sumar: sin la línea.
  {
    const pg = await newPage({ user: COACH, init: COPIA, handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J(Array.from({ length: 10 }, (_, n) => ({ id: 'c' + n, full_name: 'Alumno ' + n, role: 'client' })));
        const me = { id: COACH.id, role: 'coach', full_name: 'Martín Pérez' }; return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'p10', max_clients: 10, trial_ends_at: '2020-01-01T00:00:00Z', paid_until: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/rpc/coach_pagina_mia': (r, J) => J(PAG) } });
    await pg.p.goto(base + '/app/'); await wait(3000);
    t.has(await txt(pg.p, '#coachHost .co-invite'), 'Llegaste al máximo de tu plan', 'cupo lleno: la tarjeta del cupo');
    t.eq(await linea(pg.p), '', 'cupo lleno: sin la línea de la página');
    await pg.close();
  }

  // ===== Android e iPhone =====
  for (const plat of ['android', 'ios']){
    // Sin página: crearla, sin gize.ar.
    let pg = await coach(base, { init: APP(plat) }), p = pg.p;
    let c = await txt(p, '#coachHost');
    t.has(c, 'Creá tu página para Instagram', plat + ': en Clientes, «Creá tu página»');
    t.ok(!PROHIBIDO.test(c), plat + ': Clientes sin plan, precios ni gize.ar: ' + c.match(PROHIBIDO));
    await configCoach(p, 'pagina');
    let s = await txt(p, CONFIG_COACH);
    t.has(s, 'Crear mi página', plat + ': se puede crear');
    t.ok(!PROHIBIDO.test(s), plat + ': crear sin gize.ar, plan, prueba ni WhatsApp: ' + s.match(PROHIBIDO));
    t.ok(!(await p.$(CONFIG_COACH + ' .cpag-pre')), plat + ': sin «gize.ar/c/» adelante del campo');
    await pg.close();
    // Con página.
    pg = await coach(base, { init: APP(plat), pag: PAG }); p = pg.p;
    c = await txt(p, '#coachHost');
    t.has(c, 'Tu página para Instagram', plat + ': en Clientes, la línea de la página');
    t.ok(!PROHIBIDO.test(c), plat + ': Clientes sin gize.ar: ' + c.match(PROHIBIDO));
    await configCoach(p, 'pagina');
    s = await txt(p, CONFIG_COACH);
    t.has(s, 'Tu link: toro', plat + ': solo el nombre del link');
    t.ok(!PROHIBIDO.test(s), plat + ': la sección sin gize.ar, plan, prueba, gratis, WhatsApp ni $: ' + s.match(PROHIBIDO));
    t.ok(!(await p.$(CONFIG_COACH + ' [data-cpag="ver"]')) && !/Ver mi página/.test(s), plat + ': sin «Ver mi página» (la página tiene las dos tiendas)');
    await p.click(CONFIG_COACH + ' [data-cpag="compartir"]'); await wait(300);
    t.eq(await p.evaluate(() => window.__share), { title: 'Entrená conmigo en GIZE', text: 'Entrená conmigo en GIZE. Bajate la app y sumate con mi código K7XM2PQA:', url: 'https://gize.ar/c/toro', dialogTitle: 'Compartir tu página' }, plat + ': Compartir usa la hoja del sistema (plugin Share) con el link');
    t.eq(pg.dialogs, [], plat + ': sin carteles (ni el link a la vista)');
    await p.click(CONFIG_COACH + ' [data-cpag="qr"]'); await wait(1500);
    const q = await p.evaluate(() => { const h = document.getElementById('coachPagHost'); return { svg: !!h.querySelector('svg'), txt: h.innerText }; });
    t.ok(q.svg && !PROHIBIDO.test(q.txt), plat + ': el QR, sin el link a la vista: ' + q.txt);
    if (plat === 'android'){
      await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(400);
      t.eq(await p.evaluate(() => [document.getElementById('coachPagHost').innerHTML, !!document.querySelector('#coachHost .cs-layout'), window.__min]), ['', true, 0], 'android: «Atrás» cierra el QR y se queda en «Mi página»');
    }
    t.eq(pg.errs, [], plat + ': sin errores');
    await pg.close();
  }

  // ===== Sin la sección =====
  // La base todavía no tiene la función: ni la sección ni la línea, y sin errores.
  {
    const pg = await coach(base, { pag: 'sin' }), p = pg.p;
    t.eq(await linea(p), '', 'base sin la función: sin la línea en Clientes');
    t.has(await txt(p, '#coachHost .co-invite'), 'K7XM2PQA', 'base sin la función: el código sigue como siempre');
    await configCoach(p);
    t.ok(!(await secs(p)).includes('pagina'), 'base sin la función: Configuración sin «Mi página»');
    // Queda anotado que no está (false), no como una falla de red que se reintenta a los 15 s: ni
    // un minuto después se vuelve a preguntar.
    const sin = await p.evaluate(async () => {
      const m = await import('/app/screens/coach/pagina.js'), { CoachState } = await import('/app/screens/coach/state.js');
      const ahora = Date.now; Date.now = () => ahora() + 60000;
      try { m.cargarPagina(); } finally { Date.now = ahora; }
      return CoachState.pagina;
    });
    await wait(300);
    t.eq(sin, false, 'base sin la función: queda anotado que no está');
    t.eq(pg.st.mia, 1, 'base sin la función: no se vuelve a preguntar');
    t.eq(pg.errs, [], 'base sin la función: sin errores');
    await pg.close();
  }
  // El profe de un gimnasio sin alumnos propios ni plan propio.
  {
    const pg = await entrarProfe(base, { billing: null, alumnos: alumnosProfe(false), rpc: { coach_pagina_mia: () => PAG } });
    await configCoach(pg.p);
    const k = await secs(pg.p);
    t.ok(k.length > 3 && !k.includes('pagina'), 'profe sin alumnos propios: sin «Mi página»: ' + k.join(', '));
    t.ok(!/Tu página para Instagram|Creá tu página/.test(await hostTxt(pg.p)), 'profe sin alumnos propios: sin la línea');
    t.eq(rpcs(pg.st, 'coach_pagina_mia').length, 0, 'profe sin alumnos propios: no se le pregunta a la base');
    t.eq(pg.errs, [], 'profe sin alumnos propios: sin errores');
    await pg.close();
  }
  // El profe con un alumno propio sí la tiene.
  {
    const pg = await entrarProfe(base, { rpc: { coach_pagina_mia: () => PAG } });
    if (await pg.p.$('[data-coach="view-clients"]')) { await pg.p.click('[data-coach="view-clients"]'); await wait(600); }
    t.has(await hostTxt(pg.p), 'Tu página para Instagram', 'profe con alumno propio: la línea debajo de su código personal');
    await configCoach(pg.p);
    t.ok((await secs(pg.p)).includes('pagina'), 'profe con alumno propio: con «Mi página»');
    await pg.close();
  }
  // La dueña, en el panel del gimnasio («Mi cuenta»).
  {
    const pg = await entrar(base, DUENA, { gym: miGimnasio('owner'), rpc: { coach_pagina_mia: () => PAG } }), p = pg.p;
    await p.click('#coachHost [data-coach="open-settings"][data-gy-coach]'); await wait(1000);
    const k = await secs(p);
    t.ok(k.includes('perfil') && !k.includes('pagina'), 'dueña del gimnasio: «Mi cuenta» sin «Mi página»: ' + k.join(', '));
    t.eq(rpcs(pg.st, 'coach_pagina_mia').length, 0, 'dueña del gimnasio: no se le pregunta a la base');
    t.eq(pg.errs, [], 'dueña del gimnasio: sin errores');
    await pg.close();
  }
}
