package ar.com.gize.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.InAppMessageParams;
import com.android.billingclient.api.InAppMessageResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * Compras con Google Play (Play Billing Library, la versión está en android/variables.gradle): los
 * planes de coach e IA Plus son suscripciones mensuales que se renuevan solas, con los mismos IDs que
 * en el App Store (ar.com.gize.app.coach.p10… p500 y ar.com.gize.app.iaplus.mensual) y un solo plan
 * base, «mensual», sin ofertas (la prueba de GIZE la da el servidor, no Google).
 * Se llama igual que el plugin de iPhone (GizeCompras, ios/App/App/AppDelegate.swift), cada uno con su
 * código: la app los separa por la plataforma. Lo que compra el coach lo verifica, lo guarda y lo
 * reconoce el servidor (supabase/functions/compras-google): este plugin no decide nada, no reconoce
 * nada por su cuenta y no manda nada a ningún lado. Sin paquetes de terceros.
 * Lo usa app/core/compras-google.js (planes de coach), que llega apagado (interruptor del panel): no
 * se conecta a Google Play hasta el primer pedido.
 *   productos({ ids })      → { productos: [{ id, nombre, descripcion, precio, periodo }] }
 *                              (precio: el texto que da Google, con su moneda; periodo: "P1M")
 *   comprar({ id, cuenta, reemplazo })
 *                           → { estado: "ok" | "pendiente", token, producto, orden, reconocida }
 *                              o { estado: "cancelado" } o { estado: "ya" } (Google dice que esa
 *                              suscripción ya es de esta cuenta de Google: la app la recupera con vigentes).
 *                              cuenta: el id del usuario de GIZE (va en la compra como
 *                              obfuscatedAccountId y el servidor controla que sea el suyo).
 *                              reemplazo (cambiar de plan): { token, producto, modo: "subir" | "bajar" }
 *                              con el token y el producto de la suscripción que ya tiene.
 *   vigentes()              → { compras: [{ token, producto, estado: "comprada" | "pendiente",
 *                              reconocida, suspendida, renueva, cuenta, orden }] } (también las
 *                              suspendidas: Google no pudo cobrar o están en pausa; no dan el plan)
 *   restaurar()             → { estado: "ok", compras: [...] } (lo mismo: Google Play ya las tiene al día)
 *   finalizar({ token })    → reconoce la compra (acknowledge). Solo cuando el servidor la guardó y no
 *                              pudo reconocerla él: Google devuelve la plata si nadie la reconoce en 3 días.
 *   administrar({ producto }) → abre esa suscripción en Google Play (cancelar, cambiar el medio de pago).
 *   avisos()                → el aviso propio de Google cuando no pudo cobrar: { estado: "nada" } o
 *                              { estado: "actualizada", token } (se arregló el pago).
 *   evento "compra"         → lo mismo que cada compra de vigentes: las que llegan solas (una pendiente
 *                              que se acreditó, una compra que no pidió la app). Quedan guardadas hasta que
 *                              la página se suscribe (retainUntilConsumed).
 * Sin Google Play (celular sin Play Store, emulador) los pedidos se rechazan y la app sigue andando.
 */
