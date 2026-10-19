// Lo que se carga mientras la app relee la cuenta (loadCloud, p. ej. al volver la señal) no se
// pierde. Antes syncExtras no encolaba nada durante la lectura y al terminar se pisaba con lo de
// la nube: el agua, la comida o el peso desaparecían y nunca se subían.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

export default async function ({ base, t }){
  const hoy = ymd(new Date());
  let slow = false;
  const writes = [];
  const later = (ms, f) => new Promise(r => setTimeout(r, ms)).then(f);
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: {
      '/profiles': profile('client'),
      '/daily_logs': (r, J, i) => {
        if (i.m !== 'GET'){ writes.push({ t: 'daily_logs', body: JSON.parse(i.body || 'null') }); return undefined; }
        const rows = [{ client_id: ALUMNO.id, log_date: hoy, water_ml: 500, steps: 0, habits_done: { own: [], coach: [] } }];
        return slow ? later(3000, () => J(i.one ? rows[0] : rows)) : J(i.one ? rows[0] : rows);
      },
      '/body_weights': (r, J, i) => {
        if (i.m !== 'GET'){ writes.push({ t: 'body_weights', m: i.m, body: JSON.parse(i.body || 'null') }); return undefined; }
        const rows = [{ id: 'w1', client_id: ALUMNO.id, measured_on: '2026-01-01', kg: 80 }];
        return slow ? later(3000, () => J(rows)) : J(rows);
      },
    } });
  await p.goto(base + '/app/'); await wait(3500);
  const st0 = await p.evaluate(async () => (await import('/app/core/state.js')).state.water);
  t.eq(st0, 500, 'arranca con el agua de la nube');

  // Relee la cuenta (lento) y, mientras tanto, suma agua y anota un peso.
  slow = true; writes.length = 0;
  await p.evaluate(async hoy => {
    const sb = await import('/app/core/supabase.js'), { state } = await import('/app/core/state.js'), { save } = await import('/app/core/storage.js');
    const ld = sb.loadCloud();
    await new Promise(r => setTimeout(r, 800));
    state.water = (state.water || 0) + 250;
    state.weights = (state.weights || []).concat([{ id: 'nuevo', date: hoy, kg: 79.5 }]);
    save();
    await ld;
  }, hoy);
  slow = false;
  await wait(4000);
  const st = await p.evaluate(async () => { const { state } = await import('/app/core/state.js'); return { water: state.water, weights: state.weights.map(w => w.date + ':' + w.kg) }; });
  t.eq(st.water, 750, 'el agua sumada durante la lectura sigue');
  t.ok(st.weights.includes(hoy + ':79.5'), 'el peso anotado durante la lectura sigue: ' + st.weights.join(', '));
  const day = writes.find(w => w.t === 'daily_logs' && (Array.isArray(w.body) ? w.body[0] : w.body || {}).water_ml === 750);
  t.ok(day, 'el agua se sube: ' + JSON.stringify(writes));
  t.ok(writes.some(w => w.t === 'body_weights' && JSON.stringify(w.body).includes('79.5')), 'el peso se sube');
  // Un entreno guardado sin señal (todavía sin cloudId en el celular) se borra también de la
  // cola y de la nube: antes volvía a aparecer.
  const ids = await p.evaluate(async () => { const sb = await import('/app/core/supabase.js');
    return [sb.sessionCloudId({ id: 'aaaaaaaa-0000-4000-8000-000000000001' }), sb.sessionCloudId({ id: 'x1', cloudId: 'c1' }), sb.sessionCloudId({ id: 'k3j2h1' })]; });
  t.eq(ids, ['aaaaaaaa-0000-4000-8000-000000000001', 'c1', null], 'id en la nube de un entreno guardado sin señal');
  t.eq(errs, [], 'errores de la página');
  await close();
}
