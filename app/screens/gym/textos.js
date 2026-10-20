// Textos del panel del gimnasio que tienen versión: el contrato de encargo que acepta el dueño al
// crear el gimnasio (y la hoja del socio, que usa la parte 3). Las versiones salen de un solo lugar,
// acá, y tienen que ser las mismas que gym_versiones() en supabase/gimnasios-socios.sql: el servidor
// rechaza otra («Actualizá la página…»). Hasta la revisión legal son borradores.
export const VERSIONES = { hoja: "2026-10-borrador", compartir: "2026-10-borrador", encargo: "2026-10-borrador" };

// Resumen del contrato de encargo (Ley 25.326, art. 25) que se muestra al crear el gimnasio.
export const CONTRATO_RESUMEN = [
  "El gimnasio es el responsable de los datos de sus socios. GIZE los guarda y los procesa por encargo del gimnasio, solo para prestar el servicio.",
  "GIZE no usa los datos de tus socios para otra cosa, no los vende y no se los pasa a nadie, salvo a los proveedores que hacen falta para que la app funcione.",
  "Le informás a tus socios que sus datos van a estar en GIZE y les pedís lo que haga falta (la hoja que aceptan al sumarse lo explica).",
  "Si el gimnasio cierra o deja GIZE, podés exportar todo en CSV. Los datos se borran según la política de privacidad.",
  "Cada persona del equipo usa su propia cuenta. Cuidá quién tiene acceso al panel.",
];

// Qué ve cada rol (Configuración → Privacidad), en lenguaje simple (SPEC §1.2).
export const PRIVACIDAD = [
  ["Dueño y administración", "Los datos de socio (nombre, contacto, apto médico), los ingresos y los socios que tiene cada profe. Los entrenos, comidas, peso, registro diario y check-ins solo de quien los compartió con la administración, sin los pasos ni los recorridos."],
  ["Profes", "Lo de sus socios asignados, como cualquier coach de GIZE: rutina, entrenos, comidas, peso, registro diario, check-ins y el chat con cada uno."],
  ["Recepción", "Nombre, foto del gimnasio y si el socio está activo, para registrar el ingreso."],
  ["Nadie del gimnasio", "Lee el chat de un profe con su socio. No hay ninguna opción para hacerlo."],
];

// Lo que puede hacer cada rol, para la vista previa al invitar.
export const ROLES = {
  profe: { nombre: "Profe", corto: "profe", puede: "Va a ver solo a los socios que le asignes: les arma la rutina, ve sus entrenos y les escribe por el chat. Entra sin cargo con su cuenta de coach." },
  admin: { nombre: "Administración", corto: "administración", puede: "Va a manejar el día a día igual que vos: socios, solicitudes, profes y configuración. Ve el estado del plan de GIZE pero no lo cambia, y no puede cerrar el gimnasio." },
  recepcion: { nombre: "Recepción", corto: "recepción", puede: "Va a buscar socios por nombre o DNI, ver su foto y si están activos, y registrar el ingreso. No ve entrenos, comidas, notas ni chats." },
};
export const rolNombre = r => r === "owner" ? "Dueño" : (ROLES[r] ? ROLES[r].nombre : r);
