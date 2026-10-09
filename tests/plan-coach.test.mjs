// "Mi plan" del coach: el plan elegido en la página de inicio, el mensaje de WhatsApp, la
// prueba gratis antes del plan pago y, en las apps de las tiendas, sin precios ni links.
import { newPage, wait } from './lib.mjs';

async function sheet(base, row, { native = false, url = '/app/', timezoneId } = {}){
  const pg = await newPage({ timezoneId, init: native ? () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} }; } : undefined });
  await pg.p.goto(base + url); await wait(1500);
  const out = await pg.p.evaluate(async row => {
    const { State } = await import('/app/core/state.js'); const { CoachState } = await import('/app/screens/coach/state.js'); const m = await import('/app/screens/coach/plan.js');
    State.cloudUser = { id: 'c', email: 'coach@prueba.test' };
    State.sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) };
    CoachState.coachClients = [{ id: 'a' }, { id: 'b' }];
    await m.loadBilling(); const banner = m.renderPlanBanner().replace(/<[^>]+>/g, ''); m.openPlan();
    const h = document.getElementById('planSheetHost'), ch = h.querySelector('.pl-card.chosen a.pl-alt');
    return { banner, sheet: h.innerText.replace(/\s+/g, ' '), links: h.querySelectorAll('a.pl-alt').length, cards: h.querySelectorAll('button.pl-choose[data-plan="choose"]').length, chosen: ch ? decodeURIComponent(ch.href) : null,
      tags: [...h.querySelectorAll('.pl-tag')].map(x => x.textContent), wall: m.renderPaywall().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
  }, row);
  return Object.assign(out, { url: pg.p.url(), errs: pg.errs, close: pg.close });
}
const D = n => new Date(Date.now() + n * 864e5).toISOString();

