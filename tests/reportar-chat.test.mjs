// «Reportar» en el chat coach ↔ alumno (app/ui/chat.js y app/ui/reportar.js): lo piden Apple
// (guía 1.2) y Google Play para las apps donde la gente intercambia contenido.
// - Un mensaje recibido (texto o audio) tiene el «⋯» de reportar; uno propio no.
// - El «⋯» abre «Reportar mensaje» con lo que se reporta a la vista, los tres motivos y una nota
//   opcional; «Enviar» recién se habilita al elegir un motivo.
// - Manda report_content con el tipo, el id del mensaje, la otra persona, el motivo y la nota.
// - Sin conexión dice «No se pudo enviar, probá de nuevo» y deja lo elegido para reintentar; un
//   error escrito por la base (el tope del día) se muestra tal cual; al salir, «Gracias, lo vamos a
//   revisar.». Escape (o «Listo») cierra la hoja y el chat sigue abierto.
// - Del lado del coach, lo recibido es lo del alumno, y la persona reportada es el alumno.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const COACH = '33333333-3333-3333-3333-333333333333';
const hace = min => new Date(Date.now() - min * 60000).toISOString();
const M_COACH = '5a5a5a5a-0000-4000-8000-000000000001', M_MIO = '5a5a5a5a-0000-4000-8000-000000000002', M_AUDIO = '5a5a5a5a-0000-4000-8000-000000000003';
const fila = (id, sender, body, min, audio) => ({ id, coach_id: COACH, client_id: ALUMNO.id, sender, body, audio_path: audio ? COACH + '/' + ALUMNO.id + '/audio12345678.webm' : null,
  audio_secs: audio ? 12 : null, created_at: hace(min), read_at: hace(0), delivered: 1 });
const DB = [fila(M_COACH, 'coach', 'Sos un desastre, no servís para nada', 30), fila(M_MIO, 'client', 'Hola, ¿cómo va?', 20), fila(M_AUDIO, 'coach', '', 10, true)];
const TOPE = 'Mandaste muchos reportes hoy. Probá de nuevo mañana.';

