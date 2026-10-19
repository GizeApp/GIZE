# Imagen de Postgres de la base de pruebas (.github/workflows/base-de-pruebas.yml, tests/pg.mjs). No
# toca producción: arma la base desde los supabase/*.sql del repo. Va fijada por digest igual que la
# de la copia de seguridad (.github/postgres/Dockerfile): un tag se puede mover, un digest no.
# Dependabot abre un PR cuando sale una nueva, dentro de la misma versión mayor (.github/dependabot.yml).
# Versión 16, la de las pruebas «a mano» del repo y la de Postgres local. Este digest es el del índice
# multi-arquitectura de postgres:16 (16.15) del 19/10/2026.
FROM postgres:16@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d
