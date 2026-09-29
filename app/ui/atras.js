// Botón / gesto «Atrás» en la app de Android (Capacitor).
//
// El plugin App de Capacitor se queda con el «Atrás» del celular: si la app no lo escucha,
// solo retrocede en el historial del WebView (y como casi no hay historial, no hacía nada).
// Acá se hace lo de cualquier app de Android:
//   1. si hay una ventana u hoja abierta, se cierra (se toca su propio botón de cerrar, así
//      pasa lo mismo que si la persona lo tocara: avisos de cambios sin guardar, etc.);
//   2. si no, se vuelve a la pantalla anterior (una sección → la pantalla, una pestaña → Entreno);
//   3. y si ya está en el inicio, la app pasa a segundo plano (como Android 12 en adelante).

// De la ventana de más arriba a la de más abajo: se toca la primera que se ve.
const CERRAR = [
  '.crp .crp-cancel',                            // acomodar la foto de perfil
  '.adm-zoom',                                   // panel: foto de un producto agrandada (se cierra con un toque)
  '#timePick [data-tp="close"]',                 // rueda de la hora / temporizador
  '[data-action="scan-close"]',                  // escáner con la cámara
  '#chatHost [data-chat="close"]',               // chat con el coach
  '#fbHost [data-action="fb-skip"]',             // «¡Entreno terminado!»
  '#applyMount [data-coach="ap-back"]',          // coach: aplicar / copiar rutina
  '#applyMount [data-coach$="-cancel"]',
  '#planSheetHost .cp-x[data-plan="close"]',     // coach: «Mi plan»
  '#coachSheetHost [data-cp="cancel"]',          // coach: selector de ejercicios
  '#coachSheetHost [data-coach="settings-cancel"]',
  '#coachSheetHost [data-coach="q-close"]',
  '#streakHost [data-action="streak-close"]',    // racha
  '#sheetHost [data-action="search-close"]',     // hojas de abajo (alimento, ejercicio, hábito…)
  '#sheetHost [data-action$="-cancel"]',
  '#adminHost [data-adm="close"]',
  '[data-coach="wk-close"]',                     // coach: semana abierta del plan
  '.form-back',                                  // «‹» de las secciones (Mi plan, meta, Progreso…)
  '[data-action="ci-close"]',                    // check-in semanal
  '[data-action="cfg-name-cancel"]',             // editar el nombre
  '[data-coach="tpl-back"]',                     // coach: editor de rutina → ficha
  '[data-coach="back"]',                         // coach: ficha del alumno → lista
];

const visible = el => !!(el && el.isConnected && el.getClientRects().length);

// Hace lo que corresponde a un «Atrás». Devuelve true si cerró o volvió a algo.
export function handleBack(){
  for (const sel of CERRAR) {
    const b = [...document.querySelectorAll(sel)].find(visible);
    if (b) { b.click(); return true; }
  }
  // Una pestaña que no es la de inicio: volver a Entreno. No con el panel del coach ni el
  // inicio de sesión encima (las pestañas del alumno quedan tapadas debajo).
  const tapa = ["coachHost", "authHost"].some(id => visible(document.getElementById(id)));
  const home = document.getElementById("nav-entreno");
  if (!tapa && visible(home) && !home.classList.contains("active")) { home.click(); return true; }
  return false;
}

export function initBackButton(){
  let cap = null;
  try { cap = window.Capacitor; } catch (e) {}
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform() || !cap.getPlatform || cap.getPlatform() !== "android") return;
  const App = cap.Plugins && cap.Plugins.App;
  if (!App || !App.addListener) return;
  try {
    App.addListener("backButton", ev => {
      if (handleBack()) return;
      if (ev && ev.canGoBack) { history.back(); return; }
      try { (App.minimizeApp ? App.minimizeApp() : App.exitApp()).catch(() => { try { App.exitApp(); } catch (e) {} }); } catch (e) {}
    });
  } catch (e) {}
}
