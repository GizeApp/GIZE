// App de iPhone y las cuentas de coach (App Store, reglas 3.1.1 y 3.1.3): los coaches se
// registran solo desde la web. En el iPhone sin el plugin de compras con Apple (una versión de la
// app que no lo trae; con el plugin, los planes se compran con Apple: compras-apple-app.test.mjs):
//   · «Crear cuenta» no ofrece «Soy coach» (tampoco con el link #registro-coach) ni habla de la prueba;
//   · el coach que ya tiene cuenta entra y usa el panel sin ver prueba, plan, pagos ni precios
//     (ni en el panel, ni en su Configuración, ni en la bienvenida); al llegar al tope de
//     alumnos ve un aviso neutro;
//   · con la cuenta vencida ve una pantalla neutra con «Cerrar sesión»;
//   · al vincularse, el alumno no ve el plan de su coach en el mensaje de error.
//   · en el chat, el alumno de un coach vencido no ve «plan vencido» al mandar un mensaje.
//   · con Cobros prendido en la app (lo prende el dueño desde el admin; de fábrica está apagado), el
//     panel, la tira de Inicio y su Configuración siguen sin pagos ni precios. Dentro de Cobros sí se
//     ven los montos que el coach les cobra a sus alumnos (no son precios de GIZE: AGENTS.md, «Reglas
//     de las tiendas»), pero nunca la prueba, el plan ni precios de GIZE, tarjetas, suscripciones,
//     Mercado Pago ni links a gize.ar (PROHIBIDO_COBROS; cada ventana, en cobros-coach-tiendas).
// En la app de Android (con Capacitor o solo con su puente), lo mismo que en el iPhone para el
// coach que ya tiene cuenta: ni el panel, ni su Configuración, ni la bienvenida, ni la pantalla de la
// cuenta vencida hablan de la prueba, el plan, pagos ni precios (la vencida dice, además, cuándo sus
// clientes pasan a usar GIZE por su cuenta), y el alumno tampoco ve el plan de su coach.
// En la web todo sigue como antes: «Soy coach», la prueba gratis, «Mi plan» y los precios.
// Eliminar la cuenta de coach dice «se da de baja tu cuenta de coach» en todos lados.
import { newPage, wait, ALUMNO, profile, configCoach, seccionesCoach, CONFIG_COACH } from './lib.mjs';
import { resumen } from './cobros-coach-comun.mjs';

const IOS = `(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; })();`;
// La app de Android: con Capacitor, o solo con su puente (window.androidBridge).
const ANDROID = `(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} }; })();`;
const PUENTE = `window.androidBridge = {};`;
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString() };
const D = n => new Date(Date.now() + n * 864e5).toISOString();
// Lo que no se puede ver en las apps. «planes» (los planes alimenticios del coach) no cuenta.
const PROHIBIDO = /prueba|gratis|\bplan\b|pago|precio|tarjeta|mercado|suscrip|contrat|\$|gize\.ar(?!\/privacidad)/i;
// Dentro de Cobros (y solo ahí) se ven los montos que el coach les cobra a sus alumnos, con «$» y
// «pagos»: no son precios de GIZE. Todo lo demás de PROHIBIDO sigue sin poder verse.
const PROHIBIDO_COBROS = /prueba|gratis|\bplan\b|precio|tarjeta|mercado|suscrip|contrat|gize\.ar(?!\/privacidad)/i;

const clientes = n => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, role: 'client', full_name: 'Alumno ' + i, coach_id: COACH.id }));
function coachPage(billingRow, { ios, init, n = 2, user = COACH, handlers } = {}){
  return newPage({ user, init: ios ? IOS : init, handlers: Object.assign({
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J(clientes(n));
      const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = Object.assign({ coach_id: COACH.id }, billingRow); return J(i.one ? b : [b]); },
  }, handlers) });
}
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText).join(' ').replace(/\s+/g, ' '), sel);
// Su Configuración es una pantalla con un menú de secciones: el texto de todas (menú incluido) y
// cuáles hay, para revisar que ninguna hable de planes ni pagos. «Perfil» muestra el mail de la
// cuenta (coach@prueba.test, de la prueba y no de la app): ese no cuenta.
async function configEntera(p){
  const secs = await seccionesCoach(p, q => txt(q, '#coachHost .cv-wrap'));
  return { texto: secs.map(s => s.v).join(' ').split(COACH.email).join('(mail)'), secs: secs.map(s => s.k) };
}

