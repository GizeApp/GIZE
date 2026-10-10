// En qué equipo corre GIZE, para lo de Cardio que cambia según dónde se abre:
// · appAndroid(): la app de Android (Capacitor; html.android-app, ver app/lite.js). Ahí no hay
//   NADA de ubicación: ni salidas con GPS, ni mapas, ni el dibujo del recorrido. El plugin de
//   ubicación ni siquiera va en el build de Android (capacitor.config.json android.includePlugins)
//   y el manifiesto no declara ningún permiso de ubicación. Las salidas medidas en el iPhone o en
//   la web se ven solo con sus números (distancia, tiempo, ritmo, calorías y fecha).
// · navegadorAndroid(): la web abierta en un navegador de Android (Chrome, Samsung Internet…,
//   también en «Sitio de escritorio», como vienen las tablets grandes). Las
//   salidas con GPS andan como siempre, pero sin el mapa de calles (ui/mapa.js canUseMap): el
//   recorrido va sobre el fondo propio, con la grilla, la escala y las marcas de cada km.
// · iPhone (app y Safari) y la compu: todo, con el mapa de calles.
export function appAndroid(){
  try {
    const C = window.Capacitor;
    return !!((C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === "android") || window.androidBridge);
  } catch (e) { return false; }
}
// Además de «Android» en el userAgent, cuenta el «Sitio de escritorio» (Chrome lo pone solo en las
// tablets de 10" o más, Samsung Internet en las Galaxy Tab, y cualquiera lo puede prender desde el
// menú): ahí el navegador dice ser una compu con Linux. Se reconoce por userAgentData (si dice
// Android), por Samsung Internet, o por Linux (que no sea una Chromebook) con pantalla táctil. Una
// compu con Linux y pantalla táctil, que es rara, se queda sin el mapa de calles (el GPS sigue).
export function navegadorAndroid(){
  try {
    const C = window.Capacitor;
    if (appAndroid() || (C && C.isNativePlatform && C.isNativePlatform())) return false;
    const ua = navigator.userAgent || "", d = navigator.userAgentData;
    if (/Android/i.test(ua) || (d && /android/i.test(d.platform || ""))) return true;
    return /\bLinux\b/i.test(ua) && !/CrOS/i.test(ua) && (/SamsungBrowser/i.test(ua) || navigator.maxTouchPoints > 0);
  } catch (e) { return false; }
}
