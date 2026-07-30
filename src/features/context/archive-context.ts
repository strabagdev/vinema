import type { Context } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";

export async function archiveContext(
  repository: ContextRepository,
  id: string,
): Promise<Context> {
  const existingContext = await repository.getById(id);

  if (!existingContext) {
    throw new Error("No se encontro el contexto.");
  }

  if (existingContext.archivedAt) {
    return existingContext;
  }

  const now = new Date().toISOString();
  return repository.archive({
    ...existingContext,
    archivedAt: now,
    version: existingContext.version + 1,
    updatedAt: now,
  });
}
