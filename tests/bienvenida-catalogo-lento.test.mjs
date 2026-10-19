// Bienvenida con señal floja: al tocar «Continuar» en «¿Cómo querés arrancar?» (rutina armada)
// la lista de rutinas espera al catálogo de la base. Antes, hasta que la base respondiera (sin
// límite), la pantalla no respondía. Ahora el botón dice «Cargando rutinas…» (y queda
// deshabilitado) y a los 4 s sigue con las rutinas de la app. El catálogo se pide una sola vez:
// el pedido que sale al entrar al paso es el mismo que se espera al tocar «Continuar».
import { newPage, wait, text, ALUMNO, onbSiguiente, onbAhoraNo } from './lib.mjs';

const perfil = (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); };

export default async function ({ base, t }){
  const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
  const { p, errs, calls, close } = await newPage({ user: NUEVO, handlers: { '/profiles': perfil,
    '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined,
    // El catálogo no responde (señal floja).
    '/rutinas_catalogo': () => new Promise(() => {}) } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('[data-onb="start"]'); await wait(300);
  await p.click('[data-onb="dskip"]'); await wait(300);
  await p.click('[data-onb="solo"]'); await wait(300);
  await p.click('[data-onb="sex"][data-v="m"]'); await wait(200);
  t.eq(await p.getAttribute('[data-onb="sex"][data-v="m"]', 'aria-pressed'), 'true', 'la opción tocada queda marcada al toque');
  await onbSiguiente(p);
  for (let i = 0; i < 6; i++) await onbAhoraNo(p); // cumpleaños … experiencia
  t.has(await text(p, '#authHost'), '¿Cómo querés arrancar?', 'llega a cómo arrancar');

  await p.click('[data-onb="next"]'); await wait(300);
  const btn = await p.$eval('#authHost .onb-main', b => ({ txt: b.textContent, dis: b.disabled }));
  t.eq(btn, { txt: 'Cargando rutinas…', dis: true }, 'el botón avisa que está cargando y no se puede volver a tocar');

  await wait(4500);
  t.has(await text(p, '#authHost'), 'Elegí tu rutina', 'sin respuesta del catálogo, a los 4 s sigue igual');
  t.ok((await p.$$('.onb-routine')).length > 0, 'con las rutinas de la app');
  t.eq(calls.filter(c => c === 'GET /rest/v1/rutinas_catalogo').length, 1, 'el catálogo se pide una sola vez');
  t.eq(errs, [], 'errores de la página');
  await close();
}
