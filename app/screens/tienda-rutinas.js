// Tienda de rutinas: rutinas armadas por la gente (creadores, coaches), para agregar a tu app y para
// publicar la tuya. Se entra desde Entreno → «Tienda de rutinas» (State.view === "tienda").
//
// Todo sale de la base (supabase/tienda-rutinas.sql, core/tienda-datos.js) y es gratis: no hay precios
// ni compras, así que vale igual en la web y en las apps de iPhone y Android (AGENTS.md: ninguna regla
// de las tiendas se toca). El botón de Entreno aparece solo si el admin la prendió para esta plataforma
// (app_config 'tienda'), y no para quien tiene coach (su rutina la maneja el coach).
//   · «Agregar» carga la rutina en Entreno (mismo criterio que «Ver rutinas armadas»), sin kilos ni notas.
//   · «Publicar» sube tu rutina actual, sin kilos, notas, videos ni audios, con el nombre de tu perfil.
//   · Denunciar: con 3 denuncias distintas la rutina se oculta sola hasta que la revisa el admin.
import { copiarDias } from '../core/rutinas-ejemplo.js';
import { diaDeHoy } from '../core/diasemana.js';
import { State, state } from '../core/state.js';
import { save } from '../core/storage.js';
import { esc } from '../core/utils.js';
import { agregarRutina, denunciarRutina, detalleRutina, listarRutinas, publicarRutina, sacarRutina, tiendaActiva } from '../core/tienda-datos.js';
import { renderApp } from '../main.js';
import { routineLocked } from './entreno.js';

const bagSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
const calSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const nivelSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 20v-5M12 20V10M18 20V4"/></svg>';
const peopleSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>';
const verifSvg = '<svg class="tn-verif" viewBox="0 0 24 24" aria-label="Creador verificado"><path fill="currentColor" d="M12 1l2.6 2.1 3.3-.3 1 3.2 2.8 1.8-1 3.2 1 3.2-2.8 1.8-1 3.2-3.3-.3L12 23l-2.6-2.1-3.3.3-1-3.2L2.3 16l1-3.2-1-3.2 2.8-1.8 1-3.2 3.3.3z"/><path d="M8 12l3 3 5-6" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Entrada desde Entreno (debajo de «Ver rutinas armadas»). Vacía si la tienda está apagada acá.
export function tiendaEntrada(){
  return tiendaActiva(renderApp) ? '<button class="load-def" data-action="tienda-open">' + bagSvg + ' Tienda de rutinas <span class="tn-soon">Muy pronto</span></button>' : '';
}

const NIVELES = ["Principiante", "Intermedio", "Avanzado"];
const OBJETIVOS = ["Fuerza", "Hipertrofia", "Glúteos", "Principiantes"];
const CATS = ["Todas"].concat(OBJETIVOS);
const MOTIVOS = [["inapropiada", "Contenido inapropiado"], ["spam", "Spam o publicidad"], ["copiada", "Es copia de otra persona"], ["otro", "Otro motivo"]];
// Dos manchas de color por portada: es un lugar para la foto del creador.
const TONOS = [
  ["radial-gradient(70% 60% at 85% 10%,rgba(47,160,255,.55),transparent 70%)", "radial-gradient(60% 50% at 10% 90%,rgba(166,92,255,.35),transparent 70%)"],
  ["radial-gradient(70% 60% at 10% 15%,rgba(255,61,174,.45),transparent 70%)", "radial-gradient(60% 50% at 90% 85%,rgba(47,160,255,.35),transparent 70%)"],
  ["radial-gradient(70% 60% at 80% 20%,rgba(37,232,200,.40),transparent 70%)", "radial-gradient(60% 50% at 15% 85%,rgba(47,160,255,.35),transparent 70%)"],
  ["radial-gradient(70% 60% at 15% 20%,rgba(166,92,255,.50),transparent 70%)", "radial-gradient(60% 50% at 85% 90%,rgba(255,61,174,.30),transparent 70%)"]
];

