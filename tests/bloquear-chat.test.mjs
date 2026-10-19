// «Bloquear» en el chat coach ↔ alumno (app/ui/chat.js y app/ui/bloquear.js): lo pide Apple (guía
// 1.2), además de reportar.
// - El «⋯» de un mensaje recibido abre un menú con «Reportar mensaje» y «Bloquear a …» (con el
//   nombre de la otra persona); los mensajes propios no tienen «⋯».
// - «Bloquear a …» pide confirmar y explica en criollo qué pasa: al alumno, «Se corta el vínculo: no
//   van a poder mandarse mensajes y no te va a poder volver a sumar. Tus rutinas y registros
//   quedan.»; al coach, lo mismo desde su lado. «Cancelar» y Escape no mandan nada ni cierran el chat.
// - Sin conexión: «No se pudo, probá de nuevo.» y se puede reintentar; un error escrito por la base
//   (el tope del día) se muestra tal cual.
// - Manda block_user con el tipo, el id del mensaje y la otra persona. Al salir, «Bloqueaste a …»;
//   el alumno queda sin coach (se vuelve a leer la cuenta y se va el botón del chat) y el coach deja
//   de ver al alumno en su lista. «Listo» cierra la hoja y el chat.
import { newPage, wait, text, ALUMNO } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const hace = min => new Date(Date.now() - min * 60000).toISOString();
const M_COACH = '5a5a5a5a-0000-4000-8000-000000000001', M_MIO = '5a5a5a5a-0000-4000-8000-000000000002';
const fila = (id, sender, body, min) => ({ id, coach_id: COACH.id, client_id: ALUMNO.id, sender, body, audio_path: null, audio_secs: null,
  created_at: hace(min), read_at: hace(0), delivered: 1 });
const DB = [fila(M_COACH, 'coach', 'Sos un desastre', 30), fila(M_MIO, 'client', 'Hola, ¿cómo va?', 20)];
const TOPE = 'Bloqueaste a muchas personas hoy. Probá de nuevo mañana.';
const TXT_ALUMNO = 'Se corta el vínculo: no van a poder mandarse mensajes y no te va a poder volver a sumar. Tus rutinas y registros quedan.';
const TXT_COACH = 'Se corta el vínculo: no van a poder mandarse mensajes y no se va a poder volver a sumar con tu código. Sus rutinas y registros quedan.';
const sinRealtime = p => p.evaluate(async () => {
  const { State } = await import('/app/core/state.js');
  State.sb.channel = () => { const ch = { state: 'joined', on: () => ch, subscribe: () => ch }; return ch; };
  State.sb.removeChannel = () => {};
});
const opciones = p => p.$$eval('#blockHost .blq-opt', l => l.map(e => e.innerText.trim()));

