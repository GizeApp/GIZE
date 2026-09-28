# Reel · uso real en el gimnasio

Reel 1080×1920, 30 fps, 15,5 s, sin audio. El video que grabó Lautaro en el gimnasio (`src/gimnasio-lautaro.mp4`,
10 s, la app en uso) con color de marca, cuatro frases sincronizadas con los cortes (Outfit + palabra en neón:
«Así se entrena hoy.», «Cada serie, anotada.», «El descanso, cronometrado.», «Tu progreso, a mano.») . Cierra con el fondo de marca: *gratis* en neón, App Store / Google Play («Próximamente», sin fechas),
«¿Sos coach? Probá el panel 14 días gratis» y gize.ar.

- `salida/reel-gimnasio.mp4`: el reel.
- `sr/mejorar.py`: mejora el video original de WhatsApp con Real-ESRGAN (realesr-general-x4v3, en CPU,
  ~6 s por cuadro) → `src/gimnasio-lautaro-hd.mp4`. Si existe, `reel.py` usa ese en vez del original.
  Los pesos se bajan de https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0
  (`realesr-general-x4v3.pth` y `realesr-general-wdn-x4v3.pth`); `PESOS=<carpeta> python3 sr/mejorar.py`.
- `salida/texto-instagram.txt`: texto para la publicación.

```bash
python3 reel.py salida/reel-gimnasio.mp4
python3 reel.py --cuadros 45 120 400       # cuadros sueltos para revisar
```
