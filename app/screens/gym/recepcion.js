// Recepción básica del gimnasio (SPEC §2.10, columna «Recepción básica»; etapa 1). La abre la cuenta de
// recepción al entrar (pantalla sola, se sale cerrando la sesión), el dueño y la administración desde
// «Recepción» de su panel (y el «Ingreso manual» de Asistencia, en una ventana), y el profe desde su
// panel de coach si el gimnasio prendió «Los profes pueden abrir la recepción» (screens/coach/gimnasio.js).
// Se carga con import() solo para ellos: para el resto de las cuentas este archivo ni se pide.
//
// Qué hace: buscar por nombre o DNI (buscar_socio), ver la foto del gimnasio (la que sacó o aprobó el
// gimnasio, nunca la de perfil), el semáforo con su motivo y si el apto médico venció, y registrar el
// ingreso (gym_ingreso_manual). El id del ingreso lo genera la app y se guarda hasta que el servidor
// contesta: tocar dos veces o reintentar sin señal no anota dos; si ya entró en las últimas N horas
// (ingreso_horas del gimnasio), el servidor no anota otro y acá se dice. No muestra montos, entrenos,
// comidas, chats ni notas. El semáforo de la etapa 1 sale del estado de la ficha; la etapa 2 lo llena
// con la cuota sin cambiar la forma del dato ({semaforo, motivo, apto_vencido}). Nada frena el ingreso:
// la recepción decide (P12).
//
// Con permiso de altas (dueño y administración siempre; la recepción con «La recepción aprueba
// solicitudes y carga fichas»): [Cargar ficha], [Solicitudes] y [Sacar foto] a quien no tiene; esos
// botones los atiende el panel (data-gym, app/screens/gym/index.js).
//
// Lo que cambia mientras se busca o se registra se redibuja solo adentro de la recepción (.gy-rec-res):
// el buscador no pierde el foco ni lo escrito. El resto (otra pantalla, la ventana) lo redibuja quien
// la muestra (alRepintar).
import { esc } from '../../core/utils.js';
import { rpc, info, fotoHtml, pedirFotos, horaAR, cuando, plural } from './estado.js';
import { marcarRecepcion } from './inicio.js';

// q: lo escrito; lista: lo que contestó buscar_socio (null = todavía nada); sel: la ficha elegida;
// pend: por ficha, el id del ingreso que todavía no confirmó el servidor (un reintento usa el mismo);
// hecho: por ficha, lo que contestó el último registro; busy: la ficha que se está registrando.
export const RS = { q: "", lista: null, error: "", buscando: false, sel: null, pend: {}, hecho: {}, errIng: {}, busy: "", seq: 0 };
let repintarFuera = () => {};
// Quien muestra la recepción avisa cómo redibujarse entera (cuando hace falta: llegó una foto).
export function alRepintar(f){ repintarFuera = typeof f === "function" ? f : () => {}; }
// Después de un ingreso registrado (Asistencia vuelve a leer la lista del día).
let alIngreso = () => {};
export function alRegistrar(f){ alIngreso = typeof f === "function" ? f : () => {}; }

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const horas = () => { const n = parseInt((info().settings || {}).ingreso_horas, 10); return n > 0 ? n : 3; };
const lupa = '<svg class="cv-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>';
// ¿Alcanza para buscar? (lo mismo que pide el servidor: 2 letras o 3 números del DNI)
export function buscable(q){
  const t = String(q || "").trim();
  if (/^[0-9 .]+$/.test(t)) return t.replace(/\D/g, "").length >= 3;
  return t.length >= 2;
}

// El semáforo: color y motivo (y la marca del apto médico vencido).
const COLOR = { verde: "verde", ambar: "ambar", rojo: "rojo", gris: "gris" };
export function semaforo(s, grande){
  const c = COLOR[s && s.semaforo] || "gris";
  return '<span class="gy-sem ' + c + (grande ? ' gy-sem-l' : '') + '"><i aria-hidden="true"></i>' + esc((s && s.motivo) || "Sin datos") + '</span>' +
    (s && s.apto_vencido ? '<span class="gy-tag gy-tag-ambar">Apto médico vencido</span>' : '');
}

// La recepción entera. o: { altas: puede cargar fichas, aprobar y sacar fotos; compacto: en una ventana
// (sin los botones de altas); titulo: el h2 de arriba, si lo lleva }.
export function renderRecepcion(o = {}){
  return '<section class="gy-rec' + (o.compacto ? ' gy-rec-compacto' : '') + '" aria-label="Recepción">' +
    '<label class="cv-find gy-rec-buscar">' + lupa + '<input class="co-search cv-search gy-rec-q" type="search" data-rec-q="1" placeholder="Nombre o DNI del socio" aria-label="Buscar socio por nombre o DNI" autocomplete="off" autocapitalize="words" enterkeyhint="search" value="' + esc(RS.q) + '"></label>' +
    '<div class="gy-rec-res" data-altas="' + (o.altas && !o.compacto ? "1" : "") + '">' + resultados(!!(o.altas && !o.compacto)) + '</div>' +
    (o.altas && !o.compacto ? '<div class="gy-acc gy-rec-altas">' +
      '<button class="co-copy-btn cv-sec-btn gy-btn2" data-gym="sumar" data-v="ficha">Cargar ficha</button>' +
      '<button class="co-copy-btn cv-sec-btn gy-btn2" data-gym="' + (o.solicitudes || "socios-tab") + '" data-v="solicitudes">Solicitudes</button></div>' : '') +
  '</section>';
}

