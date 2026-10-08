// Bienvenida en un segundo dispositivo: la cuenta es nueva (menos de 7 días) y ya armó su rutina
// en otro lado. La marca de "bienvenida vista" es por dispositivo, así que la bienvenida vuelve a
// aparecer, pero no le ofrece elegir otra rutina: antes cualquier salida (rutina armada, empezar
// vacío) pisaba la suya acá y en la nube.
import { newPage, wait, saved, text, ALUMNO } from './lib.mjs';

const perfil = (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); };
const MIA = [{ id: 'da', name: 'Mi día', subtitle: '', exercises: [{ id: 'ea', name: 'Sentadilla en Smith', mus: 'cuadriceps', sets: [{ id: 'sa', kg: '100', reps: '8', target: '6-8', done: false }] }] }];
const names = days => days.map(d => d.name + ':' + d.exercises.map(e => e.name).join(',')).join('|');

export default async function ({ base, t }){
  for (const salida of ['dnext', 'dskip']){
    const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
    const ups = [];
    const { p, errs, close } = await newPage({ user: NUEVO, handlers: { '/profiles': perfil,
      '/routines': (r, J, i) => {
        if (i.m === 'GET') return J({ days: MIA, updated_at: new Date(Date.now() - 86400000).toISOString() });
        const b = JSON.parse(i.body); ups.push((Array.isArray(b) ? b[0] : b).days); return undefined;
      } } });
    await p.goto(base + '/app/'); await wait(2500);
    t.ok(/Bienvenido/.test(await text(p, '#authHost')), salida + ': ve la bienvenida (es otro dispositivo)');
    await p.click('[data-onb="start"]'); await wait(300);
    t.ok(/¿Qué entrenás\?/.test(await text(p, '#authHost')), salida + ': pregunta la disciplina');
    await p.click('[data-onb="' + salida + '"]'); await wait(800);
    t.ok(!(await p.isVisible('#authHost .onb-card')), salida + ': con rutina propia la bienvenida termina ahí (no ofrece armar otra)');
    const st = await saved(p);
    t.eq(names(st.days), names(MIA), salida + ': conserva su rutina');
    t.eq(st.days[0].exercises[0].sets[0].kg, '100', salida + ': con sus pesos');
    t.ok(ups.every(d => names(d) === names(MIA)), salida + ': no sube otra rutina encima de la suya');
    t.eq(errs, [], salida + ': errores de la página');
    await close();
  }
}
