// «Escuchar a tu coach» en Entreno: la base solo deja escuchar los audios del coach actual (los
// guarda en su carpeta, ver supabase/ejercicio-audio.sql). Si el coach venció o desvinculó al
// alumno, la rutina queda con los audios del coach anterior y el botón fallaba siempre con
// «Revisá la conexión». Ahora se muestra solo si el audio es del coach que tiene hoy.
import { newPage, wait, ALUMNO } from './lib.mjs';

const COACH = '33333333-3333-3333-3333-333333333333', OTRO = '44444444-4444-4444-4444-444444444444';
const perfil = coach_id => (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id }; return J(i.one ? me : [me]); };

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca plano (barra)', audio: COACH + '/ex/abcdefgh12.webm', audioSecs: 42, sets: [{ id: 's1', kg: '80', reps: '8' }] }] }];
  for (const [coach, se, msg] of [[COACH, true, 'con su coach: está el botón'], [null, false, 'sin coach (venció o lo desvinculó): no está'], [OTRO, false, 'con otro coach: no está']]){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': perfil(coach) } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('.ex-collapsed[data-ex="e1"]'); await wait(300);
    t.eq(!!(await p.$('[data-ex-id="e1"] .ex-audio')), se, '«Escuchar a tu coach» ' + msg);
    const st = await p.evaluate(async () => (await import('/app/core/state.js')).state.days[0].exercises[0].audio);
    t.eq(st, COACH + '/ex/abcdefgh12.webm', msg + ': el audio queda en la rutina (vuelve si se vincula de nuevo)');
    t.eq(errs, [], msg + ': errores de la página');
    await close();
  }
}
