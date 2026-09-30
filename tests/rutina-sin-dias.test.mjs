// Rutina sin ningún día (datos viejos o de la nube): la app quedaba en blanco con el error
// «Cannot read properties of undefined (reading 'id')». Ahora arma un día vacío y sigue.
import { newPage, wait, saved, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  for (const [tag, days] of [['días vacío', []], ['días que no es una lista', {}]]){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    t.eq(errs, [], tag + ': errores de la página');
    const v = await p.evaluate(() => ({ tabs: document.querySelectorAll('#view .tabs .tab:not(.tab-add)').length, add: !!document.querySelector('#view [data-action="ex-add-open"]'), nav: !!document.querySelector('#nav-cardio') }));
    t.eq(v, { tabs: 1, add: true, nav: true }, tag + ': Entreno se ve con un día vacío para cargar ejercicios');
    const st = await saved(p);
    t.ok(Array.isArray(st.days) && st.days.length === 1, tag + ': queda guardado un día');
    await p.click('#nav-cardio'); await wait(400);
    t.ok(await p.evaluate(() => document.querySelector('#view').innerText.length > 20), tag + ': las otras pantallas andan');
    await close();
  }
}
