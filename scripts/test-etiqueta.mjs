// Pruebas del intérprete de la tabla nutricional (app/core/etiqueta.js) con textos como los
// que devuelve el lector: node scripts/test-etiqueta.mjs
import { parseLabelText } from "../app/core/etiqueta.js";

const casos = [
  ["Dos columnas (cada 100 g y por porción)", `INFORMACION NUTRICIONAL
Porción 200 ml (1 vaso)
Cant. por | Cant. por | % VD
100 ml | porción | (*)
Valor energético 40 kcal/ | 80 kcal/ | 4
170kJ| 339kJ
Carbohidratos 48g 96g| 3
Proteínas 3,09 60g| 8
Grasas totales 1,09 20g| 4
Grasas saturadas 0,69 13g| 6`, { kcal: 40, p: 3, c: 4.8, f: 1, portion: 200, unit: "ml", ok: true }],
  ["Una columna (por porción)", `INFORMACION NUTRICIONAL
Porción 10g (1 cuchara de sopa)
Cantidad por porción % VD*
Valor Energético — 74 kcal / 305 kJ 4
Carbohidratos 0g 0
Proteínas 0g 0
Grasas Totales 8,29 15
Grasas Saturadas 529 24`, { kcal: 740, p: 0, c: 0, f: 82, portion: 10, unit: "g", ok: true }],
  ["En renglón corrido", `INFORMACIÓN NUTRICIONAL: Porción: 25,2 y (9 caramelos) Valor energético 98 kcal
= 415 kJ (5% VD*; Carbohidratos 24 q (8% VD), de los cuales: Azúcares totales 24 g;
Azúcares añadidos 24 9; Proteínas 0 g (0% VD); Grasas totales 0 q (0% VD), de las cuales:`, { kcal: 389, p: 0, c: 95.2, f: 0, portion: 25, ok: true }],
  ["La g leída como 9 y la coma perdida", `Porción 20 g (1 cuchara de sopa)
Cantidad por porción | % VD (+)
Valor energético 63 kcal/ 264 kJ | 3
Carbohidratos de los cuales 11g 4
Azúcares totales 10g
Proteínas 159 7
Grasas totales 1,49 3`, { kcal: 315, p: 7.5, c: 55, f: 7, portion: 20 }],
  ["No aporta cantidades significativas", `Porción 200 ml (1vaso)
No aporta cantidades significativas de valor energético, carbohidratos, azúcares totales,
azúcares añadidos, proteínas, grasas totales, grasas saturadas, grasas trans y fibra alimentaria.`, { kcal: 0, p: 0, c: 0, f: 0, portion: 200, unit: "ml" }],
  ["Sin porción: devuelve lo impreso por porción", `Valor energético 136 kcal =571 kJ 7
Carbohidratos, de los cuales: 12g 4
Proteínas 1,7g 2
Grasas totales 9,0g 16`, { kcal: null, perPortion: { kcal: 136, p: 1.7, c: 12, f: 9 } }],
  // Casos de la revisión (la lectura no tiene que salir "ok" con valores equivocados).
  ["Peso neto 100 g arriba de una tabla por porción", `Chocolate con leche
Peso neto 100 g
INFORMACION NUTRICIONAL
Porción 25 g (4 cuadraditos)
Cantidad por porción | % VD
Valor energético 134 kcal = 563 kJ 7
Carbohidratos 14 g 5
Proteínas 1,9 g 3
Grasas totales 7,8 g 14`, { kcal: 536, p: 7.6, c: 56, f: 31.2, portion: 25 }],
  ["kJ que termina en 1009", `Porción 60 g (1 unidad)
Cantidad por porción | % VD
Valor energético 241 kcal = 1009 kJ 12
Carbohidratos 30 g 10
Proteínas 6 g 8
Grasas totales 10,8 g 20`, { kcal: 402, p: 10, c: 50, f: 18, portion: 60 }],
  ["Columnas al revés (porción y después cada 100)", `Porción 30 g (1 unidad)
Cantidad por porción | Cantidad por 100 g | % VD
Valor energético 120 kcal 400 kcal 6
Carbohidratos 20 g 66,7 g 7
Proteínas 3 g 10 g 4
Grasas totales 3 g 10 g 5`, { kcal: 400, p: 10, c: 66.7, f: 10, portion: 30, ok: true }],
  ["Porción con la g leída como 9", `Porción 309 (2 galletitas)
Cantidad por porción | % VD
Valor energético 134 kcal = 563 kJ 7
Carbohidratos 14 g 5
Proteínas 1,9 g 3
Grasas totales 7,8 g 14`, { kcal: 447, p: 6.3, c: 46.7, f: 26, portion: 30, ok: false }],
  ["Porción con la unidad entre paréntesis", `Porción: 2 galletitas (30 g)
Cantidad por porción | % VD
Valor energético 134 kcal = 563 kJ 7
Carbohidratos 14 g 5
Proteínas 1,9 g 3
Grasas totales 7,8 g 14`, { kcal: 447, p: 6.3, c: 46.7, f: 26, portion: 30, ok: true }],
  ["Dos columnas con una celda cada 100 perdida: no se da por buena", `Porción 30 g (1 unidad)
Cantidad por 100 g | Cantidad por porción | % VD
Valor energético 447 kcal 134 kcal 7
Carbohidratos 46,7 g 14 g 5
Proteínas 1,9 g 3
Grasas totales 26 g 7,8 g 14`, { ok: false }],
  ["kcal leído como keal", `Porción 30 g
Cantidad por 100 g | Cantidad por porción | % VD
Valor energético 447 keal 134 keal 7
Carbohidratos 46,7 g 14 g 5
Proteínas 6,3 g 1,9 g 3
Grasas totales 26 g 7,8 g 14`, { kcal: 447, p: 6.3, c: 46.7, f: 26, ok: true }],
  ["Letras O en lugar de ceros", `Porción 2OO ml (1 vaso)
Cantidad por 1OO ml | Cantidad por porción | % VD
Valor energético 40 kcal 80 kcal 4
Carbohidratos 4,8 g 9,6 g 3
Proteínas 3,0 g 6,0 g 8
Grasas totales 1,0 g 2,0 g 4`, { kcal: 40, p: 3, c: 4.8, f: 1, portion: 200, unit: "ml", ok: true }],
  ["Decimal sin la g no se corta", `Porción 30 g
Cantidad por porción | % VD
Valor energético 131 kcal = 548 kJ 7
Carbohidratos 7,2 g 2
Proteínas 1,9 3
Grasas totales 10,4 g 19`, { p: 6.3 }],
  ["Coma perdida con cero adelante", `Porción 50 g
Cantidad por porción | % VD
Valor energético 88 kcal 4
Carbohidratos 21,8 g 7
Proteínas 02 g 0
Grasas totales 0 g 0`, { p: 0.4, c: 43.6 }],
  ["Sin porción, con la g leída como 9", `Cantidad por porción | % VD (+)
Valor energético 63 kcal/ 264 kJ | 3
Carbohidratos de los cuales 119 4
Proteínas 159 7
Grasas totales 1,49 3`, { perPortion: { kcal: 63, p: 1.5, c: 11, f: 1.4 } }],
  ["Sin porción y con No aporta", `Cantidad por porción | % VD
Valor energético 88 kcal = 370 kJ 4
Carbohidratos 22 g 7
No aporta cantidades significativas de proteínas, grasas totales, grasas saturadas.`, { found: 0, perPortion: { kcal: 88, p: 0, c: 22, f: 0 } }],
  ["Bebida con 100 ml en el encabezado y sin porción", `Cant. por | Cant. por | % VD
100 ml | porción | (*)
Valor energético 40 kcal/ | 80 kcal/ | 4
Carbohidratos 48g 96g| 3
Proteínas 3,09 60g| 8
Grasas totales 1,09 20g| 4`, { kcal: 40, p: 3, c: 4.8, f: 1, unit: "ml" }],
  ["Foto sin tabla", `LECHE ZERO LACTOSA 1L\nLa Serenísima`, { kcal: null, p: null, c: null, f: null, ok: false }],
];

let mal = 0;
for (const [nombre, texto, esperado] of casos){
  const r = parseLabelText(texto);
  const diffs = Object.entries(esperado).filter(([k, v]) => k === "perPortion"
    ? !r.perPortion || Object.entries(v).some(([kk, vv]) => Math.abs((r.perPortion[kk] ?? NaN) - vv) > 0.11)
    : typeof v === "number" ? !(Math.abs((r[k] ?? NaN) - v) <= Math.max(k === "kcal" ? 3 : 0.15, v * 0.02)) : r[k] !== v);
  if (diffs.length){ mal++; console.log("✗", nombre, "→", JSON.stringify(r), "esperado", JSON.stringify(esperado)); }
  else console.log("✓", nombre);
}
if (mal){ console.log(mal, "caso(s) con error"); process.exit(1); }
