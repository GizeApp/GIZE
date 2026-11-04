// Rutina a medida según los días de la semana (app/core/rutina-dias.js): para las 119
// combinaciones de 1 a 5 días sale una rutina que cumple las leyes (cada grupo hasta dos veces
// con 72 h entre medio, hombro hasta tres con 48 h, brazos solo con su grupo, hasta 8 ejercicios
// y 19 series por día, ejercicios de la lista de la app). Y se elige en «Ver rutinas armadas» y
// en la bienvenida tocando los días.
import { newPage, wait, saved, text, ALUMNO, onbSinCuerpo } from './lib.mjs';

const perfil = (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); };

export default async function ({ base, t }){
  // 1) El armador, para todas las combinaciones.
  {
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/app/'); await wait(1500);
    const r = await p.evaluate(async () => {
      const m = await import('/app/core/rutina-dias.js'), d = await import('/app/core/data.js');
      const pos = x => (x + 6) % 7, dist = (a, b) => (pos(b) - pos(a) + 7) % 7;
      const sep = (a, b, gap) => { const k = dist(a, b); return k >= gap + 1 && k <= 6 - gap; };
      const L = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
      const out = { n: 0, fallas: [], ejemplos: {} };
      for (let m7 = 1; m7 < 128; m7++){
        const ds = []; for (let x = 0; x < 7; x++) if (m7 & (1 << x)) ds.push(x);
        if (ds.length > 5) continue;
        out.n++;
        const tag = ds.map(x => L[x]).join(''), r = m.armarRutina(ds);
        const falla = s => out.fallas.push(tag + ': ' + s);
        if (!r || !Array.isArray(r.days) || r.days.length !== ds.length){ falla('no armó'); continue; }
        if (r.id !== 'dias-' + ds.map(x => [1, 2, 3, 4, 5, 6, 0].indexOf(x)).sort((a, b) => a - b).map(i => [1, 2, 3, 4, 5, 6, 0][i]).join('')) falla('id ' + r.id);
        if (!new RegExp('· ' + ds.length + ' día') .test(r.nombre) || !r.desc) falla('nombre o descripción: ' + r.nombre);
        const porMus = {}, ids = new Set(), nombres = new Set();
        for (const day of r.days){
          const s = day.exercises.reduce((n, e) => n + e.sets.length, 0);
          if (day.exercises.length < 3 || day.exercises.length > m.MAX_EJ || s < 8 || s > m.MAX_SERIES) falla(day.name + ': ' + day.exercises.length + ' ejercicios, ' + s + ' series');
          if (!day.dias || day.dias.length !== 1 || !ds.includes(day.dias[0])) falla(day.name + ': dias ' + JSON.stringify(day.dias));
          if (!day.name || nombres.has(day.name)) falla('nombre de día repetido o vacío: ' + day.name); nombres.add(day.name);
          if (!day.subtitle || !/^[A-ZÁ][a-záé]+ · /.test(day.subtitle)) falla(day.name + ': subtítulo ' + day.subtitle);
          const muss = day.exercises.map(e => e.mus);
          if (muss.includes('triceps') && !muss.includes('pecho')) falla(day.name + ': tríceps sin pecho');
          if (muss.includes('biceps') && !muss.includes('espalda')) falla(day.name + ': bíceps sin espalda');
          for (const e of day.exercises){
            if (!(d.EX_DB[e.mus] || []).includes(e.name) || d.ES_MAP[e.name]) falla('«' + e.name + '» no está en ' + e.mus);
            if (!e.rir || !e.rest || !e.sets.length || e.sets.some(x => !x.target || x.kg !== '' || x.reps !== '' || x.done)) falla(e.name + ': series, rir o descanso');
            if (ids.has(e.id)) falla('id repetido ' + e.id); ids.add(e.id); e.sets.forEach(x => { if (ids.has(x.id)) falla('id repetido ' + x.id); ids.add(x.id); });
            (porMus[e.mus] = porMus[e.mus] || new Set()).add(day.dias[0]);
          }
        }
        // Descanso entre las veces de cada músculo: hombro un día (48 h), el resto dos (72 h).
        for (const [mus, set] of Object.entries(porMus)){
          const l = [...set], gap = mus === 'hombros' ? 1 : 2, max = mus === 'hombros' ? 3 : 2;
          if (l.length > max) falla(mus + ' ' + l.length + ' veces');
          for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (!sep(l[i], l[j], gap)) falla(mus + ' sin descanso entre ' + L[l[i]] + ' y ' + L[l[j]]);
        }
        // Si los días lo permiten, los grupos grandes van dos veces: con dos pares de días a
        // 72 h, los tres; con uno, al menos dos (pecho y espalda comparten el par); sin ninguno,
        // cada uno una vez. Y el hombro, las veces que los días dejen (hasta tres).
        const pares = []; for (const a of ds) for (const b of ds) if (a < b && sep(a, b, 2)) pares.push([a, b]);
        const dos = ['pecho', 'espalda', 'cuadriceps'].filter(x => (porMus[x] || new Set()).size === 2).length;
        if (pares.length >= 2 && dos !== 3) falla('con ' + pares.length + ' pares a 72 h, solo ' + dos + ' grupos dos veces');
        if (pares.length === 1 && dos < 2) falla('con un par a 72 h, solo ' + dos + ' grupos dos veces');
        if (!pares.length && dos) falla('sin pares a 72 h y un grupo dos veces');
        let maxH = 0; for (const a of ds) for (const b of ds) for (const c of ds) if (a < b && b < c && sep(a, b, 1) && sep(b, c, 1) && sep(a, c, 1)) maxH = 3;
        if (!maxH) for (const a of ds) for (const b of ds) if (a < b && sep(a, b, 1)) maxH = 2;
        if (!maxH) maxH = 1;
        if ((porMus.hombros || new Set()).size < maxH) falla('hombro ' + (porMus.hombros || new Set()).size + ' veces, se podía ' + maxH);
        if (['LMXJV', 'LXV', 'LJ', 'LM', 'LMXJ', 'X'].includes(tag)) out.ejemplos[tag] = r.days.map(day => day.name + ' (' + day.subtitle + ')');
      }
      return out;
    });
    t.eq(r.n, 119, 'las 119 combinaciones de 1 a 5 días');
    t.eq(r.fallas, [], 'todas cumplen las leyes');
    t.eq(r.ejemplos.LMXJV, ['Torso A (Lunes · Pecho · Tríceps · Espalda · Bíceps · Hombros)', 'Pierna A (Martes · Cuádriceps · Isquios · Gemelos)', 'Hombros (Miércoles · Hombros · Abdominales)',
      'Torso B (Jueves · Pecho · Tríceps · Espalda · Bíceps)', 'Pierna B (Viernes · Isquios · Cuádriceps · Aductores · Gemelos · Hombros)'], 'de lunes a viernes: torso, pierna, hombros, torso, pierna');
    t.eq((r.ejemplos.LXV || []).map(x => x.split(' (')[0]), ['Torso A', 'Pierna', 'Torso B'], 'lunes, miércoles y viernes: torso, pierna, torso');
    t.eq((r.ejemplos.LJ || []).map(x => x.split(' (')[0]), ['Cuerpo completo A', 'Cuerpo completo B'], 'lunes y jueves: cuerpo completo dos veces');
    t.eq((r.ejemplos.LM || []).map(x => x.split(' (')[0]), ['Torso', 'Pierna'], 'lunes y martes: torso y pierna, una vez cada uno');
    t.eq((r.ejemplos.LMXJ || []).map(x => x.split(' (')[0]), ['Torso A', 'Pierna', 'Hombros', 'Torso B'], 'cuatro días seguidos: torso dos veces, pierna una y el día de hombros');
    t.eq((r.ejemplos.X || []).map(x => x.split(' (')[0]), ['Cuerpo completo'], 'un día: cuerpo completo');
    t.eq(errs, [], 'armador: errores de la página');
    await close();
  }

  // 2) Desde Entreno, «Ver rutinas armadas»: tocar los días arma la rutina y tocarla la carga.
  {
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', subtitle: '', exercises: [] }], sessions: [], weights: [], daily: {}, sex: 'x' },
      handlers: { '/profiles': perfil } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('.empty-pick [data-action="open-routines"]'); await wait(800);
    t.eq(await p.$$eval('[data-onb="sem"]', l => l.map(b => b.innerText.trim())), ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], 'los siete días para tocar, de lunes a domingo');
    t.ok(!(await p.$('.onb-routine:has-text("A tu medida")')), 'sin días tocados no hay rutina a medida');
    t.ok(/Tocá los días/.test(await text(p, '.onb-medida')), 'y lo dice');
    for (const d of [1, 3, 5]){ await p.click('[data-onb="sem"][data-v="' + d + '"]'); await wait(150); }
    t.eq(await p.$$eval('[data-onb="sem"].on', l => l.map(b => b.dataset.v)), ['1', '3', '5'], 'quedan marcados');
    t.ok(await p.isVisible('.onb-routine:has-text("A tu medida · 3 días")'), 'aparece la rutina a medida de 3 días');
    t.ok(/Lunes, miércoles y viernes/.test(await p.innerText('.onb-routine:has-text("A tu medida")')), 'con sus días');
    // La lista de arriba sigue con su filtro (no la toca).
    await p.click('[data-onb="dias"][data-v="1"]'); await wait(150);
    t.ok(await p.isVisible('.onb-routine:has-text("Cuerpo completo · 1 día")') && await p.isVisible('.onb-routine:has-text("A tu medida · 3 días")'), 'el filtro de la lista no esconde la a medida');
    // Seis días: no hay rutina (el cuerpo no descansa).
    await p.click('[data-onb="sem"][data-v="2"]'); await p.click('[data-onb="sem"][data-v="4"]'); await p.click('[data-onb="sem"][data-v="6"]'); await wait(150);
    t.ok(!(await p.$('.onb-routine:has-text("A tu medida")')) && /Hasta 5 días/.test(await text(p, '.onb-medida')), 'con 6 días avisa que son hasta 5');
    await p.click('[data-onb="sem"][data-v="2"]'); await p.click('[data-onb="sem"][data-v="4"]'); await p.click('[data-onb="sem"][data-v="6"]'); await wait(150);
    await p.click('.onb-routine:has-text("A tu medida · 3 días")'); await wait(800);
    const st = await saved(p);
    t.eq(st.days.map(d => d.name), ['Torso A', 'Pierna', 'Torso B'], 'cargó la rutina a medida');
    t.eq(st.days.map(d => d.dias), [[1], [3], [5]], 'con los días de la semana elegidos');
    t.ok(st.days.every(d => d.exercises.length >= 6 && d.exercises.every(e => e.rir && e.rest && e.sets.every(s => s.target && s.kg === ''))), 'con sus ejercicios, series, RIR y descanso');
    t.eq(dialogs, [], 'sin confirmación (no tenía ejercicios)');
    t.ok(!(await p.$('.empty-pick')), 'Entreno ya tiene rutina');
    t.eq(errs, [], 'Entreno: errores de la página');
    await close();
  }

  // 3) En la bienvenida: tocar los días elige la rutina a medida y «Empezar» la carga.
  {
    const NUEVO = Object.assign({}, ALUMNO, { created_at: new Date().toISOString() });
    const { p, errs, close } = await newPage({ user: NUEVO, handlers: { '/profiles': perfil, '/routines': (r, J, i) => i.m === 'GET' ? J(null) : undefined } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('[data-onb="start"]'); await wait(300);
    await p.click('[data-onb="disc"][data-v="fuerza"]'); await wait(200);
    await p.click('[data-onb="next"]'); await wait(300);
    await p.click('[data-onb="solo"]'); await wait(300);
    await onbSinCuerpo(p, 'm');
    await p.click('.onb-opt[data-v="rutina"]'); await wait(150);
    await p.click('[data-onb="next"]'); await wait(600);
    t.ok(/Elegí tu rutina/.test(await text(p, '#authHost')), 'la lista de rutinas');
    t.ok(await p.$eval('#authHost .onb-main', b => b.disabled), 'sin elegir nada, «Empezar» no anda');
    for (const d of [1, 2, 4, 5]){ await p.click('[data-onb="sem"][data-v="' + d + '"]'); await wait(150); }
    t.ok(await p.$eval('.onb-routine.on', e => /A tu medida · 4 días/.test(e.textContent)), 'tocar los días deja elegida la rutina a medida');
    t.ok(await p.$eval('#authHost .onb-main', b => !b.disabled), 'y «Empezar» anda');
    // Cambiar el filtro de la lista no la deselecciona (no depende del filtro).
    await p.click('[data-onb="dias"][data-v="2"]'); await wait(150);
    t.ok(await p.$eval('.onb-routine.on', e => /A tu medida · 4 días/.test(e.textContent)), 'el filtro de la lista no la deselecciona');
    await p.click('[data-onb="next"]'); await wait(1500);
    const st = await saved(p);
    t.eq(st.days.map(d => d.name), ['Torso A', 'Pierna A', 'Torso B', 'Pierna B'], 'cargó la de lunes, martes, jueves y viernes');
    t.eq(st.days.map(d => d.dias), [[1], [2], [4], [5]], 'con esos días de la semana');
    t.eq((st.calProfile || {}).daysPerWeek, 4, 'y los días por semana del perfil');
    t.ok(!(await p.isVisible('#authHost .onb-card')), 'se cierra la bienvenida');
    t.eq(errs, [], 'bienvenida: errores de la página');
    await close();
  }
}
