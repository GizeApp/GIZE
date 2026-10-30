// «Pasar mis planillas» en el panel del coach (app/screens/coach/planillas.js), con Supabase y la
// función «ia» simulados (como tests/comida-ia-comun.mjs) y planillas inventadas que arma la prueba
// con el SheetJS de vendor/ (nada de planillas de verdad en el repo):
//   · Con la IA del coach apagada no aparece nada nuevo (ni en Rutinas ni en Inicio) y nunca se llama
//     a la función. Prendida: la franja «Con IA» en Rutinas y el llamado en Rutinas vacía e Inicio sin
//     clientes.
//   · Subir un Excel con varias hojas: vienen tildadas las que parecen rutinas y el alumno se adivina
//     por el nombre de la hoja. «Ver qué se manda» muestra el texto sin nombres, mails ni teléfonos, y
//     es exactamente lo que llega a /functions/v1/ia ({ modo: 'planilla', hoja }, nada más).
//   · El permiso sale una vez: con «Ahora no» no se llama.
//   · La cola: de a 2 a la vez; «no parece una rutina»; un error que se reintenta; y el tope del día,
//     que frena el resto («Para mañana») sin volver a llamar.
//   · La revisión: el resumen y los avisos, «Ver cómo la leyó», el editor con la marca «Revisar» y
//     «‹ Volver a la planilla» sin perder cambios (ni preguntar).
//   · El borrador vuelve después de recargar (en el equipo, sin la planilla: ni mails ni teléfonos).
//   · «¿Está mal? Avisanos» manda la rutina que armó la IA (ia_reportar con 'planilla'), sin la planilla.
//   · Guardar: con dos rutinas para el mismo alumno no guarda ninguna (la segunda pisaría a la primera).
//     Pregunta antes de reemplazar, nombrando solo a quien ya tenía rutina; con «Cancelar» no
//     guarda nada. Inserta en routine_templates (con el nombre sin repetir) y hace upsert en routines
//     con updated_by solo para los alumnos elegidos. Al final dice cuántas guardó y borra el borrador.
//   · Android: el «Atrás» vuelve paso por paso y ningún texto habla de la prueba, el plan ni precios.
//   · Cerrar sesión borra el borrador y no vuelve a quedar al recargar.
//   · La política dice que lo que se pasó queda en el equipo hasta guardarlo (privacidad #ia-coach).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, configCoach } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@ejemplo.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444', A2 = '55555555-5555-5555-5555-555555555555';
const CLIENTES = [{ id: A1, full_name: 'Juan Pérez', role: 'client', coach_id: COACH.id }, { id: A2, full_name: 'Martina Gómez', role: 'client', coach_id: COACH.id }];
const PRENDIDA = { activa: true, funciones: { planilla: true, rutina: false }, rol: 'coach', por_gimnasio: false, permiso_rutinas: null, aviso_version: 1,
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

// Las hojas del Excel inventado. La de Juan tiene su mail y su teléfono, y una nota con el nombre del
// coach y el de otra alumna vinculada (nada de eso tiene que viajar).
const JUAN = [['Rutina de Juan Pérez'], ['Mail: juan.perez@correo.test'], ['Celular', '11 4567-8901'], [], ['Ejercicio', 'Series', 'Reps', 'Descanso'],
  ['Press banca', '4', '8-10', "2'"], ['Sentadilla búlgara con salto', '3', '12-10-8', '90 s'], ['Remo', '4', '60-65-70-75', "2'", 'Lo controla Carla, como a Martina']];
const DIETA = [['Desayuno', 'Avena con leche'], ['Almuerzo', 'Pollo con arroz']];
const MARTINA = [['Día 1'], ['Ejercicio', 'Series', 'Reps'], ['Sentadilla libre', '4', '6'], ['Peso muerto', '3', '5']];
const serie = (objetivo, kg = '') => ({ objetivo, kg });
const ej = (nombre, fila, series, o = {}) => Object.assign({ nombre, grupo: '', propio: false, dudoso: false, series, timed: false, descanso: '', rir: '', nota: '', progresion: '', ss: false, fila }, o);
const RUTINA_JUAN = { ok: true, hay_rutina: true, nombre: 'Torso y pierna', nota: '', varias: false, semanas: 3, modelo_nombre: 'IA', dias: [{ nombre: 'Día 1', dias: [0], nota: '', ejercicios: [
  ej('Press plano con mancuernas', 6, [serie('8-10'), serie('8-10'), serie('8-10'), serie('8-10')], { grupo: 'pecho', dudoso: true, descanso: "2'", progresion: 'S2: 4x8 · S3: 4x6' }),
  ej('Sentadilla búlgara con salto', 7, [serie('12'), serie('10'), serie('8')], { propio: true, descanso: '90 s' }),
  ej('Remo con barra', 8, [serie('10', '60'), serie('10', '65'), serie('10', '70'), serie('10', '75')], { grupo: 'espalda', descanso: "2'" }),
] }] };
const RUTINA_MARTINA = { ok: true, hay_rutina: true, nombre: 'Pierna', nota: '', varias: false, semanas: 1, modelo_nombre: 'IA', dias: [{ nombre: 'Día 1', dias: [], nota: '', ejercicios: [
  ej('Sentadilla libre', 3, [serie('6'), serie('6'), serie('6'), serie('6')], { grupo: 'cuadriceps' }), ej('Peso muerto convencional', 4, [serie('5'), serie('5'), serie('5')], { grupo: 'espalda' }),
] }] };
const NO_RUTINA = { ok: true, hay_rutina: false, nombre: '', nota: 'Es una dieta, no una rutina.', dias: [], varias: false, semanas: 0 };

// El panel del coach con la IA del coach, la función «ia», las rutinas guardadas y las de los alumnos
// simulados. o.funcion(body, S) → [status, json, ms]. S.rutinas: la rutina que ya tiene cada alumno.
async function pagina(base, o = {}){
  const S = { estado: Object.assign({}, o.estado || PRENDIDA), permisos: [], llamadas: [], enCurso: 0, maxEnCurso: 0, tpls: (o.tpls || []).slice(), inserts: [], upserts: [],
    rutinas: o.rutinas || {}, reportes: [] };
  const pg = await newPage({ user: COACH, init: o.init, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J(o.clientes || CLIENTES);
      const me = { id: COACH.id, role: 'coach', full_name: 'Carla Entrenadora' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/rpc/ia_coach_estado': (r, J) => J(S.estado),
    '/rpc/ia_permiso_rutinas': (r, J, i) => { const b = JSON.parse(i.body || '{}'); S.permisos.push(b); S.estado = Object.assign({}, S.estado, { permiso_rutinas: b.p_acepta ? 'ok' : 'no' }); return J(S.estado); },
    '/rpc/ia_reportar': (r, J, i) => { S.reportes.push(JSON.parse(i.body || '{}')); return J(null); },
    '/functions/v1/ia': (r, J, i) => {
      if (i.m !== 'POST') return J({});
      const b = JSON.parse(i.body || '{}'); S.llamadas.push(b);
      S.enCurso++; S.maxEnCurso = Math.max(S.maxEnCurso, S.enCurso);
      const [st, js, ms] = (o.funcion || (() => [200, NO_RUTINA]))(b, S);
      return new Promise(ok => setTimeout(() => { S.enCurso--; ok(J(js, st)); }, ms == null ? 300 : ms));
    },
    '/routine_templates': (r, J, i) => {
      if (i.m === 'GET') return J(S.tpls);
      if (i.m === 'POST'){ const b = JSON.parse(i.body || '{}'), rows = Array.isArray(b) ? b : [b]; rows.forEach(x => { x.id = 'tpl' + (S.tpls.length + 1); S.tpls.push(x); S.inserts.push(x); }); return J(rows, 201); }
      return undefined;
    },
    '/routines': (r, J, i) => {
      const m = /client_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(i.url.search));
      if (i.m === 'GET' && m) return J(m[1].split(',').map(x => x.replace(/"/g, '')).filter(id => S.rutinas[id]).map(id => ({ client_id: id, days: S.rutinas[id] })));
      if (i.m === 'POST'){ S.upserts.push(JSON.parse(i.body || '{}')); return J([], 201); }
      return undefined;
    },
  } });
  await pg.p.goto(base + '/app/'); await wait(2800);
  return Object.assign(pg, { S });
}
const W = '#coachHost .cv-wrap';
const ir = async (p, v) => { await p.click('#coachHost [data-coach="view-' + v + '"]'); await wait(700); };
// Sube planillas inventadas al campo de la pantalla: { nombre, hojas: [[nombre, filas]] } o { nombre, csv }.
async function subir(p, archivos){
  await p.evaluate(async archivos => {
    const { cargarXLSX } = await import('/app/core/planilla.js');
    const X = await cargarXLSX(), dt = new DataTransfer();
    for (const a of archivos){
      if (a.csv != null){ dt.items.add(new File([a.csv], a.nombre, { type: 'text/csv' })); continue; }
      const wb = X.utils.book_new();
      a.hojas.forEach(([n, filas]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(filas), n));
      dt.items.add(new File([X.write(wb, { type: 'array', bookType: 'xlsx' })], a.nombre));
    }
    const inp = document.querySelector('#coachHost input[data-pp="archivos"]');
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, archivos);
  await wait(900);
}
// Las hojas del paso 2: nombre, tildada y para quién.
const hojas = p => p.evaluate(() => [...document.querySelectorAll('#coachHost .pp-hoja')].map(h => ({
  hoja: h.querySelector('.pp-hoja-n b').textContent, tilde: h.querySelector('input[data-pp="tilde"]').checked, para: (h.querySelector('select[data-pp="para"]') || {}).value })));
const idDe = (p, hoja) => p.evaluate(h => { const x = [...document.querySelectorAll('#coachHost .pp-hoja, #coachHost .pp-rt')].find(e => (e.querySelector('.pp-hoja-n b, .pp-rt-t') || {}).textContent === h || ((e.querySelector('.pp-rt-de') || {}).textContent || '').includes('«' + h + '»'));
  const b = x && x.querySelector('[data-id]'); return b ? b.dataset.id : null; }, hoja);
const tarjeta = async (p, hoja) => { const id = await idDe(p, hoja); return id ? text(p, '#coachHost .pp-rt[data-id="' + id + '"]') : ''; };
const tocar = async (p, accion, hoja, ms = 500) => { const id = await idDe(p, hoja); await p.click('#coachHost [data-coach="' + accion + '"][data-id="' + id + '"]'); await wait(ms); };
const hojaPermiso = p => p.evaluate(() => { const h = document.querySelector('#iaRutHost .ia-perm:not(.closing)'); return !!(h && h.getClientRects().length); });
const CLAVE = 'gize_rt_draft_planillas_' + COACH.id;

export default async function ({ base, t }){
  // ---- 1) Apagada: nada nuevo en Rutinas ni en Inicio, y nunca se llama a la función. ----
  let pg = await pagina(base, { estado: APAGADA, clientes: [] }); let { p } = pg;
  await ir(p, 'tpls');
  t.ok(!(await p.$('#coachHost .pp-franja')), 'apagada: Rutinas sin la franja «Con IA»');
  t.ok(!(await text(p, W)).includes('Pasar mis planillas'), 'apagada: Rutinas sin «Pasar mis planillas»');
  await ir(p, 'home');
  t.ok(!(await p.$('#coachHost .pp-franja')), 'apagada: Inicio sin el llamado');
  t.ok(pg.calls.includes('POST /rest/v1/rpc/ia_coach_estado'), 'se pregunta ia_coach_estado para saber si mostrarla');
  t.eq(pg.S.llamadas, [], 'apagada: no se llamó a la función «ia»');
  t.eq(pg.errs, [], 'errores de la página (apagada)');
  await pg.close();

  // ---- 2) Prendida, sin clientes y sin rutinas: el llamado en Inicio y en Rutinas vacía. ----
  pg = await pagina(base, { clientes: [] }); p = pg.p;
  await ir(p, 'home');
  t.has(await text(p, '#coachHost .pp-llamado'), '¿Tenés tus rutinas en Excel o Google Sheets? Pasalas a GIZE.', 'Inicio sin clientes: el llamado');
  await ir(p, 'tpls');
  const vacia = await text(p, '#coachHost .pp-franja');
  t.has(vacia, 'Con IA', 'Rutinas vacía: la franja «Con IA»');
  t.has(vacia, '¿Tenés tus rutinas en Excel o Google Sheets? Pasalas a GIZE.', 'Rutinas vacía: con el llamado');
  await ir(p, 'home');
  await p.click('#coachHost .pp-llamado [data-coach="pp-open"]'); await wait(700);
  t.has(await text(p, W), 'Pasar mis planillas', 'desde Inicio se abre «Pasar mis planillas»');
  t.ok(await p.isVisible('#coachHost .cv-nav-i.on[data-coach="view-tpls"]'), 'la pantalla va dentro de Rutinas');
  t.eq(pg.errs, [], 'errores de la página (sin clientes)');
  await pg.close();

  // ---- 3) El recorrido completo. ----
  pg = await pagina(base, {
    tpls: [{ id: 't0', coach_id: COACH.id, name: 'Martina', days: [{ id: 'd0', name: 'Día 1', exercises: [] }] }],
    rutinas: { [A1]: [{ id: 'r1', name: 'La de antes', exercises: [{ id: 'e1', name: 'Remo con barra', sets: [] }] }] },
    funcion: (b, S) => {
      if (/Press banca/.test(b.hoja)) return [200, RUTINA_JUAN];
      if (/Sentadilla libre/.test(b.hoja)){ S.martina = (S.martina || 0) + 1; return S.martina === 1 ? [502, { ok: false, codigo: 'error', mensaje: 'x' }] : [200, RUTINA_MARTINA]; }
      return [200, NO_RUTINA];
    },
  }); p = pg.p;
  await ir(p, 'tpls');
  const franja = await text(p, '#coachHost .pp-franja');
  t.has(franja, 'Con IA', 'prendida: la franja «Con IA» en Rutinas');
  t.has(franja, 'Pasar mis planillas', 'con «Pasar mis planillas»');
  t.ok(!franja.includes('¿Tenés tus rutinas'), 'con rutinas guardadas, sin el llamado');
  await p.click('#coachHost [data-coach="pp-open"]'); await wait(800);
  const paso1 = await text(p, W);
  for (const f of ['Pasar mis planillas', 'Elegir planillas', 'La planilla se lee en tu equipo. A la IA le mandamos solo los ejercicios, sin nombres de tus alumnos, mails, teléfonos ni links.',
    '¿Está en Google Sheets? Archivo → Descargar → Microsoft Excel (.xlsx).', '¿Es un .xls viejo? Abrilo y guardalo como .xlsx.', 'Hoy te quedan 30 hojas para pasar con IA.'])
    t.has(paso1, f, 'paso 1: ' + f);
  t.ok(await p.evaluate(() => [...document.querySelectorAll('#coachHost .cv-wrap a')].some(a => a.getAttribute('href') === 'https://gize.ar/privacidad/?app=1#ia-coach')), 'paso 1: el link a la política (#ia-coach)');

  // Paso 2: las hojas.
  await subir(p, [{ nombre: 'Alumnos 2026.xlsx', hojas: [['Juan Pérez', JUAN], ['Dieta', DIETA], ['Martina', MARTINA]] }]);
  t.eq(await hojas(p), [{ hoja: 'Juan Pérez', tilde: true, para: A1 }, { hoja: 'Dieta', tilde: false, para: '' }, { hoja: 'Martina', tilde: true, para: A2 }],
    'paso 2: tildadas las que parecen rutinas y el alumno adivinado por el nombre de la hoja');
  t.has(await text(p, W), 'Alumnos 2026.xlsx', 'paso 2: el nombre del archivo');
  t.has(await text(p, '#coachHost [data-coach="pp-pasar"]'), 'Pasar 2 hojas con IA', 'paso 2: el botón dice cuántas');
  await tocar(p, 'pp-ver', 'Juan Pérez');
  const visto = await p.evaluate(() => document.querySelector('#coachHost .pp-texto').textContent);
  t.has(visto, 'Press banca', '«Ver qué se manda»: los ejercicios');
  t.has(visto, '60-65-70-75', '«Ver qué se manda»: las cargas quedan enteras');
  t.has(visto, '[alumno]', '«Ver qué se manda»: el nombre cambiado por «[alumno]»');
  for (const no of ['Juan', 'Pérez', 'juan.perez', 'correo.test', '4567', 'Carla', 'Martina', 'Alumnos 2026'])
    t.ok(!visto.includes(no), '«Ver qué se manda»: sin «' + no + '»');
  // La dieta también va (para ver «no parece una rutina»).
  const idDieta = await idDe(p, 'Dieta');
  await p.click('#coachHost input[data-pp="tilde"][data-id="' + idDieta + '"]'); await wait(300);
  t.has(await text(p, '#coachHost [data-coach="pp-pasar"]'), 'Pasar 3 hojas con IA', 'tildar otra suma una hoja');

  // El permiso: «Ahora no» no manda nada.
  await p.click('#coachHost [data-coach="pp-pasar"]'); await wait(600);
  t.ok(await hojaPermiso(p), 'antes de la primera hoja sale «Usar IA en tus rutinas»');
  await p.click('#iaRutHost button[data-iar="no"]'); await wait(600);
  t.eq(pg.S.llamadas, [], '«Ahora no»: no se llamó a la función');
  t.ok(await p.$('#coachHost [data-coach="pp-pasar"]'), '«Ahora no»: sigue en el paso 2');
  await p.click('#coachHost [data-coach="pp-pasar"]'); await wait(600);
  await p.click('#iaRutHost [data-iar="si"]'); await wait(2200);
  t.eq(pg.S.permisos, [{ p_acepta: true, p_version: 1 }], 'aceptar guarda el permiso una vez');

  // Lo que llegó a la función: solo { modo, hoja }, y la hoja es lo que mostraba «Ver qué se manda».
  t.eq(pg.S.llamadas.length, 3, 'una llamada por hoja');
  t.ok(pg.S.llamadas.every(b => JSON.stringify(Object.keys(b).sort()) === '["hoja","modo"]' && b.modo === 'planilla'), 'cada pedido lleva solo modo «planilla» y la hoja');
  t.eq(pg.S.llamadas.filter(b => /Press banca/.test(b.hoja)).map(b => b.hoja), [visto], 'la hoja que llega es exactamente lo que muestra «Ver qué se manda»');
  t.ok(pg.S.llamadas.every(b => !/Juan|Pérez|Martina|Gómez|Carla|juan\.perez|correo\.test|4567/.test(b.hoja)), 'ningún pedido lleva nombres, mails ni teléfonos');
  t.ok(pg.S.maxEnCurso <= 2, 'de a 2 a la vez como mucho (' + pg.S.maxEnCurso + ')');
  t.has(await tarjeta(p, 'Dieta'), 'No parece una rutina', '«no es rutina»: lo dice');
  t.has(await tarjeta(p, 'Dieta'), 'Es una dieta, no una rutina.', '«no es rutina»: con la nota de la IA');
  const juan = await tarjeta(p, 'Juan Pérez');
  t.has(juan, 'Lista: 1 día · 3 ejercicios', 'la rutina de Juan está lista');
  t.has(juan, '1 ejercicio para revisar', 'avisa los que hay que revisar');
  t.has(juan, '1 con nombre propio: sin video de GIZE', 'avisa los de nombre propio');
  t.has(juan, 'La progresión por semanas quedó en «Objetivo de progreso»', 'avisa dónde quedó la progresión');
  t.eq(await p.evaluate(id => document.querySelector('#coachHost input[data-pp="nombre"][data-id="' + id + '"]').value, await idDe(p, 'Juan Pérez')), 'Juan Pérez', 'el nombre es el de la hoja');
  t.eq(await p.evaluate(id => document.querySelector('#coachHost select[data-pp="para"][data-id="' + id + '"]').value, await idDe(p, 'Juan Pérez')), A1, 'y sigue siendo para Juan');
  t.has(await tarjeta(p, 'Martina'), 'No se pudo', 'un error: «No se pudo»');
  t.has(await tarjeta(p, 'Martina'), 'La IA está tardando más de lo normal o falló', 'un error: con el texto de siempre');
  await tocar(p, 'pp-reintentar', 'Martina', 1200);
  t.has(await tarjeta(p, 'Martina'), 'Lista: 1 día · 2 ejercicios', '«Reintentar» la vuelve a pasar');
  t.eq(pg.S.llamadas.length, 4, 'el reintento es una llamada más');

  // «Ver cómo la leyó»: fila por fila.
  await tocar(p, 'pp-leyo', 'Juan Pérez');
  const leyo = await text(p, '#coachHost .pp-leyo');
  for (const f of ['Fila 6', 'Press banca · 4 · 8-10', 'Press plano con mancuernas · 4 × 8-10 · desc. 2\'', 'Revisar', 'Sentadilla búlgara con salto', 'Nombre propio', 'Remo con barra · 4 × 10 · 60 / 65 / 70 / 75 kg'])
    t.has(leyo, f, '«Ver cómo la leyó»: ' + f);

  // El editor de siempre, con la marca «Revisar» y «‹ Volver a la planilla» sin perder cambios.
  const nPreg = pg.preguntas.length;
  await tocar(p, 'pp-editar', 'Juan Pérez', 700);
  t.has(await text(p, '#coachHost [data-coach="tpl-back"]'), 'Volver a la planilla', 'el editor vuelve a la planilla');
  t.has(await text(p, W), 'Al guardarla queda en Mis rutinas y se la aplicás a Juan Pérez.', 'el editor dice qué pasa al guardar');
  t.eq(await p.evaluate(() => [...document.querySelectorAll('#coachHost .co-exc')].filter(c => c.querySelector('.co-exc-rev')).map(c => (c.querySelector('.co-exc-ctext, .co-exc-name') || {}).textContent || c.querySelector('.co-exc-name').value)),
    ['Press plano con mancuernas'], 'la marca «Revisar» va solo en lo que la IA no leyó segura');
  await p.fill('#coachHost [data-coach="tpl-name"]', 'Juan · Torso');
  // Una serie más al tercero (el «+» de la tarjeta cerrada, que en el celular no se muestra).
  await p.evaluate(() => document.querySelector('#coachHost [data-coach="rt-setadd"][data-i="2"]').click()); await wait(300);
  await p.click('#coachHost [data-coach="tpl-back"]'); await wait(600);
  t.eq(pg.preguntas.length, nPreg, 'volver a la planilla no pregunta nada');
  t.eq(await p.evaluate(id => document.querySelector('#coachHost input[data-pp="nombre"][data-id="' + id + '"]').value, await idDe(p, 'Juan Pérez')), 'Juan · Torso', 'el nombre que se cambió en el editor queda');
  t.has(await tarjeta(p, 'Juan Pérez'), 'Lista: 1 día · 3 ejercicios', 'y la rutina sigue en la planilla');
  // Salir del editor por la barra lateral cierra la pantalla, y lo que se cambió (también el nombre) queda.
  await tocar(p, 'pp-editar', 'Juan Pérez', 700);
  await p.fill('#coachHost [data-coach="tpl-name"]', 'Juan · Torso B');
  await ir(p, 'tpls');
  t.ok(!(await p.$('#coachHost .pp-title')) && !(await p.$('#coachHost [data-coach="tpl-name"]')), 'salir del editor por la barra: queda en Rutinas');
  await p.click('#coachHost [data-coach="pp-open"]'); await wait(800);
  await p.click('#coachHost [data-coach="pp-seguir"]'); await wait(500);
  const nomJuan = '#coachHost input[data-pp="nombre"][data-id="' + await idDe(p, 'Juan Pérez') + '"]';
  t.eq(await p.$eval(nomJuan, i => i.value), 'Juan · Torso B', 'salir del editor por la barra: el nombre que se cambió queda');
  await p.fill(nomJuan, 'Juan · Torso'); await p.press(nomJuan, 'Tab'); await wait(300);

  // El borrador vuelve después de recargar, sin la planilla.
  const guardado = await p.evaluate(k => localStorage.getItem(k) || '', CLAVE);
  t.ok(guardado.length > 0, 'el borrador queda en el equipo (gize_rt_draft_planillas_<uid>)');
  for (const no of ['juan.perez', '4567', 'Desayuno', 'Avena'])
    t.ok(!guardado.includes(no), 'el borrador no guarda la planilla (' + no + ')');
  t.has(guardado, 'Juan · Torso', 'el borrador tiene lo que se cambió');
  await p.reload(); await wait(2800);
  await ir(p, 'tpls');
  await p.click('#coachHost [data-coach="pp-open"]'); await wait(800);
  t.has(await text(p, '#coachHost .pp-seguir'), 'Tenés 2 rutinas sin guardar de Alumnos 2026.xlsx', 'al volver ofrece seguir con lo que no se guardó');
  await p.click('#coachHost [data-coach="pp-seguir"]'); await wait(500);
  t.has(await tarjeta(p, 'Juan Pérez'), 'Lista: 1 día · 3 ejercicios', 'la rutina de Juan volvió');
  t.has(await tarjeta(p, 'Martina'), 'Lista: 1 día · 2 ejercicios', 'la de Martina también');
  t.eq(await p.evaluate(() => [...document.querySelectorAll('#coachHost .pp-rt')].length), 2, 'solo las que estaban listas');

  // «¿Está mal? Avisanos»: la rutina que armó la IA y el comentario, nunca la planilla.
  p.dialogAnswer = 'Faltó el día 2';
  await tocar(p, 'pp-reportar', 'Juan Pérez', 700);
  const rep = pg.S.reportes[0] || {};
  t.eq([rep.p_funcion, rep.p_comentario], ['planilla', 'Faltó el día 2'], '«¿Está mal?» manda ia_reportar con «planilla» y el comentario');
  const repTxt = JSON.stringify(rep.p_respuesta || {});
  t.has(repTxt, 'Press plano con mancuernas', '«¿Está mal?» manda la rutina que armó la IA');
  t.ok(!/hoja|juan\.perez|4567|\|/.test(repTxt), '«¿Está mal?» no manda la planilla');
  t.has(pg.dialogs.join(' '), 'Gracias, lo vamos a revisar.', '«¿Está mal?»: avisa que llegó');

  // Dos para el mismo alumno (pasa con un archivo con su nombre y una hoja por día): «Guardar todas» no
  // guarda ninguna, porque la segunda le reemplazaría la primera sin avisar, y dice por qué.
  const idMartina = await idDe(p, 'Martina');
  await p.selectOption('#coachHost select[data-pp="para"][data-id="' + idMartina + '"]', A1); await wait(400);
  const nPregDup = pg.preguntas.length;
  await p.click('#coachHost [data-coach="pp-guardar-todas"]'); await wait(800);
  t.has(pg.dialogs.join(' '), '«Juan · Torso» y «Martina» son para Juan Pérez. Cada alumno tiene una sola rutina: dejale una y en las otras elegí «Nadie todavía» (quedan en Mis rutinas).', 'dos para el mismo alumno: lo dice');
  t.eq([pg.S.inserts.length, pg.S.upserts.length, pg.preguntas.length - nPregDup], [0, 0, 0], 'dos para el mismo alumno: no guarda nada');
  await p.selectOption('#coachHost select[data-pp="para"][data-id="' + idMartina + '"]', A2); await wait(400);

  // Guardar todas: pregunta antes de reemplazar (solo nombra a Juan, que ya tenía rutina).
  p.contestar = false;
  await p.click('#coachHost [data-coach="pp-guardar-todas"]'); await wait(800);
  const q = pg.preguntas[pg.preguntas.length - 1] || {};
  t.has(q.texto || '', 'Reemplaza la rutina de Juan Pérez.', 'antes de guardar pregunta, nombrando a quien ya tenía rutina');
  t.ok(!(q.texto || '').includes('Martina'), 'no nombra a quien no tenía rutina');
  t.eq([pg.S.inserts.length, pg.S.upserts.length], [0, 0], '«Cancelar»: no se guarda nada');
  p.contestar = true;
  await p.click('#coachHost [data-coach="pp-guardar-todas"]'); await wait(1500);
  t.eq(pg.S.inserts.map(x => [x.name, x.coach_id, x.days.length]), [['Juan · Torso', COACH.id, 1], ['Martina (2)', COACH.id, 1]], 'quedan en Mis rutinas (routine_templates), con el nombre sin repetir');
  t.eq(pg.S.inserts[0].days[0].exercises[2].sets.length, 5, 'con lo que se cambió en el editor');
  t.eq(pg.S.upserts.map(x => [x.client_id, x.updated_by]).sort(), [[A1, COACH.id], [A2, COACH.id]].sort(), 'y se aplican a los alumnos elegidos (routines, con updated_by)');
  t.ok(pg.S.upserts.every(x => Array.isArray(x.days) && x.days.length === 1 && x.days[0].id !== pg.S.inserts[0].days[0].id), 'la del alumno es una copia con ids nuevos');
  t.ok(!JSON.stringify(pg.S.inserts.concat(pg.S.upserts)).includes('revisar'), 'la marca «Revisar» no se guarda en la rutina');
  t.has(await text(p, W), 'Guardaste 2 rutinas, aplicadas a tus alumnos.', 'al final dice cuántas guardó');
  t.eq(await p.evaluate(k => localStorage.getItem(k), CLAVE), null, 'guardado todo, el borrador se borra');
  t.eq(pg.errs, [], 'errores de la página (recorrido)');
  await pg.close();

  // ---- 4) Android: la cola de a 2, el tope del día, «Para mañana», nombres y «Atrás». ----
  const EJ = ['Sentadilla libre', 'Peso muerto', 'Remo con barra', 'Dominadas', 'Fondos', 'Plancha'];
  pg = await pagina(base, { init: ANDROID, estado: Object.assign({}, PRENDIDA, { permiso_rutinas: 'ok', quedan: { planilla: 5, rutina: 15 } }),
    funcion: b => {
      const e = EJ.find(x => b.hoja.includes(x));
      if (e === 'Peso muerto') return [502, { ok: false, codigo: 'error' }];
      if (e === 'Dominadas') return [429, { ok: false, codigo: 'tope_dia', tope: 30, mensaje: 'x' }, 60];
      return [200, Object.assign({}, RUTINA_MARTINA, { dias: [{ nombre: 'Día 1', dias: [], nota: '', ejercicios: [ej(e, 2, [serie('8')])] }] })];
    } }); p = pg.p;
  await ir(p, 'tpls');
  await p.click('#coachHost [data-coach="pp-open"]'); await wait(800);
  const textos = [await text(p, W)];
  await subir(p, EJ.map((e, i) => ({ nombre: 'rutina-' + (i + 1) + '.csv', csv: 'Ejercicio;Series;Reps\n' + e + ';3;8\nNota;tranqui;\n' })));
  t.eq((await hojas(p)).map(h => h.tilde), [true, true, true, true, true, true], 'los .csv vienen tildados');
  t.ok(await p.$eval('#coachHost [data-coach="pp-pasar"]', b => b.disabled), 'más hojas que las que quedan hoy: no deja pasar');
  t.has(await text(p, W), 'Elegiste 6 hojas y hoy te quedan 5: destildá algunas.', 'y dice por qué');
  textos.push(await text(p, W));
  await p.click('#coachHost input[data-pp="tilde"][data-id="' + await idDe(p, 'rutina-6') + '"]'); await wait(300);
  await p.click('#coachHost [data-coach="pp-pasar"]'); await wait(2000);
  t.ok(!(await hojaPermiso(p)), 'con el permiso ya aceptado no se vuelve a preguntar');
  t.eq(pg.S.llamadas.map(b => EJ.find(x => b.hoja.includes(x))), ['Sentadilla libre', 'Peso muerto', 'Remo con barra', 'Dominadas'], 'el tope del día frena la cola: la quinta no se manda');
  t.eq(pg.S.maxEnCurso, 2, 'de a 2 a la vez');
  const fin = await text(p, W);
  textos.push(fin);
  t.has(fin, 'Llegaste al límite de hoy para pasar planillas con IA (30). Mañana seguís.', 'dice que llegó al tope del día');
  t.has(await tarjeta(p, 'rutina-5'), 'Para mañana', 'la que faltaba queda «Para mañana»');
  t.has(await tarjeta(p, 'rutina-4'), 'Para mañana', 'la que chocó con el tope también');
  t.ok(!(await tarjeta(p, 'rutina-2')).includes('Reintentar'), 'con el tope del día no se ofrece reintentar');
  t.has(await tarjeta(p, 'rutina-3'), 'Lista', 'lo que ya estaba en camino terminó');
  // Sin alumno («Nadie todavía»): queda solo en Mis rutinas, sin tocar la rutina de nadie ni preguntar.
  const nPreg4 = pg.preguntas.length;
  await tocar(p, 'pp-guardar', 'rutina-1', 1200);
  t.eq([pg.S.inserts.map(x => x.name), pg.S.upserts.length, pg.preguntas.length - nPreg4], [['rutina-1'], 0, 0], 'sin alumno: solo en Mis rutinas, sin aplicarla a nadie ni preguntar');
  textos.push(await text(p, W));
  t.has(textos[textos.length - 1], 'Guardaste 1 rutina en Mis rutinas.', 'y dice dónde quedó');
  for (const x of textos) t.ok(!PROHIBIDO.test(x), 'Android: sin prueba, plan ni precios: ' + (x.match(PROHIBIDO) || ''));
  // «Atrás»: de la pantalla a Rutinas, sin salir de la app.
  await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(600);
  t.ok(!(await p.$('#coachHost .pp-title')) && !!(await p.$('#coachHost .pp-franja')), 'Android: «Atrás» vuelve a Rutinas');
  t.eq(await p.evaluate(() => window.__min), 0, 'Android: «Atrás» no saca de la app');
  // En el paso 2, «Atrás» vuelve a elegir archivos.
  await p.click('#coachHost [data-coach="pp-open"]'); await wait(800);
  await subir(p, [{ nombre: 'otra.csv', csv: 'Ejercicio;Series\nPlancha;3\nFondos;3\n' }]);
  t.ok(await p.$('#coachHost .pp-hoja'), 'Android: paso 2');
  await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(600);
  t.ok(!(await p.$('#coachHost .pp-hoja')) && !!(await p.$('#coachHost input[data-pp="archivos"]')), 'Android: «Atrás» en el paso 2 vuelve a elegir planillas');
  t.eq(pg.errs, [], 'errores de la página (Android)');
  await pg.close();

  // ---- 5) Cerrar sesión borra lo que se pasó, y no vuelve: al recargar, la página se va
  // («pagehide») y el borrador no se tiene que volver a guardar. ----
  const BORRADOR = { ts: Date.now(), items: [{ id: 'b1', archivo: 'Juan Pérez.xlsx', hoja: 'Día 1', nombre: 'Día 1', para: A1,
    days: [{ id: 'd1', name: 'Día 1', exercises: [{ id: 'e1', name: 'Sentadilla libre', sets: [{ id: 's1', target: '8', kg: '', reps: '', done: false }] }] }], revisar: [] }] };
  pg = await pagina(base, { estado: Object.assign({}, PRENDIDA, { permiso_rutinas: 'ok' }),
    init: `(() => { if (sessionStorage.getItem('pl-sem')) return; sessionStorage.setItem('pl-sem', '1'); localStorage.setItem(${JSON.stringify(CLAVE)}, ${JSON.stringify(JSON.stringify(BORRADOR))}); })()` });
  p = pg.p;
  await ir(p, 'tpls');
  await p.click('#coachHost [data-coach="pp-open"]'); await wait(800);
  t.has(await text(p, '#coachHost .pp-seguir'), 'Tenés 1 rutina sin guardar de Juan Pérez.xlsx', 'cerrar sesión: antes, el borrador está');
  await configCoach(p, 'cuenta');
  await p.click('[data-auth="logout"]'); await wait(3500);
  t.eq(await p.evaluate(k => localStorage.getItem(k), CLAVE), null, 'cerrar sesión: el borrador se borra y no vuelve al recargar');
  t.eq(pg.errs, [], 'errores de la página (cerrar sesión)');
  await pg.close();

  // ---- 6) La política dice lo que hace la pantalla con lo que ya se pasó. ----
  const pol = fs.readFileSync(path.join(ROOT, 'privacidad/index.html'), 'utf8');
  const coach = (pol.match(/<p id="ia-coach">[\s\S]*?<\/p>/) || [''])[0];
  t.has(coach, 'Mientras el coach las revisa, las rutinas que armó la IA (con los renglones ya limpios de donde salió cada ejercicio, para mostrarle cómo la leyó) quedan solo en su equipo, hasta 7 días o hasta que las guarde, las descarte o cierre sesión.', 'la política: el borrador queda solo en el equipo');
}
