// «Atrás» de Android en la bienvenida (app/ui/atras.js): vuelve un paso; en «¡Bienvenido!», en el
// primer paso (sin flecha) y en la bienvenida del coach la app pasa a segundo plano, como antes;
// en el desvío «¿Para quién buscamos rutinas?» vuelve a la lista; en «Ver rutinas armadas»
// abierto desde Entreno cierra la ventana. Se simula el plugin App de Capacitor.
import { newPage, wait, text, ALUMNO, perfil, onbPaso, onbSinCuerpo } from './lib.mjs';

const NATIVE = () => {
  window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } };
};
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString() };

async function abrir(base, opts){
  const pg = await newPage(Object.assign({ init: NATIVE }, opts));
  await pg.p.route(u => !u.href.startsWith(base) && !/supabase\.co/.test(u.href), r => r.abort());
  await pg.p.goto(base + '/app/'); await wait(3000);
  pg.back = async () => { await pg.p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(400); };
  pg.min = () => pg.p.evaluate(() => window.__min);
  return pg;
}

export default async function ({ base, t }){
  // Cliente nuevo: la bienvenida.
  {
    const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
    const pg = await abrir(base, { user: NUEVO, handlers: { '/profiles': perfil('client'), '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined } }), p = pg.p;
    t.ok(/Bienvenido/.test(await text(p, '#authHost')), 've la bienvenida');
    await pg.back();
    t.eq(await pg.min(), 1, '«¡Bienvenido!»: «Atrás» saca de la app');
    t.ok(/Bienvenido/.test(await text(p, '#authHost')), '«¡Bienvenido!»: y la bienvenida sigue ahí');
    await p.click('[data-onb="start"]'); await wait(300);
    t.eq((await onbPaso(p)).n, '1/11', 'primer paso');
    await pg.back();
    t.eq(await pg.min(), 2, '1/11: sin flecha, «Atrás» saca de la app');
    t.eq((await onbPaso(p)).n, '1/11', '1/11: y se queda en el paso');
    await p.click('[data-onb="disc"][data-v="fuerza"]'); await p.click('[data-onb="next"]'); await wait(300);
    await p.click('[data-onb="solo"]'); await wait(300);
    t.eq((await onbPaso(p)).n, '3/11', '3/11');
    await pg.back();
    t.eq(await onbPaso(p), { n: '2/11', titulo: '¿Tenés un código de tu coach?' }, '3/11: «Atrás» vuelve al paso anterior');
    t.eq(await pg.min(), 2, '3/11: sin salir de la app');
    // El desvío desde la lista: vuelve a la lista.
    await p.click('[data-onb="solo"]'); await wait(300);
    await onbSinCuerpo(p, 'm');
    await p.click('[data-onb="next"]'); await wait(600);
    t.eq((await onbPaso(p)).titulo, 'Elegí tu rutina', 'la lista');
    await p.click('[data-onb="sexagain"]'); await wait(300);
    t.eq((await onbPaso(p)).titulo, '¿Para quién buscamos rutinas?', 'el desvío');
    await pg.back();
    t.eq(await onbPaso(p), { n: '11/11', titulo: 'Elegí tu rutina' }, 'desvío: «Atrás» vuelve a la lista');
    t.eq(await pg.min(), 2, 'desvío: sin salir de la app');
    t.eq(pg.errs, [], 'bienvenida: errores de la página');
    await pg.close();
  }

  // Cuenta de antes: «Ver rutinas armadas» desde Entreno se cierra con «Atrás».
  {
    const pg = await abrir(base, { user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', subtitle: '', exercises: [] }], sessions: [], weights: [], daily: {}, sex: 'x' },
      handlers: { '/profiles': perfil('client') } }), p = pg.p;
    await p.click('.empty-pick [data-action="open-routines"]'); await wait(800);
    t.ok(await p.isVisible('#authHost .onb-routine'), 'se abrió «Ver rutinas armadas»');
    t.eq(await p.evaluate(() => document.querySelector('#authHost .onb-head').getClientRects().length), 0, 'sin la cabecera de la bienvenida');
    await pg.back();
    t.ok(!(await p.isVisible('#authHost')), '«Atrás» la cierra');
    t.eq(await pg.min(), 0, 'sin salir de la app');
    t.eq(pg.errs, [], 'rutinas armadas: errores de la página');
    await pg.close();
  }

  // Coach nuevo: su bienvenida.
  {
    const pg = await abrir(base, { user: COACH, handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    } }), p = pg.p;
    t.has(await text(p, '#authHost'), '¡Bienvenido, coach!', 've la bienvenida del coach');
    await pg.back();
    t.eq(await pg.min(), 1, 'coach: «Atrás» saca de la app');
    t.has(await text(p, '#authHost'), '¡Bienvenido, coach!', 'coach: la bienvenida sigue ahí');
    t.eq(pg.errs, [], 'coach: errores de la página');
    await pg.close();
  }
}
