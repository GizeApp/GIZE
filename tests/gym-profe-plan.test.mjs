// Gimnasios, etapa 1 (parte 4): el plan del profe de un gimnasio (SPEC §3.1; app/screens/coach/plan.js
// y gimnasio.js).
// - Nunca ve la pantalla de pago por el gimnasio: sin la fila de coach_billing (la base no se la muestra
//   a un profe sin nada propio), con la prueba vencida y sin alumnos propios, con el plan propio vencido
//   o con más alumnos propios que su plan, el panel sigue (con sus socios del gimnasio).
// - La tira «Mi plan» y la prueba solo con alumnos propios o un plan propio pagado; el cupo cuenta
//   seats_used (sus vínculos propios), no la lista entera con los socios.
// - Con el plan propio vencido y alumnos propios: un cartel sobre ellos (en la web, con «Mi plan»; en
//   las apps, sin nombrar el plan ni mandar a pagar).
// - Gracia y pausa del gimnasio: el mismo texto en la web, Android e iPhone, en Clientes y en la ficha
//   del socio, sin planes, precios ni «renovar».
// - Un coach sin gimnasio: la pantalla del plan vencido de siempre, y su tira cuenta seats_used si la
//   base lo trae (igual a su lista).
import { wait, newPage, configCoach } from './lib.mjs';
import { entrarProfe, miGimnasioProfe, alumnosProfe, COACH, S, M, D, IOS, ANDROID, hostTxt, rpcs, captura } from './gym-comun.mjs';

const dias = n => new Date(Date.now() + n * 864e5).toISOString();
const AR = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric' });
const clientes = async p => { if (await p.$('[data-coach="view-clients"]')) { await p.click('[data-coach="view-clients"]'); await wait(600); } };
const PROHIBIDO = /\$|precio|pagar|mercado ?pago|transferencia|suscrib|prueba gratis|ver planes|renov/i;
const muchos = n => Array.from({ length: n }, (_, i) => ({ id: 'a0000000-0000-4000-8000-0000000' + String(50000 + i), full_name: 'Socio ' + (i + 1), role: 'client', coach_id: 'x' }));

