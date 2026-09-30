# GIZE · Sistema de marca

Fuente de verdad para el diseño de la app y la web. Si algo del código contradice
este archivo, gana este archivo.

## Nombre
**GIZE** (viene de *energize*). Se escribe siempre en mayúsculas cuando va como logo.

## Tipografía
| Uso | Tipografía | Licencia |
|---|---|---|
| Interfaz, textos, botones y números | **Outfit** (400/500/600/700/800) | SIL OFL 1.1 |
| Logotipo | **Bigger Display**, ya convertida a curvas en `logo/*.svg` | Thunder Studio, gratis para uso comercial |

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Números:** también van en Outfit (decisión de septiembre 2026: se ve más linda y pareja
que una mono). Donde hace falta que las cifras queden alineadas (tablas, kcal, pesos) se usa
`font-variant-numeric: tabular-nums`. `--gize-font-data` queda como alias de Outfit.

**Regla:** nunca cargar Bigger Display como webfont ni escribir "GIZE" con una fuente del sistema.
El logo se usa siempre como SVG desde `logo/`.

## Color
| Token | Hex | Uso |
|---|---|---|
| `--gize-bg` | `#000000` | Fondo de la app |
| `--gize-surface` | `#0B0D11` | Tarjetas |
| `--gize-surface-2` | `#12151B` | Campos, pestañas |
| `--gize-border` | `#1C2029` | Bordes y divisores |
| `--gize-text` | `#FFFFFF` | Texto principal |
| `--gize-text-2` | `#8F98A6` | Texto secundario |
| `--gize-blue` | `#2FA0FF` | Punto de la G, foco, enlaces |
| `--gize-blue-deep` | `#0072BB` | Azul Francia: impresos y fondos claros |
| Gama RGB | `#2FA0FF` `#A65CFF` `#FF3DAE` `#25E8C8` | Auroras, filetes, anillo del botón |

### Semánticos
| Token | Hex | Uso |
|---|---|---|
| `--gize-danger` | `#FF4D4D` | Errores, borrar, alertas. Un rojo de error tiene que gritar, no combinar. |
| `--gize-success` | `#25E8C8` | Completado, check, meta cumplida. Es el verde agua de la gama RGB. |
| `--gize-warning` | `#FFB020` | Avisos, datos incompletos |
| `--gize-*-bg` | mismo color al 12 % | Fondos suaves para celdas de tabla |

**El color marca estado, no identidad.** No se le asigna un color a cada elemento de una
lista (opciones A/B/C, comidas, etc.): el usuario busca un significado que no existe y se
gastan colores que hacen falta para los estados. Se diferencian por jerarquía (letra en
`--gize-blue`); el elegido lleva borde azul y resplandor suave.

## Logo
- `logo/gize-monograma.svg` — la G sola. Ícono, avatar, favicon.
- `logo/gize-monograma-mono.svg` — un solo color (usa `currentColor`).
- `logo/gize-logotipo.svg` — la palabra GIZE en curvas.
- `logo/gize-firma-horizontal.svg` — símbolo + palabra. Es la firma principal.
- `logo/gize-icono-negro.svg` — ícono de app.
- `logo/gize-icono-maskable.svg` — ícono maskable de Android (todo dentro del 80% central).
- `instagram/gize-perfil.png` — foto de perfil de Instagram (1080 × 1080, «Vidrio noche», elegida en septiembre 2026):
  un disco de vidrio esmerilado sobre la gama RGB que ocupa todo el círculo que recorta Instagram, con la G al 60 %.
  Se regenera con `node showreel/logo-ig/build.mjs --only=perfil` (sale como `perfil-2-vidrio-noche.png`).
  **Es solo para Instagram:** no reemplaza al ícono de la app. La app sigue con su ícono y su splash de siempre
  (la G blanca con el punto azul), en modo oscuro y en modo claro: `assets/`, `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
  y `android/app/src/main/res/`.

**Construcción de la firma:** símbolo 100 u, aire 44 u, altura de mayúscula 74 u.
No cambiar esa proporción ni re-espaciar las letras.

**Zona de protección:** como mínimo, el alto del punto de la G alrededor de todo el logo.

**Usos incorrectos:** estirar, rotar, cambiar los colores del punto, poner el logo
sobre fondos claros sin usar la versión monocromo, agregarle sombras o contornos.

## Reglas de uso del RGB
1. Una sola acción con anillo RGB por pantalla: la que querés que toquen.
2. La gama se usa en auroras de fondo, filetes de 2 px y la barra de carga. Nunca en texto largo.
3. El azul `#2FA0FF` es el color funcional (foco, enlaces, estados activos).
4. Todo lo animado respeta `prefers-reduced-motion`.

## Componentes ya escritos
`tokens.css` trae: `.gize-btn`, `.gize-btn-ghost`, `.gize-card`, `.gize-input`,
`.gize-aurora`, `.gize-bar` y todas las variables. Importarlo una sola vez y usar
las variables en el resto del CSS, en vez de repetir hex sueltos.

## Pantallas de referencia
- Landing: hero con firma grande + aurora, tarjetas con filete RGB, cierre con anillo cónico.
- Splash: logo centrado, barra RGB de 2,1 s, texto "Preparando tu entrenamiento".
- Ingreso: tarjeta con filete RGB, pestañas Ingresar / Crear cuenta, campo de código del coach en el alta.
