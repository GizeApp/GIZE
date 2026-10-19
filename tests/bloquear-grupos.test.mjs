// «Bloquear» en la Competencia de pasos (app/screens/pasos.js y app/ui/bloquear.js): lo pide Apple
// (guía 1.2), además de reportar. En un grupo se ve el nombre y los pasos de los demás.
// - El «⋯» de otro miembro abre un menú con «Reportar a Bruno» y «Bloquear a Bruno».
// - «Bloquear a Bruno» pide confirmar y dice qué pasa: «No vas a ver a esta persona en tus grupos y
//   no va a poder entrar a los grupos que creaste.» (a quien armó este grupo, además, que sale de
//   acá).
// - Sin conexión: «No se pudo, probá de nuevo.». Con conexión manda block_user con el grupo y el
//   miembro (como lo da el ranking: la app no ve las cuentas de los demás) y vuelve a leer el
//   grupo, que ya llega sin esa persona. Al salir, «Bloqueaste a Bruno».
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const SEM = { desde: '2026-10-05', hasta: '2026-10-11' };
const G = '6b6b6b6b-0000-4000-8000-000000000001';
const GRUPO = { id: G, nombre: 'Los del laburo', codigo: 'ABCD2345', soy_dueno: false, miembros: 3, mi_puesto: 2 };
const BRUNO = '7c7c7c7c-0000-4000-8000-000000000001';
const RANKING = [
  { miembro: BRUNO, nombre: 'Bruno', pasos: 71240, puesto: 1, soy_yo: false },
  { miembro: '7c7c7c7c-0000-4000-8000-000000000002', nombre: 'Prueba', pasos: 52300, puesto: 2, soy_yo: true },
  { miembro: '7c7c7c7c-0000-4000-8000-000000000003', nombre: 'Caro', pasos: 35620, puesto: 3, soy_yo: false },
].map(r => Object.assign(r, SEM));
const TXT = 'No vas a ver a esta persona en tus grupos y no va a poder entrar a los grupos que creaste.';

