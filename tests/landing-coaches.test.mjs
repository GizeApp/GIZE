// Página para coaches (gize.ar/coaches/): la página que le habla al coach, por ahora escondida
// (noindex y sin links desde la página de inicio) hasta que el dueño la apruebe. Revisa:
//   · los precios: los de la app (PLANS de app/screens/coach/plan.js) son los mismos en lo que cobra el
//     servidor (suscripcion), en la base (plan_price), en la página de inicio y en esta página;
//   · «Agendá una llamada»: todos los botones abren el mismo mail a contacto@gize.ar (el formulario de
//     contacto que ya existe: cae en gize.ar/admin → Mensajes) con el pedido escrito;
//   · lo que se promete es verdad: «más de 260 ejercicios» cuenta nombres únicos de EX_DB, casi todos con
//     video, y nada de fotos de progreso ni IA Plus;
//   · las tiendas: Google Play y App Store (la app de iPhone ya está publicada) a las apps de verdad;
//   · las preguntas se abren sin JavaScript y dicen lo importante (prueba, vencimiento, pagos, fundador);
//   · el pie (privacidad, términos, arrepentimiento y baja del plan de coach), la vista previa al
//     compartir (canonical, og:*, la imagen de 1200 × 630 de menos de 300 KB);
//   · el diseño en el celular y en la compu, con «reducir movimiento» todo quieto, el contraste (AA) y
//     que la CSP no bloquee nada.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, contraste } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const money = n => '$' + Number(n).toLocaleString('es-AR');
const PLAY = 'https://play.google.com/store/apps/details?id=ar.com.gize.app';
const APP_STORE = 'https://apps.apple.com/ar/app/id6818266033';
const OG = 'https://gize.ar/assets/landing/og-coaches.jpg';
// Anota lo que la CSP de la página bloquee (errs solo junta los errores de JavaScript).
const CSP = "window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));";

