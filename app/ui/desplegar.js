// Abrir y cerrar ejercicios en Entreno sin saltos. Pedido (video del 19/10): «al abrir un
// ejercicio el panel del día hace un pop-up que queda muy tosco; debe ir todo mucho más fluido».
// Antes cada toque redibujaba toda la pantalla: la portada repetía su entrada, el ejercicio que
// se cerraba quedaba invisible un momento (la lista parecía desaparecer) y, si se cerraba otro
// más arriba, el que se tocó saltaba para arriba. Ahora:
// - el redibujo es en el lugar (ui/parche.js): solo cambian los ejercicios que se abren o cierran;
// - el que se abre crece desde el alto de su fila y el que se cierra se achica hasta el alto de la
//   fila que lo reemplaza, medida ya dibujada (una fila completada o de una superserie no mide lo
//   mismo que una común), en DUR ms (arranca rápido y frena suave), con su contenido apareciendo o
//   yéndose de a poco;
// - lo que tocó el dedo queda quieto: si algo de más arriba cambia de alto, se corrige el scroll
//   en cada cuadro. Si mientras tanto la persona mueve la pantalla, manda el dedo: se deja de
//   corregir y no se la vuelve atrás;
// - el foco del teclado no se pierde: pasa a la flechita de la card que se abrió o a la fila del
//   que se cerró.
// Con «reducir movimiento» o el modo liviano no hay animación: cambia de una vez, y el dedo igual
// queda en su lugar.
import { isLite } from './background.js';
import { revealedBlocks } from './scrollfocus.js';
import { scrollDeLaApp } from './nube.js';

const DUR = 240;
const curva = t => 1 - Math.pow(1 - t, 3); // ease-out cúbica
const CURVA_CSS = 'cubic-bezier(.33,1,.68,1)';

