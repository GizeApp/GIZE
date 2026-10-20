// Gimnasios, etapa 1 (parte 4): la recepción básica (SPEC §2.10; app/screens/gym/recepcion.js).
// - La cuenta de recepción entra directo: buscar por nombre o DNI (buscar_socio con lo escrito, sin
//   pedir con menos de 2 letras o 3 números), la foto del gimnasio (la de gym-fotos, nunca la de perfil),
//   el semáforo con su motivo y la marca del apto vencido, y nada de montos, entrenos, comidas, chats ni
//   notas. Se sale cerrando la sesión.
// - [Registrar ingreso]: gym_ingreso_manual con un id generado en la app; dos toques seguidos llaman una
//   sola vez; si se corta la red, el reintento manda el mismo id (no duplica); el siguiente ingreso, otro
//   id; «repetido» dice a qué hora entró y que no se anotó otro.
// - Altas: con «La recepción aprueba solicitudes y carga fichas» prendido, [Cargar ficha], la pestaña
//   Solicitudes (aprueba sin leer el equipo) y [Sacar foto] a quien no tiene; apagado, nada de eso.
// - El dueño la abre desde «Recepción» (con altas); el profe, desde su panel, solo con el interruptor y
//   sin altas. Con la recepción pausada (plan vencido hace más de 10 días), el texto del servidor.
// Celular y compu, Oscuro y Claro (capturas en GYM_CAPTURAS).
import { wait, contraste } from './lib.mjs';
import { entrar, entrarProfe, miGimnasio, miGimnasioProfe, DUENA, RECEP, F, G, ID, M, D, busqueda, solicitudes, recTxt, buscarRec, hostTxt, modalTxt, rpcs, storageGym,
  captura, sinScrollHorizontal } from './gym-comun.mjs';

const recepcion = (extra = {}) => miGimnasio('recepcion', Object.assign({ plan: undefined, contadores: undefined, mis_fichas: undefined, mis_socios: undefined }, extra));
const conAltas = on => recepcion({ settings: { recepcion_cobra: false, recepcion_altas: on, profes_recepcion: false, profes_montos: false, aprobar_solas: false, ingreso_horas: 3, profes_extra: 0 } });

