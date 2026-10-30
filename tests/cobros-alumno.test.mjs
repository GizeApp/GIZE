// Cobros del coach, lo que ve el alumno (app/core/cobros.js cuotaCoach y Ajustes → Tu coach en
// app/screens/config.js), con la base de Cobros simulada (cobro_mi_cuota, supabase/cobros-coach.sql).
// - En la web, debajo de «Tu coach · Vinculado»: el estado de la cuota (con su color), «Paga hasta…» o
//   «Venció el…», el monto («$ 25.000 por mes»), los últimos 5 pagos y «Lo anota tu coach cuando le
//   pagás.». Sin cuota, sin la base, sin señal o con Cobros apagado en la web: nada.
// - En las apps de iPhone y Android: solo el estado y la fecha, sin «$», montos, pagos ni medios (como la
//   cuota del gimnasio). Con el interruptor de esa plataforma apagado (así nace), nada.
// - Nunca un link ni un botón para pagar. Con la cuota vencida no se bloquea nada: Entreno, Comida y el
//   chat siguen iguales y la cuota no aparece fuera de Ajustes (ni se pide).
// - La socia con un profe del gimnasio no ve esta tarjeta (su cuota está en «Tu gimnasio»); con un
//   coach de afuera, sí.
import { wait, contraste } from './lib.mjs';
import { entrar, entrarSocio, miGimnasioSocio, ALUMNO, COACH, IOS, ANDROID, M, D, rpcs } from './gym-comun.mjs';
import { ymd } from './cobros-coach-comun.mjs';

// «05/12/26», como lo muestra Ajustes.
const fecha = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4);
const VENCE = { al_dia: ymd(20), por_vencer: ymd(5), vencida: ymd(-3), sin_pagos: null };
const MEDIOS = ['transferencia', 'efectivo', 'otro'];
// Seis pagos (se ven los últimos 5).
const PAGOS = [0, 1, 2, 3, 4, 5].map(i => ({ fecha: ymd(-10 - 30 * i), monto: 25000, medio: MEDIOS[i % 3], hasta: ymd(20 - 30 * i) }));
const SOLO_WEB = { web: true, android: false, ios: false };
// Lo que contesta cobro_mi_cuota.
const miCuota = (estado, interruptor = SOLO_WEB) => ({ interruptor, estado, vence: VENCE[estado], cuota: { monto: 25000, meses: 1 }, pagos: estado === 'sin_pagos' ? [] : PAGOS });

