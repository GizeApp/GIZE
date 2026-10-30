// La invitación de un coach por su link (app/core/invitacion-coach.js y app/ui/invitacion-coach.js). La
// página del coach (gize.ar/c/<alias>) abre la app con #coach=<alias>:
// - Sin sesión: «Crear cuenta» con el mensaje de para qué entrar (sin nada que venga en el link); el #
//   sale de la dirección y la invitación queda guardada (gize_coach_pend). Un link con un alias que no
//   puede ser no guarda nada.
// - Alumno sin coach: la hoja «Entrená con …» (el nombre como texto, la foto, qué va a ver el coach);
//   «Sumarme» llama a join_coach con el código de la página, relee el perfil y deja la app de abajo con
//   el coach (la marca y el chat); «Ahora no» no llama nada. Se cierre como se cierre, la invitación se
//   borra.
// - Nunca se cambia de coach solo: con el mismo coach o con otro (también el coach de afuera de un socio
//   del gimnasio), avisa sin [Sumarme]. El socio con un profe del gimnasio no es «otro coach»: le contesta
//   join_coach (que lo manda a dejar a su profe). El coach que abre su link o el de otro, y la página que
//   ya no se ve (la base sin la función o con las páginas apagadas sin el permiso de coach_pagina_ver),
//   también avisan: eso no es un problema de señal.
// - Sin señal, «Reintentar». Errores de join_coach en la app de Android: el texto sin el plan, y la hoja
//   sigue abierta para volver a probar; mientras se suma, el «Atrás» no la cierra; después sí.
// - Cuenta nueva: primero la hoja y, al cerrarla, la bienvenida, que ya no pide el código.
// - Una invitación de más de 7 días se ignora. Al cerrar sesión se borra; si entra otra cuenta en el
//   dispositivo, la de un link recién abierto queda (es de quien entra) y una vieja se borra.
// - Con la app abierta, abrir el link en la misma pestaña muestra la hoja ahí mismo.
// - La política de privacidad dice que siempre se pregunta antes y qué queda en el dispositivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, ALUMNO, onbPaso } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH_ID = '33333333-3333-3333-3333-333333333333';
const OTRO_COACH = '44444444-4444-4444-4444-444444444444';
const FOTO = COACH_ID + '/1700000000000.jpg';
const PAG = { alias: 'toro', nombre: 'Toro <b>Pérez</b>', foto: FOTO, codigo: 'K7XM2PQA', es_mi_coach: false, soy_yo: false };
const COACH = { id: COACH_ID, email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const NUEVO = () => Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
// Lo que no se puede ver en las apps (tests/coach-iphone.test.mjs y tests/coach-pagina.test.mjs).
const PROHIBIDO = /prueba|gratis|\bplan\b|pago|precio|tarjeta|mercado|suscrip|contrat|whatsapp|\$|gize\.ar/i;
const ANDROID = `(() => { window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } }; })();`;
// Una invitación ya guardada (antes de cargar la app, una sola vez), hace «hace» ms.
const GUARDADA = hace => `(() => { if (sessionStorage.getItem('inv')) return; sessionStorage.setItem('inv', '1');
  localStorage.setItem('gize_coach_pend', JSON.stringify({ a: 'toro', t: Date.now() - ${hace} })); })();`;
const P0001 = m => ({ error: { code: 'P0001', message: m, details: null, hint: null } });

// Entra con la sesión iniciada. o.ver: lo que contesta coach_pagina_ver (un valor, 'sin' = la base no
// tiene la función, 'red' = sin señal, o una función que decide); o.join: lo que contesta join_coach
// (true, false, P0001(…) o una promesa); o.gym: lo que contesta mi_gimnasio (sin gimnasio, null);
// o.rol, o.coach (coach_id al entrar), o.user, o.init, o.hash, o.state.
async function entrar(base, o = {}){
  const st = { coach: o.coach || null, ver: [], joins: [], perfiles: 0, firmas: 0 };
  const rol = o.rol || 'client', yo = (o.user || ALUMNO).id;
  const pg = await newPage({ user: o.user || ALUMNO, init: o.init, state: o.state, handlers: {
    '/profiles': (r, J, i) => {
      if (i.m !== 'GET') return undefined;
      if (/coach_id=eq/.test(i.url.search)) return J([]);
      st.perfiles++;
      const me = { id: yo, role: rol, full_name: rol === 'coach' ? 'Toro Pérez' : 'Prueba', coach_id: rol === 'coach' ? null : st.coach };
      return J(i.one ? me : [me]);
    },
    '/coach_billing': (r, J, i) => { const b = { coach_id: yo, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/rpc/coach_pagina_ver': (r, J, i) => {
      st.ver.push(JSON.parse(i.body || '{}'));
      const v = typeof o.ver === 'function' ? o.ver(st.ver.length) : o.ver === undefined ? PAG : o.ver;
      if (v === 'red') return r.abort();
      if (v === 'sin') return J({ code: 'PGRST202', message: 'Could not find the function public.coach_pagina_ver', details: null, hint: null }, 404);
      // Las páginas apagadas en la base: sin el permiso de coach_pagina_ver (supabase/pagina-coach.sql).
      if (v === 'apagadas') return J({ code: '42501', message: 'permission denied for function coach_pagina_ver', details: null, hint: null }, 403);
      return J(v);
    },
    '/rpc/join_coach': (r, J, i) => {
      st.joins.push(JSON.parse(i.body || '{}'));
      const v = typeof o.join === 'function' ? o.join(st.joins.length) : o.join === undefined ? true : o.join;
      return Promise.resolve(v).then(x => { if (x === true) st.coach = COACH_ID; return x && x.error ? J(x.error, 400) : J(x); });
    },
    '/rpc/my_coach_name': (r, J) => J(st.coach === COACH_ID ? 'Toro Pérez' : st.coach ? 'Otro Coach' : null),
    '/rpc/mi_gimnasio': (r, J) => J(o.gym || null),
    '/object/sign/avatars': (r, J, i) => { st.firmas++; return J(JSON.parse(i.body).paths.map(x => ({ path: x, signedURL: '/object/sign/avatars/' + x + '?token=t', error: null }))); },
  } });
  await pg.p.goto(base + '/app/' + (o.hash === undefined ? '#coach=toro' : o.hash));
  await wait(o.espera || 3000);
  return Object.assign(pg, { st });
}
const hoja = p => text(p, '#coachInvHost .cinv-sheet');
const abierta = p => p.isVisible('#coachInvHost .cinv-sheet:not(.closing)');
const pend = p => p.evaluate(() => JSON.parse(localStorage.getItem('gize_coach_pend') || 'null'));
const tocar = async (p, a) => { await p.click('#coachInvHost [data-cinv="' + a + '"]'); await wait(700); };
// La marca del coach que se ve arriba de la app (applyBrand), no solo la guardada.
const marca = p => p.evaluate(() => { const g = document.getElementById('brandTag'), n = document.getElementById('brandName');
  return g && n && g.style.display !== 'none' ? n.textContent : ''; });
// El botón del chat con el coach de la app de abajo (renderApp lo muestra solo con coach).
const chat = p => p.evaluate(() => { const b = document.getElementById('chatBtn'); return !!b && !b.hidden; });

export default async function ({ base, t }){
  // ---- Sin sesión: «Crear cuenta» con el mensaje; el link sale de la dirección y queda guardado ----
  {
    const pg = await newPage(), p = pg.p;
    await p.goto(base + '/app/#coach=Toro'); await wait(1800);
    const r = await p.evaluate(() => ({ txt: document.getElementById('authHost').innerText, rol: (document.getElementById('auRole') || {}).value || '', hash: location.hash }));
    t.has(r.txt, 'Te invitaron a entrenar en GIZE con tu coach. Creá tu cuenta o ingresá con la tuya para sumarte.', 'sin sesión: para qué hay que entrar');
    t.eq(r.rol, 'client', 'sin sesión: abre «Crear cuenta» (de alumno)');
    t.ok(!/toro/i.test(r.txt), 'sin sesión: no muestra nada que venga en el link');
    t.eq(r.hash, '', 'sin sesión: el # sale de la dirección');
    const g = await pend(p);
    t.ok(g && g.a === 'toro' && Math.abs(Date.now() - g.t) < 60000, 'sin sesión: la invitación queda guardada, en minúsculas: ' + JSON.stringify(g));
    t.eq(pg.errs, [], 'sin sesión: errores de la página');
    await pg.close();
    const pm = await newPage(), q = pm.p;
    await q.goto(base + '/app/#coach=%3Cb%3Ehola'); await wait(1800);
    const m = await q.evaluate(() => ({ txt: document.getElementById('authHost').innerText, up: !!document.getElementById('auRole'), hash: location.hash, inv: localStorage.getItem('gize_coach_pend') }));
    t.eq([m.up, m.hash, m.inv], [false, '', null], 'un alias que no puede ser: no se guarda y el ingreso es el de siempre');
    t.ok(!/Te invitaron/.test(m.txt), 'un alias que no puede ser: sin el mensaje de la invitación');
    await pm.close();
  }

  // ---- Alumno sin coach: la hoja, «Sumarme» y la marca del coach ----
  {
    const pg = await entrar(base, { join: () => new Promise(r => setTimeout(() => r(true), 900)) }), p = pg.p;
    t.ok(await abierta(p), 'alumno: aparece la hoja');
    t.eq(pg.st.ver, [{ p_alias: 'toro' }], 'alumno: pregunta por ese link, una vez');
    t.has(await hoja(p), 'Entrená con Toro <b>Pérez</b>', 'alumno: el nombre del coach, como texto');
    t.eq(await p.$$eval('#coachInvHost b', l => l.length), 0, 'alumno: un nombre con <b> no crea elementos');
    t.has(await hoja(p), 'Al sumarte, Toro va a ver tus entrenos, tu comida y tu progreso, y te va a armar la rutina. Lo podés dejar cuando quieras en Ajustes.', 'alumno: qué va a ver el coach');
    t.ok(await p.$eval('#coachInvHost .cinv-foto img', i => i.getAttribute('src').includes('/object/sign/avatars/' + '33333333-3333-3333-3333-333333333333/1700000000000.jpg')).catch(() => false), 'alumno: la foto del coach, con su link firmado');
    t.eq(await p.$eval('#coachInvHost .cinv-sheet', c => [c.getAttribute('role'), c.getAttribute('aria-modal'), !!document.getElementById(c.getAttribute('aria-labelledby'))]), ['dialog', 'true', true], 'alumno: es un diálogo con título');
    t.ok(await p.evaluate(() => !!document.activeElement.closest('#coachInvHost')), 'alumno: el foco está en la hoja');
    for (let i = 0; i < 3; i++) await p.keyboard.press('Tab');
    t.ok(await p.evaluate(() => !!document.activeElement.closest('#coachInvHost')), 'alumno: Tab no se va de la hoja');
    t.eq(pg.st.joins, [], 'alumno: no se suma sin tocar');
    t.ok(!(await chat(p)), 'alumno: sin coach, la app de abajo no tiene el chat');
    await p.click('#coachInvHost [data-cinv="si"]'); await wait(300);
    t.eq(await p.$$eval('#coachInvHost [data-cinv]', l => l.filter(b => b.tagName === 'BUTTON').map(b => [b.textContent, b.disabled])), [['Ahora no', true], ['Sumando…', true]], 'alumno: mientras se suma, nada más anda');
    await p.keyboard.press('Escape'); await wait(200);
    t.ok(await abierta(p), 'alumno: Escape no la cierra mientras se suma');
    await wait(1500);
    t.eq(pg.st.joins, [{ code: 'K7XM2PQA' }], 'alumno: join_coach con el código de la página');
    t.ok(pg.st.perfiles >= 2, 'alumno: relee el perfil');
    t.has(await hoja(p), '¡Listo! Ya entrenás con Toro.', 'alumno: «¡Listo!»');
    t.eq(await marca(p), 'Toro Pérez', 'alumno: con la marca de su coach');
    t.ok(await chat(p), 'alumno: la app de abajo ya queda con su coach (el chat)');
    t.ok(!!(await pend(p)), 'alumno: la invitación sigue hasta cerrar la hoja');
    await tocar(p, 'no');
    t.ok(!(await abierta(p)), 'alumno: «Seguir» cierra la hoja');
    t.eq(await pend(p), null, 'alumno: y borra la invitación');
    t.eq(pg.errs, [], 'alumno: errores de la página');
    await pg.close();
  }

  // ---- «Ahora no»: nada; con la app abierta, el link en la misma pestaña abre la hoja ----
  {
    const pg = await entrar(base, { hash: '' }), p = pg.p;
    t.ok(!(await abierta(p)), 'sin invitación: no hay hoja');
    t.eq(pg.st.ver, [], 'sin invitación: no pregunta nada');
    await p.evaluate(() => { location.hash = '#coach=toro'; }); await wait(1500);
    t.ok(await abierta(p), 'app abierta: el link abre la hoja ahí mismo');
    t.eq(await p.evaluate(() => location.hash), '', 'app abierta: el # sale de la dirección');
    await tocar(p, 'no');
    t.ok(!(await abierta(p)), '«Ahora no» cierra la hoja');
    t.eq([pg.st.joins, await pend(p)], [[], null], '«Ahora no»: no se suma y borra la invitación');
    t.eq(pg.errs, [], '«Ahora no»: errores de la página');
    await pg.close();
  }

  // ---- Ya tiene coach: nunca cambia solo ----
  for (const [que, o, frase] of [
    ['el mismo coach', { coach: COACH_ID, ver: Object.assign({}, PAG, { es_mi_coach: true }) }, 'Ya entrenás con Toro'],
    ['otro coach', { coach: OTRO_COACH }, 'Ya entrenás con otro coach Para sumarte con Toro, primero desvinculate en Ajustes → Tu coach.'],
    ['coach, su propio link', { rol: 'coach', user: COACH, ver: Object.assign({}, PAG, { soy_yo: true }) }, 'Este es tu link Compartilo para que tus alumnos se sumen.'],
    ['coach, el link de otro', { rol: 'coach', user: COACH }, 'Este link es para alumnos'],
    ['la página ya no se ve', { ver: null }, 'Esta invitación ya no está disponible Pedile a tu coach su código para sumarte en GIZE.'],
    ['la base sin la función', { ver: 'sin' }, 'Esta invitación ya no está disponible'],
    ['las páginas apagadas en la base', { ver: 'apagadas' }, 'Esta invitación ya no está disponible Pedile a tu coach su código para sumarte en GIZE.'],
  ]){
    const pg = await entrar(base, o), p = pg.p;
    t.has(await hoja(p), frase, que + ': avisa');
    t.ok(!(await p.$('#coachInvHost [data-cinv="si"]')), que + ': sin [Sumarme]');
    await p.keyboard.press('Escape'); await wait(600);
    t.ok(!(await abierta(p)), que + ': Escape la cierra');
    t.eq([pg.st.joins, await pend(p)], [[], null], que + ': no se suma y borra la invitación');
    t.eq(pg.errs, [], que + ': errores de la página');
    await pg.close();
  }

  // ---- Socio de un gimnasio: con un profe del gimnasio no es «otro coach» (le contesta join_coach,
  //      que lo manda a dejar a su profe); con un coach de afuera, sí ----
  {
    const PROFE = '66666666-6666-6666-6666-666666666666';
    const socio = ficha => ({ gym: { id: '77777777-7777-7777-7777-777777777777', name: 'Gimnasio Fuerza', city: 'Rosario' }, rol: 'socio', puede_crear: false,
      ficha: Object.assign({ id: '88888888-8888-8888-8888-888888888888', status: 'activo', paused_until: null, terms_at: '2026-10-01T12:00:00Z', terms_version: '2026-10-borrador',
        share_admin: false, profe: null, coach_externo: false, foto: 'falta', foto_rechazo: null, foto_path: null, foto_pend_path: null, origen: 'codigo' }, ficha) });
    const MSG = 'Ya tenés profe en Gimnasio Fuerza. Para cambiar, primero dejá a tu profe en Ajustes → Tu gimnasio.';
    const pg = await entrar(base, { coach: PROFE, gym: socio({ profe: { id: PROFE, name: 'Lucía Profe' } }), join: P0001(MSG) }), p = pg.p;
    t.has(await hoja(p), 'Entrená con Toro', 'socio con profe del gimnasio: no le dice «otro coach»');
    await tocar(p, 'si');
    t.eq(pg.st.joins, [{ code: 'K7XM2PQA' }], 'socio con profe del gimnasio: decide join_coach');
    t.eq(await text(p, '#coachInvHost [role="alert"]'), MSG, 'socio con profe del gimnasio: el mensaje de join_coach, tal cual');
    t.eq(pg.st.coach, PROFE, 'socio con profe del gimnasio: sigue con su profe');
    t.eq(pg.errs, [], 'socio con profe del gimnasio: errores de la página');
    await pg.close();
    const px = await entrar(base, { coach: OTRO_COACH, gym: socio({ coach_externo: true }) }), q = px.p;
    t.has(await hoja(q), 'Ya entrenás con otro coach Para sumarte con Toro, primero desvinculate en Ajustes → Tu coach.', 'socio con un coach de afuera: avisa');
    t.ok(!(await q.$('#coachInvHost [data-cinv="si"]')), 'socio con un coach de afuera: sin [Sumarme]');
    t.eq(px.errs, [], 'socio con un coach de afuera: errores de la página');
    await px.close();
  }

  // ---- Sin señal: «Reintentar» ----
  {
    const pg = await entrar(base, { ver: n => n === 1 ? 'red' : PAG }), p = pg.p;
    t.has(await hoja(p), 'No se pudo: revisá tu conexión y probá de nuevo.', 'sin señal: avisa');
    await tocar(p, 'reintentar'); await wait(300);
    t.has(await hoja(p), 'Entrená con Toro', 'sin señal: «Reintentar» vuelve a preguntar');
    t.eq(pg.st.ver.length, 2, 'sin señal: dos preguntas');
    await pg.close();
  }

  // ---- App de Android: los errores de join_coach sin el plan; el «Atrás» ----
  {
    const pg = await entrar(base, { init: ANDROID, join: n => n === 1
      ? new Promise(r => setTimeout(() => r(P0001('Tu coach tiene el plan de GIZE vencido: por ahora no puede sumar alumnos. Avisale y volvé a intentar.')), 900))
      : P0001('Tu coach llegó al máximo de alumnos: por ahora no puede sumar más. Avisale y volvé a intentar.') }), p = pg.p;
    t.ok(!PROHIBIDO.test(await hoja(p)), 'Android: la hoja no habla de planes ni de gize.ar: ' + await hoja(p));
    const atras = () => p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false })));
    await p.click('#coachInvHost [data-cinv="si"]'); await wait(300);
    await atras(); await wait(300);
    t.ok(await abierta(p), 'Android: mientras se suma, el «Atrás» no la cierra');
    t.eq(await p.evaluate(() => window.__min), 0, 'Android: ni saca de la app');
    await wait(1200);
    const err = await text(p, '#coachInvHost [role="alert"]');
    t.eq(err, 'Tu coach no puede sumar alumnos en este momento. Avisale y volvé a intentar.', 'Android: la cuenta del coach no activa, sin hablar del plan');
    t.ok(!PROHIBIDO.test(await hoja(p)), 'Android: tampoco en el resto de la hoja');
    t.eq(await p.$eval('#coachInvHost [data-cinv="si"]', b => b.disabled), false, 'Android: se puede volver a probar');
    await tocar(p, 'si');
    t.eq(await text(p, '#coachInvHost [role="alert"]'), 'Tu coach llegó al máximo de alumnos: por ahora no puede sumar más. Avisale y volvé a intentar.', 'Android: el cupo lleno, tal cual');
    await atras(); await wait(600);
    t.ok(!(await abierta(p)), 'Android: el «Atrás» cierra la hoja');
    t.eq([await p.evaluate(() => window.__min), await pend(p)], [0, null], 'Android: sin salir de la app, y borra la invitación');
    t.eq(pg.errs, [], 'Android: errores de la página');
    await pg.close();
  }

  // ---- Cuenta nueva: primero la hoja y después la bienvenida, sin el paso del código ----
  {
    const pg = await entrar(base, { user: NUEVO() }), p = pg.p;
    t.ok(await abierta(p), 'cuenta nueva: primero la hoja');
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'cuenta nueva: la bienvenida espera');
    await tocar(p, 'si'); await wait(500);
    t.has(await hoja(p), '¡Listo! Ya entrenás con Toro.', 'cuenta nueva: se sumó');
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'cuenta nueva: la bienvenida sigue esperando');
    await tocar(p, 'no');
    t.ok(await p.isVisible('#authHost .onb-card'), 'cuenta nueva: al cerrar la hoja, la bienvenida');
    await p.click('[data-onb="start"]'); await wait(300);
    t.eq((await onbPaso(p)).n, '1/7', 'cuenta nueva: el camino con coach (7 pasos, sin el código)');
    await p.click('[data-onb="dskip"]'); await wait(250);
    t.eq((await onbPaso(p)).titulo, '¿Cuál es tu sexo?', 'cuenta nueva: no pide el código');
    t.eq(pg.errs, [], 'cuenta nueva: errores de la página');
    await pg.close();
  }

  // ---- Una invitación de más de 7 días se ignora ----
  {
    const pg = await entrar(base, { hash: '', init: GUARDADA(8 * 864e5) }), p = pg.p;
    t.ok(!(await abierta(p)), 'vencida: sin hoja');
    t.eq([pg.st.ver, await pend(p)], [[], null], 'vencida: no pregunta y se borra');
    await pg.close();
  }

  // ---- Otra cuenta en el dispositivo: la del link recién abierto queda; una vieja, no ----
  {
    const otro = { ownerUid: '55555555-5555-5555-5555-555555555555', days: [] };
    const pg = await entrar(base, { state: otro, espera: 5000 }), p = pg.p;
    t.ok(await abierta(p), 'otra cuenta: la invitación del link recién abierto es de quien entra');
    await pg.close();
    const pv = await entrar(base, { hash: '', state: otro, init: GUARDADA(3600e3), espera: 5000 }), q = pv.p;
    t.ok(!(await abierta(q)), 'otra cuenta: una invitación de hace una hora era de la cuenta anterior');
    t.eq([pv.st.ver, await pend(q)], [[], null], 'otra cuenta: y se borra sin preguntar');
    await pv.close();
  }

  // ---- Al cerrar sesión se borra ----
  {
    const pg = await entrar(base, { hash: '', espera: 2500 }), p = pg.p;
    const r = await p.evaluate(async () => {
      localStorage.setItem('gize_coach_pend', JSON.stringify({ a: 'toro', t: Date.now() }));
      (await import('/app/core/supabase.js')).clearAccountLeftovers('11111111-1111-1111-1111-111111111111');
      return localStorage.getItem('gize_coach_pend');
    });
    t.eq(r, null, 'cerrar sesión: borra la invitación');
    await pg.close();
  }

  // ---- La política de privacidad ----
  {
    const html = fs.readFileSync(path.join(ROOT, 'privacidad/index.html'), 'utf8');
    const i = html.indexOf('<h2 id="pagina-coach">'), j = html.indexOf('<h2', i + 5);
    const sec = html.slice(i, j).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const frase of ['Si abrís su link en GIZE, la app siempre te pregunta antes de sumarte',
      'el nombre del link queda guardado solo en tu dispositivo, hasta 7 días o hasta que cierres sesión', 'en GIZE no queda anotado que lo abriste'])
      t.has(sec, frase, 'la política dice: ' + frase);
  }
}
