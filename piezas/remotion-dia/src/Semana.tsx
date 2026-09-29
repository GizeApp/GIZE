// «Armá tu semana en 3 pasos»: reel vertical, sin audio, ~24 s. El nuevo inicio de la app y las rutinas armadas.
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import "./marca";
import { clamp } from "./marca";
import { Fondo } from "./ui/Fondo";
import { Cierre } from "./escenas/Escenas";
import { AEntrenar, Atajo, Duda, Inicio, Paso1, Paso2, Paso3, Tres } from "./escenas/Semana";

const T = 12;
const pase = () => slide({ direction: "from-right" });

export const ESCENAS_SEMANA: [string, React.FC, number][] = [
  ["Duda", Duda, 70], ["Tres", Tres, 62], ["Inicio", Inicio, 84], ["Paso1", Paso1, 96], ["Paso2", Paso2, 96],
  ["Paso3", Paso3, 110], ["Atajo", Atajo, 124], ["AEntrenar", AEntrenar, 92], ["CierreSemana", Cierre, 75],
];

export const Semana: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const n = ESCENAS_SEMANA.length;
  return (
    <AbsoluteFill>
      <Fondo intensidad={interpolate(f, [0, 60], [0.35, 1], clamp)} />
      <TransitionSeries>
        {ESCENAS_SEMANA.flatMap(([id, C, d], i) => {
          const s = <TransitionSeries.Sequence key={id} name={id} durationInFrames={d}><C /></TransitionSeries.Sequence>;
          // del gancho al 3 entra con fundido; el cierre entra al corte
          if (i >= n - 2) return [s];
          const pres = i === 0 ? fade() : pase();
          return [s, <TransitionSeries.Transition key={id + "-t"} presentation={pres} timing={linearTiming({ durationInFrames: T })} />];
        })}
      </TransitionSeries>
      <AbsoluteFill style={{ background: "#000", opacity: interpolate(f, [durationInFrames - 12, durationInFrames - 1], [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};

export const DURACION_SEMANA = ESCENAS_SEMANA.reduce((a, [, , d]) => a + d, 0) - (ESCENAS_SEMANA.length - 2) * T;
