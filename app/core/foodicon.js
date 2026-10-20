// Ícono de línea de cada alimento para las hojas de «Agregar» y de la foto del plato: los emojis
// (🍗 🥩 🍞…) cambiaban de dibujo en cada teléfono y no combinaban con los íconos de la app. Se usa
// la misma clasificación de foodemoji.js (por palabras del nombre y, si no, por la categoría) y cada
// emoji cae en un grupo con su ícono: carne, pollo, pescado, huevo, lácteos, harinas, pizza, frutas,
// verduras, legumbres y frutos secos, bebidas, café y mate, alcohol, agua y aceites, dulces,
// suplementos, sopas y, si no, el plato. El diario de Comida sigue con los emojis.
import { foodEmoji } from './foodemoji.js';
import { pillSvg } from './icons.js';

const ic = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const ICON = {
  carne: ic('<circle cx="12.5" cy="8.5" r="2.5"/><path d="M12.5 2a6.5 6.5 0 0 0-6.22 4.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3A6.5 6.5 0 0 0 12.5 2Z"/><path d="m18.5 6 2.19 4.5a6.48 6.48 0 0 1 .31 2 6.49 6.49 0 0 1-2.6 5.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5"/>'),
  pollo: ic('<path d="M15.4 15.63a7.88 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23"/><path d="m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59"/>'),
  pescado: ic('<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/>'),
  huevo: ic('<path d="M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z"/>'),
  lacteo: ic('<path d="M8 2h8"/><path d="M9 2v2.79a4 4 0 0 1-.67 2.22l-.66.98A4 4 0 0 0 7 10.21V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.79a4 4 0 0 0-.67-2.22l-.66-.98A4 4 0 0 1 15 4.79V2"/><path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0"/>'),
  harina: ic('<path d="M2 22 16 8"/><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z"/><path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/><path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/><path d="M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/>'),
  pizza: ic('<path d="M15 11h.01M11 15h.01M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/>'),
  fruta: ic('<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>'),
  verdura: ic('<path d="M7 21h10"/><path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1"/><path d="m13 12 4-4"/><path d="M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2"/>'),
  semilla: ic('<path d="M12 4V2"/><path d="M5 10v4a7 7 0 0 0 5.28 6.79c.41.1.8.29 1.1.59L12 22l.62-.62c.3-.3.69-.49 1.1-.59A7 7 0 0 0 19 14v-4"/><path d="M12 4C8 4 4.5 6 4 8c-.24.97-.92 1.95-2 3 1.31-.08 1.97-.29 3-1 .54.92.98 1.36 2 2 1.45-.65 1.95-1.1 2.5-2 .6 1 1.15 1.43 2.5 2 1.31-.62 1.86-1.06 2.5-2 .63.98 1.16 1.42 2.5 2 1.21-.55 1.68-.97 2-2 1.03.92 1.68 1.16 3 1-1.3-1.04-1.76-2.03-2-3-.5-2-4-4-8-4Z"/>'),
  bebida: ic('<path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8"/><path d="M5 8h14"/><path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0"/><path d="m12 8 1-6h2"/>'),
  cafe: ic('<path d="M10 2v2M14 2v2M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>'),
  alcohol: ic('<path d="M8 22h8M7 10h10M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>'),
  gota: ic('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'),
  dulce: ic('<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01M16 15.5v.01M12 12v.01M11 17v.01M7 14v.01"/>'),
  sopa: ic('<path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M7 21h10M19.5 12 22 6"/><path d="M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62"/>'),
  plato: ic('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>'),
  suplemento: pillSvg.replace('<svg ', '<svg aria-hidden="true" '),
};
const GRUPO = {};
const grupo = (g, ems) => [...ems].forEach(e => { GRUPO[e] = g; });
// Los emojis de foodemoji.js (con el selector de variante, como 🍽️, se busca sin él).
grupo("carne", ["🥩", "🍖", "🥓", "🍔", "🌭", "🥙", "🌮", "🫔"]);
grupo("pollo", ["🍗"]);
grupo("pescado", ["🐟", "🍣"]);
grupo("huevo", ["🥚", "🍳"]);
grupo("lacteo", ["🥛", "🧀", "🥣", "🧈"]);
grupo("harina", ["🍞", "🥐", "🫓", "🥪", "🥟", "🥞", "🧇", "🌾", "🍚", "🍝", "🥧"]);
grupo("pizza", ["🍕"]);
grupo("fruta", ["🍎", "🍌", "🍐", "🍊", "🍋", "🍓", "🍇", "🍉", "🍈", "🍍", "🍑", "🍒", "🥝", "🥭", "🫐", "🥥"]);
grupo("verdura", ["🥦", "🥬", "🥕", "🥒", "🫑", "🧅", "🎃", "🍄", "🍅", "🥔", "🌽", "🥑", "🥗", "🍆", "🫒"]);
grupo("semilla", ["🫘", "🥜"]);
grupo("bebida", ["🥤", "🧃"]);
grupo("cafe", ["☕", "🧉"]);
grupo("alcohol", ["🍺", "🍷"]);
grupo("gota", ["💧", "🫙"]);
grupo("dulce", ["🍫", "🍪", "🍰", "🍮", "🧁", "🍩", "🍬", "🍭", "🍯", "🍦", "🍨", "🍿"]);
grupo("suplemento", ["💊"]);
grupo("sopa", ["🍲"]);

// El grupo del alimento (para el color del ícono, si alguna vez hace falta) y su ícono.
export function foodGroup(name, cat){ return GRUPO[String(foodEmoji(name, cat)).replace(/️/g, "")] || "plato"; }
export function foodIcon(name, cat){ return ICON[foodGroup(name, cat)]; }
