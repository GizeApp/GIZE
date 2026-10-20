// Lo común de las pruebas del panel del gimnasio (tests/gym-*.test.mjs): las personas, un gimnasio de
// prueba (Gimnasio Fuerza, con nombres inventados) y un Supabase simulado que contesta las RPC de
// supabase/gimnasios-socios.sql con la forma de la etapa 1. Cada llamada a una RPC queda anotada con lo
// que se mandó (rpcs), para revisar los parámetros.
import { newPage, wait } from './lib.mjs';

export const ID = n => 'a0000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const DUENA = { id: ID('d1'), email: 'duena@prueba.test', aud: 'authenticated', role: 'authenticated' };
export const ADMIN_G = { id: ID('a1'), email: 'admin@prueba.test', aud: 'authenticated', role: 'authenticated' };
export const PROFE = { id: ID('b1'), email: 'profe@prueba.test', aud: 'authenticated', role: 'authenticated' };
export const RECEP = { id: ID('c1'), email: 'recepcion@prueba.test', aud: 'authenticated', role: 'authenticated' };
export const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
export const ALUMNO = { id: '11111111-1111-1111-1111-111111111111', email: 'alumno@prueba.test', aud: 'authenticated', role: 'authenticated' };
export const G = ID('aaaa');
export const F = { A1: ID('f11'), A2: ID('f12'), A3: ID('f13'), A4: ID('f14'), A5: ID('f15'), A6: ID('f16'), A7: ID('f17') };
export const S = { A1: ID('11'), A2: ID('12'), A3: ID('13'), A6: ID('16'), A7: ID('17') };
export const TOKEN = 'ab'.repeat(32);

const dias = n => new Date(Date.now() + n * 864e5).toISOString();
const ymd = n => dias(n).slice(0, 10);
export const IOS = `(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; })();`;
export const ANDROID = `(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} }; })();`;
export const TEMA = t => t === 'claro' ? `try { localStorage.setItem('gize_tema', 'luz'); } catch (e) {}` : '';

export function miGimnasio(rol = 'owner', extra = {}){
  return Object.assign({
    gym: { id: G, name: 'Gimnasio Fuerza', city: 'Rosario', province: 'Santa Fe', address: 'Av. Pellegrini 1200', whatsapp: '+54 341 555-0000', contact_email: 'hola@fuerza.test', default_trainer_id: PROFE.id },
    rol, puede_crear: false, codigo: 'FUERZA22',
    settings: { recepcion_cobra: false, recepcion_altas: true, profes_recepcion: false, profes_montos: false, aprobar_solas: false, ingreso_horas: 3, profes_extra: 0 },
    plan: { estado: 'activo', vence: dias(40), pausa_profes_el: dias(45), libera_el: dias(50), plan: 'p250', seats_used: 182, max: 250, sobre_cupo: false, profes_usados: 3, profes_tope: 15 },
    contadores: { solicitudes: 2, sin_profe: 1, falta_confirmacion: 1, fotos_pendientes: 1, ingresos_hoy: 7, invitaciones: 1, aptos_vencidos: 1 },
    mis_fichas: [F.A7], mis_socios: [S.A7],
  }, extra);
}

