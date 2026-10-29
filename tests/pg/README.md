# Base de pruebas con Postgres

Un Postgres 16 de verdad con el esquema de la base de GIZE, armado **desde el repo**, para probar
la RLS, las funciones y los triggers sin tocar producción. Lo usan las pruebas
`tests/gimnasios-*.test.mjs` (etapa 0 del panel para gimnasios). La ayuda es `tests/pg.mjs`.

## Cómo se arma

En este orden, cada archivo en una sola transacción (como la tarea sql del workflow «Supabase»):

1. `supabase-simulado.sql`: lo que Supabase ya trae y los `.sql` dan por hecho. Los roles `anon`,
   `authenticated` y `service_role` (con `bypassrls`) y los demás de Supabase; `auth.users` y
   `auth.uid()`/`auth.jwt()` con la definición de Supabase (leen `request.jwt.claims`); `storage`
   con `buckets`, `objects` (con RLS) y `foldername`; el esquema `extensions` con `pgcrypto` y
   `uuid-ossp`; `cron` y `net` simulados (las tareas quedan anotadas y no corren, los pedidos
   quedan en una cola); `vault` con un secreto de prueba; la publicación `supabase_realtime`; y lo
   que se crea en `public` nace abierto para `anon`, `authenticated` y `service_role`, como en
   Supabase (así los `revoke` del repo valen lo mismo que allá).
2. `esquema-base.sql`: las 13 tablas que existen en producción y ningún archivo del repo crea
   (`base.sql`: «Los CREATE TABLE no se exportaron»), **inferidas** de lo que usan la app y las
   funciones. Lo que es supuesto está marcado.
3. Los `supabase/*.sql` en el orden de `orden.txt` (con la razón de cada lugar que no es el
   cronológico). Lo único que se cambia de esos archivos: cada `create extension if not exists
   pg_cron/pg_net` va comentado (no existen en un Postgres común). Cualquier otro error corta.
4. `ayudas.sql`: el esquema `prueba`, solo de la base de pruebas: correr SQL como cada persona (su
   rol y su `auth.uid()`, como PostgREST), con o sin deshacer, y los invariantes de los gimnasios.

Eso es la base de hoy, `gize_sin`. Con los archivos de los gimnasios encima (`GIMNASIOS` en
`tests/pg.mjs`: `gimnasios.sql`, `gimnasios-vinculo.sql` y, desde la etapa 1, `gimnasios-lectura.sql`,
`gimnasios-socios.sql` y `gimnasios-admin.sql`, desde la etapa 2 `gimnasios-cuotas.sql` y desde la 3 `gimnasios-clases.sql`), `gize_con`. Las dos se arman una vez por proceso (menos de 2 segundos) y cada prueba
trabaja en una copia nueva.

## Correrla

```
PW=/tmp/pw/node_modules/playwright/index.mjs node tests/run.mjs gimnasios
```

Hace falta Postgres 16 (`postgresql-16`; las pruebas buscan `initdb` en `/usr/lib/postgresql/*/bin`).
Arma un cluster temporal en `/tmp`, que escucha solo en un socket dentro de esa carpeta (no choca con
otro Postgres ni con otra prueba que corra a la vez), y lo borra al salir. `initdb` no corre como
root: si la prueba corre como root, `initdb` y `postgres` corren como el usuario `postgres` del sistema.

El cluster entra sin contraseña (`trust`), así que lo cuida el permiso del socket: la carpeta queda
`0700` (de quien corre la prueba, o de `postgres` si corre como root) y el socket `0700`. Ningún otro
usuario de la máquina se conecta como superusuario. Se apaga y se borra también con `SIGHUP` (se cerró
la terminal o se cortó el SSH); si la prueba murió con `kill -9`, lo limpia la corrida siguiente (la
carpeta anota el proceso de la prueba en `prueba.pid`).

