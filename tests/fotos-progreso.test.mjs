// Fotos de progreso: ya no existen en la app (se borraron, ver supabase/borrar-fotos-progreso.sql).
// Aunque la base todavía devuelva filas de checkin_photos, el Check-in no las pide ni las
// muestra, y ni al abrir la app ni al eliminar la cuenta se toca el bucket «checkins».
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

// Pedidos a Storage del bucket «checkins» (list, sign, borrar, subir). La tabla checkins
// (las respuestas del check-in semanal, /rest/v1/checkins) sigue en uso y no cuenta.
const PHOTO_REQ = c => /\/checkin_photos\b/.test(c) || /\/storage\/v1\/.*\bcheckins\b/.test(c);

export default async function ({ base, t }){
  const photoRows = [{ id: 'ph1', client_id: ALUMNO.id, path: ALUMNO.id + '/1700000000000.jpg', taken_on: '2026-09-01', created_at: '2026-09-01T12:00:00Z' }];
  const { p, errs, calls, close } = await newPage({ user: ALUMNO,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: {
      '/profiles': profile('client'),
      '/checkin_photos': (r, J, i) => J(i.one ? photoRows[0] : photoRows),
      '/object/sign/checkins': (r, J) => J([{ path: photoRows[0].path, signedURL: '/object/sign/checkins/x?token=t', signedUrl: 'https://wegptuzhsrwppbknqstf.supabase.co/storage/v1/object/sign/checkins/x?token=t' }]),
      '/object/list/checkins': (r, J) => J([{ id: 'o1', name: '1700000000000.jpg' }]),
    } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-progreso'); await wait(300);
  await p.click('[data-action="psec-open"][data-v="checkin"]'); await wait(400);
  t.has(await text(p, '.form-title'), 'Check-in semanal', 'se abre el Check-in semanal');
  const ci = await text(p, '.psec');
  t.ok(!/fotos? de progreso/i.test(ci), 'el Check-in no habla de fotos de progreso: ' + ci);
  const shown = await p.evaluate(() => ({ imgs: document.querySelectorAll('.psec img').length, del: document.querySelectorAll('[data-action="photo-del"]').length, file: document.querySelectorAll('.psec input[type="file"]').length }));
  t.eq(shown, { imgs: 0, del: 0, file: 0 }, 'el Check-in no muestra, ni borra, ni pide fotos');
  t.eq(calls.filter(PHOTO_REQ), [], 'al abrir la app no se pide nada de fotos de progreso');

  // Eliminar la cuenta: se borran los archivos de los otros buckets, pero el de las fotos de
  // progreso ya no se lista (quedó vacío y sin permisos).
  await p.click('#nav-config'); await wait(500);
  p.dialogAnswer = 'ELIMINAR';
  await p.click('[data-action="cfg-delete-account"]'); await wait(2500);
  t.ok(calls.some(c => /\/rpc\/delete_own_account$/.test(c)), 'se elimina la cuenta: ' + calls.filter(c => /rpc|storage/.test(c)).join(' | '));
  t.ok(calls.some(c => /\/storage\/v1\/object\/list\/avatars$/.test(c)), 'se siguen borrando las fotos de perfil');
  t.eq(calls.filter(PHOTO_REQ), [], 'al eliminar la cuenta no se toca el bucket de fotos de progreso');
  t.eq(errs, [], 'errores de la página');
  await close();
}
