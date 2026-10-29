// Capturas de la página para coaches (gize.ar/coaches/), sacadas del panel del coach de verdad con
// datos inventados (los clientes y la rutina de tests/coach-neon-comun.mjs, más pesos, entrenos y un
// bloque de mentira): nunca de una cuenta real. Arma en assets/landing/:
//   coach-panel.webp        la lista de clientes con la tarjeta de uno (la de la portada de la página)
//   coach-rutina.webp       el editor de la rutina de un alumno
//   coach-seguimiento.webp  las estadísticas de un alumno (el peso, con el gráfico y la tabla)
//   og-coaches.jpg          la imagen para compartir (WhatsApp, Instagram…): 1200 × 630, sin precios
// Las capturas son de 1440 × 900 y pasan a webp en el mismo Chromium (canvas.toDataURL), así no hace
// falta otra herramienta. Sirve para rehacerlas cuando cambie el panel.
// Uso (Playwright con Chromium, ver tests/README.md):
//   PW=/ruta/a/playwright/index.mjs node scripts/capturas-coaches.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, closeBrowser, newPage, wait } from '../tests/lib.mjs';
import { COACH, ABRIR, handlers as BASE, go } from '../tests/coach-neon-comun.mjs';

if (!process.env.TZ) process.env.TZ = 'America/Argentina/Buenos_Aires';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/landing');
const DIA = 86400000;
const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
const hace = n => ymd(new Date(Date.now() - n * DIA));
const lunes = n => { const d = new Date(Date.now() - n * 7 * DIA); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };

