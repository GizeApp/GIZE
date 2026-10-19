package ar.com.gize.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

// La abre Health Connect cuando el usuario toca "Política de privacidad" al darle permiso a
// GIZE para leer sus pasos (ver AndroidManifest.xml). Abre la política en el navegador, en la
// parte que explica qué se hace con esos datos, y se cierra sola.
public class PermisosSaludActivity extends Activity {
    static final String URL = "https://gize.ar/privacidad/#salud";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(URL)));
        } catch (ActivityNotFoundException e) {
            // Sin navegador no hay nada que abrir.
        }
        finish();
    }
}
