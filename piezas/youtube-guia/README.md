# Videos para YouTube · guías de GIZE

Tres versiones con las mismas grabaciones y el mismo diseño:

- `salida/gize-guia-usuarios.mp4` (~3:50): solo el plan gratuito, con intro y cierre para usuarios.
- `salida/gize-guia-coach.mp4` (~3:40): solo el panel del coach, con intro y cierre para coaches.
- `salida/gize-guia-completa.mp4` (~7:20): las dos partes juntas.

Cada una tiene su `descripcion-*.txt` con los capítulos listos para YouTube.

## Guía completa

1920×1080, 30 fps, ~10:20, sin audio. Primero el **plan gratuito** (20 funciones, usuario sin coach) y
después el **panel del coach** (23). Mismo diseño que la historia y el reel: glows de la gama, tubos de
neón, Outfit y palabra clave en neón.

Cada función muestra el teléfono a la derecha con la grabación **al doble de velocidad** (se congela si hace falta tiempo para leer la explicación) y, a la izquierda, el
título y la explicación, que aparece línea por línea sincronizada con lo que pasa en pantalla. Las
explicaciones se escriben en los guiones de grabación como «marcas» (`mark('…')`) y quedan guardadas con
su tiempo en cada `times.json`.

- `grabacion/lib.js`: grabador lento con toques visibles y marcas.
- `grabacion/guia_bienvenida.js`: primeros pasos de un usuario nuevo (bienvenida, armar la semana, rutinas armadas).
- `grabacion/guia_solo.js` y `grabacion/guia_coach.js`: las escenas con sus explicaciones.
- `grabacion/guia_alumno.js`: lo que ve el alumno de un coach (chat y explicación de voz).
- `grabacion/mock_solo.js`, `grabacion/mock.js` y `grabacion/mock_alumno.js`: Supabase simulado con datos ficticios (chat y audios incluidos).
- `guia.py`: arma el video (en 4 partes en paralelo) y los capítulos.
- `salida/descripcion-*.txt`: texto para la descripción de cada video, con los capítulos.
- `miniaturas.py` → `salida/miniatura-{usuarios,coach,completa}.png` (1280×720).

```bash
python3 -m http.server 8766 &                    # desde una copia de main
node grabacion/guia_bienvenida.js                # → grabacion/frames/solo/ (bienvenida, semana, rutinas-armadas)
node grabacion/guia_solo.js                      # → grabacion/frames/solo/ (una escena: node grabacion/guia_solo.js comida)
node grabacion/guia_coach.js                     # → grabacion/frames/coach/
node grabacion/guia_alumno.js                    # → grabacion/frames/coach/ (chat-alumno, voz-alumno)
python3 guia.py salida/gize-guia-completa.mp4
python3 guia.py --video usuarios salida/gize-guia-usuarios.mp4   # o --video coach
# versión final más liviana (misma calidad a la vista, entra en GitHub):
# ffmpeg -i salida/gize-guia-completa.mp4 -vf hqdn3d=3:2:4:4 -c:v libx264 -preset slow -crf 25 -tune stillimage -pix_fmt yuv420p -g 60 -movflags +faststart final.mp4
python3 guia.py --capitulos                      # capítulos para la descripción (también con --video)
python3 guia.py --cuadros 700 11000              # cuadros sueltos para revisar
```
