import type { Context, ContextType } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";

export type ListContextsInput = {
  workspaceId: string;
  includeArchived?: boolean;
};

export async function getContextById(
  repository: ContextRepository,
  id: string,
): Promise<Context | null> {
  return repository.getById(id);
}

export async function listContexts(
  repository: ContextRepository,
  input: ListContextsInput,
): Promise<Context[]> {
  return repository.list(input);
}

export async function listContextsByType(
  repository: ContextRepository,
  input: ListContextsInput & { type: ContextType },
): Promise<Context[]> {
  return repository.list(input);
}
