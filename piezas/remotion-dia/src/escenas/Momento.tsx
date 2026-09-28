// Plantilla de cada momento del día: reloj gigante arriba, frases cinéticas y el celular con la app;
// el detalle recreado aparece encima del celular, abajo a la derecha.
import { AbsoluteFill, Sequence } from "remotion";
import { Kinetico, pal } from "../ui/Kinetico";
import { Reloj } from "../ui/Reloj";
import { Telefono } from "../ui/Telefono";

export type Frase = { texto: string; desde: number; hasta?: number };
export type Toma = { clip: string; desde?: number; velocidad?: number; en: number; velo?: number };

export const Momento: React.FC<{ hora: string; frases: Frase[]; tomas: Toma[]; detalle?: React.ReactNode; detalleEn?: number; giro?: number }> =
  ({ hora, frases, tomas, detalle, detalleEn = 60, giro = 1 }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", top: 150, left: 40 }}><Reloj hora={hora} /></div>
    <div style={{ position: "absolute", top: 450, left: 80, width: 920, height: 240 }}>
      {frases.map((fr, i) => (
        <Sequence key={i} from={fr.desde} durationInFrames={(fr.hasta ?? 9999) - fr.desde + 10} layout="none">
          <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center" }}>
            <Kinetico palabras={pal(fr.texto)} hasta={fr.hasta === undefined ? undefined : fr.hasta - fr.desde} />
          </div>
        </Sequence>
      ))}
    </div>
    {tomas.map((t, i) => (
      <Sequence key={i} from={t.en} durationInFrames={(tomas[i + 1]?.en ?? 9999) - t.en} layout="none">
        <div style={{ position: "absolute", top: 700, left: 0, width: 1080, display: "flex", justifyContent: "center" }}>
          <Telefono clip={t.clip} desde={t.desde} velocidad={t.velocidad} giro={giro} velo={t.velo} />
        </div>
      </Sequence>
    ))}
    {detalle && (
      <div style={{ position: "absolute", right: 70, bottom: 250, display: "flex", justifyContent: "flex-end" }}>
        <Sequence from={detalleEn} layout="none">{detalle}</Sequence>
      </div>
    )}
  </AbsoluteFill>
);