export default async function ({ base, t }){
  // 1) «Crear cuenta» en el iPhone: sin «Soy coach», sin la prueba; la cuenta nueva es de alumno.
  for (const url of ['/app/', '/app/#registro-coach']){
    const pg = await newPage({ init: IOS });
    await pg.p.goto(base + url); await wait(1500);
    if (url === '/app/') { await pg.p.click('[data-auth="to-signup"]'); await wait(400); }
    const r = await pg.p.evaluate(() => ({ roles: document.querySelectorAll('[data-auth-role]').length, role: (document.getElementById('auRole') || {}).value, txt: document.getElementById('authHost').innerText }));
    t.eq(r.roles, 0, 'iPhone ' + url + ': sin elegir «Soy cliente / Soy coach»');
    t.eq(r.role, 'client', 'iPhone ' + url + ': la cuenta nueva es de alumno');
    t.ok(!/coach/i.test(r.txt) && !PROHIBIDO.test(r.txt), 'iPhone ' + url + ': sin coach ni prueba en el registro: ' + r.txt);
    t.eq(pg.errs, [], 'errores (registro iPhone ' + url + ')');
    await pg.close();
  }
  // En la web sigue «Soy coach», y el link de la página de inicio lo deja elegido.
  let pg = await newPage();
  await pg.p.goto(base + '/app/#registro-coach'); await wait(1500);
  t.eq(await pg.p.evaluate(() => (document.getElementById('auRole') || {}).value), 'coach', 'web: #registro-coach elige «Soy coach»');
  t.has(await txt(pg.p, '#authHost'), 'Soy coach', 'web: está «Soy coach»');
  await pg.close();

  // 2) Coach con cuenta, en la prueba y con el cupo lleno, en el iPhone: el panel, la bienvenida
  // y su Configuración sin prueba, plan, pagos ni precios.
  const prueba = { plan: 'trial', max_clients: 10, trial_ends_at: D(3) };
  pg = await coachPage(prueba, { ios: true, n: 10 });
  await pg.p.goto(base + '/app/'); await wait(3000);
  const bienvenida = await txt(pg.p, '#authHost');
  t.has(bienvenida, '¡Bienvenido, coach!', 'iPhone: bienvenida del coach');
  t.ok(!PROHIBIDO.test(bienvenida), 'iPhone: la bienvenida no habla de la prueba: ' + bienvenida);
  await pg.p.click('[data-onb="done"]'); await wait(400);
  let panel = await txt(pg.p, '#coachHost');
  t.has(panel, 'Panel de coach', 'iPhone: se ve el panel');
  t.has(panel, 'Alumno 3', 'iPhone: con sus alumnos');
  t.has(panel, 'Llegaste al máximo de alumnos de tu cuenta.', 'iPhone: aviso neutro del tope de alumnos');
  t.ok(!PROHIBIDO.test(panel), 'iPhone: el panel no habla de prueba, plan ni pagos: ' + panel.match(PROHIBIDO));
  t.eq(await pg.p.evaluate(() => document.querySelectorAll('[data-plan]').length), 0, 'iPhone: nada abre «Mi plan»');
  const { texto: ajustes, secs } = await configEntera(pg.p);
  t.has(ajustes, 'Cerrar sesión', 'iPhone: se ve su Configuración');
  t.ok(!PROHIBIDO.test(ajustes), 'iPhone: Configuración sin plan ni pagos: ' + ajustes.match(PROHIBIDO));
  t.ok(!/Mi plan|Ver mi plan/.test(ajustes) && !secs.includes('plan'), 'iPhone: sin «Mi plan» ni «Ver mi plan y cantidad de clientes»: ' + secs);
  // Eliminar la cuenta (sección «Cuenta»; sin escribir ELIMINAR: no se borra nada).
  await configCoach(pg.p, 'cuenta');
  await pg.p.click(CONFIG_COACH + ' [data-action="cfg-delete-account"]'); await wait(800);
  t.has(pg.dialogs[0] || '', 'y se da de baja tu cuenta de coach', 'eliminar: texto neutro');
  t.ok(!PROHIBIDO.test(pg.dialogs[0] || ''), 'eliminar: sin suscripción ni pagos');
  // El mensaje de join_coach cuando el coach está vencido o lleno, sin nombrar el plan.
  const join = await pg.p.evaluate(async () => { const m = await import('/app/core/tienda.js');
    return [m.joinMsgTienda('Tu coach tiene el plan de GIZE vencido. Avisale para que lo renueve y volvé a intentar.'), m.joinMsgTienda('Tu coach llegó al máximo de clientes de su plan. Avisale para que lo amplíe y volvé a intentar.')]; });
  t.ok(join.every(m => !PROHIBIDO.test(m) && /Avisale/.test(m)), 'iPhone: el alumno no ve el plan de su coach: ' + join);
  t.eq(pg.errs, [], 'errores (coach iPhone)');
  await pg.close();

  // La app de Android, igual: en la prueba y con el cupo lleno, con un plan de cortesía y con más
  // alumnos que los de su plan, sin prueba, plan, pagos ni precios.
  for (const [name, init] of [['Android', ANDROID], ['Android (puente)', PUENTE]]){
    pg = await coachPage(prueba, { init, n: 10 });
    await pg.p.goto(base + '/app/'); await wait(3000);
    const b = await txt(pg.p, '#authHost');
    t.has(b, '¡Bienvenido, coach!', name + ': bienvenida del coach');
    t.ok(!PROHIBIDO.test(b) && !(await pg.p.$('.onb-trial')), name + ': la bienvenida no habla de la prueba gratis: ' + b);
    await pg.p.click('[data-onb="done"]'); await wait(400);
    panel = await txt(pg.p, '#coachHost');
    t.has(panel, 'Alumno 3', name + ': se ve el panel con sus alumnos');
    t.has(panel, 'Llegaste al máximo de alumnos de tu cuenta.', name + ': aviso neutro del tope de alumnos');
    t.ok(!PROHIBIDO.test(panel), name + ': el panel no habla de prueba, plan ni pagos: ' + panel.match(PROHIBIDO));
    t.eq(await pg.p.evaluate(() => document.querySelectorAll('[data-plan]').length), 0, name + ': nada abre «Mi plan»');
    const { texto: aj, secs: ss } = await configEntera(pg.p);
    t.has(aj, 'Cerrar sesión', name + ': se ve su Configuración');
    t.ok(!PROHIBIDO.test(aj) && !/Mi plan|Ver mi plan/.test(aj) && !ss.includes('plan'), name + ': Configuración sin plan ni pagos: ' + aj.match(PROHIBIDO));
    const jn = await pg.p.evaluate(async () => { const m = await import('/app/core/tienda.js');
      return [m.joinMsgTienda('Tu coach tiene el plan de GIZE vencido. Avisale para que lo renueve y volvé a intentar.'), m.chatMsgTienda('Tu plan de GIZE está vencido: por ahora no podés mandar mensajes.')]; });
    t.ok(jn.every(m => !PROHIBIDO.test(m) && !/renov/i.test(m)), name + ': los mensajes del plan vencido, neutros: ' + jn);
    t.eq(pg.errs, [], 'errores (coach ' + name + ')');
    await pg.close();

    for (const [cual, row, n, ve] of [['cortesía', { plan: 'cortesia', max_clients: 10, trial_ends_at: D(-40) }, 2, 'Tu código de invitación'],
      ['más alumnos que los del plan', { plan: 'p10', max_clients: 10, trial_ends_at: D(-40), paid_until: D(20) }, 12, 'Tenés más alumnos que el máximo de tu cuenta']]){
      pg = await coachPage(row, { init, n, user: Object.assign({}, COACH, { created_at: D(-60) }) });
      await pg.p.goto(base + '/app/'); await wait(3000);
      const v = await txt(pg.p, '#coachHost');
      t.has(v, ve, name + ', ' + cual + ': se ve el panel');
      t.ok(!PROHIBIDO.test(v), name + ', ' + cual + ': sin prueba, plan ni pagos: ' + v.match(PROHIBIDO));
      t.eq(pg.errs, [], 'errores (' + name + ', ' + cual + ')');
      await pg.close();
    }
  }

  // En la web, lo mismo con la prueba, «Mi plan» y los precios.
  pg = await coachPage(prueba, { n: 10 });
  await pg.p.goto(base + '/app/'); await wait(3000);
  t.has(await txt(pg.p, '#authHost'), '14 días gratis para probar todo', 'web: la bienvenida habla de la prueba');
  await pg.p.click('[data-onb="done"]'); await wait(400);
  panel = await txt(pg.p, '#coachHost');
  t.has(panel, 'Prueba gratis · te quedan 3 días', 'web: tira de la prueba');
  t.has(panel, 'Llegaste al máximo de tu plan', 'web: el tope habla del plan');
  t.has(panel, 'Ver planes', 'web: botón «Ver planes»');
  await configCoach(pg.p, 'plan');
  t.has(await txt(pg.p, CONFIG_COACH), 'Ver mi plan y cantidad de clientes', 'web: «Ver mi plan» en Configuración (sección «Mi plan»)');
  await pg.p.click(CONFIG_COACH + ' [data-plan="open"]'); await wait(500);
  const hoja = await txt(pg.p, '#planSheetHost');
  t.has(hoja, 'Estás en la prueba gratis', 'web: «Mi plan» con la prueba');
  t.has(hoja, '$24.900', 'web: «Mi plan» con los precios');
  t.eq(pg.errs, [], 'errores (coach web)');
  await pg.close();

  // 3) Cuenta vencida en el iPhone: pantalla neutra con «Cerrar sesión», que cierra la sesión.
  const vencida = { plan: 'trial', max_clients: 10, trial_ends_at: D(-2) };
  // (cuenta de hace tiempo: sin la bienvenida del primer ingreso encima)
  const viejo = Object.assign({}, COACH, { created_at: D(-60) });
  pg = await coachPage(vencida, { ios: true, user: viejo });
  await pg.p.goto(base + '/app/'); await wait(3000);
  const muro = await txt(pg.p, '#coachHost');
  t.has(muro, 'Tu cuenta de coach no está activa en este momento.', 'iPhone vencido: pantalla neutra');
  t.ok(!PROHIBIDO.test(muro) && !/equipo|hablá|renovar/i.test(muro), 'iPhone vencido: sin prueba, plan, precios ni a quién recurrir: ' + muro);
  t.ok(!/Alumno 1/.test(muro), 'iPhone vencido: no muestra a sus alumnos');
  await pg.p.click('#coachHost .pl-wall-out'); await wait(2500);
  t.ok(await pg.p.evaluate(() => !!document.getElementById('auEmail')), 'iPhone vencido: «Cerrar sesión» vuelve al ingreso');
  t.eq(pg.errs, [], 'errores (vencido iPhone)');
  await pg.close();

  // En la app de Android, la misma pantalla neutra, con el día en que sus clientes pasan a usar GIZE
  // por su cuenta (sin mandar a renovar).
  for (const [name, init] of [['Android', ANDROID], ['Android (puente)', PUENTE]]){
    pg = await coachPage(vencida, { init, user: viejo });
    await pg.p.goto(base + '/app/'); await wait(3000);
    const m = await txt(pg.p, '#coachHost');
    t.has(m, 'Tu cuenta de coach no está activa en este momento.', name + ' vencido: pantalla neutra');
    t.has(m, 'tus clientes pasan a usar GIZE por su cuenta', name + ' vencido: cuándo sus clientes pasan a usar GIZE por su cuenta');
    t.ok(!PROHIBIDO.test(m) && !/equipo|hablá|renovar/i.test(m), name + ' vencido: sin prueba, plan, precios ni a quién recurrir: ' + m);
    t.ok(!/Alumno 1/.test(m), name + ' vencido: no muestra a sus alumnos');
    t.eq(pg.errs, [], 'errores (vencido ' + name + ')');
    await pg.close();
  }

  // En la web, la pantalla de siempre: la prueba terminó y los planes con precios.
  pg = await coachPage(vencida, { user: viejo });
  await pg.p.goto(base + '/app/'); await wait(3000);
  const muroWeb = await txt(pg.p, '#coachHost');
  t.has(muroWeb, 'Terminó tu prueba gratis', 'web vencido: «Terminó tu prueba gratis»');
  t.has(muroWeb, '$14.900', 'web vencido: con los precios');
  await pg.close();

  // 4) Chat del alumno con el coach vencido: la función de mensajes responde 402 con el plan.
  for (const [quien, init] of [['iPhone', IOS], ['Android', ANDROID], ['web', undefined]]){
    const al = await newPage({ user: ALUMNO, init,
      state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': profile('client', { coach_id: COACH.id }),
        '/functions/v1/rapid-worker': (r, J) => J({ error: 'Tu coach tiene el plan de GIZE vencido: por ahora no le llegan mensajes.' }, 402) } });
    await al.p.goto(base + '/app/'); await wait(2500);
    await al.p.evaluate(async ([cl, co]) => (await import('/app/ui/chat.js')).openChat({ clientId: cl, coachId: co, name: 'Coach', role: 'client' }), [ALUMNO.id, COACH.id]);
    await wait(400);
    await al.p.fill('#chatText', 'Hola'); await al.p.click('[data-chat="send"]'); await wait(1200);
    const fallo = await txt(al.p, '#chatHost .ch-fail');
    if (init) {
      t.has(fallo, 'Por ahora no se pueden mandar mensajes en esta conversación.', quien + ' chat: aviso neutro');
      t.ok(!PROHIBIDO.test(fallo) && !/renov/i.test(fallo), quien + ' chat: sin el plan de su coach: ' + fallo);
    } else t.has(fallo, 'Tu coach tiene el plan de GIZE vencido', 'web chat: el aviso de siempre');
    t.eq(al.errs, [], 'errores (chat ' + quien + ')');
    await al.close();
  }

  // 5) Cobros prendido en la app: afuera de Cobros, la regla de siempre (PROHIBIDO); adentro, los
  // montos del coach sí, pero nada de GIZE (PROHIBIDO_COBROS).
  const alDia = { plan: 'p10', max_clients: 10, trial_ends_at: D(-40), paid_until: D(20) };
  for (const [name, plat, init] of [['iPhone', 'ios', IOS], ['Android', 'android', ANDROID]]){
    const interruptor = { web: true, android: plat === 'android', ios: plat === 'ios' };
    pg = await coachPage(alDia, { init, user: viejo, handlers: { '/cobros_resumen': (r, J) => J(resumen({ interruptor })) } });
    await pg.p.goto(base + '/app/'); await wait(3000);
    await pg.p.click('#coachHost [data-coach="view-home"]'); await wait(400);
    panel = await txt(pg.p, '#coachHost');
    t.ok(/Cobros/.test(panel) && /1 vencida/.test(panel), name + ' con Cobros: se ve «Cobros» y la tira de Inicio: ' + panel);
    t.ok(!PROHIBIDO.test(panel), name + ' con Cobros: el panel sigue sin prueba, plan, pagos ni precios: ' + panel.match(PROHIBIDO));
    const { texto: aj } = await configEntera(pg.p);
    t.ok(!PROHIBIDO.test(aj), name + ' con Cobros: Configuración sin plan ni pagos: ' + aj.match(PROHIBIDO));
    await pg.p.click('#coachHost [data-coach="cobros-ir"]'); await wait(900);
    await pg.p.click('#coachHost [data-coach="cobros-tab"][data-v="todos"]'); await wait(300);
    const cobros = await txt(pg.p, '#coachHost .cv-main');
    t.ok(/\$\s?\d/.test(cobros) && /Anotar cobro/.test(cobros), name + ' con Cobros: adentro se ven los montos del coach: ' + cobros.slice(0, 160));
    t.ok(!PROHIBIDO_COBROS.test(cobros), name + ' con Cobros: adentro, nada de la prueba, el plan ni precios de GIZE: ' + cobros.match(PROHIBIDO_COBROS));
    t.eq(await pg.p.$$eval('a[href*="gize.ar"], a[href*="mercadopago"], a[href*="checkout"]', l => l.map(a => a.getAttribute('href'))), [], name + ' con Cobros: sin links para pagar');
    t.eq(pg.errs, [], 'errores (' + name + ' con Cobros)');
    await pg.close();
  }
}
