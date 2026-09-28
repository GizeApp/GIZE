// Las escenas del video «Un día con GIZE».
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp } from "../marca";
import { Neon, parpadeo } from "../ui/Neon";
import { Kinetico, pal } from "../ui/Kinetico";
import { Anillo, Checklist, Cuenta, Peso, Racha, Resumen } from "../ui/Detalles";
import { Momento } from "./Momento";

// Gancho: 06:59 que parpadea y salta a 07:00 con un flash de neón.
export const Gancho: React.FC = () => {
  const f = useCurrentFrame();
  const hora = f < 34 ? "06:59" : "07:00";
  const flash = interpolate(f, [34, 36, 50], [0, 0.55, 0], clamp);
  const zoom = interpolate(f, [34, 40, 70], [1.12, 1, 1], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ scale: String(zoom), marginTop: -160 }}>
        <Neon texto={hora} tamano={300} ancho={1080} encendido={f < 34 ? parpadeo(f - 4) * (0.55 + 0.45 * ((f >> 2) % 2)) : 1} />
      </div>
      <div style={{ position: "absolute", top: 1120, width: "100%", display: "flex", justifyContent: "center" }}>
        {f >= 40 && <Kinetico palabras={pal("Tu día **arranca.**")} desde={40} tamano={100} />}
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

export const Despertar: React.FC = () => (
  <Momento hora="07:00" giro={1}
    frases={[{ texto: "Te despertás.", desde: 8, hasta: 46 }, { texto: "Racha: **13 días.**", desde: 52 }]}
    tomas={[{ clip: "racha", desde: 1.2, en: 10 }]}
    detalle={<Racha desde={0} />} detalleEn={50} />
);

// El diario se completa según la hora: desayuno → almuerzo → merienda → cena, y el contador sube.
export const Desayuno: React.FC = () => (
  <Momento hora="08:30" giro={-1}
    frases={[{ texto: "Desayunás.", desde: 8, hasta: 50 }, { texto: "Lo anotás **en segundos.**", desde: 56 }]}
    tomas={[{ clip: "desayuno", desde: 0.9, velocidad: 2.6, en: 10 }, { clip: "desayuno", desde: 17.2, velocidad: 1.2, en: 124 }]}
    detalle={<Anillo desde={0} de={0} hasta={219} />} detalleEn={108} />
);

export const Almuerzo: React.FC = () => (
  <Momento hora="13:00" giro={1}
    frases={[{ texto: "Almorzás.", desde: 8, hasta: 44 }, { texto: "Las calorías **se suman solas.**", desde: 50 }]}
    tomas={[{ clip: "almuerzo", desde: 0, velocidad: 2.6, en: 10 }, { clip: "almuerzo", desde: 14.2, velocidad: 1.2, en: 112 }]}
    detalle={<Anillo desde={0} de={219} hasta={718} />} detalleEn={96} />
);

export const Merienda: React.FC = () => (
  <Momento hora="17:00" giro={-1}
    frases={[{ texto: "**Merendás.**", desde: 6 }]}
    tomas={[{ clip: "merienda", desde: 0.4, velocidad: 3.4, en: 8 }]}
    detalle={<Anillo desde={0} de={718} hasta={1062} />} detalleEn={40} />
);

export const Gym: React.FC = () => (
  <Momento hora="18:30" giro={-1}
    frases={[{ texto: "Hora de **entrenar.**", desde: 8, hasta: 84 }, { texto: "Cada serie. **Anotada.**", desde: 92, hasta: 196 },
             { texto: "Cada descanso. **Cronometrado.**", desde: 204 }]}
    tomas={[{ clip: "entrenar", desde: 0, velocidad: 1.5, en: 10 }, { clip: "entrenar", desde: 7.2, velocidad: 1.3, en: 92 },
            { clip: "descanso", desde: 0.8, velocidad: 1.2, en: 204 }]}
    detalle={<Cuenta desde={0} />} detalleEn={222} />
);

export const FinEntreno: React.FC = () => (
  <Momento hora="19:45" giro={1}
    frases={[{ texto: "**Entreno terminado.**", desde: 8 }]}
    tomas={[{ clip: "finalizar", desde: 0.6, velocidad: 1.2, en: 10, velo: 1 }]}
    detalle={<Resumen desde={0} />} detalleEn={42} />
);

export const Cena: React.FC = () => (
  <Momento hora="21:00" giro={1}
    frases={[{ texto: "Cenás.", desde: 8, hasta: 42 }, { texto: "Y cerrás el día: **1401 kcal.**", desde: 48 }]}
    tomas={[{ clip: "cena", desde: 0.8, velocidad: 2.6, en: 10 }, { clip: "cena", desde: 15.4, velocidad: 1.2, en: 112 }]}
    detalle={<Anillo desde={0} de={1062} hasta={1401} />} detalleEn={96} />
);

export const Habitos: React.FC = () => (
  <Momento hora="22:30" giro={-1}
    frases={[{ texto: "Antes de dormir,", desde: 8, hasta: 44 }, { texto: "cumplís **tus hábitos.**", desde: 50 }]}
    tomas={[{ clip: "habitos", desde: 16.4, velocidad: 1.2, en: 10 }]}
    detalle={<Checklist desde={0} />} detalleEn={50} />
);

export const Progreso: React.FC = () => (
  <Momento hora="23:00" giro={1}
    frases={[{ texto: "Y ves cómo **bajás de peso.**", desde: 8 }]}
    tomas={[{ clip: "peso", desde: 0.9, velocidad: 1.0, en: 10 }]}
    detalle={<Peso desde={0} />} detalleEn={44} />
);

// Cierre: solo el logo, de golpe, con un flash de neón.
export const Cierre: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "#04050A" }}>
      <Img src={staticFile("brand/gize-firma-horizontal.svg")} style={{ width: 620,
        scale: String(interpolate(f, [0, 4, 12], [1.25, 0.97, 1], clamp)),
        filter: `drop-shadow(0 0 ${interpolate(f, [0, 10, 40], [60, 34, 24], clamp)}px #A65CFF) drop-shadow(0 0 80px #2FA0FF66)` }} />
      <AbsoluteFill style={{ background: "#fff", opacity: interpolate(f, [0, 2, 12], [0.85, 0.5, 0], clamp) }} />
    </AbsoluteFill>
  );
};
