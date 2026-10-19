// Base compartida de productos: cada usuario lee solo las columnas del catálogo. Antes cualquier
// cuenta podía pedir created_by, created_at y photo_path de todos los productos y saber quién
// escaneó o pidió primero cada uno y cuándo (un coach podía seguir así a un alumno).
//   · productos-off-servidor.sql: sin permiso de lectura de la tabla entera, solo por columna.
//   · Lo que la app pide (columnas, filtros y orden de la búsqueda y del escáner) está todo
//     dentro de esas columnas: si no, la búsqueda dejaría de andar.
//   · Al borrar la cuenta, sus productos publicados quedan sin la foto del pedido (photo_path).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const PRIVADAS = ['created_by', 'created_at', 'photo_path', 'reviewed_at', 'reports'];

// Columnas que usa un GET de PostgREST: select, order, filtros (también los de "or=(...)").
function columnas(u){
  const out = new Set(), add = c => { c = String(c).trim(); if (c) out.add(c); };
  for (const [k, v] of u.searchParams){
    if (k === 'select') v.split(',').forEach(add);
    else if (k === 'order') v.split(',').forEach(x => add(x.split('.')[0]));
    else if (k === 'or' || k === 'and') (v.match(/[(,]([a-z_]+)\./g) || []).forEach(x => add(x.slice(1, -1)));
    else if (!['limit', 'offset', 'columns', 'on_conflict'].includes(k)) add(k);
  }
  return [...out];
}

export default async function ({ base, t }){
  const sql = read('supabase/productos-off-servidor.sql');
  t.ok(/revoke select on public\.products from anon, authenticated;/.test(sql), 'sin permiso de leer la tabla entera');
  const m = sql.match(/grant select \(([^)]*)\)\s+on public\.products to authenticated;/);
  t.ok(!!m, 'permiso de lectura por columna para los usuarios');
  const ok = m ? m[1].split(',').map(s => s.trim()) : [];
  t.eq(PRIVADAS.filter(c => ok.includes(c)), [], 'los usuarios no leen quién cargó el producto, cuándo ni la foto del pedido');

  // Lo que pide la app al buscar por nombre y al escanear un código.
  const gets = [];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: {
      '/profiles': profile('client'),
      '/products': (r, J, i) => { if (i.m !== 'GET') return undefined; gets.push(i.url); return J(i.one ? null : []); },
      '/productos-off': (r, J) => J({ missing: true }),
    } });
  await p.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"products":[]}' }));
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="search-open"]'); await wait(300);
  await p.fill('#foodSearch', 'pan lactal'); await wait(1800);
  await p.keyboard.press('Escape'); await wait(300);
  await p.goto(base + '/app/'); await wait(2000);
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="scan-open"]'); await wait(500);
  await p.fill('#scanCode', '7791234567895');
  await p.click('[data-action="scan-manual"]'); await wait(1500);
  await close();
  t.ok(gets.length >= 2, 'la app buscó en la base compartida por nombre y por código (' + gets.length + ' pedidos)');
  const usadas = [...new Set(gets.flatMap(columnas))].sort();
  t.ok(usadas.includes('search') && usadas.includes('code'), 'se vieron la búsqueda y el escáner: ' + usadas.join(', '));
  t.eq(usadas.filter(c => !ok.includes(c)), [], 'todo lo que pide la app está entre las columnas permitidas');
  t.eq(errs, [], 'errores de la página');

  // Al borrar la cuenta: sin la foto de sus pedidos en los productos publicados.
  const del = (read('supabase/pagos-seguros.sql').match(/create or replace function public\.delete_own_account\(\)[\s\S]*?end \$\$;/) || [''])[0].replace(/\s+/g, ' ');
  t.ok(/update public\.products set photo_path = null where photo_path like auth\.uid\(\)::text \|\| '\/%'; delete from auth\.users/.test(del),
    'delete_own_account saca la foto del pedido de los productos antes de borrar la cuenta');
}
