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
  ["Foto sin tabla", `LECHE ZERO LACTOSA 1L\nLa Serenísima`, { kcal: null, p: null, c: null, f: null, ok: false }],
];

let mal = 0;
for (const [nombre, texto, esperado] of casos){
  const r = parseLabelText(texto);
  const diffs = Object.entries(esperado).filter(([k, v]) => k === "perPortion"
    ? !r.perPortion || Object.entries(v).some(([kk, vv]) => Math.abs((r.perPortion[kk] ?? NaN) - vv) > 0.11)
    : typeof v === "number" ? !(Math.abs((r[k] ?? NaN) - v) <= Math.max(1, v * 0.02)) : r[k] !== v);
  if (diffs.length){ mal++; console.log("✗", nombre, "→", JSON.stringify(r), "esperado", JSON.stringify(esperado)); }
  else console.log("✓", nombre);
}
if (mal){ console.log(mal, "caso(s) con error"); process.exit(1); }
