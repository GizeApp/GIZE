// Gimnasios, etapa 3: las clases en las pantallas (app/screens/gym/clases.js y lo que tocan).
// - La dueña (panel, «Clases»): la semana con cada clase (hora, profe, sala, lugares, espera, llena y
//   cancelada), ‹ y › para cambiar de semana, la lista de una clase con el presente (del ingreso o
//   marcado), sacar y anotar a un socio, cancelar una fecha (con motivo), crear una clase y archivarla,
//   y cómo se reserva (gym_clases_config).
// - La recepción (su pestaña «Clases»): ve todas, anota, saca y marca el presente; no edita la grilla.
// - El profe (su panel de coach, «Clases»): sus clases y la lista con el presente; no saca ni anota.
// - El socio (Ajustes → Tu gimnasio → Clases): sus próximas reservas en Ajustes y la hoja para
//   reservar, anotarse en la espera y cancelar (pregunta antes); pausado o con la cuota vencida (y el
//   interruptor), mira sin reservar. En iPhone y Android, igual y sin precios.
// Celular y compu, Oscuro y Claro: sin scroll de costado y con contraste de 4,5:1.
import { wait, contraste } from './lib.mjs';
import { entrar, entrarSocio, entrarProfe, miGimnasio, DUENA, RECEP, PROFE, F, ID, IOS, ANDROID, M, D, hostTxt, rpcs, ir, hojaTxt, gymCfgTxt,
  sinScrollHorizontal, captura } from './gym-comun.mjs';

