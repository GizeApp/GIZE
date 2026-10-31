// «Armar con IA» no aparece en el modo lectura del gimnasio (la dueña mira a una socia que compartió
// y no es suya): soloLectura saca los botones data-coach="ria-*" (coach/index.js). Con «rutina»
// prendido para la dueña, el botón sí está en la ficha editable de su propia socia.
import { wait } from './lib.mjs';
import { entrar, DUENA, F, ir, hostTxt } from './gym-comun.mjs';

const PRENDIDA = { activa: true, funciones: { planilla: false, rutina: true }, rol: 'coach', permiso_rutinas: 'ok', aviso_version: 1,
  estado: 'normal', vuelve: null, quedan: { planilla: 0, rutina: 15 }, tope: { planilla: 0, rutina: 15, total: 60 } };

export default async function ({ base, t }){
  const pg = await entrar(base, DUENA, { rpc: { ia_coach_estado: () => PRENDIDA } });
  const p = pg.p;
  const abrir = async id => { await ir(p, 'socios'); await p.click('#coachHost .gy-row[data-id="' + id + '"] .gy-socio-t'); await wait(900); };
  const aRutina = async () => { await p.click('#coachHost [data-coach="client-tab"][data-t="rutina"]'); await wait(500); };

  // Control: su propia socia (Pedro, la dueña es su profe), en modo profe (editable): «Armar con IA» está.
  await abrir(F.A7);
  await p.click('#coachHost [data-gym="entreno"][data-m="profe"]'); await wait(1500);
  await aRutina();
  t.ok(await p.$('#coachHost [data-coach="ria-open"]'), 'su socia (profe): «Armar con IA» aparece');
  await p.click('#coachHost [data-coach="back"]'); await wait(700);

  // Una socia que compartió (Martina), en modo lectura: sin «Armar con IA».
  await abrir(F.A1);
  await p.click('#coachHost [data-gym="entreno"][data-m="lectura"]'); await wait(1500);
  await aRutina();
  t.ok(!(await p.$('#coachHost [data-coach="ria-open"]')), 'modo lectura: sin el botón «Armar con IA»');
  t.ok(!/Armar con IA/.test(await hostTxt(p)), 'modo lectura: sin el texto «Armar con IA»');
  t.eq(pg.errs, [], 'sin errores');
  await pg.close();
}
