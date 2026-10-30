package ar.com.gize.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Puente entre la app y el widget «GIZE de hoy» (GizeWidget.java). La app (app/core/widget.js)
 * manda lo que tiene que mostrar ya armado y este plugin lo guarda solo en el celular y redibuja
 * el widget. No manda nada a ningún lado. Al cerrar sesión la app llama a borrar() y el widget
 * queda en «Ingresá a GIZE».
 */
@CapacitorPlugin(name = "GizeWidget")
public class WidgetPlugin extends Plugin {
    // Lo que arma la app para 8 días ocupa pocos KB: más que esto no es del widget.
    private static final int MAXIMO = 100000;

    /** guardar({datos}): el JSON de app/core/widgetdatos.js (con v = 1). Devuelve {instalados}. */
    @PluginMethod
    public void guardar(PluginCall call) {
        String datos = call.getString("datos");
        if (datos == null || datos.length() > MAXIMO) {
            call.reject("Faltan los datos del widget");
            return;
        }
        try {
            if (new JSONObject(datos).optInt("v", 0) != GizeWidget.VERSION) {
                call.reject("Los datos del widget son de otra versión");
                return;
            }
        } catch (JSONException e) {
            call.reject("Los datos del widget no se pueden leer");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(GizeWidget.PREFS, Context.MODE_PRIVATE).edit().putString(GizeWidget.CLAVE, datos).apply();
        GizeWidget.actualizarTodos(ctx);
        resolver(call);
    }

    /** borrar(): saca todo lo de la cuenta (cerrar sesión, eliminar la cuenta, entra otra cuenta). */
    @PluginMethod
    public void borrar(PluginCall call) {
        Context ctx = getContext();
        // commit y no apply: la app recarga apenas termina y no tiene que quedar nada guardado.
        ctx.getSharedPreferences(GizeWidget.PREFS, Context.MODE_PRIVATE).edit().remove(GizeWidget.CLAVE).commit();
        GizeWidget.actualizarTodos(ctx);
        resolver(call);
    }

    /** info(): {instalados: cuántos hay en la pantalla, puedeAgregar: si se puede agregar desde la app}. */
    @PluginMethod
    public void info(PluginCall call) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
        JSObject r = new JSObject();
        r.put("instalados", GizeWidget.instalados(getContext()));
        r.put("puedeAgregar", mgr != null && mgr.isRequestPinAppWidgetSupported());
        call.resolve(r);
    }

    /**
     * agregar(): Android pregunta «¿Agregar a la pantalla principal?» (si la pantalla de inicio lo
     * permite). Devuelve {pedido}: false si no se pudo preguntar (la app explica cómo hacerlo a mano).
     */
    @PluginMethod
    public void agregar(PluginCall call) {
        Context ctx = getContext();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        boolean pedido = false;
        if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
            pedido = mgr.requestPinAppWidget(new ComponentName(ctx, GizeWidget.class), null, null);
        }
        JSObject r = new JSObject();
        r.put("pedido", pedido);
        call.resolve(r);
    }

    private void resolver(PluginCall call) {
        JSObject r = new JSObject();
        r.put("instalados", GizeWidget.instalados(getContext()));
        call.resolve(r);
    }
}
