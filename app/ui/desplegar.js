// Abrir y cerrar ejercicios en Entreno sin saltos. Pedido (video del 19/10): «al abrir un
// ejercicio el panel del día hace un pop-up que queda muy tosco; debe ir todo mucho más fluido».
// Antes cada toque redibujaba toda la pantalla: la portada repetía su entrada, el ejercicio que
// se cerraba quedaba invisible un momento (la lista parecía desaparecer) y, si se cerraba otro
// más arriba, el que se tocó saltaba para arriba. Ahora:
// - el redibujo es en el lugar (ui/parche.js): solo cambian los ejercicios que se abren o cierran;
// - el que se abre crece desde el alto de su fila y el que se cierra se achica hasta el alto de la
//   fila (DUR ms, arranca rápido y frena suave), con su contenido apareciendo o yéndose de a poco;
// - lo que tocó el dedo queda quieto: si algo de más arriba cambia de alto, se corrige el scroll
//   en cada cuadro.
// Con «reducir movimiento» o el modo liviano no hay animación: cambia de una vez, y el dedo igual
// queda en su lugar.
import { isLite } from './background.js';

const DUR = 240;
const curva = t => 1 - Math.pow(1 - t, 3); // ease-out cúbica
const CURVA_CSS = 'cubic-bezier(.33,1,.68,1)';

