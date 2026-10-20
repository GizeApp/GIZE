// Gimnasios, etapa 1 (parte 3): el link gize.ar/app/#unirme=<token> de una ficha cargada por el
// gimnasio (SPEC §1.3). Primero gym_unirse_token_info (solo el gimnasio y si pide DNI: nada de la
// ficha); con DNI, los últimos 3 números antes de la hoja; al final gym_unirse_token con la versión
// vigente. 5 errores cortan el link; un link usado o vencido dice «El link ya no sirve: pedile otro al
// gimnasio.». Sin DNI queda un pedido. Sin sesión pide ingresar y, al volver, sigue. Un coach que lo
// abre recibe un aviso (no se suma como socio).
import { wait, newPage, semilla } from './lib.mjs';
import { entrarSocio, miGimnasioSocio, hojaTxt, rpcs, captura, handlersGym, TOKEN, COACH, ALUMNO, M, D } from './gym-comun.mjs';

const GYM = { name: 'Gimnasio Fuerza', city: 'Rosario' };
const LINK = '/app/#unirme=' + TOKEN;
const MUERTO = 'El link ya no sirve: pedile otro al gimnasio.';

// Entra con el link. info: lo de gym_unirse_token_info; token(b, n): lo de gym_unirse_token (n = intento).
function conLink(base, o = {}){
  const st = { fase: null, n: 0 };
  return entrarSocio(base, Object.assign({ gym: null, url: LINK, espera: 3500 }, o, { rpc: Object.assign({
    gym_unirse_token_info: () => o.info || { estado: 'ok', gym: GYM, pide_dni: true },
    gym_unirse_token: b => { st.n++; const v = (o.token || (b => b.dni3 === '222' ? { estado: 'activo', gym: GYM, ficha: 'x' } : { estado: st.n >= 5 ? 'bloqueado' : 'dni_mal', gym: GYM, quedan: Math.max(5 - st.n, 0) }))(b, st.n); if (v.estado === 'activo' || v.estado === 'pendiente') st.fase = v.estado; return v; },
    mi_gimnasio: () => st.fase === 'activo' ? miGimnasioSocio() : st.fase === 'pendiente' ? miGimnasioSocio({ terms: true }, 'pendiente') : null,
  }, o.rpc || {}) })).then(pg => Object.assign(pg, { fase: st }));
}
const dni = async (p, v) => { await p.fill('#gysDni', v); await p.click('#gymSocioHost [data-gys-h="seguir"]'); await wait(300); };
const sumarme = async p => { await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1200); };
const err = p => p.evaluate(() => (document.querySelector('#gymSocioHost .gys-err') || {}).textContent || '');

