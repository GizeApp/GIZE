// Pantallas angostas de Android (320x640 y 360x800): que nada se corte, se salga ni quede tapado.
//   · Progreso → Historial del alumno: «Este entreno» y «La vez pasada» se leen enteros.
//   · Comida → Agregar: «Agregar» y la ✕ en la misma fila; «Desayuno», «Almuerzo»… sin cortar.
//   · Entreno: la palabra «reps» no queda debajo de la meta del coach (8-14).
//   · Coach: un mail largo no se sale de la fila, la grilla del plan no pasa el borde y el
//     tipo de respuesta de las preguntas se lee entero.
//   · Mi plan → Pautas: el agua y la sal llevan la unidad («3 L de agua por día»).
import { newPage, wait, ALUMNO } from './lib.mjs';

const SIZES = [{ width: 320, height: 640 }, { width: 360, height: 800 }];
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const LONG_MAIL = 'juan.ignacio.delatorre.santamaria@gmail.com';

// Rutina con metas del coach en todas las series.
const EXS = ['Press banca plano', 'Remo con barra', 'Sentadilla en Smith', 'Vuelos laterales sentado'];
const days = [{ id: 'd1', name: 'Torso', exercises: EXS.map((name, ei) => ({ id: 'e' + ei, name,
  sets: [0, 1, 2].map(si => ({ id: 'e' + ei + 's' + si, kg: '', reps: '', targetKg: '', done: false, target: si === 2 ? '14-18' : '8-14' })) })) }];

// Dos entrenos del mismo día: el último se compara con el anterior («22,5 kg × 8» contra «20 kg × 10»).
const ymd = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const mkSess = (id, ago, bump) => ({ id, client_id: ALUMNO.id, performed_on: ymd(ago), day_name: 'Torso', created_at: ymd(ago) + 'T20:00:00Z', duration_s: 3900,
  session_entries: EXS.flatMap((name, ei) => [0, 1, 2].map(si => ({ exercise_name: name, set_order: ei * 1000 + si, kg: 20 + ei * 5 + bump, reps: 8 + ((si + bump * 2) % 3), secs: 0 }))) });
const sessions = [mkSess('s1', 7, 0), mkSess('s2', 2, 2.5)];

const rows = rs => (r, J, i) => i.m === 'GET' ? J(i.one ? (rs[0] || null) : rs) : undefined;
const alumnoHandlers = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Martina Prueba', coach_id: null }; return J(i.one ? me : [me]); },
  '/sessions': rows(sessions),
};
const coachHandlers = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
    if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Juan Ignacio de la Torre Santamaría', email: LONG_MAIL }]); return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  '/rpc/my_clients_emails': (r, J) => J([{ id: A1, email: LONG_MAIL }]),
};

// Sin scroll de costado.
// Tocar con un aviso claro si no aparece.
const tap = (p, sel) => p.click(sel, { timeout: 5000 }).catch(() => { throw new Error('no aparece ' + sel); });

const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

