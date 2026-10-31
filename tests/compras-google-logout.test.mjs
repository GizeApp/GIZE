// La marca del interruptor de Google Play (core/compras-google.js: gize_compras_google_<uid>) es
// de la cuenta: al cerrar sesión se borra, como el resto de lo que queda en el dispositivo.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const CLAVE = 'gize_compras_google_' + ALUMNO.id;

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.evaluate(k => localStorage.setItem(k, JSON.stringify({ planes: true, plus: true })), CLAVE);
  t.ok(await p.evaluate(k => !!localStorage.getItem(k), CLAVE), 'antes: la marca del interruptor está guardada');
  await p.evaluate(async id => (await import('/app/core/supabase.js')).clearAccountLeftovers(id), ALUMNO.id);
  t.eq(await p.evaluate(k => localStorage.getItem(k), CLAVE), null, 'al cerrar sesión se borra la marca de Google Play');
  t.eq(errs, [], 'errores de la página');
  await close();
}
