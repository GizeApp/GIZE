// Panel de administrador de GIZE (gize.ar/admin). Página aparte de la app: se entra con la
// cuenta de GIZE y solo pasan las cuentas administradoras (public.app_admins). Todo lo que
// muestra y cambia pasa por funciones de la base que primero chequean que seas admin
// (supabase/admin.sql) o por la función «admin» (Mercado Pago, avisos, borrar cuentas), y
// cada cambio queda en el registro de acciones.
const SB_URL = "https://wegptuzhsrwppbknqstf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlZ3B0dXpoc3J3cHBia25xc3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDkxODgsImV4cCI6MjA5ODU4NTE4OH0.pWBes8juiNcCrFG377w_Ga9IQ4EE37p5AJwUpYs2k8Q";
const REPO = "GizeApp/gize";
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { flowType: "implicit", detectSessionInUrl: true } });

const $root = document.getElementById("root");
const S = { user: null, view: "resumen", overview: null, users: null, q: "", coaches: null, prodTab: "pendientes", prods: null, urls: {}, audit: null, backups: null, config: null, msgTab: "nuevos", msgs: null, unread: 0, drafts: {}, sending: false };
const SECTIONS = [["resumen", "Resumen"], ["contacto", "Mensajes"], ["usuarios", "Usuarios"], ["coaches", "Coaches y pagos"], ["productos", "Productos"], ["avisos", "Avisos"], ["seguridad", "Seguridad y sistema"]];