async function abrirGrupo(base, grupo, s){
  const pg = await newPage({ user: ALUMNO, state: STATE, handlers: {
    '/profiles': profile('client', { full_name: 'Prueba Alumno' }),
    '/rpc/pasos_mis_grupos': (r, J) => (s.lecturas++, J([Object.assign({}, grupo, s.bloqueado ? { miembros: 2, mi_puesto: 1 } : {})])),
    // Como la base: sin quien bloqueé, y los puestos sin esa persona.
    '/rpc/pasos_ranking': (r, J) => J(s.bloqueado ? RANKING.filter(x => x.miembro !== BRUNO).map((x, i) => Object.assign({}, x, { puesto: i + 1 })) : RANKING),
    '/rpc/pasos_campeon': (r, J) => J([]),
    '/rpc/block_user': (r, J, i) => {
      s.envios.push(JSON.parse(i.body));
      if (s.modo === 'sin señal') return r.abort('internetdisconnected');
      s.bloqueado = true;
      return J({ ok: true, desvinculado: false });
    },
  } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-progreso'); await wait(300);
  await pg.p.click('[data-action="psec-open"][data-v="pasos"]'); await wait(700);
  await pg.p.click(`[data-pg="abrir"][data-id="${G}"]`); await wait(900);
  return pg;
}
const nombres = p => p.$$eval('.pg-row .pg-name-t', l => l.map(e => e.textContent));

export default async function ({ base, t }){
  // 1) Miembro: el menú, la confirmación, sin conexión y bloquear.
  {
    const s = { envios: [], modo: 'ok', bloqueado: false, lecturas: 0 };
    const { p, errs, close } = await abrirGrupo(base, GRUPO, s);
    t.eq(await p.getAttribute('[data-pg="mas"][data-n="Bruno"]', 'aria-label'), 'Reportar o bloquear a Bruno', 'el «⋯» se lee como «Reportar o bloquear a Bruno»');
    t.eq(await p.$$eval('.pg-row.me [data-pg="mas"]', l => l.length), 0, 'en mi fila no hay «⋯»');
    await p.click('[data-pg="mas"][data-n="Bruno"]'); await wait(400);
    t.eq(await text(p, '#blockHost .sheet-title'), 'Bruno', 'el menú dice a quién');
    t.has(await text(p, '#blockHost .rep-cita'), '«Los del laburo»', 'y en qué grupo');
    t.eq(await p.$$eval('#blockHost .blq-opt', l => l.map(e => e.innerText.trim())), ['Reportar a Bruno', 'Bloquear a Bruno'], 'el menú: reportar y bloquear');
    await p.click('#blockHost [data-blq="bloquear"]'); await wait(300);
    t.eq(await text(p, '#blockHost .sheet-title'), '¿Bloquear a Bruno?', 'confirmación: «¿Bloquear a Bruno?»');
    t.eq(await text(p, '#blockHost .blq-que'), TXT, 'confirmación: qué pasa');
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll de costado a 390 px');

    s.modo = 'sin señal';
    await p.click('#blockHost [data-blq="si"]'); await wait(700);
    t.eq(await text(p, '#blockHost .rep-err'), 'No se pudo, probá de nuevo.', 'sin conexión: «No se pudo, probá de nuevo.»');
    t.eq(await nombres(p), ['Bruno', 'Prueba', 'Caro'], 'sin conexión: el grupo queda igual');

    s.modo = 'ok';
    const antes = s.lecturas;
    await p.click('#blockHost [data-blq="si"]'); await wait(1200);
    t.eq(s.envios[s.envios.length - 1], { p_kind: 'grupo', p_ref: G, p_target: BRUNO }, 'block_user: el grupo y el miembro');
    t.eq(await text(p, '#blockHost .sheet-title'), 'Bloqueaste a Bruno', 'al salir: «Bloqueaste a Bruno»');
    t.has(await text(p, '#blockHost .blq-sheet'), 'Ya no vas a ver a Bruno en tus grupos.', 'al salir: ya no lo vas a ver');
    t.ok(s.lecturas > antes, 'se vuelven a leer mis grupos');
    await p.click('#blockHost .sheet-btns [data-blq="cancel"]'); await wait(400);
    t.ok(!(await p.$('#blockHost .sheet')), '«Listo» cierra la hoja');
    t.eq(await nombres(p), ['Prueba', 'Caro'], 'el ranking ya no muestra a Bruno');
    t.eq(await text(p, '.pg-head .form-title'), 'Los del laburo', 'el grupo sigue abierto');
    t.eq(errs, [], 'errores de la página (miembro)');
    await close();
  }
  // 2) Quien armó el grupo: además, que sale de este grupo. Desde el menú también se reporta.
  {
    const s = { envios: [], modo: 'ok', bloqueado: false, lecturas: 0 };
    const { p, errs, close } = await abrirGrupo(base, Object.assign({}, GRUPO, { soy_dueno: true }), s);
    await p.click('[data-pg="mas"][data-n="Caro"]'); await wait(400);
    await p.click('#blockHost [data-blq="bloquear"]'); await wait(300);
    t.eq(await text(p, '#blockHost .blq-que'), TXT + ' Como armaste este grupo, también sale de acá.', 'dueño: además, que sale de este grupo');
    await p.keyboard.press('Escape'); await wait(400);
    t.ok(!(await p.$('#blockHost .sheet')) && s.envios.length === 0, 'Escape cierra sin bloquear');
    await p.click('[data-pg="mas"][data-n="Caro"]'); await wait(400);
    await p.click('#blockHost [data-blq="reportar"]'); await wait(400);
    t.ok(!(await p.$('#blockHost .sheet')) && await p.isVisible('#reportHost .rep-sheet'), '«Reportar a Caro» abre la hoja de reportar');
    t.eq(await text(p, '#reportHost .sheet-title'), 'Reportar a Caro', 'la hoja de reportar es la de Caro');
    t.eq(errs, [], 'errores de la página (dueño)');
    await close();
  }
}
