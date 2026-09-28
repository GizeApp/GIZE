// Guía · lo que ve el alumno de un coach: el chat y la explicación de voz en el ejercicio.
const path = require('path');
const { start } = require('./lib');
const mock = require('./mock_alumno');

(async () => {
  const A = await start({ mock, out: path.join(__dirname, 'frames', 'coach') });
  const { mark, wait, tap, point, type, scene, quiet } = A;
  await scene('chat-alumno', async () => {
    mark('Tu alumno tiene el chat arriba, con neón azul que late si hay mensajes nuevos.'); await point('#chatBtn', 0, 1600);
    await tap('#chatBtn', 0, { after: 1800 });
    mark('Te escribe o te manda audios cuando quiera.'); await type('#chatText', 'Buenísimo, gracias. ¡Mañana te cuento!'); await tap('#chatHost [data-chat="send"]', 0, { after: 1800 });
  });
  await quiet(async () => { await A.page.evaluate(() => document.querySelector('#chatHost [data-chat="close"]')?.click()); await wait(700); });
  await scene('voz-alumno', async () => {
    mark('Y en cada ejercicio escucha tu explicación de voz.'); await point('[data-action*="audio"], .ex-audio, [class*="ex-audio"]', 0, 2000);
    await wait(1200);
  });
  await A.done();
})();
