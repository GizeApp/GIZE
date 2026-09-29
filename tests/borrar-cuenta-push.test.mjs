// Eliminar la cuenta en la app de Android da de baja las notificaciones del celular, igual
// que cerrar sesión: si después entra otra cuenta en ese celular, no queda registrada para
// recibir avisos (ni con el interruptor prendido) sin haberlas activado.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const NATIVE = () => {
  const ev = {};
  // Lo que se le pidió al plugin (en sessionStorage: la app se recarga al borrar la cuenta).
  const pn = x => sessionStorage.setItem('pn', (sessionStorage.getItem('pn') || '') + x + ',');
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { PushNotifications: {
    checkPermissions: async () => ({ receive: 'granted' }), requestPermissions: async () => ({ receive: 'granted' }),
    addListener: (n, f) => { (ev[n] = ev[n] || []).push(f); return { remove(){} }; },
    register: async () => { pn('register'); setTimeout(() => (ev.registration || []).forEach(f => f({ value: 'TOKEN-A' })), 50); },
    unregister: async () => { pn('unregister'); },
  } } };
  // Este celular ya tenía las notificaciones prendidas con la cuenta que se va a borrar.
  if (!sessionStorage.getItem('pnInit')) { sessionStorage.setItem('pnInit', '1'); localStorage.setItem('gize_fcm_token', 'TOKEN-A'); localStorage.setItem('jfit_notif_enabled', '1'); }
};

export default async function ({ base, t }){
  const log = [];
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, init: NATIVE,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client'),
      '/delete_own_account': (r, J) => { log.push('delete_own_account'); return J(null); },
      '/save_push_subscription': (r, J) => { log.push('save_push_subscription'); return J(null); },
      '/delete_push_subscription': (r, J) => { log.push('delete_push_subscription'); return J(null); },
    } });
  await p.route(/storage\/v1\/object\/list\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await p.goto(base + '/app/'); await wait(2500);
  log.length = 0;

  await p.click('#nav-config'); await wait(500);
  p.dialogAnswer = 'ELIMINAR';
  await p.click('[data-action="cfg-delete-account"]'); await wait(3500);
  t.ok(dialogs.some(d => /fue eliminada/.test(d)), 'la cuenta se eliminó');
  t.ok(log.indexOf('delete_own_account') >= 0 && log.indexOf('delete_own_account') < log.indexOf('delete_push_subscription'), 'se da de baja el dispositivo después de borrar la cuenta — llamadas: ' + log.join(', '));
  t.ok((await p.evaluate(() => sessionStorage.getItem('pn') || '')).includes('unregister'), 'se da de baja el celular en Firebase');
  t.eq(await p.evaluate(() => localStorage.getItem('gize_fcm_token')), null, 'no queda el token del celular guardado');

  // Entra otra cuenta en el mismo celular: no se registra sola para las notificaciones.
  const B = { id: '33333333-3333-3333-3333-333333333333', email: 'b@prueba.test', aud: 'authenticated', role: 'authenticated' };
  await p.evaluate(B => { const now = Math.floor(Date.now() / 1000); localStorage.setItem('sb-wegptuzhsrwppbknqstf-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiJ1MyJ9.y', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user: B })); localStorage.setItem('gize_remember', '1'); }, B);
  log.length = 0;
  await p.reload(); await wait(3000);
  t.ok(!log.includes('save_push_subscription'), 'la cuenta nueva no queda registrada para notificaciones sin activarlas');
  await p.click('#nav-config'); await wait(600);
  t.ok(!(await p.evaluate(() => [...document.querySelectorAll('[data-action="cfg-notif-toggle"]')].some(e => e.classList.contains('on')))), 'el interruptor de notificaciones aparece apagado');
  t.eq(errs, [], 'sin errores en la página');
  await close();
}
