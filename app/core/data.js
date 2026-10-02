
// La base de alimentos vive en ./foods.js (curada, sin repetidos, con crudo/cocido).
export { FOODS } from './foods.js';

export const EX_CATS = [["pecho","Pecho"],["espalda","Espalda"],["hombros","Hombros"],["biceps","Bíceps"],["triceps","Tríceps"],["cuadriceps","Cuádriceps"],["isquios","Isquios"],["gluteos","Glúteos"],["aductores","Aductores"],["gemelos","Gemelos"],["abs","Abdominales"],["antebrazo","Antebrazo"],["cuello","Cuello"]];

export const EX_DB = {
  pecho:["Press de banca plano (barra)","Press de banca inclinado (barra)","Press de banca declinado","Press plano con mancuernas","Press inclinado con mancuernas","Press plano en Smith","Press inclinado en Smith","Aperturas con mancuernas","Aperturas inclinadas","Aperturas en máquina","Cruce de poleas","Vuelos en polea","Fondos en paralelas","Flexiones de brazos","Press de pecho en máquina","Peck deck","Cruce de poleas descendente","Press declinado con mancuernas","Aperturas en polea baja","Flexiones diamante","Press de pecho en máquina inclinado","Fondos asistidos en máquina"],
  espalda:["Dominadas","Dominadas neutras","Jalón al pecho","Jalón neutro","Jalón en V","Jalón en estocada","Remo con barra","Remo Pendlay","Remo unilateral con mancuerna","Remo en máquina","Remo en máquina unilateral","Remo en polea baja","Hiperextensiones lumbares","Remo neutro abierto en polea baja","Jalón prono","Remo T","Remo en polea baja unilateral","Remo alto en polea","Pullover en polea","Pullover con mancuerna","Remo con mancuerna en banco inclinado","Remo invertido","Dominadas asistidas","Dominadas asistidas en máquina","Jalón supino","Remo Meadows","Rack pull"],
  hombros:["Press militar con barra","Press Arnold","Press de hombros con mancuernas","Press de hombros en Smith","Vuelos laterales con mancuernas","Vuelos laterales en polea","Vuelos laterales en máquina","Vuelos posteriores","Posterior en máquina","Posterior en polea","Elevaciones frontales","Jalón a la cara","Encogimientos de hombros","Vuelos laterales sentado","Elevaciones laterales","Vuelo lateral en polea (énfasis estiramiento)","Remo al mentón","Press landmine","Elevación Y en banco inclinado","Press militar sentado","Rotación externa en polea"],
  biceps:["Curl con barra","Curl con barra Z","Curl con mancuernas","Curl alternado","Curl martillo","Curl predicador","Curl en banco inclinado","Curl en polea","Curl en polea detrás del cuerpo","Curl concentrado","Curl araña","Curl bíceps en polea baja frontal","Curl Bayesian","Curl predicador en polea","Curl martillo en polea","Curl en máquina","Curl 21","Curl con barra supino en polea"],
  triceps:["Press francés con barra","Press francés con mancuernas","Extensión en polea","Extensión con soga","Patada de tríceps","Press cerrado","Fondos entre bancos","Extensión sobre la cabeza","Katana en polea","Fondos en paralelas","Extensión de tríceps unilateral en polea","Fondos en máquina","Extensión de tríceps en máquina","Press JM","Fondos asistidos en máquina"],
  cuadriceps:["Sentadilla libre","Sentadilla frontal","Sentadilla en Smith","Sentadilla hack","Prensa 45","Prensa horizontal","Extensión de cuádriceps","Extensión de cuádriceps a una pierna","Zancadas","Sentadilla búlgara","Sentadilla con mancuerna al pecho","Subida al cajón","Sentadilla sissy","Cuadricera","Sentadilla goblet","Sentadilla pendular","Sentadilla con cinturón","Zancadas caminando","Zancada inversa","Sentadilla sumo"],
  isquios:["Curl femoral acostado","Curl femoral sentado","Curl femoral de pie","Peso muerto rumano","Peso muerto rumano con mancuernas","Peso muerto piernas rígidas","Peso muerto convencional","Buenos días","Curl nórdico","Camilla de isquios","Peso muerto rumano a una pierna","Curl femoral con fitball"],
  gluteos:["Empuje de cadera","Empuje de cadera en máquina","Puente de glúteo","Patada de glúteo en polea","Patada de glúteo en máquina","Abductores","Abductores en polea","Abducción en polea","Peso muerto sumo","Empuje de cadera a una pierna","Patada de glúteo en cuadrupedia","Caminata lateral con banda","Hiperextensión para glúteo","Step-up para glúteo"],
  // Aductores: cara interna del muslo (no son glúteo). Los abductores sí van en glúteos (glúteo medio).
  aductores:["Aductores","Aductores en máquina","Aductores en polea"],
  gemelos:["Gemelos de pie","Gemelos sentado","Gemelos en prensa","Gemelos en Smith","Gemelos burro","Gemelos a una pierna","Gemelos en máquina","Elevación de tibial"],
  abs:["Encogimiento abdominal","Encogimiento declinado","Elevación de piernas","Elevación de piernas colgado","Plancha","Rueda abdominal","Encogimiento en polea","Giro ruso","Escaladores","Oblicuos","Plancha lateral","Encogimiento invertido","Bicicleta abdominal","Puntas a la barra","Plancha invertida","Bicho muerto","Leñador en polea","Encogimiento en máquina","Bandera","Abdominales en V","Crunch en banco","Pallof press","Elevación de rodillas en paralelas","Plancha con toque de hombros"],
  antebrazo:["Curl martillo","Curl de muñeca","Curl de muñeca invertido","Curl invertido con barra","Caminata del granjero","Curl de antebrazo en polea","Curl de muñeca con mancuerna","Curl Zottman","Enrollador de muñeca","Colgarse de la barra","Pinza con disco"],
  cuello:["Flexión de cuello con disco","Extensión de cuello con disco","Flexión lateral de cuello","Flexión de cuello con arnés","Puente de cuello","Rotaciones de cuello"]
};

