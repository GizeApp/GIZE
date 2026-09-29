// Borrar una foto de progreso con la ✕ pide confirmación: si se cancela no se borra nada.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

async function abrir(base, reqs){
  const r = await newPage({ user: ALUMNO, state: { sessions: [], daily: {}, weights: [] },
    handlers: { '/profiles': profile('client'),
      '/checkin_photos': (rt, J, i) => { if (i.m === 'GET') return J([{ id: 'ph1', client_id: ALUMNO.id, path: ALUMNO.id + '/1700000000000.jpg', taken_on: '2026-08-01' }]); reqs.push(i.m + ' checkin_photos'); return J([]); },
      '/object/checkins': (rt, J, i) => { reqs.push(i.m + ' storage'); return J([]); } } });
  await r.p.goto(base + '/app/'); await wait(2500);
  await r.p.click('#nav-progreso'); await wait(300);
  await r.p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(300);
  return r;
}

export default async function ({ base, t }){
  // Cancelar: no sale ningún borrado.
  {
    const reqs = [], msgs = [];
    const { p, errs, close } = await abrir(base, reqs);
    t.eq(await p.$$eval('.ph-thumb', x => x.length), 1, 'se ve la foto');
    p.removeAllListeners('dialog');
    p.on('dialog', d => { msgs.push(d.message()); d.dismiss().catch(() => {}); });
    await p.click('.ph-del'); await wait(1200);
    t.ok(msgs.some(m => m.includes('¿Borrar esta foto de progreso?')), 'pregunta antes de borrar: ' + JSON.stringify(msgs));
    t.eq(reqs, [], 'cancelado: no se borra nada');
    t.eq(errs, [], 'cancelar: errores de la página');
    await close();
  }
  // Aceptar: se borra la fila y el archivo.
  {
    const reqs = [];
    const { p, errs, dialogs, close } = await abrir(base, reqs);
    await p.click('.ph-del'); await wait(1500);
    t.ok(dialogs.some(m => m.includes('¿Borrar esta foto de progreso?')), 'aceptar: pregunta antes de borrar');
    t.ok(reqs.includes('DELETE checkin_photos'), 'aceptar: se borra la foto: ' + JSON.stringify(reqs));
    t.eq(errs, [], 'aceptar: errores de la página');
    await close();
  }
}
