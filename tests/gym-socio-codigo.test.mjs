// Gimnasios, etapa 1 (parte 3): «Código de tu coach o gimnasio» en Ajustes (SPEC §1.3). Primero
// gym_codigo_info: el código de un gimnasio abre la hoja (no va a join_coach); el de un coach sigue
// como hoy con join_coach (mismos parámetros y textos); uno que no existe ya quedó anotado como intento
// y no se manda dos veces; sin la función (servidor sin la etapa 1), join_coach como siempre. Cada
// fila de la tabla de §1.3 se ve con el texto del servidor (P0001), tal cual (en iPhone, sin hablar del
// plan). El link #codigo= y el código elegido al registrarse abren la hoja.
import { wait } from './lib.mjs';
import { entrarSocio, miGimnasioSocio, hojaTxt, tarjetaTxt, gymCfgTxt, rpcs, captura, IOS, M, D } from './gym-comun.mjs';

const ERR = m => ({ error: 'P0001', msg: m });
const TITULO = 'Te vas a sumar a «Gimnasio Fuerza» (Rosario).';

// Entra sin gimnasio ni coach, pone el código en Ajustes y toca «Vincular».
async function poner(base, code, o = {}){
  const pg = await entrarSocio(base, Object.assign({ gym: null }, o)), p = pg.p;
  await p.click('#nav-config'); await wait(500);
  await p.fill('#joinCode', code);
  await p.click('[data-auth="join"]'); await wait(o.esperaJoin || 1200);
  return pg;
}
const ultimo = pg => pg.dialogs[pg.dialogs.length - 1];
const nombres = pg => pg.st.rpcs.map(x => x[0]).filter(n => n !== 'mi_gimnasio');

