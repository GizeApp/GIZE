// Gimnasios, etapa 1 (parte 4): el chat dentro de un gimnasio, en la app (SPEC §3.1, §6.4; app/ui/chat.js
// sin cambio de flujo, rapid-worker con coach_client_ok: tests/chat-tope.test.mjs).
// - La profe abre el chat con su socia desde la ficha («Chat con Martina») y le escribe: va a rapid-worker
//   con el id de la socia, como con cualquier alumno.
// - La socia abre el chat con su profe (el botón de chat de la app) y le escribe igual.
// - Con el acceso de los profes pausado, rapid-worker contesta 402 con el texto del gimnasio y el mensaje
//   queda marcado con ese texto (sin nombrar planes ni pagos), igual en la web y en Android.
// - La ficha en modo lectura del dueño no tiene chat.
import { wait } from './lib.mjs';
import { entrarProfe, entrarSocio, entrar, DUENA, ALUMNO, S, F, M, D, ANDROID, hostTxt } from './gym-comun.mjs';

const PAUSA_PROFE = 'El acceso del gimnasio está pausado. Hablá con la administración.';
const PAUSA_SOCIO = 'El acceso de GIZE de tu gimnasio está pausado: por ahora no le llegan mensajes a tu profe.';
const burbujas = p => p.evaluate(() => [...document.querySelectorAll('#chatHost .ch-msg.me')].map(e => {
  const x = e.querySelector('.ch-txt'), f = e.querySelector('.ch-fail');
  return (x ? x.innerText : '') + (f ? ' | ' + f.innerText : '');
}));
// La función de mensajes: anota lo que llega y contesta según pausa.
const funcion = (llamadas, pausa) => ({ '/functions/v1/rapid-worker': (r, J, i) => { const b = JSON.parse(i.body || '{}'); llamadas.push(b);
  if (pausa()) return J({ error: pausa() === 'socio' ? PAUSA_SOCIO : PAUSA_PROFE }, 402);
  return J({ delivered: 1, devices: 1, saved: true, id: 'm' + llamadas.length, created_at: new Date().toISOString() }); } });

export default async function ({ base, t }){
  // ===== La profe, desde la ficha de su socia =====
  for (const [plat, init, vp] of [['web', '', D], ['Android', ANDROID, M]]){
    const llamadas = []; let pausa = '';
    const pg = await entrarProfe(base, { vp, init, touch: vp === M, handlers: funcion(llamadas, () => pausa) });
    const p = pg.p;
    await p.click('[data-coach="view-clients"]'); await wait(500);
    await p.evaluate(id => document.querySelector('#coachHost [data-coach="open"][data-id="' + id + '"]').click(), S.A1); await wait(1200);
    t.has(await hostTxt(p), 'Chat con Martina', plat + ': la ficha de la socia tiene su chat');
    await p.click('[data-coach="sec-open"][data-v="chat"]'); await wait(700);
    t.ok(!!await p.$('#chatHost #chatText'), plat + ': se abre el chat');
    await p.fill('#chatText', 'Hola Martina, ¿cómo te fue hoy?'); await p.click('[data-chat="send"]'); await wait(700);
    t.eq(llamadas.map(b => [b.client_id, b.body]), [[S.A1, 'Hola Martina, ¿cómo te fue hoy?']], plat + ': el mensaje va a rapid-worker con el id de la socia');
    t.eq(await burbujas(p), ['Hola Martina, ¿cómo te fue hoy?'], plat + ': se ve enviado');
    pausa = 'profe';
    await p.fill('#chatText', '¿Venís mañana?'); await p.click('[data-chat="send"]'); await wait(700);
    const b = await burbujas(p);
    t.eq(b[1], '¿Venís mañana? | ' + PAUSA_PROFE, plat + ': con el acceso pausado, el mensaje queda marcado con el texto del gimnasio: ' + JSON.stringify(b));
    t.ok(!/plan|pag|renov|\$/i.test(b.join(' ')), plat + ': sin nombrar planes ni pagos');
    t.eq(pg.errs, [], plat + ' (profe): sin errores');
    await pg.close();
  }

  // ===== La socia, desde su app =====
  for (const [plat, init] of [['web', ''], ['Android', ANDROID]]){
    const llamadas = []; let pausa = '';
    const pg = await entrarSocio(base, { vp: M, init, touch: true, handlers: Object.assign({}, funcion(llamadas, () => pausa)) });
    const p = pg.p;
    t.ok(await p.isVisible('#chatBtn'), plat + ': la socia con profe tiene el botón de chat');
    await p.click('#chatBtn'); await wait(800);
    await p.fill('#chatText', 'Hola profe'); await p.click('[data-chat="send"]'); await wait(700);
    t.eq(llamadas.map(b => b.client_id), [ALUMNO.id], plat + ': la socia escribe con su propio id (como cualquier alumno)');
    pausa = 'socio';
    await p.fill('#chatText', '¿Estás?'); await p.click('[data-chat="send"]'); await wait(700);
    const b = await burbujas(p);
    t.eq(b[b.length - 1], '¿Estás? | ' + PAUSA_SOCIO, plat + ': con el acceso pausado, el texto del gimnasio: ' + JSON.stringify(b));
    t.ok(!/plan|pag|renov|\$/i.test(b.join(' ')), plat + ': sin nombrar planes ni pagos');
    t.eq(pg.errs, [], plat + ' (socia): sin errores');
    await pg.close();
  }

  // ===== La dueña mira la ficha en modo lectura: sin chat =====
  {
    const pg = await entrar(base, DUENA, { vp: D });
    const p = pg.p;
    await p.evaluate(() => document.querySelector('#coachHost [data-gym="ir"][data-v="socios"]').click()); await wait(700);
    await p.evaluate(id => document.querySelector('#coachHost .gy-row[data-id="' + id + '"]').click(), F.A1); await wait(700);
    await p.evaluate(() => document.querySelector('#coachHost [data-gym="entreno"][data-m="lectura"]').click()); await wait(1200);
    const h = await hostTxt(p);
    t.ok(/Solo lectura/.test(h) && !/Chat con/.test(h) && !await p.$('[data-coach="sec-open"][data-v="chat"]'), 'la ficha en modo lectura de la dueña no tiene chat');
    t.ok(!/Dejar de ser su profe|Gimnasio Activo/.test(h), 'ni la tarjeta del profe ni «Dejar de ser su profe»');
    await pg.close();
  }
}