| Variable | Qué hace |
|---|---|
| `GIZE_PSQL` | Usa un Postgres ya levantado: el comando de `psql` para conectarse (en GitHub, `docker exec -i gize-pg psql -U postgres`). El SQL va por la entrada estándar. |
| `PG_BIN` | La carpeta de `initdb`, `pg_ctl` y `psql`, si no es la de siempre. |
| `GIZE_PG_OBLIGATORIO=1` | Si no hay Postgres, falla en vez de saltearse (lo usa GitHub). |
| `GIZE_PG_SALTEAR=1` | Se saltean siempre. |
| `GIZE_SEMILLAS`, `GIZE_SEMILLA` | Cuántas semillas al azar corre `gimnasios-igual` (200) y desde cuál: para repetir una que falló, `GIZE_SEMILLA=n GIZE_SEMILLAS=1`. |
| `GIZE_SEMILLAS_SIN` | Cuántas corre la comparación contra `gize_sin` de `gimnasios-igual` (30). |

En GitHub corren en **Base de pruebas** (`.github/workflows/base-de-pruebas.yml`): con cada push a
cualquier rama que cambie `supabase/`, estas pruebas o el workflow; con la imagen `postgres:16`
fijada por digest en `.github/postgres-pruebas/Dockerfile`; sin secrets.

## Qué prueba cada archivo