export default async function ({ base, t }){
  // ---- La caja ----
  {
    const pg = await entrarSocio(base, { gym: null, vp: M }), p = pg.p;
    await p.click('#nav-config'); await wait(500);
    t.eq(await p.evaluate(() => [document.getElementById('joinCodeLbl').textContent, document.getElementById('joinCode').placeholder]), ['Código de tu coach o gimnasio', 'Código'], 'la caja dice «Código de tu coach o gimnasio»');
    await captura(p, 'P3-codigo-caja-celular');
    await p.click('[data-auth="join"]'); await wait(500);
    t.eq(ultimo(pg), 'Poné el código de tu coach o de tu gimnasio.', 'sin código: lo pide');
    t.eq(pg.errs, [], 'la caja: sin errores');
    await pg.close();
  }

  // ---- Código de un coach: como hoy ----
  {
    const pg = await poner(base, 'ANAC2345', { rpc: { gym_codigo_info: () => ({ tipo: 'coach', gym: null }), join_coach: () => true } });
    t.eq(nombres(pg), ['gym_codigo_info', 'join_coach'], 'coach: primero de quién es, después join_coach');
    t.eq([rpcs(pg.st, 'gym_codigo_info')[0], rpcs(pg.st, 'join_coach')[0]], [{ code: 'ANAC2345' }, { code: 'ANAC2345' }], 'coach: los mismos parámetros que hoy');
    t.eq(ultimo(pg), '¡Listo! Te vinculaste con tu coach.', 'coach: el mismo «¡Listo!» de hoy');
    t.eq(pg.errs, [], 'coach: sin errores');
    await pg.close();
  }
  // Sin la función (servidor de hoy): join_coach como siempre, con su error si no existe.
  {
    const pg = await poner(base, 'ANAC2345', { rpc: { gym_codigo_info: () => ({ error: 'PGRST202', msg: 'Could not find the function', status: 404 }), join_coach: () => false } });
    t.eq(nombres(pg), ['gym_codigo_info', 'join_coach'], 'sin gym_codigo_info: join_coach como hoy');
    t.eq(ultimo(pg), 'Código inválido. Revisalo con tu coach.', 'sin gym_codigo_info: el mismo aviso de hoy');
    await pg.close();
  }
  // Un código que no existe: ya quedó anotado; no se manda a join_coach (no cuenta dos veces).
  {
    const pg = await poner(base, 'NOEX2345', { rpc: { gym_codigo_info: () => ({ tipo: null, gym: null }), join_coach: () => false } });
    t.eq(nombres(pg), ['gym_codigo_info'], 'no existe: no se llama a join_coach');
    t.eq(ultimo(pg), 'Código inválido. Revisalo con tu coach.', 'no existe: «Código inválido. Revisalo con tu coach.»');
    await pg.close();
  }
  // El tope de intentos (P0001 de gym_codigo_info), tal cual.
  {
    const m = 'Probaste muchos códigos que no existen. Revisalo con tu coach y volvé a intentar en un rato.';
    const pg = await poner(base, 'NOEX2345', { rpc: { gym_codigo_info: () => ERR(m) } });
    t.eq([nombres(pg), ultimo(pg)], [['gym_codigo_info'], m], 'tope de intentos: el texto del servidor y nada más');
    await pg.close();
  }

  // ---- Código de un gimnasio: la hoja, sin join_coach ----
  for (const vp of [M, D]){
    const pg = await poner(base, 'fuerza22', { vp, rpc: { gym_codigo_info: () => ({ tipo: 'gym', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' } }) } }), p = pg.p;
    t.has(await hojaTxt(p), TITULO, 'gimnasio: se abre la hoja «' + TITULO + '»');
    t.eq(nombres(pg), ['gym_codigo_info'], 'gimnasio: no se llama a join_coach');
    await captura(p, 'P3-codigo-hoja-' + (vp === M ? 'celular' : 'compu'));
    t.eq(pg.errs, [], 'gimnasio: sin errores');
    await pg.close();
  }

  // ---- §1.3: lo que dice el servidor, tal cual ----
  const filas = [
    ['profe de gimnasio sin plan propio', 'Ese código es de un profe de Gimnasio Fuerza. Para sumarte al gimnasio, pedí en recepción el código del gimnasio.'],
    ['socio con profe', 'Ya tenés profe en Gimnasio Fuerza. Para cambiar, primero dejá a tu profe en Ajustes → Tu gimnasio.'],
    ['equipo del gimnasio', 'Las cuentas del equipo de un gimnasio no se pueden vincular con un código.'],
    ['gimnasio sin plan para asignar profe', 'Por ahora el gimnasio no puede asignarte profe. Consultá en recepción.'],
    ['bloqueo', 'No podés sumarte con este código.'],
  ];
  for (const [n, m] of filas){
    const pg = await poner(base, 'PROF2345', { rpc: { gym_codigo_info: () => ({ tipo: 'coach', gym: null }), join_coach: () => ERR(m) } });
    t.eq(ultimo(pg), m, n + ': «' + m + '»');
    await pg.close();
  }
  // En iPhone, el del plan vencido sin hablar del plan (core/tienda.js).
  {
    const pg = await poner(base, 'PROF2345', { init: IOS, rpc: { gym_codigo_info: () => ({ tipo: 'coach', gym: null }), join_coach: () => ERR('Tu coach tiene el plan de GIZE vencido: por ahora no puede sumar alumnos. Avisale y volvé a intentar.') } });
    t.eq(ultimo(pg), 'Tu coach no puede sumar alumnos en este momento. Avisale y volvé a intentar.', 'iPhone: sin hablar del plan');
    await pg.close();
  }
  // Un gimnasio por persona, el equipo y los coaches: lo dice gym_unirse al pedir (en la hoja).
  for (const m of ['Ya sos socio de Gimnasio Norte: primero salí desde Ajustes.', 'Ya pediste sumarte a Gimnasio Norte: primero cancelá el pedido desde Ajustes.',
    'Las cuentas del equipo de un gimnasio no se pueden vincular con un código.', 'Gimnasio Fuerza recibió muchos pedidos hoy. Probá de nuevo mañana.']){
    const pg = await poner(base, 'FUERZA22', { rpc: { gym_codigo_info: () => ({ tipo: 'gym', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' } }), gym_unirse: () => ERR(m) } }), p = pg.p;
    await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(700);
    t.eq(await p.evaluate(() => { const e = document.querySelector('#gymSocioHost .gys-err[role="alert"]'); return e ? e.textContent : ''; }), m, 'gym_unirse: «' + m + '» en la hoja');
    t.ok(await p.$('#gymSocioHost [data-gys-h="ok"]:not([disabled])'), 'y se puede volver a intentar o cancelar');
    await pg.close();
  }

  // ---- Socio sin profe: código de un profe del gimnasio → su profe en el gimnasio ----
  {
    const st = { unido: false };
    const pg = await poner(base, 'LUCI2345', { gym: miGimnasioSocio({ profe: null }), esperaJoin: 2000,
      rpc: { gym_codigo_info: () => ({ tipo: 'coach', gym: null }), join_coach: () => { st.unido = true; return true; }, mi_gimnasio: () => miGimnasioSocio(st.unido ? {} : { profe: null }) } }), p = pg.p;
    t.ok(rpcs(pg.st, 'mi_gimnasio').length >= 2, 'socio: después de vincularse se vuelve a preguntar por el gimnasio');
    await p.click('#nav-entreno'); await wait(400);
    t.eq(await tarjetaTxt(p), 'Gimnasio Fuerza · Profe: Lucía', 'socio sin profe + código de un profe del gimnasio: queda su profe');
    await pg.close();
  }
  // ---- Socio sin profe: código de un coach de afuera → coach externo ----
  {
    const st = { unido: false };
    const pg = await poner(base, 'AFUE2345', { gym: miGimnasioSocio({ profe: null }), esperaJoin: 2000,
      rpc: { gym_codigo_info: () => ({ tipo: 'coach', gym: null }), join_coach: () => { st.unido = true; return true; }, mi_gimnasio: () => miGimnasioSocio(st.unido ? { profe: null, coach_externo: true } : { profe: null }) } }), p = pg.p;
    t.has(await gymCfgTxt(p), 'Coach externo', 'socio sin profe + coach de afuera: «Coach externo»');
    await pg.close();
  }

  // ---- El link #codigo= (QR del mostrador), con la sesión iniciada: la hoja ----
  {
    const pg = await entrarSocio(base, { gym: null, url: '/app/#codigo=FUERZA22', espera: 3500, rpc: { gym_codigo_info: () => ({ tipo: 'gym', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' } }) } }), p = pg.p;
    t.has(await hojaTxt(p), TITULO, '#codigo=: abre la hoja');
    t.eq(rpcs(pg.st, 'gym_codigo_info'), [{ code: 'FUERZA22' }], '#codigo=: pregunta por ese código');
    t.eq(await p.evaluate(() => location.hash), '', '#codigo=: el link sale de la dirección');
    t.eq(pg.errs, [], '#codigo=: sin errores');
    await pg.close();
  }
  // ---- El código elegido al registrarse: si es de un gimnasio, la hoja (no join_coach) ----
  {
    const pg = await entrarSocio(base, { gym: null, espera: 3500, init: `localStorage.setItem('jfit_pending_code', JSON.stringify({ c: 'FUERZA22', t: Date.now() }));`,
      rpc: { gym_codigo_info: () => ({ tipo: 'gym', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' } }), join_coach: () => true } }), p = pg.p;
    t.has(await hojaTxt(p), TITULO, 'código al registrarse: abre la hoja');
    t.eq(rpcs(pg.st, 'join_coach'), [], 'código al registrarse: no va a join_coach');
    await pg.close();
  }
  {
    const pg = await entrarSocio(base, { gym: null, espera: 3500, init: `localStorage.setItem('jfit_pending_code', JSON.stringify({ c: 'ANAC2345', t: Date.now() }));`,
      rpc: { gym_codigo_info: () => ({ tipo: 'coach', gym: null }), join_coach: () => true } });
    t.eq(rpcs(pg.st, 'join_coach'), [{ code: 'ANAC2345' }], 'código de coach al registrarse: join_coach como hoy');
    t.eq(await hojaTxt(pg.p), '', 'y sin hoja');
    await pg.close();
  }
}
