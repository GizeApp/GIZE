# Librerías de terceros incluidas en la app

| Archivo | Librería | Versión | Licencia | Para qué |
|---|---|---|---|---|
| `zxing.min.js` | [@zxing/library](https://github.com/zxing-js/library) (build UMD) | 0.21.3 | MIT | Leer códigos de barras con la cámara en navegadores sin `BarcodeDetector` (Safari en iPhone). Se carga solo al abrir el escáner (ver `app/ui/scanner.js`). |
| `supabase-2.117.1.js` | [@supabase/supabase-js](https://github.com/supabase/supabase-js) (build UMD, `dist/umd/supabase.js` del paquete de npm) | 2.117.1 | MIT | Cliente de Supabase (login, base de datos, archivos). Va en la app y no desde un CDN: versión fija, sin depender de un tercero en cada arranque. Para actualizar: bajar el paquete de npm, copiar `dist/umd/supabase.js` con el nombre de la versión y cambiar `app/index.html`. |