export default async function ({ base, t }){
  // ===== La cuenta de recepción, con altas, en el celular y en la compu =====
  for (const [vp, tema] of [[M, 'oscuro'], [D, 'claro'], [M, 'claro'], [D, 'oscuro']]){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    let ingresos = 0, falla = 0;
    const ids = [];
    const pg = await entrar(base, RECEP, { gym: conAltas(true), rol: 'client', nombre: 'Rocío Recepción', vp, tema, touch: vp === M,
      handlers: storageGym(),
      rpc: { buscar_socio: b => busqueda().filter(s => s.nombre.toLowerCase().includes(String(b.q).toLowerCase().slice(0, 4)) || /^\d+$/.test(b.q)),
        gym_ingreso_manual: b => { ids.push(b.id); ingresos++;
          if (falla > 0){ falla--; return { error: 'red', msg: 'Failed to fetch', status: 503 }; }
          return ingresos > 3 ? { id: b.id, result: 'ok', repetido: true, at: new Date(Date.now() - 50 * 60e3).toISOString() } : { id: b.id, result: b.ficha === F.A2 ? 'pausado' : 'ok', repetido: false, at: new Date().toISOString() }; } } });
    const p = pg.p;
    let h = await hostTxt(p);
    t.has(h, 'Recepción de Gimnasio Fuerza', donde + ': la cuenta de recepción entra directo a la recepción');
    t.ok(/Cerrar sesión/.test(h) && !/Inicio|Socios|Profes|Configuración/.test(h), donde + ': sin el panel del dueño, se sale cerrando la sesión');
    t.has(await recTxt(p), 'Escribí el nombre o al menos 3 números del DNI.', donde + ': arranca pidiendo nombre o DNI');
    if (tema === 'oscuro' || vp === D) await captura(p, 'recepcion-vacia-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    // Menos de lo que pide el servidor: no se busca.
    await buscarRec(p, 'm'); await buscarRec(p, '12');
    t.eq(rpcs(pg.st, 'buscar_socio').length, 0, donde + ': con 1 letra o 2 números no se busca');
    t.has(await recTxt(p), 'al menos 2 letras o 3 números', donde + ': y lo dice');
    await buscarRec(p, 'mart');
    t.eq(rpcs(pg.st, 'buscar_socio').map(b => b.q), ['mart'], donde + ': busca una vez con lo escrito (sin un pedido por letra)');
    let r = await recTxt(p);
    t.ok(/Martina Sosa/.test(r) && /Martín Pérez/.test(r) && /Marta Torres/.test(r), donde + ': los tres resultados');
    t.ok(/Activo/.test(r) && /Pausado hasta el 12\/11/.test(r) && /De baja/.test(r) && /Apto médico vencido/.test(r), donde + ': semáforo con su motivo y la marca del apto vencido');
    const colores = await p.$$eval('.gy-rec-lista .gy-sem', l => l.map(e => e.className.replace('gy-sem', '').trim()));
    t.eq(colores, ['verde', 'ambar', 'rojo'], donde + ': verde, ámbar y rojo');
    t.ok(!/\$|monto|cuota|entren|comida|nota|chat|DNI \d/i.test(r.replace(/Nombre o DNI/g, '')), donde + ': sin montos, entrenos, comidas, notas ni chats');
    // La foto del gimnasio (gym-fotos firmada), no la de perfil.
    const fotos = await p.$$eval('.gy-rec-lista img', l => l.map(i => i.getAttribute('src')));
    t.ok(fotos.length === 1 && /gym-fotos/.test(fotos[0]), donde + ': la foto es la del gimnasio (gym-fotos): ' + JSON.stringify(fotos));
    await p.click('[data-rec="elegir"][data-id="' + F.A1 + '"]'); await wait(300);
    r = await recTxt(p);
    t.ok(/Último ingreso: Ayer/.test(r) && /Registrar ingreso/.test(r), donde + ': la ficha elegida con su último ingreso y el botón');
    await captura(p, 'recepcion-resultado-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    // Dos toques seguidos: una sola llamada.
    await p.evaluate(() => { const b = document.querySelector('.gy-rec-res [data-rec="ingreso"]'); b.click(); b.click(); });
    await wait(600);
    t.eq(ingresos, 1, donde + ': dos toques seguidos, un solo ingreso');
    t.has(await recTxt(p), 'Ingreso registrado a las', donde + ': dice que quedó registrado');
    // Se corta la red: el reintento manda el mismo id; después, uno nuevo.
    falla = 1;
    await p.click('[data-rec="elegir"][data-id="' + F.A2 + '"]'); await wait(200);
    await p.click('.gy-rec-res [data-rec="ingreso"]'); await wait(500);
    r = await recTxt(p);
    t.ok(/Reintentar el ingreso/.test(r), donde + ': sin respuesta, el botón ofrece reintentar');
    await p.click('.gy-rec-res [data-rec="ingreso"]'); await wait(500);
    t.eq(ids[1], ids[2], donde + ': el reintento usa el mismo id (si el primero llegó, el servidor no anota otro)');
    t.ok(ids[0] !== ids[1] && /^[0-9a-f-]{36}$/.test(ids[1]), donde + ': cada ingreso nuevo, su propio id');
    t.has(await recTxt(p), 'pero está pausado', donde + ': registrado, avisa que está pausado (no se frena a nadie)');
    const c = await contraste(p, '#coachHost');
    t.ok(c.min >= 4.5, donde + ': todo el texto con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    if (tema === 'oscuro') await captura(p, 'recepcion-pausado-' + (vp === M ? 'cel' : 'compu'));
    // Repetido.
    await p.click('[data-rec="elegir"][data-id="' + F.A1 + '"]'); await wait(200);
    await p.click('.gy-rec-res [data-rec="ingreso"]'); await wait(500);
    r = await recTxt(p);
    t.ok(/Ya entró hoy a las \d\d:\d\d\. Se anota un ingreso cada 3 horas: no se anotó otro\./.test(r), donde + ': repetido: a qué hora entró y que no se anotó otro: ' + r.slice(-160));
    if (tema === 'oscuro') await captura(p, 'recepcion-repetido-' + (vp === M ? 'cel' : 'compu'));
    // Altas: Cargar ficha, Solicitudes y Sacar foto a quien no tiene.
    t.ok(/Cargar ficha/.test(r) && /Solicitudes/.test(r), donde + ': con altas, Cargar ficha y Solicitudes');
    await p.click('[data-rec="elegir"][data-id="' + F.A2 + '"]'); await wait(200);
    t.ok(/Sin foto: sacale una\./.test(await recTxt(p)) && !!await p.$('.gy-rec-res input[type="file"][data-gym-foto="' + F.A2 + '"]'), donde + ': sin foto, «Sin foto: sacale una» y [Sacar foto]');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': sin scroll horizontal');
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ===== Cargar ficha y Solicitudes desde la recepción (con altas) =====
  {
    const pg = await entrar(base, RECEP, { gym: conAltas(true), rol: 'client', nombre: 'Rocío Recepción', vp: M, touch: true,
      rpc: { buscar_socio: () => busqueda(), gym_equipo: () => ({ error: '42501', msg: 'permission denied' }) } });
    const p = pg.p;
    await p.click('.gy-rec-altas [data-gym="sumar"]'); await wait(500);
    t.has(await modalTxt(p), 'Cargar socio', 'Cargar ficha abre la ventana para cargar la ficha');
    await captura(p, 'recepcion-cargar-ficha-cel');
    await p.click('#gymModal .gy-x'); await wait(300);
    await p.click('.gy-rec-altas [data-gym="rec-tab"][data-v="solicitudes"]'); await wait(700);
    let h = await hostTxt(p);
    t.ok(/Tomás Ríos/.test(h) && /Elena Paz/.test(h), 'la pestaña Solicitudes lista los pedidos: ' + h.slice(0, 200));
    t.eq(rpcs(pg.st, 'gym_equipo').length, 0, 'la recepción no pide el equipo (no lo puede leer)');
    const btnOk = await p.$eval('[data-gym="sol-nuevo"][data-id="' + F.A6 + '"]', b => !b.disabled).catch(() => false);
    t.ok(btnOk, 'puede aprobar (sin profe: lo asigna la administración)');
    await captura(p, 'recepcion-solicitudes-cel');
    await p.click('[data-gym="sol-nuevo"][data-id="' + F.A6 + '"]'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_aprobar').map(b => [b.ficha, b.profe]), [[F.A6, null]], 'aprueba sin profe');
    t.eq(pg.st.rpcs.map(x => x[0]).filter(n => ['gym_socios_resumen', 'gym_equipo', 'gym_invitaciones'].includes(n)), [], 'después no pide la lista de socios ni el equipo (no son de la recepción): ' + pg.st.rpcs.map(x => x[0]).join(', '));
    await p.click('[data-gym="rec-tab"][data-v="recepcion"]'); await wait(300);
    t.ok(!!await p.$('input[data-rec-q]'), 'vuelve a la recepción');
    t.eq(pg.errs, [], 'altas: sin errores');
    await pg.close();
  }

  // ===== Sin altas: ni cargar fichas, ni solicitudes, ni fotos =====
  {
    const pg = await entrar(base, RECEP, { gym: conAltas(false), rol: 'client', nombre: 'Rocío Recepción', vp: M, touch: true, rpc: { buscar_socio: () => busqueda() } });
    const p = pg.p;
    await buscarRec(p, 'mart');
    await p.click('[data-rec="elegir"][data-id="' + F.A2 + '"]'); await wait(200);
    const h = await hostTxt(p);
    t.ok(!/Cargar ficha|Solicitudes|Sacar foto|sacale una/.test(h), 'sin altas: sin Cargar ficha, Solicitudes ni Sacar foto: ' + h.slice(0, 300));
    t.has(h, 'Sin foto del gimnasio.', 'sin altas: solo dice que no tiene foto');
    await pg.close();
  }

  // ===== La recepción pausada (plan vencido hace más de 10 días): el texto del servidor =====
  {
    const pg = await entrar(base, RECEP, { gym: conAltas(true), rol: 'client', vp: D,
      rpc: { buscar_socio: () => ({ error: 'P0001', msg: 'La recepción está pausada: hablá con la administración del gimnasio.' }) } });
    await buscarRec(pg.p, 'mart');
    t.has(await recTxt(pg.p), 'La recepción está pausada: hablá con la administración del gimnasio.', 'con la recepción pausada, el texto del servidor (sin hablar del plan)');
    t.has(await recTxt(pg.p), 'Reintentar', 'y se puede reintentar');
    await pg.close();
  }

  // ===== El dueño, desde «Recepción» de su panel =====
  {
    const pg = await entrar(base, DUENA, { vp: D, rpc: { buscar_socio: () => busqueda(), gym_ingreso_manual: b => ({ id: b.id, result: 'ok', repetido: false, at: new Date().toISOString() }) } });
    const p = pg.p;
    await p.evaluate(() => document.querySelector('#coachHost [data-gym="ir"][data-v="recepcion"]').click()); await wait(600);
    const h = await hostTxt(p);
    t.ok(/Recepción/.test(h) && /Buscá por nombre o DNI/.test(h) && /Cargar ficha/.test(h) && /Solicitudes/.test(h), 'el dueño abre la recepción en su panel, con altas');
    t.ok(!/Llega en la próxima actualización/.test(h), 'ya no es un cartel');
    await buscarRec(p, 'mart');
    await p.click('[data-rec="elegir"][data-id="' + F.A1 + '"]'); await wait(200);
    await p.click('.gy-rec-res [data-rec="ingreso"]'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_ingreso_manual').length, 1, 'el dueño registra el ingreso');
    t.ok(await p.evaluate(() => localStorage.getItem('gize_gym_recepcion_vista') === '1'), 'usarla tacha «Probá la recepción» de Inicio');
    await captura(p, 'recepcion-duena-compu');
    // Solicitudes, desde la recepción del dueño, va a Socios → Solicitudes.
    await p.click('.gy-rec-altas [data-v="solicitudes"]'); await wait(700);
    t.has(await hostTxt(p), 'Tomás Ríos', 'Solicitudes lleva a Socios → Solicitudes');
    t.eq(pg.errs, [], 'dueño: sin errores');
    await pg.close();
  }

  // ===== El profe: solo con el interruptor, y sin altas =====
  {
    let pg = await entrarProfe(base, { vp: D });
    t.ok(!await pg.p.$('[data-coach="gym-recepcion"]'), 'profe sin el interruptor: no tiene «Recepción»');
    await pg.close();
    const gym = miGimnasioProfe({ settings: { recepcion_altas: true, profes_recepcion: true, ingreso_horas: 2 } });
    pg = await entrarProfe(base, { gym, vp: D, rpc: { buscar_socio: () => busqueda(), gym_ingreso_manual: b => ({ id: b.id, result: 'ok', repetido: true, at: new Date().toISOString() }) } });
    const p = pg.p;
    await p.click('[data-coach="gym-recepcion"]'); await wait(1200);
    let h = await hostTxt(p);
    t.ok(/Recepción/.test(h) && /registrá el ingreso en Gimnasio Fuerza/.test(h), 'profe con el interruptor: abre la recepción en su panel');
    t.ok(await p.evaluate(() => document.activeElement && document.activeElement.matches('input[data-rec-q]')), 'el buscador queda con el foco');
    await buscarRec(p, 'mart');
    await p.click('[data-rec="elegir"][data-id="' + F.A2 + '"]'); await wait(200);
    h = await hostTxt(p);
    t.ok(!/Cargar ficha|Solicitudes|Sacar foto/.test(h), 'el profe no carga fichas, ni aprueba, ni saca fotos');
    await p.click('.gy-rec-res [data-rec="ingreso"]'); await wait(500);
    t.has(await recTxt(p), 'Se anota un ingreso cada 2 horas', 'repetido con las horas del gimnasio');
    await captura(p, 'recepcion-profe-compu');
    await p.click('[data-coach="view-clients"]'); await wait(500);
    t.has((await hostTxt(p)).toLowerCase(), 'socios de gimnasio fuerza', 'vuelve a Clientes por la barra');
    t.eq(pg.errs, [], 'profe: sin errores');
    await pg.close();
  }
}
