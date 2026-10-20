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

Los avisos y las preguntas de la app ya no son `alert()`, `confirm()` ni `prompt()` nativos sino
carteles propios (`app/ui/avisos.js`: `alert`, `confirmar` y `pedir`). `newPage` lee lo que dice
cada cartel y lo anota en `dialogs`. A los avisos les toca «Entendido» (con `tocarAvisos: false`
quedan abiertos). Las preguntas las contesta tocando el botón de verdad, según `p.contestar`:
`true` (de entrada) acepta, `false` toca «Cancelar», `null` la deja abierta para manejarla a mano
(teclado, «Atrás»), o una función que decide por pregunta; en un `pedir()` escribe `p.dialogAnswer`.
Cada pregunta queda en `preguntas` (texto, título, botones y qué se contestó). Solo toca un botón
que se ve: si otra ventana lo tapa (o queda fuera de la pantalla) no lo toca y lo anota en `errs`
(«cartel tapado: …»), porque una persona tampoco podría.

Las funciones de Supabase (`supabase/functions/*/index.ts`, escritas para Deno) se corren en
Node con `tests/funcion.mjs`: los paquetes `npm:` (supabase-js, web-push, jose), `Deno.serve`,
`Deno.env` y `fetch` son simulados, así que tampoco salen a internet. Así se prueba lo que la
función hace (qué guarda, qué manda y en qué orden) y no solo cómo está escrita.

`ia-sql.test.mjs` además corre `supabase/pedidos-productos.sql` y `supabase/ia.sql` en un Postgres
de verdad si la máquina tiene uno instalado (en GitHub, el de ubuntu-24.04; con lo mínimo de
Supabase simulado, en una carpeta temporal que borra al terminar): así prueba la guardia de gasto
de la IA (ciclos, reservas a la vez, cortes y topes). Si no hay Postgres, esa parte se saltea.
