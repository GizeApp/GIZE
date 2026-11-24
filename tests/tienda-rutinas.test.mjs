// Tienda de rutinas (app/screens/tienda-rutinas.js, app/core/tienda-datos.js, supabase/tienda-rutinas.sql).
// Con una base simulada que se comporta como las funciones de la Tienda:
//   · Interruptor: el botón de arriba (al lado de la racha) se ve solo si la base dice que está prendida en esta
//     plataforma (web / Android / iPhone); apagada o sin la función, no hay botón.
//   · Se entra desde ese botón, se filtra y se busca, se abre el detalle (con sus días). «Agregar a mis
//     rutinas» la guarda en Mis rutinas sin tocar Entreno, y la base suma 1. «Usar» (sin coach) la pone en
//     Entreno sin preguntar, sin kilos ni notas y marcada «origen: tienda»; la rutina propia que tenía
//     queda como «Tu rutina anterior». Borrar la saca de Mis rutinas.
//   · Todo es gratis: no hay precios en ninguna plataforma (AGENTS.md). Ya sin el cartel «Muy pronto».
//   · Publicar sube la rutina actual limpia (sin kilos ni notas); si la base falla, el mensaje se ve y se puede reintentar.
//     No deja publicar una rutina que vino de la Tienda o del coach.
//   · Sacar una propia y denunciar una ajena; la oculta por la base solo la ve su creador, «En revisión».
//   · Con coach asignado la Tienda también se ve: al agregar avisa que usarla lo desvincula, y al usarla
//     pide confirmar, lo deja (coach_id null) y pone la rutina; la del coach no se guarda como suya.
import { newPage, wait, saved, text, ALUMNO, profile, CON_COACH } from './lib.mjs';

const MIA = [{ id: 'da', name: 'Mi día', subtitle: '', note: 'nota mía', exercises: [{ id: 'ea', name: 'Sentadilla en Smith', mus: 'cuadriceps', note: 'solo mía', sets: [{ id: 'sa', kg: '100', reps: '8', target: '6-8', done: true }] }] }];
const SIN_RUTINA = [{ id: 'dv', name: 'Día 1', subtitle: '', exercises: [] }];
const NATIVA = (plat) => `window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plat}' };`;

const serie = (n) => ({ id: 's' + n, kg: '', reps: '', targetKg: '', done: false, target: '8-12' });
const dia = (id, name, ejs) => ({ id, name, subtitle: '', exercises: ejs.map((e, i) => ({ id: id + 'e' + i, name: e, mus: 'pecho', rir: '2-1', rest: "2'", sets: [serie(1), serie(2)] })) });
const DIAS_FB = [dia('f1', 'Día A', ['Press de banca plano (barra)', 'Remo con barra']), dia('f2', 'Día B', ['Sentadilla libre']), dia('f3', 'Día C', ['Prensa 45', 'Jalón al pecho', 'Curl con barra Z'])];

// La «base»: lo que guardaría tienda_rutinas.
function ficha(r, yo){
  return { id: r.id, titulo: r.titulo, descripcion: r.descripcion || '', nivel: r.nivel, objetivo: r.objetivo, autor: r.autor, verificado: !!r.verificado, destacada: !!r.destacada,
    agregadas: r.agregadas || 0, dias: r.days.filter(d => d.exercises.length).length, ejercicios: r.days.reduce((n, d) => n + d.exercises.length, 0),
    estado: r.estado || 'activa', mia: r.autor_id === yo, agregue: !!(r.enMis), reporte: (r.reportaron || []).includes(yo) };
}
// Una de Mis rutinas como la devuelve tienda_mis.
const fichaMia = m => ({ id: m.id, rutina_id: m.rutina_id || null, origen: m.origen, titulo: m.titulo, autor: m.autor || '', nivel: m.nivel || '', objetivo: m.objetivo || '',
  dias: m.days.filter(d => (d.exercises || []).length).length, ejercicios: m.days.reduce((n, d) => n + (d.exercises || []).length, 0) });
