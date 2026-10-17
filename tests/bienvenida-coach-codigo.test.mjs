// Bienvenida y el código del coach (app/screens/onboarding.js). Al vincularse, la bienvenida ya no
// se cierra: sigue con el camino del alumno con coach (los datos del cuerpo para su meta de
// Comida, sin la experiencia ni la rutina, que la arma el coach) y termina con «Completar». Si el
// plan de comidas del coach ya trae calorías, solo pregunta el peso (lo ven Progreso y el coach).
// Mientras vincula, «Vinculando…», la flecha y «Entreno por mi cuenta» quedan quietos y el
// «Atrás» de Android no saca de la app (la base pudo haberlo vinculado igual). Un código malo
// avisa ahí mismo y deja el código escrito. Quien ya entra vinculado no ve el paso del código.
import { newPage, wait, text, ALUMNO, onbPaso, onbSiguiente } from './lib.mjs';

const COACH_ID = '33333333-3333-3333-3333-333333333333';
const NATIVE = () => {
  window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } };
};
const PLAN = { client_id: ALUMNO.id, kcal: 2000, protein: 150, carbs: 200, fat: 60 };

// unido: arranca vinculado. kcal: el plan del coach trae calorías. join: la respuesta de join_coach.
async function pagina(base, { unido = false, kcal = false, join = () => true, native = false } = {}){
  const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
  const st = { unido, pesos: [] };
  const pg = await newPage({ user: NUEVO, init: native ? NATIVE : undefined, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: st.unido ? COACH_ID : null }; return J(i.one ? me : [me]); },
    '/rpc/join_coach': (r, J) => { const v = join(); return Promise.resolve(v).then(x => { if (x === true) st.unido = true; return x && x.error ? J(x.error, 400) : J(x); }); },
    '/rpc/my_coach_name': (r, J) => J(st.unido ? 'Coach Ana' : null),
    '/nutrition': (r, J, i) => i.m === 'GET' ? J(st.unido && kcal ? (i.one ? PLAN : [PLAN]) : (i.one ? null : [])) : undefined,
    '/body_weights': (r, J, i) => { if (i.m !== 'GET') st.pesos.push(JSON.parse(i.body)); return undefined; },
  } });
  if (native) await pg.p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), r => r.abort());
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('[data-onb="start"]'); await wait(300);
  return Object.assign(pg, { st });
}
const estado = p => p.evaluate(async () => { const { state, State } = await import('/app/core/state.js'); return { cp: state.calProfile, t: state.calTarget, brand: State.brandName, w: state.weights.length }; });

