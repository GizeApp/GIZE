# «Un día con GIZE» · video en Remotion

Reel vertical 1080×1920, 30 fps, 49,5 s, sin audio. Diseñado con la entrevista *grill-me*:
objetivo marca, para gente que entrena, concepto «un día» con tipografía cinética, le habla a «vos».

- **Gancho**: 06:59 que parpadea y salta a 07:00 con un flash de neón — «Tu día arranca.»
- **07:00** Te despertás · Racha: 13 días (llama y contador) + registro de hoy
- **08:30** Desayunás · Lo anotás en segundos (anillo de calorías que se llena)
- **13:00** Almorzás · Y no te olvidás del agua (+500 ml)
- **18:30** Hora de entrenar · Cada serie. Anotada. · Cada descanso. Cronometrado. (cuenta regresiva)
- **19:45** Entreno terminado (resumen que cuenta hacia arriba)
- **21:00** Cenás · Cumplís tus hábitos (checklist)
- **23:00** Y ves cómo progresás (curva de neón que se dibuja)
- **Cierre**: logo · «Todo tu entrenamiento, en un solo lugar.» · gize.ar

Reloj en neón Outfit, app real en un celular con giro 3D (clips de `../youtube-guia/grabacion/frames/solo`)
y detalles recreados encima. Mismo fondo de marca que las otras piezas.

```bash
npm i
python3 armar_clips.py                      # arma public/clips/*.mp4 desde las grabaciones
npx remotion studio                         # vista previa y edición
npx remotion render UnDiaConGize salida/un-dia-con-gize.mp4 --codec=h264 --crf=16
# en este entorno: --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

Código: `src/UnDia.tsx` (orden y transiciones), `src/escenas/` (cada momento), `src/ui/` (fondo, neón,
tipografía cinética, celular, reloj y detalles), `src/marca.ts` (colores y fuente).
Remotion es gratis para equipos de hasta 3 personas (https://www.remotion.pro/license).
