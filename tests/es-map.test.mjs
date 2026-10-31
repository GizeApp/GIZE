// ES_MAP (app/core/data.js) renombra los nombres de ejercicios que vienen de otras apps al nombre
// de la base de GIZE. Cada destino tiene que existir en EX_DB: si no, la rutina queda con un
// ejercicio que la app no conoce (sin video, sin grupo, sin volumen).
import { EX_DB, ES_MAP } from "../app/core/data.js";

export default async ({ t }) => {
  const todos = new Set(Object.values(EX_DB).flat());
  for (const [origen, destino] of Object.entries(ES_MAP)) {
    t.ok(todos.has(destino), "«" + origen + "» apunta a «" + destino + "», que no está en EX_DB");
  }
};
