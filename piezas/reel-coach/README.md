# Reel · todo lo que ofrece GIZE (sin coach y panel del coach)

Reel 1080×1920, 30 fps, ~65 s, sin audio. Mismo diseño que la historia de la prueba gratis
(`../historia-prueba/historia.py`): fondo con glows azul/violeta/magenta y tubos de neón, rótulos en
Outfit con filetes, palabra clave en neón y grano fino.

1. **Para todos** · *gratis* en neón · «Entrená por tu cuenta, sin coach.»
2. **8 funciones sin coach** (teléfono fijo): entreno, descanso, progreso, meta de calorías, comida,
   hábitos, cardio y racha.
3. **¿Sos coach?** · *tu panel* en neón · «Todo para guiar a tus alumnos.»
4. **16 funciones del panel**: clientes, invitación, plantillas, ficha en secciones, mensajes al celular,
   mesociclos, seguimiento diario, check-in, historial de entrenos, volumen, peso, rutina, video de
   técnica, rutinas programadas, plan nutricional y preguntas.
5. **Cierre**: firma, «Gratis en iPhone y Android» con App Store y Google Play, «¿Sos coach? 14 días de
   prueba gratis · Sin tarjeta» y gize.ar.

Las grabaciones son de la app actual de `main` con **Supabase simulado**, datos ficticios:
`grabacion/mock_solo.js` (un usuario sin coach) y `grabacion/mock.js` (un coach y seis alumnos).

```bash
python3 -m http.server 8766 &              # desde una copia de main
node grabacion/record_solo.js              # app sin coach → grabacion/frames_solo/
node grabacion/record.js                   # panel del coach → grabacion/frames/ (una escena: node grabacion/record.js notif)
python3 reel.py salida/reel-panel-coach.mp4
python3 reel.py --cuadros 60 710           # cuadros sueltos para revisar
```
