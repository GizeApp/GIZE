import UIKit
import WebKit
import Capacitor
import StoreKit

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
// las ventanitas de aviso en castellano (DialogosEnCastellano, abajo) y suma el plugin de las
// compras con Apple (GizeComprasPlugin, abajo). Main.storyboard abre esta en lugar de la de
// Capacitor.
class GizeViewController: CAPBridgeViewController {
    // El WebView no retiene a su uiDelegate (lo guarda como weak): lo retiene la pantalla.
    private var dialogos: DialogosEnCastellano?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Acá Capacitor ya creó el WebView y le puso de uiDelegate su WebViewDelegationHandler.
        let dialogos = DialogosEnCastellano(pantalla: self, original: webView?.uiDelegate)
        self.dialogos = dialogos
        webView?.uiDelegate = dialogos
        // Las compras con Apple (la página lo usa como window.Capacitor.Plugins.GizeCompras).
        bridge?.registerPluginInstance(GizeComprasPlugin())
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

// Compras con Apple (In-App Purchase, StoreKit 2): los planes de coach son suscripciones mensuales
// que se renuevan solas (grupo «Plan de coach» en App Store Connect, IDs ar.com.gize.app.coach.p10…
// p500, ver docs/APPLE-COMPRAS.md). Lo usa app/core/compras-apple.js; lo que compra el coach lo
// verifica y lo guarda el servidor (supabase/functions/compras-apple). Sin paquetes de terceros.
//   productos({ ids })          → { productos: [{ id, nombre, descripcion, precio, periodo }] }
//                                  (precio: el que muestra Apple, con su moneda; periodo: "P1M")
//   comprar({ id, cuenta })     → { estado: "ok" | "cancelado" | "pendiente", jws, transaccion }
//                                  cuenta: el id del usuario de GIZE, va en la compra como
//                                  appAccountToken (el servidor controla que sea el suyo).
//   finalizar({ transaccion })  → le avisa a Apple que la compra ya quedó guardada.
//   vigentes()                  → { jws: [..] } las suscripciones vigentes de esta cuenta de Apple
//   restaurar()                 → lo mismo, después de pedirle a Apple que las vuelva a leer
//                                  ({ estado: "cancelado" } si no se quiso identificar)
//   administrar()               → abre la hoja de Apple para cambiar o cancelar la suscripción
//   evento "transaccion"        → { jws, transaccion }: compras que llegan solas (renovaciones, una
//                                  compra aprobada más tarde o hecha en otro dispositivo).
// La compra se finaliza (transaction.finish) recién cuando la app confirma que el servidor la
// guardó: si se corta en el medio (sin señal, la app se cierra), Apple la vuelve a mandar por
// Transaction.updates al abrir la app y se reintenta. Para una suscripción, no finalizarla no le
// quita nada al coach (el plan lo da el servidor) y nada se pierde.
@objc(GizeComprasPlugin)
public class GizeComprasPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GizeComprasPlugin"
    public let jsName = "GizeCompras"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "productos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "comprar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finalizar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vigentes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restaurar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "administrar", returnType: CAPPluginReturnPromise)
    ]

    // Compras verificadas por Apple que todavía no se finalizaron (por número de transacción).
    // Se tocan solo desde el hilo principal.
    private var porFinalizar: [UInt64: Transaction] = [:]
    private var escucha: Task<Void, Never>?

    override public func load() {
        // Apple manda acá las renovaciones, las compras aprobadas más tarde, las de otros
        // dispositivos y, al abrir la app, las que quedaron sin finalizar. Quedan guardadas hasta
        // que la página se suscribe (retainUntilConsumed).
        escucha = Task.detached { [weak self] in
            for await resultado in Transaction.updates {
                await self?.avisar(resultado)
            }
        }
    }

    deinit {
        escucha?.cancel()
    }

    @MainActor
    private func avisar(_ resultado: VerificationResult<Transaction>) {
        guard case .verified(let transaccion) = resultado else {
            return
        }
        porFinalizar[transaccion.id] = transaccion
        notifyListeners("transaccion", data: ["jws": resultado.jwsRepresentation, "transaccion": String(transaccion.id)], retainUntilConsumed: true)
    }

    private static func periodo(_ p: Product.SubscriptionPeriod) -> String {
        switch p.unit {
        case .day: return "P\(p.value)D"
        case .week: return "P\(p.value)W"
        case .month: return "P\(p.value)M"
        case .year: return "P\(p.value)Y"
        @unknown default: return ""
        }
    }

    @objc func productos(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let lista = try await Product.products(for: ids)
                let datos: [[String: Any]] = lista.map { p in
                    [
                        "id": p.id,
                        "nombre": p.displayName,
                        "descripcion": p.description,
                        "precio": p.displayPrice,
                        "periodo": p.subscription.map { GizeComprasPlugin.periodo($0.subscriptionPeriod) } ?? ""
                    ]
                }
                call.resolve(["productos": datos])
            } catch {
                call.reject("No se pudieron cargar los planes", nil, error)
            }
        }
    }

    @objc func comprar(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let texto = call.getString("cuenta"), let cuenta = UUID(uuidString: texto) else {
            call.reject("Faltan los datos de la compra")
            return
        }
        Task { @MainActor in
            do {
                guard let producto = try await Product.products(for: [id]).first else {
                    call.reject("Ese plan no está en el App Store")
                    return
                }
                let resultado = try await producto.purchase(options: [.appAccountToken(cuenta)])
                switch resultado {
                case .success(let verificacion):
                    switch verificacion {
                    case .verified(let transaccion):
                        self.porFinalizar[transaccion.id] = transaccion
                        call.resolve(["estado": "ok", "jws": verificacion.jwsRepresentation, "transaccion": String(transaccion.id)])
                    case .unverified(_, let error):
                        call.reject("Apple no pudo verificar la compra", nil, error)
                    }
                case .userCancelled:
                    call.resolve(["estado": "cancelado"])
                case .pending:
                    // Espera una aprobación (Compra Familiar, «Pedir la compra»): si se aprueba,
                    // llega por Transaction.updates.
                    call.resolve(["estado": "pendiente"])
                @unknown default:
                    call.resolve(["estado": "cancelado"])
                }
            } catch {
                call.reject("No se pudo completar la compra", nil, error)
            }
        }
    }

    @objc func finalizar(_ call: CAPPluginCall) {
        guard let id = UInt64(call.getString("transaccion") ?? "") else {
            call.reject("Falta la transacción")
            return
        }
        Task { @MainActor in
            if let transaccion = self.porFinalizar.removeValue(forKey: id) {
                await transaccion.finish()
            } else {
                for await resultado in Transaction.unfinished {
                    if case .verified(let transaccion) = resultado, transaccion.id == id {
                        await transaccion.finish()
                    }
                }
            }
            call.resolve()
        }
    }

    private static func suscripcionesVigentes() async -> [String] {
        var lista: [String] = []
        for await resultado in Transaction.currentEntitlements {
            if case .verified(let transaccion) = resultado, transaccion.productType == .autoRenewable {
                lista.append(resultado.jwsRepresentation)
            }
        }
        return lista
    }

    @objc func vigentes(_ call: CAPPluginCall) {
        Task {
            call.resolve(["jws": await GizeComprasPlugin.suscripcionesVigentes()])
        }
    }

    @objc func restaurar(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch StoreKitError.userCancelled {
                call.resolve(["estado": "cancelado", "jws": [String]()])
                return
            } catch {
                call.reject("No se pudieron restaurar las compras", nil, error)
                return
            }
            call.resolve(["estado": "ok", "jws": await GizeComprasPlugin.suscripcionesVigentes()])
        }
    }

    @objc func administrar(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let escena = self.bridge?.viewController?.view.window?.windowScene else {
                call.reject("No se pudo abrir la suscripción")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: escena)
                call.resolve()
            } catch {
                call.reject("No se pudo abrir la suscripción", nil, error)
            }
        }
    }
}
