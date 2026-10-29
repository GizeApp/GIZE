// Resumen de los lunes para el coach (supabase/functions/resumen-semanal y resumen/):
// a) el texto (mail.ts): la cifra, «Para escribirles», los récords, los nombres de pila, los kilos con
//    coma, la semana en palabras, todo escapado, sin precios ni pagos, el link de baja y el aviso corto;
// b) la función corriendo en Node (tests/funcion.mjs): toma la tanda, manda el mail con Resend (con los
//    encabezados de baja de un toque) y después el aviso por web, Android e iPhone, y lo anota; si Resend
//    falla por algo pasajero lo suelta sin mandar el aviso; la baja sin sesión; la muestra del panel solo
//    para administradores; sin mails ni nombres en los registros;
// c) que el workflow la publique; d) la política de privacidad; e) la página gize.ar/resumen/.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado } from './funcion.mjs';
import { newPage, wait } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// Lo que el resumen no puede decir nunca: planes, pagos ni precios (vale también para las apps).
const PROHIBIDO = /gratis|\bplan(es)?\b|pago|pagar|precio|tarjeta|mercado|suscrip|contrat|\$|IA Plus/i;
const TOKEN = '0f1e2d3c-4b5a-4697-8877-665544332211';
const BAJA = 'https://gize.ar/resumen/?t=' + TOKEN;

const base = (o = {}) => Object.assign({ semana: '2026-10-19', alumnos: 15, entrenaron: 12, entrenos: 41, checkins: 8,
  sin_entrenar: [{ nombre: 'Martina Sosa', dias: 9 }], sin_entrenar_mas: 0, sin_empezar: ['Ana Ruiz'], sin_empezar_mas: 0, sin_actividad: 3,
  records: [{ nombre: 'Juan Pérez', items: [{ ej: 'Sentadilla', kg: 100, antes: 95 }], total: 1 }], records_total: 1 }, o);

