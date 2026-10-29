// Gimnasios, etapa 1 (parte 4): App Store y Google Play en la recepción, Asistencia y el panel del profe
// (plan, «Reglas para todas las partes» 3). Con la app de iPhone y la de Android simuladas se recorre:
// la recepción de la cuenta de recepción (buscar, la ficha, el ingreso, Solicitudes y Cargar ficha), la
// del dueño (entrando por la tarjeta de Inicio), Asistencia con el ingreso manual, y el panel del profe
// (Clientes, la ficha y la tarjeta Gimnasio, la recepción del profe, con el gimnasio en gracia y con su
// plan propio vencido). En ninguna aparece «$», precios, planes de GIZE, «prueba», Mercado Pago,
// transferencia ni links de pago, ni se abre la hoja de planes.
import { wait } from './lib.mjs';
import { entrar, entrarProfe, miGimnasio, miGimnasioProfe, DUENA, RECEP, F, S, M, IOS, ANDROID, busqueda, ingresosHoy, buscarRec } from './gym-comun.mjs';

const PROHIBIDO = /\$|pagar|\bprueba\b|gratis|precio|mercado ?pago|transferencia|suscrip|gimnasio chico|gimnasio grande|\bp(100|250|500)\b|sin cargo|tarjeta|contratar|contratá|renov|plan de gize|tu plan|el plan\b|del plan\b|planes de gize|mi plan/i;
const LINKS = /mercadopago|mpago|\/checkout|suscripcion|wa\.me\/5493413490705\?text=[^"]*(plan|pag|contrat)/i;
async function leer(p){
  return p.evaluate(() => {
    const t = ['coachHost', 'gymModal', 'planSheetHost'].map(id => { const e = document.getElementById(id); return e ? e.innerText : ''; }).join(' \n ');
    const h = ['coachHost', 'gymModal'].map(id => { const e = document.getElementById(id); return e ? e.innerHTML : ''; }).join('');
    const hoja = !!(document.getElementById('planSheetHost') && document.getElementById('planSheetHost').innerHTML.trim());
    return { t: t.replace(/\S+@\S+/g, '(mail)').replace(/Planes alimenticios|Plan alimenticio|\bPlan\b(?=\s*(alimenticio|\n|$))/g, ''), h, hoja };
  });
}

export default async function ({ base, t }){
  const rpc = { buscar_socio: () => busqueda(), gym_ingreso_manual: b => ({ id: b.id, result: 'pausado', repetido: false, at: new Date().toISOString() }), gym_ingresos: () => ingresosHoy() };
  for (const [nombre, init] of [['iPhone', IOS], ['Android', ANDROID]]){
    const vistas = [];
    const mirar = async (p, n) => {
      const r = await leer(p); vistas.push(n);
      const m = r.t.match(PROHIBIDO);
      t.ok(r.t.trim().length > 20 && !m, nombre + ' · ' + n + ': sin precios ni planes de GIZE' + (m ? ' («' + m[0] + '»: …' + r.t.slice(Math.max(0, r.t.search(PROHIBIDO) - 60), r.t.search(PROHIBIDO) + 40).replace(/\s+/g, ' ') + '…)' : ''));
      t.ok(!LINKS.test(r.h), nombre + ' · ' + n + ': sin links de pago');
      t.ok(!r.hoja, nombre + ' · ' + n + ': no se abre la hoja de planes');
    };
    // La cuenta de recepción.
    {
      const pg = await entrar(base, RECEP, { gym: miGimnasio('recepcion', { plan: undefined, contadores: undefined }), rol: 'client', init, vp: M, touch: true, rpc });
      const p = pg.p;
      await mirar(p, 'recepción vacía');
      await buscarRec(p, 'mart'); await mirar(p, 'recepción: resultados');
      await p.click('[data-rec="elegir"][data-id="' + F.A2 + '"]'); await wait(200); await mirar(p, 'recepción: la ficha');
      await p.click('.gy-rec-res [data-rec="ingreso"]'); await wait(500); await mirar(p, 'recepción: ingreso registrado');
      await p.click('.gy-rec-altas [data-gym="sumar"]'); await wait(400); await mirar(p, 'recepción: cargar ficha');
      await p.click('#gymModal .gy-x'); await wait(300);
      await p.click('.gy-rec-altas [data-gym="rec-tab"][data-v="solicitudes"]'); await wait(600); await mirar(p, 'recepción: solicitudes');
      t.eq(pg.errs, [], nombre + ' · recepción: sin errores');
      await pg.close();
    }
    // El dueño: recepción, Asistencia e ingreso manual (con el plan en gracia).
    {
      const gracia = miGimnasio('owner', { plan: { estado: 'gracia', vence: new Date(Date.now() - 2 * 864e5).toISOString(), pausa_profes_el: new Date(Date.now() + 3 * 864e5).toISOString(), libera_el: new Date(Date.now() + 8 * 864e5).toISOString(), plan: 'p250', seats_used: 120, max: 250, sobre_cupo: false, profes_usados: 3, profes_tope: 15 } });
      const pg = await entrar(base, DUENA, { gym: gracia, init, vp: M, touch: true, rpc });
      const p = pg.p;
      await p.evaluate(() => document.querySelector('#coachHost [data-gym="ir"][data-v="asistencia"]').click()); await wait(600); await mirar(p, 'Asistencia');
      await p.click('#coachHost [data-gym="ingreso-manual"]'); await wait(400);
      await buscarRec(p, 'mart'); await p.click('#gymModal [data-rec="elegir"][data-id="' + F.A1 + '"]'); await wait(200); await mirar(p, 'Ingreso manual');
      await p.click('#gymModal .gy-x'); await wait(300);
      // [Abrir recepción] ya no está en Asistencia: va en la tarjeta de Inicio.
      await p.evaluate(() => document.querySelector('#coachHost [data-gym="ir"][data-v="inicio"]').click()); await wait(600); await mirar(p, 'Inicio del dueño');
      await p.click('#coachHost .gy-recep-cta [data-gym="ir"][data-v="recepcion"]'); await wait(500); await mirar(p, 'Recepción del dueño');
      await buscarRec(p, 'mart'); await mirar(p, 'Recepción del dueño: resultados');
      t.eq(pg.errs, [], nombre + ' · dueño: sin errores');
      await pg.close();
    }
    // El profe: gimnasio en gracia, plan propio vencido, recepción abierta para profes.
    {
      const gym = miGimnasioProfe({ plan: { estado: 'gracia', vence: new Date(Date.now() - 2 * 864e5).toISOString(), pausa_profes_el: new Date(Date.now() + 3 * 864e5).toISOString(), cupo_lleno: false },
        settings: { recepcion_altas: true, profes_recepcion: true, ingreso_horas: 3 } });
      const pg = await entrarProfe(base, { gym, init, vp: M, touch: true, rpc, billing: { plan: 'p10', max_clients: 10, trial_ends_at: new Date(Date.now() - 300 * 864e5).toISOString(), paid_until: new Date(Date.now() - 12 * 864e5).toISOString(), seats_used: 1 } });
      const p = pg.p;
      await p.click('[data-coach="view-clients"]'); await wait(500); await mirar(p, 'profe: Clientes');
      await p.evaluate(id => document.querySelector('#coachHost [data-coach="open"][data-id="' + id + '"]').click(), S.A1); await wait(1200); await mirar(p, 'profe: ficha del socio');
      await p.click('[data-coach="sec-open"][data-v="gimnasio"]'); await wait(400); await mirar(p, 'profe: tarjeta Gimnasio');
      await p.click('[data-coach="gym-recepcion"]'); await wait(1200);
      await buscarRec(p, 'mart'); await p.click('[data-rec="elegir"][data-id="' + F.A1 + '"]'); await wait(200); await mirar(p, 'profe: recepción');
      await p.click('[data-coach="view-home"]'); await wait(400); await mirar(p, 'profe: Inicio');
      t.eq(pg.errs, [], nombre + ' · profe: sin errores');
      await pg.close();
    }
    t.eq(vistas.length, 16, nombre + ': se recorrieron todas las pantallas');
  }
}
