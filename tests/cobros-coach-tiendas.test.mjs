// Cobros del coach en las apps de iPhone y Android (Capacitor simulado, como coach-iphone.test.mjs), en
// el celular y en una tablet. Queda escrito qué se permite: los montos que cobra el coach sí (no son
// precios de GIZE); nada del plan de GIZE, de suscripciones ni de pagar por fuera.
// - Con el interruptor de fábrica (web prendida, apps apagadas) o con solo la otra app prendida: no
//   aparece nada de Cobros (ni el botón, ni la tira de Inicio, ni la tarjeta de la ficha) y no se pide
//   nada del panel del gimnasio.
// - Prendido en esa app: la pantalla Cobros, «Cargar cuotas», «Anotar cobro», «Cobros del mes» y la ficha
//   sin palabras del plan ni de suscripciones (prueba, gratis, plan de GIZE, tu plan, suscrip, contrat,
//   tarjeta, Mercado Pago), sin links a gize.ar, Mercado Pago ni a un checkout, y sin el CSV (se baja
//   desde la web). La tira de Inicio, sin «$».
// - El «Atrás» de Android cierra la ventana y se queda en Cobros.
import { wait } from './lib.mjs';
import { M, hostTxt, rpcs } from './gym-comun.mjs';
import { A, resumen, entrarCoach, modalTxt, recursosGym } from './cobros-coach-comun.mjs';

// Las apps, con el plugin App (para el «Atrás» de Android).
const APP = plat => `(() => { window.__ls = {}; window.__min = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plat}', Plugins: {
    App: { getInfo: async () => ({ build: '999', version: 'x' }), getLaunchUrl: async () => null,
      addListener: (ev, cb) => { (window.__ls[ev] = window.__ls[ev] || []).push(cb); return Promise.resolve({ remove(){} }); },
      minimizeApp: async () => { window.__min++; }, exitApp: async () => { window.__min++; } } } }; })();`;
const PROHIBIDO = /prueba|gratis|plan de gize|tu plan|suscrip|contrat|tarjeta|mercado ?pago/i;
const LINKS = 'a[href*="gize.ar"], a[href*="mercadopago"], a[href*="checkout"], a[href*="mpago"]';
const TABLET = { width: 1024, height: 1366 };
const NOMBRE = { ios: 'iPhone', android: 'Android' };

