# Widget «GIZE de hoy»: lo que tenés que hacer vos

El widget muestra en la pantalla de inicio del celular los pasos de hoy, la racha y el entreno que
le toca al alumno, sin abrir la app.

- **Android:** no hay que configurar nada nuevo en Google: solo publicar la versión nueva
  (sección 6).
- **iPhone:** la app y el widget comparten los datos por un **App Group** (un lugar del celular que
  ven los dos). Apple no deja que la compilación automática lo arme sola: lo tenés que crear vos en
  **developer.apple.com**, una sola vez. Son **3 pasos** y no hace falta tocar código.

Hasta que estén hechos los 3 pasos, la parte del widget de iPhone (la rama `widget-iphone`) **no se
mergea**: si entra antes, cualquier versión de iPhone falla en la firma (y no se sube).

---

## 1. Los nombres exactos

Copialos tal cual: la app, el widget y la compilación los buscan así. Si cambia una letra, no anda.

| Qué | Dónde | Nombre / identificador (exacto) |
|---|---|---|
| App Group (nuevo) | Identifiers → App Groups | Description **GIZE widget** · Identifier **`group.ar.com.gize.app`** |
| App ID de la app (ya existe) | Identifiers → App IDs | **`ar.com.gize.app`** (se le suma el App Group) |
| App ID del widget (nuevo) | Identifiers → App IDs | Description **GIZE Widget** · Bundle ID (Explicit) **`ar.com.gize.app.widget`** |
| Perfiles de distribución | Profiles | **No los crees vos.** Los arma la compilación en cada versión (sección 3) |

En la «Description» Apple no acepta tildes ni signos: dejala como está en la tabla.

## 2. Los 3 pasos en developer.apple.com

### Paso 1. Crear el App Group

1. Entrá a **developer.apple.com** → **Account** → **Certificates, IDs & Profiles** →
   **Identifiers**.
2. Tocá el **+** que está al lado de «Identifiers».
3. Elegí **App Groups** → **Continue**.
4. **Description:** `GIZE widget`. **Identifier:** `group.ar.com.gize.app` (escribilo completo,
   empezando con `group.`).
5. **Continue** → **Register**.

### Paso 2. Sumarle el App Group a la app (`ar.com.gize.app`)

1. En **Identifiers**, con el filtro de arriba a la derecha en **App IDs**, tocá `ar.com.gize.app`.
2. En la lista de **Capabilities**, buscá **App Groups**, tildalo y tocá **Configure** (o **Edit**,
   si ya estaba tildado).
3. Elegí `group.ar.com.gize.app` → **Continue**.
4. Arriba a la derecha, **Save** → **Confirm**. Apple avisa que los perfiles que usan este App ID
   quedan inválidos: no importa, la compilación arma perfiles nuevos en cada versión.

No cambies nada más del App ID (Sign in with Apple, Push Notifications y HealthKit siguen como
están).

### Paso 3. Crear el App ID del widget (`ar.com.gize.app.widget`)

1. **Identifiers** → **+** → **App IDs** → **Continue** → **App** → **Continue**.
2. **Description:** `GIZE Widget`. **Bundle ID:** elegí **Explicit** y escribí
   `ar.com.gize.app.widget`.
3. En **Capabilities**, tildá **App Groups**. Si querés, tildá también **HealthKit**: no hace falta
   ahora, pero sirve para una versión que más adelante lea los pasos en vivo desde el widget, y así
   no tenés que volver. No tildes nada más.
4. **Continue** → **Register**.
5. Abrí el App ID nuevo (`ar.com.gize.app.widget`) desde la lista → en **App Groups** tocá
   **Configure** → elegí `group.ar.com.gize.app` → **Continue** → **Save** → **Confirm**. Este punto
   es el que más se olvida: tildar App Groups no alcanza, hay que elegir el grupo.

Listo. Avisá que están hechos los 3 pasos, así se mergea `widget-iphone`.

## 3. El perfil de distribución del widget: no lo crees vos

En cada versión de iPhone, la compilación (`scripts/ios-firma.py`, desde «App iPhone» en GitHub
Actions) crea un certificado de distribución y, con ese mismo certificado, dos perfiles:

- **GIZE App Store CI** *número* — el de la app;
- **GIZE App Store CI** *número* **widget** — el del widget.

