// Recorrido por la app de Android en el emulador (.github/workflows/android-emulador.yml): con la
// versión de prueba (debug) ya instalada y abierta, se conecta al WebView de la app con Playwright
// (Capacitor deja depurar el WebView en debug), simula Supabase como las pruebas (tests/lib.mjs:
// nada sale a internet ni llega al Supabase real), entra como alumno y como coach y saca una
// captura de la pantalla completa del celular (adb screencap: con la barra de estado y la de
// navegación) de cada pantalla. En cada una mide que la cabecera y la barra de abajo de la app no
// queden debajo de las barras del sistema (Android 15 y más dibujan de borde a borde).
// Deja en $SALIDA las capturas (01-hoy.png…) y suma su parte a informe.txt.
// Sale con 1 si no se pudo hacer algún paso, si la app se cerró o si se cayó (logcat). Lo que se
// ve mal (bordes, «Atrás», teclado) va al informe como PROBLEMA, sin frenar.
//   SALIDA=capturas PW=…/playwright/index.mjs node scripts/android-recorrido.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALUMNO, semilla, sembrar, supabaseFalso, wait } from '../tests/lib.mjs';
import { barrasDelSistema, bordes, botonEnPantalla, fallas, puntoEnPantalla, tamanoPantalla, ventanaConFoco, vistaWebView } from './android-emulador.mjs';

export const PKG = 'ar.com.gize.app';

// ===== Datos de prueba (solo inventados) =====
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const hace = min => new Date(Date.now() - min * 60000).toISOString();
const serie = (id, kg, reps) => ({ id, kg, reps });
const DIAS = [
  { id: 'd1', name: 'Pierna', exercises: [
    { id: 'e1', name: 'Sentadilla libre', rest: '1:30', sets: [serie('s1', '60', '8'), serie('s2', '60', '8'), serie('s3', '60', '8')] },
    { id: 'e2', name: 'Prensa 45°', rest: '1:00', sets: [serie('s4', '120', '10'), serie('s5', '120', '10')] },
    { id: 'e3', name: 'Camilla de cuádriceps', rest: '1:00', sets: [serie('s6', '40', '12'), serie('s7', '40', '12')] }] },
  { id: 'd2', name: 'Torso', exercises: [
    { id: 'e4', name: 'Press de banca', rest: '2:00', sets: [serie('s8', '50', '8'), serie('s9', '50', '8')] },
    { id: 'e5', name: 'Remo con barra', rest: '1:30', sets: [serie('s10', '45', '10')] }] },
];
const ESTADO = { days: DIAS, sessions: [], weights: [], daily: {} };
const M1 = '5a5a5a5a-0000-4000-8000-000000000001', M2 = '5a5a5a5a-0000-4000-8000-000000000002', M3 = '5a5a5a5a-0000-4000-8000-000000000003';
const mensaje = (id, sender, body, min) => ({ id, coach_id: COACH.id, client_id: ALUMNO.id, sender, body, audio_path: null, audio_secs: null, created_at: hace(min), read_at: hace(0), delivered: 1 });
const MENSAJES = [mensaje(M1, 'coach', '¡Hola! ¿Cómo te fue con la pierna?', 95), mensaje(M2, 'client', 'Bien, subí 5 kg en sentadilla', 80),
  mensaje(M3, 'coach', 'Bien ahí. La semana que viene probamos con 65 kg.', 30)];
const SALIDA_ID = '5a1d0000-0000-4000-8000-0000000000a1';
const SALIDA_FILA = { id: SALIDA_ID, client_id: ALUMNO.id, mode: 'pie', performed_on: '2026-10-01', started_at: '2026-10-01T13:00:00+00:00', ended_at: '2026-10-01T13:45:01+00:00',
  duration_s: 2701, moving_s: 2699, distance_m: 5499, kcal: 366, avg_speed_kmh: 7.33, max_speed_kmh: 11.01, weight_kg: 70, weight_default: false, gap_s: 0,
  breakdown: { caminar: 1204, trotar: 894, correr: 601 }, segments: [], splits: [[1000, 720], [1000, 630], [1000, 450], [1000, 409], [1000, 327], [499, 163]], points: 540,
  created_at: '2026-10-01T13:46:00+00:00' };
