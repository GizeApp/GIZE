// Página pública del coach, gize.ar/c/<alias>: 404.html + pagina-coach/pagina.js, con coach_pagina_ver
// y la foto de supabase/pagina-coach.sql. GitHub Pages sirve 404.html (estado 404) en toda dirección que
// no existe (comoGitHub hace lo mismo acá) y Supabase está simulado. Revisa:
//   · la página del coach: el nombre como texto (un <b> no arma nada), la foto con un link firmado de
//     una hora (o las iniciales), el código grande con «Copiar», los pasos, las tiendas (las mismas de
//     la portada, la del celular primero; Google Play con el nombre del link de referrer y nada más),
//     «¿Ya tenés GIZE?» y «Usá GIZE en la web» → /app/#coach=<alias>. Tocar una tienda copia el código;
//   · las direcciones: /c/TORO/, /c/toro?utm_source=ig y /c/?a=toro; un link anterior pasa al vigente;
//     uno que no existe (o apagado, o mal escrito, o la base sin la función) da «no disponible» sin
//     código; sin señal o si la base no contesta en 8 s, «Reintentar»; cualquier otra dirección, el
//     404 común sin pedirle nada a la base;
//   · lo que promete la política de privacidad: noindex, sin referrer, nada sale más que a Supabase,
//     sin la sesión de la app; la vista previa (og:) arriba de todo y en los primeros 2 KB; la CSP; la
//     clave pública es la de la app; nada se pinta con innerHTML;
//   · en la compu, el QR; sin JavaScript, las tiendas; a 390 y 320 px sin scroll de costado, con
//     «reducir movimiento» todo quieto, el contraste (AA), la CSP sin bloqueos y sin errores.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, comoGitHub, getBrowser, contraste, ALUMNO } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SB = 'https://wegptuzhsrwppbknqstf.supabase.co';
const PLAY = 'https://play.google.com/store/apps/details?id=ar.com.gize.app';
const APP_STORE = 'https://apps.apple.com/ar/app/id6818266033';
const FOTO = '33333333-3333-3333-3333-333333333333/foto 1.jpg';
const TORO = { alias: 'toro', nombre: 'Martín <b>Toro</b>', foto: FOTO, codigo: 'K7XM2PQA', es_mi_coach: false, soy_yo: false };
const PNG = fs.readFileSync(path.join(ROOT, 'icon-192.png'));
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
};
// El portapapeles (lo copiado queda en __copiado), lo que bloquee la CSP y, si hace falta, otro celular.
const init = ua => `window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copiado = t; } } });` +
  (ua ? `Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ${JSON.stringify(ua)} });` : '');

