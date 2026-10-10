// App de Android: las ventanitas de aviso (alert y confirm de la página, por ejemplo «¿Borrar este
// entreno del historial?») salen con «Aceptar» y «Cancelar». Capacitor las arma con «OK» y «Cancel»
// en inglés (BridgeWebChromeClient); MainActivity pone en su lugar DialogosEnCastellano, que es la
// misma clase de Capacitor con los botones cambiados. En un celular se ve con el workflow «Android
// en emulador» (dialogo-1.png).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = path.join(ROOT, 'android/app/src/main/java/ar/com/gize/app');
const leer = f => { try { return fs.readFileSync(path.join(JAVA, f), 'utf8'); } catch (e) { return ''; } };
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

export default async function ({ t }){
  const main = sinComentarios(leer('MainActivity.java'));
  const dlg = sinComentarios(leer('DialogosEnCastellano.java'));
  t.ok(dlg, 'existe DialogosEnCastellano.java');

  // MainActivity la pone después de super.onCreate (ahí ya existe el WebView de Capacitor).
  const iSuper = main.indexOf('super.onCreate('), iPone = main.indexOf('setWebChromeClient(new DialogosEnCastellano(getBridge()))');
  t.ok(iPone > 0, 'MainActivity pone DialogosEnCastellano en el WebView');
  t.ok(iSuper > 0 && iPone > iSuper, 'y lo hace después de super.onCreate');

  // Es la clase de Capacitor (archivos, cámara, micrófono y permisos siguen igual)…
  t.ok(/class DialogosEnCastellano extends BridgeWebChromeClient\b/.test(dlg), 'extiende BridgeWebChromeClient de Capacitor');
  t.ok(/super\(bridge\);/.test(dlg), 'llama al constructor de Capacitor');
  // …con alert, confirm y prompt propios.
  for (const m of ['onJsAlert', 'onJsConfirm', 'onJsPrompt'])
    t.ok(new RegExp('@Override\\s+public boolean ' + m + '\\(').test(dlg), m + ' está reemplazado');
  t.ok(/ACEPTAR = "Aceptar"/.test(dlg) && /CANCELAR = "Cancelar"/.test(dlg), 'los botones dicen «Aceptar» y «Cancelar»');
  t.eq((dlg.match(/setPositiveButton\(ACEPTAR,/g) || []).length, 3, 'los tres tienen «Aceptar»');
  t.eq((dlg.match(/setNegativeButton\(CANCELAR,/g) || []).length, 2, 'confirm y prompt tienen «Cancelar»');
  t.ok(!/"OK"|"Ok"|"Cancel"/.test(dlg), 'no queda ningún botón en inglés');
  // Igual que Capacitor: el confirm devuelve true solo con «Aceptar», y tocar afuera es cancelar.
  const confirm = dlg.slice(dlg.indexOf('onJsConfirm('), dlg.indexOf('onJsPrompt('));
  t.ok(/ACEPTAR, \(dialog, which\) -> \{\s*dialog\.dismiss\(\);\s*result\.confirm\(\);\s*\}/.test(confirm), 'confirm: «Aceptar» confirma');
  t.ok(/CANCELAR, \(dialog, which\) -> \{\s*dialog\.dismiss\(\);\s*result\.cancel\(\);\s*\}/.test(confirm), 'confirm: «Cancelar» cancela');
  t.ok(/setOnCancelListener\(\(dialog\) -> \{\s*dialog\.dismiss\(\);\s*result\.cancel\(\);\s*\}/.test(confirm), 'confirm: tocar afuera o atrás cancela');
  // Con la app cerrándose no se abre ninguna ventana (como en Capacitor).
  t.eq((dlg.match(/bridge\.getActivity\(\)\.isFinishing\(\)/g) || []).length, 3, 'si la app se está cerrando no muestra la ventana');
}
