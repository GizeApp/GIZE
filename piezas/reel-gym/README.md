# Reel · uso real en el gimnasio

Reel 1080×1920, 30 fps, 15,5 s, sin audio. El video que grabó Lautaro en el gimnasio (`src/gimnasio-lautaro.mp4`,
10 s, la app en uso) con color de marca, cuatro frases sincronizadas con los cortes (Outfit + palabra en neón:
«Así se entrena hoy.», «Cada serie, anotada.», «El descanso, cronometrado.», «Tu progreso, a mano.») . Cierra con el fondo de marca: *gratis* en neón, App Store / Google Play («Próximamente», sin fechas),
«¿Sos coach? Probá el panel 14 días gratis» y gize.ar.

- `salida/reel-gimnasio.mp4`: el reel.
- `salida/texto-instagram.txt`: texto para la publicación.

```bash
python3 reel.py salida/reel-gimnasio.mp4
python3 reel.py --cuadros 45 120 400       # cuadros sueltos para revisar
```
