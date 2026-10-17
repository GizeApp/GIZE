// Rueda para elegir un número (estatura, peso, fecha de nacimiento): la lista se desliza con el
// dedo, la rueda del mouse o el teclado y el valor elegido queda en la franja del medio. Es
// compartida (la usa la bienvenida, app/screens/onboarding.js); la de la hora de Cardio
// (openTimePicker en screens/cardio.js) es otra y no se toca.
//
// Para el lector de pantalla cada rueda es un role="spinbutton" con su valor y su texto
// (aria-valuenow / aria-valuetext); las filas van ocultas (aria-hidden).
//
// Cuándo cuenta como «la tocó» (onToque): una tecla de valor o Enter, tocar una fila (también la
// del medio, así se confirma el valor que ya venía) o un scroll que cambia el valor sin que la
// app la esté moviendo sola. Lo que mueve la app (la posición de arranque, ir() desde el código,
// el día que se corrige solo) no cuenta: se anota adónde va (objetivo) y los scroll hasta llegar
// ahí no son de la persona (salvo que la agarre a mitad de camino).
import { esc } from '../core/utils.js';

export const RD_ALTO = 44; // alto de cada fila (igual que en css/ui/rueda.css)

// items: [{ v, t, vt }] — valor, texto en la rueda («72,5»), texto para el lector («72,5 kg»)
export function itemsRango(min, max, paso, fmt = String, vt = fmt){
  const out = [], n = Math.round((max - min) / paso);
  for (let i = 0; i <= n; i++){
    const v = Math.round((min + i * paso) * 1000) / 1000;
    out.push({ v, t: fmt(v), vt: vt(v) });
  }
  return out;
}

export function ruedaHtml({ id, label, items, index, unit = "", chica = false }){
  const it = items[index] || items[0];
  return '<div class="rd' + (chica ? ' rd-chica' : '') + '">' +
    '<div class="rd-band" aria-hidden="true"></div>' +
    '<div class="rd-list" id="' + id + '" role="spinbutton" tabindex="0" aria-label="' + esc(label) + '"' +
      ' aria-valuemin="' + items[0].v + '" aria-valuemax="' + items[items.length - 1].v + '" aria-valuenow="' + it.v + '"' +
      ' aria-valuetext="' + esc(it.vt) + '" data-v="' + it.v + '">' +
      items.map((x, i) => '<div class="rd-item" data-i="' + i + '" aria-hidden="true">' + esc(x.t) + '</div>').join("") +
    '</div>' +
    (unit ? '<span class="rd-unit" aria-hidden="true">' + esc(unit) + '</span>' : '') +
  '</div>';
}

// Sin animaciones (movimiento reducido o GIZE básico): la rueda salta derecho al valor.
const quieto = () => {
  try { if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true; } catch (e) {}
  return document.documentElement.classList.contains("basico");
};