export default async function ({ base, t }){
  // ---- Con DNI: no muestra nada de la ficha antes del DNI; correcto → socio ----
  for (const vp of [M, D]){
    const donde = vp === M ? 'celular' : 'compu';
    const pg = await conLink(base, { vp, touch: vp === M }), p = pg.p;
    t.eq(rpcs(pg.st, 'gym_unirse_token_info'), [{ token: TOKEN }], donde + ': primero gym_unirse_token_info con el token');
    t.eq(await p.evaluate(() => location.hash), '', donde + ': el token sale de la dirección');
    const txt = await hojaTxt(p);
    t.has(txt, 'Sumate a «Gimnasio Fuerza» (Rosario)', donde + ': el gimnasio');
    t.has(txt, 'los últimos 3 números de tu DNI', donde + ': pide los últimos 3 del DNI');
    t.ok(!/Raúl|Martina|30\.?999|DNI \d|@/.test(txt), donde + ': nada de la ficha (nombre, DNI, mail) antes del DNI');
    t.eq(await p.evaluate(() => document.activeElement && document.activeElement.id), 'gysDni', donde + ': el foco en el campo del DNI');
    await captura(p, 'P3-unirme-dni-' + donde);
    await dni(p, '12');
    t.eq(await err(p), 'Escribí los últimos 3 números de tu DNI.', donde + ': con menos de 3 números, lo pide de nuevo');
    t.eq(rpcs(pg.st, 'gym_unirse_token'), [], donde + ': y no pregunta al servidor');
    await dni(p, '222');
    t.has(await hojaTxt(p), 'Te vas a sumar a «Gimnasio Fuerza» (Rosario).', donde + ': después del DNI, la hoja');
    t.eq(await p.evaluate(() => document.querySelector('#gymSocioHost input[data-gys-in="compartir"]').checked), false, donde + ': la casilla sin marcar');
    t.eq(await p.evaluate(() => [...document.querySelectorAll('#gymSocioHost .sheet-btns button')].map(b => b.textContent)), ['Cancelar', 'Sumarme'], donde + ': [Sumarme]');
    if (vp === M) await captura(p, 'P3-unirme-hoja-celular');
    await sumarme(p);
    t.eq(rpcs(pg.st, 'gym_unirse_token'), [{ token: TOKEN, dni3: '222', hoja_version: '2026-10-borrador', share_admin: false, compartir_version: null }], donde + ': gym_unirse_token con el DNI y la versión vigente');
    t.has(await hojaTxt(p), '¡Listo! Ya sos socio de Gimnasio Fuerza', donde + ': «¡Listo! Ya sos socio»');
    t.eq(pg.errs, [], donde + ': sin errores');
    await pg.close();
  }

  // ---- DNI equivocado: quedan intentos; al quinto el link muere ----
  {
    const pg = await conLink(base), p = pg.p;
    const vistos = [];
    for (let i = 1; i <= 5; i++){
      if (i > 1) t.eq(await p.evaluate(() => document.getElementById('gysDni') && document.getElementById('gysDni').value), '', 'intento ' + i + ': el campo vuelve vacío');
      await dni(p, '999'); await sumarme(p);
      vistos.push(i < 5 ? await err(p) : await hojaTxt(p));
    }
    t.eq(vistos.slice(0, 4), ['Esos números no coinciden. Te quedan 4 intentos.', 'Esos números no coinciden. Te quedan 3 intentos.', 'Esos números no coinciden. Te quedan 2 intentos.', 'Esos números no coinciden. Te queda 1 intento.'], 'cada error dice cuántos intentos quedan');
    t.has(vistos[4], MUERTO, 'al quinto: «' + MUERTO + '»');
    t.eq(rpcs(pg.st, 'gym_unirse_token').length, 5, '5 intentos al servidor');
    await captura(p, 'P3-unirme-muerto');
    t.ok(await p.evaluate(() => !document.getElementById('gysDni')), 'el link muerto ya no pide el DNI');
    t.eq(pg.errs, [], 'intentos: sin errores');
    await pg.close();
  }

  // ---- Link usado o vencido ----
  {
    const pg = await conLink(base, { info: { estado: 'vencido', gym: null, pide_dni: false } }), p = pg.p;
    t.has(await hojaTxt(p), MUERTO, 'vencido o usado: «' + MUERTO + '»');
    t.eq(rpcs(pg.st, 'gym_unirse_token'), [], 'y no se intenta sumar');
    await pg.close();
  }

  // ---- Sin DNI en la ficha: directo a la hoja; queda un pedido ----
  {
    const pg = await conLink(base, { info: { estado: 'ok', gym: GYM, pide_dni: false }, token: () => ({ estado: 'pendiente', gym: GYM }) }), p = pg.p;
    t.has(await hojaTxt(p), 'Te vas a sumar a «Gimnasio Fuerza» (Rosario).', 'sin DNI: directo a la hoja');
    await p.click('#gymSocioHost .gys-check'); await sumarme(p);
    t.eq(rpcs(pg.st, 'gym_unirse_token'), [{ token: TOKEN, dni3: null, hoja_version: '2026-10-borrador', share_admin: true, compartir_version: '2026-10-borrador' }], 'sin DNI: dni3 null (y la casilla marcada, con su versión)');
    t.has(await hojaTxt(p), 'Pedido enviado a Gimnasio Fuerza', 'sin DNI: «Pedido enviado» para que el gimnasio confirme');
    await pg.close();
  }

  // ---- Sin sesión: pide ingresar con el mensaje del link y, al volver, sigue ----
  {
    const { handlers, st } = handlersGym(ALUMNO, { rol: 'client', nombre: 'Martina Sosa', gym: null, rpc: {
      gym_unirse_token_info: () => ({ estado: 'ok', gym: GYM, pide_dni: true }) } });
    handlers['/auth/v1/user'] = (r, J) => J(ALUMNO);
    const pg = await newPage({ handlers, viewport: { width: 390, height: 844 } }), p = pg.p;
    await p.goto(base + LINK); await wait(2500);
    const msg = await p.evaluate(() => document.body.innerText);
    t.has(msg, 'Tu gimnasio te sumó a GIZE. Creá tu cuenta o ingresá con la tuya para terminar.', 'sin sesión: la pantalla de ingreso explica el link');
    await captura(p, 'P3-unirme-sin-sesion');
    t.eq(st.rpcs.filter(x => x[0] === 'gym_unirse_token_info'), [], 'sin sesión: todavía no pregunta por el link');
    // Ingresa (la sesión queda guardada) y vuelve a cargar en la misma pestaña.
    await p.evaluate(([k, s]) => { localStorage.setItem(k, JSON.stringify(s)); localStorage.setItem('gize_remember', '1'); }, semilla(ALUMNO));
    await p.goto(base + '/app/'); await wait(3500);
    t.has(await hojaTxt(p), 'Sumate a «Gimnasio Fuerza» (Rosario)', 'al ingresar: sigue con el link (pide el DNI)');
    t.eq(st.rpcs.filter(x => x[0] === 'gym_unirse_token_info').map(x => x[1]), [{ token: TOKEN }], 'con el mismo token');
    t.eq(pg.errs, [], 'sin sesión: sin errores');
    await pg.close();
  }

  // ---- Un coach abre el link: aviso, no se suma ----
  {
    const { handlers, st } = handlersGym(COACH, { rol: 'coach', nombre: 'Coach Prueba', gym: null });
    handlers['/coach_billing'] = (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); };
    const pg = await newPage({ user: COACH, handlers, viewport: { width: 1440, height: 900 } }), p = pg.p;
    await p.goto(base + LINK); await wait(3500);
    t.has(pg.dialogs.join(' | '), 'Ese link es para sumarte como socio del gimnasio: abrilo con la cuenta de quien se suma.', 'coach: le avisa con qué cuenta abrirlo');
    t.eq(st.rpcs.filter(x => /^gym_unirse/.test(x[0])), [], 'coach: no se intenta sumar');
    await pg.close();
  }
}
