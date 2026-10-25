// Gimnasios, etapa 1: Configuración del gimnasio (SPEC §2.8) y lo que pasa al borrar la cuenta de la
// dueña (§1.6). Datos (gym_config solo con lo que cambió), código (copiar, link, QR para imprimir,
// cambiar con gym_codigo_rotar), profe por defecto, los tres interruptores de la etapa 1 (aprobar solas,
// la recepción aprueba y carga fichas, los profes abren la recepción) y, desde la etapa 2, «La recepción
// registra pagos» (ninguno para que los profes vean montos: nunca los ven), un
// ingreso cada N horas, privacidad (sin opción de leer chats), contrato de encargo, marca próximamente,
// exportar (CSV), y la zona de cuidado solo para la dueña (cambio de dueño por WhatsApp, cerrar
// escribiendo el nombre). Al eliminar su cuenta, la dueña ve que se cierra el gimnasio y puede exportar.
import fs from 'node:fs';
import { wait } from './lib.mjs';
import { entrar, miGimnasio, DUENA, ADMIN_G, ID, hostTxt, modalTxt, rpcs, ir } from './gym-comun.mjs';

export default async function ({ base, t }){
  {
    const pg = await entrar(base, DUENA), p = pg.p;
    await ir(p, 'config'); await wait(400);
    let txt = await hostTxt(p);
    for (const s of ['Datos del gimnasio', 'Código del gimnasio', 'FUERZA22', 'Profe por defecto para las solicitudes', 'Aprobar solas las solicitudes',
      'La recepción aprueba solicitudes y carga fichas', 'Los profes pueden abrir la recepción', 'Un ingreso cada', 'Privacidad', 'Lee el chat de un profe con su socio. No hay ninguna opción para hacerlo.',
      'Contrato de encargo', 'Versión 2026-10-borrador', 'Próximamente: tu logo y tus colores', 'Exportar todo', 'Zona de cuidado', 'Pedir cambio de dueño', 'Cerrar el gimnasio'])
      t.has(txt, s, 'Configuración: «' + s + '»');
    // Etapa 2 (cuotas): llegó «La recepción registra pagos»; el de montos para los profes no existe (los profes nunca ven montos).
    t.has(txt, 'La recepción registra pagos', 'con las cuotas, el interruptor de cobro de la recepción');
    t.ok(!/montos/i.test(txt), 'sin un interruptor de montos para los profes');
    // Datos: solo lo que cambió
    t.ok(await p.isDisabled('#coachHost [data-gym="cfg-guardar"]'), 'sin cambios, «Guardar cambios» apagado');
    await p.fill('#coachHost [data-gym-cfg="city"]', 'Funes'); await p.fill('#coachHost [data-gym-cfg="whatsapp"]', '+54 341 555-1111'); await wait(100);
    await p.click('#coachHost [data-gym="cfg-guardar"]'); await wait(700);
    t.eq(rpcs(pg.st, 'gym_config'), [{ patch: { city: 'Funes', whatsapp: '+54 341 555-1111' } }], 'gym_config con lo que cambió');
    // Interruptores
    await p.click('#coachHost label.gy-sw:has([data-k="aprobar_solas"])'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_config')[1], { patch: { settings: { aprobar_solas: true } } }, '«Aprobar solas»: gym_config con el interruptor');
    t.ok(await p.$eval('#coachHost [data-k="aprobar_solas"]', x => x.checked), 'queda prendido');
    await p.click('#coachHost label.gy-sw:has([data-k="profes_recepcion"])'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_config')[2], { patch: { settings: { profes_recepcion: true } } }, '«Los profes pueden abrir la recepción»');
    await p.selectOption('#coachHost [data-gym="cfg-profe"]', ''); await wait(600);
    t.eq(rpcs(pg.st, 'gym_config')[3], { patch: { default_trainer_id: null } }, 'profe por defecto: «Sin profe»');
    await p.fill('#coachHost [data-gym="cfg-horas"]', '4'); await p.dispatchEvent('#coachHost [data-gym="cfg-horas"]', 'change'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_config')[4], { patch: { settings: { ingreso_horas: 4 } } }, 'un ingreso cada 4 horas');
    // Un P0001 tal cual (y el interruptor vuelve a como estaba)
    await p.route(/rpc\/gym_config/, r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Un ingreso cada 1 a 24 horas.' }) }));
    await p.fill('#coachHost [data-gym="cfg-horas"]', '30'); await p.dispatchEvent('#coachHost [data-gym="cfg-horas"]', 'change'); await wait(600);
    t.ok(pg.dialogs.includes('Un ingreso cada 1 a 24 horas.'), 'el texto del servidor tal cual');
    await p.unroute(/rpc\/gym_config/);
    // Código: QR para imprimir y cambiar
    await p.click('#coachHost [data-gym="qr-imprimir"]'); await wait(900);
    t.ok(await p.$('#gymModal .gy-imprimir svg'), 'QR para imprimir: la ventana con el QR');
    t.has(await modalTxt(p), 'o poné el código FUERZA22', 'con el código');
    await p.click('#gymModal .gy-x'); await wait(200);
    await p.click('#coachHost [data-gym="codigo-rotar"]'); await wait(700);
    t.ok(pg.preguntas.some(q => /deja de servir/.test(q.texto)), 'cambiar el código: avisa que el de ahora deja de servir');
    t.eq(rpcs(pg.st, 'gym_codigo_rotar').length, 1, 'gym_codigo_rotar');
    t.has(await hostTxt(p), 'NUEVO234', 'muestra el código nuevo');
    // Exportar
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#coachHost [data-gym="exportar"][data-v="socios"]')]);
    t.eq(rpcs(pg.st, 'gym_exportar'), [{ tipo: 'socios' }], 'exportar socios: gym_exportar');
    t.ok(dl && /^gimnasio-socios-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()) && /Martina Sosa;30111222;activo/.test(fs.readFileSync(await dl.path(), 'utf8')), 'baja el CSV');
    // Cerrar el gimnasio: escribir el nombre
    p.contestar = q => q.tipo === 'pedir' ? 'Gimnasio Fuerza' : true;
    await p.click('#coachHost [data-gym="cerrar-gym"]'); await wait(900);
    t.eq(rpcs(pg.st, 'gym_cerrar'), [{ confirm: 'Gimnasio Fuerza' }], 'cerrar el gimnasio: gym_cerrar con el nombre escrito');
    t.ok(pg.dialogs.some(d => /quedó cerrado/.test(d)), 'avisa que quedó cerrado');
    t.eq(pg.errs, [], 'sin errores');
    await pg.close();
  }
  // La administración: sin zona de cuidado.
  {
    const pg = await entrar(base, ADMIN_G, { gym: miGimnasio('admin'), rol: 'client' });
    await ir(pg.p, 'config');
    const txt = await hostTxt(pg.p);
    t.ok(!/Zona de cuidado|Cerrar el gimnasio|Pedir cambio de dueño/.test(txt), 'administración: sin zona de cuidado');
    t.has(txt, 'Exportar todo', 'administración: sí exporta');
    await pg.close();
  }
  // Borrar la cuenta de la dueña: el aviso del gimnasio y la oferta de exportar antes.
  {
    const pg = await entrar(base, DUENA), p = pg.p;
    await p.route(/storage\/v1\/object\/list\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    p.contestar = q => q.titulo === 'Se cierra el gimnasio' ? true : false; // exporta, y después cancela el borrado
    const descargas = [];
    p.on('download', d => descargas.push(d.suggestedFilename()));
    await ir(p, 'config');
    await p.click('#coachHost [data-action="cfg-delete-account"]'); await wait(2500);
    const q0 = pg.preguntas[0] || {};
    t.has(q0.texto || '', 'Se cierra el gimnasio «Gimnasio Fuerza»', 'antes de borrar: avisa que se cierra el gimnasio');
    t.has(q0.texto || '', 'pedile a GIZE que lo pase a otra persona', 'y cómo pasarlo a otra persona');
    t.eq([q0.ok, q0.cancelar], ['Exportar todo', 'Seguir sin exportar'], 'ofrece exportar todo');
    t.eq(rpcs(pg.st, 'gym_exportar').map(x => x.tipo), ['socios', 'ingresos', 'equipo'], 'exportar todo: socios, ingresos y equipo');
    t.eq(descargas.length, 3, 'tres CSV');
    t.ok((pg.preguntas[1] || {}).texto && /Se cierra el gimnasio/.test(pg.preguntas[1].texto) && /eliminar tu cuenta de coach/.test(pg.preguntas[1].texto), 'la confirmación de borrar repite lo del gimnasio');
    t.ok(!pg.calls.some(c => /delete_own_account|borrar-audios/.test(c)), 'cancelar no borra nada');
    await pg.close();
  }
}
