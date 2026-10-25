// La IA de la app para un profe de gimnasio sin plan propio de coach (decisión del dueño): usa los
// topes de coach, y tiene que quedar claro de dónde salen (supabase/ia.sql → ia_rol_origen).
// 1) El panel (gize.ar/admin → IA): en «Topes», bajo Coach, la aclaración de que también son los de
//    un profe de gimnasio con el plan al día; en «Últimas llamadas», la columna «Quién» dice
//    «Coach (por gimnasio)» para esas llamadas y «Coach» para las de un coach con plan.
// 2) La app: con ia_mi_estado().por_gimnasio, Ajustes → Funciones con IA y el aviso del límite de
//    hoy dicen que sus límites son los de coach, por su gimnasio. Sin eso, no dicen nada nuevo.
import { newPage, wait, text, ADMIN } from './lib.mjs';
import { ESTADO_ON, PLATO, pagina, abrirComida, abrirBuscador, fotoJpeg } from './comida-ia-comun.mjs';

const NUEVO = new Date(Date.now() - 3600e3).toISOString();
const ESTADO = extra => Object.assign({ activa: true, funciones: { etiqueta_admin: true, etiqueta_usuario: false, plato: true, texto: false, rutina: false, resumen: false },
  modelos: {}, topes: { alumno: { plato: 8, total: 25, usd_ciclo: 0.5 }, coach: { plato: 8, total: 40, usd_ciclo: 5 }, admin: { etiqueta: 300, total: 300, usd_ciclo: 10 } },
  ancla: '2026-11-10T00:00:00Z', pedidos_desde: '2026-10-19T03:00:00Z', aviso_version: 2,
  ciclo: { id: 1, inicio: '2026-10-10T00:00:00Z', fin: '2026-11-10T00:00:00Z', credito: 200, aviso: 100, ahorro: 150, tope: 180, gastado: 0.01, reservado: 0, estado: 'normal',
    cortado_por: null, vuelve: null, aviso_at: null, hoy: 0.001, limite_hoy: 16, proyeccion: 0.05 },
  por_funcion: {}, errores: {}, tablas: { leidas: 0, sin_tabla: 0, publicadas: 0, sin_corregir: 0, kcal_bien: 0 }, clave_rechazada: null, ultimas: [] }, extra);
const FN_ESTADO = { ok: true, clave: true, modelos: [{ id: 'm1', nombre: 'Modelo de prueba', defecto: true, tabla: true, usd_tabla: 0.0005 }] };
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const AVISO = 'Tus límites de IA son los de coach, por tu gimnasio.';

export default async function ({ base, t }){
  // ===== 1) El panel =====
  const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1280, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true), '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }),
    '/admin_contact_unread': (r, J) => J(0), '/admin_reports_pending': (r, J) => J(0), '/admin_requests_pending': (r, J) => J(0),
    '/admin_ia_estado': (r, J) => J(ESTADO({ ultimas: [
      { creada: NUEVO, rol: 'coach', origen: 'gimnasio', funcion: 'plato', modelo: 'm1', estado: 'ok', codigo: null, usd: 0.003, max_usd: 0.01, ms: 1500 },
      { creada: NUEVO, rol: 'coach', origen: 'plan', funcion: 'plato', modelo: 'm1', estado: 'ok', codigo: null, usd: 0.003, max_usd: 0.01, ms: 1500 },
      { creada: NUEVO, rol: 'alumno', origen: null, funcion: 'plato', modelo: 'm1', estado: 'ok', codigo: null, usd: 0.003, max_usd: 0.01, ms: 1500 }] })),
    '/functions/v1/ia': (r, J) => J(FN_ESTADO),
  } });
  await p.goto(base + '/admin/#ia'); await wait(1500);
  await p.$$eval('#iaTopesB, #iaUltB', ds => ds.forEach(d => { d.open = true; })); await wait(300);
  t.has(await text(p, '#iaTopesB'), 'Coach con plan al día, o profe de un gimnasio con el plan al día (coach por gimnasio).', 'Topes: bajo Coach, de dónde salen');
  t.eq(await p.$$eval('#iaUltB thead th', ths => ths.map(x => x.textContent)), ['Cuándo', 'Quién', 'Qué', 'Modelo', 'Cómo salió', 'Costo', 'Tardó'], 'Últimas llamadas: la columna «Quién»');
  t.eq(await p.$$eval('#iaUltB tbody tr', trs => trs.map(tr => tr.children[1].textContent)), ['Coach (por gimnasio)', 'Coach', 'Alumno'], 'Últimas llamadas: el profe sale como «Coach (por gimnasio)»');
  t.eq(errs, [], 'errores de la página (panel)');
  await close();

  // ===== 2) La app =====
  const OK = Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' });
  for (const gym of [true, false]){
    const nombre = gym ? 'profe por gimnasio' : 'sin gimnasio';
    let n = 0;
    const a = await pagina({ estado: Object.assign({}, OK, { quedan: { plato: 3, texto: 15 } }, gym ? { por_gimnasio: true } : {}),
      funcion: () => (++n === 1 ? [429, { ok: false, codigo: 'tope_dia', mensaje: 'x', tope: 8 }] : [200, PLATO]) });
    await abrirComida(a.p, base); await abrirBuscador(a.p);
    await a.p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    await a.p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(a.p)); await wait(1500);
    const err = await txt(a.p, '#sheetHost .pl8-err');
    t.has(err, 'Llegaste al límite de hoy (8 fotos de plato con IA)', nombre + ': el aviso del límite de hoy');
    t.eq(err.includes(AVISO), gym, nombre + ': el aviso ' + (gym ? 'dice' : 'no dice') + ' que es por su gimnasio');
    t.eq(a.errs, [], nombre + ': errores de la página (Comida)');
    await a.close();
    const c = await pagina({ estado: Object.assign({}, OK, gym ? { por_gimnasio: true } : {}) });
    await abrirComida(c.p, base);
    await c.p.click('#nav-config'); await wait(1200);
    const desc = await txt(c.p, '#cfgIaDesc');
    t.has(desc, 'Envía a Anthropic (EE. UU.) la foto de cada consulta. Apagado: no se manda nada.', nombre + ': Ajustes, qué hace');
    t.eq(desc.includes(AVISO), gym, nombre + ': Ajustes ' + (gym ? 'dice' : 'no dice') + ' que los límites son por su gimnasio');
    t.eq(c.errs, [], nombre + ': errores de la página (Ajustes)');
    await c.close();
  }
}
