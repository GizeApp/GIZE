// La app de iPhone y la revisión de Apple (octubre de 2026):
// · Guía 2.5.4 (modo de fondo "location"): la app de iPhone no usa la ubicación, como la de
//   Android. El Info.plist no tiene el modo de fondo "location" (ni ningún otro: no hace falta) ni
//   textos de permiso de ubicación (NSLocation…); solo quedan los permisos que la app usa. El
//   manifiesto de privacidad no declara la ubicación, no hay ningún plugin de ubicación (package.json,
//   package-lock.json, Package.swift ni capacitor.config.json) y ios.yml frena, en los dos trabajos,
//   si después de cap sync vuelve alguno de esos.
// · Guía 5.1.1(iv) (cartel propio antes del permiso): tocar «Conectar Salud de Apple» va directo
//   al permiso del sistema (requestAuthorization), sin un confirm antes que se pueda cancelar. Lo
//   que se lee y quién lo ve está escrito debajo del botón.
// · En la app de iPhone (Capacitor falso, con el GPS y los permisos del navegador espiados): Cardio
//   sin «Salir a moverte» ni nada de GPS o mapa, y nunca se mira la ubicación ni se pide su permiso.
// Lo de Cardio en las dos apps (salidas de antes, coach, compartir) está en tests/cardio-android.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBrowser, newPage, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = s => s.replace(/^\s*#.*$/gm, '');

// Pasa un .plist (XML) a objeto con el parser del navegador; null si el XML está roto.
async function plist(xml){
  const b = await getBrowser(), ctx = await b.newContext(), p = await ctx.newPage();
  const out = await p.evaluate(src => {
    const doc = new DOMParser().parseFromString(src, 'application/xml');
    if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.nodeName !== 'plist') return null;
    const val = n => {
      const kids = [...n.children];
      switch (n.nodeName){
        case 'dict': { const o = {}; for (let i = 0; i < kids.length; i += 2) o[kids[i].textContent] = val(kids[i + 1]); return o; }
        case 'array': return kids.map(val);
        case 'true': return true;
        case 'false': return false;
        default: return n.textContent;
      }
    };
    return val(doc.documentElement.firstElementChild);
  }, xml);
  await ctx.close();
  return out;
}

async function archivos(t){
  // Info.plist: sin ubicación ni modos de fondo; solo los permisos que la app usa.
  const info = await plist(leer('ios/App/App/Info.plist'));
  t.ok(!!info, 'Info.plist es un plist válido');
  if (info){
    t.eq(Object.keys(info).filter(k => /^NSLocation/.test(k)), [], 'Info.plist: sin textos de permiso de ubicación (NSLocation…)');
    t.eq(info.UIBackgroundModes, undefined, 'Info.plist: sin UIBackgroundModes (ni "location" ni ningún otro: las notificaciones son de alerta y no hace falta)');
    t.eq(Object.keys(info).filter(k => /UsageDescription$/.test(k)).sort(),
      ['NSCameraUsageDescription', 'NSHealthShareUsageDescription', 'NSHealthUpdateUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSPhotoLibraryUsageDescription'],
      'Info.plist: solo los permisos que la app usa (cámara, fotos, micrófono y Salud)');
    t.ok(!/ubicaci|recorrido|salida/i.test(Object.values(info).filter(v => typeof v === 'string').join(' ')), 'Info.plist: ningún texto habla de la ubicación, del recorrido ni de las salidas');
  }
  const man = await plist(leer('ios/App/App/PrivacyInfo.xcprivacy'));
  t.ok(!!man, 'PrivacyInfo.xcprivacy es un plist válido');
  if (man) t.eq((man.NSPrivacyCollectedDataTypes || []).map(x => x.NSPrivacyCollectedDataType).filter(k => /Location/.test(k)), [], 'PrivacyInfo: no declara la ubicación (ni precisa ni aproximada)');

  // Ningún plugin de ubicación.
  const pkg = JSON.parse(leer('package.json')), lock = JSON.parse(leer('package-lock.json'));
  t.eq(Object.keys(Object.assign({}, pkg.dependencies, pkg.devDependencies)).filter(d => /geoloc|location|gps/i.test(d)), [], 'package.json: ningún plugin de ubicación');
  t.eq(Object.keys(lock.packages || {}).filter(d => /geoloc|location|gps/i.test(d)), [], 'package-lock.json: tampoco');
  t.ok(!/geoloc/i.test(leer('ios/App/CapApp-SPM/Package.swift')), 'Package.swift: sin el plugin de ubicación');
  t.ok(!/geoloc/i.test(leer('capacitor.config.json')), 'capacitor.config.json: sin el plugin de ubicación');

  // ios.yml: después de cap sync, en los dos trabajos, frena si vuelve algo de la ubicación.
  const y = sinComentarios(leer('.github/workflows/ios.yml'));
  const trabajos = (y.split(/^jobs:\s*$/m)[1] || '').split(/^  (?=\w[\w-]*:\s*$)/m).slice(1);
  t.eq(trabajos.map(b => b.split(':')[0]), ['simulador', 'testflight'], 'ios.yml: los trabajos «simulador» y «testflight»');
  for (const b of trabajos){
    const n = b.split(':')[0], sync = b.indexOf('npx cap sync ios'), guard = b.indexOf('name: Revisar que la app no use la ubicación');
    const fin = b.indexOf('xcodebuild -project'), paso = guard > 0 ? b.slice(guard, b.indexOf('- name:', guard + 10) > 0 ? b.indexOf('- name:', guard + 10) : undefined) : '';
    t.ok(sync > 0 && guard > sync && fin > guard, n + ': revisa la ubicación después de cap sync y antes de compilar');
    t.ok(/for f in ios\/App\/CapApp-SPM\/Package\.swift ios\/App\/App\/capacitor\.config\.json ios\/App\/App\/Info\.plist; do\n\s*if \[ ! -f "\$f" \]; then [^\n]*exit 1; fi/.test(paso), n + ': si falta uno de los archivos, frena (si no, grep pasaría sin mirar)');
    t.ok(/grep -qi "geolocation" ios\/App\/CapApp-SPM\/Package\.swift ios\/App\/App\/capacitor\.config\.json; then\n\s*echo "::error::[^"]*"; exit 1/.test(paso), n + ': frena si vuelve un plugin de ubicación');
    t.ok(/grep -q "NSLocation" ios\/App\/App\/Info\.plist \|\| plutil -extract UIBackgroundModes json -o - ios\/App\/App\/Info\.plist 2>\/dev\/null \| grep -q '"location"'; then\n\s*echo "::error::[^"]*"; exit 1/.test(paso), n + ': frena si el Info.plist pide la ubicación o tiene el modo de fondo location');
  }

  // Salud: nada de confirm/alert/prompt entre la disponibilidad y el permiso del sistema.
  const salud = leer('app/core/salud.js');
  const prender = (salud.match(/export async function prenderSalud\(\)\{[\s\S]*?\n\}\n/) || [''])[0];
  const antes = prender.slice(0, prender.indexOf('H.requestAuthorization('));
  t.ok(prender && antes.length > 0, 'salud.js: prenderSalud pide el permiso con requestAuthorization');
  t.ok(!/\b(confirm|alert|prompt)\(/.test(antes), 'salud.js: ningún cartel propio antes del permiso del sistema');
}

// La app de iPhone con Salud y un GPS espiado: Cardio sin salidas con GPS, el botón de Salud va
// directo al permiso, y nunca se mira la ubicación.
const IPHONE = () => {
  const usos = window.__usos = [];
  Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(){ usos.push('geo.watchPosition'); return 1; }, clearWatch(){ usos.push('geo.clearWatch'); }, getCurrentPosition(){ usos.push('geo.getCurrentPosition'); },
  }, configurable: true });
  const perms = navigator.permissions;
  Object.defineProperty(navigator, 'permissions', { value: { query: d => { if (d && d.name === 'geolocation') usos.push('permiso.geolocation'); return perms.query(d); } }, configurable: true });
  window.__salud = [];
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => true, Plugins: {
    App: { getInfo: async () => ({ version: '1.0.0', build: '999' }), addListener: () => Promise.resolve({ remove(){} }), getLaunchUrl: async () => null },
    Health: {
      isAvailable: async () => { window.__salud.push('isAvailable'); return { available: true }; },
      requestAuthorization: async o => { window.__salud.push('requestAuthorization:' + JSON.stringify(o)); return {}; },
      readSamples: async () => ({ samples: [] }),
    },
  } };
};

