// Progreso más simple: arriba de todo «Tu peso» (el de hoy se anota ahí mismo, con coma), y el
// registro de hoy, el check-in semanal y la ficha solo para quien tiene coach: sin coach (o sin
// perfil todavía) no aparecen en Progreso ni queda ningún aviso pendiente de ellos en otro lado,
// y si se desvincula desaparecen. Todo a 390 px de ancho y sin errores de la página.
import { newPage, saved, wait, text, ALUMNO, profile, perfil, CON_COACH } from './lib.mjs';

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const daysAgo = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(Date.now() - n * 864e5));
// Lo que es del coach, en cualquier pantalla: los títulos y los «pendiente» de sus tarjetas.
const DEL_COACH = /Registro de hoy|Check-in|Mi ficha|Pendiente de hoy|Pendiente esta semana/i;

async function abrir(base, { prof, weights = [], posts = [] }){
  const pg = await newPage({ user: ALUMNO, viewport: { width: 390, height: 844 },
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights, daily: {} },
    handlers: { '/profiles': prof,
      '/body_weights': (r, J, i) => i.m === 'GET' ? J(weights.map(w => ({ id: w.id, client_id: ALUMNO.id, measured_on: w.date, kg: w.kg })))
        : (posts.push(i.body || ''), r.fulfill({ status: 201, body: '[]' })) } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-progreso'); await wait(300);
  return pg;
}
// El menú de Progreso: tarjetas, grupos, cuáles están pendientes y qué va primero (después del título).
const menu = p => p.evaluate(() => {
  const v = document.getElementById('view'), first = [...v.children].find(c => !c.classList.contains('hb-head'));
  return { tiles: [...v.querySelectorAll('.ptile')].map(b => b.dataset.v), groups: [...v.querySelectorAll('.pgrp')].map(g => g.textContent.trim()),
    pend: [...v.querySelectorAll('.ptile.pend')].map(b => b.dataset.v), first: first ? first.className : null, join: !!v.querySelector('.join-box'),
    over: document.documentElement.scrollWidth - innerWidth };
});
// Recorre las pestañas del alumno y junta lo que se vea del coach (texto o puntito de pendiente).
async function avisosDelCoach(p){
  const out = [];
  for (const tab of ['entreno', 'habitos', 'cardio', 'comida', 'progreso', 'config']){
    await p.click('#nav-' + tab); await wait(400);
    const r = await p.evaluate(() => ({ txt: document.body.innerText, dots: document.querySelectorAll('.ptile.pend, .ptile-s i').length }));
    const m = r.txt.match(new RegExp(DEL_COACH.source, 'i'));
    if (m) out.push(tab + ': «' + m[0] + '»');
    if (r.dots) out.push(tab + ': ' + r.dots + ' pendiente(s)');
  }
  return out;
}

export default async function ({ base, t }){
  // 1) Con coach: «Tu peso» primero; después «Con tu coach» (registro y check-in pendientes, y la
  //    ficha), «Tus entrenos» y la competencia de pasos. Sin el cartel de vincularse.
  {
    const { p, errs, dialogs, close } = await abrir(base, { prof: perfil('client', CON_COACH), weights: [{ id: 'w1', date: daysAgo(3), kg: 81.5 }, { id: 'w2', date: daysAgo(1), kg: 80.7 }] });
    const m = await menu(p);
    t.eq(m.first, 'wq', 'con coach: «Tu peso» es lo primero de Progreso');
    t.eq(m.groups, ['Con tu coach', 'Tus entrenos', 'Con tus amigos'], 'con coach: los grupos, en orden');
    t.eq(m.tiles, ['registro', 'checkin', 'ficha', 'historial', 'cargas', 'volumen', 'pasos'], 'con coach: las tarjetas, en orden');
    t.eq(m.pend, ['registro', 'checkin'], 'con coach: el registro y el check-in muestran que falta cargarlos');
    t.ok(!m.join, 'con coach: sin «Vinculate a tu coach»');
    t.eq(await text(p, '.wq .w-now'), '80,7 kg', 'con coach: el último peso, grande y con coma');
    t.has(await text(p, '.wq-now'), '▼ 0,8 kg', 'con coach: con la diferencia con el anterior');
    t.ok(m.over <= 0, 'con coach: sin scroll de costado a 390 px');
    // Los toques de «Tu peso» y de las tarjetas, de al menos 44 px de alto; el campo con letra de 16 px (si no, el iPhone hace zoom).
    const s = await p.evaluate(() => { const h = q => document.querySelector(q).getBoundingClientRect().height, i = document.getElementById('wqKg');
      return { go: h('.wq-go'), save: h('[data-action="weight-today"]'), input: h('#wqKg'), tile: Math.min(...[...document.querySelectorAll('.ptile')].map(b => b.getBoundingClientRect().height)),
        mode: i.getAttribute('inputmode'), font: getComputedStyle(i).fontSize }; });
    t.ok(s.go >= 44 && s.save >= 44 && s.input >= 44 && s.tile >= 44, 'con coach: toques de 44 px o más: ' + JSON.stringify(s));
    t.eq([s.mode, s.font], ['decimal', '16px'], 'con coach: el campo del peso con teclado numérico y letra de 16 px');
    t.eq(dialogs, [], 'con coach: sin carteles');
    t.eq(errs, [], 'con coach: errores de la página');
    await close();
  }

  // 2) «79,5» + Guardar: queda el peso de hoy una sola vez (en el celular y en la cola a la nube)
  //    y la tarjeta lo muestra. «Cambiar» lo corrige (con Enter) sin agregar otro. «Ver evolución»
  //    abre Peso corporal.
  {
    const posts = [];
    const { p, errs, dialogs, close } = await abrir(base, { prof: perfil('client'), posts, weights: [{ id: 'w1', date: daysAgo(2), kg: 80 }] });
    await p.click('[data-action="weight-today"]'); await wait(300);
    t.ok(dialogs.some(d => d.includes('Poné un peso válido')), 'vacío: pide un peso válido: ' + JSON.stringify(dialogs));
    t.eq((await saved(p)).weights.filter(w => w.date === TODAY), [], 'vacío: no guarda nada');
    dialogs.length = 0;
    await p.fill('#wqKg', '79,5');
    await p.click('[data-action="weight-today"]'); await wait(2500);
    let hoy = (await saved(p)).weights.filter(w => w.date === TODAY);
    t.eq(hoy.map(w => w.kg), [79.5], 'guardar: queda el peso de hoy, una vez');
    const nube = posts.filter(b => b.includes('"measured_on":"' + TODAY + '"'));
    t.ok(nube.length === 1 && /"kg":79\.5\b/.test(nube[0]), 'guardar: va a la nube una vez, con la fecha de hoy y 79,5: ' + JSON.stringify(posts));
    t.has(await text(p, '.wq-hoy'), 'Hoy: 79,5 kg', 'guardar: la tarjeta muestra el de hoy');
    t.ok(!(await p.$('#wqKg')), 'guardar: el campo se cierra');
    t.eq(await text(p, '.wq .w-now'), '79,5 kg', 'guardar: el último peso es el de hoy');
    t.has(await text(p, '.wq-now'), '▼ 0,5 kg', 'guardar: con la diferencia con el anterior');

    await p.click('[data-action="wq-edit"]'); await wait(300);
    t.eq(await p.inputValue('#wqKg'), '79,5', 'cambiar: el campo trae el peso de hoy');
    await p.fill('#wqKg', '79,2'); await p.press('#wqKg', 'Enter'); await wait(2500);
    hoy = (await saved(p)).weights.filter(w => w.date === TODAY);
    t.eq(hoy.map(w => w.kg), [79.2], 'cambiar: corrige el de hoy, no agrega otro');
    t.ok(posts.some(b => b.includes('"measured_on":"' + TODAY + '"') && /"kg":79\.2\b/.test(b)), 'cambiar: la corrección va a la nube');
    t.has(await text(p, '.wq-hoy'), 'Hoy: 79,2 kg', 'cambiar: la tarjeta muestra el nuevo');

    await p.click('.wq-go'); await wait(300);
    t.eq(await text(p, '.form-title'), 'Peso corporal', '«Ver evolución» abre Peso corporal');
    t.ok(!!(await p.$('.w-chart')) && !!(await p.$('#wDate')), 'Peso corporal: con el gráfico y el formulario de otras fechas');
    await p.click('[data-action="psec-close"]'); await wait(300);
    t.eq((await menu(p)).first, 'wq', '«‹» vuelve a Progreso, con «Tu peso» arriba');
    t.eq(dialogs, [], 'peso: sin carteles');
    t.eq(errs, [], 'peso: errores de la página');
    await close();
  }

  // 3) Sin coach: ni el registro, ni el check-in, ni la ficha, ni avisos de ellos en ninguna
  //    pestaña. El cartel para vincularse sigue, al final. Sin pesos: «Tu peso» invita a empezar.
  {
    const { p, errs, close } = await abrir(base, { prof: perfil('client') });
    const m = await menu(p);
    t.eq(m.first, 'wq', 'sin coach: «Tu peso» es lo primero');
    t.eq(m.tiles, ['historial', 'cargas', 'volumen', 'pasos'], 'sin coach: sin registro, check-in ni ficha');
    t.eq(m.groups, ['Tus entrenos', 'Con tus amigos'], 'sin coach: sin el grupo «Con tu coach»');
    t.ok(m.join, 'sin coach: sigue «Vinculate a tu coach»');
    t.eq(await p.evaluate(() => document.querySelector('#view').lastElementChild.className), 'join-box', 'sin coach: el cartel de vincularse va al final');
    t.has(await text(p, '.wq'), 'Anotá tu peso de hoy para empezar a ver tu evolución', 'sin pesos: «Tu peso» invita a anotar el de hoy');
    t.eq(await avisosDelCoach(p), [], 'sin coach: nada del coach en ninguna pestaña');
    t.ok(m.over <= 0, 'sin coach: sin scroll de costado a 390 px');
    t.eq(errs, [], 'sin coach: errores de la página');
    await close();
  }

  // 4) Sin perfil todavía (no llegó de la nube): tampoco, y sin cartel de vincularse a medias.
  {
    const { p, errs, close } = await abrir(base, { prof: profile('client') });
    const m = await menu(p);
    t.eq(m.tiles, ['historial', 'cargas', 'volumen', 'pasos'], 'sin perfil: sin registro, check-in ni ficha');
    t.eq(m.first, 'wq', 'sin perfil: «Tu peso» es lo primero');
    t.eq(await avisosDelCoach(p), [], 'sin perfil: nada del coach en ninguna pestaña');
    // Sin sesión: Progreso dibujado sin cuenta tampoco los muestra.
    const sinSesion = await p.evaluate(async () => {
      const { State } = await import('/app/core/state.js'), { renderProgreso } = await import('/app/screens/progreso.js');
      const u = State.cloudUser, pr = State.cloudProfile; State.cloudUser = null; State.cloudProfile = null;
      try { return renderProgreso(); } finally { State.cloudUser = u; State.cloudProfile = pr; }
    });
    t.ok(!DEL_COACH.test(sinSesion) && /class="wq"/.test(sinSesion), 'sin sesión: «Tu peso» sí, lo del coach no');
    t.eq(errs, [], 'sin perfil: errores de la página');
    await close();
  }

  // 5) Se desvincula con el check-in abierto: al volver a leer la cuenta, vuelve al menú y ya no
  //    están el registro, el check-in ni la ficha.
  {
    let coachId = CON_COACH.coach_id;
    const prof = (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: coachId }; return J(i.one ? me : [me]); };
    const { p, errs, close } = await abrir(base, { prof });
    await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
    t.eq(await text(p, '.form-title'), 'Check-in semanal', 'desvincular: el check-in estaba abierto');
    coachId = null;
    await p.evaluate(async () => { const sb = await import('/app/core/supabase.js'), m = await import('/app/main.js'); await sb.loadCloud(); m.renderApp(); });
    await wait(300);
    const m = await menu(p);
    t.ok(!(await p.$('[data-action="psec-close"]')), 'desvincular: vuelve al menú de Progreso');
    t.eq(m.tiles, ['historial', 'cargas', 'volumen', 'pasos'], 'desvincular: ya no están el registro, el check-in ni la ficha');
    t.ok(m.join, 'desvincular: aparece «Vinculate a tu coach»');
    t.eq(errs, [], 'desvincular: errores de la página');
    await close();
  }
}
