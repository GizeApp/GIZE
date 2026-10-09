// Bienvenida con señal floja: al tocar «Mujer / Hombre / Prefiero no decir» la lista de rutinas
// espera al catálogo de la base. Antes no se marcaba la opción ni se decía nada, y hasta que la
// base respondiera (sin límite) la pantalla no respondía. Ahora la opción queda marcada, dice
// «Cargando rutinas…» y a los 4 s sigue con las rutinas de la app.
import { newPage, wait, text, ALUMNO } from './lib.mjs';

const perfil = (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); };

export default async function ({ base, t }){
  const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
  const { p, errs, close } = await newPage({ user: NUEVO, handlers: { '/profiles': perfil,
    '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined,
    // El catálogo no responde (señal floja).
    '/rutinas_catalogo': () => new Promise(() => {}) } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('[data-onb="start"]'); await wait(300);
  await p.click('[data-onb="dskip"]'); await wait(300);
  await p.click('[data-onb="solo"]'); await wait(300);
  await p.click('[data-onb="next"]'); await wait(300);
  t.has(await text(p, '#authHost'), '¿Para quién buscamos rutinas?', 'pregunta para quién');

  await p.click('[data-onb="sex"][data-v="m"]'); await wait(300);
  t.eq(await p.getAttribute('[data-onb="sex"][data-v="m"]', 'aria-pressed'), 'true', 'la opción tocada queda marcada al toque');
  t.has(await text(p, '#authHost'), 'Cargando rutinas…', 'avisa que está cargando');

  await wait(4500);
  t.has(await text(p, '#authHost'), 'Elegí tu rutina', 'sin respuesta del catálogo, a los 4 s sigue igual');
  t.ok((await p.$$('.onb-routine')).length > 0, 'con las rutinas de la app');
  t.eq(errs, [], 'errores de la página');
  await close();
}
