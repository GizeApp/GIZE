// Ayudas del workflow «Android en emulador» (scripts/android-emulador.mjs): leen lo que devuelven
// logcat, dumpsys, «wm size» y uiautomator en el emulador. Se prueban con salidas de ejemplo de
// Android 11 (API 30) y Android 15 (API 35):
// - fallas: solo las caídas de GIZE (Java, nativas y «no responde»), no las de otras apps, aunque
//   se mezclen líneas de otros procesos;
// - permisos: solo las líneas de permisos de «dumpsys package», por sección y sin repetir;
// - barrasDelSistema, tamanoPantalla, vistaWebView: dónde están las barras de Android y el
//   WebView de la app en la pantalla;
// - bordes: la cabecera no puede quedar debajo de la barra de estado ni la barra de abajo de la
//   app debajo de la de navegación (Android 15 dibuja de borde a borde);
// - puntoEnPantalla, botonEnPantalla, ventanaConFoco: dónde tocar y qué ventana está adelante.
import { fallas, lineaLogcat, permisos, barrasDelSistema, tamanoPantalla, vistaWebView, bordes, puntoEnPantalla, botonEnPantalla, ventanaConFoco } from '../scripts/android-emulador.mjs';

const PKG = 'ar.com.gize.app';
const L = (pid, nivel, tag, msg) => `10-10 12:00:00.123  ${pid}  ${pid} ${nivel} ${tag}: ${msg}`;

