import type { Context } from "@/domain/context/context";
import type {
  ContextRepository,
  ListContextsOptions,
} from "@/domain/context/context-repository";

export class InMemoryContextRepository implements ContextRepository {
  private readonly contexts = new Map<string, Context>();

  constructor(contexts: Context[] = []) {
    contexts.forEach((context) => this.contexts.set(context.id, context));
  }

  async getById(id: string): Promise<Context | null> {
    return this.contexts.get(id) ?? null;
  }

  async list(options: ListContextsOptions): Promise<Context[]> {
    return Array.from(this.contexts.values())
      .filter((context) => context.workspaceId === options.workspaceId)
      .filter((context) => !options.type || context.type === options.type)
      .filter((context) => options.includeArchived || context.archivedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(context: Context): Promise<Context> {
    this.contexts.set(context.id, context);
    return context;
  }

  async archive(context: Context): Promise<Context> {
    return this.save(context);
  }

  async restore(context: Context): Promise<Context> {
    return this.save(context);
  }
}