const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ymd = n => { const d = new Date(hoyAR() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ddmm = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const enHoras = h => new Date(Date.now() + h * 36e5).toISOString();
const CS = ID('c51'), CY = ID('c52'), CF = ID('c53'), CP = ID('c54'), CZ = ID('c55');
const R1 = ID('e31'), R2 = ID('e32'), R3 = ID('e33'), R5 = ID('e35'), R6 = ID('e36');
const LUCIA = { id: PROFE.id, name: 'Lucía Profe' }, MARCOS = { id: ID('b2'), name: 'Marcos Profe' };

const clase = (o) => Object.assign({ fecha_id: null, sala: null, cancelada: false, motivo: null, empezo: false, termino: false, archivada: false, confirmadas: 0, espera: 0, presentes: 0 }, o);
const semana = cfg => ({ desde: hoyAR(), hasta: ymd(6), hoy: hoyAR(), cfg: Object.assign({ reservar_horas: 0, cancelar_horas: 2, dias: 7, cuota_bloquea: false }, cfg || {}), clases: [
  clase({ clase: CS, fecha: ymd(0), nombre: 'Spinning', profe: LUCIA, hora: '19:00', fin: '20:00', cupo: 12, sala: 'Sala 1', confirmadas: 12, espera: 2, empezo: true }),
  clase({ clase: CY, fecha: ymd(1), nombre: 'Yoga', profe: MARCOS, hora: '09:00', fin: '09:50', cupo: 10, confirmadas: 3 }),
  clase({ clase: CF, fecha: ymd(2), nombre: 'Funcional', profe: null, hora: '18:00', fin: '19:00', cupo: 15, cancelada: true, motivo: 'Feriado' }),
] });
const alumnos = b => b.clase === CS ? { clase: { id: CS, nombre: 'Spinning', profe: LUCIA, dia: 1, hora: '19:00', duracion: 60, cupo: 12, sala: 'Sala 1' }, fecha: b.dia, hora: '19:00', fin: '20:00',
  cancelada: false, motivo: null, empezo: true, termino: false, se_marca: true, canceladas: 1, alumnos: [
    { reserva: R1, ficha: F.A1, nombre: 'Martina Sosa', foto_path: null, estado: 'confirmada', posicion: null, promovida: false, sin_app: false, ingreso: enHoras(-0.3), marcado: null, presente: true },
    { reserva: R2, ficha: F.A4, nombre: 'Raúl Díaz', foto_path: null, estado: 'confirmada', posicion: null, promovida: true, sin_app: true, ingreso: null, marcado: null, presente: false },
    { reserva: R3, ficha: F.A2, nombre: 'Juan Pérez', foto_path: null, estado: 'espera', posicion: 1, promovida: false, sin_app: false, ingreso: null, marcado: null, presente: null }] }
  : { clase: { id: CY, nombre: 'Yoga', profe: MARCOS, dia: 2, hora: '09:00', duracion: 50, cupo: 10, sala: null }, fecha: b.dia, hora: '09:00', fin: '09:50',
    cancelada: false, motivo: null, empezo: false, termino: false, se_marca: false, canceladas: 0, alumnos: [
      { reserva: R5, ficha: F.A3, nombre: 'Lucía Gómez', foto_path: null, estado: 'confirmada', posicion: null, promovida: false, sin_app: false, ingreso: null, marcado: null, presente: false }] };
const grilla = () => [{ id: CS, nombre: 'Spinning', profe: LUCIA, dia: 1, hora: '19:00', duracion: 60, cupo: 12, sala: 'Sala 1', desde: ymd(-30), archivada: false },
  { id: CY, nombre: 'Yoga', profe: MARCOS, dia: 2, hora: '09:00', duracion: 50, cupo: 10, sala: null, desde: ymd(-30), archivada: false }];
const RPC = () => ({
  gym_clases_semana: b => semana(), gym_clase_alumnos: b => alumnos(b), gym_clases: () => grilla(),
  gym_clase_presente: b => ({ reserva: b.reserva, marcado: b.presente, presente: b.presente === null ? true : b.presente }),
  gym_clase_quitar: () => ({ ok: true, promovidos: 1 }), gym_clase_anotar: b => ({ reserva: ID('e39'), estado: 'espera', posicion: 2, repetida: false }),
  gym_clase_cancelar: b => ({ fecha: ID('d1'), cancelada: b.cancelar, avisados: 3 }), gym_clase_archivar: () => ({ ok: true, avisados: 2 }),
  gym_clase_guardar: b => Object.assign({ id: ID('c59') }, b.datos), gym_clases_config: b => ({ gym: miGimnasio().gym, settings: miGimnasio().settings, clases: semana(Object.fromEntries(Object.entries(b.patch).map(([k, v]) => [k.replace('clases_', ''), v]))).cfg }),
  buscar_socio: () => [{ id: F.A3, nombre: 'Lucía Gómez', foto_path: null, estado: 'activo', semaforo: 'verde', motivo: 'Activo', apto_vencido: false, ultimo_ingreso: null },
    { id: ID('f18'), nombre: 'Lucía Torres', foto_path: null, estado: 'baja', semaforo: 'rojo', motivo: 'De baja', apto_vencido: false, ultimo_ingreso: null }],
});
const abrir = async (p, c, f) => { await p.click('#coachHost [data-gyc="abrir"][data-id="' + c + '"][data-f="' + f + '"]'); await wait(600); };

export default async function ({ base, t }){
  // ===== La dueña: la semana, celular y compu =====
  for (const [vp, tema] of [[D, 'oscuro'], [M, 'claro'], [D, 'claro'], [M, 'oscuro']]){
    const donde = (vp === M ? 'celular' : 'compu') + ', ' + tema;
    const pg = await entrar(base, DUENA, { vp, tema, touch: vp === M, rpc: RPC() }), p = pg.p;
    if (vp === D) t.ok(await p.$('#coachHost [data-gym="ir"][data-v="clases"]'), donde + ': «Clases» en el menú');
    await ir(p, 'clases'); await wait(500);
    let h = await hostTxt(p);
    t.ok(/Clases/.test(h) && /Spinning/.test(h) && /19:00/.test(h) && /Lucía Profe/.test(h) && /Sala 1/.test(h), donde + ': cada clase con su hora, profe y sala: ' + h.slice(0, 300));
    t.ok(/12 de 12 · 2 en espera/.test(h) && /Llena/.test(h), donde + ': los lugares, la espera y «Llena»');
    t.ok(/Funcional/.test(h) && /Cancelada/.test(h) && /Sin profe/.test(h), donde + ': la fecha cancelada y la clase sin profe');
    t.ok(/Hoy/.test(h) && h.includes(ddmm(ymd(1))), donde + ': los días con su fecha');
    t.ok(/La grilla/.test(h) && /Cómo se reserva/.test(h) && /Nueva clase/.test(h), donde + ': la grilla, cómo se reserva y «Nueva clase»');
    t.eq(rpcs(pg.st, 'gym_clases_semana')[0], { desde: hoyAR() }, donde + ': lee la semana desde hoy');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': sin scroll de costado');
    const c = await contraste(p, '#coachHost .cv-main');
    t.ok(c.min >= 4.5, donde + ': todo el texto con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    await captura(p, 'clases-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    // La lista de Spinning (empezó): el presente.
    await abrir(p, CS, ymd(0));
    t.eq(rpcs(pg.st, 'gym_clase_alumnos'), [{ clase: CS, dia: ymd(0) }], donde + ': lee la lista de la clase y la fecha');
    h = await hostTxt(p);
    t.ok(/Martina Sosa/.test(h) && /Presente \(entró \d\d:\d\d\)/.test(h), donde + ': presente del ingreso, con la hora en que entró');
    t.ok(/Raúl Díaz/.test(h) && /Sin app/.test(h) && /Salió de la espera/.test(h) && /Sin presente/.test(h), donde + ': la ficha sin app, que salió de la espera, sin presente');
    t.ok(/Lista de espera/.test(h) && /Juan Pérez/.test(h), donde + ': la lista de espera');
    t.ok(/2 de 12/.test(h) && /1 en espera/.test(h) && /1 presente/.test(h) && /1 canceló/.test(h), donde + ': cuántos tienen lugar, esperan, estuvieron y cancelaron');
    t.ok(!await p.$('#coachHost [data-gyc="cancelar-fecha"]'), donde + ': empezada, no se cancela');
    if (vp === M) t.ok(await sinScrollHorizontal(p), donde + ': la lista sin scroll de costado');
    const cl = await contraste(p, '#coachHost .cv-main');
    t.ok(cl.min >= 4.5, donde + ': la lista con contraste de 4,5:1 o más (mínimo ' + cl.min + ': ' + cl.malos.slice(0, 4).join(' | ') + ')');
    await captura(p, 'clases-lista-' + (vp === M ? 'cel' : 'compu') + '-' + tema);
    await p.click('#coachHost [data-gyc="presente"][data-id="' + R1 + '"][data-v="0"]'); await wait(500);
    t.eq(rpcs(pg.st, 'gym_clase_presente'), [{ reserva: R1, presente: false }], donde + ': «Ausente» a Martina');
    t.ok(/Ausente/.test(await p.$eval('#coachHost .gy-cl-al', e => e.innerText)) && await p.$eval('#coachHost [data-gyc="presente"][data-id="' + R1 + '"]:not([data-v="1"])', e => e.getAttribute('aria-pressed')) === 'true',
      donde + ': queda marcado ausente');
    await p.click('#coachHost [data-gyc="volver"]'); await wait(400);
    t.ok(/La grilla/.test(await hostTxt(p)), donde + ': vuelve a la semana');
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ===== La dueña: sacar, anotar, cancelar una fecha, la grilla y cómo se reserva (compu) =====
  {
    const pg = await entrar(base, DUENA, { rpc: RPC() }), p = pg.p;
    await ir(p, 'clases'); await wait(500);
    await p.click('#coachHost [data-gyc="semana"][data-v="7"]'); await wait(400);
    t.eq(rpcs(pg.st, 'gym_clases_semana').pop(), { desde: ymd(7) }, '› la semana siguiente');
    t.ok(await p.$('#coachHost [data-gyc="semana"][data-v="0"]'), 'y aparece «Hoy»');
    await p.click('#coachHost [data-gyc="semana"][data-v="0"]'); await wait(400);
    t.eq(rpcs(pg.st, 'gym_clases_semana').pop(), { desde: hoyAR() }, '«Hoy» vuelve a esta semana');
    await abrir(p, CS, ymd(0));
    p.contestar = true;
    await p.click('#coachHost [data-gyc="quitar"][data-id="' + R3 + '"]'); await wait(500);
    t.ok(pg.preguntas.some(q => /Sacar a Juan Pérez/.test(q.texto)), 'sacar pregunta antes');
    t.eq(rpcs(pg.st, 'gym_clase_quitar'), [{ reserva: R3 }], 'gym_clase_quitar');
    await p.fill('#coachHost input[data-gyc-q]', 'luc'); await wait(800);
    t.eq(rpcs(pg.st, 'buscar_socio').pop(), { q: 'luc' }, 'anotar: busca por nombre o DNI');
    const ht = await hostTxt(p);
    t.ok(/Lucía Gómez/.test(ht) && !/Lucía Torres/.test(ht), 'anotar: solo socios activos o visitas');
    t.eq(await p.$eval('#coachHost input[data-gyc-q]', i => i.value), 'luc', 'lo escrito queda');
    await p.click('#coachHost [data-gyc="anotar"][data-id="' + F.A3 + '"]'); await wait(700);
    t.eq(rpcs(pg.st, 'gym_clase_anotar'), [{ clase: CS, dia: ymd(0), ficha: F.A3 }], 'gym_clase_anotar con la clase, la fecha y la ficha');
    t.ok(pg.dialogs.some(d => /quedó en la lista de espera \(lugar 2\)/.test(d)), 'llena: avisa que quedó en la espera');
    await p.click('#coachHost [data-gyc="volver"]'); await wait(400);
    // Cancelar una fecha que no empezó.
    await abrir(p, CY, ymd(1));
    p.contestar = q => q.tipo === 'pedir' ? 'Feriado' : true;
    await p.click('#coachHost [data-gyc="cancelar-fecha"]'); await wait(600);
    t.ok(pg.preguntas.some(q => /Cancelar esta fecha/.test(q.titulo) && q.peligro && /le llega un aviso/.test(q.texto)), 'cancelar la fecha pregunta antes (con el aviso)');
    t.eq(rpcs(pg.st, 'gym_clase_cancelar'), [{ clase: CY, dia: ymd(1), motivo: 'Feriado', cancelar: true }], 'gym_clase_cancelar con el motivo');
    t.ok(!await p.$('#coachHost [data-gyc="presente"]'), 'antes de la clase no se marca el presente');
    t.has(await hostTxt(p), 'El presente se marca desde una hora antes', 'y dice desde cuándo');
    await p.click('#coachHost [data-gyc="volver"]'); await wait(400);
    // Nueva clase.
    await p.click('#coachHost [data-gyc="nueva"]'); await wait(500);
    t.ok(await p.isDisabled('#coachHost [data-gyc="guardar"]'), 'nueva clase: sin nombre ni hora, «Guardar» apagado');
    t.ok(rpcs(pg.st, 'gym_equipo').length >= 1, 'lee el equipo para elegir el profe');
    await p.fill('#coachHost [data-gyc-f="nombre"]', '  Pilates '); await p.selectOption('#coachHost [data-gyc-f="profe"]', PROFE.id);
    await p.selectOption('#coachHost [data-gyc-f="dia"]', '3'); await p.fill('#coachHost [data-gyc-f="hora"]', '08:30');
    await p.fill('#coachHost [data-gyc-f="duracion"]', '45'); await p.fill('#coachHost [data-gyc-f="cupo"]', '12'); await p.fill('#coachHost [data-gyc-f="sala"]', 'Sala 2'); await wait(150);
    const cf = await contraste(p, '#coachHost .gy-cl-form');
    t.ok(cf.min >= 4.5, 'el formulario con contraste de 4,5:1 o más (mínimo ' + cf.min + ')');
    await p.click('#coachHost [data-gyc="guardar"]'); await wait(700);
    t.eq(rpcs(pg.st, 'gym_clase_guardar'), [{ id: null, datos: { nombre: 'Pilates', profe: PROFE.id, hora: '08:30', duracion: 45, cupo: 12, sala: 'Sala 2', dia: 3, desde: hoyAR() } }],
      'gym_clase_guardar con todo (el nombre sin espacios)');
    t.ok(!await p.$('#coachHost .gy-cl-form'), 'y se cierra');
    await p.click('#coachHost [data-gyc="editar"][data-id="' + CY + '"]'); await wait(400);
    t.ok(await p.$eval('#coachHost [data-gyc-f="dia"]', s => s.disabled) && await p.$eval('#coachHost [data-gyc-f="nombre"]', i => i.value) === 'Yoga', 'cambiar: con sus datos y sin cambiar el día');
    await p.fill('#coachHost [data-gyc-f="cupo"]', '14'); await p.click('#coachHost [data-gyc="guardar"]'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_clase_guardar')[1], { id: CY, datos: { nombre: 'Yoga', profe: MARCOS.id, hora: '09:00', duracion: 50, cupo: 14, sala: '' } }, 'cambiar el cupo (sin el día)');
    await p.click('#coachHost [data-gyc="archivar"][data-id="' + CS + '"]'); await wait(600);
    t.ok(pg.preguntas.some(q => /Archivar «Spinning»/.test(q.texto)), 'archivar pregunta antes');
    t.eq(rpcs(pg.st, 'gym_clase_archivar'), [{ id: CS }], 'gym_clase_archivar');
    t.ok(pg.dialogs.some(d => /2 personas tenían reserva/.test(d)), 'y dice a cuántos les llegó un aviso');
    // Cómo se reserva.
    await p.fill('#coachHost [data-gyc-cfg="clases_cancelar_horas"]', '4'); await p.press('#coachHost [data-gyc-cfg="clases_cancelar_horas"]', 'Tab'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_clases_config'), [{ patch: { clases_cancelar_horas: 4 } }], '«Se puede cancelar hasta»: gym_clases_config');
    await p.click('#coachHost label.gy-sw:has([data-gyc-cfg="clases_cuota_bloquea"])'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_clases_config')[1], { patch: { clases_cuota_bloquea: true } }, '«No reservar con la cuota vencida»');
    t.ok(await p.$eval('#coachHost [data-gyc-cfg="clases_cuota_bloquea"]', x => x.checked), 'queda prendido');
    t.eq(pg.errs, [], 'sin errores');
    await pg.close();
  }

  // ===== La recepción: su pestaña «Clases» =====
  {
    const g = miGimnasio('recepcion', { plan: undefined, contadores: undefined, mis_fichas: undefined, mis_socios: undefined });
    const pg = await entrar(base, RECEP, { gym: g, rol: 'client', nombre: 'Rocío Recepción', vp: M, touch: true, rpc: RPC() }), p = pg.p;
    t.ok(await p.$('#coachHost [data-gym="rec-tab"][data-v="clases"]'), 'la recepción tiene la pestaña «Clases»');
    await p.click('#coachHost [data-gym="rec-tab"][data-v="clases"]'); await wait(600);
    let h = await hostTxt(p);
    t.ok(/Spinning/.test(h) && /Yoga/.test(h), 've todas las clases');
    t.ok(!/Nueva clase|La grilla|Cómo se reserva/.test(h), 'no edita la grilla ni cómo se reserva');
    t.ok(!rpcs(pg.st, 'gym_clases').length, 'ni lee la grilla');
    await abrir(p, CS, ymd(0));
    t.ok(await p.$('#coachHost [data-gyc="presente"]') && await p.$('#coachHost [data-gyc="quitar"]') && await p.$('#coachHost input[data-gyc-q]'), 'marca el presente, saca y anota');
    t.ok(!await p.$('#coachHost [data-gyc="cancelar-fecha"]'), 'no cancela fechas');
    await p.click('#coachHost [data-gyc="presente"][data-id="' + R2 + '"][data-v="1"]'); await wait(500);
    t.eq(rpcs(pg.st, 'gym_clase_presente'), [{ reserva: R2, presente: true }], 'marca presente a la ficha sin app');
    t.ok(await sinScrollHorizontal(p), 'sin scroll de costado');
    const c = await contraste(p, '#coachHost');
    t.ok(c.min >= 4.5, 'con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    await captura(p, 'clases-recepcion-cel');
    t.eq(pg.errs, [], 'la recepción: sin errores');
    await pg.close();
  }

  // ===== El profe: sus clases =====
  {
    const pg = await entrarProfe(base, { vp: D, rpc: RPC() }), p = pg.p;
    t.ok(await p.$('[data-coach="gym-clases"]'), 'el profe tiene «Clases» en su panel');
    await p.click('[data-coach="gym-clases"]'); await wait(1200);
    let h = await hostTxt(p);
    t.ok(/Clases/.test(h) && /Spinning/.test(h) && /Tus clases en Gimnasio Fuerza/.test(h), 've sus clases: ' + h.slice(0, 200));
    t.ok(!/Nueva clase|La grilla|Cómo se reserva/.test(h), 'no edita la grilla');
    await abrir(p, CS, ymd(0));
    h = await hostTxt(p);
    t.ok(/Martina Sosa/.test(h) && await p.$('#coachHost [data-gyc="presente"]'), 've la lista y marca el presente');
    t.ok(!await p.$('#coachHost [data-gyc="quitar"]') && !await p.$('#coachHost input[data-gyc-q]'), 'no saca ni anota');
    await p.click('#coachHost [data-gyc="presente"][data-id="' + R1 + '"][data-v="1"]'); await wait(500);
    t.eq(rpcs(pg.st, 'gym_clase_presente'), [{ reserva: R1, presente: true }], 'marca presente');
    const c = await contraste(p, '#coachHost .cv-main');
    t.ok(c.min >= 4.5, 'con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
    await captura(p, 'clases-profe-compu');
    t.eq(pg.errs, [], 'el profe: sin errores');
    await pg.close();
  }
  {
    const pg = await entrarSocio(base, { vp: D, rpc: {} }), p = pg.p;
    t.ok(!await p.$('[data-coach="gym-clases"]'), 'un socio no tiene el botón del profe');
    await pg.close();
  }

  // ===== El socio: Ajustes y la hoja de las clases (web y apps) =====
  const c0 = o => Object.assign({ sala: null, cupo: 10, libres: 0, espera: 0, cancelada: false, motivo: null, empezo: false, cierra: enHoras(30), cancela_hasta: enHoras(28),
    reserva: null, estado: null, promovida: false, posicion: null }, o);
  const misClases = extra => Object.assign({ cfg: { reservar_horas: 0, cancelar_horas: 2, dias: 7, cuota_bloquea: false }, hoy: hoyAR(), ficha_estado: 'activo', visita_hasta: null, cuota_vencida: false, clases: [
    c0({ clase: CY, fecha: ymd(1), nombre: 'Yoga', profe: 'Marcos Profe', hora: '09:00', fin: '09:50', libres: 3 }),
    c0({ clase: CS, fecha: ymd(1), nombre: 'Spinning', profe: 'Lucía Profe', hora: '19:00', fin: '20:00', sala: 'Sala 1', cupo: 12, espera: 2 }),
    c0({ clase: CP, fecha: ymd(2), nombre: 'Pilates', profe: 'Lucía Profe', hora: '08:30', fin: '09:15', reserva: R5, estado: 'confirmada', promovida: true }),
    c0({ clase: CF, fecha: ymd(3), nombre: 'Funcional', profe: null, hora: '18:00', fin: '19:00', reserva: R6, estado: 'espera', posicion: 2 }),
    c0({ clase: CZ, fecha: ymd(4), nombre: 'Zumba', profe: null, hora: '20:00', fin: '21:00', cancelada: true, motivo: 'Feriado' }),
  ] }, extra || {});
  for (const [plat, init] of [['web', ''], ['iPhone', IOS], ['Android', ANDROID]]){
    const pg = await entrarSocio(base, { init, vp: M, touch: true, rpc: { gym_mis_clases: () => misClases(),
      gym_reservar: b => b.clase === CY ? { reserva: ID('e40'), estado: 'confirmada', posicion: null, repetida: false } : { reserva: ID('e41'), estado: 'espera', posicion: 3, repetida: false },
      gym_reserva_cancelar: () => ({ ok: true, estado: 'cancelada', promovidos: 1 }) } }), p = pg.p;
    await p.click('#nav-config'); await wait(900);
    let txt = await gymCfgTxt(p);
    t.ok(/Clases/.test(txt) && /Pilates · \w+ /.test(txt) && /¡tenés lugar! Saliste de la espera/.test(txt) && /Funcional/.test(txt) && /en espera \(2°\)/.test(txt),
      plat + ': Ajustes muestra «Clases» y las próximas reservas: ' + txt);
    await p.click('#cfgGym [data-gys="clases"]'); await wait(900);
    let hj = await hojaTxt(p);
    t.ok(/Clases de Gimnasio Fuerza/.test(hj) && /Mañana/.test(hj), plat + ': la hoja con las clases por día: ' + hj.slice(0, 200));
    t.ok(/09:00 · Yoga/.test(hj) && /Quedan 3 lugares/.test(hj) && /Llena · 2 en espera/.test(hj), plat + ': los lugares libres y la espera');
    t.ok(/Reservaste tu lugar|¡Tenés lugar! Saliste de la lista de espera/.test(hj) && /En lista de espera: sos el número 2/.test(hj) && /Cancelada: Feriado/.test(hj), plat + ': su reserva, su lugar en la espera y la cancelada');
    t.ok(/cancelás hasta 2 horas antes/.test(hj), plat + ': dice hasta cuándo se cancela');
    t.ok(!/\$|precio|pag[aá]r|mercado/i.test(hj), plat + ': sin precios ni pagos');
    t.ok(!/Martina Sosa|Juan Pérez/.test(hj), plat + ': sin quién más reservó');
    if (plat === 'web'){
      const c = await contraste(p, '#gymSocioHost .gys-sheet');
      t.ok(c.min >= 4.5, plat + ': la hoja con contraste de 4,5:1 o más (mínimo ' + c.min + ': ' + c.malos.slice(0, 4).join(' | ') + ')');
      t.ok(await sinScrollHorizontal(p), plat + ': sin scroll de costado');
      await captura(p, 'clases-socio-cel');
    }
    await p.click('#gymSocioHost [data-gys-h="reservar"][data-id="' + CY + '"]'); await wait(700);
    t.eq(rpcs(pg.st, 'gym_reservar'), [{ clase: CY, dia: ymd(1) }], plat + ': gym_reservar con la clase y el día');
    t.has(await hojaTxt(p), 'Listo: reservaste tu lugar en Yoga (mañana a las 09:00).', plat + ': dice que reservó');
    await p.click('#gymSocioHost [data-gys-h="reservar"][data-id="' + CS + '"]'); await wait(700);
    t.has(await hojaTxt(p), 'Te anotaste en la lista de espera de Spinning (mañana a las 19:00): sos el número 3.', plat + ': llena: a la espera, con su número');
    p.contestar = true;
    await p.click('#gymSocioHost [data-gys-h="cancelar-reserva"][data-id="' + R5 + '"]'); await wait(700);
    t.ok(pg.preguntas.some(q => /Cancelar tu lugar en Pilates/.test(q.texto)), plat + ': cancelar pregunta antes');
    t.eq(rpcs(pg.st, 'gym_reserva_cancelar'), [{ reserva: R5 }], plat + ': gym_reserva_cancelar');
    t.has(await hojaTxt(p), 'Listo: cancelaste tu reserva.', plat + ': dice que canceló');
    t.ok(rpcs(pg.st, 'gym_mis_clases').length >= 3, plat + ': vuelve a leer las clases');
    t.eq(pg.errs, [], plat + ': sin errores');
    await pg.close();
  }
  // Pausado, con la cuota vencida (y el interruptor) y pasado el límite para cancelar.
  for (const [cual, extra] of [['pausado', { ficha_estado: 'pausado' }], ['cuota', { cuota_vencida: true }]]){
    const pg = await entrarSocio(base, { vp: M, rpc: { gym_mis_clases: () => misClases(extra) } }), p = pg.p;
    await p.click('#nav-config'); await wait(900);
    await p.click('#cfgGym [data-gys="clases"]'); await wait(900);
    const hj = await hojaTxt(p);
    t.ok(cual === 'pausado' ? /Tu lugar en el gimnasio está pausado/.test(hj) : /Tu cuota está vencida: para reservar, hablá con el gimnasio\./.test(hj), cual + ': lo dice');
    t.ok(!await p.$('#gymSocioHost [data-gys-h="reservar"]'), cual + ': mira las clases sin poder reservar');
    t.ok(await p.$('#gymSocioHost [data-gys-h="cancelar-reserva"]'), cual + ': puede cancelar lo que ya tenía');
    await pg.close();
  }
  {
    const L = misClases(); L.clases[2].cancela_hasta = enHoras(-1);
    const pg = await entrarSocio(base, { vp: M, rpc: { gym_mis_clases: () => L } }), p = pg.p;
    await p.click('#nav-config'); await wait(900);
    await p.click('#cfgGym [data-gys="clases"]'); await wait(900);
    t.has(await hojaTxt(p), 'Ya no se puede cancelar desde la app: avisá en el gimnasio.', 'pasado el límite: no se cancela desde la app');
    t.ok(!await p.$('#gymSocioHost [data-gys-h="cancelar-reserva"][data-id="' + R5 + '"]'), 'sin el botón');
    await pg.close();
  }
  {
    const pg = await entrarSocio(base, { vp: M, rpc: { gym_mis_clases: () => misClases({ clases: [] }) } }), p = pg.p;
    await p.click('#nav-config'); await wait(900);
    t.ok(!await p.$('#cfgGym [data-gys="clases"]'), 'un gimnasio sin clases: nada de clases en Ajustes');
    await pg.close();
  }
}
