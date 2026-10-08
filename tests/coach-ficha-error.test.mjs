// Panel del coach: si falla una lectura de la ficha del alumno (poca señal en el gimnasio), no se
// arma la ficha. Antes se mostraba vacía como si fuera real («Sin completar», «Sin cargar», sin
// rutina) y al guardar se pisaba la ficha, el plan o la rutina del alumno.
import { newPage, wait, text } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  for (const tabla of ['/client_info', '/routines', '/nutrition']){
    let falla = true;
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        [tabla]: (r, J, i) => (i.m === 'GET' && falla && i.url.search.includes(A1)) ? r.abort('internetdisconnected') : undefined,
      } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`);
    // supabase-js reintenta solo las lecturas que fallan por red antes de dar el error.
    const t0 = Date.now(); let d;
    do { await wait(500); d = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); return CoachState.coachData; }); } while (d && d.loading && Date.now() - t0 < 30000);
    t.ok(d && d.error && !d.routine && !d.info, tabla + ': con una lectura fallida no se arma la ficha');
    t.has(await text(p, '#coachHost'), 'No se pudo cargar', tabla + ': avisa que no se pudo cargar');
    falla = false;
    await p.evaluate(async id => { const m = await import('/app/screens/coach/clientes.js'); await m.openClient(id); }, A1); await wait(800);
    const d2 = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); return CoachState.coachData; });
    t.ok(d2 && !d2.error && d2.id === A1, tabla + ': al reintentar con señal se abre la ficha');
    t.eq(errs, [], tabla + ': errores de la página');
    await close();
  }
}