export function sinMovimiento(){
  return isLite() || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// Cada ejercicio a la vista: abierto (card) o cerrado (fila), con su alto. La card que se está
// cerrando (data-ex-cerrando) cuenta como abierta, con el alto que tiene en ese momento.
function foto(){
  const m = new Map();
  document.querySelectorAll('#view .card[data-ex-id], #view .ex-collapsed[data-ex], #view .card[data-ex-cerrando]').forEach(n => {
    m.set(n.dataset.exId || n.dataset.ex || n.dataset.exCerrando, { n, abierto: n.classList.contains('card'), h: n.offsetHeight });
  });
  return m;
}

let actual = null; // la animación en curso, para terminarla de una si llega otro redibujo

// Deja la pantalla como queda al final de la animación (la llama renderApp antes de redibujar).
export function terminarDespliegue(){ if (actual) actual.fin(); }

// Corrige el scroll para que el nodo del ejercicio tocado vuelva a estar donde lo tocó el dedo.
function fijar(ancla, top0){
  const n = top0 == null ? null : ancla();
  if (!n || !n.isConnected) return;
  const dy = n.getBoundingClientRect().top - top0;
  if (Math.abs(dy) >= 0.5) window.scrollBy(0, dy);
}

// Chrome pasa los estilos puestos desde JS al atributo recién cuando alguien lo lee: sin leerlo
// antes, removeAttribute dejaba un style="" que aparecía después (y el nodo ya no era igual al
// HTML nuevo para ui/parche.js).
function restaurar(k, st){ k.getAttribute('style'); if (st == null) k.removeAttribute('style'); else k.setAttribute('style', st); }

// Anima el alto de cada item ({ el, desde, hasta, abre }) cuadro a cuadro, con lo de adentro (menos
// la cabecera) apareciendo o yéndose de a poco y la flechita girando. Si algo de más arriba que el
// ejercicio tocado cambia de alto, se compensa con el scroll sumando lo que cambió (sin medir la
// pantalla en cada cuadro). alFin() deja la pantalla como queda; lo que sigue en pantalla se limpia.
function animar(items, ancla, top0, alFin){
  const a = ancla();
  items.forEach(it => {
    const el = it.el;
    el.classList.add('ex-anim');
    // Opacidad de cada hijo: una variable CSS en la card recalculaba el estilo de todo lo de adentro
    // en cada cuadro (10 ms por cuadro con el procesador 4 veces más lento; así, menos de 2).
    it.cuerpo = [...el.children].filter(k => !k.classList.contains('card-head'));
    it.estilos = [el, ...it.cuerpo].map(k => k.getAttribute('style'));
    it.h = it.desde;
    it.arriba = !!a && el !== a && !!(el.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    const chev = el.querySelector('.card-head .ex-chev svg');
    if (chev && chev.animate) it.giro = chev.animate([{ transform: 'rotate(' + (it.abre ? 0 : 180) + 'deg)' }, { transform: 'rotate(' + (it.abre ? 180 : 0) + 'deg)' }], { duration: DUR, easing: CURVA_CSS, fill: 'forwards' });
  });
  const compensa = top0 != null && items.some(it => it.arriba);
  const t0 = performance.now();
  let sy0 = 0, corrido = 0, raf = 0, listo = false;
  const fin = () => {
    if (listo) return;
    listo = true; cancelAnimationFrame(raf); actual = null;
    alFin();
    items.forEach(it => {
      if (!it.el.isConnected) return;
      it.el.classList.remove('ex-anim');
      [it.el, ...it.cuerpo].forEach((k, i) => restaurar(k, it.estilos[i]));
      if (it.giro) it.giro.cancel(); // queda la flecha del CSS, que ya apunta igual
      if (it.quieto){ it.el.inert = false; it.el.removeAttribute('aria-hidden'); }
    });
    fijar(ancla, top0);
  };
  const cuadro = now => {
    const p = Math.min(1, Math.max(0, (now - t0) / DUR)), e = curva(p);
    let dy = 0;
    items.forEach(it => {
      const h = it.desde + (it.hasta - it.desde) * e;
      if (it.arriba) dy += h - it.h;
      it.h = h;
      it.el.style.height = h + 'px';
      const o = String(it.abre ? e : 1 - e);
      it.cuerpo.forEach(k => { k.style.opacity = o; });
    });
    if (compensa && dy){ corrido += dy; window.scrollTo(0, sy0 + corrido); }
    if (p < 1) raf = requestAnimationFrame(cuadro); else fin();
  };
  actual = { fin };
  cuadro(t0); // el primer cuadro ya sale con los altos de antes: nada salta antes de animar
  fijar(ancla, top0); sy0 = window.scrollY;
}

// La card mientras se achica: sin toques ni lector de pantalla.
function quieta(it){ it.quieto = true; it.el.inert = true; it.el.setAttribute('aria-hidden', 'true'); }

// Abrir (y lo que se cierra por abrir otro). anclaId: el ejercicio que se tocó. aplicar(): cambia
// cuáles están abiertos y redibuja (en el lugar); después se anima de los altos de antes a los nuevos.
export function desplegar(anclaId, aplicar){
  // Se mide antes de terminar la animación anterior: si se toca de nuevo a mitad de camino, la
  // nueva sigue desde el alto que se ve, sin saltar primero al final.
  const antes = foto(), a0 = antes.get(anclaId);
  const top0 = a0 ? a0.n.getBoundingClientRect().top : null;
  terminarDespliegue();
  aplicar();
  const despues = foto(), items = [];
  antes.forEach((v, id) => {
    const d = despues.get(id);
    if (d && d.abierto !== v.abierto) items.push({ id, viejo: v.n, nuevo: d.n, abre: d.abierto, desde: v.h, hasta: d.h, el: d.abierto ? d.n : v.n });
  });
  // El nodo del ejercicio tocado: el que se abre ya es la card nueva; el que se cierra sigue siendo
  // la card vieja hasta el final.
  const ancla = () => {
    const it = items.find(x => x.id === anclaId);
    if (it) return it.abre || !it.viejo.isConnected ? it.nuevo : it.viejo;
    const d = despues.get(anclaId); return d && d.n;
  };
  if (!items.length || sinMovimiento()){ fijar(ancla, top0); return; }
  // La card que se cierra (por abrir otro) vuelve a su lugar mientras se achica, sin data-ex-id
  // (para el resto de la app ese ejercicio ya está cerrado), y al final deja su lugar a la fila.
  items.forEach(it => {
    if (it.abre) return;
    it.nuevo.replaceWith(it.el); quieta(it);
    it.el.removeAttribute('data-ex-id'); it.el.dataset.exCerrando = it.id;
  });
  animar(items, ancla, top0, () => items.forEach(it => { if (!it.abre && it.viejo.isConnected) it.viejo.replaceWith(it.nuevo); }));
}

// Cerrar sin abrir otro (la flechita, o al completar el ejercicio): primero se achica la card que
// está en pantalla (no hay nada que dibujar todavía, así que el toque responde en el acto) y recién
// al final aplicar() cambia el estado y redibuja, con la card ya del alto de la fila: no se nota.
export function cerrar(ids, anclaId, aplicar){
  const antes = foto(), a0 = antes.get(anclaId);
  const top0 = a0 ? a0.n.getBoundingClientRect().top : null;
  terminarDespliegue();
  const fila = document.querySelector('#view .ex-collapsed');
  const items = ids.map(id => ({ id, el: document.querySelector('#view .card[data-ex-id="' + CSS.escape(id) + '"]') })).filter(it => it.el);
  // Sin otra fila de dónde sacar el alto (o sin animación), como al abrir: redibuja y anima.
  if (!items.length || !fila || sinMovimiento()) return desplegar(anclaId, aplicar);
  const hasta = fila.offsetHeight;
  items.forEach(it => { const v = antes.get(it.id); it.desde = v ? v.h : it.el.offsetHeight; it.hasta = hasta; it.abre = false; quieta(it); });
  const card = items.find(it => it.id === anclaId);
  const ancla = () => card && card.el.isConnected ? card.el : document.querySelector('#view .card[data-ex-id="' + CSS.escape(anclaId) + '"], #view .ex-collapsed[data-ex="' + CSS.escape(anclaId) + '"]');
  animar(items, ancla, top0, aplicar);
}

// Cambio de día con los chips: lo de abajo de la fila de días entra con un deslizamiento corto
// hacia el lado del día elegido, sin pasar nunca por vacío (arranca en la mitad de opacidad). Solo
// opacidad y translate (la placa de video lo hace sola), y solo lo que se ve.
export function entrarDia(dir){
  if (!dir || sinMovimiento()) return;
  const tabs = document.querySelector('#view .tabs');
  if (!tabs || !tabs.animate) return;
  const opts = { duration: 220, easing: CURVA_CSS };
  for (let n = tabs.nextElementSibling; n; n = n.nextElementSibling){
    if (n.getBoundingClientRect().top > window.innerHeight) break;
    n.animate([{ opacity: .5, translate: (dir * 12) + 'px 0' }, { opacity: 1, translate: '0 0' }], opts);
  }
}
