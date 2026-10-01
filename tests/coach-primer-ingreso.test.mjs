// Primer ingreso de un coach en un celular que ya tenía datos de alumno guardados (le pasó al
// entrar con «Continuar con Apple» en la app de iPhone): la pantalla de alumno quedaba armada
// debajo del login y se veía a través del panel del coach — las dos mezcladas. Al entrar,
// solo tiene que verse el panel.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca plano (barra)', sets: [{ id: 's1', kg: '', reps: '' }] }] }];

export default async function ({ base, t }){
  const now = () => Math.floor(Date.now() / 1000);
  const { p, errs, close } = await newPage({
    init: `(() => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i','1'); localStorage.clear();
      localStorage.setItem('rutina_jero_v1', JSON.stringify(${JSON.stringify({ days, sessions: [], weights: [], daily: {} })})); })();`,
    handlers: {
      '/auth/v1/token': (r, J) => J({ access_token: 'x.eyJzdWIiOiJ1MyJ9.y', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: 'r', user: COACH }),
      '/auth/v1/user': (r, J) => J(COACH),
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    } });
  await p.goto(base + '/app/'); await wait(2500);
  t.ok(await p.$('#auEmail'), 'arranca en el login');
  await p.fill('#auEmail', COACH.email); await p.fill('#auPass', 'secreta');
  await p.click('[data-auth="do-login"]'); await wait(5000);
  const m = await p.evaluate(() => {
    const v = document.getElementById('view'), host = document.getElementById('coachHost');
    // Lo que se ve en varios puntos de la pantalla: tiene que ser del panel, nunca del alumno.
    const pts = [[195, 200], [195, 420], [195, 650]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && v.contains(e)); });
    return { coach: host.style.display === 'block' && document.body.classList.contains('silk-coach'),
      viewVisible: getComputedStyle(v).display !== 'none', viewText: v.textContent.trim().length, alumnoEnPantalla: pts.some(Boolean) };
  });
  t.ok(m.coach, 'se ve el panel del coach');
  t.eq(m.viewVisible, false, 'la pantalla del alumno no se muestra debajo del panel');
  t.eq(m.viewText, 0, 'la pantalla del alumno quedó vacía');
  t.eq(m.alumnoEnPantalla, false, 'nada de la pantalla del alumno aparece en pantalla');
  t.eq(errs, [], 'errores de la página');
  await close();
}
