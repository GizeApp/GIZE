// Sistema de marca de GIZE para el video: colores, tipografía y curvas de animación.
import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

export const AZUL = "#2FA0FF";
export const VIOLETA = "#A65CFF";
export const MAGENTA = "#FF3DAE";
export const TURQUESA = "#25E8C8";
export const FONDO = "#04050A";
export const TEXTO = "#FFFFFF";
export const SUAVE = "#C4CAD4";
export const GAMA = `linear-gradient(90deg, ${AZUL}, ${VIOLETA} 55%, ${MAGENTA})`;
export const FUENTE = "Outfit";

// Outfit, la misma de la app y de todas las piezas.
for (const peso of [400, 500, 600, 700] as const) {
  loadFont({ family: FUENTE, url: staticFile(`fonts/outfit-latin-${peso}-normal.woff2`), weight: String(peso) });
}

export const salida = Easing.bezier(0.16, 1, 0.3, 1);
export const suave = Easing.bezier(0.45, 0, 0.55, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
