import "./index.css";
import { Composition, Folder } from "remotion";
import { DURACION, UnDia } from "./UnDia";
import { Almuerzo, Cierre, Desayuno, Despertar, FinEntreno, Gancho, Gym, Habitos, Progreso } from "./escenas/Escenas";
import { Fondo } from "./ui/Fondo";
import { AbsoluteFill } from "remotion";

const conFondo = (C: React.FC) => () => (<AbsoluteFill><Fondo /><C /></AbsoluteFill>);
const escenas: [string, React.FC, number][] = [
  ["Gancho", Gancho, 80], ["Despertar", Despertar, 210], ["Desayuno", Desayuno, 190], ["Almuerzo", Almuerzo, 150],
  ["Gym", Gym, 330], ["FinEntreno", FinEntreno, 140], ["Habitos", Habitos, 160], ["Progreso", Progreso, 170], ["Cierre", Cierre, 170],
];

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="UnDiaConGize" component={UnDia} durationInFrames={DURACION} fps={30} width={1080} height={1920} />
    <Folder name="Escenas">
      {escenas.map(([id, C, d]) => (
        <Composition key={id} id={id} component={conFondo(C)} durationInFrames={d} fps={30} width={1080} height={1920} />
      ))}
    </Folder>
  </>
);
