// Compras con Google Play en la app de Android: el plugin nativo GizeCompras
// (android/app/src/main/java/ar/com/gize/app/GizeComprasPlugin.java). Sin emulador: se leen los
// archivos, como widget-android y dialogos-android; lo compila el workflow «App Android» (android.yml).
// Lo usa core/compras-google.js (planes de coach, screens/coach/plan.js), que llega apagado.
// - Gradle: Google Play Billing de la 8 en adelante (Play ya no acepta la 7 desde el 31/8/2026), con la
//   versión en variables.gradle y en las dependencias de la app.
// - MainActivity registra GizeComprasPlugin antes de super.onCreate, sin sacar los otros plugins propios.
// - El plugin se llama «GizeCompras» (como el de iPhone) y tiene productos, comprar, vigentes, restaurar,
//   finalizar, administrar y avisos, y el evento «compra» que espera hasta que la página escuche.
// - Usa la API vigente: enablePendingPurchases(PendingPurchasesParams…), enableAutoServiceReconnection,
//   includeSuspendedSubscriptions y el cambio de plan con SubscriptionProductReplacementParams (subir:
//   Google cobra la diferencia; bajar: lo pagado se vuelve días) más el token de la suscripción vieja;
//   nada de lo que se sacó en la 8 (SkuDetails, queryPurchaseHistory, enablePendingPurchases()).
// - La compra lleva la cuenta de GIZE (obfuscatedAccountId) y la hoja de Google se abre desde el hilo de
//   la pantalla. Se vende solo el plan base «mensual» sin ofertas. El plugin no se conecta a Google Play
//   al arrancar (ni al abrir la app ni al volver a ella: arma y conecta la biblioteca en un solo lugar,
//   que llaman solo los pedidos de la app), no reconoce compras por su cuenta (solo finalizar, cuando lo
//   pide la app), no escribe registros y no le pasa a la app el JSON ni la firma de Google (el servidor
//   lee la compra en Google). La compra abierta se contesta solo con una compra de su mismo producto.
// - Lo que acepta: los IDs de GIZE (los de core/compras-apple.js, que son los mismos en Google Play)
//   pasan; la cuenta es un UUID (un mail no); un token de Google pasa y uno con espacios o barras no.
//   Cada pedido que trae un producto, una cuenta o un token lo controla antes de hacer nada.
// - El manifiesto no saca el permiso com.android.vending.BILLING (lo suma la biblioteca).
// - Cuando esté core/compras-google.js: su plan base es el mismo y cada método que le pide al plugin existe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
// Comentarios de Java: los de bloque y las líneas que arrancan con // (no corta «https://play…»).
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const JAVA = 'android/app/src/main/java/ar/com/gize/app/';
const METODOS = ['productos', 'comprar', 'vigentes', 'restaurar', 'finalizar', 'administrar', 'avisos'];

// El cuerpo de un método del plugin: desde su firma hasta el método siguiente.
function cuerpo(java, nombre, tipo = 'void'){
  const i = java.indexOf(' ' + tipo + ' ' + nombre + '(');
  if (i < 0) return '';
  const fin = java.slice(i + 1).search(/\n {4}(@PluginMethod|@Override|private |public |protected |static )/);
  return fin < 0 ? java.slice(i) : java.slice(i, i + 1 + fin);
}
// Un Pattern.compile("…") de Java como RegExp de JS (los que usa el plugin valen igual en los dos).
function patron(java, nombre){
  const m = java.match(new RegExp('static final Pattern ' + nombre + ' = Pattern\\.compile\\("((?:[^"\\\\]|\\\\.)*)"\\);'));
  return m ? new RegExp(m[1].replace(/\\\\/g, '\\')) : null;
}