// Abre una dirección del sitio con la base simulada. o.modo: 'caida' (503), 'sin' (la base sin la
// función: PGRST202), 'sin-senal' (no llega), 'colgada' (no contesta) o nada (anda). o.toro: lo que
// devuelve para «toro» (y para su link anterior, «toro-viejo»).
async function abrir(base, url, o = {}){
  const st = { pedidos: [], hdr: [], firmas: [], fotos: 0, red: [], modo: o.modo };
  const pg = await newPage({ user: o.user, viewport: o.vp, reducedMotion: o.reduced, init: init(o.ua), handlers: {
    '/rpc/coach_pagina_ver': (r, J, i) => {
      const b = JSON.parse(i.body || '{}');
      st.pedidos.push(b.p_alias); st.hdr.push(r.request().headers());
      if (st.modo === 'caida') return J({ message: 'no anda' }, 503);
      if (st.modo === 'sin') return J({ code: 'PGRST202', message: 'Could not find the function public.coach_pagina_ver(p_alias) in the schema cache', details: null, hint: null }, 404);
      if (st.modo === 'sin-senal') return r.abort('internetdisconnected');
      if (st.modo === 'colgada') return new Promise(ok => setTimeout(ok, 9500)).then(() => J(null).catch(() => {}));
      return J(b.p_alias === 'toro' || b.p_alias === 'toro-viejo' ? (o.toro || TORO) : null);
    },
    // El link firmado (POST) y la foto (GET con el token).
    '/foto%201.jpg': (r, J, i) => {
      if (i.m === 'POST'){ st.firmas.push({ path: i.path, body: JSON.parse(i.body || '{}'), hdr: r.request().headers() }); return J({ signedURL: '/object/sign/avatars/' + FOTO + '?token=abc' }); }
      st.fotos++; return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    },
  } });
  pg.p.on('request', q => st.red.push(q.url()));
  await comoGitHub(pg.p, base);
  // Las tiendas nunca salen a internet (y no se abre otra pestaña).
  await pg.p.context().route(/apps\.apple\.com|play\.google\.com/, r => r.fulfill({ status: 200, contentType: 'text/html', body: 'tienda' }));
  const res = await pg.p.goto(base + url); await wait(o.espera || 900);
  return Object.assign(pg, { st, res });
}
// Lo que se ve de la página, como lo ve la persona.
const ver = p => p.evaluate(() => {
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const q = s => document.querySelector(s);
  const img = q('#foto');
  return { estado: document.documentElement.dataset.estado, titulo: document.title, texto: document.body.innerText.replace(/\s+/g, ' ').trim(),
    nombre: vis(q('#nombre')) ? q('#nombre').textContent : null, bs: q('#nombre').querySelectorAll('*').length,
    codigo: vis(q('#cod')) ? q('#cod').textContent : null, ini: vis(q('#ini')) ? q('#ini').textContent : null,
    foto: vis(img) ? { src: img.src, w: img.naturalWidth } : null,
    tiendas: vis(q('#tiendas')) ? [...document.querySelectorAll('#tiendas a.store')].map(a => ({ href: a.getAttribute('href'), txt: a.textContent.replace(/\s+/g, ' ').trim(), target: a.target, rel: a.rel })) : null,
    web: vis(q('#web')) ? q('#web').getAttribute('href') : null, reintentar: vis(q('#reintentar')), qr: vis(q('#qr')) ? q('#qr svg path').getAttribute('d').length : 0,
    dir: location.pathname + location.search, aviso: q('#aviso').textContent };
});