export default async function ({ base, t }){
  // ===== El alumno bloquea a su coach =====
  {
    const envios = [];
    let modo = 'ok', bloqueado = false;
    const { p, errs, close } = await newPage({ user: ALUMNO,
      state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba Alumno', coach_id: bloqueado ? null : COACH.id }; return J(i.one ? me : [me]); },
        '/rpc/my_coach_name': (r, J) => J(bloqueado ? null : 'Coach Prueba'),
        '/coach_messages': (r, J, i) => i.m === 'GET' ? J(DB.slice().reverse()) : undefined,
        '/rpc/block_user': (r, J, i) => {
          envios.push(JSON.parse(i.body));
          if (modo === 'sin señal') return r.abort('internetdisconnected');
          if (modo === 'tope') return J({ code: 'P0001', message: TOPE, details: null, hint: null }, 400);
          bloqueado = true;
          return J({ ok: true, desvinculado: true });
        } } });
    await p.goto(base + '/app/'); await wait(2500);
    await sinRealtime(p);
    t.ok(await p.isVisible('#chatBtn'), 'alumno con coach: está el botón del chat');
    await p.click('#chatBtn'); await wait(700);

    // 1) El «⋯» solo en lo recibido, y su menú.
    const burbujas = await p.$$eval('#chatHost .ch-msg', l => l.map(e => ({ me: e.classList.contains('me'), mas: !!e.querySelector('[data-chat="more"]') })));
    t.eq(burbujas, [{ me: false, mas: true }, { me: true, mas: false }], 'el «⋯» en el mensaje recibido y no en el propio');
    await p.click(`#chatHost [data-chat="more"][data-id="${M_COACH}"]`); await wait(400);
    t.ok(await p.isVisible('#blockHost .blq-sheet'), 'el «⋯» abre el menú');
    t.eq(await text(p, '#blockHost .sheet-title'), 'Mensaje de Coach Prueba', 'el menú dice de quién es el mensaje');
    t.has(await text(p, '#blockHost .rep-cita'), 'Sos un desastre', 'y cuál es');
    t.eq(await opciones(p), ['Reportar mensaje', 'Bloquear a Coach Prueba'], 'el menú: «Reportar mensaje» y «Bloquear a Coach Prueba»');
    const arriba = await p.evaluate(() => { const b = document.querySelector('#blockHost .blq-opt').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!(e && e.closest('#blockHost')); });
    t.ok(arriba, 'el menú está encima del chat');
    // Escape cierra el menú y el chat sigue abierto.
    await p.keyboard.press('Escape'); await wait(400);
    t.ok(!(await p.$('#blockHost .sheet')), 'Escape cierra el menú');
    t.ok(await p.isVisible('#chatHost .ch-ov'), 'Escape no cierra el chat');

    // 2) La confirmación, con lo que pasa.
    await p.click(`#chatHost [data-chat="more"][data-id="${M_COACH}"]`); await wait(400);
    await p.click('#blockHost [data-blq="bloquear"]'); await wait(300);
    t.eq(await text(p, '#blockHost .sheet-title'), '¿Bloquear a Coach Prueba?', 'confirmación: «¿Bloquear a Coach Prueba?»');
    t.eq(await text(p, '#blockHost .blq-que'), TXT_ALUMNO, 'confirmación: qué pasa (alumno)');
    t.has(await text(p, '#blockHost .blq-sheet'), 'Personas bloqueadas', 'dice dónde se desbloquea');
    t.eq(await p.$$eval('#blockHost .sheet-btns .ctrl', l => l.map(e => e.innerText.trim())), ['Cancelar', 'Bloquear'], 'botones «Cancelar» y «Bloquear»');
    await p.click('#blockHost .sheet-btns [data-blq="cancel"]'); await wait(400);
    t.ok(!(await p.$('#blockHost .sheet')) && envios.length === 0, '«Cancelar» cierra sin mandar nada');
    t.ok(await p.isVisible('#chatHost .ch-ov'), '«Cancelar» no cierra el chat');

    // 3) Sin conexión y con el tope del día.
    await p.click(`#chatHost [data-chat="more"][data-id="${M_COACH}"]`); await wait(400);
    await p.click('#blockHost [data-blq="bloquear"]'); await wait(300);
    modo = 'sin señal';
    await p.click('#blockHost [data-blq="si"]'); await wait(700);
    t.eq(await text(p, '#blockHost .rep-err'), 'No se pudo, probá de nuevo.', 'sin conexión: «No se pudo, probá de nuevo.»');
    t.ok(await p.isVisible('#blockHost .blq-sheet') && !(await p.isDisabled('#blockHost [data-blq="si"]')), 'sin conexión: la hoja queda para reintentar');
    modo = 'tope';
    await p.click('#blockHost [data-blq="si"]'); await wait(700);
    t.eq(await text(p, '#blockHost .rep-err'), TOPE, 'el tope del día: lo que dice la base');

    // 4) Bloquear: lo que se manda, el «listo», la cuenta sin coach y el chat que se cierra.
    modo = 'ok';
    await p.click('#blockHost [data-blq="si"]'); await wait(1500);
    t.eq(envios[envios.length - 1], { p_kind: 'chat', p_ref: M_COACH, p_target: COACH.id }, 'block_user: tipo, mensaje y el coach');
    t.eq(envios.length, 3, 'un envío por toque');
    t.eq(await text(p, '#blockHost .sheet-title'), 'Bloqueaste a Coach Prueba', 'al salir: «Bloqueaste a Coach Prueba»');
    t.has(await text(p, '#blockHost .blq-sheet'), 'Ya no están vinculados.', 'al salir: ya no están vinculados');
    t.ok(!(await p.$('#blockHost .rep-err')), 'al salir: sin el aviso de error');
    t.ok(await p.evaluate(async () => { const { State } = await import('/app/core/state.js'); return !!State.cloudProfile && !State.cloudProfile.coach_id; }), 'se volvió a leer la cuenta: sin coach');
    t.ok(await p.$eval('#chatBtn', b => b.hidden), 'sin coach: se va el botón del chat');
    await p.click('#blockHost .sheet-btns [data-blq="cancel"]'); await wait(500);
    t.ok(!(await p.$('#blockHost .sheet')), '«Listo» cierra la hoja');
    t.ok(!(await p.$('#chatHost .ch-ov')), '«Listo» cierra también el chat');
    t.eq(errs, [], 'errores de la página (alumno)');
    await close();
  }

  // ===== El coach bloquea a un alumno =====
  {
    const A1 = '44444444-4444-4444-4444-444444444444', M_ANA = '5b5b5b5b-0000-4000-8000-000000000001';
    const msgs = [{ id: M_ANA, coach_id: COACH.id, client_id: A1, sender: 'client', body: 'Sos un chanta', audio_path: null, audio_secs: null, created_at: hace(30), read_at: hace(0), delivered: 1 },
      { id: '5b5b5b5b-0000-4000-8000-000000000002', coach_id: COACH.id, client_id: A1, sender: 'coach', body: '¿Todo bien?', audio_path: null, audio_secs: null, created_at: hace(20), read_at: hace(0), delivered: 1 }];
    const envios = [];
    let bloqueado = false;
    const { p, errs, close } = await newPage({ user: COACH,
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J(bloqueado ? [] : [{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/coach_messages': (r, J, i) => i.m === 'GET' ? J(msgs.slice().reverse()) : undefined,
        '/rpc/block_user': (r, J, i) => { envios.push(JSON.parse(i.body)); bloqueado = true; return J({ ok: true, desvinculado: true }); },
      } });
    await p.goto(base + '/app/'); await wait(3500);
    await sinRealtime(p);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    await p.click('[data-coach="sec-open"][data-v="chat"]'); await wait(800);
    const coach = await p.$$eval('#chatHost .ch-msg', l => l.map(e => ({ me: e.classList.contains('me'), mas: !!e.querySelector('[data-chat="more"]') })));
    t.eq(coach, [{ me: false, mas: true }, { me: true, mas: false }], 'coach: el «⋯» solo en lo que mandó el alumno');
    await p.click(`#chatHost [data-chat="more"][data-id="${M_ANA}"]`); await wait(400);
    t.eq(await opciones(p), ['Reportar mensaje', 'Bloquear a Ana Alumna'], 'coach: «Bloquear a Ana Alumna»');
    await p.click('#blockHost [data-blq="bloquear"]'); await wait(300);
    t.eq(await text(p, '#blockHost .blq-que'), TXT_COACH, 'confirmación: qué pasa (coach)');
    await p.click('#blockHost [data-blq="si"]'); await wait(1000);
    t.eq(envios, [{ p_kind: 'chat', p_ref: M_ANA, p_target: A1 }], 'coach: block_user con el mensaje y el alumno');
    t.eq(await text(p, '#blockHost .sheet-title'), 'Bloqueaste a Ana Alumna', 'coach: «Bloqueaste a Ana Alumna»');
    const st = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); return { ids: CoachState.coachClients.map(c => c.id), sel: CoachState.coachSel }; });
    t.eq(st, { ids: [], sel: null }, 'coach: el alumno sale de la lista y de la ficha abierta');
    await p.keyboard.press('Escape'); await wait(500);
    t.ok(!(await p.$('#blockHost .sheet')) && !(await p.$('#chatHost .ch-ov')), 'coach: al cerrar la hoja se cierra el chat');
    t.ok(!(await text(p, '#coachHost')).includes('Ana Alumna'), 'coach: Ana ya no está en el panel');
    t.eq(errs, [], 'errores de la página (coach)');
    await close();
  }
}
