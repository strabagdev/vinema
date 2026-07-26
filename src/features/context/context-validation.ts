import {
  type Context,
  type ContextType,
  isContextType,
  normalizeContextNameForComparison,
} from "@/domain/context/context";

const MAX_CONTEXT_NAME_LENGTH = 120;

export type EditableContextInput = {
  id?: string;
  workspaceId: string;
  type: ContextType;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function validateEditableContext(input: EditableContextInput) {
  const id = input.id?.trim();
  const workspaceId = input.workspaceId.trim();
  const name = input.name.trim();
  const description = input.description?.trim() || null;

  if (input.id !== undefined && !id) {
    throw new Error("El contexto necesita un id.");
  }

  if (!workspaceId) {
    throw new Error("El contexto necesita un workspace.");
  }

  if (!isContextType(input.type)) {
    throw new Error("El tipo de contexto no es valido.");
  }

  if (!name) {
    throw new Error("El contexto necesita un nombre.");
  }

  if (name.length > MAX_CONTEXT_NAME_LENGTH) {
    throw new Error("El nombre del contexto es demasiado largo.");
  }

  if (
    input.createdAt &&
    input.updatedAt &&
    Date.parse(input.updatedAt) < Date.parse(input.createdAt)
  ) {
    throw new Error("La fecha de actualizacion no puede ser anterior a la creacion.");
  }

  return {
    id,
    workspaceId,
    type: input.type,
    name,
    description,
  };
}

export function assertContextNameIsAvailable(
  contexts: Context[],
  candidate: Pick<Context, "id" | "type" | "name">,
) {
  const normalizedCandidateName = normalizeContextNameForComparison(candidate.name);
  const duplicate = contexts.find(
    (context) =>
      context.id !== candidate.id &&
      context.type === candidate.type &&
      normalizeContextNameForComparison(context.name) === normalizedCandidateName,
  );

  if (duplicate) {
    throw new Error("Ya existe un contexto de este tipo con ese nombre.");
  }
}
