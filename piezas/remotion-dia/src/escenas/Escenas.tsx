// Las escenas del video «Un día con GIZE».
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FUENTE, AZUL, clamp } from "../marca";
import { Neon, parpadeo } from "../ui/Neon";
import { Kinetico, pal } from "../ui/Kinetico";
import { Agua, Anillo, Checklist, Cuenta, Curva, Racha, Resumen } from "../ui/Detalles";
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
    frases={[{ texto: "Te despertás.", desde: 8, hasta: 52 }, { texto: "Racha: **13 días.**", desde: 58 }]}
    tomas={[{ clip: "racha", desde: 1.2, en: 10 }, { clip: "registro", desde: 1.5, velocidad: 1.4, en: 118 }]}
    detalle={<Racha desde={0} />} detalleEn={56} />
);

export const Desayuno: React.FC = () => (
  <Momento hora="08:30" giro={-1}
    frases={[{ texto: "Desayunás.", desde: 8, hasta: 50 }, { texto: "Lo anotás **en segundos.**", desde: 56 }]}
    tomas={[{ clip: "comida", desde: 2.4, velocidad: 1.6, en: 10 }]}
    detalle={<Anillo desde={0} />} detalleEn={96} />
);

export const Almuerzo: React.FC = () => (
  <Momento hora="13:00" giro={1}
    frases={[{ texto: "Almorzás.", desde: 8, hasta: 44 }, { texto: "Y no te olvidás **del agua.**", desde: 50 }]}
    tomas={[{ clip: "agua", desde: 0.8, velocidad: 1.3, en: 10 }]}
    detalle={<Agua desde={0} />} detalleEn={62} />
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

export const Habitos: React.FC = () => (
  <Momento hora="21:00" giro={-1}
    frases={[{ texto: "Cenás.", desde: 8, hasta: 40 }, { texto: "Cumplís **tus hábitos.**", desde: 46 }]}
    tomas={[{ clip: "habitos", desde: 16.4, velocidad: 1.2, en: 10 }]}
    detalle={<Checklist desde={0} />} detalleEn={52} />
);

export const Progreso: React.FC = () => (
  <Momento hora="23:00" giro={1}
    frases={[{ texto: "Y ves cómo **progresás.**", desde: 8 }]}
    tomas={[{ clip: "progreso", desde: 2.6, velocidad: 1.3, en: 10 }]}
    detalle={<Curva desde={0} />} detalleEn={48} />
);

export const Cierre: React.FC = () => {
  const f = useCurrentFrame();
  const logo = interpolate(f, [4, 22], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily: FUENTE }}>
      <Img src={staticFile("brand/gize-firma-horizontal.svg")} style={{ width: 520, opacity: logo, marginTop: -260,
        scale: String(interpolate(logo, [0, 1], [0.9, 1])), filter: "drop-shadow(0 0 30px #A65CFF88)" }} />
      <div style={{ position: "absolute", top: 1000, width: "100%", display: "flex", justifyContent: "center" }}>
        <Kinetico palabras={pal("Todo tu entrenamiento, | **en un solo lugar.**")} desde={20} cada={4} tamano={80} />
      </div>
      <div style={{ position: "absolute", top: 1330, fontSize: 60, fontWeight: 600, color: AZUL,
        opacity: interpolate(f, [60, 76], [0, 1], clamp), letterSpacing: 1 }}>gize.ar</div>
      <div style={{ position: "absolute", top: 1420, width: 360, height: 4, borderRadius: 4,
        background: "linear-gradient(90deg, transparent, #2FA0FF, #A65CFF, #FF3DAE, transparent)", opacity: interpolate(f, [66, 82], [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};
