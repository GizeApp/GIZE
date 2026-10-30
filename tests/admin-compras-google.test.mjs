// Panel de administración → Coaches y pagos → «Cobro con Google Play» (supabase/compras-google.sql y
// la función compras-google): los dos interruptores de tres estados (planes de coach e IA Plus:
// apagado, solo cuentas de prueba o todos; arranca apagado), que llaman a admin_compras_google solo
// con lo que se tocó; pasar a «Todos» pregunta antes y avisa si la clave de Google no anda; la salud
// de la clave (compras-google { accion: 'salud' }), el último aviso de Google Play y el último error
// de permisos; el resumen y la lista de compras; sin el SQL en la base; en el celular; y cómo queda
// en el registro de acciones (Seguridad).
import { newPage, wait, text, ADMIN } from './lib.mjs';

const SHOTS = process.env.SHOTS;
const D = n => new Date(Date.now() + n * 864e5).toISOString();
const coaches = [{ id: 'c1', full_name: 'Coach Uno', email: 'c1@prueba.test', plan: 'p25', max_clients: 25, clients: 4, paid_until: D(20), trial_ends_at: null, mp_status: null, has_mp: false, price: 24900 }];
// Lo que devuelve admin_compras_google recién corrido el SQL, con un aviso de prueba de Play Console
// y dos compras.
const ESTADO = () => ({
  config: { planes: 'apagado', plus: 'apagado' },
  estado: { aviso_at: new Date(Date.now() - 5 * 60e3).toISOString(), tipo: 'prueba' },
  resumen: { activas: 2, renuevan: 1, prueba: 1 },
  lista: [
    { user_id: 'u1', email: 'coach@prueba.test', nombre: 'Coach Google', producto: 'ar.com.gize.app.coach.p25', pedido: 'GPA.1', estado: 'activa', hasta: D(28), renueva: true, prueba: false, revocada: false, reemplazada: false, reconocida: true, actualizada: D(-2) },
    { user_id: 'u2', email: 'tester@prueba.test', nombre: 'Tester', producto: 'ar.com.gize.app.iaplus.mensual', pedido: 'GPA.2', estado: 'cancelada', hasta: D(3), renueva: false, prueba: true, revocada: false, reemplazada: false, reconocida: true, actualizada: D(-1) },
  ],
});

function manejadores(st, llamadas, salud, extra){
  return Object.assign({
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_coaches': (r, J) => J(coaches),
    '/admin_codigos_fundador': (r, J) => J([]),
    // Como la base: con p mezcla lo que llega con lo que había; siempre devuelve todo.
    '/admin_compras_google': (r, J, i) => {
      const b = JSON.parse(i.body || '{}');
      if (b.p){
        llamadas.push(b);
        if (st.fallar) return J({ code: '22023', message: 'Revisá el cobro con Google Play: planes o plus, con apagado, prueba o todos.' }, 400);
        st.config = Object.assign({}, st.config, b.p);
      }
      return J(JSON.parse(JSON.stringify(st)));
    },
    '/functions/v1/compras-google': (r, J, i) => { llamadas.push(['salud', JSON.parse(i.body || '{}')]); return J(salud); },
  }, extra || {});
}
async function anotarToasts(p){
  const toasts = [];
  await p.exposeFunction('anotarToast', s => toasts.push(s));
  await p.evaluate(() => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains('toast') && window.anotarToast(n.textContent))))
    .observe(document.body, { childList: true }));
  return toasts;
}
const valores = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cGp [data-gp]')].map(s => [s.dataset.gp, s.value])));
const kpis = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cGp .kpi')].map(k => [k.querySelector('span').textContent, k.querySelector('b').textContent])));
const ultima = preguntas => preguntas[preguntas.length - 1] || {};
const sinSalud = l => l.filter(x => x[0] !== 'salud');

