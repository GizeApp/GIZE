// supabase/gimnasios-control.sql: el control de solo lectura que se corre antes de aplicar los
// gimnasios*.sql en la base real.
// 1) Leído: el encabezado dice que es para antes de los gimnasios*.sql y que solo lee; el archivo no
//    crea, cambia, borra ni da permisos (ninguna sentencia que escriba) y es una sola consulta.
// 2) En Postgres de verdad (tests/pg.mjs; sin Postgres se saltea): en la base de hoy (gize_sin) y con
//    los gimnasios (gize_con) no falta nada (a lo sumo, el aviso de la versión de PostgREST, que en
//    la base de pruebas no corre); y sobre una copia rota a propósito, lista cada cosa que falta:
//    una tabla, una columna, RLS apagado, una función, un bucket. No cambia nada (la huella del
//    esquema es la misma antes y después).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conPg, huella } from './pg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = 'supabase/gimnasios-control.sql';

export default async function ({ t }){
  const sql = fs.existsSync(path.join(ROOT, SQL)) ? fs.readFileSync(path.join(ROOT, SQL), 'utf8') : '';
  t.ok(!!sql, 'existe ' + SQL);
  if (!sql) return;
  const cabeza = sql.split('\n').filter(l => l.startsWith('--')).slice(0, 12).join('\n');
  t.has(cabeza, 'SOLO LEE', 'encabezado: solo lee');
  t.ok(/ANTES de aplicar los archivos de los gimnasios/.test(cabeza) && /gimnasios\.sql, gimnasios-vinculo\.sql, gimnasios-lectura\.sql,\s*\n?--\s*gimnasios-socios\.sql y gimnasios-admin\.sql/.test(cabeza),
    'encabezado: se corre antes de los gimnasios*.sql, y dice cuáles');
  t.has(cabeza, 'SIN FILAS = está todo', 'encabezado: cómo leer el resultado');
  const code = sql.replace(/--[^\n]*/g, '');
  t.ok(!/\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|comment|notify|vacuum|copy|call|do)\b/i.test(code.replace(/'[^']*'/g, "''")),
    'ninguna sentencia que escriba (sin insert, update, delete, create, alter, drop, grant, do…)');
  t.eq(code.split(';').filter(s => s.trim()).length, 1, 'es una sola consulta');
  t.ok(!/\bset_config\b|\bpg_terminate|\bpg_cancel|\bdblink|\bpg_read_file/i.test(code), 'no cambia ajustes ni toca el servidor');

  const h = await conPg(t);
  if (!h) return;
  const correr = async db => (await db.json(`select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (${code.replace(/;\s*$/, '')}) x;`));
  const faltas = r => r.filter(x => x.tipo === 'falta').map(x => x.que + ' ' + x.objeto);
  for (const nombre of ['gize_sin', 'gize_con']){
    const db = await h.nueva(nombre);
    const r = await correr(db);
    t.eq(faltas(r), [], nombre + ': no falta nada');
    t.ok(r.every(x => x.tipo === 'falta' || (x.tipo === 'aviso' && x.que === 'postgrest')), nombre + ': a lo sumo el aviso de PostgREST: ' + JSON.stringify(r));
    await db.borrar();
  }

  // Una copia rota a propósito.
  const db = await h.nueva('gize_sin');
  await db.sql(`alter table public.coach_billing drop column apple_renueva;
    drop table public.join_code_attempts cascade;
    alter table public.blocks disable row level security;
    drop function public.bloqueo_entre(uuid, uuid) cascade;
    delete from storage.buckets where id = 'chat-audio';`);
  const antes = await huella(db);
  const r = await correr(db);
  t.eq(faltas(r).sort(), ['bucket chat-audio', 'columna public.coach_billing.apple_renueva', 'funcion public.bloqueo_entre(uuid, uuid)',
    'rls public.blocks', 'tabla public.join_code_attempts'].sort(), 'lista cada cosa que falta (y nada más)');
  t.ok(r.filter(x => x.tipo === 'falta').every(x => x.detalle && x.detalle.length > 10), 'cada fila dice qué pasa');
  t.has((r.find(x => x.objeto === 'public.coach_billing.apple_renueva') || {}).detalle || '', 'compras-apple.sql', 'y qué archivo lo crea');
  t.eq(await huella(db), antes, 'correrlo no cambia nada');
  await db.borrar();
}