| Archivo | Qué prueba |
|---|---|
| `gimnasios-base` | Que la base se arma; que cada función que una nota «OJO» declara vigente quedó con el cuerpo de ese archivo (si el orden estuviera mal, lo dice); que `gimnasios.sql` no cambia nada de lo que ya existía (huella del esquema igual, y las operaciones de hoy dan lo mismo); que los dos archivos se pueden volver a correr; que volver atrás deja exactamente la huella de la base de hoy; que correrlos en el orden equivocado falla sin cambiar nada; que la nota de `pasos-grupos.sql` deja los filtros de bloqueos; qué ve la huella (triggers con funciones de otros esquemas, permisos por defecto, ajustes del servidor); y que el cluster local no lo alcanza otro usuario y se limpia con `SIGHUP` o en la corrida siguiente. |
| `gimnasios-igual` | «Sin gimnasios todo sigue igual»: las cuatro funciones canónicas contra las de hoy (que salen del bloque comentado de `gimnasios-vinculo.sql`), con 200 semillas de datos al azar; y después de cada operación, `seats_used` igual al recuento. Desde la etapa 1, además, con los archivos de los gimnasios aplicados contra `gize_sin` con los mismos datos (30 semillas, `GIZE_SEMILLAS_SIN`): lo que lee cada persona (13 tablas, perfiles, mensajes, `coach_billing`, `avatars` y `chat-audio`), desde la parte 5 también `admin_coaches`, `admin_overview` y el mail de vencimiento (`hay_avisos_vence`, `tomar_avisos_vence`, `soltar_aviso_vence`) en las columnas y claves de hoy, y las operaciones de hoy. |
| `gimnasios-matriz` | La matriz de personas de la spec: qué lee, escribe y borra cada una en cada tabla nueva y en las de hoy, cada función, `join_coach` fila por fila, los casos obligatorios de la etapa 0, la ficha en baja, la solicitud de quien borra su cuenta, los invariantes después de cada operación y la concurrencia (el último lugar, dos desvínculos a la vez, un vínculo y un desvínculo a la vez, y el cron de planes vencidos con un desvínculo: sin deadlock y con el cupo exacto). |
| `gimnasios-rendimiento` | `EXPLAIN ANALYZE` (sin JIT) de la ficha de un alumno con 500 entrenos, con las funciones de hoy y las nuevas, con el esquema del repo y con un índice en `session_entries(session_id)`; y que `sessions` se lea por su índice. |
| `gimnasios-sql` | Sin Postgres: cabeceras, permisos, que se pueda volver a correr, los mensajes de `join_coach`, sin mails ni uuids; desde la etapa 1 también de `gimnasios-lectura.sql` y `gimnasios-socios.sql` (guardas de orden, `revoke` y `grant` escritos, volver atrás que borra cada función, el bucket sin `update` ni `delete`, las tareas en UTC, las versiones en un solo lugar, ningún texto de error que nombre el plan). |
| `gimnasios-rpc` | Etapa 1. Cada RPC con cada persona de la matriz: quién puede, quién recibe `42501` y quién `P0001`, que lo hecho queda en `gym_audit` y los invariantes después; la forma de `mi_gimnasio` por rol; `gym_crear` con el interruptor; `gym_config` y su lista blanca; exportar con el plan vencido; la recepción (buscar, semáforo, ingreso que no se duplica, dos toques a la vez); `gym_ficha_profe` (la tarjeta «Gimnasio» del profe: solo de quien atiende, con el acceso pausado `P0001`) y `cupo_lleno` del profe; las internas sin permiso para la app (también sin los permisos por defecto). |
| `gimnasios-solicitudes` | Etapa 1. Cómo entra un socio: el código y la hoja con su versión, cancelar, la app vieja, la unión por mail verificado, «aprobar solas», el tope de 30 pedidos pendientes (y 5 por persona), el link `#unirme` con DNI (5 intentos, una vez, 7 días) y sin DNI, aprobar, «es la ficha de…», rechazar y dos aprobaciones a la vez por el último lugar. |
| `gimnasios-estados` | Etapa 1. Cada fila de §6.13 que no es del plan ni de borrar la cuenta (aprobar, códigos personales, asignar profe con las rutinas programadas, dejar, desvincularse, bloquear, pausar y la vuelta, salir con y sin «seguir con mi profe», baja y reactivar, cerrar el gimnasio) y el equipo (invitar, aceptar con cada estado y el tope de profes, cambiar el rol, quitar con reasignación). |
| `gimnasios-plan` | Etapa 1. El plan del gimnasio: estado en `mi_gimnasio`, qué anda en los días 0–5, 5–10 y desde el 10, `release_lapsed_gyms`, restaurar con `gym_tick` después de pagar por MP, Apple o el admin, sobre el cupo solo se frenan las altas, y liberar, restaurar y un `join_coach` a la vez. |
| `gimnasios-borrar` | Etapa 1. Borrar la cuenta de la dueña (cierre y purga a los 90 días), del profe por defecto, de otro profe, de la recepción, del encargado y de un socio; el borrado no falla aunque falle el trigger. |
| `gimnasios-chat` | Etapa 1. El chat dentro de un gimnasio: el profe que deja de atender no lee ni escucha; el socio conserva todo; nadie más lee chats ajenos; `coach_client_ok` y el `gym_id` de cada mensaje; lo que pregunta `rapid-worker` (y `avisos-coach`) con el service role según el plan del gimnasio y el propio del profe (gracia, acceso pausado, plan propio vencido, el profe que dejó al socio). |
| `gimnasios-foto` | Etapa 1. La foto del gimnasio (la saca o la aprueba el gimnasio, el socio solo propone): bucket `gym-fotos`, quién sube y ve (el profe, solo sus asignados; los pedidos, quien aprueba), tope por día, proponer, aprobar, rechazar, sacarla el gimnasio, la foto de un pedido unido a una ficha cargada («es la ficha de…» y el link `#unirme`), las fotos que ya no usa nadie; la de perfil no la reemplaza. |
| `gimnasios-admin` | Etapa 1 (parte 5). El admin de GIZE (`gimnasios-admin.sql`): cada `admin_gym*` solo la llama el admin (cada persona de la matriz, 42501; anon, sin permiso) y queda en `admin_audit` y `gym_audit`; la lista y el detalle sin datos de socios; las marcas; convertir (fichas activas con el dueño como profe, sin la hoja, `coach_id`, rutinas programadas y chat intactos, misma fila del plan, los no elegidos siguen como alumnos propios); transferir (los socios con la hoja pasan al dueño nuevo con sus rutinas programadas, los que no la aceptaron a baja con su coach, el plan a la fila nueva, el aviso de la suscripción de Mercado Pago, reabrir uno cerrado por la baja del dueño); cerrar; el tope de profes; la auditoría; el interruptor de alta; `admin_coaches` y `admin_overview` con gimnasios; y el mail de vencimiento (dueños a 7, 3 y 1 día una sola vez, con la copia a la administración; el profe sin alumnos propios afuera; dos llamadas a la vez no repiten). |
| `gimnasios-cuotas` | Etapa 2. Las cuotas (`gimnasios-cuotas.sql`): cada RPC con cada persona (la recepción cobra solo con «registra pagos»; profe y socio no cobran) y que queda en `gym_audit`; tipos de cuota (nombre repetido, archivar), asignar (no la ficha de otro gimnasio), qué período cubre cada pago (sin pagos o vencida, desde el día que pagó; al día, desde el vencimiento; «cubre hasta» a mano), el mismo id no anota dos, anular; el semáforo con la cuota (al día, por vencer, vencida, sin pagos; sin cuota, el de la etapa 1) en la recepción y para el profe, sin montos; el ingreso con la cuota vencida (y con «No dejar entrar»); el resumen del mes; lo que ve el socio; quién lee las tablas; el plan liberado; y que los pagos se van con la ficha y con el gimnasio. |
| `gimnasios-clases` | Etapa 3. Las clases (`gimnasios-clases.sql`): cada RPC con cada persona (dueño y administración editan; la recepción anota, saca y marca el presente; el profe ve y marca solo las suyas; el socio reserva) y que lo del equipo queda en `gym_audit`; crear y cambiar una clase (los datos que no van, el día no cambia, el profe del equipo, la hora nueva en las fechas que vienen, subir el cupo pasa a la espera), la semana por rol; reservar (cupo, espera en orden, la misma reserva no duplica, cancelar pasa solo al primero con su aviso, los límites de horas y de días, pausado, visita, la cuota vencida con el interruptor, el tope de 10); **cinco socios a la vez por dos lugares y dos cancelaciones a la vez** (sin pasarse del cupo); cancelar una fecha (avisa, no se reserva, se vuelve a dar), anotar y sacar desde el mostrador (la ficha sin app, con aviso por mail), el presente (del ingreso en horario o marcado), la baja que suelta las reservas, archivar; quién lee las tablas; el plan liberado; las internas sin permiso; la limpieza de 12 meses y que todo se va con la ficha y con el gimnasio. |
| `resumen-semanal-sql` | El resumen de los lunes (`resumen-semanal.sql`), en `gize_sin` con fechas fijas: qué cuenta como entrenó, los días sin entrenar, los nuevos sin empezar y los récords (la regla del festejo, con los errores de tipeo); a quién le llega (no a las cuentas de prueba, a quien lo apagó, al plan vencido ni sin alumnos); una vez por semana, los reintentos, dos tomas a la vez, la ventana, el tope del día y el interruptor; los permisos, la baja con el token y el panel. En `gize_con`, cada profe con los socios que ve (sin los socios en pausa ni con el plan del gimnasio vencido). |
| `gimnasios-lectura` | Etapa 1. Lo que lee la administración (11 tablas, cuándo deja de leer, leer no es editar), registro diario sin `steps` y salidas sin `track`, las fotos de perfil entre el gimnasio y sus socios, y la fila de `coach_billing` que no ve el profe con la app vieja. |
| `pagina-coach-sql` | La página pública del coach (`pagina-coach.sql`, gize.ar/c/<alias>), en la base de hoy y con los gimnasios: crear el link (formato, reservados, ocupado, dos coaches a la vez por el mismo), cambiarlo (libre las primeras 24 horas, después una vez por semana con la fecha en el mensaje, el link viejo que lleva al nuevo 90 días y nadie toma, volver al propio, el vencido que se libera), lo que ve la página sin sesión y con sesión (apagada, pausada, cuenta de coach no activa, otro rol, sin código, bloqueos, sin foto, `es_mi_coach` y `soy_yo`), la foto en `avatars` (sin sesión, solo la de perfil del coach con la página visible), el admin (pausar, reanudar y liberar, con `admin_audit`; los demás, `42501`), borrar la cuenta, la tarea de pg_cron, que se puede correr dos veces y que volver atrás deja la huella de la base sin el archivo. |

