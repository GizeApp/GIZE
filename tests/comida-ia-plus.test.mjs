// IA Plus en la app (app/ui/ia-plus.js), con Supabase, las funciones y el plugin de Apple simulados:
// - Web: con los usos gratis de la semana terminados, la hoja del plato dice el límite y ofrece IA
//   Plus en pesos (el precio del panel), con «hasta 8 fotos y 15 textos por día», el mail de Mercado
//   Pago, la baja y el arrepentimiento, Términos y Privacidad; no llama a la IA. «Suscribirme» pide
//   el link a la función suscripcion y va a Mercado Pago. «Te queda 1 uso gratis de IA esta semana».
//   Si la función contesta tope_semana, la misma oferta.
// - iPhone (con el plugin de compras): el precio de Apple, «Suscribirme», «Restaurar compras»,
//   Términos de uso y Política de privacidad; nunca pesos, Mercado Pago ni links a la web. Comprar
//   manda lo que firmó Apple a compras-apple, lo finaliza y la hoja sigue con la foto.
// - Android: el límite y «IA Plus todavía no está disponible en la app de Android; podés seguir
//   cargando a mano», sin precio ni links.
// - Ajustes → Mi IA Plus: gratis (cuántos quedan), activo con Mercado Pago (se renueva, botón de baja
//   y de arrepentimiento), cancelado, incluido con el plan del coach, con Apple («Administrar
//   suscripción» en el iPhone). Con IA Plus apagado no aparece nada.
// - La vuelta de Mercado Pago (?pago=iaplus): espera el cobro y avisa.
// Capturas con SHOTS=<carpeta>.
import { newPage, wait, ALUMNO, perfil } from './lib.mjs';
import { ESTADO_ON } from './comida-ia-comun.mjs';

const SHOTS = process.env.SHOTS;
const shot = async (p, n) => {
  if (!SHOTS) return;
  // En Ajustes, con «Mi IA Plus» a la vista.
  await p.evaluate(() => { const c = document.getElementById('cfgPlus'); if (c && !document.querySelector('#sheetHost .sheet')) c.scrollIntoView({ block: 'center' }); });
  await wait(300); await p.screenshot({ path: SHOTS + '/' + n + '.png' });
};
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText).join(' ').replace(/\s+/g, ' ').trim(), sel);
const D = n => new Date(Date.now() + n * 864e5).toISOString();
const LUNES = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(3, 0, 0, 0); return d.toISOString(); })();
const PLUS0 = { activa: true, estado: 'gratis', por: null, fuente: null, hasta: null, renueva: false, mp_status: null, arrepentir_hasta: null,
  gratis_semana: 3, usados_semana: 3, quedan_semana: 0, semana_vuelve: LUNES, precio_ars: 4500 };
const estado = (plus, o = {}) => Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' }, o, { plus: Object.assign({}, PLUS0, plus) });
const LIMITE = estado({}, { estado: 'tope_semana', vuelve: LUNES, quedan: { plato: 0, texto: 0 } });
const PLUS_MP = { estado: 'plus', fuente: 'mp', hasta: D(28), renueva: true, mp_status: 'authorized', arrepentir_hasta: D(8), usados_semana: 5, quedan_semana: 0 };
// Lo que no puede aparecer en las apps.
const PROHIBIDO = /mercado|\$\s?\d{1,3}\.\d{3}|gize\.ar\/app|tarjeta/i;

const IOS = `(() => {
  window.__compras = [];
  const P = {
    productos: async a => { window.__compras.push(['productos', a.ids]); return { productos: a.ids.map(id => ({ id, nombre: 'IA Plus', descripcion: '', precio: 'US$ 2,99', periodo: 'P1M' })) }; },
    comprar: async a => { window.__compras.push(['comprar', a.id, a.cuenta]); return { estado: 'ok', jws: 'JWS-PLUS', transaccion: '888' }; },
    finalizar: async a => { window.__compras.push(['finalizar', a.transaccion]); },
    vigentes: async () => ({ jws: [] }),
    restaurar: async () => { window.__compras.push(['restaurar']); return { estado: 'ok', jws: ['JWS-R'] }; },
    administrar: async () => { window.__compras.push(['administrar']); },
    addListener: (ev, fn) => { window.__compras.push(['escucha', ev]); },
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { GizeCompras: P } };
})();`;
const ANDROID = 'window.androidBridge = {};';

