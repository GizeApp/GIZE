// Página de inicio (gize.ar): la portada centrada y en movimiento (pedido del dueño, «como una página
// de descarga pero movido»). Revisa: el link de Google Play a la app de verdad, que App Store diga
// «Muy pronto» sin ser un link (la app de iPhone todavía no está aprobada), la cuenta y «Soy coach»
// por la web, que el título termine de entrar y se lea, que con «reducir movimiento» se vea todo sin
// animar, que en el celular no haya scroll de costado y que la barra flotante no tape las secciones.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  for (const [nom, vp, reduced] of [['compu', { width: 1440, height: 900 }, 'no-preference'], ['celu', { width: 390, height: 844 }, 'no-preference'], ['quieto', { width: 390, height: 844 }, 'reduce']]){
    const { p, errs, close } = await newPage({ viewport: vp, reducedMotion: reduced });
    await p.goto(base + '/'); await wait(2600);
    const r = await p.evaluate(() => {
      const play = document.querySelector('.hero a.store'), apple = document.querySelector('.hero .store.pronto');
      const ws = [...document.querySelectorAll('.hero h1 .w')].map(e => +getComputedStyle(e).opacity);
      const fine = getComputedStyle(document.querySelector('.hero .fine')).opacity;
      return { play: play && play.href, playTxt: play && play.textContent.replace(/\s+/g, ' ').trim(), appleTag: apple && apple.tagName, appleTxt: apple && apple.textContent.replace(/\s+/g, ' ').trim(),
        h1: document.querySelector('.hero h1').textContent.replace(/\s+/g, ' ').trim(), ws, fine,
        registro: !!document.querySelector('.hero a[href="app/#registro"]'), coach: !!document.querySelector('.hero a[href="#coach"]'),
        ancho: document.documentElement.scrollWidth, vw: innerWidth };
    });
    t.eq(r.play, 'https://play.google.com/store/apps/details?id=ar.com.gize.app', nom + ': Google Play lleva a la app');
    t.eq(r.playTxt, 'Descargala en Google Play', nom + ': el texto del botón de Google Play');
    t.ok(r.appleTag === 'SPAN' && r.appleTxt === 'Muy pronto en App Store', nom + ': App Store dice «Muy pronto» y no es un link: ' + JSON.stringify([r.appleTag, r.appleTxt]));
    t.eq(r.h1, 'Entrená con tu coach desde el celular', nom + ': el título');
    t.ok(r.ws.length === 7 && r.ws.every(o => o === 1) && r.fine === '1', nom + ': el título y la ayuda terminan de entrar y se ven: ' + JSON.stringify([r.ws, r.fine]));
    t.ok(r.registro && r.coach, nom + ': «Creá tu cuenta» y «Soy coach» por la web');
    t.ok(r.ancho <= r.vw, nom + ': sin scroll de costado (' + r.ancho + ' de ' + r.vw + ')');
    if (reduced === 'reduce'){
      const anim = await p.evaluate(() => [...document.querySelectorAll('.hero *')].filter(e => getComputedStyle(e).animationName !== 'none').length);
      t.eq(anim, 0, 'quieto: con «reducir movimiento» no se anima nada de la portada');
    }
    if (nom === 'compu'){
      await p.click('header a[href="#como"]'); await wait(1200);
      const d = await p.evaluate(() => ({ h2: document.querySelector('#como h2').getBoundingClientRect().top, bar: document.querySelector('header .wrap').getBoundingClientRect().bottom }));
      t.ok(d.h2 > d.bar, 'compu: al ir a «Cómo funciona», el título queda debajo de la barra flotante: ' + JSON.stringify(d));
    }
    t.eq(errs, [], nom + ': errores de la página');
    await close();
  }
}
