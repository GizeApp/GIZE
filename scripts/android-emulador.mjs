// Ayudas del workflow «Android en emulador» (.github/workflows/android-emulador.yml) y del
// recorrido por la app (scripts/android-recorrido.mjs). Son funciones puras: leen lo que
// devuelven adb, logcat y dumpsys (texto) y arman lo que va al informe. Las prueba
// tests/android-emulador.test.mjs.
// Desde el workflow se usa como programa:
//   node scripts/android-emulador.mjs fallas ar.com.gize.app logcat.txt   (sale con 1 si la app se cayó)
//   node scripts/android-emulador.mjs permisos dumpsys-package.txt
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Una línea de logcat: «-v threadtime» (10-10 12:00:00.123  1234  1250 E Etiqueta: texto) o el
// formato corto (E/Etiqueta( 1234): texto). Devuelve { pid, nivel, tag, msg } o null.
export function lineaLogcat(l){
  let m = l.match(/^\d\d-\d\d\s+\d\d:\d\d:\d\d\.\d+\s+(\d+)\s+\d+\s+([VDIWEFA])\s+(.*?)\s*: (.*)$/);
  if (m) return { pid: m[1], nivel: m[2], tag: m[3].trim(), msg: m[4] };
  m = l.match(/^([VDIWEFA])\/(.*?)\(\s*(\d+)\): (.*)$/);
  if (m) return { pid: m[3], nivel: m[1], tag: m[2].trim(), msg: m[4] };
  return null;
}

// Las líneas de logcat de las caídas de la app (y solo de ella): la excepción de Java («FATAL
// EXCEPTION» de AndroidRuntime, con su «Process: <paquete>»), la caída de código nativo (el
// informe de crash_dump con «>>> <paquete> <<<») y los «ANR in <paquete>» (no responde).
export function fallas(texto, pkg){
  const ls = String(texto || '').split(/\r?\n/), out = [];
  const esApp = s => s === pkg || s.startsWith(pkg + ':');
  for (let i = 0; i < ls.length; i++){
    const a = lineaLogcat(ls[i]);
    if (!a) continue;
    // Java: el bloque de AndroidRuntime de ese proceso que arranca en «FATAL EXCEPTION».
    if (a.tag === 'AndroidRuntime' && /^FATAL EXCEPTION/.test(a.msg)){
      // Las líneas de otros procesos que se meten en el medio no cuentan.
      const bloque = [ls[i]];
      for (let j = i + 1; j < ls.length && bloque.length < 200; j++){
        const b = lineaLogcat(ls[j]);
        if (!b || b.pid !== a.pid) continue;
        if (b.tag !== 'AndroidRuntime' || /^FATAL EXCEPTION/.test(b.msg)) break;
        bloque.push(ls[j]);
      }
      const proc = bloque.map(l => (lineaLogcat(l).msg.match(/^Process: ([^,\s]+)/) || [])[1]).find(Boolean);
      if (proc && esApp(proc)) out.push(...bloque);
      continue;
    }
    // Nativa: el aviso de libc («Fatal signal 11 (SIGSEGV) … pid 1234 (ar.com.gize.app)») y el
    // informe de crash_dump («pid: 1234, tid: 1234, name: …  >>> ar.com.gize.app <<<» y lo que
    // sigue: la señal y el mensaje, hasta la pila).
    const sen = a.msg.match(/^Fatal signal \d+ .* pid \d+ \(([^)]+)\)/);
    if (sen && esApp(sen[1])){ out.push(ls[i]); continue; }
    const nat = a.msg.match(/>>> (\S+) <<</);
    if (nat && esApp(nat[1])){
      out.push(ls[i]);
      for (let j = i + 1, n = 0; j < ls.length && n < 4; j++){
        const b = lineaLogcat(ls[j]);
        if (!b || b.pid !== a.pid) continue;
        if (/^backtrace:|^\s*#\d+ pc /.test(b.msg)) break;
        out.push(ls[j]); n++;
      }
      continue;
    }
    // No responde (ANR): la línea y las tres que la explican (PID, Reason, …).
    const anr = a.msg.match(/^ANR in (\S+)/);
    if (anr && esApp(anr[1])){
      out.push(ls[i]);
      for (let j = i + 1, n = 0; j < ls.length && n < 3; j++){
        const b = lineaLogcat(ls[j]);
        if (!b || b.pid !== a.pid || b.tag !== a.tag) continue;
        out.push(ls[j]); n++;
      }
    }
  }
  return out;
}