// Una página con la IA y IA Plus simulados. o: { estado, init, perfil, suscripcion(body, S) → [status, json], apple(body, S) → [status, json] }
async function pagina(o = {}){
  const S = { estado: o.estado, llamadas: [], suscripcion: [], apple: [] };
  const pg = await newPage({ user: ALUMNO, init: o.init, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, diary: [], calTarget: 2000 },
    handlers: {
      '/profiles': perfil('client', o.perfil),
      '/rpc/ia_mi_estado': (r, J) => { S.nEstado = (S.nEstado || 0) + 1; return J(S.estado); },
      '/functions/v1/ia': (r, J, i) => { if (i.m !== 'POST') return J({}); S.llamadas.push(JSON.parse(i.body || '{}')); return o.ia ? J(...o.ia(S)) : J({ ok: false, codigo: 'error' }, 502); },
      '/functions/v1/suscripcion': (r, J, i) => { if (i.m !== 'POST') return J({}); const b = JSON.parse(i.body || '{}'); S.suscripcion.push(b); const [st, js] = o.suscripcion ? o.suscripcion(b, S) : [200, { ok: true }]; return J(js, st); },
      '/functions/v1/compras-apple': (r, J, i) => { if (i.m !== 'POST') return J({}); const b = JSON.parse(i.body || '{}'); S.apple.push(b); const [st, js] = o.apple ? o.apple(b, S) : [200, { ok: true }]; return J(js, st); },
    } });
  await pg.p.route(/mp\.test/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Mercado Pago (simulado)</h1>' }));
  return Object.assign(pg, { S });
}
const abrirComida = async (p, base, q = '') => { await p.goto(base + '/app/' + q); await wait(2500); await p.click('#nav-comida'); await wait(500); };
const abrirFoto = async p => { await p.click('[data-action="search-open"]'); await wait(700); await p.click('[data-action="ia-plato"]'); await wait(900); };
const abrirAjustes = async (p, base, q = '') => { await p.goto(base + '/app/' + q); await wait(2500); await p.click('#nav-config'); await wait(1500); };

