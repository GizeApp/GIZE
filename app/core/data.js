import { mkEx, mkExT } from './utils.js';

// La base de alimentos vive en ./foods.js (curada, sin repetidos, con crudo/cocido).
export { FOODS } from './foods.js';

export const EX_CATS = [["pecho","Pecho"],["espalda","Espalda"],["hombros","Hombros"],["biceps","Bíceps"],["triceps","Tríceps"],["cuadriceps","Cuádriceps"],["isquios","Isquios"],["gluteos","Glúteos"],["aductores","Aductores"],["gemelos","Gemelos"],["abs","Abdominales"],["antebrazo","Antebrazo"],["cuello","Cuello"]];

export const EX_DB = {
  pecho:["Press de banca plano (barra)","Press de banca inclinado (barra)","Press de banca declinado","Press plano con mancuernas","Press inclinado con mancuernas","Press plano en Smith","Press inclinado en Smith","Aperturas con mancuernas","Aperturas inclinadas","Aperturas en máquina","Cruce de poleas","Vuelos en polea","Fondos en paralelas","Flexiones de brazos","Press de pecho en máquina","Peck deck","Cruce de poleas descendente","Press declinado con mancuernas","Aperturas en polea baja","Flexiones diamante","Press de pecho en máquina inclinado"],
  espalda:["Dominadas","Dominadas neutras","Jalón al pecho","Jalón neutro","Jalón en V","Jalón en estocada","Remo con barra","Remo Pendlay","Remo unilateral con mancuerna","Remo en máquina","Remo en máquina unilateral","Remo en polea baja","Hiperextensiones lumbares","Remo neutro abierto en polea baja","Jalón prono","Remo T","Remo en polea baja unilateral","Remo alto en polea","Pullover en polea","Pullover con mancuerna","Remo con mancuerna en banco inclinado","Remo invertido","Dominadas asistidas","Jalón supino","Remo Meadows","Rack pull"],
  hombros:["Press militar con barra","Press Arnold","Press de hombros con mancuernas","Press de hombros en Smith","Vuelos laterales con mancuernas","Vuelos laterales en polea","Vuelos laterales en máquina","Vuelos posteriores","Posterior en máquina","Posterior en polea","Elevaciones frontales","Jalón a la cara","Encogimientos de hombros","Vuelos laterales sentado","Elevaciones laterales","Vuelo lateral en polea (énfasis estiramiento)","Remo al mentón","Press landmine","Elevación Y en banco inclinado","Press militar sentado","Rotación externa en polea"],
  biceps:["Curl con barra","Curl con barra Z","Curl con mancuernas","Curl alternado","Curl martillo","Curl predicador","Curl en banco inclinado","Curl en polea","Curl en polea detrás del cuerpo","Curl concentrado","Curl araña","Curl bíceps en polea baja frontal","Curl Bayesian","Curl predicador en polea","Curl martillo en polea","Curl en máquina","Curl 21","Curl con barra supino en polea"],
  triceps:["Press francés con barra","Press francés con mancuernas","Extensión en polea","Extensión con soga","Patada de tríceps","Press cerrado","Fondos entre bancos","Extensión sobre la cabeza","Katana en polea","Fondos en paralelas","Extensión de tríceps unilateral en polea","Fondos en máquina","Extensión de tríceps en máquina","Press JM"],
  cuadriceps:["Sentadilla libre","Sentadilla frontal","Sentadilla en Smith","Sentadilla hack","Prensa 45","Prensa horizontal","Extensión de cuádriceps","Extensión de cuádriceps a una pierna","Zancadas","Sentadilla búlgara","Sentadilla con mancuerna al pecho","Subida al cajón","Sentadilla sissy","Cuadricera","Sentadilla goblet","Sentadilla pendular","Sentadilla con cinturón","Zancadas caminando","Zancada inversa","Sentadilla sumo"],
  isquios:["Curl femoral acostado","Curl femoral sentado","Curl femoral de pie","Peso muerto rumano","Peso muerto rumano con mancuernas","Peso muerto piernas rígidas","Peso muerto convencional","Buenos días","Curl nórdico","Camilla de isquios","Peso muerto rumano a una pierna","Curl femoral con fitball"],
  gluteos:["Empuje de cadera","Empuje de cadera en máquina","Puente de glúteo","Patada de glúteo en polea","Patada de glúteo en máquina","Abductores","Abducción en polea","Peso muerto sumo","Empuje de cadera a una pierna","Patada de glúteo en cuadrupedia","Caminata lateral con banda","Hiperextensión para glúteo","Step-up para glúteo"],
  // Aductores: cara interna del muslo (no son glúteo). Los abductores sí van en glúteos (glúteo medio).
  aductores:["Aductores","Aductores en máquina"],
  gemelos:["Gemelos de pie","Gemelos sentado","Gemelos en prensa","Gemelos en Smith","Gemelos burro","Gemelos a una pierna","Gemelos en máquina","Elevación de tibial"],
  abs:["Encogimiento abdominal","Encogimiento declinado","Elevación de piernas","Elevación de piernas colgado","Plancha","Rueda abdominal","Encogimiento en polea","Giro ruso","Escaladores","Oblicuos","Plancha lateral","Encogimiento invertido","Bicicleta abdominal","Puntas a la barra","Plancha invertida","Bicho muerto","Leñador en polea","Encogimiento en máquina","Bandera","Abdominales en V","Crunch en banco","Pallof press","Elevación de rodillas en paralelas","Plancha con toque de hombros"],
  antebrazo:["Curl martillo","Curl de muñeca","Curl de muñeca invertido","Curl invertido con barra","Caminata del granjero","Curl de antebrazo en polea","Curl de muñeca con mancuerna","Curl Zottman","Enrollador de muñeca","Colgarse de la barra","Pinza con disco"],
  cuello:["Flexión de cuello con disco","Extensión de cuello con disco","Flexión lateral de cuello","Flexión de cuello con arnés","Puente de cuello","Rotaciones de cuello"]
};

