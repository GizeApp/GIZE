// Video del coach por ejercicio: si pegó un link para ese ejercicio (videoFor), el alumno ve
// ese, aunque sea un video de la biblioteca de otro ejercicio. Las rutinas viejas (sin
// videoFor) siguen descartando los videos de la biblioteca que no son de ese ejercicio.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({});
  await p.goto(base + '/app/'); await wait(1500);
  const r = await p.evaluate(async () => {
    const { exVideo, libVideo } = await import('/app/core/videos.js');
    const url = v => v ? v.url : null;
    const fondos = libVideo('Fondos en paralelas').url, inclinado = libVideo('Press de banca inclinado (barra)').url;
    const plano = libVideo('Press de banca plano (barra)').url;
    return {
      sinLib: url(exVideo({ name: 'Fondos asistidos en máquina', video: fondos, videoFor: 'Fondos asistidos en máquina' })),
      conLib: url(exVideo({ name: 'Press de banca plano (barra)', video: inclinado, videoFor: 'Press de banca plano (barra)' })),
      deOtro: url(exVideo({ name: 'Press de banca plano (barra)', video: 'https://youtu.be/abcdefghijk', videoFor: 'Vuelos sentado' })),
      viejo: url(exVideo({ name: 'Press de banca plano (barra)', video: inclinado })),
      propio: url(exVideo({ name: 'Press de banca plano (barra)', video: 'https://youtu.be/abcdefghijk', videoFor: 'Press de banca plano (barra)' })),
      fondos, inclinado, plano,
    };
  });
  t.eq(r.sinLib, r.fondos, 'ejercicio sin video en la biblioteca: va el que pegó el coach');
  t.eq(r.conLib, r.inclinado, 'ejercicio con video en la biblioteca: va el que pegó el coach, no el de GIZE');
  t.eq(r.deOtro, r.plano, 'link que era de otro ejercicio: va el de la biblioteca');
  t.eq(r.viejo, r.plano, 'rutina vieja sin videoFor con video de la biblioteca de otro ejercicio: va el de la biblioteca');
  t.eq(r.propio, 'https://youtu.be/abcdefghijk', 'link propio del coach');
  t.eq(errs, [], 'errores de la página');
  await close();
}
