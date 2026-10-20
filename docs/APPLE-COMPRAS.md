# Planes de coach con Apple (compras dentro de la app de iPhone)

Apple pide que, si un coach usa su plan dentro de la app de iPhone, también lo pueda comprar ahí,
con Apple. Por eso en la app de iPhone los coaches ven los planes con el precio que pone Apple y un
botón «Suscribirme». Apple cobra, renueva cada mes y te paga a vos. En la web y en Android todo
sigue igual (Mercado Pago y transferencia).

Esta guía es lo que tenés que hacer vos en **App Store Connect** (appstoreconnect.apple.com).
Hacelo en este orden. No hace falta tocar código.

---

## 1. Contratos, banco e impuestos

Sin esto, Apple no deja vender nada (ni siquiera probar las compras).

1. App Store Connect → **Negocios** (o «Acuerdos, impuestos y banca»).
2. En **Apps pagas** (Paid Apps), tocá **Ver y aceptar los términos** y aceptá el acuerdo.
3. **Cuenta bancaria**: agregá la cuenta donde Apple te va a pagar (titular, banco, número de cuenta
   y código SWIFT de tu banco). Tiene que estar a nombre del titular de la cuenta de desarrollador.
4. **Impuestos**: completá los formularios que te pida. Para Argentina, el de Estados Unidos es el
   **W-8BEN** si la cuenta de desarrollador es tuya como persona, o el **W-8BEN-E** si es de una
   empresa. Si te pide otros, completalos también.
5. Esperá a que el acuerdo de Apps pagas diga **Activo** (puede tardar uno o dos días).

## 2. Programa para pequeñas empresas (comisión del 15 %)

Apple se queda con el 30 % de cada venta, salvo que te anotes en el **App Store Small Business
Program**: ahí se queda con el **15 %** (si vendés menos de un millón de dólares por año).

1. Entrá a developer.apple.com/app-store/small-business-program/ y tocá **Inscribirse**.
2. Respondé las preguntas (si tenés otras cuentas de desarrollador asociadas, hay que nombrarlas).
3. Apple avisa por mail cuando te aceptan. La comisión del 15 % empieza a regir desde el mes
   siguiente (no para atrás): conviene hacerlo antes de publicar la versión con las compras.

## 3. El grupo de suscripciones y los 6 planes

App Store Connect → **Apps** → **GIZE** → en el menú de la izquierda, **Monetización →
Suscripciones**.

### El grupo

1. Tocá **+** al lado de «Grupos de suscripciones» y creá uno con el nombre de referencia
   **Plan de coach**.
2. En el grupo, en **Localización** agregá **Español (México)** con el nombre visible
   **Plan de coach** (es el que ve el coach en los Ajustes de su cuenta de Apple).

### Los 6 planes (uno por uno, dentro del grupo)

Tocá **+** dentro del grupo y creá cada uno con estos datos. **El ID del producto tiene que ser
exactamente este** (la app y el servidor lo buscan así; si tiene una letra distinta, ese plan no
aparece):

| Nombre de referencia | ID del producto (exacto) | Duración | Nombre visible | Descripción |
|---|---|---|---|---|
| Coach 10 | `ar.com.gize.app.coach.p10` | 1 mes | Plan 10 clientes | Hasta 10 clientes en GIZE |
| Coach 25 | `ar.com.gize.app.coach.p25` | 1 mes | Plan 25 clientes | Hasta 25 clientes en GIZE |
| Coach 50 | `ar.com.gize.app.coach.p50` | 1 mes | Plan 50 clientes | Hasta 50 clientes en GIZE |
| Gimnasio chico | `ar.com.gize.app.coach.p100` | 1 mes | Gimnasio chico | Hasta 100 alumnos en GIZE |
| Gimnasio | `ar.com.gize.app.coach.p250` | 1 mes | Gimnasio | Hasta 250 alumnos en GIZE |
| Gimnasio grande | `ar.com.gize.app.coach.p500` | 1 mes | Gimnasio grande | Hasta 500 alumnos en GIZE |

En cada uno:

- **Duración de la suscripción**: 1 mes.
- **Disponibilidad**: los países donde quieras vender (como mínimo, Argentina).
- **Precio**: elegí el precio de Apple. Ojo: **en la tienda de Argentina Apple cobra en dólares
  (USD)**, no en pesos. Elegí el precio en dólares que quieras para Argentina y Apple calcula el de
  los demás países. Los precios de la web ($14.900, $24.900…) no aparecen en el iPhone: el coach ve
  el que pone Apple.
- **Localización**: Español (México) con el nombre visible y la descripción de la tabla.
- **Información para la revisión**: una **captura de pantalla** de la pantalla de planes en el
  iPhone (Panel de coach → tira de abajo del código, «Ver planes») y en **Notas** algo como: «Plan
  mensual para coaches: define cuántos clientes o alumnos puede tener en GIZE. Se compra desde el
  Panel de coach → Ver planes (o Configuración → Ver mi plan).»

### El orden de los planes en el grupo

En la página del grupo, ordená los planes **del más grande al más chico** (arriba Gimnasio
grande, abajo Coach 10). Así Apple sabe cuál es «más» y cuál es «menos»: si un coach se pasa a uno
más grande, Apple lo cambia enseguida y le cobra la diferencia; si se pasa a uno más chico, el
cambio empieza en la próxima renovación.

### Período de gracia (recomendado)

