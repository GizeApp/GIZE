// Mails de contacto que llegan solo en HTML (supabase/functions/contacto): el texto se saca
// en una sola pasada. Antes, un mail armado con miles de "<!--" o "<head" sin cerrar hacía que
// cada uno recorriera el resto del mail y la función quedaba trabajando hasta que la cortaban;
// como todavía no había guardado nada, Resend lo reintentaba y pasaba lo mismo.
// Ahora: limpieza lineal, menos texto procesado y la fila se guarda primero con el id de Resend.
// El aviso a los administradores se anota en notified_at: si el primer intento se corta después
// de guardar la fila, el reintento de Resend lo manda (antes no salía nunca).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'supabase/functions/contacto';

export default async function ({ t }){
  let m = null;
  try { m = await import(pathToFileURL(path.join(ROOT, DIR, 'texto.ts')).href); }
  catch (e) { t.ok(false, 'no se pudo cargar ' + DIR + '/texto.ts: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  if (m){
    const h = m.htmlToText;
    t.eq(h('<p>Hola</p><p>Chau</p>'), 'Hola\nChau\n', 'párrafos en renglones');
    t.eq(h('a<!-- x -->b<!--y-->c'), 'abc', 'saca los comentarios');
    t.eq(h('<HEAD><title>T</title></HEAD><STYLE>p{}</STYLE>Hola<script>x()</SCRIPT>!'), 'Hola!', 'saca head, style y script (en mayúsculas también)');
    t.eq(h('<header>Arriba</header><scripts>s</scripts>'), 'Arribas', '<header> y <scripts> no son <head> ni <script>');
    t.eq(h('Hola<!-- sin cerrar <p>resto'), 'Hola', 'un comentario sin cerrar descarta el resto');
    t.eq(h('Hola<style>sin cerrar'), 'Hola', 'un <style> sin cerrar descarta el resto');
    t.eq(h('<html><head><meta charset="utf-8"><body>Hola</body>'), 'Hola', 'un <head> sin cerrar no esconde el mail');
    t.eq(h('Uno<br>Dos<br/>Tres'), 'Uno\nDos\nTres', 'los <br> son renglones');
    t.eq(h('Mart&iacute;n &amp; Se&#241;or &#x41; &lt;b&gt; &amp;lt;'), 'Martín & Señor A <b> &lt;', 'entidades');
    t.eq(h('Á<!--c-->é <b>ñ</b>'), 'Áé ñ', 'con acentos antes y después');
    // Mails armados: con la limpieza de antes cada uno tardaba segundos (crece con el cuadrado).
    for (const [qu, s] of [['"<!--" sin cerrar', '<!--'.repeat(30000)], ['"<head" sin cerrar', '<head'.repeat(24000)], ['"<style" sin cerrar', '<style'.repeat(20000)], ['"<" sin cerrar', '<a'.repeat(60000)]]){
      const t0 = performance.now();
      h(s);
      const ms = performance.now() - t0;
      t.ok(ms < 400, qu + ': ' + Math.round(ms) + ' ms (tiene que ser casi nada)');
    }
  }

  const src = fs.readFileSync(path.join(ROOT, DIR, 'index.ts'), 'utf8');
  t.ok(/import \{ htmlToText \} from "\.\/texto\.ts";/.test(src) && !/function htmlToText\(/.test(src), 'index.ts usa la limpieza de texto.ts');
  t.ok(!/\[\\s\\S\]\*\?/.test(src) && !/\[\\s\\S\]\*\?/.test(fs.readFileSync(path.join(ROOT, DIR, 'texto.ts'), 'utf8')), 'sin patrones [\\s\\S]*? en la función');
  const cap = /htmlToText\(String\(full\.html \|\| ""\)\.slice\(0, ([\d_]+)\)\)/.exec(src);
  t.ok(cap && Number(cap[1].replace(/_/g, '')) <= 200000, 'el HTML se recorta a 200.000 o menos antes de procesar');
  // La fila con el id de Resend se guarda antes de bajar y procesar el mail.
  const ins = src.indexOf('.upsert({ resend_id: resendId'), get = src.indexOf('fetch("https://api.resend.com/emails/receiving/'), parse = src.indexOf('htmlToText(String(');
  t.ok(ins > 0 && get > ins && parse > ins, 'guarda la fila con el id de Resend antes de bajar y procesar el mail');
  t.ok(/body: "", body_missing: true \}/.test(src.slice(ins, get)), 'la fila nueva queda marcada sin texto hasta completarla');
  t.ok(/\.update\(\{ \.\.\.row, body: clip\(text, 20000\), body_missing: false \}\)\.eq\("id", rowId\)/.test(src), 'después completa esa misma fila');
  // El aviso a los administradores: una vez por mail, también si el primer intento se cortó.
  const up = src.indexOf('.update({ ...row, body: clip(text, 20000), body_missing: false })');
  const marca = src.indexOf('.update({ notified_at: new Date().toISOString() })'), aviso = src.indexOf('await send(subs as Sub[]');
  t.ok(up > 0 && marca > up && aviso > marca, 'anota el aviso después de guardar el texto y justo antes de mandarlo');
  t.ok(/\.update\(\{ notified_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\("id", rowId\)\.is\("notified_at", null\)\.select\("id"\);/.test(src), 'lo anota solo si todavía no estaba anotado (dos intentos a la vez avisan una vez)');
  t.ok(/if \(ne \? nuevo : !!\(marca && marca\.length\)\) \{/.test(src), 'avisa si lo anotó este intento (sin la columna, como antes: el primero)');
  t.ok(!/if \(!nuevo\) return json/.test(src), 'el reintento ya no vuelve antes de avisar');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/contacto.sql'), 'utf8');
  t.ok(/alter table public\.contact_messages add column notified_at timestamptz;\s*update public\.contact_messages set notified_at = created_at;/.test(sql)
    && /if not exists \(select 1 from information_schema\.columns[\s\S]*?column_name = 'notified_at'\) then/.test(sql), 'contacto.sql: agrega notified_at y da por avisados los que ya estaban (solo la primera vez)');
}
