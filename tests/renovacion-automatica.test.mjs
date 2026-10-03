// Mi plan (web): además de la transferencia, cada plan se puede pagar con tarjeta por Mercado
// Pago, que se renueva solo cada mes. En las apps de las tiendas no aparece.
import { newPage, wait } from './lib.mjs';

async function open(base, native){
  const pg = await newPage({ init: native ? () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; } : undefined });
  await pg.p.goto(base + '/app/'); await wait(1500);
  await pg.p.evaluate(async () => {
    const { State } = await import('/app/core/state.js'); const { CoachState } = await import('/app/screens/coach/state.js'); const m = await import('/app/screens/coach/plan.js');
    State.cloudUser = { id: 'c', email: 'coach@prueba.test' };
    window.__inv = [];
    State.sb = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: 'trial', max_clients: 10, trial_ends_at: new Date(Date.now() + 3 * 864e5).toISOString() }, error: null }) }) }) }),
      functions: { invoke: async (fn, o) => { window.__inv.push([fn, o.body]); return { data: { url: location.origin + '/app/#mp-prueba' }, error: null }; } },
    };
    CoachState.coachClients = [{ id: 'a' }];
    await m.loadBilling(); m.openPlan();
  });
  await wait(300);
  return pg;
}

export default async function ({ base, t }){
  const web = await open(base);
  const txt = await web.p.evaluate(() => document.getElementById('planSheetHost').innerText.replace(/\s+/g, ' '));
  t.has(txt, 'Pagar con tarjeta', 'botón para pagar con tarjeta');
  t.has(txt, 'se renueva sola cada mes', 'explica la renovación automática');
  t.has(txt, 'coach@prueba.test', 'mail de la cuenta de Mercado Pago');
  await web.p.click('.pl-card.best button[data-plan="choose"]'); await wait(800);
  const inv = await web.p.evaluate(() => window.__inv);
  t.eq(inv, [['suscripcion', { action: 'checkout', plan: 'p25', mp_email: 'coach@prueba.test' }]], 'abre la suscripción de Mercado Pago del plan elegido');
  t.has(web.p.url(), '#mp-prueba', 'va al link de pago');
  t.eq(web.errs, [], 'errores (web)');
  await web.close();

  const app = await open(base, true);
  const n = await app.p.evaluate(() => ({ buy: document.querySelectorAll('#planSheetHost [data-plan="choose"]').length, txt: document.getElementById('planSheetHost').innerText }));
  t.eq(n.buy, 0, 'iPhone/Android: sin botón de pago');
  t.ok(!/Mercado Pago|tarjeta|\$/.test(n.txt), 'iPhone/Android: sin hablar de pagos ni precios');
  await app.close();
}
