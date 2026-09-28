# «Un día con GIZE» · video en Remotion

Reel vertical 1080×1920, 30 fps, 47,6 s, sin audio. Diseñado con la entrevista *grill-me*:
objetivo marca, para gente que entrena, concepto «un día» con tipografía cinética, le habla a «vos».

- **Gancho**: 06:59 que parpadea y salta a 07:00 con un flash de neón — «Tu día arranca.»
- **07:00** Te despertás · Racha: 13 días
- **08:30** Desayuno: pan integral + 2 huevos (219 kcal; el resto de las comidas vacías)
- **13:00** Almuerzo: pechuga de pollo + arroz (718 kcal)
- **17:00** Merienda rápida: yogur con cereales + banana (1062 kcal)
- **18:30** Hora de entrenar · series anotadas y descanso cronometrado
- **19:45** Entreno terminado (resumen que cuenta hacia arriba)
- **21:00** Cena: salmón + puré — cerrás el día en 1401 kcal
- **22:30** Antes de dormir, cumplís tus hábitos (checklist)
- **23:00** Y ves cómo bajás de peso (82,4 → 77,8 kg)
- **Cierre**: solo el logo, entra de golpe con un flash (corte, sin superposición)

Reloj en neón Outfit, app real en un celular con giro 3D (clips de `../youtube-guia/grabacion/frames/solo` y de `grabacion/` — `node grabacion/grabar.js` graba las comidas y el peso)
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
