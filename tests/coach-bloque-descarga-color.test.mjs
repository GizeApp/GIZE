// Bloque / mesociclo del coach (Estadísticas → Bloque): en la grilla de semanas, las de descarga se
// ven en azul, como dice la leyenda («Descarga»), y su número se lee. En «Oscuro» y «Claro» el fondo
// de los botones de css/ui/estetica-login.css y claro-frozen.css le ganaba a .bw.dl: la semana de
// descarga quedaba igual que las otras, con el número oscuro sobre oscuro (o blanco sobre blanco).
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const monday = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 14); return d.toISOString().slice(0, 10); };

// Luminancia relativa y contraste (WCAG) de dos colores rgb()/rgba() sobre el fondo de la semana.
const rgb = s => (String(s).match(/[\d.]+/g) || []).map(Number);
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const tinte = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);

export default async function ({ base, t }){
  const APARIENCIAS = [['Oscuro', ''], ['Azul', "localStorage.setItem('gize_tema','azul');"], ['Rosa', "localStorage.setItem('gize_tema','rosa');"],
    ['Claro', "localStorage.setItem('gize_tema','luz');"], ['Oscuro sin neón', "localStorage.setItem('gize_neon','0');"]];
  for (const [nombre, init] of APARIENCIAS){
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1280, height: 900 }, init,
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/blocks': (r, J, i) => i.m === 'GET' ? J([{ id: 'b1', client_id: A1, active: true, name: 'Bloque fuerza', start_date: monday(), weeks: 8, deloads: [4, 8] }]) : undefined,
      } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    await p.click('[data-coach="client-tab"][data-t="stats"]'); await wait(300);
    await p.click('[data-coach="sec-open"][data-v="bloque"]'); await wait(500);
    const leer = () => p.evaluate(() => {
      const st = e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color, w: e.dataset.w }; };
      return { dl: [...document.querySelectorAll('.bw-grid .bw.dl')].map(st), normal: st(document.querySelector('.bw-grid .bw:not(.dl)')),
        leyenda: getComputedStyle(document.querySelector('.bw-k.dl')).backgroundColor };
    });
    for (const paso of ['cerrada', 'abierta']){
      if (paso === 'abierta'){ await p.click('[data-coach="wk-open"][data-w="4"]'); await wait(400); }
      const s = await leer();
      t.eq(s.dl.map(x => x.w), ['4', '8'], nombre + ': las semanas 4 y 8 son de descarga');
      for (const d of s.dl){
        t.ok(d.bg !== s.normal.bg && tinte(rgb(d.bg)) > 70, nombre + ' (' + paso + '), semana ' + d.w + ': de color, distinta de las otras: ' + JSON.stringify({ dl: d.bg, normal: s.normal.bg }));
        t.ok(rgb(d.bg).length < 4 || rgb(d.bg)[3] === undefined || rgb(d.bg)[3] >= 0.95, nombre + ', semana ' + d.w + ': fondo lleno, no transparente: ' + d.bg);
        const c = contraste(rgb(d.color), rgb(d.bg));
        t.ok(c >= 4.5, nombre + ' (' + paso + '), semana ' + d.w + ': el número se lee (contraste ' + c.toFixed(2) + ': ' + d.color + ' sobre ' + d.bg + ')');
      }
      t.ok(tinte(rgb(s.leyenda)) > 70, nombre + ': la leyenda «Descarga» también es de color: ' + s.leyenda);
    }
    t.eq(errs, [], 'errores de la página (' + nombre + ')');
    await close();
  }
}
