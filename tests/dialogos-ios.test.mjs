// App de iPhone: las ventanitas de aviso (alert, confirm y prompt de la página, por ejemplo
// «¿Borrar este entreno del historial?») salen con «Aceptar» y «Cancelar». Capacitor las arma con
// «Ok» y «Cancel» en inglés (WebViewDelegationHandler). Main.storyboard abre GizeViewController, la
// pantalla de Capacitor que además le pone al WebView DialogosEnCastellano como uiDelegate: arma esas
// tres ventanitas y todo lo demás (permisos de cámara y micrófono, links que abren otra ventana…) se
// lo pasa al de Capacitor. Las dos clases están en AppDelegate.swift (así no hay que sumar un archivo
// al proyecto de Xcode). Que compile lo revisa el workflow «App iPhone» (trabajo «simulador»). Si
// están las dependencias instaladas (npm ci), además se compara con el código de Capacitor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
// Una clase o función de Swift entera: desde donde empieza hasta la llave que la cierra.
function bloque(src, re){
  const m = re.exec(src); if (!m) return '';
  let n = 0;
  for (let j = src.indexOf('{', m.index); j >= 0 && j < src.length; j++){
    if (src[j] === '{') n++;
    else if (src[j] === '}' && --n === 0) return src.slice(m.index, j + 1);
  }
  return '';
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Las tres ventanitas, como las declara WKUIDelegate (y Capacitor).
const PANELES = {
  alert: 'func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void)',
  confirm: 'func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void)',
  prompt: 'func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void)',
};

export default async function ({ t }){
  // La pantalla que abre la app es GizeViewController, del módulo de la app.
  const sb = leer('ios/App/App/Base.lproj/Main.storyboard');
  const inicial = (sb.match(/initialViewController="([^"]+)"/) || [])[1];
  const vc = (sb.match(new RegExp('<viewController id="' + esc(inicial || '-') + '"[^>]*>')) || [])[0] || '';
  t.ok(/ customClass="GizeViewController" customModule="App" customModuleProvider="target" /.test(vc), 'Main.storyboard abre GizeViewController de la app: ' + vc);
  t.ok(!/CAPBridgeViewController|customModule="Capacitor"/.test(sb), 'y ya no la de Capacitor');

  const swift = sinComentarios(leer('ios/App/App/AppDelegate.swift'));
  t.ok(/^import WebKit$/m.test(swift), 'AppDelegate.swift importa WebKit');

  // GizeViewController: la de Capacitor, que pone DialogosEnCastellano cuando ya existe el WebView.
  const gvc = bloque(swift, /^class GizeViewController: CAPBridgeViewController \{/m);
  t.ok(gvc, 'GizeViewController extiende CAPBridgeViewController');
  const cdl = bloque(gvc, /override func capacitorDidLoad\(\) \{/);
  const iSuper = cdl.indexOf('super.capacitorDidLoad()'), iCrea = cdl.indexOf('DialogosEnCastellano(pantalla: self, original: webView?.uiDelegate)');
  const iGuarda = cdl.indexOf('self.dialogos = dialogos'), iPone = cdl.indexOf('webView?.uiDelegate = dialogos');
  t.ok(iSuper > 0 && iCrea > iSuper && iPone > iCrea, 'en capacitorDidLoad, después de super, pone DialogosEnCastellano con el uiDelegate de Capacitor como original');
  t.ok(/^    private var dialogos: DialogosEnCastellano\?$/m.test(gvc) && iGuarda > 0 && iGuarda < iPone, 'la pantalla lo retiene (el WebView guarda su uiDelegate como weak)');

  // DialogosEnCastellano: alert, confirm y prompt propios…
  const dlg = bloque(swift, /^class DialogosEnCastellano: NSObject, WKUIDelegate \{/m);
  t.ok(dlg, 'existe DialogosEnCastellano (NSObject, WKUIDelegate)');
  const panel = {};
  for (const [k, firma] of Object.entries(PANELES)){
    panel[k] = bloque(dlg, new RegExp('^    ' + esc(firma) + ' \\{', 'm'));
    t.ok(panel[k], k + ' está reemplazado (con la firma de WKUIDelegate)');
  }
  t.ok(/static let aceptar = "Aceptar"/.test(dlg) && /static let cancelar = "Cancelar"/.test(dlg), 'los botones dicen «Aceptar» y «Cancelar»');
  t.eq((dlg.match(/UIAlertAction\(title: DialogosEnCastellano\.aceptar, style: \.default,/g) || []).length, 3, 'los tres tienen «Aceptar»');
  t.eq((dlg.match(/UIAlertAction\(title: DialogosEnCastellano\.cancelar, style: \.default,/g) || []).length, 2, 'confirm y prompt tienen «Cancelar»');
  t.ok(!/"OK"|"Ok"|"Cancel"/.test(swift) && !/UIAlertAction\(title: "/.test(swift), 'no queda ningún botón en inglés');
  // Se muestran sobre lo que esté abierto encima de la app, salvo que se esté cerrando.
  t.ok(/pantalla\.presentedViewController, !encima\.isBeingDismissed/.test(dlg), 'se muestran sobre lo que esté abierto encima, si no se está cerrando');
  for (const k of Object.keys(PANELES))
    t.ok(/guard let vc = dondeMostrar\(\) else \{/.test(panel[k]) && /vc\.present\(alerta, animated: true, completion: nil\)/.test(panel[k]), k + ' se muestra ahí');

  // Igual que Capacitor: el confirm devuelve true solo con «Aceptar».
  const c = panel.confirm || '';
  t.ok(/title: DialogosEnCastellano\.cancelar, style: \.default, handler: \{ _ in\s*completionHandler\(false\)\s*\}\)/.test(c), 'confirm: «Cancelar» devuelve false');
  t.ok(/title: DialogosEnCastellano\.aceptar, style: \.default, handler: \{ _ in\s*completionHandler\(true\)\s*\}\)/.test(c), 'confirm: «Aceptar» devuelve true');
  t.eq((c.match(/completionHandler\(true\)/g) || []).length, 1, 'confirm: ningún otro camino devuelve true');
  t.ok(/guard let vc = dondeMostrar\(\) else \{\s*completionHandler\(false\)\s*return\s*\}/.test(c), 'confirm: sin pantalla devuelve false (y la página no queda trabada)');
  t.ok(/guard let vc = dondeMostrar\(\) else \{\s*completionHandler\(\)\s*return\s*\}/.test(panel.alert || ''), 'alert: sin pantalla sigue de largo');
  // El prompt: lo escrito con «Aceptar» y nil (null en la página) con «Cancelar».
  const p = panel.prompt || '';
  t.ok(/title: DialogosEnCastellano\.cancelar, style: \.default, handler: \{ _ in\s*completionHandler\(nil\)\s*\}\)/.test(p), 'prompt: «Cancelar» devuelve nil');
  t.ok(/title: DialogosEnCastellano\.aceptar, style: \.default, handler: \{ \[weak alerta\] _ in\s*completionHandler\(alerta\?\.textFields\?\.first\?\.text \?\? defaultText\)\s*\}\)/.test(p), 'prompt: «Aceptar» devuelve lo escrito');
  t.ok(/alerta\.addTextField \{ campo in\s*campo\.text = defaultText\s*\}/.test(p), 'prompt: el campo arranca con el texto que manda la página');
  t.ok(/guard let vc = dondeMostrar\(\) else \{\s*completionHandler\(nil\)\s*return\s*\}/.test(p), 'prompt: sin pantalla devuelve nil');
  // Capacitor usa prompt() por dentro (cookies y CapacitorHttp, en cada carga): eso no es una
  // ventanita y lo sigue contestando el de Capacitor, antes de armar nada.
  const iInterno = p.indexOf('if DialogosEnCastellano.esDeCapacitor(prompt) {'), iVentana = p.indexOf('UIAlertController(');
  t.ok(iInterno > 0 && iInterno < iVentana, 'prompt: los pedidos internos de Capacitor van antes de armar la ventanita');
  t.ok(/original\?\.webView\?\(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText,\s*initiatedByFrame: frame, completionHandler: completionHandler\)/.test(p), 'y se los pasa al de Capacitor');
  t.ok(/if contesto == nil \{\s*completionHandler\(nil\)\s*\}\s*return/.test(p), 'si no los contesta, devuelve nil (la página no queda trabada)');
  t.ok(/let tipo = json\["type"\] as\? String/.test(dlg) && /return tipo\.hasPrefix\("Capacitor"\)/.test(dlg), 'un pedido interno es un JSON con "type" que empieza con "Capacitor"');

  // …y todo lo demás (permisos de cámara y micrófono, archivos, otra ventana) al de Capacitor.
  t.ok(/^    private weak var original: WKUIDelegate\?$/m.test(dlg) && /^    private weak var pantalla: UIViewController\?$/m.test(dlg), 'guarda al de Capacitor y a la pantalla sin retenerlos');
  const resp = bloque(dlg, /override func responds\(to aSelector: Selector!\) -> Bool \{/);
  t.ok(/return super\.responds\(to: aSelector\) \|\| \(original\?\.responds\(to: aSelector\) \?\? false\)/.test(resp), 'responds(to:): lo suyo y lo que responda el de Capacitor');
  const fwd = bloque(dlg, /override func forwardingTarget\(for aSelector: Selector!\) -> Any\? \{/);
  t.ok(/if let original = original, original\.responds\(to: aSelector\) \{\s*return original\s*\}\s*return super\.forwardingTarget\(for: aSelector\)/.test(fwd), 'forwardingTarget(for:): se lo pasa al de Capacitor');
  const metodos = [...dlg.matchAll(/^    (?:override )?func (\w+\([^)]*)/gm)].map(m => m[1].replace(/\(.*/, ''));
  t.eq(metodos, ['responds', 'forwardingTarget', 'webView', 'webView', 'webView'], 'no reemplaza nada más del uiDelegate de Capacitor: ' + metodos);

  // Con las dependencias instaladas: lo de arriba coincide con el Capacitor que usa la app.
  const CAP = 'node_modules/@capacitor/ios/Capacitor/Capacitor/';
  const wvdh = leer(CAP + 'WebViewDelegationHandler.swift'), bvc = leer(CAP + 'CAPBridgeViewController.swift');
  if (wvdh && bvc){
    for (const [k, firma] of Object.entries(PANELES))
      t.ok(wvdh.includes('open ' + firma + ' {'), k + ': misma firma que en Capacitor');
    t.ok(/class WebViewDelegationHandler: NSObject,[^{]*\bWKUIDelegate\b/.test(wvdh), 'el de Capacitor es un WKUIDelegate');
    t.ok(/title: "Ok"/.test(wvdh) && /title: "Cancel"/.test(wvdh), 'Capacitor sigue con los botones en inglés (si no, sobra esto)');
    t.ok(/public fileprivate\(set\) var webView: WKWebView\?/.test(bvc) && /open func capacitorDidLoad\(\)/.test(bvc), 'CAPBridgeViewController: webView opcional y capacitorDidLoad para reemplazar');
    const lv = bloque(bvc, /override public final func loadView\(\) \{/);
    t.ok(lv.indexOf('prepareWebView(') > 0 && lv.indexOf('capacitorDidLoad()') > lv.indexOf('prepareWebView('), 'Capacitor pone su uiDelegate (prepareWebView) antes de capacitorDidLoad');
    t.ok(/aWebView\.uiDelegate = delegationHandler/.test(bvc), 'y lo pone en el WebView');
    const nb = leer(CAP + 'assets/native-bridge.js');
    const tipos = [...nb.matchAll(/\bprompt\(/g)].map(m => (nb.slice(0, m.index).match(/type: '([^']+)'[^']*$/) || [])[1] || '?');
    t.ok(tipos.length >= 3 && tipos.every(x => x.startsWith('Capacitor')), 'los pedidos internos de Capacitor por prompt() empiezan con "Capacitor": ' + tipos);
  }
}