export default async function ({ t }){
  // ===== fallas =====
  t.eq(lineaLogcat(L(4321, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main')), { pid: '4321', nivel: 'E', tag: 'AndroidRuntime', msg: 'FATAL EXCEPTION: main' }, 'lee una línea de «logcat -v threadtime»');
  t.eq(lineaLogcat('E/AndroidRuntime( 4321): FATAL EXCEPTION: main'), { pid: '4321', nivel: 'E', tag: 'AndroidRuntime', msg: 'FATAL EXCEPTION: main' }, 'y una del formato corto');
  t.eq(lineaLogcat('--------- beginning of crash'), null, 'lo que no es una línea de logcat da null');

  const nuestra = [
    L(4321, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main'),
    L(4321, 'E', 'AndroidRuntime', 'Process: ar.com.gize.app, PID: 4321'),
    L(555, 'I', 'ActivityManager', 'algo de otro proceso en el medio'),
    L(4321, 'E', 'AndroidRuntime', 'java.lang.RuntimeException: Unable to start activity'),
    L(4321, 'E', 'AndroidRuntime', '\tat ar.com.gize.app.MainActivity.onCreate(MainActivity.java:20)'),
    L(4321, 'I', 'Process', 'Sending signal. PID: 4321 SIG: 9'),
  ];
  const otra = [
    L(777, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main'),
    L(777, 'E', 'AndroidRuntime', 'Process: com.android.otra, PID: 777'),
    L(777, 'E', 'AndroidRuntime', 'java.lang.NullPointerException'),
  ];
  // Un paquete que empieza igual no es GIZE.
  const parecida = [L(888, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main'), L(888, 'E', 'AndroidRuntime', 'Process: ar.com.gize.appx, PID: 888')];
  t.eq(fallas(otra.concat(nuestra, parecida).join('\n'), PKG), [nuestra[0], nuestra[1], nuestra[3], nuestra[4]], 'la caída de Java de GIZE, sin las líneas de otros procesos ni las de otras apps');
  t.eq(fallas(otra.concat(parecida).join('\n'), PKG), [], 'si solo se cayó otra app, no hay fallas de GIZE');
  t.eq(fallas('', PKG), [], 'logcat vacío: sin fallas');
  // Un proceso aparte de la app (ar.com.gize.app:otro) también es GIZE.
  const sub = [L(999, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: pool-1'), L(999, 'E', 'AndroidRuntime', 'Process: ar.com.gize.app:remoto, PID: 999')];
  t.eq(fallas(sub.join('\r\n'), PKG), sub, 'también un proceso aparte de la app (con fin de línea \\r\\n)');
  // Nativa: el aviso de libc y el informe de crash_dump (hasta la pila).
  const nativa = [
    L(4321, 'F', 'libc', 'Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid 4400 (RenderThread), pid 4321 (ar.com.gize.app)'),
    L(5000, 'F', 'DEBUG', '*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***'),
    L(5000, 'F', 'DEBUG', 'pid: 4321, tid: 4400, name: RenderThread  >>> ar.com.gize.app <<<'),
    L(5000, 'F', 'DEBUG', 'uid: 10190'),
    L(5000, 'F', 'DEBUG', 'signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0'),
    L(5000, 'F', 'DEBUG', 'backtrace:'),
    L(5000, 'F', 'DEBUG', '      #00 pc 0000000000012345  /system/lib64/libc.so'),
  ];
  t.eq(fallas(nativa.join('\n'), PKG), [nativa[0], nativa[2], nativa[3], nativa[4]], 'la caída nativa: el aviso de libc y el informe hasta la pila');
  const nativaOtra = [L(4321, 'F', 'libc', 'Fatal signal 6 (SIGABRT) in tid 1 (main), pid 1 (com.android.otra)'), L(5000, 'F', 'DEBUG', 'pid: 1, tid: 1, name: main  >>> com.android.otra <<<')];
  t.eq(fallas(nativaOtra.join('\n'), PKG), [], 'la caída nativa de otra app no cuenta');
  const anr = [L(600, 'E', 'ActivityManager', 'ANR in ar.com.gize.app (ar.com.gize.app/.MainActivity)'), L(600, 'E', 'ActivityManager', 'PID: 4321'),
    L(600, 'E', 'ActivityManager', 'Reason: Input dispatching timed out'), L(600, 'E', 'ActivityManager', 'Parent: ar.com.gize.app/.MainActivity'), L(600, 'E', 'ActivityManager', 'Load: 3.2')];
  t.eq(fallas(anr.join('\n'), PKG), anr.slice(0, 4), '«ANR in» (no responde) de GIZE con las tres líneas que lo explican');
  t.eq(fallas(L(600, 'E', 'ActivityManager', 'ANR in com.android.systemui'), PKG), [], 'el «no responde» de otra app no cuenta');

  // ===== permisos =====
  const paquete = `Packages:
  Package [ar.com.gize.app] (8c1d2e3):
    userId=10190
    declared permissions:
      ar.com.gize.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION: prot=signature, INSTALLED
    requested permissions:
      android.permission.INTERNET
      android.permission.CAMERA
      android.permission.POST_NOTIFICATIONS
    install permissions:
      android.permission.INTERNET: granted=true
    User 0: ceDataInode=12345 installed=true hidden=false
      gids=[3003]
      runtime permissions:
        android.permission.POST_NOTIFICATIONS: granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED|USER_SENSITIVE_WHEN_DENIED]
        android.permission.CAMERA: granted=false
      enabledComponents:
Queries:
    requested permissions:
      android.permission.INTERNET
`;
  t.eq(permisos(paquete), [
    'declared permissions:', '  ar.com.gize.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION: prot=signature, INSTALLED',
    'requested permissions:', '  android.permission.INTERNET', '  android.permission.CAMERA', '  android.permission.POST_NOTIFICATIONS',
    'install permissions:', '  android.permission.INTERNET: granted=true',
    'runtime permissions:', '  android.permission.POST_NOTIFICATIONS: granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED|USER_SENSITIVE_WHEN_DENIED]', '  android.permission.CAMERA: granted=false',
  ], 'de dumpsys package quedan solo los permisos, por sección y sin repetir');
  t.eq(permisos(''), [], 'sin dumpsys: nada');

  // ===== barras, pantalla y WebView =====
  const win35 = `  mCurrentFocus=Window{8f7e6d5 u0 ar.com.gize.app/ar.com.gize.app.MainActivity}
      InsetsSource id=3e3d0000 type=statusBars frame=[0,0][0,0] visible=false
      InsetsSource id=3e3d0001 type=statusBars frame=[0,0][1080,136] visible=true flags= sideHint=TOP
      InsetsSource id=3e3d0005 type=mandatorySystemGestures frame=[0,0][1080,170] visible=true
      InsetsSource id=5a0b0001 type=navigationBars frame=[0,2337][1080,2400] visible=true`;
  // Android 15 con el recorte de la cámara más alto que la barra de estado.
  const win35r = `      InsetsSource id=3e3d0001 type=statusBars frame=[0,0][1080,63] visible=true
      InsetsSource id=1 type=displayCutout frame=[0,0][1080,128] visible=true
      InsetsSource id=5a0b0001 type=navigationBars frame=[0,2337][1080,2400] visible=true`;
  const win30 = `      mSource=InsetsSource type=ITYPE_STATUS_BAR frame=[0,0][1080,63] visible=true
      mSource=InsetsSource type=ITYPE_EXTRA_NAVIGATION_BAR frame=[0,0][0,0] visible=true
      mSource=InsetsSource type=ITYPE_NAVIGATION_BAR frame=[0,2214][1080,2340] visible=true
  mCurrentFocus=Window{1a2b3c u0 com.google.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity}`;
  t.eq(barrasDelSistema(win35), { estado: [0, 0, 1080, 136], navegacion: [0, 2337, 1080, 2400], recorte: null }, 'barras de Android 15 (statusBars / navigationBars, sin las vacías)');
  t.eq(barrasDelSistema(win30), { estado: [0, 0, 1080, 63], navegacion: [0, 2214, 1080, 2340], recorte: null }, 'barras de Android 11 (ITYPE_…)');
  t.eq(barrasDelSistema(win35r), { estado: [0, 0, 1080, 63], navegacion: [0, 2337, 1080, 2400], recorte: [0, 0, 1080, 128] }, 'y el recorte de la cámara (displayCutout)');
  t.eq(barrasDelSistema(''), { estado: null, navegacion: null, recorte: null }, 'sin dumpsys: sin barras');
  t.eq(ventanaConFoco(win35), 'ar.com.gize.app/ar.com.gize.app.MainActivity', 'la ventana con el foco es la app');
  t.eq(ventanaConFoco(win30), 'com.google.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity', 'o el pedido de permiso de Android');
  t.eq(ventanaConFoco(''), '', 'sin dumpsys: ninguna');
  t.eq(tamanoPantalla('Physical size: 1080x2400\r\n'), { ancho: 1080, alto: 2400 }, 'tamaño de la pantalla');
  t.eq(tamanoPantalla('Physical size: 1080x2400\nOverride size: 720x1600'), { ancho: 720, alto: 1600 }, 'si se cambió, el que se usa');
  t.eq(tamanoPantalla('error'), null, 'sin tamaño: null');

  const otraTarea = `TASK 1 id=1 userId=0
  ACTIVITY com.google.android.apps.nexuslauncher/.NexusLauncherActivity 1a2b pid=900
    View Hierarchy:
      DecorView@aaa[NexusLauncherActivity]
        android.webkit.WebView{111 V.E...... ........ 5,5-50,50}
`;
  const top35 = otraTarea + `TASK 10 id=12 userId=0
  ACTIVITY ar.com.gize.app/.MainActivity 4f1e2d3 pid=4321 userId=0 uid=10190
    Local Activity 1d2c3b4 State:
      mResumed=true mStopped=false mFinished=false
    View Hierarchy:
      DecorView@b2e2a6e[MainActivity]
        android.widget.LinearLayout{97e3d0f V.E...... ........ 0,0-1080,2400}
          android.view.ViewStub{b0e119c G.E...... ......I. 0,0-0,0 #10201b6 android:id/action_mode_bar_stub}
          android.widget.FrameLayout{b5e9da5 V.E...... ........ 0,0-1080,2400}
            androidx.appcompat.widget.ActionBarOverlayLayout{5b4c77a V.E...... ........ 0,0-1080,2400 #7f0800a4 app:id/decor_content_parent}
              androidx.appcompat.widget.ContentFrameLayout{4a9d32b V.E...... ........ 0,0-1080,2400 #1020002 android:id/content}
                androidx.coordinatorlayout.widget.CoordinatorLayout{8dd5f88 V.E...... ........ 0,0-1080,2400}
                  com.getcapacitor.CapacitorWebView{5cf6f21 VFEDHVC.. .F...... 0,136-1080,2337 #7f080277 app:id/webview}
              androidx.appcompat.widget.ActionBarContainer{1234 V.ED..... ........ 0,0-1080,0 #7f080045 app:id/action_bar_container}
`;
  t.eq(vistaWebView(top35, PKG), [0, 136, 1080, 2337], 'el WebView de la app (Android 15, con márgenes para las barras), no el de otra app');
  // Android 11: la ventana deja lugar para la barra de estado más arriba en el árbol.
  const top30 = `  ACTIVITY ar.com.gize.app/.MainActivity 4f1e2d3 pid=4321
    View Hierarchy:
      DecorView@b2e2a6e[MainActivity]
        android.widget.LinearLayout{97e3d0f V.E...... ........ 0,0-1080,2340}
          android.widget.FrameLayout{b5e9da5 V.E...... ........ 0,63-1080,2214}
            androidx.coordinatorlayout.widget.CoordinatorLayout{8dd5f88 V.E...... ........ 10,0-1070,2151}
              com.getcapacitor.CapacitorWebView{5cf6f21 VFEDHVC.. .F...... 0,0-1060,2151 #7f080277 app:id/webview}
`;
  t.eq(vistaWebView(top30, PKG), [10, 63, 1070, 2214], 'Android 11: suma los corrimientos de las vistas de arriba');
  t.eq(vistaWebView(otraTarea, PKG), null, 'sin la actividad de GIZE: null');
  t.eq(vistaWebView('', PKG), null, 'sin dumpsys: null');

  // ===== tocar =====
  t.eq(puntoEnPantalla({ left: 10, top: 700, width: 300, height: 40 }, [0, 136, 1080, 2337], 2.625), [420, 2026], 'el centro de un elemento en píxeles de la pantalla');
  const ui = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
<node index="1" text="Allow" resource-id="com.android.permissioncontroller:id/permission_allow_button" class="android.widget.Button" bounds="[126,1300][954,1420]" />
<node index="2" text="Don&apos;t allow" resource-id="com.android.permissioncontroller:id/permission_deny_button" class="android.widget.Button" bounds="[126,1440][954,1560]" />
<node index="3" text="Cancelar" resource-id="android:id/button2" class="android.widget.Button" bounds="[600,1600][800,1700]" /></node></hierarchy>`;
  t.eq(botonEnPantalla(ui, { id: 'com.android.permissioncontroller:id/permission_allow_button' }), [540, 1360], 'el botón «Permitir» por su id');
  t.eq(botonEnPantalla(ui, { textos: ['Cancelar'] }), [700, 1650], 'o por su texto');
  t.eq(botonEnPantalla(ui, { id: 'android:id/button1', textos: ['OK'] }), null, 'si no está: null');
  t.eq(botonEnPantalla('', { id: 'x' }), null, 'sin uiautomator: null');

  // ===== bordes =====
  const barras35 = barrasDelSistema(win35), pantalla = { ancho: 1080, alto: 2400 };
  const m = o => Object.assign({ dpr: 2.625, inner: [411.4, 770.3], screen: [411.4, 914.3], sa: { top: 0, right: 0, bottom: 0, left: 0 }, arriba: { top: 16, bottom: 50 }, abajo: { top: 700, bottom: 758 } }, o);
  const bien = bordes({ pantalla, barras: barras35, webview: [0, 136, 1080, 2337], m: m() });
  t.ok(bien.ok && !bien.problemas.length, 'WebView entre las dos barras: bien: ' + bien.detalle);
  t.ok(/cabecera desde y=178/.test(bien.detalle) && /abajo hasta y=2126/.test(bien.detalle), 'y dice dónde quedan la cabecera y lo de abajo: ' + bien.detalle);
  // De borde a borde sin márgenes ni safe-area: la cabecera y la barra de abajo quedan tapadas.
  const tapada = bordes({ pantalla, barras: barras35, webview: [0, 0, 1080, 2400], m: m({ inner: [411.4, 914.3], abajo: { top: 840, bottom: 905 } }) });
  t.ok(!tapada.ok, 'WebView de borde a borde sin safe-area: problema');
  t.eq(tapada.problemas, ['la cabecera queda debajo de la barra de estado (empieza en y=42, la barra termina en y=136)',
    'lo de abajo queda debajo de la barra de navegación (termina en y=2376, la barra empieza en y=2337)'], 'dice qué queda tapado y dónde');
  t.ok(/arranca debajo de la barra de estado y env\(safe-area-inset-top\) es 0/.test(tapada.detalle), 'y que el WebView arranca debajo de la barra sin safe-area: ' + tapada.detalle);
  // De borde a borde pero con env(safe-area-inset-*): bien.
  const conSa = bordes({ pantalla, barras: barras35, webview: [0, 0, 1080, 2400], m: m({ inner: [411.4, 914.3], sa: { top: 51.8, right: 0, bottom: 24, left: 0 }, arriba: { top: 67.8, bottom: 100 }, abajo: { top: 820, bottom: 878 } }) });
  t.ok(conSa.ok, 'de borde a borde con safe-area: bien: ' + conSa.problemas.join('; '));
  // Sin el lugar del WebView: se estima con lo que mide la página.
  const est = bordes({ pantalla, barras: barras35, webview: null, m: m({ inner: [411.4, 914.3] }) });
  t.ok(!est.ok && /\(estimado\)/.test(est.detalle) && /empieza en y=42/.test(est.problemas[0]), 'sin el WebView, si ocupa toda la pantalla se toma desde arriba: ' + est.detalle);
  const est2 = bordes({ pantalla, barras: barras35, webview: null, m: m() });
  t.ok(est2.ok && /WebView y=136\.\.2158 \(estimado\)/.test(est2.detalle), 'y si no, debajo de la barra de estado: ' + est2.detalle);
  // Con el recorte de la cámara más alto que la barra de estado, arriba manda el recorte.
  const recorte = bordes({ pantalla, barras: barrasDelSistema(win35r), webview: [0, 63, 1080, 2337], m: m({ arriba: { top: 20, bottom: 50 } }) });
  t.eq(recorte.problemas, ['la cabecera queda debajo de la barra de estado (empieza en y=116, la barra termina en y=128)'], 'la cabecera debajo del recorte de la cámara es un problema');
  t.ok(bordes({ pantalla, barras: barrasDelSistema(win35r), webview: [0, 128, 1080, 2337], m: m() }).ok, 'y debajo del recorte, bien');
  // Pantallas sin cabecera o sin barra de abajo: no se revisa eso.
  t.ok(bordes({ pantalla, barras: barras35, webview: [0, 0, 1080, 2400], m: m({ arriba: null, abajo: null }) }).ok, 'sin cabecera ni barra de abajo para medir: nada que marcar');
}