function base(extra = {}){
  const b = {
    cfg: { web: true, android: false, ios: false }, falla: null, llamadas: [], mis: [], anteriores: [], coach: null,
    rutinas: [
      { id: 'r1', titulo: 'Fuerza Base', autor: 'Mati Quiroga', autor_id: 'otro1', nivel: 'Principiante', objetivo: 'Fuerza', agregadas: 12, verificado: true, destacada: true, days: DIAS_FB, descripcion: 'Simple y pareja.' },
      { id: 'r2', titulo: 'Glúteos en casa', autor: 'Cami Fernández', autor_id: 'otro2', nivel: 'Intermedio', objetivo: 'Glúteos', agregadas: 1, days: DIAS_FB.slice(0, 2) },
      { id: 'r3', titulo: 'Oculta ajena', autor: 'Alguien', autor_id: 'otro3', nivel: 'Avanzado', objetivo: 'Hipertrofia', estado: 'oculta', days: DIAS_FB.slice(0, 1) }
    ],
    ...extra
  };
  const cuerpo = i => { try { return JSON.parse(i.body || '{}'); } catch (e) { return {}; } };
  const yo = ALUMNO.id;
  const visibles = () => b.rutinas.filter(r => r.estado !== 'oculta' || r.autor_id === yo);
  const rpc = (nombre, fn) => ['/rpc/' + nombre, (r, J, i) => {
    b.llamadas.push(nombre);
    if (b.falla && b.falla[nombre]) return J({ message: b.falla[nombre], code: 'P0001' }, 400);
    const res = fn(cuerpo(i));
    if (res && res.error) return J({ message: res.error, code: 'P0001' }, 400);
    return J(res);
  }];
  // El perfil, con su coach (b.coach): «dejar a tu coach» lo pone en null (PATCH a profiles).
  const perfilVivo = (r, J, i) => {
    if (i.m === 'PATCH') { const c = cuerpo(i); if ('coach_id' in c) { b.coach = c.coach_id; b.dejo = true; } return J([]); }
    if (i.m !== 'GET') return undefined;
    const me = { id: yo, role: 'client', full_name: 'Prueba', coach_id: b.coach };
    return J(i.one ? me : [me]);
  };
  // La rutina de la nube (routines): la que armó el coach (b.nube); lo que la app sube queda en b.subidas.
  const rutinas = (r, J, i) => {
    if (i.m === 'GET') return b.nube ? J(i.one ? { days: b.nube, updated_at: '2026-11-01T00:00:00Z' } : [{ days: b.nube }]) : J(i.one ? null : []);
    const c = cuerpo(i); (b.subidas = b.subidas || []).push(Array.isArray(c) ? c[0] : c); return J([]);
  };
  b.handlers = Object.fromEntries([
    rpc('tienda_config', () => b.cfg),
    rpc('tienda_listar', () => visibles().map(r => ficha(r, yo))),
    rpc('tienda_detalle', p => { const r = visibles().find(x => x.id === p.p_id); return r ? { ...ficha(r, yo), days: r.days } : null; }),
    rpc('tienda_agregar', p => {
      const r = visibles().find(x => x.id === p.p_id); (r.agregaron = r.agregaron || []);
      if (!r.agregaron.includes(yo)) { r.agregaron.push(yo); r.agregadas = (r.agregadas || 0) + 1; }
      let m = b.mis.find(x => x.rutina_id === r.id);
      if (!m) { m = { id: 'm' + (b.mis.length + 1), rutina_id: r.id, origen: 'tienda', titulo: r.titulo, autor: r.autor, nivel: r.nivel, objetivo: r.objetivo, days: r.days }; b.mis.unshift(m); }
      r.enMis = true; return fichaMia(m);
    }),
    rpc('tienda_mis', () => b.mis.map(fichaMia)),
    rpc('tienda_usar', p => {
      if (b.coach) return { error: 'Para usar una rutina de la Tienda primero tenés que dejar a tu coach.' };
      const m = b.mis.find(x => x.id === p.p_id); b.usada = p.p_id; return { ...fichaMia(m), days: m.days };
    }),
    rpc('tienda_mis_borrar', p => { b.mis = b.mis.filter(x => x.id !== p.p_id); b.rutinas.forEach(r => { if (!b.mis.some(m => m.rutina_id === r.id)) r.enMis = false; }); return null; }),
    rpc('tienda_guardar_anterior', p => {
      b.anteriores.push(p.p_days);
      if (p.p_days.some(d => d.origen) || !p.p_days.some(d => (d.exercises || []).length)) return null;
      const m = { id: 'a' + b.anteriores.length, origen: 'anterior', titulo: 'Tu rutina anterior', days: p.p_days }; b.mis.unshift(m); return fichaMia(m);
    }),
    rpc('tienda_publicar', p => {
      b.publicado = p;
      const r = { id: 'nuevo' + b.rutinas.length, titulo: p.p_titulo, descripcion: p.p_descripcion, nivel: p.p_nivel, objetivo: p.p_objetivo, autor: 'Alumno Prueba', autor_id: yo, days: p.p_days };
      b.rutinas.push(r); return ficha(r, yo);
    }),
    rpc('tienda_despublicar', p => { b.rutinas = b.rutinas.filter(r => r.id !== p.p_id); return null; }),
    rpc('tienda_reportar', p => { b.reporte = p; const r = b.rutinas.find(x => x.id === p.p_id); (r.reportaron = r.reportaron || []).push(yo); return null; }),
    ['/profiles', b.conPerfil ? perfilVivo : profile('client')],
    ...(b.conPerfil ? [['/routines', rutinas]] : [])
  ]);
  return b;
}

