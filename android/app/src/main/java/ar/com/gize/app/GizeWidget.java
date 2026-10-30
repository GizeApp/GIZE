package ar.com.gize.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Widget «GIZE de hoy» en la pantalla de inicio: los pasos de hoy contra la meta, la racha y el
 * entreno que toca. No lee nada por su cuenta: muestra lo que la app le deja armado
 * (app/core/widgetdatos.js) con el plugin GizeWidget (WidgetPlugin.java), que lo guarda en el
 * celular. La app deja hoy y los 7 días siguientes, así que a la medianoche pasa solo al día
 * siguiente sin abrir la app. Cada parte se toca y abre GIZE ahí (gize://widget/…).
 */
public class GizeWidget extends AppWidgetProvider {
    // Donde WidgetPlugin guarda lo que manda la app (y lo borra al cerrar sesión).
    static final String PREFS = "gize_widget";
    static final String CLAVE = "datos";
    // Versión de lo que manda la app (WIDGET_V en app/core/widgetdatos.js).
    static final int VERSION = 1;
    // Alarma de la medianoche (solo la manda la app misma, con el nombre de esta clase).
    static final String ACCION_DIA = "ar.com.gize.app.WIDGET_DIA";
    // Ancho (dp) desde el que va el mediano; más angosto, el chico.
    static final float ANCHO_MEDIANO = 250f;
    // El id del día de la rutina para el enlace, como lo acepta la app (app/core/storage.js).
    private static final Pattern ID_DIA = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) dibujar(ctx, mgr, id);
        programarMedianoche(ctx);
    }

    // Al agrandarlo o achicarlo (en Android 8 a 11 se elige acá el chico o el mediano).
    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opciones) {
        dibujar(ctx, mgr, id);
    }

    // La medianoche, y si cambian la hora o la zona horaria del celular: otro día para mostrar.
    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String accion = intent.getAction();
        if (ACCION_DIA.equals(accion) || Intent.ACTION_TIME_CHANGED.equals(accion) || Intent.ACTION_TIMEZONE_CHANGED.equals(accion)) {
            actualizarTodos(ctx);
        }
    }

    // Se sacó el último widget de la pantalla: ya no hace falta la alarma.
    @Override
    public void onDisabled(Context ctx) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(alarma(ctx));
    }

    /** Redibuja todos los widgets de GIZE que haya en la pantalla (lo llama también WidgetPlugin). */
    static void actualizarTodos(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return;
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, GizeWidget.class));
        for (int id : ids) dibujar(ctx, mgr, id);
        if (ids.length > 0) programarMedianoche(ctx);
    }

    /** Cuántos widgets de GIZE hay en la pantalla. */
    static int instalados(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        return mgr == null ? 0 : mgr.getAppWidgetIds(new ComponentName(ctx, GizeWidget.class)).length;
    }

    private static void dibujar(Context ctx, AppWidgetManager mgr, int id) {
        // El día de hoy en el celular, con la misma forma de fecha que usa la app (AAAA-MM-DD).
        String hoy = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        JSONObject datos = leer(ctx), dia = null;
        String respaldo = null;
        if (datos == null) {
            // Nada de la app: sin sesión, recién instalado o se cerró la sesión.
            respaldo = ctx.getString(R.string.widget_ingresa);
        } else {
            JSONObject dias = datos.optJSONObject("dias");
            dia = dias == null ? null : dias.optJSONObject(hoy);
            // Fuera de los días que dejó la app (o una cuenta de coach): lo que ella dejó para eso.
            if (dia == null) dia = datos.optJSONObject("sinDatos");
            if (dia != null && dia.optJSONObject("aviso") == null && dia.optJSONObject("pasos") == null
                    && dia.optJSONObject("racha") == null && dia.optJSONObject("entreno") == null) dia = null;
            if (dia == null) respaldo = ctx.getString(R.string.widget_abri);
        }
        RemoteViews vista;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12 o más: le damos los dos y el sistema elige según el tamaño que tenga.
            Map<SizeF, RemoteViews> tamanios = new HashMap<>();
            tamanios.put(new SizeF(110f, 110f), armar(ctx, dia, respaldo, true));
            tamanios.put(new SizeF(ANCHO_MEDIANO, 110f), armar(ctx, dia, respaldo, false));
            vista = new RemoteViews(tamanios);
        } else {
            Bundle opciones = mgr.getAppWidgetOptions(id);
            int ancho = opciones == null ? 0 : opciones.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            vista = armar(ctx, dia, respaldo, ancho > 0 && ancho < ANCHO_MEDIANO);
        }
        mgr.updateAppWidget(id, vista);
    }

    // Lo que guardó la app, si es de esta versión (si no, como si no hubiera nada).
    private static JSONObject leer(Context ctx) {
        try {
            String s = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CLAVE, null);
            if (s == null) return null;
            JSONObject o = new JSONObject(s);
            return o.optInt("v", 0) == VERSION ? o : null;
        } catch (JSONException | RuntimeException e) {
            return null;
        }
    }

    // Arma el chico o el mediano. Todo lo que puede cambiar de una vez a otra se vuelve a poner
    // siempre (textos, lo que se ve y los toques): Android reusa las vistas que ya tiene el widget.
    private static RemoteViews armar(Context ctx, JSONObject dia, String respaldo, boolean chico) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), chico ? R.layout.widget_gize_chico : R.layout.widget_gize);
        // Un aviso solo (cuenta de coach o del gimnasio, o sin datos para hoy) en lugar del día.
        JSONObject aviso = dia == null ? null : dia.optJSONObject("aviso");
        boolean soloAviso = dia == null || aviso != null;
        JSONObject pasos = soloAviso ? null : dia.optJSONObject("pasos");
        JSONObject racha = soloAviso ? null : dia.optJSONObject("racha");
        JSONObject entreno = soloAviso ? null : dia.optJSONObject("entreno");

        // Pasos de hoy: el número, el anillo contra la meta y abajo «de 10.000 · 14:32».
        v.setViewVisibility(R.id.widget_pasos, pasos == null ? View.GONE : View.VISIBLE);
        if (pasos != null) {
            String txt = texto(pasos, "txt");
            v.setTextViewText(R.id.widget_pasos_txt, txt);
            // «Conectá» o un número largo no entran con la letra de siempre.
            v.setTextViewTextSize(R.id.widget_pasos_txt, TypedValue.COMPLEX_UNIT_SP, chico ? (txt.length() > 5 ? 12 : 15) : (txt.length() > 6 ? 14 : 18));
            v.setProgressBar(R.id.widget_anillo, 100, porcentaje(pasos.optDouble("pct", 0)), false);
            if (!chico) mostrar(v, R.id.widget_pasos_pie, texto(pasos, "pie"));
        }

        // Racha: la llama prendida o apagada, los días y abajo «días seguidos» o «¡Entrá hoy!».
        v.setViewVisibility(R.id.widget_racha, racha == null ? View.GONE : View.VISIBLE);
        if (racha != null) {
            v.setImageViewResource(R.id.widget_llama, racha.optBoolean("prendida", false) ? R.drawable.widget_llama : R.drawable.widget_llama_apagada);
            v.setTextViewText(R.id.widget_racha_txt, texto(racha, "txt"));
            if (!chico) mostrar(v, R.id.widget_racha_pie, texto(racha, "pie"));
        }
        v.setViewVisibility(R.id.widget_izq, pasos == null && racha == null ? View.GONE : View.VISIBLE);

        // Entreno de hoy («Hoy toca · Día A · 6 ejercicios», «Hecho hoy ✓», «Descanso»…) o el aviso
        // («GIZE · Tu panel de coach · Tocá para abrir», «Ingresá a GIZE») en el mismo lugar.
        String titulo = "", nombre = "", detalle = "", idDia = null;
        boolean hecho = false;
        if (soloAviso) {
            titulo = aviso != null ? texto(aviso, "titulo") : ctx.getString(R.string.app_name);
            nombre = aviso != null ? texto(aviso, "texto") : respaldo;
            detalle = aviso != null ? texto(aviso, "pie") : "";
        } else if (entreno != null) {
            titulo = texto(entreno, "titulo");
            nombre = texto(entreno, "nombre");
            detalle = texto(entreno, "detalle");
            hecho = entreno.optBoolean("hecho", false);
            idDia = texto(entreno, "dia");
        }
        v.setViewVisibility(R.id.widget_entreno, titulo.isEmpty() && nombre.isEmpty() ? View.GONE : View.VISIBLE);
        mostrar(v, R.id.widget_entreno_titulo, titulo);
        v.setTextColor(R.id.widget_entreno_titulo, ctx.getColor(hecho ? R.color.widget_verde : R.color.widget_azul));
        mostrar(v, R.id.widget_entreno_nombre, nombre);
        if (!chico) mostrar(v, R.id.widget_entreno_detalle, detalle);

        // Toques, en el chico y en el mediano: cada parte abre GIZE en su lugar (los pasos en
        // Cardio, donde también se conectan) y el resto, el entreno de hoy. Con el aviso, todo
        // abre la app. (El toque único es solo del chico de iPhone, que no deja más.)
        v.setOnClickPendingIntent(R.id.widget_raiz, abrir(ctx, "hoy", null, 1));
        v.setOnClickPendingIntent(R.id.widget_pasos, abrir(ctx, "pasos", null, 2));
        v.setOnClickPendingIntent(R.id.widget_racha, abrir(ctx, "racha", null, 3));
        v.setOnClickPendingIntent(R.id.widget_entreno, soloAviso ? abrir(ctx, "hoy", null, 1) : abrir(ctx, "entreno", idDia, 4));
        return v;
    }

    // Abre GIZE con gize://widget/<destino>[?dia=<id>]. Va derecho a MainActivity (sin pasar por
    // los enlaces del manifiesto) y le llega a la app como appUrlOpen (app/core/widget.js). Sin
    // sesión de alumno la app lo ignora y abre como siempre.
    private static PendingIntent abrir(Context ctx, String destino, String idDia, int codigo) {
        String url = "gize://widget/" + destino;
        if (idDia != null && ID_DIA.matcher(idDia).matches()) url += "?dia=" + idDia;
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent alarma(Context ctx) {
        Intent i = new Intent(ctx, GizeWidget.class).setAction(ACCION_DIA);
        return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // A la medianoche (y un minuto) el widget pasa al día siguiente con lo que dejó la app. Es una
    // alarma que no despierta al celular (RTC): si está con la pantalla apagada, llega al prenderla.
    // Tampoco es exacta (no pide permiso): Android la puede correr hasta 15 minutos para juntarla
    // con otras. Con set() sola, en Android 8 a 11 se podía atrasar horas (hasta 3/4 del tiempo
    // que faltaba).
    private static void programarMedianoche(Context ctx) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_MONTH, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 1);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        am.setWindow(AlarmManager.RTC, c.getTimeInMillis(), 15 * 60 * 1000L, alarma(ctx));
    }

    // Un texto de lo que mandó la app ("" si no está; null de JSON no es «null»).
    private static String texto(JSONObject o, String clave) {
        return o.isNull(clave) ? "" : o.optString(clave, "");
    }

    private static void mostrar(RemoteViews v, int id, String s) {
        v.setTextViewText(id, s);
        v.setViewVisibility(id, s.isEmpty() ? View.GONE : View.VISIBLE);
    }

    // pct: de 0 a 100 (lo que se llenó el anillo).
    private static int porcentaje(double pct) {
        if (Double.isNaN(pct)) return 0;
        return (int) Math.max(0, Math.min(100, Math.round(pct)));
    }
}
