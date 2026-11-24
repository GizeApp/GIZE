// supabase/tienda-rutinas.sql con un Postgres de verdad (tests/pg/README.md; sin Postgres se saltea).
// Mis rutinas y quién puede qué:
//   · El alumno con coach mira la Tienda y agrega a Mis rutinas, pero no publica ni usa una mientras
//     tenga coach; al dejarlo (coach_id null), sí la usa.
//   · Agregar guarda una copia en Mis rutinas (una vez: cuenta una sola vez); si el creador la saca de
//     la Tienda, la copia queda.
//   · No se publica lo ajeno: días con «origen» (de la Tienda o del coach), una rutina igual a otra
//     publicada (aunque cambien el orden y las mayúsculas) ni dos veces la propia.
//   · «Tu rutina anterior»: la propia tal cual, sin repetir la misma, hasta 5; la ajena o vacía, no.
//   · Cada uno toca solo sus Mis rutinas; nadie lee la tabla directo; sin sesión, nada.
//   · Volver a correr el archivo no repone lo borrado; la primera vez pasa las que ya se habían agregado.
import { conPg, lit } from './pg.mjs';

const U = { A: 'c7000000-0000-4000-8000-00000000000a', B: 'c7000000-0000-4000-8000-00000000000b',
  K: 'c7000000-0000-4000-8000-00000000000c', C: 'c7000000-0000-4000-8000-00000000000d' };
const serie = id => ({ id, kg: '80', reps: '8', done: true, target: '8-12' });
const ej = (id, name) => ({ id, name, mus: 'pecho', note: 'nota', sets: [serie(id + 's')] });
const D1 = [{ id: 'd1', name: 'Día A', note: 'mía', exercises: [ej('e1', 'Press de banca'), ej('e2', 'Remo con barra')] },
  { id: 'd2', name: 'Día B', exercises: [ej('e3', 'Sentadilla libre')] }];
// La misma rutina con otro orden de días y de ejercicios, y otras mayúsculas.
const D1_COPIA = [{ id: 'x2', name: 'Piernas', exercises: [ej('y3', 'SENTADILLA  libre')] },
  { id: 'x1', name: 'Torso', exercises: [ej('y2', 'remo con barra'), ej('y1', 'Press de Banca')] }];
const propia = n => [{ id: 'p' + n, name: 'Mía ' + n, exercises: [ej('q' + n, 'Ejercicio ' + n)] }];
const J = v => lit(JSON.stringify(v)) + '::jsonb';
// Para las funciones que no devuelven nada (void): así prueba.hacer recibe un jsonb.
const vacio = q => 'with x as (' + q + ') select \x27true\x27::jsonb from x';

