# Pruebas automáticas

Abren la app (`/app/`) y el panel (`/admin/`) en Chromium, con Supabase simulado dentro
del navegador (no usan internet, secretos ni datos reales), y revisan los flujos
principales: Entreno, Comida, pedir un producto, "Mi plan" del coach, el panel de
administración y el cartel de versión nueva. Algunas prueban un script de `scripts/` contra
un Supabase simulado en Node (por ejemplo, el que borra las fotos de progreso viejas).

Corren solas en GitHub (Actions → **Pruebas**) en cada pull request y en cada cambio a main.

Para correrlas en una computadora (hace falta Node 22 y Playwright):

```
npm install --prefix /tmp/pw playwright@1.56.1
/tmp/pw/node_modules/.bin/playwright install chromium
PW=/tmp/pw/node_modules/playwright/index.mjs node tests/run.mjs          # todas
PW=/tmp/pw/node_modules/playwright/index.mjs node tests/run.mjs comida   # solo las que dicen "comida"
```

Cada archivo `*.test.mjs` exporta una función `async ({ base, t })`: `base` es la dirección
del servidor local y `t.ok` / `t.eq` / `t.has` anotan lo que falla. Las ayudas (servidor,
navegador, Supabase simulado) están en `tests/lib.mjs`.

Las funciones de Supabase (`supabase/functions/*/index.ts`, escritas para Deno) se corren en
Node con `tests/funcion.mjs`: los paquetes `npm:` (supabase-js, web-push, jose), `Deno.serve`,
`Deno.env` y `fetch` son simulados, así que tampoco salen a internet. Así se prueba lo que la
función hace (qué guarda, qué manda y en qué orden) y no solo cómo está escrita.
