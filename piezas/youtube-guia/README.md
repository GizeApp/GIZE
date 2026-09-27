# Video para YouTube · guía completa de GIZE

1920×1080, 30 fps, ~10:20, sin audio. Primero el **plan gratuito** (20 funciones, usuario sin coach) y
después el **panel del coach** (23). Mismo diseño que la historia y el reel: glows de la gama, tubos de
neón, Outfit y palabra clave en neón.

Cada función muestra el teléfono a la derecha con la grabación **a velocidad real** y, a la izquierda, el
título y la explicación, que aparece línea por línea sincronizada con lo que pasa en pantalla. Las
explicaciones se escriben en los guiones de grabación como «marcas» (`mark('…')`) y quedan guardadas con
su tiempo en cada `times.json`.

- `grabacion/lib.js`: grabador lento con toques visibles y marcas.
- `grabacion/guia_solo.js` y `grabacion/guia_coach.js`: las escenas con sus explicaciones.
- `grabacion/mock_solo.js` y `grabacion/mock.js`: Supabase simulado con datos ficticios.
- `guia.py`: arma el video (en 4 partes en paralelo) y los capítulos.
- `salida/descripcion-youtube.txt`: texto para la descripción, con los capítulos.

```bash
python3 -m http.server 8766 &                    # desde una copia de main
node grabacion/guia_solo.js                      # → grabacion/frames/solo/ (una escena: node grabacion/guia_solo.js comida)
node grabacion/guia_coach.js                     # → grabacion/frames/coach/
python3 guia.py salida/gize-guia-completa.mp4
python3 guia.py --capitulos                      # capítulos para la descripción
python3 guia.py --cuadros 700 11000              # cuadros sueltos para revisar
```
