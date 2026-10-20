// Las ventanas propias (preguntas y hoja del selector) opacas, encima de la barra de abajo y que se leen,
// en la app del alumno (cada apariencia, con el neón apagado, liviano y GIZE básico; y en la compu) y en
// el admin. Qué se mide: tests/carteles-opacos-comun.mjs. El panel del coach: tests/carteles-opacos-coach.test.mjs.
import { newPage, wait, ADMIN } from './lib.mjs';
import * as A from './neon-app-comun.mjs';
import { TEMAS, MODOS, revisar, cerrar, clases, pregunta, selector } from './carteles-opacos-comun.mjs';

export default async function ({ base, t }){
  // App del alumno, en el celular (la barra de abajo pasa por debajo de «Cancelar» de la hoja).
  for (const tema of TEMAS) {
    const { p, errs, close } = await A.abrir(base, { tema });
    await p.goto(base + '/app/'); await wait(2500); await A.ir(p, 'progreso');
    for (const [modo, cls] of MODOS) {
      await clases(p, cls, true);
      const donde = 'app, ' + tema + modo;
      await pregunta(p); await revisar(t, p, donde, 'pregunta');
      await selector(p, '#view'); await revisar(t, p, donde, 'selector', { barra: true });
      await cerrar(p); await clases(p, cls, false);
    }
    t.eq(errs, [], 'app, ' + tema + ': errores de la página');
    await close();
  }
  // App del alumno en la compu, en «Claro» (el selector es una tarjeta centrada).
  {
    const { p, errs, close } = await A.abrir(base, { tema: 'claro', vp: A.D });
    await p.goto(base + '/app/'); await wait(2500); await A.ir(p, 'progreso');
    await pregunta(p); await revisar(t, p, 'app en la compu, claro', 'pregunta');
    await selector(p, '#view'); await revisar(t, p, 'app en la compu, claro', 'selector');
    t.eq(errs, [], 'app en la compu: errores de la página');
    await close();
  }
  // Admin (siempre oscuro), en el celular.
  {
    const handlers = { '/is_app_admin': (r, J) => J(true), '/admin_contact_unread': (r, J) => J(0), '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }) };
    const { p, errs, close } = await newPage({ user: ADMIN, viewport: { width: 390, height: 844 }, touch: true, handlers });
    await p.goto(base + '/admin/#resumen'); await wait(1500);
    await pregunta(p); await revisar(t, p, 'admin', 'pregunta');
    await selector(p, '#root'); await revisar(t, p, 'admin', 'selector');
    t.eq(errs, [], 'admin: errores de la página');
    await close();
  }
}