export default async ({ t }) => {
  const h = await conPg(t); if (!h) return;
  const db = await h.nueva('gize_sin');
  try {
    await db.sql(`
      insert into auth.users (id, email, raw_user_meta_data) values
        ('${U.A}', 'autora@ejemplo.test', '{"full_name":"Autora Prueba"}'),
        ('${U.B}', 'otro@ejemplo.test', '{"full_name":"Otro Prueba"}'),
        ('${U.K}', 'coach@ejemplo.test', '{"full_name":"Coach Prueba","role":"coach"}'),
        ('${U.C}', 'alumno@ejemplo.test', '{"full_name":"Alumno Prueba"}');
      update public.profiles set coach_id = '${U.K}' where id = '${U.C}';`);
    // Corre q como quien (queda lo que cambia): { ok } o { error, msg }.
    const como = (quien, q) => db.json(`select prueba.hacer(${lit(quien)}, ${lit(q)});`);
    const pub = (quien, titulo, days) => como(quien, `select public.tienda_publicar(${lit(titulo)}, '', 'Principiante', 'Fuerza', ${J(days)})`);

    // Publicar.
    const r1 = await pub(U.A, 'Fuerza A', D1);
    t.ok(r1.ok && r1.ok.id, 'la autora publica: ' + JSON.stringify(r1));
    const R1 = r1.ok && r1.ok.id;
    t.ok(/Ya publicaste esta rutina/.test((await pub(U.A, 'Otra vez', D1)).msg || ''), 'la misma rutina dos veces: no');
    t.ok(/otra persona de la Tienda/.test((await pub(U.B, 'Copiada', D1_COPIA)).msg || ''), 'una copia (otro orden y mayúsculas) de otra persona: no');
    t.ok(/Solo podés publicar una rutina armada por vos/.test((await pub(U.B, 'Del coach', [{ ...propia(1)[0], origen: 'coach' }])).msg || ''), 'días marcados como del coach: no');
    t.ok(/Solo podés publicar una rutina armada por vos/.test((await pub(U.B, 'De la Tienda', [{ ...propia(1)[0], origen: 'tienda' }])).msg || ''), 'días marcados como de la Tienda: no');
    t.ok(/no la podés publicar/.test((await pub(U.C, 'Con coach', propia(9))).msg || ''), 'el alumno con coach no publica');

    // El alumno con coach mira y agrega, pero no usa.
    t.ok(Array.isArray((await como(U.C, 'select public.tienda_listar()')).ok), 'con coach: ve la lista');
    const a1 = await como(U.C, `select public.tienda_agregar('${R1}')`);
    t.ok(a1.ok && a1.ok.id && a1.ok.origen === 'tienda' && a1.ok.titulo === 'Fuerza A' && a1.ok.autor === 'Autora Prueba', 'con coach: agrega a Mis rutinas: ' + JSON.stringify(a1));
    const a2 = await como(U.C, `select public.tienda_agregar('${R1}')`);
    t.eq(a2.ok && a2.ok.id, a1.ok && a1.ok.id, 'agregar dos veces: la misma de Mis rutinas');
    t.eq((await db.json(`select to_jsonb(agregadas) from public.tienda_rutinas where id = '${R1}';`)), 1, 'cuenta una sola vez');
    t.eq((await como(U.C, `select public.tienda_detalle('${R1}')`)).ok.agregue, true, 'figura como agregada');
    const M = a1.ok && a1.ok.id;
    t.ok(/dejar a tu coach/.test((await como(U.C, `select public.tienda_usar('${M}')`)).msg || ''), 'con coach: no la usa');
    await como(U.C, `update public.profiles set coach_id = null where id = '${U.C}'`);
    const u1 = await como(U.C, `select public.tienda_usar('${M}')`);
    t.ok(u1.ok && Array.isArray(u1.ok.days) && u1.ok.days.length === 2, 'ya sin coach: la usa (vienen los días)');
    t.ok(u1.ok && JSON.stringify(u1.ok.days).indexOf('"80"') < 0 && JSON.stringify(u1.ok.days).indexOf('nota') < 0, 'los días de la Tienda vienen sin kilos ni notas');
    t.ok(u1.ok && u1.ok.usada, 'anota cuándo la usó');
    // Habiéndola agregado, tampoco la publica como suya.
    t.ok(/otra persona de la Tienda/.test((await pub(U.C, 'Mía', u1.ok ? u1.ok.days : D1)).msg || ''), 'la que agregó de la Tienda no la publica como suya');

    // Si la creadora la saca, la copia queda.
    await como(U.B, `select public.tienda_agregar('${R1}')`);
    await como(U.A, vacio(`select public.tienda_despublicar('${R1}')`));
    const misB = (await como(U.B, 'select public.tienda_mis()')).ok || [];
    t.ok(misB.length === 1 && misB[0].rutina_id === null && misB[0].titulo === 'Fuerza A', 'sacada de la Tienda: queda en Mis rutinas de quien la agregó');
    t.ok((await como(U.B, `select public.tienda_usar('${misB[0] && misB[0].id}')`)).ok, 'y la puede seguir usando');

    // Tu rutina anterior.
    const ant = d => como(U.B, `select public.tienda_guardar_anterior(${J(d)})`);
    const g1 = await ant(D1);
    t.ok(g1.ok && g1.ok.origen === 'anterior' && g1.ok.titulo === 'Tu rutina anterior', 'guarda la anterior: ' + JSON.stringify(g1));
    t.eq(await db.json(`select days->0->'exercises'->0->'sets'->0->'kg' from public.tienda_mis_rutinas where id = '${g1.ok && g1.ok.id}';`), '80', 'la anterior queda tal cual (con sus kilos)');
    await ant(D1);
    const cuantasAnt = () => db.json(`select to_jsonb(count(*)) from public.tienda_mis_rutinas where user_id = '${U.B}' and origen = 'anterior';`);
    t.eq(await cuantasAnt(), 1, 'la misma anterior no se repite');
    t.eq((await ant([{ ...propia(2)[0], origen: 'coach' }])).ok, null, 'la del coach no se guarda');
    t.eq((await ant([{ id: 'v', name: 'Vacío', exercises: [] }])).ok, null, 'una vacía no se guarda');
    for (let i = 3; i <= 8; i++) await ant(propia(i));
    t.eq(await cuantasAnt(), 5, 'quedan las últimas 5 anteriores');

    // Cada uno lo suyo.
    const unaDeB = (misB[0] || {}).id;
    t.ok((await como(U.A, vacio(`select public.tienda_mis_borrar('${unaDeB}')`))).error, 'no se borra la de otra persona');
    t.ok((await como(U.A, `select public.tienda_usar('${unaDeB}')`)).error, 'no se usa la de otra persona');
    t.eq((await como(U.A, 'select public.tienda_mis()')).ok, [], 'cada uno ve solo las suyas');
    t.eq((await como(U.B, `select to_jsonb(count(*)) from public.tienda_mis_rutinas`)).error, '42501', 'nadie lee la tabla directo');
    t.ok((await como('anon', 'select public.tienda_mis()')).error, 'sin sesión: nada');
    t.ok((await como(U.B, vacio(`select public.tienda_mis_borrar('${unaDeB}')`))).ok !== undefined, 'borra la suya');
    t.eq(((await como(U.B, 'select public.tienda_mis()')).ok || []).some(m => m.id === unaDeB), false, 'borrada: ya no está');

    // Volver a correr el archivo no repone lo borrado.
    await db.archivo('supabase/tienda-rutinas.sql');
    t.eq(((await como(U.B, 'select public.tienda_mis()')).ok || []).some(m => m.origen === 'tienda'), false, 'volver a correr el archivo: no repone lo borrado');

    // La primera vez, pasa a Mis rutinas lo que ya se había agregado (antes se cargaba directo en Entreno).
    const r2 = await pub(U.A, 'Para migrar', propia(20));
    await db.sql(`drop table public.tienda_mis_rutinas cascade;
      insert into public.tienda_agregadas (rutina_id, user_id) values ('${r2.ok && r2.ok.id}', '${U.B}');`);
    await db.archivo('supabase/tienda-rutinas.sql');
    const mig = (await como(U.B, 'select public.tienda_mis()')).ok || [];
    t.ok(mig.some(m => m.titulo === 'Para migrar' && m.origen === 'tienda'), 'la primera vez pasa las agregadas a Mis rutinas: ' + JSON.stringify(mig.map(m => m.titulo)));
  } finally {
    await db.borrar();
  }
};
