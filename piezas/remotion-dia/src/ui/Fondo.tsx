// Fondo de marca: negro con brillos de la gama que se mueven lento y tubos de neón en las esquinas.
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { AZUL, FONDO, MAGENTA, VIOLETA, clamp } from "../marca";

const Brillo: React.FC<{ color: string; x: number; y: number; r: number; fase: number }> = ({ color, x, y, r, fase }) => {
  const f = useCurrentFrame();
  const t = f / 30 / 9 * Math.PI * 2 + fase;
  return (
    <div style={{
      position: "absolute", left: `${x + Math.sin(t) * 7}%`, top: `${y + Math.cos(t * 0.8) * 5}%`,
      width: r, height: r, marginLeft: -r / 2, marginTop: -r / 2, borderRadius: "50%",
      background: `radial-gradient(circle, ${color}66 0%, ${color}22 40%, transparent 70%)`, filter: "blur(30px)",
    }} />
  );
};

const Tubo: React.FC<{ x: number; y: number; largo: number; angulo: number; de: string; a: string; fase: number; desenfoque?: number }> =
  ({ x, y, largo, angulo, de, a, fase, desenfoque = 0 }) => {
  const f = useCurrentFrame();
  const t = f / 30;
  const encendido = f < 22 ? [0, 0.8, 0, 0, 0.5, 1, 0.2, 1, 1, 0.4, 1][Math.floor(f / 2)] ?? 1 : 1;
  const respira = 0.82 + 0.18 * Math.sin(t * 1.6 + fase);
  const deriva = Math.sin(t * 0.35 + fase) * 30;
  return (
    <div style={{
      position: "absolute", left: x + deriva, top: y - deriva * 0.6, width: largo, height: 12, borderRadius: 12,
      rotate: `${angulo}deg`, transformOrigin: "left center",
      background: `linear-gradient(90deg, ${de}, ${a})`, opacity: encendido * respira,
      boxShadow: `0 0 18px ${de}, 0 0 46px ${a}aa, 0 0 90px ${a}55`, filter: desenfoque ? `blur(${desenfoque}px)` : undefined,
    }}>
      <div style={{ position: "absolute", inset: "4px 10px", borderRadius: 8, background: "#ffffffcc", filter: "blur(1.5px)" }} />
    </div>
  );
};

export const Fondo: React.FC<{ intensidad?: number }> = ({ intensidad = 1 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: FONDO, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: intensidad * interpolate(f, [0, 20], [0, 1], clamp) }}>
        <Brillo color={AZUL} x={15} y={22} r={900} fase={0} />
        <Brillo color={VIOLETA} x={85} y={30} r={800} fase={1.9} />
        <Brillo color={MAGENTA} x={80} y={78} r={900} fase={3.8} />
        <Brillo color={VIOLETA} x={20} y={70} r={760} fase={5.7} />
        <Tubo x={-60} y={330} largo={560} angulo={-31} de={AZUL} a={VIOLETA} fase={0} />
        <Tubo x={760} y={-40} largo={480} angulo={35} de={VIOLETA} a={MAGENTA} fase={1.3} desenfoque={6} />
        <Tubo x={640} y={1880} largo={620} angulo={-35} de={MAGENTA} a={VIOLETA} fase={2.1} />
        <Tubo x={-80} y={1640} largo={520} angulo={38} de={VIOLETA} a={AZUL} fase={3.4} desenfoque={14} />
      </AbsoluteFill>
      {/* fundido arriba y abajo para que el centro quede limpio */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #04050Acc 0%, transparent 26%, transparent 70%, #04050Ad0 100%)" }} />
    </AbsoluteFill>
  );
};