// Estado inicial de quien entra por primera vez: un día vacío. La rutina la elige en la
// bienvenida (rutinas armadas de 1 a 5 días, ver core/rutinas-ejemplo.js) o la arma a mano.
export const DEFAULT = {
  days: [{ id:"d1", name:"Día 1", subtitle:"", exercises:[] }],
  habits: []
};

// Ejercicios de la rutina de ejemplo con la que arrancaba toda cuenta hasta octubre de 2026
// (Meso 2): hay cuentas que todavía la tienen. Solo se usa para reconocerla al comparar la
// rutina del celular con la de la nube (localRoutineWins en core/supabase.js), nunca se carga.
export const OLD_DEFAULT_NAMES = [
  ["Vuelos laterales sentado","Jalón unilateral en estocada","Remo neutro abierto en polea baja","Press inclinado con mancuernas","Peck deck","Curl bíceps en polea baja frontal","Extensión de tríceps parado en polea"],
  ["Camilla de isquios","Aductores en máquina","Sentadilla en Smith","Prensa 45°","Cuadricera","Gemelos en máquina","Crunch en banco"],
  ["Elevaciones laterales","Press plano en Smith","Jalón prono","Vuelo lateral en polea (énfasis estiramiento)","Remo T","Cruce de poleas descendente","Remo en polea baja unilateral"],
  ["Peso muerto rumano","Prensa 45°","Cuadricera","Press francés con mancuernas","Curl predicador","Extensión de tríceps parado en polea","Curl Bayesian"]
].map(d => d.join(",")).join("|");

export const SCALES = [
  ["soreness","Dolor muscular",["Nada","Poco","Moderado","Mucho"]],
  ["performance","Rendimiento",["Malo","Regular","Bueno","Muy bueno"]],
  ["motivation","Motivación",["Baja","Media","Alta"]],
  ["hunger","Hambre",["Nada","Poca","Moderada","Mucha"]],
  ["fatigue","Cansancio",["Nada","Poco","Moderado","Mucho"]],
  ["sleep","Calidad de sueño",["Mala","Regular","Buena","Muy buena"]]
];

export const CHECKIN_Q = [
  ["q1","¿Qué fue lo más positivo de la semana? ¿De qué estás más orgulloso?"],
  ["q2","Entrenamiento: ¿pudiste progresar? ¿Alguna molestia articular o lesión? ¿Algún ejercicio que no conectes?"],
  ["q3","Recuperación: ¿te recuperás a tiempo? ¿Vas a la siguiente sesión con molestias musculares?"],
  ["q4","Actividad: ¿completaste tus pasos diarios y el cardio semanal? Sé honesto, ¿cuántos pasos hiciste?"],
  ["q5","Nutrición: ¿te mantuviste en el plan? ¿Comidas libres, alcohol, picoteos?"],
  ["q6","¿Cuánto café/estimulantes consumiste y con qué frecuencia?"],
  ["q7","Estrés y descanso: ¿cuántas horas dormís? ¿Es de calidad? ¿Cómo vienen tus niveles de estrés?"],
  ["q8","Digestión: ¿digerís bien las comidas? ¿Vas al baño con normalidad?"],
  ["q9","¿Te sentís apoyado con tus metas? ¿Tu trabajo te permite cumplir con todo?"],
  ["q10","Apariencia: ¿sentís que tu físico está progresando? ¿Estás a gusto con lo que ves?"],
  ["q11","¿Encontraste alguna dificultad esta semana? (entrenamiento, hábitos, nutrición, descanso)"],
  ["q12","Preguntá lo que necesites"],
  ["q13","¿Alguna interrupción la semana/mes que viene?"]
];

export const RC = 2*Math.PI*52;

export const ES_DAYS = {"Upper 1":"Torso 1","Upper 2":"Torso 2","Lower 1":"Pierna 1","Lower 2":"Pierna 2","Upper":"Torso","Lower":"Pierna"};

