// Widget «GIZE de hoy» (app/core/widget.js): el puente con el plugin GizeWidget de las apps, con el
// plugin y el de Capacitor (App) simulados. Lo que se arma está en tests/widget-datos.test.mjs; acá:
// · Al entrar un alumno manda el JSON (v = 1, de hoy a hoy+7 y sinDatos) con su entreno de hoy, su
//   racha y «Conectá tus pasos» sin Salud. No vuelve a mandar si no cambió; después de «Guardar
//   entreno de hoy» dice «Hecho hoy ✓», y al pasar a segundo plano lo manda al toque.
// · Con Salud conectada, los pasos leídos con la meta y la hora de la lectura.
// · Borra el widget al cerrar sesión, al eliminar la cuenta y cuando entra otra cuenta, y después no
//   manda nada más (no vuelve a aparecer la cuenta que salió).
// · Un coach: solo «Tu panel de coach», sin nada de alumnos, y los toques no hacen nada. La dueña del
//   gimnasio (que también es coach) ve el panel del gimnasio: «Tu panel del gimnasio».
// · Los toques: gize://widget/entreno?dia=dB abre Entreno en ese día, pasos abre Cardio → Pasos y
//   racha la ventana de la racha; un id raro u otro link no hacen nada; sin sesión, tampoco. El link
//   con que se abrió la app se usa una sola vez por arranque (getLaunchUrl lo repite al recargar).
// · Ajustes: en Android «Agregar a la pantalla» llama a agregar(); si el lanzador no deja o en
//   iPhone, cómo agregarlo a mano; ya agregado, «Ya está en tu pantalla».
// · En la web: sin plugin no hay ningún llamado ni tarjeta.
// · La política de privacidad nombra el widget.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, ALUMNO, perfil } from './lib.mjs';
import { DUENA, handlersGym } from './gym-comun.mjs';
import { sumarDias } from '../app/core/pasosdia.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TZ = 'America/Argentina/Buenos_Aires';
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const T = new Date(HOY + 'T12:00:00Z').getUTCDay();
const FECHAS = Array.from({ length: 8 }, (_, k) => sumarDias(HOY, k));
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };

const ex = (id, done) => ({ id, name: 'Sentadilla', sets: [{ id: id + 's', kg: '50', reps: '10', done: !!done }] });
const ESTADO = (o = {}) => Object.assign({
  days: [{ id: 'dA', name: 'Día A', dias: [T], exercises: [ex('a1', true), ex('a2', true)] }, { id: 'dB', name: 'Día B', dias: [(T + 2) % 7], exercises: [ex('b1')] }],
  sessions: [], weights: [], daily: {}, visits: [sumarDias(HOY, -2), sumarDias(HOY, -1)],
}, o);

// Capacitor simulado con el plugin GizeWidget (anota cada llamado en sessionStorage, así sigue
// después de que la app se recarga) y App (getLaunchUrl y appUrlOpen). o.salud: pasos de hoy en Salud.
const NATIVO = (plataforma, o = {}) => `(() => {
  const o = ${JSON.stringify(o)};
  const log = JSON.parse(sessionStorage.getItem('__wlog') || '[]');
  const anotar = x => { log.push(x); sessionStorage.setItem('__wlog', JSON.stringify(log)); };
  window.__wlog = log;
  window.__app = { oyentes: {}, launch: o.launch || null };
  const Plugins = {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => (window.__app.launch ? { url: window.__app.launch } : {}),
      addListener: (ev, fn) => { (window.__app.oyentes[ev] = window.__app.oyentes[ev] || []).push(fn); return Promise.resolve({ remove(){} }); } },
    GizeWidget: {
      guardar: async a => { anotar(['guardar', a.datos]); return { instalados: o.instalados || 0 }; },
      borrar: async () => { anotar(['borrar']); return {}; },
      info: async () => { anotar(['info']); return { instalados: o.instalados || 0, puedeAgregar: o.puedeAgregar !== false }; },
      agregar: async () => { anotar(['agregar']); return { pedido: o.puedeAgregar !== false }; },
    },
  };
  if (o.salud) {
    localStorage.setItem('gize_salud_${ALUMNO.id}', '1');
    const hoy = new Date(); hoy.setHours(0, 5, 0, 0);
    Plugins.Health = { isAvailable: async () => ({ available: true }), requestAuthorization: async () => ({ readAuthorized: ['steps'] }),
      readSamples: async () => ({ samples: [{ dataType: 'steps', value: o.salud, unit: 'count', startDate: hoy.toISOString(), endDate: hoy.toISOString(), sourceId: 'android' }] }) };
  }
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plataforma}', Plugins };
})();`;

