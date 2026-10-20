// Gimnasios, etapa 1: para quien NO está en un gimnasio, nada cambia (plan, «Reglas para todas las
// partes» 1). Un coach y un alumno entran con mi_gimnasio() contestando null, con error (la función
// todavía no está en la base), tarde (más de 4 s) y con {puede_crear: true} (el interruptor prendido,
// que solo se usa en #gimnasio): en todos los casos la pantalla queda igual (el mismo HTML del panel
// o de la app), las llamadas son las mismas (la única de más es mi_gimnasio), no se pide nada del
// panel del gimnasio (ni el módulo, ni sus estilos, ni la librería del QR) y no aparece la palabra
// «gimnasio». Con la respuesta colgada, la entrada no espera más de 4 s.
import { newPage, wait, perfil, CON_COACH } from './lib.mjs';
import { COACH, ALUMNO } from './gym-comun.mjs';

const ME_COACH = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba', coach_id: null };
const nunca = () => new Promise(() => {});
const CASOS = {
  nulo: (r, J) => J(null),
  error: (r, J) => J({ code: 'PGRST202', message: 'Could not find the function public.mi_gimnasio', details: null, hint: null }, 404),
  tarde: (r, J) => new Promise(ok => setTimeout(ok, 6000)).then(() => J(null)),
  puede_crear: (r, J) => J({ gym: null, rol: null, puede_crear: true }),
};

async function abrir(base, quien, caso){
  const pedidos = [];
  const handlers = quien === 'coach' ? {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([{ id: '44444444-4444-4444-4444-444444444444', full_name: 'Alumna Zeta' }]); return J(i.one ? ME_COACH : [ME_COACH]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  } : { '/profiles': perfil('client', CON_COACH) };
  if (caso) handlers['/rpc/mi_gimnasio'] = CASOS[caso];
  const pg = await newPage({ user: quien === 'coach' ? COACH : ALUMNO, handlers, viewport: { width: 1440, height: 900 } });
  pg.p.on('request', q => { const u = q.url(); if (u.startsWith(base)) pedidos.push(new URL(u).pathname); });
  const t0 = Date.now();
  await pg.p.goto(base + '/app/');
  // Hasta que se ve la pantalla (panel del coach o la barra del alumno).
  const listo = quien === 'coach' ? '#coachHost .cv-shell' : '#nav-entreno';
  await pg.p.waitForSelector(listo, { timeout: 15000 }).catch(() => {});
  const entro = Date.now() - t0;
  await wait(Math.max(9000 - entro, 0) + 3000); // la respuesta tarde (6 s) ya llegó, y lo que la app pide unos segundos después de entrar
  const foto = await pg.p.evaluate(() => ({
    host: (document.getElementById('coachHost') || {}).innerHTML || '', view: ((document.getElementById('view') || {}).innerHTML || '').replace(/\d{1,2}:\d{2}/g, 'HH:MM'),
    texto: document.body.innerText, gymCss: !!document.querySelector('link[data-gym-css]'), modal: !!document.getElementById('gymModal'),
    clase: document.body.classList.contains('gy-on'),
  }));
  const llamadas = pg.calls.filter(c => !/\/rpc\/mi_gimnasio$/.test(c)).map(c => c.replace(/\?.*$/, '')).sort();
  const mig = pg.calls.filter(c => /\/rpc\/mi_gimnasio$/.test(c)).length;
  await pg.close();
  return { foto, llamadas, mig, entro, pedidos };
}

export default async function ({ base, t }){
  for (const quien of ['coach', 'alumno']){
    const r = {};
    for (const caso of Object.keys(CASOS)) r[caso] = await abrir(base, quien, caso);
    const ref = r.nulo;
    t.ok(ref.foto.host.length > 0 || ref.foto.view.length > 0, quien + ': la pantalla se dibujó');
    for (const caso of Object.keys(CASOS)){
      const x = r[caso], q = quien + ' (mi_gimnasio ' + caso + ')';
      t.eq(x.mig, 1, q + ': se pregunta una sola vez por el gimnasio');
      t.ok(x.foto.host === ref.foto.host, q + ': el panel queda igual (mismo HTML)');
      t.ok(x.foto.view === ref.foto.view, q + ': la app queda igual (mismo HTML)');
      t.eq(x.llamadas, ref.llamadas, q + ': las mismas llamadas que sin gimnasio');
      t.ok(!/gimnasio/i.test(x.foto.texto), q + ': no aparece «gimnasio» en la pantalla');
      t.eq([x.foto.gymCss, x.foto.modal, x.foto.clase], [false, false, false], q + ': sin los estilos ni las ventanas del panel del gimnasio');
      t.eq(x.pedidos.filter(u => /\/app\/screens\/gym\/|gym\.css|qrcode/.test(u)), [], q + ': no se pide nada del panel del gimnasio');
      t.ok(x.entro < 6500, q + ': entra sin esperar de más (' + x.entro + ' ms)');
    }
    t.ok(r.tarde.entro < 6000, quien + ': con mi_gimnasio colgado, la entrada espera como mucho 4 s más (' + r.tarde.entro + ' ms; con null ' + r.nulo.entro + ' ms)');
  }
  // La segunda vez (ya con la copia «sin gimnasio» en el dispositivo) no se espera la respuesta.
  {
    const pg = await newPage({ user: COACH, viewport: { width: 1440, height: 900 }, handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? ME_COACH : [ME_COACH]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/rpc/mi_gimnasio': nunca,
    }, init: `localStorage.setItem('gize_gym_v1', JSON.stringify({ uid: '${COACH.id}', info: null, t: 1 }));` });
    const t0 = Date.now();
    await pg.p.goto(base + '/app/');
    await pg.p.waitForSelector('#coachHost .cv-shell', { timeout: 15000 }).catch(() => {});
    const ms = Date.now() - t0;
    t.ok(ms < 4000, 'con la copia «sin gimnasio», la respuesta colgada no demora la entrada (' + ms + ' ms)');
    t.eq(pg.errs, [], 'sin errores en la página');
    await pg.close();
  }
}
