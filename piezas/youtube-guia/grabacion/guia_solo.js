// Guía · plan gratuito (usuario sin coach). Cada escena con sus marcas de explicación.
const path = require('path');
const { start } = require('./lib');
const mock = require('./mock_solo');

(async () => {
  const A = await start({ mock, out: path.join(__dirname, 'frames', 'solo'), extraCss: '.ex-note,.daynotes{display:none!important}' });
  const { mark, wait, tap, point, type, select, scrollTo, scrollToSel, quiet, scene } = A;
  const nav = v => tap('#nav-' + v, 0, { after: 900 });
  const closeSec = () => quiet(async () => { await scrollTo(0, 10); await A.page.evaluate(() => { const b = document.querySelector('[data-action="psec-close"]'); b && b.click(); }); await wait(500); });

  await scene('rutina', async () => {
    mark('Tu rutina viene armada por días.'); await wait(2200);
    mark('Cambiás de día con las pestañas de arriba.'); await tap('[data-action="tab"]', 1, { after: 1400 }); await tap('[data-action="tab"]', 2, { after: 1400 });
    await tap('[data-action="tab"]', 0, { after: 900 });
    mark('Cada ejercicio trae sus series, repeticiones objetivo y RIR.'); await scrollToSel('.ex-prog', 260, 1600); await wait(2400);
    await scrollTo(0, 1200); await wait(600);
  });
  await scene('entrenar', async () => {
    mark('«Iniciar entrenamiento» pone en marcha el reloj de la sesión.'); await wait(900); await tap('[data-action="wk-start"]', 0, { after: 1600 });
    mark('Ves lo que hiciste la vez pasada, serie por serie.'); await scrollToSel('.ex-prog', 150, 1300); await wait(2200);
    mark('Y GIZE te sugiere cómo progresar hoy.'); await wait(2200);
    mark('Anotás el peso y las repeticiones de cada serie.'); await type('[data-action="kg"]', '16,5'); await type('[data-action="reps"]', '13'); await wait(900);
    mark('Con «Usar», completás las series con la sugerencia.'); await tap('[data-action="sug-use"]', 0, { after: 2200 });
  });
  await scene('descanso', async () => {
    await scrollToSel('[data-action="rest-from-ex"]', 460, 1300);
    mark('Al terminar una serie, iniciás el descanso con un toque.'); await tap('[data-action="rest-from-ex"]', 0, { after: 1500 });
    mark('Abajo queda la cuenta regresiva mientras seguís en la app.'); await wait(2600);
    mark('Cada ejercicio tiene su propio tiempo de descanso, y lo podés cambiar.'); await point('[data-action="rest-edit"]', 0, 1800);
    await quiet(async () => { await A.page.evaluate(() => { const b = document.querySelector('[data-action="rest-stop"]'); b && b.click(); }); });
    await wait(600);
  });
  await scene('ejercicios', async () => {
    mark('¿La máquina está ocupada? Cambiás el ejercicio por otro parecido.'); await scrollToSel('[data-action="ex-swap"]', 240, 1000); await tap('[data-action="ex-swap"]', 0, { after: 2600 });
    await quiet(async () => { await A.page.keyboard.press('Escape'); await A.page.evaluate(() => { const b = document.querySelector('[data-action="ex-cancel"], .sheet-bg'); b && b.click(); }); await wait(700); });
    mark('También podés agregar ejercicios, buscando por músculo.'); await scrollToSel('[data-action="ex-add-open"]', 420, 1600); await tap('[data-action="ex-add-open"]', 0, { after: 1500 });
    await tap('[data-action="ex-cat"]', 2, { after: 2200 });
    await quiet(async () => { await A.page.evaluate(() => { const b = document.querySelector('[data-action="ex-cancel"]'); b && b.click(); }); await wait(600); });
    mark('Y unir dos ejercicios en una superserie.'); await scrollToSel('[data-action="ss-toggle"]', 420, 1300); await point('[data-action="ss-toggle"]', 0, 2000);
  });
  await scene('finalizar', async () => {
    await scrollTo(0, 1400);
    mark('Cuando terminás, «Finalizar» guarda el entreno.'); await tap('[data-action="save-session"]', 0, { after: 1800 });
    mark('Y te muestra el resumen: tiempo, ejercicios y series.'); await wait(3200);
    await tap('[data-action="fb-skip"]', 0, { after: 900 });
  });
  await quiet(async () => { await A.page.evaluate(() => { document.querySelector('[data-action="fb-skip"]')?.click(); }); await wait(600); await scrollTo(0, 10); });
  await scene('progreso', async () => {
    await nav('progreso');
    mark('En Progreso tenés todo tu historial, ordenado en secciones.'); await wait(2600);
    mark('Evolución de cargas: el peso máximo de cada sesión.'); await tap('[data-action="psec-open"][data-v="cargas"]', 0, { after: 1600 });
    mark('Elegís el ejercicio y ves cómo sube la curva.'); await select('[data-action="load-ex"]', 2); await wait(2000);
    mark('Con el detalle de cada sesión, serie por serie.'); await scrollToSel('.psec', -380, 1600); await wait(2000);
  });
  await closeSec();
  await scene('peso', async () => {
    mark('Peso corporal: registrás tu peso del día.'); await tap('[data-action="psec-open"][data-v="peso"]', 0, { after: 1300 });
    await type('[data-action="wkg-field"]', '77,4'); await tap('[data-action="weight-save"]', 0, { after: 1500 });
    mark('Y ves el gráfico y el promedio de cada semana.'); await scrollTo(420, 1800); await wait(2400);
  });
  await closeSec();
  await scene('registro', async () => {
    mark('Registro de hoy: cómo dormiste, cómo entrenaste y cómo te sentís.'); await tap('[data-action="psec-open"][data-v="registro"]', 0, { after: 1800 });
    await tap('[data-action="daily-set"]', 1, { after: 700 }); await tap('[data-action="daily-set"]', 6, { after: 700 });
    mark('Te lleva menos de un minuto por día.'); await scrollTo(380, 1600); await wait(1800);
  });
  await closeSec();
  await scene('checkin', async () => {
    mark('Check-in semanal: un repaso corto de tu semana.'); await tap('[data-action="psec-open"][data-v="checkin"]', 0, { after: 1400 });
    await tap('[data-action="ci-open"]', 0, { after: 1600 });
    mark('Respondés unas preguntas sobre entreno, descanso y comida.'); await scrollTo(420, 2000); await wait(1600);
    await quiet(async () => { await A.page.evaluate(() => document.querySelector('[data-action="ci-close"]')?.click()); await wait(500); });
  });
  await closeSec();
  await scene('historial', async () => {
    mark('Historial de entrenos: cada sesión que guardaste.'); await tap('[data-action="psec-open"][data-v="historial"]', 0, { after: 2000 });
    await scrollTo(300, 1600);
    mark('Si te equivocaste en una serie, la corregís.'); await tap('[data-action="session-edit"]', 0, { after: 2400 });
    await quiet(async () => { await A.page.evaluate(() => { const b = document.querySelector('[data-action="se-cancel"]'); b && b.click(); }); await wait(700); });
  });
  await closeSec();
  await scene('volumen', async () => {
    mark('Volumen semanal: cuántas series hacés por músculo.'); await tap('[data-action="psec-open"][data-v="volumen"]', 0, { after: 2600 });
    mark('Te ayuda a que ningún grupo quede atrás.'); await scrollTo(200, 1400); await wait(1800);
  });
  await closeSec();
  await scene('meta', async () => {
    await nav('comida');
    mark('En Comida, primero configurás tu meta.'); await tap('[data-action="cal-open"]', 0, { after: 1000 });
    mark('Cargás tus datos, tu actividad y tu objetivo…'); await tap('[data-action="cal-sex"][data-val="m"]');
    await type('[data-action="cal-field"][data-field="age"]', '28'); await type('[data-action="cal-field"][data-field="height"]', '178'); await type('[data-action="cal-field"][data-field="weight"]', '78');
    await tap('[data-action="cal-activity"][data-val="mod"]'); await tap('[data-action="cal-goal"][data-val="bajar"]');
    mark('…y GIZE calcula tus calorías y macros.'); await tap('[data-action="cal-calc"]', 0, { after: 2600 });
  });
  await quiet(() => scrollTo(0, 10));
  await scene('comida', async () => {
    mark('Cada día muestra tus calorías, proteína, carbos y grasas.'); await wait(2400);
    mark('Para sumar algo, buscás entre alimentos y productos argentinos.'); const t = await A.topOf('[data-action="meal-add"][data-meal="cena"]'); if (t != null) await scrollTo(Math.max(0, t - 520), 1400);
    await tap('[data-action="meal-add"][data-meal="cena"]', 0, { after: 800 });
    await A.page.type('[data-action="food-search"]', 'salmón', { delay: 110 }); await wait(1400);
    await tap('[data-action="food-pick"]', 0, { after: 1000 });
    mark('Elegís si lo pesaste crudo o cocido, y la porción.'); await tap('[data-action="portion-cook"][data-val="cocido"]', 0, { after: 900 }); await tap('[data-action="portion-step"][data-d="1"]', 0, { after: 900 });
    mark('Y se suma solo al contador.'); await tap('[data-action="portion-add"]', 0, { after: 1000 }); await scrollTo(0, 1600); await wait(1800);
  });
  await scene('escaner', async () => {
    mark('También podés escanear el código de barras del paquete…'); await point('[data-action="scan-open"]', 0, 2200);
    mark('…o crear tu propio alimento con su tabla nutricional.'); await tap('[data-action="search-open"], [data-action="food-search"]', 0, { after: 900 });
    await scrollToSel('[data-action="food-create-open"]', 500, 1000); await tap('[data-action="food-create-open"]', 0, { after: 2600 });
    await quiet(async () => { await A.page.evaluate(() => { const b = document.querySelector('[data-action="food-create-cancel"]'); b && b.click(); document.querySelector('[data-action="search-close"]')?.click(); }); await wait(600); });
  });
  await quiet(() => scrollTo(0, 10));
  await scene('dias', async () => {
    mark('Con las flechas revisás lo que comiste otros días.'); await tap('[data-action="day-prev"]', 0, { after: 1500 }); await tap('[data-action="day-prev"]', 0, { after: 1800 });
    mark('Y volvés a hoy.'); await tap('[data-action="day-next"]', 0, { after: 900 }); await tap('[data-action="day-next"]', 0, { after: 1500 });
  });
  await scene('agua', async () => {
    const t = await A.topOf('[data-action="water-add"]'); if (t != null) await scrollTo(Math.max(0, t - 500), 1400);
    mark('Llevás la cuenta del agua que tomás en el día.'); await tap('[data-action="water-add"][data-n="250"]', 0, { after: 1100 }); await tap('[data-action="water-add"][data-n="250"]', 0, { after: 1100 });
    await tap('[data-action="water-toggle"]', 0, { after: 900 }); await tap('[data-action="water-add"][data-n="500"]', 0, { after: 1800 });
  });
  await scene('habitos', async () => {
    await nav('habitos');
    mark('Hábitos: tu checklist de todos los días.'); await type('#habitInput', 'Tomar 3 L de agua'); await tap('[data-action="habit-add"]', 0, { after: 700 });
    await type('#habitInput', 'Dormir 8 horas'); await tap('[data-action="habit-add"]', 0, { after: 700 });
    await type('#habitInput', '10 minutos de movilidad'); await tap('[data-action="habit-add"]', 0, { after: 900 });
    mark('Tildás lo que vas cumpliendo y ves el avance del día.'); await tap('[data-action="habit-toggle"]', 0, { after: 900 }); await tap('[data-action="habit-toggle"]', 2, { after: 1600 });
    mark('Se reinician solos cada día.'); await wait(1600);
  });
  await scene('cardio', async () => {
    await nav('cardio');
    mark('Cardio: cronómetro para tus sesiones.'); await tap('[data-action="sw-toggle"]', 0, { after: 2600 });
    mark('Marcás vueltas o intervalos.'); await tap('[data-action="sw-lap"]', 0, { after: 1800 }); await tap('[data-action="sw-lap"]', 0, { after: 1500 });
    await quiet(async () => { await A.page.evaluate(() => { document.querySelector('[data-action="sw-toggle"]')?.click(); document.querySelector('[data-action="sw-reset"]')?.click(); }); });
    mark('O usás el temporizador para una cuenta regresiva.'); await tap('[data-action="cardio-mode"][data-mode="timer"]', 0, { after: 1200 }); await tap('[data-action="tm-toggle"]', 0, { after: 2600 });
  });
  await scene('racha', async () => {
    mark('Tu racha: los días seguidos que entraste a GIZE.'); await tap('#streakBtn', 0, { after: 2400 });
    mark('Si un día no entrás, vuelve a empezar.'); await wait(2400);
  });
  await quiet(async () => { await A.page.evaluate(() => document.querySelector('.stk-bg')?.click()); await wait(600); });
  await scene('ajustes', async () => {
    await nav('config');
    mark('En Ajustes: tu perfil, las notificaciones y el modo liviano.'); await point('[data-action="cfg-notif-toggle"]', 0, 1500); await point('[data-action="cfg-lite-toggle"]', 0, 1500);
    mark('Y si después sumás un coach, te vinculás con su código.'); await type('#joinCode, .join-row input', 'C8E2BD'); await point('[data-auth="join"]', 0, 1800);
  });
  await A.done();
})();
