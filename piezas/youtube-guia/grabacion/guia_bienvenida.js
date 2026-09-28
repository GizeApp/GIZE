// Guía · primeros pasos de un usuario nuevo sin coach: bienvenida, armar la semana y rutinas armadas.
// Se graba aparte (cuenta recién creada, sin rutina) para no tocar los datos de las demás escenas.
process.env.NUEVO = '1';
const path = require('path');
const { start } = require('./lib');
const mock = require('./mock_solo');

(async () => {
  const A = await start({ mock, out: path.join(__dirname, 'frames', 'solo'), extraCss: '.ex-note,.daynotes{display:none!important}' });
  const { mark, wait, tap, type, scene } = A;
  await scene('bienvenida', async () => {
    mark('La primera vez que entrás, GIZE te da la bienvenida.'); await wait(2200);
    await tap('[data-onb="start"]', 0, { after: 1200 });
    mark('Si tenés un coach, ponés su código. Si no, entrenás por tu cuenta.'); await wait(1400);
    await tap('[data-onb="solo"]', 0, { after: 1200 });
    mark('Elegís cómo arrancar: vacío o con una rutina armada.'); await wait(1600);
  });
  await scene('semana', async () => {
    mark('Con «Empezar vacío» armás tu semana en 3 pasos.'); await tap('[data-onb="start"][data-v="vacio"]', 0, { after: 600 }); await tap('[data-onb="next"]', 0, { after: 1200 });
    mark('Cuántos días vas a entrenar…'); await tap('[data-onb="days"][data-v="4"]', 0, { after: 900 }); await tap('[data-onb="wnext"]', 0, { after: 1100 });
    mark('…tu objetivo…'); await tap('[data-onb="goal"]', 0, { after: 900 }); await tap('[data-onb="wnext"]', 0, { after: 1100 });
    mark('…y el nombre de tu primer día. Listo, ya tenés tu semana.'); await type('#onbFirst', 'Torso'); await tap('[data-onb="wnext"]', 0, { after: 2200 });
  });
  await scene('rutinas-armadas', async () => {
    mark('¿No sabés qué hacer? Tenés rutinas armadas.'); await tap('[data-action="open-routines"]', 0, { after: 1300 });
    mark('Elegís para quién son y te muestra las que van con vos.'); await tap('[data-onb="sex"][data-v="m"]', 0, { after: 1800 });
    mark('Tocás una y queda cargada, lista para entrenar.'); await tap('[data-onb="pick"]', 0, { after: 2600 });
  });
  await A.done();
})();
