// Gimnasios, etapa 1 (parte 4): «Dejar de ser su profe» (SPEC §3.1; gym_dejar_socio).
// - En la ficha de un socio del gimnasio, «Desvincular alumno» pasa a ser «Dejar de ser su profe»: la
//   pregunta dice que sigue en el gimnasio, sin profe, y que la administración le asigna otro.
// - Cancelar no hace nada. Aceptar llama a gym_dejar_socio con la ficha (la de la tarjeta Gimnasio, o la
//   pide si todavía no llegó), lo saca de la lista y de los socios que atiende, vuelve a Clientes y avisa.
// - Si el servidor no deja (ya no es su profe), su texto y el socio sigue.
// - Un alumno propio sigue con «Desvincular alumno» (coach_remove_client), como hoy.
// - Con el acceso de los profes pausado (el servidor no da la ficha), ni «Dejar de ser su profe» ni
//   «Desvincular alumno» en la ficha del socio; el alumno propio, igual que siempre.
import { wait } from './lib.mjs';
import { entrarProfe, fichaProfe, miGimnasioProfe, S, F, PROPIO, M, D, hostTxt, rpcs, captura } from './gym-comun.mjs';

const clientes = async p => { await p.click('[data-coach="view-clients"]'); await wait(600); };
const abrir = async (p, id) => { await p.evaluate(id => document.querySelector('#coachHost [data-coach="open"][data-id="' + id + '"]').click(), id); await wait(1200); };
const filas = p => p.$$eval('#coachHost .cv-row', l => l.map(r => r.dataset.id));

