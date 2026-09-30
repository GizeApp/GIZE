// «Guardar entreno de hoy» / «Finalizar»: tocarlo sin querer terminaba el entreno y cortaba
// el tiempo sin forma de volver. Ahora pide confirmación, y desde «¡Entreno terminado!» se
// puede seguir entrenando (se saca el entreno guardado y vuelve el tiempo como estaba).
import { newPage, saved, wait, ALUMNO, profile, openAllEx } from './lib.mjs';

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Remo con barra', sets: [{ id: 's1', kg: '60', reps: '8', done: true }, { id: 's2', kg: '', reps: '' }] }] }];
  const t0 = Date.now() - 25 * 60000; // entrenando hace 25 min
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') },
    init: `(() => { const k = 'rutina_jero_v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); const d = new Date(); const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); s.wkStart = { date: ymd, day: 'd1', ts: ${t0}, manual: true }; localStorage.setItem(k, JSON.stringify(s)); })()` });
  await p.goto(base + '/app/'); await wait(2500);
  t.ok(await p.$('#wkTime'), 'al abrir: se ve «Entrenando hace…»');

  // 1) Cancelar la confirmación: no se guarda nada y el tiempo sigue.
  p.removeAllListeners('dialog');
  const msgs = [];
  p.on('dialog', d => { msgs.push(d.message()); d.dismiss().catch(() => {}); });
  await p.click('[data-action="save-session"]'); await wait(600);
  t.ok(msgs.length === 1 && /Terminar y guardar/.test(msgs[0]), 'pide confirmación antes de guardar: ' + msgs[0]);
  let st = await saved(p);
  t.eq(st.sessions.length, 0, 'cancelando no se guarda el entreno');
  t.ok(st.wkStart && st.wkStart.ts === t0, 'cancelando el tiempo del entreno sigue igual');
  t.ok(await p.$('#wkTime'), 'cancelando sigue «Entrenando hace…»');

  // 2) Aceptar: se guarda y aparece «¡Entreno terminado!» con la opción de seguir.
  p.removeAllListeners('dialog');
  p.on('dialog', d => d.accept().catch(() => {}));
  await wait(1600); // el guardado ignora toques repetidos en 1,5 s
  await p.click('[data-action="save-session"]'); await wait(800);
  st = await saved(p);
  t.eq(st.sessions.length, 1, 'aceptando se guarda el entreno');
  t.ok(!st.wkStart, 'aceptando se detiene el tiempo');
  t.ok(await p.$('#fbHost [data-action="fb-undo"]'), '«¡Entreno terminado!» tiene «seguir entrenando»');

  // 3) Seguir entrenando: se saca el entreno guardado y vuelve el tiempo como estaba.
  await p.click('#fbHost [data-action="fb-undo"]'); await wait(500);
  st = await saved(p);
  t.eq(st.sessions.length, 0, 'seguir entrenando: el entreno guardado se saca del historial');
  t.ok(st.wkStart && st.wkStart.ts === t0, 'seguir entrenando: vuelve el tiempo desde el inicio de antes');
  t.ok(await p.$('#wkTime') && !(await p.$('#fbHost .fb-card')), 'seguir entrenando: se cierra la ventana y se ve «Entrenando hace…»');
  await openAllEx(p);
  t.eq(await p.$eval('[data-action="toggle"][data-set="s1"]', b => b.classList.contains('on')), true, 'seguir entrenando: las series cargadas siguen');
  t.eq(errs, [], 'errores de la página');
  await close();
}
