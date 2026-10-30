// «Armar con IA» en el panel del coach (app/screens/coach/rutina-ia.js), con Supabase y la función
// «ia» simulados (como tests/coach-planillas.test.mjs):
//   · Con «rutina» apagada no aparece nada nuevo (ni en Rutinas, ni en una rutina vacía, ni en la
//     rutina de un alumno) y nunca se llama a la función.
//   · Prendida: el botón en la franja «Con IA» de Rutinas y en una rutina vacía. El permiso sale una
//     vez: con «Ahora no» no se abre la hoja ni se llama.
//   · La hoja (#riaMount): los botones rápidos suman palabras, el aviso de datos, «Te quedan N hoy».
//     Un doble toque manda un solo pedido, que es { modo: 'rutina', descripcion } y nada más, con la
//     descripción limpia (sin mail, teléfono ni el nombre del alumno vinculado) y de 400 como mucho.
//   · El borrador abre el editor sin guardar (nombre, días y ejercicios de la lista, sin los que no
//     son de GIZE), con el cartel y la nota de la IA; «‹ Volver» pregunta; «¿Está mal?» manda
//     ia_reportar con 'rutina', el pedido limpio y el borrador; «Guardar rutina» hace un solo POST.
//   · El borrador queda en el equipo (gize_rt_draft_ria_<uid>) y vuelve después de recargar; al
//     guardarlo se borra. Cerrar sesión también lo borra.
//   · Errores en la hoja: el tope del día, «no parece un pedido de rutina» con la nota de la IA, un
//     error con «Probar de nuevo» y la IA pausada (no deja armar).
//   · Para un alumno: «Más acciones» → «Armar con IA» → «Aplicar» con el borrador («‹ Pedir otro
//     borrador» vuelve a la hoja con el mismo texto); reemplazar deja «Cambios sin guardar» y el cartel,
//     sin tocar la nube hasta «Guardar rutina».
//   · Android: el «Atrás» cierra la hoja y ningún texto habla de la prueba, el plan ni precios.
//   · La política (#ia-coach) dice que el pedido se limpia y que el borrador queda en el equipo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, configCoach } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@ejemplo.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const CLIENTES = [{ id: A1, full_name: 'Juan Pérez', role: 'client', coach_id: COACH.id }];
const ACTUAL = [{ id: 'd0', name: 'Full body', subtitle: '', exercises: [{ id: 'e0', name: 'Peso muerto convencional', sets: [{ id: 's0', target: '5', kg: '', reps: '', done: false }] }] }];
const PRENDIDA = { activa: true, funciones: { planilla: false, rutina: true }, rol: 'coach', por_gimnasio: false, permiso_rutinas: null, aviso_version: 1,
  estado: 'normal', vuelve: null, manana: '2026-10-31T03:00:00+00:00', quedan: { planilla: 30, rutina: 15 }, tope: { planilla: 30, rutina: 15, total: 60 } };
const APAGADA = { activa: false, funciones: { planilla: false, rutina: false }, rol: 'coach', motivo: null, permiso_rutinas: null, aviso_version: 1 };
const PROHIBIDO = /prueba|gratis|\bplan\b|pago|precio|tarjeta|mercado|suscrip|contrat|\$|gize\.ar(?!\/privacidad)/i;
const ANDROID = () => {
  window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } };
};
const serie = objetivo => ({ objetivo, kg: '' });
const ej = (nombre, series, o = {}) => Object.assign({ nombre, grupo: '', propio: false, dudoso: false, series, timed: false, descanso: '90 s', rir: '2', nota: '', progresion: '', ss: false }, o);
const RUTINA = { ok: true, hay_rutina: true, nombre: 'Hipertrofia · 2 días', nota: 'Supuse sesiones de 60 minutos.', modelo_nombre: 'IA', dias: [
  { nombre: 'Torso', dias: [1, 4], nota: '', ejercicios: [ej('Press plano con mancuernas', [serie('8-12'), serie('8-12'), serie('8-12')], { grupo: 'pecho' }), ej('Ejercicio inventado', [serie('10')]), ej('Remo con barra', [serie('10'), serie('10'), serie('10')], { grupo: 'espalda' })] },
  { nombre: 'Pierna', dias: [2, 5], nota: '', ejercicios: [ej('Sentadilla libre', [serie('8'), serie('8'), serie('8'), serie('8')], { grupo: 'cuadriceps' }), ej('Plancha', [serie('40 s')], { grupo: 'abdomen' })] },
] };
const NO_ES = { ok: true, hay_rutina: false, nombre: '', nota: 'Parece una dieta.', dias: [] };
const CLAVE = 'gize_rt_draft_ria_' + COACH.id;