// La alumna Martina, vinculada con su coach (sin gimnasio). o.cuota: lo que contesta cobro_mi_cuota
// (o { error, status }); o: lo demás de entrar (init, vp, tema, handlers…).
function entrarAlumna(base, o = {}){
  const cuota = o.cuota === undefined ? miCuota('al_dia') : o.cuota;
  return entrar(base, ALUMNO, Object.assign({ rol: 'client', gym: null, nombre: 'Martina Sosa', perfil: { coach_id: COACH.id } }, o,
    { rpc: Object.assign({ cobro_mi_cuota: () => cuota }, o.rpc || {}) }));
}
async function ajustes(p){ await p.click('#nav-config'); await wait(900); }
const cuotaTxt = p => p.evaluate(() => { const e = document.getElementById('cfgCoachCuota'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
// La tarjeta «Tu coach»: su texto, sus links y botones (solo «Vinculado», que desvincula).
const tarjeta = p => p.evaluate(() => {
  const b = document.querySelector('#view .cfg-ok[data-action="cfg-unlink-coach"]'), c = b && b.closest('.cfg-card');
  if (!c) return null;
  return { t: c.innerText.replace(/\s+/g, ' ').trim(), h: c.innerHTML,
    acciones: [...c.querySelectorAll('a, button, [role="button"], [role="link"], [onclick], input, [tabindex]')].map(x => x.getAttribute('data-action') || x.tagName) };
});
const UNA_ACCION = ['cfg-unlink-coach'];

export default async function ({ base, t }){
  // ===== La web: estado, fecha, monto y pagos =====
  for (const [vp, tema] of [[D, 'oscuro'], [M, 'claro'], [{ width: 320, height: 640 }, 'oscuro']]){
    const donde = 'web, ' + vp.width + ' px, ' + tema;
    const pg = await entrarAlumna(base, { vp, tema, touch: vp !== D }), p = pg.p;
    t.eq(rpcs(pg.st, 'cobro_mi_cuota').length, 0, donde + ': fuera de Ajustes no se pide la cuota');
    await ajustes(p);
    const txt = await cuotaTxt(p);
    t.has(txt, 'Cuota Al día', donde + ': el estado');
    t.has(txt, 'Paga hasta el ' + fecha(VENCE.al_dia) + '.', donde + ': hasta cuándo está paga');
    t.ok(/\$\s?25\.000 por mes/.test(txt), donde + ': el monto por mes: ' + txt);
    t.has(txt, 'Tus pagos', donde + ': sus pagos');
    const filas = await p.$$eval('#cfgCoachCuota .cfg-gym-pagos li', ls => ls.map(l => l.innerText.replace(/\s+/g, ' ').trim()));
    t.eq(filas.length, 5, donde + ': los últimos 5 pagos (de 6)');
    t.ok(filas.every((f, i) => f.startsWith(fecha(PAGOS[i].fecha) + ' · ') && /\$\s?25\.000/.test(f)), donde + ': cada pago con fecha y monto: ' + filas.join(' | '));
    t.eq(filas.map(f => f.split(' · ')[2]), ['transferencia', 'efectivo', 'otro medio', 'transferencia', 'efectivo'], donde + ': y el medio');
    t.has(txt, 'Lo anota tu coach cuando le pagás.', donde + ': quién lo anota');
    const tj = await tarjeta(p);
    t.ok(!!tj && /^Tu coach Vinculado/.test(tj.t), donde + ': va dentro de «Tu coach · Vinculado»');
    t.eq(tj && tj.acciones, UNA_ACCION, donde + ': ningún link ni botón para pagar (solo «Vinculado»)');
    t.ok(!/mercado ?pago|checkout|https?:|href/i.test(tj ? tj.h : ''), donde + ': sin links ni Mercado Pago');
    t.eq(rpcs(pg.st, 'cobro_mi_cuota').length, 1, donde + ': pide su cuota una vez');
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), donde + ': sin scroll de costado');
    await p.evaluate(() => document.getElementById('cfgCoachCuota').scrollIntoView({ block: 'center' })); await wait(300);
    const c = await contraste(p, '#cfgCoachCuota');
    t.ok(c.n > 0 && c.min >= 4.5, donde + ': contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 3).join(' | ') + ')');
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ===== Cada estado, con su color =====
  for (const [estado, rotulo, clase] of [['vencida', 'Vencida', 'cfg-gym-mal'], ['por_vencer', 'Por vencer', 'cfg-gym-ambar'], ['sin_pagos', 'Sin pagos cargados', 'cfg-gym-ambar']]){
    const pg = await entrarAlumna(base, { vp: M, touch: true, cuota: miCuota(estado) }), p = pg.p;
    await ajustes(p);
    const txt = await cuotaTxt(p);
    t.has(txt, 'Cuota ' + rotulo, estado + ': el estado');
    if (estado === 'vencida') t.has(txt, 'Venció el ' + fecha(VENCE.vencida) + '.', estado + ': cuándo venció');
    if (estado === 'por_vencer') t.has(txt, 'Paga hasta el ' + fecha(VENCE.por_vencer) + '.', estado + ': hasta cuándo');
    if (estado === 'sin_pagos') t.ok(!/Paga hasta|Venció|Tus pagos/.test(txt) && /\$\s?25\.000 por mes/.test(txt), estado + ': sin fecha ni pagos, con el monto: ' + txt);
    const col = await p.evaluate(() => { const v = document.querySelector('#cfgCoachCuota .cfg-gym-cuota'), k = document.querySelector('#cfgCoachCuota .cfg-gym-k');
      return v && k ? [v.className, getComputedStyle(v).color !== getComputedStyle(k).color && getComputedStyle(v).color !== getComputedStyle(document.querySelector('#cfgCoachCuota .cfg-notif-desc')).color] : null; });
    t.ok(!!col && col[0].includes(clase) && col[1], estado + ': se ve con su color (' + (col && col[0]) + ')');
    t.eq(pg.errs, [], estado + ': sin errores');
    await pg.close();
  }

  // ===== Nada que mostrar: sin cuota, sin la base, sin señal o con la web apagada =====
  for (const [caso, o] of [
    ['sin cuota (null)', { cuota: null }],
    ['sin la base (la función no existe)', { cuota: { error: 'PGRST202', msg: 'Could not find the function public.cobro_mi_cuota', status: 404 } }],
    ['sin señal', { handlers: { '/rpc/cobro_mi_cuota': r => r.abort('failed') } }],
    ['error del servidor', { cuota: { error: 'XX000', status: 500 } }],
    ['Cobros apagado en la web', { cuota: miCuota('vencida', { web: false, android: true, ios: true }) }],
    ['sin interruptor', { cuota: Object.assign(miCuota('vencida'), { interruptor: null }) }],
  ]){
    const pg = await entrarAlumna(base, Object.assign({ vp: M, touch: true }, o)), p = pg.p;
    await ajustes(p);
    const tj = await tarjeta(p);
    t.ok(!!tj, caso + ': la tarjeta «Tu coach» sigue');
    t.ok(!await p.$('#cfgCoachCuota') && !/cuota|pag|\$/i.test(tj ? tj.t : ''), caso + ': no se ve nada de la cuota: ' + (tj && tj.t));
    t.eq(pg.errs, [], caso + ': sin errores');
    // Sin la base no se vuelve a preguntar enseguida (ni al volver a Ajustes).
    if (/sin la base/.test(caso)){
      await p.click('#nav-entreno'); await wait(300); await ajustes(p);
      t.eq(rpcs(pg.st, 'cobro_mi_cuota').length, 1, caso + ': no se vuelve a preguntar enseguida');
    }
    await pg.close();
  }

  // ===== Las apps: solo el estado y la fecha, y nada con su interruptor apagado =====
  const PROHIBIDO = /\$|25\.000|\bpagos?\b|pagar|pagás|tus pagos|transferencia|efectivo|otro medio|por mes|precio|mercado ?pago|suscrip|tarjeta|plan/i;
  for (const [plat, init, clave, otra] of [['iPhone', IOS, 'ios', 'android'], ['Android', ANDROID, 'android', 'ios']]){
    // Así nace el interruptor (solo la web) y con el de la otra app prendido: nada.
    for (const [caso, sw] of [['de fábrica', SOLO_WEB], ['con la otra app prendida', { web: true, [clave]: false, [otra]: true }]]){
      const pg = await entrarAlumna(base, { init, vp: M, touch: true, cuota: miCuota('vencida', sw) }), p = pg.p;
      await ajustes(p);
      const tj = await tarjeta(p);
      t.ok(!!tj && !await p.$('#cfgCoachCuota') && !/cuota/i.test(tj.t), plat + ', ' + caso + ': no se ve la cuota: ' + (tj && tj.t));
      t.eq(pg.errs, [], plat + ', ' + caso + ': sin errores');
      await pg.close();
    }
    // Prendido en esa app: el estado y la fecha, nada más.
    for (const estado of ['al_dia', 'vencida', 'sin_pagos']){
      const donde = plat + ', prendido, ' + estado;
      const pg = await entrarAlumna(base, { init, vp: M, touch: true, cuota: miCuota(estado, { web: true, [clave]: true, [otra]: false }) }), p = pg.p;
      await ajustes(p);
      const txt = await cuotaTxt(p), tj = await tarjeta(p);
      t.has(txt, 'Cuota ' + { al_dia: 'Al día', vencida: 'Vencida', sin_pagos: 'Sin pagos cargados' }[estado], donde + ': el estado');
      if (VENCE[estado]) t.has(txt, (estado === 'vencida' ? 'Venció el ' : 'Paga hasta el ') + fecha(VENCE[estado]) + '.', donde + ': y la fecha');
      // «Paga hasta» y «Sin pagos cargados» son el estado y la fecha (como la cuota del gimnasio en las apps).
      const resto = tj ? tj.t.replace(/Paga hasta el/g, '').replace(/Sin pagos cargados/g, '') : '';
      const m = resto.match(PROHIBIDO);
      t.ok(!m, donde + ': sin montos, pagos, medios ni precios' + (m ? ' (aparece «' + m[0] + '»: ' + resto + ')' : ''));
      t.eq(tj && tj.acciones, UNA_ACCION, donde + ': ningún link ni botón (solo «Vinculado»)');
      t.ok(!/href|mercadopago|checkout|gize\.ar/i.test(tj ? tj.h : ''), donde + ': sin links');
      t.eq(pg.errs, [], donde + ': sin errores');
      await pg.close();
    }
  }

  // ===== Con la cuota vencida no se bloquea nada =====
  for (const [plat, init, sw] of [['web', '', SOLO_WEB], ['Android', ANDROID, { web: true, android: true, ios: false }]]){
    const llamadas = [];
    const pg = await entrarAlumna(base, { init, vp: M, touch: true, cuota: miCuota('vencida', sw), handlers: { '/functions/v1/rapid-worker': (r, J, i) => {
      llamadas.push(JSON.parse(i.body || '{}')); return J({ delivered: 1, devices: 1, saved: true, id: 'm' + llamadas.length, created_at: new Date().toISOString() }); } } }), p = pg.p;
    const vista = async v => { await p.click('#nav-' + v); await wait(700); return p.evaluate(() => document.getElementById('view').innerText.replace(/\s+/g, ' ').trim()); };
    const antes = { entreno: await vista('entreno'), comida: await vista('comida') };
    t.eq(rpcs(pg.st, 'cobro_mi_cuota').length, 0, plat + ': en Entreno y Comida no se pide la cuota');
    await ajustes(p);
    t.has(await cuotaTxt(p), 'Cuota Vencida', plat + ': en Ajustes se ve vencida');
    for (const v of ['entreno', 'comida']){
      const ahora = await vista(v);
      t.eq(ahora, antes[v], plat + ': ' + v + ' sigue igual con la cuota vencida');
      t.ok(!/cuota|venci/i.test(ahora), plat + ': en ' + v + ' no aparece la cuota');
    }
    for (const v of ['habitos', 'progreso']) t.ok(!/cuota/i.test(await vista(v)), plat + ': en ' + v + ' no aparece la cuota');
    // El chat con el coach, igual que siempre.
    t.ok(await p.isVisible('#chatBtn'), plat + ': el botón del chat está');
    await p.click('#chatBtn'); await wait(800);
    t.ok(!!await p.$('#chatHost #chatText'), plat + ': se abre el chat');
    await p.fill('#chatText', 'Hola, ¿mañana entrenamos?'); await p.click('[data-chat="send"]'); await wait(700);
    t.eq(llamadas.map(b => [b.client_id, b.body]), [[ALUMNO.id, 'Hola, ¿mañana entrenamos?']], plat + ': el mensaje sale como siempre');
    t.ok(!/cuota|venci|\$/i.test(await p.evaluate(() => document.getElementById('chatHost').innerText)), plat + ': el chat no habla de la cuota');
    t.eq(pg.errs, [], plat + ': sin errores');
    await pg.close();
  }

  // ===== La socia de un gimnasio =====
  {
    // Con un profe del gimnasio: su cuota es la del gimnasio («Tu gimnasio»); esta tarjeta no está y no se pide.
    const pg = await entrarSocio(base, { vp: M, touch: true, rpc: { cobro_mi_cuota: () => miCuota('vencida') } }), p = pg.p;
    await ajustes(p);
    t.ok(!await tarjeta(p) && !await p.$('#cfgCoachCuota'), 'socia con profe del gimnasio: sin la tarjeta «Tu coach» ni su cuota');
    t.eq(rpcs(pg.st, 'cobro_mi_cuota').length, 0, 'socia con profe del gimnasio: no se pide la cuota del coach');
    t.eq(pg.errs, [], 'socia con profe del gimnasio: sin errores');
    await pg.close();
  }
  {
    // Con un coach de afuera: «Tu coach» con la cuota que anotó él.
    const gym = miGimnasioSocio({ profe: null, coach_externo: true });
    const pg = await entrarSocio(base, { vp: M, touch: true, gym, perfil: { coach_id: COACH.id }, rpc: { mi_gimnasio: () => gym, cobro_mi_cuota: () => miCuota('al_dia') } }), p = pg.p;
    await ajustes(p);
    t.has(await cuotaTxt(p), 'Cuota Al día', 'socia con coach de afuera: ve la cuota con su coach');
    t.eq(pg.errs, [], 'socia con coach de afuera: sin errores');
    await pg.close();
  }
}
