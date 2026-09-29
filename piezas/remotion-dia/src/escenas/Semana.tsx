// Las escenas del reel «Armá tu semana en 3 pasos»: el paso en neón gigante hace de hilo, como el reloj en «Un día».
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { clamp } from "../marca";
import { Neon, parpadeo } from "../ui/Neon";
import { Kinetico, pal } from "../ui/Kinetico";
import { Momento } from "./Momento";

const P = 180;   // tamaño del rótulo de neón de cada paso

// Gancho: un signo de pregunta que titila y la duda de siempre.
export const Duda: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ marginTop: -380, scale: String(interpolate(f, [0, 20], [1.15, 1], clamp)) }}>
        <Neon texto="?" tamano={520} ancho={1080} encendido={parpadeo(f - 2) * (f < 40 ? 0.6 + 0.4 * ((f >> 2) % 2) : 1)} />
      </div>
      <div style={{ position: "absolute", top: 1060, width: "100%", display: "flex", justifyContent: "center" }}>
        <Kinetico palabras={pal("¿No sabés | **qué entrenar?**")} desde={16} tamano={104} />
      </div>
    </AbsoluteFill>
  );
};

// Titular: el 3 se prende con un flash.
export const Tres: React.FC = () => {
  const f = useCurrentFrame();
  const flash = interpolate(f, [4, 6, 20], [0, 0.45, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ marginTop: -420, scale: String(interpolate(f, [4, 10, 40], [1.2, 1, 1], clamp)) }}>
        <Neon texto="3" tamano={640} ancho={1080} encendido={parpadeo(f - 4)} />
      </div>
      <div style={{ position: "absolute", top: 1100, width: "100%", display: "flex", justifyContent: "center" }}>
        <Kinetico palabras={pal("Armá tu semana | en **3 pasos.**")} desde={10} tamano={104} />
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

export const Inicio: React.FC = () => (
  <Momento hora="INICIO" tamanoHora={P} giro={1}
    frases={[{ texto: "Tocás **Empezar vacío.**", desde: 8 }]}
    tomas={[{ clip: "bienvenida", desde: 8.2, velocidad: 1.0, en: 10 }]} />
);

export const Paso1: React.FC = () => (
  <Momento hora="PASO 1" tamanoHora={P} giro={-1}
    frases={[{ texto: "¿Cuántos **días** entrenás?", desde: 8 }]}
    tomas={[{ clip: "semana", desde: 4.0, velocidad: 1.3, en: 10 }]} />
);

export const Paso2: React.FC = () => (
  <Momento hora="PASO 2" tamanoHora={P} giro={1}
    frases={[{ texto: "Elegís tu **objetivo.**", desde: 8 }]}
    tomas={[{ clip: "semana", desde: 8.4, velocidad: 1.3, en: 10 }]} />
);

export const Paso3: React.FC = () => (
  <Momento hora="PASO 3" tamanoHora={P} giro={-1}
    frases={[{ texto: "Nombrás tu primer día.", desde: 8, hasta: 62 }, { texto: "**Listo.**", desde: 68 }]}
    tomas={[{ clip: "semana", desde: 12.7, velocidad: 1.5, en: 10 }]} />
);

export const Atajo: React.FC = () => (
  <Momento hora="ATAJO" tamanoHora={P} giro={1}
    frases={[{ texto: "¿Sin ideas?", desde: 8, hasta: 44 }, { texto: "Usá una **rutina armada.**", desde: 50 }]}
    tomas={[{ clip: "rutinas-armadas", desde: 0.2, velocidad: 2.2, en: 10 }]} />
);

export const AEntrenar: React.FC = () => (
  <Momento hora="HOY" tamanoHora={P} giro={-1}
    frases={[{ texto: "Y a **entrenar.**", desde: 8 }]}
    tomas={[{ clip: "entrenar", desde: 0, velocidad: 1.4, en: 10 }]} />
);
