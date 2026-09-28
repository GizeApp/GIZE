// El reloj gigante en neón que marca cada momento del día. Se prende parpadeando.
import { interpolate, useCurrentFrame } from "remotion";
import { clamp } from "../marca";
import { Neon, parpadeo } from "./Neon";

export const Reloj: React.FC<{ hora: string; tamano?: number; desde?: number }> = ({ hora, tamano = 210, desde = 0 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ translate: `0px ${interpolate(f - desde, [0, 12], [-30, 0], clamp)}px` }}>
      <Neon texto={hora} tamano={tamano} ancho={1000} encendido={parpadeo(f - desde)} />
    </div>
  );
};
