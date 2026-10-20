// QR del link para sumarse al gimnasio (Socios → Sumar socio y Configuración → Código). Este QR NO
// controla el ingreso: solo abre el link para pedir sumarse. La librería (vendor/qrcode-generator-1.4.4.js,
// versión fija, MIT) se carga recién acá, la primera vez que se dibuja un QR.
let carga = null;
function cargar(){
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!carga) carga = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = "vendor/qrcode-generator-1.4.4.js"; s.async = true;
    s.onload = () => window.qrcode ? ok(window.qrcode) : no(new Error("qr"));
    s.onerror = () => { carga = null; no(new Error("qr")); };
    document.head.appendChild(s);
  });
  return carga;
}
// El SVG del QR (texto), o "" si no se pudo cargar la librería.
export async function qrSvg(texto, tam){
  try {
    const q = await cargar();
    const c = q(0, "M"); c.addData(texto); c.make();
    const n = c.getModuleCount(), m = 4, total = n + m * 2;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (c.isDark(y, x)) d += "M" + (x + m) + " " + (y + m) + "h1v1h-1z";
    return '<svg class="gy-qr-svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + (tam || 180) + '" height="' + (tam || 180) + '" role="img" aria-label="Código QR del link para sumarse" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  } catch (e) { return ""; }
}
// Dibuja el QR adentro de cada [data-gy-qr] que todavía no lo tiene.
export function pintarQrs(){
  document.querySelectorAll("[data-gy-qr]:not([data-hecho])").forEach(el => {
    el.setAttribute("data-hecho", "1");
    qrSvg(el.getAttribute("data-gy-qr"), +el.getAttribute("data-tam") || 180).then(svg => { if (el.isConnected) el.innerHTML = svg || '<span class="gy-mut">No se pudo dibujar el QR.</span>'; });
  });
}