export default async function ({ base, t }){
  // 1) Precios: una sola lista para todo.
  const plan = leer('app/screens/coach/plan.js');
  const PLANS = [...plan.matchAll(/\{ id: "(p\d+)", max: (\d+), price: (\d+)/g)].map(m => ({ id: m[1], max: +m[2], price: +m[3] }));
  t.eq(PLANS.map(p => p.id), ['p10', 'p25', 'p50', 'p100', 'p250', 'p500'], 'se leen los seis planes de plan.js');
  const WA = (plan.match(/const WA = "(\d+)"/) || [])[1];
  t.ok(!!WA, 'se lee el WhatsApp de GIZE de plan.js');
  const sus = leer('supabase/functions/suscripcion/index.ts'), admin = leer('supabase/admin.sql'), precios = leer('supabase/precios-2026-10.sql');
  for (const p of PLANS){
    t.ok(new RegExp(p.id + ': \\{ max: ' + p.max + ', price: ' + p.price + ',').test(sus), p.id + ': el servidor cobra lo mismo que la app (suscripcion/index.ts)');
    t.ok(new RegExp("when '" + p.id + "' then " + p.price + '\\b').test(admin), p.id + ': plan_price de admin.sql es el mismo');
    t.ok(new RegExp("when '" + p.id + "' then " + p.price + '\\b').test(precios), p.id + ': plan_price de precios-2026-10.sql es el mismo');
  }

  // La página de inicio: sus precios y, de paso, lo que dice EX_DB (cuántos ejercicios y con video).
  let pg = await newPage({ viewport: { width: 1280, height: 900 } });
  await pg.p.goto(base + '/'); await wait(600);
  const portada = await pg.p.$$eval('#precios .price a[href*="plan="]', as => as.map(a => ({ id: (a.getAttribute('href').match(/plan=(p\d+)/) || [])[1], txt: a.closest('.price').innerText.replace(/\s+/g, ' ') })));
  for (const p of PLANS){
    const c = portada.find(x => x.id === p.id);
    t.ok(!!c && c.txt.includes(money(p.price) + '/mes') && c.txt.includes('Hasta ' + p.max + ' '), p.id + ': la página de inicio muestra el mismo precio: ' + (c && c.txt));
  }
  const ej = await pg.p.evaluate(async () => {
    const { EX_DB } = await import('/app/core/data.js'), { libVideo } = await import('/app/core/videos.js');
    const nombres = [...new Set(Object.values(EX_DB).flat())];
    return { todos: Object.values(EX_DB).flat().length, unicos: nombres.length, conVideo: nombres.filter(n => libVideo(n)).length };
  });
  t.ok(ej.unicos > 260, '«más de 260 ejercicios» es verdad: ' + ej.unicos + ' nombres únicos (' + ej.todos + ' con los repetidos entre grupos)');
  t.ok(ej.conVideo >= ej.unicos * 0.9, '«casi todos con video» es verdad: ' + ej.conVideo + ' de ' + ej.unicos);
  // Escondida: mientras tenga noindex, la página de inicio no la enlaza.
  const escondida = /<meta name="robots" content="noindex">/.test(leer('coaches/index.html'));
  t.ok(escondida, 'la página para coaches todavía está escondida (noindex)');
  if (escondida) t.eq(await pg.p.$$eval('a[href]', as => as.map(a => new URL(a.href)).filter(u => (u.origin === location.origin || u.hostname === 'gize.ar') && /^\/coaches(\/|$)/.test(u.pathname)).map(u => u.href)),
    [], 'escondida: la página de inicio no enlaza /coaches/');
  t.eq(pg.errs, [], 'página de inicio: errores');
  await pg.close();

  // 2) La página, en la compu, en el celular y con «reducir movimiento».
  for (const [nom, vp, reduced] of [['compu', { width: 1280, height: 800 }, 'no-preference'], ['celu', { width: 390, height: 844 }, 'no-preference'], ['quieto', { width: 390, height: 844 }, 'reduce']]){
    pg = await newPage({ viewport: vp, reducedMotion: reduced, init: CSP });
    const { p } = pg;
    await p.goto(base + '/coaches/'); await wait(2600);
    const r = await p.evaluate(() => {
      const meta = s => { const e = document.querySelector(s); return e && (e.getAttribute('content') || e.getAttribute('href')); };
      const ws = [...document.querySelectorAll('.hero h1 .w')].map(e => +getComputedStyle(e).opacity);
      return { h1: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), ws, vis: getComputedStyle(document.querySelector('.hero-vis')).opacity,
        prueba: [...document.querySelectorAll('.hero a.btn')].map(a => a.getAttribute('href')), entrar: [...document.querySelectorAll('header a')].map(a => a.getAttribute('href')),
        desc: meta('meta[name="description"]'), robots: meta('meta[name="robots"]'), canonical: meta('link[rel="canonical"]'), ogUrl: meta('meta[property="og:url"]'),
        ogTitle: meta('meta[property="og:title"]'), ogDesc: meta('meta[property="og:description"]'), ogImg: meta('meta[property="og:image"]'), tw: meta('meta[name="twitter:card"]'),
        lang: document.documentElement.lang, scripts: document.scripts.length, texto: document.body.innerText };
    });
    t.eq(r.h1, 'Tu método, en el celular de cada alumno', nom + ': el título');
    t.ok(r.ws.length === 8 && r.ws.every(o => o === 1) && r.vis === '1', nom + ': el título y la compu terminan de entrar y se ven: ' + JSON.stringify([r.ws, r.vis]));
    t.eq(r.prueba[0], '../app/#registro-coach', nom + ': «Probar 14 días gratis» abre el registro de coach');
    t.ok(r.entrar.includes('../app/') && r.entrar.includes('../app/#registro-coach'), nom + ': la barra tiene «Probar gratis» y «Entrar»');
    t.has(r.desc, money(PLANS[0].price) + ' por mes', nom + ': la descripción nombra el plan más barato');
    t.eq(r.lang, 'es-AR', nom + ': idioma');
    t.eq(r.scripts, 0, nom + ': la página no tiene scripts');
    t.eq(r.robots, 'noindex', nom + ': escondida para Google hasta que el dueño la apruebe');
    t.eq([r.canonical, r.ogUrl, r.ogImg, r.tw], ['https://gize.ar/coaches/', 'https://gize.ar/coaches/', OG, 'summary_large_image'], nom + ': vista previa al compartir');
    t.ok(!!r.ogTitle && !!r.ogDesc && !/\$\d/.test(r.ogDesc), nom + ': og:title y og:description, sin precios');
    t.ok(!/fotos de progreso|fotos,/i.test(r.texto), nom + ': no promete fotos de progreso');
    t.ok(!/IA Plus|inteligencia artificial/i.test(r.texto), nom + ': no nombra IA Plus (todavía no está confirmado)');
    t.ok(/Más de 260 ejercicios/.test(r.texto), nom + ': dice «Más de 260 ejercicios»');
    const prometidos = [...r.texto.matchAll(/más de (\d+) ejercicios/gi)].map(m => +m[1]);
    t.ok(prometidos.length && prometidos.every(n => n < ej.unicos), nom + ': ningún número de ejercicios pasa de los que hay: ' + prometidos);

    // Precios: cada plan con su tope, su precio y su botón al registro con el plan elegido.
    await p.locator('#precios').scrollIntoViewIfNeeded(); await wait(500);
    const cards = await p.$$eval('[data-plan]', cs => cs.map(c => { const a = c.matches('a') ? c : c.querySelector('a'), b = c.getBoundingClientRect();
      return { id: c.dataset.plan, txt: c.innerText.replace(/\s+/g, ' '), href: a && a.getAttribute('href'), abs: a && a.href, top: Math.round(b.top), left: b.left, right: b.right }; }));
    t.eq(cards.map(c => c.id), PLANS.map(p => p.id), nom + ': están los seis planes, en orden');
    for (const pl of PLANS){
      const c = cards.find(x => x.id === pl.id) || { txt: '' };
      t.has(c.txt, 'Hasta ' + pl.max + ' alumnos', nom + ': tope de ' + pl.id);
      t.has(c.txt, money(pl.price) + '/mes', nom + ': precio de ' + pl.id);
      if (pl.max <= 50) t.has(c.txt, money(Math.round(pl.price / pl.max)) + ' por alumno', nom + ': precio por alumno de ' + pl.id);
      t.eq(c.href, '../app/?plan=' + pl.id + '#registro-coach', nom + ': el botón de ' + pl.id + ' lleva al registro con el plan');
      t.eq(c.abs, base + '/app/?plan=' + pl.id + '#registro-coach', nom + ': y desde /coaches/ llega a la app');
    }
    t.ok(cards.every(c => c.left >= 0 && c.right <= vp.width), nom + ': las tarjetas de precios entran en la pantalla');
    if (nom === 'compu') t.ok(cards[0].top === cards[1].top && cards[1].top === cards[2].top, 'compu: los tres planes de coach en una fila');
    else t.ok(cards[1].top > cards[0].top && cards[2].top > cards[1].top, nom + ': un plan debajo del otro');
    const precio = await p.$eval('#precios', e => e.innerText.replace(/\s+/g, ' '));
    for (const f of ['14 días gratis', 'sin tarjeta', 'Mercado Pago', 'transferencia', 'código de fundador', 'Mi plan'])
      t.has(precio, f, nom + ': Precios dice ' + f);

    // «Agendá una llamada»: el mismo mail en todos lados, a la casilla de contacto de GIZE.
    const ll = await p.$$eval('a[data-llamada]', as => as.map(a => ({ href: a.getAttribute('href'), txt: a.textContent.trim() })));
    t.ok(ll.length >= 3, nom + ': hay «Agendá una llamada» en la portada, en los pasos y al final: ' + ll.length);
    t.ok(ll.every(l => l.href === ll[0].href), nom + ': todos los botones de la llamada van al mismo lado');
    t.ok(ll.every(l => /agendá una llamada/i.test(l.txt)), nom + ': dicen «Agendá una llamada»');
    const u = new URL(ll[0] ? ll[0].href : 'x:');
    t.eq(u.protocol + u.pathname, 'mailto:contacto@gize.ar', nom + ': la llamada se pide por mail a contacto@gize.ar (cae en admin → Mensajes)');
    t.has(u.searchParams.get('subject') || '', 'llamada', nom + ': el asunto dice que es para una llamada');
    for (const f of ['gize.ar/coaches', 'llamada', 'alumnos', 'horarios']) t.has(u.searchParams.get('body') || '', f, nom + ': el mail ya escrito dice ' + f);
    t.eq((await p.$eval('#llamada', e => e.innerText)).includes('contacto@gize.ar'), true, nom + ': al final dice a qué mail escribir si no se abre');
    // Ningún mail ni teléfono más que los de GIZE (el repo es público).
    const ext = await p.$$eval('a[href]', as => as.map(a => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel })));
    t.ok(ext.filter(a => a.href.startsWith('mailto:')).every(a => /^mailto:contacto@gize\.ar(\?|$)/.test(a.href)), nom + ': los mails son solo a contacto@gize.ar');
    t.ok(ext.filter(a => /wa\.me/.test(a.href)).every(a => a.href.startsWith('https://wa.me/' + WA + '?text=')), nom + ': el WhatsApp es solo el de GIZE (el de plan.js)');
    t.ok(ext.filter(a => /^https?:/.test(a.href)).every(a => a.target === '_blank' && /noopener/.test(a.rel)), nom + ': los links de afuera abren en otra pestaña con noopener');
    t.ok(ext.filter(a => !/^(https?:|mailto:|#)/.test(a.href)).every(a => a.href.startsWith('../')), nom + ': los links del sitio son relativos con ../');

    // Tiendas: las dos apps de verdad (la de iPhone ya está publicada).
    const st = await p.$$eval('#alumnos a.store', as => as.map(a => ({ href: a.getAttribute('href'), txt: a.textContent.replace(/\s+/g, ' ').trim() })));
    t.eq(st, [{ href: PLAY, txt: 'Descargala en Google Play' }, { href: APP_STORE, txt: 'Descargala en App Store' }], nom + ': Google Play y App Store llevan a las apps');
    t.ok(!/muy pronto/i.test(r.texto), nom + ': ya no dice «Muy pronto»');

    // Preguntas: se abren sin JavaScript y dicen lo importante.
    const faq = await p.$$eval('#preguntas details', ds => ds.map(d => ({ q: (d.querySelector('summary') || {}).textContent || '', a: (d.querySelector('p') || {}).textContent || '', open: d.open })));
    t.ok(faq.length >= 8 && faq.every(f => f.q.trim() && f.a.trim().length > 30 && !f.open), nom + ': ocho o más preguntas cerradas, cada una con su respuesta: ' + faq.length);
    await p.locator('#preguntas summary').first().scrollIntoViewIfNeeded();
    await p.click('#preguntas summary'); await wait(300);
    t.ok(await p.$eval('#preguntas details', d => d.open && d.querySelector('p').getBoundingClientRect().height > 0), nom + ': al tocar la primera pregunta se abre');
    const resp = faq.map(f => f.q + ' ' + f.a).join(' ');
    for (const f of ['14 días', 'sin tarjeta', 'hasta 10', '4 días', 'Mercado Pago', 'transferencia', 'código de fundador', '10 días'])
      t.has(resp, f, nom + ': las preguntas dicen ' + f);

    // Pie: lo legal, con el plan de coach ya elegido en los botones de arrepentimiento y de baja.
    const pie = await p.$$eval('footer a', as => as.map(a => a.getAttribute('href')));
    for (const h of ['../', '../app/', '../privacidad/', '../terminos/', '../baja/?tipo=arrepentimiento&servicio=coach', '../baja/?tipo=baja&servicio=coach'])
      t.ok(pie.includes(h), nom + ': el pie lleva a ' + h);

    // Las imágenes cargan (se recorre la página para que carguen las de abajo) y la de compartir es de 1200 × 630.
    const alto = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < alto; y += 600){ await p.evaluate(y => scrollTo(0, y), y); await wait(60); }
    await wait(600);
    const imgs = await p.$$eval('img', is => Promise.all(is.map(i => Promise.race([i.decode().catch(() => {}), new Promise(ok => setTimeout(ok, 3000))]).then(() => ({ src: i.getAttribute('src'), w: i.naturalWidth })))));
    t.ok(imgs.length >= 7 && imgs.every(i => i.w > 0), nom + ': todas las imágenes cargan: ' + JSON.stringify(imgs.filter(i => !i.w)));
    if (nom === 'compu'){
      const og = await p.evaluate(async () => { const i = new Image(); i.src = '../assets/landing/og-coaches.jpg'; await i.decode(); return [i.naturalWidth, i.naturalHeight]; });
      t.eq(og, [1200, 630], 'la imagen para compartir mide 1200 × 630');
      const kb = fs.statSync(path.join(ROOT, 'assets/landing/og-coaches.jpg')).size / 1024;
      t.ok(kb < 300, 'la imagen para compartir pesa menos de 300 KB (si no, WhatsApp no la muestra): ' + Math.round(kb) + ' KB');
    }

    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    t.ok(sw <= vp.width, nom + ': sin scroll de costado (' + sw + ' de ' + vp.width + ')');

    if (reduced === 'reduce'){
      const anim = await p.evaluate(() => [...document.querySelectorAll('*')].filter(e => [null, '::before', '::after'].some(ps => getComputedStyle(e, ps).animationName !== 'none')).map(e => e.className || e.tagName));
      t.eq(anim, [], 'quieto: con «reducir movimiento» no se anima nada');
      // Contraste (AA): toda la página, una pantalla por vez, con las preguntas abiertas.
      await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      const malos = [];
      const H = await p.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < H; y += 700){
        await p.evaluate(y => scrollTo(0, y), y); await wait(80);
        const c = await contraste(p, 'body');
        malos.push(...c.malos);
      }
      t.eq([...new Set(malos)], [], 'quieto: todo el texto se lee (contraste 4,5)');
    }
    t.eq(await p.evaluate(() => window.__csp), [], nom + ': la CSP no bloquea nada');
    t.eq(pg.errs, [], nom + ': errores de la página');
    await pg.close();
  }

  // 3) Celulares chicos (320 y 340 px): tampoco se mueve de costado. El celular girado de la derecha
  //    en «Lo que ven tus alumnos» se pasaba del borde de la pantalla.
  for (const w of [320, 340]){
    pg = await newPage({ viewport: { width: w, height: 640 } });
    await pg.p.goto(base + '/coaches/'); await wait(800);
    const sw = await pg.p.evaluate(() => document.documentElement.scrollWidth);
    t.ok(sw <= w, w + ' px: sin scroll de costado (' + sw + ' de ' + w + ')');
    t.eq(pg.errs, [], w + ' px: errores de la página');
    await pg.close();
  }
}
