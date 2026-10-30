// Mail de confirmación de cuenta (pedido del dueño, 30/10: «le cayó en spam»). El mail sale de
// gize.ar, pero el botón y el link de respaldo iban a supabase.co (largo, con el token a la
// vista): Gmail lo toma como spam. Ahora todos los links van a gize.ar/confirmar/, que arma el
// mismo link de Supabase de siempre y va ahí. El token viaja después del # (no le llega a nadie).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait } from './lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY = 'https://wegptuzhsrwppbknqstf.supabase.co/auth/v1/verify';

export default async function ({ base, t }){
  // 1) La plantilla: solo links de gize.ar y nada de {{ .ConfirmationURL }} fuera de los comentarios.
  const html = fs.readFileSync(path.join(ROOT, 'supabase/mails/confirmacion.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  t.ok(urls.length >= 3, 'la plantilla tiene links: ' + urls.length);
  t.eq(urls.filter(u => !u.startsWith('https://gize.ar/')), [], 'todos los links e imágenes son de gize.ar');
  t.ok(!/ConfirmationURL|supabase\.co|googleapis/.test(html), 'sin el link de Supabase ni Google Fonts');
  t.eq(urls.filter(u => u.startsWith('https://gize.ar/confirmar/')),
    Array(2).fill('https://gize.ar/confirmar/#t={{ .TokenHash }}&amp;r={{ .RedirectTo }}'), 'el botón y el link de respaldo van a gize.ar/confirmar con el token después del #');

  // 2) La tarea «mails» publica también esta plantilla, sin los comentarios.
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/supabase.yml'), 'utf8');
  t.ok(/supabase\/mails\/confirmacion\.html/.test(yml) && /mailer_templates_confirmation_content/.test(yml) && /mailer_subjects_confirmation/.test(yml),
    'supabase.yml publica el mail de confirmación');

  // 3) La página: arma el link de Supabase con el token y la vuelta, y saca el token de la dirección.
  const { p, errs, close } = await newPage({});
  const ido = [];
  await p.route(/supabase\.co\/auth\/v1\/verify/, r => { ido.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<p>ok</p>' }); });
  const casos = [
    ['abc123def4567890abcdef12', 'gize://confirmado', 'gize://confirmado'],
    ['pkce_abc123def4567890abcdef12', 'https://gize.ar/app/', 'https://gize.ar/app/'],
    ['abc123def4567890abcdef12', 'https://otro.sitio/robo', 'https://gize.ar/app/'],
    ['abc123def4567890abcdef12', '', 'https://gize.ar/app/'],
  ];
  for (const [tok, r, sale] of casos){
    ido.length = 0;
    await p.goto(base + '/confirmar/#t=' + tok + '&r=' + encodeURIComponent(r)); await wait(500);
    t.eq(ido.map(u => { const x = new URL(u); return [x.origin + x.pathname, x.searchParams.get('token'), x.searchParams.get('type'), x.searchParams.get('redirect_to')]; }),
      [[VERIFY, tok, 'signup', sale]], 'va al link de Supabase (vuelta pedida: «' + r + '»)');
  }
  // Sin token (o con algo raro): no sale a ningún lado y explica qué hacer.
  ido.length = 0;
  for (const h of ['', '#t=', '#t=<script>', '#t=abc&r=gize://confirmado']){
    await p.goto(base + '/confirmar/' + h); await wait(300);
    t.ok(/no está completo/.test(await p.textContent('h1')) && await p.isVisible('#seguir'), 'sin un token válido («' + h + '») avisa y ofrece ir a GIZE');
  }
  t.eq(ido, [], 'sin token no va a Supabase');
  // El token no queda en la dirección (historial) antes de salir.
  await p.route(/supabase\.co\/auth\/v1\/verify/, r => r.abort());
  await p.goto(base + '/confirmar/#t=abc123def4567890abcdef12&r=gize%3A%2F%2Fconfirmado').catch(() => {}); await wait(300);
  const meta = await p.evaluate(() => [document.querySelector('meta[name=robots]').content, document.querySelector('meta[name=referrer]').content]).catch(() => null);
  t.ok(!meta || (meta[0] === 'noindex' && meta[1] === 'no-referrer'), 'noindex y sin referrer: ' + JSON.stringify(meta));
  t.eq(errs.filter(e => !/ERR_FAILED|net::/.test(e)), [], 'sin errores');
  await close();
}
