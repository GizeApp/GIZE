// Textos legales y de cumplimiento: en las apps de Android y iPhone ningún link lleva a la
// página de inicio (tiene los precios y el botón para contratar), el link legal dice lo que
// abre (la política de privacidad, también para el coach), y los avisos de «Borrar datos de
// este dispositivo» y de eliminar la cuenta de coach dicen la verdad. Además, ni la página
// de inicio ni el mail de registro ni los permisos del iPhone prometen fotos de progreso.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const NATIVE = () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; };
const links = p => p.evaluate(() => [...document.querySelectorAll('#view a, #coachSheetHost a')].map(a => ({ href: a.getAttribute('href'), txt: a.innerText.replace(/\s+/g, ' ').trim() })));
// La página de inicio: gize.ar/ (con o sin ? o #). La política (gize.ar/privacidad/) no cuenta.
const isLanding = h => /^https:\/\/gize\.ar\/?([?#].*)?$/.test(h || '');

export default async function ({ base, t }){
  // 1) App de iPhone: Configuración sin «Sitio web» y con la política de privacidad por su nombre.
  let pg = await newPage({ user: ALUMNO, state: STATE, init: NATIVE, handlers: { '/profiles': profile('client') } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-config'); await wait(500);
  let ls = await links(pg.p);
  t.ok(ls.length > 0, 'se ve la pantalla de Configuración');
  t.ok(!ls.some(l => isLanding(l.href)), 'iPhone: ningún link a la página de inicio (tiene precios): ' + JSON.stringify(ls.filter(l => isLanding(l.href))));
  t.ok(!ls.some(l => l.txt === 'Sitio web'), 'iPhone: sin la fila «Sitio web»');
  let priv = ls.find(l => l.txt === 'Política de privacidad');
  t.ok(!!priv, 'iPhone: está el link «Política de privacidad»');
  t.has(priv && priv.href, 'gize.ar/privacidad/?app=1', 'la política se abre sin la barra que lleva a la página de inicio');
  t.ok(!(await text(pg.p, '#view')).includes('Términos y condiciones'), 'no dice «Términos y condiciones» (no existen)');
  t.eq(pg.errs, [], 'errores de la página (iPhone)');
  await pg.close();

  // 2) En la web se sigue viendo el sitio. «Borrar datos de este dispositivo» con la sesión
  // iniciada avisa que la sesión sigue y que los datos vuelven de la cuenta.
  pg = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-config'); await wait(500);
  ls = await links(pg.p);
  t.ok(ls.some(l => l.txt === 'Sitio web' && l.href === 'https://gize.ar/'), 'web: sigue la fila «Sitio web»');
  t.ok(ls.some(l => l.txt === 'Política de privacidad'), 'web: está el link «Política de privacidad»');
  await pg.p.click('[data-action="cfg-clear-local"]'); await wait(1500);
  const clearMsg = pg.dialogs[0] || '';
  t.has(clearMsg, 'Tu sesión sigue iniciada', 'el aviso dice que la sesión sigue');
  t.has(clearMsg, 'Cerrar sesión', 'el aviso manda a «Cerrar sesión» para dejar el dispositivo limpio');
  t.ok(!clearMsg.includes('Se va a borrar todo'), 'con sesión no promete borrar todo: ' + clearMsg);
  await pg.close();

  // 3) Coach: la política también está en su Configuración, y eliminar la cuenta avisa que a
  // sus alumnos se les borra el chat con él (se contesta mal «ELIMINAR»: no se borra nada).
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  pg = await newPage({ user: COACH, init: NATIVE, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  } });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('[data-coach="open-settings"]'); await wait(500);
  ls = await links(pg.p);
  priv = ls.find(l => l.txt === 'Política de privacidad');
  t.ok(!!priv, 'coach: está el link «Política de privacidad»');
  t.has(priv && priv.href, 'gize.ar/privacidad/?app=1', 'coach: la política se abre sin la barra de la página de inicio');
  t.ok(!ls.some(l => isLanding(l.href)), 'coach en iPhone: ningún link a la página de inicio');
  await pg.p.click('#coachSheetHost [data-action="cfg-delete-account"]'); await wait(800);
  const delMsg = pg.dialogs[0] || '';
  t.ok(!delMsg.includes('no pierden nada'), 'no promete que los alumnos no pierden nada: ' + delMsg);
  t.has(delMsg, 'se borran el chat que tenían con vos', 'avisa que se borra el chat con los alumnos');
  t.has(pg.dialogs.join(' | '), 'no se eliminó nada', 'sin escribir ELIMINAR no se borra nada');
  t.ok(!pg.calls.some(c => /delete_own_account|borrar-audios/.test(c)), 'no se llamó a borrar la cuenta');
  t.eq(pg.errs, [], 'errores de la página (coach)');
  await pg.close();

  // 4) Política de privacidad: desde la app (?app=1) sin la barra con el logo que lleva a la
  // página de inicio y «Abrir la app»; entrando directo, con la barra.
  pg = await newPage();
  const topLinks = () => pg.p.evaluate(() => [...document.querySelectorAll('a')].filter(a => a.offsetParent !== null && /^\.\.\//.test(a.getAttribute('href'))).map(a => a.getAttribute('href')));
  await pg.p.goto(base + '/privacidad/?app=1'); await wait(300);
  t.eq(await topLinks(), [], 'desde la app, la política no tiene links visibles a la página de inicio ni a la app web');
  t.has(await text(pg.p, 'main'), 'Apple Push Notification service', 'la política nombra el servicio de avisos de iPhone');
  t.has(await text(pg.p, 'main'), 'Open Food Facts:', 'la política nombra a Open Food Facts como destinatario');
  await pg.p.goto(base + '/privacidad/'); await wait(300);
  t.eq(await topLinks(), ['../', '../app/'], 'entrando directo, la barra de arriba sigue');
  t.eq(pg.errs, [], 'errores de la página (política)');
  await pg.close();

  // 5) Nada promete fotos de progreso (se sacaron de la app).
  pg = await newPage();
  await pg.p.goto(base + '/'); await wait(300);
  const landing = await text(pg.p, 'body');
  t.ok(!/fotos de progreso|fotos,/i.test(landing) && !landing.includes('Fotos y entrenos'), 'la página de inicio no promete fotos de progreso');
  await pg.close();
  const mail = fs.readFileSync(path.join(ROOT, 'supabase/mails/confirmacion.html'), 'utf8');
  t.ok(!/peso, entrenos y fotos/.test(mail), 'el mail de registro no promete fotos de progreso');
  const plist = fs.readFileSync(path.join(ROOT, 'ios/App/App/Info.plist'), 'utf8');
  t.ok(!/fotos de progreso/.test(plist), 'los permisos del iPhone no hablan de fotos de progreso');
  t.has(plist, 'escanear el código de barras', 'el permiso de cámara menciona el escáner');
}
