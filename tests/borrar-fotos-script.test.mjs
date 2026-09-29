// Script que vacía el bucket «checkins» (scripts/borrar-fotos-progreso.mjs, lo corre el workflow
// «Supabase»): contra un Storage simulado borra todo (con más de 1000 archivos en una carpeta
// y en subcarpetas), se puede correr de nuevo, y en el log (público) solo quedan cantidades.
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'borrar-fotos-progreso.mjs');
const KEY = 'clave-de-servicio-de-prueba';
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '55555555-5555-5555-5555-555555555555';

// Storage simulado: list (por carpeta, de a «limit», con carpetas como id null) y borrar.
function fakeStorage(files, { status } = {}){
  const reqs = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const send = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      const u = new URL(req.url, 'http://x'), b = body ? JSON.parse(body) : {};
      reqs.push({ m: req.method, path: u.pathname, auth: req.headers.authorization, apikey: req.headers.apikey, n: (b.prefixes || []).length });
      if (status) return send(status, { error: 'x', message: 'Object ' + U1 + '/secreto.jpg' });
      if (req.headers.apikey !== KEY || req.headers.authorization !== 'Bearer ' + KEY) return send(401, { message: 'sin permiso' });
      if (req.method === 'POST' && u.pathname === '/storage/v1/object/list/checkins'){
        const pre = b.prefix ? b.prefix.replace(/\/?$/, '/') : '';
        const level = new Map();
        for (const f of files) if (f.startsWith(pre)){
          const rest = f.slice(pre.length), i = rest.indexOf('/');
          if (i < 0) level.set(rest, { name: rest, id: 'id-' + f });
          else if (!level.has(rest.slice(0, i))) level.set(rest.slice(0, i), { name: rest.slice(0, i), id: null });
        }
        const all = [...level.values()].sort((x, y) => x.name < y.name ? -1 : 1);
        return send(200, all.slice(b.offset || 0, (b.offset || 0) + Math.min(b.limit || 100, 1000)));
      }
      if (req.method === 'DELETE' && u.pathname === '/storage/v1/object/checkins'){
        const gone = (b.prefixes || []).filter(p => files.has(p));
        gone.forEach(p => files.delete(p));
        return send(200, gone.map(p => ({ name: p, bucket_id: 'checkins' })));
      }
      send(404, { message: 'no existe' });
    });
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, reqs, url: 'http://127.0.0.1:' + srv.address().port })));
}

function run(url, key = KEY){
  return new Promise(ok => {
    const ch = spawn(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH, SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } });
    let out = '';
    ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => out += d);
    ch.on('close', code => ok({ code, out }));
  });
}

export default async function ({ t }){
  const files = new Set();
  for (let i = 0; i < 1203; i++) files.add(U1 + '/' + (1700000000000 + i) + '.jpg');
  files.add(U2 + '/1700000000000.jpg'); files.add(U2 + '/viejas/1.png'); files.add(U2 + '/.emptyFolderPlaceholder');
  const total = files.size;
  const fake = await fakeStorage(files);
  try {
    const r1 = await run(fake.url);
    t.eq(r1.code, 0, 'termina bien: ' + r1.out);
    t.eq(files.size, 0, 'queda vacío el bucket');
    t.has(r1.out, 'Archivos en el bucket checkins: ' + total, 'cuenta los archivos');
    t.has(r1.out, 'Archivos borrados: ' + total, 'dice cuántos borró');
    t.has(r1.out, 'Quedan en el bucket: 0', 'confirma que no quedó nada');
    t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}|\.jpg|\.png|Placeholder/.test(r1.out), 'el log no muestra ids ni rutas: ' + r1.out);
    t.ok(fake.reqs.every(q => q.n <= 100), 'borra de a tandas de 100 como máximo');
    t.ok(fake.reqs.every(q => !/checkin_photos|avatars|productos|chat-audio/.test(q.path)), 'solo toca el bucket checkins');

    const r2 = await run(fake.url);
    t.eq(r2.code, 0, 'se puede correr de nuevo: ' + r2.out);
    t.has(r2.out, 'Archivos borrados: 0', 'la segunda vez no hay nada para borrar');

    const r3 = await run(fake.url, 'otra-clave');
    t.eq(r3.code, 1, 'con una clave que no sirve, falla');
    t.has(r3.out, 'Supabase respondió 401', 'avisa el código');
  } finally { fake.srv.close(); }

  // Si Supabase devuelve un error, del cuerpo no se imprime nada (puede traer rutas).
  const bad = await fakeStorage(new Set([U1 + '/1.jpg']), { status: 500 });
  try {
    const r = await run(bad.url);
    t.eq(r.code, 1, 'un error de Supabase corta con error');
    t.ok(!r.out.includes(U1) && !r.out.includes('secreto'), 'no imprime lo que respondió Supabase: ' + r.out);
  } finally { bad.srv.close(); }

  const r4 = await run('');
  t.eq(r4.code, 1, 'sin SUPABASE_URL no hace nada');
}
