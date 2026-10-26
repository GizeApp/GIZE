// Mi plan (web): «¿Tenés un código?» debajo de los planes (código de fundador,
// supabase/codigo-fundador.sql). Al aplicarlo, la base lo revisa (codigo_fundador_ver) y los precios
// se ven con el descuento; al pagar, el código va a la función suscripcion (que vuelve a pedirle
// el descuento a la base: el precio nunca lo manda la app). Un código que no sirve dice por qué. El
// coach que ya lo usó ve sus precios con descuento sin escribir nada.
// En las apps de iPhone (con o sin compras de Apple) y Android no aparece nada de esto.
import { newPage, wait } from './lib.mjs';

// rpc: qué contesta la base a cada función. init: lo que corre antes de la app (las apps).
async function open(base, { rpc = {}, init } = {}){
  const pg = await newPage({ init });
  await pg.p.goto(base + '/app/'); await wait(1500);
  await pg.p.evaluate(async (rpc) => {
    const { State } = await import('/app/core/state.js'); const { CoachState } = await import('/app/screens/coach/state.js'); const m = await import('/app/screens/coach/plan.js');
    State.cloudUser = { id: 'c', email: 'coach@prueba.test' };
    window.__inv = []; window.__rpc = [];
    State.sb = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: 'trial', max_clients: 10, trial_ends_at: new Date(Date.now() + 3 * 864e5).toISOString() }, error: null }) }) }) }),
      rpc: async (fn, args) => {
        window.__rpc.push([fn, args || null]);
        const r = rpc[fn]; if (r === undefined) return { data: null, error: { message: 'sin simular' } };
        return { data: typeof r === 'object' && r && r.porCodigo ? r.porCodigo[args.p_codigo] : r, error: null };
      },
      functions: { invoke: async (fn, o) => { window.__inv.push([fn, o.body]); return { data: { url: location.origin + '/app/#mp-prueba' }, error: null }; } },
    };
    CoachState.coachClients = [{ id: 'a' }];
    await m.loadBilling(); await new Promise(r => setTimeout(r, 100)); m.openPlan();
  }, rpc);
  await wait(300);
  return pg;
}
const hoja = p => p.evaluate(() => document.getElementById('planSheetHost').innerText.replace(/\s+/g, ' '));
const precios = p => p.$$eval('#planSheetHost .pl-card .pl-price', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));