El *número* es el de la ejecución de GitHub. Si la versión no llega a subirse, el certificado y los
dos perfiles se borran solos. Si se sube, quedan, porque Apple revisa la firma recién en la revisión
de la App Store; los viejos se borran solos cuando hace falta lugar. **No borres a mano los del
número más alto**: firmaron la última versión, que puede estar en revisión.

Si alguna vez creaste perfiles a mano para GIZE, no molestan: la compilación no los usa ni los toca.

## 4. Secrets y variables de GitHub: ninguno nuevo

No hay que cargar nada en GitHub. La compilación usa los mismos secrets que ya tiene el Environment
**ios-release** (`APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` y `ASC_KEY_P8`, con la misma clave
de la API de App Store Connect, rol Admin). El Bundle ID del widget no es secreto: lo pone el
workflow `ios.yml` en la rama `widget-iphone` (variable `WIDGET_BUNDLE_ID`), no se carga en
Settings.

## 5. Publicar la versión de iPhone y probarla

1. Con `widget-iphone` ya en main: **Actions** → **App iPhone** → **Run workflow** (desde main) con
   la versión nueva → aprobá **ios-release**.
2. Si falla en el paso **«Certificado y perfil de App Store»**, el mensaje dice qué falta. No se
   sube nada y el certificado de esa ejecución se borra solo. Arreglalo y volvé a correrlo:

   | El mensaje dice | Qué revisar |
   |---|---|
   | «No está registrado el Bundle ID del widget…» | Paso 3 (que exista `ar.com.gize.app.widget`) |
   | «…el App ID de la app no tiene ningún App Group (paso 2)» | Paso 2 |
   | «…el App ID del widget no tiene ningún App Group (paso 3)» | Paso 3, puntos 3 y 5 (tildar App Groups y elegir el grupo) |
   | «…App Groups distintos…» | Que los dos App IDs tengan `group.ar.com.gize.app` |

3. Si falla más adelante, al exportar, con algo de «application-groups» o «provisioning profile»,
   revisá los pasos 2 y 3: que el grupo esté elegido en los dos App IDs, no solo tildado.
4. Cuando termine: **App Store Connect** → **TestFlight** → instalá la versión en un iPhone (con iOS
   17 o más nuevo: en iOS 15 y 16 la app anda igual, pero sin widget).
5. Entrá con una cuenta de alumno. En la pantalla de inicio, mantené apretado un lugar vacío →
   **Editar** → **Agregar widget** (o el **+**) → buscá **GIZE** → **GIZE de hoy**, chico o mediano.
6. Revisá que tocar los pasos abra Cardio, la llama abra la racha y el entreno abra el día; que al
   guardar un entreno diga «Hecho hoy ✓»; que al día siguiente cambie solo; y que al cerrar sesión
   diga «Ingresá a GIZE».
7. Al mandarla a revisión, en **Notas para la revisión**: «La app incluye un widget de pantalla de
   inicio con los pasos, la racha y el entreno del día. Para verlo: ingresar con la cuenta de
   prueba, volver a la pantalla de inicio y agregar el widget de GIZE.»

## 6. Android

No hay que hacer nada en la consola de Google más allá de publicar. Si hay otras novedades de
Android esperando versión, conviene sacarlas todas juntas.

1. **Actions** → **App Android · Play Store** → **Run workflow** desde main, con la versión nueva →
   aprobá **play-release** → bajá el artifact **gize-play-store** (el `.aab`).
2. **Play Console** → GIZE → **Probar y publicar** → **Prueba interna** → **Crear versión** → subí el
   `.aab`. Notas: «Nuevo: widget con tus pasos, tu racha y el entreno de hoy». No hay permisos ni
   declaraciones nuevas que completar.
3. En un Android de prueba: actualizá GIZE, entrá como alumno → **Ajustes** → **Widget en tu
   pantalla** → **Agregar a la pantalla**. Revisá lo mismo que en el punto 6 de la sección 5. Después,
   promové la versión a **Producción**.
4. Sin celular: **Actions** → **Android en emulador** → **Run workflow** → en el artifact
   **gize-android-emulador**, mirá la captura `20-widget.png`.

---

### Qué guarda el widget

Solo lo que ya muestra la app (los pasos de hoy, la racha y el nombre del entreno de hoy y de los
próximos días), guardado en el mismo celular. No sale a ningún lado, no lee nada por su cuenta y se
borra al cerrar sesión, al eliminar la cuenta o cuando entra otra cuenta. Cualquiera que vea la
pantalla del celular lo ve. Está en la Política de privacidad (gize.ar/privacidad).