## Dónde la base de pruebas puede no ser producción

La spec pedía un volcado del esquema de producción; acá no se toca producción, así que la base sale
del repo. Estas son las diferencias posibles, y lo que mide la huella del esquema
(`supabase/esquema-huella.sql`) para encontrarlas:

| # | Posible diferencia | Qué compara la huella |
|---|---|---|
| D1 | Las 13 tablas inferidas: tipos, `not null`, defaults, checks, claves foráneas y sus `on delete`, índices, columnas viejas o de más. | `col:`, `con:` e `idx:` de cada tabla. |
| D2 | Funciones o políticas cambiadas a mano en el SQL Editor y no copiadas al repo, y objetos que solo existen allá (por ejemplo, políticas de las tablas base con otros nombres, o la `schedule_rest_alarm(int)` vieja). | `fn:` (md5 del cuerpo, lenguaje, `security definer`, ajustes) y `pol:` (md5 de `using` y `with check`). |
| D3 | Archivos que se editaron después de la última vez que se corrieron, u orden real distinto. | Lo mismo que D2. |
| D4 | Lo que maneja Supabase: `auth`, `storage` (por ejemplo, el bucket `checkins`, que ningún archivo crea), versiones de extensiones, `vault`, y triggers que se arman desde el panel («Database Webhooks», `moddatetime`), que llaman a funciones de otros esquemas. | `ext:`, `bucket:`, `pol:storage.objects.*`, `trg:` (todos los de las tablas de `public`, con la función que llaman, y los de otras tablas que llaman a funciones de `public`). Lo interno de `auth` y `storage` se deja afuera a propósito. **Antes de aplicar `gimnasios.sql`, mirar los `trg:coach_billing.*` de producción**: desde los gimnasios, cada vínculo y cada desvínculo actualiza `coach_billing.seats_used`, así que un trigger de esa tabla (un webhook que avisa del plan, un `updated_at`) se dispararía con cada alumno que entra o sale. |
| D5 | Roles: en Supabase `postgres` no es superusuario (tiene `bypassrls`) y algunos objetos son de `supabase_admin`. | `rol:` y `fndueno:`. |
| D6 | Permisos por defecto (`alter default privileges`) y `revoke` aplicados o no. Las funciones nuevas que llama el service role tienen su `grant` escrito y no dependen de los permisos por defecto; el resto sí. | `defacl:` (los permisos por defecto de cada rol y esquema), `fnacl:`, `tblacl:` y `colacl:` (anon, authenticated, service_role). |
| D7 | Versión de Postgres (producción: no se sabe si 15 o 17; prueba: 16). | `version`. Si producción no es 16, se cambia `.github/postgres-pruebas/Dockerfile`. |
| D8 | Ajustes por rol (`statement_timeout` de `anon` y `authenticated` en Supabase). | `ajuste:`. |
| D9 | Datos que rompan la igualdad sin gimnasios (por ejemplo, coaches con `coach_id`, que hoy cuentan en el cupo de su coach). | Cuatro conteos `dato:` (no se comparan: se muestran). |
| D10 | Índices de producción que el repo no declara: cambian los tiempos del `EXPLAIN`. En particular, el repo no tiene un índice en `session_entries(session_id)`: sin él, la ficha con 500 entrenos recorre la tabla por cada entreno. `gimnasios-rendimiento` mide con y sin ese índice. | `idx:`. |
| D11 | Tablas de la publicación de realtime. Si `coach_billing` estuviera en la publicación, cada cambio de `seats_used` (cada vínculo y desvínculo) saldría por realtime: mirarlo antes de aplicar `gimnasios.sql`, como los triggers de D4. | `pub:supabase_realtime`. |
| D12 | Tareas de pg_cron: nombre, horario, comando (acá no corren nunca). | `cron:` (horario y md5 del comando). |
| D13 | Ajustes del servidor que cambian los planes y los tiempos: `jit` y sus umbrales, `work_mem`, `random_page_cost`, `effective_cache_size`… Los tiempos de `gimnasios-rendimiento` son de un Postgres local con JIT apagado. | `servidor:`. |

