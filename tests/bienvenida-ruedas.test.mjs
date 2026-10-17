// Ruedas de la bienvenida (app/ui/rueda.js): estatura, peso y fecha de nacimiento.
//   · Para el lector de pantalla cada una es un spinbutton con su valor; las filas van ocultas.
//   · Teclado: ↑ y → suben, ↓ y ← bajan, Re Pág / Av Pág de a 10, Inicio / Fin, Enter = «Continuar».
//   · Tocar una fila la lleva al medio (también la del medio: confirma el valor que venía).
//   · Rueda del mouse y el dedo (con el «snap» a la fila).
//   · Con movimiento reducido salta derecho al valor.
//   · Al moverse cambia solo la fila marcada (no recorre las 441 del peso).
//   · El foco con el teclado se ve en la franja del medio (la máscara cortaría un outline).
//   · Fecha: el día que no existe (31 de febrero) pasa al último del mes, también si se toca
//     «Continuar» a mitad de camino; con menos de 18 años no deja seguir.
//   · Enter o «Continuar» enseguida (la rueda todavía en camino) guardan lo que eligió, no la fila
//     que pasaba por el medio; con la tecla sostenida la rueda se mueve.
import { newPage, wait, text, ALUMNO, perfil, onbAhoraNo } from './lib.mjs';

