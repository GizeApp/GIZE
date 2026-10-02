// App en segundo plano: un solo lugar que avisa a todos (fondo animado, reloj de main.js,
// chat) para que no quede nada andando con el celular en el bolsillo.
// - Capacitor manda "pause"/"resume" al document en Android Y en iPhone (el puente nativo los
//   dispara al pasar a segundo plano / volver); visibilitychange no siempre llega en el WebView.
// - Por las dudas también se escucha el plugin App (@capacitor/app, ya instalado): en iOS
//   WKWebView a veces el evento del document llega tarde. Los avisos repetidos no hacen nada.
// - En la web alcanza con visibilitychange.
// html.app-pausada frena todas las animaciones CSS (css/ui/lite.css).

let paused = false;
const subs = [];

let lastAway = document.visibilityState === "hidden";
// Avisa solo cuando cambia (pause y visibilitychange suelen llegar juntos).
function emit(){
  const away = appAway(); if(away === lastAway) return; lastAway = away;
  subs.slice().forEach(fn => { try { fn(away); } catch(e){} });
}

function setPaused(p){
  if(p === paused) return;
  paused = p;
  document.documentElement.classList.toggle("app-pausada", p);
  emit();
}

// Pausada por Capacitor (no mira la pestaña oculta).
export function appPaused(){ return paused; }
// Afuera: pausada o con la pestaña/pantalla oculta. Ahí no se dibuja ni se consulta nada.
export function appAway(){ return paused || document.visibilityState === "hidden"; }
// fn(away) cada vez que la app se va o vuelve (pause/resume o visibilitychange).
export function onAwayChange(fn){ if(!subs.includes(fn)) subs.push(fn); }

document.addEventListener("pause", () => setPaused(true));
document.addEventListener("resume", () => setPaused(false));
document.addEventListener("visibilitychange", emit);
try {
  const C = window.Capacitor, App = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.App;
  if(App && App.addListener){
    [["pause", true], ["resume", false]].forEach(([ev, p]) => {
      const r = App.addListener(ev, () => setPaused(p));
      if(r && r.catch) r.catch(() => {});
    });
  }
} catch(e){}
