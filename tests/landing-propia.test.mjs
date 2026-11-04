// Página de inicio (gize.ar) sin las plantillas visuales que se asocian a las webs genéricas hechas
// con IA: nada entra animado al scrollear ni brilla con el mouse, no hay cinta de palabras que corre,
// la sección de la app muestra capturas reales (assets/landing) en vez de tarjetas iguales con ícono,
// la notificación de ejemplo dice que es un ejemplo y no inventa a nadie, y los títulos de «Para vos y
// tu coach» no repiten la misma estructura. Todo entero en el celular (sin scroll de costado).
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  for (const width of [1280, 390]){
    const { p, errs, close } = await newPage({ viewport: { width, height: 844 }, touch: width < 500 });
    await p.goto(base + '/'); await wait(1200);
    // Las capturas cargan cuando se llega a ellas (loading="lazy").
    await p.locator('#app').scrollIntoViewIfNeeded(); await p.evaluate(() => [...document.querySelectorAll('#app .shot img')].forEach(i => i.scrollIntoView())); await wait(1200);
    const d = await p.evaluate(() => {
      const q = s => [...document.querySelectorAll(s)];
      const css = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules].map(r => r.cssText); } catch (e) { return []; } }).join('\n');
      return {
        animadas: q('.reveal, .spot, .marquee, .mq-row, .card.spot, .feat-ic').length,
        cssViejo: /animation-timeline:\s*view\(|\.spot|\.mq-row/.test(css),
        capturas: q('#app .shot img').map(i => i.getAttribute('src')),
        capturasCargan: q('#app .shot img').every(i => i.complete && i.naturalWidth > 0),
        tarjetasIguales: q('#app .card').length,
        incluye: q('#app .incluye li b').map(b => b.textContent),
        ejemplo: (document.querySelector('#nuevo .lock .lock-lbl') || {}).textContent,
        nombreInventado: /Martina/.test(document.querySelector('#nuevo').innerText),
        titulos: q('#funciones .show-list li b').map(b => b.textContent),
        ancho: document.documentElement.scrollWidth, vw: innerWidth,
      };
    });
    t.eq(d.animadas, 0, width + ': sin .reveal, .spot, cinta ni íconos de tarjeta');
    t.ok(!d.cssViejo, width + ': el CSS ya no trae las entradas al scrollear, el brillo ni la cinta');
    t.eq(d.capturas, ['assets/landing/coach-rutina.webp', 'assets/landing/app-entreno.webp', 'assets/landing/coach-seguimiento.webp'], width + ': la sección de la app son tres capturas reales');
    t.ok(d.capturasCargan, width + ': las capturas cargan');
    t.eq(d.tarjetasIguales, 0, width + ': sin tarjetas iguales con ícono');
    t.eq(d.incluye, ['Rutina del coach', 'Registro de series', 'Hábitos diarios', 'Cardio', 'Nutrición', 'Progreso'], width + ': lo que incluye sigue estando, como lista');
    t.eq(d.ejemplo, 'Ejemplo', width + ': la notificación dice que es un ejemplo');
    t.ok(!d.nombreInventado, width + ': la notificación no inventa a una coach');
    const inicios = d.titulos.map(x => x.split(' ').slice(0, 2).join(' '));
    t.ok(new Set(inicios).size === inicios.length, width + ': los títulos de las funciones no arrancan todos igual: ' + JSON.stringify(d.titulos));
    t.ok(d.ancho <= d.vw, width + ': sin scroll de costado (' + d.ancho + ' de ' + d.vw + ')');
    t.eq(errs, [], 'errores de la página (' + width + ')');
    await close();
  }
}