export const DEFAULT = {
  days: [
    { id:"d1", name:"Torso", subtitle:"Lunes · Hombros · Espalda · Pecho · Brazos",
      note:"ENTRADA EN CALOR — A1 Pullover unilateral con banda: 2×10 c/lado · A2 Remo sentado con bandas: 2×15",
      exercises:[
      mkExT("Vuelos laterales sentado","hombros",["8-14","8-14","14-18"],"Mano apenas por delante del cuerpo. Excéntrica controlada. Codos extendidos.",{o:"B1",rir:"2-0",rest:"2'-3'",goal:"Progreso en reps"}),
      mkExT("Jalón unilateral en estocada","espalda",["12-16","12-16","12-16"],"En estocada o banco regulable. Apenas inclinado hacia el lado que trabaja. Pensar en clavar la mano al suelo y llevar el codo a la cadera.",{o:"C1",rir:"2-0",rest:"2'-3'",goal:"Progreso en reps"}),
      mkExT("Remo neutro abierto en polea baja","espalda",["8-12","8-12"],"Tronco a 90°. Solo se mueven escápulas y brazos. Llevar la barra a la boca del estómago. Codos bastante separados.",{o:"D1",rir:"2-0",rest:"2'-4'",goal:"Progreso en reps"}),
      mkExT("Press inclinado con mancuernas","pecho",["7-10","7-10","9-12"],"Banco a 30°, buena retracción, recorrido completo. Excéntrica 3\".",{o:"E1",rir:"2-0",rest:"1:30-2:30",goal:"Progreso en reps, pasarse del rango"}),
      mkExT("Peck deck","pecho",["9-12","9-12"],"Pausa 1/2\" en contracción. Volver lentamente todo lo que puedas. Máximo recorrido. Codos apenas flexionados.",{o:"F1",rir:"2-0",rest:"2'-3'",goal:"Progreso en reps"}),
      mkExT("Curl bíceps en polea baja frontal","biceps",["7-11","7-11","11-15"],"Ubicarse alejado de la polea, brazos hacia adelante. Full ROM, excéntrica controlada.",{o:"G1",rir:"1-0",rest:"1:30-2:30",goal:"Progreso en reps"}),
      mkExT("Extensión de tríceps parado en polea","triceps",["8-12","8-12"],"Máximo rango de recorrido, excéntrica 2\" y mini pausa abajo.",{o:"H1",rir:"1-0",rest:"1:30-2:30",goal:"Progreso en reps"}) ]},

    { id:"d2", name:"Piernas", subtitle:"Martes · Isquios · Cuádriceps · Gemelos · Abdominales",
      note:"ENTRADA EN CALOR — A1 Movilidad de cadera en estocada lateral: 2×8 c/lado · A2 Sentadilla de copa isométrica: 2×20 seg",
      exercises:[
      mkExT("Camilla de isquios","isquios",["8-12","8-12","8-12"],"Pausa en contracción + excéntrica muy controlada y rango completo.",{o:"B1",rir:"2-0",rest:"2'-3'",goal:"Progreso en reps"}),
      mkExT("Aductores en máquina","aductores",["10-16","10-16"],"Excéntrica controlada y pausa 1/2\" en contracción.",{o:"C1",rir:"2-0",rest:"2'-3'",goal:"Progreso en reps"}),
      mkExT("Sentadilla en Smith","cuadriceps",["6-9","6-9"],"Excéntrica controlada 3\". Pies en la parte baja de la máquina. Ancho de hombros, puntas rotadas hacia afuera. Abrir las rodillas al bajar.",{o:"D1",rir:"2-0",rest:"3'-5'",goal:"Progreso en reps"}),
      mkExT("Prensa 45°","cuadriceps",["7-10","7-10"],"Excéntrica 2\". Set up de pies igual a la hack.",{o:"E1",rir:"2-0",rest:"3'-5'",goal:"Progreso en reps"}),
      mkExT("Cuadricera","cuadriceps",["11-15","11-15"],"Pausa arriba, máximo control en la excéntrica, terminar con parciales.",{o:"F1",rir:"2-0",rest:"2'-3'",goal:"Aumentar cargas"}),
      mkExT("Gemelos en máquina","gemelos",["10-15","10-15"],"Terminar con parciales hasta no mover el pie. Pausa 1/2\" arriba y abajo.",{o:"G1",rir:"1-0",rest:"2'-3'",goal:"Progreso en reps"}),
      mkExT("Crunch en banco","abs",["10-15","10-15"],"Pausa en contracción + excéntrica muy controlada y rango completo.",{o:"H1",rir:"1-0",rest:"2'-3'",goal:"Progreso en reps"}) ]},

    { id:"d3", name:"Pecho/Espalda/Hombro", subtitle:"Jueves · Hombros · Pecho · Espalda",
      note:"ENTRADA EN CALOR — A1 Pullover unilateral con banda: 2×10 c/lado · A2 Band pull apart: 2×12",
      exercises:[
      mkExT("Elevaciones laterales","hombros",["9-13","13-16","13-16"],"Mano apenas por delante del cuerpo. Excéntrica controlada. Codos extendidos.",{o:"B1",rir:"2-0",rest:"2'-3'",goal:"1ra con 12 kg, 2da y 3ra con 10 kg"}),
      mkExT("Press plano en Smith","pecho",["5-8","5-8","8-12"],"Mantener buen leg drive y activación escapular. Excéntrica controlada, sin rebotar.",{o:"C1",rir:"2-0",rest:"3'-5'",goal:"Progreso en reps, pasarse del rango"}),
      mkExT("Jalón prono","espalda",["6-9","6-9","9-14"],"Tronco apenas inclinado, sin balanceos. Agarre una mano por fuera del ancho de hombros. Excéntrica 2\".",{o:"D1",rir:"2-0",rest:"2'-3'",goal:"Progreso en reps"}),
      mkExT("Vuelo lateral en polea (énfasis estiramiento)","hombros",["9-14","15-20"],"Usar tobillera. Polea a la altura de la rodilla. Frenar antes del hombro, volver al máximo rango muy controlado.",{o:"E1",rir:"2-0",rest:"1:30-2:30",goal:"1ra con 10 kg, 2da con 5 kg a 20 reps"}),
      mkExT("Remo T","espalda",["6-8","6-8","10-12"],"Protraer y retraer las escápulas. Mantener 1/2\" la contracción. Toma prona.",{o:"F1",rir:"2-0",rest:"2'-4'",goal:"1ra subir carga, el resto progreso en reps"}),
      mkExT("Cruce de poleas descendente","pecho",["9-12","9-12"],"Codos extendidos, pequeña pausa en contracción, excéntrica controlada.",{o:"G1",rir:"2-1",rest:"3'-4'",goal:"Progreso en reps"}),
      mkExT("Remo en polea baja unilateral","espalda",["8-12","8-12"],"Inclinate hacia el lado que trabajás, llevá el codo hacia la cadera, excéntrica de 2 segundos.",{o:"H1",rir:"2-0",rest:"2'-4'",goal:"Progreso en reps"}) ]},

    { id:"d4", name:"Pierna/Brazo", subtitle:"Viernes · Isquios · Cuádriceps · Bíceps · Tríceps",
      note:"ENTRADA EN CALOR — A1 Movilidad de cadera en estocada lateral: 2×8 c/lado · A2 Sentadilla de copa isométrica: 2×20 seg",
      exercises:[
      mkExT("Peso muerto rumano","isquios",["6-9","6-9"],"Excéntrica 2\". Rodilla casi extendida. Cadera bien hacia atrás. Barra pegada a la tibia.",{o:"B1",rir:"2-0",rest:"3'-5'",goal:"Mejorar los 80 kg"}),
      mkExT("Prensa 45°","cuadriceps",["7-10","7-10","10-13"],"Excéntrica 2\". Set up de pies igual a la hack.",{o:"C1",rir:"2-0",rest:"3'-5'",goal:"Progreso en reps"}),
      mkExT("Cuadricera","cuadriceps",["11-15","11-15"],"Pausa arriba, máximo control en la excéntrica, terminar con parciales.",{o:"D1",rir:"2-0",rest:"2'-3'",goal:"Aumentar cargas"}),
      mkExT("Press francés con mancuernas","triceps",["7-11","7-11"],"Máximo rango posible, pausa 1/2\" con la barra en la frente.",{o:"F1",rir:"2-0",rest:"2'-3'",goal:"Progreso en reps"}),
      mkExT("Curl predicador","biceps",["7-10","7-10","11-15"],"Banco casi a 90° (un poco menos), estirar por completo y excéntrica de 2\".",{o:"G1",rir:"2-0",rest:"3'",goal:"Progreso en reps"}),
      mkExT("Extensión de tríceps parado en polea","triceps",["8-10","8-10","9-12"],"Tronco apenas inclinado, sin balanceos. Excéntrica 2\".",{o:"H1",rir:"2-1",rest:"2'-4'",goal:"Progreso en reps"}),
      mkExT("Curl Bayesian","biceps",["9-14","9-14"],"Máximo rango de recorrido, excéntrica 2\" y mini pausa abajo.",{o:"I1",rir:"1-0",rest:"1:30-2:30",goal:"Aumentar cargas"}) ]}
  ],
  habits: []
};

