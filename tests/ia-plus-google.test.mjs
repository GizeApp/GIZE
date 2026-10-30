// IA Plus con Google Play en la app de Android (app/ui/ia-plus.js con core/compras-google.js), con
// el plugin GizeCompras simulado (el precio como lo da Google), el interruptor del panel
// (rpc compras_google) y la función compras-google simulados:
// - Con el cobro de IA Plus apagado (o sin la función en la base, 404), Android sigue como siempre:
//   «IA Plus todavía no está disponible en la app de Android», sin precio, sin botón y sin pedirle
//   nada a Google Play.
// - Prendido: al terminar las fotos gratis de la semana, la oferta con el precio de Google
//   («Suscripción mensual · US$ 2,99 por mes»), cómo se renueva y se cancela en Google Play,
//   «Recuperar mi suscripción», Términos de uso y Política de privacidad (?app=1). Nunca pesos,
//   Mercado Pago ni links a la web. «Suscribirme» compra el producto de IA Plus con el id de la
//   cuenta, manda { token, producto } a compras-google, la reconoce si el servidor no pudo
//   (reconocer: true) y la hoja sigue con la foto («¡Listo! Ya tenés IA Plus.»). Pendiente: avisa.
// - «Recuperar mi suscripción» manda las de IA Plus del celular (no las de los planes).
// - Las compras que llegan solas (evento «compra») y las del celular que nadie reconoció van a la
//   función.
// - Ajustes → Mi IA Plus con IA Plus de Google: «Administrar en Google Play» en Android (abre la de
//   IA Plus); en el iPhone un texto neutro, sin nombrar Google ni Android (regla 2.3.10 de Apple), y
//   el iPhone no pregunta el interruptor; en la web, que se administra en Google Play.
// Capturas con SHOTS=<carpeta>.
import { newPage, wait, ALUMNO, perfil } from './lib.mjs';
import { ESTADO_ON } from './comida-ia-comun.mjs';

const SHOTS = process.env.SHOTS;
const shot = async (p, n) => { if (SHOTS) { await wait(300); await p.screenshot({ path: SHOTS + '/' + n + '.png' }); } };
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText).join(' ').replace(/\s+/g, ' ').trim(), sel);
const D = n => new Date(Date.now() + n * 864e5).toISOString();
const LUNES = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(3, 0, 0, 0); return d.toISOString(); })();
const PLUS0 = { activa: true, estado: 'gratis', por: null, fuente: null, hasta: null, renueva: false, mp_status: null, arrepentir_hasta: null,
  gratis_semana: 3, usados_semana: 3, quedan_semana: 0, semana_vuelve: LUNES, plato_dia: 10, precio_ars: 4500 };
const estado = (plus, o = {}) => Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' }, o, { plus: Object.assign({}, PLUS0, plus) });
const LIMITE = estado({}, { estado: 'tope_semana', vuelve: LUNES, quedan: { plato: 0 } });
const PLUS_GOOGLE = { estado: 'plus', fuente: 'google', hasta: D(25), renueva: true, usados_semana: 5, quedan_semana: 0 };
const IA_PLUS = 'ar.com.gize.app.iaplus.mensual';
// Lo que no puede aparecer en las apps.
const PROHIBIDO = /mercado|\$\s?\d{1,3}\.\d{3}|gize\.ar\/app|tarjeta|transferencia|whatsapp/i;

// Plugin GizeCompras simulado. o.compra: lo que devuelve comprar; o.vigentes / o.restaurar: las del celular.
const plugin = (plataforma, o = {}) => `(() => {
  const o = ${JSON.stringify(o)};
  window.__compras = [];
  const P = {
    productos: async a => { window.__compras.push(['productos', a.ids]); return { productos: a.ids.map(id => ({ id, nombre: 'IA Plus', descripcion: '', precio: 'US$ 2,99', periodo: 'P1M' })) }; },
    comprar: async a => { window.__compras.push(['comprar', a.id, a.cuenta]); return o.compra || { estado: 'ok', token: 'TOK-PLUS', producto: a.id, reconocida: false }; },
    finalizar: async a => { window.__compras.push(['finalizar', a.token || a.transaccion]); },
    vigentes: async () => { window.__compras.push(['vigentes']); return ${plataforma === 'ios' ? '{ jws: [] }' : '{ compras: o.vigentes || [] }'}; },
    restaurar: async () => { window.__compras.push(['restaurar']); return ${plataforma === 'ios' ? "{ estado: 'ok', jws: [] }" : "{ estado: 'ok', compras: o.restaurar || [] }"}; },
    administrar: async a => { window.__compras.push(['administrar', a && a.producto]); },
    avisos: async () => ({ estado: 'nada' }),
    addListener: (ev, fn) => { window.__compras.push(['escucha', ev]); window.__llega = fn; },
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plataforma}', Plugins: { GizeCompras: P } };
})();`;

