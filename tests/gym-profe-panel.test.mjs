// Gimnasios, etapa 1 (parte 4): el profe de un gimnasio en su panel de coach (SPEC §3.1;
// app/screens/coach/gimnasio.js, panel.js, index.js).
// - El chip «Gimnasio Fuerza» en la barra.
// - Clientes en dos grupos, «Socios de Gimnasio Fuerza» (mi_gimnasio().mis_socios) y «Alumnos propios»,
//   cuando tiene de los dos; con solo socios, una lista como hoy. La lista sigue saliendo de
//   profiles.coach_id = yo.
// - La caja del código: el del gimnasio primero; el personal solo con alumnos propios o un plan propio;
//   con el gimnasio en el cupo, «El gimnasio no puede sumar socios en este momento». «Invitar socio»
//   copia el del gimnasio.
// - La ficha de un socio: la tarjeta «Gimnasio» (gym_ficha_profe: estado y semáforo sin montos, apto
//   médico, socio desde y últimos ingresos) y «Dejar de ser su profe»; la de un alumno propio, como hoy
//   (sin tarjeta, con «Desvincular alumno»).
// - Un coach sin gimnasio: nada de esto (ni el chip, ni grupos, ni gym_ficha_profe, ni el CSS del
//   gimnasio).
// Celular y compu, Oscuro y Claro (capturas en GYM_CAPTURAS).
import { wait, newPage } from './lib.mjs';
import { entrarProfe, miGimnasioProfe, alumnosProfe, fichaProfe, PROFE, PROPIO, COACH, S, F, M, D, hostTxt, rpcs, captura, sinScrollHorizontal } from './gym-comun.mjs';

const clientes = async p => { await p.click('[data-coach="view-clients"]'); await wait(600); };
const abrir = async (p, id) => { await p.evaluate(id => document.querySelector('#coachHost [data-coach="open"][data-id="' + id + '"]').click(), id); await wait(1200); };
const grupos = p => p.$$eval('#coachHost .cv-grp', l => l.map(g => g.firstChild.textContent + ' ' + g.querySelector('.cv-grp-n').textContent));