export default async function ({ base, t }){
  for (const plat of ['ios', 'android']){
    for (const vp of [M, TABLET]){
      const donde = NOMBRE[plat] + (vp === M ? ', celular' : ', tablet');
      // ===== Apagado: de fábrica (en el celular) o con solo la otra app prendida (en la tablet) =====
      {
        const inter = vp === M ? { web: true, android: false, ios: false } : { web: true, android: plat === 'ios', ios: plat === 'android' };
        const q = donde + (vp === M ? ' (de fábrica)' : ' (prendido en la otra app)');
        const pg = await entrarCoach(base, { vp, init: APP(plat), touch: vp === M, resumen: resumen({ interruptor: inter }) }), p = pg.p;
        await p.click('#coachHost [data-coach="view-home"]'); await wait(400);
        t.eq(await p.$$eval('[data-coach="cobros-ir"], .cb-tira, #cobrosModal', l => l.length), 0, q + ': sin botón ni tira de Cobros');
        t.ok(!/cobros/i.test(await hostTxt(p)), q + ': no aparece «Cobros»');
        await p.click('#coachHost [data-coach="view-clients"]'); await wait(300);
        await p.click('#coachHost .co-trow[data-id="' + A.mar + '"]'); await wait(1500);
        t.eq(await p.$$eval('#coachHost [data-coach="sec-open"]', l => l.map(b => b.dataset.v)), ['chat', 'ficha', 'habitos'], q + ': la ficha sin «Cuota»');
        t.eq(rpcs(pg.st, 'cobros_alumno').length, 0, q + ': no se leen sus cobros');
        t.eq(await recursosGym(p), [], q + ': no se pide nada del panel del gimnasio');
        t.eq(pg.errs, [], q + ': sin errores en la página');
        await pg.close();
      }
      // ===== Prendido en esta app =====
      {
        const inter = { web: true, android: plat === 'android', ios: plat === 'ios' };
        const pg = await entrarCoach(base, { vp, init: APP(plat), touch: vp === M, resumen: resumen({ interruptor: inter }) }), p = pg.p;
        const revisar = async (txt, q) => {
          t.ok(!PROHIBIDO.test(txt), donde + ', ' + q + ': sin palabras del plan de GIZE ni de suscripciones: ' + (txt.match(PROHIBIDO) || [''])[0]);
          t.eq(await p.$$eval(LINKS, l => l.map(a => a.getAttribute('href'))), [], donde + ', ' + q + ': sin links a gize.ar, Mercado Pago ni a un checkout');
        };
        await p.click('#coachHost [data-coach="view-home"]'); await wait(400);
        const tira = await p.$eval('#coachHost .cb-tira', e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
        t.eq(tira, 'Cobros 1 vencida · 1 por vencer ›', donde + ': la tira de Inicio, sin montos');
        await p.click('#coachHost .cb-tira [data-coach="cobros-ir"]'); await wait(900);
        await p.click('#coachHost [data-coach="cobros-tab"][data-v="todos"]'); await wait(300);
        let txt = await p.evaluate(() => document.querySelector('#coachHost .cv-main').innerText.replace(/\s+/g, ' '));
        t.ok(/\$\s?150\.000/.test(txt) && /Anotar cobro/.test(txt), donde + ': la pantalla Cobros, con los montos del coach');
        await revisar(txt, 'Cobros');
        // «Cargar cuotas»
        await p.click('#coachHost [data-coach="cobros-cargar"]'); await wait(500);
        t.has(await modalTxt(p), 'Cargar cuotas', donde + ': se abre «Cargar cuotas»');
        await revisar(await modalTxt(p), '«Cargar cuotas»');
        await p.click('#cobrosModal .gy-x'); await wait(300);
        // «Anotar cobro» y el «Atrás» de Android.
        await p.click('#coachHost [data-coach="cobro-anotar"][data-id="' + A.juan + '"]'); await wait(500);
        t.has(await modalTxt(p), 'Anotar cobro', donde + ': se abre «Anotar cobro»');
        await revisar(await modalTxt(p), '«Anotar cobro»');
        if (plat === 'android'){
          await p.evaluate(() => (window.__ls.backButton || []).forEach(f => f({ canGoBack: false }))); await wait(500);
          t.ok(!(await p.$('#cobrosModal')), donde + ': el «Atrás» cierra la ventana');
          t.eq(await p.evaluate(() => [window.__min, !!document.querySelector('#coachHost [data-coach="cobros-parte"]')]), [0, true], donde + ': y se queda en Cobros');
        } else { await p.click('#cobrosModal .gy-x'); await wait(300); }
        // «Cobros del mes», sin el CSV.
        await p.click('#coachHost [data-coach="cobros-parte"][data-v="mes"]'); await wait(700);
        txt = await p.evaluate(() => document.querySelector('#coachHost .cv-main').innerText.replace(/\s+/g, ' '));
        t.ok(/Pablo Viejo/.test(txt), donde + ': «Cobros del mes» con la lista');
        t.eq(await p.$$eval('[data-coach="cobros-csv"]', l => l.length), 0, donde + ': sin el CSV (se baja desde la web)');
        await revisar(txt, '«Cobros del mes»');
        // La ficha en «Cuota».
        await p.click('#coachHost [data-coach="cobros-parte"][data-v="alumnos"]'); await wait(300);
        await p.click('#coachHost [data-coach="cobros-tab"][data-v="todos"]'); await wait(300);
        await p.click('#coachHost .gy-row[data-id="' + A.mar + '"] .gy-td-socio'); await wait(1800);
        txt = await p.evaluate(() => (document.querySelector('#coachHost .co-sec-body') || {}).innerText || '');
        t.ok(/Anotar cobro/.test(txt) && /Cobros/.test(txt), donde + ': la ficha en «Cuota»');
        await revisar(txt, 'la ficha');
        t.eq(pg.errs, [], donde + ': sin errores en la página');
        await pg.close();
      }
    }
  }
}
