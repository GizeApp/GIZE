// App de iPhone lista para «Continuar con Apple» y para App Store Connect (sin Mac: se revisan
// los archivos). Permiso de Sign in with Apple en App.entitlements (el que usa el proyecto),
// manifiesto de privacidad PrivacyInfo.xcprivacy dentro de la app (UserDefaults del plugin de
// login, sin seguimiento), el SDK de Facebook afuera del plugin antes de compilar y la política
// de privacidad nombrando a Apple.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBrowser } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };

// Package.swift de @capgo/capacitor-social-login 7.20.0 (el de package-lock.json).
const PAQUETE_7_20 = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapgoCapacitorSocialLogin",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "CapgoCapacitorSocialLogin",
            targets: ["SocialLoginPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0"),
        // FBSDKCoreKit and FBSDKLoginKit
        .package(url: "https://github.com/facebook/facebook-ios-sdk.git", .upToNextMajor(from: "18.0.0")),
        // Add Google Sign-In dependency
        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", .upToNextMajor(from: "9.0.0")),
        // Alamofire
        .package(url: "https://github.com/Alamofire/Alamofire.git", .upToNextMajor(from: "5.9.0"))
    ],
    targets: [
        .target(
            name: "SocialLoginPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "FacebookCore", package: "facebook-ios-sdk"),
                .product(name: "FacebookLogin", package: "facebook-ios-sdk"),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS"),
                .product(name: "Alamofire", package: "Alamofire")
            ],
            path: "ios/Sources/SocialLoginPlugin"),
        .testTarget(
            name: "SocialLoginPluginTests",
            dependencies: ["SocialLoginPlugin"],
            path: "ios/Tests/SocialLoginPluginTests")
    ]
)
`;

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
        case 'integer': return Number(n.textContent);
        default: return n.textContent;
      }
    };
    return val(doc.documentElement.firstElementChild);
  }, xml);
  await ctx.close();
  return out;
}

export default async function ({ t }){
  // 1) Permiso de Sign in with Apple, en el archivo que firma el proyecto.
  const ent = await plist(leer('ios/App/App/App.entitlements'));
  t.ok(!!ent, 'App.entitlements es un plist válido');
  t.eq(ent && ent['com.apple.developer.applesignin'], ['Default'], 'App.entitlements pide Sign in with Apple');
  t.ok(ent && ent['aps-environment'], 'App.entitlements sigue con las notificaciones push');
  const pbx = leer('ios/App/App.xcodeproj/project.pbxproj');
  const ents = pbx.match(/CODE_SIGN_ENTITLEMENTS = [^;]+;/g) || [];
  t.ok(ents.length === 2 && ents.every(l => l === 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;'), 'Debug y Release firman con App/App.entitlements: ' + JSON.stringify(ents));

  // 2) Manifiesto de privacidad dentro de la app.
  const man = await plist(leer('ios/App/App/PrivacyInfo.xcprivacy'));
  t.ok(!!man, 'existe ios/App/App/PrivacyInfo.xcprivacy y es un plist válido');
  if (man){
    t.eq(man.NSPrivacyTracking, false, 'sin seguimiento (NSPrivacyTracking false)');
    t.eq(man.NSPrivacyTrackingDomains, [], 'sin dominios de seguimiento');
    const ud = (man.NSPrivacyAccessedAPITypes || []).find(x => x.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults');
    t.eq(ud && ud.NSPrivacyAccessedAPITypeReasons, ['CA92.1'], 'UserDefaults (plugin de login) con la razón CA92.1');
    const tipos = man.NSPrivacyCollectedDataTypes || [];
    for (const k of ['NSPrivacyCollectedDataTypeEmailAddress', 'NSPrivacyCollectedDataTypeName', 'NSPrivacyCollectedDataTypeFitness', 'NSPrivacyCollectedDataTypePhotosorVideos', 'NSPrivacyCollectedDataTypeAudioData'])
      t.ok(tipos.some(x => x.NSPrivacyCollectedDataType === k), 'el manifiesto declara ' + k);
    t.ok(tipos.length && tipos.every(x => x.NSPrivacyCollectedDataTypeTracking === false && x.NSPrivacyCollectedDataTypeLinked === true && (x.NSPrivacyCollectedDataTypePurposes || []).length),
      'cada dato: ligado a la cuenta, sin seguimiento y con para qué');
  }
  // Agregado al target: referencia, archivo en "Resources" y en el grupo App.
  const ref = (pbx.match(/([0-9A-F]{24}) \/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;[^}]*path = PrivacyInfo\.xcprivacy;/) || [])[1];
  const bf = ref && (pbx.match(new RegExp('([0-9A-F]{24}) /\\* PrivacyInfo\\.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ' + ref)) || [])[1];
  const recursos = (pbx.match(/\/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/) || [])[1] || '';
  const grupo = (pbx.match(/504EC3061FED79650016851F \/\* App \*\/ = \{[\s\S]*?children = \(([\s\S]*?)\);/) || [])[1] || '';
  t.ok(!!ref, 'project.pbxproj tiene la referencia a PrivacyInfo.xcprivacy');
  t.ok(!!bf && recursos.includes(bf), 'PrivacyInfo.xcprivacy se copia a la app (fase Resources del target)');
  t.ok(!!ref && grupo.includes(ref), 'PrivacyInfo.xcprivacy está en el grupo App');

  // 3) Facebook afuera del plugin de login antes de compilar (con SPM "facebook": false no alcanza).
  const cfg = JSON.parse(leer('capacitor.config.json') || '{}');
  const prov = (((cfg.plugins || {}).SocialLogin || {}).providers) || {};
  t.ok(prov.apple === true && prov.facebook === false, 'capacitor.config.json: Apple sí, Facebook no');
  let sinFacebook = null;
  try { ({ sinFacebook } = await import(path.join(ROOT, 'scripts/ios-sin-facebook.mjs'))); } catch (e) {}
  t.ok(typeof sinFacebook === 'function', 'existe scripts/ios-sin-facebook.mjs');
  if (sinFacebook){
    const out = sinFacebook(PAQUETE_7_20);
    t.ok(out && !/facebook/i.test(out), 'el Package.swift del plugin queda sin Facebook');
    t.ok(out && out.includes('.product(name: "Alamofire", package: "Alamofire")') && out.includes('GoogleSignIn-iOS') && out.includes('capacitor-swift-pm'), 'quedan Alamofire (lo usa Apple), Google y Capacitor');
    t.eq(out && PAQUETE_7_20.split('\n').length - out.split('\n').length, 4, 'se borran solo las 4 líneas de Facebook (paquete, sus 2 productos y su comentario)');
    t.eq(out && sinFacebook(out), out, 'correrlo dos veces no cambia nada');
    t.eq(sinFacebook(PAQUETE_7_20.replace('.product(name: "FacebookLogin", package: "facebook-ios-sdk"),', '.product(name: "FacebookLogin", package: "facebook-ios-sdk", condition: .when(platforms: [.iOS])),')), null,
      'si el archivo no es el esperado no lo toca (null)');
  }
  const wf = leer('.github/workflows/ios.yml');
  const iCi = wf.indexOf('run: npm ci'), iFb = wf.indexOf('node scripts/ios-sin-facebook.mjs'), iSync = wf.indexOf('npx cap sync ios'), iBuild = wf.indexOf('xcodebuild -project');
  t.ok(iCi > 0 && iFb > iCi && iFb < iSync && iFb < iBuild, 'ios.yml saca Facebook después de npm ci y antes de compilar');

  // 4) La política de privacidad nombra a Apple como forma de ingreso.
  const pol = leer('privacidad/index.html');
  t.ok(/Ingreso con Google o con Apple/.test(pol) && /ocultar tu mail/.test(pol), 'privacidad/index.html nombra el ingreso con Apple');
}
