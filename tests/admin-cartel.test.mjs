// Panel de administración → Avisos → «Guardar cartel»: se guardan solo Android y iPhone. Antes
// se colaban los botones «A quién» de la notificación (todos / coaches / alumnos) como claves
// basura en la configuración pública, y se volvían a copiar en cada guardado.
import { newPage, wait, ADMIN } from './lib.mjs';

export default async function ({ base, t }){
  const saved = [];
  // Lo que quedó guardado de antes, con la basura incluida.
  const config = { android: { ultima: 11, version: '1.0.6', minima: 0, tienda: 'https://play.google.com/store/apps/details?id=ar.com.gize.app' },
    ios: { ultima: 0, version: '', minima: 0, tienda: '' }, todos: { undefined: '' }, coaches: { undefined: '' }, alumnos: { undefined: '' } };
  const { p, errs, dialogs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true),
    '/admin_contact_unread': (r, J) => J(0),
    '/app_config': (r, J, i) => i.m === 'GET' ? J(i.one ? { value: config } : [{ value: config }]) : undefined,
    '/admin_set_config': (r, J, i) => (saved.push(JSON.parse(i.body)), J(null)),
  } });
  await p.goto(base + '/admin/#avisos'); await wait(1500);
  await p.fill('[data-v="android.ultima"]', '12'); await p.fill('[data-v="android.version"]', '1.0.7');
  await p.click('#avT [data-v="coaches"]'); // elegir a quién mandar una notificación no cambia el cartel
  await p.click('[data-a="cfgSave"]'); await wait(600);
  t.has(dialogs.join('\n'), '¿Guardar el cartel?', 'pide confirmación');
  const v = saved.length ? saved[saved.length - 1].p_value : {};
  t.eq(Object.keys(v).sort(), ['android', 'ios'], 'solo guarda Android y iPhone');
  t.eq(v.android, { ultima: 12, version: '1.0.7', minima: 0, tienda: config.android.tienda }, 'Android con lo que se escribió');
  t.eq(v.ios, config.ios, 'iPhone queda como estaba');
  t.eq(errs, [], 'errores de la página');
  await close();
}