export default async function ({ base, t }){
  // 1) El archivo: la vista previa arriba de todo, noindex, sin referrer, la CSP, rutas absolutas y la
  //    misma clave pública que la app.
  const html = leer('404.html'), js = leer('pagina-coach/pagina.js');
  const ogs = [...html.matchAll(/<meta property="og:[^>]*>/g)];
  const finOg = ogs.length ? ogs[ogs.length - 1].index + ogs[ogs.length - 1][0].length : Infinity;
  t.ok(ogs.length >= 4 && finOg < html.indexOf('<style') && finOg < html.indexOf('<script'), 'las etiquetas og van antes del primer <style> y del <script>');
  t.ok(Buffer.byteLength(html.slice(0, finOg)) <= 2048, 'las etiquetas og entran en los primeros 2 KB: ' + Buffer.byteLength(html.slice(0, finOg)));
  const meta = (k, v) => (html.match(new RegExp('<meta ' + k + '="' + v + '" content="([^"]*)"')) || [])[1];
  t.eq([meta('property', 'og:title'), meta('property', 'og:image'), meta('property', 'og:url')], ['Entrená conmigo en GIZE', 'https://gize.ar/icon-512.png', undefined], 'vista previa genérica, con el ícono y sin og:url');
  t.eq([meta('name', 'robots'), meta('name', 'referrer')], ['noindex', 'no-referrer'], 'sin indexar (la política dice noindex) y sin mandar de qué página viene');
  const csp = Object.fromEntries((meta('http-equiv', 'Content-Security-Policy') || '').split(';').map(x => x.trim().split(/\s+/)).filter(x => x[0]).map(([k, ...v]) => [k, v]));
  t.eq([csp['default-src'], csp['script-src'], csp['connect-src'], csp['img-src'], csp['base-uri'], csp['form-action']],
    [["'none'"], ["'self'"], [SB], ["'self'", 'data:', SB], ["'none'"], ["'none'"]], 'CSP: solo este sitio y Supabase');
  const rutas = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map(m => m[1]);
  t.ok(rutas.length > 5 && rutas.every(h => /^(\/|https:\/\/)/.test(h)), 'todas las rutas son absolutas (se sirve en cualquier carpeta): ' + rutas.filter(h => !/^(\/|https:\/\/)/.test(h)));
  const clave = s => (s.match(/SB_KEY = "([^"]+)"/) || [])[1], url = s => (s.match(/SB_URL = "([^"]+)"/) || [])[1];
  const app = leer('app/core/supabase.js');
  t.ok(!!clave(js) && clave(js) === clave(app) && url(js) === url(app) && url(js) === SB, 'la clave pública y la dirección de la base son las de la app (app/core/supabase.js)');
  t.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js), 'pagina.js no pinta nada con HTML');
  // Las tiendas son las de la portada.
  const portada = leer('index.html');
  t.ok(portada.includes('href="' + PLAY + '"') && portada.includes('href="' + APP_STORE + '"'), 'las tiendas son las mismas que en la página de inicio');
  // Lo que la política promete de esta página (privacidad/index.html, «Página pública del coach»).
  const politica = leer('privacidad/index.html').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const f of ['noindex', 'con un link que vence en una hora', 'Supabase, que recibe su dirección IP', 'En GIZE no queda anotado quién la visitó', 'Google recibe de qué página viene (el nombre del link, sin datos de la persona)'])
    t.has(politica, f, 'la política dice: ' + f);

  // 2) La página del coach en un iPhone, con la sesión de la app guardada en el navegador (no se manda).
  let pg = await abrir(base, '/c/toro', { user: ALUMNO, ua: UA.iphone });
  let p = pg.p, v = await ver(p);
  t.eq(pg.res.status(), 404, 'GitHub Pages la sirve con estado 404 (como acá)');
  t.eq(v.estado, 'coach', 'iPhone: se ve la página del coach');
  t.eq([v.nombre, v.bs], ['Martín <b>Toro</b>', 0], 'el nombre va como texto: un <b> no arma nada');
  t.eq(v.codigo, 'K7XM2PQA', 'el código de invitación, grande');
  t.eq(v.titulo, 'Entrená con Martín <b>Toro</b> · GIZE', 'el título de la pestaña');
  t.eq(await p.$eval('.perfil .lema', e => e.textContent), 'Entrená conmigo en GIZE', 'abajo del nombre: «Entrená conmigo en GIZE»');
  for (const f of ['Mi código de invitación', 'Copiar código', 'Bajate GIZE', 'Creá tu cuenta', 'Poné el código de tu coach', '¿Ya tenés GIZE? Abrí la app y poné el código en Ajustes → Código de tu coach o gimnasio'])
    t.has(v.texto, f, 'la página dice: ' + f);
  t.ok(!/no está disponible|No encontramos|Reintentar|Cargando/.test(v.texto), 'no se ve otro estado: ' + v.texto);
  t.eq(pg.st.pedidos, ['toro'], 'le pide a la base el link, una vez');
  const h = pg.st.hdr[0] || {};
  t.ok(h.apikey === clave(js) && h.authorization === 'Bearer ' + clave(js), 'se pide sin sesión (con la clave pública), aunque la app tenga una guardada');
  t.eq(pg.st.firmas.map(f => [decodeURIComponent(f.path), f.body]), [['/storage/v1/object/sign/avatars/' + FOTO, { expiresIn: 3600 }]], 'la foto: un link firmado de una hora (lo dice la política)');
  t.ok(pg.st.firmas.every(f => f.hdr.authorization === 'Bearer ' + clave(js)), 'el link firmado también se pide sin sesión');
  t.ok(v.foto && v.foto.w > 0 && v.foto.src === SB + '/storage/v1/object/sign/avatars/' + encodeURI(FOTO) + '?token=abc' && v.ini === null, 'se ve la foto con el link firmado, sin las iniciales: ' + JSON.stringify(v.foto));
  t.eq(v.tiendas && v.tiendas.map(x => x.txt), ['Descargala en la App Store', 'Descargala en Google Play'], 'iPhone: primero la App Store');
  const play = v.tiendas && new URL(v.tiendas.find(x => /Google Play/.test(x.txt)).href);
  t.ok(!!play && play.origin + play.pathname === 'https://play.google.com/store/apps/details' && [...play.searchParams.keys()].join() === 'id,referrer' && play.searchParams.get('id') === 'ar.com.gize.app',
    'Google Play: la app de GIZE y el referrer, nada más: ' + (play && play.href));
  t.eq(play && play.searchParams.get('referrer'), 'utm_source=gize&utm_medium=pagina-coach&utm_content=toro', 'a Google Play solo le llega el nombre del link (lo dice la política)');
  t.eq(v.tiendas && v.tiendas.find(x => /App Store/.test(x.txt)).href, APP_STORE, 'App Store: la app de GIZE, sin nada del coach');
  t.ok(v.tiendas && v.tiendas.every(x => x.target === '_blank' && /noopener/.test(x.rel)), 'las tiendas se abren aparte, con noopener');
  t.eq(v.web, '/app/#coach=toro', '«Usá GIZE en la web» lleva a la app con la invitación');
  t.eq(v.qr, 0, 'iPhone: sin QR');
  // Nada sale más que a este sitio y a Supabase (ni Google Fonts ni nada que anote la visita).
  const afuera = pg.st.red.filter(u => !u.startsWith(base + '/') && !u.startsWith(SB + '/'));
  t.eq(afuera, [], 'no se le pide nada a otro sitio');
  t.eq(pg.st.red.filter(u => u.startsWith(SB + '/')).map(u => new URL(u).pathname.replace(/avatars\/.*/, 'avatars/…')),
    ['/rest/v1/rpc/coach_pagina_ver', '/storage/v1/object/sign/avatars/…', '/storage/v1/object/sign/avatars/…'], 'a Supabase: la página, el link de la foto y la foto');
  // Copiar y tocar una tienda copian el código.
  await p.click('#copiar'); await wait(200);
  t.eq([await p.evaluate(() => window.__copiado), (await ver(p)).aviso], ['K7XM2PQA', 'Copiamos el código K7XM2PQA.'], '«Copiar código» copia el código y lo avisa');
  await p.evaluate(() => { window.__copiado = null; document.addEventListener('click', e => { if (e.target.closest('.store')) e.preventDefault(); }); });
  await p.click('#appstore'); await wait(200);
  t.eq([await p.evaluate(() => window.__copiado), (await ver(p)).aviso], ['K7XM2PQA', 'Copiamos el código K7XM2PQA: pegalo cuando la app te lo pida.'], 'tocar una tienda copia el código para pegarlo en la app');
  t.eq(await p.evaluate(() => window.__csp), [], 'la CSP no bloquea nada');
  t.eq(pg.errs, [], 'iPhone: errores de la página');
  await pg.close();

  // 3) Android: Google Play primero. Sin foto: las iniciales. Sin portapapeles: el método viejo.
  pg = await abrir(base, '/c/toro', { ua: UA.android, toro: Object.assign({}, TORO, { nombre: 'Ana López', foto: null }) });
  p = pg.p; v = await ver(p);
  t.eq(v.tiendas && v.tiendas.map(x => x.txt), ['Descargala en Google Play', 'Descargala en la App Store'], 'Android: primero Google Play');
  t.eq([v.foto, v.ini], [null, 'AL'], 'sin foto: las iniciales');
  t.eq(pg.st.firmas, [], 'sin foto no se pide ningún link');
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('no'); } } });
    document.execCommand = c => { window.__exec = c + ':' + [...document.querySelectorAll('textarea')].map(x => x.value).join(); return true; }; });
  await p.click('#copiar'); await wait(200);
  t.eq([await p.evaluate(() => window.__exec), (await ver(p)).aviso], ['copy:K7XM2PQA', 'Copiamos el código K7XM2PQA.'], 'sin el portapapeles nuevo, copia con el método viejo');
  t.eq(pg.errs, [], 'Android: errores de la página');
  await pg.close();

  // 4) Las otras formas del link: mayúsculas y barra, los ?utm de Instagram y el plan B (?a=).
  for (const u of ['/c/TORO/', '/c/toro?utm_source=ig&utm_medium=social', '/c/?a=toro', '/c/?a=Toro&utm_source=ig']){
    pg = await abrir(base, u);
    v = await ver(pg.p);
    t.ok(v.estado === 'coach' && v.codigo === 'K7XM2PQA' && pg.st.pedidos.join() === 'toro', u + ': la página del coach (pide «toro»): ' + JSON.stringify([v.estado, pg.st.pedidos]));
    t.eq(v.dir, u, u + ': la dirección queda como está');
    t.eq(pg.errs, [], u + ': errores de la página');
    await pg.close();
  }
  // Un link anterior: la página del mismo coach y la dirección pasa al link vigente.
  for (const [u, nueva] of [['/c/toro-viejo', '/c/toro'], ['/c/?a=toro-viejo', '/c/?a=toro']]){
    pg = await abrir(base, u);
    v = await ver(pg.p);
    t.ok(v.estado === 'coach' && v.codigo === 'K7XM2PQA', u + ': la página del coach');
    t.eq(v.dir, nueva, u + ': la dirección pasa al link vigente');
    t.eq(v.web, '/app/#coach=toro', u + ': la web y la tienda van con el link vigente');
    await pg.close();
  }

  // 5) No disponible: el link no existe (o está apagado, o pausado: la base da null), está mal escrito
  //    (no se le pregunta a la base) o la base todavía no tiene la función.
  for (const [u, o, pide] of [['/c/nadie', {}, ['nadie']], ['/c/sin', { modo: 'sin' }, ['sin']], ['/c/a', {}, []], ['/c/to--ro', {}, []], ['/c/', {}, []], ['/c/%3Cb%3E', {}, []]]){
    pg = await abrir(base, u, o);
    v = await ver(pg.p);
    t.eq(v.estado, 'nodisp', u + ': no disponible');
    t.has(v.texto, 'Esta página no está disponible Pedile a tu coach su código para sumarte en GIZE.', u + ': lo dice');
    t.ok(v.codigo === null && v.nombre === null && !/K7XM2PQA|Copiar/.test(v.texto), u + ': sin código ni nombre');
    t.eq(v.tiendas && v.tiendas.map(x => x.href), [PLAY, APP_STORE], u + ': quedan las tiendas, sin referrer');
    t.eq(v.web, '/app/', u + ': y la web, sin invitación');
    t.eq(pg.st.pedidos, pide, u + ': lo que se le pregunta a la base');
    t.eq(v.titulo, 'Página no disponible · GIZE', u + ': el título');
    t.eq(pg.errs, [], u + ': errores de la página');
    await pg.close();
  }

  // 6) Sin señal o con la base caída: «Reintentar», que vuelve a pedirla.
  for (const modo of ['sin-senal', 'caida']){
    pg = await abrir(base, '/c/toro', { modo });
    v = await ver(pg.p);
    t.ok(v.estado === 'error' && v.reintentar && v.codigo === null, modo + ': ofrece «Reintentar»: ' + v.texto);
    t.has(v.texto, 'No pudimos abrir la página', modo + ': lo dice');
    pg.st.modo = null;
    await pg.p.click('#reintentar'); await wait(700);
    v = await ver(pg.p);
    t.ok(v.estado === 'coach' && v.codigo === 'K7XM2PQA' && pg.st.pedidos.length === 2, modo + ': al reintentar se ve la página');
    t.eq(pg.errs, [], modo + ': errores de la página');
    await pg.close();
  }
  // La base no contesta: a los 8 s corta y ofrece «Reintentar».
  pg = await abrir(base, '/c/toro', { modo: 'colgada', espera: 500 });
  t.eq((await ver(pg.p)).estado, 'cargando', 'mientras la base no contesta: cargando');
  await wait(8300);
  v = await ver(pg.p);
  t.ok(v.estado === 'error' && v.reintentar, 'a los 8 s sin respuesta: «Reintentar»');
  t.eq(pg.errs, [], 'colgada: errores de la página');
  await pg.close();

  // 7) Cualquier otra dirección: el 404 común, sin pedirle nada a la base.
  for (const u of ['/cualquier-cosa', '/app/no-existe', '/c/toro/otra']){
    pg = await abrir(base, u);
    v = await ver(pg.p);
    t.eq(v.estado, '404', u + ': el 404 común');
    t.has(v.texto, 'No encontramos esta página', u + ': lo dice');
    t.eq(await pg.p.$$eval('main a.btn', as => as.filter(a => a.getClientRects().length).map(a => [a.getAttribute('href'), a.textContent])), [['/', 'Ir a GIZE']], u + ': con «Ir a GIZE»');
    t.ok(v.tiendas === null && v.codigo === null, u + ': sin tiendas ni código');
    t.eq(pg.st.red.filter(x => x.startsWith(SB)), [], u + ': no se le pide nada a la base');
    t.eq(v.titulo, 'No encontramos esta página · GIZE', u + ': el título');
    t.ok(await pg.p.evaluate(async () => { await document.fonts.load('600 16px Outfit');
      return document.fonts.check('600 16px Outfit') && [...document.images].filter(i => i.getAttribute('src')).every(i => i.naturalWidth > 0); }), u + ': la letra y el logo cargan (rutas absolutas)');
    t.eq(await pg.p.evaluate(() => window.__csp), [], u + ': la CSP no bloquea nada');
    t.eq(pg.errs, [], u + ': errores de la página');
    await pg.close();
  }

  // 8) En la compu: el QR de la página (para abrirla en el celular); Google Play primero.
  pg = await abrir(base, '/c/toro', { vp: { width: 1280, height: 860 }, espera: 1500 });
  v = await ver(pg.p);
  t.ok(v.estado === 'coach' && v.qr > 100, 'compu: se ve el QR de la página');
  t.ok(await pg.p.$eval('#qr svg', e => e.getBoundingClientRect().width >= 110).catch(() => false), 'compu: el QR tiene buen tamaño para escanearlo');
  t.eq(v.tiendas && v.tiendas[0].txt, 'Descargala en Google Play', 'compu: Google Play primero, como en la portada');
  t.ok(pg.st.red.some(u => u === base + '/vendor/qrcode-generator-1.4.4.js'), 'compu: la librería del QR sale de vendor/');
  t.eq(await pg.p.evaluate(() => window.__csp), [], 'compu: la CSP no bloquea nada');
  t.eq(pg.errs, [], 'compu: errores de la página');
  await pg.close();

  // 9) Sin JavaScript: un aviso con las tiendas y la web (sin «Cargando»).
  const ctx = await (await getBrowser()).newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const sj = await ctx.newPage();
  await comoGitHub(sj, base);
  await sj.goto(base + '/c/toro'); await wait(300);
  const sinJs = await sj.evaluate(() => ({ texto: document.body.innerText.replace(/\s+/g, ' ').trim(), tiendas: [...document.querySelectorAll('#tiendas a')].filter(a => a.getClientRects().length).length }));
  t.eq(sinJs.tiendas, 2, 'sin JavaScript: se ven las dos tiendas');
  t.has(sinJs.texto, 'Entrená con tu coach en GIZE', 'sin JavaScript: el aviso');
  t.ok(!/Cargando|no está disponible|No encontramos|Reintentar|Copiar/.test(sinJs.texto), 'sin JavaScript: no se ve ningún otro estado: ' + sinJs.texto);
  await ctx.close();

  // 10) En el celular (390 y 320 px), sin scroll de costado; con «reducir movimiento», todo quieto y
  //     todo el texto se lee.
  for (const [w, reduced] of [[390, 'reduce'], [320, 'no-preference']]){
    pg = await abrir(base, '/c/toro', { vp: { width: w, height: 760 }, reduced, toro: Object.assign({}, TORO, { nombre: 'María Florencia Rodríguez Saavedra' }) });
    p = pg.p;
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    t.ok(sw <= w, w + ' px: sin scroll de costado (' + sw + ')');
    const tiendas = await p.$$eval('#tiendas a.store', as => as.map(a => { const r = a.getBoundingClientRect(), s = a.querySelector('span').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && s.right <= r.right; }));
    t.ok(tiendas.length === 2 && tiendas.every(Boolean), w + ' px: las tiendas entran enteras');
    if (reduced === 'reduce'){
      const anim = await p.evaluate(() => [...document.querySelectorAll('*')].filter(e => [null, '::before', '::after'].some(ps => getComputedStyle(e, ps).animationName !== 'none')).map(e => e.className || e.tagName));
      t.eq(anim, [], w + ' px: con «reducir movimiento» no se anima nada');
      const malos = [];
      const H = await p.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < H; y += 600){ await p.evaluate(y => scrollTo(0, y), y); await wait(60); malos.push(...(await contraste(p, 'body')).malos); }
      t.eq([...new Set(malos)], [], w + ' px: todo el texto se lee (contraste 4,5)');
    }
    t.eq(pg.errs, [], w + ' px: errores de la página');
    await pg.close();
  }
}