export function sinMovimiento(){
  return isLite() || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

const cuerpoDe = el => [...el.children].filter(k => !k.classList.contains('card-head'));
const flechaDe = el => el.querySelector('.card-head .ex-chev svg');

// Ángulo de la flechita tal como se ve (con el giro a medio camino incluido), en grados.
function anguloDe(el){
  const f = flechaDe(el), m = f && /^matrix\(([^,]+),\s*([^,]+)/.exec(getComputedStyle(f).transform);
  if (!m) return 0;
  const a = Math.atan2(+m[2], +m[1]) * 180 / Math.PI;
  return a < -90 ? a + 360 : a;
}

// Cada ejercicio a la vista: abierto (card) o cerrado (fila), con su alto. La card que se está
// cerrando (data-ex-cerrando) cuenta como abierta, con el alto que tiene en ese momento. De la que
// se está animando se anota también cómo se ven el contenido y la flechita: si se toca de nuevo a
// mitad de camino, lo nuevo sigue desde ahí (antes el contenido volvía a verse entero un cuadro y
// la flechita volvía a apuntar para arriba).
function foto(){
  const m = new Map();
  document.querySelectorAll('#view .card[data-ex-id], #view .ex-collapsed[data-ex], #view .card[data-ex-cerrando]').forEach(n => {
    const v = { n, abierto: n.classList.contains('card'), h: n.offsetHeight };
    if (n.classList.contains('ex-anim')){ const k = cuerpoDe(n)[0]; v.op = k ? +getComputedStyle(k).opacity : 1; v.ang = anguloDe(n); }
    m.set(n.dataset.exId || n.dataset.ex || n.dataset.exCerrando, v);
  });
  return m;
}

let actual = null; // la animación en curso, para terminarla de una si llega otro redibujo

// Deja la pantalla como queda al final de la animación (la llama renderApp antes de redibujar).
export function terminarDespliegue(){ if (actual) actual.fin(); }

// Scroll que pone la app (no el dedo). La barra de abajo (ui/nube.js) corre su punto de partida
// lo mismo: si no, lo tomaba por un deslizamiento y se achicaba sola al tildar una serie.
function scrollA(y){
  const y0 = window.scrollY;
  window.scrollTo(0, y);
  scrollDeLaApp(window.scrollY - y0);
  return window.scrollY;
}

// Corrige el scroll para que el nodo del ejercicio tocado vuelva a estar donde lo tocó el dedo.
function fijar(ancla, top0){
  const n = top0 == null ? null : ancla();
  if (!n || !n.isConnected) return;
  const dy = n.getBoundingClientRect().top - top0;
  if (Math.abs(dy) >= 0.5) scrollA(window.scrollY + dy);
}

// Chrome pasa los estilos puestos desde JS al atributo recién cuando alguien lo lee: sin leerlo
// antes, removeAttribute dejaba un style="" que aparecía después (y el nodo ya no era igual al
// HTML nuevo para ui/parche.js).
function restaurar(k, st){ k.getAttribute('style'); if (st == null) k.removeAttribute('style'); else k.setAttribute('style', st); }

// Si el foco del teclado estaba en el ejercicio tocado y se perdió (su nodo se cambió), vuelve: a
// la flechita de la card que se abrió o a la fila del que se cerró.
function reenfocar(id){
  const ae = document.activeElement;
  if (ae && ae !== document.body && ae.isConnected) return;
  const k = CSS.escape(id);
  const n = document.querySelector('#view .card[data-ex-id="' + k + '"] [data-action="ex-collapse"], #view .ex-collapsed[data-ex="' + k + '"]');
  if (n) n.focus({ preventScroll: true });
}

// Anima el alto de cada item ({ el, desde, hasta, abre, op0, ang0 }) cuadro a cuadro, con lo de
// adentro (menos la cabecera) apareciendo o yéndose de a poco y la flechita girando, desde como se
// ven ahora. Si algo de más arriba que el ejercicio tocado cambia de alto, se compensa con el
// scroll sumando lo que cambió (sin medir la pantalla en cada cuadro). alFin() deja la pantalla
// como queda; lo que sigue en pantalla se limpia; luego() corre al final de todo.
function animar(items, ancla, top0, alFin, luego){
  const a = ancla();
  items.forEach(it => {
    const el = it.el;
    el.classList.add('ex-anim');
    // Opacidad de cada hijo: una variable CSS en la card recalculaba el estilo de todo lo de adentro
    // en cada cuadro (10 ms por cuadro con el procesador 4 veces más lento; así, menos de 2).
    it.cuerpo = cuerpoDe(el);
    it.estilos = [el, ...it.cuerpo].map(k => k.getAttribute('style'));
    it.h = it.desde;
    it.o0 = it.op0 != null ? it.op0 : it.abre ? 0 : 1;
    it.arriba = !!a && el !== a && !!(el.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    const chev = flechaDe(el), g0 = it.ang0 != null ? it.ang0 : it.abre ? 0 : 180;
    if (chev && chev.animate) it.giro = chev.animate([{ transform: 'rotate(' + g0 + 'deg)' }, { transform: 'rotate(' + (it.abre ? 180 : 0) + 'deg)' }], { duration: DUR, easing: CURVA_CSS, fill: 'forwards' });
  });
  const compensa = top0 != null && items.some(it => it.arriba);
  const t0 = performance.now();
  // El dedo manda: si mientras se anima la persona mueve la pantalla (rueda, dedo o cualquier
  // scroll que no puso la app), se deja de corregir el scroll y al final no se lo vuelve atrás.
  // objetivo: adónde se lleva el scroll (con decimales: el navegador lo redondea, y redondeando en
  // cada cuadro se juntaban 2 px); esperado: dónde quedó, para saber si después lo movió otro.
  let objetivo = window.scrollY, esperado = objetivo, suelto = false, raf = 0, listo = false;
  const soltar = () => { suelto = true; };
  const movio = () => { if (Math.abs(window.scrollY - esperado) > 1) suelto = true; };
  const OPC = { passive: true, capture: true };
  window.addEventListener('wheel', soltar, OPC);
  window.addEventListener('touchmove', soltar, OPC);
  const fin = () => {
    if (listo) return;
    listo = true; cancelAnimationFrame(raf); actual = null;
    window.removeEventListener('wheel', soltar, OPC);
    window.removeEventListener('touchmove', soltar, OPC);
    movio();
    alFin();
    // También la card que ya dejó su lugar a la fila: si se toca otro a mitad de camino vuelve a la
    // pantalla (ver desplegar) y tiene que llegar limpia, sin el giro ni los estilos de antes.
    items.forEach(it => {
      it.el.classList.remove('ex-anim');
      [it.el, ...it.cuerpo].forEach((k, i) => restaurar(k, it.estilos[i]));
      if (it.giro) it.giro.cancel(); // queda la flecha del CSS, que ya apunta igual
      if (it.quieto){ it.el.inert = false; it.el.removeAttribute('aria-hidden'); }
    });
    if (!suelto) fijar(ancla, top0);
    if (luego) luego();
  };
  const cuadro = now => {
    if (compensa && !suelto) movio();
    const p = Math.min(1, Math.max(0, (now - t0) / DUR)), e = curva(p);
    let dy = 0;
    items.forEach(it => {
      const h = it.desde + (it.hasta - it.desde) * e;
      if (it.arriba) dy += h - it.h;
      it.h = h;
      it.el.style.height = h + 'px';
      const o = String(it.o0 + ((it.abre ? 1 : 0) - it.o0) * e);
      it.cuerpo.forEach(k => { k.style.opacity = o; });
    });
    // A una posición fija y no con scrollBy: si el anclaje de scroll del navegador ya corrigió algo
    // al medir, así no se suma dos veces.
    if (compensa && dy && !suelto){ objetivo += dy; esperado = scrollA(objetivo); }
    if (p < 1) raf = requestAnimationFrame(cuadro); else fin();
  };
  actual = { fin };
  cuadro(t0); // el primer cuadro ya sale con los altos de antes: nada salta antes de animar
  fijar(ancla, top0); objetivo = esperado = window.scrollY;
}

// La card mientras se achica: sin toques ni lector de pantalla.
function quieta(it){ it.quieto = true; it.el.inert = true; it.el.setAttribute('aria-hidden', 'true'); }

// Abrir o cerrar (y lo que se cierra por abrir otro). anclaId: el ejercicio que se tocó.
// aplicar(): cambia cuáles están abiertos y redibuja (en el lugar); después se anima de los altos
// de antes a los nuevos, ya medidos. La card que se cierra vuelve a su lugar mientras se achica
// hasta el alto justo de la fila que la reemplaza: al cambiarla por la fila no se mueve nada.
export function desplegar(anclaId, aplicar){
  // Se mide antes de terminar la animación anterior: si se toca de nuevo a mitad de camino, la
  // nueva sigue desde el alto (y la opacidad y el giro) que se ve, sin saltar primero al final.
  const antes = foto(), a0 = antes.get(anclaId);
  const top0 = a0 ? a0.n.getBoundingClientRect().top : null;
  const conFoco = !!a0 && a0.n.contains(document.activeElement);
  terminarDespliegue();
  aplicar();
  const despues = foto(), items = [];
  antes.forEach((v, id) => {
    const d = despues.get(id);
    if (d && d.abierto !== v.abierto) items.push({ id, viejo: v.n, nuevo: d.n, abre: d.abierto, desde: v.h, hasta: d.h, el: d.abierto ? d.n : v.n, op0: v.op, ang0: v.ang });
  });
  // El nodo del ejercicio tocado: el que se abre ya es la card nueva; el que se cierra sigue siendo
  // la card vieja hasta el final.
  const ancla = () => {
    const it = items.find(x => x.id === anclaId);
    if (it) return it.abre || !it.viejo.isConnected ? it.nuevo : it.viejo;
    const d = despues.get(anclaId); return d && d.n;
  };
  const foco = conFoco ? () => reenfocar(anclaId) : null;
  if (!items.length || sinMovimiento()){ fijar(ancla, top0); if (foco) foco(); return; }
  // La card que se cierra vuelve a su lugar mientras se achica, sin data-ex-id (para el resto de la
  // app ese ejercicio ya está cerrado), y al final deja su lugar a la fila.
  items.forEach(it => {
    if (it.abre) return;
    it.nuevo.replaceWith(it.el); quieta(it);
    it.el.removeAttribute('data-ex-id'); it.el.dataset.exCerrando = it.id;
  });
  animar(items, ancla, top0, () => items.forEach(it => { if (!it.abre && it.viejo.isConnected) it.viejo.replaceWith(it.nuevo); }), foco);
  if (foco) foco(); // el que se abre ya está; el que se cierra, al final
}

// Cambio de día con los chips: lo de abajo de la fila de días entra con un deslizamiento corto
// hacia el lado del día elegido, sin pasar nunca por vacío (arranca en la mitad de opacidad). Solo
// opacidad y translate (la placa de video lo hace sola), y solo lo que se ve. Lo que tiene entrada
// propia al aparecer ([data-reveal], como las notas del día) queda ya revelado y sin su transición:
// una sola animación, no el deslizamiento y encima la subida de la entrada.
export function entrarDia(dir){
  if (!dir || sinMovimiento()) return;
  const tabs = document.querySelector('#view .tabs');
  if (!tabs || !tabs.animate) return;
  const opts = { duration: 220, easing: CURVA_CSS };
  for (let n = tabs.nextElementSibling; n; n = n.nextElementSibling){
    if (n.getBoundingClientRect().top > window.innerHeight) break;
    if (n.dataset.reveal && !n.classList.contains('reveal-in')){
      n.classList.add('reveal-in'); revealedBlocks.add(n.dataset.reveal);
      if (n.getAnimations) n.getAnimations().forEach(x => { if (x.transitionProperty) x.finish(); });
    }
    n.animate([{ opacity: .5, translate: (dir * 12) + 'px 0' }, { opacity: 1, translate: '0 0' }], opts);
  }
}