En la página de **Suscripciones**, activá **Período de gracia de facturación** (por ejemplo, 6
días). Si a un coach le rebota la tarjeta, Apple sigue intentando cobrar y GIZE le mantiene el plan
esos días.

### Con la versión de la app

Los planes se mandan a revisión **junto con la versión de la app** que los trae: en la página de
la versión, en **Compras dentro de la app y suscripciones**, tildá los 6 planes antes de mandarla
a revisión.

## 4. Avisos de Apple al servidor (Notificaciones del servidor del App Store)

Así GIZE se entera de cada renovación, cancelación o reembolso aunque el coach no abra la app.

1. App Store Connect → **Apps** → **GIZE** → **Información de la app** (menú de la izquierda).
2. Bajá hasta **Notificaciones del servidor del App Store**.
3. En **URL del servidor de producción** tocá **Configurar**, elegí la **versión 2** y pegá:

   `https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/compras-apple`

4. En **URL del servidor de Sandbox**, lo mismo: versión 2 y la misma dirección.
5. Guardá. (Si aparece el botón para mandar un aviso de prueba, el servidor lo contesta bien y no
   cambia nada.)

## 5. Términos de uso en la descripción de la app

Apple pide el link a los Términos de uso (y a la Política de privacidad) en la app y en la ficha
de la tienda. La app ya los muestra debajo de los planes.

1. En la página de la versión, al final de la **Descripción**, agregá:

   ```
   Términos de uso: https://gize.ar/terminos/
   Política de privacidad: https://gize.ar/privacidad/
   ```

2. En **Información de la app**, la **URL de la política de privacidad** tiene que ser
   `https://gize.ar/privacidad/`.
3. En **Contrato de licencia (EULA)** dejá el de Apple (el estándar): la página de Términos de uso
   de GIZE ya dice que en el iPhone vale también la licencia de Apple.

## 6. Probar con una cuenta Sandbox (sin pagar)

Las compras de prueba de Apple («Sandbox», también las de TestFlight) no cobran nada y las
suscripciones duran mucho menos (minutos u horas en lugar de un mes) y se renuevan solas unas
cuantas veces.

1. App Store Connect → **Usuarios y acceso** → **Sandbox** → **Testers** → **+**. Creá un tester con
   un mail que **no** sea una cuenta de Apple (por ejemplo, uno nuevo de Gmail) y el país
   **Argentina**.
2. En el iPhone de prueba: **Ajustes → App Store → Cuenta de Sandbox** (abajo de todo) e iniciá
   sesión con ese tester.
3. Instalá GIZE desde **TestFlight** (TestFlight compra siempre en Sandbox) y entrá con una cuenta de
   coach **sin plan pago** (en la prueba o vencida). La de cortesía no sirve: con un plan activo la
   app muestra «Tu plan está activo» y no ofrece comprar.
4. Panel de coach → **Ver planes** → **Suscribirme**. Confirmá con el tester de Sandbox.
5. Tiene que aparecer «¡Listo! Tu plan … está activo». Probá también **Restaurar compras** y
   **Administrar suscripción** (desde ahí podés cancelarla).

### Para la revisión de Apple

Apple revisa la app comprando en Sandbox con la cuenta de coach que pongas en **Información para
la revisión de la app** (usuario y contraseña). Esa cuenta tiene que ser de un coach **sin plan
pago ni cortesía** (por ejemplo, una cuenta de coach nueva, en la prueba): si no, no ve los planes
y rechaza la app porque «no encuentra las compras». En las **Notas** poné: «Los planes de coach
están en Panel de coach → Ver planes (o Configuración → Ver mi plan)».

## 7. IA Plus (otro grupo de suscripciones)

IA Plus (la foto del plato y «Contame qué comiste» sin el límite semanal gratis) se vende en el
iPhone con Apple, en **su propio grupo**, así un coach puede tener su plan y además IA Plus:

1. Monetización → Suscripciones → **+** al lado de «Grupos de suscripciones»: nombre de referencia
   **GIZE IA Plus**; en Localización, Español (México), nombre visible **GIZE IA Plus**.
2. Dentro del grupo, **+**: nombre de referencia **IA Plus mensual**, ID del producto exactamente
   **`ar.com.gize.app.iaplus.mensual`**, duración 1 mes, precio US$2,99 (el más cercano a US$3),
   localización Español (México): nombre visible **IA Plus**, descripción **Foto del plato y texto
   con IA sin límite semanal**.
3. Información para la revisión: captura de la oferta en el iPhone (Comida → Agregar → Foto, con
   los usos gratis de la semana terminados, o Ajustes → Mi IA Plus) y en Notas: «Suscripción
   mensual opcional que saca el límite semanal de las funciones con IA de Comida. Se compra en
   Ajustes → Mi IA Plus (o en Comida → Agregar → Foto, cuando se terminan los usos gratis)».
4. Se manda a revisión con la versión de la app que trae IA Plus (Compras dentro de la app y
   suscripciones → tildar «IA Plus mensual»). Los avisos al servidor usan la misma dirección de la
   sección 4: no hay que cambiar nada.

La guía completa para prenderlo (también Mercado Pago en la web y el panel) se arma con cada
entrega; lo de la base está en `supabase/ia.sql` (tabla `ia_plus`).

---

### Qué guarda GIZE de cada compra

Solo el número de la transacción de Apple, el plan, hasta cuándo está pago, si se renueva solo y
si Apple lo reembolsó. La tarjeta y los datos de pago los maneja Apple. Está en la Política de
privacidad (gize.ar/privacidad).
