// Gimnasios, etapa 1: las apps instaladas que no se actualizan (spec §3.4). Corre el código de la app de
// antes de los gimnasios (el de main cuando salió la rama: APP_VIEJA; si no está en el clon, origin/main)
// contra lo que contesta el servidor nuevo:
// a) Profe sin alumnos propios: la política de coach_billing no le muestra su fila de prueba, y sin fila
//    la app vieja lo trata como activo y sin tope (sin la tira ni la pantalla de pago), aunque atienda
//    15 socios. Con su fila de prueba a la vista (lo que pasaría sin la política) le saldría la
//    pantalla de pago: así se ve que lo que lo evita es el servidor.
// b) Socio que pone el código del gimnasio: join_coach responde 400 con un P0001 «Listo: le pediste a
//    Gimnasio Fuerza que te sume…», y la app vieja lo muestra tal cual (en la web y en el iPhone, donde
//    no nombra el plan).
// c) Dueño con la app vieja: el panel de coach de siempre, con su fila (la del gimnasio).
// d) Si hay un PostgREST local (POSTGREST=ruta del binario, o postgrest en el PATH) y Postgres: el 400 de
//    join_coach confirma la transacción (la solicitud queda guardada) y supabase-js arma el error con el
//    código P0001 y el texto. Si no hay, se saltea con un aviso (queda en la lista para verificar antes
//    de aplicar, tests/pg/README.md).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newPage, wait } from './lib.mjs';
import { handlersGym, PROFE, DUENA, ALUMNO, S, ID, IOS, captura } from './gym-comun.mjs';
import { pg } from './pg.mjs';
import { P, DATOS, canon } from './gimnasios-comun.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// main cuando salió la rama de los gimnasios (sin el módulo del gimnasio en la app).
const APP_VIEJA = '531af8383ae8d3bed0e9eea70170ce1fa7b9dd02';
const ARCHIVOS = ['app', 'css', 'brand', 'vendor', 'assets', 'install.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon-maskable-512.png', 'sw.js'];
const LISTO = 'Listo: le pediste a Gimnasio Fuerza que te sume. Cuando te acepten vas a ver a tu profe acá.';
const dias = n => new Date(Date.now() + n * 864e5).toISOString();

// Saca la app vieja del historial a una carpeta temporal. null si el clon no la tiene.
function appVieja(){
  for (const ref of [APP_VIEJA, 'origin/main']){
    if (spawnSync('git', ['cat-file', '-e', ref + '^{commit}'], { cwd: ROOT }).status !== 0) continue;
    if (spawnSync('git', ['cat-file', '-e', ref + ':app/screens/gym/index.js'], { cwd: ROOT }).status === 0) continue;   // ya trae el gimnasio
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-app-vieja-'));
    const a = spawnSync('git', ['archive', '--format=tar', ref, '--', ...ARCHIVOS.filter(f => spawnSync('git', ['cat-file', '-e', ref + ':' + f], { cwd: ROOT }).status === 0)], { cwd: ROOT, maxBuffer: 1 << 28 });
    if (a.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
    const x = spawnSync('tar', ['-x', '-C', dir], { input: a.stdout });
    if (x.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
    return { dir, ref };
  }
  return null;
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
function servir(dir){
  const srv = http.createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, base: 'http://127.0.0.1:' + srv.address().port })));
}
const texto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);

// 15 socios del gimnasio que atiende el profe (sus «clientes» para la app vieja).
const SOCIOS = Array.from({ length: 15 }, (_, i) => ({ id: ID('3' + String(i).padStart(2, '0')), full_name: ['Martina Sosa', 'Juan Pérez', 'Lucía Gómez', 'Pedro Díaz', 'Sofía Romero'][i % 5] + ' ' + (i + 1), role: 'client', coach_id: PROFE.id }));