async function iphone(base, t){
  const pg = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} }, init: IPHONE, handlers: { '/profiles': profile('client') } });
  const p = pg.p, reqs = [];
  p.on('request', r => reqs.push(r.url()));
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(500);
  const v = await p.evaluate(() => document.getElementById('view').textContent.replace(/\s+/g, ' '));
  t.ok(!/Salir a moverte|GPS|ubicaci|mapa/i.test(v), 'iPhone: Cardio sin «Salir a moverte» ni nada de GPS, ubicación o mapa');
  t.eq(await p.$$eval('#view [data-action="sal-sheet"], #view .sal-salir, #salLive', l => l.length), 0, 'iPhone: ni el botón ni una salida en vivo');
  t.has(v, 'Conectar Salud de Apple', 'iPhone: el botón de Salud está');
  t.has(v, 'GIZE solo lee tus pasos, para tu registro y tus grupos de pasos: no cambia nada en Salud de Apple. Tus amigos ven solo tu total de la semana.', 'iPhone: debajo del botón, qué se lee y quién lo ve');
  await p.click('#view [data-pg="salud-on"]'); await wait(1200);
  t.eq(pg.dialogs, [], 'iPhone: «Conectar» no muestra ningún cartel propio (ni antes ni después del permiso)');
  t.eq(await p.evaluate(() => window.__salud), ['isAvailable', 'requestAuthorization:{"read":["steps"],"write":[]}'], 'iPhone: va directo al permiso del sistema, solo para leer pasos');
  t.ok(await p.$('#view .salud-ok'), 'iPhone: queda «Conectado a Salud de Apple»');
  // Forzar una salida tampoco mira la ubicación.
  const r = await p.evaluate(async () => { const g = await import('/app/ui/gps.js'); g.acceptDisclosure(); return g.start('pie'); });
  t.eq(r, { ok: false, why: 'sin-gps' }, 'iPhone: start() no arranca ninguna salida');
  await wait(300);
  t.eq(await p.evaluate(() => window.__usos), [], 'iPhone: nunca se mira la ubicación ni se pide su permiso');
  t.eq(reqs.filter(u => /maplibre|openfreemap/i.test(u)), [], 'iPhone: nunca se pide MapLibre ni OpenFreeMap');
  t.eq(pg.errs, [], 'errores de la página (iPhone)');
  await pg.close();
}

export default async function ({ base, t }){
  await archivos(t);
  await iphone(base, t);
}
