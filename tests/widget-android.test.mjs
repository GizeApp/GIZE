// Widget «GIZE de hoy» en Android (sin emulador: se leen los archivos, como dialogos-android).
// - Manifiesto: el <receiver .GizeWidget> sin exportar, con APPWIDGET_UPDATE, el cambio de hora y
//   de zona horaria y su meta-data; sin <service> (tests/cardio-android.test.mjs) ni permisos de
//   segundo plano.
// - res/xml/gize_widget_info.xml: 4×2 que se achica a 2×2, sin actualizarse solo (updatePeriodMillis
//   0) y solo en la pantalla de inicio (no en la bloqueada).
// - Layouts: solo vistas que admite un widget; cada recurso que nombran (y cada R.… del Java) existe;
//   lo que toca el Java en el chico está en el chico.
// - MainActivity registra WidgetPlugin antes de super.onCreate; el plugin se llama «GizeWidget» y
//   tiene guardar, borrar, info y agregar, y guarda donde lee el widget.
// - Los toques abren MainActivity (explícito) con gize://widget/{hoy,pasos,racha,entreno} y
//   FLAG_IMMUTABLE; la alarma de la medianoche no es exacta ni despierta al celular.
// - Contrato con la app: las claves que lee el Java son las del diseño ({v, dias, sinDatos} y cada
//   día {pasos:{txt,pie,pct}, racha:{txt,pie,prendida}, entreno:{titulo,nombre,detalle,hecho,dia},
//   aviso: null o {titulo,texto,pie}}) y, si ya está app/core/widgetdatos.js, las de su CLAVES_WIDGET
//   y las de un JSON armado con él. Con aviso (coach, gimnasio, sin datos) se ve solo el aviso.
// - Textos: «GIZE de hoy» y nada de precios ni tiendas (reglas de AGENTS.md).
// - El recorrido del emulador (scripts/android-recorrido.mjs) agrega el widget y lo fotografía.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = path.join(ROOT, 'android/app/src/main');
const leer = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
// Comentarios de Java: los de bloque y las líneas que arrancan con // (no corta «gize://widget/»).
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sinComentariosXml = s => s.replace(/<!--[\s\S]*?-->/g, '');
const JAVA = 'android/app/src/main/java/ar/com/gize/app/';
const RES = 'android/app/src/main/res/';

// Lo que manda la app (CLAVES_WIDGET en app/core/widgetdatos.js). El aviso lo sumó la rama
// widget-datos al diseño: un día de coach, de gimnasio o sin datos muestra solo eso.
const CONTRATO = {
  datos: ['v', 'dias', 'sinDatos'],
  dia: ['pasos', 'racha', 'entreno', 'aviso'],
  pasos: ['txt', 'pie', 'pct'],
  racha: ['txt', 'pie', 'prendida'],
  entreno: ['titulo', 'nombre', 'detalle', 'hecho', 'dia'],
  aviso: ['titulo', 'texto', 'pie'],
};

// Recursos que existen en res/: strings y colores de values/*.xml, y archivos por carpeta.
function recursos(){
  const r = { string: new Set(), color: new Set(), drawable: new Set(), layout: new Set(), xml: new Set(), mipmap: new Set(), textos: {} };
  for (const d of fs.readdirSync(path.join(MAIN, 'res'))){
    const dir = path.join(MAIN, 'res', d);
    for (const f of fs.readdirSync(dir)){
      const tipo = d.split('-')[0], nombre = f.replace(/\.(xml|png|webp|jpg)$/, '');
      if (tipo === 'values'){
        const s = fs.readFileSync(path.join(dir, f), 'utf8');
        for (const m of s.matchAll(/<(string|color)\s+name="([^"]+)"[^>]*>([^<]*)</g)){ r[m[1]].add(m[2]); if (m[1] === 'string' && d === 'values') r.textos[m[2]] = m[3]; }
      } else if (r[tipo]) r[tipo].add(nombre);
    }
  }
  return r;
}

