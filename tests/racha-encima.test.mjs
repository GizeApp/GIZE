// El aviso «Se apagó tu racha» y el detalle de la racha van por encima de todo lo de la app:
// con z-index 60/71 quedaban detrás del panel del coach, del chat o de las hojas y se veían
// de fondo. Solo el splash y el login van más arriba.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  const { p, close } = await newPage({});
  await p.goto(base + '/app/'); await wait(1500);
  const z = await p.evaluate(() => {
    const mk = (html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d.firstElementChild); };
    mk('<div class="streak-note on">x</div>');
    mk('<div id="streakHost" class="on"><div class="stk-bg"></div><div class="stk-card">x</div></div>');
    const zi = sel => +getComputedStyle(document.querySelector(sel)).zIndex || 0;
    const ziRule = sel => { const d = document.createElement('div'); d.className = sel; document.body.appendChild(d); const v = +getComputedStyle(d).zIndex || 0; d.remove(); return v; };
    return { note: zi('.streak-note'), bg: zi('#streakHost .stk-bg'), card: zi('#streakHost .stk-card'),
      coach: +getComputedStyle(document.getElementById('coachHost') || document.body).zIndex || 0,
      chat: ziRule('ch-ov'), hoja: ziRule('ssh'), sheet: ziRule('sheet') };
  });
  const arriba = Math.max(z.coach, z.chat, z.hoja, z.sheet, 200);
  t.ok(z.note > arriba, 'el aviso de racha apagada queda adelante (' + z.note + ' > ' + arriba + ')');
  t.ok(z.bg > arriba && z.card > z.bg, 'el detalle de la racha queda adelante (' + z.bg + '/' + z.card + ')');
  t.ok(z.note < 9999 && z.card < 9999, 'y debajo del splash y del login');
  await close();
}
