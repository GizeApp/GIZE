// «¡Entreno terminado!»: «Contale a tu coach cómo te fue» (fatiga, pump, dolor articular) y
// «Enviar a mi coach» solo con coach. Sin coach (o sin perfil todavía) quedan el resumen, el
// récord, «seguir entrenando» y «Listo» para cerrar; con coach, todo como siempre.
import { newPage, saved, wait, ALUMNO, profile, perfil, CON_COACH } from './lib.mjs';

const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Remo con barra', sets: [{ id: 's1', kg: '60', reps: '8', done: true }] }] }];
// Una vez anterior con menos peso: el de hoy es récord.
const antes = [{ id: 'se0', performed_on: '2026-01-05', day_name: 'Torso', created_at: '2026-01-05T12:00:00Z',
  session_entries: [{ exercise_name: 'Remo con barra', set_order: 0, kg: 50, reps: 8 }] }];

async function terminar(base, prof){
  const pg = await newPage({ user: ALUMNO, viewport: { width: 390, height: 844 }, state: { days, sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': prof, '/sessions': (r, J, i) => i.m === 'GET' ? J(antes) : undefined } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('[data-action="save-session"]'); await wait(1000);
  const v = await pg.p.evaluate(() => {
    const c = document.querySelector('#fbHost .fb-card'); if (!c) return null;
    const btn = a => { const b = c.querySelector('[data-action="' + a + '"]'); return b ? b.textContent.trim() : null; };
    return { title: (c.querySelector('.fb-title') || {}).textContent || '', resumen: !!c.querySelector('.sum-box'), record: !!c.querySelector('.pr-box'),
      sub: (c.querySelector('.fb-sub') || {}).textContent || null, filas: c.querySelectorAll('.fb-row').length,
      enviar: btn('fb-save'), cerrar: btn('fb-skip'), seguir: !!c.querySelector('[data-action="fb-undo"]'), coach: /coach/i.test(c.innerText),
      over: document.documentElement.scrollWidth - innerWidth };
  });
  return Object.assign(pg, { v });
}

export default async function ({ base, t }){
  // Con coach: como siempre, y lo que se manda queda en el entreno.
  {
    const { p, errs, close, v } = await terminar(base, perfil('client', CON_COACH));
    t.ok(v && v.title.includes('Entreno terminado') && v.resumen && v.record && v.seguir, 'con coach: título, resumen, récord y seguir entrenando: ' + JSON.stringify(v));
    t.eq(v && [v.sub, v.filas, v.enviar, v.cerrar], ['Contale a tu coach cómo te fue', 3, 'Enviar a mi coach', 'Ahora no'], 'con coach: le cuenta a su coach cómo le fue');
    await p.click('#fbHost [data-action="fb-set"][data-k="rpe"][data-v="3"]'); await wait(200);
    await p.click('#fbHost [data-action="fb-save"]'); await wait(800);
    t.ok(!(await p.$('#fbHost .fb-card')), 'con coach: «Enviar a mi coach» cierra la ventana');
    t.eq((await saved(p)).sessions.filter(s => s.day === 'Torso' && s.rpe).map(s => s.rpe), [3], 'con coach: la fatiga queda en el entreno');
    t.eq(errs, [], 'con coach: errores de la página');
    await close();
  }
  // Sin coach y sin perfil todavía: nada para el coach; el resto igual y «Listo» cierra.
  for (const [tag, prof] of [['sin coach', perfil('client')], ['sin perfil', profile('client')]]){
    const { p, errs, close, v } = await terminar(base, prof);
    t.ok(v && v.title.includes('Entreno terminado') && v.resumen && v.record && v.seguir, tag + ': título, resumen, récord y seguir entrenando: ' + JSON.stringify(v));
    t.eq(v && [v.sub, v.filas, v.enviar, v.coach], [null, 0, null, false], tag + ': sin «Contale a tu coach» ni «Enviar a mi coach»');
    t.eq(v && v.cerrar, 'Listo', tag + ': «Listo» para cerrar');
    t.ok(v && v.over <= 0, tag + ': sin scroll de costado a 390 px');
    await p.click('#fbHost [data-action="fb-skip"]'); await wait(500);
    t.ok(!(await p.$('#fbHost .fb-card')), tag + ': «Listo» cierra la ventana');
    t.eq((await saved(p)).sessions.filter(s => s.day === 'Torso' && s.date !== '2026-01-05').length, 1, tag + ': el entreno quedó guardado');
    t.eq(errs, [], tag + ': errores de la página');
    await close();
  }
}
