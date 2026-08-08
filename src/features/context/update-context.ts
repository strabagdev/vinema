import type { Context } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";
import {
  assertContextNameIsAvailable,
  validateEditableContext,
} from "@/features/context/context-validation";

export type UpdateContextInput = {
  id: string;
  name: string;
  description?: string | null;
};

export async function updateContext(
  repository: ContextRepository,
  input: UpdateContextInput,
): Promise<Context> {
  const existingContext = await repository.getById(input.id);

  if (!existingContext) {
    throw new Error("No se encontro el contexto.");
  }

  const updatedAt = new Date().toISOString();
  const validated = validateEditableContext({
    id: existingContext.id,
    workspaceId: existingContext.workspaceId,
    type: existingContext.type,
    name: input.name,
    description: input.description,
    createdAt: existingContext.createdAt,
    updatedAt,
  });
  const existingContexts = await repository.list({
    workspaceId: existingContext.workspaceId,
    type: existingContext.type,
  });

  assertContextNameIsAvailable(existingContexts, {
    id: existingContext.id,
    type: existingContext.type,
    name: validated.name,
  });

  return repository.save({
    ...existingContext,
    name: validated.name,
    description: validated.description,
    version: existingContext.version + 1,
    updatedAt,
  });
}