function resultados(altas){
  const t = RS.q.trim();
  let estado = "";
  if (!t) estado = '<p class="gy-fino gy-rec-hint">Escribí el nombre o al menos 3 números del DNI.</p>';
  else if (!buscable(t)) estado = '<p class="gy-fino gy-rec-hint">Escribí al menos 2 letras o 3 números del DNI.</p>';
  else if (RS.error) estado = '<div class="gy-cartel bad" role="alert"><span>' + esc(RS.error) + '</span><button class="cv-link" data-rec="reintentar">Reintentar</button></div>';
  else if (RS.lista === null || (RS.buscando && !RS.lista.length)) estado = '<p class="gy-fino gy-rec-hint" aria-busy="true">Buscando…</p>';
  else if (!RS.lista.length) estado = '<p class="gy-fino gy-rec-hint" role="status">Nadie con «' + esc(t) + '». Probá con el DNI' + (altas ? ' o cargá la ficha.' : '.') + '</p>';
  if (estado) return estado;
  const sel = RS.lista.find(s => s.id === RS.sel) || (RS.lista.length === 1 ? RS.lista[0] : null);
  const lista = '<ul class="gy-rec-lista" aria-label="' + plural(RS.lista.length, "socio encontrado", "socios encontrados") + '">' + RS.lista.map(s =>
    '<li><button class="gy-rec-i' + (sel && sel.id === s.id ? ' on' : '') + '" data-rec="elegir" data-id="' + esc(s.id) + '"' + (sel && sel.id === s.id ? ' aria-current="true"' : '') + '>' +
      fotoHtml(s.foto_path, s.nombre) + '<span class="gy-rec-i-t"><b>' + esc(s.nombre || "Sin nombre") + '</b>' + semaforo(s) + '</span></button></li>').join("") + '</ul>';
  return '<div class="gy-rec-cols">' + lista + (sel ? detalle(sel, altas) : '<div class="cv-card gy-rec-ficha gy-rec-vacia"><p class="gy-fino">Tocá un socio para ver su foto y registrar el ingreso.</p></div>') + '</div>';
}

function detalle(s, altas){
  const h = RS.hecho[s.id], err = RS.errIng[s.id], busy = RS.busy === s.id;
  const foto = s.foto_path ? fotoHtml(s.foto_path, s.nombre, "gy-av-rec")
    : '<div class="gy-rec-sinfoto">' + fotoHtml(null, s.nombre, "gy-av-rec") + (altas ? '<span class="gy-fino">Sin foto: sacale una.</span>' : '<span class="gy-fino">Sin foto del gimnasio.</span>') + '</div>';
  let res = "";
  if (h){
    const a = horaAR(h.at);
    if (h.repetido) res = '<div class="gy-cartel warn" role="status"><span>Ya entró hoy a las ' + esc(a) + '. Se anota un ingreso cada ' + plural(horas(), "hora", "horas") + ': no se anotó otro.</span></div>';
    else {
      const txt = { ok: "Ingreso registrado a las " + a + ".", pausado: "Ingreso registrado a las " + a + ", pero está pausado.", baja: "Ingreso registrado a las " + a + ", pero está de baja.",
        visita: "Ingreso registrado a las " + a + " (visita).", rechazado: "Ingreso registrado a las " + a + ", pero todavía no es socio." }[h.result] || "Ingreso registrado a las " + a + ".";
      res = '<div class="' + (h.result === "ok" ? "gy-ok" : "gy-cartel warn") + '" role="status"><span>' + esc(txt) + '</span></div>';
    }
  }
  if (err) res = '<div class="gy-cartel bad" role="alert"><span>' + esc(err) + '</span></div>';
  return '<article class="cv-card gy-rec-ficha" aria-label="' + esc(s.nombre || "Socio") + '">' +
    '<div class="gy-rec-foto">' + foto + '</div>' +
    '<div class="gy-rec-dato"><h3 class="gy-rec-n">' + esc(s.nombre || "Sin nombre") + '</h3>' +
      '<div class="gy-rec-sem">' + semaforo(s, true) + '</div>' +
      '<p class="gy-fino">Último ingreso: ' + (s.ultimo_ingreso ? esc(cuando(s.ultimo_ingreso)) : "nunca") + '</p></div>' +
    '<div class="gy-rec-acc">' + res +
      '<button class="gize-btn cv-btn gy-rec-ing" data-rec="ingreso" data-id="' + esc(s.id) + '"' + (busy ? ' disabled aria-busy="true"' : '') + '>' + (busy ? "Registrando…" : (RS.pend[s.id] ? "Reintentar el ingreso" : "Registrar ingreso")) + '</button>' +
      (altas && !s.foto_path ? '<label class="co-copy-btn cv-sec-btn gy-btn2 gy-foto-btn">Sacar foto<input class="gy-foto-in" type="file" accept="image/*" capture="user" data-gym-foto="' + esc(s.id) + '"></label>' : '') +
    '</div></article>';
}

