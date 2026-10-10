// «Reportar» en la Competencia de pasos (app/screens/pasos.js y app/ui/reportar.js): lo piden
// Apple (guía 1.2) y Google Play para las apps donde la gente intercambia contenido. En un grupo
// se ve el nombre de los demás: ese nombre se puede reportar.
// - En la fila de otro miembro está el «⋯» de reportar; en la mía no (queda el lugar vacío, así
//   los pasos siguen alineados). Con «Sacar a alguien del grupo» abierto, van las ✕ en su lugar.
// - «Reportar a Bruno» muestra su nombre y el grupo, los tres motivos y que también se puede salir
//   del grupo (o sacarlo, si soy quien lo armó).
// - Manda report_content con el grupo, el miembro (como lo da el ranking), el motivo y la nota.
// - Sin conexión: «No se pudo enviar, probá de nuevo»; al salir: «Gracias, lo vamos a revisar.».
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const SEM = { desde: '2026-10-05', hasta: '2026-10-11' };
const G = '6b6b6b6b-0000-4000-8000-000000000001';
const GRUPO = { id: G, nombre: 'Los del laburo', codigo: 'ABCD2345', soy_dueno: false, miembros: 3, mi_puesto: 2 };
const RANKING = [
  { miembro: '7c7c7c7c-0000-4000-8000-000000000001', nombre: 'Bruno', pasos: 71240, puesto: 1, soy_yo: false },
  { miembro: '7c7c7c7c-0000-4000-8000-000000000002', nombre: 'Prueba', pasos: 52300, puesto: 2, soy_yo: true },
  { miembro: '7c7c7c7c-0000-4000-8000-000000000003', nombre: 'Caro', pasos: 35620, puesto: 3, soy_yo: false },
].map(r => Object.assign(r, SEM));

