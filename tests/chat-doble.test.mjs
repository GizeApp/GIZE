// Chat: el que manda ve su mensaje una sola vez. La función de mensajes guarda el mensaje
// ANTES de mandar los avisos (que pueden tardar segundos), así que Realtime le trae el mensaje
// guardado al chat abierto del que lo mandó antes de que la función conteste. Antes se agregaba
// aparte de la burbuja local («Enviando…») y se veían dos hasta la respuesta. Lo mismo con la
// recarga (cada 15 segundos sin Realtime, o al volver a la app).
// Un mensaje propio viejo con el mismo texto no se confunde con el que se está mandando.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const COACH = '33333333-3333-3333-3333-333333333333';
const hace = min => new Date(Date.now() - min * 60000).toISOString();
const fila = (id, body, min) => ({ id, coach_id: COACH, client_id: ALUMNO.id, sender: 'client', body, audio_path: null, audio_secs: null, created_at: hace(min), read_at: null, delivered: 0 });

export default async function ({ base, t }){
  const db = [fila('m-viejo', 'Hola', 30)];
  const fn = [];
  const { p, errs, close } = await newPage({ user: ALUMNO,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client', { coach_id: COACH }),
      '/coach_messages': (r, J, i) => i.m === 'GET' ? J(db.slice().reverse()) : undefined,
      // La función contesta recién cuando la prueba lo dice (los avisos tardan).
      '/functions/v1/rapid-worker': (r, J, i) => new Promise(ok => fn.push({ body: JSON.parse(i.body), reply: o => ok(J(o)) })) } });
  await p.goto(base + '/app/'); await wait(2500);

  // Realtime simulado: la prueba manda los cambios de la tabla cuando quiere.
  await p.evaluate(async () => {
    const { State } = await import('/app/core/state.js');
    State.sb.channel = () => { const ch = { state: 'joined', on: (ev, f, cb) => { window.__rt = cb; return ch; }, subscribe: () => ch }; return ch; };
    State.sb.removeChannel = () => {};
  });
  await p.evaluate(([cl, co]) => import('/app/ui/chat.js').then(c => c.openChat({ clientId: cl, coachId: co, name: 'Coach', role: 'client' })), [ALUMNO.id, COACH]);
  await wait(400);
  const burbujas = () => p.evaluate(() => [...document.querySelectorAll('#chatHost .ch-msg.me')].map(e => {
    const t = e.querySelector('.ch-txt'), m = e.querySelector('.ch-meta');
    return (t ? t.innerText : '') + ' | ' + (m && m.innerText.includes('Enviando') ? 'enviando' : 'enviado');
  }));
  const rt = (tipo, row) => p.evaluate(([tipo, row]) => window.__rt({ eventType: tipo, new: row }), [tipo, row]);
  t.eq(await burbujas(), ['Hola | enviado'], 'arranca con el mensaje viejo');

  // 1) Realtime trae el mensaje guardado antes de que la función conteste.
  await p.fill('#chatText', 'Hola'); await p.click('[data-chat="send"]'); await wait(300);
  t.eq(await burbujas(), ['Hola | enviado', 'Hola | enviando'], 'mandando: la burbuja local');
  const nuevo = fila('m-nuevo', 'Hola', 0);
  db.push(nuevo);
  await rt('INSERT', nuevo); await wait(200);
  t.eq(await burbujas(), ['Hola | enviado', 'Hola | enviado'], 'Realtime antes de la respuesta: una sola burbuja (la local pasa a guardada), y la vieja igual queda');
  t.eq(fn.length, 1, 'llamó a la función una vez');
  if (fn[0]) fn[0].reply({ delivered: 1, devices: 1, saved: true, id: 'm-nuevo', created_at: nuevo.created_at });
  await wait(300);
  t.eq(await burbujas(), ['Hola | enviado', 'Hola | enviado'], 'llega la respuesta: sigue una sola');
  await rt('UPDATE', Object.assign({}, nuevo, { delivered: 1 })); await wait(200);
  t.eq(await burbujas(), ['Hola | enviado', 'Hola | enviado'], 'el cambio de «delivered» no agrega otra');

  // 2) La recarga (al volver a la app) trae el guardado antes de que la función conteste.
  await p.fill('#chatText', 'Chau'); await p.click('[data-chat="send"]'); await wait(300);
  const chau = fila('m-chau', 'Chau', 0);
  db.push(chau);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await wait(500);
  t.eq(await burbujas(), ['Hola | enviado', 'Hola | enviado', 'Chau | enviado'], 'recarga antes de la respuesta: una sola burbuja');
  if (fn[1]) fn[1].reply({ delivered: 0, devices: 0, saved: true, id: 'm-chau', created_at: chau.created_at });
  await wait(300);
  t.eq(await burbujas(), ['Hola | enviado', 'Hola | enviado', 'Chau | enviado'], 'llega la respuesta: sigue una sola');

  // 3) Sin Realtime ni recarga, como siempre: la respuesta le pone el id a la local.
  await p.fill('#chatText', 'Otra'); await p.click('[data-chat="send"]'); await wait(300);
  if (fn[2]) fn[2].reply({ delivered: 1, devices: 1, saved: true, id: 'm-otra', created_at: hace(0) });
  await wait(300);
  const otra = fila('m-otra', 'Otra', 0);
  await rt('INSERT', otra); await wait(200);
  t.eq((await burbujas()).slice(3), ['Otra | enviado'], 'respuesta antes que Realtime: una sola');
  t.eq(errs, [], 'errores de la página');
  await close();
}
