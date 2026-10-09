# Reglas de R8 para la versión de Play Store (minifyEnabled en build.gradle).
# R8 saca y renombra lo que no ve usado. Se protege todo lo que se busca por nombre:

# Capacitor carga los plugins por el nombre de la clase (capacitor.plugins.json) y llama a sus
# métodos por reflexión. Capacitor ya trae reglas para eso; por las dudas se guardan enteros
# los paquetes de los plugins que lleva la app de Android: los de Capacitor (app, browser,
# filesystem, local-notifications, push-notifications, share), Salud (Health Connect) y el login
# con Google y Apple. El de ubicación no va en Android (capacitor.config.json android.includePlugins).
# El plugin propio (RestTimerPlugin) y las pantallas del manifiesto, también.
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class app.capgo.plugin.health.** { *; }
-keep class ee.forgr.capacitor.** { *; }
-keep class ar.com.gize.app.** { *; }

# El login con Google (@capgo/capacitor-social-login) se fija si existen estas clases con
# Class.forName (DependencyAvailabilityChecker): si R8 las renombrara, el plugin creería que
# no están y «Continuar con Google» (o «con Apple», que usa las pestañas del navegador) dejaría
# de andar.
-keep class com.google.android.gms.auth.api.identity.** { *; }
-keep class com.google.android.gms.common.api.ApiException { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
-keep class androidx.browser.customtabs.** { *; }

# Facebook no se incluye (gradle.properties: socialLogin.facebook.include=false, compileOnly):
# el plugin lo nombra igual y R8 no tiene que cortar la compilación por eso.
-dontwarn com.facebook.**

# Health Connect (pasos: el cliente habla con Health Connect con mensajes que arma por reflexión)
# y Credential Manager (Google: busca su implementación por el nombre de la clase).
-keep class androidx.health.connect.client.** { *; }
-keep class androidx.health.platform.client.** { *; }
-keep class androidx.credentials.** { *; }

# Notificaciones push (Firebase Cloud Messaging): el servicio que recibe los mensajes.
-keep class com.google.firebase.messaging.** { *; }

# Anotaciones y genéricos que usan Capacitor y los plugins.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, Exceptions

# Para que los errores que lleguen de Play Console se puedan leer (con el mapping.txt).
-keepattributes SourceFile, LineNumberTable
