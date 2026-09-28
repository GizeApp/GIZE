// Guía · panel del coach. Cada escena con sus marcas de explicación.
const path = require('path');
const { start } = require('./lib');
const mock = require('./mock');

(async () => {
  const A = await start({ mock, out: path.join(__dirname, 'frames', 'coach') });
  const { mark, wait, tap, point, type, select, scrollTo, scrollToSel, quiet, scene } = A;
  const click = sel => A.page.evaluate(s => document.querySelector(s)?.click(), sel);
  const openSec = v => tap(`[data-coach="sec-open"][data-v="${v}"]`, 0, { after: 1200 });
  const closeSec = () => quiet(async () => { await scrollTo(0, 10); await click('[data-coach="sec-close"]'); await wait(500); });
  const openPl = v => tap(`[data-coach="plsec-open"][data-v="${v}"]`, 0, { after: 1300 });
  const closePl = () => quiet(async () => { await scrollTo(0, 10); await click('[data-coach="plsec-close"]'); await wait(500); });

  await scene('panel', async () => {
    mark('Tu panel: todos tus alumnos en una lista, con su mail.'); await wait(2000);
    mark('Un globito te avisa quién te escribió.'); await point('.co-trow', 0, 1600);
    mark('Y ves su última actividad: activo, ayer, hace días.'); await scrollTo(430, 1800); await wait(1600); await scrollTo(0, 1400);
    mark('Y buscás a cualquiera por su nombre.'); await type('[data-coach="coach-search"]', 'Sof'); await wait(1600);
    await quiet(async () => { const h = await A.page.$('[data-coach="coach-search"]'); await h.fill(''); await h.dispatchEvent('input'); await wait(400); });
  });
  await scene('codigo', async () => {
    mark('Tus alumnos se suman con tu código de invitación.'); await point('.co-invite, [data-coach="copy-invite"]', 0, 1400);
    mark('Lo copiás y se lo mandás por donde quieras.'); await tap('[data-coach="copy-invite"]', 0, { after: 1800 });
    mark('Si querés, lo cambiás por uno nuevo.'); await point('[data-coach="rotate-invite"]', 0, 1800);
  });
  await scene('suscripcion', async () => {
    mark('«Mi plan»: tu suscripción y cuántos alumnos tenés.'); await tap('[data-plan="open"]', 0, { after: 2000 });
    mark('Los planes van según la cantidad de alumnos.'); await scrollTo(400, 1800); await wait(2200);
    await quiet(async () => { await scrollTo(0, 10); await click('[data-plan="close"]'); await wait(600); });
  });
  await scene('plantillas', async () => {
    mark('Tus rutinas quedan guardadas como plantillas.'); await tap('[data-coach="view-tpls"]', 0, { after: 1600 });
    mark('Las abrís y las editás día por día.'); await tap('[data-coach="tpl-open"]', 2, { after: 1500 }); await scrollTo(380, 1800); await wait(1200);
    await quiet(async () => { await scrollTo(0, 10); await click('[data-coach="tpl-back"]'); await wait(700); });
    mark('Creás nuevas o importás modelos ya armados.'); await point('[data-coach="tpl-new"]', 0, 1300); await point('[data-coach="tpl-seed"]', 0, 1500);
  });
  await quiet(async () => { await click('[data-coach="view-clients"]'); await wait(700); await scrollTo(0, 10); });
  await scene('alumno', async () => {
    mark('Tocás un alumno y se abre su ficha, en secciones.'); await tap('.co-trow[data-coach="open"]', 0, { after: 2200 });
    mark('Arriba: Ficha, Rutina y Plan alimenticio.'); await point('[data-coach="client-tab"][data-t="rutina"]', 0, 900); await point('[data-coach="client-tab"][data-t="plan"]', 0, 1200);
  });
  await scene('chat', async () => {
    mark('Chat con cada alumno: mensajes y audios, en los dos sentidos.'); await tap('[data-coach="sec-open"][data-v="chat"]', 0, { after: 2200 });
    mark('Le respondés al toque…'); await type('#chatText', 'Sí, dale: press con mancuernas, mismas series y reps.'); await tap('#chatHost [data-chat="send"]', 0, { after: 1400 });
    mark('…o le grabás un audio, y ves cuándo lo escuchó.'); await tap('#chatHost [data-chat="rec"]', 0, { after: 2600 }); await tap('#chatHost [data-chat="rec-send"]', 0, { after: 1800 });
  });
  await quiet(async () => { await click('#chatHost [data-chat="close"]'); await wait(600); });
  await scene('datos', async () => {
    mark('Ficha del cliente: datos personales, lesiones y pasos.'); await openSec('ficha'); await wait(1000);
    mark('Contexto de entrenamiento: disponibilidad, etapa y compromiso.'); await scrollTo(380, 1800); await wait(1400);
    mark('Y sus objetivos, generales y del bloque.'); await scrollTo(820, 1800); await wait(1800);
  });
  await closeSec();
  await scene('bloque', async () => {
    mark('Bloque o mesociclo: nombre, inicio, semanas y fase.'); await openSec('bloque'); await wait(1200);
    mark('La estrategia calórica y una nota para el alumno.'); await scrollToSel('.bw', 560, 1400); await wait(1400);
    mark('Marcás las semanas de descarga, y el alumno ve en qué semana está.'); await point('.bw.dl', 0, 1600); await point('.bw.now', 0, 1600);
  });
  await closeSec();
  await scene('diario', async () => {
    mark('Seguimiento diario: cómo se sintió cada día.'); await openSec('daily'); await select('select.co-select', 1); await wait(900);
    mark('Dolor, rendimiento, motivación, hambre, sueño y pasos.'); await scrollTo(380, 2000); await wait(1600);
  });
  await closeSec();
  await scene('checkin', async () => {
    mark('Check-in semanal: sus respuestas y la adherencia.'); await openSec('checkin'); await select('select.co-select', 1); await wait(900);
    await scrollTo(460, 2200); await wait(1600);
  });
  await closeSec();
  await scene('historial', async () => {
    mark('Historial de entrenos: cada sesión que registró.'); await openSec('hist'); await select('select.co-select', 1); await wait(900);
    mark('Serie por serie, comparada con la vez pasada.'); await scrollTo(360, 2000); await wait(2000);
  });
  await closeSec();
  await scene('volumen', async () => {
    mark('Volumen semanal: las series por grupo muscular.'); await openSec('volumen'); await wait(1600);
    mark('Para equilibrar la rutina de un vistazo.'); await scrollTo(200, 1400); await wait(1600);
  });
  await closeSec();
  await scene('peso', async () => {
    mark('Peso corporal: promedio de cada semana y su variación.'); await openSec('peso'); await wait(1600);
    mark('Y el registro día a día.'); await scrollTo(560, 2000); await wait(1800);
  });
  await closeSec();
  await scene('rutina', async () => {
    mark('En Rutina armás el entrenamiento de cada alumno.'); await tap('[data-coach="client-tab"][data-t="rutina"]', 0, { after: 1600 });
    mark('Organizado por días: les ponés nombre, notas y los reordenás.'); await scrollToSel('[data-coach="edit-day"]', 200, 1400); await tap('[data-coach="edit-day"]', 1, { after: 1200 }); await tap('[data-coach="edit-day"]', 0, { after: 1000 });
    await point('[data-coach="day-right"]', 0, 1200);
    mark('Y duplicás un día para no armarlo de cero.'); await point('[data-coach="day-dup"]', 0, 1800);
    mark('Cada día con su lista de ejercicios.'); await scrollToSel('.co-exc', 300, 1600); await wait(1600);
  });
  await scene('ejercicio', async () => {
    mark('Abrís un ejercicio y definís cada serie.'); await tap('.co-exc-collapsed .co-exc-cmain', 0, { after: 1400 });
    await scrollToSel('.co-exc-open .co-prow', 260, 1200);
    mark('Rango de repeticiones, peso objetivo, RIR y descanso.'); await wait(2400);
    mark('Nota para el alumno y el link al video de técnica.'); await scrollToSel('.co-exc-open details.co-exc-fold', 300, 1200);
    await tap('.co-exc-open details.co-exc-fold summary', 0, { after: 700 }); await type('.co-exc-open [data-coach="rt-video"]', 'https://youtu.be/k7Qx2LmVb9s'); await wait(1400);
    mark('Y le grabás una explicación de voz: la escucha en el ejercicio.'); await scrollToSel('.co-exc-open [data-coach="ea-rec"]', 380, 1000);
    await tap('.co-exc-open [data-coach="ea-rec"]', 0, { after: 2400 }); await tap('.co-exc-open [data-coach="ea-stop"]', 0, { after: 1600 });
  });
  await scene('progresion', async () => {
    mark('La sugerencia automática le propone el peso de la próxima serie.'); await scrollToSel('[data-coach="rt-nosug-all"]', 400, 1400); await point('[data-coach="rt-nosug-all"]', 0, 1800);
    mark('Unís ejercicios en superseries, los cambiás o insertás otros.'); await scrollToSel('[data-coach="rt-ss"]', 400, 1400); await point('[data-coach="rt-ss"]', 0, 1100); await point('[data-coach="rt-swap"]', 0, 1100);
    mark('Guardás y el alumno la ve al instante.'); await scrollToSel('[data-coach="save-routine"]', 500, 1600); await point('[data-coach="save-routine"]', 0, 1800);
  });
  await quiet(async () => { await scrollTo(0, 10); });
  await scene('programada', async () => {
    await scrollTo(0, 1000);
    mark('Rutinas programadas: dejás lista la próxima, con fecha.'); await point('[data-coach="sched-open"]', 0, 1400);
    mark('Hasta ese día sigue con la actual; ese día le cambia sola.'); await tap('[data-coach="sched-open"]', 0, { after: 700 }); await A.page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); }); await A.scrollTo(0, 10); await wait(2400); await scrollTo(300, 1600); await wait(1200);
  });
  await quiet(async () => { await scrollTo(0, 10); await click('[data-coach="tpl-back"]'); await wait(700); await scrollTo(0, 10); });
  await scene('plan-dias', async () => {
    mark('Plan alimenticio: también ordenado en secciones.'); await tap('[data-coach="client-tab"][data-t="plan"]', 0, { after: 2000 });
    mark('Días de entrenamiento: cada comida con horario, calorías y macros.'); await openPl('train'); await wait(2000);
    mark('Y otro reparto para los días de descanso.'); await point('[data-coach="pl-mealadd"]', 0, 1600);
  });
  await closePl();
  await scene('plan-indicaciones', async () => {
    mark('Hidratación: agua y sal por día.'); await openPl('agua'); await wait(1800);
    await closePl();
    mark('Indicaciones: pautas generales y suplementos.'); await openPl('ind'); await scrollTo(200, 1400); await wait(1800);
  });
  await closePl();
  await scene('plan-menu', async () => {
    mark('Personalización del menú: opciones para cada comida.'); await openPl('menu'); await wait(1400);
    await tap('[data-coach="pl-opttoggle"]', 0, { after: 1600 });
    mark('Adicionales permitidos e intercambios de alimentos.'); await scrollToSel('[data-coach="pl-swapadd"]', 520, 1800); await wait(1800);
  });
  await closePl();
  await scene('plan-cardio', async () => {
    mark('Cardio prescripto y hábitos diarios para su checklist.'); await openPl('cardio'); await wait(1600); await closePl(); await openPl('habitos'); await wait(1600);
    mark('Guardás el plan y le aparece en su app.'); await point('[data-coach="plan-save"]', 0, 1800);
  });
  await quiet(async () => { await closePl(); await click('[data-coach="back"]'); await wait(900); await scrollTo(0, 10); });
  await scene('preguntas', async () => {
    mark('Preguntas: armás las tuyas para tus alumnos.'); await tap('[data-coach="q-open"]', 0, { after: 1800 });
    mark('Para el registro de cada día y para el check-in semanal.'); await tap('[data-coach="q-tab"]', 1, { after: 1400 }); await tap('[data-coach="q-tab"]', 0, { after: 1000 });
    mark('Elegís el tipo de respuesta, las opciones y el orden.'); await point('[data-coach="q-type"]', 0, 1400); await point('[data-coach="q-up"]', 1, 1200);
  });
  await quiet(async () => { await click('[data-coach="q-close"]'); await wait(700); });
  await scene('ajustes', async () => {
    mark('En Configuración cambiás tu nombre y las notificaciones.'); await tap('[data-coach="open-settings"]', 0, { after: 2400 }); await wait(1400);
  });
  await A.done();
})();
