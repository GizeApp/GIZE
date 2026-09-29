// Entreno → «La vez pasada» y el botón «Usar estos pesos»: tiene que salir también cuando el
// entreno guardado tiene el nombre viejo de un ejercicio que la app renombró ("Curl Bayesian",
// de la lista de ejercicios, pasa a "Curl en polea detrás del cuerpo" al abrir), otra mayúscula
// o un espacio de más, y cuando el peso quedó guardado como texto con coma ("62,5").
import { newPage, saved, wait, ALUMNO, profile, openAllEx } from './lib.mjs';

export default async function ({ base, t }){
  const E = (id, name, kgs) => ({ id, name, sets: kgs.map((k, i) => ({ id: id + 's' + i, kg: k, reps: '' })) });
  const days = [{ id: 'd1', name: 'Torso', exercises: [
    E('e1', 'Curl Bayesian', ['', '']),
    E('e2', 'Press inclinado con mancuernas', ['', '']),
    E('e3', 'Remo con barra', ['', '']),
    E('e4', 'Jalón al pecho', ['50', '50']),
    E('e5', 'Dominadas', ['', ''])] }];
  const ts = d => Date.parse(d + 'T12:00:00Z');
  const sessions = [
    { id: 'a', date: '2026-09-10', ts: ts('2026-09-10'), day: 'Torso', exercises: [
      { name: 'Dominadas', sets: [{ kg: 10, reps: 8 }] }] },
    { id: 'b', date: '2026-09-20', ts: ts('2026-09-20'), day: 'Torso', exercises: [
      { name: 'Curl Bayesian', sets: [{ kg: 12.5, reps: 10 }, { kg: 12.5, reps: 9 }] },
      { name: 'press inclinado con mancuernas ', sets: [{ kg: 26, reps: 8 }] },
      { name: 'Remo con barra', sets: [{ kg: '62,5', reps: 8 }] },
      { name: 'Jalón al pecho', sets: [{ kg: 50, reps: 10 }, { kg: 50, reps: 9 }] },
      { name: 'Dominadas', sets: [{ kg: 0, reps: 9 }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions, weights: [], daily: {} },
    handlers: { '/profiles': profile('client'), '/sessions': (r, J, i) => i.m === 'GET' ? J({ message: 'sin red' }, 500) : undefined } });
  await p.goto(base + '/app/'); await wait(2500); await openAllEx(p);

  const card = id => p.evaluate(id => {
    const c = document.querySelector('[data-ex-id="' + id + '"]'); if (!c) return null;
    const b = c.querySelector('.ls-use');
    return { name: c.querySelector('.ex-name').value, last: !!c.querySelector('.last-sess'), btn: b ? (b.hidden ? 'oculto' : 'visible') : 'no',
      kgs: [...c.querySelectorAll('input.kg')].map(i => i.value) };
  }, id);

  // Renombrado al abrir la app (ES_MAP): el entreno de la vez pasada sigue con el nombre viejo.
  const c1 = await card('e1');
  t.eq(c1 && c1.name, 'Curl en polea detrás del cuerpo', 'el ejercicio se renombra al abrir (si no, la prueba no prueba nada)');
  t.ok(c1 && c1.last, 'ejercicio renombrado: no aparece «La vez pasada» (el entreno guardado dice "Curl Bayesian")');
  t.eq(c1 && c1.btn, 'visible', 'ejercicio renombrado: botón «Usar estos pesos»');
  if (c1 && c1.btn === 'visible'){
    await p.click('[data-ex-id="e1"] [data-action="last-use"]'); await wait(300);
    t.eq((await card('e1')).kgs.map(Number), [12.5, 12.5], 'ejercicio renombrado: «Usar estos pesos» carga los kg de la vez pasada');
    const st = await saved(p);
    t.eq(st.days[0].exercises[0].sets.map(s => Number(s.kg)), [12.5, 12.5], 'ejercicio renombrado: los kg quedan guardados');
  }

  // Otra mayúscula y un espacio al final en el nombre guardado.
  const c2 = await card('e2');
  t.eq(c2 && c2.btn, 'visible', 'nombre con otra mayúscula o un espacio de más: botón «Usar estos pesos»');

  // Peso guardado como texto con coma.
  const c3 = await card('e3');
  t.eq(c3 && c3.btn, 'visible', 'peso de la vez pasada con coma ("62,5"): botón «Usar estos pesos»');
  if (c3 && c3.btn === 'visible'){
    await p.click('[data-ex-id="e3"] [data-action="last-use"]'); await wait(300);
    t.eq((await card('e3')).kgs.map(Number), [62.5, 62.5], 'peso con coma: carga 62,5 kg');
  }

  // A propósito: si ya están esos pesos el botón se oculta, y vuelve al cambiar un peso.
  const c4 = await card('e4');
  t.eq(c4 && c4.btn, 'oculto', 'con los mismos pesos de la vez pasada el botón se oculta (no cambiaría nada)');
  await p.fill('[data-ex-id="e4"] input.kg[data-set="e4s0"]', '45'); await wait(200);
  t.eq((await card('e4')).btn, 'visible', 'al cambiar un peso vuelve el botón');

  // La vez pasada sin peso: se muestra igual, sin botón (no hay pesos para copiar).
  const c5 = await card('e5');
  t.ok(c5 && c5.last && c5.btn === 'no', 'vez pasada sin peso: «La vez pasada» sin botón — llegó ' + JSON.stringify(c5));

  t.eq(errs, [], 'errores de la página');
  await close();

  // El mismo ejercicio dos veces en el día, escrito distinto («Jalón» y «Jalon»): cada uno va con
  // el suyo de la vez pasada, no los dos con el primero (el occ se cuenta con la misma clave).
  {
    const days2 = [{ id: 'd1', name: 'Espalda', exercises: [ E('j1', 'Jalón al pecho', ['', '']), E('j2', 'Remo con barra', ['']), E('j3', 'Jalon al pecho', ['', '']) ] }];
    const sessions2 = [{ id: 'c', date: '2026-09-20', ts: ts('2026-09-20'), day: 'Espalda', exercises: [
      { name: 'Jalón al pecho', sets: [{ kg: 50, reps: 10 }, { kg: 50, reps: 9 }] },
      { name: 'Remo con barra', sets: [{ kg: 60, reps: 8 }] },
      { name: 'Jalon al pecho', sets: [{ kg: 30, reps: 15 }, { kg: 30, reps: 14 }] }] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: days2, sessions: sessions2, weights: [], daily: {} },
      handlers: { '/profiles': profile('client'), '/sessions': (r, J, i) => i.m === 'GET' ? J({ message: 'sin red' }, 500) : undefined } });
    await p.goto(base + '/app/'); await wait(2500); await openAllEx(p);
    const ls = id => p.evaluate(id => { const c = document.querySelector('[data-ex-id="' + id + '"] .ls-sets'); return c ? c.innerText.replace(/\s+/g, ' ').trim() : ''; }, id);
    t.has(await ls('j1'), '50', 'repetido escrito distinto: el primero muestra lo suyo (50)');
    const l3 = await ls('j3');
    t.ok(l3.includes('30') && !l3.includes('50'), 'repetido escrito distinto: el segundo muestra lo suyo (30) y no lo del primero — llegó ' + JSON.stringify(l3));
    const b = await p.$('[data-ex-id="j3"] [data-action="last-use"]');
    if (b && !(await b.evaluate(x => x.hidden))) { await b.click(); await wait(300); }
    t.eq((await saved(p)).days[0].exercises[2].sets.map(s => Number(s.kg)), [30, 30], 'repetido escrito distinto: «Usar estos pesos» en el segundo carga 30');
    t.eq(errs, [], 'errores de la página (repetido)');
    await close();
  }
}
