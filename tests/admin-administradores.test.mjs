// Panel de administración → Seguridad → «Administradores»: salen todos, aunque haya más de 60
// cuentas (admin_users trae solo las 60 más nuevas y el dueño suele ser de las más viejas). Si
// la base todavía no tiene admin_list_admins, se sigue con lo de antes. En Usuarios, con 60
// resultados se avisa que hay más.
import { newPage, wait, text, ADMIN } from './lib.mjs';

// Las 60 cuentas más nuevas: ninguna es administradora.
const users = Array.from({ length: 60 }, (_, i) => ({ id: 'u' + i, email: 'u' + i + '@prueba.test', full_name: 'Usuario ' + i, role: 'client', coach_name: null,
  created_at: new Date(Date.UTC(2025, 8, 1) + i * 864e5).toISOString(), last_sign_in_at: null, last_seen_at: null, app_version: null, app_platform: null, is_admin: false }));

async function seguridad(base, handlers){
  const r = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: Object.assign({
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/admin_audit_list': (r, J) => J([]),
  }, handlers) });
  await r.p.route(/api\.github\.com/, x => x.abort()); // las copias de seguridad no importan acá
  await r.p.goto(base + '/admin/#seguridad'); await wait(1500);
  await r.p.click('#sAdmB > summary'); // arranca plegado
  return r;
}

export default async function ({ base, t }){
  // Con admin_list_admins en la base
  const calls = [];
  const a = await seguridad(base, {
    '/admin_list_admins': (r, J) => (calls.push('admin_list_admins'), J([{ id: 'd1', email: 'dueno@prueba.test', full_name: 'Dueño' }])),
    '/admin_users': (r, J) => J(users),
  });
  t.eq(await text(a.p, '#admins'), 'Dueño · dueno@prueba.test', 'Administradores muestra al dueño aunque no esté entre las 60 cuentas más nuevas');
  t.ok(calls.length > 0, 'usa admin_list_admins');
  // Usuarios: 60 resultados → aviso de que hay más
  await a.p.click('[data-go="usuarios"]'); await wait(800);
  t.has(await text(a.p, '#uList'), 'Se muestran las 60 cuentas más nuevas', 'Usuarios avisa que se muestran solo 60');
  t.eq(a.errs, [], 'errores de la página');
  await a.close();

  // Sin admin_list_admins (el SQL todavía no se corrió): cae a admin_users como antes.
  const b = await seguridad(base, {
    '/admin_list_admins': (r, J) => J({ code: 'PGRST202', message: 'Could not find the function public.admin_list_admins without parameters in the schema cache' }, 404),
    '/admin_users': (r, J) => J(users.slice(0, 3).concat([{ id: 'd1', email: 'dueno@prueba.test', full_name: 'Dueño', is_admin: true }])),
  });
  t.eq(await text(b.p, '#admins'), 'Dueño · dueno@prueba.test', 'sin la función nueva, Administradores sale como antes');
  await b.p.click('[data-go="usuarios"]'); await wait(800);
  t.ok(!(await text(b.p, '#uList')).includes('Se muestran las 60'), 'con menos de 60 usuarios no hay aviso');
  t.eq(b.errs, [], 'errores de la página (sin la función nueva)');
  await b.close();
}
