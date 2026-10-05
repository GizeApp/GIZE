// Panel de configuración del propio coach (ícono de tuerca en el header): cambiar foto
// de perfil, cambiar nombre de usuario, cerrar sesión. Se abre/cierra como cualquier otro
// sheet del panel de coach (mismo patrón que renderCoachPicker en rutinas.js): un modal
// .cp-bg+.cp-ccard montado en #coachSheetHost, cerrado con closeSheet.
import { State } from '../../core/state.js';

import { esc } from '../../core/utils.js';

import { avatarHtml, avatarUrl } from '../../core/avatar.js';

import { coachInitials } from './clientes.js';

import { CoachState } from './state.js';

import { pushOnHere } from '../../core/push.js';

import { adminEntry, checkAdmin } from '../admin-productos.js';

import { temaOptionsHtml } from '../../ui/tema.js';
import { neonSwitchHtml } from '../../ui/neon.js';

export function renderCoachSettings(){
  const host=document.getElementById("coachSheetHost"); if(!host) return;
  if(!CoachState.coachSettingsOpen){ host.innerHTML=""; return; }
  checkAdmin(renderCoachSettings);
  const name=(State.cloudProfile&&State.cloudProfile.full_name)||(State.cloudUser&&State.cloudUser.email)||"";
  const draft=CoachState.coachNameForm!=null?CoachState.coachNameForm:name;
  const id=(State.cloudUser&&State.cloudUser.id)||"";
  host.innerHTML='<div class="cp-bg" data-coach="settings-cancel"></div><div class="cp-ccard">'+
    '<div class="cp-head"><div class="cp-title">Configuración</div><button class="cp-x" data-coach="settings-cancel">✕</button></div>'+
    '<div class="cs-avatar-row">'+
      avatarHtml(State.cloudProfile&&State.cloudProfile.avatar_path, coachInitials(name), 'co-avatar cs-avatar-big')+
      '<div class="cs-avatar-col">'+
        '<label class="cp-copt cs-photo-btn">Cambiar foto de perfil<input type="file" accept="image/*" data-action="avatar-pick" hidden></label>'+
        (State.cloudProfile&&State.cloudProfile.avatar_path&&avatarUrl(State.cloudProfile.avatar_path)
          ? '<button class="cs-photo-rm" data-action="avatar-remove">Quitar foto</button>'
          : '<div class="cs-hint">La ven tus clientes</div>')+
      '</div>'+
    '</div>'+
    '<div class="cs-field">'+
      '<label>Nombre de usuario</label>'+
      '<input class="co-note" data-coach="settings-name" value="'+esc(draft)+'">'+
      '<button class="co-save-rt" data-coach="settings-name-save">Guardar nombre</button>'+
    '</div>'+
    '<div class="cs-field">'+
      '<label>Plan de GIZE</label>'+
      '<button class="cp-copt cs-q-btn" data-plan="open">Ver mi plan y cantidad de clientes</button>'+
    '</div>'+
    '<div class="cs-field">'+
      '<label>Avisos en este dispositivo</label>'+
      '<button class="cp-copt cs-q-btn cs-notif'+(pushOnHere()?' on':'')+'" data-coach="notif-toggle">'+(pushOnHere()?'Avisos activados \u2713 · tocá para apagarlos':'Activar avisos')+'</button>'+
      '<div class="cs-hint">Te avisamos cuando un alumno manda su check-in semanal o lleva 4 días sin entrenar.</div>'+
    '</div>'+
    // Apariencia: «Oscuro» (la de siempre), «Claro» (blanco), «Azul» o «Rosa» (vidrio), igual que en Ajustes del
    // alumno. Se aplica al toque (app/ui/tema.js escucha los botones data-tema).
    '<div class="cs-field">'+
      '<label id="csTemaLbl">Apariencia en este dispositivo</label>'+
      '<div class="cs-tema" role="radiogroup" aria-labelledby="csTemaLbl">'+temaOptionsHtml("cp-copt cs-tema-opt")+'</div>'+
    '</div>'+
    // Neón: los bordes y brillos de colores, igual que en Ajustes del alumno. Se aplica al
    // toque (app/ui/neon.js escucha el interruptor data-neon-toggle).
    '<div class="cs-field">'+
      '<label id="csNeonLbl">Neón en este dispositivo</label>'+
      '<div class="cs-neon"><span>Toque de color en los bordes</span>'+neonSwitchHtml("csNeonLbl")+'</div>'+
    '</div>'+
    (adminEntry() ? '<div class="cs-field"><label>Administración de GIZE</label>'+adminEntry()+'</div>' : '')+
    '<div class="cs-field">'+
      '<label>Preguntas para tus clientes</label>'+
      '<button class="cp-copt cs-q-btn" data-coach="q-open">Editar preguntas del registro diario y del check-in</button>'+
    '</div>'+
    // Mismo link que en Configuración del alumno (ver LINKS.privacy en screens/config.js).
    '<div class="cs-field">'+
      '<label>Privacidad</label>'+
      '<a class="cp-copt cs-q-btn" href="https://gize.ar/privacidad/?app=1" target="_blank" rel="noopener">Política de privacidad</a>'+
    '</div>'+
    '<button class="logout-btn" data-auth="logout">Cerrar sesión</button>'+
    // Mismo botón que en Ajustes del alumno (ver cfg-delete-account en screens/config.js).
    '<button class="logout-btn cfg-danger" data-action="cfg-delete-account">Eliminar cuenta</button>'+
  '</div>';
}