export const ES_MAP = {
  "Cable Lateral Raises":"Vuelos laterales en polea","DB Lateral Raises":"Vuelos laterales con mancuernas",
  "Press Plano Mancuernas":"Press plano con mancuernas","Press Banca":"Press de banca plano (barra)",
  "Máquina Remo Unilateral":"Remo en máquina unilateral","Maquina Remo Unilateral":"Remo en máquina unilateral","Remo Hammer":"Remo en máquina unilateral",
  "Upper pec Cable Flies":"Vuelos en polea","Aperturas Descendentes (Upper Pec)":"Aperturas inclinadas",
  "Jalón Polea Abierto":"Jalón al pecho","Jalon Polea Abierto":"Jalón al pecho","Jalón V":"Jalón en V","Jalón Neutro":"Jalón neutro",
  "Extensiones de Tríceps":"Extensión en polea","Extensiones de Triceps":"Extensión en polea","Extensión de Tríceps":"Extensión en polea",
  "Bíceps Polea Barra Dado Vuelta":"Curl en polea","Biceps Polea Barra Dado Vuelta":"Curl en polea","Biceps Curl en Polea":"Curl en polea","Biceps Curl":"Curl con mancuernas",
  "Gemelos":"Gemelos de pie","Standing Calves":"Gemelos de pie","Gemelos burro (donkey)":"Gemelos burro",
  "Isquios Acostado":"Curl femoral acostado","Leg Curl":"Curl femoral acostado",
  "RDL":"Peso muerto rumano","Peso muerto rumano (RDL)":"Peso muerto rumano",
  "Prensa":"Prensa 45","Extensión Cuad":"Extensión de cuádriceps","Extension Cuad":"Extensión de cuádriceps",
  "Extensiones Cuads":"Extensión de cuádriceps","Extensión de quads":"Extensión de cuádriceps","Extensión unilateral":"Extensión de cuádriceps a una pierna",
  "Abdominales Bandera":"Bandera","Dragon flag":"Bandera","Crunches":"Encogimiento abdominal","Crunch":"Encogimiento abdominal",
  "Decline Crunches":"Encogimiento declinado","Crunch declinado":"Encogimiento declinado","Crunch en polea":"Encogimiento en polea",
  "Crunch invertido":"Encogimiento invertido","Crunch en máquina":"Encogimiento en máquina",
  "T-Bar Row":"Remo en barra T","Horizontal Row":"Remo en máquina","Remo Unilateral":"Remo unilateral con mancuerna",
  "Smith OHP":"Press de hombros en Smith","Press Smith Inclinado":"Press inclinado en Smith","Pecho Inclinado Smith":"Press inclinado en Smith",
  "Smith Squat":"Sentadilla en Smith","Hack Squat":"Sentadilla hack","Sissy squat":"Sentadilla sissy","Búlgaras":"Sentadilla búlgara",
  "Sentadilla goblet":"Sentadilla con mancuerna al pecho","Step Up":"Subida al cajón",
  "Pec Dec":"Aperturas en máquina","Pec Deck":"Aperturas en máquina","Posterior en Pec Deck":"Posterior en máquina","Chest Press (máquina)":"Press de pecho en máquina",
  "Press Francés":"Press francés con barra","Press francés (barra)":"Press francés con barra","Francés":"Press francés con barra",
  "Predicador Unilat Mancuerna":"Curl predicador","Curl predicador (Scott)":"Curl predicador","Bayesian":"Curl en polea detrás del cuerpo","Curl Bayesian":"Curl en polea detrás del cuerpo",
  "Lower back hyperextension":"Hiperextensiones lumbares","Posterior":"Vuelos posteriores","Vuelos con Mancuernas":"Vuelos laterales con mancuernas",
  "Hip Thrust":"Empuje de cadera","Hip Thrust en máquina":"Empuje de cadera en máquina",
  "Press militar (barra)":"Press militar con barra","Encogimientos (shrugs)":"Encogimientos de hombros","Face Pull":"Jalón a la cara",
  "Pullover en polea":"Jalón con brazos rectos en polea","Pullover con mancuerna":"Jalón con brazos rectos y mancuerna",
  "Buenos días (good morning)":"Buenos días","Russian Twist":"Giro ruso","Mountain Climbers":"Escaladores","Toes to bar":"Puntas a la barra",
  "Hollow hold":"Plancha hueca","Dead bug":"Bicho muerto","V-ups":"Abdominales en V",
  "Curl Reverse con barra":"Curl invertido con barra","Curl antebrazo + Reverse":"Curl de muñeca","Farmer Walk":"Caminata del granjero",
  "Wrist roller (enrollador)":"Enrollador de muñeca","Dead hang (colgarse)":"Colgarse de la barra","Plate pinch":"Pinza con disco","Grippers de mano":"Pinza de mano",
  "Neck curl con arnés":"Flexión de cuello con arnés","Puente de cuello (lucha)":"Puente de cuello"
};