### Cómo compararla con producción (cuando el dueño lo apruebe)

Ninguna de estas formas imprime datos de nadie: la huella es estructura, hashes y cuatro conteos.

1. **SQL Editor** (lo más simple): el dueño pega `supabase/esquema-huella.sql` en Supabase → SQL
   Editor, copia el resultado (un JSON) a un archivo y corre
   `node tests/pg/comparar-huella.mjs <archivo>`, que arma esta base, le saca la misma huella y
   lista lo que está solo en producción, lo que está solo en el repo y lo que difiere. Con `--con`
   compara contra la base con los gimnasios (después de aplicarlos). No va por el workflow: la
   tarea sql no imprime resultados porque el log es público.
2. **La copia de seguridad semanal** (sin tocar producción): el dueño, con `BACKUP_PASSWORD`,
   descifra la copia en su computadora (ver `backup.yml`), la restaura con `pg_restore --schema-only`
   en un Postgres local preparado como lo hace `backup.yml` (roles y extensiones), corre ahí
   `supabase/esquema-huella.sql` y compara como en 1. Solo el esquema: los datos no hacen falta.
3. **`npx supabase db dump --schema-only`** (como dice `base.sql`), restaurado igual que en 2.

Si aparece una diferencia en D1, se corrige `esquema-base.sql`; en D2 o D3, se copia al repo lo
que está en producción (o se vuelve a correr el archivo del repo, si lo correcto es el repo).

