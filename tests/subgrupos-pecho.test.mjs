// Volumen semanal por subgrupo de pecho (app/core/subgrupos.js): lo inclinado, la polea baja y el
// cruce de poleas descendente suman a pecho superior; declinado y fondos, a pecho bajo; el resto, a
// pecho medio.
import { volumeGroups } from '../app/core/subgrupos.js';

export default async ({ t }) => {
  const g = name => volumeGroups({ name, mus: 'pecho' })[0];
  t.eq(g('Cruce de poleas descendente'), 'pecho_sup', 'cruce de poleas descendente: pecho superior');
  t.eq(g('Press inclinado con mancuernas'), 'pecho_sup', 'press inclinado: pecho superior');
  t.eq(g('Aperturas en polea baja'), 'pecho_sup', 'aperturas en polea baja: pecho superior');
  t.eq(g('Press de banca declinado'), 'pecho_inf', 'press declinado: pecho bajo');
  t.eq(g('Fondos en paralelas'), 'pecho_inf', 'fondos: pecho bajo');
  t.eq(g('Cruce de poleas'), 'pecho_med', 'cruce de poleas: pecho medio');
};