export default async function ({ base, t }){
  for (const vp of SIZES){
    const W = vp.width + 'px: ';

    // ---- Alumno: Entreno, Progreso → Historial y Comida → Agregar ----
    {
      const { p, errs, close } = await newPage({ user: ALUMNO, viewport: vp, touch: true, handlers: alumnoHandlers,
        state: { days, sessions: [], weights: [], daily: {}, calTarget: 2000 } });
      await p.goto(base + '/app/'); await wait(2500);
      await p.evaluate(() => document.fonts.ready);

      // Entreno: «reps» (si se ve) termina antes de la meta; el número tampoco se mete debajo.
      const sets = await p.evaluate(() => [...document.querySelectorAll('.set:not(.timed)')].map(s => {
        const g = s.querySelector('.goal'), f = s.querySelectorAll('.field')[1];
        if (!g || !f) return null;
        const u = f.querySelector('.unit'), inp = f.querySelector('input');
        const shown = u && getComputedStyle(u).display !== 'none';
        return { goal: g.getBoundingClientRect().left, unit: shown ? u.getBoundingClientRect().right : null, input: inp.getBoundingClientRect().right,
          aria: inp.getAttribute('aria-label') };
      }).filter(Boolean));
      t.ok(sets.length >= 12, W + 'se ven las series con meta (' + sets.length + ')');
      const tapadas = sets.filter(s => (s.unit != null && s.unit > s.goal + 0.5) || s.input > s.goal + 0.5).length;
      t.eq(tapadas, 0, W + 'series con «reps» o el número tapados por la meta');
      t.ok(sets.every(s => /^Repeticiones, serie \d+$/.test(s.aria || '')), W + 'el campo de reps dice qué es para el lector de pantalla');
      if (vp.width >= 360) t.ok(sets.every(s => s.unit != null), W + 'desde 360 se sigue viendo «reps»');

      // Progreso → Historial: el entreno abierto, comparado con la vez pasada.
      await tap(p, '#nav-progreso'); await wait(500);
      await tap(p, '[data-action="psec-open"][data-v="historial"]'); await wait(800);
      const h = await p.evaluate(() => {
        const cells = [...document.querySelectorAll('.sc-row:not(.sc-head) .sc-now, .sc-row:not(.sc-head) .sc-prev')];
        const cut = cells.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
        // Texto de cada celda contra la celda de al lado (que no se encimen).
        const textBox = e => { const r = document.createRange(); r.selectNodeContents(e); const rs = [...r.getClientRects()]; return rs.length ? { l: Math.min(...rs.map(x => x.left)), r: Math.max(...rs.map(x => x.right)) } : null; };
        const pisadas = [];
        document.querySelectorAll('.sc-row').forEach(row => { const k = [...row.children]; for (let i = 1; i + 1 < k.length; i++){ const a = textBox(k[i]), b = k[i + 1].getBoundingClientRect(); if (a && a.r > b.left + 0.5) pisadas.push(k[i].textContent + ' / ' + k[i + 1].textContent); } });
        const acts = document.querySelector('.sess-acts'), main = document.querySelector('.sess-main'), body = document.querySelector('.sess-body'), item = document.querySelector('.sess-det-wrap');
        const ra = acts && acts.getBoundingClientRect(), rm = main && main.getBoundingClientRect(), rb = body && body.getBoundingClientRect(), ri = item && item.getBoundingClientRect();
        return { cells: cells.length, cut, pisadas, actsOk: !!(ra && rm && (ra.left >= rm.right - 0.5 || ra.top >= rm.bottom - 0.5)),
          actsIn: !!(ra && ri && ra.right <= ri.right + 0.5 && ra.top >= ri.top - 0.5), bodyW: rb && ri ? Math.round(ri.right - rb.right) : null };
      });
      t.ok(h.cells >= 12, W + 'historial: se ven las series comparadas (' + h.cells + ')');
      t.eq(h.cut, [], W + 'historial: números cortados');
      t.eq(h.pisadas, [], W + 'historial: columnas encimadas');
      t.ok(h.actsOk && h.actsIn, W + 'historial: Editar/Borrar quedan dentro de la tarjeta sin tapar la fecha');
      t.ok(h.bodyW != null && h.bodyW < 30, W + 'historial: el entreno abierto usa todo el ancho (sobran ' + h.bodyW + ' px a la derecha)');
      t.ok(await noHScroll(p), W + 'historial: sin scroll de costado');

      // Comida → Agregar.
      await tap(p, '#nav-comida'); await wait(400);
      await tap(p, '[data-action="search-open"]'); await wait(500);
      const s = await p.evaluate(() => {
        const h = document.querySelector('.search-sheet .ss-head'), sh = document.querySelector('.search-sheet');
        const tt = h.querySelector('.sheet-title').getBoundingClientRect(), x = h.querySelector('.ss-x').getBoundingClientRect();
        const chips = [...sh.querySelectorAll('.meal-chip')];
        return { h: h.getBoundingClientRect().height, sameRow: Math.abs((tt.top + tt.bottom) / 2 - (x.top + x.bottom) / 2) < 8, xRight: x.left > tt.right,
          n: chips.length, cut: chips.filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent),
          out: chips.filter(c => c.getBoundingClientRect().right > sh.getBoundingClientRect().right + 0.5).map(c => c.textContent) };
      });
      t.ok(s.sameRow && s.xRight, W + 'Agregar: el título y la ✕ van en la misma fila');
      t.ok(s.h < 50, W + 'Agregar: la cabecera no ocupa de más (' + Math.round(s.h) + ' px)');
      t.ok(s.n >= 4, W + 'Agregar: se ven los botones de comida');
      t.eq(s.cut, [], W + 'Agregar: botones de comida cortados');
      t.eq(s.out, [], W + 'Agregar: botones de comida afuera de la hoja');
      t.ok(await noHScroll(p), W + 'Agregar: sin scroll de costado');

      t.eq(errs, [], W + 'errores de la página (alumno)');
      await close();
    }

    // ---- Coach: lista de clientes, plan alimenticio y preguntas ----
    {
      const { p, errs, close } = await newPage({ user: COACH, viewport: vp, touch: true, handlers: coachHandlers });
      await p.goto(base + '/app/'); await wait(3000);
      await p.evaluate(() => document.fonts.ready);

      const m = await p.evaluate(() => {
        const e = document.querySelector('.co-trow:not(.co-thead) .co-td-email'), row = e && e.closest('.co-trow'), arrow = row && row.querySelector('.co-arrow');
        if (!e) return null;
        const r = document.createRange(); r.selectNodeContents(e); const right = Math.max(...[...r.getClientRects()].map(x => x.right));
        return { txt: e.textContent, right, cell: e.getBoundingClientRect().right, arrow: arrow ? arrow.getBoundingClientRect().left : 9999, row: row.getBoundingClientRect().right };
      });
      t.ok(m && m.txt === LONG_MAIL, W + 'clientes: se ve el mail');
      if (m) t.ok(m.right <= m.cell + 0.5 && m.right <= m.arrow && m.right <= m.row, W + 'clientes: el mail largo queda dentro de la fila (termina en ' + Math.round(m.right) + ', celda ' + Math.round(m.cell) + ', flecha ' + Math.round(m.arrow) + ')');
      t.ok(await noHScroll(p), W + 'clientes: sin scroll de costado');

      // Preguntas: el tipo de respuesta se lee entero.
      await tap(p, '.co-q-btn'); await wait(900);
      const q = await p.evaluate(() => {
        const sels = [...document.querySelectorAll('select.cq-type')];
        const c = document.createElement('canvas').getContext('2d');
        return sels.map(s => { const cs = getComputedStyle(s); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
          const need = Math.max(c.measureText('Elegir una opción').width, c.measureText('Respuesta libre').width);
          // 18 px para la flechita del select.
          const room = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 18;
          const item = s.closest('.cq-item').getBoundingClientRect();
          const btnsOut = [...s.closest('.cq-row').querySelectorAll('.cq-btn')].some(b => b.getBoundingClientRect().right > item.right + 0.5);
          return { need: Math.ceil(need), room: Math.floor(room), btnsOut }; });
      });
      t.ok(q.length > 0, W + 'preguntas: se ve el editor');
      t.ok(q.every(x => x.room >= x.need), W + 'preguntas: el tipo de respuesta entra en el select ' + JSON.stringify(q[0]));
      t.ok(q.every(x => !x.btnsOut), W + 'preguntas: ↑ ↓ ✕ dentro de la tarjeta');
      t.ok(await noHScroll(p), W + 'preguntas: sin scroll de costado');
      await p.goto(base + '/app/'); await wait(3000);

      // Ficha → Plan alimenticio: la grilla de tarjetas no pasa el borde.
      await tap(p, `[data-coach="open"][data-id="${A1}"]`); await wait(1500);
      await tap(p, '[data-coach="client-tab"][data-t="plan"]'); await wait(800);
      const g = await p.evaluate(() => {
        const g = document.querySelector('#coachHost .ptiles'); if (!g) return null;
        const save = document.querySelector('[data-coach="plan-save"]');
        const lim = (save ? save.getBoundingClientRect().right : g.getBoundingClientRect().right) + 0.5;
        return { sw: g.scrollWidth, cw: g.clientWidth, out: [...g.querySelectorAll('.ptile')].filter(e => e.getBoundingClientRect().right > lim).map(e => e.textContent.trim().slice(0, 30)) };
      });
      t.ok(g, W + 'plan: se ven las tarjetas');
      if (g){ t.ok(g.sw <= g.cw, W + 'plan: la grilla entra en su lugar (' + g.sw + '/' + g.cw + ')'); t.eq(g.out, [], W + 'plan: tarjetas que pasan el borde'); }
      t.ok(await noHScroll(p), W + 'plan: sin scroll de costado');

      t.eq(errs, [], W + 'errores de la página (coach)');
      await close();
    }
  }

  // ---- Mi plan → Pautas: agua y sal con su unidad (si el coach escribió texto, queda igual) ----
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, viewport: SIZES[1], handlers: alumnoHandlers, state: { days, sessions: [] } });
    await p.goto(base + '/app/'); await wait(1500);
    const r = await p.evaluate(async () => {
      const { planSections } = await import('/app/screens/checkin.js');
      const txt = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); };
      return [txt(planSections({ water: '3', salt: '5' }).ws), txt(planSections({ water: '2,5 ', salt: '' }).ws), txt(planSections({ water: '3 litros por día', salt: 'Moderada' }).ws)];
    });
    t.has(r[0], '💧 3 L de agua por día', 'Mi plan: agua con unidad');
    t.has(r[0], '🧂 5 g de sal por día', 'Mi plan: sal con unidad');
    t.has(r[1], '💧 2,5 L de agua por día', 'Mi plan: agua con coma decimal');
    t.eq(r[2], '💧 3 litros por día🧂 Moderada', 'Mi plan: si el coach escribió texto, queda como está');
    t.eq(errs, [], 'errores de la página (Mi plan)');
    await close();
  }
}