// o: { estado, init, inter: [status, cuerpo] de compras_google, google(body, S) → [status, json] }
async function pagina(o = {}){
  const S = { estado: o.estado, google: [], inter: 0 };
  const inter = o.inter || [200, { planes: false, plus: true }];
  const pg = await newPage({ user: ALUMNO, init: o.init, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, diary: [], calTarget: 2000 },
    handlers: {
      '/profiles': perfil('client'),
      '/rpc/ia_mi_estado': (r, J) => J(S.estado),
      '/rpc/compras_google': (r, J) => { S.inter++; return J(inter[1], inter[0]); },
      '/functions/v1/ia': (r, J, i) => i.m !== 'POST' ? J({}) : J({ ok: false, codigo: 'error' }, 502),
      '/functions/v1/suscripcion': (r, J, i) => i.m !== 'POST' ? J({}) : J({ error: 'no' }, 400),
      '/functions/v1/compras-google': (r, J, i) => { if (i.m !== 'POST') return J({}); const b = JSON.parse(i.body || '{}'); S.google.push(b); const [st, js] = o.google ? o.google(b, S) : [200, { ok: true }]; return J(js, st); },
    } });
  return Object.assign(pg, { S });
}
const abrirComida = async p => { await p.goto(p.__base + '/app/'); await wait(2500); await p.click('#nav-comida'); await wait(500); };
const abrirFoto = async p => { await p.click('[data-action="search-open"]'); await wait(700); await p.click('#sheetHost [data-action="ia-plato"]'); await wait(1200); };
const abrirAjustes = async p => { await p.goto(p.__base + '/app/'); await wait(2500); await p.click('#nav-config'); await wait(1500); };
const compras = p => p.evaluate(() => window.__compras || []);