// Redibuja solo los resultados (el buscador queda como está).
function pintar(){
  document.querySelectorAll(".gy-rec-res").forEach(el => { el.innerHTML = resultados(el.dataset.altas === "1"); });
}

// ---- Buscar ----
let reloj = null;
function alEscribir(q){
  RS.q = q; RS.error = "";
  clearTimeout(reloj);
  if (!buscable(q)){ RS.lista = null; RS.sel = null; RS.buscando = false; pintar(); return; }
  RS.buscando = true; if (RS.lista && !RS.lista.length) RS.lista = null;
  pintar();
  reloj = setTimeout(buscar, 280);
}
async function buscar(){
  const q = RS.q.trim(), n = ++RS.seq;
  if (!buscable(q)) return;
  RS.buscando = true;
  const r = await rpc("buscar_socio", { q });
  if (n !== RS.seq) return; // ya escribió otra cosa
  RS.buscando = false;
  if (r.error){ RS.error = r.msg; RS.lista = []; pintar(); return; }
  marcarRecepcion();
  RS.lista = Array.isArray(r.data) ? r.data : [];
  if (!RS.lista.some(s => s.id === RS.sel)) RS.sel = RS.lista.length === 1 ? RS.lista[0].id : null;
  pintar();
  pedirFotos(RS.lista.map(s => s.foto_path)).then(ok => { if (ok && n === RS.seq) pintar(); });
}

// ---- Registrar el ingreso ----
async function registrar(id){
  if (RS.busy) return;
  const s = (RS.lista || []).find(x => x.id === id); if (!s) return;
  const clave = RS.pend[id] || (RS.pend[id] = uuid());
  RS.busy = id; delete RS.errIng[id]; delete RS.hecho[id];
  pintar();
  const r = await rpc("gym_ingreso_manual", { id: clave, ficha: id });
  RS.busy = "";
  if (r.error){
    // El id queda guardado: si el ingreso llegó al servidor y se cortó la respuesta, el reintento no
    // anota otro.
    RS.errIng[id] = r.msg;
  } else {
    delete RS.pend[id];
    RS.hecho[id] = r.data || {};
    if (r.data && !r.data.repetido) s.ultimo_ingreso = r.data.at || new Date().toISOString();
    marcarRecepcion();
    try { alIngreso(r.data); } catch (e) {}
  }
  pintar();
  const b = document.querySelector('.gy-rec-res [data-rec="ingreso"][data-id="' + id + '"]'); if (b) b.focus({ preventScroll: true });
}

// La foto que sacó el gimnasio (subirFoto del panel): aparece en el resultado sin volver a buscar.
export function fotoNueva(fichaId, path){
  const s = (RS.lista || []).find(x => x.id === fichaId); if (!s) return;
  s.foto_path = path;
  pedirFotos([path]).then(() => { pintar(); repintarFuera(); });
}
// Empezar de cero (otra cuenta, cerrar la ventana del ingreso manual).
export function limpiar(){ RS.q = ""; RS.lista = null; RS.error = ""; RS.sel = null; RS.hecho = {}; RS.errIng = {}; }

document.addEventListener("input", e => {
  const t = e.target;
  if (t && t.matches && t.matches("input[data-rec-q]")){
    // Si hay otro buscador de la recepción (la pantalla y la ventana), que diga lo mismo.
    document.querySelectorAll("input[data-rec-q]").forEach(i => { if (i !== t) i.value = t.value; });
    alEscribir(t.value);
  }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (e.key === "Enter" && t && t.matches && t.matches("input[data-rec-q]")){
    e.preventDefault(); clearTimeout(reloj);
    // Enter con un solo resultado elegido: registra (el mostrador apurado).
    const s = (RS.lista || []).find(x => x.id === RS.sel);
    if (s && !RS.buscando && RS.lista.length === 1) registrar(s.id); else buscar();
  }
});
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-rec]");
  if (!b || b.disabled) return;
  const a = b.dataset.rec;
  if (a === "elegir"){
    RS.sel = b.dataset.id; pintar();
    // En el celular la ficha queda abajo de la lista: se la acerca.
    const f = document.querySelector(".gy-rec-res .gy-rec-ficha");
    if (f && f.getBoundingClientRect().top > window.innerHeight - 120) f.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const ing = document.querySelector('.gy-rec-res [data-rec="ingreso"]'); if (ing && window.innerWidth >= 900) ing.focus({ preventScroll: true });
    return;
  }
  if (a === "ingreso") return registrar(b.dataset.id);
  if (a === "reintentar"){ RS.error = ""; RS.lista = null; pintar(); buscar(); }
});

