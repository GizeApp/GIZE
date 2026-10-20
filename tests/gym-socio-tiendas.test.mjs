// Gimnasios, etapa 1 (parte 3): App Store y Google Play en lo del socio («Reglas para todas las partes»
// 3 y criterio 6 de la parte 3). Con la app de iPhone y la de Android simuladas, en el celular y en una
// tablet, se recorre todo lo del socio: la caja del código, la hoja, «Pedido enviado», Ajustes → Tu
// gimnasio (con y sin pedido), «Qué ve el gimnasio», «Salir del gimnasio», la tarjeta de Entreno, la de
// confirmar y el link #unirme. En ninguna aparece «$», «Pagar», precios, planes de GIZE, «prueba»,
// Mercado Pago, transferencia ni links de pago.
import { wait } from './lib.mjs';
import { entrarSocio, miGimnasioSocio, IOS, ANDROID, M, TOKEN } from './gym-comun.mjs';

const PROHIBIDO = /\$|pagar|\bprueba\b|gratis|precio|mercado ?pago|transferencia|suscrip|\bp(100|250|500)\b|sin cargo|tarjeta|contratar|contratá|renov|plan de gize|tu plan|el plan\b|del plan\b|planes/i;
const LINKS = /mercadopago|mpago|\/checkout|suscripcion|precios|planes/i;
const TABLET = { width: 820, height: 1180 };
const GYM = { name: 'Gimnasio Fuerza', city: 'Rosario' };

// Lo del socio que se ve: la tarjeta de Entreno, la caja del código, Ajustes → Tu gimnasio y la hoja.
const leer = p => p.evaluate(() => {
  const els = [...document.querySelectorAll('#view .gym-card, #cfgGym, #gymSocioHost, #joinCodeLbl, #joinCode')];
  return { t: els.map(e => e.innerText || e.placeholder || '').join(' \n ').replace(/\S+@\S+/g, '(mail)'), h: els.map(e => e.outerHTML).join('') };
});

export default async function ({ base, t }){
  for (const [nombre, init] of [['iPhone', IOS], ['Android', ANDROID]]) for (const vp of [M, TABLET]){
    const donde = nombre + (vp === M ? ', celular' : ', tablet');
    const vistas = [];
    const mirar = async (p, n) => {
      const r = await leer(p); vistas.push(n);
      const m = r.t.match(PROHIBIDO);
      t.ok(!m, donde + ' · ' + n + ': sin precios ni planes de GIZE' + (m ? ' (aparece «' + m[0] + '»)' : ''));
      t.ok(!LINKS.test(r.h), donde + ' · ' + n + ': sin links de pago');
      t.ok(r.t.trim().length > 0, donde + ' · ' + n + ': se ve algo');
    };
    // Sin gimnasio: la caja, la hoja y «Pedido enviado».
    {
      const st = { gym: null };
      const pg = await entrarSocio(base, { gym: null, init, vp, touch: vp === M, rpc: {
        mi_gimnasio: () => st.gym, gym_codigo_info: () => ({ tipo: 'gym', gym: GYM }),
        gym_unirse: () => { st.gym = miGimnasioSocio({}, 'pendiente'); return { estado: 'pendiente', gym: GYM }; } } }), p = pg.p;
      await p.click('#nav-config'); await wait(500);
      await mirar(p, 'Caja del código');
      await p.fill('#joinCode', 'FUERZA22'); await p.click('[data-auth="join"]'); await wait(900);
      await mirar(p, 'Hoja');
      await p.click('#gymSocioHost [data-gys-h="ok"]'); await wait(1400);
      await mirar(p, 'Pedido enviado');
      await p.click('#gymSocioHost button[data-gys-h="cancel"]'); await wait(500);
      await mirar(p, 'Ajustes con el pedido');
      t.eq(pg.errs, [], donde + ': sin errores (pedido)');
      await pg.close();
    }
    // Socio: la tarjeta, Ajustes, «Qué ve», «Salir».
    {
      const pg = await entrarSocio(base, { init, vp, touch: vp === M }), p = pg.p;
      await mirar(p, 'Tarjeta de Entreno');
      await p.click('#nav-config'); await wait(500);
      await mirar(p, 'Ajustes → Tu gimnasio');
      await p.click('#cfgGym [data-gys="ver-hoja"]'); await wait(600); await mirar(p, 'Qué ve el gimnasio');
      await p.click('#gymSocioHost button[data-gys-h="cancel"]'); await wait(500);
      await p.click('#cfgGym [data-gys="salir"]'); await wait(600); await mirar(p, 'Salir del gimnasio');
      t.eq(pg.errs, [], donde + ': sin errores (socio)');
      await pg.close();
    }
    // Falta confirmar (cuenta convertida): la tarjeta y la hoja.
    {
      const pg = await entrarSocio(base, { init, vp, gym: miGimnasioSocio({ terms_at: null, origen: 'conversion' }) }), p = pg.p;
      await mirar(p, 'Tarjeta para confirmar');
      await p.click('#view .gym-card [data-gys="confirmar"]'); await wait(600); await mirar(p, 'Hoja para confirmar');
      await pg.close();
    }
    // El link #unirme.
    {
      const pg = await entrarSocio(base, { init, vp, gym: null, url: '/app/#unirme=' + TOKEN, espera: 3500, rpc: { gym_unirse_token_info: () => ({ estado: 'ok', gym: GYM, pide_dni: true }) } }), p = pg.p;
      await mirar(p, '#unirme: DNI');
      await p.fill('#gysDni', '123'); await p.click('#gymSocioHost [data-gys-h="seguir"]'); await wait(400);
      await mirar(p, '#unirme: hoja');
      await pg.close();
    }
    t.eq(vistas.length, 12, donde + ': se recorrieron todas las pantallas del socio');
  }
}