const SEM = { desde: '2026-10-05', hasta: '2026-10-11' };
const GRUPO = { id: 'g1', nombre: 'Los del laburo', codigo: 'ABCD2345', soy_dueno: true, miembros: 4, mi_puesto: 2 };
const RANKING = [['Bruno', 71240], ['Alumno Prueba', 52300, true], ['Caro', 35620], ['Dani', 17810]]
  .map(([nombre, pasos, yo], i) => Object.assign({ miembro: 'm' + i, nombre, pasos, puesto: i + 1, soy_yo: !!yo }, SEM));
const uno = (i, o) => i.one ? o : [o];

// Supabase simulado de cada cuenta (mismo formato que los handlers de newPage en tests/lib.mjs).
export const HANDLERS_ALUMNO = {
  // Con maybeSingle, supabase-js pide una lista (sin «vnd.pgrst.object»): va la fila sola o en lista.
  '/profiles': (r, J, i) => i.m === 'GET' ? J(uno(i, { id: ALUMNO.id, role: 'client', full_name: 'Alumno Prueba', coach_id: COACH.id })) : undefined,
  '/rpc/my_coach_name': (r, J) => J('Coach Prueba'),
  '/routines': (r, J, i) => i.m === 'GET' ? J(uno(i, { days: DIAS, updated_at: hace(600) })) : undefined,
  '/coach_messages': (r, J, i) => i.m === 'GET' ? J(MENSAJES.slice().reverse()) : undefined,
  '/rpc/my_blocks': (r, J) => J([{ id: '8d8d8d8d-0000-4000-8000-000000000001', nombre: 'Bruno', created_at: '2026-10-08T12:00:00Z' }]),
  '/cardio_outings': (r, J, i) => i.m !== 'GET' ? undefined : /select=track/.test(decodeURIComponent(i.url.search)) ? J(uno(i, { track: '' })) : J([SALIDA_FILA]),
  '/nutrition': (r, J, i) => i.m === 'GET' ? J(uno(i, { client_id: ALUMNO.id, kcal: null, plan: { cardio: { text: '30 min de cinta', items: ['Martes: 20 min de bici'] } } })) : undefined,
  '/rpc/pasos_mis_grupos': (r, J) => J([GRUPO]),
  '/rpc/pasos_ranking': (r, J) => J(RANKING),
  '/rpc/pasos_campeon': (r, J) => J([]),
};
export const HANDLERS_COACH = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
    if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(uno(i, me)); },
  '/coach_billing': (r, J, i) => J(uno(i, { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' })),
  '/sessions': (r, J, i) => i.m === 'GET' ? J(/client_id=eq\.4444/.test(i.url.search) ? [{ id: 's1', performed_on: '2026-10-06', day_name: 'Pierna', created_at: '2026-10-06T12:00:00Z',
    session_entries: [{ exercise_name: 'Sentadilla libre', set_order: 0, kg: 60, reps: 8 }, { exercise_name: 'Sentadilla libre', set_order: 1, kg: 60, reps: 8 }] }] : []) : undefined,
  '/body_weights': (r, J, i) => i.m === 'GET' ? J(/client_id=eq\.4444/.test(i.url.search) ? [{ id: 'w1', client_id: A1, measured_on: '2026-10-01', kg: 70 }, { id: 'w2', client_id: A1, measured_on: '2026-10-08', kg: 69.4 }] : []) : undefined,
};

// Lo que mide la página para revisar los bordes: el elemento visible de más arriba (arriba) y el
// de más abajo (abajo) entre los que cumplen cada selector, env(safe-area-inset-*) con un
// elemento de prueba, y el tamaño del WebView (inner) y de la pantalla (screen), en px de CSS.
function medirPagina({ arriba, abajo }){
  const visible = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight; };
  const rects = sel => sel ? [...document.querySelectorAll(sel)].filter(visible).map(e => e.getBoundingClientRect()) : [];
  const ra = rects(arriba), rb = rects(abajo);
  const sonda = document.createElement('div');
  sonda.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(sonda);
  const cs = getComputedStyle(sonda), sa = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  sonda.remove();
  return { dpr: devicePixelRatio, inner: [innerWidth, innerHeight], screen: [screen.width, screen.height], sa,
    arriba: ra.length ? { top: Math.min(...ra.map(r => r.top)), bottom: Math.min(...ra.map(r => r.bottom)) } : null,
    abajo: rb.length ? { top: Math.max(...rb.map(r => r.top)), bottom: Math.max(...rb.map(r => r.bottom)) } : null };
}

// Cabecera y barra de abajo de cada tipo de pantalla.
const TABS = { arriba: '.topbar .brand-logo, .topbar button:not([hidden])', abajo: '.navbar' };
const CHAT = { arriba: '#chatHost .ch-back', abajo: '#chatHost .ch-input, #chatHost .ch-send' };
const COACH_B = { arriba: '#coachHost .co-head' };

// El recorrido. p: la página del WebView; dev: el celular (ver dispositivoAndroid); salida: carpeta.
// Devuelve { lineas, fallo } para el informe.
export async function recorrido({ p, dev, salida, sb }){
  const filas = [], notas = [], problemas = [], pasosFallidos = [];
  const dialogos = [], errs = [];
  p.on('pageerror', e => errs.push(e.message));
  // Un alert/confirm de la página lo muestra Android (no Playwright): se fotografía y se toca
  // «Cancelar» (o «Aceptar» si es lo único) en la pantalla. Así nunca se abre algo fuera de la app.
  let nDialogo = 0;
  p.on('dialog', async d => {
    dialogos.push(d.type() + ': ' + d.message());
    await wait(1500);
    try { await dev.captura(path.join(salida, 'dialogo-' + (++nDialogo) + '.png')); } catch (e) {}
    const ui = dev.ui();
    const b = botonEnPantalla(ui, { id: 'android:id/button2' }) || botonEnPantalla(ui, { id: 'android:id/button1' });
    if (b) await dev.tocar(...b); else await dev.tecla(4);
  });
  const revisar = (ok, texto) => { (ok ? notas : problemas).push((ok ? 'OK: ' : 'PROBLEMA: ') + texto); return ok; };
  const paso = async (titulo, fn) => {
    if (!appAdelante()){
      problemas.push('PROBLEMA: antes de «' + titulo + '» la app no estaba adelante (' + (dev.geometria().foco || 'sin ventana') + '): se vuelve a abrir');
      await dev.abrirApp(); await wait(2500);
    }
    try { await fn(); }
    catch (e) {
      pasosFallidos.push(titulo + ': ' + String((e && e.message) || e).split('\n')[0]);
      try { await dev.captura(path.join(salida, 'fallo-' + titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png')); } catch (e2) {}
    }
  };
  // Captura de la pantalla completa, con la revisión de los bordes de esa pantalla.
  const foto = async (nombre, titulo, sel = {}, { arribaDeTodo = false } = {}) => {
    if (arribaDeTodo) await p.evaluate(() => window.scrollTo(0, 0));
    await wait(800);
    let b;
    try {
      const g = dev.geometria();
      b = bordes(Object.assign(g, { m: await p.evaluate(medirPagina, sel) }));
      if (!g.foco.startsWith(PKG + '/')) { b.ok = false; b.problemas.unshift('la app no está adelante (ventana con el foco: ' + (g.foco || '?') + ')'); }
    }
    catch (e) { b = { ok: false, problemas: ['no se pudieron medir los bordes: ' + e.message], detalle: '' }; }
    await dev.captura(path.join(salida, nombre + '.png'));
    filas.push({ nombre, titulo, b });
  };
  const visible = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, sel);
  const appAdelante = () => dev.vivo() && dev.geometria().foco.startsWith(PKG + '/');
  // Atrás de Android (la tecla del sistema, como el gesto).
  const atras = async () => { await dev.tecla(4); await wait(900); };
  const sinRealtime = () => p.evaluate(async () => {
    const { State } = await import('/app/core/state.js');
    State.sb.channel = () => { const ch = { state: 'joined', on: () => ch, subscribe: () => ch }; return ch; };
    State.sb.removeChannel = () => {};
  });
  const entrar = async (user, estado, handlers) => {
    Object.assign(sb, { user, handlers });
    await p.evaluate(sembrar, semilla(user, estado));
    await p.reload({ waitUntil: 'load' });
    await wait(5000);
  };

  // ===== Alumno =====
  await paso('Entrar como alumno', async () => {
    await entrar(ALUMNO, ESTADO, HANDLERS_ALUMNO);
    revisar(await p.evaluate(() => document.documentElement.classList.contains('android-app')), 'la app se reconoce como app de Android (html.android-app)');
    await sinRealtime();
    await foto('01-hoy', 'Inicio (Entreno con el día de hoy)', TABS, { arribaDeTodo: true });
  });
  await paso('Entreno', async () => {
    await p.click('#nav-entreno'); await wait(400);
    await p.click('.ex-collapsed[data-ex="e1"]'); await wait(700);
    await foto('02-entreno-rutina', 'Entreno: ejercicio abierto', TABS);
    await p.click('.done[data-set="s1"]');
    // Al tildar una serie arranca el descanso y, desde Android 13, la app pide el permiso de
    // notificaciones (para avisar el fin del descanso). Es una ventana del sistema.
    await wait(3000);
    const foco = dev.geometria().foco;
    if (/permissioncontroller/i.test(foco)){
      await dev.captura(path.join(salida, '03-permiso-notificaciones.png'));
      filas.push({ nombre: '03-permiso-notificaciones', titulo: 'Pedido de permiso de notificaciones (ventana de Android)', b: null });
      const b = botonEnPantalla(dev.ui(), { id: 'com.android.permissioncontroller:id/permission_allow_button', textos: ['Allow', 'Permitir'] });
      notas.push('Permiso de notificaciones: lo pidió al tildar la primera serie (arranca el descanso); se tocó ' + (b ? '«Permitir»' : 'Atrás (no se encontró «Permitir»)') + '.');
      if (b) await dev.tocar(...b); else await dev.tecla(4);
      await wait(2500);
    } else notas.push('Permiso de notificaciones: no apareció el pedido al tildar una serie (ventana con el foco: ' + (foco || '?') + ').');
    revisar(!!(await p.$('.done.on[data-set="s1"]')), 'la serie quedó tildada');
    await foto('04-entreno-serie', 'Entreno: serie tildada y descanso en marcha', TABS);
    if (await p.$('#restBar .rest-x')) { await p.click('#restBar .rest-x'); await wait(400); }
  });
  await paso('Comida', async () => {
    await p.click('#nav-comida'); await wait(900);
    await foto('05-comida', 'Comida', TABS, { arribaDeTodo: true });
  });
  await paso('Pasos', async () => {
    await p.click('#nav-progreso'); await wait(500);
    await p.click('[data-action="psec-open"][data-v="pasos"]'); await wait(1200);
    await foto('06-pasos', 'Progreso → Competencia de pasos', TABS, { arribaDeTodo: true });
    await atras();
    revisar(!(await p.$('[data-action="psec-close"]')) && appAdelante(), '«Atrás» cierra la sección de Pasos y la app sigue abierta');
  });
  await paso('Cardio', async () => {
    await p.click('#nav-cardio'); await wait(900);
    const v = await p.evaluate(() => document.getElementById('view').innerText);
    revisar(!/Salir a moverte/.test(v), 'Cardio en Android sin «Salir a moverte» (sin GPS ni mapa)');
    await foto('07-cardio', 'Cardio', TABS, { arribaDeTodo: true });
    await p.click(`[data-action="sal-open"][data-id="${SALIDA_ID}"]`); await wait(1200);
    revisar(await p.evaluate(() => { const h = document.getElementById('salidaHost'); return !!h && h.innerHTML.includes('sov-solo') && !h.querySelector('canvas, .sov-map, [data-rv]'); }), 'una salida de Cardio se ve solo con sus números (sin mapa)');
    await foto('08-cardio-salida', 'Cardio: una salida (solo números)', { arriba: '#salidaHost [data-action="sal-close"]' });
    await p.click('#salidaHost [data-action="sal-close"]'); await wait(500);
  });
  await paso('Chat', async () => {
    await p.click('#nav-entreno'); await wait(400);
    await p.click('#chatBtn'); await wait(1500);
    await foto('09-chat', 'Chat con el coach', CHAT);
    await p.click(`#chatHost [data-chat="more"][data-id="${M3}"]`); await wait(700);
    const opciones = await p.$$eval('#blockHost .blq-opt', l => l.map(e => e.innerText.trim()));
    revisar(opciones.some(s => /Reportar/.test(s)) && opciones.some(s => /Bloquear/.test(s)), 'el «⋯» de un mensaje recibido ofrece Reportar y Bloquear: ' + opciones.join(' / '));
    await foto('10-chat-menu', 'Chat: menú «⋯» de un mensaje recibido', { arriba: CHAT.arriba, abajo: '#blockHost .sheet button' });
    await atras();
    revisar(!(await p.$('#blockHost .sheet')) && await visible('#chatHost .ch-ov') && appAdelante(), '«Atrás» cierra el menú del «⋯» y el chat sigue abierto');
  });
  await paso('Teclado', async () => {
    // Se toca el campo como una persona (adb input tap): así Android abre su teclado.
    const antes = await p.evaluate(() => ({ h: innerHeight, dpr: devicePixelRatio, r: document.getElementById('chatText').getBoundingClientRect().toJSON() }));
    const g = dev.geometria();
    const wv = g.webview || [0, Math.round(screen0(g, antes)), 0, 0];
    await dev.tocar(...puntoEnPantalla(antes.r, wv, antes.dpr));
    await wait(2000);
    await dev.escribir('Hola coach');
    await wait(1500);
    const d = await p.evaluate(() => { const e = document.getElementById('chatText'); return { h: innerHeight, foco: document.activeElement && document.activeElement.id, valor: e ? e.value : '', r: e ? e.getBoundingClientRect().toJSON() : null }; });
    const abierto = dev.teclado();
    revisar(d.foco === 'chatText', 'al tocar el campo del chat queda para escribir (foco)');
    const encogio = d.h < antes.h - 100;
    revisar(encogio || abierto, 'se abrió el teclado de Android (alto del WebView ' + Math.round(antes.h) + ' → ' + Math.round(d.h) + ' px CSS)');
    if (abierto && !encogio) revisar(false, 'con el teclado abierto el WebView no se achicó: el teclado puede tapar el campo');
    revisar(d.valor.includes('Hola coach'), 'lo escrito con el teclado llega al campo');
    revisar(d.r && d.r.bottom <= d.h + 1 && d.r.top >= 0, 'con el teclado abierto el campo se sigue viendo (arriba del teclado)');
    await foto('11-teclado', 'Chat con el teclado abierto', CHAT);
    // El primer «Atrás» cierra el teclado (el WebView vuelve a su alto); el siguiente, el chat.
    await atras();
    if (await p.evaluate(h => innerHeight < h - 100, antes.h)) await atras();
    revisar(await p.evaluate(h => innerHeight >= h - 100, antes.h) && await visible('#chatHost .ch-ov'), '«Atrás» cierra el teclado y el chat sigue abierto');
    await atras();
    revisar(!(await visible('#chatHost .ch-ov')) && appAdelante(), '«Atrás» cierra el chat y la app sigue abierta');
  });
  await paso('Configuración', async () => {
    await p.click('#nav-config'); await wait(900);
    await foto('12-configuracion', 'Configuración', TABS, { arribaDeTodo: true });
    await p.click('#view [data-bloqueados]'); await wait(1200);
    await foto('13-personas-bloqueadas', 'Configuración → Personas bloqueadas', { arriba: TABS.arriba, abajo: '#blockHost .sheet button' });
    await atras();
    revisar(!(await p.$('#blockHost .sheet')) && await visible('#view [data-bloqueados]') && appAdelante(), '«Atrás» cierra «Personas bloqueadas», queda Configuración y la app sigue abierta');
    await foto('14-atras-cerro-hoja', 'Después de «Atrás»: la hoja se cerró', TABS);
  });

  // ===== Coach =====
  await paso('Entrar como coach', async () => {
    await entrar(COACH, null, HANDLERS_COACH);
    await foto('15-coach-alumnos', 'Coach: lista de alumnos', COACH_B, { arribaDeTodo: true });
  });
  await paso('Ficha del alumno', async () => {
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(2000);
    revisar(/Ana Alumna/.test(await p.evaluate(() => document.getElementById('coachHost').innerText)), 'el coach abre la ficha del alumno');
    await foto('16-coach-ficha', 'Coach: ficha de un alumno', COACH_B);
  });

  // ===== Informe =====
  const lineas = [];
  for (const f of filas){
    const mal = f.b && !f.b.ok;
    if (mal) problemas.push('PROBLEMA: ' + f.nombre + '.png: ' + f.b.problemas.join('; '));
    lineas.push((mal ? 'PROBLEMA ' : 'OK       ') + f.nombre + '.png  ' + f.titulo + (f.b ? '\n           bordes: ' + (f.b.problemas.length ? f.b.problemas.join('; ') + ' · ' : '') + f.b.detalle : ''));
  }
  lineas.push('', 'Revisiones:', ...notas.map(s => '  ' + s), ...problemas.map(s => '  ' + s));
  if (dialogos.length) lineas.push('', 'Carteles de la página (alert/confirm; se tocó Cancelar): ' + dialogos.join(' | ') + ' (dialogo-N.png)');
  lineas.push('', 'Errores de JavaScript: ' + (errs.length ? errs.join(' | ') : 'ninguno'));
  if (pasosFallidos.length) lineas.push('', 'Pasos que no se pudieron hacer (ver fallo-*.png):', ...pasosFallidos.map(s => '  ' + s));
  return { lineas, problemas, fallo: pasosFallidos.length > 0 };
}
// Sin el lugar del WebView: arriba de todo si ocupa toda la pantalla, si no debajo de la barra.
function screen0(g, m){ const fin = g.barras && g.barras.estado ? g.barras.estado[3] : 0; return m.h * m.dpr >= ((g.pantalla && g.pantalla.alto) || 0) - 2 ? 0 : fin; }

// El celular por adb (el emulador del workflow).
export function dispositivoAndroid(){
  const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 90000 });
  return {
    adb,
    captura: f => fs.writeFileSync(f, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20, timeout: 90000 })),
    abrirApp: () => adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity'),
    tecla: n => adb('shell', 'input', 'keyevent', String(n)),
    tocar: (x, y) => adb('shell', 'input', 'tap', String(x), String(y)),
    escribir: s => adb('shell', 'input', 'text', s.replace(/ /g, '%s')),
    geometria(){
      const w = adb('shell', 'dumpsys', 'window');
      let top = ''; try { top = adb('shell', 'dumpsys', 'activity', 'top'); } catch (e) {}
      return { pantalla: tamanoPantalla(adb('shell', 'wm', 'size')), barras: barrasDelSistema(w), webview: vistaWebView(top, PKG), foco: ventanaConFoco(w) };
    },
    ui(){ try { adb('shell', 'uiautomator', 'dump', '/sdcard/gize-ui.xml'); return adb('shell', 'cat', '/sdcard/gize-ui.xml'); } catch (e) { return ''; } },
    teclado: () => { try { return /mInputShown=true|mIsInputViewShown=true|isInputViewShown=true/.test(adb('shell', 'dumpsys', 'input_method')); } catch (e) { return false; } },
    vivo: () => { try { return !!adb('shell', 'pidof', PKG).trim(); } catch (e) { return false; } },
  };
}

