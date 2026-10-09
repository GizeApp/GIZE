// Mails de contacto que llegan solo en HTML (supabase/functions/contacto): el texto se saca
// en una sola pasada. Antes, un mail armado con miles de "<!--" o "<head" sin cerrar hacía que
// cada uno recorriera el resto del mail y la función quedaba trabajando hasta que la cortaban;
// como todavía no había guardado nada, Resend lo reintentaba y pasaba lo mismo.
// Ahora: limpieza lineal, menos texto procesado y la fila se guarda primero con el id de Resend.
// El aviso a los administradores se anota en notified_at: si el primer intento se corta después
// de guardar la fila, el reintento de Resend lo manda (antes no salía nunca). También si se
// cortó después de guardar el texto: antes el reintento veía el texto y salía sin avisar.
// La función se corre de verdad, con Supabase, Resend y web-push simulados (tests/funcion.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado, cumple } from './funcion.mjs';

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

  // ---- La función de verdad: Resend reintenta y el aviso sale una vez ----
  // corte: el intento se corta al anotar el aviso (después de guardar el texto).
  // sinColumna: todavía no se corrió el SQL de notified_at.
  const prueba = async ({ sinColumna = false } = {}) => {
    const filas = [], avisos = [], bajadas = [];
    let corte = false;
    const db = supabaseSimulado(q => {
      if (q.tabla === 'contact_messages'){
        if (q.accion === 'select'){
          if (sinColumna && /notified_at/.test(q.columnas)) return { error: { code: '42703', message: 'no existe notified_at' } };
          const f = filas.find(x => cumple(x, q.filtros));
          return { data: f ? { id: f.id, body_missing: f.body_missing, ...(sinColumna ? {} : { notified_at: f.notified_at }) } : null };
        }
        if (q.accion === 'upsert'){
          if (filas.some(x => x.resend_id === q.valores.resend_id)) return { data: [] };
          const f = Object.assign({ id: filas.length + 1, notified_at: null }, q.valores);
          filas.push(f); return { data: [{ id: f.id }] };
        }
        if (q.accion === 'update'){
          if ('notified_at' in q.valores){
            if (sinColumna) return { error: { code: 'PGRST204', message: 'no existe notified_at' } };
            if (corte) throw new Error('la función se cortó');
          }
          const hit = filas.filter(x => cumple(x, q.filtros));
          hit.forEach(x => Object.assign(x, q.valores));
          return { data: hit.map(x => ({ id: x.id })) };
        }
      }
      if (q.tabla === 'app_admins') return { data: [{ user_id: 'admin-1' }] };
      if (q.tabla === 'push_subscriptions') return { data: q.accion === 'select' ? [{ id: 's1', user_id: 'admin-1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' }] : null };
      return { data: null };
    });
    const secreto = crypto.randomBytes(24);
    const fn = await funcion('contacto', {
      env: { RESEND_WEBHOOK_SECRET: 'whsec_' + secreto.toString('base64'), RESEND_FULL_KEY: 're_prueba', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv' },
      npm: { '@supabase/supabase-js': { createClient: () => db }, 'web-push': { default: { setVapidDetails(){}, sendNotification: async (sub, payload) => { avisos.push(JSON.parse(payload).title); } } } },
      fetch: async (url) => {
        bajadas.push(String(url));
        return new Response(JSON.stringify({ from: 'Ana <ana@ejemplo.test>', to: ['contacto@gize.ar'], subject: 'Consulta', text: 'Hola, una consulta.', headers: {}, authentication: { dmarc: 'pass' } }), { status: 200 });
      },
    });
    // Un aviso de Resend firmado como Svix.
    const mandar = async () => {
      const raw = JSON.stringify({ type: 'email.received', data: { email_id: 're_1', from: 'ana@ejemplo.test', to: ['contacto@gize.ar'], subject: 'Consulta' } });
      const id = 'msg_1', ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac('sha256', secreto).update(id + '.' + ts + '.' + raw).digest('base64');
      try {
        const r = await fn.call(new Request('https://x.supabase.co/functions/v1/contacto', { method: 'POST', body: raw, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + sig } }));
        return { status: r.status, ...(await r.json()) };
      } catch (e) { return { cortada: true }; }
    };
    return { filas, avisos, bajadas, mandar, cortar: v => { corte = v; } };
  };

  {
    // Primer intento entero; el reintento de Resend no hace nada.
    const x = await prueba();
    const r1 = await x.mandar();
    t.ok(r1.ok && !r1.duplicado, 'mail nuevo: lo guarda (' + JSON.stringify(r1) + ')');
    t.eq(x.avisos.length, 1, 'mail nuevo: avisa a los administradores');
    t.ok(x.filas[0] && x.filas[0].body === 'Hola, una consulta.' && !x.filas[0].body_missing && !!x.filas[0].notified_at, 'mail nuevo: texto guardado y aviso anotado');
    const r2 = await x.mandar();
    t.ok(r2.duplicado, 'reintento: duplicado');
    t.eq([x.avisos.length, x.bajadas.length], [1, 1], 'reintento: no vuelve a avisar ni a bajar el mail');
  }
  {
    // El primer intento guarda el texto y se corta antes de anotar el aviso.
    const x = await prueba();
    x.cortar(true);
    const r1 = await x.mandar();
    t.ok(r1.cortada && x.filas[0] && !x.filas[0].body_missing && !x.filas[0].notified_at, 'cortado: quedó el texto, sin el aviso anotado');
    t.eq(x.avisos.length, 0, 'cortado: el aviso no salió');
    x.cortar(false);
    const r2 = await x.mandar();
    t.ok(r2.ok && !r2.duplicado, 'cortado: el reintento sigue (antes salía como duplicado): ' + JSON.stringify(r2));
    t.eq(x.avisos.length, 1, 'cortado: el reintento avisa a los administradores');
    t.ok(!!x.filas[0].notified_at, 'cortado: y lo anota');
    const r3 = await x.mandar();
    t.ok(r3.duplicado && x.avisos.length === 1, 'cortado: el siguiente reintento ya no avisa');
  }
  {
    // Sin la columna (falta correr el SQL): como antes, avisa en el primer intento.
    const x = await prueba({ sinColumna: true });
    const r1 = await x.mandar();
    t.ok(r1.ok && x.avisos.length === 1, 'sin notified_at: el primer intento guarda y avisa: ' + JSON.stringify(r1));
    const r2 = await x.mandar();
    t.ok(r2.duplicado && x.avisos.length === 1, 'sin notified_at: el reintento es duplicado y no avisa');
  }
}
