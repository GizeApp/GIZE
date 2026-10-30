# Planes de coach e IA Plus con Google Play (compras dentro de la app de Android)

Google pide que el contenido digital que se usa dentro de la app de Android (los planes de coach e
IA Plus) se pueda pagar con la facturación de Google Play. Con esto, en la app de Android los
coaches van a ver los planes con el precio que pone Google y un botón «Suscribirme», igual que hoy
en el iPhone con Apple. Google cobra, renueva cada mes y te paga a vos. En la web todo sigue igual
(Mercado Pago y transferencia).

**Todo llega apagado.** Hasta que hagas estos pasos y prendas el interruptor del panel (primero
solo para cuentas de prueba), la app de Android sigue exactamente como hoy. El servidor (la función
`compras-google`) contesta «Las compras con Google Play todavía no están listas» y no hace nada
mientras no tenga su clave.

Esta guía es lo que tenés que hacer vos en **Play Console** (play.google.com/console), en **Google
Cloud** (console.cloud.google.com) y en **Supabase**. Hacelo en este orden. No hace falta tocar
código.

Antes de empezar: los pasos 1 a 13 se pueden hacer ya; desde el 14 hacen falta en main la app
con el cobro de Google Play y el bloque «Cobro con Google Play» del panel.

> **Nunca pegues la clave de la cuenta de servicio (el archivo JSON) en GitHub, en un chat, en un
> mail ni en ningún archivo del repo.** Va solo en Supabase (paso 12) y después se borra de la compu.

---

## 1. Perfil de pagos

Sin esto, Google no deja vender nada.

1. Play Console → **Configuración** → **Perfil de pagos**. Si la cuenta de desarrollador nunca
   vendió, creá el perfil de pagos (de comerciante) con los datos fiscales y la cuenta bancaria.
2. Google paga a la Argentina por **transferencia en dólares** (mínimo US$100 acumulados). Conviene
   una cuenta en dólares y avisarle al contador (el banco puede pedir formularios del BCRA y una
   factura por cada cobro).

La comisión de Google en las suscripciones es del **15 %** desde el primer día, sin anotarse a
ningún programa.

## 2. Una versión de la app con las compras, en Pruebas internas

Play Console no deja crear suscripciones hasta que haya subida una versión de la app que use la
facturación de Google Play (la que trae el plugin de compras).

1. GitHub → **Actions** → **App Android · Play Store** → **Run workflow** (versión nueva, por
   ejemplo 1.1.0). Cuando termine, bajá el `.aab` de **Artifacts**.
2. Play Console → **GIZE** → **Probar y publicar** → **Pruebas internas** → **Crear versión** →
   subí el `.aab` → publicala para tus testers.

## 3. Las 6 suscripciones de los planes

Play Console → **GIZE** → **Monetizar con Play** → **Productos** → **Suscripciones** → **Crear
suscripción**, una por cada plan. **El ID tiene que ser exactamente este** (la app y el servidor lo
buscan así, y en Google **no se puede cambiar ni volver a usar nunca**):

| ID de la suscripción (exacto) | Nombre | Beneficio |
|---|---|---|
| `ar.com.gize.app.coach.p10` | Plan 10 clientes | Hasta 10 clientes en GIZE |
| `ar.com.gize.app.coach.p25` | Plan 25 clientes | Hasta 25 clientes en GIZE |
| `ar.com.gize.app.coach.p50` | Plan 50 clientes | Hasta 50 clientes en GIZE |
| `ar.com.gize.app.coach.p100` | Gimnasio chico | Hasta 100 alumnos en GIZE |
| `ar.com.gize.app.coach.p250` | Gimnasio | Hasta 250 alumnos en GIZE |
| `ar.com.gize.app.coach.p500` | Gimnasio grande | Hasta 500 alumnos en GIZE |

Son los mismos IDs que en el App Store (docs/APPLE-COMPRAS.md).

## 4. El plan base de cada suscripción

En cada una de las 6: **Agregar plan base** →

- **ID del plan base:** `mensual` (exacto, el mismo en todas).
- **Tipo:** renovación automática, **período de facturación mensual**.
- **Período de gracia:** 7 días (si a un coach le rebota la tarjeta, Google sigue intentando cobrar
  y GIZE le mantiene el plan esos días).
- **Suspensión de cuenta:** la automática (la que viene). Mientras está suspendida, el coach no
  tiene el plan, como cuando vence con Mercado Pago.
- **Volver a suscribirse:** permitido. **Pausa:** desactivada, si aparece.
- **Precios:** el mismo precio en dólares que en App Store Connect (de US$9,99 el de 10 a US$129,99
  el de 500). Play calcula los demás países; fijate en qué moneda te pide el de Argentina.
- **Guardar** y **Activar**.

**No crees ofertas** (ni prueba gratis ni descuentos): la prueba gratis de GIZE la da el servidor.

## 5. IA Plus (cuando quieras venderlo en Android)

