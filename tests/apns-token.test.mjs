// Avisos al iPhone (APNs) desde la función de mensajes (supabase/functions/notificar-cliente):
// el token firmado se reusa entre mensajes por 40 minutos (Apple rechaza con 429 si se firma uno
// nuevo más de una vez cada 20 minutos, y lo pide renovado antes de la hora). Varios mensajes
// que llegan juntos comparten la misma firma.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'supabase/functions/notificar-cliente';

export default async function ({ t }){
  let m = null;
  try { m = await import(pathToFileURL(path.join(ROOT, DIR, 'apns.ts')).href); }
  catch (e) { t.ok(false, 'no se pudo cargar ' + DIR + '/apns.ts: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  if (m){
    let reloj = 0, firmas = 0, claves = true;
    const jwt = m.tokenCache(async () => claves ? 'tok-' + (++firmas) : null, m.APNS_TTL, () => reloj);
    t.ok(m.APNS_TTL >= 20 * 60000 && m.APNS_TTL <= 55 * 60000, 'se reusa entre 20 minutos y la hora: ' + m.APNS_TTL);
    t.eq([await jwt(), await jwt()], ['tok-1', 'tok-1'], 'dos mensajes seguidos usan el mismo token');
    reloj += 19 * 60000;
    t.eq(await jwt(), 'tok-1', 'a los 19 minutos, el mismo');
    reloj += m.APNS_TTL;
    t.eq(await jwt(), 'tok-2', 'pasado el plazo, uno nuevo');
    t.eq(firmas, 2, 'se firmó dos veces en total');
    // Sin las claves no se guarda nada: el próximo mensaje vuelve a probar.
    const sin = m.tokenCache(async () => claves ? 'tok-' + (++firmas) : null, m.APNS_TTL, () => reloj);
    claves = false;
    t.eq(await sin(), null, 'sin las claves de Apple: null');
    claves = true;
    t.eq(await sin(), 'tok-3', 'al cargarlas, el próximo mensaje firma');
    // Una ráfaga de mensajes que llegan juntos con el token vencido: una sola firma.
    let n = 0;
    const rafaga = m.tokenCache(async () => { n++; await new Promise(r => setTimeout(r, 20)); return 'r-' + n; }, m.APNS_TTL, () => 0);
    t.eq(await Promise.all([rafaga(), rafaga(), rafaga()]), ['r-1', 'r-1', 'r-1'], 'tres mensajes a la vez usan el mismo token');
    t.eq(n, 1, 'tres mensajes a la vez firman una sola vez');
    // Si la firma falla, no queda guardado el error: el próximo mensaje vuelve a probar.
    let falla = true;
    const err = m.tokenCache(async () => { if (falla) throw new Error('x'); return 'ok'; }, m.APNS_TTL, () => 0);
    let tiro = false; try { await err(); } catch (e) { tiro = true; }
    falla = false;
    t.ok(tiro && await err() === 'ok', 'después de un error de firma, el próximo mensaje firma de nuevo');
  }
  // La función usa el token guardado (no firma uno por mensaje).
  const src = fs.readFileSync(path.join(ROOT, DIR, 'index.ts'), 'utf8');
  t.ok(/import \{ tokenCache \} from "\.\/apns\.ts";/.test(src) && /const apnsJwt = tokenCache\(/.test(src), 'notificar-cliente firma con tokenCache (apns.ts)');
  t.ok(!/async function apnsJwt\(/.test(src), 'sin el apnsJwt que firmaba en cada llamada');
}
