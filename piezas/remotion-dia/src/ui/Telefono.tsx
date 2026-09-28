// Celular con la app real adentro: marco con aro de la gama, brillo, y leve giro 3D que se asienta.
import { Video } from "@remotion/media";
import { interpolate, staticFile, useCurrentFrame, Easing } from "remotion";
import { AZUL, MAGENTA, VIOLETA, clamp } from "../marca";

export const Telefono: React.FC<{ clip: string; desde?: number; velocidad?: number; alto?: number; giro?: number; velo?: number; children?: React.ReactNode }> =
  ({ clip, desde = 0, velocidad = 1, alto = 1010, giro = 1, velo = 0, children }) => {
  const f = useCurrentFrame();
  const ancho = Math.round(alto * 0.4838);
  const entra = interpolate(f, [0, 18], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <div style={{ perspective: 1800, width: ancho, height: alto }}>
      <div style={{
        width: ancho, height: alto, borderRadius: alto * 0.07, padding: 5,
        background: `linear-gradient(140deg, ${AZUL}, ${VIOLETA} 50%, ${MAGENTA})`,
        boxShadow: `0 0 40px ${VIOLETA}88, 0 0 120px ${AZUL}44, 0 40px 80px #000c`,
        opacity: entra,
        translate: `0px ${interpolate(entra, [0, 1], [120, 0])}px`,
        rotate: `${interpolate(f, [0, 60, 400], [-9 * giro, -3 * giro, 2 * giro], { ...clamp, easing: Easing.bezier(0.45, 0, 0.55, 1) })}deg`,
        transform: `rotateY(${interpolate(f, [0, 60, 400], [18 * giro, 7 * giro, -4 * giro], clamp)}deg) rotateX(${interpolate(f, [0, 400], [8, 2], clamp)}deg)`,
      }}>
        <div style={{ width: "100%", height: "100%", borderRadius: alto * 0.066, overflow: "hidden", background: "#000", position: "relative" }}>
          <Video src={staticFile(`clips/${clip}.mp4`)} trimBefore={Math.round(desde * 30)} playbackRate={velocidad} muted
                 style={{ width: "100%", height: "100%", objectFit: "cover",
                          filter: velo ? `blur(${interpolate(f, [30, 50], [0, 6 * velo], clamp)}px) brightness(${interpolate(f, [30, 50], [1, 1 - 0.45 * velo], clamp)})` : undefined }} />
          {children}
        </div>
      </div>
    </div>
  );
};