Otra suscripción, con ID `ar.com.gize.app.iaplus.mensual`, nombre **IA Plus**, beneficio **Hasta
10 fotos del plato por día con IA**, plan base `mensual`, US$2,99 y los mismos ajustes del paso 4.

## 6. Google Cloud: las dos APIs

En console.cloud.google.com, en el proyecto de Firebase de GIZE (el de las notificaciones de
Android) o en uno nuevo solo para esto:

**APIs y servicios** → **Biblioteca** → habilitá **Google Play Android Developer API** y **Cloud
Pub/Sub API**.

## 7. La cuenta de servicio (la «llave» del servidor)

1. **IAM y administración** → **Cuentas de servicio** → **Crear cuenta de servicio**: nombre
   `gize-play`. **No le des roles del proyecto** (no hacen falta) → **Listo**.
2. Entrá a la cuenta → pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → **JSON**.
   Se baja un archivo: **es secreto**. Se usa en el paso 12 y después se borra.
3. Si dice que la organización no deja crear claves: **IAM y administración** → **Políticas de la
   organización** → «Inhabilitar la creación de claves de cuentas de servicio» → anulala para este
   proyecto y volvé a probar.

Es una cuenta aparte de la de Firebase a propósito: tiene menos permisos juntos y la podés borrar
sin cortar las notificaciones.

## 8. El tema de Pub/Sub (por donde Google avisa)

Así GIZE se entera de cada renovación, cancelación, suspensión o reembolso aunque el coach no abra
la app.

1. **Pub/Sub** → **Temas** → **Crear tema**: ID `play-gize` (destildá «Agregar una suscripción
   predeterminada») → **Crear**.
2. En el tema → **Permisos** → **Agregar principal**:
   `google-play-developer-notifications@system.gserviceaccount.com` con el rol **Publicador de
   Pub/Sub** → **Guardar**. (Es la cuenta de Google Play que publica los avisos.)

## 9. Que Pub/Sub pueda firmar sus avisos

**IAM** → **Otorgar acceso** → principal `service-NUMERO@gcp-sa-pubsub.iam.gserviceaccount.com`
(NUMERO es el **número del proyecto**, que está en la página de inicio del proyecto) → rol
**Creador de tokens de cuenta de servicio** → **Guardar**. Así Pub/Sub firma cada aviso a nombre
de `gize-play` y el servidor comprueba que viene de Google.

## 10. La suscripción «push» al servidor

**Pub/Sub** → **Suscripciones** → **Crear suscripción**:

- **ID:** `play-gize-supabase`. **Tema:** `play-gize`.
- **Tipo de entrega:** **Push**. **Extremo:**
  `https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/compras-google`
- Tildá **Habilitar autenticación** → cuenta de servicio **gize-play** → **Público (audience):**
  exactamente la misma dirección de arriba.
- **Sin** «desenvolver la carga útil» (sin «payload unwrapping»).
- **Plazo de confirmación:** 60 segundos. **Retención de mensajes:** 7 días. **Política de
  reintentos:** con demora exponencial.
- **Crear**.

Si algo de esto queda mal, el servidor contesta «No autorizado» y Pub/Sub sigue reintentando hasta
7 días: lo arreglás y los avisos llegan solos.

## 11. Darle permiso a la cuenta de servicio en Play Console

Play Console → **Usuarios y permisos** → **Invitar usuarios** → el mail de la cuenta de servicio
(el `client_email` del JSON, termina en `iam.gserviceaccount.com`) → **Permisos de la app** →
GIZE, con:

- **Ver datos financieros, pedidos y respuestas de la encuesta de cancelación**
- **Administrar pedidos y suscripciones**

→ **Invitar usuario**. **Puede tardar hasta un día en empezar a andar.** Mientras tanto Google le
contesta «sin permiso» al servidor: el panel lo muestra y los avisos se reintentan solos.

## 12. La clave en Supabase

Supabase → el proyecto de GIZE → **Edge Functions** → **Secrets** → **Add new secret**:

- **Nombre:** `GOOGLE_PLAY_SA` (exacto).
- **Valor:** el contenido **entero** del archivo JSON del paso 7 (abrilo con un editor de texto,
  copiá todo, desde la primera `{` hasta la última `}`).

Guardá y **borrá el archivo de la compu** (y de la papelera). Si algún día sospechás que alguien
lo vio: en Google Cloud borrá esa clave de la cuenta de servicio, creá otra y reemplazá el secret.

## 13. La base y las funciones

GitHub → **Actions** → **Supabase** → **Run workflow** (desde main), en este orden:

1. Tarea **sql**, archivo `supabase/ia.sql`.
2. Tarea **sql**, archivo `supabase/compras-google.sql`.
3. Tarea **funciones** (publica `compras-google` y las que cambiaron: `borrar-audios`, `admin`,
   `vence-plan` y `suscripcion`). Tiene que terminar en «Publicadas y al día».

## 14. Los avisos en tiempo real de Play Console

Play Console → **GIZE** → **Monetizar con Play** → **Configuración de la monetización** →
**Notificaciones en tiempo real para desarrolladores**:

