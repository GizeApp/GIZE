# Reel · panel del coach

Reel 1080×1920, 30 fps, ~42 s, sin audio. Mismo diseño que la historia de la prueba gratis
(`../historia-prueba/historia.py`): fondo con glows azul/violeta/magenta y tubos de neón, rótulos en
Outfit con filetes, palabra clave en neón y grano fino.

1. **Gancho**: «Para coaches» · *tu panel* en neón · «Todo lo que te da GIZE.»
2. **16 funciones**, con el teléfono fijo y la pantalla que cambia: clientes, invitación, plantillas,
   ficha en secciones, mensajes al celular, mesociclos, seguimiento diario, check-in, historial de
   entrenos, volumen, peso, rutina, video de técnica, rutinas programadas, plan nutricional y preguntas.
3. **Cierre**: «¿Sos coach?» · 14 en neón · «días de prueba gratis · Sin tarjeta» · firma y gize.ar.

La grabación es del panel actual de `main` con **Supabase simulado** (`grabacion/mock.js`): un coach y
seis alumnos ficticios, sin datos reales.

```bash
python3 -m http.server 8766 &              # desde una copia de main
node grabacion/record.js                   # deja los cuadros en grabacion/frames/ (una escena: node grabacion/record.js notif)
python3 reel.py salida/reel-panel-coach.mp4
python3 reel.py --cuadros 60 700           # cuadros sueltos para revisar
```
