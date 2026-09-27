// Supabase simulado para grabar la app de un usuario SIN coach (datos 100 % ficticios).
const SB = 'https://wegptuzhsrwppbknqstf.supabase.co';
const COACH = '11111111-1111-4111-8111-111111111111';
const CL = ['a1','a2','a3','a4','a5','a6'].map((s, i) => `2222222${i}-2222-4222-8222-22222222222${i}`);
const NAMES = ['Lucas Fernández', 'Sofía Martínez', 'Tomás Acosta', 'Valentina Gómez', 'Nicolás Paz', 'Camila Ruiz'];
const TODAY = new Date(); TODAY.setHours(12, 0, 0, 0);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = n => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; };

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
const EXP = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
const JWT = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ sub: CL[0], role: 'authenticated', exp: EXP, aud: 'authenticated', email: 'lucas@ejemplo.com' }) + '.firma';
const USER = { id: CL[0], aud: 'authenticated', role: 'authenticated', email: 'lucas@ejemplo.com', created_at: '2026-08-01T10:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Lucas Fernández', role: 'client' }, identities: [] };
const SESSION = { access_token: JWT, token_type: 'bearer', expires_in: 3600 * 24 * 30, expires_at: EXP, refresh_token: 'demo', user: USER };

function buildDB(defaultDays, pplDays) {
  const days = JSON.parse(JSON.stringify(defaultDays));
  // links de video en varios ejercicios (como los carga el coach)
  days.forEach(d => (d.exercises || []).forEach((e, i) => { if (i % 2 === 0) e.video = 'https://youtu.be/k7Qx2LmVb9s'; }));
  const db = {
    profiles: [{ id: COACH, full_name: 'Martina Ríos', email: 'coach@ejemplo.com', role: 'coach', coach_id: null, avatar_path: null }]
      .concat(CL.map((id, i) => ({ id, full_name: NAMES[i], email: NAMES[i].split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@ejemplo.com', role: 'client', coach_id: COACH, avatar_path: null }))),
    coach_billing: [{ coach_id: COACH, plan: 'p25', max_clients: 25, trial_ends_at: iso(daysAgo(20)), paid_until: iso(daysAgo(-25)) + 'T00:00:00Z', mp_status: 'authorized', pending_plan: null }],
    routine_templates: [
      { id: 't1', coach_id: COACH, name: 'Torso / Pierna · 4 días', days: days },
      { id: 't2', coach_id: COACH, name: 'PPL · 5 días', days: pplDays },
      { id: 't3', coach_id: COACH, name: 'Full body principiante', days: days.slice(0, 2) },
    ],
    coach_questions: [{ coach_id: COACH, daily: null, checkin: null }],
    routines: [], sessions: [], body_weights: [], daily_logs: [], checkins: [], client_info: [], blocks: [], nutrition: [],
    checkin_photos: [], coach_messages: [], client_prefs: [], food_entries: [],
  };
  const lastByClient = [0, 1, 0, 3, 9, 2];
  const nByClient = [22, 18, 31, 9, 4, 14];
  CL.forEach((id, ci) => {
    db.routines.push({ client_id: id, days: days, updated_at: iso(daysAgo(3)) });
    db.client_info.push({ client_id: id, age: 24 + ci * 3, height_cm: 165 + ci * 3, steps_goal: 10000, injuries: 'Ninguna',
      availability: '4 días / semana', stage: ['Definición', 'Volumen', 'Recomposición', 'Déficit', 'Mantenimiento', 'Volumen'][ci],
      commitment: ['Alto', 'Alto', 'Medio', 'Alto', 'Bajo', 'Medio'][ci], objective: 'Bajar grasa manteniendo la fuerza',
      block_goal: 'Progresar en reps en los básicos', structure: 'Torso / Pierna', cardio: '3 × 30 min zona 2' });
    db.blocks.push({ id: 'b' + ci, client_id: id, active: true, name: 'Meso 2 · Hipertrofia', start_date: iso(daysAgo(17 + ((TODAY.getDay() + 6) % 7))), weeks: 8, deloads: [4, 8], phase: 'Acumulación', calories: 'Déficit leve (-300 kcal)', notes: 'Priorizá la técnica y el rango completo.' });
    // sesiones: los días de la rutina alternados, con progresión
    let sid = 0;
    for (let k = 0; k < nByClient[ci]; k++) {
      const dAgo = lastByClient[ci] + Math.round(k * 2.3);
      if (dAgo > 70) break;
      const day = days[k % days.length];
      const entries = [];
      (day.exercises || []).slice(0, 6).forEach((ex, ei) => {
        const base = [9, 42, 38, 22, 45, 12, 20][ei % 7];
        const kg = Math.round((base + (nByClient[ci] - k) * 0.35) * 2) / 2;
        const nsets = (ex.sets || []).length || 3;
        for (let s = 0; s < nsets; s++) entries.push({ exercise_name: ex.name, set_order: ei * 10 + s, kg: kg - s * 2.5 > 0 ? kg - s * 2.5 : kg, reps: 12 - s * 2 + (k % 2), secs: 0 });
      });
      const dt = daysAgo(dAgo);
      db.sessions.push({ id: `${ci}-${sid++}`, client_id: id, performed_on: iso(dt), day_name: day.name, created_at: iso(dt) + 'T19:30:00Z', rpe: 8, session_entries: entries });
    }
    for (let k = 0; k < 45; k++) {
      const kg = (78 + ci * 2.4) - (45 - k) * 0.045 * (ci % 2 ? -0.6 : 1) + Math.sin(k * 1.7) * 0.35;
      db.body_weights.push({ id: `w${ci}-${k}`, client_id: id, measured_on: iso(daysAgo(44 - k)), kg: Math.round(kg * 10) / 10 });
    }
    for (let k = 0; k < 12; k++) db.daily_logs.push({ client_id: id, log_date: iso(daysAgo(k)), soreness: 'Poco', performance: k % 3 ? 'Bueno' : 'Muy bueno', motivation: 'Alta', hunger: 'Moderada', fatigue: 'Poco', sleep: 'Buena', steps: 9000 + (k * 731) % 3000, water_ml: 1500 + (k % 3) * 500, habits_done: [], comment: k === 0 ? 'Hoy me sentí muy fuerte en pierna.' : '', answers: {} });
    for (let k = 0; k < 4; k++) {
      const ws = daysAgo(7 * k + ((TODAY.getDay() + 6) % 7));
      db.checkins.push({ client_id: id, week_start: iso(ws), adherence: 9 - (k % 2), answers: {
        q1: 'Subí 2,5 kg en el press inclinado y no fallé ningún entreno.', q2: 'Progresé en casi todo. Sin molestias.', q3: 'Sí, llego descansado a cada sesión.',
        q4: 'Promedio 10.500 pasos y 3 cardios.', q5: 'Cumplí el plan, una comida libre el sábado.', q7: 'Duermo 7 h, estrés bajo.', q10: 'Sí, me veo más definido.' } });
    }
    db.nutrition.push({ client_id: id, kcal: 1820, protein: 130, carbs: 230, fat: 50, notes: '', plan: {
      trainDays: [
        { meal: 'Desayuno', time: '08:00', kcal: 520, cho: 60, fat: 15, prot: 35, note: 'Avena + claras' },
        { meal: 'Almuerzo', time: '13:00', kcal: 650, cho: 70, fat: 18, prot: 50, note: '' },
        { meal: 'Pre entreno', time: '17:30', kcal: 380, cho: 50, fat: 8, prot: 25, note: '' },
        { meal: 'Cena', time: '21:30', kcal: 750, cho: 60, fat: 29, prot: 70, note: '' } ],
      restDays: [], water: '3', salt: '5', guidelines: ['Priorizar proteína en cada comida', 'Verduras en almuerzo y cena'],
      supps: ['Creatina 5 g por día', 'Omega 3'],
      options: [{ title: 'Desayuno', opts: [{ label: 'Opción A', body: '80 g de avena\n200 ml de leche\n4 claras' }, { label: 'Opción B', body: '2 tostadas integrales\n3 huevos\n1 fruta' }] },
                { title: 'Almuerzo', opts: [{ label: 'Opción A', body: '200 g de pollo\n150 g de arroz\nEnsalada libre' }] }],
      extras: [], swaps: [{ from: '100 g de arroz', to: '120 g de papa' }, { from: '200 g de pollo', to: '220 g de merluza' }],
      cardio: { text: '3 × 30 min zona 2', items: [] }, habits: ['10.000 pasos', 'Dormir 7 h'] } });
    db.coach_messages.push({ id: 'm' + ci, client_id: id, body: 'Hoy toca pierna. Subile 2,5 kg a la sentadilla, venís muy bien.', delivered: true, created_at: daysAgo(1).toISOString() });
  });
  const F = (meal, name, grams, kcal, p, c, f) => ({ meal, name, grams, kcal, protein: p, carbs: c, fat: f, unit: 'g' });
  const DAYS = [
    [F('desayuno', 'Pan lactal blanco', 50, 132, 4.5, 24.5, 1.5), F('desayuno', 'Huevo entero', 100, 156, 12, 0.4, 11.8),
     F('almuerzo', 'Pechuga de pollo a la plancha', 200, 330, 62, 0, 7.2), F('almuerzo', 'Arroz blanco cocido', 150, 195, 4, 42, 0.5),
     F('merienda', 'Yogur griego natural', 170, 165, 17, 6, 8), F('merienda', 'Banana', 120, 107, 1.3, 27, 0.4),
     F('merienda', 'Almendras', 25, 145, 5.3, 5.4, 12.5)],
    [F('desayuno', 'Avena', 60, 227, 8, 40, 4), F('desayuno', 'Leche descremada', 250, 90, 8.5, 12.5, 0.5),
     F('almuerzo', 'Carne magra (nalga)', 180, 270, 50, 0, 7), F('almuerzo', 'Papa hervida', 250, 215, 5, 50, 0.3),
     F('merienda', 'Tostadas de arroz', 30, 115, 2.4, 24, 0.9), F('merienda', 'Queso untable light', 40, 64, 5, 2, 4),
     F('cena', 'Merluza al horno', 200, 180, 36, 0, 3), F('cena', 'Ensalada de tomate y lechuga', 200, 40, 2, 8, 0.4), F('cena', 'Aceite de oliva', 10, 88, 0, 0, 10)],
    [F('desayuno', 'Tostadas integrales', 60, 150, 7, 27, 2), F('desayuno', 'Palta', 50, 80, 1, 4, 7.5),
     F('almuerzo', 'Fideos cocidos', 200, 262, 9.6, 52, 1.8), F('almuerzo', 'Carne picada magra', 120, 186, 26, 0, 9),
     F('merienda', 'Manzana', 180, 94, 0.5, 25, 0.3), F('cena', 'Pollo al horno', 180, 297, 49, 0, 11), F('cena', 'Calabaza al horno', 200, 90, 2, 21, 0.2)],
  ];
  db.food_entries = [];
  DAYS.forEach((items, d) => items.forEach((it, i) => db.food_entries.push(Object.assign({ id: `f${d}-${i}`, client_id: CL[0], log_date: iso(daysAgo(d)), pos: i }, it))));
  db.profiles.forEach(p => { if (p.id === CL[0]) p.coach_id = null; });
  ['coach_messages', 'checkins', 'nutrition', 'blocks', 'client_info'].forEach(t => { db[t] = (db[t] || []).filter(r => r.client_id !== CL[0]); });
  return db;
}

const STATS = () => CL.map((id, i) => ({ client_id: id, n_sessions: [22, 18, 31, 9, 4, 14][i], last_session: iso(daysAgo([0, 1, 0, 3, 9, 2][i])) }));

function applyFilters(rows, params) {
  let out = rows.slice();
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(eq|neq|gte|lte|gt|lt|is|in)\.(.*)$/.exec(v); if (!m) continue;
    const [, op, raw] = m;
    const val = raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : decodeURIComponent(raw);
    out = out.filter(r => {
      const x = r[k];
      if (op === 'eq') return String(x) === String(val);
      if (op === 'neq') return String(x) !== String(val);
      if (op === 'is') return x === val || (val === null && x == null);
      if (op === 'gte') return String(x) >= String(val);
      if (op === 'lte') return String(x) <= String(val);
      if (op === 'gt') return String(x) > String(val);
      if (op === 'lt') return String(x) < String(val);
      if (op === 'in') return String(val).replace(/[()]/g, '').split(',').includes(String(x));
      return true;
    });
  }
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map(s => s.split('.'));
    out.sort((a, b) => { for (const [c, dir] of keys) { const A = a[c], B = b[c]; if (A === B) continue; const r = String(A) < String(B) ? -1 : 1; return dir === 'desc' ? -r : r; } return 0; });
  }
  const lim = params.get('limit'); if (lim) out = out.slice(0, +lim);
  return out;
}

async function install(ctx, page) {
  const { DEFAULT, PPL_DAYS } = await page.evaluate(async () => { const m = await import('/app/core/data.js'); return { DEFAULT: m.DEFAULT, PPL_DAYS: m.PPL_DAYS }; });
  const db = buildDB(DEFAULT.days, PPL_DAYS);
  await ctx.route(SB + '/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: Object.assign({ 'access-control-allow-origin': '*', 'content-range': '0-0/*' }, headers), body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (p.startsWith('/auth/v1/user')) return json(USER);
    if (p.startsWith('/auth/v1/token')) return json(SESSION);
    if (p.startsWith('/auth/v1/')) return json({});
    if (p.startsWith('/storage/v1/')) return json([]);
    if (p.startsWith('/functions/v1/')) return json({ ok: true, delivered: 1, saved: true });
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop();
      if (fn === 'my_invite_code') return json('C8E2BD');
      if (fn === 'coach_client_stats') return json(STATS());
      if (fn === 'client_push_devices') return json(1);
      if (fn === 'my_coach_name') return json(null);
      return json(null);
    }
    if (p.startsWith('/rest/v1/')) {
      const table = p.split('/').pop();
      if (req.method() !== 'GET' && req.method() !== 'HEAD') {
        let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
        return json(Array.isArray(body) ? body : [body], 201);
      }
      const rows = applyFilters(db[table] || [], url.searchParams);
      const accept = req.headers()['accept'] || '';
      if (accept.includes('vnd.pgrst.object')) return rows.length === 1 ? json(rows[0]) : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: '', hint: null }, 406);
      return json(rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
    }
    return json({});
  });
  return { SESSION, db };
}

module.exports = { install, SESSION, SB, COACH };