export default async function ({ base, t }){
  for (const [vp, tema] of [[D, 'oscuro'], [M, 'oscuro'], [D, 'claro'], [M, 'claro']]){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    const pg = await entrarProfe(base, { vp, tema, touch: vp === M });
    const p = pg.p;
    t.eq(await p.$eval('#coachHost .cv-gymchip', e => e.textContent).catch(() => ''), 'Gimnasio Fuerza', donde + ': el chip del gimnasio en la barra');
    await clientes(p);
    t.eq(await grupos(p), ['Socios de Gimnasio Fuerza 2', 'Alumnos propios 1'], donde + ': dos grupos con cuántos tiene cada uno');
    const orden = await p.$$eval('#coachHost .cv-row', l => l.map(r => r.dataset.id));
    t.eq(orden, [S.A1, S.A2, PROPIO.id], donde + ': los socios primero y después los alumnos propios');
    const h = await hostTxt(p);
    const iGym = h.indexOf('Código de Gimnasio Fuerza'), iPers = h.indexOf('Tu código personal');
    t.ok(iGym > 0 && iPers > iGym, donde + ': el código del gimnasio primero y después el personal (tiene un alumno propio)');
    t.ok(/FUERZA22/.test(h) && /LUCIA234/.test(h), donde + ': los dos códigos');
    t.has(h, 'Invitar socio', donde + ': el botón de arriba invita al gimnasio');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': sin scroll horizontal');
    await captura(p, 'profe-clientes-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    // Ficha de un socio: la tarjeta Gimnasio.
    await abrir(p, S.A1);
    let f = await hostTxt(p);
    t.ok(/Gimnasio Activo · último ingreso hoy \d\d:\d\d/.test(f), donde + ': la tarjeta Gimnasio en el menú de la ficha: ' + f.slice(0, 400));
    t.has(f, 'Dejar de ser su profe', donde + ': «Dejar de ser su profe» en lugar de «Desvincular»');
    t.ok(!/Desvincular alumno/.test(f), donde + ': sin «Desvincular alumno»');
    t.eq(rpcs(pg.st, 'gym_ficha_profe').map(b => b.socio), [S.A1], donde + ': pide la tarjeta una vez, del socio abierto');
    await captura(p, 'profe-ficha-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    await p.click('[data-coach="sec-open"][data-v="gimnasio"]'); await wait(400);
    f = await hostTxt(p);
    t.ok(/En Gimnasio Fuerza Activo/.test(f) && /Apto médico Vence el 10\/02\/27/.test(f) && /Socio desde/.test(f) && /Últimos ingresos Hoy \d\d:\d\d Hace 2 días · estaba pausado/.test(f),
      donde + ': estado, apto, alta y últimos ingresos: ' + f.slice(0, 500));
    t.ok(!/\$|monto|DNI|teléfono|@/i.test(f.replace(/datos de contacto/, '')), donde + ': sin montos ni datos de contacto');
    t.eq(await p.$eval('#coachHost .cv-gymcard .gy-sem', e => e.className), 'gy-sem verde', donde + ': el semáforo en verde');
    await captura(p, 'profe-tarjeta-gimnasio-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    // Alumno propio: como hoy.
    await p.click('[data-coach="back"]'); await wait(500);
    await abrir(p, PROPIO.id);
    f = await hostTxt(p);
    t.ok(/Desvincular alumno/.test(f) && !/Dejar de ser su profe/.test(f) && !/\bGimnasio\b(?! Fuerza)/.test(f.replace(/Gimnasio Fuerza/g, '')), donde + ': el alumno propio, como hoy (sin tarjeta Gimnasio)');
    t.eq(rpcs(pg.st, 'gym_ficha_profe').length, 1, donde + ': no se pide la tarjeta de un alumno propio');
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // Apto vencido, pausado y la tarjeta que no se puede leer (acceso pausado).
  {
    const pg = await entrarProfe(base, { vp: D, rpc: { gym_ficha_profe: () => fichaProfe({ estado: 'pausado', semaforo: 'ambar', motivo: 'Pausado hasta el 12/11', apto_vencido: true, apto_medico_vence: '2026-09-01', ingresos: [] }) } });
    const p = pg.p;
    await clientes(p); await abrir(p, S.A2);
    await p.click('[data-coach="sec-open"][data-v="gimnasio"]'); await wait(400);
    const f = await hostTxt(p);
    t.ok(/Pausado hasta el 12\/11/.test(f) && /Vencido el 01\/09\/26/.test(f) && /Todavía no registró ingresos/.test(f), 'pausado, apto vencido y sin ingresos: ' + f.slice(0, 400));
    t.eq(await p.$eval('#coachHost .cv-gymcard .gy-sem', e => e.className), 'gy-sem ambar', 'el semáforo en ámbar');
    await pg.close();
  }

  // Solo socios del gimnasio: una lista, sin grupos; sin alumnos propios ni plan propio, sin código personal.
  {
    const pg = await entrarProfe(base, { vp: D, alumnos: alumnosProfe(false), billing: null });
    const p = pg.p;
    await clientes(p);
    t.eq(await grupos(p), [], 'solo socios: una lista, sin grupos');
    const h = await hostTxt(p);
    t.ok(/Código de Gimnasio Fuerza/.test(h) && !/Tu código personal|LUCIA234|Tu código de invitación/.test(h), 'sin alumnos propios ni plan propio: solo el código del gimnasio');
    await captura(p, 'profe-solo-socios-compu');
    // «Invitar socio» copia el código del gimnasio.
    await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await p.click('#coachHost .cv-head [data-coach="copy-gym-code"]'); await wait(200);
    t.eq(await p.evaluate(() => navigator.clipboard.readText()), 'FUERZA22', '«Invitar socio» copia el código del gimnasio');
    await pg.close();
  }
  // Sin socios todavía: los pasos hablan del gimnasio.
  {
    const pg = await entrarProfe(base, { vp: M, alumnos: [], billing: null, gym: miGimnasioProfe({ mis_fichas: [], mis_socios: [] }) });
    await clientes(pg.p);
    const h = await hostTxt(pg.p);
    t.ok(/Todavía no tenés socios asignados/.test(h) && /código del gimnasio/.test(h), 'sin socios: «Todavía no tenés socios asignados» y el código del gimnasio');
    await captura(pg.p, 'profe-sin-socios-cel');
    await pg.close();
  }
  // El gimnasio llegó al cupo.
  {
    const pg = await entrarProfe(base, { vp: D, gym: miGimnasioProfe({ plan: { estado: 'activo', vence: null, pausa_profes_el: null, cupo_lleno: true } }) });
    await clientes(pg.p);
    const h = await hostTxt(pg.p);
    t.ok(/El gimnasio no puede sumar socios en este momento\./.test(h) && !/FUERZA22/.test(h), 'cupo lleno: el texto, sin el código ni el plan del gimnasio');
    t.ok(!/Invitar socio/.test(h), 'cupo lleno: sin «Invitar socio»');
    await pg.close();
  }

  // ===== Un coach sin gimnasio: como hoy =====
  {
    const ALU = [{ id: '11111111-1111-1111-1111-111111111111', full_name: 'Ana Torres', role: 'client', coach_id: COACH.id }, { id: '44444444-4444-4444-4444-444444444444', full_name: 'Bruno Castro', role: 'client', coach_id: COACH.id }];
    const fns = [];
    const pg = await newPage({ user: COACH, viewport: D, handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J(ALU); const me = { id: COACH.id, role: 'coach', full_name: 'Carlos Coach', coach_id: null }; return J(i.one ? me : [me]); },
      '/rpc/mi_gimnasio': (r, J) => J(null), '/rpc/my_invite_code': (r, J) => J('CARLOS23'),
      '/rpc/gym_ficha_profe': (r, J) => { fns.push(1); return J(null); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'p10', max_clients: 10, trial_ends_at: new Date(Date.now() - 30 * 864e5).toISOString(), paid_until: new Date(Date.now() + 20 * 864e5).toISOString() }; return J(i.one ? b : [b]); } } });
    const p = pg.p;
    await p.goto(base + '/app/'); await wait(2600);
    await clientes(p);
    const h = await hostTxt(p);
    t.ok(!await p.$('.cv-gymchip') && !await p.$('.cv-grp') && /Tu código de invitación/.test(h) && /CARLOS23/.test(h) && /Invitar cliente/.test(h),
      'coach sin gimnasio: sin chip ni grupos, con su código de siempre e «Invitar cliente»');
    t.ok(!/Gimnasio|Recepción/.test(h), 'coach sin gimnasio: no aparece nada del gimnasio');
    t.has(h, 'Plan 10 clientes · 2/10', 'coach sin gimnasio: la tira del plan cuenta su lista (sin seats_used, como hoy)');
    await abrir(p, ALU[0].id);
    const f = await hostTxt(p);
    t.ok(/Desvincular alumno/.test(f) && !/Dejar de ser su profe/.test(f), 'coach sin gimnasio: la ficha como hoy');
    t.eq([fns.length, await p.evaluate(() => !!document.querySelector('link[data-gym-css]'))], [0, false], 'coach sin gimnasio: ni gym_ficha_profe ni el CSS del gimnasio');
    t.eq(pg.errs, [], 'coach sin gimnasio: sin errores');
    await pg.close();
  }
}