// ---------- utilidades ----------
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = v => parseFloat(String(v == null ? "" : v).replace(",", ".")) || 0;
const n0 = v => Math.round(Number(v) || 0).toLocaleString("es-AR");
const money = v => "$" + n0(v);
const fmtD = d => d ? new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const fmtDT = d => d ? new Date(d).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
function ago(d){
  if (!d) return "nunca";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 3600) return "hace " + Math.max(1, Math.round(s / 60)) + " min";
  if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
  if (s < 86400 * 45) return "hace " + Math.round(s / 86400) + " días";
  return fmtD(d);
}
function toast(msg){ const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
async function rpc(fn, args){ const r = await sb.rpc(fn, args || {}); if (r.error) throw r.error; return r.data; }
async function fn(body){
  const r = await sb.functions.invoke("admin", { body });
  if (r.error){ let msg = r.error.message; try { const j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} throw new Error(msg); }
  if (r.data && r.data.error) throw new Error(r.data.error);
  return r.data;
}
const errMsg = e => (e && (e.message || e.error_description)) || "Algo salió mal.";

// ---------- entrada ----------
function gate(msg, withLogin){
  $root.innerHTML = `<div class="gate"><img src="../brand/logo/gize-firma-horizontal.svg" alt="GIZE"><p>${msg}</p>
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
  S.user = data && data.session ? data.session.user : null;
  if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname);
  if (!S.user) return gate("Panel de administración de GIZE. Entrá con tu cuenta.", true);
  let ok = false; try { ok = await rpc("is_app_admin"); } catch (e) {}
  if (!ok) return gate("La cuenta <b>" + esc(S.user.email) + "</b> no es administradora de GIZE.", false);
  const v = (location.hash || "").replace("#", ""); if (SECTIONS.some(s => s[0] === v)) S.view = v;
  shell(); go(S.view);
  refreshUnread(); setInterval(refreshUnread, 60000);
}
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !S.user) boot(); if (ev === "SIGNED_OUT") { S.user = null; gate("Cerraste la sesión.", true); } });

// ---------- estructura ----------
function shell(){
  $root.innerHTML = `<div class="shell"><nav class="side">
      <img src="../brand/logo/gize-firma-horizontal.svg" alt="GIZE"><div class="side-sub">Administración</div>
      ${SECTIONS.map(([k, l]) => `<button class="nav" data-go="${k}">${l}${k === "productos" ? '<i id="navPend" hidden></i>' : k === "contacto" ? '<i id="navMsg" hidden></i>' : ""}</button>`).join("")}
      <div class="side-foot">${esc(S.user.email)}<br><button data-a="logout">Salir</button> · <a href="../app/">Ir a la app</a></div>
    </nav><main class="main" id="main"></main></div>`;
}
function go(view){
  S.view = view; history.replaceState(null, "", "#" + view);
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("on", b.dataset.go === view));
  ({ resumen: loadResumen, contacto: loadContacto, usuarios: loadUsuarios, coaches: loadCoaches, productos: loadProductos, avisos: loadAvisos, seguridad: loadSeguridad })[view]();
}
const main = () => document.getElementById("main");
function page(title, lead, body){ main().innerHTML = `<div class="h1">${title}</div><div class="lead">${lead}</div>${body}`; }
function setPend(n){ const i = document.getElementById("navPend"); if (i){ i.hidden = !n; i.textContent = n; } }
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
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshUnread(); });

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

// ---------- Resumen ----------
async function loadResumen(){
  page("Resumen", "Cómo viene GIZE: usuarios, uso y suscripciones.", '<div class="empty">Cargando…</div>');
  try { S.overview = await rpc("admin_overview"); } catch (e) { return page("Resumen", "", `<div class="empty">${esc(errMsg(e))}</div>`); }
  const o = S.overview; setPend(o.pending);
  const k = (v, l, sub, hi) => `<div class="kpi${hi ? " hi" : ""}"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const versions = (o.versions || []).map(v => `<tr><td>${esc(v.platform === "android" ? "Android" : v.platform === "ios" ? "iPhone" : v.platform === "web" ? "Web" : v.platform)}</td><td>${esc(v.version)}</td><td>${n0(v.n)}</td></tr>`).join("");
  page("Resumen", "Cómo viene GIZE: usuarios, uso y suscripciones.", `
    <div class="grid kpis">
      ${k(n0(o.users), "Usuarios", "+" + n0(o.new7) + " esta semana · +" + n0(o.new30) + " en 30 días", true)}
      ${k(n0(o.active7), "Activos en 7 días", "entrenaron, cargaron comida o abrieron la app")}
      ${k(n0(o.sessions7), "Entrenos en 7 días")}
      ${k(n0(o.coaches), "Coaches", n0(o.clients) + " alumnos · " + n0(o.linked) + " con coach")}
      ${k(money(o.mrr), "Ingreso mensual", n0(o.paid) + " suscripción" + (o.paid === 1 ? "" : "es") + " al día", true)}
      ${k(n0(o.trial), "Coaches en prueba", n0(o.courtesy) + " de cortesía")}
      ${k(n0(o.overdue), "Coaches sin pagar", "prueba vencida y sin pago al día")}
      ${k(n0(o.products), "Productos en la base", n0(o.pending) + " para revisar")}
    </div>
    <div class="grid two">
      <div class="card"><div class="sec-t">Usuarios nuevos por semana</div><div class="sec-s">Últimas 12 semanas</div>${columns(o.signups || [], "usuarios nuevos")}</div>
      <div class="card"><div class="sec-t">Entrenos guardados por semana</div><div class="sec-s">Últimas 12 semanas</div>${columns(o.training || [], "entrenos")}</div>
    </div>
    <div class="card" style="margin-top:12px"><div class="sec-t">Versiones en uso</div><div class="sec-s">Usuarios que abrieron la app en los últimos 30 días</div>
      ${versions ? `<div class="tscroll"><table class="table"><thead><tr><th>Plataforma</th><th>Versión</th><th>Usuarios</th></tr></thead><tbody>${versions}</tbody></table></div>` : '<div class="empty">Todavía no hay datos: se completan a medida que la gente abre la app.</div>'}
    </div>`);
}

// ---------- Usuarios ----------
async function loadUsuarios(){
  page("Usuarios", "Buscá por nombre o mail. Tocá una fila para ver la ficha y las acciones.", `
    <div class="search"><input class="in" id="uQ" placeholder="Nombre o mail…" value="${esc(S.q)}"><button class="btn blue" data-a="uSearch">Buscar</button></div>
    <div class="card"><div id="uList" class="empty">Cargando…</div></div>`);
  searchUsers();
}
async function searchUsers(){
  const box = document.getElementById("uList"); if (!box) return;
  box.className = "empty"; box.textContent = "Cargando…";
  try { S.users = await rpc("admin_users", { q: S.q }); } catch (e) { box.textContent = errMsg(e); return; }
  if (!S.users.length){ box.textContent = "Sin resultados."; return; }
  box.className = "tscroll";
  box.innerHTML = `<table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th>Coach</th><th>Alta</th><th>Última vez</th><th>App</th></tr></thead><tbody>${S.users.map(u => `
    <tr class="row" data-user="${esc(u.id)}"><td><b>${esc(u.full_name || "Sin nombre")}</b>${u.is_admin ? ' <span class="pill blue">admin</span>' : ""}<div class="muted small">${esc(u.email)}</div></td>
      <td>${u.role === "coach" ? '<span class="pill ok">Coach</span>' : '<span class="pill">Alumno</span>'}</td>
      <td class="muted">${esc(u.coach_name || "—")}</td><td class="muted">${fmtD(u.created_at)}</td>
      <td class="muted">${ago(u.last_seen_at || u.last_sign_in_at)}</td><td class="muted small">${esc(platformTxt(u.app_platform, u.app_version))}</td></tr>`).join("")}</tbody></table>`;
}
const platformTxt = (p, v) => !p ? "—" : (p === "android" ? "Android " : p === "ios" ? "iPhone " : "Web ") + (p === "web" ? "" : (v || ""));

async function openUser(id){
  drawer('<div class="empty">Cargando…</div>');
  let d; try { d = await rpc("admin_user_detail", { uid: id }); } catch (e) { return drawer(`<div class="empty">${esc(errMsg(e))}</div>`); }
  if (!d) return drawer('<div class="empty">No se encontró el usuario.</div>');
  const f = (l, v) => `<div class="fact"><span>${l}</span><b>${v}</b></div>`;
  const clients = (d.clients || []);
  drawer(`<div class="h1" style="font-size:22px">${esc(d.full_name || "Sin nombre")}</div><div class="muted">${esc(d.email)}</div>
    <div class="facts">
      ${f("Rol", d.role === "coach" ? "Coach" : "Alumno")}${f("Entra con", esc(d.provider === "google" ? "Google" : d.provider === "apple" ? "Apple" : "Mail"))}
      ${f("Alta", fmtD(d.created_at))}${f("Última vez", ago(d.last_seen_at || d.last_sign_in_at))}
      ${f("App", esc(platformTxt(d.app_platform, d.app_version)))}${d.role === "coach" ? f("Alumnos", clients.length) : f("Coach", esc(d.coach ? d.coach.name || "Sin nombre" : "—"))}
      ${f("Entrenos", n0(d.sessions) + (d.last_session ? " · último " + fmtD(d.last_session) : ""))}${f("Días con comida", n0(d.food_days))}
    </div>
    ${d.role === "coach" && clients.length ? `<div class="sec-t">Alumnos</div><div class="list-mini">${clients.map(c => esc(c.name || "Sin nombre")).join(" · ")}</div>` : ""}
    <div class="sec-t" style="margin-top:18px">Acciones</div>
    <div class="row-btns">
      ${d.role === "coach" ? `<button class="btn" data-a="role" data-id="${esc(d.id)}" data-v="client">Pasar a alumno</button>` : `<button class="btn" data-a="role" data-id="${esc(d.id)}" data-v="coach">Pasar a coach</button>`}
      ${d.coach ? `<button class="btn" data-a="unlink" data-id="${esc(d.id)}">Desvincular de su coach</button>` : ""}
      ${d.is_admin ? `<button class="btn" data-a="admin" data-id="${esc(d.id)}" data-v="0">Quitar administrador</button>` : `<button class="btn" data-a="admin" data-id="${esc(d.id)}" data-v="1">Hacer administrador</button>`}
      <button class="btn bad" data-a="delete" data-id="${esc(d.id)}" data-name="${esc(d.full_name || d.email)}">Eliminar cuenta</button>
    </div>`);
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
  if (c.paid_until && new Date(c.paid_until) > new Date() && c.plan !== "trial") return '<span class="pill ok">Al día</span>';
  if (c.trial_ends_at && new Date(c.trial_ends_at) > new Date()) return `<span class="pill warn">Prueba hasta ${fmtD(c.trial_ends_at)}</span>`;
  return '<span class="pill bad">Sin pagar</span>';
}
const mpTxt = s => ({ authorized: "activa", paused: "pausada", cancelled: "cancelada", pending: "pendiente" }[s] || s || "—");
const planTxt = p => ({ trial: "Prueba", p10: "Hasta 10", p25: "Hasta 25", p50: "Hasta 50", p100: "Gimnasio (100)", cortesia: "Cortesía" }[p] || p || "—");
async function loadCoaches(){
  page("Coaches y pagos", "Plan, alumnos y estado del pago de cada coach. Tocá uno para ver sus cobros y darle cortesía o más días de prueba.", '<div class="card"><div id="cList" class="empty">Cargando…</div></div>');
  const box = document.getElementById("cList");
  try { S.coaches = await rpc("admin_coaches"); } catch (e) { box.textContent = errMsg(e); return; }
  if (!S.coaches.length){ box.textContent = "Todavía no hay coaches."; return; }
  box.className = "tscroll";
  box.innerHTML = `<table class="table"><thead><tr><th>Coach</th><th>Plan</th><th>Alumnos</th><th>Estado</th><th>Mercado Pago</th><th>Paga</th></tr></thead><tbody>${S.coaches.map(c => `
    <tr class="row" data-coach="${esc(c.id)}"><td><b>${esc(c.full_name || "Sin nombre")}</b><div class="muted small">${esc(c.email)}</div></td>
      <td>${esc(planTxt(c.plan))}${c.pending_plan ? `<div class="muted small">eligió ${esc(planTxt(c.pending_plan))}</div>` : ""}</td>
      <td>${n0(c.clients)} <span class="muted">/ ${n0(c.max_clients)}</span></td><td>${coachState(c)}</td>
      <td class="muted small">${c.has_mp ? esc(mpTxt(c.mp_status)) : "—"}</td>
      <td>${c.price ? money(c.price) : "—"}</td></tr>`).join("")}</tbody></table>`;
}
async function openCoach(id){
  const c = (S.coaches || []).find(x => x.id === id); if (!c) return;
  drawer(`<div class="h1" style="font-size:22px">${esc(c.full_name || "Sin nombre")}</div><div class="muted">${esc(c.email)}</div>
    <div class="facts">
      <div class="fact"><span>Plan</span><b>${esc(planTxt(c.plan))}</b></div><div class="fact"><span>Estado</span><b>${coachState(c)}</b></div>
      <div class="fact"><span>Alumnos</span><b>${n0(c.clients)} de ${n0(c.max_clients)}</b></div><div class="fact"><span>Pago al día hasta</span><b>${fmtD(c.paid_until)}</b></div>
      <div class="fact"><span>Prueba hasta</span><b>${fmtD(c.trial_ends_at)}</b></div><div class="fact"><span>Mercado Pago</span><b>${c.has_mp ? esc(mpTxt(c.mp_status)) : "Sin suscripción"}</b></div>
    </div>
    <div class="sec-t">Cobros de Mercado Pago</div><div id="pays" class="list-mini">${c.has_mp ? "Cargando…" : "No tiene una suscripción en Mercado Pago."}</div>
    <div class="sec-t" style="margin-top:18px">Cortesía o prueba</div>
    <div class="sec-s">No cambia una suscripción paga en curso: eso lo maneja el coach desde su cuenta.</div>
    ${c.plan === "cortesia" ? `<button class="btn" data-a="plan" data-id="${esc(c.id)}" data-mode="sin_cortesia">Quitar la cortesía</button>` :
      `<label class="lbl">Cortesía: gratis, con tope de alumnos</label><div class="search"><input class="in" id="ctMax" type="number" min="1" value="${Math.max(10, c.max_clients || 10)}"><button class="btn blue" data-a="plan" data-id="${esc(c.id)}" data-mode="cortesia">Dar cortesía</button></div>`}
    <label class="lbl">Sumar días de prueba</label><div class="search"><input class="in" id="trDays" type="number" min="1" value="14"><button class="btn" data-a="plan" data-id="${esc(c.id)}" data-mode="trial">Extender prueba</button></div>`);
  if (!c.has_mp) return;
  const box = document.getElementById("pays");
  try {
    const r = await fn({ action: "pagos", coach_id: id });
    const st = s => ({ approved: '<span class="pill ok">Cobrado</span>', rejected: '<span class="pill bad">Rechazado</span>', pending: '<span class="pill warn">Pendiente</span>', processed: '<span class="pill ok">Cobrado</span>', scheduled: '<span class="pill">Programado</span>', recycling: '<span class="pill warn">Reintentando</span>' }[s] || `<span class="pill">${esc(s || "—")}</span>`);
    box.innerHTML = (r.subscription ? `<div class="muted" style="margin-bottom:8px">Suscripción ${esc(mpTxt(r.subscription.status))} · ${money(r.subscription.amount)} por mes${r.subscription.next ? " · próximo cobro " + fmtD(r.subscription.next) : ""}</div>` : "") +
      ((r.payments || []).length ? `<table class="table"><tbody>${r.payments.map(p => `<tr><td>${fmtD(p.date)}</td><td>${money(p.amount)}</td><td>${st(p.status)}</td></tr>`).join("")}</tbody></table>` : "Todavía no hay cobros.");
  } catch (e) { box.textContent = "No se pudieron traer los cobros: " + errMsg(e); }
}

// ---------- Mensajes (contacto@gize.ar) ----------
// Los mails que llegan a contacto@gize.ar (supabase/functions/contacto). Se responden desde
// acá: la respuesta sale de contacto@gize.ar, así nadie ve el mail personal de quien contesta.
async function loadContacto(){
  page("Mensajes", "Lo que la gente manda a <b>contacto@gize.ar</b>. Cuando llega uno nuevo, les avisa a los administradores que tienen las notificaciones prendidas.", `
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
  box.className = "grid";
  box.innerHTML = S.msgs.map(m => `<div class="card msg${m.read_at ? "" : " unread"}" data-msg="${esc(m.id)}">
      <div class="msg-h"><div><b>${esc(m.from_name || m.from_email)}</b>${m.from_name ? ` <span class="muted small">&lt;${esc(m.from_email)}&gt;</span>` : ""}</div>
        <span class="muted small">${fmtDT(m.created_at)}</span></div>
      ${m.auth_dmarc === "pass" || m.body_missing ? "" : '<div class="msg-warn">⚠ Remitente sin verificar: puede ser otra persona haciéndose pasar por esta dirección. No borres cuentas ni des datos por un mail así; pedí que lo confirme desde la app.</div>'}
      <div class="msg-s">${esc(m.subject || "(sin asunto)")}${m.to_email && m.to_email !== "contacto@gize.ar" ? ` <span class="pill">${esc(m.to_email)}</span>` : ""}${m.reply_to ? ` <span class="pill blue">responder a ${esc(m.reply_to)}</span>` : ""}${m.attachments ? ` <span class="pill">${m.attachments} adjunto${m.attachments === 1 ? "" : "s"}</span>` : ""}${m.replied_at ? ' <span class="pill ok">Respondido</span>' : ""}</div>
      <div class="msg-b">${m.body_missing ? '<span class="muted">Todavía no se pudo leer el texto de este mail (se vuelve a intentar solo).</span>' : esc(m.body || "(vacío)")}</div>
      ${m.replied_at ? `<div class="msg-r"><div class="muted small">Respuesta de ${esc(m.replied_by_name || "un administrador")} · ${fmtDT(m.replied_at)}</div>${esc(m.reply || "")}</div>` : ""}
      <div class="msg-reply" hidden><textarea class="in" maxlength="10000" placeholder="Escribí la respuesta. Le llega desde contacto@gize.ar, con el mensaje original citado abajo."></textarea>
        <div class="row-btns"><button class="btn" data-a="mcancel">Cancelar</button><button class="btn pri" data-a="msend">Enviar respuesta</button></div></div>
      <div class="row-btns msg-acts"><button class="btn blue" data-a="mreply">${m.replied_at ? "Responder otra vez" : "Responder"}</button>
        <button class="btn" data-a="mread" data-v="${m.read_at ? "0" : "1"}">${m.read_at ? "Marcar sin leer" : "Marcar como leído"}</button></div>
    </div>`).join("");
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
  if (!confirm("¿Mandar la respuesta a " + (m ? (m.reply_to || m.from_email) : "esta persona") + "?")) return;
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

// ---------- Productos ----------
async function loadProductos(){
  page("Productos", "Base compartida: lo que cargan los usuarios al escanear. Compará con la foto de la tabla, corregí y verificá.", `
    <div class="seg">${[["pendientes", "Pendientes"], ["reportados", "Reportados"], ["ocultos", "Ocultos"]].map(([k, l]) => `<button class="${S.prodTab === k ? "on" : ""}" data-a="ptab" data-v="${k}">${l}</button>`).join("")}</div>
    <div id="pList" class="empty">Cargando…</div>`);
  const box = document.getElementById("pList");
  try { S.prods = await rpc("admin_products", { kind: S.prodTab }); } catch (e) { box.textContent = errMsg(e); return; }
  paintProds();
  const paths = S.prods.map(p => p.photo_path).filter(x => x && !S.urls[x]);
  if (paths.length){ try { const r = await sb.storage.from("productos").createSignedUrls(paths, 3600); (r.data || []).forEach(x => { if (x.signedUrl) S.urls[x.path] = x.signedUrl; }); } catch (e) {} paintProds(); }
  try { const o = await rpc("admin_overview"); setPend(o.pending); } catch (e) {}
}
function paintProds(){
  const box = document.getElementById("pList"); if (!box) return;
  if (!S.prods.length){ box.className = "empty"; box.textContent = "No hay nada para revisar acá."; return; }
  box.className = "grid";
  box.innerHTML = S.prods.map(p => {
    const u = S.urls[p.photo_path];
    const ph = p.photo_path ? (u ? `<button class="prod-ph" data-a="zoom" data-url="${esc(u)}"><img src="${esc(u)}" alt="Tabla nutricional"></button>` : '<div class="prod-ph none">Cargando foto…</div>') : `<div class="prod-ph none">Sin foto${p.source === "off" ? "<br>(Open Food Facts)" : ""}</div>`;
    const inp = (k, v, l, w) => `<label class="${w || ""}">${l}<input data-k="${k}" value="${esc(v == null ? "" : v)}"></label>`;
    return `<div class="card" data-prod="${esc(p.id)}"><div class="prod">${ph}<div>
      <b>${esc(p.code || "sin código")}</b> <span class="muted small">· ${p.source === "off" ? "Open Food Facts" : "cargado por un usuario"} · ${n0(p.uses)} usos · ${fmtD(p.created_at)}</span>
      ${p.reports ? `<div class="small" style="color:var(--warn);margin-top:4px">⚠ ${p.reports} reporte${p.reports === 1 ? "" : "s"}: ${esc(p.reasons || "")}</div>` : ""}
      <div class="muted small" style="margin-top:4px">Calorías según los macros: ${Math.round(num(p.protein) * 4 + num(p.carbs) * 4 + num(p.fat) * 9)} · valores cada 100 ${p.unit === "ml" ? "ml" : "g"}</div>
      <div class="pgrid">${inp("name", p.name, "Nombre", "wide")}${inp("brand", p.brand, "Marca", "wide")}${inp("kcal", p.kcal, "Kcal")}${inp("protein", p.protein, "Proteína")}${inp("carbs", p.carbs, "Carbos")}${inp("fat", p.fat, "Grasas")}</div>
      <div class="row-btns">${p.hidden ? `<button class="btn" data-a="psave" data-verify="0" data-hide="0">Volver a mostrar</button><button class="btn pri" data-a="psave" data-verify="1" data-hide="0">Corregir y verificar</button>`
        : `<button class="btn bad" data-a="psave" data-verify="0" data-hide="1">Ocultar</button><button class="btn pri" data-a="psave" data-verify="1" data-hide="0">✓ Verificar</button>`}</div>
    </div></div></div>`;
  }).join("");
}
async function saveProd(btn){
  const c = btn.closest("[data-prod]"), v = k => c.querySelector(`[data-k="${k}"]`).value.trim();
  const p = S.prods.find(x => x.id === c.dataset.prod);
  const row = { p_name: v("name"), p_brand: v("brand") || null, p_kcal: num(v("kcal")), p_protein: num(v("protein")), p_carbs: num(v("carbs")), p_fat: num(v("fat")) };
  if (row.p_name.length < 2) return toast("Poné el nombre del producto.");
  if (row.p_kcal > 950 || row.p_protein > 100 || row.p_carbs > 100 || row.p_fat > 100 || row.p_protein + row.p_carbs + row.p_fat > 105) return toast("Revisá los valores: son cada 100 g o ml.");
  btn.disabled = true;
  try { await rpc("admin_product_save", Object.assign({ pid: p.id, p_unit: p.unit, p_verified: btn.dataset.verify === "1", p_hidden: btn.dataset.hide === "1" }, row)); }
  catch (e) { btn.disabled = false; return toast(errMsg(e)); }
  S.prods = S.prods.filter(x => x.id !== p.id); paintProds();
  toast(btn.dataset.hide === "1" ? "Producto oculto" : btn.dataset.verify === "1" ? "Producto verificado ✓" : "Producto visible otra vez");
}

// ---------- Avisos ----------
async function loadAvisos(){
  page("Avisos", "Mandá una notificación a los usuarios y manejá el cartel de actualización de la app.", '<div class="empty">Cargando…</div>');
  try { const r = await sb.from("app_config").select("value").eq("key", "version").maybeSingle(); S.config = (r.data && r.data.value) || {}; } catch (e) { S.config = {}; }
  const vf = (pl, name) => { const c = S.config[pl] || {}; return `<div class="card"><div class="sec-t">${name}</div>
    <div class="vgrid"><label><span class="lbl">Última (número)</span><input class="in" data-v="${pl}.ultima" type="number" value="${esc(c.ultima || 0)}"></label>
    <label><span class="lbl">Nombre (ej: 1.0.7)</span><input class="in" data-v="${pl}.version" value="${esc(c.version || "")}"></label>
    <label><span class="lbl">Mínima obligatoria</span><input class="in" data-v="${pl}.minima" type="number" value="${esc(c.minima || 0)}"></label></div>
    <label><span class="lbl">Link de la tienda</span><input class="in" data-v="${pl}.tienda" value="${esc(c.tienda || "")}"></label></div>`; };
  page("Avisos", "Mandá una notificación a los usuarios y manejá el cartel de actualización de la app.", `
    <div class="grid two">
      <div class="card neon"><div class="sec-t">Notificación a los usuarios</div><div class="sec-s">Les llega a quienes activaron los avisos en su celular o computadora.</div>
        <label class="lbl">A quién</label><div class="seg" id="avT">${[["todos", "Todos"], ["coaches", "Coaches"], ["alumnos", "Alumnos"]].map(([k, l], i) => `<button class="${i ? "" : "on"}" data-a="avT" data-v="${k}">${l}</button>`).join("")}</div>
        <label class="lbl">Título (hasta 60 letras)</label><input class="in" id="avTitle" maxlength="60" placeholder="Ej: Salió la versión 1.0.7">
        <label class="lbl">Mensaje (hasta 180 letras)</label><textarea class="in" id="avBody" maxlength="180" placeholder="Ej: Superseries, resumen del entreno y mucho más. Actualizá desde Play Store."></textarea>
        <div class="preview"><img src="../icon-192.png" alt=""><div><b id="pvT">Título</b><span id="pvB">Mensaje</span></div></div>
        <div class="row-btns"><button class="btn pri" data-a="avSend">Enviar notificación</button></div></div>
      <div><div class="sec-t">Cartel de actualización</div><div class="sec-s">Subí «Última» recién cuando la versión ya esté publicada en la tienda. «Mínima» obliga a actualizar (pantalla que no se puede cerrar).</div>
        <div class="grid">${vf("android", "Android")}${vf("ios", "iPhone")}</div>
        <div class="row-btns"><button class="btn blue" data-a="cfgSave">Guardar cartel</button></div></div>
    </div>`);
}
async function sendAviso(btn){
  const target = (document.querySelector("#avT button.on") || {}).dataset.v, title = document.getElementById("avTitle").value.trim(), body = document.getElementById("avBody").value.trim();
  if (!title || !body) return toast("Completá el título y el mensaje.");
  const who = { todos: "a TODOS los usuarios", coaches: "a todos los coaches", alumnos: "a todos los alumnos" }[target];
  if (!confirm("¿Mandar esta notificación " + who + "?\n\n" + title + "\n" + body)) return;
  btn.disabled = true;
  try { const r = await fn({ action: "aviso", target, title, body }); toast("Enviada a " + n0(r.users) + " usuario" + (r.users === 1 ? "" : "s") + " (" + n0(r.devices) + " dispositivos)"); document.getElementById("avTitle").value = ""; document.getElementById("avBody").value = ""; }
  catch (e) { toast(errMsg(e)); }
  btn.disabled = false;
}
async function saveConfig(btn){
  const v = JSON.parse(JSON.stringify(S.config || {}));
  document.querySelectorAll("[data-v]").forEach(i => { const [pl, k] = i.dataset.v.split("."); v[pl] = v[pl] || {}; v[pl][k] = ["ultima", "minima"].includes(k) ? Math.max(0, parseInt(i.value, 10) || 0) : i.value.trim(); });
  for (const pl of ["android", "ios"]) if (v[pl] && v[pl].tienda && !/^https:\/\//i.test(v[pl].tienda)) return toast("El link de la tienda tiene que empezar con https://");
  if (!confirm("¿Guardar el cartel? A los usuarios con una versión más vieja que «Última» les va a aparecer.")) return;
  btn.disabled = true;
  try { await rpc("admin_set_config", { p_key: "version", p_value: v }); S.config = v; toast("Cartel guardado"); } catch (e) { toast(errMsg(e)); }
  btn.disabled = false;
}

// ---------- Seguridad y sistema ----------
async function loadSeguridad(){
  page("Seguridad y sistema", "Copias de seguridad de la base y registro de todo lo que se hace desde este panel.", `
    <div class="grid two"><div class="card"><div class="sec-t">Copias de seguridad</div><div class="sec-s">Se hacen solas todos los lunes y se prueban restaurándolas.</div><div id="bk" class="list-mini">Cargando…</div></div>
    <div class="card"><div class="sec-t">Administradores</div><div class="sec-s">Se agregan o quitan desde Usuarios → ficha → Hacer administrador.</div><div id="admins" class="list-mini">Cargando…</div></div></div>
    <div class="card" style="margin-top:12px"><div class="sec-t">Registro de acciones</div><div class="sec-s">Las últimas 100 acciones hechas desde el panel.</div><div id="aud" class="empty">Cargando…</div></div>`);
  // Con el repositorio privado GitHub no responde sin sesión: se deja el enlace a las copias.
  const bkLink = `<a href="https://github.com/${REPO}/actions/workflows/backup.yml" target="_blank" rel="noopener">Ver las copias en GitHub</a>`;
  fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/backup.yml/runs?per_page=6").then(r => { if (!r.ok) throw 0; return r.json(); }).then(j => {
    const runs = j.workflow_runs || [], box = document.getElementById("bk"); if (!box) return;
    box.innerHTML = runs.length ? `<table class="table"><tbody>${runs.map(r => `<tr><td>${fmtDT(r.created_at)}</td><td>${r.status !== "completed" ? '<span class="pill warn">En curso</span>' : r.conclusion === "success" ? '<span class="pill ok">OK</span>' : '<span class="pill bad">Falló</span>'}</td><td><a href="${esc(r.html_url)}" target="_blank" rel="noopener">ver</a></td></tr>`).join("")}</tbody></table>` : "Todavía no hay copias.";
  }).catch(() => { const box = document.getElementById("bk"); if (box) box.innerHTML = bkLink + '<div class="muted small">Hace falta entrar con la cuenta de GitHub de GIZE.</div>'; });
  rpc("admin_users", { q: "" }).then(us => { const box = document.getElementById("admins"); if (box) box.innerHTML = us.filter(u => u.is_admin).map(u => esc((u.full_name || "Sin nombre") + " · " + u.email)).join("<br>") || "—"; }).catch(() => {});
  const box = document.getElementById("aud");
  try { S.audit = await rpc("admin_audit_list", { lim: 100 }); } catch (e) { box.textContent = errMsg(e); return; }
  if (!S.audit.length){ box.textContent = "Todavía no hay acciones registradas."; return; }
  const what = a => ({ rol: "Cambió el rol a " + ((a.detail || {}).role === "coach" ? "coach" : "alumno"), desvincular: "Desvinculó de su coach", admin_si: "Hizo administrador", admin_no: "Quitó administrador",
    plan: ({ cortesia: "Dio cortesía", trial: "Extendió la prueba", sin_cortesia: "Quitó la cortesía" }[(a.detail || {}).mode] || "Cambió el plan"), config: "Cambió el cartel de actualización",
    aviso: "Mandó una notificación a " + (a.target || ""), eliminar: "Eliminó la cuenta",
    contacto_leido: "Marcó un mensaje como leído", contacto_no_leido: "Marcó un mensaje sin leer", contacto_respuesta: "Respondió un mensaje de contacto", producto_verificar: "Verificó un producto", producto_ocultar: "Ocultó un producto", producto_mostrar: "Volvió a mostrar un producto" }[a.action] || a.action);
  const extra = a => a.action === "aviso" ? (a.detail && a.detail.title) : a.action.startsWith("contacto") ? (a.detail && (a.detail.de || a.detail.a)) : a.action.startsWith("producto") ? (a.detail && a.detail.name) : a.action === "eliminar" ? (a.detail && a.detail.nombre) : (a.target_name || "");
  box.className = "tscroll";
  box.innerHTML = `<table class="table"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Sobre</th></tr></thead><tbody>${S.audit.map(a => `<tr><td class="muted">${fmtDT(a.created_at)}</td><td>${esc(a.admin_name || "—")}</td><td>${esc(what(a))}</td><td class="muted">${esc(extra(a) || "")}</td></tr>`).join("")}</tbody></table>`;
}

// ---------- acciones ----------
document.addEventListener("input", e => {
  const mr = e.target.closest && e.target.closest(".msg-reply"); if (mr) S.drafts[mr.closest("[data-msg]").dataset.msg] = e.target.value;
  if (e.target.id === "avTitle") document.getElementById("pvT").textContent = e.target.value || "Título";
  if (e.target.id === "avBody") document.getElementById("pvB").textContent = e.target.value || "Mensaje";
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "uQ"){ S.q = e.target.value.trim(); searchUsers(); } if (e.key === "Escape") closeDrawer(); });
document.addEventListener("click", async e => {
  const g = e.target.closest("[data-go]"); if (g){ closeDrawer(); go(g.dataset.go); return; }
  const tr = e.target.closest("tr[data-user]"); if (tr){ openUser(tr.dataset.user); return; }
  const tc = e.target.closest("tr[data-coach]"); if (tc){ openCoach(tc.dataset.coach); return; }
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a;
  try {
    if (a === "google"){ await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } }); return; }
    if (a === "login"){ const r = await sb.auth.signInWithPassword({ email: document.getElementById("lgMail").value.trim(), password: document.getElementById("lgPass").value }); if (r.error) toast("Mail o contraseña incorrectos."); return; }
    if (a === "logout"){ await sb.auth.signOut(); return; }
    if (a === "closeDrawer"){ closeDrawer(); return; }
    if (a === "uSearch"){ S.q = document.getElementById("uQ").value.trim(); searchUsers(); return; }
    if (a === "role"){ if (!confirm(b.dataset.v === "coach" ? "¿Pasar esta cuenta a coach?" : "¿Pasar esta cuenta a alumno?")) return; await rpc("admin_set_role", { uid: b.dataset.id, p_role: b.dataset.v }); toast("Rol cambiado"); openUser(b.dataset.id); searchUsers(); return; }
    if (a === "unlink"){ if (!confirm("¿Desvincular a este alumno de su coach?")) return; await rpc("admin_unlink", { uid: b.dataset.id }); toast("Desvinculado"); openUser(b.dataset.id); searchUsers(); return; }
    if (a === "admin"){ const on = b.dataset.v === "1"; if (!confirm(on ? "¿Hacer administrador a esta cuenta? Va a poder ver y cambiar todo el panel." : "¿Quitarle el acceso al panel?")) return; await rpc("admin_set_admin", { uid: b.dataset.id, on_off: on }); toast(on ? "Ahora es administrador" : "Ya no es administrador"); openUser(b.dataset.id); searchUsers(); return; }
    if (a === "delete"){
      const t = prompt("Vas a eliminar la cuenta de " + b.dataset.name + " y TODOS sus datos. No se puede deshacer.\n\nSi tiene una suscripción en Mercado Pago, se cancela.\n\nEscribí ELIMINAR para confirmar:");
      if (t !== "ELIMINAR") return;
      b.disabled = true; await fn({ action: "eliminar", user_id: b.dataset.id }); toast("Cuenta eliminada"); closeDrawer(); searchUsers(); return;
    }
    if (a === "plan"){
      const mode = b.dataset.mode, max = document.getElementById("ctMax"), days = document.getElementById("trDays");
      const msg = { cortesia: "¿Darle cortesía (gratis) con tope de " + (max && max.value) + " alumnos?", trial: "¿Sumarle " + (days && days.value) + " días de prueba?", sin_cortesia: "¿Quitarle la cortesía? Vuelve a prueba (si ya venció, tiene que pagar)." }[mode];
      if (!confirm(msg)) return;
      await rpc("admin_set_plan", { cid: b.dataset.id, mode, p_max: max ? parseInt(max.value, 10) || 10 : null, p_days: days ? parseInt(days.value, 10) || 14 : null });
      toast("Listo"); closeDrawer(); loadCoaches(); return;
    }
    if (a === "mtab"){ if (Object.values(S.drafts).some(v => v.trim()) && !confirm("Tenés una respuesta sin mandar. ¿Cambiar de lista igual? (queda guardada si el mensaje aparece en la otra lista)")) return; S.msgTab = b.dataset.v; loadContacto(); return; }
    if (a === "mread"){ markMsg(b); return; }
    if (a === "mreply"){ const c = b.closest("[data-msg]"), r = c.querySelector(".msg-reply"); r.hidden = false; c.querySelector(".msg-acts").hidden = true; S.drafts[c.dataset.msg] = S.drafts[c.dataset.msg] || ""; r.querySelector("textarea").focus(); return; }
    if (a === "mcancel"){ const c = b.closest("[data-msg]"); delete S.drafts[c.dataset.msg]; c.querySelector(".msg-reply").hidden = true; c.querySelector(".msg-acts").hidden = false; return; }
    if (a === "msend"){ sendReply(b); return; }
    if (a === "ptab"){ S.prodTab = b.dataset.v; loadProductos(); return; }
    if (a === "psave"){ saveProd(b); return; }
    if (a === "zoom"){ const z = document.createElement("div"); z.className = "zoom"; z.innerHTML = `<img src="${esc(b.dataset.url)}" alt="">`; z.onclick = () => z.remove(); document.body.appendChild(z); return; }
    if (a === "avT"){ document.querySelectorAll("#avT button").forEach(x => x.classList.toggle("on", x === b)); return; }
    if (a === "avSend"){ sendAviso(b); return; }
    if (a === "cfgSave"){ saveConfig(b); return; }
  } catch (err) { b.disabled = false; toast(errMsg(err)); }
});

boot();