export default async function ({ base, t }){
  const man = sinComentariosXml(leer('android/app/src/main/AndroidManifest.xml'));
  const main = sinComentarios(leer(JAVA + 'MainActivity.java'));
  const wj = sinComentarios(leer(JAVA + 'GizeWidget.java'));
  const pj = sinComentarios(leer(JAVA + 'WidgetPlugin.java'));
  const info = sinComentariosXml(leer(RES + 'xml/gize_widget_info.xml'));
  const med = sinComentariosXml(leer(RES + 'layout/widget_gize.xml'));
  const chi = sinComentariosXml(leer(RES + 'layout/widget_gize_chico.xml'));
  t.ok(wj && pj && info && med && chi, 'existen GizeWidget.java, WidgetPlugin.java, gize_widget_info.xml y los dos layouts');
  const res = recursos();

  // ===== Manifiesto =====
  const rec = (man.match(/<receiver\b[^>]*android:name="\.GizeWidget"[\s\S]*?<\/receiver>/) || [''])[0];
  t.ok(rec, 'el manifiesto declara el <receiver .GizeWidget>');
  const abre = (rec.match(/<receiver\b[^>]*>/) || [''])[0];
  t.ok(/android:exported="false"/.test(abre), 'el receiver no se exporta (otras apps no lo pueden llamar)');
  t.ok(/android:label="@string\/widget_nombre"/.test(abre), 'el receiver tiene el nombre de la lista de widgets');
  const acciones = [...rec.matchAll(/<action android:name="([^"]+)"/g)].map(m => m[1]).sort();
  t.eq(acciones, ['android.appwidget.action.APPWIDGET_UPDATE', 'android.intent.action.TIMEZONE_CHANGED', 'android.intent.action.TIME_SET'], 'escucha APPWIDGET_UPDATE y los cambios de hora y de zona horaria (transmisiones que Android deja recibir), nada más');
  t.ok(/<meta-data\s+android:name="android\.appwidget\.provider"\s+android:resource="@xml\/gize_widget_info"\s*\/>/.test(rec), 'meta-data android.appwidget.provider → @xml/gize_widget_info');
  t.ok(!/<service\b/.test(man), 'sin <service> en el manifiesto (ni RemoteViewsService ni WorkManager)');
  const permisos = [...man.matchAll(/<uses-permission\b[^>]*>/g)].map(m => m[0]).filter(p => !/tools:node="remove"/.test(p));
  for (const x of ['RECEIVE_BOOT_COMPLETED', 'WAKE_LOCK', 'FOREGROUND_SERVICE', 'USE_EXACT_ALARM', 'BIND_APPWIDGET', 'READ_HEALTH_DATA_IN_BACKGROUND'])
    t.ok(!permisos.some(p => p.includes(x)), 'el widget no suma el permiso ' + x);
  t.ok(!/WIDGET_DIA/.test(rec), 'la alarma de la medianoche no está en el intent-filter (llega directo a la clase)');

  // ===== Proveedor (res/xml/gize_widget_info.xml) =====
  const attr = n => (info.match(new RegExp('android:' + n + '="([^"]*)"')) || [])[1];
  t.ok(/<appwidget-provider\b/.test(info), 'gize_widget_info.xml es un appwidget-provider');
  t.eq(attr('updatePeriodMillis'), '0', 'no se actualiza solo cada tanto (updatePeriodMillis 0: lo redibujan la app y la alarma)');
  t.eq(attr('widgetCategory'), 'home_screen', 'solo en la pantalla de inicio (la bloqueada mostraría los datos a cualquiera)');
  t.eq([attr('minWidth'), attr('minHeight'), attr('targetCellWidth'), attr('targetCellHeight')], ['250dp', '110dp', '4', '2'], 'sale mediano (4×2)');
  t.eq([attr('minResizeWidth'), attr('minResizeHeight'), attr('resizeMode')], ['110dp', '110dp', 'horizontal|vertical'], 'se achica hasta el chico (2×2) y no a una sola fila');
  t.eq(attr('initialLayout'), '@layout/widget_gize', 'arranca con el mediano');
  t.eq(attr('previewLayout'), '@layout/widget_gize', 'la vista previa es el mediano con su ejemplo');
  t.eq(attr('description'), '@string/widget_descripcion', 'tiene su descripción');

  // ===== Layouts =====
  const PERMITIDAS = ['LinearLayout', 'FrameLayout', 'TextView', 'ImageView', 'ProgressBar'];
  for (const [nombre, x] of [['widget_gize', med], ['widget_gize_chico', chi]]){
    const vistas = [...new Set([...x.matchAll(/<([A-Za-z.]+)[\s>]/g)].map(m => m[1]).filter(v => v !== '?xml'))];
    t.eq(vistas.filter(v => !PERMITIDAS.includes(v)), [], nombre + ': solo vistas que admite un widget (' + PERMITIDAS.join(', ') + ')');
    t.ok(/android:id="@\+id\/widget_raiz"[\s\S]*?android:background="@drawable\/widget_fondo"/.test(x), nombre + ': con el fondo de la marca');
  }
  // Que los textos entren (visto con layoutlib, el motor de la vista previa de Android Studio, en
  // 4×2 de 250 a 340 dp y 2×2 de 110 a 150 dp): el número de pasos se partía en dos líneas
  // («12.87» / «4»), en 4×2 se cortaban la hora de «de 10.000 · 14:32» y «días seguidos», y en el
  // chico el aviso quedaba en «Tu panel de…».
  const vista = (x, id) => (x.match(new RegExp('android:id="@\\+id/' + id + '"[^>]*/>')) || [''])[0];
  for (const [nombre, x] of [['widget_gize', med], ['widget_gize_chico', chi]]){
    const n = vista(x, 'widget_pasos_txt');
    t.ok(/android:maxLines="1"/.test(n) && /android:autoSizeTextType="uniform"/.test(n) && /android:layout_height="\d+dp"/.test(n) && !/android:layout_width="wrap_content"/.test(n),
      nombre + ': el número de pasos (o «Conectá») va en una sola línea y la letra se achica sola si no entra');
  }
  t.ok(/android:maxLines="2"/.test(vista(med, 'widget_pasos_pie')), 'widget_gize: si «de 10.000 · 14:32» no entra en una línea, la hora pasa abajo (no se corta)');
  const peso = id => Number((med.match(new RegExp('android:id="@\\+id/' + id + '"[^>]*?android:layout_weight="([\\d.]+)"')) || [])[1] || 0);
  t.ok(peso('widget_izq') > peso('widget_entreno') && peso('widget_entreno') > 0, 'widget_gize: la columna de pasos y racha es más ancha que la del entreno (ahí van «de 10.000 · 14:32» y «12 días seguidos»)');
  // Cada recurso que nombran los XML del widget existe.
  const refs = s => [...s.matchAll(/@(string|color|drawable|layout|xml)\/(\w+)/g)].map(m => [m[1], m[2]]);
  const widgetXml = [med, chi, info, rec, ...['widget_fondo', 'widget_caja', 'widget_anillo', 'widget_llama', 'widget_llama_apagada'].map(d => leer(RES + 'drawable/' + d + '.xml'))].join('\n');
  t.eq(refs(widgetXml).filter(([tipo, n]) => !res[tipo].has(n)).map(r => r.join('/')), [], 'cada @string, @color, @drawable, @layout y @xml del widget existe');
  for (const d of ['widget_fondo', 'widget_anillo', 'widget_llama', 'widget_llama_apagada'])
    t.ok(res.drawable.has(d), 'existe el dibujo ' + d);
  // El anillo: la parte hecha crece con el progreso (la barra le pone el nivel).
  const anillo = leer(RES + 'drawable/widget_anillo.xml');
  t.ok(/android:id="@android:id\/progress"[\s\S]*android:shape="ring"[\s\S]*android:useLevel="true"/.test(anillo), 'el anillo de los pasos crece con el progreso (useLevel)');
  // La llama es la de la app (flameSvg en app/ui/racha.js), con sus colores.
  const racha = leer('app/ui/racha.js'), llama = leer(RES + 'drawable/widget_llama.xml');
  for (const c of ['E7B8FF', 'A65CFF', '6A2BFF', 'FFB8EA', 'FF3DAE']){
    t.ok(racha.includes('#' + c), 'la llama de la app usa #' + c);
    t.ok(llama.includes('#FF' + c), 'y la del widget también');
  }

  // ===== Java: cada R.… existe y lo que se toca en el chico está en el chico =====
  const ids = x => new Set([...x.matchAll(/android:id="@\+id\/(\w+)"/g)].map(m => m[1]));
  const idsMed = ids(med), idsChi = ids(chi);
  const java = wj + '\n' + pj;
  const usados = [...java.matchAll(/(?<![\w.])R\.(id|string|layout|drawable|color)\.(\w+)/g)].map(m => [m[1], m[2]]);
  t.ok(usados.length > 10, 'el Java usa los recursos del widget');
  t.eq(usados.filter(([tipo, n]) => tipo === 'id' ? !idsMed.has(n) : !res[tipo].has(n)).map(r => r.join('.')), [], 'cada R.id, R.string, R.layout, R.drawable y R.color del Java existe');
  const armar = (wj.match(/private static RemoteViews armar\([\s\S]*?\n {4}\}\n/) || [''])[0];
  t.ok(armar, 'GizeWidget arma la vista en armar()');
  // Fuera de los «if (!chico)» se toca también el chico.
  const enChico = armar.replace(/if \(!chico\) \{[\s\S]*?\n {8}\}/g, '').replace(/if \(!chico\)[^{\n]*;/g, '');
  const idsChico = [...new Set([...enChico.matchAll(/R\.id\.(\w+)/g)].map(m => m[1]))];
  t.ok(idsChico.length >= 8, 'el chico muestra pasos, racha y entreno');
  t.eq(idsChico.filter(n => !idsChi.has(n)), [], 'cada vista que se toca en el chico está en widget_gize_chico.xml');
  t.ok(['widget_pasos_pie', 'widget_racha_pie', 'widget_entreno_detalle'].every(n => idsMed.has(n) && !idsChi.has(n)), 'los textos de abajo van solo en el mediano');
  // Los toques por parte van también en el chico: el toque único es solo del chico de iPhone
  // (contrato-widget.md §4 y §5). Si no, «Conectá» en el chico llevaba a Entreno y no a Cardio →
  // Pasos, donde se conectan.
  t.ok(/if \(chico\) v\.setInt\(R\.id\.widget_entreno_nombre, "setMaxLines", soloAviso \? 2 : 1\);/.test(armar), 'en el chico el aviso («Abrí GIZE para ver tu día») tiene dos líneas y el nombre del entreno una');
  t.ok(!/setTextViewTextSize\(R\.id\.widget_pasos_txt/.test(armar), 'el tamaño del número de pasos lo ajusta el layout (con autoSize, setTextViewTextSize no hace nada)');
  for (const [zona, destino] of [['widget_pasos', 'pasos'], ['widget_racha', 'racha'], ['widget_entreno', 'entreno']])
    t.ok(new RegExp('setOnClickPendingIntent\\(R\\.id\\.' + zona + ',[^;]*abrir\\(ctx, "' + destino + '"').test(enChico), 'en el chico también, tocar ' + zona.replace('widget_', '') + ' abre ' + destino);

  // ===== MainActivity y el plugin =====
  const iReg = main.indexOf('registerPlugin(WidgetPlugin.class);'), iSuper = main.indexOf('super.onCreate(');
  t.ok(iReg > 0 && iSuper > iReg, 'MainActivity registra WidgetPlugin antes de super.onCreate');
  t.ok(/@CapacitorPlugin\(name = "GizeWidget"\)\s*public class WidgetPlugin extends Plugin\b/.test(pj), 'el plugin se llama «GizeWidget» (como lo busca app/core/widget.js)');
  for (const m of ['guardar', 'borrar', 'info', 'agregar'])
    t.ok(new RegExp('@PluginMethod\\s+public void ' + m + '\\(PluginCall call\\)').test(pj), 'el plugin tiene ' + m + '()');
  const metodo = n => (pj.match(new RegExp('public void ' + n + '\\(PluginCall call\\) \\{[\\s\\S]*?\\n {4}\\}')) || [''])[0];
  const guardar = metodo('guardar'), borrar = metodo('borrar');
  t.ok(/call\.getString\("datos"\)/.test(guardar), 'guardar recibe {datos}');
  t.ok(/new JSONObject\(datos\)\.optInt\("v", 0\) != GizeWidget\.VERSION/.test(guardar) && /catch \(JSONException e\) \{\s*call\.reject\(/.test(guardar), 'guardar rechaza lo que no es JSON de la versión del widget');
  t.ok(/getSharedPreferences\(GizeWidget\.PREFS, Context\.MODE_PRIVATE\)\.edit\(\)\.putString\(GizeWidget\.CLAVE, datos\)/.test(guardar) && guardar.indexOf('putString') < guardar.indexOf('GizeWidget.actualizarTodos(ctx)'), 'guardar lo deja donde lo lee el widget y lo redibuja');
  t.ok(/getSharedPreferences\(PREFS, Context\.MODE_PRIVATE\)\.getString\(CLAVE, null\)/.test(wj), 'el widget lee lo que guardó el plugin');
  t.ok(/getSharedPreferences\(GizeWidget\.PREFS, Context\.MODE_PRIVATE\)\.edit\(\)\.remove\(GizeWidget\.CLAVE\)\.commit\(\)/.test(borrar) && /GizeWidget\.actualizarTodos\(ctx\)/.test(borrar), 'borrar saca los datos de la cuenta (al toque) y redibuja: queda «Ingresá a GIZE»');
  t.ok(/static final String PREFS = "gize_widget";/.test(wj) && /static final int VERSION = 1;/.test(wj), 'se guarda en «gize_widget» y es la versión 1');
  t.ok(/"puedeAgregar", mgr != null && mgr\.isRequestPinAppWidgetSupported\(\)/.test(metodo('info')) && /"instalados", GizeWidget\.instalados\(/.test(metodo('info')), 'info dice cuántos hay y si se puede agregar desde la app');
  t.ok(/requestPinAppWidget\(new ComponentName\(ctx, GizeWidget\.class\), null, null\)/.test(metodo('agregar')) && /"pedido", pedido/.test(metodo('agregar')), 'agregar le pide a Android ponerlo en la pantalla de inicio');
  t.ok(!/HttpURLConnection|OkHttp|java\.net\.|URL\(/.test(java), 'el widget y el plugin no mandan nada a ningún lado');

  // ===== Toques y alarma =====
  t.ok(/public class GizeWidget extends AppWidgetProvider\b/.test(wj), 'GizeWidget es un AppWidgetProvider (sin Kotlin ni Glance)');
  const pis = [...wj.matchAll(/PendingIntent\.get(?:Activity|Broadcast|Service)\([^;]*;/g)].map(m => m[0]);
  t.ok(pis.length >= 2 && pis.every(s => s.includes('PendingIntent.FLAG_IMMUTABLE')), 'todos los PendingIntent llevan FLAG_IMMUTABLE');
  t.ok(/String url = "gize:\/\/widget\/" \+ destino;/.test(wj) && /new Intent\(Intent\.ACTION_VIEW, Uri\.parse\(url\), ctx, MainActivity\.class\)/.test(wj), 'los toques abren MainActivity (explícito) con gize://widget/… (llega a la app como appUrlOpen)');
  const destinos = [...new Set([...wj.matchAll(/abrir\(ctx, "(\w+)", (null|idDia), (\d)\)/g)].map(m => m.slice(1).join(' ')))];
  t.eq(destinos, ['hoy null 1', 'pasos null 2', 'racha null 3', 'entreno idDia 4'], 'el widget abre hoy, pasos, racha y el entreno de ese día, cada uno con su código');
  t.ok(/setOnClickPendingIntent\(R\.id\.widget_entreno, soloAviso \? abrir\(ctx, "hoy", null, 1\) : abrir\(ctx, "entreno", idDia, 4\)\)/.test(armar), 'con un aviso, tocar el entreno abre la app (sin un día viejo)');
  t.ok(/boolean soloAviso = dia == null \|\| aviso != null;/.test(armar) && /JSONObject pasos = soloAviso \? null :/.test(armar) && /JSONObject racha = soloAviso \? null :/.test(armar), 'con un aviso (o sin datos) se ve solo el aviso, sin pasos ni racha');
  t.ok(/nombre = aviso != null \? texto\(aviso, "texto"\) : respaldo;/.test(armar), 'sin datos de la app, el aviso es el texto de respaldo');
  t.ok(/ID_DIA = Pattern\.compile\("\^\[A-Za-z0-9_-\]\{1,64\}\$"\)/.test(wj) && /ID_DIA\.matcher\(idDia\)\.matches\(\)/.test(wj), 'el id del día va al enlace solo si es un id válido');
  t.ok(!/intent-filter[\s\S]*android:host="widget"/.test(man), 'no hace falta abrir gize://widget a otras apps en el manifiesto');
  t.ok(/am\.setWindow\(AlarmManager\.RTC, c\.getTimeInMillis\(\), 15 \* 60 \* 1000L, alarma\(ctx\)\)/.test(wj), 'la alarma de la medianoche no despierta al celular (RTC) ni es exacta (ventana de 15 min)');
  t.ok(!/RTC_WAKEUP|ELAPSED_REALTIME_WAKEUP|setExact|setAlarmClock|\.set\(AlarmManager/.test(wj), 'sin alarmas exactas ni que despierten al celular');
  t.ok(/c\.set\(Calendar\.HOUR_OF_DAY, 0\);\s*c\.set\(Calendar\.MINUTE, 1\);/.test(wj) && /c\.add\(Calendar\.DAY_OF_MONTH, 1\);/.test(wj), 'la alarma es a la medianoche y un minuto del día siguiente');
  t.ok(/new Intent\(ctx, GizeWidget\.class\)\.setAction\(ACCION_DIA\)/.test(wj), 'la alarma le llega directo al widget');
  t.ok(/ACCION_DIA\.equals\(accion\) \|\| Intent\.ACTION_TIME_CHANGED\.equals\(accion\) \|\| Intent\.ACTION_TIMEZONE_CHANGED\.equals\(accion\)/.test(wj), 'con la medianoche o un cambio de hora redibuja todos');
  t.ok(/public void onDisabled\(Context ctx\) \{[\s\S]*?am\.cancel\(alarma\(ctx\)\)/.test(wj), 'sin widgets en la pantalla se cancela la alarma');
  t.ok(/new SimpleDateFormat\("yyyy-MM-dd", Locale\.US\)\.format\(new Date\(\)\)/.test(wj), 'elige el día de hoy del celular (AAAA-MM-DD, como las claves de la app)');
  t.ok(/dia = dias == null \? null : dias\.optJSONObject\(hoy\);\s*[\s\S]*?if \(dia == null\) dia = datos\.optJSONObject\("sinDatos"\);/.test(wj), 'usa el día de hoy y, si no está, lo que dejó la app para eso (sinDatos)');
  t.ok(/if \(datos == null\) \{\s*respaldo = ctx\.getString\(R\.string\.widget_ingresa\);/.test(wj) && /if \(dia == null\) respaldo = ctx\.getString\(R\.string\.widget_abri\);/.test(wj), 'sin nada de la app: «Ingresá a GIZE»; sin el día: «Abrí GIZE para ver tu día»');
  t.ok(/Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.S[\s\S]*?new SizeF\(110f, 110f\), armar\(ctx, dia, respaldo, true\)[\s\S]*?new SizeF\(ANCHO_MEDIANO, 110f\), armar\(ctx, dia, respaldo, false\)/.test(wj), 'Android 12 o más elige solo entre el chico y el mediano según el tamaño');
  t.ok(/OPTION_APPWIDGET_MIN_WIDTH/.test(wj) && /public void onAppWidgetOptionsChanged\(/.test(wj), 'Android 8 a 11 elige por el ancho y redibuja al cambiar el tamaño');
  t.ok(/vista = armar\(ctx, dia, respaldo, ancho > 0 && ancho < ANCHO_MEDIANO\);/.test(wj), 'Android 8 a 11: más angosto que el mediano va el chico (sin ancho todavía, el mediano)');
  // Lo que cambia según los datos: la llama, el verde de «Hecho hoy ✓» y el anillo.
  t.ok(/racha\.optBoolean\("prendida", false\) \? R\.drawable\.widget_llama : R\.drawable\.widget_llama_apagada/.test(armar), 'la llama se ve prendida solo con racha.prendida (si no, la apagada)');
  t.ok(/hecho = entreno\.optBoolean\("hecho", false\);/.test(armar) && /setTextColor\(R\.id\.widget_entreno_titulo, ctx\.getColor\(hecho \? R\.color\.widget_verde : R\.color\.widget_azul\)\)/.test(armar), 'el entreno hecho se pone verde y si no, azul (siempre se vuelve a poner)');
  const colores = leer(RES + 'values/widget.xml');
  t.ok(/<color name="widget_verde">#25E8C8<\/color>/.test(colores) && /<color name="widget_azul">#2FA0FF<\/color>/.test(colores) && /<color name="widget_violeta">#A65CFF<\/color>/.test(colores), 'verde, azul y violeta son los de la marca (brand/tokens.css)');
  t.ok(/setProgressBar\(R\.id\.widget_anillo, 100, porcentaje\(pasos\.optDouble\("pct", 0\)\), false\)/.test(armar) && /Math\.max\(0, Math\.min\(100, Math\.round\(pct\)\)\)/.test(wj), 'el anillo se llena con pct, de 0 a 100');
  t.ok(/static final float ANCHO_MEDIANO = 250f;/.test(wj), 'el mediano desde 250 dp (el ancho con el que sale)');

  // ===== Contrato con la app =====
  // Claves que lee el Java, por objeto (las variables se llaman como en el contrato).
  const leidas = {};
  for (const m of java.matchAll(/\b(datos|dia|pasos|racha|entreno)\.opt(?:JSONObject|String|Double|Boolean|Int)\("(\w+)"/g)) (leidas[m[1]] = leidas[m[1]] || new Set()).add(m[2]);
  for (const m of java.matchAll(/\btexto\((pasos|racha|entreno|aviso), "(\w+)"\)/g)) (leidas[m[1]] = leidas[m[1]] || new Set()).add(m[2]);
  if (/optInt\("v", 0\) == VERSION/.test(wj)) (leidas.datos = leidas.datos || new Set()).add('v');
  const ordenadas = o => Object.fromEntries(Object.keys(CONTRATO).map(k => [k, [...(o[k] || [])].sort()]));
  t.eq(ordenadas(leidas), ordenadas(CONTRATO), 'el widget lee justo las claves del contrato con la app (ni de más ni de menos)');
  const todas = [...new Set(Object.values(CONTRATO).flat())];

  // Si la app ya arma los datos (rama widget-datos), tienen que coincidir con lo que ella manda.
  if (fs.existsSync(path.join(ROOT, 'app/core/widgetdatos.js'))){
    const { p, errs, close } = await newPage({});
    await p.goto(base + '/privacidad/');
    const r = await p.evaluate(async todas => {
      const m = await import('/app/core/widgetdatos.js');
      const juntar = (x, s = new Set()) => { if (typeof x === 'string') s.add(x); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)){ if (!Array.isArray(x)) s.add(k); juntar(v, s); } return s; };
      const claves = [...juntar(m.CLAVES_WIDGET)];
      // Un alumno con una rutina, pasos de hoy y racha.
      const d = new Date(), hoy = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      let json = null, error = '';
      try {
        const st = { days: [{ id: 'd1', name: 'Día A', exercises: [{ id: 'e1', name: 'Sentadilla', sets: [{ id: 's1', kg: '60', reps: '8' }] }] }], sessions: [], weights: [], daily: {}, steps: 6543, stepsDate: hoy, stepsGoal: 10000, visits: [hoy] };
        json = m.armarWidget({ hoy, ahora: Date.now(), modo: 'alumno', st, racha: 12, salud: { prendida: true, lectura: Date.now() } });
      } catch (e) { error = String(e && e.message || e); }
      const enJson = [];
      const recorrer = (x, dentroDeDias) => { if (!x || typeof x !== 'object') return; for (const [k, v] of Object.entries(x)){ if (!dentroDeDias) enJson.push(k); recorrer(v, k === 'dias' && !dentroDeDias); } };
      recorrer(json, false);
      return { v: m.WIDGET_V, claves, enJson: [...new Set(enJson)], error, faltan: todas.filter(k => !claves.includes(k)) };
    }, todas);
    t.eq(r.v, 1, 'WIDGET_V de la app es la versión que acepta el widget (GizeWidget.VERSION)');
    t.eq(r.faltan, [], 'cada clave que lee el widget está en CLAVES_WIDGET de app/core/widgetdatos.js');
    t.ok(!r.error, 'armarWidget arma los datos de un alumno' + (r.error ? ': ' + r.error : ''));
    t.eq(todas.filter(k => !r.enJson.includes(k)), [], 'y cada clave que lee el widget aparece en lo que arma la app');
    t.eq(errs, [], 'sin errores de página');
    await close();
  }
  const puente = leer('app/core/widget.js');
  if (puente){
    t.ok(/GizeWidget/.test(puente), 'app/core/widget.js busca el plugin «GizeWidget»');
    t.ok(/guardar\(\{\s*datos\b/.test(puente), 'y le manda {datos} a guardar');
  }

  // ===== Textos =====
  t.eq([res.textos.widget_nombre, res.textos.widget_descripcion, res.textos.widget_ingresa, res.textos.widget_abri],
    ['GIZE de hoy', 'Tus pasos, tu racha y el entreno que te toca', 'Ingresá a GIZE', 'Abrí GIZE para ver tu día'], 'el nombre, la descripción y los textos de respaldo del widget');
  const textosWidget = Object.entries(res.textos).filter(([k]) => k.startsWith('widget_')).map(([, v]) => v).join(' | ');
  t.ok(textosWidget && !/\$|precio|mercado ?pago|\bplan\b|prueba gratis|suscrip|google play|app store/i.test(textosWidget), 'el widget no muestra precios, planes, pagos ni tiendas');

  // ===== R8 y el recorrido en el emulador =====
  t.ok(/^-keep class ar\.com\.gize\.app\.\*\* \{ \*; \}$/m.test(leer('android/app/proguard-rules.pro')), 'R8 deja GizeWidget y WidgetPlugin (se buscan por el nombre)');
  const rec2 = leer('scripts/android-recorrido.mjs');
  t.ok(/await paso\('Widget'/.test(rec2) && /\.agregar\(\)/.test(rec2) && /'20-widget\.png'/.test(rec2), 'el recorrido del emulador agrega el widget y saca 20-widget.png');
}