const abrir = async (base, { user = ALUMNO, state = ESTADO(), plataforma = 'android', o = {}, handlers = {}, web = false } = {}) => {
  const pg = await newPage({ user, state: user ? state : undefined, init: web ? undefined : NATIVO(plataforma, o),
    handlers: Object.assign({ '/profiles': perfil('client') }, handlers) });
  await pg.p.goto(base + '/app/'); await wait(3500);
  return pg;
};
const log = p => p.evaluate(() => JSON.parse(sessionStorage.getItem('__wlog') || '[]'));
const guardados = L => L.filter(x => x[0] === 'guardar').map(x => JSON.parse(x[1]));
const tocar = (p, url) => p.evaluate(u => (window.__app.oyentes.appUrlOpen || []).forEach(f => f({ url: u })), url);
const vista = p => p.evaluate(async () => { const { State } = await import('/app/core/state.js'); return { view: State.view, dia: State.activeId }; });
const rachaAbierta = p => p.evaluate(() => { const h = document.getElementById('streakHost'); return !!(h && h.classList.contains('on')); });
const pausa = (p, ev) => p.evaluate(e => document.dispatchEvent(new Event(e)), ev);

export default async function ({ base, t }){
  // ---- 1) Alumno en Android, sin Salud ----
  let pg = await abrir(base);
  let p = pg.p, L = await log(p), g = guardados(L);
  t.ok(g.length >= 1, 'al entrar manda lo del widget: ' + JSON.stringify(L.map(x => x[0])));
  let w = g[g.length - 1] || { dias: {} };
  t.eq(w.v, 1, 'v = 1');
  t.eq(Object.keys(w.dias), FECHAS, 'de hoy a hoy+7');
  t.eq(w.sinDatos && w.sinDatos.aviso && w.sinDatos.aviso.texto, 'Abrí GIZE para ver tu día', 'sinDatos: «Abrí GIZE para ver tu día»');
  const d0 = w.dias[HOY] || {};
  t.eq(d0.entreno, { titulo: 'Hoy toca', nombre: 'Día A', detalle: '2 ejercicios', hecho: false, dia: 'dA' }, 'hoy toca el Día A');
  t.eq(d0.racha, { txt: '3', pie: 'días seguidos', prendida: true }, 'la racha de hoy (ayer, anteayer y hoy)');
  t.eq([(w.dias[FECHAS[1]] || {}).racha, (w.dias[FECHAS[2]] || {}).racha], [{ txt: '3', pie: '¡Entrá hoy!', prendida: true }, { txt: '0', pie: 'Se apagó', prendida: false }], 'mañana en juego, pasado apagada');
  t.eq(d0.pasos, { txt: 'Conectá', pie: 'tus pasos', pct: 0 }, 'sin Salud: «Conectá tus pasos»');
  t.eq((w.dias[FECHAS[2]] || {}).entreno && w.dias[FECHAS[2]].entreno.nombre, 'Día B', 'pasado mañana toca el Día B');
  // Sin cambios no se vuelve a mandar, aunque la app se dibuje.
  const n0 = g.length;
  await p.click('#nav-habitos'); await wait(200); await p.click('#nav-entreno'); await wait(2600);
  t.eq(guardados(await log(p)).length, n0, 'dibujar de nuevo sin cambios no manda otra vez');
  // Guardar el entreno de hoy: «Hecho hoy ✓». Al pasar a segundo plano se manda al toque (sin la espera).
  await p.click('[data-action="save-session"]');
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem('rutina_jero_v1')).sessions || []).length === 1, null, { polling: 50, timeout: 5000 }).catch(() => {});
  t.eq(guardados(await log(p)).length, n0, 'recién guardado: espera (los cambios seguidos van juntos)');
  await pausa(p, 'pause'); await wait(400);
  g = guardados(await log(p));
  t.eq(g.length, n0 + 1, 'al pasar a segundo plano se manda al toque');
  t.eq((g[g.length - 1].dias[HOY] || {}).entreno, { titulo: 'Hecho hoy ✓', nombre: 'Día A', detalle: '2 ejercicios', hecho: true, dia: 'dA' }, 'después de guardar: «Hecho hoy ✓»');
  await pausa(p, 'resume'); await wait(2600);
  t.eq(guardados(await log(p)).length, n0 + 1, 'y no se repite al volver');
  await p.evaluate(() => { const b = document.querySelector('#fbHost [data-action="fb-skip"]'); if (b) b.click(); }); await wait(300);
  // Los toques en el widget.
  await p.evaluate(() => localStorage.setItem('gize_cardio_secs', JSON.stringify({ pasos: false }))); // la había cerrado
  await tocar(p, 'gize://widget/pasos'); await wait(500);
  t.eq((await vista(p)).view, 'cardio', 'pasos: abre Cardio');
  t.ok(await p.evaluate(() => { const d = document.querySelector('#view .csec-pasos details.csec'); return !!(d && d.open) && JSON.parse(localStorage.getItem('gize_cardio_secs')).pasos === true; }), 'pasos: con la sección Pasos abierta (aunque la hubiera cerrado)');
  await tocar(p, 'gize://widget/racha'); await wait(600);
  t.ok(await rachaAbierta(p), 'racha: abre la ventana de la racha');
  await p.evaluate(async () => (await import('/app/ui/racha.js')).closeStreak()); await wait(300);
  await tocar(p, 'gize://widget/entreno?dia=dB'); await wait(500);
  t.eq(await vista(p), { view: 'entreno', dia: 'dB' }, 'entreno: abre Entreno en el día del link');
  await p.click('#nav-cardio'); await wait(300);
  for (const u of ['gize://widget/entreno?dia=../dA', 'gize://widget/comida', 'gize://otra/cosa', 'gize://login?x=1'])
    { await tocar(p, u); await wait(250); }
  t.eq((await vista(p)).view, 'cardio', 'un id raro u otro link no hacen nada');
  await tocar(p, 'gize://widget/hoy'); await wait(400);
  t.eq((await vista(p)).view, 'entreno', 'hoy: abre Entreno');
  // Ajustes: la tarjeta y «Agregar a la pantalla».
  await p.click('#nav-config'); await wait(700);
  const card = await text(p, '#cfgWidget');
  t.has(card, 'Widget en tu pantalla', 'Ajustes: la tarjeta del widget');
  t.has(card, 'Tus pasos, tu racha y el entreno de hoy, sin abrir la app.', 'Ajustes: qué muestra');
  t.has(card, 'Agregar a la pantalla', 'Ajustes en Android: «Agregar a la pantalla»');
  await p.click('#cfgWidget [data-widget="agregar"]'); await wait(500);
  t.ok((await log(p)).some(x => x[0] === 'agregar'), '«Agregar a la pantalla» llama a agregar()');
  // Cerrar sesión: se borra y no se manda nada más.
  await p.click('[data-auth="logout"]'); await wait(3500);
  L = await log(p);
  const iB = L.map(x => x[0]).lastIndexOf('borrar');
  t.ok(iB >= 0, 'al cerrar sesión se borra el widget: ' + JSON.stringify(L.map(x => x[0])));
  t.eq(L.slice(iB + 1).filter(x => x[0] === 'guardar').length, 0, 'y después no se manda nada');
  t.ok(await p.evaluate(() => !!document.getElementById('auEmail')), 'quedó en el ingreso');
  t.eq(pg.errs, [], 'errores (alumno en Android)');
  await pg.close();

  // ---- 2) Con Salud conectada: los pasos leídos, con la meta y la hora ----
  pg = await abrir(base, { o: { salud: 4321 } });
  await pausa(pg.p, 'pause'); await wait(400);
  g = guardados(await log(pg.p));
  const ps = ((g[g.length - 1] || { dias: {} }).dias[HOY] || {}).pasos || {};
  t.ok(ps.txt === '4.321' && /^de 10\.000 · \d\d:\d\d$/.test(ps.pie) && ps.pct === 43, 'con Salud: los pasos de hoy, la meta y la hora de la lectura: ' + JSON.stringify(ps));
  // Borrado (por ejemplo, con el cartel de «Tu cuenta fue eliminada» todavía abierto): aunque la app se
  // dibuje o pase a segundo plano, no vuelve a mandar los datos de la cuenta que salió.
  // Además, un cambio que se manda en el mismo momento en que se borra: el borrado llega último.
  await pausa(pg.p, 'resume');
  await pg.p.evaluate(async () => {
    const { state } = await import('/app/core/state.js'), w = await import('/app/core/widget.js');
    state.days[0].name = 'Último cambio'; w.widgetEnviar(); w.widgetBorrar();
  });
  await pg.p.click('#nav-habitos'); await wait(200); await pausa(pg.p, 'pause'); await wait(2600);
  L = await log(pg.p);
  const iS = L.map(x => x[0]).lastIndexOf('borrar');
  t.ok(L.slice(0, Math.max(0, iS)).some(x => x[0] === 'guardar' && /Último cambio/.test(x[1])), 'lo mandado justo antes de borrar sale antes del borrado: ' + JSON.stringify(L.map(x => x[0])));
  t.ok(iS >= 0 && !L.slice(iS + 1).some(x => x[0] === 'guardar'), 'después de borrarlo no se manda más: ' + JSON.stringify(L.map(x => x[0])));
  t.eq(pg.errs, [], 'errores (Salud)');
  await pg.close();

  // ---- 3) Eliminar la cuenta: se borra ----
  pg = await abrir(base, { handlers: { '/functions/v1/borrar-audios': (r, J) => J({ removed: 0, deleted: true }) } });
  pg.p.dialogAnswer = 'ELIMINAR';
  await pg.p.click('#nav-config'); await wait(500);
  await pg.p.click('[data-action="cfg-delete-account"]'); await wait(3500);
  L = await log(pg.p);
  const iE = L.map(x => x[0]).lastIndexOf('borrar');
  t.ok(iE >= 0 && !L.slice(iE + 1).some(x => x[0] === 'guardar'), 'al eliminar la cuenta se borra el widget y no se manda más: ' + JSON.stringify(L.map(x => x[0])));
  t.ok(pg.dialogs.includes('Tu cuenta fue eliminada.'), 'la cuenta se eliminó');
  t.eq(pg.errs, [], 'errores (eliminar la cuenta)');
  await pg.close();

  // ---- 4) Entra otra cuenta en el celular: se borra lo de la anterior antes de nada ----
  const vieja = ESTADO({ ownerUid: '99999999-9999-4999-8999-999999999999' });
  vieja.days[0].name = 'Rutina vieja';
  pg = await abrir(base, { state: vieja });
  await wait(1500);
  L = await log(pg.p);
  t.eq(L.length ? L[0][0] : '', 'borrar', 'otra cuenta: lo primero es borrar el widget: ' + JSON.stringify(L.map(x => x[0])));
  t.ok(guardados(L).length >= 1 && !guardados(L).some(x => /Rutina vieja/.test(JSON.stringify(x))), 'y después manda lo de la cuenta nueva, sin nada de la anterior');
  t.eq(pg.errs, [], 'errores (otra cuenta)');
  await pg.close();

  // ---- 5) Coach: solo el aviso neutro; los toques no hacen nada ----
  const ME = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
  pg = await abrir(base, { user: COACH, state: ESTADO(), handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([{ id: '44444444-4444-4444-4444-444444444444', full_name: 'Alumna Zeta' }]); return J(i.one ? ME : [ME]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  } });
  g = guardados(await log(pg.p));
  w = g[g.length - 1] || {};
  t.ok(g.length >= 1, 'coach: manda el widget neutro');
  t.eq(w.dias, {}, 'coach: sin días');
  t.eq(w.sinDatos && w.sinDatos.aviso, { titulo: 'GIZE', texto: 'Tu panel de coach', pie: 'Tocá para abrir' }, 'coach: «GIZE · Tu panel de coach · Tocá para abrir»');
  t.ok(!g.some(x => /Día A|Zeta|Sentadilla/.test(JSON.stringify(x))), 'coach: nada de la rutina ni de sus alumnos');
  await tocar(pg.p, 'gize://widget/racha'); await wait(500);
  t.ok(!(await rachaAbierta(pg.p)), 'coach: los toques del widget no hacen nada');
  t.eq(pg.errs, [], 'errores (coach)');
  await pg.close();

  // ---- 5b) La dueña del gimnasio, que también es coach: ve el panel del gimnasio (no el de coach) ----
  pg = await abrir(base, { user: DUENA, state: ESTADO(), handlers: handlersGym(DUENA).handlers });
  g = guardados(await log(pg.p));
  w = g[g.length - 1] || {};
  t.eq(w.sinDatos && w.sinDatos.aviso, { titulo: 'GIZE', texto: 'Tu panel del gimnasio', pie: 'Tocá para abrir' }, 'dueña del gimnasio: «Tu panel del gimnasio», como lo que ve');
  t.eq(w.dias, {}, 'dueña del gimnasio: sin días');
  t.ok(!g.some(x => /Martina|Pedro|Día A|Sentadilla/.test(JSON.stringify(x))), 'dueña del gimnasio: nada de los socios ni de la rutina');
  await tocar(pg.p, 'gize://widget/racha'); await wait(500);
  t.ok(!(await rachaAbierta(pg.p)), 'dueña del gimnasio: los toques del widget no hacen nada');
  t.eq(pg.errs, [], 'errores (dueña del gimnasio)');
  await pg.close();

  // ---- 6) La app abierta por un toque en el widget: una sola vez por arranque ----
  pg = await abrir(base, { o: { launch: 'gize://widget/racha' } });
  t.ok(await rachaAbierta(pg.p), 'abierta desde el widget: abre la racha');
  await pg.p.evaluate(async () => (await import('/app/ui/racha.js')).closeStreak()); await wait(300);
  await pg.p.reload(); await wait(3500);
  t.ok(!(await rachaAbierta(pg.p)), 'al recargar no la vuelve a abrir');
  t.eq(pg.errs, [], 'errores (link al abrir)');
  await pg.close();

  // ---- 7) Sin sesión: no se manda nada y los toques no hacen nada ----
  pg = await abrir(base, { user: null, o: { launch: 'gize://widget/racha' } });
  await tocar(pg.p, 'gize://widget/entreno?dia=dA'); await wait(500);
  L = await log(pg.p);
  t.eq(L.filter(x => x[0] === 'guardar').length, 0, 'sin sesión: no manda nada');
  t.ok(!(await rachaAbierta(pg.p)) && await pg.p.evaluate(() => !!document.getElementById('auEmail')), 'sin sesión: queda el ingreso');
  t.eq(pg.errs, [], 'errores (sin sesión)');
  await pg.close();

  // ---- 8) Ajustes: lanzador que no deja, ya agregado, iPhone ----
  for (const [cual, plataforma, o, quiere, no] of [
    ['Android sin agregar desde la app', 'android', { puedeAgregar: false }, 'Mantené apretado un lugar vacío de tu pantalla de inicio → Widgets → GIZE.', 'Agregar a la pantalla'],
    ['Android ya agregado', 'android', { instalados: 1 }, 'Ya está en tu pantalla.', 'Agregar a la pantalla'],
    ['iPhone', 'ios', {}, 'Mantené apretado un lugar vacío de tu pantalla de inicio, tocá Editar → Agregar widget (o el +) y buscá GIZE.', 'Agregar a la pantalla'],
  ]){
    pg = await abrir(base, { plataforma, o });
    await pg.p.click('#nav-config'); await wait(800);
    const c = await text(pg.p, '#cfgWidget');
    t.has(c, quiere, cual + ': ' + quiere);
    t.ok(!c.includes(no), cual + ': sin «' + no + '»');
    t.eq(pg.errs, [], 'errores (' + cual + ')');
    await pg.close();
  }

  // ---- 9) En la web: nada ----
  pg = await abrir(base, { web: true });
  await pg.p.click('#nav-config'); await wait(600);
  t.ok(!(await pg.p.$('#cfgWidget')), 'web: sin la tarjeta del widget');
  t.eq(await pg.p.evaluate(async () => (await import('/app/core/widget.js')).widgetDisponible()), false, 'web: sin plugin');
  t.eq(pg.errs, [], 'errores (web)');
  await pg.close();

  // ---- 10) La política de privacidad ----
  const html = fs.readFileSync(path.join(ROOT, 'privacidad/index.html'), 'utf8'), pol = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  t.has(pol, 'y, si agregás el widget de GIZE a la pantalla de inicio, para mostrarte ahí tus pasos de hoy', 'política: Pasos automáticos nombra el widget');
  t.has(pol, 'Widget «GIZE de hoy»: en la app de Android o iPhone, tus pasos de hoy, tu racha y el nombre del entreno de hoy y de los próximos días se guardan solo en tu celular, para que el widget los muestre en tu pantalla de inicio si lo agregás (cualquiera que vea tu pantalla los ve).', 'política: qué guarda el widget y dónde');
  t.has(pol, 'No se envían a ningún lado y se borran al cerrar sesión o eliminar tu cuenta.', 'política: que no sale del celular y cuándo se borra');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const m = /Última actualización: (\d{1,2}) de (\w+) de (\d{4})/.exec(pol);
  t.ok(m && Date.UTC(+m[3], MESES.indexOf(m[2]), +m[1]) >= Date.UTC(2026, 9, 30), 'política: la fecha es la del widget (o posterior): ' + (m && m[0]));
}
