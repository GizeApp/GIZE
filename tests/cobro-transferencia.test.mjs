// Los coaches pagan por transferencia (se arregla por WhatsApp): sin «link de pago» en los
// textos y Finanzas sin descontar comisión de Mercado Pago (entra el precio entero).
import { newPage, wait, ADMIN } from './lib.mjs';

export default async function ({ base, t }){
  // Página de inicio: se contrata por WhatsApp y se paga por transferencia.
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/'); await wait(1200);
    const note = await p.$eval('#precios .price-note', e => e.textContent);
    t.ok(/transferencia/.test(note) && !/link de pago/i.test(note), 'inicio: se paga por transferencia, sin link de pago: ' + note.trim().slice(0, 140));
    t.ok(await p.$('#precios .price-note a[href^="https://wa.me/"]'), 'inicio: el pago se arregla por WhatsApp');
    t.eq(errs, [], 'inicio: errores de la página');
    await close();
  }
  // Panel de administración → Finanzas: 2 coaches al día en un plan de $24.900 = $49.800 enteros.
  {
    const fin = { settings: { mp_plazo: '0', usd_pago: 'tarjeta' }, costs: [], todos: [], trial: 0,
      plans: [{ id: 'p25', name: 'Hasta 25', price: 24900, paid: 2 }] };
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 1200, height: 900 }, handlers: {
      '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_fin': (r, J) => J(fin) } });
    await p.route(/dolarapi\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await p.goto(base + '/admin/#finanzas'); await wait(1500);
    const txt = await p.evaluate(() => document.querySelector('#fKpis') ? document.querySelector('#fKpis').innerText : document.body.innerText);
    t.ok(/49\.800/.test(txt), 'Finanzas: entra el precio entero, sin comisión: ' + txt.replace(/\s+/g, ' ').slice(0, 200));
    t.ok(!/comisi[oó]n de Mercado Pago|Mercado Pago libera/i.test(await p.evaluate(() => document.body.innerText)), 'Finanzas: no habla de la comisión de Mercado Pago');
    t.eq(errs, [], 'Finanzas: errores de la página');
    await close();
  }
}
