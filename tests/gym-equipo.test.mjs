// Gimnasios, etapa 1: Profes (el equipo, SPEC §2.4) y aceptar una invitación (§1.3).
// - Pestañas Profes · Administración · Recepción, «N de M profes sin cargo», cada persona con sus socios,
//   la última vez y la versión de la app (vieja marcada), las invitaciones pendientes con [Copiar link
//   nuevo] y [Anular].
// - [Invitar]: el rol con lo que va a poder hacer → gym_invitar → el link gize.ar/app/#equipo=<token>
//   para copiar o mandar por WhatsApp. La administración no invita a otra administración.
// - El detalle: «Pasar todos a…», [Cambiar rol] y [Quitar del gimnasio], que no se confirma sin elegir a
//   quién pasan sus socios (otro profe o «Sin profe»).
// - #equipo=<token>: según gym_invitacion_info (ok → Aceptar; vencida, usada, tope, es alumno, necesita
//   cuenta de coach, ya es del equipo); sin sesión, la pantalla de ingreso (en la web, «Soy coach» ya
//   elegido para profe o administración; en el iPhone, no se ofrece crear una cuenta de coach).
import { newPage, wait } from './lib.mjs';
import { entrar, miGimnasio, DUENA, ADMIN_G, PROFE, COACH, ALUMNO, ID, TOKEN, hostTxt, modalTxt, rpcs, ir, IOS } from './gym-comun.mjs';

const TOK = 'cd'.repeat(32);

