import type { Context } from "@/domain/context/context";
import type {
  ContextRepository,
  ListContextsOptions,
} from "@/domain/context/context-repository";
import { CONTEXTS_STORE, getVinemaDb } from "@/infrastructure/storage/vinema-db";

export class IndexedDbContextRepository implements ContextRepository {
  async getById(id: string): Promise<Context | null> {
    const db = await getVinemaDb();
    return normalizeStoredContext(await db.get(CONTEXTS_STORE, id));
  }

  async list(options: ListContextsOptions): Promise<Context[]> {
    const db = await getVinemaDb();
    const contexts = options.type
      ? await db.getAllFromIndex(CONTEXTS_STORE, "by-workspace-and-type", [
          options.workspaceId,
          options.type,
        ])
      : await db.getAllFromIndex(
          CONTEXTS_STORE,
          "by-workspace",
          options.workspaceId,
        );

    return contexts
      .map(normalizeStoredContext)
      .filter((context): context is Context => context !== null)
      .filter((context) => options.includeArchived || context.archivedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(context: Context): Promise<Context> {
    const db = await getVinemaDb();
    const storedContext = toStoredContext(context);
    await db.put(CONTEXTS_STORE, storedContext);
    return storedContext;
  }

  async archive(context: Context): Promise<Context> {
    return this.save(context);
  }

  async restore(context: Context): Promise<Context> {
    return this.save(context);
  }
}

export function normalizeStoredContext(value: unknown): Context | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Partial<Context>;

  if (
    typeof record.id !== "string" ||
    typeof record.workspaceId !== "string" ||
    (record.type !== "AREA" &&
      record.type !== "PROJECT" &&
      record.type !== "PERSON") ||
    typeof record.name !== "string" ||
    (record.description !== null &&
      record.description !== undefined &&
      typeof record.description !== "string") ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    (record.archivedAt !== null &&
      record.archivedAt !== undefined &&
      typeof record.archivedAt !== "string")
  ) {
    return null;
  }

  return toStoredContext({
    id: record.id,
    workspaceId: record.workspaceId,
    type: record.type,
    name: record.name,
    description: record.description ?? null,
    version:
      typeof record.version === "number" && record.version > 0
        ? record.version
        : 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt ?? null,
  });
}

export function toStoredContext(context: Context): Context {
  return {
    ...context,
    version: context.version > 0 ? context.version : 1,
  };
}
