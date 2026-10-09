// Panel del coach: al volver a la app sin señal, el refresco de la lista de clientes falla. La
// lista que ya estaba queda (antes se vaciaba: «Todavía no tenés clientes vinculados» y
// «Clientes (0)»), y con ella el código de invitación y el plan con su cupo.
import { newPage, wait, text } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  let falla = false;
  const SIN_RED = J => J({ message: 'TypeError: Failed to fetch' }, 500);
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return falla ? SIN_RED(J) : J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      // Plan de 1 alumno: con Ana el cupo está lleno.
      '/coach_billing': (r, J, i) => { if (falla) return SIN_RED(J); const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 1, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/rpc/my_invite_code': (r, J) => falla ? SIN_RED(J) : J('ABC123'),
    } });
  await p.goto(base + '/app/'); await wait(3500);
  const antes = await text(p, '#coachHost');
  t.has(antes, 'Ana Alumna', 'con señal se ve la alumna');
  t.has(antes, 'Llegaste al máximo de tu plan', 'con el cupo lleno no se ofrece el código');

  // Vuelve a la app (de WhatsApp, por ejemplo) en un lugar sin señal: se refresca la lista.
  falla = true;
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(2000);
  const host = await text(p, '#coachHost');
  t.has(host, 'Ana Alumna', 'sin señal la alumna sigue en la lista');
  t.ok(!host.includes('Todavía no tenés clientes vinculados'), 'no muestra el cartel de «sin clientes»');
  t.has(host, 'Clientes (1)', 'la pestaña sigue contando 1');
  t.has(host, 'Llegaste al máximo de tu plan (1/1 clientes)', 'el plan y el cupo siguen');
  const st = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); return { n: CoachState.coachClients.length, inv: CoachState.coachInvite }; });
  t.eq(st, { n: 1, inv: 'ABC123' }, 'quedan la lista y el código de invitación');
  t.eq(errs, [], 'errores de la página');
  await close();
}
