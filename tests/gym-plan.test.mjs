// Gimnasios, etapa 1: Plan de GIZE del gimnasio (SPEC §2.9). En la web, la dueña ve su plan, la barra de
// socios contada en el servidor, los profes sin cargo, el vencimiento y qué pasa si vence, y [Cambiar de
// plan] abre los flujos de hoy con solo los planes de gimnasio (p100, p250, p500) y «Más de 500». La
// administración ve el estado sin comprar. En las apps de Android y de iPhone, una pantalla neutra: sin
// precios, nombres de planes, prueba ni pagos.
import { wait } from './lib.mjs';
import { entrar, miGimnasio, DUENA, ADMIN_G, F, hostTxt, ir, IOS, ANDROID } from './gym-comun.mjs';

const dias = n => new Date(Date.now() + n * 864e5).toISOString();
const PROHIBIDO = /\$|pagar|prueba|gratis|precio|mercado ?pago|transferencia|suscrip|gimnasio chico|gimnasio grande|p100|p250|p500|tarjeta|contrat/i;

export default async function ({ base, t }){
  {
    const pg = await entrar(base, DUENA), p = pg.p;
    await ir(p, 'plan');
    const txt = await hostTxt(p);
    for (const s of ['Gimnasio · hasta 250 socios', '182 de 250 socios', '3 de 15 profes sin cargo', 'Qué pasa si vence', 'Los primeros 5 días', 'los socios quedan sin profe',
      'Tus profes, la administración, la recepción y los pedidos sin aprobar no cuentan'])
      t.has(txt, s, 'web: «' + s + '»');
    t.ok(await p.$('#coachHost .gy-barra[role="meter"][aria-valuenow="182"][aria-valuemax="250"]'), 'la barra de socios con lo contado en el servidor');
    await p.click('#coachHost [data-gym="plan-cambiar"]'); await wait(600);
    const hoja = await p.evaluate(() => (document.getElementById('planSheetHost') || {}).innerText || '');
    t.ok(/Gimnasio chico/i.test(hoja) && /Hasta 100 socios/.test(hoja) && /Hasta 250 socios/.test(hoja) && /Hasta 500 socios/.test(hoja), 'Cambiar de plan: los planes de gimnasio');
    t.ok(!/Hasta 10 clientes|Hasta 25 clientes|Hasta 50 clientes/.test(hoja), 'sin los planes de coach (10, 25, 50)');
    t.has(hoja, 'Más de 500', '«Más de 500: a medida»');
    t.ok(/\$59\.900/.test(hoja) && /Pagar con tarjeta|Renovar con tarjeta/.test(hoja), 'en la web, con precios y Mercado Pago como hoy');
    await p.click('#planSheetHost .cp-x'); await wait(200);
    t.eq(pg.errs, [], 'sin errores');
    await pg.close();
  }
  // En gracia, en la web: el cartel con las fechas.
  {
    const g = miGimnasio('owner', { plan: { estado: 'gracia', vence: dias(-2), pausa_profes_el: dias(3), libera_el: dias(8), plan: 'p100', seats_used: 80, max: 100, sobre_cupo: false, profes_usados: 2, profes_tope: 8 } });
    const pg = await entrar(base, DUENA, { gym: g });
    await ir(pg.p, 'plan');
    t.has(await hostTxt(pg.p), 'Todo sigue andando hasta el', 'gracia: hasta cuándo anda todo');
    await pg.close();
  }
  // El plan del gimnasio es la fila de coach_billing de la dueña: vencido (en gracia, o la prueba que
  // terminó), «Como profe», «Mi cuenta» y la ficha de entrenamiento de un socio siguen andando adentro
  // del marco, sin la pantalla de planes de coach. Pasada la gracia, un cartel del gimnasio que lleva al
  // plan (en las apps, sin precios ni planes). En la web, en el celular de Android y en el de iPhone.
  for (const [nombre, init] of [['web', ''], ['Android', ANDROID], ['iPhone', IOS]]){
    for (const [estado, billing] of [['gracia', { paid_until: dias(-2) }], ['gracia', { plan: 'trial', trial_ends_at: dias(-3), paid_until: null }], ['operativo', { paid_until: dias(-7) }]]){
      const n = nombre + ' (' + estado + (billing.plan ? ', prueba terminada' : '') + ')';
      const g = miGimnasio('owner', { plan: { estado, vence: dias(estado === 'gracia' ? -2 : -7), pausa_profes_el: dias(estado === 'gracia' ? 3 : -2), libera_el: dias(3), plan: billing.plan || 'p250',
        seats_used: 182, max: 250, sobre_cupo: false, profes_usados: 3, profes_tope: 15 } });
      const pg = await entrar(base, DUENA, { gym: g, init, billing }), p = pg.p;
      const pantalla = async (sel, que) => {
        await p.click(sel); await wait(1200);
        const txt = await hostTxt(p);
        t.ok(!!(await p.$('#coachHost .gy-shell .gy-nav')), n + ', ' + que + ': con el marco del gimnasio');
        t.ok(!/Pagar con tarjeta|Hasta 10 clientes|no está activa|Terminó tu prueba|Tu plan venció/i.test(txt), n + ', ' + que + ': sin la pantalla de planes de coach: ' + txt.slice(0, 160));
        if (nombre !== 'web') t.ok(!PROHIBIDO.test(txt.replace(/\S+@\S+/g, '')), n + ', ' + que + ': sin precios ni pagos: ' + (txt.match(PROHIBIDO) || [''])[0]);
        return txt;
      };
      let txt = await pantalla('#coachHost [data-coach="view-tpls"][data-gy-coach]', 'Rutinas');
      if (estado === 'gracia') t.ok(/Crear rutina/.test(txt), n + ': Rutinas anda (los primeros 5 días todo sigue)');
      else {
        t.has(txt, nombre === 'web' ? 'El plan de GIZE del gimnasio venció' : 'El acceso de GIZE del gimnasio está pausado', n + ': Rutinas, el cartel del gimnasio');
        await p.click('#coachHost .cv-wrap [data-gym="ir"][data-v="plan"]'); await wait(700);
        t.has(await hostTxt(p), nombre === 'web' ? 'Plan de GIZE' : 'Acceso a GIZE', n + ': y lleva al plan del gimnasio');
      }
      txt = await pantalla('#coachHost [data-coach="open-settings"][data-gy-coach]', 'Mi cuenta');
      t.ok(/Perfil/.test(txt) && !(await p.$('#coachHost [data-coach="settings-sec"][data-k="plan"]')), n + ': «Mi cuenta» anda, sin «Mi plan» de coach (el plan está en el panel)');
      await ir(p, 'socios'); await p.click('#coachHost .gy-row[data-id="' + F.A7 + '"]'); await wait(900);
      txt = await pantalla('#coachHost [data-gym="entreno"]', 'la ficha de entrenamiento');
      if (estado === 'gracia') t.has(txt, 'Pedro Álvarez', n + ': la ficha de entrenamiento de su socio anda');
      t.eq(pg.errs, [], n + ': sin errores');
      await pg.close();
    }
  }
  // La administración: el estado, sin comprar.
  {
    const pg = await entrar(base, ADMIN_G, { gym: miGimnasio('admin'), rol: 'client' });
    await ir(pg.p, 'plan');
    t.ok(!(await pg.p.$('[data-gym="plan-cambiar"]')), 'administración: sin [Cambiar de plan]');
    t.has(await hostTxt(pg.p), 'El plan lo maneja el dueño del gimnasio.', 'administración: quién lo maneja');
    await pg.close();
  }
  // Android e iPhone: la pantalla neutra.
  for (const [nombre, init] of [['Android', ANDROID], ['iPhone', IOS]]){
    for (const estado of ['activo', 'gracia', 'operativo']){
      const g = miGimnasio('owner', { plan: { estado, vence: dias(estado === 'activo' ? 30 : -6), pausa_profes_el: dias(-1), libera_el: dias(4), plan: 'p250', seats_used: 182, max: 250, sobre_cupo: false, profes_usados: 3, profes_tope: 15 } });
      const pg = await entrar(base, DUENA, { gym: g, init });
      await ir(pg.p, 'plan');
      const txt = await hostTxt(pg.p);
      t.has(txt, 'Acceso a GIZE', nombre + ' (' + estado + '): la pantalla neutra');
      t.has(txt, estado === 'activo' ? 'El acceso de GIZE del gimnasio está activo.' : estado === 'gracia' ? 'El acceso de GIZE del gimnasio venció el' : 'El acceso de GIZE del gimnasio está pausado.', nombre + ' (' + estado + '): el estado');
      t.ok(!PROHIBIDO.test(txt), nombre + ' (' + estado + '): sin precios, planes ni pagos: ' + (txt.match(PROHIBIDO) || [''])[0]);
      t.ok(!(await pg.p.$('[data-gym="plan-cambiar"], [data-plan]')), nombre + ' (' + estado + '): sin botón para comprar');
      await pg.close();
    }
  }
}
