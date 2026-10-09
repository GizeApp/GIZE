// Notificaciones en el navegador (Web Push) y la sesión (app/core/push.js):
// 1) Con el permiso del navegador ya dado (por cualquiera que usó la compu), entrar no registra
//    la cuenta para recibir notificaciones si no las activó en este navegador.
// 2) Activadas acá, se vuelven a guardar al entrar (el navegador a veces renueva la suscripción).
// 3) Versiones anteriores (sin la cuenta anotada): se siguen guardando solo si la base dice que ese
//    navegador ya era de esta cuenta; si no (es de otra cuenta), se dan de baja y se borran de la base.
// 4) Las activó otra cuenta que se fue sin «Salir»: al entrar se dan de baja y se borran de la base.
// 5) Sin «Mantener la sesión»: al cerrar la pestaña y volver a abrir GIZE se dan de baja en el
//    navegador y se borran de la base sin sesión (forget_push_subscription).
// 6) Cerrar sesión sin señal: se dan de baja igual en el navegador y, apenas hay señal, se borran
//    de la base.
// 7) La función de la base que borra sin sesión pide la dirección y su clave.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB_KEY = 'sb-wegptuzhsrwppbknqstf-auth-token';
const STATE = { days: [{ id: 'd1', name: 'Día 1', exercises: [] }], sessions: [], weights: [], daily: {} };
const EP = 'https://fcm.googleapis.com/fcm/send/TEST-A';
// Navegador con permiso dado y un service worker de mentira. La suscripción vive en sessionStorage
// (sobrevive a recargar la pestaña); en «push» queda lo que se le pidió.
const WEBPUSH = (prev) => `(() => {
  const log = x => sessionStorage.setItem('push', (sessionStorage.getItem('push') || '') + x + ',');
  if (!sessionStorage.getItem('pushInit')) { sessionStorage.setItem('pushInit', '1'); ${prev || ''} }
  Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  const sub = () => { const e = sessionStorage.getItem('sub'); return e ? { endpoint: e, toJSON: () => ({ endpoint: e, keys: { p256dh: 'P', auth: 'CLAVE' } }),
    unsubscribe: async () => { log('unsubscribe'); sessionStorage.removeItem('sub'); return true; } } : null; };
  const reg = { pushManager: { getSubscription: async () => sub(), subscribe: async () => { log('subscribe'); sessionStorage.setItem('sub', '${EP}'); return sub(); } } };
  Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, get: () => Promise.resolve(reg) });
  navigator.serviceWorker.getRegistration = async () => reg;
  navigator.serviceWorker.register = async () => reg;
})()`;
const pushLog = p => p.evaluate(() => (sessionStorage.getItem('push') || '').split(',').filter(Boolean));

function mock(extra){
  const rpcs = [];
  const log = n => (r, J, i) => (rpcs.push(n + ' ' + (i.body || '')), J(null));
  const handlers = Object.assign({ '/profiles': profile('client'),
    '/rpc/save_push_subscription': log('save'), '/rpc/delete_push_subscription': log('delete'), '/rpc/forget_push_subscription': log('forget') }, extra || {});
  return { rpcs, handlers, has: n => rpcs.some(x => x.startsWith(n + ' ')) };
}

