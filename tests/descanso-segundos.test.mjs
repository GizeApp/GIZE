// Descanso que escribe el coach en texto libre: en Argentina los segundos se anotan 90'' (o 90")
// y los minutos 2'. Antes el primer apóstrofo se tomaba como minutos: 90'' eran 90 minutos (y el
// aviso de fin quedaba para dentro de una hora y media), 1'30 era 1 minuto y «10 seg» 10 minutos.
import { newPage, wait, ALUMNO, profile, openAllEx } from './lib.mjs';

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [
    { id: 'e1', name: 'Press de banca plano (barra)', rest: "90''", sets: [{ id: 's1', kg: '60', reps: '8' }, { id: 's2', kg: '60', reps: '8' }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500); await openAllEx(p);
  const ins = ["90''", '90"', '90″', "45’’", "1'30", "1'30''", '1’30”', '1 min 30 seg', "2'", "2'-3'", '2 min', '1.5 min', '1,5 min', '10 seg', '5 seg', '10s', '90 seg', '60-90 seg', '2-3 min', '1:30', '90', '3', ''];
  const got = await p.evaluate(async ins => { const { parseRest } = await import('/app/ui/restbar.js'); return ins.map(parseRest); }, ins);
  t.eq(got, [90, 90, 90, 45, 90, 90, 90, 90, 120, 120, 120, 90, 90, 10, 5, 10, 90, 60, 120, 90, 90, 180, 0], 'descansos escritos a mano → segundos: ' + ins.join(' | '));
  t.eq(await p.evaluate(() => document.querySelector('[data-ex-id="e1"] .rest-edit-t').textContent.trim()), '1:30', "el alumno ve 1:30 con 90'' del coach (no 90:00)");
  t.eq(errs, [], 'errores de la página');
  await close();
}
