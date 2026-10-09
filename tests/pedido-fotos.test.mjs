// Pedir un producto: si el pedido no se guarda (por ejemplo, el tope de 15 pedidos por día), se
// borran las fotos que ya se habían subido. Antes quedaban para siempre en el bucket productos,
// sin ningún pedido, y cada reintento sumaba dos fotos más.
// Si la respuesta del pedido no llega (se cortó la señal), no se sabe si la base lo guardó: las
// fotos quedan. Antes se borraban igual, y si el pedido había quedado, el panel apuntaba a fotos
// borradas y el administrador no podía ver la tabla.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';
const IMG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icon-192.png');

export default async function ({ base, t }){
  for (const modo of ['tope', 'red']){
    const uploads = [], removed = [];
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
      handlers: {
        '/profiles': profile('client'),
        '/product_requests': (r, J, i) => i.m !== 'POST' ? J([]) : modo === 'red' ? r.abort('failed')
          : J({ code: '22023', message: 'Llegaste al límite de pedidos por hoy. Probá mañana.' }, 400),
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
    t.eq(uploads.length, 2, modo + ': se subieron las dos fotos');
    t.ok(uploads.every(x => x.startsWith(ALUMNO.id + '/pedido-')), modo + ': eran las fotos de este pedido: ' + uploads.join(', '));
    t.ok(!dialogs.join(' | ').includes('Tu producto fue enviado'), modo + ': no dice que se envió');
    if (modo === 'tope'){
      t.has(dialogs.join(' | '), 'Llegaste al límite de pedidos por hoy', 'tope: se ve por qué no se mandó');
      t.eq(removed.slice().sort(), uploads.slice().sort(), 'tope: las fotos del pedido que no se guardó se borran');
    } else {
      t.has(dialogs.join(' | '), 'Revisá tu conexión', 'red: dice que revise la conexión');
      t.eq(removed, [], 'red: las fotos quedan (el pedido puede haberse guardado)');
    }
    t.eq(errs, [], modo + ': errores de la página');
    await close();
  }
}
