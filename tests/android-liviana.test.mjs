// La app de Android más liviana: R8 en la versión de Play Store y sin las imágenes que la app no usa.
// a) android/app/build.gradle: minifyEnabled + shrinkResources con proguard-android-optimize.
// b) proguard-rules.pro: se guardan enteros los paquetes de cada plugin que lleva Android
//    (capacitor.config.json android.includePlugins), el de Capacitor y el de la app, las clases que
//    el login con Google busca por nombre, Health Connect, Credential Manager y Firebase; sin la
//    regla del plugin de ubicación (no va en Android) y con las líneas para leer los errores.
// c) scripts/build-web.mjs (www/ para las apps): sin los logos en PNG, las imágenes de los mails ni
//    BRAND.md; con todo lo de brand/ que la app y el CSS usan.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
// El paquete de Java de cada plugin (si se suma uno a Android, va acá y en proguard-rules.pro).
const JAVA = { '@capacitor/': 'com.capacitorjs.plugins', '@capgo/capacitor-health': 'app.capgo.plugin.health', '@capgo/capacitor-social-login': 'ee.forgr.capacitor' };

export default async function ({ t }){
  // a) R8 en la versión de Play Store.
  const g = read('android/app/build.gradle'), rel = ((g.split('buildTypes {')[1] || '').match(/release \{[\s\S]*?\n {8}\}/) || [''])[0];
  t.ok(/minifyEnabled true/.test(rel) && /shrinkResources true/.test(rel), 'build.gradle: R8 (código y recursos) en la versión de Play Store: ' + rel);
  t.ok(/proguardFiles getDefaultProguardFile\('proguard-android-optimize\.txt'\), 'proguard-rules\.pro'/.test(rel), 'build.gradle: con proguard-android-optimize y las reglas de la app');

  // b) Las reglas.
  const pro = read('android/app/proguard-rules.pro');
  const keeps = [...pro.matchAll(/^-keep class ([\w.*$]+) \{ \*; \}$/gm)].map(m => m[1]);
  const plugins = JSON.parse(read('capacitor.config.json')).android.includePlugins;
  for (const pl of plugins){
    const k = Object.keys(JAVA).find(x => x.endsWith('/') ? pl.startsWith(x) : pl === x);
    t.ok(k && keeps.includes(JAVA[k] + '.**'), 'proguard: el paquete del plugin ' + pl + ' se guarda entero' + (k ? ' (' + JAVA[k] + ')' : ' — falta su paquete en esta prueba y su regla'));
  }
  for (const k of ['com.getcapacitor.**', 'ar.com.gize.app.**', 'com.google.android.gms.auth.api.identity.**', 'com.google.android.gms.common.api.ApiException',
    'com.google.android.libraries.identity.googleid.**', 'androidx.browser.customtabs.**', 'androidx.health.connect.client.**', 'androidx.health.platform.client.**',
    'androidx.credentials.**', 'com.google.firebase.messaging.**'])
    t.ok(keeps.includes(k), 'proguard: se guarda ' + k);
  t.ok(/^-dontwarn com\.facebook\.\*\*$/m.test(pro), 'proguard: Facebook no está y no corta la compilación');
  t.ok(!/equimaps|geolocation/i.test(pro), 'proguard: sin la regla del plugin de ubicación (no va en Android)');
  t.ok(/^-keepattributes SourceFile, LineNumberTable$/m.test(pro) && /^-keepattributes \*Annotation\*, Signature/m.test(pro), 'proguard: anotaciones y las líneas para leer los errores');

  // c) www/ en una copia: sin los PNG de brand/, las imágenes de los mails ni BRAND.md.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-www-'));
  try {
    for (const f of ['manifest.json', 'sw.js', 'install.js', 'app', 'css', 'brand', 'vendor', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'scripts/build-web.mjs'])
      if (fs.existsSync(path.join(ROOT, f))) fs.cpSync(path.join(ROOT, f), path.join(tmp, f), { recursive: true });
    execFileSync(process.execPath, ['scripts/build-web.mjs'], { cwd: tmp, stdio: 'pipe' });
    const www = path.join(tmp, 'www'), brand = fs.readdirSync(path.join(www, 'brand'), { recursive: true }).map(f => f.replace(/\\/g, '/'));
    t.eq(brand.filter(f => /\.png$|^mail(\/|$)|^BRAND\.md$/.test(f)), [], 'www: sin los logos en PNG, las imágenes de los mails ni BRAND.md');
    t.ok(fs.existsSync(path.join(www, 'index.html')) && !/<base href/.test(fs.readFileSync(path.join(www, 'index.html'), 'utf8')), 'www: index.html sin el <base> de la web');
    // Todo lo de brand/ que nombran la app, el CSS y el manifiesto está.
    const usado = new Set();
    for (const dir of ['app', 'css']) for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true }))
      if (/\.(js|css|html)$/.test(f)) for (const m of read(path.join(dir, f)).matchAll(/brand\/((?:logo|fonts)\/[\w.-]+\.\w+|tokens\.css)/g)) usado.add(m[1]);
    for (const m of read('manifest.json').matchAll(/brand\/([\w./-]+\.\w+)/g)) usado.add(m[1]);
    t.ok(usado.size >= 4, 'www: se encontraron los archivos de brand/ que usa la app: ' + [...usado].join(', '));
    t.eq([...usado].filter(f => !brand.includes(f)), [], 'www: con todo lo de brand/ que usan la app y el CSS');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