export default async function ({ base, t }){
  // ===== Sin pantalla de pago =====
  for (const [caso, o] of [
    ['sin la fila (la base no se la muestra: nada propio)', { billing: null }],
    ['prueba vencida y sin alumnos propios', { billing: { plan: 'trial', max_clients: 10, trial_ends_at: dias(-20), paid_until: null, seats_used: 0 }, alumnos: alumnosProfe(false) }],
    ['plan propio vencido con un alumno propio', { billing: { plan: 'p10', max_clients: 10, trial_ends_at: dias(-300), paid_until: dias(-12), seats_used: 1 } }],
    ['más alumnos propios que su plan', { billing: { plan: 'p10', max_clients: 10, trial_ends_at: dias(-300), paid_until: dias(20), seats_used: 12 } }]]){
    const pg = await entrarProfe(base, Object.assign({ vp: D }, o));
    const p = pg.p;
    let h = await hostTxt(p);
    t.ok(!/Tu plan venció|Terminó tu prueba gratis|Tenés más clientes que tu plan|Elegí un plan/.test(h) && !!await p.$('.cv-shell'), caso + ': sin la pantalla de pago, el panel sigue');
    await clientes(p); h = await hostTxt(p);
    t.ok(/Martina Sosa/.test(h) && /Código de Gimnasio Fuerza/.test(h), caso + ': con sus socios y el código del gimnasio');
    if (caso.startsWith('sin la fila') || caso.startsWith('prueba vencida')){
      t.ok(!/Mi plan|Prueba gratis|Sin plan vigente|Ver planes/.test(h), caso + ': sin la tira del plan ni la prueba');
      t.ok(!/Tu código personal/.test(h), caso + ': sin el código personal');
      await configCoach(p);
      const secs = await p.$$eval('#coachHost .cs-nav [data-coach="settings-sec"]', l => l.map(b => b.dataset.k));
      t.ok(secs.length > 3 && !secs.includes('plan'), caso + ': Configuración sin «Mi plan»: ' + secs.join(', '));
    }
    if (caso.startsWith('plan propio vencido')){
      t.has(h, 'Tu plan de coach venció: tus alumnos propios vuelven cuando lo renueves. Tus socios del gimnasio siguen igual.', caso + ': el cartel sobre sus alumnos propios');
      t.ok(!!await p.$('.cv-gymcartel [data-plan="open"]'), caso + ': con «Mi plan» (en la web)');
      await captura(p, 'profe-plan-propio-vencido-compu');
    }
    t.eq(pg.errs, [], caso + ': sin errores');
    await pg.close();
  }

  // ===== La tira solo con algo propio, y cuenta seats_used =====
  {
    // 30 socios del gimnasio y un alumno propio en prueba: «1/10», no «31/10».
    const socios = muchos(30);
    const gym = miGimnasioProfe({ mis_socios: socios.map(s => s.id) });
    const pg = await entrarProfe(base, { vp: D, gym, alumnos: socios.concat(alumnosProfe().slice(2)), billing: { plan: 'trial', max_clients: 10, trial_ends_at: dias(6), paid_until: null, seats_used: 1 } });
    await clientes(pg.p);
    const h = await hostTxt(pg.p);
    t.ok(/Prueba gratis · te quedan 6 días · 1\/10 clientes/.test(h), 'con un alumno propio en prueba: la tira cuenta sus vínculos propios (seats_used), no los 30 socios: ' + (h.match(/Prueba[^›]*/) || [''])[0]);
    t.has(h, 'Tu código personal', 'y el código personal');
    await pg.close();
  }
  {
    // Plan propio pagado sin alumnos propios: la tira sí (es suyo).
    const pg = await entrarProfe(base, { vp: D, alumnos: alumnosProfe(false), billing: { plan: 'p25', max_clients: 25, trial_ends_at: dias(-300), paid_until: dias(15), seats_used: 0 } });
    await clientes(pg.p);
    const h = await hostTxt(pg.p);
    t.ok(/Plan 25 clientes · 0\/25/.test(h) && /Tu código personal/.test(h), 'con un plan propio pagado: la tira y el código personal');
    await pg.close();
  }

  // ===== Apps: sin nombrar el plan =====
  for (const [plat, init] of [['Android', ANDROID], ['iPhone', IOS]]){
    const pg = await entrarProfe(base, { vp: M, init, touch: true, billing: { plan: 'p10', max_clients: 10, trial_ends_at: dias(-300), paid_until: dias(-12), seats_used: 1 } });
    await clientes(pg.p);
    const h = await hostTxt(pg.p);
    t.has(h, 'Tu cuenta de coach no está activa: por ahora no podés ver a tus alumnos propios. Tus socios del gimnasio siguen igual.', plat + ': el cartel de los alumnos propios, sin nombrar el plan');
    t.ok(!await pg.p.$('.cv-gymcartel [data-plan="open"]') && !PROHIBIDO.test(h), plat + ': sin «Mi plan», precios ni pagos: ' + (h.match(PROHIBIDO) || [''])[0]);
    if (plat === 'Android') await captura(pg.p, 'profe-plan-propio-vencido-android-cel');
    await pg.close();
  }

  // ===== Gracia y pausa del gimnasio: el mismo texto en todas las plataformas =====
  const pausa = dias(3);
  const GRACIA = 'Avisá a la administración del gimnasio: tu acceso a los socios se pausa el ' + AR.format(new Date(pausa)) + '.';
  const PAUSA = 'El acceso del gimnasio está pausado. Hablá con la administración.';
  for (const [estado, texto] of [['gracia', GRACIA], ['operativo', PAUSA], ['liberado', PAUSA]]){
    const vistos = [];
    for (const [plat, init] of [['web', ''], ['Android', ANDROID], ['iPhone', IOS]]){
      const gym = miGimnasioProfe({ plan: { estado, vence: dias(-2), pausa_profes_el: pausa, cupo_lleno: false } });
      const pg = await entrarProfe(base, { vp: plat === 'web' ? D : M, init, touch: plat !== 'web', gym, billing: null,
        rpc: estado === 'gracia' ? {} : { gym_ficha_profe: () => ({ error: 'P0001', msg: PAUSA }) } });
      const p = pg.p;
      await clientes(p);
      const c = await p.$$eval('#coachHost .cv-gymcartel', l => l.map(e => e.innerText.trim()));
      vistos.push(c.join(' | '));
      t.ok(c.includes(texto), estado + ' · ' + plat + ': «' + texto + '» en Clientes: ' + JSON.stringify(c));
      const h = await hostTxt(p);
      t.ok(!PROHIBIDO.test(h.replace(/Mi plan/g, '')) && !/plan de GIZE|plan del gimnasio/i.test(h), estado + ' · ' + plat + ': sin precios, pagos ni «renovar»');
      // Inicio y la ficha del socio, también.
      await p.click('[data-coach="view-home"]'); await wait(400);
      t.ok((await hostTxt(p)).includes(texto), estado + ' · ' + plat + ': también en Inicio');
      await clientes(p);
      await p.evaluate(id => document.querySelector('#coachHost [data-coach="open"][data-id="' + id + '"]').click(), S.A1); await wait(1200);
      const f = await hostTxt(p);
      t.ok(f.includes(texto), estado + ' · ' + plat + ': y en la ficha del socio');
      if (estado !== 'gracia') t.ok((f.match(/El acceso del gimnasio está pausado/g) || []).length >= 1 && /Gimnasio El acceso del gimnasio está pausado/.test(f), estado + ' · ' + plat + ': la tarjeta Gimnasio dice lo mismo (el servidor no la da)');
      if (plat !== 'Android') await captura(p, 'profe-' + estado + '-' + (plat === 'web' ? 'compu' : 'iphone-cel'));
      t.eq(pg.errs, [], estado + ' · ' + plat + ': sin errores');
      await pg.close();
    }
    t.eq(new Set(vistos).size, 1, estado + ': el mismo cartel en la web, Android e iPhone');
  }

  // ===== Un coach sin gimnasio: como hoy =====
  {
    const ALU = [{ id: '11111111-1111-1111-1111-111111111111', full_name: 'Ana Torres', role: 'client', coach_id: COACH.id }];
    const fila = (o) => (r, J, i) => { const b = Object.assign({ coach_id: COACH.id, plan: 'p10', max_clients: 10, trial_ends_at: dias(-300) }, o); return J(i.one ? b : [b]); };
    const prof = (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J(ALU); const me = { id: COACH.id, role: 'coach', full_name: 'Carlos Coach', coach_id: null }; return J(i.one ? me : [me]); };
    let pg = await newPage({ user: COACH, viewport: D, handlers: { '/profiles': prof, '/rpc/mi_gimnasio': (r, J) => J(null), '/coach_billing': fila({ paid_until: dias(-10), seats_used: 1 }) } });
    await pg.p.goto(base + '/app/'); await wait(2600);
    t.has(await hostTxt(pg.p), 'Tu plan venció', 'coach sin gimnasio con el plan vencido: la pantalla de siempre');
    await pg.close();
    pg = await newPage({ user: COACH, viewport: D, handlers: { '/profiles': prof, '/rpc/mi_gimnasio': (r, J) => J(null), '/coach_billing': fila({ paid_until: dias(10), seats_used: 1 }) } });
    await pg.p.goto(base + '/app/'); await wait(2600);
    await clientes(pg.p);
    const h = await hostTxt(pg.p);
    t.ok(/Plan 10 clientes · 1\/10/.test(h) && !/Gimnasio|Avisá a la administración/.test(h), 'coach sin gimnasio al día: su tira de siempre (1/10), nada del gimnasio');
    await pg.close();
  }
}
