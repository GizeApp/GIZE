// 1) Peso corporal: corregir la fecha de un registro lo mueve (antes quedaban los dos, el viejo y
//    uno nuevo, también en la nube y para el coach).
// 2) Check-in semanal: lo escrito en una respuesta se guarda mientras se escribe; al volver de
//    otra app la pantalla se redibuja y antes se perdía.
import { newPage, saved, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  {
    const posts = [];
    const weights = [{ id: 'w7', date: '2026-10-01', kg: 80 }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights, daily: {} },
      handlers: { '/profiles': profile('client'),
        '/body_weights': (r, J, i) => i.m === 'GET' ? J(weights.map(w => ({ id: w.id, client_id: ALUMNO.id, measured_on: w.date, kg: w.kg })))
          : (posts.push(i.m + ' ' + decodeURIComponent(i.url.search) + ' ' + (i.body || '')), r.fulfill({ status: 201, body: '[]' })) } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    await p.click('[data-action="psec-open"][data-v="peso"]'); await wait(300);
    await p.click('[data-action="weight-edit"][data-id="w7"]'); await wait(300);
    await p.fill('#wDate', '2026-10-02'); await p.dispatchEvent('#wDate', 'input');
    await p.click('[data-action="weight-save"]'); await wait(3000);
    const st = await saved(p);
    t.eq(st.weights.map(w => w.date + ':' + w.kg), ['2026-10-02:80'], '1: corregir la fecha mueve el registro');
    t.ok(posts.some(x => x.startsWith('DELETE') && x.includes('2026-10-01')), '1: el de la fecha vieja se borra en la nube: ' + posts.join(' | '));
    t.eq(errs, [], '1: errores de la página');
    await close();
  }
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
    const open = await p.$('[data-action="ci-open"]');
    if (open){ await open.click(); await wait(400); }
    const ta = await p.$('textarea[data-action="ci-set"]');
    t.ok(ta, '2: se ve el check-in');
    if (ta){
      const k = await ta.getAttribute('data-k');
      await ta.click(); await p.keyboard.type('Esta semana dormí poco');
      // Vuelve de otra app: la pantalla se redibuja.
      await p.evaluate(async () => { (await import('/app/main.js')).renderApp(); });
      await wait(300);
      t.eq(await p.inputValue('textarea[data-action="ci-set"][data-k="' + k + '"]'), 'Esta semana dormí poco', '2: lo escrito sigue después de redibujar');
    }
    t.eq(errs, [], '2: errores de la página');
    await close();
  }
}
