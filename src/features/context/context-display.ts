import type { ContextType } from "@/domain/context/context";

export const CONTEXT_TYPE_LABEL = {
  AREA: "Area",
  PROJECT: "Proyecto",
  PERSON: "Persona",
} satisfies Record<ContextType, string>;

export const CONTEXT_TYPE_PLURAL_LABEL = {
  AREA: "Areas",
  PROJECT: "Proyectos",
  PERSON: "Personas",
} satisfies Record<ContextType, string>;

export const CONTEXT_TYPE_ROUTE_SEGMENT = {
  AREA: "areas",
  PROJECT: "projects",
  PERSON: "people",
} satisfies Record<ContextType, string>;

export function getContextDescriptionPlaceholder(type: ContextType) {
  if (type === "AREA") {
    return "Responsabilidades permanentes, como Trabajo, Salud o Finanzas.";
  }

  if (type === "PROJECT") {
    return "Iniciativas con un proposito concreto, como Vinema o MITAT.";
  }

  return "Notas, reuniones y referencias relacionadas con alguien.";
}

export function getEmptyContextMessage(type: ContextType) {
  if (type === "AREA") {
    return "Todavia no tienes areas.";
  }

  if (type === "PROJECT") {
    return "Todavia no tienes proyectos.";
  }

  return "Todavia no tienes personas.";
}
