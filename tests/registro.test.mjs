// Registro de hoy en tamaños de Android: opciones largas del coach sin encimarse ni cortarse,
// botones de 44 px, respuestas de texto que se ven enteras y el Peso de hoy ya cargado.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

export default async function ({ base, t }){
  const cq = { daily: [
    { id: 'dolor', label: '¿Dónde tuviste molestias?', type: 'options', options: ['Hiperextensión', 'Sobrecarga', 'Contracturas', 'Tendinopatía', 'Estreñimiento', 'Acidez/reflujo'] },
    { id: 'nota', label: 'Contame cómo te sentiste en el entrenamiento de hoy y si algo te molestó', type: 'text' }], checkin: null };
  for (const [w, h] of [[320, 640], [360, 800], [393, 873], [412, 915]]){
    const { p, errs, close } = await newPage({ user: ALUMNO, viewport: { width: w, height: h },
      state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [{ date: TODAY, kg: 82.5 }], daily: {} },
      handlers: { '/profiles': profile('client'), '/coach_questions': (r, J, i) => J(i.one ? cq : [cq]),
        '/body_weights': (r, J, i) => i.m === 'GET' ? J([{ measured_on: TODAY, kg: 82.5 }]) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-progreso'); await wait(300);
    await p.click('[data-action="psec-open"][data-v="registro"]'); await wait(400);
    const m = await p.evaluate(() => {
      const card = document.querySelector('.daily-card'), cr = card.getBoundingClientRect();
      const opts = [...card.querySelectorAll('.sc-opt')].map(b => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, h: r.height, sw: b.scrollWidth, cw: b.clientWidth }; });
      let overlap = 0; for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++){ const a = opts[i], b = opts[j]; if (Math.abs(a.t - b.t) < 2 && a.r > b.l + 0.5 && b.r > a.l + 0.5) overlap++; }
      const ta = card.querySelector('textarea.dq-text');
      return { overlap, spill: opts.filter(o => o.sw > o.cw + 1).length, out: opts.filter(o => o.r > cr.right + 0.5 || o.l < cr.left - 0.5).length,
        minH: Math.min(...opts.map(o => o.h)), cardOver: card.scrollWidth - card.clientWidth, textarea: !!ta, kg: document.getElementById('dKg').value };
    });
    const tag = w + 'x' + h + ': ';
    t.eq(m.overlap, 0, tag + 'opciones encimadas');
    t.eq(m.spill, 0, tag + 'texto que se sale de su botón');
    t.eq(m.out, 0, tag + 'botones cortados por el borde de la tarjeta');
    t.ok(m.minH >= 43.5, tag + 'botones de al menos 44 px de alto: ' + m.minH);
    t.ok(m.cardOver <= 0, tag + 'la tarjeta no desborda');
    t.ok(m.textarea, tag + 'la respuesta de texto es un campo de varias líneas');
    t.eq(m.kg, '82,5', tag + 'el Peso de hoy ya aparece cargado');
    t.eq(errs, [], tag + 'errores de la página');
    await close();
  }
}