export function socios(){
  return [
    { id: F.A1, member_id: S.A1, nombre: 'Martina Sosa', foto_path: null, avatar_path: null, estado: 'activo', paused_until: null, sin_app: false, falta_confirmacion: false, foto_pendiente: false,
      profe: { id: PROFE.id, name: 'Lucía Profe' }, coach_externo: false, share_admin: true, dni: '30111222', phone: '341 555 1111', email: 'martina@prueba.test', apto_medico_vence: ymd(90),
      joined_at: dias(-200), left_at: null, source: 'codigo', ultimo_ingreso: dias(0), ultimo_entreno: ymd(-1), app_vieja: false },
    { id: F.A2, member_id: S.A2, nombre: 'Juan Pérez', foto_path: null, avatar_path: null, estado: 'pausado', paused_until: ymd(20), sin_app: false, falta_confirmacion: false, foto_pendiente: true,
      profe: { id: PROFE.id, name: 'Lucía Profe' }, coach_externo: false, share_admin: false, dni: '28555444', phone: null, email: 'juan@prueba.test', apto_medico_vence: ymd(-3),
      joined_at: dias(-100), left_at: null, source: 'codigo', ultimo_ingreso: dias(-20), ultimo_entreno: null, app_vieja: true },
    { id: F.A3, member_id: S.A3, nombre: 'Lucía Gómez', foto_path: null, avatar_path: null, estado: 'activo', paused_until: null, sin_app: false, falta_confirmacion: false, foto_pendiente: false,
      profe: null, coach_externo: false, share_admin: false, dni: null, phone: null, email: 'lucia@prueba.test', apto_medico_vence: null,
      joined_at: dias(-30), left_at: null, source: 'codigo', ultimo_ingreso: null, ultimo_entreno: null, app_vieja: false },
    { id: F.A4, member_id: null, nombre: 'Raúl Díaz', foto_path: null, avatar_path: null, estado: 'activo', paused_until: null, sin_app: true, falta_confirmacion: false, foto_pendiente: false,
      profe: null, coach_externo: false, share_admin: false, dni: '22999888', phone: '341 555 2222', email: null, apto_medico_vence: ymd(30),
      joined_at: dias(-10), left_at: null, source: 'ficha', ultimo_ingreso: dias(-2), ultimo_entreno: null, app_vieja: false },
    { id: F.A5, member_id: ID('15'), nombre: 'Sofía Ruiz', foto_path: null, avatar_path: null, estado: 'activo', paused_until: null, sin_app: false, falta_confirmacion: false, foto_pendiente: false,
      profe: null, coach_externo: true, share_admin: false, dni: null, phone: null, email: 'sofia@prueba.test', apto_medico_vence: null,
      joined_at: dias(-60), left_at: null, source: 'codigo', ultimo_ingreso: dias(-1), ultimo_entreno: null, app_vieja: false },
    { id: F.A7, member_id: S.A7, nombre: 'Pedro Álvarez', foto_path: null, avatar_path: null, estado: 'activo', paused_until: null, sin_app: false, falta_confirmacion: true, foto_pendiente: false,
      profe: { id: DUENA.id, name: 'Carla Dueña' }, coach_externo: false, share_admin: false, dni: null, phone: null, email: 'pedro@prueba.test', apto_medico_vence: null,
      joined_at: dias(-300), left_at: null, source: 'conversion', ultimo_ingreso: null, ultimo_entreno: ymd(-3), app_vieja: false },
    { id: ID('f18'), member_id: ID('18'), nombre: 'Ana Torres', foto_path: null, avatar_path: null, estado: 'baja', paused_until: null, sin_app: false, falta_confirmacion: false, foto_pendiente: false,
      profe: null, coach_externo: false, share_admin: false, dni: null, phone: null, email: 'ana@prueba.test', apto_medico_vence: null,
      joined_at: dias(-400), left_at: dias(-40), source: 'codigo', ultimo_ingreso: dias(-45), ultimo_entreno: null, app_vieja: false },
  ];
}
export function solicitudes(){
  return [
    { id: F.A6, member_id: S.A6, nombre: 'Tomás Ríos', email: 'tomas@prueba.test', requested_at: dias(-1), via: 'codigo', terms: true, share_admin: true, foto_pend_path: null, unir_sugerida: null,
      coincidencias: [{ id: F.A4, nombre: 'Raúl Díaz', dni_fin: '888', motivo: 'nombre' }] },
    { id: ID('f19'), member_id: ID('19'), nombre: 'Elena Paz', email: 'elena@prueba.test', requested_at: dias(-2), via: 'codigo', terms: false, share_admin: false, foto_pend_path: null, unir_sugerida: null, coincidencias: [] },
  ];
}
export function equipo(){
  return [
    { user_id: DUENA.id, nombre: 'Carla Dueña', avatar_path: null, rol: 'owner', coach: true, joined_at: dias(-300), last_seen_at: dias(0), app_platform: 'web', app_version: 'web', app_vieja: false, socios: 1 },
    { user_id: ADMIN_G.id, nombre: 'Diego Admin', avatar_path: null, rol: 'admin', coach: false, joined_at: dias(-100), last_seen_at: dias(-1), app_platform: 'web', app_version: 'web', app_vieja: false, socios: 0 },
    { user_id: PROFE.id, nombre: 'Lucía Profe', avatar_path: null, rol: 'profe', coach: true, joined_at: dias(-90), last_seen_at: dias(-2), app_platform: 'android', app_version: '1.0.5 (10)', app_vieja: true, socios: 2 },
    { user_id: ID('b2'), nombre: 'Marcos Profe', avatar_path: null, rol: 'profe', coach: true, joined_at: dias(-20), last_seen_at: null, app_platform: null, app_version: null, app_vieja: false, socios: 0 },
    { user_id: RECEP.id, nombre: 'Rocío Recepción', avatar_path: null, rol: 'recepcion', coach: false, joined_at: dias(-50), last_seen_at: dias(0), app_platform: 'web', app_version: 'web', app_vieja: false, socios: 0 },
  ];
}
export const invitaciones = () => [{ id: ID('e1'), role: 'profe', created_at: dias(-1), expires_at: dias(6), invitada_por: 'Carla Dueña' }];

