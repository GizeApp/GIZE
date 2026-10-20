// Las ventanas propias (preguntas y hoja del selector) opacas, encima de la barra de abajo y que se leen,
// en el panel del coach, en el celular: cada apariencia, con el neón apagado, liviano y GIZE básico.
// Qué se mide: tests/carteles-opacos-comun.mjs. La app del alumno y el admin: tests/carteles-opacos.test.mjs.
import { wait } from './lib.mjs';
import * as C from './coach-neon-comun.mjs';
import { TEMAS, MODOS, revisar, cerrar, clases, pregunta, selector } from './carteles-opacos-comun.mjs';

export default async function ({ base, t }){
  // Panel del coach, en el celular (con su barra de abajo).
  for (const tema of TEMAS) {
    const { p, errs, close } = await C.abrir(base, { tema, vp: C.M, touch: true });
    await p.goto(base + '/app/'); await wait(3000);
    for (const [modo, cls] of MODOS) {
      await clases(p, cls, true);
      const donde = 'panel del coach, ' + tema + modo;
      await pregunta(p); await revisar(t, p, donde, 'pregunta');
      await selector(p, '#coachHost'); await revisar(t, p, donde, 'selector');
      await cerrar(p); await clases(p, cls, false);
    }
    t.eq(errs, [], 'panel del coach, ' + tema + ': errores de la página');
    await close();
  }
}
