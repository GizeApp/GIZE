// Pantalla de ingreso: «Instalar GIZE en el celular» aparece en la web, pero no dentro de las
// apps de Android y iPhone (ya están instaladas, y App Review lo marcaría).
import { newPage, wait } from './lib.mjs';

const fakeCap = plataforma => `(() => {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => ${JSON.stringify(plataforma)}, Plugins: {
    App: { getInfo: async () => ({ version: '1.0.0', build: '1' }), addListener: () => {}, getLaunchUrl: async () => null }
  } };
})();`;

export default async function ({ base, t }){
  for (const caso of ['web', 'ios', 'android']){
    const { p, close } = await newPage(caso === 'web' ? {} : { init: fakeCap(caso) });
    await p.goto(base + '/app/'); await wait(1500);
    const hay = await p.evaluate(() => !!document.querySelector('.auth-btn'));
    t.ok(hay, caso + ': se ve la pantalla de ingreso');
    const boton = await p.evaluate(() => !!document.querySelector('.auth-install'));
    t.eq(boton, caso === 'web', caso + ': botón «Instalar GIZE en el celular» ' + (caso === 'web' ? 'presente' : 'oculto'));
    await close();
  }
}