export default async function ({ base, t }){
  // Eligió el de 50 en la página de inicio.
  let r = await sheet(base, { plan: 'trial', max_clients: 10, trial_ends_at: D(5) }, { url: '/app/?plan=p50#registro-coach' });
  t.ok(!/plan=/.test(r.url), 'el ?plan= se saca de la dirección');
  t.eq(r.tags, ['El que elegiste'], 'solo el plan elegido va destacado');
  t.has(r.chosen, 'Quiero contratar GIZE para coaches, el plan de hasta 50 clientes ($37.900/mes). Mi cuenta es coach@prueba.test', 'WhatsApp del plan elegido');
  t.has(r.sheet, 'Elegiste el plan de hasta 50 clientes', 'la prueba menciona el plan elegido');
  t.eq(r.errs, [], 'errores (plan elegido)'); await r.close();

  // Los seis planes con los precios nuevos; eligió el Gimnasio grande (500 alumnos).
  r = await sheet(base, { plan: 'trial', max_clients: 10, trial_ends_at: D(5) }, { url: '/app/?plan=p500#registro-coach' });
  t.eq(r.links, 6, 'seis planes para contratar por transferencia');
  t.eq(r.cards, 6, 'y los seis con tarjeta (renovación automática)');
  t.has(r.sheet, 'se renueva sola cada mes', 'explica la renovación automática');
  for (const x of ['$14.900', '$24.900', '$37.900', '$59.900', '$119.900', '$199.900']) t.has(r.sheet, x, 'precio ' + x);
  // (el nombre va en mayúsculas por CSS)
  for (const x of ['Gimnasio chico', 'Hasta 250 alumnos', 'Gimnasio grande']) t.has(r.sheet.toLowerCase(), x.toLowerCase(), 'plan ' + x);
  t.has(r.chosen, 'el plan Gimnasio grande (hasta 500 alumnos) ($199.900/mes)', 'WhatsApp del Gimnasio grande');
  t.has(r.sheet, 'Elegiste el plan Gimnasio grande', 'la prueba menciona el gimnasio elegido');
  t.has(r.sheet, '¿Más de 500 alumnos? Hablemos', 'más de 500: a medida');
  t.eq(r.errs, [], 'errores (gimnasio grande)'); await r.close();

  // Un plan que no existe en ?plan= no queda elegido.
  r = await sheet(base, { plan: 'trial', max_clients: 10, trial_ends_at: D(5) }, { url: '/app/?plan=p999#registro-coach' });
  t.eq(r.tags, ['Más elegido'], 'plan desconocido: queda el «Más elegido»'); await r.close();

  // Pagó el Gimnasio (250): la tira y el estado dicen el nombre del plan.
  r = await sheet(base, { plan: 'p250', max_clients: 250, trial_ends_at: D(-40), paid_until: D(20) });
  t.has(r.banner, 'Plan Gimnasio · 2/250', 'tira del Gimnasio (250)');
  t.has(r.sheet, 'Plan Gimnasio (250 alumnos)', 'estado del Gimnasio (250)'); await r.close();

  // Pagó durante la prueba: primero termina la prueba.
  r = await sheet(base, { plan: 'p25', max_clients: 25, trial_ends_at: D(5), paid_until: D(40) });
  t.has(r.banner, 'después sigue tu plan', 'tira: prueba y después el plan');
  t.has(r.sheet, 'Primero termina tu prueba gratis', 'Mi plan: prueba antes del plan pago');
  t.has(r.sheet, 'Renovar con tarjeta', 'el plan actual se renueva con tarjeta');
  t.has(r.sheet, 'o por transferencia', 'o por transferencia (WhatsApp)'); await r.close();

  // Pagado hasta el 30/9 (en la base: 1/10 00:00 de Argentina) visto desde un celular en Europa.
  r = await sheet(base, { plan: 'p25', max_clients: 25, trial_ends_at: D(-40), paid_until: '2099-10-01T03:00:00Z' }, { timezoneId: 'Europe/Madrid' });
  t.has(r.banner, 'vence el 30', 'la fecha de vencimiento va en hora de Argentina'); await r.close();

  // App de Android con la prueba vencida: sin precios ni links.
  r = await sheet(base, { plan: 'trial', max_clients: 10, trial_ends_at: D(-2) }, { native: true });
  t.eq(r.links, 0, 'Android: sin links para contratar');
  t.ok(!/\$/.test(r.sheet + r.wall), 'Android: sin precios');
  t.ok(!/Gimnasio|a medida|wa\.me/.test(r.sheet + r.wall), 'Android: sin los planes de gimnasio ni el plan a medida');
  t.has(r.wall, 'Terminó tu prueba gratis', 'Android: pantalla de prueba vencida');
  t.has(r.banner, 'Sin plan vigente', 'Android: tira sin plan');
  // Venció hace 2 días: le quedan 2 de los 4 de gracia antes de que sus clientes pasen al sistema común.
  // En Android sin mandar a renovar ni a hablar con el equipo (Play no deja pagar por fuera).
  t.has(r.wall, 'tus clientes pasan a usar GIZE por su cuenta', 'Android: días de gracia, qué pasa después');
  t.ok(!/renov|equipo|hablá|Elegí un plan/i.test(r.wall), 'Android: sin mandar a renovar: ' + r.wall); await r.close();
  // En la web, con el plazo para renovar.
  r = await sheet(base, { plan: 'trial', max_clients: 10, trial_ends_at: D(-2) });
  t.has(r.wall, 'Tenés hasta el', 'días de gracia: hasta cuándo puede renovar');
  t.has(r.wall, 'para renovar. Después, tus clientes pasan a usar GIZE por su cuenta', 'días de gracia: qué pasa después'); await r.close();

  // Venció hace 6 días: ya pasaron los 4 de gracia (sus clientes ya no están): sin ese aviso.
  r = await sheet(base, { plan: 'p25', max_clients: 25, trial_ends_at: D(-40), paid_until: D(-6) });
  t.ok(!/Tenés hasta el/.test(r.wall), 'pasados los 4 días no se muestra el plazo'); await r.close();
}