export const PPL_DAYS = [
  { id:"ppl1", name:"Tirón (Pull)", subtitle:"Lunes · Espalda · Bíceps", exercises:[
    mkEx("Remo en barra T",2,"espalda"),
    mkEx("Remo en polea baja unilateral",2,"espalda"),
    mkEx("Curl en banco inclinado",2,"biceps"),
    mkEx("Jalón al pecho",2,"espalda"),
    mkEx("Curl predicador en polea",2,"biceps"),
    mkEx("Vuelos posteriores",2,"hombros"),
    mkEx("Curl martillo en polea",2,"biceps"),
    mkEx("Encogimiento abdominal",2,"abs")
  ]},
  { id:"ppl2", name:"Empuje (Push)", subtitle:"Martes · Hombros · Pecho · Tríceps", exercises:[
    mkEx("Vuelos laterales sentado",3,"hombros"),
    mkEx("Press inclinado en Smith",3,"pecho"),
    mkEx("Fondos en paralelas",2,"pecho"),
    mkEx("Peck deck",2,"pecho"),
    mkEx("Vuelos laterales en polea",3,"hombros"),
    mkEx("Press francés con barra",2,"triceps"),
    mkEx("Katana en polea",2,"triceps")
  ]},
  { id:"ppl3", name:"Piernas (Legs)", subtitle:"Miércoles · Cuádriceps · Isquios · Glúteos", exercises:[
    mkEx("Gemelos de pie",3,"gemelos"),
    mkEx("Hiperextensiones lumbares",2,"espalda"),
    mkEx("Curl femoral acostado",3,"isquios"),
    mkEx("Sentadilla libre",2,"cuadriceps"),
    mkEx("Extensión de cuádriceps",2,"cuadriceps"),
    mkEx("Aductores en máquina",2,"aductores"),
    mkEx("Encogimiento abdominal",2,"abs")
  ]},
  { id:"ppl4", name:"Descanso Activo", subtitle:"Jueves · Cardio", note:"Descanso activo: 30 minutos de cardio intenso.", exercises:[] },
  { id:"ppl5", name:"Torso (Upper)", subtitle:"Viernes · Hombros · Pecho · Espalda · Brazos", exercises:[
    mkEx("Vuelos laterales en polea",3,"hombros"),
    mkEx("Posterior en polea",2,"hombros"),
    mkEx("Press inclinado con mancuernas",2,"pecho"),
    mkEx("Jalón al pecho",2,"espalda"),
    mkEx("Peck deck",2,"pecho"),
    mkEx("Remo alto en polea",2,"espalda"),
    mkEx("Curl con mancuernas",2,"biceps"),
    mkEx("Extensión de tríceps unilateral en polea",3,"triceps")
  ]},
  { id:"ppl6", name:"Piernas (Lower)", subtitle:"Sábado · Cuádriceps · Isquios · Glúteos", exercises:[
    mkEx("Gemelos de pie",3,"gemelos"),
    mkEx("Peso muerto rumano",2,"isquios"),
    mkEx("Prensa 45",3,"cuadriceps"),
    mkEx("Extensión de cuádriceps",2,"cuadriceps"),
    mkEx("Aductores en máquina",2,"aductores"),
    mkEx("Bandera",2,"abs")
  ]}
];

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