export default async function ({ base, t }){
  // 1) Permiso dado, sin activarlas en este navegador.
  {
    const m = mock();
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: WEBPUSH(), handlers: m.handlers });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(!m.has('save'), '1: entrar no registra la cuenta para notificaciones: ' + m.rpcs.join(' | '));
    t.ok(!(await pushLog(p)).includes('subscribe'), '1: ni crea una suscripción en el navegador');
    await p.click('#nav-config'); await wait(500);
    t.ok(!(await p.evaluate(() => [...document.querySelectorAll('[data-action="cfg-notif-toggle"]')].some(e => e.classList.contains('on')))), '1: el interruptor aparece apagado');
    // 2) Las activa: se guardan, y al volver a entrar se vuelven a guardar.
    await p.click('[data-action="cfg-notif-toggle"]'); await wait(1000);
    t.ok(m.rpcs.some(x => x.startsWith('save ') && x.includes(EP)), '2: activarlas guarda este navegador: ' + m.rpcs.join(' | '));
    t.eq(await p.evaluate(() => localStorage.getItem('gize_web_push')), ALUMNO.id, '2: queda anotada la cuenta que las activó');
    m.rpcs.length = 0;
    await p.reload(); await wait(3500);
    t.ok(m.has('save'), '2: al volver a entrar se vuelven a guardar');
    t.eq(errs, [], '1-2: errores de la página');
    await close();
  }

  // 3) Suscripción de una versión anterior (sin la cuenta anotada).
  for (const nuestra of [true, false]) {
    const m = mock({ '/push_subscriptions': (r, J, i) => i.m === 'GET' ? J(nuestra ? (i.one ? { id: 'x' } : [{ id: 'x' }]) : (i.one ? null : [])) : undefined });
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: WEBPUSH(`sessionStorage.setItem('sub', '${EP}');`), handlers: m.handlers });
    await p.goto(base + '/app/'); await wait(3500);
    if (nuestra) {
      t.ok(m.has('save'), '3: la base dice que es de esta cuenta: se sigue guardando');
      t.eq(await p.evaluate(() => localStorage.getItem('gize_web_push')), ALUMNO.id, '3: y queda anotada');
    } else {
      t.ok(!m.has('save'), '3: la base no la tiene a nombre de esta cuenta: no se registra sola');
      t.ok((await pushLog(p)).includes('unsubscribe'), '3: y se da de baja en el navegador (puede ser de otra cuenta)');
      t.ok(m.rpcs.some(x => x.startsWith('forget ') && x.includes(EP) && x.includes('CLAVE')), '3: y se borra de la base con su clave: ' + m.rpcs.join(' | '));
    }
    t.eq(errs, [], '3: errores de la página');
    await close();
  }

  // 4) Las activó otra cuenta en este navegador y se fue sin «Salir».
  {
    const m = mock();
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers,
      init: WEBPUSH(`sessionStorage.setItem('sub', '${EP}'); localStorage.setItem('gize_web_push', '33333333-3333-3333-3333-333333333333');`) });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok((await pushLog(p)).includes('unsubscribe'), '4: se dan de baja en el navegador');
    t.ok(!m.has('save'), '4: no quedan a nombre de la cuenta que entró');
    t.ok(m.rpcs.some(x => x.startsWith('forget ') && x.includes(EP) && x.includes('CLAVE')), '4: se borran de la base: ' + m.rpcs.join(' | '));
    t.eq(errs, [], '4: errores de la página');
    await close();
  }

  // 5) Sin «Mantener la sesión», con las notificaciones activadas: se cierra la pestaña y se vuelve a abrir.
  {
    const m = mock();
    const EFIMERA = `const k = '${SB_KEY}', v = localStorage.getItem(k); if (v) { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
      localStorage.setItem('gize_remember', '0'); sessionStorage.setItem('sub', '${EP}'); localStorage.setItem('gize_web_push', '${ALUMNO.id}');`;
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: WEBPUSH(EFIMERA), handlers: m.handlers });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(m.has('save'), '5: adentro, las notificaciones andan');
    m.rpcs.length = 0;
    await p.evaluate(k => sessionStorage.removeItem(k), SB_KEY); await p.reload(); await wait(5000);
    t.ok((await pushLog(p)).includes('unsubscribe'), '5: al volver a abrir sin sesión se dan de baja en el navegador');
    t.ok(m.rpcs.some(x => x.startsWith('forget ') && x.includes(EP) && x.includes('CLAVE')), '5: y se borran de la base sin sesión: ' + m.rpcs.join(' | '));
    t.eq(await p.evaluate(() => localStorage.getItem('gize_push_forget')), null, '5: no queda nada pendiente');
    t.eq(errs, [], '5: errores de la página');
    await close();
  }

  // 6) Cerrar sesión sin señal: lo de la base no sale.
  {
    const m = mock({ '/rpc/delete_push_subscription': r => r.abort('internetdisconnected'), '/auth/v1/logout': r => r.abort('internetdisconnected') });
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: m.handlers,
      init: WEBPUSH(`sessionStorage.setItem('sub', '${EP}'); localStorage.setItem('gize_web_push', '${ALUMNO.id}');`) });
    await p.goto(base + '/app/'); await wait(3500);
    m.rpcs.length = 0;
    await p.click('#nav-config'); await wait(500);
    await p.click('[data-auth="logout"]');
    await p.waitForEvent('load', { timeout: 30000 }).catch(() => {});
    await wait(3500);
    t.ok((await pushLog(p)).includes('unsubscribe'), '6: se dan de baja en el navegador aunque no haya señal');
    t.ok(m.rpcs.some(x => x.startsWith('forget ') && x.includes(EP) && x.includes('CLAVE')), '6: al volver a abrir (con señal) se borran de la base: ' + m.rpcs.join(' | '));
    t.eq(await p.evaluate(() => localStorage.getItem('gize_web_push')), null, '6: no queda anotada la cuenta');
    t.ok(await p.isVisible('#auEmail'), '6: pide ingresar');
    t.eq(errs, [], '6: errores de la página');
    await close();
  }

  // 7) La función de la base.
  {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/notificaciones.sql'), 'utf8');
    const fn = (sql.match(/create or replace function public\.forget_push_subscription\(p_endpoint text, p_auth text\)[\s\S]*?\$\$;/) || [''])[0];
    t.ok(!!fn, '7: notificaciones.sql define forget_push_subscription');
    t.ok(/security definer/.test(fn) && /set search_path = public/.test(fn), '7: security definer con search_path fijo');
    t.ok(/delete from public\.push_subscriptions\s+where endpoint = p_endpoint and auth = p_auth and coalesce\(p_auth, ''\) <> ''/.test(fn), '7: borra solo con la dirección y su clave');
    t.ok(/revoke all on function public\.forget_push_subscription\(text, text\) from public;\s*grant execute on function public\.forget_push_subscription\(text, text\) to anon, authenticated;/.test(sql), '7: se puede llamar sin sesión');
  }
}