export default async function ({ base, t }){
  const envios = [];
  let modo = 'ok';
  const { p, errs, close } = await newPage({ user: ALUMNO,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client', { coach_id: COACH }),
      '/coach_messages': (r, J, i) => i.m === 'GET' ? J(DB.slice().reverse()) : undefined,
      '/rpc/report_content': (r, J, i) => {
        envios.push(JSON.parse(i.body));
        if (modo === 'sin señal') return r.abort('internetdisconnected');
        if (modo === 'tope') return J({ code: 'P0001', message: TOPE, details: null, hint: null }, 400);
        return J({ ok: true });
      } } });
  await p.goto(base + '/app/'); await wait(2500);
  // Sin Realtime (como en chat-doble): nada sale a internet.
  await p.evaluate(async () => {
    const { State } = await import('/app/core/state.js');
    State.sb.channel = () => { const ch = { state: 'joined', on: () => ch, subscribe: () => ch }; return ch; };
    State.sb.removeChannel = () => {};
  });
  const abrir = (o) => p.evaluate(o => import('/app/ui/chat.js').then(c => c.openChat(o)), o);
  await abrir({ clientId: ALUMNO.id, coachId: COACH, name: 'Coach Prueba', role: 'client' });
  await wait(600);

  // 1) El «⋯» solo en lo recibido.
  const burbujas = await p.$$eval('#chatHost .ch-msg', l => l.map(e => ({ me: e.classList.contains('me'), mas: !!e.querySelector('[data-chat="report"]') })));
  t.eq(burbujas, [{ me: false, mas: true }, { me: true, mas: false }, { me: false, mas: true }], 'el «⋯» está en los mensajes recibidos (texto y audio) y no en el propio');
  t.eq(await p.getAttribute('#chatHost .ch-msg.them [data-chat="report"]', 'aria-label'), 'Reportar mensaje', 'el «⋯» se lee como «Reportar mensaje»');

  // 2) La hoja: qué se reporta, los motivos y «Enviar» deshabilitado hasta elegir uno.
  await p.click(`#chatHost [data-chat="report"][data-id="${M_COACH}"]`); await wait(400);
  t.ok(await p.isVisible('#reportHost .rep-sheet'), 'se abre la hoja «Reportar»');
  t.eq(await text(p, '#reportHost .sheet-title'), 'Reportar mensaje', 'título de la hoja');
  t.has(await text(p, '#reportHost .rep-cita'), 'Sos un desastre', 'se ve el mensaje que se reporta');
  t.eq(await p.$$eval('#reportHost .rep-opt', l => l.map(e => e.innerText.trim())), ['Contenido ofensivo o acoso', 'Spam', 'Otro'], 'los tres motivos');
  t.ok(await p.isDisabled('#reportHost [data-rep="send"]'), '«Enviar» deshabilitado sin motivo');
  t.ok(await p.isVisible('#chatHost .ch-ov'), 'el chat sigue abierto atrás');
  // La hoja queda encima del chat (se puede tocar).
  const arriba = await p.evaluate(() => { const b = document.querySelector('#reportHost .rep-opt').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!(e && e.closest('#reportHost')); });
  t.ok(arriba, 'la hoja está encima del chat');

  // 3) Sin conexión: el aviso, y lo elegido queda para reintentar.
  await p.click('#reportHost [data-rep="motivo"][data-v="ofensivo"]');
  t.ok(!(await p.isDisabled('#reportHost [data-rep="send"]')), 'con un motivo, «Enviar» se habilita');
  await p.fill('#repNota', '  Me insultó  ');
  modo = 'sin señal';
  await p.click('#reportHost [data-rep="send"]'); await wait(700);
  t.has(await text(p, '#reportHost .rep-err'), 'No se pudo enviar, probá de nuevo.', 'sin conexión: «No se pudo enviar, probá de nuevo»');
  t.ok(await p.isVisible('#reportHost .rep-sheet'), 'sin conexión: la hoja sigue abierta');
  t.eq(await p.inputValue('#repNota'), '  Me insultó  ', 'sin conexión: la nota queda');
  t.eq(await p.getAttribute('#reportHost .rep-opt.on', 'data-v'), 'ofensivo', 'sin conexión: el motivo queda elegido');
  t.eq(await text(p, '#reportHost [data-rep="send"]'), 'Enviar', 'sin conexión: se puede volver a mandar');

  // 4) Con conexión: lo que se manda y el «Gracias».
  modo = 'ok';
  await p.click('#reportHost [data-rep="send"]'); await wait(700);
  t.eq(envios[envios.length - 1], { p_kind: 'chat', p_ref: M_COACH, p_reported: COACH, p_reason: 'ofensivo', p_detail: 'Me insultó' },
    'report_content: tipo, id del mensaje, el coach, el motivo y la nota');
  t.has(await text(p, '#reportHost .rep-sheet'), 'Gracias, lo vamos a revisar.', 'al salir: «Gracias, lo vamos a revisar.»');
  t.ok(!(await p.$('#reportHost .rep-err')), 'al salir: sin el aviso de error');
  await p.click('#reportHost .rep-sheet [data-rep="cancel"]'); await wait(400);
  t.ok(!(await p.$('#reportHost .rep-sheet')), '«Listo» cierra la hoja');
  t.ok(await p.isVisible('#chatHost .ch-ov'), 'y el chat sigue abierto');

  // 5) Un audio: se reporta sin nota; el error escrito por la base se muestra tal cual.
  await p.click(`#chatHost [data-chat="report"][data-id="${M_AUDIO}"]`); await wait(400);
  t.has(await text(p, '#reportHost .rep-cita'), 'Mensaje de voz (0:12)', 'audio: se dice que es un mensaje de voz y cuánto dura');
  await p.click('#reportHost [data-rep="motivo"][data-v="spam"]');
  modo = 'tope';
  await p.click('#reportHost [data-rep="send"]'); await wait(700);
  t.eq(envios[envios.length - 1], { p_kind: 'chat', p_ref: M_AUDIO, p_reported: COACH, p_reason: 'spam', p_detail: null }, 'audio: sin nota manda null');
  t.has(await text(p, '#reportHost .rep-err'), TOPE, 'el tope del día: se muestra lo que dice la base');
  // Escape cierra la hoja, no el chat.
  await p.keyboard.press('Escape'); await wait(400);
  t.ok(!(await p.$('#reportHost .rep-sheet')), 'Escape cierra la hoja');
  t.ok(await p.isVisible('#chatHost .ch-ov'), 'Escape no cierra el chat de atrás');
  // Cerrar el chat con la hoja abierta la cierra también.
  await p.click(`#chatHost [data-chat="report"][data-id="${M_COACH}"]`); await wait(300);
  await p.evaluate(() => import('/app/ui/chat.js').then(c => c.closeChat()));
  await wait(400);
  t.ok(!(await p.$('#reportHost .rep-sheet')), 'al cerrar el chat se cierra la hoja');

  // 6) Del lado del coach: lo recibido es lo del alumno, y se reporta al alumno.
  modo = 'ok';
  await abrir({ clientId: ALUMNO.id, coachId: COACH, name: 'Ana', role: 'coach' });
  await wait(600);
  const coach = await p.$$eval('#chatHost .ch-msg', l => l.map(e => ({ me: e.classList.contains('me'), mas: !!e.querySelector('[data-chat="report"]') })));
  t.eq(coach, [{ me: true, mas: false }, { me: false, mas: true }, { me: true, mas: false }], 'coach: el «⋯» solo en lo que mandó el alumno');
  await p.click(`#chatHost [data-chat="report"][data-id="${M_MIO}"]`); await wait(400);
  await p.click('#reportHost [data-rep="motivo"][data-v="otro"]');
  await p.click('#reportHost [data-rep="send"]'); await wait(700);
  t.eq(envios[envios.length - 1], { p_kind: 'chat', p_ref: M_MIO, p_reported: ALUMNO.id, p_reason: 'otro', p_detail: null }, 'coach: se reporta al alumno');
  t.has(await text(p, '#reportHost .rep-sheet'), 'Gracias, lo vamos a revisar.', 'coach: «Gracias, lo vamos a revisar.»');
  t.eq(errs, [], 'errores de la página');
  await close();
}