## Etapa 1 (parte P1: base de datos y permisos)

- **Archivos:** `gimnasios-vinculo.sql` suma lo que faltaba del paso 2 de §6.7 (política de
  `coach_billing` para las apps viejas, políticas del chat, `routine_schedule_on_coach_change` con
  `gize.gym_keep_routines`, el `before delete` de `profiles`, las guardas de `admin_set_role` y
  `admin_unlink`, los avisos de `profiles_gym_sync`) y las internas que usan `join_coach` y el borrado
  (`gym_pedir`, `gym_aprobar_interno`, `gym_cupo_ok`, `gym_cerrar_interno`…). `gimnasios-lectura.sql`:
  las 11 políticas de lectura de la administración, `gym_registro_lectura` y `gym_cardio_lectura`, y
  `avatars`. `gimnasios-socios.sql`: columnas, el bucket `gym-fotos`, `gym_versiones()`, todas las RPC
  de la etapa 1 y las tareas `gize-gym-tick` y `gize-gym-diaria`.
- **Personas:** las pruebas de la etapa 1 usan `tests/gimnasios-comun.mjs` (la matriz de la etapa 0
  con un segundo profe, un coach sin gimnasio y cuentas nuevas; nombres inventados) en vez de ayudas
  en `ayudas.sql`; el reloj no se simula: se corren las fechas de `coach_billing` y de las fichas.
- **Restaurar al pagar** no es un trigger en `coach_billing` (el pago escribe esa fila antes que los
  perfiles, al revés que todo lo demás): lo hace `gym_tick` cada minuto, en su propia transacción.
- **Lo que queda para las partes siguientes:** `rapid-worker` y `avisos-coach` con
  `coach_client_ok` (P4; el `gym_id` de cada mensaje ya lo pone la base con el trigger
  `coach_messages_gym`, probado con `chat_guardar` en `gimnasios-chat`); la prueba de punta a punta del
  `400` de `join_coach` con PostgREST y las funciones de admin (P5, hechas: ver abajo); y **la tarea que borra las fotos
  de `gym-fotos` que ya no usa ninguna ficha** (pedidos rechazados o cancelados, propuestas
  reemplazadas o rechazadas, gimnasios purgados a los 90 días): desde SQL no se borran archivos de
  Storage, así que `gym_fotos_huerfanas()` (solo el service role, `gimnasios-foto`) las lista y una
  función del service role tiene que borrarlas con la API de Storage (por ejemplo, desde
  `gym_diaria` vía `net.http_post`, como las demás tareas).

## Lo que la etapa 0 deja anotado para la etapa 1

- **`join_coach` con el código de un gimnasio** guarda la solicitud y responde `400` con el cuerpo de
  un `P0001`, sin `raise` (`response.status`). Probado de punta a punta en la etapa 1 (parte 5,
  `tests/gym-apps-viejas.test.mjs`) con PostgREST 12.2.3 local: la transacción se confirma con ese
  status (la solicitud queda guardada) y supabase-js arma el `error` con el código y el texto. Esa parte
  de la prueba corre solo con `POSTGREST=<ruta del binario>` (o `postgrest` en el PATH): en GitHub se
  saltea. **Antes de aplicar, verificar con la versión de PostgREST de producción** (Supabase → Settings
  → API): si alguna versión deshiciera la transacción con un status 4xx, responder `P0001` sin guardar
  la solicitud y mandar a `gize.ar/app`.
- **La trampa C20**: si un profe deja el gimnasio sin que le reasignen los socios, el vínculo pasa a
  ser propio y los sigue leyendo con su plan. Lo evita `gym_quitar_staff`, que tiene que reasignar
  en la misma operación; `gimnasios-matriz` lo deja a la vista (invariante I2). Cerrada en la etapa 1:
  `gym_quitar_staff` reasigna (o deja sin profe) en la misma transacción (`gimnasios-matriz`,
  `gimnasios-estados`).
