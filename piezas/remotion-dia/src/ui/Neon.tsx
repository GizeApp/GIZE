// Texto en neón: tubo con la gama de marca, brillo y núcleo claro (como el «14» y «gratis» de las piezas).
import { useId } from "react";
import { AZUL, FUENTE, MAGENTA, VIOLETA } from "../marca";

export const Neon: React.FC<{ texto: string; tamano: number; ancho: number; alto?: number; encendido?: number; alinear?: "start" | "middle" }> =
  ({ texto, tamano, ancho, alto, encendido = 1, alinear = "middle" }) => {
  const id = useId().replace(/:/g, "");
  const h = alto ?? tamano * 1.25;
  const x = alinear === "middle" ? ancho / 2 : 8;
  const comun = { x, y: h * 0.8, textAnchor: alinear, fontFamily: FUENTE, fontWeight: 700, fontSize: tamano, fill: "none" } as const;
  return (
    <svg width={ancho} height={h} viewBox={`0 0 ${ancho} ${h}`} style={{ overflow: "visible", opacity: encendido }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="1" y1="0" y2="0.4">
          <stop offset="0" stopColor={AZUL} /><stop offset="0.55" stopColor={VIOLETA} /><stop offset="1" stopColor={MAGENTA} />
        </linearGradient>
        <filter id={`b${id}`} x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation={tamano * 0.09} /></filter>
        <filter id={`s${id}`} x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation={tamano * 0.025} /></filter>
      </defs>
      <text {...comun} stroke={`url(#g${id})`} strokeWidth={tamano * 0.075} filter={`url(#b${id})`} opacity={0.95} />
      <text {...comun} stroke={`url(#g${id})`} strokeWidth={tamano * 0.05} filter={`url(#s${id})`}>{texto}</text>
      <text {...comun} stroke={`url(#g${id})`} strokeWidth={tamano * 0.034}>{texto}</text>
      <text {...comun} stroke="#ffffff" strokeOpacity={0.85} strokeWidth={tamano * 0.011}>{texto}</text>
      <text {...comun} stroke={`url(#g${id})`} strokeWidth={tamano * 0.075} filter={`url(#b${id})`} opacity={0.9}>{texto}</text>
    </svg>
  );
};

// Parpadeo de encendido tipo cartel: 0 apagado, 1 prendido.
export const parpadeo = (k: number) => (k < 0 ? 0 : k >= 14 ? 1 : [0, 0.6, 0, 0.3, 1, 0.5, 1][Math.floor(k / 2)]);