export default async function ({ t }){
  const vieja = appVieja();
  if (!vieja) { console.log('    — se saltea la app vieja: el clon no tiene ' + APP_VIEJA.slice(0, 7) + ' ni origin/main sin el gimnasio'); }
  else {
    console.log('    app vieja: ' + vieja.ref.slice(0, 12));
    const { srv, base } = await servir(vieja.dir);
    try {
      const entrar = async (user, o, extra = {}) => {
        const { handlers } = handlersGym(user, o);
        const pg = await newPage(Object.assign({ user, handlers, viewport: { width: 390, height: 844 } }, extra));
        await pg.p.goto(base + '/app/'); await wait(2800);
        return pg;
      };
      // a) Profe sin alumnos propios: el servidor no le muestra su fila de coach_billing.
      for (const [donde, init] of [['web', undefined], ['iPhone', IOS]]){
        const pg = await entrar(PROFE, { nombre: 'Lucía Profe', alumnos: SOCIOS, handlers: { '/coach_billing': (r, J, i) => J(i.one ? null : []) } }, { init });
        const host = await texto(pg.p, '#coachHost');
        t.ok(!(await pg.p.$('.pl-wall')), donde + ': profe sin fila → sin la pantalla de pago');
        t.ok(!(await pg.p.$('.pl-banner')), donde + ': y sin la tira del plan');
        t.has(host, 'Martina Sosa 1', donde + ': ve a sus 15 socios como clientes');
        await captura(pg.p, 'app-vieja-profe-sin-fila-' + (init ? 'iphone' : 'web') + '-cel');
        t.ok(!/\$|precio|Ver planes|Pagar/i.test(host), donde + ': nada de precios ni planes');
        t.eq(pg.errs, [], 'errores de la página (profe, ' + donde + ')');
        await pg.close();
      }
      // Lo que pasaría sin la política: con su fila de prueba (tope 10) y 15 socios, la pantalla de pago.
      {
        const pg = await entrar(PROFE, { nombre: 'Lucía Profe', alumnos: SOCIOS, billing: { plan: 'trial', max_clients: 10, trial_ends_at: dias(5), paid_until: null, seats_used: 0 } });
        t.ok(!!(await pg.p.$('.pl-wall')), 'control: con la fila de prueba a la vista, la app vieja le mostraría la pantalla de pago');
        await captura(pg.p, 'app-vieja-profe-control-con-fila-cel');
        await pg.close();
      }
      // b) Socio que pone el código del gimnasio: el 400 con el P0001 «Listo…», tal cual.
      for (const [donde, init] of [['web', undefined], ['iPhone', IOS]]){
        const pedidos = [];
        const pg = await entrar(ALUMNO, { rol: 'client', nombre: 'Nora Vidal', handlers: {
          '/rpc/join_coach': (r, J, i) => { pedidos.push(JSON.parse(i.body)); return J({ code: 'P0001', message: LISTO, details: null, hint: null }, 400); } } },
          { init, tocarAvisos: false, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} } });
        await pg.p.click('#nav-config'); await wait(500);
        await pg.p.fill('#joinCode', 'FUERZA22');
        await pg.p.click('[data-auth="join"]'); await wait(900);
        await captura(pg.p, 'app-vieja-socio-codigo-gimnasio-' + (init ? 'iphone' : 'web') + '-cel');
        if (await pg.p.$('.av-btn')) await pg.p.click('.av-btn');
        t.eq(pedidos, [{ code: 'FUERZA22' }], donde + ': la app vieja manda el código del gimnasio a join_coach');
        t.eq(pg.dialogs[pg.dialogs.length - 1], LISTO, donde + ': y muestra «Listo: le pediste a Gimnasio Fuerza que te sume…» tal cual');
        t.eq(pg.errs, [], 'errores de la página (socio, ' + donde + ')');
        await pg.close();
      }
      // c) Dueño con la app vieja: el panel de coach de siempre, con su fila (la del gimnasio).
      {
        const alumnos = SOCIOS.slice(0, 12).map(s => Object.assign({}, s, { coach_id: DUENA.id })).concat([{ id: ID('99'), full_name: 'Tomás Herrera', role: 'client', coach_id: DUENA.id }]);
        const pg = await entrar(DUENA, { nombre: 'Carla Dueña', alumnos, billing: { plan: 'p250', max_clients: 250, trial_ends_at: dias(-300), paid_until: dias(40), seats_used: 182 } });
        t.ok(!(await pg.p.$('.pl-wall')), 'dueño: sin pantalla de pago');
        t.has(await texto(pg.p, '.pl-banner'), 'Plan Gimnasio · 13/250', 'dueño: la tira de su plan (el del gimnasio), como siempre en la web');
        t.has(await texto(pg.p, '#coachHost'), 'Tomás Herrera', 'dueño: ve a sus socios y a su alumno propio');
        t.eq(pg.errs, [], 'errores de la página (dueño)');
        await pg.close();
      }
    } finally {
      srv.close(); fs.rmSync(vieja.dir, { recursive: true, force: true });
    }
  }

  // d) PostgREST de verdad: el 400 de join_coach confirma la transacción.
  const bin = process.env.POSTGREST || (spawnSync('sh', ['-c', 'command -v postgrest']).stdout || '').toString().trim();
  if (!bin || !fs.existsSync(bin)) { console.log('    — se saltea PostgREST: no hay binario (POSTGREST=ruta o postgrest en el PATH)'); return; }
  const h = await pg();
  if (h.saltear || !h.dir) { console.log('    — se saltea PostgREST: ' + (h.saltear || 'la base no es un cluster local')); return; }
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas de la matriz cargadas');
  const secreto = crypto.randomBytes(32).toString('hex'), puerto = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(bin, [], { env: Object.assign({}, process.env, {
    PGRST_DB_URI: `postgresql:///${db.nombre}?host=${h.dir}&port=5432&user=postgres`, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: secreto, PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(puerto), PGRST_DB_POOL: '2', PGRST_LOG_LEVEL: 'crit' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = ''; proc.stdout.on('data', d => { salida += d; }); proc.stderr.on('data', d => { salida += d; });
  try {
    const url = 'http://127.0.0.1:' + puerto;
    let listo = false;
    for (let i = 0; i < 60 && !listo; i++) { try { listo = (await fetch(url + '/')).status === 200; } catch (e) {} if (!listo) await wait(250); }
    t.ok(listo, 'PostgREST arrancó: ' + salida.slice(-300));
    if (!listo) return;
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const jwt = sub => { const c = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
      return c + '.' + crypto.createHmac('sha256', secreto).update(c).digest('base64url'); };
    // Directo por HTTP.
    const r = await fetch(url + '/rpc/join_coach', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt(P.N) }, body: JSON.stringify({ code: 'FUERZA22' }) });
    const cuerpo = await r.json();
    t.eq([r.status, cuerpo.code, cuerpo.message], [400, 'P0001', LISTO], 'PostgREST: join_coach con el código del gimnasio responde 400 con el P0001 «Listo…»');
    const guardado = await db.json(`select jsonb_build_object('fichas', (select jsonb_agg(jsonb_build_array(status, source)) from public.gym_members where member_id = '${P.N}'),
      'audit', (select count(*) from public.gym_audit where action = 'solicitud' and target_user = '${P.N}'), 'coach', (select coach_id from public.profiles where id = '${P.N}'))`);
    t.eq(canon(guardado), canon({ fichas: [['pendiente', 'codigo']], audit: 1, coach: null }), 'y la transacción se confirmó: la solicitud quedó guardada (pendiente), con su registro, y el coach no cambió');
    // Con supabase-js (el de la app), como lo arma la app: el error con el código y el texto.
    const pgp = await newPage({});
    await pgp.p.route('http://sb.prueba/**', async route => {
      const u = new URL(route.request().url());
      if (!u.pathname.startsWith('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' });
      const resp = await route.fetch({ url: url + u.pathname.slice(8) + u.search });
      return route.fulfill({ response: resp });
    });
    await pgp.p.goto('http://sb.prueba/');
    await pgp.p.addScriptTag({ path: path.join(ROOT, 'vendor/supabase-2.117.1.js') });
    const rj = await pgp.p.evaluate(async tok => {
      const c = window.supabase.createClient('http://sb.prueba', 'anon-de-prueba', { auth: { persistSession: false }, global: { headers: { Authorization: 'Bearer ' + tok } } });
      const x = await c.rpc('join_coach', { code: 'NRTE2345' });
      return { data: x.data, status: x.status, code: x.error && x.error.code, message: x.error && x.error.message };
    }, jwt(P.N2));
    t.eq(rj, { data: null, status: 400, code: 'P0001', message: 'Listo: le pediste a Gimnasio Norte que te sume. Cuando te acepten vas a ver a tu profe acá.' },
      'supabase-js arma el error con el código P0001 y el texto (lo que muestra la app vieja)');
    t.eq(await db.json(`select to_jsonb(count(*)) from public.gym_members where member_id = '${P.N2}' and status = 'pendiente'`), 1, 'y esa solicitud también quedó guardada');
    await pgp.close();
  } finally {
    proc.kill('SIGTERM');
    await new Promise(ok => { proc.on('exit', ok); setTimeout(ok, 3000); });
    await db.borrar();
  }
}
