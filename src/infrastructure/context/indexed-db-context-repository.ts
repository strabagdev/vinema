import type { Context } from "@/domain/context/context";
import type {
  ContextRepository,
  ListContextsOptions,
} from "@/domain/context/context-repository";
import { CONTEXTS_STORE, getVinemaDb } from "@/infrastructure/storage/vinema-db";

export class IndexedDbContextRepository implements ContextRepository {
  async getById(id: string): Promise<Context | null> {
    const db = await getVinemaDb();
    return (await db.get(CONTEXTS_STORE, id)) ?? null;
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
      .filter((context) => options.includeArchived || context.archivedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(context: Context): Promise<Context> {
    const db = await getVinemaDb();
    await db.put(CONTEXTS_STORE, context);
    return context;
  }

  async archive(context: Context): Promise<Context> {
    return this.save(context);
  }

  async restore(context: Context): Promise<Context> {
    return this.save(context);
  }
}