async function abrirGrupo(base, grupo, envios, modo){
  const pg = await newPage({ user: ALUMNO, state: STATE, handlers: {
    '/profiles': profile('client', { full_name: 'Prueba Alumno' }),
    '/rpc/pasos_mis_grupos': (r, J) => J([grupo]),
    '/rpc/pasos_ranking': (r, J) => J(RANKING),
    '/rpc/pasos_campeon': (r, J) => J([]),
    '/rpc/report_content': (r, J, i) => { envios.push(JSON.parse(i.body)); return modo() === 'sin señal' ? r.abort('internetdisconnected') : J({ ok: true }); },
  } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-progreso'); await wait(300);
  await pg.p.click('[data-action="psec-open"][data-v="pasos"]'); await wait(700);
  await pg.p.click(`[data-pg="abrir"][data-id="${G}"]`); await wait(900);
  return pg;
}

export default async function ({ base, t }){
  // 1) Miembro: el «⋯» en los demás, la hoja, sin conexión y con conexión.
  {
    const envios = []; let modo = 'ok';
    const { p, errs, close } = await abrirGrupo(base, GRUPO, envios, () => modo);
    const filas = await p.$$eval('.pg-row', l => l.map(r => ({ n: r.querySelector('.pg-name-t').textContent, mas: !!r.querySelector('[data-pg="reportar"]'), lugar: !!r.querySelector('.pg-more-sp') })));
    t.eq(filas, [{ n: 'Bruno', mas: true, lugar: false }, { n: 'Prueba', mas: false, lugar: true }, { n: 'Caro', mas: true, lugar: false }],
      'el «⋯» en la fila de los demás; en la mía, el lugar vacío');
    t.eq(await p.getAttribute('[data-pg="reportar"][data-n="Bruno"]', 'aria-label'), 'Reportar a Bruno', 'el «⋯» se lee como «Reportar a Bruno»');
    const alineados = await p.$$eval('.pg-row .pg-n', l => new Set(l.map(e => Math.round(e.getBoundingClientRect().right))).size);
    t.eq(alineados, 1, 'los pasos quedan alineados (con y sin «⋯»)');
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll de costado a 390 px');

    await p.click('[data-pg="reportar"][data-n="Bruno"]'); await wait(400);
    t.ok(await p.isVisible('#reportHost .rep-sheet'), 'se abre la hoja «Reportar»');
    t.eq(await text(p, '#reportHost .sheet-title'), 'Reportar a Bruno', 'título con el nombre');
    t.has(await text(p, '#reportHost .rep-cita'), 'Su nombre en «Los del laburo»: Bruno', 'se ve el nombre y el grupo');
    t.eq(await p.$$eval('#reportHost .rep-opt', l => l.map(e => e.innerText.trim())), ['Contenido ofensivo o acoso', 'Spam', 'Otro'], 'los mismos tres motivos');
    t.has(await text(p, '#reportHost .rep-sheet'), '«Salir del grupo»', 'menciona que puede salir del grupo');
    t.ok(!(await text(p, '#reportHost .rep-sheet')).includes('Sacar a alguien'), 'a quien no armó el grupo no le ofrece sacar a nadie');
    t.ok(await p.isDisabled('#reportHost [data-rep="send"]'), '«Enviar» deshabilitado sin motivo');

    await p.click('#reportHost [data-rep="motivo"][data-v="spam"]');
    modo = 'sin señal';
    await p.click('#reportHost [data-rep="send"]'); await wait(700);
    t.has(await text(p, '#reportHost .rep-err'), 'No se pudo enviar, probá de nuevo.', 'sin conexión: «No se pudo enviar, probá de nuevo»');
    t.ok(await p.isVisible('#reportHost .rep-sheet'), 'sin conexión: la hoja sigue abierta');
    modo = 'ok';
    await p.fill('#repNota', 'El apodo es un insulto');
    await p.click('#reportHost [data-rep="send"]'); await wait(700);
    t.eq(envios[envios.length - 1], { p_kind: 'grupo', p_ref: G, p_reported: RANKING[0].miembro, p_reason: 'spam', p_detail: 'El apodo es un insulto' },
      'report_content: el grupo, el miembro, el motivo y la nota');
    t.eq(envios.length, 2, 'un envío por toque');
    t.has(await text(p, '#reportHost .rep-sheet'), 'Gracias, lo vamos a revisar.', 'al salir: «Gracias, lo vamos a revisar.»');
    await p.click('#reportHost .sheet-bg'); await wait(400);
    t.ok(!(await p.$('#reportHost .rep-sheet')), 'tocar afuera cierra la hoja');
    t.eq(await text(p, '.pg-head .form-title'), 'Los del laburo', 'el grupo sigue abierto');
    // «Cancelar» cierra sin mandar nada.
    await p.click('[data-pg="reportar"][data-n="Caro"]'); await wait(400);
    await p.click('#reportHost [data-rep="motivo"][data-v="otro"]');
    await p.click('#reportHost .sheet-btns [data-rep="cancel"]'); await wait(400);
    t.ok(!(await p.$('#reportHost .rep-sheet')), '«Cancelar» cierra la hoja');
    t.eq(envios.length, 2, '«Cancelar» no manda nada');
    t.eq(errs, [], 'errores de la página (miembro)');
    await close();
  }
  // 2) Quien armó el grupo: también le ofrece sacarlo. Con las ✕ de sacar a la vista, no hay «⋯».
  {
    const envios = [];
    const { p, errs, close } = await abrirGrupo(base, Object.assign({}, GRUPO, { soy_dueno: true }), envios, () => 'ok');
    await p.click('[data-pg="reportar"][data-n="Caro"]'); await wait(400);
    t.has(await text(p, '#reportHost .rep-sheet'), '«Sacar a alguien del grupo»', 'dueño: le ofrece sacarlo del grupo');
    await p.click('#reportHost .sheet-btns [data-rep="cancel"]'); await wait(400);
    await p.click('[data-pg="sacando"]'); await wait(300);
    t.eq(await p.$$eval('[data-pg="reportar"]', l => l.length), 0, 'sacando gente: sin «⋯»');
    t.eq(await p.$$eval('.pg-rm', l => l.map(b => b.dataset.n)), ['Bruno', 'Caro'], 'sacando gente: las ✕ como siempre');
    t.eq(errs, [], 'errores de la página (dueño)');
    await close();
  }
}
