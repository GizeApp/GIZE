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
| `--gize-blue` | `#2FA0FF` | Foco, enlaces, estados activos |
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
La marca es **la G** (el arco grueso con puntas redondeadas) y **el orbe**: una esfera brillante
e iridiscente en el lugar del punto, con turquesa abajo a la izquierda, celeste y azul arriba,
violeta arriba a la derecha y magenta a la derecha, un reflejo blanco arriba a la izquierda, la
sombra del borde más fuerte abajo y un resplandor suave de color alrededor.

### Los cuatro logos oficiales
| Logo | Archivos | Cuándo se usa |
|---|---|---|
| **Oscuro** (el oficial, por defecto) | `logo/gize-logo-oscuro.png` (original) · `.svg` | G blanca y orbe original sobre negro. Instagram, ícono de la app (web, Android, iPhone), splash nativo, mails, todo lo que no dice otra cosa. |
| **Claro** | `logo/gize-logo-claro.png` (original) · `.svg` | G casi negra (`#0B0D11`) y el mismo orbe sobre blanco, resplandor pálido. Impresos y fondos claros; apariencia «Claro» de la app. |
| **Azul** | `logo/gize-logo-azul.svg` · `.png` (1080) | G blanca sobre marino `#030814`, orbe celeste `#3FA3F2`, violeta `#8E5CF5`, cian `#29C2EC` e índigo `#1B2F9E`. Apariencia «Azul». |
| **Rosa** | `logo/gize-logo-rosa.svg` · `.png` (1080) | G blanca sobre ciruela `#14060F`, orbe rosa `#FF5FA8`, orquídea `#D65CF5`, rubor `#FFA3C8` y magenta `#E84DBE`. Apariencia «Rosa». |

Los PNG de «Oscuro» y «Claro» son los originales: mandan sobre cualquier versión vectorial.
Los SVG y los PNG de «Azul» y «Rosa» salen de `scripts/logos.mjs` (una sola definición de la G
y el orbe, solo degradés, sin filtros): si hay que retocar algo, se cambia ahí y se vuelve a
correr (`PW=… node scripts/logos.mjs`).

### Para usar dentro de la app y la web (fondo transparente)
- `logo/gize-marca-blanca.svg` — G blanca + orbe original. Fondos oscuros («Oscuro»).
- `logo/gize-marca-negra.svg` — G casi negra + orbe original. Fondos claros («Claro»).
- `logo/gize-marca-azul.svg` / `logo/gize-marca-rosa.svg` — G blanca + orbe de «Azul» / «Rosa».
- `logo/gize-firma-horizontal.svg` — la firma: marca + palabra GIZE (blanca). Variantes
  `-oscuro` (todo casi negro, para fondos claros), `-azul` y `-rosa`.
- `logo/gize-logotipo.svg` — la palabra GIZE sola, en curvas.
- `logo/gize-monograma-mono.svg` — la G en un solo color (`currentColor`), para grabados,
  sellos o donde no puede haber color. No reemplaza a la marca con orbe.

En la app, cada apariencia cambia la marca por la suya con `content: url(…)` en
`css/ui/tema-*.css` (barra de arriba, login, bienvenida, cartel de versión nueva y panel del
coach). La landing usa la marca en línea (`#g-mono` en `index.html`, mismos degradés).

### Íconos de la app
`logo/gize-icono.png` es una copia del logo «Oscuro» y `logo/gize-icono-maskable.png` el mismo
achicado al 78 % sobre negro (la G y el orbe quedan dentro de la zona segura de los íconos que el
sistema recorta). `scripts/iconos.mjs` arma con esos dos todos los tamaños: web (192, 512,
maskable, apple-touch), Android (mipmaps, adaptativo y redondo), iPhone (1024) y los splash
nativos (el logo en el centro, sobre negro). El ícono de la ficha de Google Play (512 × 512) se
sube a mano: usar `icon-512.png`.

**Construcción de la firma:** símbolo 100 u, aire 44 u, altura de mayúscula 74 u.
No cambiar esa proporción ni re-espaciar las letras.

**Zona de protección:** como mínimo, el alto del orbe alrededor de todo el logo.

**Usos incorrectos:** estirar, rotar, recolorear el orbe fuera de las cuatro paletas oficiales,
cambiar el orbe por un punto plano, poner la G blanca sobre fondo claro (usar la versión
«Claro»), agregarle sombras o contornos.

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
- Splash: el logo armándose en 1,9 s (punto de luz, destellos que forman el orbe, la G que se
  traza con estela de color, un pulso del resplandor) y el texto "Preparando tu entrenamiento",
  con los colores de cada apariencia. Sale primero la marca y después el fondo.
- Ingreso: tarjeta con filete RGB, pestañas Ingresar / Crear cuenta, campo de código del coach en el alta.