async function abrir(url, { b = base(), days = MIA, init } = {}){
  const pg = await newPage({ user: ALUMNO, state: { days }, handlers: b.handlers, init });
  await pg.p.goto(url + '/app/'); await wait(2500);
  pg.b = b; return pg;
}
const cuantas = p => p.$$eval('#tnLista .tn-item', l => l.length);
const titulos = p => p.$$eval('#tnLista .tn-item-t', l => l.map(e => e.textContent));
// Se entra por el botón de la barra de arriba, al lado de la racha. Abajo en Entreno ya no hay botón.
const ENTRENO = '.load-def[data-action="tienda-open"]', ARRIBA = '#tiendaBtn';
const entrar = async p => { await p.click(ARRIBA); await wait(500); };

export default async function ({ base: url, t }){
  // a) Apagada (o sin la función en la base): Entreno no muestra el botón.
  {
    const b = base({ cfg: { web: false, android: false, ios: false } });
    const pg = await abrir(url, { b }), p = pg.p;
    t.ok(!(await p.$(ENTRENO)), 'apagada: Entreno no muestra la Tienda');
    t.ok(!(await p.isVisible(ARRIBA)), 'apagada: la barra de arriba no muestra la Tienda');
    t.eq(pg.errs, [], 'apagada: errores de la página');
    await pg.close();
    const sin = base(); sin.handlers['/rpc/tienda_config'] = (r, J) => J({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    const pg2 = await abrir(url, { b: sin });
    t.ok(!(await pg2.p.$(ENTRENO)) && !(await pg2.p.isVisible(ARRIBA)), 'sin la función en la base: no se ve la Tienda');
    t.eq(pg2.errs, [], 'sin la función: errores de la página');
    await pg2.close();
  }

  // b) Prendida en la web: entrar, filtrar, buscar, abrir una y agregarla.
  {
    const pg = await abrir(url), p = pg.p, b = pg.b;
    t.ok(!(await p.$(ENTRENO)), 'Entreno ya no tiene el botón de abajo: se entra por el de arriba');
    t.ok(await p.isVisible(ARRIBA), 'prendida: la barra de arriba muestra el botón de la Tienda');
    t.eq(await p.getAttribute(ARRIBA, 'aria-label'), 'Tienda de rutinas', 'el botón de arriba dice qué es');
    t.ok(!/muy pronto/i.test(await p.getAttribute(ARRIBA, 'aria-label')), 'el botón no lleva el cartel «Muy pronto»');
    await p.click(ARRIBA); await wait(500);
    t.ok(await p.$eval(ARRIBA, e => e.classList.contains('on')), 'el botón de arriba entra a la Tienda y queda marcado');
    t.ok(/Tienda/.test(await text(p, '#view .form-title')), 'entra a la Tienda');
    t.eq(await cuantas(p), 2, 'lista las rutinas activas (la oculta ajena no se ve)');
    t.ok(!/\$/.test(await text(p, '#view')), 'sin precios');
    t.ok(!/muy pronto/i.test(await text(p, '#view')) && !(await p.$('.tn-banner')), 'la Tienda ya no muestra el cartel «Muy pronto»');
    t.ok(/destacada/i.test(await text(p, '#view')), 'muestra la destacada');
    await p.click('[data-action="tienda-cat"][data-v="Glúteos"]'); await wait(200);
    t.eq(await titulos(p), ['Glúteos en casa'], 'filtro por objetivo');
    await p.click('[data-action="tienda-cat"][data-v="Todas"]'); await wait(200);
    await p.fill('#tnQ', 'cami'); await wait(200);
    t.eq(await titulos(p), ['Glúteos en casa'], 'buscar «cami»: encuentra la rutina de esa creadora');
    t.ok(await p.isVisible('#tnQ'), 'buscar: el campo sigue en pantalla (no se redibuja)');
    await p.fill('#tnQ', 'zzz'); await wait(200);
    t.ok(/No hay rutinas/.test(await text(p, '#tnLista')), 'buscar algo que no existe: avisa que no hay');
    await p.fill('#tnQ', ''); await wait(200);

    await p.click('#tnLista [data-action="tienda-ver"][data-id="r1"]'); await wait(500);
    t.ok(/Fuerza Base/.test(await text(p, '#view .form-title')), 'detalle: título');
    t.eq(await p.$$eval('.tn-day', l => l.length), 3, 'detalle: lista los 3 días');
    t.ok(/Mati Quiroga/.test(await text(p, '.tn-hero-foot')), 'detalle: el creador');
    await p.click('[data-action="tienda-agregar"]'); await wait(300);
    t.ok(/Se guarda en Mis rutinas.*Tu rutina de hoy no cambia/.test(await text(p, '#sheetHost')), 'agregar: avisa que se guarda en Mis rutinas sin tocar la de hoy');
    t.ok(!/desvincul/i.test(await text(p, '#sheetHost')), 'agregar sin coach: no habla de desvincularse');
    await p.click('[data-action="tienda-cancel"].ctrl'); await wait(300);
    t.ok(!b.llamadas.includes('tienda_agregar'), 'cancelar: no le avisa a la base');
    await p.click('[data-action="tienda-agregar"]'); await wait(300);
    await p.click('[data-action="tienda-agregar-ok"]'); await wait(600);
    t.eq((await saved(p)).days.map(d => d.name), ['Mi día'], 'agregar: la rutina de Entreno sigue igual');
    t.eq(b.mis.map(m => m.titulo), ['Fuerza Base'], 'agregar: queda en Mis rutinas');
    t.eq(b.rutinas[0].agregadas, 13, 'agregar: la base la cuenta una vez');
    t.ok(/¡Agregada!.*Mis rutinas/.test(await text(p, '#sheetHost')), 'agregar: «¡Agregada!», en Mis rutinas');

    // «Usarla ahora»: sin coach no pregunta nada; la propia queda como «Tu rutina anterior».
    await p.click('#sheetHost [data-action="tienda-usar"]'); await wait(700);
    const st = await saved(p);
    t.eq(st.days.map(d => d.name), ['Día A', 'Día B', 'Día C'], 'usar: quedan los días de la rutina');
    t.ok(st.days.every(d => d.exercises.length && d.exercises.every(e => e.sets.every(s => s.kg === '' && !s.done))), 'usar: con series vacías');
    t.ok(st.days.every(d => d.origen === 'tienda'), 'usar: los días quedan marcados como de la Tienda');
    t.eq(b.anteriores.length, 1, 'usar: guarda la rutina que tenía');
    t.eq(b.anteriores[0].map(d => d.name), ['Mi día'], 'usar: la anterior es la que tenía');
    t.eq(b.anteriores[0][0].exercises[0].sets[0].kg, '100', 'usar: la anterior va tal cual, con sus kilos (es suya)');
    t.ok(/¡Lista en Entreno!.*Tu rutina anterior/.test(await text(p, '#sheetHost')), 'usar: lo dice, y que la anterior quedó guardada');
    await p.click('[data-action="tienda-ir"]'); await wait(400);
    t.ok(await p.isVisible('.tabs .tab.active'), 'ir a Entreno: se ve Entreno con sus días');
    t.ok(!(await p.$('#view .form-title')), 'ir a Entreno: ya no está la Tienda');

    await entrar(p);
    await p.click('[data-action="tienda-tab"][data-v="mias"]'); await wait(300);
    t.ok(/Tu rutina anterior.*Fuerza Base/.test(await text(p, '#tnMis')), 'Mis rutinas: la anterior y la agregada');
    // Volver a la anterior: vuelve tal cual; la de la Tienda no se guarda como anterior.
    await p.click('#tnMis [data-action="tienda-usar"][data-mia="a1"]'); await wait(700);
    const st2 = await saved(p);
    t.eq(st2.days.map(d => d.name), ['Mi día'], 'usar la anterior: vuelve su rutina');
    t.eq(st2.days[0].exercises[0].sets[0].kg, '100', 'usar la anterior: con sus kilos');
    t.ok(!st2.days.some(d => d.origen), 'usar la anterior: sin la marca de la Tienda');
    t.eq(b.anteriores.length, 1, 'usar la anterior: la de la Tienda no se guarda como anterior');
    t.ok(!/Tu rutina anterior»/.test(await text(p, '#sheetHost .tn-sheet-p')), 'usar la anterior: no dice que guardó otra');
    await p.click('[data-action="tienda-cancel"]'); await wait(300);
    // Borrar de Mis rutinas.
    await p.click('#tnMis [data-action="tienda-borrar"][data-mia="m1"]'); await wait(300);
    t.ok(/Borrar de Mis rutinas/.test(await text(p, '#sheetHost')), 'borrar: pregunta');
    await p.click('[data-action="tienda-borrar-ok"]'); await wait(600);
    t.ok(!b.mis.some(m => m.id === 'm1') && !/Fuerza Base/.test(await text(p, '#tnMis')), 'borrar: sale de Mis rutinas');
    t.eq(pg.errs, [], 'prendida: errores de la página');
    await pg.close();
  }

  // c) El «‹» vuelve paso a paso.
  {
    const pg = await abrir(url), p = pg.p;
    await entrar(p);
    await p.click('#tnLista [data-action="tienda-ver"][data-id="r2"]'); await wait(400);
    await p.click('.form-back'); await wait(300);
    t.ok(/Rutinas de la comunidad/i.test(await text(p, '#view')), 'detalle → «‹» vuelve a la lista');
    await p.click('.form-back'); await wait(300);
    t.ok(await p.isVisible('.tabs .tab.active'), 'lista → «‹» vuelve a Entreno');
    t.eq(pg.errs, [], 'volver: errores de la página');
    await pg.close();
  }

  // d) Apps de iPhone y Android: con su interruptor prendido se ve igual, sin precios; apagado, nada.
  for (const plat of ['ios', 'android']) {
    const apagada = await abrir(url, { init: NATIVA(plat) });
    t.ok(!(await apagada.p.$(ENTRENO)) && !(await apagada.p.isVisible(ARRIBA)), plat + ': apagada (como nace): no hay botón');
    await apagada.close();
    const pg = await abrir(url, { b: base({ cfg: { web: false, android: true, ios: true } }), init: NATIVA(plat) }), p = pg.p;
    await entrar(p);
    t.eq(await cuantas(p), 2, plat + ': prendida: se ven las rutinas');
    t.ok(!/\$|precio|Mercado|Comprar|compra/i.test(await text(p, '#view')), plat + ': sin precios ni compras');
    t.eq(pg.errs, [], plat + ': errores de la página');
    await pg.close();
  }

  // e) Publicar: pide rutina con ejercicios y título; sube la rutina sin kilos ni notas.
  {
    const pg = await abrir(url, { days: SIN_RUTINA }), p = pg.p;
    await entrar(p);
    await p.click('.tn-cta [data-action="tienda-publicar"]'); await wait(300);
    t.ok(/Todavía no tenés una rutina con ejercicios/.test(await text(p, '#view')), 'publicar sin rutina: lo explica');
    await p.fill('#tnNombre', 'Mi rutina'); await wait(150);
    t.ok(await p.$eval('#tnPub', b => b.disabled), 'publicar sin rutina: el botón sigue apagado');
    t.eq(pg.errs, [], 'publicar sin rutina: errores de la página');
    await pg.close();
  }
  {
    const b = base(), pg = await abrir(url, { b }), p = pg.p;
    await entrar(p);
    await p.click('.tn-cta [data-action="tienda-publicar"]'); await wait(300);
    t.ok(/1 días · 1 ejercicios/.test(await text(p, '.tn-pick')), 'publicar: muestra los días y ejercicios de su rutina');
    t.ok(/Alumno|Usuario de GIZE|nombre/i.test(await text(p, '.tn-note')), 'publicar: avisa que se publica con su nombre');
    t.ok(await p.$eval('#tnPub', x => x.disabled), 'publicar: sin título, el botón está apagado');
    await p.fill('#tnNombre', 'Mi Fuerza 1'); await p.fill('#tnDesc', 'Para arrancar'); await wait(150);
    t.ok(await p.isVisible('#tnNombre'), 'publicar: escribir no saca el foco ni redibuja');
    t.eq(await text(p, '#tnCnt'), '13/200', 'publicar: cuenta los caracteres de la descripción');
    await p.click('[data-action="tienda-nivel"][data-v="Avanzado"]'); await wait(200);
    t.eq(await p.$eval('#tnNombre', e => e.value), 'Mi Fuerza 1', 'publicar: elegir el nivel no borra lo escrito');

    // Si la base falla, el mensaje se ve y se puede reintentar.
    b.falla = { tienda_publicar: 'Ya publicaste 10 rutinas. Sacá alguna para publicar otra.' };
    await p.click('#tnPub'); await wait(500);
    t.ok(/Ya publicaste 10 rutinas/.test(await text(p, '#tnErr')), 'publicar: si la base falla, muestra el mensaje');
    t.ok(!(await p.$eval('#tnPub', x => x.disabled)), 'publicar: se puede reintentar');
    t.eq(await p.$eval('#tnNombre', e => e.value), 'Mi Fuerza 1', 'publicar: no pierde lo escrito');
    b.falla = null;
    await p.click('#tnPub'); await wait(600);
    t.ok(/¡Publicada!/.test(await text(p, '#sheetHost')), 'publicar: «¡Publicada!»');
    const sub = b.publicado;
    t.eq([sub.p_titulo, sub.p_descripcion, sub.p_nivel, sub.p_objetivo], ['Mi Fuerza 1', 'Para arrancar', 'Avanzado', 'Fuerza'], 'publicar: manda título, descripción, nivel y objetivo');
    t.ok(sub.p_days.every(d => d.note === undefined && d.exercises.every(e => e.note === undefined && e.sets.every(s => s.kg === '' && s.reps === '' && !s.done))), 'publicar: sin kilos, repeticiones ni notas');
    t.eq(sub.p_days[0].exercises[0].name, 'Sentadilla en Smith', 'publicar: manda los ejercicios');
    await p.click('[data-action="tienda-mis"]'); await wait(400);
    t.ok(/Mi Fuerza 1.*Avanzado/.test(await text(p, '#view')), 'Mis rutinas: aparece la publicada con su nivel');
    t.eq((await saved(p)).days.map(d => d.name), ['Mi día'], 'publicar: no toca su rutina');

    // Sacarla de la Tienda.
    await p.click('#view [data-action="tienda-ver"]:has-text("Mi Fuerza 1")'); await wait(400);
    t.ok(!(await p.$('[data-action="tienda-denunciar"]')), 'propia: no se puede denunciar');
    await p.click('[data-action="tienda-sacar"]'); await wait(300);
    t.ok(/Quienes ya la agregaron la conservan/.test(await text(p, '#sheetHost')), 'sacar: avisa qué pasa con quienes la tienen');
    await p.click('[data-action="tienda-sacar-ok"]'); await wait(600);
    t.ok(!b.rutinas.some(r => r.titulo === 'Mi Fuerza 1'), 'sacar: la base la borra');
    t.ok(/Rutinas de la comunidad|Mis rutinas|Agregadas/i.test(await text(p, '#view')), 'sacar: vuelve a la lista');
    t.eq(pg.errs, [], 'publicar: errores de la página');
    await pg.close();
  }

  // f) Denunciar una ajena, y que una oculta propia figure «En revisión».
  {
    const b = base();
    b.rutinas.push({ id: 'r4', titulo: 'Mía oculta', autor: 'Alumno Prueba', autor_id: ALUMNO.id, nivel: 'Principiante', objetivo: 'Fuerza', estado: 'oculta', days: DIAS_FB.slice(0, 1) });
    const pg = await abrir(url, { b }), p = pg.p;
    await entrar(p);
    t.eq(await cuantas(p), 2, 'la oculta propia no figura en Explorar');
    await p.click('#tnLista [data-action="tienda-ver"][data-id="r2"]'); await wait(400);
    await p.click('[data-action="tienda-denunciar"]'); await wait(300);
    await p.click('[data-action="tienda-motivo"][data-v="spam"]'); await wait(200);
    await p.click('[data-action="tienda-denunciar-ok"]'); await wait(500);
    t.eq([b.reporte.p_id, b.reporte.p_motivo], ['r2', 'spam'], 'denunciar: manda la rutina y el motivo');
    t.ok(/Gracias por avisar/.test(await text(p, '#sheetHost')), 'denunciar: agradece');
    await p.click('[data-action="tienda-cancel"]'); await wait(300);
    t.ok(await p.$eval('[data-action="tienda-denunciar"]', x => x.disabled), 'denunciar: queda «Ya la denunciaste»');
    await p.click('.form-back'); await wait(300);
    await p.click('[data-action="tienda-tab"][data-v="mias"]'); await wait(300);
    t.ok(/Mía oculta.*En revisión/i.test(await text(p, '#view')), 'Mis rutinas: la oculta figura «En revisión»');
    t.eq(pg.errs, [], 'denunciar: errores de la página');
    await pg.close();
  }

  // g) Agregar con falla de la base: avisa y no toca la rutina. Sin conexión a la lista: reintentar.
  {
    const b = base(), pg = await abrir(url, { b }), p = pg.p;
    await entrar(p);
    await p.click('#tnLista [data-action="tienda-ver"][data-id="r1"]'); await wait(400);
    b.falla = { tienda_agregar: 'Esa rutina ya no está en la Tienda.' };
    await p.click('[data-action="tienda-agregar"]'); await wait(300);
    await p.click('[data-action="tienda-agregar-ok"]'); await wait(500);
    t.ok(/ya no está en la Tienda/.test(await text(p, '#sheetHost')), 'agregar con falla: muestra el mensaje');
    t.eq((await saved(p)).days.map(d => d.name), ['Mi día'], 'agregar con falla: la rutina sigue igual');
    t.eq(pg.errs, [], 'agregar con falla: errores de la página');
    await pg.close();
  }
  {
    const b = base(); b.falla = { tienda_listar: 'No hay conexión.' };
    const pg = await abrir(url, { b }), p = pg.p;
    await entrar(p);
    t.ok(/No hay conexión/.test(await text(p, '#view')), 'lista con falla: lo avisa');
    b.falla = null;
    await p.click('[data-action="tienda-reintentar"]'); await wait(500);
    t.eq(await cuantas(p), 2, 'reintentar: aparece la lista');
    await pg.close();
  }

  // h) Con coach: la Tienda se ve y se agrega a Mis rutinas (avisando que usarla lo desvincula). Usarla
  //    pide confirmar; al confirmar lo deja (coach_id null) y pone la rutina. La del coach no se guarda.
  {
    const COACH = [dia('c1', 'Del coach', ['Remo con barra'])];
    const b = base({ conPerfil: true, coach: CON_COACH.coach_id, nube: COACH });
    const pg = await abrir(url, { b, days: COACH }), p = pg.p;
    t.ok(await p.isVisible(ARRIBA) && !(await p.$(ENTRENO)), 'con coach: la barra de arriba muestra la Tienda (abajo no hay botón)');
    await entrar(p);
    t.eq(await cuantas(p), 2, 'con coach: ve las rutinas');
    t.ok(!(await p.$('.tn-cta [data-action="tienda-publicar"]')), 'con coach: no ofrece publicar (su rutina es del coach)');
    await p.click('#tnLista [data-action="tienda-ver"][data-id="r1"]'); await wait(400);
    await p.click('[data-action="tienda-agregar"]'); await wait(300);
    t.ok(/te desvinculás de tu coach/.test(await text(p, '#sheetHost')), 'con coach: al agregar avisa que usarla lo desvincula');
    await p.click('[data-action="tienda-agregar-ok"]'); await wait(600);
    t.eq(b.mis.map(m => m.titulo), ['Fuerza Base'], 'con coach: queda en Mis rutinas');
    t.eq((await saved(p)).days.map(d => d.name), ['Del coach'], 'con coach: agregar no toca la rutina del coach');

    await p.click('#sheetHost [data-action="tienda-usar"]'); await wait(400);
    t.ok(/Dejar a tu coach/.test(await text(p, '#sheetHost .sheet-title')), 'usar con coach: pregunta antes de dejarlo');
    t.ok(/no queda guardada.*pedísela/.test(await text(p, '#sheetHost')), 'usar con coach: avisa que la rutina del coach no se guarda');
    await p.click('[data-action="tienda-cancel"].ctrl'); await wait(300);
    t.ok(!b.dejo && !b.llamadas.includes('tienda_usar'), 'cancelar: no lo deja ni la usa');
    t.eq((await saved(p)).days.map(d => d.name), ['Del coach'], 'cancelar: sigue la rutina del coach');

    t.ok(await p.isVisible('#view [data-action="tienda-usar"]'), 'detalle de una ya agregada: «Usar esta rutina»');
    await p.click('.form-back'); await wait(300);
    await p.click('[data-action="tienda-tab"][data-v="mias"]'); await wait(300);
    t.ok(/te desvinculás/.test(await text(p, '#view .tn-aviso')), 'Mis rutinas con coach: lo recuerda');
    await p.click('#tnMis [data-action="tienda-usar"]'); await wait(300);
    await p.click('[data-action="tienda-usar-ok"]'); await wait(2500);
    t.ok(b.dejo && b.coach === null, 'confirmar: lo desvincula del coach');
    const st = await saved(p);
    t.eq(st.days.map(d => d.name), ['Día A', 'Día B', 'Día C'], 'confirmar: pone la rutina de la Tienda');
    t.ok(st.days.every(d => d.origen === 'tienda'), 'confirmar: marcada como de la Tienda');
    t.ok(!b.anteriores.some(ds => ds.some(d => d.name === 'Del coach')), 'confirmar: la rutina del coach no se guarda como suya');
    t.ok((b.subidas || []).some(x => Array.isArray(x.days) && x.days.some(d => d.name === 'Del coach' && d.origen === 'coach')), 'al dejar al coach, su rutina queda marcada como del coach');
    t.ok(/¡Lista en Entreno!/.test(await text(p, '#sheetHost')), 'confirmar: «¡Lista en Entreno!»');
    await p.click('[data-action="tienda-cancel"].ctrl'); await wait(300);
    await p.click('[data-action="tienda-tab"][data-v="explorar"]'); await wait(300);
    t.ok(await p.isVisible('.tn-cta [data-action="tienda-publicar"]'), 'ya sin coach: ofrece publicar');
    t.eq(pg.errs, [], 'con coach: errores de la página');
    await pg.close();
  }

  // i) No se publica una rutina que no armó la persona: la de la Tienda ni la que le armó su coach.
  for (const [origen, dice] of [['tienda', /es de la Tienda/], ['coach', /la armó tu coach/]]) {
    const b = base(), pg = await abrir(url, { b, days: [{ ...DIAS_FB[0], origen }] }), p = pg.p;
    await entrar(p);
    await p.click('.tn-cta [data-action="tienda-publicar"]'); await wait(300);
    t.ok(dice.test(await text(p, '#view')), 'publicar una rutina de ' + origen + ': lo explica');
    await p.fill('#tnNombre', 'Copiada'); await wait(150);
    t.ok(await p.$eval('#tnPub', x => x.disabled), 'publicar una rutina de ' + origen + ': el botón sigue apagado');
    t.ok(!b.llamadas.includes('tienda_publicar'), 'publicar una rutina de ' + origen + ': no llega a la base');
    t.eq(pg.errs, [], 'publicar una rutina de ' + origen + ': errores de la página');
    await pg.close();
  }
}
