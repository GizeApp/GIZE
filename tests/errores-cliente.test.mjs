// Reporte de errores (app/ui/errores.js): un error del código de GIZE llega a la base por
// report_client_error; los cortes de red, los repetidos, los ajenos y los de una app sin
// sesión no; y los tokens de sesión no viajan.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const enviados = [];
  const { p, close } = await newPage({ user: ALUMNO, state: { days: [], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client'), '/rpc/report_client_error': (r, J, i) => { enviados.push(JSON.parse(i.body)); return J(null); } } });
  await p.goto(base + '/app/'); await wait(2500);

  // Dispara un error como si lo tirara el código de GIZE (o uno de afuera si se pasa otro archivo).
  const tirar = (mensaje, archivo = '/app/main.js') => p.evaluate(([m, f]) => {
    const o = location.origin;
    window.dispatchEvent(new ErrorEvent('error', { message: m, filename: f ? o + f : '', lineno: 7, error: Object.assign(new Error(m), { stack: 'Error: ' + m + '\n    at x (' + o + (f || '/app/main.js') + ':7:1)' }) }));
  }, [mensaje, archivo]);

  await tirar('Cannot read properties of undefined (reading "id")'); await wait(400);
  t.eq(enviados.length, 1, 'un error del código de GIZE se reporta');
  if (enviados[0]){
    t.eq(enviados[0].p_platform, 'web', 'plataforma web');
    t.ok(/Cannot read properties/.test(enviados[0].p_message), 'lleva el mensaje del error');
    t.ok(/app\/main\.js/.test(enviados[0].p_stack), 'lleva el recorrido del error');
  }

  await tirar('Cannot read properties of undefined (reading "id")'); await wait(300);
  t.eq(enviados.length, 1, 'el mismo error no se reporta dos veces');

  await tirar('Failed to fetch'); await tirar('ResizeObserver loop completed with undelivered notifications.'); await wait(300);
  t.eq(enviados.length, 1, 'los cortes de red y los avisos sin importancia no se reportan');

  await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'Error de una extensión', filename: 'chrome-extension://abc/x.js', lineno: 1 }))); await wait(300);
  t.eq(enviados.length, 1, 'un error de un script de afuera no se reporta');

  await tirar('Falló con access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma y más'); await wait(400);
  t.eq(enviados.length, 2, 'un error con token en el mensaje se reporta');
  t.ok(enviados[1] && !/eyJ|firma/.test(JSON.stringify(enviados[1])), 'el token de sesión no viaja');

  await p.evaluate(() => { const e = new Error('promesa rota'); e.stack = 'Error: promesa rota\n    at f (' + location.origin + '/app/core/supabase.js:9:1)'; window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: e })); }); await wait(400);
  t.eq(enviados.length, 3, 'una promesa rechazada sin capturar se reporta');

  for (let i = 0; i < 8; i++) await tirar('error distinto ' + i);
  await wait(600);
  t.ok(enviados.length <= 5, 'como mucho 5 reportes por apertura de la app: ' + enviados.length);
  await close();

  // Sin sesión iniciada no se manda nada.
  const sin = [];
  const ns = await newPage({ handlers: { '/rpc/report_client_error': (r, J, i) => { sin.push(i.body); return J(null); } } });
  await ns.p.goto(base + '/app/'); await wait(2000);
  await ns.p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'antes de entrar', filename: location.origin + '/app/main.js', lineno: 1, error: new Error('antes de entrar') }))); await wait(400);
  t.eq(sin.length, 0, 'sin sesión no se reporta');
  await ns.close();
}
