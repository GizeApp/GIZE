// Panel de administrador de GIZE (gize.ar/admin). Página aparte de la app: se entra con la
// cuenta de GIZE y solo pasan las cuentas administradoras (public.app_admins). Todo lo que
// muestra y cambia pasa por funciones de la base que primero chequean que seas admin
// (supabase/admin.sql) o por la función «admin» (Mercado Pago, avisos, borrar cuentas), y
// cada cambio queda en el registro de acciones.
const SB_URL = "https://wegptuzhsrwppbknqstf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlZ3B0dXpoc3J3cHBia25xc3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDkxODgsImV4cCI6MjA5ODU4NTE4OH0.pWBes8juiNcCrFG377w_Ga9IQ4EE37p5AJwUpYs2k8Q";
const REPO = "GizeApp/gize";
// PKCE y no "implicit": con "implicit" la librería toma cualquier #access_token=... de la
// dirección, y un link armado por otra persona dejaba este navegador (también gize.ar/app, que
// comparte la sesión) adentro de SU cuenta. Con PKCE solo vale la vuelta de un ingreso que
// empezó acá (Google), y esos links se ignoran.
// ingresoAca: el ingreso empezó en el panel («Entrar», o la vuelta de Google con ?code=). Solo
// así se cierra la sesión de una cuenta que no es administradora (ver boot).
let ingresoAca = new URLSearchParams(location.search).has("code");
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true } });

const $root = document.getElementById("root");
const S = { user: null, view: "resumen", overview: null, goals: null, tasks: null, users: null, q: "", coaches: null, fin: null, finTab: "numeros", dolar: null, prodTab: "pedidos", reqKind: "pendientes", reqs: null, prods: null, urls: {}, audit: null, backups: null, config: null, msgTab: "nuevos", msgs: null, unread: 0, drafts: {}, sending: false, repTab: "nuevo", reps: null, repPend: 0, ia: null, iaFn: null, iaHome: null, reqForm: {}, iaLeyendo: new Set() };
// Menú plano en dos tramos: lo de todos los días y, abajo, «Más». La clave "resumen" es la de
// siempre (los links #resumen siguen andando) aunque ahora se llame Objetivos.
const NAV_MAIN = [["resumen", "Objetivos"], ["usuarios", "Usuarios"], ["finanzas", "Finanzas"], ["seguridad", "Seguridad"]];
const NAV_MORE = [["contacto", "Mensajes"], ["reportes", "Reportes"], ["productos", "Productos"], ["avisos", "Avisos"], ["ia", "IA"], ["estadisticas", "Estadísticas"]];
// «Coaches y pagos» no tiene botón propio: es una pestaña de Usuarios (la clave "coaches" y el
// link #coaches siguen andando; en el menú queda marcado Usuarios).
const SECTIONS = NAV_MAIN.concat(NAV_MORE, [["coaches", "Coaches y pagos"]]);
const NAV_OF = { coaches: "usuarios" };
const userTabs = on => `<div class="tabs">${[["usuarios", "Todos los usuarios"], ["coaches", "Coaches y pagos"]].map(([k, l]) => `<button class="${on === k ? "on" : ""}" data-go="${k}">${l}</button>`).join("")}</div>`;

// ---------- utilidades ----------
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = v => parseFloat(String(v == null ? "" : v).replace(",", ".")) || 0;
const n0 = v => Math.round(Number(v) || 0).toLocaleString("es-AR");
const money = v => "$" + n0(v);
const fmtD = d => d ? new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "2-digit" }) : "—";
// Último día cubierto de un pago o una prueba: la base guarda las 00:00 del día siguiente
// (admin_set_paid / admin_set_trial), así que se le resta 1 ms (igual que la app del coach).
const lastDay = d => d ? fmtD(new Date(new Date(d).getTime() - 1)) : "—";
const fmtDT = d => d ? new Date(d).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
function ago(d){
  if (!d) return "nunca";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 3600) return "hace " + Math.max(1, Math.round(s / 60)) + " min";
  if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
  if (s < 86400 * 45) return "hace " + Math.round(s / 86400) + " días";
  return fmtD(d);
}
// El aviso de abajo. Se anuncia por una zona fija (aria-live): un elemento recién agregado no
// siempre lo leen los lectores de pantalla.
function toast(msg){
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("aria-hidden", "true"); document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  let v = document.getElementById("toastVivo");
  if (!v){ v = document.createElement("div"); v.id = "toastVivo"; v.className = "sr-only"; v.setAttribute("role", "status"); v.setAttribute("aria-live", "polite"); document.body.appendChild(v); }
  v.textContent = ""; setTimeout(() => { v.textContent = msg; }, 50);
}
async function rpc(fn, args){ const r = await sb.rpc(fn, args || {}); if (r.error) throw r.error; return r.data; }
async function fn(body){
  const r = await sb.functions.invoke("admin", { body });
  if (r.error){ let msg = r.error.message; try { const j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} throw new Error(msg); }
  if (r.data && r.data.error) throw new Error(r.data.error);
  return r.data;
}
const errMsg = e => (e && (e.message || e.error_description)) || "Algo salió mal.";

// ---------- paneles plegables ----------
// Cada bloque se abre o se pliega tocando su título y queda como lo dejaste (en este navegador).
// Plegado muestra una línea de resumen (cuántos hay, cómo viene) para no tener que abrirlo.
const FOLD_KEY = "gize-admin-fold";
let FOLD = {}; try { FOLD = JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) {}
const isOpen = (id, def) => id in FOLD ? !!FOLD[id] : def !== false;
// o: { open: false } plegado de entrada, sum: resumen, act: botón a la derecha, flush: sin márgenes adentro.
function panel(id, title, body, o){
  o = o || {};
  return `<details class="pnl" id="${id}" data-fold="${id}" data-def="${o.open === false ? 0 : 1}"${isOpen(id, o.open) ? " open" : ""}>
    <summary><span class="pnl-t">${title}</span><span class="pnl-s" id="${id}-s">${o.sum || ""}</span>${o.act || ""}</summary>
    <div class="pnl-b${o.flush ? " flush" : ""}">${body}</div></details>`;
}
// Igual que panel() pero fijo: siempre abierto, sin flecha. Para lo que se mira todos los días.
// o: sum (resumen al lado del título), act (botón a la derecha), flush.
function block(id, title, body, o){
  o = o || {};
  return `<section class="blk" id="${id}"><div class="blk-h"><span class="pnl-t">${title}</span><span class="pnl-s" id="${id}-s">${o.sum || ""}</span>${o.act || ""}</div>
    <div class="pnl-b${o.flush ? " flush" : ""}">${body}</div></section>`;
}
function setSum(id, html){ const s = document.getElementById(id + "-s"); if (s) s.innerHTML = html || ""; }
function openPanel(id){ const d = document.getElementById(id); if (d && !d.open) d.open = true; return d; }
// El evento toggle no burbujea: se escucha en la captura.
document.addEventListener("toggle", e => {
  const d = e.target; if (!d.dataset) return;
  if (d.dataset.msg && S.msgOpen){ S.msgOpen[d.dataset.msg] = d.open; return; }
  if (!d.dataset.fold) return;
  // Al dibujarse abierto también dispara toggle: si no cambió nada, no se guarda.
  if (isOpen(d.dataset.fold, d.dataset.def !== "0") === d.open) return;
  FOLD[d.dataset.fold] = d.open;
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(FOLD)); } catch (e) {}
}, true);

// ---------- entrada ----------
function gate(msg, withLogin){
  $root.innerHTML = `<div class="aurora-bg" aria-hidden="true"><div class="gize-aurora"><span></span><span></span><span></span><span></span></div></div><div class="gate"><img src="../brand/logo/gize-firma-horizontal.svg" alt="GIZE"><p>${msg}</p>
    ${withLogin ? `<div class="card">
      <button class="btn pri" data-a="google">Entrar con Google</button>
      <div class="or">o con tu mail</div>
      <label class="lbl">Mail</label><input class="in" id="lgMail" type="email" autocomplete="username">
      <label class="lbl">Contraseña</label><input class="in" id="lgPass" type="password" autocomplete="current-password">
      <button class="btn blue" data-a="login">Entrar</button>
      <p class="small" style="margin-top:12px">También podés iniciar sesión en <a href="../app/">gize.ar/app</a> (con «Mantener la sesión») y volver acá.</p>
    </div>` : `<div class="row-btns" style="justify-content:center"><button class="btn" data-a="logout">Salir</button><a class="btn" href="../app/">Ir a la app</a></div>`}</div>`;
}
async function boot(){
  const { data } = await sb.auth.getSession();
  const user = S.user = data && data.session ? data.session.user : null;
  if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname);
  if (!user){ ingresoAca = false; return gate("Panel de administración de GIZE. Entrá con tu cuenta.", true); }
  let ok = false, known = false; try { ok = await rpc("is_app_admin"); known = true; } catch (e) {}
  if (!known) return gate("No se pudo comprobar si la cuenta <b>" + esc(user.email) + "</b> es administradora. Revisá la conexión y recargá la página.", false);
  // Una cuenta que no es administradora y entró acá no se queda con la sesión abierta: se cierra
  // en este navegador y se pide entrar con otra. La de gize.ar/app (es la misma sesión: al abrir
  // el panel, o la que avisa la pestaña de la app al entrar o al volver a verse) no se toca:
  // antes el panel la cerraba en el servidor y la app quedaba afuera.
  if (!ok){
    if (!ingresoAca) return gate("La cuenta <b>" + esc(user.email) + "</b> no es administradora de GIZE.", false);
    S.user = null;
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) {}
    ingresoAca = false;
    return gate("La cuenta <b>" + esc(user.email) + "</b> no es administradora de GIZE, así que se cerró la sesión en este navegador. Entrá con una cuenta administradora.", true);
  }
  ingresoAca = false;
  const v = (location.hash || "").replace("#", ""); if (SECTIONS.some(s => s[0] === v)) S.view = v;
  shell(); go(S.view);
  refreshUnread(); refreshReps(); setInterval(() => { refreshUnread(); refreshReps(); }, 60000);
}
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !S.user) boot(); if (ev === "SIGNED_OUT") { S.user = null; gate("Cerraste la sesión.", true); } });

