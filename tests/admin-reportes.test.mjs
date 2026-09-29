// Panel de administración → Productos: los reportes de un producto verificado.
// - En Reportados y en «Toda la base» se ve el motivo del reporte (si la base todavía no manda
//   el motivo, se ve solo el número, sin errores).
// - «✓ Verificar» en Reportados lo saca de la lista.
// - En «Toda la base», «Guardar cambios» de un verificado borra sus reportes en la base
//   (supabase/admin.sql): el aviso de reportes tiene que desaparecer de la tarjeta (antes
//   quedaba hasta recargar).
import { newPage, wait, text, ADMIN } from './lib.mjs';

const prod = extra => Object.assign({ id: 'p1', code: '7790000000001', name: 'Yogur X', brand: 'Marca', kcal: 60, protein: 3, carbs: 8, fat: 1,
  unit: 'g', portion: null, source: 'gize', verified: true, hidden: false, uses: 4, reports: 1, photo_path: null,
  created_at: new Date().toISOString(), reasons: 'Las calorías están mal, son 90' }, extra);

async function open(base, list, saves){
  const r = await newPage({ user: ADMIN, viewport: { width: 1280, height: 800 }, handlers: {
    '/is_app_admin': (x, J) => J(true), '/admin_overview': (x, J) => J({ pending: 1, versions: [], users: 0 }),
    '/admin_contact_unread': (x, J) => J(0), '/admin_requests_pending': (x, J) => J(0), '/admin_requests': (x, J) => J([]),
    '/admin_products': (x, J) => J(list), '/admin_products_search': (x, J) => J(list),
    '/admin_product_save': (x, J, i) => { saves.push(JSON.parse(i.body)); return J(null); } } });
  await r.p.goto(base + '/admin/#productos'); await wait(1500);
  return r;
}
const tab = async (p, v) => { await p.click(`[data-a="ptab"][data-v="${v}"]`); await wait(800); };

export default async function ({ base, t }){
  // Reportados: el verificado aparece con su motivo y «✓ Verificar» lo saca.
  {
    const saves = [];
    const { p, errs, close } = await open(base, [prod()], saves);
    await tab(p, 'reportados');
    t.has(await text(p, '[data-prod="p1"]'), 'son 90', 'Reportados: se ve el motivo del reporte');
    await p.click('[data-prod="p1"] [data-a="psave"][data-verify="1"]'); await wait(500);
    t.ok(saves.length === 1 && saves[0].p_verified === true && saves[0].p_hidden === false, 'Verificar guarda verificado y visible: ' + JSON.stringify(saves));
    t.ok(!(await p.$('[data-prod="p1"]')), 'Verificar lo saca de Reportados');
    t.eq(errs, [], 'Reportados: errores de la página');
    await close();
  }
  // Toda la base: se ve el motivo y «Guardar cambios» de un verificado borra el aviso.
  {
    const saves = [];
    const { p, errs, close } = await open(base, [prod()], saves);
    await tab(p, 'todos');
    t.has(await text(p, '[data-prod="p1"]'), 'son 90', 'Toda la base: se ve el motivo del reporte');
    await p.click('[data-prod="p1"] [data-a="psave"][data-mode="keep"]'); await wait(500);
    t.eq(saves.length, 1, 'Guardar cambios llama a admin_product_save');
    t.ok(!(await text(p, '[data-prod="p1"]')).includes('reporte'), 'después de guardar un verificado ya no dice que tiene reportes: ' + await text(p, '[data-prod="p1"]'));
    t.eq(errs, [], 'Toda la base: errores de la página');
    await close();
  }
  // Toda la base con un no verificado: guardar no borra los reportes (la base tampoco).
  {
    const saves = [];
    const { p, errs, close } = await open(base, [prod({ verified: false, source: 'user' })], saves);
    await tab(p, 'todos');
    await p.click('[data-prod="p1"] [data-a="psave"][data-mode="keep"]'); await wait(500);
    t.has(await text(p, '[data-prod="p1"]'), '1 reporte', 'un no verificado sigue mostrando sus reportes');
    t.eq(errs, [], 'no verificado: errores de la página');
    await close();
  }
  // Base vieja (sin el motivo en «Toda la base»): se ve el número, sin errores.
  {
    const saves = [];
    const old = prod(); delete old.reasons;
    const { p, errs, close } = await open(base, [old], saves);
    await tab(p, 'todos');
    const tx = await text(p, '[data-prod="p1"]');
    t.has(tx, '1 reporte', 'sin el SQL nuevo: se ve cuántos reportes hay');
    t.ok(!tx.includes('undefined'), 'sin el SQL nuevo: no aparece «undefined»');
    t.eq(errs, [], 'sin el SQL nuevo: errores de la página');
    await close();
  }
}
