// Panel de administración → Coaches y pagos → «Cobros de los coaches» (supabase/cobros-coach.sql): los
// tres interruptores (web, Android e iPhone), que llaman a admin_cobros solo con la plataforma que se
// tocó y preguntan antes (en las apps, que antes se revise la etiqueta de privacidad de la tienda); las
// cantidades de admin_cobros_estado, sin montos; qué pasa si admin_cobros falla, sin el SQL en la base
// y en el celular; y cómo queda en el registro de acciones (Seguridad).
import { newPage, wait, text, ADMIN } from './lib.mjs';

const coaches = [{ id: 'c1', full_name: 'Coach Uno', email: 'c1@prueba.test', plan: 'p25', max_clients: 25, clients: 4, paid_until: new Date(Date.now() + 20 * 864e5).toISOString(), trial_ends_at: null, mp_status: null, has_mp: false, price: 24900 }];
// Lo que devuelve admin_cobros_estado recién corrido el SQL: la web prendida y las apps apagadas.
const ESTADO = () => ({ interruptor: { web: true, android: false, ios: false }, coaches: 3, alumnos: 41, cobros_mes: 27 });

function manejadores(st, llamadas, extra){
  return Object.assign({
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_coaches': (r, J) => J(coaches),
    '/admin_codigos_fundador': (r, J) => J([]),
    '/admin_cobros_estado': (r, J) => J(JSON.parse(JSON.stringify(st))),
    // Como la base: mezcla lo que llega con lo que había y devuelve el interruptor nuevo.
    '/admin_cobros': (r, J, i) => {
      const b = JSON.parse(i.body); llamadas.push(b);
      if (st.fallar) return J({ code: 'P0001', message: 'Revisá el interruptor: web, android o ios, con true o false.' }, 400);
      st.interruptor = Object.assign({}, st.interruptor, b.p);
      return J(Object.assign({}, st.interruptor));
    },
  }, extra || {});
}
// Los avisos de abajo (toast) se van solos: se anotan al aparecer.
async function anotarToasts(p){
  const toasts = [];
  await p.exposeFunction('anotarToast', s => toasts.push(s));
  await p.evaluate(() => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains('toast') && window.anotarToast(n.textContent))))
    .observe(document.body, { childList: true }));
  return toasts;
}
const llaves = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cCob [data-a="cobOn"]')].map(b => [b.dataset.k, b.getAttribute('aria-checked')])));
const kpis = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cCob .kpi')].map(k => [k.querySelector('span').textContent, k.querySelector('b').textContent])));
const ultima = preguntas => preguntas[preguntas.length - 1] || {};