export default async function ({ base, t }){
  for (const vp of [D, M]){
    const donde = vp === M ? 'celular' : 'compu';
    const pg = await entrarProfe(base, { vp, touch: vp === M, rpc: { gym_dejar_socio: (b, st) => { st.gym.mis_socios = st.gym.mis_socios.filter(x => x !== S.A1); return { ok: true }; } } });
    const p = pg.p;
    await clientes(p); await abrir(p, S.A1);
    t.ok(!!await p.$('[data-coach="gym-dejar"]') && !await p.$('[data-coach="remove-client"]'), donde + ': en la ficha del socio, «Dejar de ser su profe»');
    // Cancelar.
    p.contestar = false;
    await p.click('[data-coach="gym-dejar"]'); await wait(700);
    const q = pg.preguntas[0] || {};
    t.eq([q.ok, q.texto], ['Dejar de ser su profe', '¿Dejar de ser el profe de Martina Sosa?\n\nMartina Sosa sigue en Gimnasio Fuerza, sin profe: la administración le asigna otro. Dejás de ver sus entrenos, sus registros y su chat; Martina Sosa no pierde nada.'],
      donde + ': la pregunta dice que sigue en el gimnasio sin profe');
    t.eq(rpcs(pg.st, 'gym_dejar_socio').length, 0, donde + ': cancelar no hace nada');
    if (vp === D) await captura(p, 'profe-dejar-ficha-compu');
    // Aceptar.
    p.contestar = true;
    await p.click('[data-coach="gym-dejar"]'); await wait(1200);
    t.eq(rpcs(pg.st, 'gym_dejar_socio'), [{ ficha: F.A1 }], donde + ': gym_dejar_socio con la ficha de la tarjeta');
    t.ok(pg.dialogs.some(d => d === 'Listo: Martina Sosa sigue en Gimnasio Fuerza, sin profe. La administración le asigna otro.'), donde + ': avisa: ' + JSON.stringify(pg.dialogs.slice(-1)));
    t.eq(await filas(p), [S.A2, PROPIO.id], donde + ': vuelve a Clientes sin Martina');
    t.ok(await p.evaluate(async id => !((await import('/app/core/gimnasio.js')).Gym.info.mis_socios || []).includes(id), S.A1), donde + ': y ya no está entre los socios que atiende');
    t.ok(rpcs(pg.st, 'mi_gimnasio').length >= 2, donde + ': vuelve a preguntar mi_gimnasio');
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // La tarjeta todavía no llegó: pide la ficha antes de dejarlo.
  {
    let pedidas = 0;
    const pg = await entrarProfe(base, { vp: D, rpc: { gym_ficha_profe: () => { pedidas++; return pedidas === 1 ? { demora: 4000, valor: fichaProfe({ ficha: F.A2 }) } : fichaProfe({ ficha: F.A2 }); }, gym_dejar_socio: () => ({ ok: true }) } });
    const p = pg.p;
    await clientes(p); await abrir(p, S.A2);
    await p.click('[data-coach="gym-dejar"]'); await wait(1500);
    t.eq(rpcs(pg.st, 'gym_dejar_socio'), [{ ficha: F.A2 }], 'sin la tarjeta todavía: pide la ficha y deja al socio que corresponde');
    await pg.close();
  }

  // El servidor no deja: su texto, y el socio sigue en la lista.
  {
    const pg = await entrarProfe(base, { vp: D, rpc: { gym_dejar_socio: () => ({ error: 'P0001', msg: 'No sos el profe de este socio.' }) } });
    const p = pg.p;
    await clientes(p); await abrir(p, S.A1);
    await p.click('[data-coach="gym-dejar"]'); await wait(1000);
    t.ok(pg.dialogs.includes('No sos el profe de este socio.'), 'si el servidor no deja: su texto');
    t.ok(!!await p.$('[data-coach="gym-dejar"]:not([disabled])'), 'y la ficha sigue abierta, con el botón para reintentar');
    await clientes(p);
    t.ok((await filas(p)).includes(S.A1), 'el socio sigue en la lista');
    await pg.close();
  }

  // Acceso de los profes pausado: sin el botón que fallaba siempre.
  {
    const PAUSA = 'El acceso del gimnasio está pausado. Hablá con la administración.';
    const gym = miGimnasioProfe({ plan: { estado: 'operativo', vence: new Date(Date.now() - 8 * 864e5).toISOString(), pausa_profes_el: new Date(Date.now() - 3 * 864e5).toISOString(), cupo_lleno: false } });
    const pg = await entrarProfe(base, { vp: D, gym, rpc: { gym_ficha_profe: () => ({ error: 'P0001', msg: PAUSA }) } });
    const p = pg.p;
    await clientes(p); await abrir(p, S.A1);
    t.has(await hostTxt(p), PAUSA, 'pausado: la ficha dice que el acceso está pausado');
    t.ok(!await p.$('[data-coach="gym-dejar"]') && !await p.$('[data-coach="remove-client"]'), 'pausado: ni «Dejar de ser su profe» ni «Desvincular alumno» en la ficha del socio');
    await clientes(p); await abrir(p, PROPIO.id);
    t.ok(!!await p.$('[data-coach="remove-client"]'), 'pausado: el alumno propio sigue con «Desvincular alumno»');
    t.eq(pg.errs, [], 'pausado: sin errores');
    await pg.close();
  }

  // Un alumno propio: «Desvincular alumno», como hoy.
  {
    const pg = await entrarProfe(base, { vp: D, rpc: { coach_remove_client: () => true } });
    const p = pg.p;
    await clientes(p); await abrir(p, PROPIO.id);
    t.ok(!!await p.$('[data-coach="remove-client"]') && !await p.$('[data-coach="gym-dejar"]'), 'alumno propio: «Desvincular alumno»');
    await p.click('[data-coach="remove-client"]'); await wait(1000);
    t.eq(rpcs(pg.st, 'coach_remove_client').map(b => b.client), [PROPIO.id], 'desvincula con coach_remove_client, como hoy');
    t.eq(rpcs(pg.st, 'gym_dejar_socio').length, 0, 'sin gym_dejar_socio');
    t.has(await hostTxt(p), 'Clientes', 'vuelve a Clientes');
    await pg.close();
  }
}
