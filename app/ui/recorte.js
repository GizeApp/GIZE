// Acomodar la foto de perfil antes de subirla: se ve dentro del círculo, se arrastra con
// el dedo (o el mouse) para moverla y se agranda pellizcando, con la barrita o con la
// ruedita. Antes se recortaba sola al centro y en las fotos verticales la cara quedaba
// cortada. Devuelve el cuadrado elegido como JPEG (lo que muestra el círculo) o null si
// se cancela. La usa uploadMyAvatar (core/avatar.js) a través de main.js (avatar-pick).

const OUT = 320;       // lado de la foto que se sube (igual que core/avatar.js)
const MAX_ZOOM = 4;    // cuánto se puede agrandar sobre el tamaño que ya llena el círculo

function loadImg(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    // El <img> respeta la orientación de la foto (EXIF), igual al mostrarla y al recortarla.
    img.onload = () => res({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

export async function cropAvatar(file){
  const { img, url } = await loadImg(file);
  const W0 = img.naturalWidth, H0 = img.naturalHeight;
  if (!W0 || !H0){ URL.revokeObjectURL(url); throw new Error("No se pudo leer la imagen"); }

  const box = document.createElement("div");
  box.className = "crp";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "crpTitle");
  box.innerHTML = `
    <div class="crp-card">
      <div class="crp-title" id="crpTitle">Acomodá tu foto</div>
      <div class="crp-sub">Arrastrala para moverla y pellizcá (o usá la barra) para agrandarla.</div>
      <div class="crp-stage" aria-label="Foto de perfil: arrastrá para moverla"><img class="crp-img" alt="" draggable="false"><div class="crp-ring" aria-hidden="true"></div></div>
      <label class="crp-zoom"><span aria-hidden="true">−</span><input type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Agrandar la foto"><span aria-hidden="true">+</span></label>
      <div class="crp-btns"><button type="button" class="ctrl ghost crp-cancel">Cancelar</button><button type="button" class="ctrl primary crp-ok">Usar foto</button></div>
    </div>`;
  const stage = box.querySelector(".crp-stage"), el = box.querySelector(".crp-img"), range = box.querySelector('input[type="range"]');
  el.src = url;
  el.style.width = W0 + "px"; el.style.height = H0 + "px";
  document.body.appendChild(box);
  document.body.classList.add("crp-open");

  // Estado: z = zoom (1 = la foto justo llena el cuadrado), (x, y) = esquina de la foto
  // dentro del cuadrado, en píxeles de pantalla. Siempre cubre todo el cuadrado.
  let S = 0, base = 1, z = 1, x = 0, y = 0;
  const scale = () => base * z;
  const clamp = () => {
    const w = W0 * scale(), h = H0 * scale();
    x = Math.min(0, Math.max(S - w, x));
    y = Math.min(0, Math.max(S - h, y));
  };
  const paint = () => { el.style.transform = `translate(${x}px, ${y}px) scale(${scale()})`; };
  // Cambia el zoom dejando quieto el punto (fx, fy) del cuadrado (el centro, o entre los dedos).
  const zoomTo = (nz, fx = S / 2, fy = S / 2) => {
    nz = Math.min(MAX_ZOOM, Math.max(1, nz));
    const k = nz / z;
    x = fx - (fx - x) * k; y = fy - (fy - y) * k; z = nz;
    clamp(); paint(); range.value = String(z);
  };
  const layout = () => {
    const r = stage.getBoundingClientRect(), prevS = S, prevScale = scale();
    S = r.width || 280;
    base = S / Math.min(W0, H0);
    if (!prevS){ x = (S - W0 * base) / 2; y = (S - H0 * base) / 2; }
    else { const k = scale() / prevScale; x *= k; y *= k; } // girar el celular: mismo encuadre
    clamp(); paint();
  };
  layout();
  const onResize = () => layout();
  window.addEventListener("resize", onResize);

  // Arrastrar con un dedo, pellizcar con dos (pointer events: sirven para dedo y mouse).
  const pts = new Map();
  let last = null; // { x, y, dist } del gesto en curso
  const rel = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const gesture = () => {
    const p = [...pts.values()];
    if (p.length === 1) return { x: p[0].x, y: p[0].y, dist: 0 };
    return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
  };
  stage.addEventListener("pointerdown", e => {
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    pts.set(e.pointerId, rel(e)); last = gesture();
  });
  stage.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, rel(e));
    const g = gesture();
    if (last){
      if (g.dist && last.dist) zoomTo(z * g.dist / last.dist, g.x, g.y);
      x += g.x - last.x; y += g.y - last.y; clamp(); paint();
    }
    last = g;
  });
  const up = e => { pts.delete(e.pointerId); last = pts.size ? gesture() : null; };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", e => { e.preventDefault(); const p = rel(e); zoomTo(z * Math.exp(-e.deltaY / 400), p.x, p.y); }, { passive: false });
  range.addEventListener("input", () => zoomTo(parseFloat(range.value) || 1));

  const result = await new Promise(done => {
    const finish = v => { document.removeEventListener("keydown", onKey); done(v); };
    const onKey = e => { if (e.key === "Escape") finish(null); };
    document.addEventListener("keydown", onKey);
    box.querySelector(".crp-cancel").addEventListener("click", () => finish(null));
    box.querySelector(".crp-ok").addEventListener("click", () => finish("ok"));
    box.querySelector(".crp-ok").focus({ preventScroll: true });
  });

  let blob = null;
  if (result === "ok"){
    // Lo que se ve en el cuadrado, en píxeles de la foto original.
    const s = scale(), side = S / s, sx = -x / s, sy = -y / s;
    const cv = document.createElement("canvas"); cv.width = cv.height = OUT;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT, OUT);
    blob = await new Promise(res => cv.toBlob(b => res(b), "image/jpeg", 0.85));
  }
  window.removeEventListener("resize", onResize);
  box.remove();
  document.body.classList.remove("crp-open");
  URL.revokeObjectURL(url);
  if (result === "ok" && !blob) throw new Error("No se pudo procesar la imagen");
  return blob;
}
