import { appPaused, onAwayChange } from './pausa.js';

export function auCreateNoise(){
  const permutation=[151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  const p=new Array(512);
  for(let i=0;i<256;i++){ p[256+i]=p[i]=permutation[i]; }
  const fade=t=>t*t*t*(t*(t*6-15)+10);
  const lerp=(t,a,b)=>a+t*(b-a);
  const grad=(hash,x,y,z)=>{ const h=hash&15; const u=h<8?x:y; const v=h<4?y:(h===12||h===14?x:z); return ((h&1)===0?u:-u)+((h&2)===0?v:-v); };
  return { simplex3:(x,y,z)=>{
    const X=Math.floor(x)&255, Y=Math.floor(y)&255, Z=Math.floor(z)&255;
    x-=Math.floor(x); y-=Math.floor(y); z-=Math.floor(z);
    const u=fade(x), v=fade(y), w=fade(z);
    const A=p[X]+Y, AA=p[A]+Z, AB=p[A+1]+Z, B=p[X+1]+Y, BA=p[B]+Z, BB=p[B+1]+Z;
    return lerp(w, lerp(v, lerp(u,grad(p[AA],x,y,z),grad(p[BA],x-1,y,z)), lerp(u,grad(p[AB],x,y-1,z),grad(p[BB],x-1,y-1,z))),
                   lerp(v, lerp(u,grad(p[AA+1],x,y,z-1),grad(p[BA+1],x-1,y,z-1)), lerp(u,grad(p[AB+1],x,y-1,z-1),grad(p[BB+1],x-1,y-1,z-1))));
  }};
}

export let authParticlesHandle = null;

// ---- Modo liviano (ver el script del <head> en index.html y css/ui/lite.css) ----
// Con html.lite no corre ningún canvas de partículas: queda solo el degradé de fondo.
export function isLite(){ return document.documentElement.classList.contains("lite"); }

// ---- Cuidar la placa de video (ANR «La GPU no responde» en Android) ----
// Mientras está el splash (body.is-booting) no se dibuja nada detrás: lo tapa entero y el
// celular ya tiene bastante con armar la app. Los canvas arrancan cuando app/splash.js avisa
// que se fue ("gize:splash-fin"). Con la app en segundo plano (Capacitor manda "pause" y
// "resume" al document; visibilitychange no siempre llega en el WebView) tampoco se dibuja,
// y html.app-pausada frena las animaciones CSS (css/ui/lite.css).
// En la app de Android (html.android-app) el canvas va a 1 píxel por punto y 30 cuadros por
// segundo: las partículas son finitas y suaves, no se nota, y la placa hace un cuarto del trabajo.
function booting(){ return !!(document.body && document.body.classList.contains("is-booting")); }
const androidApp = () => document.documentElement.classList.contains("android-app");
const maxDpr = () => Math.min(window.devicePixelRatio || 1, androidApp() ? 1 : 2);
const FRAME_MS = 1000/30 - 2; // 30 fps (con margen para que no saltee de a dos cuadros)
const afterSplash = [];
document.addEventListener("gize:splash-fin", () => { afterSplash.splice(0).forEach(fn => { try { fn(); } catch(e){} }); });
function whenSplashGone(fn){ if(booting()) { if(!afterSplash.includes(fn)) afterSplash.push(fn); } else fn(); }
const whenActiveList = [];
function whenActive(fn){ if(!whenActiveList.includes(fn)) whenActiveList.push(fn); }
function activeAgain(){ if(!appPaused() && document.visibilityState==="visible") whenActiveList.splice(0).forEach(fn => { try { fn(); } catch(e){} }); }
// "pause"/"resume" y visibilitychange los junta app/ui/pausa.js (Android y iPhone por igual;
// también pone/saca html.app-pausada). Al volver, el fondo arranca de nuevo y cuenta como un toque.
onAwayChange(away => {
  if(away) return;
  wakeBg();
  activeAgain();
  if(silkVisible && silkRafId==null) silkLoop();
});

// ---- Fondo quieto cuando nadie toca nada (ahorro de batería) ----
// Si pasan IDLE_MS sin tocar, deslizar ni escribir, el fondo deja de redibujarse: el canvas
// queda con el último cuadro (se ve igual, solo que quieto) y html.fondo-quieto frena la aurora
// del login (css/ui/lite.css). Con el primer toque, scroll, tecla o cambio de pantalla sigue
// desde donde estaba. Mientras se mueve se ve exactamente igual que antes.
const IDLE_MS = 6000;
let lastInput = Date.now(), still = false, idleTimer = null; // still: lo leen los loops de los canvas
const whenWakeList = [];
function whenWake(fn){ if(!whenWakeList.includes(fn)) whenWakeList.push(fn); }
function checkIdle(){
  idleTimer = null;
  const left = IDLE_MS - (Date.now() - lastInput);
  if(left > 0){ idleTimer = setTimeout(checkIdle, left + 20); return; } // se tocó en el medio: se espera lo que falta
  still = true;
  document.documentElement.classList.add("fondo-quieto");
}
// Cualquier toque/scroll/tecla: anota la hora (barato, va en cada evento) y, si estaba quieto, arranca.
export function wakeBg(){
  lastInput = Date.now();
  if(still){
    still = false;
    document.documentElement.classList.remove("fondo-quieto");
    whenWakeList.splice(0).forEach(fn => { try { fn(); } catch(e){} });
  }
  if(!idleTimer) idleTimer = setTimeout(checkIdle, IDLE_MS + 20);
}
["pointerdown", "touchstart", "keydown", "wheel"].forEach(ev => window.addEventListener(ev, wakeBg, { passive: true, capture: true }));
document.addEventListener("scroll", wakeBg, { passive: true, capture: true }); // también el scroll de listas internas
window.addEventListener("hashchange", wakeBg);
document.addEventListener("gize:splash-fin", wakeBg); // el reloj de quietud arranca cuando se ve la app
// Bordes de colores que giran: dan sus 2 vueltas al abrir la app y después quedan quietos
// (html.bordes-quietos, css/ui/lite.css). Antes volvían a girar en cada cambio de pantalla,
// porque la pantalla se redibuja, y eso repintaba sin parar mientras se usaba la app.
document.addEventListener("gize:splash-fin", () => setTimeout(() => document.documentElement.classList.add("bordes-quietos"), 12000), { once: true });
wakeBg();

// Elección manual desde Ajustes: se guarda y le gana a la detección automática.
export function setLite(on){
  try { localStorage.setItem("gize_lite", on ? "1" : "0"); } catch(e){}
  document.documentElement.classList.toggle("lite", on);
  // En Android el modo liviano es GIZE básico (app/lite.js, css/ui/basico.css).
  document.documentElement.classList.toggle("basico", on && androidApp());
  if(on) silkClear(); else if(silkVisible && silkRafId==null) silkLoop();
}

// El modo liviano automático por batería baja (app/lite.js) entra y sale con la app abierta.
document.addEventListener("gize:lite", () => { if(isLite()) silkClear(); else if(silkVisible && silkRafId==null) silkLoop(); });

// Si nadie eligió a mano y el fondo va a menos de ~25 cuadros por segundo, el equipo no da:
// se pasa solo a modo liviano y queda anotado para los próximos arranques.
function autoLite(){
  try { if(localStorage.getItem("gize_lite")!==null) return; localStorage.setItem("gize_lite_auto","1"); } catch(e){}
  document.documentElement.classList.add("lite");
  silkClear();
}
let perfLast=0, perfFrames=0, perfSum=0, perfDone=false;
function perfSample(){
  const t=performance.now();
  if(perfLast && !document.body.classList.contains("is-booting")){ // el arranque siempre tironea: no cuenta
    perfFrames++; perfSum+=t-perfLast;
    if(perfFrames>=120){ perfDone=true; if(perfSum/perfFrames>40) autoLite(); }
  }
  perfLast=t;
}

// Gama RGB de la marca (brand/tokens.css): cada partícula toma uno de los cuatro
// colores, alternados, para que el fondo hable el mismo idioma que el splash.
const GIZE_GAMUT_VARS=["--gize-r1","--gize-r2","--gize-r3","--gize-r4"];
const GIZE_GAMUT_FALLBACK=["#2FA0FF","#A65CFF","#FF3DAE","#25E8C8"];
export function gizeGamut(){
  const cs=getComputedStyle(document.documentElement);
  return GIZE_GAMUT_VARS.map((v,i)=>cs.getPropertyValue(v).trim()||GIZE_GAMUT_FALLBACK[i]);
}
const PARTICLE_ALPHA=0.5; // opacidad baja: el fondo acompaña, no compite con el contenido

export function stopAuthParticles(){ if(authParticlesHandle){ try{ authParticlesHandle.stop(); }catch(e){} authParticlesHandle=null; } }

export function startAuthParticles(canvas){
  stopAuthParticles();
  if(!canvas) return;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d",{alpha:true}); if(!ctx) return;
  const dpr = maxDpr();
  function resize(){
    const w=canvas.parentElement.clientWidth, h=canvas.parentElement.clientHeight;
    canvas.width=Math.max(1,Math.round(w*dpr)); canvas.height=Math.max(1,Math.round(h*dpr));
    canvas.style.width=w+"px"; canvas.style.height=h+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  const w0=window.innerWidth;
  const count = w0<560 ? 90 : (w0<1000 ? 170 : 260); // menos partículas en mobile: rendimiento
  const noise = auCreateNoise();
  const gamut = gizeGamut();
  const particles = Array.from({length:count}, (_,i)=>({ c:i%4,
    x:Math.random()*canvas.clientWidth, y:Math.random()*canvas.clientHeight,
    size:Math.random()*1.6+0.6, life:Math.random()*100, maxLife:140+Math.random()*90
  }));
  let raf=null, stopped=false, last=0;
  function frame(t){
    if(stopped) return;
    raf=null;
    if(booting()){ whenSplashGone(frame); return; }
    if(appPaused() || document.visibilityState!=="visible"){ whenActive(frame); return; } // se retoma al volver
    if(still){ whenWake(frame); return; } // nadie toca nada: queda el último cuadro
    raf=requestAnimationFrame(frame);
    if(typeof t!=="number") t=performance.now();
    else if(androidApp() && t-last<FRAME_MS) return;
    last=t;
    const w=canvas.clientWidth, h=canvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    const z=Date.now()*0.00008;
    for(const p of particles){
      p.life+=1;
      if(p.life>p.maxLife){ p.life=0; p.x=Math.random()*w; p.y=Math.random()*h; }
      const op=Math.sin((p.life/p.maxLife)*Math.PI)*0.55;
      const n=noise.simplex3(p.x*0.0025, p.y*0.0025, z);
      const angle=n*Math.PI*4;
      p.x+=Math.cos(angle)*0.55; p.y+=Math.sin(angle)*0.55;
      if(p.x<0) p.x=w; if(p.x>w) p.x=0; if(p.y<0) p.y=h; if(p.y>h) p.y=0;
      ctx.globalAlpha=Math.max(0,op*PARTICLE_ALPHA); ctx.fillStyle=gamut[p.c];
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  if(!reduceMotion && !isLite()) frame(); // respeta prefers-reduced-motion: sin loop, queda solo el fondo estático
  function onResize(){ resize(); if(still) wakeBg(); } // redimensionar borra el canvas: si estaba quieto, se redibuja
  window.addEventListener("resize", onResize);
  authParticlesHandle = { stop(){ stopped=true; if(raf) cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); } };
}

export let silkCtx = null;

export let silkCanvasEl = null;

export let silkRafId = null;

export let silkParticles = [];
let silkGamut = GIZE_GAMUT_FALLBACK;

export let silkNoise = null;

export let silkVisible = false;

export let silkInited = false;

export function silkReducedMotion(){ return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }

// Fondo dentro de la app: más sutil que el del login para que no compita con el contenido.
// La mitad de partículas, más chicas, más transparentes y tres veces más lentas; mientras se
// hace scroll o se toca la pantalla se atenúan todavía más (silkDim) y vuelven al quedar quieta.
const SILK_ALPHA = 0.3, SILK_SPEED = 0.18, SILK_DIM = 0.35, SILK_IDLE_MS = 700;
let silkDim = 1, silkBusyUntil = 0;
function silkBusy(){ silkBusyUntil = Date.now() + SILK_IDLE_MS; }

// Al cambiar la apariencia (app/ui/tema.js) las partículas toman la gama nueva sin recargar.
export function refreshGamut(){ silkGamut = gizeGamut(); }

export function silkMakeParticles(w, h){
  const count = w<560 ? 40 : (w<1000 ? 80 : 120);
  silkGamut = gizeGamut();
  return Array.from({length:count}, (_,i) => ({ c: i%4,
    x: Math.random()*w, y: Math.random()*h,
    size: Math.random()*1.0+0.4, life: Math.random()*100, maxLife: 140+Math.random()*90
  }));
}

export function initSilk(){
  if(silkInited) return; silkInited = true;
  silkCanvasEl = document.getElementById("silkCanvas"); if(!silkCanvasEl) return;
  try { silkCtx = silkCanvasEl.getContext("2d", {alpha:true}); } catch(e){}
  if(!silkCtx) return; // sin canvas 2D disponible: el fondo simplemente no aparece, no rompe nada
  silkNoise = auCreateNoise();
  silkResize();
  window.addEventListener("resize", silkResize);
  window.addEventListener("scroll", silkBusy, { passive: true });
  window.addEventListener("touchstart", silkBusy, { passive: true });
  window.addEventListener("pointerdown", silkBusy, { passive: true });
  document.addEventListener("visibilitychange", silkOnVisibilityChange);
  silkLoop();
}

export function silkResize(){
  if(!silkCanvasEl || !silkCtx) return;
  const dpr = maxDpr();
  const w = window.innerWidth, h = window.innerHeight;
  silkCanvasEl.width = Math.max(1, Math.round(w*dpr));
  silkCanvasEl.height = Math.max(1, Math.round(h*dpr));
  silkCanvasEl.style.width = w+"px"; silkCanvasEl.style.height = h+"px";
  silkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  silkParticles = silkMakeParticles(w, h);
  if(silkReducedMotion() && silkRafId==null) silkLoop(); // el canvas se borra al redimensionar: redibuja el cuadro quieto
  if(still) wakeBg(); // ídem con el fondo quieto por falta de uso: se redibuja y vuelve a moverse un rato
}

function silkClear(){
  if(silkCtx && silkCanvasEl) silkCtx.clearRect(0, 0, silkCanvasEl.width, silkCanvasEl.height);
}

let silkLast = 0;
export function silkLoop(t){
  if(document.visibilityState!=="visible" || appPaused() || !silkVisible || isLite()){ silkRafId=null; perfLast=0; return; } // pausa real: no seguimos pidiendo frames
  if(still && !silkReducedMotion()){ silkRafId=null; perfLast=0; whenWake(silkResume); return; } // quieto: queda el último cuadro
  if(booting()){ silkRafId=null; perfLast=0; whenSplashGone(silkResume); return; } // arranca cuando se va el splash
  silkRafId = requestAnimationFrame(silkLoop);
  if(!silkCtx || !silkCanvasEl || !silkNoise) return;
  if(!perfDone) perfSample();
  if(typeof t!=="number") t = performance.now();
  else if(androidApp() && t-silkLast<FRAME_MS) return; // 30 fps en Android
  silkLast = t;
  const w = silkCanvasEl.clientWidth || window.innerWidth;
  const h = silkCanvasEl.clientHeight || window.innerHeight;
  const reduced = silkReducedMotion(); // reduced motion: se dibuja un solo cuadro y queda quieto
  silkCtx.clearRect(0, 0, w, h);
  const z = Date.now()*0.00008;
  silkDim += ((Date.now() < silkBusyUntil ? SILK_DIM : 1) - silkDim) * 0.08; // transición suave
  for(const p of silkParticles){
    p.life += reduced ? 1 : 0.5;
    if(p.life>p.maxLife){ p.life=0; p.x=Math.random()*w; p.y=Math.random()*h; }
    const op = Math.sin((p.life/p.maxLife)*Math.PI)*0.55;
    const n = silkNoise.simplex3(p.x*0.0025, p.y*0.0025, z);
    const angle = n*Math.PI*4;
    if(!reduced){ p.x += Math.cos(angle)*SILK_SPEED; p.y += Math.sin(angle)*SILK_SPEED; }
    if(p.x<0) p.x=w; if(p.x>w) p.x=0; if(p.y<0) p.y=h; if(p.y>h) p.y=0;
    silkCtx.globalAlpha = Math.max(0,op*SILK_ALPHA*silkDim); silkCtx.fillStyle = silkGamut[p.c];
    silkCtx.beginPath(); silkCtx.arc(p.x,p.y,p.size,0,Math.PI*2); silkCtx.fill();
  }
  silkCtx.globalAlpha = 1;
  if(reduced){ cancelAnimationFrame(silkRafId); silkRafId = null; }
}

function silkResume(){ if(silkVisible && silkRafId==null) silkLoop(); }

export function silkOnVisibilityChange(){
  if(document.visibilityState==="visible" && silkVisible && silkRafId==null) silkLoop();
}

export function showSilkBg(){
  if(!silkInited) initSilk();
  silkVisible = true;
  const c=document.getElementById("silkCanvas");
  if(c) c.classList.add("on");
  document.body.classList.add("silk-on");
  wakeBg(); // cambio de pantalla: el fondo se mueve un rato
  if(silkRafId==null) silkLoop();
}

export function hideSilkBg(){
  silkVisible = false;
  const c=document.getElementById("silkCanvas");
  if(c) c.classList.remove("on");
  document.body.classList.remove("silk-on");
  document.body.classList.remove("silk-coach");
}
