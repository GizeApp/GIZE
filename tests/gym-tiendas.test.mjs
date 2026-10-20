// Gimnasios, etapa 1: App Store y Google Play (plan, «Reglas para todas las partes» 3). Con la app de
// iPhone y la de Android simuladas, se recorre cada pantalla del panel del gimnasio (Inicio, Socios y sus
// pestañas, Sumar socio, la ficha y la ficha de entrenamiento en lectura, Profes con invitar y quitar,
// Asistencia, Recepción, Configuración con el QR, Acceso a GIZE, la hoja «Más» del celular, crear un
// gimnasio, aceptar una invitación y la recepción de la cuenta de recepción) y en ninguna aparece «$»,
// «Pagar», precios, nombres de planes ni el plan de GIZE, «prueba», Mercado Pago, transferencia ni links
// de pago. Tampoco se abre nunca la hoja de planes.
import { wait } from './lib.mjs';
import { entrar, miGimnasio, DUENA, COACH, RECEP, F, hostTxt, IOS, ANDROID, M, D } from './gym-comun.mjs';

const PROHIBIDO = /\$|pagar|\bprueba\b|gratis|precio|mercado ?pago|transferencia|suscrip|gimnasio chico|gimnasio grande|\bp(100|250|500)\b|sin cargo|tarjeta|contratar|contratá|renov|plan de gize|tu plan|el plan\b|del plan\b|planes de gize/i;
const LINKS = /mercadopago|mpago|\/checkout|suscripcion|wa\.me\/5493413490705\?text=[^"]*(plan|pag|contrat)/i;

async function leer(p){
  return p.evaluate(() => {
    const t = ['coachHost', 'gymModal', 'planSheetHost'].map(id => { const e = document.getElementById(id); return e ? e.innerText : ''; }).join(' \n ');
    const h = ['coachHost', 'gymModal'].map(id => { const e = document.getElementById(id); return e ? e.innerHTML : ''; }).join('');
    const hoja = !!(document.getElementById('planSheetHost') && document.getElementById('planSheetHost').innerHTML.trim());
    // Los mails de prueba (…@prueba.test) no cuentan.
    return { t: t.replace(/\S+@\S+/g, '(mail)').replace(/Planes alimenticios|Plan alimenticio|\bPlan\b(?=\s*(alimenticio|\n|$))/g, ''), h, hoja };
  });
}

export default async function ({ base, t }){
  for (const [nombre, init] of [['iPhone', IOS], ['Android', ANDROID]]){
    for (const vp of [M, D]){
      const donde = nombre + (vp === M ? ', celular' : ', tablet/compu');
      const gracia = miGimnasio('owner', { plan: { estado: 'gracia', vence: new Date(Date.now() - 2 * 864e5).toISOString(), pausa_profes_el: new Date(Date.now() + 3 * 864e5).toISOString(), libera_el: new Date(Date.now() + 8 * 864e5).toISOString(), plan: 'trial', seats_used: 120, max: 100, sobre_cupo: true, profes_usados: 3, profes_tope: 8 } });
      const pg = await entrar(base, DUENA, { gym: gracia, init, vp, touch: vp === M }), p = pg.p;
      const vistas = [];
      const mirar = async n => { const r = await leer(p); vistas.push(n); const m = r.t.match(PROHIBIDO); t.ok(!m, donde + ' · ' + n + ': sin precios ni planes de GIZE' + (m ? ' (aparece «' + m[0] + '»: …' + r.t.slice(Math.max(0, r.t.search(PROHIBIDO) - 60), r.t.search(PROHIBIDO) + 40).replace(/\s+/g, ' ') + '…)' : ''));
        t.ok(!LINKS.test(r.h), donde + ' · ' + n + ': sin links de pago'); t.ok(!r.hoja, donde + ' · ' + n + ': no se abre la hoja de planes'); };
      const ir = async v => { await p.evaluate(v => { const b = document.querySelector('#coachHost [data-gym="ir"][data-v="' + v + '"]'); b.click(); }, v); await wait(700); };
      const tocar = async sel => { await p.evaluate(sel => { const b = document.querySelector(sel); if (b) b.click(); }, sel); await wait(600); };
      await mirar('Inicio');
      await ir('socios'); await mirar('Socios');
      await tocar('#coachHost [data-gym="socios-tab"][data-v="solicitudes"]'); await mirar('Solicitudes');
      await tocar('#coachHost [data-gym="socios-tab"][data-v="bajas"]'); await mirar('Bajas');
      await tocar('#coachHost [data-gym="socios-tab"][data-v="socios"]');
      await tocar('#coachHost .gy-head [data-gym="sumar"]'); await wait(500); await mirar('Sumar socio: código');
      await tocar('#gymModal [data-gym="sumar-tab"][data-v="ficha"]'); await mirar('Sumar socio: ficha');
      await tocar('#gymModal .gy-x');
      await tocar('#coachHost .gy-row[data-id="' + F.A1 + '"]'); await wait(500); await mirar('Ficha');
      await tocar('#coachHost [data-gym="cambiar-profe"]'); await mirar('Cambiar profe'); await tocar('#gymModal .gy-x');
      await tocar('#coachHost [data-gym="entreno"][data-m="lectura"]'); await wait(900); await mirar('Ficha de entrenamiento (lectura)');
      await tocar('#coachHost [data-coach="back"]'); await wait(500);
      await ir('profes'); await mirar('Profes');
      await tocar('#coachHost .gy-head [data-gym="invitar"]'); await mirar('Invitar');
      await tocar('#gymModal input[value="admin"]'); await mirar('Invitar: administración');
      await tocar('#gymModal [data-gym="inv-crear"]'); await mirar('Invitación creada'); await tocar('#gymModal .gy-x');
      await tocar('#coachHost [data-gym="eq-abrir"]'); await mirar('Detalle del profe');
      await tocar('#coachHost [data-gym="eq-quitar"]'); await mirar('Quitar del gimnasio'); await tocar('#gymModal .gy-x');
      await ir('asistencia'); await mirar('Asistencia');
      await ir('recepcion'); await mirar('Recepción');
      await ir('config'); await mirar('Configuración');
      await tocar('#coachHost [data-gym="qr-imprimir"]'); await wait(400); await mirar('QR para imprimir'); await tocar('#gymModal .gy-x');
      await ir('plan'); await mirar('Acceso a GIZE');
      if (vp === M){ await tocar('#coachHost [data-gym="mas"]'); await mirar('Más'); await tocar('#gymModal [data-gym="cerrar"]'); }
      await ir('inicio'); await mirar('Inicio en gracia y sobre el cupo');
      t.eq(vistas.length, vp === M ? 22 : 21, donde + ': se recorrieron todas las pantallas');
      t.eq(pg.errs, [], donde + ': sin errores');
      await pg.close();
    }
    // Crear un gimnasio, aceptar una invitación y la recepción.
    for (const [n, user, o] of [['crear un gimnasio', COACH, { url: '/app/#gimnasio', gym: { gym: null, rol: null, puede_crear: true } }],
      ['aceptar una invitación', COACH, { url: '/app/#equipo=' + 'cd'.repeat(32), gym: null }],
      ['invitación con el tope', COACH, { url: '/app/#equipo=' + 'cd'.repeat(32), gym: null, rpc: { gym_invitacion_info: () => ({ gym: { name: 'Gimnasio Fuerza' }, role: 'profe', estado: 'tope' }) } }],
      ['recepción', RECEP, { gym: miGimnasio('recepcion', { plan: undefined, contadores: undefined }), rol: 'client' }]]){
      const pg = await entrar(base, user, Object.assign({ init, vp: M, touch: true }, o));
      const r = await leer(pg.p);
      const m = r.t.match(PROHIBIDO);
      t.ok(r.t.trim().length > 20 && !m, nombre + ' · ' + n + ': sin precios ni planes de GIZE' + (m ? ' («' + m[0] + '»)' : ''));
      await pg.close();
    }
  }
}
