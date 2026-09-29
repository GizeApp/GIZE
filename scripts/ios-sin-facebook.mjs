// App de iPhone: saca el SDK de Facebook del plugin de login (@capgo/capacitor-social-login).
// El plugin hace falta en iPhone para «Continuar con Apple», pero su Package.swift (Swift Package
// Manager, que es lo que usa este proyecto) declara siempre el SDK de Facebook: "facebook": false
// en capacitor.config.json solo lo saca con CocoaPods. Así entraba a la app, con su código de
// seguimiento (App Tracking Transparency), aunque GIZE nunca lo use.
// El código del plugin ya compila sin él (todo lo de Facebook está dentro de
// #if canImport(FBSDKLoginKit)), así que alcanza con borrar esas líneas de su Package.swift
// antes de compilar. Lo corre el workflow ios.yml después de npm ci.
// Si el archivo no tiene exactamente lo esperado (otra versión del plugin), no toca nada y avisa:
// la app se compila igual que antes, con Facebook adentro.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PAQUETE = "node_modules/@capgo/capacitor-social-login/Package.swift";

// Devuelve el Package.swift sin Facebook, el mismo texto si ya no lo tenía, o null si no se
// reconoce (no se toca).
export function sinFacebook(txt){
  if(!/facebook/i.test(txt)) return txt;
  const fuera = [
    /^\s*\/\/\s*FBSDKCoreKit and FBSDKLoginKit\s*$/,
    /^\s*\.package\(url:\s*"https:\/\/github\.com\/facebook\/facebook-ios-sdk\.git",.*\),?\s*$/,
    /^\s*\.product\(name:\s*"FacebookCore",\s*package:\s*"facebook-ios-sdk"\),?\s*$/,
    /^\s*\.product\(name:\s*"FacebookLogin",\s*package:\s*"facebook-ios-sdk"\),?\s*$/,
  ];
  const lineas = txt.split("\n");
  const quedan = lineas.filter(l => !fuera.some(re => re.test(l)));
  const sacadas = lineas.filter(l => fuera.slice(1).some(re => re.test(l))).length;
  const out = quedan.join("\n");
  // Tienen que salir el paquete y sus dos productos, y no puede quedar nada de Facebook.
  if(sacadas !== 3 || /facebook/i.test(out)) return null;
  return out;
}

function main(){
  let fb = true;
  try{ fb = JSON.parse(readFileSync("capacitor.config.json", "utf8")).plugins.SocialLogin.providers.facebook !== false; }catch(e){}
  if(fb){ console.log("capacitor.config.json no apaga Facebook: el plugin queda como está."); return; }
  if(!existsSync(PAQUETE)){ console.log("::warning::No está " + PAQUETE + " (¿falta npm ci?): no se sacó Facebook."); return; }
  const antes = readFileSync(PAQUETE, "utf8");
  const despues = sinFacebook(antes);
  if(despues === null){ console.log("::warning::El Package.swift del plugin de login cambió: no se sacó Facebook. Revisar scripts/ios-sin-facebook.mjs."); return; }
  if(despues === antes){ console.log("El plugin de login ya estaba sin Facebook."); return; }
  writeFileSync(PAQUETE, despues);
  console.log("Listo: el plugin de login se compila sin el SDK de Facebook.");
}

if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