- Tildá **Habilitar notificaciones en tiempo real**.
- **Nombre del tema:** `projects/ID_DEL_PROYECTO/topics/play-gize` (ID_DEL_PROYECTO es el ID del
  proyecto de Google Cloud, no el número).
- **Tipo de notificación:** suscripciones y todas las compras anuladas.
- **Guardar** → **Enviar mensaje de prueba**.

En gize.ar/admin → **Coaches y pagos** → **Cobro con Google Play** tiene que decir que el último
aviso de Google Play llegó recién (mensaje de prueba) y que la clave de Google anda.

## 15. Cuentas que prueban sin pagar

Play Console → **Configuración** → **Prueba de licencias** → agregá tu Gmail (y el de quien
pruebe), con la respuesta **RESPOND_NORMALLY** → **Guardar**. Esas cuentas no pagan: la
suscripción mensual se renueva cada 5 minutos unas 6 veces y después vence sola.

## 16. Prender el cobro solo para las cuentas de prueba

1. gize.ar/admin → **Usuarios** → tu cuenta de coach de prueba → marcala como **cuenta de prueba**.
2. **Coaches y pagos** → **Cobro con Google Play** → **Planes de coach:** «Solo cuentas de prueba».
3. Para IA Plus: poné esos mails en **IA** → **IA Plus** → «Compras de prueba de Apple y Google
   Play» y pasá **IA Plus** a «Solo cuentas de prueba». (A diferencia de los planes, IA Plus lo
   puede comprar cualquier cuenta: una compra de prueba solo lo activa en las cuentas de esa lista.)

## 17. Probar en un Android

En un Android con el Gmail del paso 15: instalá GIZE desde el link de Pruebas internas, entrá con
la cuenta de coach de prueba **sin plan pago** (en la prueba o vencida) → **Ver planes** →
**Suscribirme** → pagá con la tarjeta de prueba → tiene que decir «¡Listo!». Probá también
**Cambiar a este plan**, **Administrar en Google Play** (cancelala desde ahí), **Recuperar mi
suscripción** y que a la media hora venza sola.

## 18. Publicar y prender para todos

1. Si todo anduvo: Play Console → **Producción** → **Crear versión** con ese `.aab` (o uno nuevo)
   → mandala a revisión. Opcional: en **Contenido de la app** → **Acceso a la app**, sumá una cuenta
   de coach sin plan y contá dónde están los planes (Panel de coach → Ver planes).
2. Cuando esté publicada: gize.ar/admin → **Avisos** → **Cartel de actualización** → Android
   «Última» = el número nuevo.
3. **Coaches y pagos** → **Cobro con Google Play** → **Planes de coach:** «Todos». IA Plus: «Todos»
   cuando lo hayas probado.

**Importante:** si nadie reconoce una compra en 3 días, Google devuelve la plata sola. El servidor
la reconoce apenas la guarda; por eso no pases a «Todos» sin ver antes que la clave anda y que
llegan los avisos.

## 19. Seguridad de los datos (ficha de Play)

Play Console → **Contenido de la app** → **Seguridad de los datos** → **Editar**: sumá
**Información financiera → Historial de compras**: se recolecta, no se comparte, es obligatorio
para comprar, para «Funcionalidad de la app» y «Administración de la cuenta», y se puede pedir que
se borre → **Enviar**.

## 20. Precios

Cuando cambies los precios de la web, decidí si cambiás los de Play (la suscripción → plan base →
**Precios**). Los que ya están suscriptos siguen con su precio salvo que hagas una migración de
precios (Google les avisa y, si sube, puede pedirles que la acepten).

## 21. Reembolsos y botón de arrepentimiento

Si alguien lo pide a contacto@gize.ar: Play Console → **Gestión de pedidos** → buscá el pedido (el
número empieza con `GPA.`, aparece en el panel) → **Reembolsar**, con **Revocar acceso**. GIZE se
entera solo (aviso de compra anulada) y corta el plan.

---

### Qué hace el servidor

- Cada compra que hace la app la vuelve a leer en la API de Google (no confía en lo que manda la
  app): tiene que ser de GIZE, de uno de los productos de arriba y de la misma cuenta de GIZE que la
  compró. Los planes, solo para cuentas de coach.
- Cada aviso de Google (renovación, cancelación, gracia, suspensión, reembolso) hace volver a leer
  la compra y actualiza el plan, aunque el coach no abra la app. El mail «tu plan vence mañana» no
  le llega a quien Google le renueva el plan solo.
- Si alguien elimina su cuenta (desde la app o vos desde el panel), primero se cancela la renovación
  en Google: si Google no contesta, la cuenta no se borra y se pide reintentar.

### Qué guarda GIZE de cada compra

El código de la compra, el número del pedido de Google Play, qué plan es, hasta cuándo está pago,
si se renueva solo, si Google lo reembolsó y si fue una compra de prueba. La tarjeta y los datos de
pago los maneja Google. Está en la Política de privacidad (gize.ar/privacidad).
