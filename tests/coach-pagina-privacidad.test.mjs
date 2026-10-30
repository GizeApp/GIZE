// «Mi página» del coach (supabase/pagina-coach.sql y app/screens/coach/pagina.js) en la Política de
// privacidad y en los Términos de uso: con la página, el coach publica su nombre, su código y (si
// quiere) su foto, así que la política lo dice en su propia sección, en «Qué datos guardamos» y en «Qué
// se borra», con la fecha nueva. Lo que promete tiene que ser lo que hace la base: la foto queda
// pública mientras la página se ve con la foto prendida (la política de storage la deja leer sin
// sesión) y su link lleva el id del coach, el link anterior sigue 90 días (salvo si se cambia en las
// primeras 24 horas: ahí queda libre), y la página y los links viejos se borran con la cuenta.
// Los términos dicen que el coach responde por el nombre y la foto, y que GIZE puede pausarla.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const texto = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const fecha = txt => {
  const m = /Última actualización: (\d{1,2}) de (\w+) de (\d{4})/.exec(txt);
  return m ? new Date(Date.UTC(+m[3], MESES.indexOf(m[2]), +m[1])) : null;
};

export default async ({ t }) => {
  const html = fs.readFileSync(path.join(ROOT, 'privacidad/index.html'), 'utf8');
  const txt = texto(html);
  const desde = new Date(Date.UTC(2026, 9, 30));
  t.ok(fecha(txt) >= desde, 'la fecha de la política es la de «Mi página» (o posterior)');

  // La sección propia, antes de «Dónde se guardan».
  t.ok(/<h2 id="pagina-coach">Página pública del coach<\/h2>/.test(html), 'la sección «Página pública del coach»');
  const i = html.indexOf('<h2 id="pagina-coach">'), j = html.indexOf('<h2', i + 5);
  const sec = texto(html.slice(i, j));
  for (const frase of ['Configuración → Mi página', 'Es opcional: existe solo si la creás',
    'Qué se publica: tu nombre, tu código de invitación, el nombre de tu link y, si dejás prendido «Mostrar mi foto», tu foto de perfil',
    'Nunca tu mail, tus alumnos ni otros datos de tu cuenta',
    'cualquiera que tenga el link, sin iniciar sesión', 'noindex',
    'Tu foto queda pública: mientras la página está prendida y muestra tu foto, tu foto de perfil se puede ver sin iniciar sesión, aunque no se tenga el link',
    'Si apagás la foto o la página, deja de ser pública',
    'La apagás cuando quieras', 'deja de verse si tu cuenta de coach no está activa',
    'el anterior sigue llevando a tu página por 90 días y en ese tiempo nadie más lo puede usar',
    'Si lo cambiás dentro de las primeras 24 horas desde que la creaste, el anterior queda libre enseguida y lo puede tomar otro coach',
    'ese link lleva el número interno de tu cuenta, que no sirve para entrar a ella ni para ver nada más',
    'puede pausar tu página o liberar tu link', 'queda anotado quién lo hizo y cuándo',
    'Supabase, que recibe su dirección IP', 'En GIZE no queda anotado quién la visitó',
    'sumarte a un coach desde su página es lo mismo que con su código',
    'Si eliminás tu cuenta, se borran tu página y tus links anteriores'])
    t.has(sec, frase, 'la sección dice: ' + frase);
  t.ok(!/Google Play|App Store|Mercado Pago|precio|\$/i.test(sec), 'la sección no nombra tiendas, pagos ni precios');
  const donde = html.indexOf('<h2>Dónde se guardan</h2>'), cobros = html.indexOf('<h2 id="cobros-coach">');
  t.ok(i > cobros && i < donde, 'va después de «Tu coach: tu cuota y tus pagos» y antes de «Dónde se guardan»');

  // «Qué datos guardamos» y «Qué se borra».
  const datos = texto(html.slice(html.indexOf('<h2>Qué datos guardamos</h2>'), html.indexOf('<h2>Para qué los usamos</h2>')));
  t.has(datos, 'Página del coach: si sos coach y creás tu página pública, el nombre de tu link, si está prendida, si muestra tu foto, cuándo la creaste y cuándo cambiaste el link, y tus links anteriores por 90 días', '«Qué datos guardamos» suma la página del coach');
  t.has(txt, 'tus fotos, tu página pública de coach y sus links anteriores, tus mensajes con tu coach', '«Qué se borra» suma la página y sus links anteriores');

  // Lo que promete es lo que hace la base.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/pagina-coach.sql'), 'utf8');
  t.ok(/coach_id\s+uuid primary key references public\.profiles\(id\) on delete cascade/.test(sql) && /coach_id uuid not null references public\.profiles\(id\) on delete cascade/.test(sql),
    'la página y los links viejos se borran con la cuenta');
  t.ok(/interval '90 days'/.test(sql), 'el link anterior queda 90 días');
  // ...pero solo si se cambia pasadas las primeras 24 horas: antes, el anterior queda libre (no se
  // guarda en coach_alias_viejos), así que la política no puede prometer que nadie más lo toma.
  t.ok(/libre := pag\.coach_id is null or now\(\) < pag\.creada_at \+ interval '24 hours'/.test(sql) && /if a <> pag\.alias and not libre then\s+insert into public\.coach_alias_viejos/.test(sql),
    'en las primeras 24 horas el link anterior queda libre');
  // La foto se pide con un link firmado de su ruta, que empieza con el id del coach.
  t.ok(/foto like pag\.coach_id::text \|\| '\/%'/.test(sql), 'la ruta de la foto lleva el id del coach');
  t.ok(/create policy "avatar: la de la página pública del coach" on storage\.objects\s+for select to anon, authenticated/.test(sql) && /g\.activa and g\.con_foto and g\.pausada_at is null/.test(sql),
    'la foto se puede leer sin sesión solo con la página prendida y la foto prendida');
  t.ok(/perform public\.admin_log\('pagina_coach'/.test(sql), 'pausar o liberar queda anotado');
  const ver = sql.slice(sql.indexOf('create or replace function public.coach_pagina_ver('), sql.indexOf('revoke all on function public.coach_pagina_ver('));
  t.ok(ver.length > 100 && !/email|auth\.users/.test(ver), 'la página pública no recibe el mail');

  // Términos de uso: el coach responde por lo que publica y GIZE la puede pausar.
  const th = fs.readFileSync(path.join(ROOT, 'terminos/index.html'), 'utf8');
  t.ok(fecha(texto(th)) >= desde, 'la fecha de los términos es la de «Mi página» (o posterior)');
  const uso = th.slice(th.indexOf('<h2>Uso de la app</h2>'), th.indexOf('<h2 id="planes">'));
  const vin = (uso.match(/<li>[^<]*?Si sos coach y armás tu página pública[\s\S]*?<\/li>/) || [''])[0];
  t.ok(!!vin, 'una viñeta en «Uso de la app» sobre la página del coach');
  for (const frase of ['respondés por el nombre del link y por el nombre y la foto que se muestran ahí', 'No uses nombres de otras personas ni de marcas que no sean tuyas',
    'GIZE puede pausar la página o liberar el link si no se cumple esto'])
    t.has(texto(vin), frase, 'los términos dicen: ' + frase);
  t.ok(!/<a\b/.test(vin), 'sin links (desde la app, un link a la política sin ?app=1 mostraría la barra de la página de inicio)');
};