- **Antes del primer gimnasio**: `rapid-worker` y `avisos-coach` con `coach_client_ok` (P4),
  `release_lapsed_gyms` y el `before delete` de `profiles` (cerrar el gimnasio del dueño que borra
  su cuenta). Los dos últimos, hechos en la etapa 1 (P1).
- **Cupo y bloqueos de filas**: los triggers del cupo actualizan la fila de `coach_billing` del coach
  anterior y del nuevo, siempre al final: primero se bloquean las filas de `profiles` (y de las
  tablas de gimnasios) y recién después las de `coach_billing`, en orden de `coach_id`, y se cuenta
  en otra sentencia, después de tener el bloqueo (si no, dos desvínculos a la vez dejaban el cupo
  corrido). `join_coach` bloquea primero el perfil y `release_lapsed_clients` ya no bloquea
  `coach_billing` antes de soltar a los alumnos. Las RPC nuevas que cambien vínculos tienen que
  respetar ese orden. Ojo con la restauración al pagar (§6.13): el pago escribe `coach_billing`
  antes que los perfiles, al revés que todo lo demás; `gym_restaurar` tiene que soltar esa fila o
  hacerse en otra transacción. Resuelto en la etapa 1: sin trigger, lo hace `gym_tick`.
- **El profe de la ficha** (`trainer_id`) ya no lo escribe nadie a mano: sale de `gym_profe_ficha`
  en cada escritura de la ficha y en cada cambio de coach. Las RPC de la etapa 1 cambian el coach
  (`profiles.coach_id`) o el estado y la ficha se alinea sola. La trampa C20 sigue (cuando un profe
  deja el equipo, sus fichas no se recalculan: lo hace `gym_quitar_staff`).

## Rendimiento (`gimnasios-rendimiento`)

Con datos inventados (3 fichas de 500 entrenos de 8 series, 100 alumnos por coach), en un Postgres 16
local, sin JIT y la mejor de 3 vueltas, la ficha de entrenos con las funciones nuevas tarda
aproximadamente la mitad que con las de hoy con el esquema del repo, y un tercio con un índice en
`session_entries(session_id)` (que producción puede tener o no: D10). Buena parte de lo que tarda sin
ese índice es recorrer `session_entries` por cada entreno, con o sin RLS. La prueba imprime las dos
tablas y no exige un número fijo: exige que las nuevas no sean más lentas que el doble de las de hoy,
menos de 2 s, las mismas filas, y que `sessions` se lea por su índice. Los tiempos de producción
dependen de sus índices (D10) y de sus ajustes (D13).

## Etapa 1 (parte 5: admin, conversión y avisos)

- **`gimnasios-admin.sql`** (va después de los otros cuatro; volver atrás, antes que el de
  `gimnasios-socios.sql`, que se frena si no): `admin_gyms`, `admin_gym_detail`, `admin_gym_convertir`,
  `admin_gym_transferir`, `admin_gym_cerrar`, `admin_gym_profes_extra` y `admin_gym_auditoria`, todas con
  `admin_assert` y `admin_log`; y las canónicas `admin_coaches`, `admin_overview`, `admin_set_config`,
  `hay_avisos_vence`, `tomar_avisos_vence` y `soltar_aviso_vence` (notas «OJO» en `admin.sql`,
  `precios-2026-10.sql`, `compras-apple.sql` y `aviso-vencimiento.sql`). Su bloque para volver atrás trae
  las seis de hoy tal cual (`gimnasios-sql` lo compara y `gimnasios-base`, que la huella vuelve a ser la
  de `gimnasios-socios.sql`).
- **Antes de aplicarlo, publicar `vence-plan`**: la función nueva lee las columnas nuevas de
  `tomar_avisos_vence` y con el SQL de antes anda igual; la vieja, con el SQL nuevo, le mandaría «vence
  mañana» a un dueño 7 días antes.
- **El día de Argentina en las pruebas:** Postgres corre en UTC; de 21 a 24 h `current_date` ya es
  mañana para `gym_hoy()`. Las pruebas que comparan con `gym_hoy` usan
  `(now() at time zone 'America/Argentina/Buenos_Aires')::date`.
