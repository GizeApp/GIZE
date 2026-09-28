// «Un día con GIZE»: reel vertical, sin audio, ~47 s. Del despertar a la noche, con el reloj como hilo.
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import "./marca";
import { clamp } from "./marca";
import { Fondo } from "./ui/Fondo";
import { Almuerzo, Cena, Cierre, Desayuno, Despertar, FinEntreno, Gancho, Gym, Habitos, Merienda, Progreso } from "./escenas/Escenas";

const T = 12;   // cuadros de cada transición
const pase = () => slide({ direction: "from-bottom" });

export const UnDia: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Fondo intensidad={interpolate(f, [0, 36, 60], [0.15, 0.3, 1], clamp)} />
      <TransitionSeries>
        <TransitionSeries.Sequence name="Gancho" durationInFrames={75}><Gancho /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="07:00 Despertar" durationInFrames={100}><Despertar /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="08:30 Desayuno" durationInFrames={180}><Desayuno /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="13:00 Almuerzo" durationInFrames={160}><Almuerzo /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="17:00 Merienda" durationInFrames={100}><Merienda /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="18:30 Gym" durationInFrames={300}><Gym /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="19:45 Fin del entreno" durationInFrames={120}><FinEntreno /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="21:00 Cena" durationInFrames={160}><Cena /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="22:30 Hábitos" durationInFrames={130}><Habitos /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={pase()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence name="23:00 Progreso" durationInFrames={135}><Progreso /></TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="Cierre" durationInFrames={75}><Cierre /></TransitionSeries.Sequence>
      </TransitionSeries>
      <AbsoluteFill style={{ background: "#000", opacity: interpolate(f, [durationInFrames - 12, durationInFrames - 1], [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};

// 75+100+180+160+100+300+120+160+130+135+75 = 1535, menos 9 transiciones de T cuadros (el cierre entra al corte)
export const DURACION = 1535 - 9 * T;