export default async function ({ base, t }){
  // ===== La clave anda: arranca apagado =====
  {
    const st = ESTADO(), llamadas = [];
    const { p, errs, preguntas, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(st, llamadas, { clave: true, acceso: true }) });
    await p.goto(base + '/admin/#coaches'); await wait(1500);
    const toasts = await anotarToasts(p);

    t.has(await text(p, '#cGpB .blk-h'), 'Cobro con Google Play', 'la tarjeta está en Coaches y pagos');
    t.eq(await text(p, '#cGpB-s'), 'apagado · 2 activas', 'el resumen de la tarjeta: apagado y cuántas activas');
    t.eq(await valores(p), { planes: 'apagado', plus: 'apagado' }, 'los dos selectores, apagados como vienen de la base');
    t.eq(await p.$$eval('#cGp [data-gp="planes"] option', o => o.map(x => x.textContent)), ['Apagado', 'Solo cuentas de prueba', 'Todos'], 'tres estados');
    t.ok(llamadas.some(x => x[0] === 'salud' && x[1].accion === 'salud'), 'pregunta la salud de la clave a compras-google');
    const card = await text(p, '#cGp');
    t.has(card, 'Clave de Google: anda', 'la clave anda');
    t.ok(/Último aviso de Google Play: hoy \d{1,2}:\d{2} \(mensaje de prueba\)/.test(card), 'el último aviso: hoy, mensaje de prueba — ' + card.slice(0, 400));
    t.ok(!card.includes('Último error'), 'sin errores de permisos: no muestra ninguno');
    t.eq(await kpis(p), { 'Activas': '2', 'Se renuevan': '1', 'De prueba': '1' }, 'el resumen de admin_compras_google');
    t.has(card, 'Coach Google coach@prueba.test Hasta 25 Activa Se renueva', 'la lista: un plan de coach activo que se renueva');
    t.has(card, 'Tester Prueba tester@prueba.test IA Plus Cancelada (no se renueva)', 'la lista: IA Plus de prueba cancelada');
    t.ok(!/GPA\.|ar\.com\.gize/.test(card), 'sin números de pedido ni IDs de producto');
    t.has(await text(p, '#cList'), 'Coach Uno', 'la lista de coaches sigue andando');
    if (SHOTS) { await p.evaluate(() => document.getElementById('cGpB').scrollIntoView({ block: 'start' })); await wait(300); await p.screenshot({ path: SHOTS + '/admin-compras-google.png' }); }

    // «Solo cuentas de prueba» en los planes: sin preguntar, solo con planes.
    await p.selectOption('#cGp [data-gp="planes"]', 'prueba'); await wait(500);
    t.eq(sinSalud(llamadas), [{ p: { planes: 'prueba' } }], 'planes a «solo prueba»: admin_compras_google solo con planes');
    t.eq(preguntas.length, 0, '«solo prueba» no pregunta');
    t.eq(await valores(p), { planes: 'prueba', plus: 'apagado' }, 'planes quedó en «solo prueba»');
    t.eq(await text(p, '#cGpB-s'), 'Planes de coach: solo prueba · 2 activas', 'el resumen se actualiza');
    t.eq(await p.evaluate(() => document.activeElement && document.activeElement.dataset.gp), 'planes', 'el foco vuelve al selector que se tocó');
    t.has(toasts.join(' | '), 'Planes de coach con Google Play: solo cuentas de prueba', 'avisa cómo quedó');

    // «Todos» en IA Plus, pero «Cancelar»: no cambia nada.
    p.contestar = false;
    await p.selectOption('#cGp [data-gp="plus"]', 'todos'); await wait(500);
    t.eq(sinSalud(llamadas).length, 1, 'cancelar: no se manda');
    t.eq((await valores(p)).plus, 'apagado', 'cancelar: vuelve a «Apagado»');
    t.has(ultima(preguntas).texto, '¿Vender IA Plus con Google Play a todos', 'pasar a «Todos» pregunta');
    t.ok(!ultima(preguntas).texto.includes('Ojo: la clave'), 'con la clave andando no avisa de la clave');
    t.eq([ultima(preguntas).titulo, ultima(preguntas).ok], ['Cobro con Google Play', 'Prender para todos'], 'la pregunta: título y botón');

    // Ahora sí.
    p.contestar = true;
    await p.selectOption('#cGp [data-gp="plus"]', 'todos'); await wait(500);
    t.eq(sinSalud(llamadas)[1], { p: { plus: 'todos' } }, 'IA Plus a «Todos»: admin_compras_google solo con plus');
    t.eq(await valores(p), { planes: 'prueba', plus: 'todos' }, 'IA Plus quedó en «Todos»');
    t.eq(await text(p, '#cGpB-s'), 'Planes de coach: solo prueba · IA Plus: todos · 2 activas', 'el resumen con los dos');

    // Si la base dice que no, queda como estaba y se ve el motivo.
    st.fallar = true;
    await p.selectOption('#cGp [data-gp="planes"]', 'apagado'); await wait(500);
    t.eq(sinSalud(llamadas)[2], { p: { planes: 'apagado' } }, 'apagar planes: se pide');
    t.eq((await valores(p)).planes, 'prueba', 'si falla, vuelve a «Solo cuentas de prueba»');
    t.eq(await p.$eval('#cGp [data-gp="planes"]', s => s.disabled), false, 'y se puede volver a tocar');
    t.has(toasts.join(' | '), 'Revisá el cobro con Google Play', 'avisa por qué no se pudo');
    t.eq(errs, [], 'errores');
    await close();
  }

  // ===== La clave falta y hubo un error de permisos =====
  {
    const st = ESTADO(), llamadas = [];
    st.estado = { aviso_at: D(-3), tipo: 'suscripcion', error: 'permiso', error_at: D(-1) };
    const { p, errs, preguntas, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(st, llamadas, { clave: false, acceso: false }) });
    await p.goto(base + '/admin/#coaches'); await wait(1500);
    const card = await text(p, '#cGp');
    t.has(card, 'Clave de Google: falta', 'sin la clave: lo dice');
    t.has(card, 'GOOGLE_PLAY_SA', 'sin la clave: dice qué secret cargar');
    t.has(card, 'Último error: Google no dio permiso para leer las compras', 'el último error de permisos');
    t.ok(!card.includes('mensaje de prueba'), 'un aviso de verdad no dice «mensaje de prueba»');
    p.contestar = false;
    await p.selectOption('#cGp [data-gp="planes"]', 'todos'); await wait(500);
    t.has(ultima(preguntas).texto, 'Ojo: la clave de Google falta', '«Todos» sin la clave: avisa');
    t.has(ultima(preguntas).texto, 'devuelve la plata a los 3 días', 'y por qué importa');
    t.eq(sinSalud(llamadas), [], 'cancelar: no se manda');
    t.eq((await valores(p)).planes, 'apagado', 'cancelar: sigue apagado');
    t.eq(errs, [], 'errores (sin la clave)');
    await close();
  }

  // ===== La clave está pero Google no da el acceso; todavía sin avisos =====
  {
    const st = ESTADO(); st.estado = null;
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(st, [], { clave: true, acceso: false }) });
    await p.goto(base + '/admin/#coaches'); await wait(1500);
    const card = await text(p, '#cGp');
    t.has(card, 'Clave de Google: está, pero Google no da el acceso', 'clave sin acceso: lo dice');
    t.has(card, 'Último aviso de Google Play: todavía ninguno', 'sin avisos: lo dice');
    t.eq(errs, [], 'errores (sin acceso)');
    await close();
  }

  // ===== Sin el SQL en la base y sin la función publicada =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(ESTADO(), [], {}, {
      '/admin_compras_google': (r, J) => J({ code: 'PGRST202', message: 'Could not find the function public.admin_compras_google without parameters in the schema cache' }, 404),
    }) });
    await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
    t.has(await text(pg.p, '#cGp'), 'Falta preparar la base', 'sin el SQL: lo dice');
    t.has(await text(pg.p, '#cGp'), 'supabase/compras-google.sql', 'sin el SQL: dice qué correr');
    t.eq(await pg.p.$$eval('#cGp [data-gp]', l => l.length), 0, 'sin el SQL: sin selectores');
    t.has(await text(pg.p, '#cList'), 'Coach Uno', 'sin el SQL: la lista de coaches sigue andando');
    t.eq(pg.errs, [], 'errores (sin el SQL)');
    await pg.close();
  }
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(ESTADO(), [], null, {
      '/functions/v1/compras-google': (r, J) => J({ message: 'Requested function was not found' }, 404),
    }) });
    await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
    t.has(await text(pg.p, '#cGp'), 'La función compras-google todavía no está publicada', 'sin la función: lo dice');
    t.eq(await pg.p.$$eval('#cGp [data-gp]', l => l.length), 2, 'sin la función: los selectores siguen');
    t.eq(pg.errs.filter(e => !/404/.test(e)), [], 'errores (sin la función)');
    await pg.close();
  }

  // ===== En el celular: sin scroll de costado =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 360, height: 780 }, handlers: manejadores(ESTADO(), [], { clave: true, acceso: true }) });
    await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
    const ancho = await pg.p.evaluate(() => {
      const card = document.getElementById('cGpB'), r = card.getBoundingClientRect();
      return { pagina: document.documentElement.scrollWidth <= innerWidth, tarjeta: r.right <= innerWidth + 0.5,
        selectores: [...card.querySelectorAll('[data-gp]')].every(b => b.getBoundingClientRect().right <= r.right + 0.5) };
    });
    if (SHOTS) { await pg.p.evaluate(() => document.getElementById('cGpB').scrollIntoView({ block: 'start' })); await wait(300); await pg.p.screenshot({ path: SHOTS + '/admin-compras-google-celular.png' }); }
    t.eq(ancho, { pagina: true, tarjeta: true, selectores: true }, 'celular: la tarjeta y sus selectores entran en el ancho');
    t.eq(pg.errs, [], 'errores (celular)');
    await pg.close();
  }

  // ===== El registro de acciones (Seguridad) =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(true),
      '/admin_contact_unread': (r, J) => J(0),
      '/admin_list_admins': (r, J) => J([]),
      '/admin_audit_list': (r, J) => J([{ action: 'compras_google', target: null, admin_name: 'Admin Prueba', created_at: new Date().toISOString(),
        detail: { antes: { planes: 'apagado', plus: 'apagado' }, ahora: { planes: 'todos', plus: 'prueba' } } }]),
    } });
    await pg.p.route(/api\.github\.com/, x => x.abort());
    await pg.p.goto(base + '/admin/#seguridad'); await wait(1500);
    const aud = await text(pg.p, '#aud');
    t.has(aud, 'Cambió el cobro con Google Play', 'registro: qué se hizo');
    t.has(aud, 'Planes de coach: Todos · IA Plus: Solo cuentas de prueba', 'registro: cómo quedó');
    t.eq(pg.errs, [], 'errores (registro)');
    await pg.close();
  }
}
