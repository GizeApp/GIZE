// ES_MAP (app/core/data.js) renombra los nombres de ejercicios que vienen de otras apps al nombre
// de la base de GIZE. Cada destino tiene que existir en EX_DB: si no, la rutina queda con un
// ejercicio que la app no conoce (sin video, sin grupo, sin volumen).
import { EX_DB, ES_MAP } from "../app/core/data.js";

export default async ({ t }) => {
  const todos = new Set(Object.values(EX_DB).flat());
  for (const [origen, destino] of Object.entries(ES_MAP)) {
    t.ok(todos.has(destino), "«" + origen + "» apunta a «" + destino + "», que no está en EX_DB");
  }
  for (const n of SIN_EQUIVALENTE) t.ok(!(n in ES_MAP), "«" + n + "» no se cambia por otro ejercicio");
};

// Un nombre sin un ejercicio igual en la base queda como está (ejercicio propio): no se cambia por
// otro parecido pero distinto (el hollow hold no es una plancha; los grippers no son la pinza con disco).
export const SIN_EQUIVALENTE = ["Hollow hold", "Grippers de mano"];
