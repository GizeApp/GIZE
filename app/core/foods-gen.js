// Más alimentos genéricos (los que la gente más busca y todavía no estaban). Mismo formato
// que FOOD_SECTIONS en ./foods.js: valores CADA 100 g (o 100 ml), porción sugerida y
// opciones crudo/cocido/ml. Estimaciones de referencia de tablas públicas (USDA FoodData
// Central y SARA 2), redondeadas; sin "src" porque no son dato de laboratorio propio. Las
// preparaciones sin dato en esas tablas (omelettes, quesadilla, tequeños, salsas cremosas,
// za'atar…) se calcularon por receta típica: suma de sus ingredientes cada 100 g.

const C_VAC = 0.72, C_POLLO = 0.73, C_PESC = 0.8;

export const GEN_SECTIONS = [
["Pescados y mariscos", [
  ["Bacalao", 82, 18, 0, 0.7, 150, {crudo:C_PESC}],
  ["Bagre", 95, 16.5, 0, 3, 150, {crudo:C_PESC}],
  ["Boquerones / anchoas frescas", 130, 20, 0, 5, 100, {crudo:C_PESC}],
  ["Bastoncitos de pescado (rebozados, congelados)", 230, 12, 21, 11, 100],
]],
["Carne vacuna", [
  ["Churrasco (bife fino)", 150, 21, 0, 7, 150, {crudo:C_VAC}],
]],
["Cerdo", [
  ["Costeleta de cerdo / chuleta de cerdo", 190, 19.5, 0, 12, 180, {crudo:C_VAC}],
  ["Costillas de cerdo / costillar", 275, 15.5, 0, 23.5, 250, {crudo:C_VAC}],
]],
["Pollo y aves", [
  ["Gallina (con piel)", 255, 17.5, 0, 20, 150, {crudo:C_POLLO}],
  ["Caldo de pollo", 15, 1.5, 1, 0.5, 250, {ml:true}],
]],
["Fiambres y embutidos", [
  ["Jamón de pavo / fiambre de pechuga de pavo", 105, 17, 2, 3, 30],
  ["Jamón serrano", 240, 31, 0, 13, 30],
  ["Jamón ahumado", 145, 18, 1.5, 7.5, 30],
  ["Fuet", 420, 26, 2, 35, 30],
]],
["Frutas", [
  ["Moras / zarzamoras", 43, 1.4, 9.6, 0.5, 100],
  ["Chirimoya", 75, 1.6, 17.7, 0.7, 150],
  ["Pitahaya / fruta del dragón", 60, 1.2, 13, 0.2, 150],
  ["Guayaba", 68, 2.6, 14.3, 1, 100],
  ["Guindas", 50, 1, 12.2, 0.3, 100],
  ["Plátano macho / banana verde (para cocinar)", 122, 1.3, 32, 0.4, 150],
]],
["Verduras", [
  ["Escarola", 17, 1.3, 3.4, 0.2, 80],
  ["Pickles / pepinillos en vinagre", 12, 0.5, 2.3, 0.2, 30],
  ["Jengibre fresco", 80, 1.8, 17.8, 0.8, 5],
]],
["Bebidas", [
  ["Café descafeinado", 1, 0.1, 0, 0, 240, {ml:true}],
  ["Té helado (con azúcar)", 32, 0, 8, 0, 250, {ml:true}],
  ["Té helado sin azúcar", 1, 0, 0.2, 0, 250, {ml:true}],
  ["Jugo de limón", 22, 0.4, 6.9, 0.2, 30, {ml:true}],
  ["Jugo de durazno", 54, 0.3, 14, 0, 240, {ml:true}],
  ["Jugo de uva", 60, 0.4, 14.8, 0.1, 240, {ml:true}],
  ["Jugo de sandía", 30, 0.6, 7.5, 0.2, 240, {ml:true}],
  ["Jugo de mandarina", 43, 0.5, 10, 0.2, 240, {ml:true}],
  ["Jugo de pera", 60, 0.1, 15.8, 0, 240, {ml:true}],
  ["Jugo de melón", 36, 0.8, 8.5, 0.2, 240, {ml:true}],
  ["Jugo de ananá", 53, 0.4, 12.9, 0.1, 240, {ml:true}],
  ["Jugo de mango", 60, 0.2, 15, 0.1, 240, {ml:true}],
  ["Jugo de frutilla", 33, 0.7, 7.7, 0.3, 240, {ml:true}],
]],
["Panificados", [
  ["Croissant (de manteca)", 406, 8.2, 45.8, 21, 60],
  ["Dona / donut glaseada", 410, 5, 51, 20, 60],
  ["Dona rellena de crema pastelera", 340, 6, 39, 18, 85],
  ["Éclair / bomba de crema", 262, 6.4, 24, 16, 60],
]],
["Dulces y azúcares", [
  ["Esencia de vainilla", 288, 0.1, 12.7, 0.1, 5, {ml:true}],
  ["Eritritol (edulcorante)", 0, 0, 0, 0, 5],
]],
["Cereales, harinas y pastas", [
  ["Sémola de trigo", 360, 12.7, 72.8, 1.1, 50],
  ["Fideos chinos / noodles (secos)", 360, 11, 72, 2, 80, {crudo:2.3}],
  ["Fideos instantáneos (tipo ramen, con condimento)", 440, 9, 62, 17, 85],
]],
["Vegetariano y sin TACC", [
  ["Falafel", 333, 13.3, 31.8, 17.8, 100],
  ["Espirulina (en polvo)", 290, 57, 24, 8, 7],
]],
["Comidas y congelados", [
  ["Gyozas / dumplings (de cerdo)", 210, 9, 24, 8.5, 120],
  ["Fajita de pollo (armada, con tortilla)", 190, 12, 18, 7.5, 200],
  ["Sfiha / empanada árabe (1 u. ≈ 80 g)", 250, 10, 30, 10, 80],
]],
// K a la Z
["Verduras", [
  ["Kimchi", 20, 1.1, 3, 0.5, 100],
  ["Lechuga morada", 16, 1.3, 2.3, 0.2, 50],
  ["Lechuga romana / criolla", 17, 1.2, 3.3, 0.3, 50],
  ["Verdolaga", 20, 2, 3.4, 0.4, 50],
  ["Wakame (alga)", 45, 3, 9, 0.6, 30],
  ["Salteado de verduras (con aceite)", 70, 2, 7, 4, 150],
]],
["Frutas", [
  ["Nectarina", 44, 1.1, 10.6, 0.3, 140],
  ["Higo de tuna (fruta del nopal)", 41, 0.7, 9.6, 0.5, 100],
]],
["Frutos secos y semillas", [
  ["Nueces de Brasil (nuez de Brasil)", 659, 14.3, 11.7, 67, 10],
  ["Nueces de macadamia", 718, 7.9, 13.8, 76, 15],
]],
["Pescados y mariscos", [
  ["Kanikama / palitos de cangrejo (surimi)", 95, 7.6, 15, 0.5, 50],
  ["Lubina / róbalo", 97, 18.4, 0, 2, 150, {crudo:C_PESC}],
  ["Ostras", 70, 8, 4, 2.5, 100],
  ["Nigiri de salmón (1 pieza ≈ 40 g)", 165, 7, 25, 3.5, 40],
  ["Onigiri (bola de arroz rellena)", 170, 4, 35, 1.5, 110],
]],
["Carne vacuna", [
  ["Ternera (magra)", 115, 20, 0, 3.5, 150, {crudo:C_VAC}],
  ["Ciervo / venado", 120, 23, 0, 2.4, 150, {crudo:C_VAC}],
]],
["Cerdo", [
  ["Oreja de cerdo (cocida)", 166, 16, 0.6, 10.8, 100],
]],
["Pollo y aves", [
  ["Pollo frito (rebozado, con piel)", 260, 24, 9, 14, 150],
  ["Pollo desmenuzado (cocido)", 165, 31, 0, 3.6, 100],
]],
["Fiambres y embutidos", [
  ["Salchicha de pavo", 220, 12, 4, 17, 50],
]],
["Lácteos", [
  ["Leche semidescremada", 46, 3.3, 4.8, 1.5, 200, {ml:true}],
  ["Leche evaporada", 134, 6.8, 10, 7.6, 30, {ml:true}],
  ["Natilla / crema pastelera", 125, 4, 18, 4, 100],
]],
["Quesos", [
  ["Queso cottage", 98, 11, 3.4, 4.3, 50],
  ["Queso gouda", 356, 25, 2.2, 27.4, 25],
  ["Queso manchego", 390, 26, 0.5, 32, 25],
  ["Queso brie", 334, 20.8, 0.5, 27.7, 25],
  ["Queso suizo / emmental", 380, 27, 1.5, 30, 25],
  ["Queso danbo", 330, 25, 0.5, 26, 25],
]],
["Aceites, aderezos y untables", [
  ["Salsa ranch", 430, 1, 6, 45, 15],
  ["Salsa chipotle (cremosa)", 400, 1, 6, 41, 15],
  ["Vinagre de manzana", 21, 0, 0.9, 0, 15, {ml:true}],
  ["Orégano seco", 265, 9, 69, 4.3, 1],
  ["Za'atar (mezcla de especias con sésamo)", 350, 12, 38, 18, 5],
  ["Levadura seca", 325, 40, 41, 7.6, 7],
]],
["Bebidas", [
  ["Té negro / té verde (sin azúcar)", 1, 0, 0.2, 0, 240, {ml:true}],
  ["Té de manzanilla / tilo (sin azúcar)", 1, 0, 0.2, 0, 240, {ml:true}],
  ["Jugo de lima", 25, 0.4, 8.4, 0.1, 30, {ml:true}],
  ["Jugo de granada", 54, 0.2, 13, 0.3, 240, {ml:true}],
]],
["Comidas y congelados", [
  ["Omelette de champiñones (2 huevos)", 150, 10, 2, 11.5, 180],
  ["Omelette de atún (2 huevos)", 170, 17, 1, 11, 180],
  ["Omelette de espinaca (2 huevos)", 150, 10, 2, 11, 180],
  ["Omelette de claras con espinaca", 60, 10, 2, 1.5, 180],
  ["Quesadilla (de queso, tortilla de trigo)", 300, 13, 28, 15, 120],
  ["Sopa de letras (con caldo)", 45, 1.8, 7, 1, 250],
  ["Tequeños (bastones de masa con queso, fritos)", 330, 10, 30, 19, 25],
  ["Papas fritas en freidora de aire", 160, 3, 27, 4.5, 150],
  ["Mandioca frita", 300, 1.5, 45, 13, 150],
  ["Tortilla de maíz (tipo mexicana)", 218, 5.7, 44.6, 2.9, 30],
]],
["Helados y postres", [
  ["Torta de chocolate", 400, 5, 50, 20, 100],
  ["Trufa de chocolate", 490, 5, 45, 33, 12],
]],
];
