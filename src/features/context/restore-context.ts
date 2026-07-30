import type { Context } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";

export async function restoreContext(
  repository: ContextRepository,
  id: string,
): Promise<Context> {
  const existingContext = await repository.getById(id);

  if (!existingContext) {
    throw new Error("No se encontro el contexto.");
  }

  if (!existingContext.archivedAt) {
    return existingContext;
  }

  return repository.restore({
    ...existingContext,
    archivedAt: null,
    version: existingContext.version + 1,
    updatedAt: new Date().toISOString(),
  });
}
