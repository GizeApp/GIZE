// Pedir un producto: si el pedido no se guarda (por ejemplo, el tope de 15 pedidos por día), se
// borran las fotos que ya se habían subido. Antes quedaban para siempre en el bucket productos,
// sin ningún pedido, y cada reintento sumaba dos fotos más.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';
const IMG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icon-192.png');

export default async function ({ base, t }){
  const uploads = [], removed = [];
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: {
      '/profiles': profile('client'),
      '/product_requests': (r, J, i) => i.m === 'POST' ? J({ code: '22023', message: 'Llegaste al límite de pedidos por hoy. Probá mañana.' }, 400) : J([]),
    } });
  await p.route(/supabase\.co\/storage\//, r => {
    const req = r.request(), u = new URL(req.url()).pathname;
    if (req.method() === 'DELETE') removed.push(...(JSON.parse(req.postData() || '{}').prefixes || []));
    else uploads.push(u.replace(/^.*\/object\/productos\//, ''));
    return r.fulfill({ status: 200, contentType: 'application/json', body: req.method() === 'DELETE' ? '[]' : '{"Key":"x"}' });
  });
  await p.goto(base + '/app/'); await wait(3000);
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="search-open"]'); await wait(300);
  await p.fill('#foodSearch', 'yogur griego'); await wait(600);
  await p.click('[data-action="rq-open"]'); await wait(300);
  await p.fill('[data-field="brand"]', 'Ser');
  await p.setInputFiles('[data-action="rq-photo"][data-k="label"]:not([capture])', IMG); await wait(400);
  await p.setInputFiles('[data-action="rq-photo"][data-k="front"]:not([capture])', IMG); await wait(400);
  await p.click('[data-action="rq-send"]'); await wait(2000);
  t.eq(uploads.length, 2, 'se subieron las dos fotos');
  t.has(dialogs.join(' | '), 'Llegaste al límite de pedidos por hoy', 'se ve por qué no se mandó');
  t.ok(!dialogs.join(' | ').includes('Tu producto fue enviado'), 'no dice que se envió');
  t.eq(removed.slice().sort(), uploads.slice().sort(), 'las fotos del pedido que no se guardó se borran');
  t.ok(uploads.every(x => x.startsWith(ALUMNO.id + '/pedido-')), 'eran las fotos de este pedido: ' + uploads.join(', '));
  t.eq(errs, [], 'errores de la página');
  await close();
}
