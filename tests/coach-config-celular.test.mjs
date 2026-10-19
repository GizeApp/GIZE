// Configuración del coach en el celular (app/screens/coach/settings.js): el menú de secciones es una
// fila que se desliza. Al elegir una sección se redibuja y la fila volvía al principio: la sección
// elegida («Privacidad», «Cuenta») quedaba afuera de la pantalla y no se sabía dónde se estaba. Lo
// mismo entrando con el «?» de arriba (abre «Preguntas»). Ahora la elegida queda a la vista.
import { newPage, wait, configCoach } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };

// ¿La sección marcada se ve entera adentro de la fila?
const visible = p => p.evaluate(() => {
  const nav = document.querySelector('#coachHost .cs-nav'), on = nav.querySelector('.cs-nav-i.on');
  const nr = nav.getBoundingClientRect(), r = on.getBoundingClientRect();
  return { k: on.dataset.k, ve: r.left >= nr.left - 1 && r.right <= nr.right + 1, desliza: nav.scrollWidth > nav.clientWidth };
});

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 390, height: 844 }, touch: true,
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    } });
  await p.goto(base + '/app/'); await wait(3500);
  await configCoach(p);
  let v = await visible(p);
  t.ok(v.desliza, 'en 390 px la fila de secciones se desliza');
  t.eq([v.k, v.ve], ['perfil', true], 'arranca en «Perfil», a la vista');
  for (const k of ['privacidad', 'cuenta', 'apariencia']){
    await p.$eval(`#coachHost .cs-nav [data-k="${k}"]`, b => b.scrollIntoView({ inline: 'center', block: 'nearest' })); await wait(200);
    await p.tap(`#coachHost .cs-nav [data-k="${k}"]`); await wait(400);
    v = await visible(p);
    t.eq([v.k, v.ve], [k, true], 'al elegir «' + k + '», la sección queda marcada y a la vista');
  }
  // Con el «?» de arriba se abre «Preguntas»: también a la vista.
  await p.tap('[data-coach="settings-back"]'); await wait(400);
  await p.tap('.cv-util [data-coach="q-open"]'); await wait(600);
  v = await visible(p);
  t.eq([v.k, v.ve], ['preguntas', true], 'con el «?» abre «Preguntas» y se ve en la fila');
  t.eq(errs, [], 'errores de la página');
  await close();
}
