// Avisos de pedidos rechazados: si el usuario acepta mandar de nuevo el primero, los otros
// rechazos no se marcan como vistos (se avisan en el próximo chequeo) y no se pierden.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const seen = [];
  const resolved = [{ id: 7, name: 'Barra proteica', brand: 'Marca A', code: null, status: 'cargado', note: null },
                    { id: 8, name: 'Galletitas X', brand: 'Marca Y', code: null, status: 'rechazado', note: 'La foto no se lee' },
                    { id: 9, name: 'Alfajor Z', brand: 'Marca Z', code: null, status: 'rechazado', note: 'Falta la tabla' }];
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: {
      '/profiles': profile('client'),
      // Devuelve solo los que siguen sin ver (como el select con seen=false).
      '/product_requests': (r, J, i) => i.m === 'GET' ? J(resolved.filter(x => !seen.includes(x.id))) : undefined,
      '/product_request_seen': (r, J, i) => (seen.push(JSON.parse(i.body).rid), J(null)),
    } });
  await p.goto(base + '/app/'); await wait(6000);
  t.has(dialogs.join(' | '), 'No pudimos agregar «Galletitas X»', 'aviso del primer rechazado');
  t.eq(seen.slice().sort(), [7, 8], 'se marcan vistos el publicado y el rechazado que se avisó, no el que falta');
  t.ok(!dialogs.join(' | ').includes('Alfajor Z'), 'el segundo rechazado queda para el próximo aviso');
  t.eq(errs, [], 'errores de la página');
  await close();
}