// Supabase simulado del gimnasio. o: { gym (lo que devuelve mi_gimnasio; null = sin gimnasio),
// rol ('coach' | 'client'), rpc: { nombre: (body) => respuesta | { error } }, perfil }.
// st.rpcs: [[nombre, body]] de cada RPC.
export function handlersGym(user, o = {}){
  const st = { rpcs: [], socios: socios(), solicitudes: solicitudes(), equipo: equipo(), invitaciones: invitaciones(), gym: o.gym === undefined ? miGimnasio() : o.gym };
  const yoP = Object.assign({ id: user.id, role: o.rol || 'coach', full_name: o.nombre || 'Carla Dueña', coach_id: null }, o.perfil || {});
  const r = (J, v) => v && v.error ? J({ code: v.error, message: v.msg || 'x', details: null, hint: null }, v.status || 400) : J(v === undefined ? null : v);
  const base = {
    mi_gimnasio: () => st.gym,
    gym_socios_resumen: () => st.socios,
    gym_solicitudes: () => st.solicitudes,
    gym_equipo: () => st.equipo,
    gym_invitaciones: () => st.invitaciones,
    gym_invitar: b => ({ id: ID('e9'), token: TOKEN, expires_at: dias(7) }),
    gym_invitacion_revocar: () => ({ ok: true }),
    gym_invitacion_info: () => ({ gym: { name: 'Gimnasio Fuerza', city: 'Rosario' }, role: 'profe', estado: 'ok' }),
    gym_aceptar_invitacion: () => ({ gym_id: G, role: 'profe', gym: { name: 'Gimnasio Fuerza' } }),
    gym_config: b => { const g = st.gym; Object.assign(g.gym, Object.fromEntries(Object.entries(b.patch).filter(([k]) => k !== 'settings'))); if (b.patch.settings) Object.assign(g.settings, b.patch.settings); return { gym: g.gym, settings: g.settings }; },
    gym_codigo_rotar: () => { st.gym.codigo = 'NUEVO234'; return { code: 'NUEVO234' }; },
    gym_exportar: b => b.tipo === 'socios' ? [{ nombre: 'Martina Sosa', dni: '30111222', estado: 'activo' }] : [],
    gym_asignar_profe: b => ({ ok: b.fichas.filter(f => f !== F.A5 && f !== F.A7), saltadas: b.fichas.filter(f => f === F.A5 || f === F.A7).map(f => ({ id: f, motivo: f === F.A5 ? 'coach_externo' : 'falta_confirmacion' })) }),
    gym_pausar: () => ({ ok: true }), gym_reactivar: () => ({ ok: true }), gym_baja: () => ({ ok: true }),
    gym_aprobar: b => ({ ok: true, id: b.unir_a_ficha || b.ficha }), gym_rechazar: () => ({ ok: true }),
    gym_ficha_crear: () => ({ id: ID('f20'), token: TOKEN, expires_at: dias(7) }),
    gym_ficha_editar: () => ({ ok: true }), gym_ficha_link: () => ({ token: TOKEN, expires_at: dias(7) }),
    gym_nota_guardar: () => ({ ok: true }), gym_foto_resolver: b => ({ foto: b.aprobar ? 'ok' : 'rechazada' }), gym_foto_staff: () => ({ foto: 'ok' }),
    gym_quitar_staff: () => ({ ok: true, reasignados: 2, sin_profe: 0, falta_confirmacion: 0 }),
    gym_cambiar_rol: b => ({ ok: true, role: b.rol }),
    gym_crear: () => ({ gym_id: G, code: 'FUERZA22' }),
    gym_cerrar: () => ({ ok: true }),
    gym_registro_lectura: () => [{ id: 'd1', client_id: S.A1, log_date: ymd(-1), sleep_h: 7, energy: 4 }],
    gym_cardio_lectura: () => [],
  };
  const fns = Object.assign({}, base, o.rpc || {});
  const handlers = {
    '/profiles': (rt, J, i) => {
      if (i.m !== 'GET') return undefined;
      if (/coach_id=eq/.test(i.url.search)) return J(o.alumnos || [{ id: S.A7, full_name: 'Pedro Álvarez', role: 'client', coach_id: user.id }]);
      return J(i.one ? yoP : [yoP]);
    },
    '/coach_billing': (rt, J, i) => { if (yoP.role !== 'coach') return J(i.one ? null : []); const b = Object.assign({ coach_id: user.id, plan: 'p250', max_clients: 250, trial_ends_at: dias(-300), paid_until: dias(40), seats_used: 182 }, o.billing || {}); return J(i.one ? b : [b]); },
    '/gym_members': (rt, J, i) => { const id = (/id=eq\.([^&]+)/.exec(i.url.search) || [])[1]; const s = st.socios.find(x => x.id === id);
      const d = s ? { id: s.id, gym_id: G, member_id: s.member_id, full_name: s.nombre, dni: s.dni, phone: s.phone, email: s.email, birthdate: null, status: s.estado, apto_medico_vence: s.apto_medico_vence,
        foto_path: s.foto_path, foto_pend_path: s.foto_pendiente ? G + '/' + s.id + '/' + ID('99') + '.jpg' : null, foto_pend_at: s.foto_pendiente ? dias(-1) : null, foto_rechazo: null } : null;
      return J(i.one ? d : (d ? [d] : [])); },
    '/gym_member_notes': (rt, J, i) => { const n = { body: 'Prefiere entrenar a la tarde', updated_at: dias(-5) }; return J(i.one ? n : [n]); },
    '/gym_entries': (rt, J, i) => J([{ at: dias(0), method: 'manual', result: 'ok' }, { at: dias(-2), method: 'manual', result: 'ok' }]),
    '/gyms': (rt, J, i) => { const g = { dpa_version: '2026-10-borrador', dpa_at: dias(-300) }; return J(i.one ? g : [g]); },
  };
  for (const k of Object.keys(fns)) handlers['/rpc/' + k] = (rt, J, i) => {
    let body = {}; try { body = JSON.parse(i.body || '{}'); } catch (e) {}
    st.rpcs.push([k, body]);
    const v = fns[k](body, st);
    if (v && v.demora) return new Promise(ok => setTimeout(ok, v.demora)).then(() => r(J, v.valor));
    return r(J, v);
  };
  return { handlers, st };
}

