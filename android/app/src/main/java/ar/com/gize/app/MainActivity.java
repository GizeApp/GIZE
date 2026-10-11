package ar.com.gize.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio de la app (no viene de npm): cuenta regresiva del descanso.
        registerPlugin(RestTimerPlugin.class);
        super.onCreate(savedInstanceState);
        // Con el "tamaño de fuente" del sistema agrandado, el WebView escalaba todo el texto de la
        // app (títulos gigantes, series y barra de abajo cortadas). La app ya usa tamaños pensados
        // para leerse bien: se deja el texto al 100 %.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
            // Las ventanitas de aviso con «Aceptar» y «Cancelar» (Capacitor las trae en inglés).
            getBridge().getWebView().setWebChromeClient(new DialogosEnCastellano(getBridge()));
        }
        // Android 15 y 16 (de borde a borde): Capacitor deja márgenes para las barras del sistema
        // pero no para el teclado, así que el teclado tapaba el campo que se estaba escribiendo y
        // el botón Guardar. Se suma el alto del teclado al margen de abajo del WebView (como en
        // Android 14 y anteriores, donde la ventana se achica sola).
        if (Build.VERSION.SDK_INT >= 35 && getBridge() != null && getBridge().getWebView() != null) {
            View wv = getBridge().getWebView();
            ViewCompat.setOnApplyWindowInsetsListener(wv, (v, wi) -> {
                Insets bars = wi.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                int bottom = Math.max(bars.bottom, wi.getInsets(WindowInsetsCompat.Type.ime()).bottom);
                ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
                if (lp.leftMargin != bars.left || lp.topMargin != bars.top || lp.rightMargin != bars.right || lp.bottomMargin != bottom) {
                    lp.setMargins(bars.left, bars.top, bars.right, bottom);
                    v.setLayoutParams(lp);
                }
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(wv);
        }
    }
}