// ---------- estructura ----------
function shell(){
  $root.innerHTML = `<div class="shell"><nav class="side">
      <img src="../brand/logo/gize-firma-horizontal.svg" alt="GIZE"><div class="side-sub">Administración</div>
      ${[NAV_MAIN, NAV_MORE].map((items, i) => (i ? '<div class="nav-sep">Más</div>' : "") + items.map(([k, l]) => `<button class="nav" data-go="${k}">${l}${k === "productos" ? '<i id="navPend" hidden></i>' : k === "contacto" ? '<i id="navMsg" hidden></i>' : k === "reportes" ? '<i id="navRep" hidden></i>' : ""}</button>`).join("")).join("")}
      <div class="side-foot"><span class="side-mail">${esc(S.user.email)}<br></span><button data-a="logout">Salir</button> · <a href="../app/">Ir a la app</a></div>
    </nav><main class="main" id="main"></main></div>`;
}
function go(view){
  S.view = view; history.replaceState(null, "", "#" + view);
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("on", b.dataset.go === (NAV_OF[view] || view)));
  ({ resumen: loadResumen, estadisticas: loadEstadisticas, contacto: loadContacto, reportes: loadReportes, usuarios: loadUsuarios, coaches: loadCoaches, finanzas: loadFinanzas, productos: loadProductos, avisos: loadAvisos, seguridad: loadSeguridad, ia: loadIA })[view]();
}
const main = () => document.getElementById("main");
// Si la página tiene paneles, arriba a la derecha van «Abrir todo» y «Plegar todo».
function page(title, lead, body){
  // (sin paneles, el CSS los esconde: algunas páginas los dibujan después de cargar)
  main().innerHTML = `<div class="pg-h"><div class="h1">${title}</div><div class="pg-fold"><button data-a="foldAll" data-v="1">Abrir todo</button><button data-a="foldAll" data-v="0">Plegar todo</button></div></div><div class="lead">${lead}</div>${body}`;
}
function foldAll(open){ main().querySelectorAll(".pnl").forEach(d => { d.open = open; }); }
function setPend(n){ const i = document.getElementById("navPend"); if (i){ i.hidden = !n; i.textContent = n; } }
// Globito de Productos: lo que falta revisar de la base más los pedidos de la gente.
async function pendTotal(o){ let r = 0; try { r = num(await rpc("admin_requests_pending")); } catch (e) {} setPend(num(o && o.pending) + r); }
// Mensajes de contacto sin leer: número en el menú y en la pestaña del navegador.
function setUnread(n){
  S.unread = n || 0;
  const i = document.getElementById("navMsg"); if (i){ i.hidden = !S.unread; i.textContent = S.unread; }
  document.title = (S.unread ? "(" + S.unread + ") " : "") + "GIZE · Administración";
}
async function refreshUnread(){
  if (!S.user) return;
  try {
    const n = await rpc("admin_contact_unread");
    // Llegó uno nuevo y se está mirando "Sin leer": se recarga la lista (salvo que estés escribiendo o mandando una respuesta).
    const busy = S.sending || document.querySelector("#mList .msg-reply:not([hidden])");
    if (n > S.unread && S.view === "contacto" && S.msgTab === "nuevos" && !busy) loadContacto();
    setUnread(n);
  } catch (e) {}
}
// Reportes sin revisar (chat y grupos de pasos): número en el menú. Apple y Google piden
// atenderlos rápido (dentro de las 24 horas).
function setRep(n){ S.repPend = num(n); const i = document.getElementById("navRep"); if (i){ i.hidden = !S.repPend; i.textContent = S.repPend; } }
async function refreshReps(){
  if (!S.user) return;
  try {
    const n = num(await rpc("admin_reports_pending"));
    if (n > S.repPend && S.view === "reportes" && S.repTab === "nuevo") loadReportes();
    setRep(n);
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible"){ refreshUnread(); refreshReps(); } });

// ---------- gráfico de columnas (una serie, con detalle al pasar el dedo o el mouse) ----------
function columns(data, label){
  const W = 560, H = 190, pl = 30, pb = 24, pt = 18, max = Math.max(1, ...data.map(d => d.n));
  const step = Math.max(1, Math.ceil(max / 3)), top = step * 3, bw = Math.min(24, (W - pl) / data.length * .55);
  const x = i => pl + (i + .5) * (W - pl) / data.length, y = v => pt + (H - pt - pb) * (1 - v / top);
  const grid = [0, 1, 2, 3].map(k => `<line class="grid-l" x1="${pl}" x2="${W}" y1="${y(k * step)}" y2="${y(k * step)}"/><text class="ax" x="${pl - 6}" y="${y(k * step) + 4}" text-anchor="end">${k * step}</text>`).join("");
  const bars = data.map((d, i) => {
    const h = Math.max(0, y(0) - y(d.n)), bx = x(i) - bw / 2, r = Math.min(4, h, bw / 2);
    const path = h > 0 ? `M${bx},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z` : "";
    const lbl = new Date(d.w + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    return `<rect class="hit" x="${x(i) - (W - pl) / data.length / 2}" y="${pt}" width="${(W - pl) / data.length}" height="${H - pt}" data-tip="<b>${d.n}</b> ${label}<br>semana del ${lbl}"/>` +
      (path ? `<path class="bar" d="${path}"/>` : "") + (i % 3 === 0 || i === data.length - 1 ? `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${lbl}</text>` : "");
  }).join("");
  const last = data[data.length - 1];
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} por semana">${grid}${bars}${last ? `<text class="val" x="${x(data.length - 1)}" y="${y(last.n) - 6}" text-anchor="middle">${last.n}</text>` : ""}</svg><div class="tip"></div></div>`;
}
document.addEventListener("pointermove", e => {
  const h = e.target.closest && e.target.closest(".chart .hit");
  document.querySelectorAll(".chart .tip").forEach(t => { if (!h || !t.parentElement.contains(h)) t.style.opacity = 0; });
  document.querySelectorAll(".chart .bar.hov").forEach(b => b.classList.remove("hov"));
  if (!h) return;
  const c = h.closest(".chart"), t = c.querySelector(".tip"), r = c.getBoundingClientRect(), hb = h.getBoundingClientRect();
  t.innerHTML = h.dataset.tip; t.style.left = (hb.left + hb.width / 2 - r.left) + "px"; t.style.top = "30px"; t.style.opacity = 1;
  if (h.nextElementSibling && h.nextElementSibling.classList.contains("bar")) h.nextElementSibling.classList.add("hov");
});

// ---------- Inicio ----------
// Arriba lo que hay que atender, después los objetivos (supabase/objetivos.sql) y al final los
// números y gráficos del resumen.
async function loadResumen(){
  page("Objetivos", "Lo que hay que atender, las metas y las tareas.", '<div class="empty">Cargando…</div>');
  try { S.overview = await rpc("admin_overview"); } catch (e) { return page("Objetivos", "", `<div class="empty">${esc(errMsg(e))}</div>`); }
  const o = S.overview || {};
  // Lo que falta: con que falle uno, el resto se muestra igual.
  const [reqs, coaches, unread, goals, tasks, reps, ia] = await Promise.all([
    rpc("admin_requests_pending").catch(() => 0), rpc("admin_coaches").catch(() => null),
    rpc("admin_contact_unread").catch(() => S.unread), rpc("admin_goals").catch(e => ({ error: e })), rpc("admin_tasks").catch(e => ({ error: e })),
    rpc("admin_reports_pending").catch(() => S.repPend), rpc("admin_ia_estado").catch(() => null)]);
  if (S.view !== "resumen") return;
  if (coaches) S.coaches = coaches;
  setPend(num(o.pending) + num(reqs)); setUnread(num(unread)); setRep(reps);
  S.goals = goals; S.tasks = tasks; S.reqsPend = num(reqs); S.iaHome = ia;
  page("Objetivos", "Lo que hay que atender, las metas y las tareas.",
    block("hTodoB", "Para atender", '<div id="hTodo"></div>', { flush: true }) + iaHomeBlock() +
    block("hGoalsB", "Objetivos", '<div id="hGoals"></div>', { act: '<button class="btn sm" data-a="gNew">+ Nuevo</button>' }) +
    block("hTasksB", "Tareas", '<div id="hTasks"></div>'));
  paintTodo(); paintGoals(); paintTasks();
}
// ---------- Estadísticas ----------
// Los números, los gráficos y las versiones en uso (antes estaban en Inicio).
async function loadEstadisticas(){
  page("Estadísticas", "Cómo viene la app: usuarios, entrenos y versiones.", '<div class="empty">Cargando…</div>');
  try { S.overview = await rpc("admin_overview"); } catch (e) { return page("Estadísticas", "", `<div class="empty">${esc(errMsg(e))}</div>`); }
  if (S.view !== "estadisticas") return;
  const o = S.overview || {};
  const k = (v, l, sub) => `<div class="kpi"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const versions = (o.versions || []).map(v => `<tr><td>${esc(v.platform === "android" ? "Android" : v.platform === "ios" ? "iPhone" : v.platform === "web" ? "Web" : v.platform)}</td><td>${esc(v.version)}</td><td>${n0(v.n)}</td></tr>`).join("");
  page("Estadísticas", "Cómo viene la app: usuarios, entrenos y versiones.",
    block("hNumB", "Números", `<div class="grid kpis">
        ${k(n0(o.users), "Usuarios", "+" + n0(o.new7) + " esta semana · +" + n0(o.new30) + " en 30 días")}
        ${k(n0(o.active7), "Activos en 7 días", n0(o.sessions7) + " entrenos en la semana")}
        ${k(n0(o.paid), "Coaches pagando", n0(o.coaches) + " coaches · " + n0(o.trial) + " en prueba · " + n0(o.courtesy) + " de cortesía")}
        ${k(money(o.mrr), "Ingreso mensual", n0(o.linked) + " de " + n0(o.clients) + " alumnos con coach")}
      </div>`) +
    block("hChartsB", "Gráficos", `<div class="grid two">
        <div class="card"><div class="sec-t">Usuarios nuevos por semana</div><div class="sec-s">Últimas 12 semanas</div>${columns(o.signups || [], "usuarios nuevos")}</div>
        <div class="card"><div class="sec-t">Entrenos guardados por semana</div><div class="sec-s">Últimas 12 semanas</div>${columns(o.training || [], "entrenos")}</div>
      </div>`) +
    block("hVerB", "Versiones en uso", `<div class="sec-s">Usuarios que abrieron la app en los últimos 30 días.</div>
        ${versions ? `<div class="tscroll"><table class="table"><thead><tr><th>Plataforma</th><th>Versión</th><th>Usuarios</th></tr></thead><tbody>${versions}</tbody></table></div>` : '<div class="empty">Todavía no hay datos: se completan a medida que la gente abre la app.</div>'}`,
      { sum: (o.versions || []).length ? (o.versions || []).length + (o.versions.length === 1 ? " versión" : " versiones") : "sin datos" }));
}

// Lista de lo pendiente: cada fila lleva a su sección (las tareas, al bloque de abajo). Solo
// aparece lo que tiene algo.
function paintTodo(){
  const box = document.getElementById("hTodo"); if (!box) return;
  const o = S.overview || {}, prods = num(o.pending) + (S.reqsPend || 0);
  const soon = (S.coaches || []).map(venceDe).filter(v => v && !v.vencido && v.dias <= 7).length;
  const open = taskList().filter(t => !t.done && t.due_date), late = open.filter(t => dueDays(t.due_date) < 0).length, today = open.filter(t => dueDays(t.due_date) === 0).length;
  const rows = [
    [late + today, "tareas", (late + today === 1 ? "tarea " : "tareas ") + (late && today ? "vencidas o para hoy" : late ? (late === 1 ? "vencida" : "vencidas") : "para hoy"), "están más abajo, en Tareas"],
    [S.unread, "contacto", "mensaje" + (S.unread === 1 ? "" : "s") + " sin leer", "contacto@gize.ar"],
    [S.repPend, "reportes", S.repPend === 1 ? "reporte sin revisar" : "reportes sin revisar", "chat y grupos de pasos: revisalos dentro de las 24 horas"],
    [prods, "productos", "producto" + (prods === 1 ? "" : "s") + " para revisar", "pedidos de la gente, cargados sin verificar y reportados"],
    [soon, "coaches", soon === 1 ? "coach vence en los próximos 7 días" : "coaches vencen en los próximos 7 días", "pago o prueba: conviene escribirles"],
    [num(o.overdue), "coaches", num(o.overdue) === 1 ? "coach sin pagar" : "coaches sin pagar", "prueba vencida y sin pago al día"]].concat(iaTodo()).filter(r => r[0] > 0);
  box.innerHTML = rows.length ? `<div class="list">${rows.map(([n, go, l, sub]) => `<button class="li" ${go === "tareas" ? 'data-a="toTasks"' : `data-go="${go}"`}><b>${n0(n)}</b><span>${l}<small>${sub}</small></span><i aria-hidden="true">›</i></button>`).join("")}</div>`
    : '<div class="calm pad">Todo al día: no hay nada pendiente.</div>';
  const n = rows.reduce((s, r) => s + r[0], 0);
  const blk = document.getElementById("hTodoB"); if (blk) blk.classList.toggle("quiet", !rows.length);
  setSum("hTodoB", rows.length ? `<span class="dot"></span>${n0(n)} cosa${n === 1 ? "" : "s"} para atender` : "todo al día");
}

// ---------- Objetivos ----------
// Métricas que se pueden poner como meta: claves de admin_overview (y las del check de
// public.admin_goals en supabase/objetivos.sql).
const METRICS = { paid: ["Coaches pagando", n0], mrr: ["Ingreso mensual", money], users: ["Usuarios", n0], active7: ["Activos en 7 días", n0],
  sessions7: ["Entrenos por semana", n0], coaches: ["Coaches", n0], linked: ["Alumnos con coach", n0], products: ["Productos en la base", n0] };
const metricVal = m => num((S.overview || {})[m]);
// Avance de un objetivo: cuánto falta, el ritmo desde que arrancó y si con ese ritmo llega a la fecha.
function goalState(g){
  const cur = metricVal(g.metric), target = num(g.target), fmt = (METRICS[g.metric] || [, n0])[1];
  const now = Date.now(), end = diaAR(Date.parse(g.deadline + "T12:00:00")), today = diaAR(now);
  const left = Math.round((end - today) / 864e5), weeks = Math.max(1, left) / 7;
  const elapsed = (now - Date.parse(g.started_at || g.created_at)) / 864e5;
  const rate = elapsed >= 3 ? (cur - num(g.baseline)) / elapsed * 7 : null; // por semana
  const pctv = Math.max(0, Math.min(1, cur / target)), falta = target - cur;
  const sg = v => (v < 0 ? "−" : "+") + fmt(Math.abs(v));
  let st, cls, note;
  if (cur >= target){ st = "Cumplido"; cls = "ok"; note = "Se llegó a la meta."; }
  else if (left < 0){ st = "Venció"; cls = "bad"; note = "Faltaron " + fmt(falta) + "."; }
  else {
    const need = falta / weeks;
    note = "Faltan " + fmt(falta) + (left === 0 ? " y vence hoy" : " en " + n0(left) + " día" + (left === 1 ? "" : "s")) +
      " · hace falta " + sg(need) + " por semana" + (rate == null ? "" : " · el ritmo es " + sg(rate));
    if (rate == null){ st = "Recién empieza"; cls = ""; }
    else if (cur + rate * Math.max(0, left) / 7 >= target){ st = "En camino"; cls = "ok"; }
    else { st = "Atrasado"; cls = "warn"; }
  }
  return { cur, target, fmt, pct: pctv, st, cls, note };
}
// «· 2 de 5 tareas hechas» de un objetivo, si tiene tareas atadas.
function goalTasks(id){
  const ts = taskList().filter(t => String(t.goal_id) === String(id));
  return ts.length ? " · " + ts.filter(t => t.done).length + " de " + ts.length + " tarea" + (ts.length === 1 ? "" : "s") + " hecha" + (ts.length === 1 ? "" : "s") : "";
}
function paintGoals(){
  const box = document.getElementById("hGoals"); if (!box) return;
  const g = S.goals;
  if (g && g.error){
    const falta = /admin_goals|schema cache/i.test(errMsg(g.error));
    box.innerHTML = `<div class="calm">${falta ? "Falta preparar la base: en GitHub, Actions → <b>Supabase</b> → Run workflow → tarea <b>sql</b>, archivo <b>supabase/objetivos.sql</b>." : esc(errMsg(g.error))}</div>`;
    setSum("hGoalsB", ""); return;
  }
  if (!g || !g.length){ box.innerHTML = '<div class="calm">Todavía no hay objetivos. Poné una meta con fecha (por ejemplo, 40 coaches pagando a fin de año) y acá se ve cuánto falta y si con el ritmo actual se llega.</div>'; setSum("hGoalsB", "ninguno todavía"); return; }
  // Resumen plegado: cuántos hay en cada estado («2 en camino · 1 atrasado»).
  const cnt = {}; g.forEach(x => { const st = goalState(x).st; cnt[st] = (cnt[st] || 0) + 1; });
  const GSUM = [["Atrasado", "atrasado", "atrasados", "t-warn"], ["Venció", "vencido", "vencidos", "t-bad"], ["En camino", "en camino", "en camino"], ["Recién empieza", "recién empieza", "recién empiezan"], ["Cumplido", "cumplido", "cumplidos"]];
  setSum("hGoalsB", GSUM.filter(s => cnt[s[0]]).map(([st, one, many, cls]) => `<span class="${cls || ""}">${cnt[st]} ${cnt[st] === 1 ? one : many}</span>`).join(" · "));
  box.innerHTML = `<div class="goals">${g.map(x => { const s = goalState(x);
    return `<button class="card goal" data-goal="${esc(x.id)}">
      <div class="goal-h"><span>${esc(x.label || (METRICS[x.metric] || [x.metric])[0])}</span><span class="pill ${s.cls}">${s.st}</span></div>
      <div class="goal-v"><b>${s.fmt(s.cur)}</b><span class="muted">de ${s.fmt(s.target)}${x.label ? " · " + esc((METRICS[x.metric] || [x.metric])[0]).toLowerCase() : ""}</span></div>
      <div class="meter${s.cls === "ok" && s.cur >= s.target ? " done" : ""}"><i style="width:${Math.round(s.pct * 100)}%"></i></div>
      <div class="muted small">${s.note}</div>
      <div class="muted small goal-d">Para el ${fmtD(dateOnly(x.deadline))}${goalTasks(x.id)}</div></button>`; }).join("")}</div>`;
}
function openGoal(id){
  const g = id ? (S.goals || []).find(x => String(x.id) === String(id)) : { metric: "paid" };
  if (!g) return;
  const end = new Date(); end.setMonth(11, 31);
  drawer(`<div class="h1 sm">${id ? "Cambiar objetivo" : "Nuevo objetivo"}</div>
    <label class="lbl">Qué se mide</label>
    <select class="in" id="gMetric">${Object.keys(METRICS).map(m => `<option value="${m}"${g.metric === m ? " selected" : ""}>${METRICS[m][0]} · hoy ${METRICS[m][1](metricVal(m))}</option>`).join("")}</select>
    <div class="vgrid2"><label><span class="lbl">Meta</span><input class="in" id="gTarget" type="number" min="1" step="1" value="${g.target != null ? esc(num(g.target)) : ""}" placeholder="Ej: 40"></label>
      <label><span class="lbl">Para cuándo</span><input class="in" id="gDeadline" type="date"${id ? "" : ` min="${isoDay(new Date())}"`} value="${esc(g.deadline || isoDay(end))}"></label></div>
    <label class="lbl">Nombre (opcional)</label><input class="in" id="gLabel" maxlength="80" value="${esc(g.label || "")}" placeholder="Ej: Cubrir los gastos">
    <div class="sec-s mt">El avance se calcula solo con los datos reales. El ritmo se mide desde ${id ? "que se creó el objetivo (o desde que se cambió lo que se mide)" : "hoy"}.</div>
    <div class="row-btns"><button class="btn pri" data-a="gSave" data-id="${id ? esc(id) : ""}">Guardar</button>${id ? `<button class="btn bad" data-a="gDel" data-id="${esc(id)}">Borrar</button>` : ""}</div>`);
  if (!id) document.getElementById("gTarget").focus();
}
async function saveGoal(btn){
  const metric = document.getElementById("gMetric").value, target = num(document.getElementById("gTarget").value), deadline = document.getElementById("gDeadline").value;
  if (!(target > 0)) return toast("Poné la meta.");
  if (!deadline) return toast("Elegí para cuándo.");
  btn.disabled = true;
  try { await rpc("admin_goal_save", { p_id: btn.dataset.id ? Number(btn.dataset.id) : null, p_metric: metric, p_target: target, p_deadline: deadline, p_label: document.getElementById("gLabel").value.trim() || null }); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  closeDrawer(); toast("Objetivo guardado ✓"); reloadGoals();
}
async function deleteGoal(btn){
  if (!await confirmar("¿Borrar este objetivo?")) return;
  btn.disabled = true;
  try { await rpc("admin_goal_delete", { p_id: Number(btn.dataset.id) }); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  closeDrawer(); toast("Objetivo borrado"); reloadGoals();
}
async function reloadGoals(){
  try { S.goals = await rpc("admin_goals"); } catch (e) { S.goals = { error: e }; }
  paintGoals(); paintTasks();
}

// ---------- Tareas ----------
// Lo que hay que hacer, con fecha opcional y, si se quiere, atado a un objetivo
// (supabase/objetivos.sql). Las pendientes van por fecha en grupos (vencidas, hoy, esta semana,
// más adelante, sin fecha); las hechas quedan plegadas abajo.
const taskList = () => Array.isArray(S.tasks) ? S.tasks : [];
const goalList = () => Array.isArray(S.goals) ? S.goals : [];
// Días desde hoy (calendario de Argentina) hasta una fecha "2026-10-09": 0 es hoy, -1 ayer.
const dueDays = d => Math.round((Date.parse(d) - diaAR(Date.now())) / 864e5);
const goalName = id => { const g = goalList().find(x => String(x.id) === String(id)); return g ? g.label || (METRICS[g.metric] || [g.metric])[0] : ""; };
function dueTxt(d){
  const n = dueDays(d), wd = new Date(d + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  if (n < 0) return `<span class="pill bad">${n === -1 ? "ayer" : "hace " + -n + " días"}</span>`;
  if (n === 0) return '<span class="pill warn">hoy</span>';
  if (n === 1) return '<span class="pill blue">mañana</span>';
  return `<span class="muted">${wd}</span>`;
}
function paintTasks(){
  const box = document.getElementById("hTasks"); if (!box) return;
  if (S.tasks && S.tasks.error){
    const falta = /admin_tasks|schema cache/i.test(errMsg(S.tasks.error));
    box.innerHTML = `<div class="calm">${falta ? "Falta preparar la base: en GitHub, Actions → <b>Supabase</b> → Run workflow → tarea <b>sql</b>, archivo <b>supabase/objetivos.sql</b>." : esc(errMsg(S.tasks.error))}</div>`;
    setSum("hTasksB", ""); return;
  }
  const all = taskList(), open = all.filter(t => !t.done), done = all.filter(t => t.done);
  const late = open.filter(t => t.due_date && dueDays(t.due_date) < 0).length, today = open.filter(t => t.due_date && dueDays(t.due_date) === 0).length;
  setSum("hTasksB", !open.length ? (done.length ? "todo hecho" : "ninguna todavía")
    : [late ? `<span class="t-bad">${late} vencida${late === 1 ? "" : "s"}</span>` : "", today ? `<span class="t-warn">${today} para hoy</span>` : "", open.length + " pendiente" + (open.length === 1 ? "" : "s")].filter(Boolean).join(" · "));
  const byDate = (a, b) => (a.due_date || "9999") < (b.due_date || "9999") ? -1 : (a.due_date || "9999") > (b.due_date || "9999") ? 1 : a.id - b.id;
  const groups = [["Vencidas", t => t.due_date && dueDays(t.due_date) < 0], ["Hoy", t => t.due_date && dueDays(t.due_date) === 0],
    ["Próximos 7 días", t => t.due_date && dueDays(t.due_date) > 0 && dueDays(t.due_date) <= 7], ["Más adelante", t => t.due_date && dueDays(t.due_date) > 7], ["Sin fecha", t => !t.due_date]];
  const row = t => `<div class="todo${t.done ? " done" : ""}">
      <button class="chk" data-a="tDone" data-id="${esc(t.id)}" data-v="${t.done ? "0" : "1"}" aria-label="${t.done ? "Marcar como pendiente" : "Marcar como hecha"}"></button>
      <button class="task" data-task="${esc(t.id)}"><span>${esc(t.title)}</span>
        <small>${t.done ? "hecha " + ago(t.done_at) : t.due_date ? dueTxt(t.due_date) : ""}${t.goal_id && goalName(t.goal_id) ? `<span class="muted">${t.done || t.due_date ? " · " : ""}${esc(goalName(t.goal_id))}</span>` : ""}</small></button></div>`;
  const opts = goalList().map(g => `<option value="${esc(g.id)}">${esc(goalName(g.id))}</option>`).join("");
  box.innerHTML = `<div>
    <div class="task-add"><input class="in" id="tNew" maxlength="200" placeholder="Agregar una tarea…" autocomplete="off">
      <input class="in" id="tNewDue" type="date" aria-label="Fecha (opcional)">
      ${opts ? `<select class="in" id="tNewGoal" aria-label="Objetivo (opcional)"><option value="">Sin objetivo</option>${opts}</select>` : ""}
      <button class="btn" data-a="tAdd">Agregar</button></div>
    ${open.length ? groups.map(([l, f]) => { const list = open.filter(f).sort(byDate); return list.length ? `<div class="task-g">${l} <span>${list.length}</span></div>${list.map(row).join("")}` : ""; }).join("")
      : `<div class="calm task-none">${done.length ? "No quedan tareas pendientes. 🎉" : "Todavía no hay tareas. Escribí una arriba: con fecha se ordena sola, y si la atás a un objetivo se ve en su tarjeta."}</div>`}
    ${done.length ? `<details class="fold task-done"><summary><span class="muted small">Hechas (${done.length})</span></summary>${done.map(row).join("")}</details>` : ""}
  </div>`;
}
async function addTask(btn){
  const i = document.getElementById("tNew"), title = i.value.trim();
  if (!title) return toast("Escribí la tarea.");
  const due = document.getElementById("tNewDue").value || null, g = document.getElementById("tNewGoal");
  btn.disabled = true;
  try { await rpc("admin_task_save", { p_id: null, p_title: title, p_due: due, p_goal: g && g.value ? Number(g.value) : null }); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  await reloadTasks();
  const n = document.getElementById("tNew"); if (n) n.focus();
}
async function doneTask(btn){
  const t = taskList().find(x => String(x.id) === btn.dataset.id); if (!t) return;
  const v = btn.dataset.v === "1";
  // Se marca al momento y se vuelve atrás si la base no lo guarda.
  t.done = v; t.done_at = v ? new Date().toISOString() : null; paintTasks(); paintTodo(); paintGoals();
  try { await rpc("admin_task_done", { p_id: t.id, p_done: v }); }
  catch (e) { t.done = !v; t.done_at = null; paintTasks(); paintTodo(); paintGoals(); toast(errMsg(e)); }
}
function openTask(id){
  const t = taskList().find(x => String(x.id) === String(id)); if (!t) return;
  drawer(`<div class="h1 sm">Tarea</div>
    <label class="lbl">Qué hay que hacer</label><input class="in" id="tTitle" maxlength="200" value="${esc(t.title)}">
    <div class="vgrid2"><label><span class="lbl">Fecha</span><input class="in" id="tDue" type="date" value="${esc(t.due_date || "")}"></label>
      <label><span class="lbl">Objetivo</span><select class="in" id="tGoal"><option value="">Sin objetivo</option>${goalList().map(g => `<option value="${esc(g.id)}"${String(g.id) === String(t.goal_id) ? " selected" : ""}>${esc(goalName(g.id))}</option>`).join("")}</select></label></div>
    <div class="sec-s mt">${t.done ? "Hecha " + ago(t.done_at) + "." : "Creada " + ago(t.created_at) + "."}</div>
    <div class="row-btns"><button class="btn pri" data-a="tSave" data-id="${esc(t.id)}">Guardar</button><button class="btn bad" data-a="tDel" data-id="${esc(t.id)}">Borrar</button></div>`);
}
async function saveTask(btn){
  const title = document.getElementById("tTitle").value.trim(), g = document.getElementById("tGoal").value;
  if (!title) return toast("Escribí la tarea.");
  btn.disabled = true;
  try { await rpc("admin_task_save", { p_id: Number(btn.dataset.id), p_title: title, p_due: document.getElementById("tDue").value || null, p_goal: g ? Number(g) : null }); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  closeDrawer(); toast("Tarea guardada ✓"); reloadTasks();
}
async function deleteTask(btn){
  if (!await confirmar("¿Borrar esta tarea?")) return;
  btn.disabled = true;
  try { await rpc("admin_task_delete", { p_id: Number(btn.dataset.id) }); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  closeDrawer(); toast("Tarea borrada"); reloadTasks();
}
async function reloadTasks(){
  try { S.tasks = await rpc("admin_tasks"); } catch (e) { S.tasks = { error: e }; }
  paintTasks(); paintTodo(); paintGoals();
}

// ---------- Usuarios ----------
async function loadUsuarios(){
  page("Usuarios", "Tocá una fila para ver la ficha y las acciones.", userTabs("usuarios") + `
    <div class="search"><input class="in" id="uQ" placeholder="Nombre o mail…" value="${esc(S.q)}"><button class="btn blue" data-a="uSearch">Buscar</button></div>
    <div class="seg" id="uFilt" hidden></div>
    <div class="card"><div id="uList" class="empty">Cargando…</div></div>`);
  searchUsers();
}
async function searchUsers(){
  const box = document.getElementById("uList"); if (!box) return;
  box.className = "empty"; box.textContent = "Cargando…";
  try { S.users = await rpc("admin_users", { q: S.q }); } catch (e) { box.textContent = errMsg(e); return; }
  if (!S.users.length){ box.textContent = "Sin resultados."; return; }
  paintUsers();
}
// Columnas de la tabla de usuarios: tocar el título ordena por esa columna (ascendente) y
// tocarlo otra vez la da vuelta (descendente). Los vacíos van siempre al final.
const USER_COLS = [
  ["name", "Usuario", u => (u.full_name || "").toLocaleLowerCase("es") || null],
  ["role", "Rol", u => u.role === "coach" ? "coach" : "alumno"],
  ["coach", "Coach", u => (u.coach_name || "").toLocaleLowerCase("es") || null],
  ["alta", "Alta", u => u.created_at ? Date.parse(u.created_at) : null],
  ["visto", "Última vez", u => (u.last_seen_at || u.last_sign_in_at) ? Date.parse(u.last_seen_at || u.last_sign_in_at) : null],
  ["app", "App", u => u.app_platform ? platformTxt(u.app_platform, u.app_version).toLowerCase() : null],
];
// Filtros de la lista (sobre las cuentas que trajo la búsqueda). Inactivo: nunca entró o hace más de 14 días.
const INACTIVE_MS = 14 * 864e5;
const lastSeenT = u => { const d = u.last_seen_at || u.last_sign_in_at; return d ? Date.parse(d) : null; };
const isInactive = u => { const t = lastSeenT(u); return t == null || Date.now() - t > INACTIVE_MS; };
const UFILTERS = [["todos", "Todos", () => true], ["alumnos", "Alumnos", u => u.role !== "coach"], ["coaches", "Coaches", u => u.role === "coach"],
  ["sincoach", "Alumnos sin coach", u => u.role !== "coach" && !u.coach_name], ["inactivos", "Sin actividad (14+ días)", isInactive], ["admins", "Admins", u => !!u.is_admin]];
function paintUsers(){
  const box = document.getElementById("uList"); if (!box || !S.users) return;
  const so = S.uSort || null, col = so && USER_COLS.find(c => c[0] === so.k);
  const fl = UFILTERS.find(f => f[0] === S.uFilter) || UFILTERS[0];
  const bar = document.getElementById("uFilt");
  if (bar){ bar.hidden = false; bar.innerHTML = UFILTERS.map(([k, l, fn]) => `<button class="${fl[0] === k ? "on" : ""}" data-a="ufilt" data-v="${k}">${l} <span class="muted">${S.users.filter(fn).length}</span></button>`).join(""); }
  const list = S.users.filter(fl[2]);
  if (!list.length){ box.className = "empty"; box.textContent = "Ninguna cuenta cumple este filtro."; return; }
  if (col){
    const dir = so.dir === "desc" ? -1 : 1;
    list.sort((a, b) => { const x = col[2](a), y = col[2](b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y, "es") : x - y) * dir; });
  }
  const th = ([k, l]) => { const on = so && so.k === k, arrow = on ? (so.dir === "desc" ? " ▼" : " ▲") : "";
    return `<th aria-sort="${on ? (so.dir === "desc" ? "descending" : "ascending") : "none"}"><button class="th-sort${on ? " on" : ""}" data-a="usort" data-k="${k}">${l}<span class="th-arr">${arrow || " ↕"}</span></button></th>`; };
  box.className = "tscroll";
  box.innerHTML = `<table class="table"><thead><tr>${USER_COLS.map(th).join("")}</tr></thead><tbody>${list.map(u => `
    <tr class="row" data-user="${esc(u.id)}"><td><b>${esc(u.full_name || "Sin nombre")}</b>${u.is_admin ? ' <span class="pill blue">admin</span>' : ""}<div class="muted small">${esc(u.email)}</div></td>
      <td>${u.role === "coach" ? '<span class="pill ok">Coach</span>' : '<span class="pill">Alumno</span>'}</td>
      <td class="muted">${esc(u.coach_name || "—")}</td><td class="muted">${fmtD(u.created_at)}</td>
      <td class="${isInactive(u) ? "t-warn" : "muted"}">${ago(u.last_seen_at || u.last_sign_in_at)}</td><td class="muted small">${esc(platformTxt(u.app_platform, u.app_version))}</td></tr>`).join("")}</tbody></table>` +
    // admin_users trae 60 como mucho (las cuentas más nuevas).
    (list.length !== S.users.length ? `<div class="muted small" style="padding:10px">Mostrando ${list.length} de ${S.users.length}.</div>` : "") +
    (S.users.length >= 60 ? `<div class="muted small" style="padding:10px">Se muestran las 60 cuentas más nuevas${S.q ? " que coinciden" : ""}: buscá por nombre o mail para ver otras.</div>` : "");
}
const platformTxt = (p, v) => !p ? "—" : (p === "android" ? "Android " : p === "ios" ? "iPhone " : "Web ") + (p === "web" ? "" : (v || ""));

// Si la ficha se cerró (o se abrió la de otro) mientras llegaba el detalle, esa respuesta vieja no
// la vuelve a abrir ni pisa la ficha nueva: con la red lenta, la ficha cerrada reaparecía y su fondo
// tapaba la tabla.
let userReq = 0;
async function openUser(id){
  const req = ++userReq;
  drawer('<div class="empty">Cargando…</div>');
  const dr = document.querySelector(".drawer"), vigente = () => req === userReq && dr.isConnected;
  let d; try { d = await rpc("admin_user_detail", { uid: id }); } catch (e) { if (vigente()) drawer(`<div class="empty">${esc(errMsg(e))}</div>`); return; }
  if (!vigente()) return;
  if (!d) return drawer('<div class="empty">No se encontró el usuario.</div>');
  const f = (l, v) => `<div class="fact"><span>${l}</span><b>${v}</b></div>`;
  const clients = (d.clients || []);
  drawer(`<div class="h1 sm">${esc(d.full_name || "Sin nombre")}</div><div class="muted">${esc(d.email)}</div>
    <div class="facts">
      ${f("Rol", d.role === "coach" ? "Coach" : "Alumno")}${f("Entra con", esc(d.provider === "google" ? "Google" : d.provider === "apple" ? "Apple" : "Mail"))}
      ${f("Alta", fmtD(d.created_at))}${f("Última vez", ago(d.last_seen_at || d.last_sign_in_at))}
      ${f("App", esc(platformTxt(d.app_platform, d.app_version)))}${d.role === "coach" ? f("Alumnos", clients.length) : f("Coach", esc(d.coach ? d.coach.name || "Sin nombre" : "—"))}
      ${f("Entrenos", n0(d.sessions) + (d.last_session ? " · último " + fmtD(d.last_session) : ""))}${f("Días con comida", n0(d.food_days))}
    </div>
    ${d.role === "coach" && clients.length ? `<div class="sec-t">Alumnos</div><div class="list-mini">${clients.map(c => esc(c.name || "Sin nombre")).join(" · ")}</div>` : ""}
    <div class="sec-t" style="margin-top:18px">Acciones</div>
    <div class="row-btns">
      ${d.role === "coach" ? `<button class="btn blue" data-a="toCoach" data-id="${esc(d.id)}">Plan y pagos</button>` : ""}
      ${d.role === "coach" ? `<button class="btn" data-a="role" data-id="${esc(d.id)}" data-v="client">Pasar a alumno</button>` : `<button class="btn" data-a="role" data-id="${esc(d.id)}" data-v="coach">Pasar a coach</button>`}
      ${d.coach ? `<button class="btn" data-a="unlink" data-id="${esc(d.id)}">Desvincular de su coach</button>` : ""}
      ${d.is_admin ? `<button class="btn" data-a="admin" data-id="${esc(d.id)}" data-v="0">Quitar administrador</button>` : `<button class="btn" data-a="admin" data-id="${esc(d.id)}" data-v="1">Hacer administrador</button>`}
      <button class="btn bad" data-a="delete" data-id="${esc(d.id)}" data-name="${esc(d.full_name || d.email)}">Eliminar cuenta</button>
    </div>`);
}
// Cambió un coach (pago, cortesía, prueba): si se está en Coaches y pagos se redibuja; desde Usuarios
// se descarta la lista guardada (la próxima vez se vuelve a pedir) y se refresca la tabla.
function afterCoach(){
  if (S.view === "coaches") loadCoaches();
  else { S.coaches = null; if (S.view === "usuarios") searchUsers(); }
}
function drawer(html){
  let bg = document.querySelector(".drawer-bg"), dr = document.querySelector(".drawer");
  if (!dr){ bg = document.createElement("div"); bg.className = "drawer-bg"; bg.dataset.a = "closeDrawer"; dr = document.createElement("div"); dr.className = "drawer"; document.body.append(bg, dr); }
  dr.innerHTML = `<button class="x" data-a="closeDrawer" aria-label="Cerrar">×</button>` + html;
}
function closeDrawer(){ document.querySelectorAll(".drawer, .drawer-bg").forEach(x => x.remove()); }

// ---------- Coaches y pagos ----------
function coachState(c){
  if (c.plan === "cortesia") return '<span class="pill blue">Cortesía</span>';
  if (c.paid_until && new Date(c.paid_until) > new Date() && c.plan !== "trial") return `<span class="pill ok">Pagado hasta ${lastDay(c.paid_until)}</span>`;
  if (c.trial_ends_at && new Date(c.trial_ends_at) > new Date()) return `<span class="pill warn">Prueba hasta ${lastDay(c.trial_ends_at)}</span>`;
  return '<span class="pill bad">Sin pagar</span>';
}
const mpTxt = s => ({ authorized: "activa", paused: "pausada", cancelled: "cancelada", pending: "pendiente" }[s] || s || "—");
const planTxt = p => ({ trial: "Prueba", p10: "Hasta 10", p25: "Hasta 25", p50: "Hasta 50", p100: "Gimnasio chico (100)", p250: "Gimnasio (250)", p500: "Gimnasio grande (500)", cortesia: "Cortesía" }[p] || p || "—");
async function loadCoaches(){
  page("Coaches y pagos", "Tocá un coach para cargar un pago, darle cortesía o más días de prueba.",
    userTabs("coaches") + '<div id="cSoon"></div>' + block("cListB", "Todos los coaches", '<div id="cList" class="empty">Cargando…</div>'));
  const box = document.getElementById("cList");
  try { S.coaches = await rpc("admin_coaches"); } catch (e) { box.textContent = errMsg(e); return; }
  if (!S.coaches.length){ box.textContent = "Todavía no hay coaches."; return; }
  paintSoon();
  const cnt = st => S.coaches.filter(c => coachState(c).includes(st)).length;
  setSum("cListB", S.coaches.length + (S.coaches.length === 1 ? " coach · " : " coaches · ") + cnt("Pagado") + " pagando · " + cnt("Prueba") + " en prueba" + (cnt("Sin pagar") ? ` · <span class="t-bad">${cnt("Sin pagar")} sin pagar</span>` : ""));
  box.className = "tscroll";
  box.innerHTML = `<table class="table"><thead><tr><th>Coach</th><th>Plan</th><th>Alumnos</th><th>Estado</th><th>Mercado Pago</th><th>Paga</th></tr></thead><tbody>${S.coaches.map(c => `
    <tr class="row" data-coach="${esc(c.id)}"><td><b>${esc(c.full_name || "Sin nombre")}</b><div class="muted small">${esc(c.email)}</div></td>
      <td>${esc(planTxt(c.plan))}${c.pending_plan ? `<div class="muted small">eligió ${esc(planTxt(c.pending_plan))}</div>` : ""}</td>
      <td>${n0(c.clients)} <span class="muted">/ ${n0(c.max_clients)}</span></td><td>${coachState(c)}</td>
      <td class="muted small">${c.has_mp ? esc(mpTxt(c.mp_status)) : "—"}</td>
      <td>${c.price ? money(c.price) : "—"}</td></tr>`).join("")}</tbody></table>`;
}
// Vencimientos: a quién escribirle. Pago o prueba que vence en los próximos 7 días, y los
// que ya vencieron hace menos de 30 días (los de hace más, ya se sabe).
// Los días se cuentan en el calendario de Argentina, desde hoy hasta el último día cubierto
// (el vencimiento menos 1 ms): 0 es "vence hoy" y -1 es "venció ayer".
const AR_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
const diaAR = ms => Date.parse(AR_DAY.format(new Date(ms)));
function venceDe(c){
  if (c.plan === "cortesia") return null;
  const now = Date.now(), paid = c.paid_until ? new Date(c.paid_until).getTime() : 0, trial = c.trial_ends_at ? new Date(c.trial_ends_at).getTime() : 0;
  const t = Math.max(paid, trial); if (!t) return null;
  return { t, que: paid >= trial ? "pago" : "prueba", dias: Math.round((diaAR(t - 1) - diaAR(now)) / 864e5), vencido: t <= now };
}
function venceTxt(v){
  if (!v.vencido) return v.dias === 0 ? "vence hoy" : "vence en " + v.dias + " día" + (v.dias === 1 ? "" : "s");
  if (v.dias === 0) return "venció hoy"; // por ejemplo, con «Cortar ahora»
  return (v.que === "pago" ? "vencido" : "vencida") + " hace " + (-v.dias) + " día" + (v.dias === -1 ? "" : "s");
}
function paintSoon(){
  const box = document.getElementById("cSoon"); if (!box) return;
  const list = (S.coaches || []).map(c => ({ c, v: venceDe(c) })).filter(x => x.v && x.v.dias <= 7 && x.v.dias > -30).sort((a, b) => a.v.t - b.v.t);
  if (!list.length){ box.innerHTML = ""; return; }
  const late = list.filter(x => x.v.vencido).length;
  box.innerHTML = block("cSoonB", "Vencen pronto", `<div class="list-mini">${list.map(({ c, v }) => `
    <div class="row" data-coach="${esc(c.id)}" style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;cursor:pointer">
      <span><b>${esc(c.full_name || "Sin nombre")}</b> <span class="muted small">${esc(c.email)}</span></span>
      <span class="pill ${v.vencido ? "bad" : "warn"}">${v.que === "pago" ? "Pago" : "Prueba"} ${venceTxt(v)}</span>
    </div>`).join("")}</div>`, { sum: (list.length - late ? list.length - late + " por vencer" : "") + (late ? (list.length - late ? " · " : "") + `<span class="t-bad">${late} vencido${late === 1 ? "" : "s"}</span>` : "") });
}

const PLAN_MAX = { p10: 10, p25: 25, p50: 50, p100: 100, p250: 250, p500: 500 };
const PLAN_PRICE = { p10: 14900, p25: 24900, p50: 37900, p100: 59900, p250: 119900, p500: 199900 }; // los de plan_price (supabase/admin.sql)
const isoDay = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
// Fecha para "pagado hasta": desde el vencimiento actual si todavía no pasó, si no desde hoy.
// El plan pago arranca cuando termina lo que ya tiene (la prueba gratis o el mes ya pagado):
// así no pierde días de prueba si paga antes. Se cuenta desde el último día cubierto.
function hastaMeses(c, meses){
  const now = Date.now(), fin = x => x && new Date(x).getTime() > now ? new Date(x).getTime() - 1 : 0;
  const d = new Date(Math.max(now, fin(c.paid_until), c.plan === "cortesia" ? 0 : fin(c.trial_ends_at)));
  // Mismo día del mes, o el último si ese mes es más corto (del 31/10, +1 da 30/11 y no 1/12).
  const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + meses);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return isoDay(d);
}

async function openCoach(id){
  const c = (S.coaches || []).find(x => x.id === id); if (!c) return;
  drawer(`<div class="h1 sm">${esc(c.full_name || "Sin nombre")}</div><div class="muted">${esc(c.email)}</div>
    <div class="facts">
      <div class="fact"><span>Plan</span><b>${esc(planTxt(c.plan))}</b></div><div class="fact"><span>Estado</span><b>${coachState(c)}</b></div>
      <div class="fact"><span>Alumnos</span><b>${n0(c.clients)} de ${n0(c.max_clients)}</b></div><div class="fact"><span>Pago al día hasta</span><b>${lastDay(c.paid_until)}</b></div>
      <div class="fact"><span>Prueba hasta</span><b>${lastDay(c.trial_ends_at)}</b></div><div class="fact"><span>Mercado Pago</span><b>${c.has_mp ? esc(mpTxt(c.mp_status)) : "Sin suscripción"}</b></div>
    </div>
    ${panel("drPago", "Pago manual", `<div class="sec-s">Cuando te paga (transferencia, efectivo, link), cargá el plan y hasta cuándo queda habilitado. Los meses se cuentan desde que termina lo que ya tiene: si está en la prueba gratis, el plan arranca cuando la prueba termina (no pierde días); si ya estaba al día, desde su vencimiento.</div>
    <label class="lbl">Plan</label>
    <select class="in" id="pmPlan">${Object.keys(PLAN_MAX).map(p => `<option value="${p}"${(c.plan === p || (!PLAN_MAX[c.plan] && p === "p25")) ? " selected" : ""}>${esc(planTxt(p))} · ${money(PLAN_PRICE[p])}/mes</option>`).join("")}</select>
    <label class="lbl">Alumnos máximos</label><input class="in" id="pmMax" type="number" min="1" max="1000" value="${PLAN_MAX[c.plan] ? Number(c.max_clients) || PLAN_MAX[c.plan] : 25}">
    <label class="lbl">Pagado hasta</label>
    <div class="search"><input class="in" id="pmUntil" type="date" value="${hastaMeses(c, 1)}">
      <button class="btn" data-a="pmMeses" data-id="${esc(c.id)}" data-m="1">+1 mes</button><button class="btn" data-a="pmMeses" data-id="${esc(c.id)}" data-m="3">+3</button><button class="btn" data-a="pmMeses" data-id="${esc(c.id)}" data-m="12">+12</button></div>
    <div class="search" style="margin:8px 0 0"><button class="btn blue" data-a="pmSave" data-id="${esc(c.id)}">Guardar pago</button>${c.paid_until && new Date(c.paid_until) > new Date() && c.plan !== "cortesia" ? `<button class="btn" data-a="pmClear" data-id="${esc(c.id)}">Cortar ahora</button>` : ""}</div>`)}
    ${c.has_mp ? panel("drMp", "Cobros de Mercado Pago", '<div id="pays" class="list-mini">Cargando…</div>') : ""}
    ${panel("drPrueba", "Cortesía o prueba", `<div class="sec-s">Gratis. En la prueba elegís hasta qué día y cuántos alumnos puede tener.</div>
    ${c.plan === "cortesia" ? `<button class="btn" data-a="plan" data-id="${esc(c.id)}" data-mode="sin_cortesia">Quitar la cortesía</button>` :
      `<label class="lbl">Cortesía: gratis, con tope de alumnos</label><div class="search"><input class="in" id="ctMax" type="number" min="1" value="${Math.max(10, c.max_clients || 10)}"><button class="btn blue" data-a="plan" data-id="${esc(c.id)}" data-mode="cortesia">Dar cortesía</button></div>`}
    ${c.plan === "cortesia" ? "" : `<label class="lbl">Prueba gratis hasta</label><input class="in" id="trUntil" type="date" min="${isoDay(new Date())}" value="${c.trial_ends_at && new Date(c.trial_ends_at) > new Date() ? isoDay(new Date(new Date(c.trial_ends_at).getTime() - 1)) : isoDay(new Date(Date.now() + 14 * 864e5))}">
    <label class="lbl">Alumnos máximos en la prueba</label><div class="search" style="margin:0"><input class="in" id="trMax" type="number" min="1" max="1000" value="${Number(c.max_clients) || 10}"><button class="btn blue" data-a="trSave" data-id="${esc(c.id)}">Guardar prueba</button></div>`}`, { open: false, sum: c.plan === "cortesia" ? "tiene cortesía" : "" })}`);
  if (!c.has_mp) return;
  const box = document.getElementById("pays");
  try {
    const r = await fn({ action: "pagos", coach_id: id });
    const st = s => ({ approved: '<span class="pill ok">Cobrado</span>', rejected: '<span class="pill bad">Rechazado</span>', pending: '<span class="pill warn">Pendiente</span>', processed: '<span class="pill ok">Cobrado</span>', scheduled: '<span class="pill">Programado</span>', recycling: '<span class="pill warn">Reintentando</span>' }[s] || `<span class="pill">${esc(s || "—")}</span>`);
    box.innerHTML = (r.subscription ? `<div class="muted" style="margin-bottom:8px">Suscripción ${esc(mpTxt(r.subscription.status))} · ${money(r.subscription.amount)} por mes${r.subscription.next ? " · próximo cobro " + fmtD(r.subscription.next) : ""}</div>` : "") +
      ((r.payments || []).length ? `<table class="table"><tbody>${r.payments.map(p => `<tr><td>${fmtD(p.date)}</td><td>${money(p.amount)}</td><td>${st(p.status)}</td></tr>`).join("")}</tbody></table>` : "Todavía no hay cobros.");
  } catch (e) { box.textContent = "No se pudieron traer los cobros: " + errMsg(e); }
}

// ---------- Finanzas ----------
// Gastos fijos (en pesos o dólares) y quién paga cada uno, lo que entra por las suscripciones
// de los coaches y cuántos faltan para cubrir los gastos (supabase/finanzas.sql). El dólar se
// trae de dolarapi.com y queda guardado en la base para cuando no responda.
//
// Los coaches pagan por transferencia a la cuenta de GIZE (se arregla por WhatsApp): no hay
// comisión que descontar. Antes se cobraba con suscripciones de Mercado Pago y acá se elegía el
// plazo de liberación con su comisión; la columna fin_settings.mp_plazo quedó sin uso.
// Monotributo, prestación de servicios, desde agosto 2026: [tope de ingresos por año, cuota por
// mes]. ARCA los actualiza en febrero y agosto.
const MONO = { A: [12009410, 49527], B: [17595182, 56379], C: [24670494, 66020], D: [30628651, 84614], E: [36028231, 119811],
  F: [45151659, 150784], G: [53995798, 230612], H: [81924660, 522706], I: [91699761, 963747], J: [105012519, 1167299], K: [126610839, 1614446] };
const PERIOD = { mensual: "por mes", anual: "por año", unico: "pago único" };
const COST_ST = { activo: '<span class="pill ok">Activo</span>', pensando: '<span class="pill warn">Lo estoy pensando</span>', pausado: '<span class="pill">Pausado</span>' };
const dec = v => (Number(v) || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
const amountTxt = c => (c.currency === "USD" ? "US$ " : "$") + dec(c.amount);
const bigMoney = v => Math.abs(v) >= 1e6 ? "$" + (v / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + " M" : money(v);
const signed = v => (v < 0 ? "−" : "") + money(Math.abs(v));
const pct = v => (v * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "%";
const dateOnly = d => d ? d + "T12:00:00" : null; // "2027-03-01" sin correrse de día por el huso horario

async function loadFinanzas(){
  const lead = "Gastos, ingresos y cuánto falta para cubrir todo. Los dólares se pasan a pesos con la cotización del día.";
  page("Finanzas", lead, '<div class="empty">Cargando…</div>');
  try { S.fin = await rpc("admin_fin"); }
  catch (e) {
    const falta = /admin_fin|schema cache/i.test(errMsg(e));
    return page("Finanzas", lead, `<div class="card"><div class="empty">${falta ? "Falta preparar la base: en GitHub, Actions → <b>Supabase</b> → Run workflow → tarea <b>sql</b>, archivo <b>supabase/finanzas.sql</b>." : esc(errMsg(e))}</div></div>`);
  }
  const st = S.fin.settings = S.fin.settings || {};
  if (!S.dolar || !S.dolar.live) S.dolar = { tarjeta: num(st.dolar_tarjeta), mep: num(st.dolar_mep), at: st.dolar_at, live: false };
  // Pestañas: todo queda en la página (las cuentas usan lo que hay en pantalla) y se muestra una parte.
  page("Finanzas", lead, `
    <div class="seg" id="fTabs">${FTABS.map(([k, l]) => `<button data-a="fTab" data-v="${k}">${l}</button>`).join("")}</div>
    <div data-fp="numeros">
    <div class="grid kpis wide" id="fKpis"></div>
    <div id="fDolar"></div>
    <div id="fEmpty" class="card" hidden><div class="sec-t">Empezá cargando los gastos</div><div class="sec-s">Con los gastos cargados acá ves cuántos coaches hacen falta para cubrirlos y cuánto pone cada socio.</div><div class="row-btns"><button class="btn blue" data-a="fCost">+ Agregar gasto</button></div></div>
    ${block("fEqB", "Punto de equilibrio", '<div class="sec-s">Coaches que hacen falta para cubrir los gastos. Cobran por transferencia, sin comisión.</div><div id="fEq"></div>')}
    ${block("fWhoB", "Quién pone qué", '<div class="sec-s">Gastos activos de cada socio, pasados a pesos por mes.</div><div id="fWho"></div>')}
    </div>
    <div data-fp="gastos">
    <div class="card"><div class="card-h"><div><div class="sec-t">Gastos</div><div class="sec-s">Tocá uno para cambiarlo. Los que estás pensando y los pausados no suman.</div></div><button class="btn blue" data-a="fCost">+ Agregar gasto</button></div><div id="fCosts"></div></div></div>
    <div class="narrow" data-fp="facturacion">
      <div class="card"><div class="sec-t">Cobros y facturación</div><div class="sec-s">Las cuentas cambian al momento; «Guardar» deja los cambios fijos.</div>
        <label class="lbl">Los gastos en dólares se pagan</label>
        <select class="in" data-fs="usd_pago"><option value="tarjeta">Con la tarjeta, en pesos (dólar tarjeta)</option><option value="mep"${st.usd_pago === "mep" ? " selected" : ""}>Con dólares propios (dólar MEP)</option></select>
        <div class="vgrid2"><label><span class="lbl">Quién factura</span><input class="in" data-fs="titular" maxlength="80" value="${esc(st.titular || "")}" placeholder="Nombre"></label>
          <label><span class="lbl">Categoría del monotributo</span><select class="in" data-fs="categoria"><option value="">—</option>${Object.keys(MONO).map(k => `<option${st.categoria === k ? " selected" : ""}>${k}</option>`).join("")}</select></label></div>
        <label class="lbl">Otros ingresos por año de quien factura (aparte de GIZE)</label>
        <input class="in" data-fs="otros_ingresos" type="number" min="0" step="1000" value="${num(st.otros_ingresos) || ""}" placeholder="0">
        <div id="fMono"></div>
        <div class="row-btns"><button class="btn pri" data-a="fSave">Guardar</button></div></div></div>
    <div class="grid two" data-fp="notas">
      <div class="card"><div class="sec-t">Pendientes</div><div class="sec-s">Lo que falta ordenar. Tocá el círculo cuando esté hecho.</div><div id="fTodos"></div>
        <div class="search" style="margin:12px 0 0"><input class="in" id="fTodoIn" maxlength="200" placeholder="Agregar un pendiente…"><button class="btn" data-a="fTodoAdd">Agregar</button></div></div>
      <div class="card"><div class="sec-t">Notas</div><div class="sec-s">Acuerdos entre socios, decisiones y lo que haya que recordar. Solo lo ven los administradores.</div>
        <textarea class="in" data-fs="notas" maxlength="5000" placeholder="Ej: la ganancia se reparte mitad y mitad; la cuenta de Apple está a nombre de…">${esc(st.notas || "")}</textarea>
        <div class="row-btns"><button class="btn" data-a="fSave">Guardar notas</button></div></div>
    </div>`);
  finTabs(); paintFin();
  if (!S.dolar.live || Date.now() - S.dolar.fetched > 600000) fetchDolar();
}
function paintFin(){ paintFinCalc(); paintCosts(); paintTodos(); }
const FTABS = [["numeros", "Números"], ["gastos", "Gastos"], ["facturacion", "Facturación"], ["notas", "Pendientes y notas"]];
function finTabs(){
  document.querySelectorAll("#fTabs button").forEach(b => b.classList.toggle("on", b.dataset.v === S.finTab));
  document.querySelectorAll("[data-fp]").forEach(x => { x.hidden = x.dataset.fp !== S.finTab; });
}

// Cuentas con los ajustes que están en pantalla (aunque todavía no se hayan guardado).
function finCalc(){
  const f = S.fin, st = f.settings;
  const fee = 0; // transferencia: entra el precio entero (ver arriba)
  const kind = st.usd_pago === "mep" ? "mep" : "tarjeta", other = kind === "mep" ? "tarjeta" : "mep";
  const perMonth = (c, k) => { const a = num(c.amount) * (c.currency === "USD" ? S.dolar[k || kind] || 0 : 1); return c.period === "mensual" ? a : c.period === "anual" ? a / 12 : 0; };
  const sum = (list, k) => list.reduce((s, c) => s + perMonth(c, k), 0);
  const act = f.costs.filter(c => c.status === "activo");
  const cost = sum(act), costOther = sum(act, other), maybe = sum(f.costs.filter(c => c.status === "pensando"));
  const gross = f.plans.reduce((s, p) => s + num(p.price) * p.paid, 0), paid = f.plans.reduce((s, p) => s + p.paid, 0), net = gross * (1 - fee);
  const noRate = f.costs.some(c => c.currency === "USD" && c.status !== "pausado") && !(S.dolar.tarjeta && S.dolar.mep);
  return { st, fee, kind, perMonth, act, cost, costOther, maybe, gross, paid, net, result: net - cost, gap: Math.max(0, cost - net), noRate };
}
function paintFinCalc(){
  if (!document.getElementById("fKpis")) return;
  const c = finCalc(), st = c.st, d = S.dolar, p25 = S.fin.plans.find(p => p.id === "p25");
  const k = (v, l, sub, cls) => `<div class="kpi${cls ? " " + cls : ""}"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const cheaper = c.kind === "tarjeta" && c.costOther < c.cost - 1 ? " · con dólares propios: " + money(c.costOther) : "";
  const dAt = d.at ? (d.live ? "dolarapi.com · " + fmtD(d.at) : "guardada el " + fmtD(d.at)) : "sin cotización";
  document.getElementById("fKpis").innerHTML =
    k(money(c.cost), "Gastos por mes", bigMoney(c.cost * 12) + " por año" + cheaper + (c.maybe ? " · +" + money(c.maybe) + " si sumás lo que estás pensando" : ""), "hi") +
    k(money(c.net), "Entra por mes", n0(c.paid) + " suscripcion" + (c.paid === 1 ? "" : "es") + " al día · por transferencia", c.net > 0 ? "good" : "") +
    k(signed(c.result), "Resultado por mes", c.result < 0 ? "lo ponen los socios" : c.result > 0 ? "ganancia para repartir" : "ni se gana ni se pierde", c.result < 0 ? "bad" : c.result > 0 ? "good" : "") +
    k(d[c.kind] ? money(d[c.kind]) : "—", c.kind === "mep" ? "Dólar MEP" : "Dólar tarjeta", (d[c.kind === "mep" ? "tarjeta" : "mep"] ? (c.kind === "mep" ? "tarjeta " : "MEP ") + money(d[c.kind === "mep" ? "tarjeta" : "mep"]) + " · " : "") + dAt);
  // Si dolarapi.com no respondió: la cotización se puede poner a mano.
  document.getElementById("fDolar").innerHTML = d.failed ? `<div class="card warn-card"><div class="sec-t">No se pudo traer el dólar de dolarapi.com</div>
    <div class="sec-s">${d.at ? "Se usa la cotización guardada el " + fmtD(d.at) + "." : "No hay una cotización guardada."} Podés ponerla a mano:</div>
    <div class="search"><input class="in" id="fdT" type="number" min="1" step="0.01" placeholder="Tarjeta" value="${d.tarjeta || ""}"><input class="in" id="fdM" type="number" min="1" step="0.01" placeholder="MEP" value="${d.mep || ""}"><button class="btn blue" data-a="fDolarSave">Guardar</button></div></div>` : "";

  // Punto de equilibrio. Sin gastos cargados no hay nada que calcular: en vez de dos bloques
  // vacíos se muestra una sola invitación a cargarlos.
  const eq = document.getElementById("fEq"), sinGastos = !c.act.length;
  ["fEqB", "fWhoB"].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = sinGastos; });
  const em = document.getElementById("fEmpty"); if (em) em.hidden = !sinGastos;
  setSum("fEqB", !c.act.length || c.noRate ? "" : c.gap > 0 ? `<span class="t-warn">faltan ${money(c.gap)} por mes</span>` : `<span class="t-ok">cubierto · sobran ${money(c.result)}</span>`);
  if (!c.act.length) eq.innerHTML = '<div class="empty">Cargá los gastos para ver cuántos coaches hacen falta.</div>';
  else if (c.noRate) eq.innerHTML = '<div class="empty">Falta la cotización del dólar para pasar los gastos a pesos.</div>';
  else {
    eq.innerHTML = (c.gap > 0 ? `<div class="big-line">Faltan <b>${money(c.gap)}</b> por mes</div>` : `<div class="big-line">Gastos cubiertos: sobran <b class="ok-t">${money(c.result)}</b> por mes</div>`) +
      `<div class="tscroll"><table class="table"><thead><tr><th>Plan</th><th>Precio</th><th>Te queda</th><th>${c.gap > 0 ? "Coaches que faltan" : "Al día"}</th></tr></thead><tbody>${S.fin.plans.map(p => {
        const netP = num(p.price) * (1 - c.fee), need = c.gap > 0 ? Math.ceil(c.gap / netP - 1e-9) : 0;
        return `<tr><td>${esc(planTxt(p.id))}</td><td>${money(p.price)}</td><td>${money(netP)}</td><td><b>${c.gap > 0 ? n0(need) : n0(p.paid)}</b>${c.gap > 0 && p.paid ? ` <span class="muted small">(hoy ${n0(p.paid)})</span>` : ""}</td></tr>`;
      }).join("")}</tbody></table></div>` +
      `<div class="muted small" style="margin-top:10px">Si todos los que faltan entran en ese plan. ${S.fin.trial && p25 ? `Hay ${n0(S.fin.trial)} coach${S.fin.trial === 1 ? "" : "es"} en prueba: si pasan al plan de 25 entran ${money(S.fin.trial * num(p25.price) * (1 - c.fee))} más por mes.` : ""}</div>`;
  }

  // Quién pone qué
  const who = {}, names = {};
  c.act.forEach(x => { const n = (x.paid_by || "").trim() || "Sin asignar", key = n.toLowerCase(); names[key] = names[key] || n; who[key] = (who[key] || 0) + c.perMonth(x); });
  const rows = Object.keys(who).map(key => [names[key], who[key]]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  setSum("fWhoB", rows.map(([n, v]) => esc(n) + " " + pct(c.cost ? v / c.cost : 0)).join(" · "));
  document.getElementById("fWho").innerHTML = !rows.length ? '<div class="empty">Cuando cargues los gastos y quién paga cada uno, acá se ve cuánto pone cada socio.</div>' :
    rows.map(([n, v]) => `<div class="share"><div class="share-h"><b>${esc(n)}</b><span>${money(v)} <span class="muted small">· ${pct(c.cost ? v / c.cost : 0)}</span></span></div><div class="meter"><i style="width:${c.cost ? Math.round(v / c.cost * 100) : 0}%"></i></div></div>`).join("") +
    (c.act.some(x => x.period === "anual") ? '<div class="muted small" style="margin-top:8px">Los gastos anuales van divididos por 12.</div>' : "");

  // Monotributo de quien factura
  const mono = document.getElementById("fMono"), cat = st.categoria;
  if (!cat || !MONO[cat]) { mono.innerHTML = '<div class="muted small" style="margin-top:12px">Elegí la categoría para ver cuánto margen queda antes del tope.</div>'; return; }
  const [tope, cuota] = MONO[cat], anual = c.gross * 12, total = anual + num(st.otros_ingresos), letters = Object.keys(MONO);
  const per25 = (p25 ? num(p25.price) : PLAN_PRICE.p25) * 12;
  let txt;
  if (total <= tope){
    const nx = letters[letters.indexOf(cat) + 1];
    txt = `Usa el <b>${pct(total / tope)}</b> del tope de la ${cat} (${bigMoney(tope)} por año): GIZE a este ritmo factura ${bigMoney(anual)} por año y lo demás suma ${bigMoney(num(st.otros_ingresos))}. ` +
      `Entran <b>${n0(Math.floor((tope - total) / per25))} coaches más</b> del plan de 25 antes de ${nx ? `pasar a la ${nx} (cuota ${money(MONO[nx][1])}, ${money(MONO[nx][1] - cuota)} más por mes)` : "llegar al tope del monotributo"}.`;
  } else {
    const need = letters.find(l => MONO[l][0] >= total);
    txt = need ? `Se pasa del tope de la ${cat}: con ${bigMoney(total)} por año le corresponde la <b>${need}</b> (cuota ${money(MONO[need][1])} por mes).`
      : `Supera el tope del monotributo (${bigMoney(MONO.K[0])} por año): habría que pasar a responsable inscripto. Conviene hablarlo con un contador.`;
  }
  mono.innerHTML = `<div class="mono"><div class="meter${total > tope ? " over" : ""}"><i style="width:${Math.min(100, Math.round(total / tope * 100))}%"></i></div><div class="small">${txt}</div></div>`;
}
function paintCosts(){
  const box = document.getElementById("fCosts"); if (!box) return;
  const c = finCalc(), today = new Date(); today.setHours(0, 0, 0, 0);
  if (!S.fin.costs.length){ box.innerHTML = '<div class="empty">Todavía no hay gastos. Tocá «Agregar gasto».</div>'; return; }
  const next = x => {
    if (!x.next_date) return '<span class="muted">—</span>';
    const days = Math.round((new Date(x.next_date + "T00:00:00") - today) / 86400000);
    return fmtD(dateOnly(x.next_date)) + (x.status === "activo" && days < 0 ? ' <span class="pill bad">Vencido</span>' : x.status === "activo" && days <= 15 ? ` <span class="pill warn">${days ? "en " + days + " días" : "hoy"}</span>` : "");
  };
  box.className = "tscroll";
  box.innerHTML = `<table class="table"><thead><tr><th>Gasto</th><th>Monto</th><th>En pesos por mes</th><th>Paga</th><th>Próximo pago</th><th>Estado</th></tr></thead><tbody>${S.fin.costs.map(x => `
    <tr class="row${x.status === "activo" ? "" : " dim"}" data-cost="${esc(x.id)}"><td><b>${esc(x.name)}</b>${x.note ? `<div class="muted small">${esc(x.note)}</div>` : ""}</td>
      <td>${amountTxt(x)} <span class="muted small">${PERIOD[x.period] || ""}</span></td>
      <td>${x.period === "unico" ? '<span class="muted">—</span>' : c.noRate && x.currency === "USD" ? "?" : money(c.perMonth(x))}</td>
      <td class="muted">${esc(x.paid_by || "—")}</td><td>${next(x)}</td><td>${COST_ST[x.status] || esc(x.status)}</td></tr>`).join("")}</tbody></table>`;
}
function paintTodos(){
  const box = document.getElementById("fTodos"); if (!box) return;
  box.innerHTML = S.fin.todos.length ? S.fin.todos.map(t => `<div class="todo${t.done ? " done" : ""}">
      <button class="chk" data-a="fTodo" data-id="${esc(t.id)}" data-v="${t.done ? "deshacer" : "hecho"}" aria-label="${t.done ? "Marcar como pendiente" : "Marcar como hecho"}"></button>
      <span>${esc(t.label)}</span><button class="x-sm" data-a="fTodoDel" data-id="${esc(t.id)}" aria-label="Borrar">×</button></div>`).join("")
    : '<div class="empty">No hay pendientes. 🎉</div>';
}
async function fetchDolar(){
  const d = S.dolar;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch("https://dolarapi.com/v1/dolares", { signal: ctl.signal }); clearTimeout(t);
    if (!r.ok) throw new Error("dolarapi " + r.status);
    const list = await r.json(), get = k => (Array.isArray(list) && list.find(x => x.casa === k)) || {};
    const tarjeta = Number(get("tarjeta").venta), mep = Number(get("bolsa").venta);
    if (!(tarjeta > 0 && mep > 0)) throw new Error("dolarapi sin datos");
    S.dolar = { tarjeta, mep, at: get("tarjeta").fechaActualizacion || new Date().toISOString(), live: true, fetched: Date.now() };
    // Se guarda en la base para cuando dolarapi.com no responda.
    const st = S.fin && S.fin.settings;
    if (st && (num(st.dolar_tarjeta) !== tarjeta || num(st.dolar_mep) !== mep))
      rpc("admin_fin_dolar", { p_tarjeta: tarjeta, p_mep: mep }).then(() => Object.assign(st, { dolar_tarjeta: tarjeta, dolar_mep: mep, dolar_at: new Date().toISOString() })).catch(() => {});
  } catch (e) { S.dolar = Object.assign({}, d, { live: false, failed: true }); }
  if (S.view === "finanzas" && S.fin){ paintFinCalc(); paintCosts(); }
}
async function saveDolar(btn){
  const tarjeta = num(document.getElementById("fdT").value), mep = num(document.getElementById("fdM").value);
  if (!(tarjeta > 0 && mep > 0)) return toast("Poné el dólar tarjeta y el MEP.");
  btn.disabled = true;
  try { await rpc("admin_fin_dolar", { p_tarjeta: tarjeta, p_mep: mep }); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  Object.assign(S.fin.settings, { dolar_tarjeta: tarjeta, dolar_mep: mep, dolar_at: new Date().toISOString() });
  S.dolar = { tarjeta, mep, at: S.fin.settings.dolar_at, live: false };
  toast("Cotización guardada"); paintFinCalc(); paintCosts();
}
// Un ajuste cambiado en pantalla: se recalcula al momento y «Guardar» queda marcado.
function finField(el){
  S.fin.settings[el.dataset.fs] = el.value;
  document.querySelectorAll('[data-a="fSave"]').forEach(b => b.classList.add("dirty"));
  if (el.dataset.fs !== "notas") paintFinCalc();
}
async function saveFinSettings(btn){
  const st = S.fin.settings;
  if (num(st.otros_ingresos) < 0) return toast("Los otros ingresos no pueden ser negativos.");
  btn.disabled = true;
  try { await rpc("admin_fin_settings_save", { p_mp_plazo: String(st.mp_plazo || "0"), p_usd_pago: st.usd_pago === "mep" ? "mep" : "tarjeta", p_titular: st.titular || null,
    p_categoria: st.categoria || null, p_otros: num(st.otros_ingresos), p_notas: st.notas || null }); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  btn.disabled = false;
  document.querySelectorAll('[data-a="fSave"]').forEach(b => b.classList.remove("dirty"));
  toast("Guardado ✓");
}
// Después de cambiar un gasto o un pendiente se vuelve a pedir todo, sin pisar los ajustes que
// están en pantalla sin guardar.
async function reloadFin(){
  const st = S.fin.settings;
  try { S.fin = await rpc("admin_fin"); } catch (e) { return toast(errMsg(e)); }
  S.fin.settings = st;
  paintFin();
}
function openCost(id){
  const c = id ? S.fin.costs.find(x => x.id === id) : { currency: "USD", period: "mensual", status: "activo" };
  if (!c) return;
  const who = [...new Set(S.fin.costs.map(x => x.paid_by).concat(S.fin.settings.titular).filter(Boolean))];
  const opt = (list, v) => list.map(([k, l]) => `<option value="${k}"${v === k ? " selected" : ""}>${l}</option>`).join("");
  drawer(`<div class="h1 sm">${id ? "Cambiar gasto" : "Nuevo gasto"}</div>
    <label class="lbl">Qué es</label><input class="in" id="fcName" maxlength="80" value="${esc(c.name || "")}" placeholder="Ej: Apple Developer">
    <div class="vgrid2"><label><span class="lbl">Monto</span><input class="in" id="fcAmount" type="number" min="0" step="0.01" value="${c.amount != null ? esc(c.amount) : ""}"></label>
      <label><span class="lbl">Moneda</span><select class="in" id="fcCur">${opt([["USD", "Dólares"], ["ARS", "Pesos"]], c.currency)}</select></label></div>
    <div class="vgrid2"><label><span class="lbl">Cada cuánto</span><select class="in" id="fcPer">${opt([["mensual", "Por mes"], ["anual", "Por año"], ["unico", "Pago único"]], c.period)}</select></label>
      <label><span class="lbl">Estado</span><select class="in" id="fcSt">${opt([["activo", "Activo"], ["pensando", "Lo estoy pensando"], ["pausado", "Pausado"]], c.status)}</select></label></div>
    <div class="vgrid2"><label><span class="lbl">Quién lo paga</span><input class="in" id="fcWho" maxlength="60" list="fcWhoL" value="${esc(c.paid_by || "")}" placeholder="Nombre del socio">
        <datalist id="fcWhoL">${who.map(w => `<option value="${esc(w)}">`).join("")}</datalist></label>
      <label><span class="lbl">Próximo pago</span><input class="in" id="fcNext" type="date" value="${esc(c.next_date || "")}"></label></div>
    <label class="lbl">Nota</label><input class="in" id="fcNote" maxlength="300" value="${esc(c.note || "")}" placeholder="Opcional">
    <div class="row-btns"><button class="btn pri" data-a="fCostSave" data-id="${id ? esc(id) : ""}">Guardar</button>${id ? `<button class="btn bad" data-a="fCostDel" data-id="${esc(id)}">Borrar</button>` : ""}</div>`);
  if (!id) document.getElementById("fcName").focus();
}
async function saveCost(btn){
  const v = id => document.getElementById(id).value.trim(), amount = num(v("fcAmount"));
  if (!v("fcName")) return toast("Poné qué es el gasto.");
  if (!(amount > 0)) return toast("Poné el monto.");
  btn.disabled = true;
  try { await rpc("admin_fin_cost_save", { p_id: btn.dataset.id ? Number(btn.dataset.id) : null, p_name: v("fcName"), p_amount: amount, p_currency: v("fcCur"), p_period: v("fcPer"),
    p_status: v("fcSt"), p_paid_by: v("fcWho") || null, p_next: v("fcNext") || null, p_note: v("fcNote") || null }); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  closeDrawer(); toast("Gasto guardado ✓"); reloadFin();
}
async function deleteCost(btn){
  const c = S.fin.costs.find(x => x.id === Number(btn.dataset.id));
  if (!await confirmar("¿Borrar el gasto «" + (c ? c.name : "") + "»?")) return;
  btn.disabled = true;
  try { await rpc("admin_fin_cost_delete", { p_id: Number(btn.dataset.id) }); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  closeDrawer(); toast("Gasto borrado"); reloadFin();
}
async function finTodo(mode, id, label, btn){
  if (btn) btn.disabled = true;
  try { await rpc("admin_fin_todo", { p_mode: mode, p_id: id, p_label: label }); } catch (e) { if (btn) btn.disabled = false; return toast(errMsg(e)); }
  reloadFin();
}

// ---------- Mensajes (contacto@gize.ar) ----------
// Los mails que llegan a contacto@gize.ar (supabase/functions/contacto). Se responden desde
// acá: la respuesta sale de contacto@gize.ar, así nadie ve el mail personal de quien contesta.
async function loadContacto(){
  page("Mensajes", "Lo que llega a <b>contacto@gize.ar</b>. Las respuestas salen desde esa dirección.", `
    <div class="seg">${[["nuevos", "Sin leer"], ["leidos", "Leídos"], ["todos", "Todos"]].map(([k, l]) => `<button class="${S.msgTab === k ? "on" : ""}" data-a="mtab" data-v="${k}">${l}</button>`).join("")}</div>
    <div id="mList" class="empty">Cargando…</div>`);
  const box = document.getElementById("mList");
  try { S.msgs = await rpc("admin_contact_list", { kind: S.msgTab, lim: 200 }); } catch (e) { box.textContent = errMsg(e); return; }
  paintMsgs();
  try { setUnread(await rpc("admin_contact_unread")); } catch (e) {}
}
function paintMsgs(){
  const box = document.getElementById("mList"); if (!box) return;
  if (!S.msgs.length){ box.className = "empty"; box.textContent = S.msgTab === "nuevos" ? "No hay mensajes sin leer. 🎉" : "Todavía no hay mensajes."; return; }
  // Cada mensaje es una fila plegada (de quién, asunto, fecha y el principio del texto); se abre
  // tocándola. Lo abierto se recuerda mientras no se recargue la página.
  S.msgOpen = S.msgOpen || {};
  box.className = "msgs";
  box.innerHTML = S.msgs.map(m => `<details class="pnl msg${m.read_at ? "" : " unread"}" data-msg="${esc(m.id)}"${S.msgOpen[m.id] || S.drafts[m.id] != null ? " open" : ""}>
      <summary><span class="msg-from">${m.read_at ? "" : '<i class="dot" aria-label="Sin leer"></i>'}${esc(m.from_name || m.from_email)}</span>
        <span class="msg-sum"><b>${esc(m.subject || "(sin asunto)")}</b> <span class="muted">${esc((m.body || "").replace(/\s+/g, " ").slice(0, 140))}</span></span>
        ${m.auth_dmarc === "pass" || m.body_missing ? "" : '<span class="pill warn" title="Remitente sin verificar">⚠</span>'}${m.replied_at ? '<span class="pill ok">Respondido</span>' : ""}<span class="muted small msg-d">${fmtDT(m.created_at)}</span></summary>
      <div class="pnl-b">
      ${m.from_name ? `<div class="muted small">${esc(m.from_email)}</div>` : ""}
      ${m.auth_dmarc === "pass" || m.body_missing ? "" : '<div class="msg-warn">⚠ Remitente sin verificar: puede ser otra persona haciéndose pasar por esta dirección. No borres cuentas ni des datos por un mail así; pedí que lo confirme desde la app.</div>'}
      <div class="msg-s">${esc(m.subject || "(sin asunto)")}${m.to_email && m.to_email !== "contacto@gize.ar" ? ` <span class="pill">${esc(m.to_email)}</span>` : ""}${m.reply_to ? ` <span class="pill blue">responder a ${esc(m.reply_to)}</span>` : ""}${m.attachments ? ` <span class="pill">${m.attachments} adjunto${m.attachments === 1 ? "" : "s"}</span>` : ""}${m.replied_at ? ' <span class="pill ok">Respondido</span>' : ""}</div>
      <div class="msg-b">${m.body_missing ? '<span class="muted">Todavía no se pudo leer el texto de este mail (se vuelve a intentar solo).</span>' : esc(m.body || "(vacío)")}</div>
      ${m.replied_at ? `<div class="msg-r"><div class="muted small">Respuesta de ${esc(m.replied_by_name || "un administrador")} · ${fmtDT(m.replied_at)}</div>${esc(m.reply || "")}</div>` : ""}
      <div class="msg-reply" hidden><textarea class="in" maxlength="10000" placeholder="Escribí la respuesta. Le llega desde contacto@gize.ar, con el mensaje original citado abajo."></textarea>
        <div class="row-btns"><button class="btn" data-a="mcancel">Cancelar</button><button class="btn pri" data-a="msend">Enviar respuesta</button></div></div>
      <div class="row-btns msg-acts"><button class="btn blue" data-a="mreply">${m.replied_at ? "Responder otra vez" : "Responder"}</button>
        <button class="btn" data-a="mread" data-v="${m.read_at ? "0" : "1"}">${m.read_at ? "Marcar sin leer" : "Marcar como leído"}</button></div>
    </div></details>`).join("");
  // Las respuestas a medio escribir vuelven a su lugar (la lista se redibuja entera).
  Object.keys(S.drafts).forEach(id => {
    const c = box.querySelector(`[data-msg="${id}"]`); if (!c) return;
    c.querySelector(".msg-reply").hidden = false; c.querySelector(".msg-acts").hidden = true;
    c.querySelector(".msg-reply textarea").value = S.drafts[id];
  });
}
async function markMsg(btn){
  const c = btn.closest("[data-msg]"), id = Number(c.dataset.msg), leido = btn.dataset.v === "1";
  btn.disabled = true;
  try { await rpc("admin_contact_mark", { mid: id, leido }); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  const m = S.msgs.find(x => x.id === id);
  if (m) m.read_at = leido ? new Date().toISOString() : null;
  if ((S.msgTab === "nuevos" && leido) || (S.msgTab === "leidos" && !leido)) S.msgs = S.msgs.filter(x => x.id !== id);
  paintMsgs(); setUnread(Math.max(0, S.unread + (leido ? -1 : 1)));
}
async function sendReply(btn){
  const c = btn.closest("[data-msg]"), id = Number(c.dataset.msg), t = c.querySelector(".msg-reply textarea"), text = t.value.trim();
  const m = S.msgs.find(x => x.id === id);
  if (text.length < 2) return toast("Escribí la respuesta.");
  if (!await confirmar("¿Mandar la respuesta a " + (m ? (m.reply_to || m.from_email) : "esta persona") + "?")) return;
  btn.disabled = true; S.sending = true;
  try { await fn({ action: "responder", message_id: id, text }); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  finally { S.sending = false; }
  delete S.drafts[id];
  toast("Respuesta enviada ✓");
  if (m){ const was = !m.read_at; m.replied_at = new Date().toISOString(); m.reply = text; m.replied_by_name = "vos"; m.read_at = m.read_at || m.replied_at; if (was) setUnread(Math.max(0, S.unread - 1)); }
  if (S.msgTab === "nuevos") S.msgs = S.msgs.filter(x => x.id !== id);
  paintMsgs();
}

// ---------- Reportes (chat y grupos de pasos) ----------
// Lo que la gente reporta desde la app (app/ui/reportar.js, supabase/reportes.sql): un mensaje
// del chat con su coach o el nombre de alguien de un grupo de pasos. Cada uno con lo justo para
// decidir: el texto del mensaje (de un audio, solo cuánto dura), o el nombre y el grupo. Si hay
// que actuar, «Ver cuenta» abre la ficha (desvincular, eliminar la cuenta). Si quien reportó también
// bloqueó a esa persona (supabase/bloqueos.sql), el reporte lo dice.
const REP_MOTIVO = { ofensivo: ["Ofensivo o acoso", "bad"], spam: ["Spam", "warn"], otro: ["Otro", ""] };
async function loadReportes(){
  page("Reportes", "Lo que la gente reporta en el chat con su coach y en los grupos de pasos. Revisalo dentro de las 24 horas: es lo que piden Apple y Google.", `
    <div class="seg">${[["nuevo", "Sin revisar"], ["revisado", "Revisados"]].map(([k, l]) => `<button class="${S.repTab === k ? "on" : ""}" data-a="rtab" data-v="${k}">${l}</button>`).join("")}</div>
    <div id="rList" class="empty">Cargando…</div>`);
  const box = document.getElementById("rList");
  try { S.reps = (await rpc("admin_reports_list", { p_status: S.repTab })) || []; }
  catch (e) {
    const falta = /admin_reports_list|schema cache|PGRST202/i.test(errMsg(e) + " " + (e && e.code));
    box.className = "calm"; box.innerHTML = falta ? "Falta preparar la base: en GitHub, Actions → <b>Supabase</b> → Run workflow → tarea <b>sql</b>, archivo <b>supabase/reportes.sql</b>." : esc(errMsg(e));
    return;
  }
  // Quién además bloqueó: si falta bloqueos.sql en la base, la lista se ve igual, sin la marca.
  try {
    const ids = S.reps.map(r => r.id), b = ids.length ? await rpc("admin_reports_blocked", { p_ids: ids }) : [];
    const si = new Set((b || []).map(x => (x && x.id) || x));
    S.reps.forEach(r => { r.blocked = si.has(r.id); });
  } catch (e) {}
  paintReps();
  if (S.repTab === "nuevo") setRep(S.reps.length);
}
function repCtx(r){
  if (r.kind === "chat"){
    if (!r.msg_at) return '<div class="muted">El mensaje ya no existe (se borró una de las cuentas).</div>';
    const txt = r.msg_audio_secs ? `<span class="muted">Mensaje de voz de ${Math.floor(r.msg_audio_secs / 60)}:${String(r.msg_audio_secs % 60).padStart(2, "0")} (el audio no se muestra)</span>${r.msg_body ? "<br>" + esc(r.msg_body) : ""}` : esc(r.msg_body || "");
    return `<div class="rep-q msg-b">${txt}</div><div class="muted small">Mensaje del ${fmtDT(r.msg_at)}</div>`;
  }
  const ahora = r.member_name_now == null ? " · ya no está en el grupo" : r.member_name_now !== r.member_name ? " · ahora se llama «" + esc(r.member_name_now) + "»" : "";
  return `<div class="rep-q">Nombre en el grupo: <b>«${esc(r.member_name || "")}»</b><span class="muted">${ahora}</span></div><div class="muted small">Grupo «${esc(r.group_name || "borrado")}»</div>`;
}
function paintReps(){
  const box = document.getElementById("rList"); if (!box) return;
  if (!S.reps.length){ box.className = "empty"; box.textContent = S.repTab === "nuevo" ? "No hay reportes sin revisar. 🎉" : "Todavía no hay reportes revisados."; return; }
  box.className = "grid";
  box.innerHTML = S.reps.map(r => { const mo = REP_MOTIVO[r.reason] || [r.reason, ""];
    return `<div class="card rep" data-rep="${esc(r.id)}">
      <div class="rep-h"><span class="pill ${mo[1]}">${esc(mo[0])}</span><span class="pill">${r.kind === "chat" ? "Chat" : "Grupo de pasos"}</span>${r.blocked ? '<span class="pill warn">También lo bloqueó</span>' : ""}<span class="muted small">${ago(r.created_at)}</span></div>
      ${repCtx(r)}
      ${r.detail ? `<div class="rep-note"><span class="muted small">Nota de quien reportó</span><br>${esc(r.detail)}</div>` : ""}
      <div class="muted small rep-who">Reportó ${esc(r.reporter_name || (r.reporter_id ? "Sin nombre" : "una cuenta borrada"))} · Reportado: <b>${esc(r.reported_name || "Sin nombre")}</b>${num(r.reported_total) > 1 ? ` · <span class="t-warn">${n0(r.reported_total)} reportes en total</span>` : ""}</div>
      ${r.status === "revisado" ? `<div class="muted small rep-who">Revisado por ${esc(r.reviewed_by_name || "un administrador")} · ${fmtDT(r.reviewed_at)}</div>` : ""}
      <div class="row-btns">${r.reported_id ? `<button class="btn" data-a="repUser" data-id="${esc(r.reported_id)}">Ver cuenta</button>` : ""}${r.status === "revisado" ? "" : `<button class="btn pri" data-a="repReview">Marcar revisado</button>`}</div>
    </div>`; }).join("");
}
async function reviewRep(btn){
  const id = btn.closest("[data-rep]").dataset.rep;
  btn.disabled = true;
  try { await rpc("admin_report_review", { p_id: id }); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  toast("Marcado como revisado ✓");
  S.reps = S.reps.filter(x => x.id !== id);
  paintReps(); setRep(Math.max(0, S.repPend - 1));
}

// ---------- Productos ----------
// Pendientes / reportados / ocultos: lo que falta revisar. «Toda la base»: buscar cualquier
// producto (nombre, marca o código), editarlo, ocultarlo o borrarlo. «+ Agregar producto»:
// cargar uno nuevo, que queda de GIZE y verificado (supabase/productos-admin.sql).
const PTABS = [["pedidos", "Pedidos"], ["pendientes", "Pendientes"], ["reportados", "Reportados"], ["ocultos", "Ocultos"], ["todos", "Toda la base"]];
const prodTop = () => `<div class="prod-top"><div class="seg">${PTABS.map(([k, l]) => `<button class="${S.prodTab === k ? "on" : ""}" data-a="ptab" data-v="${k}">${l}</button>`).join("")}</div>
      <button class="btn pri" data-a="padd">+ Agregar producto</button></div>
    <div id="pAdd"></div>`;
async function loadProductos(){
  if (S.prodTab === "pedidos") return loadPedidos();
  const all = S.prodTab === "todos";
  page("Productos", all ? "Buscá un producto para corregirlo, ocultarlo o borrarlo. Valores cada 100 g o ml."
      : "Lo que cargan los usuarios al escanear. Compará con la foto, corregí y verificá.", `
    ${prodTop()}
    ${all ? `<div class="prod-q"><input class="in" id="pQ" type="search" placeholder="Buscar por nombre, marca o código de barras" value="${esc(S.prodQ || "")}" autocomplete="off"><button class="btn" data-a="pfind">Buscar</button></div>` : ""}
    <div id="pList" class="empty">Cargando…</div>`);
  if (S.prodAdding) paintAdd();
  const box = document.getElementById("pList");
  try { S.prods = all ? await rpc("admin_products_search", { q: S.prodQ || "", lim: 60 }) : await rpc("admin_products", { kind: S.prodTab }); }
  catch (e) { box.textContent = errMsg(e); return; }
  paintProds();
  const paths = S.prods.map(p => p.photo_path).filter(x => x && !S.urls[x]);
  if (paths.length){ try { const r = await sb.storage.from("productos").createSignedUrls(paths, 3600); (r.data || []).forEach(x => { if (x.signedUrl) S.urls[x.path] = x.signedUrl; }); } catch (e) {} paintProds(); }
  try { pendTotal(await rpc("admin_overview")); } catch (e) {}
}
const SRC = { off: "Open Food Facts", gize: "GIZE", user: "cargado por un usuario" };
function paintProds(){
  const box = document.getElementById("pList"); if (!box) return;
  const all = S.prodTab === "todos";
  if (!S.prods.length){ box.className = "empty"; box.textContent = all ? (S.prodQ ? "No hay productos con «" + S.prodQ + "»." : "La base está vacía.") : "No hay nada para revisar acá."; return; }
  box.className = "grid";
  box.innerHTML = (all ? `<div class="muted small">${S.prods.length === 60 ? "Los primeros 60 resultados: escribí más para achicar la búsqueda." : S.prods.length + " producto" + (S.prods.length === 1 ? "" : "s")}</div>` : "") + S.prods.map(p => {
    const u = S.urls[p.photo_path];
    const ph = p.photo_path ? (u ? `<button class="prod-ph" data-a="zoom" data-url="${esc(u)}"><img src="${esc(u)}" alt="Tabla nutricional"></button>` : '<div class="prod-ph none">Cargando foto…</div>') : `<div class="prod-ph none">Sin foto${p.source === "off" ? "<br>(Open Food Facts)" : ""}</div>`;
    const inp = (k, v, l, w) => `<label class="${w || ""}">${l}<input data-k="${k}" value="${esc(v == null ? "" : v)}"></label>`;
    const tags = (p.verified ? '<span class="ptag ok">✓ Verificado</span>' : "") + (p.hidden ? '<span class="ptag off">Oculto</span>' : "");
    const btns = all
      ? `<button class="btn bad" data-a="pdel">Borrar</button>${p.hidden ? `<button class="btn" data-a="psave" data-mode="show">Volver a mostrar</button>` : `<button class="btn" data-a="psave" data-mode="hide">Ocultar</button>`}<button class="btn pri" data-a="psave" data-mode="keep">Guardar cambios</button>`
      : (p.hidden ? `<button class="btn" data-a="psave" data-verify="0" data-hide="0">Volver a mostrar</button><button class="btn pri" data-a="psave" data-verify="1" data-hide="0">Corregir y verificar</button>`
        : `<button class="btn bad" data-a="psave" data-verify="0" data-hide="1">Ocultar</button><button class="btn pri" data-a="psave" data-verify="1" data-hide="0">✓ Verificar</button>`);
    return `<div class="card" data-prod="${esc(p.id)}"><div class="prod">${ph}<div>
      <b>${esc(p.code || "sin código")}</b> <span class="muted small">· ${esc(SRC[p.source] || p.source)} · ${n0(p.uses)} usos · ${fmtD(p.created_at)}</span> ${tags}
      ${p.reports ? `<div class="small" style="color:var(--warn);margin-top:4px">⚠ ${p.reports} reporte${p.reports === 1 ? "" : "s"}${p.reasons ? ": " + esc(p.reasons) : ""}</div>` : ""}
      <div class="muted small" style="margin-top:4px">Calorías según los macros: ${Math.round(num(p.protein) * 4 + num(p.carbs) * 4 + num(p.fat) * 9)} · valores cada 100 ${p.unit === "ml" ? "ml" : "g"}</div>
      <div class="pgrid">${inp("name", p.name, "Nombre", "wide")}${inp("brand", p.brand, "Marca", "wide")}${inp("kcal", p.kcal, "Kcal")}${inp("protein", p.protein, "Proteína")}${inp("carbs", p.carbs, "Carbos")}${inp("fat", p.fat, "Grasas")}</div>
      <div class="row-btns">${btns}</div>
    </div></div></div>`;
  }).join("");
}
// Valores del formulario de un producto (cada 100 g o ml), con los mismos topes que la base.
function prodValues(c){
  const v = k => { const i = c.querySelector(`[data-k="${k}"]`); return i ? i.value.trim() : ""; };
  const row = { p_name: v("name"), p_brand: v("brand") || null, p_kcal: num(v("kcal")), p_protein: num(v("protein")), p_carbs: num(v("carbs")), p_fat: num(v("fat")) };
  if (row.p_name.length < 2) return toast("Poné el nombre del producto."), null;
  if (row.p_name.length > 120 || (row.p_brand || "").length > 60) return toast("El nombre o la marca son demasiado largos."), null;
  if (row.p_kcal > 950 || row.p_protein > 100 || row.p_carbs > 100 || row.p_fat > 100 || row.p_protein + row.p_carbs + row.p_fat > 105) return toast("Revisá los valores: son cada 100 g o ml."), null;
  return row;
}
async function saveProd(btn){
  const c = btn.closest("[data-prod]");
  const p = S.prods.find(x => x.id === c.dataset.prod); if (!p) return;
  const row = prodValues(c); if (!row) return;
  const mode = btn.dataset.mode; // «Toda la base»: keep / hide / show (la verificación no cambia)
  const verified = mode ? p.verified : btn.dataset.verify === "1", hidden = mode ? (mode === "keep" ? p.hidden : mode === "hide") : btn.dataset.hide === "1";
  if (mode === "hide" && !await confirmar("¿Ocultar «" + row.p_name + "»? Deja de aparecer en la app (lo podés volver a mostrar).")) return;
  btn.disabled = true;
  try { await rpc("admin_product_save", Object.assign({ pid: p.id, p_unit: p.unit, p_verified: verified, p_hidden: hidden }, row)); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  // Guardar uno visible y verificado (o volver a mostrarlo) borra sus reportes en la base (admin_product_save, supabase/admin.sql).
  if (mode){ Object.assign(p, { name: row.p_name, brand: row.p_brand, kcal: row.p_kcal, protein: row.p_protein, carbs: row.p_carbs, fat: row.p_fat, hidden }); if (!hidden && (mode === "show" || verified)){ p.reports = 0; p.reasons = null; } }
  else S.prods = S.prods.filter(x => x.id !== p.id);
  paintProds();
  toast(mode === "keep" ? "Cambios guardados ✓" : hidden ? "Producto oculto" : (mode === "show" || !verified) ? "Producto visible otra vez" : "Producto verificado ✓");
}
async function deleteProd(btn){
  const c = btn.closest("[data-prod]"), p = S.prods.find(x => x.id === c.dataset.prod); if (!p) return;
  if (!await confirmar("¿Borrar «" + p.name + "»" + (p.code ? " (" + p.code + ")" : "") + " de la base? Desaparece de la app para todos y no se puede deshacer." + (p.code ? " El código no se vuelve a cargar solo (ni al escanearlo ni con las importaciones): para volver a tenerlo, «Agregar producto» o publicar un pedido con ese código." : "") + "\n\nLo que la gente ya anotó en su diario no cambia.")) return;
  btn.disabled = true;
  try { await rpc("admin_product_delete", { pid: p.id }); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  S.prods = S.prods.filter(x => x.id !== p.id); paintProds(); toast("Producto borrado");
}
// Pedidos (supabase/pedidos-productos.sql): productos que la gente no encontró. Mandan la foto
// de la tabla (y la del frente), el nombre y la marca; acá se cargan los valores y se publica
// (queda de GIZE y verificado). A quien lo pidió la app le avisa al entrar.
async function loadPedidos(){
  const pend = S.reqKind !== "resueltos";
  page("Productos", "Productos que la gente no encontró. Cargá los valores de la foto y publicalo: queda verificado y le avisamos a quien lo pidió.", `
    ${prodTop()}
    <div class="seg" style="margin-bottom:12px">${[["pendientes", "Por cargar"], ["resueltos", "Resueltos"]].map(([k, l]) => `<button class="${(pend ? "pendientes" : "resueltos") === k ? "on" : ""}" data-a="rqKind" data-v="${k}">${l}</button>`).join("")}</div>
    <div id="pList" class="empty">Cargando…</div>`);
  if (S.prodAdding) paintAdd();
  const box = document.getElementById("pList");
  // Con los pedidos, el estado de la IA (supabase/ia.sql): si no está, no hay «Leer con IA».
  let reqs;
  try { [reqs, S.ia] = await Promise.all([rpc("admin_requests", { kind: pend ? "pendientes" : "resueltos" }), pend ? rpc("admin_ia_estado").catch(() => null) : S.ia]); }
  catch (e) { box.textContent = errMsg(e); return; }
  S.reqs = reqs;
  paintReqs();
  // Con la IA prendida, los nombres de los modelos (para «Hecho con …» en los pedidos ya leídos).
  if (pend && S.ia && S.ia.activa && !(S.iaFn && S.iaFn.ok)){ const f = await iaInvoke({ modo: "estado" }); if (f && f.ok){ S.iaFn = f; iaNotas(); } }
  const paths = [].concat(...S.reqs.map(r => [r.label_path, r.front_path])).filter(x => x && !S.urls[x]);
  // Las fotos se ponen en su lugar, sin rehacer las tarjetas (no se pierde el foco de lo que se está escribiendo).
  if (paths.length){ try { const r = await sb.storage.from("productos").createSignedUrls(paths, 3600); (r.data || []).forEach(x => { if (x.signedUrl) S.urls[x.path] = x.signedUrl; }); } catch (e) {} paintFotos(); }
  try { pendTotal(await rpc("admin_overview")); } catch (e) {}
}
const fotoReq = (path, alt) => !path ? "" : S.urls[path] ? `<button class="prod-ph" data-a="zoom" data-url="${esc(S.urls[path])}"><img src="${esc(S.urls[path])}" alt="${alt}"></button>` : `<div class="prod-ph none" data-ph="${esc(path)}" data-alt="${alt}">Cargando foto…</div>`;
function paintFotos(){
  document.querySelectorAll("#pList .prod-ph.none[data-ph]").forEach(d => { if (S.urls[d.dataset.ph]) d.outerHTML = fotoReq(d.dataset.ph, d.dataset.alt); });
}
// Lo que el administrador escribió en cada pedido (por id), para que no se pierda si la lista se
// vuelve a dibujar (al publicar o rechazar otro, al volver a Pedidos) ni lo pise la IA.
const reqDraft = id => (S.reqForm[id] = S.reqForm[id] || {});
function paintReqs(){
  const box = document.getElementById("pList"); if (!box || S.prodTab !== "pedidos") return;
  const pend = S.reqKind !== "resueltos";
  if (!S.reqs.length){ box.className = "empty"; box.textContent = pend ? "No hay pedidos para cargar." : "Todavía no hay pedidos resueltos."; return; }
  box.className = "grid";
  const ph = fotoReq;
  let d = {};
  const inp = (k, v, l, w, im) => { if (k in d) v = d[k]; return `<label class="${w || ""}">${l}<input data-k="${k}" value="${esc(v == null ? "" : v)}"${im ? ` inputmode="${im}"` : ""}></label>`; };
  box.innerHTML = S.reqs.map(r => {
    d = pend ? (S.reqForm[r.id] || {}) : {};
    const who = `<span class="muted small">· pidió ${esc(r.user_name || r.user_email || "una cuenta borrada")} · ${fmtD(r.created_at)}</span>`;
    const phs = `<div class="rq-phs">${ph(r.label_path, "Tabla nutricional")}${ph(r.front_path, "Frente del paquete")}</div>`;
    if (!pend) return `<div class="card"><div class="prod">${phs}<div>
      <b>${esc(r.name)}</b>${r.brand ? " · " + esc(r.brand) : ""} ${who}
      <div style="margin-top:6px">${r.status === "cargado" ? '<span class="ptag ok">✓ Publicado</span>' : '<span class="ptag off">Rechazado</span>'} <span class="muted small">${fmtD(r.done_at)}</span></div>
      ${r.note ? `<div class="muted small" style="margin-top:4px">Motivo: ${esc(r.note)}</div>` : ""}</div></div></div>`;
    const ia = iaPedido(r), leyendo = S.iaLeyendo.has(String(r.id));
    // La nota de la IA va debajo de los campos y el estado («Leyendo…», los errores), debajo de los
    // botones: así, mientras lee o cuando termina, ni el formulario ni los botones se corren.
    return `<div class="card" data-req="${esc(r.id)}"><div class="prod">${phs}<div>
      <b>${esc(r.name)}</b>${r.brand ? " · " + esc(r.brand) : ""} ${who}
      ${r.existing_id ? `<div class="small" style="color:var(--warn);margin-top:4px">Ya hay un producto con este código: «${esc(r.existing_name)}». Al publicar se corrige ese y queda verificado.</div>` : ""}
      <div class="muted small" style="margin-top:4px">Valores cada 100 g (o 100 ml si es líquido), como en la tabla. Si la tabla es por porción, dividí por la porción y multiplicá por 100.</div>
      <div class="pgrid">${inp("name", r.name, "Nombre", "wide")}${inp("brand", r.brand, "Marca", "wide")}${inp("kcal", "", "Kcal", "", "decimal")}${inp("protein", "", "Proteína", "", "decimal")}${inp("carbs", "", "Carbos", "", "decimal")}${inp("fat", "", "Grasas", "", "decimal")}
        ${inp("code", r.code, "Código de barras (opcional)", "wide", "numeric")}${inp("portion", "", "Porción (opcional)", "", "decimal")}
        <label>Unidad<select data-k="unit"><option value="g">g (sólido)</option><option value="ml"${d.unit === "ml" ? " selected" : ""}>ml (líquido)</option></select></label></div>
      ${ia === "vieja" ? '<div class="ia-note muted small">Este pedido llegó antes del cambio de la política: cargalo a mano.</div>' : '<div class="ia-note" tabindex="-1" hidden></div>'}
      <div class="row-btns">${ia === "leer" ? iaBoton(leyendo) : r.ai_at ? IA_HECHO : ""}<button class="btn bad" data-a="rqReject">Rechazar</button><button class="btn pri" data-a="rqPublish">Publicar producto</button></div>
      <div class="ia-st small${leyendo ? " muted" : ""}" role="status" aria-live="polite">${leyendo ? "Leyendo la tabla con IA…" : ""}</div>
    </div></div></div>`;
  }).join("");
  // Lo que ya leyó la IA (en esta sesión o antes) completa la tarjeta, sin pisar lo que haya
  // escrito el administrador.
  if (pend) S.reqs.forEach(r => { if (r.ai_at) iaFill(reqCard(r.id), r); });
}
const reqCard = id => document.querySelector(`#pList [data-req="${CSS.escape(String(id))}"]`);
async function publishReq(btn){
  const c = btn.closest("[data-req]"), r = S.reqs.find(x => String(x.id) === c.dataset.req); if (!r) return;
  const row = prodValues(c); if (!row) return;
  const kcal = c.querySelector('[data-k="kcal"]').value.trim();
  if (!kcal) return toast("Cargá al menos las calorías.");
  const code = c.querySelector('[data-k="code"]').value.replace(/\s/g, ""), portion = num(c.querySelector('[data-k="portion"]').value);
  if (code && !/^[0-9]{6,14}$/.test(code)) return toast("El código de barras tiene que ser de 6 a 14 números (o dejalo vacío).");
  if (portion && (portion < 1 || portion > 2000)) return toast("La porción tiene que ser entre 1 y 2000.");
  const calc = row.p_protein * 4 + row.p_carbs * 4 + row.p_fat * 9;
  if (Math.abs(row.p_kcal - calc) > Math.max(30, calc * 0.25) && !await confirmar("Las calorías (" + row.p_kcal + ") no coinciden con los macros (darían unas " + Math.round(calc) + "). ¿Publicar igual?")) return;
  btn.disabled = true;
  try { await rpc("admin_request_publish", Object.assign({ rid: r.id, p_code: code || null, p_unit: c.querySelector('[data-k="unit"]').value, p_portion: portion || null }, row)); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  S.reqs = S.reqs.filter(x => x.id !== r.id); delete S.reqForm[r.id]; paintReqs(); toast("Publicado ✓ Le avisamos a quien lo pidió.");
  try { pendTotal(await rpc("admin_overview")); } catch (e) {}
}
async function rejectReq(btn){
  const c = btn.closest("[data-req]"), r = S.reqs.find(x => String(x.id) === c.dataset.req); if (!r) return;
  const why = await pedir("¿Por qué lo rechazás? Se lo mostramos a quien lo pidió (ej: la foto de la tabla no se lee, falta la tabla).", "La foto de la tabla no se lee bien", { titulo: "Rechazar producto", ok: "Rechazar" });
  if (why === null) return;
  btn.disabled = true;
  try { await rpc("admin_request_reject", { rid: r.id, p_note: why.trim() }); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  S.reqs = S.reqs.filter(x => x.id !== r.id); delete S.reqForm[r.id]; paintReqs(); toast("Pedido rechazado");
  try { pendTotal(await rpc("admin_overview")); } catch (e) {}
}

// «+ Agregar producto»: formulario arriba de la lista.
function paintAdd(){
  const box = document.getElementById("pAdd"); if (!box) return;
  if (!S.prodAdding){ box.innerHTML = ""; return; }
  const inp = (k, l, w, ph, im) => `<label class="${w || ""}">${l}<input data-k="${k}" placeholder="${ph || ""}"${im ? ` inputmode="${im}"` : ""}></label>`;
  box.innerHTML = `<div class="card padd" data-new="1"><div class="sec-t">Producto nuevo</div>
    <div class="muted small">Queda en la base como de GIZE y verificado, y aparece en la app para todos. Valores cada 100 g (o 100 ml si es líquido).</div>
    <div class="pgrid">${inp("name", "Nombre", "wide", "Ej: Pan lactal blanco")}${inp("brand", "Marca", "wide", "Ej: Fargo")}${inp("kcal", "Kcal", "", "", "decimal")}${inp("protein", "Proteína", "", "", "decimal")}${inp("carbs", "Carbos", "", "", "decimal")}${inp("fat", "Grasas", "", "", "decimal")}
      ${inp("code", "Código de barras (opcional)", "wide", "Ej: 7790000000000", "numeric")}${inp("portion", "Porción (opcional)", "", "Ej: 25", "decimal")}
      <label>Unidad<select data-k="unit"><option value="g">g (sólido)</option><option value="ml">ml (líquido)</option></select></label></div>
    <div class="row-btns"><button class="btn" data-a="paddCancel">Cancelar</button><button class="btn pri" data-a="paddSave">Agregar a la base</button></div></div>`;
  const f = box.querySelector('[data-k="name"]'); if (f) f.focus();
}
async function addProd(btn){
  const c = btn.closest("[data-new]"); const row = prodValues(c); if (!row) return;
  const code = c.querySelector('[data-k="code"]').value.replace(/\s/g, ""), portion = num(c.querySelector('[data-k="portion"]').value);
  if (code && !/^[0-9]{6,14}$/.test(code)) return toast("El código de barras tiene que ser de 6 a 14 números (o dejalo vacío).");
  if (portion && (portion < 1 || portion > 2000)) return toast("La porción tiene que ser entre 1 y 2000.");
  btn.disabled = true;
  try { await rpc("admin_product_add", Object.assign({ p_code: code || null, p_unit: c.querySelector('[data-k="unit"]').value, p_portion: portion || null }, row)); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  S.prodAdding = false; toast("Producto agregado ✓");
  S.prodTab = "todos"; S.prodQ = row.p_name; loadProductos();
}

// ---------- IA ----------
// «Leer con IA» en Pedidos y la página IA (supabase/ia.sql y la función «ia»). La IA solo completa
// el formulario: el administrador mira la foto, corrige y publica como siempre. Arranca apagada.
const IA_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".7"/></svg>';
// Montos en dólares: los de menos de un dólar con hasta 4 decimales (una tabla cuesta centésimas de centavo).
const usd = v => "US$ " + (Number(v) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: Number(v) > 0 && Number(v) < 1 ? 4 : 2 });
// Fechas de los ciclos y de los cortes del mes: son las 00:00 UTC de ese día (las de la Console);
// en hora de Argentina caerían el día anterior.
const fmtDU = d => d ? new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : "—";
const IA_NOMBRE = { kcal: "calorías", proteinas: "proteínas", carbohidratos: "carbos", grasas: "grasas", porcion: "porción", protein: "proteína", carbs: "carbos", fat: "grasas", portion: "porción", unit: "unidad" };
// ¿Qué va en la tarjeta de un pedido? "leer" (botón), "vieja" (llegó antes del cambio de la
// política) o nada (IA apagada, ya leído, sin la base de la IA o sin la fecha de la política: eso
// lo avisa la página IA).
function iaPedido(r){
  const ia = S.ia;
  if (!ia || !ia.activa || !ia.funciones || !ia.funciones.etiqueta_admin || r.ai_at) return "";
  const desde = ia.pedidos_desde ? Date.parse(ia.pedidos_desde) : NaN;
  if (!desde) return "";
  return Date.parse(r.created_at) >= desde ? "leer" : "vieja";
}
// El botón, y lo que queda en su lugar cuando ya se leyó (del mismo ancho: «Rechazar» no se corre
// abajo del dedo). Mientras lee no se deshabilita (así no pierde el foco): un segundo toque no hace nada.
const iaBoton = leyendo => `<button class="btn ia-btn" data-a="rqIA"${leyendo ? ' aria-disabled="true" aria-busy="true"' : ""}>${IA_ICON}${leyendo ? "Leyendo…" : "Leer con IA"}</button>`;
const IA_HECHO = `<span class="btn ia-btn ia-hecho">${IA_ICON}Leído</span>`;
// Completa el formulario con lo que leyó la IA y lo marca («Leído con IA», y los dudosos aparte).
// Nunca pisa lo que escribió el administrador: esos campos quedan como están. Con nuevo = true
// (recién leído) los que no tocó la IA por eso se anotan para avisarlo en la nota.
function iaFill(c, r, nuevo){
  if (!c) return;
  const note = c.querySelector(".ia-note"); if (!note) return;
  const d = reqDraft(c.dataset.req), saltados = [];
  if (r.ai_encontrada !== false){
    const dud = r.ai_dudosos || [];
    const marcar = (el, campo) => { const l = el.closest("label"); if (!l) return; l.classList.add("ia"); l.title = "Leído con IA"; if (campo && dud.includes(campo)) { l.classList.add("dudoso"); l.title = "Leído con IA: no se leía bien, revisalo"; } };
    const set = (k, v, campo) => {
      const i = c.querySelector(`[data-k="${k}"]`); if (!i || v == null) return;
      const val = k === "unit" ? (v === "ml" ? "ml" : "g") : String(v);
      // Lo que escribió (o borró) el administrador queda; al leer recién, un campo vacío sí se completa.
      if (k in d && (!nuevo || String(d[k]).trim() !== "")){ if (nuevo && (k === "unit" ? d[k] !== val : num(d[k]) !== num(val))) saltados.push(k); return; }
      delete d[k]; i.value = val; marcar(i, campo);
    };
    if (!r.ai_por_porcion){ set("kcal", r.ai_kcal, "kcal"); set("protein", r.ai_protein, "proteinas"); set("carbs", r.ai_carbs, "carbohidratos"); set("fat", r.ai_fat, "grasas"); }
    set("portion", r.ai_portion, "porcion");
    set("unit", r.ai_unit);
  }
  if (nuevo) d._saltados = saltados;
  iaNota(c, r);
}
// La nota debajo de los campos: qué hizo la IA y qué conviene mirar.
function iaNota(c, r){
  const note = c && c.querySelector(".ia-note"); if (!note) return;
  note.hidden = false; note.className = "ia-note";
  const chip = '<span class="chip-ia">' + IA_ICON + 'Leído con IA · revisalo</span>';
  if (r.ai_encontrada === false){
    note.innerHTML = chip + ' <span class="t-warn small">No se ve una tabla legible en la foto. Cargala a mano o rechazá el pedido.</span>';
    return;
  }
  const dud = r.ai_dudosos || [], saltados = reqDraft(c.dataset.req)._saltados || [];
  const nombre = r.ai_modelo_nombre || ((S.iaFn && S.iaFn.modelos || []).find(m => m.id === r.ai_modelo) || {}).nombre;
  const n1 = v => v == null ? "—" : String(v).replace(".", ",");
  const lineas = []; // [texto, clase]
  const u100 = r.ai_unit === "ml" ? "ml" : "g";
  if (saltados.length) lineas.push(["No cambié lo que ya habías cargado: " + saltados.map(k => k === "kcal" ? "kcal" : IA_NOMBRE[k] || k).join(", ") + ". Comparalo con la foto.", "ia-warn"]);
  if (r.ai_por_porcion) lineas.push([`La tabla es por porción (kcal ${n1(r.ai_kcal)}, P ${n1(r.ai_protein)}, C ${n1(r.ai_carbs)}, G ${n1(r.ai_fat)}) y no dice el tamaño: completá la porción y pasalo a cada 100.`, "ia-warn"]);
  else if (r.ai_columna === "porcion" && r.ai_portion) lineas.push([`La tabla era por porción (${n1(r.ai_portion)} ${u100}): GIZE la pasó a cada 100 ${u100}.`, "muted"]);
  if (!r.ai_por_porcion && r.ai_kcal != null){
    const calc = Math.round(num(r.ai_protein) * 4 + num(r.ai_carbs) * 4 + num(r.ai_fat) * 9);
    lineas.push(r.ai_revisar ? ["Las calorías no cierran con los macros: revisá" + (calc ? " (darían " + calc + ")." : "."), "ia-warn"] : ["✓ Las calorías cierran con los macros (darían " + calc + ").", "t-ok"]);
  }
  if (dud.length) lineas.push(["No se leía bien: " + dud.map(x => IA_NOMBRE[x] || x).join(", ") + ". Miralo en la foto.", "ia-warn"]);
  note.innerHTML = chip + ' <span class="muted small">' + (nombre ? "Hecho con " + esc(nombre) + ". " : "") + 'Mirá la foto antes de publicar.</span>' +
    lineas.map(([txt, cls]) => `<div class="ia-line small ${cls}">${esc(txt)}</div>`).join("");
}
// Cuando llegan los nombres de los modelos, las notas de los pedidos ya leídos los suman.
function iaNotas(){ (S.reqs || []).forEach(r => { if (r.ai_at) iaNota(reqCard(r.id), r); }); }
// Llama a la función «ia» y devuelve siempre { ok, codigo, mensaje, motivo, vuelve, … }.
async function iaInvoke(body){
  let r;
  try { r = await sb.functions.invoke("ia", { body }); } catch (e) { return { ok: false, codigo: "red" }; }
  if (r.error){
    const ctx = r.error.context; let j = null;
    try { j = ctx && typeof ctx.json === "function" ? await ctx.json() : null; } catch (e) {}
    if (j && j.codigo) return j;
    if (ctx && ctx.status === 404) return { ok: false, codigo: "sin_funcion" };
    return { ok: false, codigo: r.error.name === "FunctionsFetchError" ? "red" : "error", mensaje: j && (j.mensaje || j.error) };
  }
  return r.data && typeof r.data === "object" ? r.data : { ok: false, codigo: "error" };
}
const IA_MSG = {
  sin_sesion: "Iniciá sesión de nuevo para usar la IA.",
  no_habilitado: "Este pedido llegó antes del cambio de la política: cargalo a mano.",
  persona_sin_ia: "Esta persona desactivó la IA: cargalo a mano.",
  ritmo: "Por hoy la IA llegó a su límite. Mañana vuelve. Mientras, cargalo a mano.",
  tope_dia: "Llegaste al límite de tablas con IA de hoy. Mañana se renueva.",
  ocupada: "La IA está con mucha demanda. Probá en un minuto.",
  foto_invalida: "La foto no es válida o es muy grande. Cargalo a mano.",
  no_se_pudo: "No se pudo analizar esta foto. Cargalo a mano.",
  error: "La IA está tardando más de lo normal o falló. Probá de nuevo en un rato.",
  red: "Sin conexión. Revisá internet y probá de nuevo.",
  sin_funcion: "La función «ia» todavía no está publicada en Supabase (workflow «Supabase» → tarea funciones).",
};
const IA_PAUSA = {
  sin_clave: "Falta la clave de la IA (ANTHROPIC_API_KEY). Cargala en GitHub y corré la tarea «secrets» del workflow «Supabase».",
  apagada: "La IA está apagada. Se prende en IA.",
  sin_ciclo: "Falta la fecha en que vencen los créditos: cargala en IA.",
  creditos: "La IA está pausada: se terminaron los créditos. Vuelve sola cuando lleguen los nuevos.",
  clave_rechazada: "La API rechazó la clave de la IA: revisala en la Console de Anthropic.",
  sin_base: "Falta preparar la base: correr supabase/ia.sql con el workflow «Supabase».",
  admin: "La IA está pausada desde el panel.",
};
function iaMsg(r){
  r = r || {};
  const v = r.vuelve ? fmtDU(r.vuelve) : "";
  if (r.codigo === "pausada") return IA_PAUSA[r.motivo] || r.mensaje || "La IA está pausada por ahora. Cargalo a mano.";
  if (r.codigo === "tope_mes") return "La IA de GIZE llegó a su límite de este mes: cargalo a mano." + (v ? " Vuelve el " + v + "." : "");
  if (r.codigo === "tope_persona") return "Llegaste al tope de IA de tu cuenta en este ciclo." + (v ? " Vuelve el " + v + "." : "");
  // «error» y «no_habilitado» cubren varios casos: el texto de la función dice cuál (pedido ya
  // resuelto, que ya no existe, la foto que no se pudo bajar, solo para administradores…).
  if (r.codigo === "error") return r.mensaje || IA_MSG.error;
  if (r.codigo === "no_habilitado" && r.motivo === "solo_admin") return r.mensaje || "Por ahora la lectura con IA es solo para el equipo de GIZE.";
  return IA_MSG[r.codigo] || r.mensaje || IA_MSG.error;
}
async function leerIA(btn){
  const c0 = btn.closest("[data-req]"), id = c0 && c0.dataset.req;
  const r0 = id && S.reqs.find(x => String(x.id) === id); if (!r0) return;
  if (S.iaLeyendo.has(id)) return; // ya está leyendo: un segundo toque no hace otra llamada (que se paga)
  S.iaLeyendo.add(id);
  btn.setAttribute("aria-disabled", "true"); btn.setAttribute("aria-busy", "true"); btn.innerHTML = IA_ICON + "Leyendo…";
  const st0 = c0.querySelector(".ia-st"); if (st0){ st0.className = "ia-st small muted"; st0.textContent = "Leyendo la tabla con IA…"; }
  const res = await iaInvoke({ modo: "etiqueta", pedido: r0.id });
  S.iaLeyendo.delete(id);
  // Mientras leía, la lista se pudo volver a dibujar (se publicó o rechazó otro, llegaron las fotos,
  // se volvió a entrar a Pedidos): la tarjeta y el pedido se buscan de nuevo por id.
  const c = reqCard(id), r = (S.reqs || []).find(x => String(x.id) === id);
  const b = c && c.querySelector('[data-a="rqIA"]'), st = c && c.querySelector(".ia-st");
  const conFoco = b && b === document.activeElement;
  if (!res || res.ok !== true){
    // El error queda solo en la tarjeta (se anuncia: aria-live), al lado del botón, que vuelve a andar.
    const m = iaMsg(res);
    if (b){ b.removeAttribute("aria-disabled"); b.removeAttribute("aria-busy"); b.innerHTML = IA_ICON + "Leer con IA"; }
    if (st){ st.className = "ia-st small t-warn"; st.textContent = m; } else if (r) toast(m);
    return;
  }
  const ai = { ai_at: new Date().toISOString(), ai_encontrada: res.encontrada !== false, ai_kcal: res.kcal ?? null, ai_protein: res.p ?? null, ai_carbs: res.c ?? null,
    ai_fat: res.f ?? null, ai_unit: res.unidad || null, ai_portion: res.porcion ?? null, ai_por_porcion: !!res.por_porcion, ai_revisar: !!res.revisar,
    ai_dudosos: res.dudosos || [], ai_modelo: res.modelo || null, ai_modelo_nombre: res.modelo_nombre || null, ai_columna: res.columna || null };
  Object.assign(r0, ai); if (r && r !== r0) Object.assign(r, ai);
  if (!c){ if (r) toast("«" + r.name + "» quedó leído con IA: lo ves en Pedidos."); return; }
  if (b) b.outerHTML = IA_HECHO;
  if (st){ st.className = "ia-st small"; st.textContent = ""; }
  iaFill(c, r || r0, true);
  // El foco pasa a la nota (dice qué completó y qué mirar), salvo que ya esté en otro lado.
  const note = c.querySelector(".ia-note");
  if (note && (conFoco || document.activeElement === document.body)) note.focus({ preventScroll: true });
  toast(res.encontrada === false ? "No se ve una tabla legible en la foto." : "Listo: revisá los valores con la foto.");
}
// Inicio → «Para atender»: la IA cortada, pasada del aviso o con la clave rechazada.
function iaTodo(){
  const ia = S.iaHome, c = ia && ia.ciclo;
  if (!ia || !ia.activa) return [];
  if (ia.clave_rechazada) return [[1, "ia", "IA: la API rechazó la clave", "revisala en la Console y cargala de nuevo en GitHub"]];
  if (c && c.estado === "cortado") return [[1, "ia", "IA cortada", c.cortado_por === "tope" ? "llegó al corte del ciclo" + (c.vuelve ? ": vuelve el " + fmtDU(c.vuelve) : "") : "pausada" + (c.vuelve ? " hasta el " + (c.cortado_por === "creditos" ? fmtDT(c.vuelve) : fmtDU(c.vuelve)) : "")]];
  if (c && c.aviso_at) return [[1, "ia", "IA: pasó los " + usd(c.aviso) + " del ciclo", usd(c.gastado) + " de " + usd(c.credito) + (c.estado === "ahorro" ? " · en modo ahorro" : "")]];
  return [];
}
// Inicio: lo que va gastando la IA en el ciclo (solo si ya tiene ciclo, o sea, si se configuró).
function iaHomeBlock(){
  const ia = S.iaHome, c = ia && ia.ciclo;
  if (!c) return "";
  const usos = Object.values(ia.por_funcion || {}).reduce((s, x) => s + num(x.usos), 0);
  const est = !ia.activa ? '<span class="pill">Apagada</span>' : c.estado === "cortado" ? '<span class="pill bad">Cortada</span>' : c.estado === "ahorro" ? '<span class="pill warn">Modo ahorro</span>' : '<span class="pill ok">Normal</span>';
  return block("hIaB", "IA del ciclo", `<div class="ia-home"><div><b>${usd(c.gastado)}</b> <span class="muted">de ${usd(c.credito)} · ${n0(usos)} uso${usos === 1 ? "" : "s"} · corta a los ${usd(c.tope)}</span></div>
    <div class="ia-bar sm" role="img" aria-label="${esc(usd(c.gastado) + " de " + usd(c.credito))}"><i style="width:${Math.min(100, num(c.gastado) / (num(c.credito) || 200) * 100).toFixed(1)}%"></i></div>
    <div class="small">${est} <span class="muted">Del ${fmtDU(c.inicio)} al ${fmtDU(c.fin)}</span></div></div>`, { act: '<button class="btn sm" data-go="ia">Ver IA</button>' });
}

// Textos de los códigos que quedan en cada llamada (ia_llamadas.codigo) y de las frenadas de la guardia.
const IA_COD = { refusal: "la IA no quiso leerla", max_tokens: "respuesta cortada", json: "respuesta inválida", limite_console: "límite de la Console",
  clave_rechazada: "clave rechazada", limite_uso: "mucha demanda (límite por minuto)", sobrecarga: "mucha demanda (API saturada)", tiempo: "tardó demasiado",
  red: "sin conexión con la API", creditos: "sin créditos", vencida: "quedó sin cerrar" };
const iaCod = k => IA_COD[k] || (/^api_\d+$/.test(String(k)) ? "error de la API (" + String(k).slice(4) + ")" : String(k || "error"));
const IA_FRENO = { tope_mes: "corte del mes", ahorro: "modo ahorro", ritmo: "ritmo del día", tope_dia: "tope del día", tope_persona: "tope de la persona", pausada: "pausada", tope_semana: "usos gratis de la semana (IA Plus)" };
// «Leer pedidos desde»: se elige el día en que se publicó la política. Si es hoy, se leen los
// pedidos que lleguen desde ahora (la política ya está publicada); si es otro día, desde las 00:00
// (Argentina) del día siguiente: no se sabe a qué hora se publicó, así que nunca se lee uno de antes.
function desdePolitica(dia){
  if (dia === isoDay(new Date())) return new Date().toISOString();
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) + "T00:00:00-03:00";
}
// Y al revés, para mostrar el día elegido: las 00:00 justas son «el día anterior».
function diaPolitica(iso){
  const t = Date.parse(iso); if (!t) return "";
  const ar = new Date(t - 3 * 3600e3).toISOString();
  return ar.slice(11, 16) === "00:00" ? new Date(t - 3 * 3600e3 - 864e5).toISOString().slice(0, 10) : ar.slice(0, 10);
}

async function loadIA(){
  const lead = "Lo que gasta la IA con los créditos de API del plan Max. La IA solo completa: vos revisás y publicás.";
  page("IA", lead, '<div class="empty">Cargando…</div>');
  const [est, fnEst, plus, ped] = await Promise.all([rpc("admin_ia_estado").catch(e => ({ error: e })), iaInvoke({ modo: "estado" }), rpc("admin_ia_plus_lista").catch(() => null), rpc("admin_pedidos_baja").catch(() => null)]);
  if (S.view !== "ia") return;
  S.iaPlus = plus; S.pedidosBaja = ped;
  if (est && est.error){
    const falta = /admin_ia_estado|schema cache|does not exist/i.test(errMsg(est.error));
    return page("IA", lead, `<div class="card calm">${falta ? "Falta preparar la base: en GitHub, Actions → <b>Supabase</b> → Run workflow → tarea <b>sql</b>, archivo <b>supabase/ia.sql</b> (antes, <b>supabase/pedidos-productos.sql</b>)." : esc(errMsg(est.error))}</div>`);
  }
  S.ia = est; S.iaFn = fnEst;
  paintIA();
}
// foco: el control que se acaba de usar (la página se vuelve a dibujar entera y el foco vuelve ahí).
function paintIA(foco){
  if (S.view !== "ia" || !S.ia) return;
  const ia = S.ia, c = ia.ciclo, f = S.iaFn || {}, fun = ia.funciones || {};
  const ok = (bien, txt, sub) => `<li class="${bien ? "ok" : "no"}"><span aria-hidden="true">${bien ? "✓" : "!"}</span><div>${txt}${sub ? `<small>${sub}</small>` : ""}</div></li>`;
  const clave = f.ok ? (f.clave ? ok(true, "La clave está cargada en Supabase.") : ok(false, "Falta la clave de la IA.", "GitHub → Settings → Environments → production → ANTHROPIC_API_KEY, y después Actions → Supabase → tarea «secrets»."))
    : ok(false, f.codigo === "sin_funcion" ? "La función «ia» todavía no está publicada." : "No se pudo preguntar a la función «ia».", f.codigo === "sin_funcion" ? "Actions → Supabase → tarea «funciones»." : iaMsg(f));
  const lista = `<ul class="ia-checks">${clave}
    ${ia.clave_rechazada ? ok(false, "La API rechazó la clave (" + fmtDT(ia.clave_rechazada) + ").", "Creá otra en la Console (workspace «gize-produccion») y cargala de nuevo.") : ""}
    ${ok(!!ia.ancla, ia.ancla && c ? "Ciclo de los créditos: del " + fmtDU(c.inicio) + " al " + fmtDU(c.fin) + "." : "Falta la fecha en que vencen los créditos.", ia.ancla ? "" : "Está en la Console de Anthropic → Billing → «Promotional credits». Cargala en Ciclo.")}
    ${ok(!!ia.pedidos_desde, ia.pedidos_desde ? "Se leen los pedidos que llegaron desde el " + fmtDT(ia.pedidos_desde) + "." : "Falta la fecha de la política de privacidad.", ia.pedidos_desde ? "" : "Hasta cargarla, no se lee ningún pedido. El día que se publique la política, avisalo en Avisos y después cargá ese día en Funciones.")}</ul>`;
  const listo = ia.activa && fun.etiqueta_admin && f.clave && ia.ancla && ia.pedidos_desde;
  const master = `<div class="ia-master"><div><b>IA activada</b><small>${ia.activa ? (listo ? "Anda: aparece «Leer con IA» en Pedidos. Apagala y nadie llama a la IA." : "Prendida, pero falta algo de la lista de abajo.") : "Apagada: no se llama nunca a la IA y todo se carga a mano."}</small></div>
    <button class="tgl" role="switch" aria-checked="${ia.activa ? "true" : "false"}" aria-label="IA activada" data-a="iaOn"></button></div>`;
  // Ciclo.
  let ciclo = '<div class="calm">Cargá la fecha en que vencen los créditos para empezar a contar.</div>';
  if (c){
    const pct = v => Math.min(100, Math.max(0, num(v) / num(c.credito) * 100)).toFixed(1) + "%";
    const est = c.estado === "cortado" ? `<span class="pill bad">Cortada${c.cortado_por === "tope" ? " por el corte del ciclo" : c.cortado_por === "creditos" ? ": sin créditos" : c.cortado_por === "limite_console" ? " por el límite de la Console" : ""}</span>${c.vuelve ? ` <span class="muted small">Vuelve el ${c.cortado_por === "creditos" ? fmtDT(c.vuelve) : fmtDU(c.vuelve)}</span>` : ""}`
      : c.estado === "ahorro" ? '<span class="pill warn">Modo ahorro</span> <span class="muted small">La tabla sigue para todos.</span>' : '<span class="pill ok">Normal</span>';
    const usos = Object.values(ia.por_funcion || {}).reduce((s, x) => s + num(x.usos), 0);
    const marcas = [["aviso", c.aviso, "aviso"], ["ahorro", c.ahorro, "ahorro"], ["tope", c.tope, "corte"]];
    ciclo = `<div class="ia-big"><b>${usd(c.gastado)}</b><span class="muted"> de ${usd(c.credito)} · ${n0(usos)} uso${usos === 1 ? "" : "s"}</span></div>
      <div class="ia-bar" role="img" aria-label="${esc(usd(c.gastado) + " de " + usd(c.credito))}"><i style="width:${pct(c.gastado)}"></i>
        ${marcas.map(([k, v, l]) => `<span class="mk ${k}" style="left:${pct(v)}"><em>${n0(v)}<span class="mk-l"> · ${l}</span></em></span>`).join("")}</div>
      <div class="ia-ley muted small">${marcas.map(([k, v, l]) => `${n0(v)}: ${l}`).join(" · ")}</div>
      <div class="ia-est">${est}</div>
      <div class="muted small">Del ${fmtDU(c.inicio)} al ${fmtDU(c.fin)} · Tope de hoy: ${usd(c.limite_hoy)} (hoy van ${usd(c.hoy)}) · Proyección al fin del ciclo: ${usd(c.proyeccion)}</div>
      ${c.estado === "cortado" && num(c.gastado) < num(c.tope) ? '<div class="row-btns"><button class="btn" data-a="iaRetry">Volver a probar</button></div>' : ""}`;
  }
  const fecha = d => d ? new Date(d).toISOString().slice(0, 10) : "";
  const ancla = `<label class="lbl" for="iaAncla">Vencimiento de los créditos («Promotional credits» en la Console)</label>
    <div class="search"><input class="in" id="iaAncla" type="date" aria-label="Vencimiento de los créditos" value="${esc(fecha(ia.ancla))}"><button class="btn" data-a="iaAncla">Guardar fecha</button></div>`;
  // Funciones.
  // [clave, nombre, nota (si todavía no se puede prender), ayuda]
  const FUN = [["etiqueta_admin", "Leer tablas en Pedidos (este panel)", ""], ["etiqueta_usuario", "Tabla en «Pedir un producto» (app)", "Todavía no está en la app"],
    ["plato", "Foto del plato (app)", "", "Aparece en Comida, al lado del buscador (web; en las apps, con la versión nueva). Cada foto sale menos de un centavo. «Contame qué comiste» se sacó: solo fotos."],
    ["rutina", "Armar rutina (coach)", "Todavía no está en la app"], ["resumen", "Resumen de la semana (coach)", "Todavía no está en la app"]];
  const funs = `<div class="ia-funs">${FUN.map(([k, l, nota, ayuda]) => `<div class="ia-fun${nota ? " off" : ""}"><div>${l}${nota ? `<small>${nota}</small>` : ayuda ? `<small>${ayuda}</small>` : ""}</div>
      <button class="tgl sm" role="switch" aria-checked="${fun[k] ? "true" : "false"}" aria-label="${esc(l)}" data-a="iaFn" data-k="${k}"${nota ? " disabled" : ""}></button></div>`).join("")}</div>`;
  // Modelo para las tablas: solo los que sirven para leer tablas, con lo que cuesta cada una.
  const elegido = (ia.modelos || {}).etiqueta || "";
  const mods = (f.modelos || []).filter(m => m.tabla !== false);
  const def = mods.find(m => m.defecto), alt = mods.filter(m => !m.defecto).sort((a, b) => num(b.usd_tabla) - num(a.usd_tabla))[0];
  const cuesta = m => m.usd_tabla ? " · unos " + usd(m.usd_tabla) + " por tabla" : "";
  const modelos = mods.map(m => `<option value="${esc(m.defecto ? "" : m.id)}"${(m.defecto ? !elegido || elegido === m.id : elegido === m.id) ? " selected" : ""}>${esc(m.nombre)}${m.defecto ? " (el de siempre)" : ""}${cuesta(m)}</option>`).join("");
  const veces = def && alt && num(def.usd_tabla) > 0 && num(alt.usd_tabla) > 0 ? Math.round(num(alt.usd_tabla) / num(def.usd_tabla)) : 0;
  const modelo = modelos ? `<label class="lbl" for="iaModelo">Modelo para leer tablas</label>
    <div class="search"><select class="in" id="iaModelo">${modelos}</select><button class="btn" data-a="iaModelo">Guardar</button></div>
    ${alt ? `<div class="muted small">Si lee mal las tablas, probá con ${esc(alt.nombre)}${veces > 1 ? ": cuesta unas " + veces + " veces más por tabla (igual son centavos)" : ""}.</div>` : ""}` : "";
  const desde = `<label class="lbl" for="iaDesde">Día en que se publicó la política de privacidad</label>
    <div class="search"><input class="in" id="iaDesde" type="date" aria-label="Día en que se publicó la política de privacidad" value="${esc(diaPolitica(ia.pedidos_desde))}"><button class="btn" data-a="iaDesde">Guardar fecha</button></div>
    <div class="muted small">Si es hoy, se leen los pedidos que lleguen desde ahora; si es otro día, desde el día siguiente (así nunca se lee uno de antes). Ese día, avisá el cambio en la app desde <a href="#avisos" data-go="avisos">Avisos</a> (ej: «Actualizamos la política de privacidad: sumamos las funciones con IA»).</div>`;
  // Uso.
  const NOMF = { etiqueta: "Tablas", plato: "Platos", texto: "Textos", rutina: "Rutinas", resumen: "Resúmenes" };
  const seg = ms => (num(ms) / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " s";
  const pf = Object.entries(ia.por_funcion || {});
  const tb = ia.tablas || {}, pub = num(tb.publicadas), campos = tb.campos || {};
  const pc = (a, b) => b ? Math.round(num(a) / b * 100) + " %" : "—";
  const CAMPOS = [["kcal", "kcal"], ["protein", "proteína"], ["carbs", "carbos"], ["fat", "grasas"], ["portion", "porción"], ["unit", "unidad"]];
  const frenos = Object.entries((c && c.frenos) || {}).filter(([, n]) => num(n) > 0);
  const uso = `<div class="grid kpis">${pf.length ? pf.map(([k, x]) => `<div class="kpi"><b>${n0(x.usos)}</b><span>${esc(NOMF[k] || k)}</span><small>${usd(x.usd)}${x.p50 != null ? " · tarda " + seg(x.p50) + (x.p95 != null ? " (95 %: " + seg(x.p95) + ")" : "") : ""}</small></div>`).join("") : '<div class="kpi"><b>0</b><span>Usos en el ciclo</span></div>'}
      <div class="kpi"><b>${pc(tb.kcal_bien, pub)}</b><span>Tablas sin corregir las calorías</span><small>${n0(pub)} publicada${pub === 1 ? "" : "s"} de ${n0(tb.leidas)} leída${num(tb.leidas) === 1 ? "" : "s"}${num(tb.sin_tabla) ? " · " + n0(tb.sin_tabla) + " sin tabla legible" : ""}</small></div>
      <div class="kpi"><b>${pc(tb.sin_corregir, pub)}</b><span>Tablas sin corregir nada</span><small>La meta: 9 de cada 10 y 8 de cada 10, con al menos 30.</small></div></div>
    ${pub ? `<div class="muted small">Corregido por campo (de ${n0(pub)} publicada${pub === 1 ? "" : "s"}): ${CAMPOS.map(([k, l]) => l + " " + pc(campos[k], pub)).join(" · ")}</div>` : ""}
    ${num(tb.con_tabla) ? `<div class="muted small">Calorías que no cerraban con los macros: ${pc(tb.revisar, num(tb.con_tabla))} de las tablas leídas.</div>` : ""}
    ${frenos.length ? `<div class="muted small">Frenadas por la guardia: ${frenos.map(([k, n]) => esc(IA_FRENO[k] || k) + " " + n0(n)).join(" · ")}</div>` : ""}
    ${Object.keys(ia.errores || {}).length ? `<div class="muted small">Errores del ciclo: ${Object.entries(ia.errores).map(([k, n]) => esc(iaCod(k)) + " " + n0(n)).join(" · ")}</div>` : ""}`;
  // Topes y umbrales.
  const ROL = { alumno: "Alumno", coach: "Coach", admin: "Administrador" };
  const topes = Object.entries(ia.topes || {}).map(([rol, t]) => `<div class="ia-topes"><b>${ROL[rol] || esc(rol)}</b>${Object.entries(t).map(([k, v]) =>
    `<label>${k === "usd_ciclo" ? "US$ por ciclo" : k === "total" ? "Total por día" : esc((NOMF[k] || k)) + " por día"}<input class="in" inputmode="decimal" data-tope="${esc(rol)}.${esc(k)}" value="${esc(v)}"></label>`).join("")}</div>`).join("");
  const umbr = c ? `<div class="ia-topes"><b>Este ciclo (US$)</b>${[["aviso", "Aviso"], ["ahorro", "Ahorro"], ["tope", "Corte"], ["credito", "Crédito"]].map(([k, l]) => `<label>${l}<input class="in" inputmode="decimal" data-umbral="${k}" value="${esc(num(c[k]))}"></label>`).join("")}</div>` : "";
  // Últimas llamadas.
  const ult = (ia.ultimas || []).map(l => `<tr><td class="muted">${fmtDT(l.creada)}</td><td>${esc(NOMF[l.funcion] || l.funcion)}</td><td class="muted">${esc(((f.modelos || []).find(m => m.id === l.modelo) || {}).nombre || l.modelo)}</td>
    <td>${l.estado === "ok" ? '<span class="pill ok">ok</span>' : l.estado === "vacia" ? '<span class="pill">sin tabla</span>' : l.estado === "reservada" ? '<span class="pill blue">en curso</span>' : `<span class="pill warn">${esc(iaCod(l.codigo || l.estado))}</span>`}</td>
    <td>${l.usd == null ? (l.estado === "reservada" ? "—" : usd(l.max_usd) + " (reserva)") : usd(l.usd)}</td><td class="muted">${l.ms ? seg(l.ms) : ""}</td></tr>`).join("");
  page("IA", "Lo que gasta la IA con los créditos de API del plan Max. La IA solo completa: vos revisás y publicás.",
    block("iaEstB", "Estado", master + lista) +
    block("iaCicloB", "Ciclo", ciclo + ancla) +
    block("iaFunB", "Funciones", funs + modelo + desde) +
    block("iaUsoB", "Uso del ciclo", uso) +
    iaPlusBlock() +
    panel("iaTopesB", "Topes", `<div class="sec-s">Por persona y por día (y en dólares por ciclo). Arriba de esto, la guardia corta igual.</div>${topes}${umbr}
      <div class="row-btns"><button class="btn blue" data-a="iaTopes">Guardar topes</button></div>`, { open: false }) +
    panel("iaUltB", "Últimas llamadas", ult ? `<div class="tscroll"><table class="table"><thead><tr><th>Cuándo</th><th>Qué</th><th>Modelo</th><th>Cómo salió</th><th>Costo</th><th>Tardó</th></tr></thead><tbody>${ult}</tbody></table></div>` : '<div class="calm">Todavía no hubo ninguna.</div>', { open: false, sum: (ia.ultimas || []).length ? n0(ia.ultimas.length) : "ninguna" }));
  if (foco){ const el = document.querySelector(foco); if (el) try { el.focus({ preventScroll: true }); } catch (e) {} }
}
// IA Plus (supabase/ia.sql → ia_plus, app/ui/ia-plus.js): el interruptor, el precio de la web en
// pesos (provisorio hasta que se guarde), los usos gratis por semana, cuántos lo tienen y, para
// soporte, darlo o sacarlo a mano. Apagado: no hay límite semanal y no se vende nada.
// ¿Está prendida la IA de Comida? (sin eso, IA Plus no se prende ni se ofrece)
const iaComidaOn = ia => !!(ia && ia.activa && ia.funciones && (ia.funciones.plato || ia.funciones.texto));
function iaPlusBlock(){
  const ia = S.ia, pl = ia.plus || {}, r = ia.plus_resumen || {}, lista = S.iaPlus;
  if (!ia.plus) return block("iaPlusB", "IA Plus", '<div class="calm">Falta preparar la base: correr de nuevo <b>supabase/ia.sql</b> con el workflow «Supabase» (tarea sql).</div>');
  const frenos = num(((ia.ciclo && ia.ciclo.frenos) || {}).tope_semana);
  const sw = `<div class="ia-master"><div><b>IA Plus</b><small>${pl.activa ? "Prendido: la foto del plato y «Contame qué comiste» son gratis hasta " + n0(pl.gratis_semana) + " usos por semana; con IA Plus, sin límite semanal (con los topes de cada día). Se vende en la web con Mercado Pago y en el iPhone con Apple; en Android, no." : "Apagado: no hay límite semanal (como hasta ahora) y no se vende nada."}</small></div>
    <button class="tgl" role="switch" aria-checked="${pl.activa ? "true" : "false"}" aria-label="IA Plus" data-a="iaPlusOn"></button></div>
    ${iaComidaOn(ia) ? "" : `<div class="small ia-warn">La IA de Comida está apagada (o sin la foto del plato y «Contame qué comiste»): ${pl.activa ? "la app no ofrece IA Plus hasta que la prendas; quien ya lo tiene lo puede cancelar en Ajustes." : "IA Plus no se puede prender hasta que la prendas."}</div>`}`;
  const precio = `<label class="lbl" for="iaPlusPrecio">Precio por mes en la web (pesos, con Mercado Pago)</label>
    <div class="search"><input class="in" id="iaPlusPrecio" inputmode="numeric" value="${esc(pl.precio_ars || "")}"><button class="btn" data-a="iaPlusPrecio">Guardar precio</button></div>
    ${pl.precio_confirmado ? '<div class="muted small">Lo nuevo vale para las suscripciones que se hagan desde ahora; las que ya están siguen con su precio.</div>' : '<div class="small ia-warn">Precio provisorio (' + money(pl.precio_ars) + '): confirmalo con «Guardar precio» antes de prender IA Plus.</div>'}
    <div class="muted small">En el iPhone el precio lo pone Apple (App Store Connect, el más cercano a US$2,99).</div>`;
  const gratis = `<label class="lbl" for="iaPlusGratis">Usos gratis por semana (foto y texto juntos; la semana arranca el lunes)</label>
    <div class="search"><input class="in" id="iaPlusGratis" inputmode="numeric" value="${esc(pl.gratis_semana != null ? pl.gratis_semana : 3)}"><button class="btn" data-a="iaPlusGratis">Guardar</button></div>`;
  // Compras de prueba de Apple (Sandbox): IA Plus solo para estas cuentas (si no, cualquier tester de
  // TestFlight lo tendría gratis). Va la cuenta demo de la revisión de Apple.
  const sandbox = `<label class="lbl" for="iaPlusSandbox">Compras de prueba de Apple (TestFlight y la revisión de Apple): solo estas cuentas reciben IA Plus. Mails separados por coma.</label>
    <div class="search"><input class="in" id="iaPlusSandbox" type="text" autocomplete="off" value="${esc((Array.isArray(pl.sandbox) ? pl.sandbox : []).join(", "))}" placeholder="cuenta-demo@ejemplo.com"><button class="btn" data-a="iaPlusSandbox">Guardar</button></div>`;
  const kpis = `<div class="grid kpis"><div class="kpi"><b>${n0(r.activos)}</b><span>Con IA Plus</span><small>${n0(r.mp)} Mercado Pago · ${n0(r.apple)} Apple · ${n0(r.manual)} a mano</small></div>
    <div class="kpi"><b>${n0(r.renuevan)}</b><span>Se renuevan</span><small>${n0(r.arrepentidos)} arrepentimiento${num(r.arrepentidos) === 1 ? "" : "s"}</small></div>
    <div class="kpi"><b>${n0(frenos)}</b><span>Llegaron al límite semanal</span><small>en este ciclo</small></div></div>`;
  const de = x => [x.mp_hasta && new Date(x.mp_hasta) > new Date() ? "Mercado Pago" + (x.mp_status === "authorized" ? "" : " (cancelada)") : "",
    x.apple_vence && new Date(x.apple_vence) > new Date() ? "Apple" + (x.apple_renueva ? "" : " (no se renueva)") : "",
    x.manual_hasta && new Date(x.manual_hasta) > new Date() ? "A mano" + (x.manual_nota ? ": " + x.manual_nota : "") : ""].filter(Boolean).join(" · ") || (x.arrepentido_at ? "Se arrepintió" : x.pagando ? "Pagando con Mercado Pago (sin cobrar)" : "Vencido");
  // Quien se arrepintió más de una vez (se ve siempre en la lista): para revisar a mano.
  const arrep = x => num(x.arrepentimientos) >= 2 ? `<div class="small ia-warn">Se arrepintió ${n0(x.arrepentimientos)} veces</div>` : "";
  const filas = (lista || []).map(x => `<tr><td>${esc(x.nombre || "—")}<div class="muted small">${esc(x.email || "")}</div></td><td>${esc(de(x))}${arrep(x)}</td><td>${x.hasta ? fmtDU(x.hasta) : "—"}</td>
    <td>${x.manual_hasta && new Date(x.manual_hasta) > new Date() ? `<button class="btn sm" data-a="iaPlusQuitar" data-id="${esc(x.user_id)}">Sacar</button>` : ""}</td></tr>`).join("");
  const tabla = lista == null ? '<div class="calm">No se pudo traer la lista.</div>' : filas ? `<div class="tscroll"><table class="table"><thead><tr><th>Cuenta</th><th>De dónde</th><th>Hasta</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>` : '<div class="calm">Todavía nadie tiene IA Plus.</div>';
  const dar = `<label class="lbl" for="iaPlusMail">Dar IA Plus a mano (soporte): mail de la cuenta, hasta qué día y una nota</label>
    <div class="search"><input class="in" id="iaPlusMail" type="email" placeholder="mail@ejemplo.com"><input class="in" id="iaPlusHasta" type="date" min="${isoDay(new Date())}" value="${isoDay(new Date(Date.now() + 30 * 864e5))}" aria-label="Hasta"></div>
    <div class="search"><input class="in" id="iaPlusNota" maxlength="200" placeholder="Nota (opcional), ej: se le cortó el pago"><button class="btn blue" data-a="iaPlusDar">Dar IA Plus</button></div>
    <div class="muted small">Lo pagado con Mercado Pago o con Apple no se toca desde acá: se cancela por el mismo medio.</div>`;
  // Botón de arrepentimiento y de baja sin sesión (gize.ar/baja/): los pedidos, para hacerlos a mano.
  const ped = S.pedidosBaja, sinAtender = (ped || []).filter(x => !x.atendido_at).length;
  const pfilas = (ped || []).map(x => `<tr><td>${fmtDT(x.created_at)}<div class="muted small">${esc(x.codigo)}</div></td><td>${x.tipo === "arrepentimiento" ? "Arrepentimiento" : "Baja"} · ${x.servicio === "iaplus" ? "IA Plus" : "Plan de coach"}</td>
    <td>${esc(x.email)}${x.cuenta ? "" : '<div class="small ia-warn">Sin cuenta con ese mail</div>'}${x.detalle ? `<div class="muted small">${esc(x.detalle)}</div>` : ""}</td>
    <td>${x.atendido_at ? '<span class="muted small">Atendido</span>' : `<button class="btn sm" data-a="pedidoAtendido" data-id="${esc(x.id)}">Atendido</button>`}</td></tr>`).join("");
  const pedidos = `<div class="lbl">Pedidos de baja y arrepentimiento sin sesión${sinAtender ? ` · <b class="ia-warn">${n0(sinAtender)} sin atender</b>` : ""}</div>` + (ped == null ? '<div class="calm">No se pudo traer la lista.</div>'
    : pfilas ? `<div class="tscroll"><table class="table"><thead><tr><th>Cuándo</th><th>Qué</th><th>Mail</th><th></th></tr></thead><tbody>${pfilas}</tbody></table></div><div class="muted small">Hacelo desde la lista de arriba o desde Mercado Pago (arrepentimiento: cancelar y devolver el cobro) y marcalo como atendido. Para el arrepentimiento vale la fecha del pedido.</div>`
    : '<div class="calm">Ninguno.</div>');
  return block("iaPlusB", "IA Plus", sw + precio + gratis + sandbox + kpis + tabla + pedidos + dar);
}
async function iaPlusGuardar(btn, plus, ok){
  btn.disabled = true;
  try { S.ia = await rpc("admin_ia_config", { p: { plus } }); toast(ok); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  paintIA(iaFoco(btn));
}
async function iaPlusLista(btn, fn, args, ok){
  btn.disabled = true;
  try { S.iaPlus = await rpc(fn, args); S.ia = await rpc("admin_ia_estado"); toast(ok); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  paintIA(iaFoco(btn));
}
// El selector del control que se tocó, para devolverle el foco después de dibujar la página.
const iaFoco = b => b && b.dataset.a ? `[data-a="${b.dataset.a}"]` + (b.dataset.k ? `[data-k="${b.dataset.k}"]` : "") : null;
async function iaGuardar(btn, cambios, ok){
  if (cambios.activa === true && !await confirmar("¿Prender la IA? Con «Leer tablas en Pedidos» prendido, aparece «Leer con IA» en cada pedido nuevo. Cada lectura gasta centavos de los créditos.", { titulo: "Prender la IA", ok: "Prender" })) return;
  btn.disabled = true;
  try { S.ia = await rpc("admin_ia_config", { p: cambios }); toast(ok); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  paintIA(iaFoco(btn));
}
async function iaAncla(btn){
  const v = document.getElementById("iaAncla").value;
  if (!v) return toast("Elegí la fecha en que vencen los créditos.");
  btn.disabled = true;
  try { S.ia = await rpc("admin_ia_ciclo", { p_fin: v }); toast("Fecha guardada ✓"); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  paintIA(iaFoco(btn));
}
async function iaTopes(btn){
  const topes = {}, umbrales = {};
  for (const i of document.querySelectorAll("[data-tope]")){ const [rol, k] = i.dataset.tope.split("."); const v = parseFloat(String(i.value).replace(",", ".")); if (!Number.isFinite(v) || v < 0) return toast("Revisá los topes: tienen que ser números."); (topes[rol] = topes[rol] || {})[k] = v; }
  for (const i of document.querySelectorAll("[data-umbral]")){ const v = parseFloat(String(i.value).replace(",", ".")); if (!Number.isFinite(v) || v <= 0) return toast("Revisá los montos del ciclo."); umbrales[i.dataset.umbral] = v; }
  btn.disabled = true;
  try { S.ia = await rpc("admin_ia_config", { p: Object.assign({ topes }, Object.keys(umbrales).length ? { umbrales } : {}) }); toast("Topes guardados ✓"); } catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  paintIA(iaFoco(btn));
}

// ---------- Avisos ----------
async function loadAvisos(){
  page("Avisos", "Notificaciones a los usuarios y cartel de actualización de la app.", '<div class="empty">Cargando…</div>');
  try { const r = await sb.from("app_config").select("value").eq("key", "version").maybeSingle(); S.config = (r.data && r.data.value) || {}; } catch (e) { S.config = {}; }
  const vf = (pl, name) => { const c = S.config[pl] || {}; return `<div class="card"><div class="sec-t">${name}</div>
    <div class="vgrid"><label><span class="lbl">Última (número)</span><input class="in" data-v="${pl}.ultima" type="number" value="${esc(c.ultima || 0)}"></label>
    <label><span class="lbl">Nombre (ej: 1.0.7)</span><input class="in" data-v="${pl}.version" value="${esc(c.version || "")}"></label>
    <label><span class="lbl">Mínima obligatoria</span><input class="in" data-v="${pl}.minima" type="number" value="${esc(c.minima || 0)}"></label></div>
    <label><span class="lbl">Link de la tienda</span><input class="in" data-v="${pl}.tienda" value="${esc(c.tienda || "")}"></label></div>`; };
  const vtxt = pl => (S.config[pl] || {}).version || "—";
  page("Avisos", "Notificaciones a los usuarios y cartel de actualización de la app.",
    panel("avNotB", "Notificación a los usuarios", `<div class="sec-s">Les llega a quienes activaron los avisos en su celular o computadora.</div>
        <label class="lbl">A quién</label><div class="seg" id="avT">${[["todos", "Todos"], ["coaches", "Coaches"], ["alumnos", "Alumnos"]].map(([k, l], i) => `<button class="${i ? "" : "on"}" data-a="avT" data-v="${k}">${l}</button>`).join("")}</div>
        <label class="lbl">Título (hasta 60 letras)</label><input class="in" id="avTitle" maxlength="60" placeholder="Ej: Salió la versión 1.0.7">
        <label class="lbl">Mensaje (hasta 180 letras)</label><textarea class="in" id="avBody" maxlength="180" placeholder="Ej: Superseries, resumen del entreno y mucho más. Actualizá desde Play Store."></textarea>
        <div class="preview"><img src="../icon-192.png" alt=""><div><b id="pvT">Título</b><span id="pvB">Mensaje</span></div></div>
        <div class="row-btns"><button class="btn pri" data-a="avSend">Enviar notificación</button></div>`) +
    panel("avCfgB", "Cartel de actualización", `<div class="sec-s">Subí «Última» recién cuando la versión ya esté publicada en la tienda. «Mínima» obliga a actualizar (pantalla que no se puede cerrar).</div>
        <div class="grid two">${vf("android", "Android")}${vf("ios", "iPhone")}</div>
        <div class="row-btns"><button class="btn blue" data-a="cfgSave">Guardar cartel</button></div>`, { open: false, sum: "Android " + esc(vtxt("android")) + " · iPhone " + esc(vtxt("ios")) }));
}
async function sendAviso(btn){
  const target = (document.querySelector("#avT button.on") || {}).dataset.v, title = document.getElementById("avTitle").value.trim(), body = document.getElementById("avBody").value.trim();
  if (!title || !body) return toast("Completá el título y el mensaje.");
  const who = { todos: "a TODOS los usuarios", coaches: "a todos los coaches", alumnos: "a todos los alumnos" }[target];
  if (!await confirmar("¿Mandar esta notificación " + who + "?\n\n" + title + "\n" + body)) return;
  btn.disabled = true;
  try { const r = await fn({ action: "aviso", target, title, body }); toast("Enviada a " + n0(r.users) + " usuario" + (r.users === 1 ? "" : "s") + " (" + n0(r.devices) + " dispositivos)"); document.getElementById("avTitle").value = ""; document.getElementById("avBody").value = ""; }
  catch (e) { toast(errMsg(e)); }
  btn.disabled = false;
}
async function saveConfig(btn){
  // Solo Android y iPhone: así no se cuelan los botones «A quién» (también tienen data-v) y se
  // limpia lo que se haya guardado de más antes.
  const base = S.config || {}, v = { android: Object.assign({}, base.android), ios: Object.assign({}, base.ios) };
  document.querySelectorAll("input[data-v]").forEach(i => { const [pl, k] = i.dataset.v.split("."); if (!v[pl]) return; v[pl][k] = ["ultima", "minima"].includes(k) ? Math.max(0, parseInt(i.value, 10) || 0) : i.value.trim(); });
  for (const pl of ["android", "ios"]) if (v[pl] && v[pl].tienda && !/^https:\/\//i.test(v[pl].tienda)) return toast("El link de la tienda tiene que empezar con https://");
  if (!await confirmar("¿Guardar el cartel? A los usuarios con una versión más vieja que «Última» les va a aparecer.")) return;
  btn.disabled = true;
  try { await rpc("admin_set_config", { p_key: "version", p_value: v }); S.config = v; toast("Cartel guardado"); } catch (e) { toast(errMsg(e)); }
  btn.disabled = false;
}

// ---------- Seguridad y sistema ----------
async function loadSeguridad(){
  page("Seguridad", "Copias de seguridad, administradores y registro de lo que se hace desde el panel.",
    block("sBkB", "Copias de seguridad", '<div class="sec-s">Se hacen solas todos los lunes y se prueban restaurándolas.</div><div id="bk" class="list-mini">Cargando…</div>') +
    block("sAdmB", "Administradores", '<div class="sec-s">Se agregan o quitan desde Usuarios → ficha → Hacer administrador.</div><div id="admins" class="list-mini">Cargando…</div>') +
    block("sAudB", "Registro de acciones", '<div class="sec-s">Las últimas 100 acciones hechas desde el panel.</div><div id="aud" class="empty">Cargando…</div>'));
  // Con el repositorio privado GitHub no responde sin sesión: se deja el enlace a las copias.
  const bkLink = `<a href="https://github.com/${REPO}/actions/workflows/backup.yml" target="_blank" rel="noopener">Ver las copias en GitHub</a>`;
  fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/backup.yml/runs?per_page=6").then(r => { if (!r.ok) throw 0; return r.json(); }).then(j => {
    const runs = j.workflow_runs || [], box = document.getElementById("bk"); if (!box) return;
    const r0 = runs[0]; setSum("sBkB", !r0 ? "" : "última " + ago(r0.created_at) + (r0.status !== "completed" ? " · en curso" : r0.conclusion === "success" ? ' · <span class="t-ok">OK</span>' : ' · <span class="t-bad">falló</span>'));
    box.innerHTML = runs.length ? `<table class="table"><tbody>${runs.map(r => `<tr><td>${fmtDT(r.created_at)}</td><td>${r.status !== "completed" ? '<span class="pill warn">En curso</span>' : r.conclusion === "success" ? '<span class="pill ok">OK</span>' : '<span class="pill bad">Falló</span>'}</td><td><a href="${esc(r.html_url)}" target="_blank" rel="noopener">ver</a></td></tr>`).join("")}</tbody></table>` : "Todavía no hay copias.";
  }).catch(() => { const box = document.getElementById("bk"); if (box) box.innerHTML = bkLink + '<div class="muted small">Hace falta entrar con la cuenta de GitHub de GIZE.</div>'; });
  // admin_list_admins trae a todos los administradores (admin.sql). Si la base todavía no la
  // tiene, se sigue con lo de antes: los administradores entre las 60 cuentas más nuevas.
  rpc("admin_list_admins").catch(() => rpc("admin_users", { q: "" }).then(us => us.filter(u => u.is_admin)))
    .then(us => { const box = document.getElementById("admins"); if (!box) return; us = us || [];
      box.innerHTML = us.map(u => esc((u.full_name || "Sin nombre") + " · " + u.email)).join("<br>") || "—";
      setSum("sAdmB", us.length ? us.length + " cuenta" + (us.length === 1 ? "" : "s") : ""); }).catch(() => {});
  const box = document.getElementById("aud");
  try { S.audit = await rpc("admin_audit_list", { lim: 100 }); } catch (e) { box.textContent = errMsg(e); return; }
  if (!S.audit.length){ box.textContent = "Todavía no hay acciones registradas."; return; }
  const what = a => ({ rol: "Cambió el rol a " + ((a.detail || {}).role === "coach" ? "coach" : "alumno"), desvincular: "Desvinculó de su coach", admin_si: "Hizo administrador", admin_no: "Quitó administrador",
    plan: ({ cortesia: "Dio cortesía", trial: "Extendió la prueba", sin_cortesia: "Quitó la cortesía", pago_manual: "Cargó un pago", prueba_hasta: "Cambió la prueba", cortar_pago: "Cortó el pago" }[(a.detail || {}).mode] || "Cambió el plan"), config: "Cambió el cartel de actualización",
    aviso: "Mandó una notificación a " + (a.target || ""), eliminar: "Eliminó la cuenta",
    contacto_leido: "Marcó un mensaje como leído", contacto_no_leido: "Marcó un mensaje sin leer", contacto_respuesta: "Respondió un mensaje de contacto", reporte_revisado: "Marcó un reporte como revisado", pedido_publicado: "Publicó un producto pedido", pedido_rechazado: "Rechazó un pedido de producto", producto_verificar: "Verificó un producto", producto_ocultar: "Ocultó un producto", producto_mostrar: "Volvió a mostrar un producto", producto_nuevo: "Agregó un producto", producto_borrar: "Borró un producto",
    fin_gasto_nuevo: "Agregó un gasto", fin_gasto: "Cambió un gasto", fin_gasto_borrar: "Borró un gasto", fin_ajustes: "Cambió los ajustes de finanzas",
    fin_pendiente_nuevo: "Agregó un pendiente", fin_pendiente_hecho: "Marcó un pendiente como hecho", fin_pendiente_deshacer: "Volvió a abrir un pendiente", fin_pendiente_borrar: "Borró un pendiente",
    objetivo_nuevo: "Agregó un objetivo", objetivo: "Cambió un objetivo", objetivo_borrar: "Borró un objetivo",
    tarea_nueva: "Agregó una tarea", tarea: "Cambió una tarea", tarea_hecha: "Marcó una tarea como hecha", tarea_deshacer: "Volvió a abrir una tarea", tarea_borrar: "Borró una tarea" }[a.action] || a.action);
  const goalTxt = d => d ? (d.label || (METRICS[d.metric] || [d.metric])[0]) + (d.target != null ? " · meta " + (METRICS[d.metric] || [, n0])[1](d.target) : "") : "";
  const extra = a => a.action.startsWith("objetivo") ? goalTxt(a.detail) : a.action.startsWith("tarea") ? (a.detail && a.detail.title) : a.action === "aviso" ? (a.detail && a.detail.title) : a.action.startsWith("contacto") ? (a.detail && (a.detail.de || a.detail.a)) : a.action.startsWith("producto") ? (a.detail && a.detail.name) : a.action.startsWith("fin_") ? (a.detail && (a.detail.name || a.detail.label)) : a.action === "eliminar" ? (a.detail && a.detail.nombre) : (a.target_name || "");
  setSum("sAudB", "última: " + esc(what(S.audit[0])).toLowerCase() + " · " + ago(S.audit[0].created_at));
  box.className = "tscroll";
  box.innerHTML = `<table class="table"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Sobre</th></tr></thead><tbody>${S.audit.map(a => `<tr><td class="muted">${fmtDT(a.created_at)}</td><td>${esc(a.admin_name || "—")}</td><td>${esc(what(a))}</td><td class="muted">${esc(extra(a) || "")}</td></tr>`).join("")}</tbody></table>`;
}

// ---------- acciones ----------
document.addEventListener("input", e => {
  const mr = e.target.closest && e.target.closest(".msg-reply"); if (mr) S.drafts[mr.closest("[data-msg]").dataset.msg] = e.target.value;
  // Pedidos: lo que escribe el administrador queda guardado (y deja de estar marcado «Leído con IA»).
  const rq = e.target.dataset && e.target.dataset.k && e.target.closest("#pList [data-req]");
  if (rq){
    reqDraft(rq.dataset.req)[e.target.dataset.k] = e.target.value;
    const l = e.target.closest("label"); if (l && l.classList.contains("ia")){ l.classList.remove("ia", "dudoso"); l.removeAttribute("title"); }
  }
  if (e.target.id === "avTitle") document.getElementById("pvT").textContent = e.target.value || "Título";
  if (e.target.id === "avBody") document.getElementById("pvB").textContent = e.target.value || "Mensaje";
  // Pago manual: al elegir otro plan, «Alumnos máximos» pasa al tope de ese plan.
  if (e.target.id === "pmPlan"){ const m = document.getElementById("pmMax"); if (m && PLAN_MAX[e.target.value]) m.value = PLAN_MAX[e.target.value]; }
  if (e.target.dataset && e.target.dataset.fs && S.fin) finField(e.target);
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "uQ"){ S.q = e.target.value.trim(); searchUsers(); }
  if (e.key === "Enter" && e.target.id === "pQ"){ S.prodQ = e.target.value.trim(); loadProductos(); }
  if (e.key === "Enter" && (e.target.id === "tNew" || e.target.id === "tNewDueTxt")){ const b = document.querySelector('[data-a="tAdd"]'); if (b) b.click(); }
  if (e.key === "Enter" && e.target.id === "fTodoIn"){ const b = document.querySelector('[data-a="fTodoAdd"]'); if (b) b.click(); }
  if (e.key === "Escape"){ const z = document.querySelector(".zoom"); if (z){ z.remove(); return; } closeDrawer(); }
});
document.addEventListener("click", async e => {
  const g = e.target.closest("[data-go]"); if (g){ closeDrawer(); go(g.dataset.go); return; }
  const tr = e.target.closest("tr[data-user]"); if (tr){ openUser(tr.dataset.user); return; }
  const tc = e.target.closest("[data-coach]"); if (tc){ openCoach(tc.dataset.coach); return; }
  const tf = e.target.closest("tr[data-cost]"); if (tf){ openCost(Number(tf.dataset.cost)); return; }
  const tg = e.target.closest("[data-goal]"); if (tg){ openGoal(tg.dataset.goal); return; }
  const tt = e.target.closest("[data-task]"); if (tt){ openTask(tt.dataset.task); return; }
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a;
  if (b.closest("summary")) e.preventDefault(); // un botón en el título de un panel no lo pliega
  try {
    if (a === "google"){ await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } }); return; }
    if (a === "login"){ ingresoAca = true; const r = await sb.auth.signInWithPassword({ email: document.getElementById("lgMail").value.trim(), password: document.getElementById("lgPass").value }); if (r.error){ ingresoAca = false; toast("Mail o contraseña incorrectos."); } return; }
    if (a === "logout"){ await sb.auth.signOut(); return; }
    if (a === "closeDrawer"){ closeDrawer(); return; }
    if (a === "uSearch"){ S.q = document.getElementById("uQ").value.trim(); searchUsers(); return; }
    if (a === "role"){ if (!await confirmar(b.dataset.v === "coach" ? "¿Pasar esta cuenta a coach?" : "¿Pasar esta cuenta a alumno?")) return; await rpc("admin_set_role", { uid: b.dataset.id, p_role: b.dataset.v }); toast("Rol cambiado"); openUser(b.dataset.id); searchUsers(); return; }
    if (a === "unlink"){ if (!await confirmar("¿Desvincular a este alumno de su coach?")) return; await rpc("admin_unlink", { uid: b.dataset.id }); toast("Desvinculado"); openUser(b.dataset.id); searchUsers(); return; }
    if (a === "admin"){ const on = b.dataset.v === "1"; if (!await confirmar(on ? "¿Hacer administrador a esta cuenta? Va a poder ver y cambiar todo el panel." : "¿Quitarle el acceso al panel?")) return; await rpc("admin_set_admin", { uid: b.dataset.id, on_off: on }); toast(on ? "Ahora es administrador" : "Ya no es administrador"); openUser(b.dataset.id); searchUsers(); return; }
    if (a === "delete"){
      const t = await pedir("Vas a eliminar la cuenta de " + b.dataset.name + " y TODOS sus datos. No se puede deshacer.\n\nSi tiene una suscripción en Mercado Pago, se cancela.\n\nEscribí ELIMINAR para confirmar:", "", { titulo: "Eliminar cuenta", ok: "Eliminar" });
      if (t !== "ELIMINAR") return;
      b.disabled = true; await fn({ action: "eliminar", user_id: b.dataset.id }); toast("Cuenta eliminada"); closeDrawer(); searchUsers(); return;
    }
    if (a === "pmMeses"){ const c = (S.coaches || []).find(x => x.id === b.dataset.id); const u = document.getElementById("pmUntil"); if (c && u){ u.value = hastaMeses(c, parseInt(b.dataset.m, 10) || 1); u.dispatchEvent(new Event("change")); } return; }
    if (a === "pmSave"){
      const plan = document.getElementById("pmPlan").value, max = parseInt(document.getElementById("pmMax").value, 10) || PLAN_MAX[plan], until = document.getElementById("pmUntil").value;
      if (!until){ toast("Elegí hasta qué fecha pagó."); return; }
      const menos = max < PLAN_MAX[plan] ? "\n\nOjo: el " + planTxt(plan) + " es para " + PLAN_MAX[plan] + " alumnos y le vas a dejar " + max + " como máximo." : "";
      if (!await confirmar("¿Habilitar el " + planTxt(plan) + " (" + max + " alumnos) hasta el " + fmtD(until + "T12:00:00") + "?" + menos)) return;
      await rpc("admin_set_paid", { cid: b.dataset.id, p_plan: plan, p_max: max, p_until: until });
      toast("Pago cargado"); closeDrawer(); afterCoach(); return;
    }
    if (a === "pmClear"){
      // Si la prueba gratis sigue vigente, admin_clear_paid lo devuelve a la prueba (cobro-manual.sql).
      const c = (S.coaches || []).find(x => x.id === b.dataset.id), prueba = c && c.trial_ends_at && new Date(c.trial_ends_at) > new Date();
      if (!await confirmar(prueba ? "¿Cortar el pago ahora? Vuelve a la prueba gratis (hasta 10 alumnos) hasta el " + lastDay(c.trial_ends_at) + "; después queda sin plan."
        : "¿Cortar el pago ahora? Queda sin plan (sus alumnos siguen usando la app, pero él no ve sus fichas).")) return;
      await rpc("admin_clear_paid", { cid: b.dataset.id }); toast("Pago cortado"); closeDrawer(); afterCoach(); return;
    }
    if (a === "trSave"){
      const until = document.getElementById("trUntil").value, max = parseInt(document.getElementById("trMax").value, 10) || 10;
      if (!until){ toast("Elegí hasta qué fecha es la prueba."); return; }
      if (!await confirmar("¿Prueba gratis hasta el " + fmtD(until + "T12:00:00") + ", con " + max + " alumnos como máximo?")) return;
      await rpc("admin_set_trial", { cid: b.dataset.id, p_until: until, p_max: max });
      toast("Prueba guardada"); closeDrawer(); afterCoach(); return;
    }
    if (a === "plan"){
      const mode = b.dataset.mode, max = document.getElementById("ctMax");
      const msg = { cortesia: "¿Darle cortesía (gratis) con tope de " + (max && max.value) + " alumnos?", sin_cortesia: "¿Quitarle la cortesía? Vuelve a prueba (si ya venció, tiene que pagar)." }[mode];
      if (!await confirmar(msg)) return;
      await rpc("admin_set_plan", { cid: b.dataset.id, mode, p_max: max ? parseInt(max.value, 10) || 10 : null, p_days: null });
      toast("Listo"); closeDrawer(); afterCoach(); return;
    }
    if (a === "mtab"){ if (Object.values(S.drafts).some(v => v.trim()) && !await confirmar("Tenés una respuesta sin mandar. ¿Cambiar de lista igual? (queda guardada si el mensaje aparece en la otra lista)")) return; S.msgTab = b.dataset.v; loadContacto(); return; }
    if (a === "mread"){ markMsg(b); return; }
    if (a === "mreply"){ const c = b.closest("[data-msg]"), r = c.querySelector(".msg-reply"); r.hidden = false; c.querySelector(".msg-acts").hidden = true; S.drafts[c.dataset.msg] = S.drafts[c.dataset.msg] || ""; r.querySelector("textarea").focus(); return; }
    if (a === "mcancel"){ const c = b.closest("[data-msg]"); delete S.drafts[c.dataset.msg]; c.querySelector(".msg-reply").hidden = true; c.querySelector(".msg-acts").hidden = false; return; }
    if (a === "msend"){ sendReply(b); return; }
    if (a === "rtab"){ S.repTab = b.dataset.v; loadReportes(); return; }
    if (a === "repReview"){ reviewRep(b); return; }
    if (a === "repUser"){ openUser(b.dataset.id); return; }
    if (a === "toCoach"){
      const id = b.dataset.id, dr = b.closest(".drawer");
      if (!S.coaches){ try { S.coaches = await rpc("admin_coaches"); } catch (e) { toast(errMsg(e)); return; } }
      if (dr && !dr.isConnected) return; // cerró la ficha mientras se traían los coaches
      openCoach(id); return;
    }
    if (a === "ufilt"){ S.uFilter = b.dataset.v; paintUsers(); return; }
    if (a === "usort"){ const k = b.dataset.k, so = S.uSort; S.uSort = { k, dir: so && so.k === k && so.dir === "asc" ? "desc" : "asc" }; paintUsers(); return; }
    if (a === "ptab"){ S.prodTab = b.dataset.v; loadProductos(); return; }
    if (a === "rqKind"){ S.reqKind = b.dataset.v; loadPedidos(); return; }
    if (a === "rqPublish"){ publishReq(b); return; }
    if (a === "rqReject"){ rejectReq(b); return; }
    if (a === "rqIA"){ leerIA(b); return; }
    if (a === "iaOn"){ iaGuardar(b, { activa: b.getAttribute("aria-checked") !== "true" }, b.getAttribute("aria-checked") === "true" ? "IA apagada" : "IA prendida"); return; }
    if (a === "iaFn"){
      const k = b.dataset.k, on = b.getAttribute("aria-checked") !== "true";
      // Las de la app: las ve cualquiera que acepte el aviso. Se avisa antes de prenderlas.
      if (on && k === "plato" && !await confirmar(`¿Prender «Foto del plato» en la app? Le aparece en Comida a cada persona con sesión; antes del primer uso acepta el aviso. Cada uso gasta menos de un centavo de los créditos, con los topes por persona de abajo.`, { titulo: "Prender en la app", ok: "Prender" })) return;
      iaGuardar(b, { funciones: { [k]: on } }, "Guardado ✓"); return;
    }
    if (a === "iaModelo"){ const v = document.getElementById("iaModelo").value; iaGuardar(b, { modelos: { etiqueta: v || null } }, "Modelo guardado ✓"); return; }
    if (a === "iaDesde"){ const v = document.getElementById("iaDesde").value; if (!v) return toast("Elegí la fecha."); iaGuardar(b, { pedidos_desde: desdePolitica(v) }, "Fecha guardada ✓"); return; }
    if (a === "iaAncla"){ iaAncla(b); return; }
    if (a === "iaRetry"){ b.disabled = true; S.ia = await rpc("admin_ia_reintentar"); toast("Listo: la IA vuelve a andar."); paintIA('[data-a="iaOn"]'); return; }
    if (a === "iaTopes"){ iaTopes(b); return; }
    if (a === "iaPlusOn"){
      const on = b.getAttribute("aria-checked") !== "true", pl = (S.ia && S.ia.plus) || {};
      if (on && !iaComidaOn(S.ia)) return toast("Antes de prender IA Plus, prendé la IA y la foto del plato o «Contame qué comiste».");
      if (on && !await confirmar(`¿Prender IA Plus? Desde ahora, la foto del plato y «Contame qué comiste» son gratis hasta ${n0(pl.gratis_semana)} usos por semana, y se ofrece IA Plus: en la web por ${money(pl.precio_ars)} al mes con Mercado Pago y en el iPhone con Apple (si el producto ya está aprobado en App Store Connect).`, { titulo: "Prender IA Plus", ok: "Prender" })) return;
      iaPlusGuardar(b, { activa: on }, on ? "IA Plus prendido" : "IA Plus apagado"); return;
    }
    if (a === "iaPlusPrecio"){ const v = parseInt(String(document.getElementById("iaPlusPrecio").value).replace(/[^0-9]/g, ""), 10); if (!(v >= 100)) return toast("Poné el precio en pesos, sin centavos."); iaPlusGuardar(b, { precio_ars: v }, "Precio guardado ✓"); return; }
    if (a === "iaPlusGratis"){ const v = parseInt(document.getElementById("iaPlusGratis").value, 10); if (!(v >= 0 && v <= 100)) return toast("De 0 a 100."); iaPlusGuardar(b, { gratis_semana: v }, "Guardado ✓"); return; }
    if (a === "iaPlusSandbox"){
      const v = document.getElementById("iaPlusSandbox").value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
      if (v.length > 20 || v.some(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) return toast("Revisá los mails (hasta 20, separados por coma).");
      iaPlusGuardar(b, { sandbox: v }, "Guardado ✓"); return;
    }
    if (a === "pedidoAtendido"){
      b.disabled = true;
      try { S.pedidosBaja = await rpc("admin_pedido_baja_atendido", { p_id: Number(b.dataset.id) }); toast("Listo ✓"); } catch (e) { b.disabled = false; return toast(errMsg(e)); }
      paintIA(); return;
    }
    if (a === "iaPlusDar"){
      const mail = document.getElementById("iaPlusMail").value.trim(), hasta = document.getElementById("iaPlusHasta").value, nota = document.getElementById("iaPlusNota").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return toast("Poné el mail de la cuenta.");
      if (!hasta) return toast("Elegí hasta qué día.");
      iaPlusLista(b, "admin_ia_plus_dar", { p_email: mail, p_hasta: hasta, p_nota: nota || null }, "IA Plus dado ✓"); return;
    }
    if (a === "iaPlusQuitar"){ if (!await confirmar("¿Sacarle el IA Plus dado a mano? Lo pagado con Mercado Pago o Apple sigue.", { titulo: "Sacar IA Plus", ok: "Sacar" })) return; iaPlusLista(b, "admin_ia_plus_quitar", { p_uid: b.dataset.id }, "Listo ✓"); return; }
    if (a === "psave"){ saveProd(b); return; }
    if (a === "pdel"){ deleteProd(b); return; }
    if (a === "pfind"){ const q = document.getElementById("pQ"); S.prodQ = q ? q.value.trim() : ""; loadProductos(); return; }
    if (a === "padd"){ S.prodAdding = !S.prodAdding; paintAdd(); return; }
    if (a === "paddCancel"){ S.prodAdding = false; paintAdd(); return; }
    if (a === "paddSave"){ addProd(b); return; }
    if (a === "zoom"){ const z = document.createElement("div"); z.className = "zoom"; z.setAttribute("role", "dialog"); z.setAttribute("aria-label", "Foto (tocá o Esc para cerrar)"); z.innerHTML = `<img src="${esc(b.dataset.url)}" alt="${esc((b.querySelector("img") || {}).alt || "")}">`; z.onclick = () => z.remove(); document.body.appendChild(z); return; }
    if (a === "avT"){ document.querySelectorAll("#avT button").forEach(x => x.classList.toggle("on", x === b)); return; }
    if (a === "avSend"){ sendAviso(b); return; }
    if (a === "cfgSave"){ saveConfig(b); return; }
    if (a === "gNew"){ openGoal(null); return; }
    if (a === "tAdd"){ addTask(b); return; }
    if (a === "tDone"){ doneTask(b); return; }
    if (a === "tSave"){ saveTask(b); return; }
    if (a === "tDel"){ deleteTask(b); return; }
    if (a === "toTasks"){ const d = openPanel("hTasksB"); if (d) d.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (a === "foldAll"){ foldAll(b.dataset.v === "1"); return; }
    if (a === "gSave"){ saveGoal(b); return; }
    if (a === "gDel"){ deleteGoal(b); return; }
    if (a === "fTab"){ S.finTab = b.dataset.v; finTabs(); return; }
    if (a === "fCost"){ openCost(null); return; }
    if (a === "fCostSave"){ saveCost(b); return; }
    if (a === "fCostDel"){ deleteCost(b); return; }
    if (a === "fSave"){ saveFinSettings(b); return; }
    if (a === "fDolarSave"){ saveDolar(b); return; }
    if (a === "fTodo"){ finTodo(b.dataset.v, Number(b.dataset.id), null, b); return; }
    if (a === "fTodoDel"){ if (!await confirmar("¿Borrar este pendiente?")) return; finTodo("borrar", Number(b.dataset.id), null, b); return; }
    if (a === "fTodoAdd"){ const i = document.getElementById("fTodoIn"), t = i.value.trim(); if (!t) return toast("Escribí el pendiente."); finTodo("nuevo", null, t, b); return; }
  } catch (err) { b.disabled = false; toast(errMsg(err)); }
});

// Fechas en día/mes/año. El <input type="date"> sale en el orden del idioma del navegador (en
// inglés, mes/día): a cada uno se le pone adelante un campo dd/mm/aaaa y un botón que abre el
// calendario. El valor sigue en el input original (aaaa-mm-dd), así el resto del panel no cambia.
const isoToDmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; };
export function dmyToIso(s){
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\s*$/.exec(s || ""); if (!m) return "";
  const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return "";
  return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
const CAL_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';
function dayFirst(inp){
  inp.dataset.df = "1";
  const wrap = document.createElement("span"); wrap.className = "dfield";
  inp.parentNode.insertBefore(wrap, inp);
  const txt = document.createElement("input");
  txt.type = "text"; txt.className = inp.className; txt.id = (inp.id || "fecha") + "Txt";
  txt.inputMode = "numeric"; txt.autocomplete = "off"; txt.placeholder = "dd/mm/aaaa"; txt.value = isoToDmy(inp.value);
  // La etiqueta del campo pasa al que se ve (el nativo queda oculto); sin etiqueta, un nombre genérico.
  const lbls = inp.id ? document.querySelectorAll(`label[for="${CSS.escape(inp.id)}"]`) : [];
  lbls.forEach(l => { l.htmlFor = txt.id; });
  if (inp.getAttribute("aria-label")) txt.setAttribute("aria-label", inp.getAttribute("aria-label"));
  else if (!lbls.length && !inp.closest("label")) txt.setAttribute("aria-label", "Fecha (día/mes/año)");
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "dfield-cal"; btn.title = "Elegir en el calendario"; btn.setAttribute("aria-label", "Elegir en el calendario"); btn.innerHTML = CAL_SVG;
  wrap.append(txt, btn, inp);
  inp.classList.add("dfield-native"); inp.tabIndex = -1; inp.setAttribute("aria-hidden", "true");
  txt.addEventListener("input", () => { const v = dmyToIso(txt.value); inp.value = v; txt.classList.toggle("bad", !!txt.value.trim() && !v); });
  txt.addEventListener("blur", () => { if (inp.value) txt.value = isoToDmy(inp.value); });
  inp.addEventListener("change", () => { txt.value = isoToDmy(inp.value); txt.classList.remove("bad"); });
  btn.addEventListener("click", () => { try { inp.showPicker(); } catch (e) { txt.focus(); } });
}
const dayFirstAll = () => document.querySelectorAll('input[type="date"]:not([data-df])').forEach(dayFirst);
new MutationObserver(dayFirstAll).observe(document.body, { childList: true, subtree: true });
dayFirstAll();

boot();