// Entra con esa cuenta a /app/ (o a la dirección que se pase) y espera el arranque.
export async function entrar(base, user, o = {}){
  const { handlers, st } = handlersGym(user, o);
  const init = [o.init || '', TEMA(o.tema)].join('\n');
  const pg = await newPage({ user, handlers, viewport: o.vp || { width: 1440, height: 900 }, init, touch: !!o.touch });
  await pg.p.goto(base + (o.url || '/app/'));
  await wait(o.espera || 2600);
  return Object.assign(pg, { st });
}
export const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };
export const hostTxt = p => p.evaluate(() => (document.getElementById('coachHost') || {}).innerText.replace(/\s+/g, ' ').trim());
export const modalTxt = p => p.evaluate(() => { const m = document.getElementById('gymModal'); return m ? m.innerText.replace(/\s+/g, ' ').trim() : ''; });
export const rpcs = (st, n) => st.rpcs.filter(x => x[0] === n).map(x => x[1]);
export async function ir(p, v){ await p.evaluate(v => { const b = document.querySelector('#coachHost [data-gym="ir"][data-v="' + v + '"]'); if (b) b.click(); }, v); await wait(500); }
export const sinScrollHorizontal = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('#coachHost *')].every(e => { const r = e.getBoundingClientRect(); return !r.width || r.right <= window.innerWidth + 1 || getComputedStyle(e).position === 'fixed' || e.closest('.gy-filtros, .cv-pills'); }));
// Donde van las capturas de pantalla (fuera del repo).
export const CAPTURAS = process.env.GYM_CAPTURAS || '';
export async function captura(p, nombre){
  if (!CAPTURAS) return;
  const fs = await import('node:fs');
  fs.mkdirSync(CAPTURAS, { recursive: true });
  await p.screenshot({ path: CAPTURAS + '/' + nombre + '.png', fullPage: false });
}