export default async function ({ base, t }){
  // ===== Recién corrido el SQL: la web prendida y las apps apagadas =====
  {
    const st = ESTADO(), llamadas = [];
    const { p, errs, preguntas, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(st, llamadas) });
    await p.goto(base + '/admin/#coaches'); await wait(1500);
    const toasts = await anotarToasts(p);

    t.has(await text(p, '#cCobB .blk-h'), 'Cobros de los coaches', 'la tarjeta está en Coaches y pagos');
    t.eq(await text(p, '#cCobB-s'), 'prendido en la web · 3 coaches', 'el resumen de la tarjeta: dónde está prendido y cuántos coaches lo usan');
    t.eq(await llaves(p), { web: 'true', android: 'false', ios: 'false' }, 'los tres interruptores, como vienen de la base');
    t.eq(await kpis(p), { 'Coaches que lo usan': '3', 'Alumnos con cuota': '41', 'Cobros anotados este mes': '27' }, 'las cantidades de admin_cobros_estado');
    const card = await text(p, '#cCob');
    t.ok(!/\$/.test(card), 'sin montos: ' + card);
    t.has(card, 'GIZE no cobra ni mueve plata', 'aclara que GIZE no cobra');
    t.has(card, 'Play Console → Seguridad de los datos', 'Android apagado: qué revisar antes de prenderlo');
    t.has(card, 'App Store Connect → App Privacy', 'iPhone apagado: qué revisar antes de prenderlo');
    t.has(await text(p, '#cList'), 'Coach Uno', 'la lista de coaches sigue andando');

    // Prender Android, pero «Cancelar»: no cambia nada.
    p.contestar = false;
    await p.click('#cCob [data-a="cobOn"][data-k="android"]'); await wait(400);
    t.eq(llamadas, [], 'cancelar: no se prende');
    t.eq((await llaves(p)).android, 'false', 'cancelar: sigue apagado');
    t.has(ultima(preguntas).texto, 'Seguridad de los datos', 'la pregunta recuerda revisar la etiqueta de Google Play');
    t.has(ultima(preguntas).texto, 'solo el estado y la fecha de su cuota', 'y dice que el alumno no ve montos en la app');
    t.eq([ultima(preguntas).titulo, ultima(preguntas).ok], ['Cobros de los coaches', 'Prender'], 'la pregunta: título y botón');

    // Ahora sí: se manda solo Android.
    p.contestar = true;
    await p.click('#cCob [data-a="cobOn"][data-k="android"]'); await wait(500);
    t.eq(llamadas, [{ p: { android: true } }], 'prender Android: admin_cobros solo con Android');
    t.eq(await llaves(p), { web: 'true', android: 'true', ios: 'false' }, 'Android quedó prendido');
    t.eq(await text(p, '#cCobB-s'), 'prendido en la web y Android · 3 coaches', 'el resumen se actualiza');
    t.has(await text(p, '#cCob'), 'Prendido: los coaches ven en su panel los montos que cobran', 'Android prendido: qué ve cada uno');
    t.eq(await p.evaluate(() => document.activeElement && document.activeElement.dataset.k), 'android', 'el foco vuelve al interruptor que se tocó');
    t.has(toasts.join(' | '), 'Cobros en la app de Android: prendido', 'avisa que quedó prendido');

    // iPhone.
    await p.click('#cCob [data-a="cobOn"][data-k="ios"]'); await wait(500);
    t.eq(llamadas[1], { p: { ios: true } }, 'prender iPhone: admin_cobros solo con iPhone');
    t.has(ultima(preguntas).texto, 'App Store Connect → App Privacy', 'la pregunta recuerda revisar la etiqueta de Apple');
    t.eq(await text(p, '#cCobB-s'), 'prendido en la web, Android y iPhone · 3 coaches', 'prendido en las tres');

    // Apagar la web.
    await p.click('#cCob [data-a="cobOn"][data-k="web"]'); await wait(500);
    t.eq(llamadas[2], { p: { web: false } }, 'apagar la web: admin_cobros solo con la web');
    t.has(ultima(preguntas).texto, 'Lo que anotaron queda guardado', 'apagar: avisa que lo anotado no se borra');
    t.eq(ultima(preguntas).ok, 'Apagar', 'apagar: el botón dice «Apagar»');
    t.eq(await llaves(p), { web: 'false', android: 'true', ios: 'true' }, 'la web quedó apagada');
    t.has(toasts.join(' | '), 'Cobros en la web: apagado', 'avisa que quedó apagado');

    // Si la base dice que no, el interruptor queda como estaba y se ve el motivo.
    st.fallar = true;
    await p.click('#cCob [data-a="cobOn"][data-k="ios"]'); await wait(500);
    t.eq(llamadas[3], { p: { ios: false } }, 'apagar iPhone: se pide');
    t.eq((await llaves(p)).ios, 'true', 'si falla, iPhone sigue prendido');
    t.eq(await p.$eval('#cCob [data-a="cobOn"][data-k="ios"]', b => b.disabled), false, 'y se puede volver a tocar');
    t.has(toasts.join(' | '), 'Revisá el interruptor', 'avisa por qué no se pudo');
    t.eq(errs, [], 'errores');
    await close();
  }

  // ===== Sin el SQL en la base =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(ESTADO(), [], {
      '/admin_cobros_estado': (r, J) => J({ code: 'PGRST202', message: 'Could not find the function public.admin_cobros_estado without parameters in the schema cache' }, 404),
    }) });
    await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
    t.has(await text(pg.p, '#cCob'), 'Falta preparar la base', 'sin el SQL: lo dice');
    t.has(await text(pg.p, '#cCob'), 'supabase/cobros-coach.sql', 'sin el SQL: dice qué correr');
    t.eq(await pg.p.$$eval('#cCob [data-a="cobOn"]', l => l.length), 0, 'sin el SQL: sin interruptores');
    t.has(await text(pg.p, '#cList'), 'Coach Uno', 'sin el SQL: la lista de coaches sigue andando');
    t.eq(pg.errs, [], 'errores (sin el SQL)');
    await pg.close();
  }

  // ===== En el celular: sin scroll de costado =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 360, height: 780 }, handlers: manejadores(ESTADO(), []) });
    await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
    t.eq(Object.keys(await llaves(pg.p)).length, 3, 'celular: los tres interruptores');
    const ancho = await pg.p.evaluate(() => {
      const card = document.getElementById('cCobB'), r = card.getBoundingClientRect();
      return { pagina: document.documentElement.scrollWidth <= innerWidth, tarjeta: r.right <= innerWidth + 0.5,
        llaves: [...card.querySelectorAll('[data-a="cobOn"]')].every(b => b.getBoundingClientRect().right <= r.right + 0.5) };
    });
    t.eq(ancho, { pagina: true, tarjeta: true, llaves: true }, 'celular: la tarjeta y sus interruptores entran en el ancho');
    t.eq(pg.errs, [], 'errores (celular)');
    await pg.close();
  }

  // ===== El registro de acciones (Seguridad) =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(true),
      '/admin_contact_unread': (r, J) => J(0),
      '/admin_list_admins': (r, J) => J([]),
      '/admin_audit_list': (r, J) => J([{ action: 'cobros', target: 'cobros', admin_name: 'Admin Prueba', created_at: new Date().toISOString(),
        detail: { antes: { web: true, android: false, ios: false }, ahora: { web: true, android: true, ios: false } } }]),
    } });
    await pg.p.route(/api\.github\.com/, x => x.abort()); // las copias de seguridad no importan acá
    await pg.p.goto(base + '/admin/#seguridad'); await wait(1500);
    const aud = await text(pg.p, '#aud');
    t.has(aud, 'Cambió Cobros de los coaches', 'registro: qué se hizo');
    t.has(aud, 'Web prendido · Android prendido · iPhone apagado', 'registro: cómo quedó');
    t.eq(pg.errs, [], 'errores (registro)');
    await pg.close();
  }
}