// Martina (la que se abre): diez semanas de peso que baja de a poco, entrenos de pierna dos veces por
// semana con la sentadilla que sube, y un bloque de seis semanas con la sexta de descarga.
const PESOS = [];
for (let s = 9; s >= 0; s--) for (const [k, d] of [[0, 5], [1, 3], [2, 1]]) {
  const kg = 66.8 - (9 - s) * 0.33 + [0.2, -0.1, 0.05][k] + (s % 3 === 1 ? 0.15 : 0);
  PESOS.push({ id: 'w' + s + k, client_id: ABRIR, measured_on: hace(s * 7 + d), kg: kg.toFixed(1) });
}
const ENTRENOS = [];
for (let s = 7; s >= 0; s--) for (const [k, d] of [[0, 6], [1, 3]]) {
  if (s === 0 && k === 1) continue;
  const n = (7 - s) * 2 + k, sent = 60 + n * 1.25 - (n % 3 === 2 ? 2.5 : 0), prensa = 120 + n * 5;
  const serie = (ex, i, kg, reps) => ({ exercise_name: ex, set_order: i, kg, reps, secs: 0 });
  ENTRENOS.push({ id: 's' + n, client_id: ABRIR, performed_on: hace(s * 7 + d), day_name: 'Pierna', created_at: new Date(Date.now() - (s * 7 + d) * DIA).toISOString(), duration_s: 3900,
    session_entries: [serie('Sentadilla libre', 0, sent, 10), serie('Sentadilla libre', 1, sent, 9), serie('Sentadilla libre', 2, sent, 8),
      serie('Prensa 45°', 1000, prensa, 12), serie('Prensa 45°', 1001, prensa, 11), serie('Peso muerto rumano', 2000, 50 + n, 10)] });
}
const BLOQUE = { id: 'b1', client_id: ABRIR, name: 'Fuerza · bloque 2', weeks: 6, deloads: [6], start_date: lunes(2), active: true };
const handlers = Object.assign({}, BASE, {
  // Plan de 25 al día (en vez de la cortesía de las pruebas): así la tira dice lo que ve un coach.
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'p25', max_clients: 25, trial_ends_at: hace(60) + 'T12:00:00Z', paid_until: '2099-01-01T00:00:00Z', mp_status: 'authorized' }; return J(i.one ? b : [b]); },
  // El último peso de los demás (la tarjeta de la derecha) y cuántos check-ins mandó cada uno.
  '/body_weights': (r, J, i) => i.m === 'GET' ? J(i.url.search.includes(ABRIR) ? PESOS : [{ kg: '58.4' }]) : undefined,
  '/checkins': (r, J, i) => i.m === 'HEAD' ? r.fulfill({ status: 200, headers: { 'content-range': '*/9', 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' }, body: '' }) : i.m === 'GET' ? J([]) : undefined,
  '/sessions': (r, J, i) => i.m === 'GET' ? J(i.url.search.includes('client_id=eq.' + ABRIR) ? ENTRENOS : []) : undefined,
  '/blocks': (r, J, i) => i.m === 'GET' ? J(i.url.search.includes(ABRIR) ? [BLOQUE] : []) : undefined,
});

// PNG de la pantalla → webp (calidad .82), en el navegador.
async function webp(p, png){
  const b64 = await p.evaluate(async src => {
    const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    return c.toDataURL('image/webp', 0.82).split(',')[1];
  }, png.toString('base64'));
  return Buffer.from(b64, 'base64');
}
const guardar = (nombre, buf) => { fs.writeFileSync(path.join(OUT, nombre), buf); console.log(nombre + ': ' + Math.round(buf.length / 1024) + ' KB'); };
const foto = p => p.screenshot({ animations: 'disabled', caret: 'hide' });

// La portada de la imagen para compartir: la marca, el título, la frase y la captura del panel en una
// compu, con los colores de la página. Sin precios, para que no quede vieja.
const OG = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">
<link rel="stylesheet" href="/brand/fonts/outfit.css">
<style>
*{box-sizing:border-box}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:#030304;color:#fff;font-family:'Outfit',system-ui,sans-serif;position:relative}
.au{position:absolute;border-radius:50%;opacity:.3}
.a1{width:900px;height:900px;left:-380px;top:-420px;background:radial-gradient(closest-side,#2FA0FF,transparent)}
.a2{width:900px;height:900px;right:-420px;bottom:-520px;background:radial-gradient(closest-side,#A65CFF,transparent)}
.a3{width:600px;height:600px;right:120px;top:-380px;background:radial-gradient(closest-side,#FF3DAE,transparent);opacity:.18}
.txt{position:absolute;left:72px;top:84px;width:470px}
.txt img{height:46px;display:block}
.pill{display:inline-block;margin-top:44px;padding:8px 18px;border-radius:999px;font-size:20px;font-weight:600;border:1.5px solid transparent;
  background:linear-gradient(#0a0c12,#0a0c12) padding-box,linear-gradient(90deg,#2FA0FF,#A65CFF,#FF3DAE,#25E8C8) border-box}
h1{font-size:68px;line-height:1.02;letter-spacing:-.035em;margin:22px 0 0;font-weight:700}
h1 b{background:linear-gradient(90deg,#2FA0FF,#A65CFF,#FF3DAE);-webkit-background-clip:text;background-clip:text;color:transparent}
p{font-size:27px;line-height:1.35;color:#C3C9D2;margin:22px 0 0}
p b{display:block;margin-top:6px;color:#25E8C8;font-weight:600}
.compu{position:absolute;left:600px;top:118px;width:760px}
.pan{padding:10px;border-radius:18px 18px 6px 6px;background:linear-gradient(160deg,#2a2f3a,#0b0d11 40%,#1a1d25);box-shadow:0 0 0 1px rgba(255,255,255,.08),0 40px 90px -30px #000,0 0 80px -20px rgba(140,110,255,.6)}
.pan img{display:block;width:100%;border-radius:9px}
.base{height:16px;margin:0 -40px;border-radius:0 0 16px 16px;background:linear-gradient(#3a4250,#12151b)}
</style></head><body>
<div class="au a1"></div><div class="au a2"></div><div class="au a3"></div>
<div class="txt"><img src="/brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="pill">Para coaches y entrenadores</span>
<h1>GIZE para <b>coaches</b></h1><p>Tus alumnos entrenan con tu rutina. <b>14 días gratis, sin tarjeta</b></p></div>
<div class="compu"><div class="pan"><img src="/assets/landing/coach-panel.webp" alt=""></div><div class="base"></div></div>
</body></html>`;

const { srv, base } = await startServer();
try {
  const pg = await newPage({ user: COACH, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', handlers, init: "localStorage.setItem('gize_lite','0');" });
  const { p } = pg;
  await p.goto(base + '/app/'); await wait(3500);

  // 1) Clientes, con la tarjeta del primero abierta.
  await go(p, 'clientes'); await wait(800);
  guardar('coach-panel.webp', await webp(p, await foto(p)));

  // 2) La rutina de Martina, con el primer ejercicio abierto (series, reps, descanso y RIR).
  await go(p, 'rutina'); await wait(600);
  await p.click('.co-exc[data-id="e0"] .co-exc-chev'); await wait(500);
  await p.evaluate(() => { document.getElementById('coachHost').scrollTop = 0; }); await wait(200);
  guardar('coach-rutina.webp', await webp(p, await foto(p)));

  // 3) Sus estadísticas: el peso, con el promedio de cada semana.
  await p.click('[data-coach="client-tab"][data-t="stats"]'); await wait(700);
  await p.click('[data-coach="sec-open"][data-v="peso"]'); await wait(900);
  guardar('coach-seguimiento.webp', await webp(p, await foto(p)));
  if (pg.errs.length) console.log('errores del panel:', pg.errs);
  await pg.close();

  // 4) Imagen para compartir: una portada propia de 1200 × 630 con la captura del panel.
  const og = await newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
  await og.p.route(base + '/__og.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: OG }));
  await og.p.goto(base + '/__og.html'); await og.p.evaluate(() => document.fonts.ready); await wait(600);
  guardar('og-coaches.jpg', await og.p.screenshot({ type: 'jpeg', quality: 86 }));
  await og.close();
} finally {
  await closeBrowser(); srv.close();
}
