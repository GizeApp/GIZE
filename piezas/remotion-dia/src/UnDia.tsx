// «Un día con GIZE»: reel vertical, sin audio, ~50 s. Del despertar a la noche, con el reloj como hilo.
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import "./marca";
import { clamp } from "./marca";
import { Fondo } from "./ui/Fondo";
import { Almuerzo, Cierre, Desayuno, Despertar, FinEntreno, Gancho, Gym, Habitos, Progreso } from "./escenas/Escenas";

const T = 12;   // cuadros de cada transición
const pase = () => slide({ direction: "from-bottom" });

export const UnDia: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Fondo intensidad={interpolate(f, [0, 36, 60], [0.15, 0.3, 1], clamp)} />
      <TransitionSeries>
        <TransitionSeries.Sequence name="Gancho" durationInFrames={80}><Gancho /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="07:00 Despertar" durationInFrames={210}><Despertar /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="08:30 Desayuno" durationInFrames={190}><Desayuno /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="13:00 Almuerzo" durationInFrames={150}><Almuerzo /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="18:30 Gym" durationInFrames={330}><Gym /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="19:45 Fin del entreno" durationInFrames={140}><FinEntreno /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="21:00 Hábitos" durationInFrames={160}><Habitos /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="23:00 Progreso" durationInFrames={170}><Progreso /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
        <TransitionSeries.Sequence name="Cierre" durationInFrames={170}><Cierre /></TransitionSeries.Sequence>
      </TransitionSeries>
      <AbsoluteFill style={{ background: "#000", opacity: interpolate(f, [durationInFrames - 12, durationInFrames - 1], [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};

// 80+210+190+150+330+140+160+170+170 = 1600, menos 7×12 + 12 + 18 de transiciones = 1486 cuadros ≈ 49,5 s
export const DURACION = 1600 - 7 * T - T - 18;
