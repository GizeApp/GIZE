// «Atrás» de Android con ventanas que se agregan sueltas al <body>: la de acomodar la foto
// de perfil y la foto agrandada del panel. Tiene que cerrar la ventana y quedarse en la
// pestaña de abajo, no cambiar de pestaña por detrás ni sacar de la app.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const NATIVE = () => {
  window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } };
};

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ALUMNO, init: NATIVE,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client') } });
  await p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), r => r.abort());
  await p.goto(base + '/app/'); await wait(3000);
  const back = async () => { await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(500); };
  const estado = () => p.evaluate(() => ({ crp: !!document.querySelector('.crp'), zoom: !!document.querySelector('.adm-zoom'),
    ajustes: document.getElementById('nav-config').classList.contains('active'), min: window.__min }));

  await p.click('#nav-config'); await wait(400);

  // Ventana para acomodar la foto de perfil (con una imagen hecha en un canvas).
  await p.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const { cropAvatar } = await import('/app/ui/recorte.js');
    window.__crop = 'abierta';
    cropAvatar(blob).then(b => { window.__crop = b; }, () => { window.__crop = 'error'; });
  });
  await wait(500);
  t.ok((await estado()).crp, 'se abrió la ventana de acomodar la foto');
  await back();
  t.eq(await estado(), { crp: false, zoom: false, ajustes: true, min: 0 }, '«Atrás» cierra la ventana de la foto y se queda en Ajustes');
  t.eq(await p.evaluate(() => window.__crop), null, 'y cuenta como «Cancelar»');

  // Foto agrandada del panel (la arma admin-productos.js: se cierra con un toque).
  await p.evaluate(() => { const z = document.createElement('div'); z.className = 'adm-zoom';
    z.style.cssText = 'position:fixed;inset:0'; z.addEventListener('click', () => z.remove()); document.body.appendChild(z); });
  await back();
  t.eq(await estado(), { crp: false, zoom: false, ajustes: true, min: 0 }, '«Atrás» cierra la foto agrandada y se queda donde estaba');

  t.eq(errs, [], 'sin errores en la página');
  await close();
}