// Se conecta al WebView de la app: con el soporte de Android de Playwright y, si no anda, por el
// socket de DevTools del WebView (adb forward) con connectOverCDP.
async function conectar(dev){
  const pw = await import(process.env.PW || 'playwright');
  try {
    const [d] = await pw._android.devices();
    if (!d) throw new Error('adb no ve el emulador');
    const wv = await d.webView({ pkg: PKG }, { timeout: 60000 });
    const p = await wv.page();
    if (!p) throw new Error('el WebView no tiene página');
    return { p, modo: 'Playwright _android', cerrar: () => d.close() };
  } catch (e) {
    console.log('Playwright _android no se pudo conectar (' + e.message.split('\n')[0] + '): se prueba con adb forward y connectOverCDP');
    const pid = dev.adb('shell', 'pidof', PKG).trim();
    dev.adb('forward', 'tcp:9333', 'localabstract:webview_devtools_remote_' + pid);
    const b = await pw.chromium.connectOverCDP('http://127.0.0.1:9333');
    const p = b.contexts()[0].pages()[0];
    if (!p) throw new Error('el WebView no tiene página');
    return { p, modo: 'connectOverCDP (adb forward)', cerrar: () => b.close() };
  }
}

async function main(){
  const salida = process.env.SALIDA || 'capturas-emulador', dev = dispositivoAndroid();
  fs.mkdirSync(salida, { recursive: true });
  const inf = ['', '== Parte B: recorrido con la versión de prueba (debug) y Supabase simulado =='];
  let fallo = false;
  dev.adb('logcat', '-c');
  dev.adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await wait(4000);
  let con = null;
  try { con = await conectar(dev); }
  catch (e) { inf.push('No se pudo conectar al WebView de la app: ' + e.message.split('\n')[0]); fallo = true; }
  if (con){
    inf.push('Conexión al WebView: ' + con.modo + ' · ' + await con.p.evaluate(() => navigator.userAgent));
    const ctx = con.p.context(), sb = { user: null, handlers: {}, calls: [] }, externos = [];
    con.p.setDefaultTimeout(15000);
    // Supabase simulado (tests/lib.mjs), su Realtime sin conexión y nada más afuera de la app.
    await ctx.route(/supabase\.co/, r => supabaseFalso(sb)(r));
    await ctx.routeWebSocket(/supabase\.co/, ws => { sb.calls.push('WS ' + new URL(ws.url()).pathname); });
    await ctx.route(u => /^https?:/.test(u.href) && !/^https?:\/\/localhost[:/]/.test(u.href) && !/supabase\.co/.test(u.href), r => { externos.push(r.request().url()); return r.abort(); });
    const r = await recorrido({ p: con.p, dev, salida, sb });
    inf.push(...r.lineas);
    for (const s of r.problemas) console.log('::warning::' + s.replace(/^PROBLEMA: /, ''));
    fallo = fallo || r.fallo;
    const sup = sb.calls.length, ws = sb.calls.filter(c => c.startsWith('WS ')).length;
    inf.push('', 'Supabase: ' + sup + ' pedidos, todos simulados (' + ws + ' de Realtime sin conectar); a otros sitios: ' + externos.length + ' (cortados)' + (externos.length ? ': ' + [...new Set(externos.map(u => new URL(u).host))].join(', ') : ''));
    await con.cerrar().catch(() => {});
  }
  // ¿Se cerró o se cayó la app en el camino?
  const vivo = dev.vivo();
  const caidas = fallas(dev.adb('logcat', '-d', '-v', 'threadtime'), PKG);
  inf.push('', 'La app sigue abierta al final: ' + (vivo ? 'sí' : 'NO'), 'Fallas en logcat: ' + (caidas.length ? '\n' + caidas.map(l => '  ' + l).join('\n') : 'ninguna'));
  if (!vivo || caidas.length){ fallo = true; console.log('::error::La app ' + (caidas.length ? 'se cayó (ver informe.txt)' : 'se cerró') + ' durante el recorrido'); }
  fs.appendFileSync(path.join(salida, 'informe.txt'), inf.join('\n') + '\n');
  console.log(inf.join('\n'));
  process.exit(fallo ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
