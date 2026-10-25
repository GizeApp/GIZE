// Panel de administración → Coaches y pagos → «Códigos de fundador» (supabase/codigo-fundador.sql):
// la lista de códigos con cuántos lo usaron (de cuántos lugares) y quiénes; crear uno nuevo,
// cambiarlo y apagarlo. Sin el SQL en la base, dice qué correr.
import { newPage, wait, ADMIN } from './lib.mjs';

const CODIGOS = [
  { codigo: 'FUNDADOR-PRUEBA', porcentaje: 30, cupo: 20, activo: true, usados: 2, created_at: '2026-10-20T12:00:00Z',
    coaches: [{ id: 'c1', nombre: 'Coach Uno', email: 'c1@prueba.test', fecha: '2026-10-21T12:00:00Z' }, { id: 'c2', nombre: 'Coach Dos', email: 'c2@prueba.test', fecha: '2026-10-22T12:00:00Z' }] },
  { codigo: 'VIEJO', porcentaje: 10, cupo: 5, activo: false, usados: 0, created_at: '2026-01-01T12:00:00Z', coaches: [] },
];
const coaches = [{ id: 'c1', full_name: 'Coach Uno', email: 'c1@prueba.test', plan: 'trial', max_clients: 10, clients: 1, paid_until: null, trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(), mp_status: null, has_mp: false, price: 0 }];

export default async function ({ base, t }){
  const guardados = [];
  const { p, errs, dialogs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_coaches': (r, J) => J(coaches),
    '/admin_codigos_fundador': (r, J) => J(CODIGOS),
    '/admin_codigo_fundador_guardar': (r, J, i) => { guardados.push(JSON.parse(i.body)); return J(null); },
  } });
  await p.goto(base + '/admin/#coaches'); await wait(1500);
  const txt = await p.evaluate(() => (document.getElementById('cCod') || {}).innerText || '');
  t.has(txt, 'FUNDADOR-PRUEBA', 'muestra el código');
  t.has(txt.replace(/\s+/g, ' '), '2 de 20', 'cuántos lo usaron, de cuántos lugares');
  t.has(txt, 'Coach Uno', 'quiénes lo usaron (nombre)');
  t.has(txt, 'c2@prueba.test', 'quiénes lo usaron (mail)');
  t.has(txt, 'Apagado', 'el código apagado se ve apagado');
  t.has(await p.evaluate(() => document.getElementById('cCodB-s').innerText), 'FUNDADOR-PRUEBA 2/20', 'resumen del panel plegado');

  // Crear uno nuevo (en minúsculas se guarda en mayúsculas).
  await p.fill('#codCod', 'nuevo-2026'); await p.fill('#codPct', '25'); await p.fill('#codCupo', '10');
  await p.click('[data-a="codSave"]'); await wait(400);
  t.eq(guardados[0], { p_codigo: 'NUEVO-2026', p_porcentaje: 25, p_cupo: 10, p_activo: true }, 'crea el código');
  t.has(dialogs.join(' '), 'para los primeros 10 coaches', 'pregunta antes, con el cupo');
  // Un código con espacios no se manda.
  await p.fill('#codCod', 'con espacio'); await p.click('[data-a="codSave"]'); await wait(300);
  t.eq(guardados.length, 1, 'código con espacios: no se manda');
  // Cambiar: carga los datos del código y guarda el mismo (sigue vigente).
  await p.click('[data-a="codEdit"][data-v="FUNDADOR-PRUEBA"]'); await wait(200);
  t.eq([await p.inputValue('#codCod'), await p.inputValue('#codPct'), await p.inputValue('#codCupo')], ['FUNDADOR-PRUEBA', '30', '20'], 'cambiar: carga el código');
  await p.fill('#codCupo', '25'); await p.click('[data-a="codSave"]'); await wait(400);
  t.eq(guardados[1], { p_codigo: 'FUNDADOR-PRUEBA', p_porcentaje: 30, p_cupo: 25, p_activo: true }, 'cambiar el cupo');
  // Apagar y prender.
  await p.click('[data-a="codOnOff"][data-v="FUNDADOR-PRUEBA"]'); await wait(400);
  t.eq(guardados[2], { p_codigo: 'FUNDADOR-PRUEBA', p_porcentaje: 30, p_cupo: 20, p_activo: false }, 'apagar');
  t.has(dialogs[dialogs.length - 1], 'los que ya lo usaron siguen con su descuento', 'apagar: avisa que los que lo usaron lo conservan');
  await p.click('[data-a="codOnOff"][data-v="VIEJO"]'); await wait(400);
  t.eq(guardados[3], { p_codigo: 'VIEJO', p_porcentaje: 10, p_cupo: 5, p_activo: true }, 'prender');
  t.eq(errs, [], 'errores');
  await close();

  // Sin el SQL en la base.
  const pg = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_coaches': (r, J) => J(coaches),
    '/admin_codigos_fundador': (r, J) => J({ code: 'PGRST202', message: 'Could not find the function public.admin_codigos_fundador without parameters in the schema cache' }, 404),
  } });
  await pg.p.goto(base + '/admin/#coaches'); await wait(1500);
  t.has(await pg.p.evaluate(() => (document.getElementById('cCod') || {}).textContent || ''), 'supabase/codigo-fundador.sql', 'sin el SQL: dice qué correr');
  t.has(await pg.p.evaluate(() => document.getElementById('cList').innerText), 'Coach Uno', 'sin el SQL: la lista de coaches sigue andando');
  await pg.close();
}
