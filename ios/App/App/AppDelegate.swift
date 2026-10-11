import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // Notificaciones push: le pasan a Capacitor (plugin PushNotifications) el token de Apple
    // del iPhone, o el error si no se pudo registrar.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// La pantalla de la app: es la de Capacitor (CAPBridgeViewController) y además le pone al WebView
// las ventanitas de aviso en castellano (DialogosEnCastellano, abajo). Main.storyboard abre esta
// en lugar de la de Capacitor.
class GizeViewController: CAPBridgeViewController {
    // El WebView no retiene a su uiDelegate (lo guarda como weak): lo retiene la pantalla.
    private var dialogos: DialogosEnCastellano?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Acá Capacitor ya creó el WebView y le puso de uiDelegate su WebViewDelegationHandler.
        let dialogos = DialogosEnCastellano(pantalla: self, original: webView?.uiDelegate)
        self.dialogos = dialogos
        webView?.uiDelegate = dialogos
    }
}

// Las ventanitas de aviso de la app (alert, confirm y prompt de la página): Capacitor las arma con
// los botones «Ok» y «Cancel» escritos en inglés (WebViewDelegationHandler), sin importar el idioma
// del iPhone. Esta clase las arma igual que Capacitor pero con «Aceptar» y «Cancelar», como el
// resto de la app. Todo lo demás que el WebView le pide a su uiDelegate (permisos de cámara y
// micrófono, links que abren otra ventana…) lo sigue contestando el de Capacitor: responds(to:) y
// forwardingTarget(for:) se lo pasan tal cual. La pone GizeViewController.
class DialogosEnCastellano: NSObject, WKUIDelegate {
    static let aceptar = "Aceptar"
    static let cancelar = "Cancelar"

    private weak var pantalla: UIViewController?
    // El WebViewDelegationHandler de Capacitor (lo retiene su CapacitorBridge).
    private weak var original: WKUIDelegate?

    init(pantalla: UIViewController, original: WKUIDelegate?) {
        self.pantalla = pantalla
        self.original = original
        super.init()
    }

    // MARK: - Lo que no son las ventanitas: lo contesta el de Capacitor

    override func responds(to aSelector: Selector!) -> Bool {
        return super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let original = original, original.responds(to: aSelector) {
            return original
        }
        return super.forwardingTarget(for: aSelector)
    }

    // MARK: - alert, confirm y prompt

    // Sobre qué se muestra la ventanita: lo que esté abierto encima de la app (como hace Capacitor
    // con el alert), salvo que se esté cerrando. Sin pantalla (la app se está cerrando) no se
    // muestra nada y la página sigue como si hubieran tocado «Cancelar».
    private func dondeMostrar() -> UIViewController? {
        guard let pantalla = pantalla else {
            return nil
        }
        if let encima = pantalla.presentedViewController, !encima.isBeingDismissed {
            return encima
        }
        return pantalla
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let vc = dondeMostrar() else {
            completionHandler()
            return
        }
        let alerta = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alerta.addAction(UIAlertAction(title: DialogosEnCastellano.aceptar, style: .default, handler: { _ in
            completionHandler()
        }))
        vc.present(alerta, animated: true, completion: nil)
    }

    // Igual que en Capacitor: devuelve true solo con «Aceptar».
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let vc = dondeMostrar() else {
            completionHandler(false)
            return
        }
        let alerta = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alerta.addAction(UIAlertAction(title: DialogosEnCastellano.cancelar, style: .default, handler: { _ in
            completionHandler(false)
        }))
        alerta.addAction(UIAlertAction(title: DialogosEnCastellano.aceptar, style: .default, handler: { _ in
            completionHandler(true)
        }))
        vc.present(alerta, animated: true, completion: nil)
    }

    // Igual que en Capacitor: con «Aceptar» devuelve lo escrito y con «Cancelar», nil (null en la
    // página).
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        // Capacitor usa prompt() por dentro, sin mostrar nada, para leer su configuración y las
        // cookies (native-bridge.js manda {"type":"CapacitorCookies.isEnabled"},
        // {"type":"CapacitorHttp"}…, en cada carga de la página): eso lo contesta el de Capacitor.
        if DialogosEnCastellano.esDeCapacitor(prompt) {
            let contesto: Void? = original?.webView?(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText,
                                                      initiatedByFrame: frame, completionHandler: completionHandler)
            if contesto == nil {
                completionHandler(nil)
            }
            return
        }
        guard let vc = dondeMostrar() else {
            completionHandler(nil)
            return
        }
        let alerta = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alerta.addTextField { campo in
            campo.text = defaultText
        }
        alerta.addAction(UIAlertAction(title: DialogosEnCastellano.cancelar, style: .default, handler: { _ in
            completionHandler(nil)
        }))
        alerta.addAction(UIAlertAction(title: DialogosEnCastellano.aceptar, style: .default, handler: { [weak alerta] _ in
            completionHandler(alerta?.textFields?.first?.text ?? defaultText)
        }))
        vc.present(alerta, animated: true, completion: nil)
    }

    // Un pedido interno de Capacitor: un objeto JSON cuyo "type" empieza con "Capacitor".
    private static func esDeCapacitor(_ texto: String) -> Bool {
        guard let datos = texto.data(using: .utf8),
              let json = (try? JSONSerialization.jsonObject(with: datos, options: [])) as? [String: Any],
              let tipo = json["type"] as? String else {
            return false
        }
        return tipo.hasPrefix("Capacitor")
    }
}