export default async function ({ base, t }){
  {
    const pg = await entrar(base, DUENA), p = pg.p;
    await ir(p, 'profes'); await wait(300);
    let txt = await hostTxt(p);
    for (const s of ['3 de 15 profes sin cargo en tu plan', 'Lucía Profe', '2 socios', 'Android 1.0.5', 'versión vieja', 'Marcos Profe', 'Invitación de profe', 'Copiar link nuevo', 'Anular'])
      t.has(txt, s, 'Profes: «' + s + '»');
    await p.click('#coachHost [data-gym="eq-tab"][data-v="admin"]'); await wait(300);
    txt = await hostTxt(p);
    t.ok(/Carla Dueña/.test(txt) && /Diego Admin/.test(txt) && !/Lucía Profe/.test(txt), 'pestaña Administración: dueña y administración');
    await p.click('#coachHost [data-gym="eq-tab"][data-v="recepcion"]'); await wait(300);
    t.has(await hostTxt(p), 'Rocío Recepción', 'pestaña Recepción');
    await p.click('#coachHost [data-gym="eq-tab"][data-v="profe"]'); await wait(300);
    // Invitar a un profe
    await p.click('#coachHost .gy-head [data-gym="invitar"]'); await wait(400);
    let m = await modalTxt(p);
    t.ok(/Profe/.test(m) && /Administración/.test(m) && /Recepción/.test(m), 'la dueña puede invitar a los tres roles');
    t.has(m, 'Va a ver solo a los socios que le asignes', 'con lo que va a poder hacer, en lenguaje simple');
    await p.click('#gymModal [data-gym="inv-crear"]'); await wait(700);
    t.eq(rpcs(pg.st, 'gym_invitar'), [{ rol: 'profe' }], 'gym_invitar con el rol');
    m = await modalTxt(p);
    const link = 'https://gize.ar/app/#equipo=' + TOKEN + '&rol=profe';
    t.has(m, link, 'el link de la invitación');
    t.has(m, 'Vale 7 días', 'cuánto vale');
    const wa = await p.$eval('#gymModal a[href^="https://wa.me/"]', a => decodeURIComponent(a.href));
    t.ok(wa.includes(link) && wa.includes('Gimnasio Fuerza'), 'WhatsApp con el link: ' + wa.slice(0, 120));
    await p.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await p.click('#gymModal [data-gym="copiar"]'); await wait(300);
    t.eq(await p.evaluate(() => navigator.clipboard.readText().catch(() => '')), link, '«Copiar link» copia el link');
    await p.click('#gymModal .gy-x'); await wait(300);
    // Anular una invitación
    await p.click('#coachHost [data-gym="inv-anular"]'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_invitacion_revocar'), [{ id: ID('e1') }], 'Anular: gym_invitacion_revocar');
    // Link nuevo: anula la vieja y crea otra con el mismo rol
    await p.click('#coachHost [data-gym="inv-nuevo"]'); await wait(800);
    t.eq([rpcs(pg.st, 'gym_invitacion_revocar').length, rpcs(pg.st, 'gym_invitar')[1]], [2, { rol: 'profe' }], '«Copiar link nuevo»: anula la vieja e invita de nuevo');
    t.has(await modalTxt(p), link, 'y muestra el link nuevo');
    await p.click('#gymModal .gy-x'); await wait(300);
    // Detalle de Lucía: sus socios, cambiar rol, quitar con reasignación obligatoria
    await p.click('#coachHost [data-gym="eq-abrir"][data-id="' + PROFE.id + '"]'); await wait(500);
    txt = await hostTxt(p);
    t.ok(/Sus socios/.test(txt) && /Martina Sosa/.test(txt) && /Juan Pérez/.test(txt), 'el detalle: sus socios');
    await p.selectOption('#coachHost [data-gym-in="pasar-a"]', ID('b2')); await p.click('#coachHost [data-gym="eq-pasar"]'); await wait(400);
    t.has(await modalTxt(p), 'Asignar profe a 2 socios', '«Pasar todos a…» abre la asignación con sus socios');
    await p.click('#gymModal [data-gym="asignar-ok"]'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_asignar_profe').slice(-1)[0], { fichas: ['a0000000-0000-4000-8000-000000000f11', 'a0000000-0000-4000-8000-000000000f12'], profe: ID('b2') }, 'pasar todos: gym_asignar_profe con sus fichas');
    await p.click('#gymModal .gy-x'); await wait(300);
    await p.selectOption('#coachHost [data-gym-in="rol-nuevo"]', 'admin'); await p.click('#coachHost [data-gym="eq-rol"]'); await wait(600);
    t.eq(rpcs(pg.st, 'gym_cambiar_rol'), [{ usuario: PROFE.id, rol: 'admin' }], 'Cambiar rol: gym_cambiar_rol');
    await p.click('#coachHost [data-gym="eq-quitar"]'); await wait(400);
    t.has(await modalTxt(p), 'Tiene 2 socios asignados. Elegí a quién pasan (es obligatorio)', 'Quitar: pide a quién pasan sus socios');
    t.ok(await p.isDisabled('#gymModal [data-gym="quitar-ok"]'), 'Quitar: sin elegir, no se puede confirmar');
    await p.check('#gymModal input[name="gyA"][value=""]'); await wait(200);
    t.ok(!(await p.isDisabled('#gymModal [data-gym="quitar-ok"]')), 'Quitar: con «Sin profe» elegido, sí');
    await p.check('#gymModal input[name="gyA"][value="' + ID('b2') + '"]'); await wait(200);
    await p.click('#gymModal [data-gym="quitar-ok"]'); await wait(800);
    t.eq(rpcs(pg.st, 'gym_quitar_staff'), [{ usuario: PROFE.id, reasignar_a: ID('b2') }], 'gym_quitar_staff con a quién pasan');
    t.ok(pg.dialogs.some(d => /2 socios pasaron al profe nuevo/.test(d)), 'el resumen de lo que pasó');
    t.eq(pg.errs, [], 'sin errores');
    await pg.close();
  }
  // La administración: no invita a otra administración ni toca a la dueña.
  {
    const pg = await entrar(base, ADMIN_G, { gym: miGimnasio('admin'), rol: 'client' }), p = pg.p;
    await ir(p, 'profes');
    await p.click('#coachHost .gy-head [data-gym="invitar"]'); await wait(400);
    t.ok(!(await p.$('#gymModal input[value="admin"]')), 'administración: no puede invitar a otra administración');
    await p.click('#gymModal .gy-x'); await wait(200);
    await p.click('#coachHost [data-gym="eq-tab"][data-v="admin"]'); await wait(300);
    await p.click('#coachHost [data-gym="eq-abrir"][data-id="' + DUENA.id + '"]'); await wait(400);
    t.ok(!(await p.$('#coachHost [data-gym="eq-quitar"]')) && /Al dueño no se le cambia el rol ni se lo quita/.test(await hostTxt(p)), 'a la dueña no se la quita ni se le cambia el rol');
    await pg.close();
  }
  // Aceptar una invitación (#equipo=): cada estado.
  const INFO = estado => () => ({ gym: { name: 'Gimnasio Fuerza', city: 'Rosario' }, role: 'profe', estado });
  {
    let aceptada = false;
    const pg = await entrar(base, COACH, { url: '/app/#equipo=' + TOK + '&rol=profe', gym: null, nombre: 'Marcos Coach',
      rpc: { gym_invitacion_info: INFO('ok'), gym_aceptar_invitacion: () => { aceptada = true; return { gym_id: 'g', role: 'admin', gym: { name: 'Gimnasio Fuerza' } }; },
        mi_gimnasio: () => aceptada ? miGimnasio('admin') : null } });
    const p = pg.p;
    t.eq(new URL(p.url()).hash, '', 'el #equipo= se saca de la dirección');
    t.has(await hostTxt(p), 'Gimnasio Fuerza (Rosario) te invitó como profe', 'la invitación: el gimnasio y el rol');
    t.eq(rpcs(pg.st, 'gym_invitacion_info'), [{ token: TOK }], 'gym_invitacion_info con el token');
    await p.click('#coachHost [data-gym="aceptar-si"]'); await wait(1500);
    t.eq(rpcs(pg.st, 'gym_aceptar_invitacion'), [{ token: TOK }], 'Aceptar: gym_aceptar_invitacion');
    t.ok(pg.dialogs.some(d => /Ya sos parte de Gimnasio Fuerza/.test(d)), 'avisa que ya es parte');
    t.ok(await p.$('#coachHost .gy-shell'), 'como administración, entra al panel del gimnasio');
    await pg.close();
  }
  for (const [estado, texto] of [['vencida', 'La invitación venció o la anularon: pedile otra al gimnasio.'], ['usada', 'Esa invitación ya se usó'],
    ['tope', 'El gimnasio llegó al tope de profes. Escribinos para sumar más profes.'], ['es_alumno', 'Para ser profe primero desvinculate de tu coach.'],
    ['ya_staff', 'Ya sos del equipo de un gimnasio.'], ['necesita_coach', 'Para ser profe necesitás una cuenta de coach.']]){
    const quien = estado === 'es_alumno' || estado === 'necesita_coach' ? ALUMNO : COACH;
    const pg = await entrar(base, quien, { url: '/app/#equipo=' + TOK, gym: null, rol: quien === ALUMNO ? 'client' : 'coach', rpc: { gym_invitacion_info: INFO(estado) } });
    const txt = await hostTxt(pg.p);
    t.has(txt, texto, 'invitación «' + estado + '»: ' + texto);
    t.ok(!(await pg.p.$('[data-gym="aceptar-si"]')), 'invitación «' + estado + '»: sin [Aceptar]');
    await pg.p.click('#coachHost [data-gym="aceptar-no"]'); await wait(600);
    t.ok(!(await pg.p.$('#coachHost .gy-solo')), '«Ahora no» vuelve a lo de siempre');
    await pg.close();
  }
  // Sin sesión: la pantalla de ingreso (web: «Soy coach» elegido; iPhone: sin cuentas de coach).
  {
    const pg = await newPage({ viewport: { width: 1440, height: 900 } });
    await pg.p.goto(base + '/app/#equipo=' + TOK + '&rol=profe'); await wait(1800);
    const r = await pg.p.evaluate(() => ({ txt: document.getElementById('authHost').innerText, rol: (document.getElementById('auRole') || {}).value }));
    t.has(r.txt, 'Te invitaron al equipo de un gimnasio. Creá tu cuenta o ingresá para aceptar.', 'sin sesión: para qué hay que entrar');
    t.eq(r.rol, 'coach', 'sin sesión, profe: la cuenta nueva es de coach');
    await pg.close();
    const pi = await newPage({ viewport: { width: 390, height: 844 }, init: IOS });
    await pi.p.goto(base + '/app/#equipo=' + TOK + '&rol=profe'); await wait(1800);
    const ri = await pi.p.evaluate(() => ({ txt: document.getElementById('authHost').innerText, coach: !!document.querySelector('[data-auth-role="coach"]') }));
    t.has(ri.txt, 'creala desde gize.ar en la compu', 'iPhone: la cuenta de coach se crea en la web');
    t.ok(!ri.coach, 'iPhone: no se ofrece «Soy coach»');
    await pi.close();
  }
}
