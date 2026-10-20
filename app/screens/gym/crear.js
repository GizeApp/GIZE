// Crear un gimnasio (gize.ar/gimnasio → /app/#gimnasio). Solo en la web, para un coach sin gimnasio,
// con el interruptor del servidor prendido (mi_gimnasio().puede_crear; lo prende el admin de GIZE para
// los pilotos) y aceptando el contrato de encargo (casilla obligatoria; la versión sale de textos.js y
// el servidor rechaza otra). En las apps: «El gimnasio se crea desde gize.ar en la compu».
import { esc } from '../../core/utils.js';
import { GS, info, soyCoach, enApp } from './estado.js';
import { btn, btn2 } from './marco.js';
import { CONTRATO_RESUMEN, VERSIONES } from './textos.js';

const WA = "https://wa.me/5493413490705?text=" + encodeURIComponent("Hola! Quiero sumar mi gimnasio a GIZE.");
const PROVINCIAS = ["Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza",
  "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán"];

const marco = c => '<div class="gy-solo"><div class="co-brand cv-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"></div><div class="cv-card gy-solo-card">' + c + '</div></div>';
const volver = '<button class="cv-link" data-gym="crear-no">Volver</button>';

export function renderCrear(){
  if (enApp()) return marco('<h1 class="gy-solo-t">Crear un gimnasio</h1><p class="gy-p">El gimnasio se crea desde gize.ar en la compu.</p><div class="gy-acc">' + volver + '</div>');
  if (!soyCoach()) return marco('<h1 class="gy-solo-t">Crear un gimnasio</h1><p class="gy-p">Para crear un gimnasio necesitás una cuenta de coach.</p><div class="gy-acc">' + volver + '</div>');
  if (!info().puede_crear) return marco('<h1 class="gy-solo-t">Crear un gimnasio</h1><p class="gy-p">Por ahora la creación de gimnasios está cerrada. Si querés sumar tu gimnasio a GIZE, escribinos y lo armamos juntos.</p>' +
    '<div class="gy-acc"><a class="gize-btn cv-btn" href="' + esc(WA) + '" target="_blank" rel="noopener">Escribinos por WhatsApp</a>' + volver + '</div>');
  const c = GS.crear;
  return marco('<h1 class="gy-solo-t">Creá tu gimnasio en GIZE</h1>' +
    '<p class="gy-p">Vas a tener un panel para tus socios, tus profes y la recepción. Tus alumnos de hoy siguen siendo tuyos.</p>' +
    '<div class="gy-form">' +
      '<label class="gy-f"><span>Nombre del gimnasio</span><input class="co-note" data-gym-cr="nombre" maxlength="80" value="' + esc(c.nombre) + '" placeholder="Gimnasio Fuerza" autocomplete="organization"></label>' +
      '<label class="gy-f"><span>Ciudad</span><input class="co-note" data-gym-cr="ciudad" maxlength="80" value="' + esc(c.ciudad) + '" placeholder="Rosario"></label>' +
      '<label class="gy-f"><span>Provincia</span><select class="gy-sel" data-gym-cr="provincia"><option value="">Elegí…</option>' + PROVINCIAS.map(p => '<option' + (c.provincia === p ? ' selected' : '') + '>' + p + '</option>').join("") + '</select></label>' +
    '</div>' +
    '<section class="gy-contrato"><h2 class="gy-h">Contrato de encargo de datos</h2><ul>' + CONTRATO_RESUMEN.map(t => '<li>' + esc(t) + '</li>').join("") + '</ul>' +
      '<label class="gy-check"><input type="checkbox" data-gym-cr="acepto"' + (c.acepto ? ' checked' : '') + '> Leí y acepto el contrato de encargo (versión ' + esc(VERSIONES.encargo) + ').</label></section>' +
    '<div class="gy-acc">' + btn('data-gym="crear-si"' + (c.acepto && c.nombre.trim().length >= 2 && !c.busy ? '' : ' disabled'), c.busy ? "Creando…" : "Crear gimnasio") + volver + '</div>');
}