@CapacitorPlugin(name = "GizeCompras")
public class GizeComprasPlugin extends Plugin implements PurchasesUpdatedListener {
    // El plan base de cada suscripción en Play Console (mismo ID en todas).
    static final String PLAN_BASE = "mensual";
    // Lo que Google acepta como ID de producto, un token de compra y la cuenta de GIZE (el id de la
    // persona en Supabase: un UUID, nunca un mail ni otro dato suyo).
    static final Pattern PRODUCTO = Pattern.compile("^[a-z0-9][a-z0-9._]{0,149}$");
    static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9._-]{1,1000}$");
    static final Pattern CUENTA = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    // Más productos que esto no son de GIZE (6 planes e IA Plus).
    private static final int MAXIMO_IDS = 20;
    private static final String SIN_GOOGLE_PLAY = "Google Play no está disponible en este celular";

    // Se crea con el primer pedido. Mientras se conecta esa primera vez, los pedidos esperan en la
    // lista; después la biblioteca se vuelve a conectar sola si hace falta (enableAutoServiceReconnection).
    private BillingClient cliente;
    private final List<Consumer<BillingClient>> enEspera = new ArrayList<>();
    private boolean conectando = false;
    // La compra abierta (una por vez) y su producto: la contesta onPurchasesUpdated.
    private PluginCall compraEnCurso;
    private String productoEnCurso;

    private static boolean valido(Pattern p, String s) {
        return s != null && p.matcher(s).matches();
    }

    /** Corre op con Google Play conectado (o intentándolo). false: no se pudo ni empezar. */
    private boolean conGooglePlay(Consumer<BillingClient> op) {
        BillingClient nuevo = null;
        BillingClient listo;
        synchronized (enEspera) {
            if (cliente == null) {
                try {
                    nuevo = BillingClient.newBuilder(getContext())
                            .setListener(this)
                            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                            .enableAutoServiceReconnection()
                            .build();
                } catch (RuntimeException e) {
                    return false;
                }
                cliente = nuevo;
                conectando = true;
                enEspera.add(op);
            } else if (conectando) {
                enEspera.add(op);
                return true;
            }
            listo = cliente;
        }
        if (nuevo == null) {
            op.accept(listo);
            return true;
        }
        nuevo.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult resultado) {
                // Aunque no se haya podido conectar, cada pedido sigue: la biblioteca prueba de
                // nuevo y, si tampoco puede, lo contesta con el error.
                soltarEnEspera();
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Google pide no llamar a startConnection acá: se reconecta sola en el próximo pedido.
                soltarEnEspera();
            }
        });
        return true;
    }

    private void soltarEnEspera() {
        List<Consumer<BillingClient>> lista;
        BillingClient c;
        synchronized (enEspera) {
            conectando = false;
            lista = new ArrayList<>(enEspera);
            enEspera.clear();
            c = cliente;
        }
        if (c == null) return;
        for (Consumer<BillingClient> op : lista) op.accept(c);
    }

    // El código del error para la app: «google-» y el número que da la biblioteca.
    private static String codigo(BillingResult r) {
        return "google-" + r.getResponseCode();
    }

    private static void rechazar(PluginCall call, String mensaje, BillingResult r) {
        call.reject(mensaje, codigo(r));
    }

    private static QueryProductDetailsParams consulta(List<String> ids) {
        List<QueryProductDetailsParams.Product> lista = new ArrayList<>();
        for (String id : ids) {
            lista.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build());
        }
        return QueryProductDetailsParams.newBuilder().setProductList(lista).build();
    }

    /** La oferta del plan base «mensual» tal cual, sin ofertas de Google encima. */
    private static ProductDetails.SubscriptionOfferDetails planBase(ProductDetails p) {
        List<ProductDetails.SubscriptionOfferDetails> ofertas = p == null ? null : p.getSubscriptionOfferDetails();
        if (ofertas == null) return null;
        for (ProductDetails.SubscriptionOfferDetails o : ofertas) {
            if (PLAN_BASE.equals(o.getBasePlanId()) && o.getOfferId() == null) return o;
        }
        return null;
    }

    /** Lo que se cobra cada mes: la última fase del plan (el plan base sin ofertas tiene una sola). */
    private static ProductDetails.PricingPhase precioMensual(ProductDetails.SubscriptionOfferDetails o) {
        List<ProductDetails.PricingPhase> fases = o == null ? null : o.getPricingPhases().getPricingPhaseList();
        return fases == null || fases.isEmpty() ? null : fases.get(fases.size() - 1);
    }

    /** Una compra para la app: solo el token y lo que hace falta para la pantalla (lo demás lo lee el servidor). */
    private static JSObject datos(Purchase p) {
        JSObject x = new JSObject();
        List<String> productos = p.getProducts();
        x.put("token", p.getPurchaseToken());
        x.put("producto", productos.isEmpty() ? null : productos.get(0));
        x.put("estado", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "comprada" : "pendiente");
        x.put("reconocida", p.isAcknowledged());
        x.put("suspendida", p.isSuspended());
        x.put("renueva", p.isAutoRenewing());
        AccountIdentifiers cuenta = p.getAccountIdentifiers();
        x.put("cuenta", cuenta == null ? null : cuenta.getObfuscatedAccountId());
        x.put("orden", p.getOrderId());
        return x;
    }

    @PluginMethod
    public void productos(PluginCall call) {
        JSArray pedidos = call.getArray("ids");
        List<String> ids = new ArrayList<>();
        for (int i = 0; pedidos != null && i < pedidos.length() && ids.size() < MAXIMO_IDS; i++) {
            Object id = pedidos.opt(i);
            if (id instanceof String && valido(PRODUCTO, (String) id) && !ids.contains(id)) ids.add((String) id);
        }
        if (ids.isEmpty()) {
            call.reject("Faltan los planes");
            return;
        }
        boolean ok = conGooglePlay(c -> c.queryProductDetailsAsync(consulta(ids), (r, resultado) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                rechazar(call, "No se pudieron cargar los planes", r);
                return;
            }
            JSArray lista = new JSArray();
            for (ProductDetails p : resultado.getProductDetailsList()) {
                ProductDetails.PricingPhase fase = precioMensual(planBase(p));
                if (fase == null) continue;
                JSObject x = new JSObject();
                x.put("id", p.getProductId());
                x.put("nombre", p.getName());
                x.put("descripcion", p.getDescription());
                x.put("precio", fase.getFormattedPrice());
                x.put("periodo", fase.getBillingPeriod());
                lista.put(x);
            }
            JSObject out = new JSObject();
            out.put("productos", lista);
            call.resolve(out);
        }));
        if (!ok) call.reject(SIN_GOOGLE_PLAY, "sin-google-play");
    }

    @PluginMethod
    public void comprar(PluginCall call) {
        String id = call.getString("id");
        String texto = call.getString("cuenta");
        if (!valido(PRODUCTO, id) || !valido(CUENTA, texto)) {
            call.reject("Faltan los datos de la compra");
            return;
        }
        String cuenta = texto.toLowerCase(Locale.ROOT);
        JSObject reemplazo = call.getObject("reemplazo");
        String viejoToken = null;
        String viejoProducto = null;
        int modo = 0;
        if (reemplazo != null) {
            viejoToken = reemplazo.getString("token");
            viejoProducto = reemplazo.getString("producto");
            // Más grande: cambia ya y Google cobra la diferencia del mes. Más chico: cambia ya y lo
            // que ya pagó se vuelve más días del plan nuevo. Es la API de la 8.1 en adelante
            // (SubscriptionUpdateParams.setSubscriptionReplacementMode quedó en desuso).
            String m = reemplazo.getString("modo");
            if ("subir".equals(m)) {
                modo = BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.ReplacementMode.CHARGE_PRORATED_PRICE;
            } else if ("bajar".equals(m)) {
                modo = BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.ReplacementMode.WITH_TIME_PRORATION;
            }
            if (!valido(TOKEN, viejoToken) || !valido(PRODUCTO, viejoProducto) || modo == 0) {
                call.reject("Faltan los datos del plan que tenés");
                return;
            }
        }
        synchronized (this) {
            if (compraEnCurso != null) {
                call.reject("Ya hay una compra abierta");
                return;
            }
            compraEnCurso = call;
            productoEnCurso = id;
        }
        final String tokenViejo = viejoToken;
        final String productoViejo = viejoProducto;
        final int modoCambio = modo;
        // Los datos del producto se piden de nuevo en cada compra: Google pide no guardarlos (con unos
        // viejos launchBillingFlow puede fallar).
        boolean ok = conGooglePlay(c -> c.queryProductDetailsAsync(consulta(Collections.singletonList(id)), (r, resultado) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                fallarCompra("No se pudo cargar el plan de Google Play", codigo(r));
                return;
            }
            ProductDetails producto = null;
            for (ProductDetails p : resultado.getProductDetailsList()) {
                if (id.equals(p.getProductId())) producto = p;
            }
            ProductDetails.SubscriptionOfferDetails oferta = planBase(producto);
            Activity actividad = getActivity();
            if (oferta == null) {
                fallarCompra("Ese plan no está en Google Play", "sin-plan");
                return;
            }
            if (actividad == null) {
                fallarCompra("No se pudo abrir Google Play", "sin-pantalla");
                return;
            }
            BillingFlowParams params;
            try {
                BillingFlowParams.ProductDetailsParams.Builder item = BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(producto)
                        .setOfferToken(oferta.getOfferToken());
                BillingFlowParams.Builder compra = BillingFlowParams.newBuilder().setObfuscatedAccountId(cuenta);
                if (tokenViejo != null) {
                    item.setSubscriptionProductReplacementParams(
                            BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.newBuilder()
                                    .setOldProductId(productoViejo)
                                    .setReplacementMode(modoCambio)
                                    .build());
                    compra.setSubscriptionUpdateParams(BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                            .setOldPurchaseToken(tokenViejo)
                            .build());
                }
                params = compra.setProductDetailsParamsList(Collections.singletonList(item.build())).build();
            } catch (RuntimeException e) {
                fallarCompra("No se pudo armar la compra", "datos");
                return;
            }
            // La hoja de Google se abre desde el hilo de la pantalla. El resultado llega a
            // onPurchasesUpdated; acá solo si ni siquiera se pudo abrir.
            actividad.runOnUiThread(() -> {
                BillingResult abrir = c.launchBillingFlow(actividad, params);
                if (abrir.getResponseCode() != BillingClient.BillingResponseCode.OK) terminarCompra(abrir);
            });
        }));
        if (!ok) fallarCompra(SIN_GOOGLE_PLAY, "sin-google-play");
    }

    /** Saca la compra abierta para contestarla (null si no hay ninguna). */
    private synchronized PluginCall tomarCompra() {
        PluginCall call = compraEnCurso;
        compraEnCurso = null;
        productoEnCurso = null;
        return call;
    }

    private void fallarCompra(String mensaje, String codigo) {
        PluginCall call = tomarCompra();
        if (call != null) call.reject(mensaje, codigo);
    }

    /** La compra abierta terminó sin una compra para contestar: cancelada, ya era suya o un error. */
    private void terminarCompra(BillingResult r) {
        int codigo = r.getResponseCode();
        if (codigo == BillingClient.BillingResponseCode.USER_CANCELED || codigo == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED
                || codigo == BillingClient.BillingResponseCode.OK) {
            PluginCall call = tomarCompra();
            if (call == null) return;
            JSObject x = new JSObject();
            x.put("estado", codigo == BillingClient.BillingResponseCode.USER_CANCELED ? "cancelado" : "ya");
            call.resolve(x);
        } else {
            fallarCompra("No se pudo completar la compra", codigo(r));
        }
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> compras) {
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            terminarCompra(r);
            return;
        }
        if (compras == null || compras.isEmpty()) {
            // Google dijo que salió bien pero sin la compra: que la app la busque con vigentes.
            terminarCompra(r);
            return;
        }
        for (Purchase p : compras) {
            PluginCall call = null;
            String pedido = null;
            synchronized (this) {
                // Solo contesta la compra abierta si es su producto: otra (una pendiente que se
                // acreditó justo ahora) va por el evento y la abierta sigue esperando.
                if (compraEnCurso != null && p.getProducts().contains(productoEnCurso)) {
                    pedido = productoEnCurso;
                    call = tomarCompra();
                }
            }
            if (call != null) {
                JSObject x = datos(p);
                x.put("estado", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "ok" : "pendiente");
                x.put("producto", pedido);
                call.resolve(x);
            } else {
                notifyListeners("compra", datos(p), true);
            }
        }
    }

    @PluginMethod
    public void vigentes(PluginCall call) {
        leerCompras(call, false);
    }

    @PluginMethod
    public void restaurar(PluginCall call) {
        leerCompras(call, true);
    }

    private void leerCompras(PluginCall call, boolean conEstado) {
        boolean ok = conGooglePlay(c -> {
            // Las suspendidas solo si el Play Store del celular ya las sabe dar (si no, el pedido entero fallaría).
            boolean suspendidas = c.isFeatureSupported(BillingClient.FeatureType.INCLUDE_SUSPENDED_SUBSCRIPTIONS).getResponseCode()
                    == BillingClient.BillingResponseCode.OK;
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .includeSuspendedSubscriptions(suspendidas)
                    .build();
            c.queryPurchasesAsync(params, (r, compras) -> {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    rechazar(call, "No se pudieron leer tus compras de Google Play", r);
                    return;
                }
                JSArray lista = new JSArray();
                for (Purchase p : compras) lista.put(datos(p));
                JSObject out = new JSObject();
                if (conEstado) out.put("estado", "ok");
                out.put("compras", lista);
                call.resolve(out);
            });
        });
        if (!ok) call.reject(SIN_GOOGLE_PLAY, "sin-google-play");
    }

    @PluginMethod
    public void finalizar(PluginCall call) {
        String token = call.getString("token");
        if (!valido(TOKEN, token)) {
            call.reject("Falta la compra");
            return;
        }
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build();
        boolean ok = conGooglePlay(c -> c.acknowledgePurchase(params, r -> {
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) call.resolve();
            else rechazar(call, "No se pudo confirmar la compra en Google Play", r);
        }));
        if (!ok) call.reject(SIN_GOOGLE_PLAY, "sin-google-play");
    }

    @PluginMethod
    public void administrar(PluginCall call) {
        String producto = call.getString("producto");
        Uri.Builder url = Uri.parse("https://play.google.com/store/account/subscriptions").buildUpon();
        if (producto != null) {
            if (!valido(PRODUCTO, producto)) {
                call.reject("Ese plan no es de GIZE");
                return;
            }
            url.appendQueryParameter("sku", producto).appendQueryParameter("package", getContext().getPackageName());
        }
        Intent abrir = new Intent(Intent.ACTION_VIEW, url.build());
        Activity actividad = getActivity();
        try {
            if (actividad != null) {
                actividad.startActivity(abrir);
            } else {
                abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(abrir);
            }
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No se pudo abrir Google Play");
        }
    }

    @PluginMethod
    public void avisos(PluginCall call) {
        boolean ok = conGooglePlay(c -> {
            Activity actividad = getActivity();
            if (actividad == null) {
                call.reject("No se pudo abrir Google Play");
                return;
            }
            InAppMessageParams params = InAppMessageParams.newBuilder()
                    .addInAppMessageCategoryToShow(InAppMessageParams.InAppMessageCategoryId.TRANSACTIONAL)
                    .build();
            actividad.runOnUiThread(() -> {
                BillingResult r = c.showInAppMessages(actividad, params, resultado -> {
                    JSObject x = new JSObject();
                    if (resultado.getResponseCode() == InAppMessageResult.InAppMessageResponseCode.SUBSCRIPTION_STATUS_UPDATED) {
                        x.put("estado", "actualizada");
                        x.put("token", resultado.getPurchaseToken());
                    } else {
                        x.put("estado", "nada");
                    }
                    call.resolve(x);
                });
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) rechazar(call, "No se pudo mostrar el aviso de Google Play", r);
            });
        });
        if (!ok) call.reject(SIN_GOOGLE_PLAY, "sin-google-play");
    }

    @Override
    protected void handleOnDestroy() {
        BillingClient c;
        synchronized (enEspera) {
            c = cliente;
            cliente = null;
            conectando = false;
            enEspera.clear();
        }
        if (c != null) c.endConnection();
    }
}