export default async function ({ base, t }){
  // ---------- Web: el límite semanal con la oferta ----------
  {
    const { p, errs, S, close } = await pagina({ estado: LIMITE, suscripcion: () => [200, { url: 'https://mp.test/checkout' }] });
    await abrirComida(p, base); await abrirFoto(p);
    const h = await txt(p, '#sheetHost .plate-sheet');
    t.has(h, 'Usaste tus 3 usos gratis de IA de esta semana (foto o texto). Se renuevan el lunes.', 'web: el aviso del límite semanal');
    t.has(h, 'Seguí usando la IA sin límite semanal por $4.500 al mes: hasta 8 fotos y 15 textos por día.', 'web: la oferta con el precio del panel y lo que incluye (no «sin límite» a secas)');
    t.has(h, 'botón de baja', 'web: dice cómo se cancela');
    t.has(h, 'podés arrepentirte y te devolvemos el pago', 'web: el arrepentimiento');
    t.eq(await p.inputValue('#plusMail'), ALUMNO.email, 'web: el mail de la cuenta, para cambiarlo por el de Mercado Pago');
    const links = await p.evaluate(() => [...document.querySelectorAll('#sheetHost .plus-links a')].map(a => a.innerText + ' ' + a.getAttribute('href')));
    t.eq(links, ['Términos de IA Plus https://gize.ar/terminos/#iaplus', 'Política de privacidad https://gize.ar/privacidad/'], 'web: Términos y Privacidad');
    t.ok(!!(await p.$('#sheetHost [data-action="plate-manual"]')) && !(await p.$('#sheetHost [data-action="plate-retry"]')), 'web: buscar o escanear, sin «Probar de nuevo»');
    t.eq(S.llamadas.length, 0, 'web: no llama a la IA');
    await shot(p, '01-web-limite-semanal');
    // Mail que no es mail.
    await p.fill('#plusMail', 'nada'); await p.click('#sheetHost [data-plus="mp"]'); await wait(500);
    t.eq(S.suscripcion.length, 0, 'web: con un mail inválido no pide nada');
    await p.fill('#plusMail', 'mio@mercadopago.test');
    await p.click('#sheetHost [data-plus="mp"]'); await wait(1500);
    t.eq(S.suscripcion, [{ action: 'iaplus_checkout', mp_email: 'mio@mercadopago.test' }], 'web: «Suscribirme» pide el link con el mail de Mercado Pago');
    t.ok(/mp\.test\/checkout/.test(p.url()), 'web: y va a Mercado Pago: ' + p.url());
    t.eq(errs, [], 'web: errores de la página');
    await close();
  }
  // Te queda 1 uso; la función contesta tope_semana: la misma oferta.
  {
    const { p, errs, S, close } = await pagina({ estado: estado({ usados_semana: 2, quedan_semana: 1 }, { quedan: { plato: 1, texto: 1 } }),
      ia: () => [{ ok: false, codigo: 'tope_semana', tope: 3, vuelve: LUNES }, 429] });
    await abrirComida(p, base); await abrirFoto(p);
    t.has(await txt(p, '#sheetHost .plate-sheet'), 'Te queda 1 uso gratis de IA esta semana', 'web: «Te queda 1 uso gratis de IA esta semana»');
    await shot(p, '02-web-queda-1');
    await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', { name: 'plato.jpg', mimeType: 'image/jpeg', buffer: await p.screenshot({ type: 'jpeg', quality: 60 }) });
    await wait(1800);
    t.has(await txt(p, '#sheetHost .pl8-err'), 'Usaste tus 3 usos gratis de IA de esta semana', 'web: la función dice tope_semana: el aviso');
    t.ok(!!(await p.$('#sheetHost [data-plus="mp"]')), 'web: y la oferta');
    t.eq(errs, [], 'tope_semana de la función: errores de la página');
    await close();
  }
  // IA Plus apagado: ni oferta ni Mi IA Plus (como antes).
  {
    const { p, errs, close } = await pagina({ estado: estado({ activa: false }, { estado: 'tope_dia', quedan: { plato: 0, texto: 3 } }) });
    await abrirComida(p, base); await abrirFoto(p);
    t.ok(!(await p.$('#sheetHost .plus-box')), 'apagado: sin oferta');
    await p.click('#sheetHost [data-action="plate-cancel"]').catch(() => {}); await wait(600);
    await p.click('#nav-config'); await wait(1500);
    t.ok(!(await p.$('#cfgPlus')), 'apagado: sin «Mi IA Plus» en Ajustes');
    t.eq(errs, [], 'apagado: errores de la página');
    await close();
  }

  // ---------- iPhone: con Apple ----------
  {
    const { p, errs, S, close } = await pagina({ estado: LIMITE, init: IOS,
      apple: (b, S) => { S.estado = estado({ estado: 'plus', fuente: 'apple', hasta: D(30), renueva: true }); return [200, { ok: true }]; } });
    await abrirComida(p, base); await abrirFoto(p); await wait(600);
    const h = await txt(p, '#sheetHost .plate-sheet');
    t.has(h, 'Usaste tus 3 usos gratis de IA de esta semana', 'iPhone: el aviso del límite');
    t.has(h, 'IA Plus Suscripción mensual · US$ 2,99 por mes', 'iPhone: el precio que pone Apple, mensual');
    t.has(h, 'Se renueva sola cada mes al mismo precio, salvo que la canceles al menos 24 horas antes', 'iPhone: que se renueva y cómo se cancela');
    t.ok(!PROHIBIDO.test(h), 'iPhone: ni pesos, ni Mercado Pago, ni links a la web: ' + (h.match(PROHIBIDO) || [''])[0]);
    const links = await p.evaluate(() => [...document.querySelectorAll('#sheetHost .plus-links a')].map(a => a.innerText + ' ' + a.getAttribute('href')));
    t.eq(links, ['Términos de uso https://gize.ar/terminos/?app=1', 'Política de privacidad https://gize.ar/privacidad/?app=1'], 'iPhone: Términos de uso y Política de privacidad');
    t.ok(!!(await p.$('#sheetHost [data-plus="restaurar"]')), 'iPhone: «Restaurar compras»');
    await shot(p, '03-iphone-limite-semanal');
    await p.click('#sheetHost [data-plus="apple"]'); await wait(2000);
    const c = await p.evaluate(() => window.__compras);
    t.ok(c.some(x => x[0] === 'comprar' && x[1] === 'ar.com.gize.app.iaplus.mensual' && x[2] === ALUMNO.id), 'iPhone: compra el producto de IA Plus con el id de la cuenta');
    t.eq(S.apple, [{ jws: 'JWS-PLUS' }], 'iPhone: manda lo que firmó Apple a compras-apple');
    t.ok(c.some(x => x[0] === 'finalizar' && x[1] === '888'), 'iPhone: y recién después la finaliza');
    t.ok(await p.isVisible('#sheetHost input[data-action="plate-file"]').catch(() => false) || !!(await p.$('#sheetHost [data-pick]')), 'iPhone: comprado, la hoja sigue con la foto');
    t.ok(!(await p.$('#sheetHost .plus-box')), 'iPhone: ya no ofrece');
    await shot(p, '04-iphone-comprado');
    t.eq(errs, [], 'iPhone: errores de la página');
    await close();
  }

  // ---------- Android: no se vende ----------
  {
    const { p, errs, S, close } = await pagina({ estado: LIMITE, init: ANDROID });
    await abrirComida(p, base); await abrirFoto(p);
    const h = await txt(p, '#sheetHost .plate-sheet');
    t.has(h, 'IA Plus todavía no está disponible en la app de Android; podés seguir cargando a mano.', 'Android: no está disponible');
    t.ok(!PROHIBIDO.test(h) && !/US\$|Suscribirme/.test(h) && !(await p.$('#sheetHost .plus-box a')), 'Android: sin precio, sin botón y sin links');
    t.ok(!!(await p.$('#sheetHost [data-action="plate-manual"]')), 'Android: buscar o escanear');
    await shot(p, '05-android-limite-semanal');
    await p.click('#sheetHost [data-action="plate-cancel"]').catch(() => {}); await wait(600);
    await p.click('#nav-config'); await wait(1500);
    const a = await txt(p, '#cfgPlus');
    t.has(a, 'Gratis: 3 usos de IA por semana', 'Android, Ajustes: los usos gratis');
    t.ok(!PROHIBIDO.test(a) && !/US\$/.test(a), 'Android, Ajustes: sin precio');
    t.eq(S.suscripcion.length + S.apple.length, 0, 'Android: no pide nada');
    t.eq(errs, [], 'Android: errores de la página');
    await close();
  }

  // ---------- Ajustes → Mi IA Plus ----------
  {
    const { p, errs, close } = await pagina({ estado: estado({ usados_semana: 1, quedan_semana: 2 }, { quedan: { plato: 2, texto: 2 } }) });
    await abrirAjustes(p, base);
    const a = await txt(p, '#cfgPlus');
    t.has(a, 'Mi IA Plus', 'Ajustes: la tarjeta');
    t.has(a, 'Gratis: 3 usos de IA por semana (foto o texto). Te quedan 2 esta semana; se renuevan el lunes.', 'Ajustes gratis: cuántos quedan');
    t.ok(!!(await p.$('#cfgPlus [data-plus="mp"]')), 'Ajustes gratis (web): la oferta');
    await shot(p, '06-ajustes-gratis');
    t.eq(errs, [], 'Ajustes gratis: errores');
    await close();
  }
  {
    const { p, errs, S, preguntas, avisos, close } = await pagina({ estado: estado(PLUS_MP),
      suscripcion: (b, S) => {
        if (b.action === 'iaplus_cancel') { S.estado = estado(Object.assign({}, PLUS_MP, { renueva: false, mp_status: 'cancelled' })); return [200, { ok: true }]; }
        if (b.action === 'iaplus_arrepentimiento') { S.estado = estado({ usados_semana: 5 }); return [200, { ok: true, devuelto: true }]; }
        return [400, { error: 'x' }];
      } });
    await abrirAjustes(p, base);
    let a = await txt(p, '#cfgPlus');
    t.has(a, 'Activo · se renueva el', 'Ajustes con Mercado Pago: activo y cuándo se renueva');
    t.has(a, 'hasta 8 fotos y 15 textos por día', 'Ajustes: lo que incluye');
    t.has(a, 'Podés arrepentirte hasta el', 'Ajustes: hasta cuándo puede arrepentirse');
    t.ok(!!(await p.$('#cfgPlus [data-plus="baja"]')) && !!(await p.$('#cfgPlus [data-plus="arrepentir"]')), 'Ajustes: botón de baja y botón de arrepentimiento');
    await shot(p, '07-ajustes-plus-mercado-pago');
    await p.click('#cfgPlus [data-plus="baja"]'); await wait(1800);
    t.ok(preguntas.some(q => /¿Cancelar IA Plus\? No se te cobra más/.test(q.texto) && q.ok === 'Cancelar suscripción'), 'baja: pregunta antes');
    t.ok(S.suscripcion.some(b => b.action === 'iaplus_cancel'), 'baja: pide la cancelación');
    a = await txt(p, '#cfgPlus');
    t.ok(/hasta el .* \(no se renueva\)/.test(a) && !(await p.$('#cfgPlus [data-plus="baja"]')), 'baja: queda hasta el final, sin renovarse: ' + a);
    await shot(p, '08-ajustes-cancelado');
    await p.click('#cfgPlus [data-plus="arrepentir"]'); await wait(1800);
    t.ok(preguntas.some(q => /te devolvemos lo que pagaste/.test(q.texto) && q.ok === 'Arrepentirme'), 'arrepentimiento: pregunta antes');
    t.ok(S.suscripcion.some(b => b.action === 'iaplus_arrepentimiento'), 'arrepentimiento: lo pide');
    t.ok(avisos.some(x => /pedimos la devolución del pago/.test(x.texto)), 'arrepentimiento: avisa la devolución');
    t.has(await txt(p, '#cfgPlus'), 'Gratis: 3 usos de IA por semana', 'arrepentimiento: vuelve a gratis');
    t.eq(errs, [], 'Ajustes Mercado Pago: errores');
    await close();
  }
  {
    const { p, errs, close } = await pagina({ estado: estado({ estado: 'incluido', por: 'alumno' }), perfil: { coach_id: '33333333-3333-3333-3333-333333333333' } });
    await abrirAjustes(p, base);
    const a = await txt(p, '#cfgPlus');
    t.has(a, 'Incluido con el plan de tu coach: usás la IA sin límite semanal (hasta 8 fotos y 15 textos por día).', 'Ajustes: incluido con el plan del coach');
    t.ok(!(await p.$('#cfgPlus [data-plus]')), 'incluido: no ofrece nada');
    await shot(p, '09-ajustes-incluido');
    t.eq(errs, [], 'incluido: errores');
    await close();
  }
  {
    const { p, errs, close } = await pagina({ estado: estado({ estado: 'plus', fuente: 'apple', hasta: D(20), renueva: true }), init: IOS });
    await abrirAjustes(p, base);
    const a = await txt(p, '#cfgPlus');
    t.has(a, 'Activo · se renueva el', 'iPhone, Ajustes: activo con Apple');
    t.ok(!PROHIBIDO.test(a), 'iPhone, Ajustes: sin pesos ni Mercado Pago');
    await shot(p, '10-iphone-ajustes-plus');
    await p.click('#cfgPlus [data-plus="administrar"]'); await wait(1200);
    t.ok((await p.evaluate(() => window.__compras)).some(x => x[0] === 'administrar'), 'iPhone: «Administrar suscripción» abre la hoja de Apple');
    t.eq(errs, [], 'iPhone Ajustes: errores');
    await close();
  }

  // ---------- Vuelta de Mercado Pago ----------
  {
    const { p, errs, S, close } = await pagina({ estado: LIMITE });
    setTimeout(() => { S.estado = estado(PLUS_MP); }, 3000);
    await p.goto(base + '/app/?pago=iaplus'); await wait(2500);
    t.ok(!/pago=/.test(p.url()), 'vuelta de Mercado Pago: limpia la dirección');
    await wait(6000);
    t.has(await txt(p, '#iaToast'), '¡Listo! Ya tenés IA Plus.', 'vuelta de Mercado Pago: cuando llega el cobro, avisa');
    await shot(p, '11-web-volvio-de-mercado-pago');
    t.eq(errs, [], 'vuelta: errores');
    await close();
  }
}