// De «dumpsys package <paquete>»: solo los permisos, por sección (los que declara, los que pide,
// los de instalación y los que el usuario da en tiempo de uso), sin repetir secciones.
export function permisos(texto){
  const ls = String(texto || '').split(/\r?\n/), out = [], vistas = new Set();
  for (let i = 0; i < ls.length; i++){
    const m = ls[i].match(/^(\s*)((?:declared|requested|install|runtime) permissions):\s*$/);
    if (!m || vistas.has(m[2])) continue;
    vistas.add(m[2]);
    out.push(m[2] + ':');
    for (let j = i + 1; j < ls.length; j++){
      const l = ls[j], ind = l.length - l.trimStart().length;
      if (!l.trim() || ind <= m[1].length || !/^[\w.]+(:|$)/.test(l.trim())) break;
      out.push('  ' + l.trim());
    }
  }
  return out;
}

// Un rectángulo [izq, arriba, der, abajo] de «[0,0][1080,136]».
const rect = (a, b, c, d) => [+a, +b, +c, +d];

// De «dumpsys window»: dónde están la barra de estado y la de navegación (o la de gestos), en
// píxeles de la pantalla. Android 11 y 12 las llaman ITYPE_STATUS_BAR / ITYPE_NAVIGATION_BAR, y
// desde Android 14, statusBars / navigationBars. Las que no aparecen (o miden 0) quedan en null.
export function barrasDelSistema(texto){
  const buscar = tipos => {
    const re = new RegExp('type=(?:' + tipos + ')\\s+frame=\\[(-?\\d+),(-?\\d+)\\]\\[(-?\\d+),(-?\\d+)\\]', 'g');
    for (const m of String(texto || '').matchAll(re)){
      const r = rect(m[1], m[2], m[3], m[4]);
      if (r[2] > r[0] && r[3] > r[1]) return r;
    }
    return null;
  };
  return { estado: buscar('ITYPE_STATUS_BAR|statusBars'), navegacion: buscar('ITYPE_NAVIGATION_BAR|navigationBars') };
}

// De «wm size»: el tamaño de la pantalla en píxeles (el que se esté usando, si se cambió).
export function tamanoPantalla(texto){
  const t = String(texto || '');
  const m = t.match(/Override size: (\d+)x(\d+)/) || t.match(/Physical size: (\d+)x(\d+)/);
  return m ? { ancho: +m[1], alto: +m[2] } : null;
}

// De «dumpsys activity top»: dónde está el WebView de la app en la pantalla, en píxeles
// [izq, arriba, der, abajo]. Cada vista dice su lugar dentro de la de arriba (la sangría marca
// quién está adentro de quién), así que se suman los corrimientos de todas las de arriba.
export function vistaWebView(texto, pkg){
  const ls = String(texto || '').split(/\r?\n/);
  let i = ls.findIndex(l => new RegExp('^\\s*ACTIVITY ' + pkg.replace(/\./g, '\\.') + '/').test(l));
  if (i < 0) return null;
  const pila = [];
  for (i++; i < ls.length; i++){
    const l = ls[i];
    if (/^\s*(ACTIVITY|TASK) /.test(l)) break;
    const m = l.match(/^(\s*)\S+\{[^}]*?\s(-?\d+),(-?\d+)-(-?\d+),(-?\d+)[\s}]/);
    const deco = /^(\s*)DecorView@/.exec(l);
    if (!m && !deco) continue;
    const ind = (m || deco)[1].length;
    while (pila.length && pila[pila.length - 1].ind >= ind) pila.pop();
    const padre = pila.length ? pila[pila.length - 1] : { x: 0, y: 0 };
    if (deco){ pila.push({ ind, x: 0, y: 0 }); continue; }
    const [l0, t0, r0, b0] = rect(m[2], m[3], m[4], m[5]);
    const x = padre.x + l0, y = padre.y + t0;
    if (/WebView\{/.test(l)) return [x, y, x + (r0 - l0), y + (b0 - t0)];
    pila.push({ ind, x, y });
  }
  return null;
}

// El centro de un elemento de la página (en px de CSS) en la pantalla del celular, para tocarlo
// con «adb shell input tap». webview: [izq, arriba, der, abajo] en píxeles; dpr: devicePixelRatio.
export function puntoEnPantalla(r, webview, dpr){
  return [Math.round(webview[0] + (r.left + r.width / 2) * dpr), Math.round(webview[1] + (r.top + r.height / 2) * dpr)];
}