export default async function ({ base, t }){
  const CODIGOS = { porCodigo: {
    'FUNDADOR-PRUEBA': { ok: true, porcentaje: 30 },
    'LLENO': { ok: false, error: 'Ya se ocuparon todos los lugares de ese código.' },
  } };

  // 1) Web, sin descuento: precios llenos y «¿Tenés un código?».
  let pg = await open(base, { rpc: { codigo_fundador_mio: 0, codigo_fundador_ver: CODIGOS } });
  t.has(await hoja(pg.p), '¿Tenés un código?', 'web: ofrece poner un código');
  t.eq((await precios(pg.p)).slice(0, 2), ['$14.900/mes', '$24.900/mes'], 'web: precios llenos');
  // Un código que no sirve: dice por qué y no cambia los precios.
  await pg.p.click('[data-plan="codigo-abrir"]'); await wait(200);
  await pg.p.fill('[data-plan="codigo"]', 'lleno');
  await pg.p.click('[data-plan="codigo-aplicar"]'); await wait(300);
  t.has(await hoja(pg.p), 'Ya se ocuparon todos los lugares de ese código.', 'código sin lugares: lo dice');
  t.eq((await precios(pg.p))[1], '$24.900/mes', 'código sin lugares: precio lleno');
  // El que sirve (escrito en minúsculas, con Enter): 30% menos.
  await pg.p.fill('[data-plan="codigo"]', ' fundador-prueba ');
  await pg.p.press('[data-plan="codigo"]', 'Enter'); await wait(300);
  const rpcs = await pg.p.evaluate(() => window.__rpc);
  t.eq(rpcs, [['codigo_fundador_mio', null], ['codigo_fundador_ver', { p_codigo: 'LLENO' }], ['codigo_fundador_ver', { p_codigo: 'FUNDADOR-PRUEBA' }]], 'la base revisa cada código (en mayúsculas)');
  const txt = await hoja(pg.p);
  t.has(txt, '30% menos para siempre', 'código aplicado: lo dice');
  t.eq((await precios(pg.p)).slice(0, 3), ['$14.900 $10.430/mes', '$24.900 $17.430/mes', '$37.900 $26.530/mes'], 'código aplicado: precio tachado y con 30% menos');
  t.ok(!/Ya se ocuparon/.test(txt), 'código aplicado: sin el error de antes');
  // Al pagar, el código va a la función (el precio no).
  await pg.p.click('.pl-card.best button[data-plan="choose"]'); await wait(800);
  t.eq(await pg.p.evaluate(() => window.__inv), [['suscripcion', { action: 'checkout', plan: 'p25', mp_email: 'coach@prueba.test', codigo: 'FUNDADOR-PRUEBA' }]], 'pagar: manda el código, no el precio');
  t.eq(pg.errs, [], 'errores (web con código)');
  await pg.close();

  // 2) Web, el coach que ya lo usó: precios con descuento sin escribir nada, y al pagar no hace
  // falta mandar el código (la base ya lo tiene).
  pg = await open(base, { rpc: { codigo_fundador_mio: 30 } });
  t.has(await hoja(pg.p), '30% menos para siempre', 'ya lo usó: lo dice');
  t.ok(!/¿Tenés un código\?/.test(await hoja(pg.p)), 'ya lo usó: no ofrece otro código');
  t.eq((await precios(pg.p))[1], '$24.900 $17.430/mes', 'ya lo usó: precios con descuento');
  await pg.p.click('.pl-card.best button[data-plan="choose"]'); await wait(800);
  t.eq(await pg.p.evaluate(() => window.__inv), [['suscripcion', { action: 'checkout', plan: 'p25', mp_email: 'coach@prueba.test' }]], 'ya lo usó: el pedido va sin código');
  t.eq(pg.errs, [], 'errores (web con descuento)');
  await pg.close();

  // 3) Web sin el SQL todavía (la función no existe): todo como antes, sin errores.
  pg = await open(base, { rpc: {} });
  t.eq((await precios(pg.p))[1], '$24.900/mes', 'sin el SQL: precios llenos');
  t.eq(pg.errs, [], 'errores (sin el SQL)');
  await pg.close();

  // 4) Las apps: ni el código ni la consulta a la base (aunque el coach tenga descuento).
  const APPS = {
    android: `(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} }; })();`,
    'iPhone sin compras': `(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; })();`,
    'iPhone con compras de Apple': `(() => {
      const P = { productos: async a => ({ productos: a.ids.map(id => ({ id, nombre: 'GIZE ' + id.split('.').pop(), descripcion: '', precio: 'US$ 9,99', periodo: 'P1M' })) }),
        vigentes: async () => ({ jws: [] }), addListener: () => {} };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { GizeCompras: P } };
    })();`,
  };
  for (const [nombre, init] of Object.entries(APPS)){
    pg = await open(base, { init, rpc: { codigo_fundador_mio: 30, codigo_fundador_ver: CODIGOS } });
    const r = await pg.p.evaluate(() => ({ txt: (document.getElementById('planSheetHost') || {}).innerText || '', campos: document.querySelectorAll('[data-plan^="codigo"]').length, rpc: window.__rpc }));
    t.ok(!/código|fundador|descuento|% menos/i.test(r.txt), nombre + ': sin hablar del código: ' + r.txt.slice(0, 200));
    t.eq(r.campos, 0, nombre + ': sin el campo del código');
    t.eq(r.rpc.filter(x => /codigo_fundador/.test(x[0])), [], nombre + ': no le pregunta a la base por el código');
    await pg.close();
  }
}