export const TiendaState = {
  tab: "explorar",   // "explorar" | "mias"
  cat: "Todas",
  q: "",
  lista: null,       // null = cargando; si no, las rutinas que mandó la base
  error: "",         // por qué no se pudo cargar la lista
  id: null,          // rutina abierta (detalle)
  det: null,         // la rutina abierta, con sus días (null mientras carga)
  detError: "",
  publicando: false, // formulario «Publicar mi rutina»
  form: null,        // { nombre, desc, nivel, obj }
  sheet: null,       // hoja de abajo: { t: "agregar" | "listo" | "publicada" | "denunciar" | "denunciada" | "sacar", id, err? }
  formErr: "",      // por qué no se pudo publicar
  motivo: "inapropiada",
  ocupado: false     // hay un pedido en camino (no se puede tocar dos veces)
};

// ---- Datos ----
const porId = id => (TiendaState.lista || []).find(r => r.id === id);
const visibles = () => (TiendaState.lista || []).filter(r => r.estado === "activa");
const hasWork = () => (state.days || []).some(d => (d.exercises || []).length);
const ini = n => String(n || "").split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase();
const tono = r => { let h = 0; for (const c of String(r.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % TONOS.length; };
const msg = e => String((e && e.message) || "No se pudo. Probá de nuevo.");
const creador = r => '<span class="tn-creator">' + esc(r.autor) + (r.verificado ? verifSvg : '') + '</span>';
const cover = (r, cls) => '<div class="tn-cover ' + (cls || '') + '" style="--c1:' + TONOS[tono(r)][0] + ';--c2:' + TONOS[tono(r)][1] + '"><span class="tn-ini" aria-hidden="true">' + esc(ini(r.autor)) + '</span>';
const usos = r => '<span class="tn-meta"><span>' + peopleSvg + r.agregadas + (r.agregadas === 1 ? ' persona' : ' personas') + '</span></span>';
const formVacio = () => ({ nombre: "", desc: "", nivel: "Principiante", obj: "Fuerza" });
const miNombre = () => String((State.cloudProfile && State.cloudProfile.full_name) || "").trim() || "Usuario de GIZE";

function filtradas(){
  const q = TiendaState.q.trim().toLowerCase(), c = TiendaState.cat;
  return visibles().filter(r => (c === "Todas" || r.objetivo === c) && (!q || (r.titulo + " " + r.autor).toLowerCase().includes(q)));
}

// Pide la lista a la base (una vez al entrar y cada vez que algo cambia).
function cargar(){
  const T = TiendaState;
  listarRutinas().then(l => { T.lista = l; T.error = ""; }, e => { T.error = msg(e); if (!T.lista) T.lista = []; })
    .then(() => { if (State.view === "tienda") renderApp(); });
}
function abrirDetalle(id){
  const T = TiendaState;
  T.id = id; T.det = null; T.detError = "";
  detalleRutina(id).then(d => { if (T.id === id) T.det = d; }, e => { if (T.id === id) T.detError = msg(e); })
    .then(() => { if (State.view === "tienda" && T.id === id) renderApp(); });
}

// ---- Dibujo ----
function fila(r, aparte){
  return '<button class="tn-item" data-action="tienda-ver" data-id="' + r.id + '">' + cover(r) + '</div>' +
    '<div class="tn-item-body"><div><div class="tn-item-t">' + esc(r.titulo) + '</div>' + creador(r) + '</div>' +
    '<div class="tn-row"><span class="tn-meta"><span>' + calSvg + r.dias + (r.dias === 1 ? ' día' : ' días') + '</span><span>' + nivelSvg + esc(r.nivel) + '</span></span>' +
    (aparte || usos(r)) + '</div></div></button>';
}
function listaHtml(){
  const l = filtradas();
  const vacia = TiendaState.q || TiendaState.cat !== "Todas" ? "No hay rutinas con ese filtro." : "Todavía no hay rutinas publicadas. Podés ser la primera persona: publicá la tuya.";
  return l.length ? l.map(r => fila(r)).join("") : '<div class="empty">' + vacia + '</div>';
}

function inicio(){
  const T = TiendaState;
  const destacada = !T.q && T.cat === "Todas" ? visibles().find(r => r.destacada) : null;
  const explorar = `
    <input id="tnQ" class="form-input tn-q" type="search" enterkeyhint="search" placeholder="Buscar rutina o creador" value="${esc(T.q)}" data-action="tienda-q" aria-label="Buscar rutina o creador">
    <div class="tabs tn-cats">${CATS.map(c => '<button class="tab' + (T.cat === c ? ' active' : '') + '" data-action="tienda-cat" data-v="' + c + '">' + c + '</button>').join("")}</div>
    ${destacada ? `<div class="pgrp">Destacada</div>
      <div class="card tn-feat" role="button" tabindex="0" data-action="tienda-ver" data-id="${destacada.id}">
        ${cover(destacada, "tn-cover-feat")}<span class="tn-tag">Destacada</span></div>
        <div class="tn-feat-body"><div class="tn-feat-t">${esc(destacada.titulo)}</div>${creador(destacada)}
          <div class="tn-meta"><span>${calSvg}${destacada.dias} días</span><span>${nivelSvg}${esc(destacada.nivel)}</span></div>
          <div class="tn-row">${usos(destacada)}<span class="tn-free">Gratis</span></div></div></div>` : ''}
    <div class="pgrp">${T.q || T.cat !== "Todas" ? "Resultados" : "Rutinas de la comunidad"}</div>
    <div class="tn-list" id="tnLista">${listaHtml()}</div>
    <div class="card tn-cta"><div class="tn-cta-t">¿Entrenás a otros?</div>
      <p>Compartí tu rutina gratis en la Tienda para que más gente entrene con tu método.</p>
      <button class="wk-start" data-action="tienda-publicar">Publicar mi rutina</button></div>`;
  const mias = () => {
    const ag = visibles().filter(r => r.agregue), pub = (T.lista || []).filter(r => r.mia);
    return `<div class="pgrp">Agregadas a tu app</div>
      ${ag.length ? '<div class="tn-list">' + ag.map(r => fila(r, '<span class="tn-state">En tu app</span>')).join("") + '</div>' : '<div class="empty">Todavía no agregaste ninguna rutina.</div>'}
      <div class="pgrp">Publicadas por vos</div>
      ${pub.length ? '<div class="tn-list">' + pub.map(r => fila(r, r.estado === "oculta" ? '<span class="tn-state">En revisión</span>' : usos(r))).join("") + '</div>'
        : '<div class="empty">Cuando publiques una rutina, la ves acá con cuántas personas la agregaron.</div>'}`;
  };
  const cuerpo = T.lista === null ? '<div class="empty">Cargando…</div>'
    : T.error && !T.lista.length ? '<div class="empty">' + esc(T.error) + '</div><button class="ctrl ghost tn-wide" data-action="tienda-reintentar">Reintentar</button>'
    : T.tab === "mias" ? mias() : explorar;
  return `
    <div class="form-head"><button class="form-back" data-action="tienda-close" aria-label="Volver a Entreno">‹</button><div class="form-title">Tienda</div></div>
    <div class="form-sub">Rutinas armadas por la comunidad. Agregalas a tu app y empezá hoy.</div>
    <div class="tn-banner" role="note"><b>Muy pronto</b><span>Estamos terminando la Tienda. Ya podés mirarla, agregar rutinas y publicar la tuya.</span></div>
    <div class="seg tn-seg" role="tablist">
      <button class="${T.tab === "explorar" ? "on" : ""}" role="tab" aria-selected="${T.tab === "explorar"}" data-action="tienda-tab" data-v="explorar">Explorar</button>
      <button class="${T.tab === "mias" ? "on" : ""}" role="tab" aria-selected="${T.tab === "mias"}" data-action="tienda-tab" data-v="mias">Mis rutinas</button>
    </div>
    ${cuerpo}`;
}

function detalle(r){
  const T = TiendaState, d = T.det;
  const lista = d && Array.isArray(d.days) ? d.days.filter(x => (x.exercises || []).length) : [];
  const dia = (x, i) => '<div class="tn-day"><span class="tn-day-n">' + (i + 1) + '</span><div><b>' + esc(x.name) + '</b><small>' + x.exercises.length + (x.exercises.length === 1 ? ' ejercicio' : ' ejercicios') + '</small></div></div>';
  const accion = '<button class="wk-start" data-action="tienda-agregar" data-id="' + r.id + '">' + (r.agregue ? 'Agregar de nuevo' : 'Agregar a mis rutinas') + '</button>';
  const otros = r.mia ? '<button class="ctrl ghost tn-wide" data-action="tienda-sacar" data-id="' + r.id + '">Sacar de la Tienda</button>'
    : '<button class="ctrl ghost tn-wide" data-action="tienda-denunciar" data-id="' + r.id + '"' + (r.reporte ? ' disabled>Ya la denunciaste' : '>Denunciar esta rutina') + '</button>';
  return `
    <div class="form-head"><button class="form-back" data-action="tienda-volver" aria-label="Volver a la Tienda">‹</button><div class="form-title">${esc(r.titulo)}</div></div>
    ${cover(r, "tn-cover-hero")}<span class="tn-tag">${r.estado === "oculta" ? "En revisión" : "Gratis"}</span>
      <div class="tn-hero-foot">${creador(r)}</div></div>
    <div class="tn-stats">
      <div class="tn-stat"><b>${r.dias}</b><small>Días/sem</small></div>
      <div class="tn-stat"><b>${r.ejercicios}</b><small>Ejercicios</small></div>
      <div class="tn-stat"><b class="tn-stat-t">${esc(r.nivel)}</b><small>Nivel</small></div>
    </div>
    <div class="card tn-desc">
      <div class="tn-row">${usos(r)}<span class="tn-muted">${esc(r.objetivo)}</span></div>
      ${r.descripcion ? '<p>' + esc(r.descripcion) + '</p>' : ''}
    </div>
    ${r.estado === "oculta" ? '<div class="form-sub tn-foot">Tu rutina está oculta mientras la revisamos: por ahora no la ve nadie más.</div>' : accion}
    <div class="pgrp">Qué incluye${d ? ' · ' + lista.length + (lista.length === 1 ? ' día' : ' días') : ''}</div>
    <div class="tn-days">${T.detError ? '<div class="empty">' + esc(T.detError) + '</div>' : d ? lista.map(dia).join("") : '<div class="empty">Cargando…</div>'}</div>
    ${otros}`;
}

function formulario(){
  const T = TiendaState, f = T.form || (T.form = formVacio());
  const hay = hasWork();
  const nd = (state.days || []).filter(d => (d.exercises || []).length).length;
  const ne = (state.days || []).reduce((n, d) => n + (d.exercises || []).length, 0);
  const ok = hay && f.nombre.trim().length >= 3 && !T.ocupado;
  return `
    <div class="form-head"><button class="form-back" data-action="tienda-volver" aria-label="Volver a la Tienda">‹</button><div class="form-title">Publicar mi rutina</div></div>
    <div class="form-sub">Compartila con la comunidad: otras personas la podrán agregar a su app.</div>
    <label class="form-label">Rutina</label>
    ${hay ? '<div class="tn-pick on"><span class="tn-radio"></span><div><b>Mi rutina actual</b><small>' + nd + ' días · ' + ne + ' ejercicios</small></div></div>'
      : '<div class="empty">Todavía no tenés una rutina con ejercicios. Cargala en Entreno y volvé.</div>'}
    <label class="form-label tn-lbl" for="tnNombre">Título en la Tienda</label>
    <input id="tnNombre" class="form-input" maxlength="40" placeholder="Ej: Fuerza Base 3 días" value="${esc(f.nombre)}" data-action="tienda-f" data-k="nombre">
    <label class="form-label tn-lbl" for="tnDesc">Descripción <span class="tn-count" id="tnCnt">${f.desc.length}/200</span></label>
    <textarea id="tnDesc" class="form-input tn-area" maxlength="200" rows="3" placeholder="Contá para quién es y qué resultados esperar" data-action="tienda-f" data-k="desc">${esc(f.desc)}</textarea>
    <label class="form-label tn-lbl">Nivel</label>
    <div class="seg">${NIVELES.map(n => '<button class="' + (f.nivel === n ? 'on' : '') + '" data-action="tienda-nivel" data-v="' + n + '">' + n + '</button>').join("")}</div>
    <label class="form-label tn-lbl">Objetivo</label>
    <div class="seg">${OBJETIVOS.map(n => '<button class="' + (f.obj === n ? 'on' : '') + '" data-action="tienda-obj" data-v="' + n + '">' + n + '</button>').join("")}</div>
    <div class="tn-note">Se publica gratis y con tu nombre: <b>${esc(miNombre())}</b>. Se suben los ejercicios y las series de cada día, sin tus kilos, tus repeticiones ni tus notas. La podés sacar cuando quieras.</div>
    <div class="tn-err" id="tnErr" role="alert">${esc(T.formErr || "")}</div>
    <button class="form-save tn-publish" id="tnPub" data-action="tienda-pub-ok"${ok ? '' : ' disabled'}>${T.ocupado ? 'Publicando…' : 'Publicar en la Tienda'}</button>`;
}

export function renderTienda(){
  const T = TiendaState;
  if (routineLocked()) return '<div class="form-head"><button class="form-back" data-action="tienda-close" aria-label="Volver a Entreno">‹</button><div class="form-title">Tienda</div></div><div class="empty">Tu coach maneja tu rutina, así que la Tienda no está disponible.</div>';
  if (T.publicando) return formulario();
  const r = T.id && porId(T.id);
  return r ? detalle(r) : inicio();
}

export function renderTiendaSheet(){
  const T = TiendaState, S = T.sheet; if (!S) return "";
  const r = S.id && porId(S.id);
  const err = S.err ? '<div class="tn-err" role="alert">' + esc(S.err) + '</div>' : '';
  const resumen = r ? '<div class="tn-sum">' + cover(r, "tn-cover-mini") + '</div><div class="tn-sum-body"><b>' + esc(r.titulo) + '</b><span>' + esc(r.autor) + '</span></div><span class="tn-free">Gratis</span></div>' : '';
  const dis = T.ocupado ? ' disabled' : '';
  let cuerpo = "";
  if (S.t === "agregar" && r) cuerpo = `
      <div class="sheet-title">Agregar a tu app</div>${resumen}
      <p class="tn-sheet-p">${hasWork() ? 'Esto reemplaza tus días de rutina por «' + esc(r.titulo) + '». No toca tus pesos, entrenos ni hábitos.' : 'Se agrega a tus rutinas y la ves en Entreno.'}</p>${err}
      <div class="sheet-btns"><button class="ctrl ghost" data-action="tienda-cancel"${dis}>Cancelar</button><button class="ctrl primary" data-action="tienda-agregar-ok" data-id="${r.id}"${dis}>${T.ocupado ? 'Agregando…' : 'Agregar'}</button></div>`;
  else if (S.t === "listo" && r) cuerpo = `
      <div class="sheet-title">¡Agregada!</div>
      <p class="tn-sheet-p"><b>${esc(r.titulo)}</b> ya está en tu app. La encontrás en Entreno, lista para arrancar.</p>
      <div class="sheet-btns"><button class="ctrl ghost" data-action="tienda-cancel">Seguir viendo</button><button class="ctrl primary" data-action="tienda-ir">Ir a Entreno</button></div>`;
  else if (S.t === "publicada") cuerpo = `
      <div class="sheet-title">¡Publicada!</div>
      <p class="tn-sheet-p">Tu rutina ya está en la Tienda, gratis para toda la comunidad. Ves cuántas personas la agregan en Mis rutinas.</p>
      <div class="sheet-btns"><button class="ctrl primary" data-action="tienda-mis">Ver mis rutinas</button></div>`;
  else if (S.t === "sacar" && r) cuerpo = `
      <div class="sheet-title">Sacar de la Tienda</div>${resumen}
      <p class="tn-sheet-p">Deja de verse en la Tienda para todos. Quienes ya la agregaron la conservan en su app.</p>${err}
      <div class="sheet-btns"><button class="ctrl ghost" data-action="tienda-cancel"${dis}>Cancelar</button><button class="ctrl primary" data-action="tienda-sacar-ok" data-id="${r.id}"${dis}>Sacar</button></div>`;
  else if (S.t === "denunciar" && r) cuerpo = `
      <div class="sheet-title">Denunciar rutina</div>${resumen}
      <div class="seg tn-motivos">${MOTIVOS.map(m => '<button class="' + (T.motivo === m[0] ? 'on' : '') + '" data-action="tienda-motivo" data-v="' + m[0] + '">' + m[1] + '</button>').join("")}</div>${err}
      <div class="sheet-btns"><button class="ctrl ghost" data-action="tienda-cancel"${dis}>Cancelar</button><button class="ctrl primary" data-action="tienda-denunciar-ok" data-id="${r.id}"${dis}>Denunciar</button></div>`;
  else if (S.t === "denunciada") cuerpo = `
      <div class="sheet-title">Gracias por avisar</div>
      <p class="tn-sheet-p">Revisamos las denuncias. Si varias personas la denuncian, la rutina se oculta hasta que la miremos.</p>
      <div class="sheet-btns"><button class="ctrl primary" data-action="tienda-cancel">Listo</button></div>`;
  else return "";
  return '<div class="sheet-bg" data-action="tienda-cancel"></div><div class="sheet tn-sheet" role="dialog" aria-label="Tienda">' + cuerpo + '</div>';
}

// ---- Toques y campos ----
function ir(){ renderApp(); try { window.scrollTo(0, 0); } catch (e) {} }

// Un pedido a la base con la pantalla bloqueada mientras tanto. ok(): lo que sigue si sale bien;
// si falla, el mensaje queda en la hoja (o en el formulario) para poder reintentar.
function pedir(hacer, ok, falla){
  const T = TiendaState;
  if (T.ocupado) return;
  T.ocupado = true; renderApp();
  Promise.resolve().then(hacer).then(ok).catch(e => falla(msg(e))).then(() => { T.ocupado = false; renderApp(); });
}

document.body.addEventListener("click", e => {
  const el = e.target.closest("[data-action^='tienda-']"); if (!el) return;
  const a = el.dataset.action, T = TiendaState;
  if (a === "tienda-q" || a === "tienda-f") return; // campos: se manejan en «input»
  if (a === "tienda-open") {
    if (routineLocked()) return;
    T.tab = "explorar"; T.cat = "Todas"; T.q = ""; T.id = null; T.det = null; T.publicando = false; T.sheet = null; T.form = null; T.formErr = "";
    State.view = "tienda"; cargar(); ir(); return;
  }
  if (a === "tienda-close") { T.sheet = null; State.view = "entreno"; ir(); return; }
  if (a === "tienda-reintentar") { T.lista = null; T.error = ""; cargar(); renderApp(); return; }
  if (a === "tienda-tab") { T.tab = el.dataset.v; ir(); return; }
  if (a === "tienda-cat") { T.cat = el.dataset.v; renderApp(); return; }
  if (a === "tienda-ver") { abrirDetalle(el.dataset.id); ir(); return; }
  if (a === "tienda-volver") { T.id = null; T.det = null; T.publicando = false; T.formErr = ""; ir(); return; }
  if (a === "tienda-publicar") { T.publicando = true; T.form = T.form || formVacio(); T.formErr = ""; ir(); return; }
  if (a === "tienda-nivel" || a === "tienda-obj") { (T.form || (T.form = formVacio()))[a === "tienda-nivel" ? "nivel" : "obj"] = el.dataset.v; renderApp(); return; }
  if (a === "tienda-agregar") { T.sheet = { t: "agregar", id: el.dataset.id }; renderApp(); return; }
  if (a === "tienda-agregar-ok") {
    const r = porId(el.dataset.id); if (!r) return;
    pedir(() => agregarRutina(r.id), days => {
      const nuevos = copiarDias(days);
      if (!nuevos.length) throw new Error("La rutina no tiene días para agregar.");
      state.days = nuevos;
      State.activeId = (diaDeHoy(state.days) || state.days[0]).id;
      save(); T.sheet = { t: "listo", id: r.id }; cargar();
    }, m => { T.sheet = { t: "agregar", id: r.id, err: m }; });
    return;
  }
  if (a === "tienda-ir") { T.sheet = null; T.id = null; T.det = null; State.view = "entreno"; ir(); return; }
  if (a === "tienda-cancel") { if (T.ocupado) return; T.sheet = null; renderApp(); return; }
  if (a === "tienda-pub-ok") {
    const f = T.form; if (!f || f.nombre.trim().length < 3 || !hasWork()) return;
    T.formErr = "";
    // Solo lo que hace a la rutina (sin kilos, notas, videos ni audios); la base lo vuelve a limpiar.
    pedir(() => publicarRutina(f, copiarDias(state.days)), () => { T.sheet = { t: "publicada" }; T.form = null; cargar(); }, m => { T.formErr = m; });
    return;
  }
  if (a === "tienda-mis") { T.sheet = null; T.publicando = false; T.form = null; T.id = null; T.det = null; T.tab = "mias"; ir(); return; }
  if (a === "tienda-sacar") { T.sheet = { t: "sacar", id: el.dataset.id }; renderApp(); return; }
  if (a === "tienda-sacar-ok") {
    const id = el.dataset.id;
    pedir(() => sacarRutina(id), () => { T.sheet = null; T.id = null; T.det = null; cargar(); }, m => { T.sheet = { t: "sacar", id, err: m }; });
    return;
  }
  if (a === "tienda-denunciar") { T.motivo = "inapropiada"; T.sheet = { t: "denunciar", id: el.dataset.id }; renderApp(); return; }
  if (a === "tienda-motivo") { T.motivo = el.dataset.v; renderApp(); return; }
  if (a === "tienda-denunciar-ok") {
    const id = el.dataset.id;
    pedir(() => denunciarRutina(id, T.motivo), () => { T.sheet = { t: "denunciada" }; cargar(); }, m => { T.sheet = { t: "denunciar", id, err: m }; });
    return;
  }
});

// Buscar y escribir: se actualiza solo lo que cambia, sin redibujar el campo (si no, se perdería el foco).
document.body.addEventListener("input", e => {
  const t = e.target, a = t.dataset && t.dataset.action; if (a !== "tienda-q" && a !== "tienda-f") return;
  const T = TiendaState;
  if (a === "tienda-q") { T.q = t.value; const l = document.getElementById("tnLista"); if (l) l.innerHTML = listaHtml(); return; }
  const f = T.form || (T.form = formVacio()); f[t.dataset.k] = t.value;
  const c = document.getElementById("tnCnt"); if (c) c.textContent = f.desc.length + "/200";
  const b = document.getElementById("tnPub"); if (b) b.disabled = !(hasWork() && f.nombre.trim().length >= 3);
});