export default async function ({ base, t }){
  // ---------- Android con el cobro de IA Plus apagado: como siempre ----------
  for (const [que, inter] of [['apagado', [200, { planes: true, plus: false }]], ['sin la función (404)', [404, { code: 'PGRST202', message: 'no existe' }]]]) {
    const pg = await pagina({ estado: LIMITE, init: plugin('android'), inter });
    const { p, errs, S, close } = pg; p.__base = base;
    await abrirComida(p); await abrirFoto(p);
    const h = await txt(p, '#sheetHost .plate-sheet');
    t.ok(S.inter >= 1, que + ': preguntó el interruptor');
    t.has(h, 'IA Plus todavía no está disponible en la app de Android; podés seguir cargando a mano.', que + ': como hoy');
    t.ok(!PROHIBIDO.test(h) && !/US\$|Suscribirme|Recuperar/.test(h), que + ': sin precio ni botones: ' + h);
    const c = await compras(p);
    t.ok(!c.some(x => ['productos', 'comprar', 'vigentes', 'escucha'].includes(x[0])), que + ': no le pide nada a Google Play: ' + JSON.stringify(c));
    t.eq(S.google.length, 0, que + ': no llama a compras-google');
    t.eq(errs, [], que + ': errores de la página');
    await close();
  }

  // ---------- Android con el cobro prendido: la oferta y la compra ----------
  {
    const pg = await pagina({ estado: LIMITE, init: plugin('android'),
      google: (b, S) => { S.estado = estado(PLUS_GOOGLE); return [200, { ok: true, reconocer: true }]; } });
    const { p, errs, S, close } = pg; p.__base = base;
    await abrirComida(p); await abrirFoto(p); await wait(600);
    const h = await txt(p, '#sheetHost .plate-sheet');
    t.has(h, 'Usaste tus 3 fotos gratis con IA de esta semana', 'Google: el aviso del límite');
    t.has(h, 'Seguí usando la IA sin límite semanal: hasta 10 fotos por día.', 'Google: lo que incluye');
    t.has(h, 'IA Plus Suscripción mensual · US$ 2,99 por mes', 'Google: el precio que pone Google Play, mensual');
    t.has(h, 'Se cobra a tu cuenta de Google Play al confirmar. Se renueva sola cada mes hasta que la canceles desde Google Play', 'Google: cómo se renueva y se cancela');
    t.ok(!PROHIBIDO.test(h) && !/Apple|App Store/.test(h), 'Google: ni pesos, ni Mercado Pago, ni Apple, ni links a la web: ' + (h.match(PROHIBIDO) || [''])[0]);
    const links = await p.evaluate(() => [...document.querySelectorAll('#sheetHost .plus-links a')].map(a => a.innerText + ' ' + a.getAttribute('href')));
    t.eq(links, ['Términos de uso https://gize.ar/terminos/?app=1', 'Política de privacidad https://gize.ar/privacidad/?app=1'], 'Google: Términos de uso y Política de privacidad');
    t.ok(!!(await p.$('#sheetHost [data-plus="google-recuperar"]')), 'Google: «Recuperar mi suscripción»');
    t.ok((await compras(p)).some(x => x[0] === 'productos' && x[1].length === 1 && x[1][0] === IA_PLUS), 'Google: pide el precio del producto de IA Plus');
    t.ok((await compras(p)).some(x => x[0] === 'escucha' && x[1] === 'compra'), 'Google: escucha las compras que llegan solas');
    t.ok(!!(await p.$('#sheetHost .plus-box[data-plus-canal="google"]')), 'Google: el canal es google');
    await shot(p, 'g1-android-oferta-google');
    await p.click('#sheetHost [data-plus="google"]'); await wait(2200);
    const c = await compras(p);
    t.ok(c.some(x => x[0] === 'comprar' && x[1] === IA_PLUS && x[2] === ALUMNO.id), 'Google: compra IA Plus con el id de la cuenta');
    t.eq(S.google, [{ token: 'TOK-PLUS', producto: IA_PLUS }], 'Google: manda { token, producto } a compras-google');
    t.ok(c.some(x => x[0] === 'finalizar' && x[1] === 'TOK-PLUS'), 'Google: el servidor no pudo reconocerla: la reconoce la app');
    t.has(await txt(p, '#iaToast'), '¡Listo! Ya tenés IA Plus.', 'Google: el aviso');
    t.ok(!(await p.$('#sheetHost .plus-box')), 'Google: comprado, ya no ofrece');
    t.ok(!!(await p.$('#sheetHost [data-pick]')), 'Google: la hoja sigue con la foto');
    await shot(p, 'g2-android-comprado');
    t.eq(errs, [], 'Google: errores de la página');
    await close();
  }
  // Pendiente (efectivo, aprobación familiar): avisa y no la reconoce.
  {
    const pg = await pagina({ estado: LIMITE, init: plugin('android', { compra: { estado: 'pendiente', token: 'TOK-PEND', producto: IA_PLUS } }),
      google: () => [400, { error: 'Tu pago quedó pendiente en Google Play.', codigo: 'pendiente' }] });
    const { p, errs, S, dialogs, close } = pg; p.__base = base;
    await abrirComida(p); await abrirFoto(p); await wait(600);
    await p.click('#sheetHost [data-plus="google"]'); await wait(2000);
    t.eq(S.google, [{ token: 'TOK-PEND', producto: IA_PLUS }], 'pendiente: queda anotada en el servidor');
    t.ok(dialogs.some(d => /Tu pago quedó pendiente en Google Play. Cuando se acredite, IA Plus se activa solo./.test(d)), 'pendiente: avisa: ' + dialogs.join(' | '));
    t.ok(!(await compras(p)).some(x => x[0] === 'finalizar'), 'pendiente: no la reconoce');
    t.eq(errs, [], 'pendiente: errores de la página');
    await close();
  }
  // «Recuperar mi suscripción»: solo las de IA Plus del celular.
  {
    const restaurar = [{ token: 'TOK-PLAN', producto: 'ar.com.gize.app.coach.p25', estado: 'comprada' }, { token: 'TOK-VIEJA', producto: IA_PLUS, estado: 'comprada', reconocida: true }];
    const pg = await pagina({ estado: LIMITE, init: plugin('android', { restaurar }),
      google: (b, S) => { S.estado = estado(PLUS_GOOGLE); return [200, { resultados: [{ ok: true }] }]; } });
    const { p, errs, S, dialogs, close } = pg; p.__base = base;
    await abrirComida(p); await abrirFoto(p); await wait(600);
    await p.click('#sheetHost [data-plus="google-recuperar"]'); await wait(2000);
    t.eq(S.google, [{ compras: [{ token: 'TOK-VIEJA', producto: IA_PLUS }] }], 'recuperar: manda solo la de IA Plus');
    t.ok(dialogs.some(d => /Listo: recuperamos tu IA Plus./.test(d)), 'recuperar: avisa');
    t.eq(errs, [], 'recuperar: errores de la página');
    await close();
  }
  // Las que llegan solas y las del celular que nadie reconoció van a la función.
  {
    const vigentes = [{ token: 'TOK-SIN', producto: IA_PLUS, estado: 'comprada', reconocida: false }, { token: 'TOK-YA', producto: IA_PLUS, estado: 'comprada', reconocida: true },
      { token: 'TOK-SUSP', producto: IA_PLUS, estado: 'comprada', reconocida: false, suspendida: true }, { token: 'TOK-PLAN', producto: 'ar.com.gize.app.coach.p10', estado: 'comprada', reconocida: false }];
    const pg = await pagina({ estado: estado({ usados_semana: 0, quedan_semana: 3 }), init: plugin('android', { vigentes }) });
    const { p, errs, S, close } = pg; p.__base = base;
    await p.goto(base + '/app/'); await wait(3000);
    t.eq(S.google, [{ compras: [{ token: 'TOK-SIN', producto: IA_PLUS }] }], 'al entrar: la de IA Plus que nadie reconoció va al servidor (no la ya reconocida, la suspendida ni la del plan)');
    await p.evaluate(() => window.__llega({ token: 'TOK-LLEGA', producto: 'ar.com.gize.app.iaplus.mensual', estado: 'comprada', reconocida: false }));
    await p.evaluate(() => window.__llega({ token: 'TOK-ESPERA', producto: 'ar.com.gize.app.iaplus.mensual', estado: 'pendiente' }));
    await wait(1200);
    t.eq(S.google.slice(1), [{ token: 'TOK-LLEGA', producto: IA_PLUS }], 'la compra que llega sola va al servidor (la pendiente no)');
    t.eq(errs, [], 'escucha: errores de la página');
    await close();
  }

  // ---------- Ajustes → Mi IA Plus con IA Plus de Google ----------
  {
    const pg = await pagina({ estado: estado(PLUS_GOOGLE), init: plugin('android') });
    const { p, errs, close } = pg; p.__base = base;
    await abrirAjustes(p);
    const a = await txt(p, '#cfgPlus');
    t.has(a, 'Activo · se renueva el', 'Android, Ajustes: activo con Google');
    t.ok(!PROHIBIDO.test(a) && !/Apple/.test(a), 'Android, Ajustes: sin pesos, Mercado Pago ni Apple');
    await shot(p, 'g3-android-ajustes');
    await p.click('#cfgPlus [data-plus="google-administrar"]'); await wait(1200);
    t.ok((await compras(p)).some(x => x[0] === 'administrar' && x[1] === IA_PLUS), 'Android: «Administrar en Google Play» abre la de IA Plus');
    t.eq(errs, [], 'Android Ajustes: errores');
    await close();
  }
  // Aunque el dueño apague el cobro, quien la compró la puede administrar.
  {
    const pg = await pagina({ estado: estado(PLUS_GOOGLE, {}), init: plugin('android'), inter: [200, { planes: false, plus: false }] });
    const { p, errs, close } = pg; p.__base = base;
    await abrirAjustes(p);
    t.ok(!!(await p.$('#cfgPlus [data-plus="google-administrar"]')), 'cobro apagado: igual puede administrar la que compró');
    t.eq(errs, [], 'cobro apagado, Ajustes: errores');
    await close();
  }
  for (const [que, plus] of [['activo', PLUS_GOOGLE], ['incluido y se renueva', { estado: 'incluido', por: 'alumno', fuente: 'google', hasta: D(25), renueva: true }]]) {
    const pg = await pagina({ estado: estado(plus), init: plugin('ios') });
    const { p, errs, S, close } = pg; p.__base = base;
    await abrirAjustes(p);
    const a = await txt(p, '#cfgPlus');
    t.ok(!/google|android|play/i.test(a), 'iPhone (' + que + '): no nombra Google ni Android: ' + a);
    t.has(a, 'La suscripción la administrás desde el dispositivo donde la compraste.', 'iPhone (' + que + '): texto neutro');
    if (plus.estado === 'incluido') t.has(a, 'Tenés además una suscripción que se renueva: cancelala para no pagar de más.', 'iPhone: aviso de pagar de más, neutro');
    t.ok(!(await p.$('#cfgPlus [data-plus]')), 'iPhone (' + que + '): sin botones de Google');
    t.eq(S.inter, 0, 'iPhone (' + que + '): no pregunta el interruptor de Google Play');
    await shot(p, 'g4-iphone-ajustes-' + (plus.estado === 'incluido' ? 'incluido' : 'activo'));
    t.eq(errs, [], 'iPhone (' + que + '): errores');
    await close();
  }
  {
    const pg = await pagina({ estado: estado(PLUS_GOOGLE) });
    const { p, errs, S, close } = pg; p.__base = base;
    await abrirAjustes(p);
    const a = await txt(p, '#cfgPlus');
    t.has(a, 'La suscripción es de Google Play: la cambiás o la cancelás desde tu Android, en Google Play.', 'web: se administra en Google Play');
    t.ok(!(await p.$('#cfgPlus [data-plus="baja"]')) && !(await p.$('#cfgPlus [data-plus="mp"]')), 'web: sin baja ni Mercado Pago');
    t.eq(S.inter, 0, 'web: no pregunta el interruptor de Google Play');
    t.eq(errs, [], 'web Ajustes: errores');
    await close();
  }
}
