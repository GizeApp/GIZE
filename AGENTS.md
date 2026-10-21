# Reglas para agentes de código (Codex, Claude y otros)

GIZE es una app de entrenamiento y comida: PWA en JavaScript sin framework (`app/`), panel del
coach (`app/screens/coach/`), panel de administración (`admin/`), apps de Android e iPhone con
Capacitor (`android/`, `ios/`) y Supabase (Postgres con RLS y funciones en Deno, `supabase/`).
Se publica en gize.ar con GitHub Pages desde `main`.

## Antes de tocar nada

- **El repo es público.** Nunca escribas claves, tokens, contraseñas, mails ni datos de personas
  en el código, en los commits, en las pruebas ni en los logs de GitHub Actions. Las claves viven
  solo en los secrets de GitHub (Environment «production») y en Supabase.
- **Nunca trabajes directo sobre `main`.** Cada cambio va en su propia rama, chica y con un solo
  tema. A `main` se llega solo con todas las pruebas en verde.
- **Si otra herramienta ya está trabajando en una rama, no la toques.** Un agente por rama.
- **No corras workflows de producción** (`supabase.yml`, `android-release.yml`, `ios.yml`) ni
  apliques SQL en la base real. Eso lo decide el dueño.
- Si tu tarea es **revisar**, no subas cambios: dejá los hallazgos con evidencia (archivo:línea,
  cómo reproducirlo) y qué arreglarías.

## Cómo se escribe

- Comentarios, mensajes de commit y textos de la app en **castellano rioplatense con voseo**,
  simple y sin tecnicismos, como el código que ya está.
- Seguí el estilo del archivo que tocás: nombres, densidad de comentarios, CSS sin anidar.
- Cambios mínimos: lo que pide la tarea, sin refactors de paso.
- Si cambiás algo que el service worker guarda (`app/`, `css/`), subí una vez la versión
  `core-vN` de `sw.js` (la de `main` + 1).

## Reglas de las tiendas (no negociables)

- **iPhone:** nunca mostrar precios de la web, links de pago ni Mercado Pago. Las compras van
  con Apple (planes de coach y, cuando esté, IA Plus) y se muestran solo los precios de Apple.
- **Android:** no se venden suscripciones dentro de la app hasta sumar el cobro de Google Play;
  sin precios ni links a la web.
- La IA de comida pide permiso una sola vez antes de mandar nada (`app/ui/ia-permiso.js`) y
  cumple lo que dice `privacidad/index.html`. Si cambiás qué se manda o qué se guarda, la
  política tiene que cambiar en el mismo cambio.

## Pruebas

```
npm install --prefix /tmp/pw playwright@1.56.1
/tmp/pw/node_modules/.bin/playwright install chromium
PW=/tmp/pw/node_modules/playwright/index.mjs node tests/run.mjs comida   # las que dicen «comida»
PW=/tmp/pw/node_modules/playwright/index.mjs node tests/run.mjs          # todas (~45 min)
SHARD=2/6 PW=… node tests/run.mjs                                         # una sexta parte
```

- Toda corrección de un error lleva una prueba que falla sin el arreglo.
- Nunca saltees, borres ni debilites una prueba para que pase. Si una prueba quedó vieja por un
  cambio de diseño a propósito, explicalo en el commit.
- Las pruebas con Postgres (`tests/gimnasios-*`, `*-sql`) usan una base de prueba local
  (`tests/pg/README.md`); sin Postgres se saltean.
- Más detalle de cómo están armadas: `tests/README.md`.

## Commits

- Un tema por commit, título corto en castellano que diga qué cambia para la persona que usa la
  app, y en el cuerpo el porqué.
- No incluyas nombres de modelos de IA en los comentarios ni en el texto de los commits (la línea final de coautoría que agrega cada herramienta, como «Co-Authored-By», sí va).