// list: el .rd-list ya puesto en la página. Devuelve { i, v, ir(i, { suave }), texto(vt), destruir() }.
export function montarRueda(list, { items, index, onChange, onCommit, onToque, onEnter }){
  const n = items.length, rd = list.parentElement, filas = list.children;
  const clamp = i => Math.max(0, Math.min(n - 1, i | 0));
  const conScrollend = "onscrollend" in window;
  let cur = -1, objetivo = -1, raf = 0, rafIni = 0, intentos = 0, timer = 0, seguro = 0, vivo = true;

  // Cambia la fila marcada: solo la vieja y la nueva (nada de recorrer las 441 filas del peso).
  const marcar = i => {
    if (i === cur) return false;
    if (cur >= 0 && filas[cur]) filas[cur].classList.remove("on");
    if (filas[i]) filas[i].classList.add("on");
    cur = i;
    const it = items[i];
    list.setAttribute("aria-valuenow", String(it.v));
    list.setAttribute("aria-valuetext", it.vt);
    list.dataset.v = String(it.v);
    return true;
  };
  const toque = i => { if (onToque) onToque(items[i].v, i); };

  const commit = () => {
    timer = 0;
    if (!vivo) return;
    if (objetivo >= 0){
      if (cur !== objetivo) return; // todavía va en camino (o lo pisó otro movimiento de la app)
      objetivo = -1; clearTimeout(seguro);
    }
    if (onCommit && cur >= 0) onCommit(items[cur].v, cur);
  };
  // La persona agarra la rueda (dedo, mouse o rueda del mouse): lo que se mueva desde acá es suyo.
  const tomar = () => { if (objetivo >= 0){ objetivo = -1; clearTimeout(seguro); } };
  const leer = () => {
    raf = 0;
    if (!vivo) return;
    const i = clamp(Math.round(list.scrollTop / RD_ALTO));
    if (i === cur) return;
    marcar(i);
    if (objetivo < 0) toque(i);
    if (onChange) onChange(items[i].v, i);
  };
  const alScroll = () => {
    if (!raf) raf = requestAnimationFrame(leer);
    if (!conScrollend){ clearTimeout(timer); timer = setTimeout(commit, 120); }
  };
  const alTerminar = () => { if (raf){ cancelAnimationFrame(raf); leer(); } commit(); };

  // Teclas como un spinbutton: ↑ sube el valor. Ojo: en esta rueda los valores crecen hacia
  // abajo, así que ↑ la lleva una fila más abajo (al revés de la rueda de la hora de Cardio,
  // donde ↑ sube la lista).
  const alTecla = e => {
    const k = e.key, base = objetivo >= 0 ? objetivo : Math.max(0, cur);
    let t = -1;
    if (k === "ArrowUp" || k === "ArrowRight") t = base + 1;
    else if (k === "ArrowDown" || k === "ArrowLeft") t = base - 1;
    else if (k === "PageUp") t = base + 10;
    else if (k === "PageDown") t = base - 10;
    else if (k === "Home") t = 0;
    else if (k === "End") t = n - 1;
    else if (k === "Enter"){ e.preventDefault(); toque(Math.max(0, cur)); if (onEnter) onEnter(); return; }
    else return;
    e.preventDefault();
    rd.classList.add("foco");
    t = clamp(t);
    api.ir(t, { suave: true });
    toque(t);
  };
  // Tocar una fila la lleva al medio; la del medio también cuenta (confirma el valor que venía).
  const alTocar = e => {
    const it = e.target.closest(".rd-item");
    if (!it || it.parentElement !== list) return;
    const i = clamp(+it.dataset.i);
    api.ir(i, { suave: true });
    toque(i);
  };
  // El foco se dibuja en la franja del medio (.foco): un outline quedaría tapado por la máscara.
  const alFoco = () => {
    let ver = true;
    try { ver = list.matches(":focus-visible"); } catch (e) { ver = true; }
    if (ver) rd.classList.add("foco");
  };
  const alSalir = () => rd.classList.remove("foco");

  const api = {
    get i(){ return Math.max(0, cur); },
    get v(){ return items[Math.max(0, cur)].v; },
    ir(i, op){
      if (!vivo) return;
      i = clamp(i);
      const top = i * RD_ALTO;
      if (op && op.suave && !quieto() && Math.abs(list.scrollTop - top) >= 1){
        objetivo = i;
        // Por si el navegador no llega a avisar que terminó (sin scroll real, rueda oculta).
        clearTimeout(seguro); seguro = setTimeout(() => { objetivo = -1; commit(); }, 1500);
        list.scrollTo({ top, behavior: "smooth" });
        return;
      }
      objetivo = -1; clearTimeout(seguro);
      list.scrollTop = top;
      if (marcar(i) && onChange) onChange(items[i].v, i);
    },
    texto(vt){ list.setAttribute("aria-valuetext", vt); },
    destruir(){
      vivo = false;
      cancelAnimationFrame(raf); cancelAnimationFrame(rafIni); clearTimeout(timer); clearTimeout(seguro);
      list.removeEventListener("scroll", alScroll);
      if (conScrollend) list.removeEventListener("scrollend", alTerminar);
      list.removeEventListener("keydown", alTecla);
      list.removeEventListener("click", alTocar);
      list.removeEventListener("focus", alFoco);
      list.removeEventListener("blur", alSalir);
      ["wheel", "touchstart", "pointerdown"].forEach(ev => list.removeEventListener(ev, tomar));
    }
  };

  list.addEventListener("scroll", alScroll, { passive: true });
  if (conScrollend) list.addEventListener("scrollend", alTerminar);
  list.addEventListener("keydown", alTecla);
  list.addEventListener("click", alTocar);
  list.addEventListener("focus", alFoco);
  list.addEventListener("blur", alSalir);
  ["wheel", "touchstart", "pointerdown"].forEach(ev => list.addEventListener(ev, tomar, { passive: true }));

  // Posición de arranque: apenas está en la página y se ve (si todavía no tiene alto, se
  // reintenta en el próximo cuadro, hasta 60).
  const ini = clamp(index);
  marcar(ini);
  const poner = () => {
    rafIni = 0;
    if (!vivo) return;
    if (!list.clientHeight && intentos++ < 60){ rafIni = requestAnimationFrame(poner); return; }
    list.scrollTop = ini * RD_ALTO;
  };
  poner();
  return api;
}
