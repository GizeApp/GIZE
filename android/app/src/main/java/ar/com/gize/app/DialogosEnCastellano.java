package ar.com.gize.app;

import android.app.AlertDialog;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebView;
import android.widget.EditText;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

// Las ventanitas de aviso de la app (alert, confirm y prompt de la página): Capacitor las arma con
// los botones «OK» y «Cancel» escritos en inglés, sin importar el idioma del celular. Esta clase es
// la misma de Capacitor (archivos, cámara, micrófono y permisos quedan igual) con los botones en
// castellano, como el resto de la app. La pone MainActivity.
public class DialogosEnCastellano extends BridgeWebChromeClient {
    static final String ACEPTAR = "Aceptar";
    static final String CANCELAR = "Cancelar";

    private final Bridge bridge;

    public DialogosEnCastellano(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
        if (bridge.getActivity().isFinishing()) {
            return true;
        }
        new AlertDialog.Builder(view.getContext())
            .setMessage(message)
            .setPositiveButton(ACEPTAR, (dialog, which) -> {
                dialog.dismiss();
                result.confirm();
            })
            .setOnCancelListener((dialog) -> {
                dialog.dismiss();
                result.cancel();
            })
            .create()
            .show();
        return true;
    }

    @Override
    public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
        if (bridge.getActivity().isFinishing()) {
            return true;
        }
        new AlertDialog.Builder(view.getContext())
            .setMessage(message)
            .setPositiveButton(ACEPTAR, (dialog, which) -> {
                dialog.dismiss();
                result.confirm();
            })
            .setNegativeButton(CANCELAR, (dialog, which) -> {
                dialog.dismiss();
                result.cancel();
            })
            .setOnCancelListener((dialog) -> {
                dialog.dismiss();
                result.cancel();
            })
            .create()
            .show();
        return true;
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, final JsPromptResult result) {
        if (bridge.getActivity().isFinishing()) {
            return true;
        }
        final EditText input = new EditText(view.getContext());
        new AlertDialog.Builder(view.getContext())
            .setMessage(message)
            .setView(input)
            .setPositiveButton(ACEPTAR, (dialog, which) -> {
                dialog.dismiss();
                result.confirm(input.getText().toString().trim());
            })
            .setNegativeButton(CANCELAR, (dialog, which) -> {
                dialog.dismiss();
                result.cancel();
            })
            .setOnCancelListener((dialog) -> {
                dialog.dismiss();
                result.cancel();
            })
            .create()
            .show();
        return true;
    }
}
