// Tipografía cinética: cada palabra entra de a una, grande y con un golpe; las marcadas van con la gama de marca.
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { FUENTE, GAMA, TEXTO, clamp } from "../marca";

type Palabra = { t: string; acento?: boolean; corte?: boolean };
export const Kinetico: React.FC<{ palabras: Palabra[]; desde?: number; cada?: number; tamano?: number; hasta?: number }> =
  ({ palabras, desde = 0, cada = 4, tamano = 96, hasta }) => {
  const f = useCurrentFrame();
  const salidaK = hasta === undefined ? 1 : interpolate(f, [hasta, hasta + 8], [1, 0], clamp);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${tamano * 0.28}px`, width: 920,
                  fontFamily: FUENTE, fontWeight: 700, fontSize: tamano, lineHeight: 1.08, letterSpacing: -1, opacity: salidaK }}>
      {palabras.map((p, i) => {
        if (p.corte) return <span key={i} style={{ flexBasis: "100%", height: 0 }} />;
        const k = f - desde - i * cada;
        return (
          <span key={i} style={{
            display: "inline-block",
            opacity: interpolate(k, [0, 4], [0, 1], clamp),
            scale: interpolate(k, [0, 7], [1.45, 1], { ...clamp, easing: Easing.bezier(0.2, 1.4, 0.4, 1) }),
            translate: interpolate(k, [0, 7], ["0px 30px", "0px 0px"], clamp),
            filter: `blur(${interpolate(k, [0, 5], [10, 0], clamp)}px)`,
            ...(p.acento ? { backgroundImage: GAMA, WebkitBackgroundClip: "text", color: "transparent",
                             textShadow: "none" } : { color: TEXTO, textShadow: "0 6px 30px #000a" }),
          }}>{p.t}</span>
        );
      })}
    </div>
  );
};

// "Hola **mundo**" → palabras con acento; " | " fuerza un salto de línea
export const pal = (s: string): Palabra[] => {
  const out: Palabra[] = []; let acento = false;
  s.split(/(\*\*)/).forEach((trozo) => {
    if (trozo === "**") { acento = !acento; return; }
    trozo.split(" ").filter(Boolean).forEach((t) => out.push(t === "|" ? { t: "", corte: true } : { t, acento }));
  });
  return out;
};
