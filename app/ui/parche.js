// Redibujo en el lugar (Entreno). Antes renderApp() reemplazaba todo #view con innerHTML en cada
// toque (abrir un ejercicio, tildar una serie, abrir una ventana): se volvían a crear la portada
// del día, la fila de días y todos los ejercicios, y lo que tenía animación de entrada la repetía
// (la portada «saltaba» en cada toque, ver el video del 19/10). Ahora se arma el HTML nuevo aparte
// y se cambian solo los bloques de arriba (hijos directos de #view) que cambiaron: se compara
// desde el principio y desde el final, y lo del medio se reemplaza. Lo que quedó igual sigue
// siendo el mismo nodo: no parpadea, no repite su entrada y no pierde el foco ni el scroll.
export function parchar(host, html){
  // Lo escrito en un campo vive en .value, no en el atributo: se pasa al atributo para que la
  // comparación vea lo que está en pantalla. Si el dato cambió por otro lado (una variante, «Usar
  // estos pesos»), el campo no coincide con el HTML nuevo y se redibuja con el valor bueno.
  host.querySelectorAll("input, textarea").forEach(alAtributo);
  // Un style vacío (lo que queda al sacar el último estilo puesto desde JS) no cuenta como cambio.
  host.querySelectorAll('[style=""]').forEach(n => n.removeAttribute("style"));
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const nuevos = [...tpl.content.childNodes], viejos = [...host.childNodes];
  const nv = nuevos.length, vv = viejos.length;
  let i = 0;
  while (i < vv && i < nv && viejos[i].isEqualNode(nuevos[i])) i++;
  let j = 0;
  while (j < vv - i && j < nv - i && viejos[vv - 1 - j].isEqualNode(nuevos[nv - 1 - j])) j++;
  const ref = j ? viejos[vv - j] : null;
  for (let k = i; k < vv - j; k++) viejos[k].remove();
  const frag = document.createDocumentFragment();
  for (let k = i; k < nv - j; k++) frag.appendChild(nuevos[k]);
  host.insertBefore(frag, ref);
}

function alAtributo(el){
  if (el.tagName === "TEXTAREA"){ if (el.defaultValue !== el.value) el.defaultValue = el.value; return; }
  const t = el.type;
  if (t === "checkbox" || t === "radio"){ if (el.defaultChecked !== el.checked) el.defaultChecked = el.checked; return; }
  if (t === "file") return;
  if (el.value !== (el.getAttribute("value") ?? "")) el.setAttribute("value", el.value);
}
