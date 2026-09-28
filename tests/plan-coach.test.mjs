// "Mi plan" del coach: el plan elegido en la página de inicio, el mensaje de WhatsApp, la
// prueba gratis antes del plan pago y, en las apps de las tiendas, sin precios ni links.
import { newPage, wait } from './lib.mjs';

async function sheet(base, row, { native = false, url = '/app/' } = {}){
  const pg = await newPage({ init: native ? () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} }; } : undefined });
  await pg.p.goto(base + url); await wait(1500);
  const out = await pg.p.evaluate(async row => {
    const { State } = await import('/app/core/state.js'); const { CoachState } = await import('/app/screens/coach/state.js'); const m = await import('/app/screens/coach/plan.js');
    State.cloudUser = { id: 'c', email: 'coach@prueba.test' };
    State.sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) };
    CoachState.coachClients = [{ id: 'a' }, { id: 'b' }];
    await m.loadBilling(); const banner = m.renderPlanBanner().replace(/<[^>]+>/g, ''); m.openPlan();
    const h = document.getElementById('planSheetHost'), ch = h.querySelector('.pl-card.chosen a.pl-choose');
    return { banner, sheet: h.innerText.replace(/\s+/g, ' '), links: h.querySelectorAll('a.pl-choose').length, chosen: ch ? decodeURIComponent(ch.href) : null,
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
  t.has(r.chosen, 'Quiero contratar GIZE para coaches, el plan de hasta 50 clientes ($20.000/mes). Mi cuenta es coach@prueba.test', 'WhatsApp del plan elegido');
  t.has(r.sheet, 'Elegiste el plan de hasta 50 clientes', 'la prueba menciona el plan elegido');
  t.eq(r.errs, [], 'errores (plan elegido)'); await r.close();

  // Pagó durante la prueba: primero termina la prueba.
  r = await sheet(base, { plan: 'p25', max_clients: 25, trial_ends_at: D(5), paid_until: D(40) });
  t.has(r.banner, 'después sigue tu plan', 'tira: prueba y después el plan');
  t.has(r.sheet, 'Primero termina tu prueba gratis', 'Mi plan: prueba antes del plan pago');
  t.has(r.sheet, 'Renovar', 'el plan actual se renueva por WhatsApp');
  t.ok(!/Mercado Pago/.test(r.sheet), 'no tiene que aparecer Mercado Pago'); await r.close();

  // App de Android con la prueba vencida: sin precios ni links.
  r = await sheet(base, { plan: 'trial', max_clients: 10, trial_ends_at: D(-2) }, { native: true });
  t.eq(r.links, 0, 'Android: sin links para contratar');
  t.ok(!/\$/.test(r.sheet + r.wall), 'Android: sin precios');
  t.has(r.wall, 'Terminó tu prueba gratis', 'Android: pantalla de prueba vencida');
  t.has(r.banner, 'Sin plan vigente', 'Android: tira sin plan'); await r.close();
}
