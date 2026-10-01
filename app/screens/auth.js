import { auIcoEye, auIcoLock, auIcoMail, auIcoUser } from '../core/icons.js';

import { hideSilkBg, startAuthParticles, stopAuthParticles } from '../ui/background.js';

import { esc } from '../core/utils.js';

import { appleLoginAvailable, mountGoogleButton, rememberSession } from '../core/supabase.js';

import { isIOS, isStandalone } from '../core/push.js';

const nativeApp = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };
const iosSafari = () => { try { return isIOS() && !isStandalone() && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };

// "G" oficial de Google: las pautas de marca piden los cuatro colores, sin recolorear.
const googleLogo = '<svg class="auth-google-ic" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// Logo de Apple para «Continuar con Apple» (solo en la app de iPhone). Las pautas de Apple:
// botón blanco sobre fondo oscuro, logo y texto negros, al menos del tamaño del de Google y
// arriba de él.
const appleLogo = '<svg class="auth-apple-ic" viewBox="0 0 814 1000" aria-hidden="true"><path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>';

export function showLogin(msg, mode, vals){
  mode = mode || "in"; vals = vals || {};
  if(mode==="forgot" || mode==="newpass") return showPasswordReset(msg, mode, vals);
  const isUp = mode==="up";
  const eq = v => esc(v==null?"":v);
  const host=document.getElementById("authHost"); if(!host) return;
  host.style.display="flex";
  hideSilkBg();
  const isOk = !!msg && /^listo/i.test(String(msg).trim());
  let stepIdx=-1;
  const nextDelay=()=>{ stepIdx++; return (0.14+stepIdx*0.055).toFixed(3)+"s"; };
  const role = vals.role==="coach" ? "coach" : "client";
  const field=(id, icon, extraClass, ph, type, autocomplete, value)=>
    '<div class="auth-field'+(extraClass?(" "+extraClass):"")+'" style="animation-delay:'+nextDelay()+'">'+
      '<span class="auth-ic" aria-hidden="true">'+icon+'</span>'+
      '<input id="'+id+'" class="auth-in" type="'+type+'" placeholder="'+ph+'" autocomplete="'+autocomplete+'" aria-label="'+ph+'" value="'+eq(value)+'">'+
      (id==="auPass" ? '<button type="button" class="auth-toggle-pass" data-toggle-pass aria-label="Mostrar contraseña">'+auIcoEye+'</button>' : '')+
    '</div>';
  const roleField = isUp ?
    '<div class="auth-field auth-role" style="animation-delay:'+nextDelay()+'">'+
      '<div class="auth-role-group" role="radiogroup" aria-label="Tipo de cuenta">'+
        '<button type="button" class="auth-role-opt'+(role==="client"?" active":"")+'" data-auth-role="client" role="radio" aria-checked="'+(role==="client")+'">Soy cliente</button>'+
        '<button type="button" class="auth-role-opt'+(role==="coach"?" active":"")+'" data-auth-role="coach" role="radio" aria-checked="'+(role==="coach")+'">Soy coach</button>'+
      '</div>'+
      '<input id="auRole" type="hidden" value="'+role+'">'+
    '</div>' : "";
  // El aviso de la prueba y el código del coach ya no van acá: aparecen en la bienvenida
  // del primer ingreso (screens/onboarding.js), para no cargar el registro.
  host.innerHTML =
    '<div class="gize-aurora auth-aurora" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
    '<canvas class="auth-particles" aria-hidden="true"></canvas>'+
    '<div class="auth-card" role="region" aria-label="'+(isUp?"Crear cuenta":"Iniciar sesión")+'">'+
      '<div class="auth-brand-ic" aria-hidden="true"><img src="brand/logo/gize-marca-blanca.svg" alt=""></div>'+
      '<div class="auth-logo"><img src="brand/logo/gize-logotipo.svg" alt="GIZE"></div>'+
      '<div class="auth-sub">Tu planilla de entrenamiento</div>'+
      roleField+
      (isUp?field("auName", auIcoUser, "", "Tu nombre y apellido", "text", "name", vals.name):"")+
      field("auEmail", auIcoMail, "", "Email (ej: nombre@gmail.com)", "email", "username", vals.email)+
      field("auPass", auIcoLock, "pass", "Contraseña (mínimo 6)", "password", isUp?"new-password":"current-password", "")+
      (isUp?"":'<button type="button" class="auth-forgot" data-auth="to-forgot" style="animation-delay:'+nextDelay()+'">¿Olvidaste tu contraseña?</button>')+
      '<label class="auth-remember" style="animation-delay:'+nextDelay()+'">'+
        '<input id="auRemember" type="checkbox"'+(rememberSession()?" checked":"")+'>'+
        '<span class="auth-remember-box" aria-hidden="true"></span>'+
        '<span>Mantener la sesión iniciada</span>'+
      '</label>'+
      // En Safari del iPhone la página puede perder lo guardado (y con eso la sesión) si no se
      // abre por unos días; con GIZE agregada a la pantalla de inicio eso no pasa.
      (iosSafari()?'<div class="auth-ios-tip" style="animation-delay:'+nextDelay()+'">En iPhone, para que no se te cierre la sesión, agregá GIZE a la pantalla de inicio (Compartir → Agregar a inicio) y entrá siempre desde ese ícono.</div>':'')+
      (msg?'<div class="auth-msg'+(isOk?" ok":"")+'" role="alert" style="animation-delay:'+nextDelay()+'">'+esc(msg)+'</div>':'')+
      '<button class="gize-btn auth-btn" data-auth="'+(isUp?"do-signup":"do-login")+'" style="animation-delay:'+nextDelay()+'">'+(isUp?"Crear cuenta":"Ingresar")+'</button>'+
      '<div class="auth-or" aria-hidden="true" style="animation-delay:'+nextDelay()+'"><span>o</span></div>'+
      // App de iPhone: App Store pide ofrecer Apple si se puede entrar con Google (guía 4.8).
      (appleLoginAvailable()?'<button type="button" class="auth-apple" data-auth="apple" style="animation-delay:'+nextDelay()+'">'+appleLogo+'<span>Continuar con Apple</span></button>':'')+
      '<button type="button" class="auth-google" data-auth="google" style="animation-delay:'+nextDelay()+'">'+googleLogo+'<span>Continuar con Google</span></button>'+
      '<div class="auth-switch" data-auth="'+(isUp?"to-login":"to-signup")+'" role="button" tabindex="0" style="animation-delay:'+nextDelay()+'">'+(isUp?"Ya tengo cuenta":"Crear una cuenta nueva")+'</div>'+
      // En las apps de Android y iPhone ya está instalada: el botón no va (y App Review lo marcaría).
      (nativeApp()?'':'<button type="button" class="auth-install" data-install style="animation-delay:'+nextDelay()+'">Instalar GIZE en el celular</button>')+
    '</div>';
  startAuthParticles(host.querySelector(".auth-particles"));
  mountGoogleButton().catch(()=>{});
}

// Recuperar la contraseña: "forgot" pide el mail para mandar el link; "newpass" aparece al
// volver del link (ya con una sesión de recuperación) para elegir la contraseña nueva.
function showPasswordReset(msg, mode, vals){
  const host=document.getElementById("authHost"); if(!host) return;
  host.style.display="flex";
  hideSilkBg();
  const isNew = mode==="newpass";
  const isOk = !!msg && /^listo/i.test(String(msg).trim());
  let stepIdx=-1;
  const nextDelay=()=>{ stepIdx++; return (0.14+stepIdx*0.055).toFixed(3)+"s"; };
  const field=(id, icon, extraClass, ph, type, autocomplete, value)=>
    '<div class="auth-field'+(extraClass?(" "+extraClass):"")+'" style="animation-delay:'+nextDelay()+'">'+
      '<span class="auth-ic" aria-hidden="true">'+icon+'</span>'+
      '<input id="'+id+'" class="auth-in" type="'+type+'" placeholder="'+ph+'" autocomplete="'+autocomplete+'" aria-label="'+ph+'" value="'+esc(value||"")+'">'+
      (id==="auPass" ? '<button type="button" class="auth-toggle-pass" data-toggle-pass aria-label="Mostrar contraseña">'+auIcoEye+'</button>' : '')+
    '</div>';
  host.innerHTML =
    '<div class="gize-aurora auth-aurora" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
    '<canvas class="auth-particles" aria-hidden="true"></canvas>'+
    '<div class="auth-card" role="region" aria-label="'+(isNew?"Contraseña nueva":"Recuperar contraseña")+'">'+
      '<div class="auth-brand-ic" aria-hidden="true"><img src="brand/logo/gize-marca-blanca.svg" alt=""></div>'+
      '<div class="auth-logo"><img src="brand/logo/gize-logotipo.svg" alt="GIZE"></div>'+
      '<div class="auth-sub">'+(isNew?"Elegí tu contraseña nueva":"Te mandamos un link a tu mail para elegir una contraseña nueva")+'</div>'+
      (isNew ? field("auPass", auIcoLock, "pass", "Contraseña nueva (mín. 6)", "password", "new-password", "")
             : field("auEmail", auIcoMail, "", "Email de tu cuenta", "email", "username", vals.email))+
      (msg?'<div class="auth-msg'+(isOk?" ok":"")+'" role="alert" style="animation-delay:'+nextDelay()+'">'+esc(msg)+'</div>':'')+
      '<button class="gize-btn auth-btn" data-auth="'+(isNew?"do-newpass":"do-forgot")+'" style="animation-delay:'+nextDelay()+'">'+(isNew?"Guardar contraseña":"Mandarme el link")+'</button>'+
      (isNew?"":'<div class="auth-switch" data-auth="to-login" role="button" tabindex="0" style="animation-delay:'+nextDelay()+'">Volver a ingresar</div>')+
    '</div>';
  startAuthParticles(host.querySelector(".auth-particles"));
}

export function hideLogin(){ const h=document.getElementById("authHost"); if(h){ h.style.display="none"; h.innerHTML=""; } stopAuthParticles(); }