const NUEVO = () => Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
async function abrir(base, opts){
  const pg = await newPage(Object.assign({ user: NUEVO(), handlers: { '/profiles': perfil('client'), '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined } }, opts || {}));
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('[data-onb="start"]'); await wait(300);
  await pg.p.click('[data-onb="dskip"]'); await wait(250);
  await pg.p.click('[data-onb="solo"]'); await wait(250);
  await pg.p.click('[data-onb="sex"][data-v="x"]'); await wait(150);
  await pg.p.click('[data-onb="next"]'); await wait(400); // cumpleaños
  return pg;
}
const valor = (p, sel) => p.$eval(sel, e => +e.getAttribute('aria-valuenow'));
const habilitado = p => p.$eval('#authHost .onb-main', b => !b.disabled);
async function tecla(p, sel, k, ms = 700){ await p.focus(sel); await p.keyboard.press(k); await wait(ms); }

export default async function ({ base, t }){
  // 1) Estatura y peso: ARIA, teclado, toques, rueda del mouse, foco y filas.
  {
    const { p, errs, close } = await abrir(base);
    await onbAhoraNo(p); await wait(200); // a la estatura
    const aria = await p.$eval('#onbAltura', e => ({ role: e.getAttribute('role'), label: e.getAttribute('aria-label'), min: e.getAttribute('aria-valuemin'), max: e.getAttribute('aria-valuemax'),
      now: e.getAttribute('aria-valuenow'), txt: e.getAttribute('aria-valuetext'), filas: e.querySelectorAll('.rd-item').length, ocultas: e.querySelectorAll('.rd-item[aria-hidden="true"]').length }));
    t.eq(aria, { role: 'spinbutton', label: 'Estatura', min: '120', max: '220', now: '170', txt: '170 cm', filas: 101, ocultas: 101 }, 'estatura: spinbutton con su valor (las filas ocultas)');
    t.eq(await p.$eval('#onbAltura', e => e.scrollTop), 50 * 44, 'estatura: arranca en 170 (en el medio)');

    // Foco con Tab: se marca la franja.
    await p.keyboard.press('Tab'); await wait(100);
    const f = await p.evaluate(() => {
      const rd = document.querySelector('#onbAltura').parentElement, band = getComputedStyle(rd.querySelector('.rd-band'));
      const tmp = document.createElement('span'); tmp.style.color = 'var(--gize-blue)'; rd.appendChild(tmp); const azul = getComputedStyle(tmp).color; tmp.remove();
      return { activo: document.activeElement.id, foco: rd.classList.contains('foco'), ancho: band.borderTopWidth, color: band.borderTopColor === azul };
    });
    t.eq(f, { activo: 'onbAltura', foco: true, ancho: '2px', color: true }, 'estatura: con Tab, el foco se ve en la franja (2 px del azul)');

    // Teclado.
    await tecla(p, '#onbAltura', 'ArrowUp'); t.eq(await valor(p, '#onbAltura'), 171, '↑ sube 1');
    t.ok(await habilitado(p), 'una tecla cuenta como tocarla: «Continuar» se habilita');
    await tecla(p, '#onbAltura', 'ArrowRight'); t.eq(await valor(p, '#onbAltura'), 172, '→ sube 1');
    await tecla(p, '#onbAltura', 'ArrowDown'); t.eq(await valor(p, '#onbAltura'), 171, '↓ baja 1');
    await tecla(p, '#onbAltura', 'ArrowLeft'); t.eq(await valor(p, '#onbAltura'), 170, '← baja 1');
    await tecla(p, '#onbAltura', 'PageUp', 900); t.eq(await valor(p, '#onbAltura'), 180, 'Re Pág sube 10');
    await tecla(p, '#onbAltura', 'PageDown', 900); t.eq(await valor(p, '#onbAltura'), 170, 'Av Pág baja 10');
    await tecla(p, '#onbAltura', 'Home', 1200); t.eq(await valor(p, '#onbAltura'), 120, 'Inicio: el primero');
    await tecla(p, '#onbAltura', 'End', 1200); t.eq(await valor(p, '#onbAltura'), 220, 'Fin: el último');
    t.eq(await p.$eval('#onbAltura', e => e.scrollTop), 100 * 44, 'y queda en el medio');
    // Rueda del mouse: baja la lista y, con el snap, sube el valor.
    await tecla(p, '#onbAltura', 'Home', 1200);
    const caja = await p.$eval('#onbAltura', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.move(caja.x, caja.y); await p.mouse.wheel(0, 132); await wait(1000);
    const tras = await valor(p, '#onbAltura');
    t.ok(tras > 120 && await p.$eval('#onbAltura', e => e.scrollTop % 44 === 0), 'rueda del mouse: sube y queda justo en una fila: ' + tras);
    // Enter = «Continuar».
    await tecla(p, '#onbAltura', 'Enter', 500);
    t.eq((await text(p, '#onbTit')), '¿Cuánto pesás?', 'Enter sigue al próximo paso');

    // Peso: las filas («72» y «72,5») y tocar filas.
    t.eq(await p.$$eval('#onbPeso .rd-item', l => [l.length, l[84].textContent, l[85].textContent]), [441, '72', '72,5'], 'peso: 441 filas, «72» y «72,5»');
    t.eq(await habilitado(p), false, 'peso: sin tocarla, «Continuar» no anda');
    await p.click('#onbPeso .rd-item.on'); await wait(300);
    t.ok(await habilitado(p), 'tocar la del medio confirma el valor que venía');
    t.eq(await valor(p, '#onbPeso'), 70, 'y queda en 70');
    await p.click('#onbPeso .rd-item[data-i="85"]'); await wait(900);
    t.eq([await valor(p, '#onbPeso'), await p.$eval('#onbPeso', e => e.scrollTop)], [72.5, 85 * 44], 'tocar otra fila la lleva al medio');
    t.eq(await p.getAttribute('#onbPeso', 'aria-valuetext'), '72,5 kg', 'el lector dice «72,5 kg»');
    // Un salto de 20 filas cambia solo dos clases (la fila vieja y la nueva).
    const cambios = await p.evaluate(async () => {
      const l = document.querySelector('#onbPeso'); let n = 0;
      const mo = new MutationObserver(ms => { n += ms.length; }); mo.observe(l, { subtree: true, attributes: true, attributeFilter: ['class'] });
      l.scrollTop += 20 * 44; l.dispatchEvent(new Event('scroll'));
      await new Promise(r => setTimeout(r, 400)); mo.disconnect(); return n;
    });
    t.ok(cambios <= 2, 'un salto de 20 filas: solo ' + cambios + ' cambios de clase');
    t.eq(await valor(p, '#onbPeso'), 82.5, 'y el valor sigue al scroll');
    t.eq(errs, [], 'estatura y peso: errores de la página');
    await close();
  }

  // 2) Con movimiento reducido: salta derecho.
  {
    const { p, errs, close } = await abrir(base, { reducedMotion: 'reduce' });
    await onbAhoraNo(p); await wait(200);
    await p.focus('#onbAltura');
    await p.keyboard.press('ArrowUp');
    t.eq(await p.$eval('#onbAltura', e => e.scrollTop), 51 * 44, 'movimiento reducido: ↑ salta ya a la fila siguiente');
    t.eq(await valor(p, '#onbAltura'), 171, 'movimiento reducido: 171');
    t.eq(errs, [], 'movimiento reducido: errores de la página');
    await close();
  }

  // 3) Con el dedo (pantalla táctil).
  {
    const { p, errs, close } = await abrir(base, { touch: true });
    await onbAhoraNo(p); await wait(200);
    const caja = await p.$eval('#onbAltura', e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
    // El dedo arrastra la lista para arriba (eventos táctiles de verdad: el gesto sintético de
    // scroll «touch» de Chromium no mueve nada en el navegador sin pantalla de las pruebas).
    const cdp = await p.context().newCDPSession(p);
    const toque = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: caja.x, y, id: 1 }] });
    await toque('touchStart', caja.y + 60);
    for (let k = 1; k <= 10; k++){ await toque('touchMove', caja.y + 60 - k * 15); await wait(16); }
    await toque('touchEnd'); await wait(1200);
    const v = await valor(p, '#onbAltura');
    t.ok(v > 170 && await p.$eval('#onbAltura', e => e.scrollTop % 44 === 0), 'con el dedo: sube el valor y queda justo en una fila: ' + v);
    t.ok(await habilitado(p), 'con el dedo cuenta como tocarla');
    t.eq(errs, [], 'táctil: errores de la página');
    await close();
  }

  // 4) Fecha de nacimiento.
  {
    const { p, errs, close } = await abrir(base);
    t.ok(/^\d{1,2} de [a-z]+ de \d{4}$/.test(await text(p, '.onb-fecha-val')), 'la fecha se lee entera: ' + await text(p, '.onb-fecha-val'));
    t.ok(/^\d+ años$/.test(await text(p, '.onb-edad')), 'con la edad: ' + await text(p, '.onb-edad'));
    t.eq(await p.$eval('#onbMes', e => [e.getAttribute('aria-label'), e.querySelector('.rd-item').textContent]), ['Mes', 'ene'], 'los meses, cortos');
    // Año bisiesto (2000) y otro que no (2001): el 31 de febrero pasa al 29 y al 28.
    const ir = async (sel, i) => { await p.$eval(sel, (e, i) => { e.scrollTop = i * 44; e.dispatchEvent(new Event('scroll')); }, i); await wait(500); };
    const anio0 = await p.$eval('#onbAnio', e => +e.getAttribute('aria-valuemin'));
    await ir('#onbAnio', 2001 - anio0);
    await ir('#onbMes', 1);
    await ir('#onbDia', 30); await wait(300);
    t.eq(await valor(p, '#onbDia'), 28, '31 de febrero de 2001 → 28');
    t.eq(await text(p, '.onb-fecha-val'), '28 de febrero de 2001', 'el resumen también');
    await ir('#onbAnio', 2000 - anio0);
    await ir('#onbDia', 30); await wait(300);
    t.eq(await valor(p, '#onbDia'), 29, '31 de febrero de 2000 (bisiesto) → 29');
    t.ok(/, \d+ años$/.test(await p.getAttribute('#onbAnio', 'aria-valuetext')), 'el año dice la edad: ' + await p.getAttribute('#onbAnio', 'aria-valuetext'));
    // Menos de 18: no deja seguir. El 31 de diciembre de hace 18 años: todavía no los cumplió
    // (salvo hoy 31 de diciembre). Antes quedaba el día que venía (28 o 29) y del 28 al 30 de
    // diciembre ya daba 18.
    const hoy = new Date();
    if (!(hoy.getMonth() === 11 && hoy.getDate() === 31)){
      await tecla(p, '#onbAnio', 'End', 1200);
      await tecla(p, '#onbMes', 'End', 1200);
      await tecla(p, '#onbDia', 'End', 1200);
      t.eq(await text(p, '.onb-fecha-val'), '31 de diciembre de ' + (hoy.getFullYear() - 18), 'el 31 de diciembre de hace 18 años');
      t.eq(await text(p, '.onb-edad'), '17 años', '17 años');
      t.eq(await habilitado(p), false, 'con 17, «Continuar» no anda');
      t.eq(await text(p, '#authHost .onb-hint'), 'GIZE es para mayores de 18 años.', 'y dice por qué');
      // El lector de pantalla también: la ayuda es un aviso (role=status) y las ruedas la nombran.
      t.eq(await p.evaluate(() => [...document.querySelectorAll('#authHost .rd-list')].map(l => { const d = document.getElementById(l.getAttribute('aria-describedby') || '-');
        return d ? d.getAttribute('role') + ': ' + d.textContent : ''; })), Array(3).fill('status: GIZE es para mayores de 18 años.'), 'y el lector de pantalla también lo sabe');
      t.ok(await p.isVisible('#authHost [data-onb="later"]'), '«Ahora no» sigue andando');
    }
    // «Continuar» a mitad de camino: igual guarda una fecha que existe.
    await ir('#onbAnio', 2001 - anio0);
    await ir('#onbMes', 1);
    await p.$eval('#onbDia', e => { e.scrollTop = 30 * 44; e.dispatchEvent(new Event('scroll')); });
    await p.click('#authHost [data-onb="next"]'); await wait(400);
    const nac = await p.evaluate(id => (JSON.parse(localStorage.getItem('gize_onb_draft_' + id)) || { ans: {} }).ans.nac, ALUMNO.id);
    t.ok(nac && nac.m === 2 && nac.y === 2001 && nac.d >= 1 && nac.d <= 28, 'tocando «Continuar» a mitad de camino queda una fecha que existe: ' + JSON.stringify(nac));
    t.eq(await text(p, '#onbTit'), '¿Cuánto medís?', 'y sigue');
    t.eq(errs, [], 'fecha: errores de la página');
    await close();
  }

  // 5) Teclas seguidas (como la repetición de una tecla sostenida, cada 30 ms) y Enter o
  //    «Continuar» enseguida, con la rueda todavía en camino: se guarda lo que eligió.
  {
    const { p, errs, close } = await abrir(base);
    const borrador = () => p.evaluate(id => (JSON.parse(localStorage.getItem('gize_onb_draft_' + id)) || { ans: {} }).ans, ALUMNO.id);
    const anio = new Date().getFullYear();
    await p.focus('#onbAnio');
    for (let i = 0; i < 10; i++){ await p.keyboard.press('ArrowDown'); await wait(30); }
    t.eq(await text(p, '.onb-edad'), '35 años', 'año: diez veces ↓ seguidas, 35 años');
    await p.keyboard.press('Enter'); await wait(400);
    t.eq(((await borrador()).nac || {}).y, anio - 35, 'año: Enter enseguida guarda el año elegido');
    t.eq(await text(p, '#onbTit'), '¿Cuánto medís?', 'año: y sigue');
    await onbAhoraNo(p); await wait(200);
    await p.focus('#onbPeso');
    const mitad = [];
    for (let i = 0; i < 10; i++){ await p.keyboard.press('ArrowUp'); await wait(30); if (i === 4) mitad.push(await valor(p, '#onbPeso')); }
    t.ok(mitad[0] >= 71.5, 'peso: con la tecla sostenida la rueda se mueve: ' + mitad[0]);
    await p.keyboard.press('Enter'); await wait(400);
    t.eq((await borrador()).peso, 75, 'peso: diez veces ↑ y Enter enseguida, 75 kg');
    // Tocar una fila lejos y «Continuar» enseguida.
    await p.click('#authHost [data-onb="back"]'); await wait(400);
    t.eq(await text(p, '#onbTit'), '¿Cuánto pesás?', 'de vuelta en el peso');
    await p.click('#onbPeso .rd-item[data-i="82"]'); await wait(40);
    await p.click('#authHost [data-onb="next"]'); await wait(400);
    t.eq((await borrador()).peso, 71, 'peso: tocar 71 y «Continuar» enseguida, 71 kg');
    t.eq(errs, [], 'teclas seguidas: errores de la página');
    await close();
  }
}
