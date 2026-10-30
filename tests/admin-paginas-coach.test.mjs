// Panel de administración → Coaches y pagos → «Páginas de coaches» (supabase/pagina-coach.sql): la lista
// de admin_coach_paginas (el link, el coach, si tiene foto, si se ve y los links viejos); Pausar, Reanudar,
// Sacar foto y Liberar llaman a admin_coach_pagina con su acción y preguntan antes (salvo Reanudar);
// cancelar no manda nada; si la base dice que no, se ve el motivo; sin el SQL, dice qué correr; en el
// celular entra en el ancho; y cómo queda en el registro de acciones (Seguridad). Las otras tarjetas
// (Cobros de los coaches, la lista de coaches) siguen andando.
import { newPage, wait, text, ADMIN } from './lib.mjs';

const coaches = [{ id: 'c1', full_name: 'Coach Uno', email: 'c1@prueba.test', plan: 'p25', max_clients: 25, clients: 4, paid_until: new Date(Date.now() + 20 * 864e5).toISOString(), trial_ends_at: null, mp_status: null, has_mp: false, price: 24900 }];
const PAGINAS = () => [
  { coach: 'c1', nombre: 'Coach <b>Uno</b>', email: 'c1@prueba.test', alias: 'toro.fit', activa: true, con_foto: true, pausada: false, pausada_at: null,
    creada_at: '2026-10-20T12:00:00Z', alias_at: '2026-10-22T12:00:00Z', visible: true, viejos: [{ alias: 'toro-viejo', hasta: '2027-01-20T12:00:00Z' }] },
  { coach: 'c2', nombre: 'Coach Dos', email: 'c2@prueba.test', alias: 'dos', activa: true, con_foto: false, pausada: true, pausada_at: '2026-10-25T12:00:00Z',
    creada_at: '2026-10-10T12:00:00Z', alias_at: '2026-10-10T12:00:00Z', visible: false, viejos: [] },
  { coach: 'c3', nombre: 'Coach Tres', email: 'c3@prueba.test', alias: 'tres', activa: false, con_foto: true, pausada: false, pausada_at: null,
    creada_at: '2026-10-05T12:00:00Z', alias_at: '2026-10-05T12:00:00Z', visible: false, viejos: [] },
  { coach: 'c4', nombre: 'Coach Cuatro', email: 'c4@prueba.test', alias: 'cuatro', activa: true, con_foto: true, pausada: false, pausada_at: null,
    creada_at: '2026-10-01T12:00:00Z', alias_at: '2026-10-01T12:00:00Z', visible: false, viejos: [] }];

function manejadores(st, llamadas, extra){
  return Object.assign({
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_coaches': (r, J) => J(coaches),
    '/admin_codigos_fundador': (r, J) => J([]),
    '/admin_cobros_estado': (r, J) => J({ interruptor: { web: true, android: false, ios: false }, coaches: 1, alumnos: 2, cobros_mes: 3 }),
    '/admin_coach_paginas': (r, J) => J(JSON.parse(JSON.stringify(st.paginas))),
    // Como la base: cambia la página y no devuelve nada.
    '/admin_coach_pagina': (r, J, i) => {
      const b = JSON.parse(i.body); llamadas.push(b);
      if (st.fallar) return J({ code: 'P0001', message: 'Ese coach no tiene página.' }, 400);
      const g = st.paginas.find(x => x.coach === b.p_coach);
      if (b.p_accion === 'pausar'){ g.pausada = true; g.pausada_at = new Date().toISOString(); g.visible = false; }
      if (b.p_accion === 'reanudar'){ g.pausada = false; g.pausada_at = null; g.visible = g.activa; }
      if (b.p_accion === 'sin_foto') g.con_foto = false;
      if (b.p_accion === 'liberar') st.paginas = st.paginas.filter(x => x !== g);
      return J(null);
    },
  }, extra || {});
}
async function anotarToasts(p){
  const toasts = [];
  await p.exposeFunction('anotarToast', s => toasts.push(s));
  await p.evaluate(() => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains('toast') && window.anotarToast(n.textContent))))
    .observe(document.body, { childList: true }));
  return toasts;
}
const fila = (p, c) => text(p, `#cPag tr[data-pag="${c}"]`);
const botones = (p, c) => p.$$eval(`#cPag tr[data-pag="${c}"] [data-a="pagAcc"]`, l => l.map(b => b.dataset.v));
const ultima = preguntas => preguntas[preguntas.length - 1] || {};