// El panel del coach con un alumno, la IA del coach y la función «ia» simulados. o.funcion(body, S) →
// [status, json, ms].
async function pagina(base, o = {}){
  const S = { estado: Object.assign({}, o.estado || PRENDIDA), permisos: [], llamadas: [], tpls: [], tplPosts: [], rtPosts: [], reportes: [] };
  const pg = await newPage({ user: COACH, init: o.init, viewport: o.viewport, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J(CLIENTES);
      const me = { id: COACH.id, role: 'coach', full_name: 'Carla Entrenadora' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/rpc/ia_coach_estado': (r, J) => J(S.estado),
    '/rpc/ia_permiso_rutinas': (r, J, i) => { const b = JSON.parse(i.body || '{}'); S.permisos.push(b); S.estado = Object.assign({}, S.estado, { permiso_rutinas: b.p_acepta ? 'ok' : 'no' }); return J(S.estado); },
    '/rpc/ia_reportar': (r, J, i) => { S.reportes.push(JSON.parse(i.body || '{}')); return J(null); },
    '/functions/v1/ia': (r, J, i) => {
      if (i.m !== 'POST') return J({});
      const b = JSON.parse(i.body || '{}'); S.llamadas.push(b);
      const [st, js, ms] = (o.funcion || (() => [200, RUTINA]))(b, S);
      return new Promise(ok => setTimeout(() => ok(J(js, st)), ms == null ? 600 : ms));
    },
    '/routine_templates': (r, J, i) => {
      if (i.m === 'GET') return J(S.tpls);
      const row = Object.assign({ id: 'tpl-' + (S.tplPosts.length + 1) }, JSON.parse(i.body || '{}')); S.tplPosts.push(row); S.tpls.push(row);
      return J([row], 201);
    },
    '/routines': (r, J, i) => { if (i.m === 'GET') return J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]); S.rtPosts.push(JSON.parse(i.body || '{}')); return J([], 201); },
    '/routine_schedule': (r, J, i) => i.m === 'GET' ? J([]) : undefined,
  } });
  await pg.p.goto(base + '/app/'); await wait(2800);
  return Object.assign(pg, { S });
}
const W = '#coachHost .cv-wrap';
const ir = async (p, v) => { await p.click('#coachHost [data-coach="view-' + v + '"]'); await wait(700); };
const hojaPermiso = p => p.evaluate(() => { const h = document.querySelector('#iaRutHost .ia-perm:not(.closing)'); return !!(h && h.getClientRects().length); });
const hoja = p => p.evaluate(() => { const h = document.querySelector('#riaMount .cp-ccard'); return h && h.getClientRects().length ? h.innerText.replace(/\s+/g, ' ').trim() : ''; });
const abrirAlumno = async p => {
  await ir(p, 'clients');
  await p.click(`#coachHost [data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await p.click('#coachHost [data-coach="client-tab"][data-t="rutina"]'); await wait(500);
};

export default async function ({ base, t }){
  // ---- 1) Apagada: nada nuevo y nunca se llama a la función. ----
  let pg = await pagina(base, { estado: APAGADA }); let { p } = pg;
  await ir(p, 'tpls');
  t.ok(!(await p.$('#coachHost [data-coach="ria-open"]')), 'apagada: Rutinas sin «Armar con IA»');
  await p.click('#coachHost [data-coach="tpl-new"]'); await wait(400);
  t.ok(!(await p.$('#coachHost [data-coach="ria-open"]')), 'apagada: la rutina vacía sin «Armar con IA»');
  await p.click('#coachHost [data-coach="tpl-back"]'); await wait(400);
  await abrirAlumno(p);
  t.ok(!(await p.$('#coachHost [data-coach="ria-open"]')), 'apagada: la rutina del alumno sin «Armar con IA»');
  t.eq(pg.S.llamadas, [], 'apagada: no se llamó a la función «ia»');
  t.eq(pg.errs, [], 'errores de la página (apagada)');
  await pg.close();

  // ---- 2) Prendida: el permiso, la hoja, el borrador en el editor, «¿Está mal?» y guardar. ----
  pg = await pagina(base); p = pg.p;
  await ir(p, 'tpls');
  t.has(await text(p, '#coachHost .pp-franja'), 'Contá qué rutina querés y GIZE te arma un borrador para revisar.', 'Rutinas vacía: la franja «Con IA» con el llamado de «Armar con IA»');
  t.ok(!!(await p.$('#coachHost .pp-franja [data-coach="ria-open"]')), 'Rutinas: «Armar con IA» en la franja');
  await p.click('#coachHost [data-coach="tpl-new"]'); await wait(400);
  t.ok(!!(await p.$('#coachHost .ria-vacia [data-coach="ria-open"]')), 'una rutina vacía: «Armar con IA» al lado de «+ Agregar día»');
  await p.click('#coachHost [data-coach="tpl-back"]'); await wait(400);
  // «Ahora no»: ni hoja ni llamada.
  await p.click('#coachHost [data-coach="ria-open"]'); await wait(600);
  t.ok(await hojaPermiso(p), 'el primer uso pide el permiso «Usar IA en tus rutinas»');
  await p.click('#iaRutHost button[data-iar="no"]'); await wait(500);
  t.eq([await hoja(p), pg.S.llamadas.length], ['', 0], '«Ahora no»: no se abre la hoja ni se llama');
  // Aceptar: guarda el permiso (con la versión) y abre la hoja.
  await p.click('#coachHost [data-coach="ria-open"]'); await wait(600);
  await p.click('#iaRutHost [data-iar="si"]'); await wait(900);
  t.eq(pg.S.permisos.pop(), { p_acepta: true, p_version: 1 }, 'acepta el permiso con la versión del aviso');
  const h0 = await hoja(p);
  t.has(h0, 'Armar rutina con IA', 'la hoja se abre');
  t.has(h0, 'No se guarda nada hasta que toques «Guardar rutina»', 'la hoja dice que no se guarda nada');
  t.has(h0, 'No escribas el nombre ni datos de salud de tu alumno', 'el aviso de datos');
  t.has(h0, 'Te quedan 15 hoy.', 'cuántas quedan hoy');
  // Los botones rápidos suman palabras.
  await p.click('#riaMount [data-coach="ria-chip"][data-t="Hipertrofia"]'); await wait(200);
  await p.click('#riaMount [data-coach="ria-chip"][data-t="2 días"]'); await wait(200);
  await p.click('#riaMount [data-coach="ria-chip"][data-t="Hipertrofia"]'); await wait(200);
  t.eq(await p.inputValue('#riaTexto'), 'hipertrofia, 2 días', 'los botones rápidos suman palabras (sin repetir)');
  // Con datos que no tienen que viajar: el nombre del alumno vinculado, su mail y su teléfono.
  await p.fill('#riaTexto', 'Para Juan Pérez (juan.perez@correo.test, 11 4567-8901): hipertrofia, 2 días, principiante. ' + 'x'.repeat(400)); await wait(200);
  t.eq((await p.inputValue('#riaTexto')).length, 400, 'el pedido tiene hasta 400 letras');
  await p.dblclick('#riaMount [data-coach="ria-armar"]'); await wait(250);
  t.has(await hoja(p), 'Armando la rutina con IA… puede tardar hasta un minuto.', 'mientras arma, lo dice');
  await wait(1200);
  t.eq(pg.S.llamadas.length, 1, 'doble toque: un solo pedido');
  const pedido = pg.S.llamadas[0] || {};
  t.eq(Object.keys(pedido).sort(), ['descripcion', 'modo'], 'a la función va solo { modo, descripcion }');
  t.eq(pedido.modo, 'rutina', 'modo «rutina»');
  const desc = String(pedido.descripcion || '');
  t.ok(desc.length <= 400, 'la descripción tiene hasta 400 caracteres');
  t.has(desc, 'hipertrofia, 2 días, principiante', 'la descripción lleva el pedido');
  t.ok(!/juan|pérez|perez|correo|4567|8901/i.test(desc), 'sin el nombre, el mail ni el teléfono del alumno: ' + desc.slice(0, 80));
  t.has(desc, '[alumno]', 'el nombre del alumno vinculado se cambia por «[alumno]»');
  // El editor con el borrador, sin guardar.
  t.eq(await hoja(p), '', 'al llegar el borrador, la hoja se cierra');
  t.eq(await p.inputValue('#coachHost [data-coach="tpl-name"]'), 'Hipertrofia · 2 días', 'el editor con el nombre que propuso la IA');
  const ed = await text(p, W);
  t.has(ed, 'Borrador armado con IA', 'el cartel del borrador');
  t.has(ed, 'Nota de la IA: Supuse sesiones de 60 minutos.', 'con la nota de la IA');
  t.eq(await p.$$eval('#coachHost .co-daytab:not(.add)', l => l.length), 2, 'los dos días');
  const dias = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); return CoachState.coachTplEdit.days.map(d => [d.name, d.dias, d.exercises.map(e => [e.name, e.sets.length, e.rest])]); });
  t.eq(dias, [['Torso', [1, 4], [['Press plano con mancuernas', 3, '90 s'], ['Remo con barra', 3, '90 s']]], ['Pierna', [2, 5], [['Sentadilla libre', 4, '90 s'], ['Plancha', 1, '90 s']]]],
    'días, días de la semana, ejercicios de la lista (sin el inventado), series y descansos');
  t.eq(pg.S.tplPosts.length, 0, 'nada se guarda hasta «Guardar rutina»');
  t.ok(!!(await p.evaluate(k => localStorage.getItem(k), CLAVE)), 'el borrador queda en el equipo mientras se revisa');
  // «¿Está mal? Avisanos».
  p.dialogAnswer = 'Puso pocos ejercicios';
  await p.click('#coachHost [data-coach="ria-mal"]'); await wait(800);
  const rep = pg.S.reportes[0] || {};
  t.eq([rep.p_funcion, rep.p_comentario, rep.p_respuesta && rep.p_respuesta.pedido], ['rutina', 'Puso pocos ejercicios', desc], '«¿Está mal?»: ia_reportar con «rutina», el comentario y el pedido limpio');
  t.eq(rep.p_respuesta && rep.p_respuesta.borrador && rep.p_respuesta.borrador.dias.length, 2, '«¿Está mal?»: con el borrador que armó la IA');
  t.ok(!('ok' in ((rep.p_respuesta || {}).borrador || {})), '«¿Está mal?»: sin lo que no es del borrador');
  // «‹ Volver» pregunta (el borrador cuenta como cambio sin guardar).
  p.contestar = false; const nPreg = pg.preguntas.length;
  await p.click('#coachHost [data-coach="tpl-back"]'); await wait(500);
  t.ok(pg.preguntas.slice(nPreg).some(q => /sin guardar/.test(q.texto)), '«‹ Volver» pregunta antes de perder el borrador');
  t.ok(!!(await p.$('#coachHost [data-coach="tpl-name"]')), 'con «Cancelar» sigue en el editor');
  p.contestar = true;
  // Recargar: vuelve el borrador.
  await p.reload(); await wait(2800);
  await ir(p, 'tpls');
  t.has(await text(p, '#coachHost .ria-seguir'), 'Tenés una rutina armada con IA sin guardar: «Hipertrofia · 2 días»', 'después de recargar: el borrador sigue en el equipo');
  await p.click('#coachHost [data-coach="ria-seguir"]'); await wait(500);
  t.has(await text(p, W), 'Borrador armado con IA', '«Seguir revisándola» abre el editor con el cartel');
  // Guardar: un solo POST, y el borrador se borra.
  await p.click('#coachHost [data-coach="tpl-save"]'); await wait(1000);
  t.eq(pg.S.tplPosts.map(x => [x.name, x.days.length, x.coach_id]), [['Hipertrofia · 2 días', 2, COACH.id]], '«Guardar rutina»: queda en Mis rutinas (una sola vez)');
  t.ok(!JSON.stringify(pg.S.tplPosts).includes('Supuse'), 'lo de la IA (nota, pedido) no se guarda en la rutina');
  t.eq(await p.evaluate(k => localStorage.getItem(k), CLAVE), null, 'guardada, el borrador se borra del equipo');
  t.ok(!(await p.$('#coachHost .ria-seguir')), 'y ya no aparece «Tenés una rutina armada con IA»');
  t.eq(pg.errs, [], 'errores de la página (recorrido)');
  await pg.close();

  // ---- 3) Errores en la hoja. ----
  let vez = 0;
  pg = await pagina(base, { estado: Object.assign({}, PRENDIDA, { permiso_rutinas: 'ok' }), funcion: () => {
    vez++;
    if (vez === 1) return [429, { ok: false, codigo: 'tope_dia', tope: 15, mensaje: 'x' }];
    if (vez === 2) return [200, NO_ES];
    if (vez === 3) return [500, { ok: false, codigo: 'error' }];
    return [200, RUTINA];
  } }); p = pg.p;
  await ir(p, 'tpls');
  await p.click('#coachHost [data-coach="ria-open"]'); await wait(600);
  t.ok(!(await hojaPermiso(p)), 'con el permiso ya aceptado no se vuelve a preguntar');
  await p.fill('#riaTexto', 'ok'); await p.click('#riaMount [data-coach="ria-armar"]'); await wait(400);
  t.has(await hoja(p), 'Contá qué rutina querés', 'un pedido sin letras suficientes no se manda');
  t.eq(pg.S.llamadas.length, 0, 'y no se llama');
  await p.fill('#riaTexto', 'fuerza 3 días intermedio');
  await p.click('#riaMount [data-coach="ria-armar"]'); await wait(1200);
  t.has(await hoja(p), 'Llegaste al límite de hoy para armar rutinas con IA (15). Mañana seguís.', 'el tope del día');
  t.ok(!(await hoja(p)).includes('Probar de nuevo'), 'con el tope no ofrece probar de nuevo');
  await p.click('#riaMount [data-coach="ria-armar"]'); await wait(1200);
  t.has(await hoja(p), 'Eso no parece un pedido de rutina: contá objetivo, días por semana, nivel y con qué entrena. Parece una dieta.', '«no parece un pedido de rutina», con la nota de la IA');
  await p.click('#riaMount [data-coach="ria-armar"]'); await wait(1200);
  t.has(await hoja(p), 'Probar de nuevo', 'un error ofrece probar de nuevo');
  t.eq(await p.inputValue('#riaTexto'), 'fuerza 3 días intermedio', 'el pedido sigue escrito');
  // Cerrar mientras arma: lo que llega no abre nada.
  await p.click('#riaMount [data-coach="ria-armar"]'); await wait(200);
  await p.click('#riaMount button[data-coach="ria-cancel"]'); await wait(1200);
  t.ok(!(await p.$('#coachHost [data-coach="tpl-name"]')), 'cerrada mientras armaba: el borrador que llega no se abre');
  t.eq(pg.errs, [], 'errores de la página (errores)');
  await pg.close();
  // La IA pausada: no deja armar.
  pg = await pagina(base, { estado: Object.assign({}, PRENDIDA, { permiso_rutinas: 'ok', estado: 'pausada' }) }); p = pg.p;
  await ir(p, 'tpls');
  await p.click('#coachHost [data-coach="ria-open"]'); await wait(800);
  t.has(await hoja(p), 'La IA está pausada por ahora: armá la rutina a mano.', 'pausada: lo dice');
  t.ok(await p.$eval('#riaMount [data-coach="ria-armar"]', b => b.disabled), 'pausada: no deja armar');
  await pg.close();

  // ---- 4) Para un alumno (en Android): «Más acciones», «Aplicar» con el borrador y el «Atrás». ----
  pg = await pagina(base, { init: ANDROID, estado: Object.assign({}, PRENDIDA, { permiso_rutinas: 'ok' }) }); p = pg.p;
  const textos = [];
  await abrirAlumno(p);
  t.ok(!!(await p.$('#coachHost .co-more-actions [data-coach="ria-open"]')), 'la rutina del alumno: «Armar con IA» en «Más acciones»');
  await p.click('#coachHost .co-more-actions summary'); await wait(300);
  await p.click('#coachHost .co-more-actions [data-coach="ria-open"]'); await wait(700);
  textos.push(await hoja(p));
  // «Atrás» de Android: cierra la hoja, sin salir de la app.
  await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(500);
  t.eq([await hoja(p), await p.evaluate(() => window.__min)], ['', 0], 'Android: «Atrás» cierra la hoja sin salir de la app');
  await p.click('#coachHost .co-more-actions summary'); await wait(300);
  await p.click('#coachHost .co-more-actions [data-coach="ria-open"]'); await wait(700);
  await p.fill('#riaTexto', 'hipertrofia 2 días con mancuernas');
  await p.click('#riaMount [data-coach="ria-armar"]'); await wait(1500);
  let ap = await text(p, '#applyMount');
  textos.push(ap);
  t.has(ap, 'Hipertrofia · 2 días', '«Aplicar» con el borrador');
  t.has(ap, 'Nota de la IA: Supuse sesiones de 60 minutos.', 'con la nota de la IA');
  t.has(ap, 'Reemplazar la rutina actual', 'reemplazar o agregar');
  // «‹ Pedir otro borrador»: la hoja con el mismo texto.
  await p.click('#applyMount [data-coach="ap-back"]'); await wait(700);
  t.eq(await p.inputValue('#riaTexto'), 'hipertrofia 2 días con mancuernas', '«‹ Pedir otro borrador» vuelve a la hoja con el mismo texto');
  await p.click('#riaMount [data-coach="ria-armar"]'); await wait(1500);
  await p.click('#applyMount [data-coach="ap-confirm"]'); await wait(800);
  const rt = await text(p, W);
  // (la ficha tiene la pestaña «Plan alimenticio»: se revisa solo lo de «Armar con IA»)
  textos.push(await text(p, '#coachHost .ria-banner'));
  t.has(rt, 'Borrador armado con IA', 'aplicado: el cartel del borrador');
  t.has(rt, 'Cambios sin guardar', 'aplicado: queda como cambio sin guardar');
  t.eq(await p.$$eval('#coachHost .co-daytab:not(.add)', l => l.map(x => x.firstChild.textContent)), ['Torso', 'Pierna'], 'reemplazó la rutina por el borrador');
  t.eq(pg.S.rtPosts.length, 0, 'al alumno no le llega nada hasta «Guardar rutina»');
  await p.click('#coachHost [data-coach="save-routine"]'); await wait(1000);
  t.eq(pg.S.rtPosts.length, 1, '«Guardar rutina» se la manda');
  t.ok(!(await p.$('#coachHost .ria-banner')), 'guardada, sin el cartel');
  for (const x of textos) t.ok(!PROHIBIDO.test(x), 'Android: sin prueba, plan ni precios: ' + (x.match(PROHIBIDO) || ''));
  t.eq(pg.errs, [], 'errores de la página (alumno)');
  await pg.close();

  // ---- 5) Cerrar sesión borra el borrador, y no vuelve al recargar. ----
  const BORRADOR = { ts: Date.now(), id: null, name: 'Fuerza', days: [{ id: 'd1', name: 'Día 1', subtitle: '', exercises: [{ id: 'e1', name: 'Sentadilla libre', sets: [{ id: 's1', target: '5', kg: '', reps: '', done: false }] }] }],
    revisar: [], ia: { pedido: 'fuerza 1 día', nota: '', borrador: { hay_rutina: true, nombre: 'Fuerza', nota: '', dias: [] }, ts: Date.now() } };
  pg = await pagina(base, { estado: Object.assign({}, PRENDIDA, { permiso_rutinas: 'ok' }),
    init: `(() => { if (sessionStorage.getItem('ria-sem')) return; sessionStorage.setItem('ria-sem', '1'); localStorage.setItem(${JSON.stringify(CLAVE)}, ${JSON.stringify(JSON.stringify(BORRADOR))}); })()` });
  p = pg.p;
  await ir(p, 'tpls');
  t.has(await text(p, '#coachHost .ria-seguir'), '«Fuerza»', 'cerrar sesión: antes, el borrador está');
  await configCoach(p, 'cuenta');
  await p.click('[data-auth="logout"]'); await wait(3500);
  t.eq(await p.evaluate(k => localStorage.getItem(k), CLAVE), null, 'cerrar sesión: el borrador se borra y no vuelve al recargar');
  await pg.close();

  // ---- 6) La política dice lo que hace «Armar con IA» con el pedido y el borrador. ----
  const pol = fs.readFileSync(path.join(ROOT, 'privacidad/index.html'), 'utf8');
  const coach = (pol.match(/<p id="ia-coach">[\s\S]*?<\/p>/) || [''])[0];
  t.has(coach, 'Con «Armar con IA», el pedido también se limpia antes de enviarlo (sin mails, teléfonos, números de documento ni links, y con «[alumno]» en lugar de los nombres de los alumnos vinculados)', 'la política: el pedido se limpia');
  t.has(coach, 'el borrador que arma la IA queda igual, solo en su equipo y por el mismo tiempo, junto con ese pedido ya limpio', 'la política: el borrador queda solo en el equipo');
}
