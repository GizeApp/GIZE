// Panel de administración → Productos → Pedidos: la foto que manda la gente se abre entera
// dentro de la pantalla (antes, en la compu, una foto vertical se abría a tamaño real y no
// entraba). Las chicas no se agrandan. Se cierra tocándola o con Esc.
import { newPage, wait, ADMIN } from './lib.mjs';

const U = '11111111-1111-1111-1111-111111111111';

// Foto de prueba (una tabla nutricional de mentira) hecha con un canvas.
async function jpeg(p, w, h){
  const b64 = await p.evaluate(([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.font = '40px sans-serif';
    for (let i = 0; i < h / 60; i++) x.fillText('Valor energético ' + i, 20, 60 + i * 60);
    return c.toDataURL('image/jpeg', .8).split(',')[1];
  }, [w, h]);
  return Buffer.from(b64, 'base64');
}

export default async function ({ base, t }){
  for (const [vw, vh] of [[390, 844], [1280, 800], [1920, 1080]]){
    for (const [iw, ih] of [[1200, 1600], [1600, 1200], [300, 400]]){
      const tag = `pantalla ${vw}x${vh}, foto ${iw}x${ih}: `;
      const reqs = [{ id: 1, code: null, name: 'Yogur', brand: 'Ser', label_path: U + '/pedido-tabla-1.jpg', front_path: null, status: 'pendiente',
        created_at: new Date().toISOString(), user_email: 'x@prueba.test', user_name: 'Beto', existing_id: null }];
      const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: vw, height: vh }, handlers: {
        '/is_app_admin': (r, J) => J(true), '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }),
        '/admin_contact_unread': (r, J) => J(0), '/admin_requests_pending': (r, J) => J(1), '/admin_requests': (r, J) => J(reqs) } });
      const img = await jpeg(p, iw, ih);
      await p.route(/supabase\.co\/storage\//, r => {
        const req = r.request();
        if (req.method() === 'POST' && req.url().includes('/object/sign/')){
          const paths = JSON.parse(req.postData()).paths;
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paths.map(x => ({ path: x, signedURL: '/object/sign/productos/' + x + '?token=t', error: null }))) });
        }
        return r.fulfill({ status: 200, contentType: 'image/jpeg', body: img });
      });
      await p.goto(base + '/admin/#productos'); await wait(1800);
      const tab = await p.$('[data-a="ptab"][data-v="pedidos"]'); if (tab){ await tab.click(); await wait(800); }
      const btn = await p.$('[data-req="1"] [data-a="zoom"]');
      t.ok(!!btn, tag + 'está la foto del pedido');
      if (!btn){ await close(); continue; }

      await btn.click(); await wait(500);
      const m = await p.evaluate(() => {
        const i = document.querySelector('.zoom img'), r = i.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, alt: i.alt,
          scroll: document.querySelector('.zoom').scrollHeight > innerHeight + 1 };
      });
      t.ok(m.t >= 0 && m.l >= 0 && m.b <= vh + 0.5 && m.r <= vw + 0.5, tag + 'la foto entra entera en la pantalla: ' + JSON.stringify(m));
      t.ok(!m.scroll, tag + 'no hay que scrollear para verla');
      t.ok(Math.abs(m.w / m.h - iw / ih) < 0.02, tag + 'no se deforma');
      if (iw <= 400) t.ok(Math.round(m.w) === iw && Math.round(m.h) === ih, tag + 'una foto chica no se agranda');
      else t.ok(Math.max(m.w, m.h) >= Math.min(vh, vw) * 0.8, tag + 'se ve grande igual (para leer la tabla)');
      t.eq(m.alt, 'Tabla nutricional', tag + 'la foto ampliada dice qué es');

      await p.keyboard.press('Escape'); await wait(200);
      t.ok(!(await p.$('.zoom')), tag + 'Esc la cierra');
      await p.evaluate(() => document.querySelectorAll('.zoom').forEach(z => z.remove())); // si no cerró, que siga la prueba
      await btn.click(); await wait(300);
      await p.click('.zoom'); await wait(200);
      t.ok(!(await p.$('.zoom')), tag + 'tocarla la cierra');
      t.eq(errs, [], tag + 'errores de la página');
      await close();
    }
  }
}