// De «uiautomator dump»: el centro del primer nodo con ese resource-id (o ese texto), para tocarlo.
export function botonEnPantalla(xml, { id, textos = [] } = {}){
  for (const m of String(xml || '').matchAll(/<node\b[^>]*>/g)){
    const n = m[0], rid = (n.match(/resource-id="([^"]*)"/) || [])[1] || '', txt = (n.match(/\stext="([^"]*)"/) || [])[1] || '';
    if (!(id && rid === id) && !textos.some(t => t.toLowerCase() === txt.toLowerCase())) continue;
    const b = n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (b) return [Math.round((+b[1] + +b[3]) / 2), Math.round((+b[2] + +b[4]) / 2)];
  }
  return null;
}

// De «dumpsys window»: la ventana que tiene el foco (paquete/actividad), o ''.
export function ventanaConFoco(texto){
  const m = String(texto || '').match(/mCurrentFocus=Window\{\S+ \S+ ([^}\s]+)\}/);
  return m ? m[1] : '';
}

// Bordes de la pantalla (Android 15 y más dibujan la app de borde a borde): la cabecera no tiene
// que quedar debajo de la barra de estado ni la barra de abajo de la app debajo de la barra de
// navegación o de gestos. Todo en píxeles de la pantalla.
//   pantalla: { ancho, alto } · barras: lo de barrasDelSistema · webview: [izq, arriba, der, abajo]
//   (o null si no se pudo leer: se estima con lo que mide la página) · m: lo que midió la página
//   (dpr, inner [ancho, alto] y screen [ancho, alto] en px de CSS, sa: env(safe-area-inset-*),
//   arriba / abajo: { top, bottom } en px de CSS del elemento de más arriba y de más abajo, o null).
// Devuelve { ok, problemas: [...], detalle: '...' }.
export function bordes({ pantalla, barras, webview, m }){
  const dpr = m.dpr || 1, problemas = [], det = [];
  const finEstado = barras && barras.estado ? barras.estado[3] : 0;
  const altoPantalla = (pantalla && pantalla.alto) || Math.round(m.screen[1] * dpr);
  const iniNav = barras && barras.navegacion ? barras.navegacion[1] : altoPantalla;
  let wv = webview, estimado = false;
  if (!wv){
    // Sin el lugar del WebView: si ocupa toda la pantalla arranca en 0; si no, debajo de la barra.
    estimado = true;
    const alto = Math.round(m.inner[1] * dpr), arriba = alto >= altoPantalla - 2 ? 0 : finEstado;
    wv = [0, arriba, Math.round(m.inner[0] * dpr), arriba + alto];
  }
  det.push('WebView y=' + wv[1] + '..' + wv[3] + (estimado ? ' (estimado)' : '') + ', barras: estado hasta y=' + finEstado + ', navegación desde y=' + iniNav);
  det.push('safe-area arriba ' + r1(m.sa.top) + ' / abajo ' + r1(m.sa.bottom) + ' px CSS · innerHeight ' + r1(m.inner[1]) + ' de screen.height ' + r1(m.screen[1]));
  if (wv[1] < finEstado - 1 && !(m.sa.top > 0)) det.push('el WebView arranca debajo de la barra de estado y env(safe-area-inset-top) es 0');
  if (wv[3] > iniNav + 1 && !(m.sa.bottom > 0)) det.push('el WebView sigue debajo de la barra de navegación y env(safe-area-inset-bottom) es 0');
  if (m.arriba){
    const y = Math.round(wv[1] + m.arriba.top * dpr);
    if (y < finEstado - 1) problemas.push('la cabecera queda debajo de la barra de estado (empieza en y=' + y + ', la barra termina en y=' + finEstado + ')');
    else det.push('cabecera desde y=' + y);
  }
  if (m.abajo){
    const y = Math.round(wv[1] + m.abajo.bottom * dpr);
    if (y > iniNav + 1) problemas.push('lo de abajo queda debajo de la barra de navegación (termina en y=' + y + ', la barra empieza en y=' + iniNav + ')');
    else det.push('abajo hasta y=' + y);
  }
  return { ok: !problemas.length, problemas, detalle: det.join(' · ') };
}
const r1 = n => Math.round(n * 10) / 10;

// Programa (desde el workflow).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'fallas'){
    const ls = fallas(fs.readFileSync(b, 'utf8'), a);
    if (ls.length) console.log(ls.join('\n'));
    process.exit(ls.length ? 1 : 0);
  } else if (cmd === 'permisos'){
    console.log(permisos(fs.readFileSync(a, 'utf8')).join('\n'));
  } else {
    console.error('Uso: node scripts/android-emulador.mjs fallas <paquete> <logcat.txt> | permisos <dumpsys.txt>');
    process.exit(2);
  }
}
