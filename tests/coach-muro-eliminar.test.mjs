// Coach con la cuenta inactiva (terminó la prueba o el plan) o pasado del máximo de alumnos: el
// panel se reemplaza por una pantalla sin la tuerca de Configuración, que era el único lugar con
// «Eliminar cuenta». Apple y Google exigen poder borrar la cuenta desde la app: ahora el botón
// está en esas pantallas también.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A = n => ({ id: '44444444-4444-4444-4444-44444444444' + n, full_name: 'Alumno ' + n });

export default async function ({ base, t }){
  const casos = [
    ['prueba terminada', { plan: null, max_clients: 3, trial_ends_at: '2020-01-01T00:00:00Z' }, [A(1)]],
    ['más alumnos que el máximo', { plan: null, max_clients: 1, trial_ends_at: '2099-01-01T00:00:00Z' }, [A(1), A(2)]],
  ];
  for (const [nombre, bill, clientes] of casos){
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J(clientes); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = Object.assign({ coach_id: COACH.id }, bill); return J(i.one ? b : [b]); },
      } });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.isVisible('.pl-wall'), nombre + ': se ve la pantalla de cuenta inactiva');
    t.ok(await p.isVisible('.pl-wall [data-action="cfg-delete-account"]'), nombre + ': tiene «Eliminar cuenta»');
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }
}