export default async function ({ t }){
  // ===== Gradle =====
  const vars = leer('android/variables.gradle');
  const ver = (vars.match(/^\s*billingVersion = '(\d+)\.(\d+)\.(\d+)'$/m) || []).slice(1).map(Number);
  t.ok(ver.length === 3, 'variables.gradle: billingVersion con una versión exacta');
  t.ok(ver[0] >= 8, 'Google Play Billing 8 o más (Play no acepta la 7 desde el 31/8/2026): ' + ver.join('.'));
  const gradle = leer('android/app/build.gradle');
  const deps = (gradle.match(/\ndependencies \{[\s\S]*?\n\}/) || [''])[0];
  t.ok(/^\s*implementation "com\.android\.billingclient:billing:\$billingVersion"$/m.test(deps), 'app/build.gradle: la biblioteca de Google Play Billing en las dependencias, con la versión de variables.gradle');
  t.ok(!/billing-ktx/.test(gradle), 'sin la variante de Kotlin (la app es Java)');

  // ===== MainActivity =====
  const main = sinComentarios(leer(JAVA + 'MainActivity.java'));
  const iSuper = main.indexOf('super.onCreate(');
  for (const p of ['RestTimerPlugin', 'WidgetPlugin', 'GizeComprasPlugin']){
    const i = main.indexOf('registerPlugin(' + p + '.class);');
    t.ok(i > 0 && i < iSuper, 'MainActivity registra ' + p + ' antes de super.onCreate');
  }

  // ===== El plugin =====
  const pj = sinComentarios(leer(JAVA + 'GizeComprasPlugin.java'));
  t.ok(pj, 'existe GizeComprasPlugin.java');
  t.ok(/@CapacitorPlugin\(name = "GizeCompras"\)\s*public class GizeComprasPlugin extends Plugin implements PurchasesUpdatedListener\b/.test(pj),
    'se llama «GizeCompras» y recibe las compras de Google (PurchasesUpdatedListener)');
  t.ok(/public let jsName = "GizeCompras"/.test(leer('ios/App/App/AppDelegate.swift')), 'el de iPhone se llama igual (la app los separa por la plataforma)');
  for (const m of METODOS)
    t.ok(new RegExp('@PluginMethod\\s+public void ' + m + '\\(PluginCall call\\)').test(pj), 'el plugin tiene ' + m + '()');
  t.ok(/notifyListeners\("compra", datos\(p\), true\)/.test(pj), 'las compras que llegan solas van por el evento «compra» y esperan a que la página escuche');
  t.ok(/public void onPurchasesUpdated\(BillingResult \w+, List<Purchase> \w+\)/.test(pj), 'contesta la compra en onPurchasesUpdated');

  // La API vigente de la biblioteca.
  t.ok(/BillingClient\.newBuilder\(getContext\(\)\)\s*\.setListener\(this\)\s*\.enablePendingPurchases\(PendingPurchasesParams\.newBuilder\(\)\.enableOneTimeProducts\(\)\.build\(\)\)\s*\.enableAutoServiceReconnection\(\)\s*\.build\(\)/.test(pj),
    'BillingClient con los pagos pendientes (PendingPurchasesParams) y la reconexión automática');
  t.ok(/\.setProductType\(BillingClient\.ProductType\.SUBS\)/.test(pj), 'pide suscripciones (SUBS)');
  t.ok(/queryProductDetailsAsync\([^;]*\(r, resultado\) ->[\s\S]*?resultado\.getProductDetailsList\(\)/.test(pj), 'lee los productos con QueryProductDetailsResult (la 8 en adelante)');
  t.ok(/\.includeSuspendedSubscriptions\(/.test(cuerpo(pj, 'leerCompras')) && /FeatureType\.INCLUDE_SUSPENDED_SUBSCRIPTIONS/.test(pj),
    'vigentes y restaurar traen también las suspendidas (si el Play Store del celular las sabe dar)');
  t.ok(/x\.put\("suspendida", p\.isSuspended\(\)\)/.test(pj), 'y dicen cuál está suspendida (no da el plan)');
  const viejo = pj.match(/querySkuDetailsAsync|SkuDetails|queryPurchaseHistory|enablePendingPurchases\(\)|setSubscriptionReplacementMode|ProrationMode|queryPurchasesAsync\(\s*(?:"|BillingClient\.)/g) || [];
  t.eq(viejo, [], 'nada de lo que se sacó o quedó en desuso en la 8 y la 8.1');
  t.ok(!/void load\(\)/.test(pj), 'no se conecta a Google Play al arrancar la app (recién con el primer pedido)');
  // Ni al volver a la app ni al armarse el plugin: la biblioteca se arma y se conecta solo en
  // conGooglePlay, y a conGooglePlay lo llaman solo los pedidos de la app.
  t.ok(!/void handleOn(Start|Restart|Resume|Pause|Stop|NewIntent|ActivityResult|ConfigurationChanged)\(|\bGizeComprasPlugin\s*\(/.test(pj),
    'no hace nada al abrir, volver o salir de la app (sin constructor propio ni handleOnStart/Resume…)');
  const conectar = cuerpo(pj, 'conGooglePlay', 'boolean');
  t.ok(/BillingClient\.newBuilder\(/.test(conectar) && /\.startConnection\(/.test(conectar), 'arma y conecta la biblioteca en conGooglePlay…');
  t.eq((pj.match(/BillingClient\.newBuilder\(|\.startConnection\(/g) || []).length, 2, '…y en ningún otro lado');
  const PEDIDOS = ['productos', 'comprar', 'leerCompras', 'finalizar', 'avisos'];
  const enPedidos = PEDIDOS.map(m => (cuerpo(pj, m).match(/\bconGooglePlay\(/g) || []).length);
  t.eq(enPedidos, [1, 1, 1, 1, 1], 'cada pedido que habla con Google Play pasa por conGooglePlay: ' + PEDIDOS.join(', '));
  t.eq((pj.match(/\bconGooglePlay\(/g) || []).length, 1 + PEDIDOS.length, 'y nadie más llama a conGooglePlay');
  t.ok(/leerCompras\(call, false\)/.test(cuerpo(pj, 'vigentes')) && /leerCompras\(call, true\)/.test(cuerpo(pj, 'restaurar'))
    && (pj.match(/\bleerCompras\(/g) || []).length === 3, 'leerCompras lo llaman solo vigentes y restaurar');

  // Comprar y cambiar de plan.
  const comprar = cuerpo(pj, 'comprar');
  t.ok(/static final String PLAN_BASE = "mensual";/.test(pj), 'el plan base de Play Console es «mensual»');
  t.ok(/PLAN_BASE\.equals\(o\.getBasePlanId\(\)\) && o\.getOfferId\(\) == null/.test(pj), 'vende el plan base sin ofertas de Google (sin prueba gratis ni descuentos)');
  t.ok(/\.setObfuscatedAccountId\(cuenta\)/.test(comprar) && /valido\(CUENTA, texto\)/.test(comprar), 'la compra lleva la cuenta de GIZE (obfuscatedAccountId), validada');
  t.ok(/\.setProductDetails\(producto\)\s*\.setOfferToken\(oferta\.getOfferToken\(\)\)/.test(comprar), 'compra la oferta del plan base');
  t.ok(/queryProductDetailsAsync\(consulta\(Collections\.singletonList\(id\)\)/.test(comprar), 'pide los datos del producto en cada compra (Google pide no guardarlos)');
  t.ok(/"subir"\.equals\(m\)\)\s*\{\s*modo = [\w.]*SubscriptionProductReplacementParams\.ReplacementMode\.CHARGE_PRORATED_PRICE;/.test(comprar),
    'cambiar a un plan más grande: cambia ya y Google cobra la diferencia (CHARGE_PRORATED_PRICE)');
  t.ok(/"bajar"\.equals\(m\)\)\s*\{\s*modo = [\w.]*SubscriptionProductReplacementParams\.ReplacementMode\.WITH_TIME_PRORATION;/.test(comprar),
    'cambiar a uno más chico: cambia ya y lo pagado se vuelve días (WITH_TIME_PRORATION)');
  t.ok(/\.setSubscriptionProductReplacementParams\(\s*BillingFlowParams\.ProductDetailsParams\.SubscriptionProductReplacementParams\.newBuilder\(\)\s*\.setOldProductId\(productoViejo\)\s*\.setReplacementMode\(modoCambio\)/.test(comprar),
    'el cambio de plan va por producto (SubscriptionProductReplacementParams, la 8.1 en adelante)');
  t.ok(/\.setSubscriptionUpdateParams\(BillingFlowParams\.SubscriptionUpdateParams\.newBuilder\(\)\s*\.setOldPurchaseToken\(tokenViejo\)/.test(comprar), 'con el token de la suscripción que reemplaza');
  t.ok(/runOnUiThread\(\(\) -> \{\s*BillingResult \w+ = c\.launchBillingFlow\(actividad, params\);/.test(comprar), 'la hoja de Google se abre desde el hilo de la pantalla');
  t.ok(/compraEnCurso != null\)\s*\{\s*call\.reject\(/.test(comprar), 'una compra por vez');
  t.ok(/if \(compraEnCurso != null && p\.getProducts\(\)\.contains\(productoEnCurso\)\)/.test(cuerpo(pj, 'onPurchasesUpdated')),
    'la compra abierta se contesta solo con una compra de ese producto (otra va por el evento «compra»)');
  const contestar = cuerpo(pj, 'onPurchasesUpdated') + cuerpo(pj, 'terminarCompra');
  for (const [estado, que] of [['"ok" : "pendiente"', 'comprada o pendiente'], ['"cancelado" : "ya"', 'cancelada o que ya era suya']])
    t.ok(contestar.includes(estado), 'la compra se contesta como ' + que);
  t.ok(/USER_CANCELED/.test(contestar) && /ITEM_ALREADY_OWNED/.test(contestar), 'entiende «cancelada» y «ya es tuya» de Google');

  // Lo que no hace.
  t.eq((pj.match(/\.acknowledgePurchase\(/g) || []).length, 1, 'reconoce compras en un solo lugar…');
  t.ok(/\.acknowledgePurchase\(/.test(cuerpo(pj, 'finalizar')), '…finalizar (cuando el servidor la guardó y no pudo reconocerla)');
  t.ok(!/getOriginalJson|getSignature/.test(pj), 'no le pasa a la app el JSON ni la firma de la compra (el servidor la lee en Google)');
  t.ok(!/\bLog\.\w+\(|System\.out|printStackTrace/.test(pj), 'no escribe registros (ni el token ni la cuenta)');
  t.ok(!/consumeAsync|ProductType\.INAPP/.test(pj), 'solo suscripciones: nada de compras sueltas');

  // Administrar en Google Play y el aviso de Google cuando no pudo cobrar.
  const admin = cuerpo(pj, 'administrar');
  t.ok(/Uri\.parse\("https:\/\/play\.google\.com\/store\/account\/subscriptions"\)/.test(admin)
    && /appendQueryParameter\("sku", producto\)\.appendQueryParameter\("package", getContext\(\)\.getPackageName\(\)\)/.test(admin),
    'administrar abre esa suscripción en Google Play (sku y package)');
  t.ok(/Intent\.ACTION_VIEW/.test(admin) && /catch \(ActivityNotFoundException/.test(admin), 'y si no se puede abrir, contesta con un error (no se cae)');
  t.ok(/addInAppMessageCategoryToShow\(InAppMessageParams\.InAppMessageCategoryId\.TRANSACTIONAL\)/.test(cuerpo(pj, 'avisos')), 'avisos muestra el aviso de Google para arreglar el pago');
  t.ok(/runOnUiThread\(\(\) -> \{\s*BillingResult \w+ = c\.showInAppMessages\(actividad, params,/.test(cuerpo(pj, 'avisos')), 'y lo muestra desde el hilo de la pantalla');

  // ===== Lo que acepta =====
  const PRODUCTO = patron(pj, 'PRODUCTO'), CUENTA = patron(pj, 'CUENTA'), TOKEN = patron(pj, 'TOKEN');
  t.ok(PRODUCTO && CUENTA && TOKEN, 'el plugin valida el producto, la cuenta y el token');
  // Y lo controla en cada pedido, antes de hablar con Google Play o abrir algo.
  const rechaza = (metodo, cond) => new RegExp('if \\(' + cond.replace(/[()|]/g, '\\$&') + '\\) \\{\\s*call\\.reject\\(').test(cuerpo(pj, metodo));
  t.ok(/if \(id instanceof String && valido\(PRODUCTO, \(String\) id\) && !ids\.contains\(id\)\)/.test(cuerpo(pj, 'productos'))
    && /ids\.size\(\) < MAXIMO_IDS/.test(cuerpo(pj, 'productos')), 'productos: solo IDs válidos, sin repetir y con tope');
  t.ok(rechaza('comprar', '!valido(PRODUCTO, id) || !valido(CUENTA, texto)'), 'comprar: rechaza un producto o una cuenta que no valen');
  t.ok(rechaza('comprar', '!valido(TOKEN, viejoToken) || !valido(PRODUCTO, viejoProducto) || modo == 0'), 'comprar: y un cambio de plan sin token, producto o modo válidos');
  t.ok(rechaza('finalizar', '!valido(TOKEN, token)'), 'finalizar: rechaza un token que no vale');
  t.ok(rechaza('administrar', '!valido(PRODUCTO, producto)'), 'administrar: rechaza un producto que no es de GIZE');
  if (PRODUCTO && CUENTA && TOKEN){
    const apple = leer('app/core/compras-apple.js');
    const ids = [...apple.matchAll(/"(ar\.com\.gize\.app\.[\w.]+)"/g)].map(m => m[1]);
    t.ok(ids.length >= 7, 'core/compras-apple.js tiene los 6 planes e IA Plus: ' + ids.join(', '));
    t.eq(ids.filter(id => !PRODUCTO.test(id)), [], 'los IDs de GIZE (los mismos en Google Play) pasan');
    t.eq(['', 'Ar.com.gize', 'ar com', '../coach', 'ar.com.gize.app/coach', '.p10', 'a'.repeat(151)].filter(x => PRODUCTO.test(x)), [], 'un ID raro no pasa');
    t.ok(CUENTA.test('33333333-3333-3333-3333-333333333333') && CUENTA.test('0f8fad5b-d9cb-469f-a165-70867728950e'), 'la cuenta de GIZE (un UUID) pasa');
    t.eq(['coach@prueba.test', 'Juan Perez', '', '0f8fad5b-d9cb-469f-a165-70867728950e0', '0f8fad5bd9cb469fa16570867728950e'].filter(x => CUENTA.test(x)), [], 'un mail, un nombre o algo que no es un UUID no pasa');
    t.ok(TOKEN.test('opaqueToken.AO-J1OxLp_Rz9_kQ-3d.x'), 'un token de Google pasa');
    t.eq(['', 'a b', 'a/b', 'a"b', 'x'.repeat(1001)].filter(x => TOKEN.test(x)), [], 'un token vacío, con espacios, barras o comillas, o larguísimo, no pasa');
  }

  // ===== Manifiesto =====
  const man = leer('android/app/src/main/AndroidManifest.xml');
  t.ok(!/com\.android\.vending\.BILLING"[^>]*tools:node="remove"/.test(man), 'el manifiesto no saca el permiso de Google Play Billing (lo suma la biblioteca)');

  // ===== La app (cuando esté) =====
  const app = leer('app/core/compras-google.js');
  if (app){
    const base = (app.match(/PLAN_BASE\s*=\s*["']([^"']+)["']/) || [])[1];
    t.eq(base, 'mensual', 'core/compras-google.js usa el mismo plan base');
    const nombres = ['pluginGoogle\\(\\)'].concat([...app.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*pluginGoogle\(\)/g)].map(m => m[1]));
    const pide = new Set();
    for (const n of nombres) for (const m of app.matchAll(new RegExp('(?:^|[^\\w.])' + n + '\\.(\\w+)\\(', 'g'))) pide.add(m[1]);
    t.ok(pide.size > 0, 'se encontró qué le pide core/compras-google.js al plugin');
    t.eq([...pide].filter(m => !METODOS.includes(m) && !['addListener', 'removeAllListeners'].includes(m)), [], 'cada método que pide core/compras-google.js existe en el plugin: ' + [...pide].join(', '));
  }
}
