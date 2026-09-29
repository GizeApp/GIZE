import "./index.css";
import { Composition, Folder } from "remotion";
import { DURACION, UnDia } from "./UnDia";
import { DURACION_SEMANA, ESCENAS_SEMANA, Semana } from "./Semana";
import { Almuerzo, Cena, Cierre, Desayuno, Despertar, FinEntreno, Gancho, Gym, Habitos, Merienda, Progreso } from "./escenas/Escenas";
import { Fondo } from "./ui/Fondo";
import { AbsoluteFill } from "remotion";

const conFondo = (C: React.FC) => () => (<AbsoluteFill><Fondo /><C /></AbsoluteFill>);
const escenas: [string, React.FC, number][] = [
  ["Gancho", Gancho, 75], ["Despertar", Despertar, 100], ["Desayuno", Desayuno, 180], ["Almuerzo", Almuerzo, 160], ["Merienda", Merienda, 100],
  ["Gym", Gym, 300], ["FinEntreno", FinEntreno, 120], ["Cena", Cena, 160], ["Habitos", Habitos, 130], ["Progreso", Progreso, 135], ["Cierre", Cierre, 75],
];

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="UnDiaConGize" component={UnDia} durationInFrames={DURACION} fps={30} width={1080} height={1920} />
    <Composition id="ArmaTuSemana" component={Semana} durationInFrames={DURACION_SEMANA} fps={30} width={1080} height={1920} />
    <Folder name="EscenasSemana">
      {ESCENAS_SEMANA.map(([id, C, d]) => (
        <Composition key={id} id={"S-" + id} component={conFondo(C)} durationInFrames={d} fps={30} width={1080} height={1920} />
      ))}
    </Folder>
    <Folder name="Escenas">
      {escenas.map(([id, C, d]) => (
        <Composition key={id} id={id} component={conFondo(C)} durationInFrames={d} fps={30} width={1080} height={1920} />
      ))}
    </Folder>
  </>
);