export default async function ({ base, t }){
  {
    const st = { paginas: PAGINAS() }, llamadas = [];
    const { p, errs, preguntas, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores(st, llamadas) });
    await p.goto(base + '/admin/#coaches'); await wait(1500);
    const toasts = await anotarToasts(p);

    t.has(await text(p, '#cPagB .blk-h'), 'Páginas de coaches', 'la tarjeta está en Coaches y pagos');
    t.ok(await p.evaluate(() => { const c = document.getElementById('cCobB'), g = document.getElementById('cPagB');
      return !!(c && g && (c.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING)); }), 'va después de «Cobros de los coaches», sin pisarla');
    t.eq(await p.$$eval('#cCob [data-a="cobOn"]', l => l.length), 3, 'Cobros de los coaches sigue con sus interruptores');
    t.has(await text(p, '#cList'), 'Coach Uno', 'la lista de coaches sigue andando');
    t.eq(await text(p, '#cPagB-s'), '4 páginas · 1 se ve · 1 pausada', 'el resumen: cuántas, cuántas se ven y cuántas pausadas');

    const f1 = await fila(p, 'c1');
    t.has(f1, 'gize.ar/c/toro.fit', 'el link');
    t.has(f1, 'Coach <b>Uno</b>', 'el nombre, como texto (sin HTML)');
    t.has(f1, 'c1@prueba.test', 'el mail del coach');
    t.has(f1, 'Con foto', 'si tiene foto');
    t.has(f1, 'Se ve', 'si se ve');
    t.has(f1, 'toro-viejo', 'los links viejos');
    t.eq(await p.$eval('#cPag tr[data-pag="c1"] a', a => [a.href, a.target, a.rel]), ['https://gize.ar/c/toro.fit', '_blank', 'noopener noreferrer'], 'el link abre la página en otra pestaña');
    t.has(await fila(p, 'c2'), 'Pausada por GIZE', 'la pausada');
    t.has(await fila(p, 'c2'), 'Sin foto', 'la que no tiene foto');
    t.has(await fila(p, 'c3'), 'Apagada por el coach', 'la que apagó el coach');
    t.has(await fila(p, 'c4'), 'No se ve', 'la que no se ve porque la cuenta no está activa');
    t.eq(await botones(p, 'c1'), ['pausar', 'sin_foto', 'liberar'], 'con foto y sin pausa: Pausar, Sacar foto y Liberar');
    t.eq(await botones(p, 'c2'), ['reanudar', 'liberar'], 'pausada y sin foto: Reanudar y Liberar');

    // Pausar, pero «Cancelar»: no manda nada.
    p.contestar = false;
    await p.click('#cPag tr[data-pag="c1"] [data-v="pausar"]'); await wait(400);
    t.eq(llamadas, [], 'cancelar: no se pausa');
    t.eq([ultima(preguntas).titulo, ultima(preguntas).ok], ['Páginas de coaches', 'Pausar'], 'la pregunta: título y botón');
    t.has(ultima(preguntas).texto, 'gize.ar/c/toro.fit', 'la pregunta dice qué link');
    t.has(ultima(preguntas).texto, 'Deja de verse al instante', 'y qué pasa');
    t.eq(await p.$$eval('.drawer', l => l.length), 0, 'no abre la ficha del coach');

    // Ahora sí: pausar.
    p.contestar = true;
    await p.click('#cPag tr[data-pag="c1"] [data-v="pausar"]'); await wait(500);
    t.eq(llamadas, [{ p_coach: 'c1', p_accion: 'pausar' }], 'pausar: admin_coach_pagina con «pausar»');
    t.has(await fila(p, 'c1'), 'Pausada por GIZE', 'quedó pausada');
    t.eq(await botones(p, 'c1'), ['reanudar', 'sin_foto', 'liberar'], 'ahora tiene Reanudar');
    t.has(toasts.join(' | '), 'Página pausada', 'avisa que quedó pausada');

    // Reanudar: sin preguntar.
    const antes = preguntas.length;
    await p.click('#cPag tr[data-pag="c1"] [data-v="reanudar"]'); await wait(500);
    t.eq(llamadas[1], { p_coach: 'c1', p_accion: 'reanudar' }, 'reanudar: admin_coach_pagina con «reanudar»');
    t.eq(preguntas.length, antes, 'reanudar no pregunta');
    t.has(await fila(p, 'c1'), 'Se ve', 'se ve de nuevo');

    // Sacar la foto.
    await p.click('#cPag tr[data-pag="c1"] [data-v="sin_foto"]'); await wait(500);
    t.eq(llamadas[2], { p_coach: 'c1', p_accion: 'sin_foto' }, 'sacar foto: admin_coach_pagina con «sin_foto»');
    t.eq(ultima(preguntas).ok, 'Sacar foto', 'sacar foto: pregunta antes');
    t.has(ultima(preguntas).texto, 'La página sigue, sin la foto', 'y explica qué pasa');
    t.has(await fila(p, 'c1'), 'Sin foto', 'quedó sin foto');
    t.eq(await botones(p, 'c1'), ['pausar', 'liberar'], 'sin foto: ya no está «Sacar foto»');

    // Liberar: pregunta, y cancelar no manda nada.
    p.contestar = false;
    await p.click('#cPag tr[data-pag="c3"] [data-v="liberar"]'); await wait(400);
    t.eq(llamadas.length, 3, 'liberar y cancelar: no se libera');
    t.eq(ultima(preguntas).ok, 'Liberar', 'liberar pide confirmación');
    t.has(ultima(preguntas).texto, 'No se puede deshacer', 'y avisa que no se puede deshacer');
    p.contestar = true;
    await p.click('#cPag tr[data-pag="c3"] [data-v="liberar"]'); await wait(500);
    t.eq(llamadas[3], { p_coach: 'c3', p_accion: 'liberar' }, 'liberar: admin_coach_pagina con «liberar»');
    t.eq(await p.$$eval('#cPag tr[data-pag="c3"]', l => l.length), 0, 'la página liberada ya no está en la lista');
    t.eq(await text(p, '#cPagB-s'), '3 páginas · 1 se ve · 1 pausada', 'el resumen se actualiza');

    // Si la base dice que no, se ve el motivo y el botón se puede volver a tocar.
    st.fallar = true;
    await p.click('#cPag tr[data-pag="c4"] [data-v="pausar"]'); await wait(500);
    t.eq(llamadas[4], { p_coach: 'c4', p_accion: 'pausar' }, 'pausar: se pide');
    t.has(toasts.join(' | '), 'Ese coach no tiene página', 'avisa por qué no se pudo');
    t.eq(await p.$eval('#cPag tr[data-pag="c4"] [data-v="pausar"]', b => b.disabled), false, 'y se puede volver a tocar');
    t.eq(errs, [], 'errores');
    await close();
  }

  // ===== Sin páginas todavía =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores({ paginas: [] }, []) });
    await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
    t.has(await text(pg.p, '#cPag'), 'Todavía ningún coach armó su página', 'sin páginas: lo dice');
    t.eq(pg.errs, [], 'errores (sin páginas)');
    await pg.close();
  }

  // ===== Sin el SQL en la base =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: manejadores({ paginas: [] }, [], {
      '/admin_coach_paginas': (r, J) => J({ code: 'PGRST202', message: 'Could not find the function public.admin_coach_paginas without parameters in the schema cache' }, 404),
    }) });
    await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
    t.has(await text(pg.p, '#cPag'), 'Falta preparar la base', 'sin el SQL: lo dice');
    t.has(await text(pg.p, '#cPag'), 'supabase/pagina-coach.sql', 'sin el SQL: dice qué correr');
    t.has(await text(pg.p, '#cList'), 'Coach Uno', 'sin el SQL: la lista de coaches sigue andando');
    t.eq(pg.errs, [], 'errores (sin el SQL)');
    await pg.close();
  }

  // ===== En el celular: sin scroll de costado =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 360, height: 780 }, handlers: manejadores({ paginas: PAGINAS() }, []) });
    await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
    t.eq(await pg.p.$$eval('#cPag tr[data-pag]', l => l.length), 4, 'celular: las cuatro páginas');
    t.ok(await pg.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'celular: la página no se corre de costado');
    t.eq(pg.errs, [], 'errores (celular)');
    await pg.close();
  }

  // ===== El registro de acciones (Seguridad) =====
  {
    const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(true),
      '/admin_contact_unread': (r, J) => J(0),
      '/admin_list_admins': (r, J) => J([]),
      '/admin_audit_list': (r, J) => J([
        { action: 'pagina_coach', target: 'c1', target_name: 'Coach Uno', admin_name: 'Admin Prueba', created_at: new Date().toISOString(), detail: { accion: 'sin_foto', alias: 'toro.fit' } },
        { action: 'pagina_coach', target: 'c1', target_name: 'Coach Uno', admin_name: 'Admin Prueba', created_at: new Date().toISOString(), detail: { accion: 'pausar', alias: 'toro.fit' } },
        { action: 'pagina_coach', target: 'c3', target_name: null, admin_name: 'Admin Prueba', created_at: new Date().toISOString(), detail: { accion: 'liberar', alias: 'tres' } }]),
    } });
    await pg.p.route(/api\.github\.com/, x => x.abort()); // las copias de seguridad no importan acá
    await pg.p.goto(base + '/admin/#seguridad'); await wait(1500);
    const aud = await text(pg.p, '#aud');
    t.has(aud, 'Le sacó la foto a la página de un coach', 'registro: sacar la foto');
    t.has(aud, 'Pausó la página de un coach', 'registro: pausar');
    t.has(aud, 'Liberó el link de un coach', 'registro: liberar');
    t.has(aud, 'Coach Uno · gize.ar/c/toro.fit', 'registro: sobre quién y qué link');
    t.has(aud, 'gize.ar/c/tres', 'registro: el link aunque la cuenta ya no esté');
    t.eq(pg.errs, [], 'errores (registro)');
    await pg.close();
  }
}
