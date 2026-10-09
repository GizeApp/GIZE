// Envíos de a varios a la vez (aviso a todos, función admin). Está aparte de index.ts para poder
// probarlo sin Deno (tests/avisos-tope.test.mjs).

export const TANDA = 100;

// Corre fn para cada elemento, con n como mucho a la vez: cuando termina uno, arranca el que
// sigue. Con todos juntos (miles de navegadores), el tiempo máximo de cada envío corría para
// todos desde el principio y los últimos podían cortarse sin llegar; así corre desde que cada
// uno arranca, y uno lento no frena a los demás de su tanda.
export async function deA<T>(list: T[], fn: (x: T) => Promise<void>, n = TANDA): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) await fn(list[i++]);
  }));
}