export default async function ({ base: web, t }){
  // ---------- a) El texto ----------
  const m = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/resumen-semanal/mail.ts')).href);
  const todo = x => x.subject + '\n' + x.text + '\n' + x.html;

  const d = m.mailResumen({ nombre: 'Laura Coach', r: base(), baja: BAJA });
  t.eq(d.subject, 'Tu semana: entrenaron 12 de tus 15 alumnos', 'asunto con la cifra principal');
  t.has(d.text, 'Hola Laura:', 'saluda por el nombre');
  t.has(d.text, 'La semana pasada (del lunes 19 al domingo 25 de octubre) entrenaron 12 de tus 15 alumnos, con 41 entrenos entre todos. 8 te mandaron su check-in.', 'la cifra con la semana, los entrenos y los check-ins');
  t.has(d.text, 'Para escribirles', 'la sección para escribirles');
  t.has(d.text, 'Martina lleva 9 días sin entrenar', 'quién lleva días sin entrenar, por su nombre de pila');
  t.has(d.text, 'Ana todavía no registró su primer entreno', 'los nuevos que no empezaron');
  t.has(d.text, 'Además, 3 alumnos no entrenan hace más de 2 meses o nunca registraron entrenos', 'los que dejaron hace mucho, en una sola línea');
  t.has(d.text, 'Récords de la semana', 'la sección de récords');
  t.has(d.text, 'Juan hizo récord en Sentadilla: 100 kg (5 kg más que su mejor marca)', 'el récord con los kilos y cuánto mejoró');
  t.has(d.html, 'href="https://gize.ar/app/"', 'botón al panel');
  t.has(d.html, 'Abrir mi panel', 'el botón dice a dónde va');
  t.has(d.html, 'href="' + BAJA + '"', 'el link de baja con el token');
  t.has(d.html, 'Dejar de recibirlo', 'el link dice qué hace');
  t.has(d.text, 'Te llega los lunes porque sos coach en GIZE. Para no recibirlo más, apagalo en Configuración → Avisos o tocá Dejar de recibirlo.', 'el pie dice por qué le llega y cómo apagarlo');
  t.has(d.text, 'Dejar de recibirlo: ' + BAJA, 'la versión de texto también trae el link');
  t.ok(/<div style="display:none[^"]*">Entrenaron 12 de tus 15 alumnos\./.test(d.html), 'con el texto de vista previa oculto');
  t.ok(!/Martina Sosa|Juan Pérez|Ana Ruiz/.test(todo(d)), 'solo nombres de pila, nunca el nombre completo');
  const av = m.avisoResumen(base());
  t.eq(av, { title: 'Tu semana en GIZE', body: 'Entrenaron 12 de tus 15 alumnos. Martina lleva 9 días sin entrenar. Juan hizo récord en Sentadilla.' }, 'el aviso');

  // Un solo alumno.
  let x = m.mailResumen({ nombre: 'Laura', r: base({ alumnos: 1, entrenaron: 1, entrenos: 3, checkins: 1, sin_entrenar: [], sin_empezar: [], sin_actividad: 0 }), baja: BAJA });
  t.eq(x.subject, 'Tu semana: tu alumno entrenó', 'un solo alumno: asunto en singular');
  t.has(x.text, 'tu alumno entrenó 3 veces. Te mandó su check-in.', 'un solo alumno: en singular');
  x = m.mailResumen({ nombre: 'Laura', r: base({ alumnos: 1, entrenaron: 0, entrenos: 0, checkins: 0, sin_entrenar: [{ nombre: 'Beto', dias: 12 }], sin_empezar: [], sin_actividad: 0, records: [], records_total: 0 }), baja: BAJA });
  t.eq(x.subject, 'Tu semana: tu alumno no entrenó', 'un solo alumno que no entrenó');
  t.eq(m.avisoResumen(base({ alumnos: 5, entrenaron: 1, entrenos: 1 })).body.split('.')[0], 'Entrenó 1 de tus 5 alumnos', 'aviso: entrenó uno');
  x = m.mailResumen({ nombre: 'Laura', r: base({ alumnos: 5, entrenaron: 1, entrenos: 1, checkins: 0 }), baja: BAJA });
  t.has(x.text, 'entrenó 1 de tus 5 alumnos, con 1 entreno.', 'uno solo de varios: en singular');
  // Nadie entrenó.
  x = m.mailResumen({ nombre: 'Laura', r: base({ alumnos: 5, entrenaron: 0, entrenos: 0, checkins: 0, records: [], records_total: 0 }), baja: BAJA });
  t.eq(x.subject, 'Tu semana: ninguno de tus 5 alumnos entrenó', 'nadie entrenó: asunto');
  t.has(x.text, 'ninguno de tus 5 alumnos registró entrenos.', 'nadie entrenó: la cifra');
  t.ok(!/check-in|Récords de la semana/.test(x.text), 'sin check-ins ni récords, no los nombra');
  t.has(x.text, 'Martina lleva 9 días sin entrenar', 'nadie entrenó: igual dice a quién escribirle');
  // Entrenaron todos.
  x = m.mailResumen({ nombre: 'Laura', r: base({ alumnos: 4, entrenaron: 4, entrenos: 10, checkins: 0, sin_entrenar: [{ nombre: 'Fede Lunes', dias: 8 }], sin_empezar: [], sin_actividad: 0 }), baja: BAJA });
  t.eq(x.subject, 'Tu semana: entrenaron tus 4 alumnos', 'entrenaron todos: asunto');
  t.has(x.text, 'entrenaron tus 4 alumnos, con 10 entrenos entre todos. ¡Muy buena semana!', 'entrenaron todos: lo festeja');
  t.ok(!/Para escribirles|lleva \d+ días/.test(x.text), 'entrenaron todos: sin «Para escribirles»');
  t.eq(m.avisoResumen(base({ alumnos: 4, entrenaron: 4, sin_entrenar: [{ nombre: 'Fede', dias: 8 }] })).body, 'Entrenaron tus 4 alumnos. Juan hizo récord en Sentadilla.', 'entrenaron todos: el aviso tampoco nombra a nadie para escribirle');

  // Topes: 6 nombres para escribirles, 3 nuevos, 5 alumnos con récords y 2 ejercicios por alumno.
  const seis = ['Ana Uno', 'Bea Dos', 'Ceci Tres', 'Dora Cuatro', 'Eli Cinco', 'Flor Seis'].map((nombre, i) => ({ nombre, dias: 20 - i }));
  const recs = ['Gus', 'Hernán', 'Iván', 'Joaquín', 'Kike', 'Lalo'].map(n => ({ nombre: n + ' Apellido', items: [{ ej: 'Sentadilla', kg: 80, antes: 75 }, { ej: 'Remo', kg: 60, antes: 57.5 }, { ej: 'Curl', kg: 20, antes: 18 }], total: 3 }));
  x = m.mailResumen({ nombre: 'Laura', r: base({ sin_entrenar: seis.concat([{ nombre: 'Gala Siete', dias: 8 }]), sin_entrenar_mas: 2, sin_empezar: ['Nico Nuevo', 'Ñata Nueva', 'Oli Nuevo', 'Pía Nueva'], sin_empezar_mas: 1, records: recs, records_total: 18 }), baja: BAJA });
  t.eq((x.text.match(/lleva \d+ días sin entrenar/g) || []).length, 6, 'hasta 6 nombres para escribirles');
  t.has(x.text, 'Y 3 alumnos más llevan más de una semana sin entrenar', 'el resto, en un número (los 2 que no vinieron y el séptimo)');
  t.eq((x.text.match(/todavía no registró su primer entreno/g) || []).length, 3, 'hasta 3 nuevos');
  t.has(x.text, 'Y 2 alumnos nuevos más todavía no registraron su primer entreno', 'y los nuevos que faltan, en un número');
  t.has(m.mailResumen({ nombre: 'L', r: base({ sin_empezar: ['Nico Nuevo'], sin_empezar_mas: 1 }), baja: BAJA }).text, 'Y 1 alumno nuevo más todavía no registró su primer entreno', 'uno más, en singular');
  t.eq((x.text.match(/hizo récord/g) || []).length, 5, 'hasta 5 alumnos con récords');
  t.has(x.text, 'Gus hizo récord en Sentadilla: 80 kg (5 kg más que su mejor marca) y en Remo: 60 kg (2,5 kg más que su mejor marca)', 'hasta 2 ejercicios por alumno');
  t.ok(!/Lalo|en Curl/.test(x.text), 'el sexto alumno y el tercer ejercicio no van');
  t.has(x.text, 'Y 8 récords más.', 'los récords que no entran, en un número (18 − 10)');
  t.ok(m.avisoResumen(base({ sin_entrenar: seis, records: recs })).body.length <= m.AVISO_MAX, 'el aviso no pasa de ' + m.AVISO_MAX + ' letras');

  // Nombres repetidos: inicial del apellido. La misma persona en dos secciones, igual en las dos.
  x = m.mailResumen({ nombre: 'Laura', r: base({ sin_entrenar: [{ nombre: 'Juan Pérez', dias: 9 }], sin_empezar: [], records: [{ nombre: 'Juan Gómez', items: [{ ej: 'Remo', kg: 50, antes: 45 }], total: 1 }] }), baja: BAJA });
  t.has(x.text, 'Juan P. lleva 9 días sin entrenar', 'dos Juan: Juan P.');
  t.has(x.text, 'Juan G. hizo récord en Remo', 'dos Juan: Juan G.');
  x = m.mailResumen({ nombre: 'Laura', r: base({ sin_entrenar: [{ nombre: 'Juan Pérez', dias: 8 }], sin_empezar: [], records: [{ nombre: 'Juan Pérez', items: [{ ej: 'Remo', kg: 50, antes: 45 }], total: 1 }] }), baja: BAJA });
  t.ok(x.text.includes('Juan lleva 8 días') && x.text.includes('Juan hizo récord'), 'la misma persona en dos secciones: Juan en las dos');
  t.eq(m.cortos(['', 'Sofía']).get(''), 'Un alumno', 'sin nombre: «Un alumno»');

  // Kilos con coma y la semana que cruza de mes.
  t.eq([m.kg(102.5), m.kg(100), m.kg(2.5), m.kg(101.25), m.kg(0.30000000000000004)], ['102,5 kg', '100 kg', '2,5 kg', '101,25 kg', '0,3 kg'], 'kilos con coma');
  x = m.mailResumen({ nombre: 'Laura', r: base({ semana: '2026-09-28', records: [{ nombre: 'Juan Pérez', items: [{ ej: 'Peso muerto', kg: 102.5, antes: 100 }], total: 1 }] }), baja: BAJA });
  t.has(x.text, '(del lunes 28 de septiembre al domingo 4 de octubre)', 'la semana que cruza de mes');
  t.has(x.text, 'Juan hizo récord en Peso muerto: 102,5 kg (2,5 kg más que su mejor marca)', 'el récord con coma');
  t.eq(m.semanaEnPalabras('2026-12-28'), 'del lunes 28 de diciembre al domingo 3 de enero', 'y la que cruza de año');
  t.eq(m.semanaPasada(Date.parse('2026-10-27T15:00:00Z')), '2026-10-19', 'la semana pasada (martes 27 → lunes 19)');
  t.eq(m.semanaPasada(Date.parse('2026-10-26T02:00:00Z')), '2026-10-12', 'el domingo 25 a la noche en Argentina todavía es la semana del 19');

  // Escapado.
  x = m.mailResumen({ nombre: '<b>Laura</b>', r: base({ sin_entrenar: [{ nombre: '<b>Ana</b> Ruiz', dias: 9 }], records: [{ nombre: 'Juan', items: [{ ej: '<i>X</i>', kg: 50, antes: 40 }], total: 1 }] }), baja: 'https://gize.ar/resumen/?t="><script>' });
  t.ok(!/<b>Ana|<b>Laura|<i>X|"><script>/.test(x.html), 'el nombre, el ejercicio y el link van escapados en el HTML');
  // Sin precios, planes ni pagos, en ningún caso (tampoco en la muestra del panel).
  for (const [n, r] of [['principal', base()], ['muestra', m.MUESTRA], ['nadie', base({ entrenaron: 0, entrenos: 0 })]]){
    const y = m.mailResumen({ nombre: 'Laura', r, baja: BAJA });
    t.ok(!PROHIBIDO.test(todo(y).replace(/https:\/\/gize\.ar\/(app|resumen)\/[^"\s]*/g, '')) && !PROHIBIDO.test(m.avisoResumen(r).body), n + ': no habla de planes, pagos ni precios');
  }
  // El aviso nunca pasa de 180 letras, aunque el ejercicio tenga un nombre larguísimo.
  const largo = m.avisoResumen(base({ sin_entrenar: [{ nombre: 'Maximiliano Bartolomé', dias: 60 }], records: [{ nombre: 'Juan', items: [{ ej: 'Sentadilla búlgara con pausa '.repeat(5), kg: 50, antes: 40 }], total: 1 }] }));
  t.ok(largo.body.length <= 180 && largo.body.startsWith('Entrenaron 12 de tus 15 alumnos. Maximiliano lleva 60 días sin entrenar.'), 'aviso de 180 letras o menos: ' + largo.body.length);
  // La muestra: datos inventados.
  const nm = [...m.MUESTRA.sin_entrenar.map(x => x.nombre), ...m.MUESTRA.sin_empezar, ...m.MUESTRA.records.map(x => x.nombre)];
  t.ok(nm.length >= 4 && nm.every(n => /\b(Ejemplo|Muestra|Inventada)\b/.test(n)), 'la muestra solo con nombres inventados: ' + nm.join(', '));

  // ---------- b) La función ----------
  const COACH = 'c5000000-0000-4000-8000-000000000001', OTRO = 'c5000000-0000-4000-8000-000000000002';
  const fila = (id, tok = TOKEN, nombre = 'Coach Uno') => ({ coach_id: id, semana: '2026-10-19', nombre, token: tok, datos: base() });
  const SUBS = [
    { id: 's-web', user_id: COACH, endpoint: 'https://fcm.googleapis.com/fcm/send/web1', p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) },
    { id: 's-and', user_id: COACH, endpoint: 'fcm:tokandroid', p256dh: 'x', auth: 'x' },
    { id: 's-ios', user_id: COACH, endpoint: 'apns:abcd1234', p256dh: 'x', auth: 'x' },
  ];
  class Firma { setProtectedHeader(){ return this; } setIssuer(){ return this; } setAudience(){ return this; } setIssuedAt(){ return this; } setExpirationTime(){ return this; } async sign(){ return 'jwt-de-prueba'; } }
  const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 'clave',
    VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'gize', client_email: 'fcm@gize.test', private_key: 'k' }),
    APNS_KEY_P8: 'p8', APNS_KEY_ID: 'KID', APPLE_TEAM_ID: 'TEAM' };
  const montar = async ({ filas = [fila(COACH)], env = {}, resend = () => 200, web = () => 201, apple = () => 200, user = null, admin = false, sinMail = [], sinCuenta = [], demora = 0 } = {}) => {
    const orden = [], rpcs = [], mails = [], borrados = [], pushes = [];
    let vuelo = 0, maxVuelo = 0;
    const db = supabaseSimulado(q => {
      if (q.accion === 'rpc'){
        rpcs.push([q.tabla, q.valores]); orden.push('rpc:' + q.tabla);
        if (q.tabla === 'tomar_resumenes_semanales') return { data: filas };
        if (q.tabla === 'is_app_admin') return { data: admin };
        return { data: null };
      }
      if (q.tabla === 'push_subscriptions' && q.accion === 'select') return { data: SUBS.filter(s => s.user_id === (q.filtros.find(f => f[0] === 'eq') || [])[2]) };
      if (q.tabla === 'push_subscriptions' && q.accion === 'delete'){ borrados.push(...q.filtros.find(f => f[0] === 'in')[2]); return { data: null }; }
      return { data: null };
    }, { user });
    const getUserById = db.auth.admin.getUserById;
    db.auth.admin.getUserById = async (id) => sinCuenta.includes(id) ? { data: { user: null }, error: { status: 503, message: 'Auth no contesta' } }
      : sinMail.includes(id) ? { data: { user: { id, email: null } } } : getUserById(id);
    const wp = { setVapidDetails(){}, generateRequestDetails(){ return {}; }, sendNotification: async (sub, payload) => {
      orden.push('web'); pushes.push(['web', JSON.parse(payload)]);
      const st = web(); if (st >= 300) throw Object.assign(new Error('respuesta ' + st), { statusCode: st });
      return { statusCode: st };
    } };
    const fn = await funcion('resumen-semanal', {
      env: Object.assign({}, ENV, env),
      npm: { '@supabase/supabase-js': { createClient: () => db }, 'web-push': { default: wp }, jose: { importPKCS8: async () => ({}), SignJWT: Firma } },
      fetch: async (url, o) => {
        if (url === 'https://api.resend.com/emails'){
          orden.push('resend'); vuelo++; maxVuelo = Math.max(maxVuelo, vuelo);
          if (demora) await wait(demora);
          vuelo--;
          const b = JSON.parse(o.body); mails.push({ b, o });
          const st = resend(b);
          if (st === 0) throw new Error('sin respuesta');
          return new Response('{}', { status: st });
        }
        if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'tok-fcm' }), { status: 200 });
        if (url.startsWith('https://fcm.googleapis.com/v1/')){ orden.push('fcm'); pushes.push(['fcm', JSON.parse(o.body)]); return new Response('{}', { status: 200 }); }
        if (url.startsWith('https://api.push.apple.com/')){ orden.push('apns'); pushes.push(['apns', JSON.parse(o.body), o.headers]); const st = apple(); return new Response(st === 410 ? '{"reason":"Unregistered"}' : '{}', { status: st }); }
        throw new Error('fetch sin simular: ' + url);
      },
    });
    const pedir = async ({ method = 'POST', query = '', headers = {}, body = '{}' } = {}) => {
      const r = await fn.call(new Request('https://x.supabase.co/functions/v1/resumen-semanal' + query, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: method === 'GET' || method === 'OPTIONS' ? undefined : body }));
      return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
    };
    return { fn, pedir, orden, rpcs, mails, borrados, pushes, maxVuelo: () => maxVuelo };
  };
  const logs = [];
  const sinRastros = f => logs.push(...f.fn.logs);

  // Todo bien: mail, después el aviso por los tres canales, y listo.
  let f = await montar();
  let r = await f.pedir();
  t.eq([r.status, r.body], [200, { ok: true, enviados: 1, avisos: 1, fallidos: 0 }], 'la tanda responde');
  t.eq(f.orden.filter(x => x !== 'web' && x !== 'fcm' && x !== 'apns'), ['rpc:tomar_resumenes_semanales', 'resend', 'rpc:resumen_semanal_listo'], 'toma, manda el mail y lo anota');
  const iMail = f.orden.indexOf('resend'), iListo = f.orden.indexOf('rpc:resumen_semanal_listo');
  t.ok(['web', 'fcm', 'apns'].every(c => f.orden.indexOf(c) > iMail && f.orden.indexOf(c) < iListo), 'el aviso sale después del mail, por web, Android e iPhone, y antes de anotarlo: ' + f.orden.join(' → '));
  t.eq(f.rpcs[0][1], { p_max: 8 }, 'toma de a 8');
  const mail = f.mails[0] || { b: {}, o: {} };
  t.eq([mail.b.from, mail.b.to, mail.b.subject], ['GIZE <soporte@gize.ar>', ['usuario@prueba.test'], 'Tu semana: entrenaron 12 de tus 15 alumnos'], 'el mail desde soporte@gize.ar, al mail del coach');
  t.eq(mail.b.headers, { 'List-Unsubscribe': '<https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/resumen-semanal?baja=' + TOKEN + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, 'con los encabezados de baja de un toque');
  t.ok(String(mail.b.html).includes('href="' + BAJA + '"') && String(mail.b.text).includes(BAJA), 'el link «Dejar de recibirlo» con su token');
  t.ok(mail.o.signal instanceof AbortSignal, 'el pedido a Resend tiene tiempo máximo');
  const pw = f.pushes.find(p => p[0] === 'web'), pf = f.pushes.find(p => p[0] === 'fcm'), pa = f.pushes.find(p => p[0] === 'apns');
  t.eq(pw && [pw[1].title, pw[1].tag, pw[1].url], ['Tu semana en GIZE', 'gize-resumen', './app/'], 'web: el aviso abre la app, con su propio tag');
  t.ok(pw && pw[1].body.startsWith('Entrenaron 12 de tus 15 alumnos.'), 'web: con la cifra');
  t.eq(pf && [pf[1].message.notification.title, pf[1].message.android.notification.tag, pf[1].message.token], ['Tu semana en GIZE', 'gize-resumen', 'tokandroid'], 'Android (FCM)');
  t.eq(pa && [pa[1].aps.alert.title, pa[1].aps['thread-id'], pa[2]['apns-topic']], ['Tu semana en GIZE', 'gize-resumen', 'ar.com.gize.app'], 'iPhone (APNs)');
  t.eq(f.rpcs.find(x => x[0] === 'resumen_semanal_listo')[1], { p_coach: COACH, p_semana: '2026-10-19', p_mail: true, p_aviso: true }, 'lo anota con mail y aviso');
  sinRastros(f);

  // Resend con una falla pasajera: se suelta, sin aviso.
  for (const [st, cual] of [[500, '500'], [429, '429'], [0, 'sin respuesta']]){
    f = await montar({ resend: () => st });
    r = await f.pedir();
    t.eq(f.rpcs.map(x => x[0]), ['tomar_resumenes_semanales', 'soltar_resumen_semanal'], 'Resend ' + cual + ': lo suelta para reintentar');
    t.eq(f.rpcs[1][1], { p_coach: COACH, p_semana: '2026-10-19' }, 'Resend ' + cual + ': ese coach y esa semana');
    t.eq([f.pushes.length, r.body.fallidos], [0, 1], 'Resend ' + cual + ': sin aviso (sale todo junto en el reintento)');
    sinRastros(f);
  }
  // Resend 422 (no se arregla reintentando): sigue con el aviso y lo anota sin mail.
  f = await montar({ resend: () => 422 });
  r = await f.pedir();
  t.eq(f.rpcs.find(x => x[0] === 'resumen_semanal_listo')[1], { p_coach: COACH, p_semana: '2026-10-19', p_mail: false, p_aviso: true }, 'Resend 422: el aviso sale igual y queda anotado sin mail');
  t.eq(f.pushes.length, 3, 'Resend 422: aviso por los tres canales');
  sinRastros(f);
  // Coach sin mail: solo el aviso.
  f = await montar({ sinMail: [COACH] });
  r = await f.pedir();
  t.eq([f.mails.length, f.rpcs.find(x => x[0] === 'resumen_semanal_listo')[1].p_mail], [0, false], 'sin mail: no le escribe a nadie y queda anotado sin mail');
  // No se pudo leer su cuenta (falla de Auth): se reintenta todo junto en la tanda siguiente, sin aviso
  // (antes salía solo el aviso y quedaba como enviado, sin el mail de esa semana).
  f = await montar({ sinCuenta: [COACH] });
  r = await f.pedir();
  t.eq(f.rpcs.map(x => x[0]), ['tomar_resumenes_semanales', 'soltar_resumen_semanal'], 'sin poder leer la cuenta: lo suelta para reintentar');
  t.eq([f.mails.length, f.pushes.length, r.body.fallidos], [0, 0, 1], 'sin poder leer la cuenta: ni mail ni aviso todavía');
  sinRastros(f);
  // Dispositivos que ya no existen: se borran.
  f = await montar({ apple: () => 410, web: () => 410 });
  r = await f.pedir();
  t.eq(f.borrados.sort(), ['s-ios', 's-web'], 'los dispositivos que ya no existen se borran');
  t.eq(f.rpcs.find(x => x[0] === 'resumen_semanal_listo')[1].p_aviso, true, 'y el aviso cuenta si llegó a otro');
  sinRastros(f);
  // De a 4 a la vez.
  f = await montar({ filas: Array.from({ length: 9 }, (_, i) => fila('c5000000-0000-4000-8000-0000000001' + String(i).padStart(2, '0'))), demora: 20 });
  r = await f.pedir();
  t.eq([r.body.enviados, f.mails.length, f.maxVuelo()], [9, 9, 4], 'nueve coaches, de a 4 a la vez');
  // Sin RESEND_API_KEY no toma a nadie; con CRON_SECRET hace falta el header.
  f = await montar({ env: { RESEND_API_KEY: undefined } });
  r = await f.pedir();
  t.ok(r.body.ok === false && f.rpcs.length === 0, 'sin RESEND_API_KEY no toma a nadie');
  f = await montar({ env: { CRON_SECRET: 'secreto' } });
  r = await f.pedir({ headers: { 'x-cron-secret': 'otro' } });
  t.ok(r.status === 401 && f.rpcs.length === 0, 'con CRON_SECRET y el header equivocado: 401 sin hacer nada');
  r = await f.pedir({ headers: { 'x-cron-secret': 'secreto' } });
  t.eq(r.body.enviados, 1, 'con el header correcto manda');

  // La baja, sin sesión y sin el secreto del cron.
  f = await montar({ env: { CRON_SECRET: 'secreto' } });
  r = await f.pedir({ query: '?baja=' + TOKEN, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  t.eq([r.status, f.rpcs], [200, [['resumen_semanal_baja', { p_token: TOKEN, p_on: false }]]], 'el «Cancelar suscripción» de un toque (POST ?baja) lo apaga, sin el secreto del cron');
  t.eq(r.headers.get('access-control-allow-origin'), '*', 'con CORS');
  r = await f.pedir({ body: JSON.stringify({ baja: TOKEN }) });
  t.eq([r.status, f.rpcs[1]], [200, ['resumen_semanal_baja', { p_token: TOKEN, p_on: false }]], 'desde la página: {baja}');
  r = await f.pedir({ body: JSON.stringify({ alta: TOKEN }) });
  t.eq([r.status, f.rpcs[2]], [200, ['resumen_semanal_baja', { p_token: TOKEN, p_on: true }]], 'desde la página: {alta} lo vuelve a prender');
  r = await f.pedir({ body: JSON.stringify({ baja: 'no-es-un-token' }) });
  t.eq([r.status, r.body, f.rpcs.length], [200, { ok: true }, 3], 'un token roto da 200 sin llamar a la base');
  r = await f.pedir({ method: 'GET', query: '?baja=' + TOKEN });
  t.eq([r.status, r.headers.get('location'), f.rpcs.length], [302, BAJA, 3], 'un GET (el antivirus del correo abre el link) no da de baja: lleva a la página');
  r = await f.pedir({ method: 'OPTIONS' });
  t.eq([r.status, r.headers.get('access-control-allow-methods')], [200, 'POST, OPTIONS'], 'OPTIONS para la página');
  t.ok(!f.orden.includes('resend'), 'la baja no manda mails');

  // La muestra del panel.
  const ADMIN = { id: 'a0000000-0000-4000-8000-0000000000ad', email: 'admin@prueba.test' };
  f = await montar({ user: null });
  r = await f.pedir({ body: JSON.stringify({ action: 'muestra' }) });
  t.eq(r.status, 401, 'muestra sin sesión: 401');
  f = await montar({ user: ADMIN, admin: false });
  r = await f.pedir({ body: JSON.stringify({ action: 'muestra' }), headers: { Authorization: 'Bearer x' } });
  t.eq(r.status, 403, 'muestra sin ser admin: 403');
  f = await montar({ user: ADMIN, admin: true });
  r = await f.pedir({ body: JSON.stringify({ action: 'muestra' }), headers: { Authorization: 'Bearer x' } });
  t.ok(r.status === 200 && /Tu semana: entrenaron 12 de tus 15 alumnos/.test(r.body.subject) && /Martina lleva 9 días sin entrenar/.test(r.body.html), 'muestra para el admin: el mail armado con los datos inventados');
  t.ok(!f.mails.length && !f.rpcs.some(x => x[0] === 'tomar_resumenes_semanales'), 'la muestra no manda nada ni toma coaches');
  r = await f.pedir({ body: JSON.stringify({ action: 'muestra', enviar: true }), headers: { Authorization: 'Bearer x' } });
  t.eq([r.status, r.body.enviado, f.mails.length, f.mails[0] && f.mails[0].b.to], [200, true, 1, ['admin@prueba.test']], '«Mandármelo»: solo al mail del propio admin');
  t.ok(!f.rpcs.some(x => x[0] === 'tomar_resumenes_semanales'), 'y nunca con datos de un coach de verdad');

  // Los registros no tienen mails ni nombres.
  t.ok(logs.length > 0 && !logs.some(l => /@|Coach Uno|Martina|Juan|Laura/.test(l)), 'no escribe mails ni nombres en los registros: ' + JSON.stringify(logs.slice(0, 5)));

  // ---------- c) El workflow la publica ----------
  t.ok(/for fn in [^\n]*\bresumen-semanal\b/.test(rd('.github/workflows/supabase.yml')), 'el workflow publica resumen-semanal');

  // ---------- d) La política de privacidad ----------
  const pol = rd('privacidad/index.html').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  t.has(pol, 'los avisos de tus alumnos si sos coach (incluido el resumen de los lunes)', 'Notificaciones: el resumen de los lunes');
  t.has(pol, 'Si tenés coach, para mandarle los lunes un resumen de la semana de sus alumnos, por mail y, si activó los avisos, como notificación: tu nombre de pila, si entrenaste y cuántas veces, cuántos días llevás sin entrenar, tus récords (ejercicio y kilos) y si mandaste tu check-in.', 'Para qué: qué lleva el resumen');
  t.has(pol, 'No lleva tu peso, tus comidas, tus respuestas, tus fotos ni tus pasos. GIZE no guarda el resumen: lo arma al mandarlo.', 'Para qué: qué no lleva y que no se guarda');
  t.has(pol, 'lo podés apagar en Configuración → Avisos o desde el mismo mail', 'Para qué: cómo apagarlo');
  t.has(pol, 'Resend: manda los mails de GIZE (por ejemplo, los de confirmar tu cuenta o elegir una contraseña nueva, y el resumen de los lunes que les llega a los coaches, con el nombre de pila de sus alumnos y cómo les fue en la semana)', 'Resend: el resumen de los lunes');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fm = /Última actualización: (\d{1,2}) de (\w+) de (\d{4})/.exec(pol);
  t.ok(fm && Date.UTC(+fm[3], MESES.indexOf(fm[2]), +fm[1]) > Date.UTC(2026, 9, 25), 'la fecha de la política es nueva: ' + (fm && fm[0]));

  // ---------- e) La página gize.ar/resumen/ ----------
  const html = rd('resumen/index.html'), js = rd('resumen/resumen.js');
  t.ok(/<meta name="robots" content="noindex">/.test(html), 'sin indexar');
  t.ok(/<meta name="referrer" content="no-referrer">/.test(html), 'el link con el token no viaja a otras páginas');
  t.ok(/Content-Security-Policy" content="default-src 'none'; script-src 'self';[^"]*connect-src https:\/\/wegptuzhsrwppbknqstf\.supabase\.co;/.test(html) && !/<script>/.test(html), 'con CSP y sin scripts escritos en la página');
  t.ok(!/apikey|authorization/i.test(js), 'sin apikey ni sesión');
  t.ok(js.includes('"https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/resumen-semanal"'), 'le habla a la función resumen-semanal');
  t.ok(!PROHIBIDO.test(html.replace(/<style>[\s\S]*?<\/style>/, '')), 'la página no habla de planes ni pagos');
  const pedidos = [];
  const handlers = { '/functions/v1/resumen-semanal': (rt, J, i) => { pedidos.push({ body: JSON.parse(i.body || 'null'), apikey: rt.request().headers()['apikey'] }); return J({ ok: true }); } };
  let pg = await newPage({ handlers });
  try {
    await pg.p.goto(web + '/resumen/?t=' + TOKEN); await wait(600);
    t.eq(pedidos, [], 'abrir la página no da de baja');
    t.ok(await pg.p.isVisible('#boton') && !(await pg.p.isVisible('#sinToken')), 'con el token: el botón');
    t.eq((await pg.p.textContent('#boton')).trim(), 'No me lo mandes más', 'el botón dice qué hace');
    await pg.p.click('#boton'); await wait(400);
    t.eq(pedidos, [{ body: { baja: TOKEN }, apikey: undefined }], 'al tocar: {baja: token}, sin apikey');
    t.has(await pg.p.textContent('#res'), 'Listo: ya no te lo vamos a mandar.', 'avisa que quedó apagado');
    t.eq((await pg.p.textContent('#boton')).trim(), 'Volver a recibirlo', 'ofrece volver a recibirlo');
    await pg.p.click('#boton'); await wait(400);
    t.eq(pedidos[1] && pedidos[1].body, { alta: TOKEN }, 'volver a recibirlo: {alta: token}');
    t.has(await pg.p.textContent('#res'), 'te lo vamos a volver a mandar los lunes', 'avisa que vuelve a llegar');
    // Lo de todas las páginas: la letra del sitio, sin CSS anidado, el favicon y sin moverse de costado en el celular.
    const vista = await pg.p.evaluate(async () => {
      await document.fonts.ready; await document.fonts.load('600 16px Outfit');
      const anidadas = [];
      const walk = rules => { for (const r of rules){ if (r instanceof CSSStyleRule && r.cssRules && r.cssRules.length) anidadas.push(r.selectorText); else if (r.cssRules) walk(r.cssRules); } };
      for (const s of document.styleSheets){ try { walk(s.cssRules); } catch (e) {} }
      const l = document.querySelector('link[rel="icon"]');
      return { fuente: document.fonts.check('600 16px Outfit') && [...document.fonts].some(f => f.family.replace(/["']/g, '') === 'Outfit' && f.status === 'loaded'),
        anidadas, icono: l && l.href, ancho: document.documentElement.scrollWidth <= window.innerWidth };
    });
    t.ok(vista.fuente, 'la letra Outfit carga desde el sitio');
    t.eq(vista.anidadas, [], 'sin CSS anidado');
    t.ok(/\/icon-192\.png$/.test(vista.icono || ''), 'favicon con el ícono');
    t.ok(vista.ancho, 'a 390 px no se mueve de costado');
    t.eq(pg.errs, [], 'sin errores en la página');
  } finally { await pg.close(); }
  // Sin token (o roto): explica cómo apagarlo desde la app, sin botón.
  for (const q of ['', '?t=cualquier-cosa']){
    pg = await newPage({ handlers });
    try {
      await pg.p.goto(web + '/resumen/' + q); await wait(500);
      t.ok(!(await pg.p.isVisible('#boton')) && (await pg.p.textContent('#sinToken')).includes('Configuración → Avisos'), (q || 'sin token') + ': explica cómo apagarlo en la app, sin botón');
      t.eq(pg.errs, [], (q || 'sin token') + ': sin errores');
    } finally { await pg.close(); }
  }
  t.eq(pedidos.length, 2, 'sin token no manda nada');
  // Si la función falla, lo dice y deja reintentar.
  pg = await newPage({ handlers: { '/functions/v1/resumen-semanal': (rt, J) => J({ error: 'x' }, 500) } });
  try {
    await pg.p.goto(web + '/resumen/?t=' + TOKEN); await wait(400);
    await pg.p.click('#boton'); await wait(400);
    t.has(await pg.p.textContent('#res'), 'No se pudo', 'si falla, lo dice');
    t.eq([(await pg.p.textContent('#boton')).trim(), await pg.p.isEnabled('#boton')], ['No me lo mandes más', true], 'y se puede volver a tocar');
  } finally { await pg.close(); }
}
