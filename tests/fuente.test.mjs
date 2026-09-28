// La letra de GIZE (Outfit) viene del propio sitio, no de Google Fonts: se ve igual sin
// internet en la app nativa y ninguna página le pide nada a Google.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  for (const path of ['/app/', '/admin/', '/', '/privacidad/']){
    const { p, errs, close } = await newPage({});
    const google = [];
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => { google.push(r.request().url()); return r.abort(); });
    await p.goto(base + path); await wait(1500);
    const ok = await p.evaluate(async () => { await document.fonts.ready; await document.fonts.load('600 16px Outfit'); return document.fonts.check('600 16px Outfit') && [...document.fonts].some(f => f.family.replace(/["']/g, '') === 'Outfit' && f.status === 'loaded'); });
    t.ok(ok, path + ': la letra Outfit carga desde el sitio');
    t.eq(google, [], path + ': no se piden fuentes a Google');
    t.eq(errs, [], path + ': errores de la página');
    await close();
  }
}
