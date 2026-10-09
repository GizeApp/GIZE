// Las rutinas por disciplina: cada ejercicio existe en la base, hay de 3 a 5 días de cada
// disciplina y los días de entreno coinciden con el nombre.
import { EX_DB } from "../app/core/data.js";
import { RUTINAS_DISCIPLINA, rutinasDeDisciplinas } from "../app/core/rutinas-disciplina.js";

export default async ({ t }) => {
  const diasDeEntreno = r => r.days.filter(d => d.exercises.length).length;
  const todos = new Set(Object.values(EX_DB).flat());
  for (const id of ["crossfit", "powerlifting", "weightlifting", "running", "hibrido"]) {
    const rs = rutinasDeDisciplinas([id]);
    t.eq(rs.map(r => diasDeEntreno(r)), [3, 4, 5], id + ": 3, 4 y 5 días");
    for (const r of rs) for (const dia of r.days) {
      t.ok(dia.exercises.length, r.nombre + ": día sin ejercicios");
      t.ok(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado) · /.test(dia.subtitle), r.nombre + ": subtítulo con el día");
      for (const e of dia.exercises) {
        t.ok(todos.has(e.name), "no existe en la base: " + e.name);
        t.ok(e.sets.length, r.nombre + ": " + e.name + " sin series");
      }
    }
  }
  t.eq(rutinasDeDisciplinas(["fuerza"]).length, 0, "fuerza no tiene rutinas de disciplina");
  t.eq(RUTINAS_DISCIPLINA.length, 15, "15 rutinas en total");
};