export default async function ({ base, t }){
  // a) Se vincula (plan sin calorías): 8 pasos, sin experiencia ni rutina.
  {
    const pg = await pagina(base, { native: true, join: () => new Promise(r => setTimeout(() => r(true), 1500)) }), p = pg.p;
    await p.click('[data-onb="dskip"]'); await wait(250);
    t.eq(await onbPaso(p), { n: '2/11', titulo: '¿Tenés un código de tu coach?' }, 'a: el código, contando el camino por su cuenta');
    await p.fill('#onbCode', 'ana123');
    await p.click('[data-onb="next"]'); await wait(300);
    const mientras = await p.evaluate(() => ({ txt: document.querySelector('#authHost .onb-main').textContent, sr: document.querySelector('#authHost .onb-sr').textContent,
      back: document.querySelector('#authHost .onb-back').disabled, solo: document.querySelector('#authHost [data-onb="solo"]').disabled }));
    t.eq(mientras, { txt: 'Vinculando…', sr: 'Vinculando…', back: true, solo: true }, 'a: mientras vincula, «Vinculando…» y nada más anda');
    await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(200);
    t.eq(await p.evaluate(() => window.__min), 0, 'a: el «Atrás» de Android no saca de la app mientras vincula');
    t.eq((await onbPaso(p)).titulo, '¿Tenés un código de tu coach?', 'a: ni vuelve atrás');
    await wait(2000);
    t.eq(await onbPaso(p), { n: '3/8', titulo: '¿Cuál es tu sexo?' }, 'a: vinculado, sigue con los datos del cuerpo (8 pasos)');
    t.eq(await text(p, '#authHost .onb-body .onb-text'), 'Lo usamos para calcular tus calorías.', 'a: sin hablar de rutinas');
    await p.click('[data-onb="sex"][data-v="f"]'); await onbSiguiente(p);
    await p.focus('#onbAnio'); await p.keyboard.press('ArrowDown'); await wait(600); await onbSiguiente(p);
    await p.click('#onbAltura .rd-item.on'); await wait(400); await onbSiguiente(p);
    t.has(await text(p, '#authHost .onb-body .onb-text'), 'tu coach lo ve', 'a: el peso lo ve el coach');
    await p.focus('#onbPeso'); await p.keyboard.press('ArrowUp'); await wait(600); await onbSiguiente(p);
    await p.click('[data-onb="goal"][data-v="musculo"]'); await onbSiguiente(p);
    t.eq(await onbPaso(p), { n: '8/8', titulo: 'Tu nivel de actividad' }, 'a: la actividad es el último paso');
    t.eq(await p.$eval('#authHost .onb-main', b => b.textContent), 'Completar', 'a: el último dice «Completar»');
    await p.click('[data-onb="act"][data-v="mod"]'); await onbSiguiente(p); await wait(1500);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'a: se cierra la bienvenida');
    const e = await estado(p);
    t.eq(e.brand, 'Coach Ana', 'a: con la marca de su coach');
    t.ok(await p.evaluate(() => document.getElementById('view').children.length > 0), 'a: la app quedó dibujada');
    t.ok(e.cp && e.cp.sex === 'f' && +e.cp.age > 18 && e.cp.height === '170' && e.cp.weight === '70.5' && e.cp.goal === 'ganar' && e.cp.bodyAsked && !e.cp.level, 'a: sus datos, sin experiencia: ' + JSON.stringify(e.cp));
    t.ok(e.t > 1000, 'a: con su meta de calorías: ' + e.t);
    t.ok(pg.st.pesos.some(b => b.kg === 70.5), 'a: y el peso de hoy');
    t.eq(pg.errs, [], 'a: errores de la página');
    await pg.close();
  }

  // a2) Se vincula y el plan del coach trae calorías: solo el peso (3 pasos).
  {
    const pg = await pagina(base, { kcal: true }), p = pg.p;
    await p.click('[data-onb="dskip"]'); await wait(250);
    await p.fill('#onbCode', 'ana123');
    await p.click('[data-onb="next"]'); await wait(1500);
    t.eq(await onbPaso(p), { n: '3/3', titulo: '¿Cuánto pesás?' }, 'a2: con las calorías del coach, solo el peso');
    t.eq(await p.$eval('#authHost .onb-main', b => b.textContent), 'Completar', 'a2: y es el último');
    await p.$eval('#onbPeso', el => { el.scrollTop = 90 * 44; el.dispatchEvent(new Event('scroll')); }); await wait(500);
    await onbSiguiente(p); await wait(1500);
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'a2: se cierra la bienvenida');
    const e = await estado(p);
    t.eq(e.t, null, 'a2: no se pone una meta propia encima de la del coach');
    t.eq(e.cp, { weight: '75', bodyAsked: true }, 'a2: el peso y que ya se le preguntó');
    t.ok(pg.st.pesos.some(b => b.kg === 75), 'a2: el peso de hoy se sube');
    t.eq(pg.errs, [], 'a2: errores de la página');
    await pg.close();
  }

  // b) Código malo: avisa ahí mismo y deja el código escrito; el mensaje propio de la base (P0001) también.
  {
    let resp = false;
    const pg = await pagina(base, { join: () => resp }), p = pg.p;
    await p.click('[data-onb="dskip"]'); await wait(250);
    await p.fill('#onbCode', 'mal123');
    await p.click('[data-onb="next"]'); await wait(800);
    t.eq(await text(p, '#authHost .auth-msg[role="alert"]'), 'Código inválido. Revisalo con tu coach.', 'b: avisa que el código no anda');
    t.eq(await p.inputValue('#onbCode'), 'mal123', 'b: el código queda escrito');
    t.eq(await p.$eval('#authHost .onb-main', b => [b.disabled, b.textContent]), [false, 'Vincular con mi coach'], 'b: se puede volver a intentar');
    t.eq((await onbPaso(p)).n, '2/11', 'b: sigue en el código');
    resp = { error: { code: 'P0001', message: 'Tu coach llegó al máximo de alumnos.' } };
    await p.click('[data-onb="next"]'); await wait(800);
    t.eq(await text(p, '#authHost .auth-msg[role="alert"]'), 'Tu coach llegó al máximo de alumnos.', 'b: el mensaje de la base');
    t.eq(await p.$$eval('#authHost .auth-msg', l => l.length), 1, 'b: un solo aviso');
    t.eq(pg.errs, [], 'b: errores de la página');
    await pg.close();
  }

  // c) Ya vinculado al empezar: sin el paso del código (7 pasos).
  {
    const pg = await pagina(base, { unido: true }), p = pg.p;
    t.eq((await onbPaso(p)).n, '1/7', 'c: 7 pasos');
    await p.click('[data-onb="dskip"]'); await wait(250);
    t.eq(await onbPaso(p), { n: '2/7', titulo: '¿Cuál es tu sexo?' }, 'c: de la disciplina al sexo');
    t.eq(pg.errs, [], 'c: errores de la página');
    await pg.close();
  }

  // d) Ya vinculado y con las calorías del coach: la disciplina y el peso.
  {
    const pg = await pagina(base, { unido: true, kcal: true }), p = pg.p;
    t.eq((await onbPaso(p)).n, '1/2', 'd: 2 pasos');
    await p.click('[data-onb="dskip"]'); await wait(250);
    t.eq(await onbPaso(p), { n: '2/2', titulo: '¿Cuánto pesás?' }, 'd: el peso');
    t.eq(pg.errs, [], 'd: errores de la página');
    await pg.close();
  }

  // e) El campo: vacío no deja vincular; con el código, Enter vincula.
  {
    const pg = await pagina(base, { join: () => false }), p = pg.p;
    await p.click('[data-onb="dskip"]'); await wait(250);
    t.eq(await p.$eval('#authHost .onb-main', b => b.disabled), true, 'e: sin código, «Vincular con mi coach» no anda');
    await p.fill('#onbCode', '   ');
    t.eq(await p.$eval('#authHost .onb-main', b => b.disabled), true, 'e: con espacios tampoco');
    await p.fill('#onbCode', 'ana123');
    t.eq(await p.$eval('#authHost .onb-main', b => b.disabled), false, 'e: con el código, sí');
    await p.press('#onbCode', 'Enter'); await wait(800);
    t.ok(pg.calls.includes('POST /rest/v1/rpc/join_coach'), 'e: Enter en el campo vincula');
    t.has(await text(p, '#authHost'), 'Código inválido', 'e: y avisa la respuesta');
    t.eq(pg.errs, [], 'e: errores de la página');
    await pg.close();
  }
}
