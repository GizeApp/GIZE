// Las rutinas por disciplina: cada ejercicio existe en la base, hay de 3 a 5 días de cada
// disciplina y los días de entreno coinciden con el nombre.
import assert from "node:assert/strict";
import { EX_DB } from "../app/core/data.js";
import { RUTINAS_DISCIPLINA, rutinasDeDisciplinas } from "../app/core/rutinas-disciplina.js";

const diasDeEntreno = r => r.days.filter(d => d.exercises.length).length;

export default async function ({ t }){
  const todos = new Set(Object.values(EX_DB).flat());
  for (const id of ["crossfit","powerlifting","weightlifting","running","hibrido"]) {
    const rs = rutinasDeDisciplinas([id]);
    assert.deepEqual(rs.map(r => diasDeEntreno(r)), [3, 4, 5], id + ": 3, 4 y 5 días");
    for (const r of rs) for (const dia of r.days) {
      assert.ok(dia.exercises.length, r.nombre + ": día sin ejercicios");
      assert.ok(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado) · /.test(dia.subtitle), "subtítulo con el día");
      for (const e of dia.exercises) { assert.ok(todos.has(e.name), "no existe en la base: " + e.name); assert.ok(e.sets.length); }
    }
  }
  assert.equal(rutinasDeDisciplinas(["fuerza"]).length, 0);
  assert.equal(RUTINAS_DISCIPLINA.length, 15);
  t.ok(true, "rutinas-disciplina");
}
