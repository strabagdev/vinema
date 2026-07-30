import type { Context, ContextType } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";
import {
  assertContextNameIsAvailable,
  validateEditableContext,
} from "@/features/context/context-validation";

export type CreateContextInput = {
  workspaceId: string;
  type: ContextType;
  name: string;
  description?: string | null;
};

export async function createContext(
  repository: ContextRepository,
  input: CreateContextInput,
): Promise<Context> {
  const validated = validateEditableContext(input);
  const existingContexts = await repository.list({
    workspaceId: validated.workspaceId,
    type: validated.type,
    includeArchived: true,
  });

  assertContextNameIsAvailable(existingContexts, {
    id: "",
    type: validated.type,
    name: validated.name,
  });

  const now = new Date().toISOString();
  const context: Context = {
    id: crypto.randomUUID(),
    workspaceId: validated.workspaceId,
    type: validated.type,
    name: validated.name,
    description: validated.description,
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };

  return repository.save(context);
}
