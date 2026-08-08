import type { Context } from "@/domain/context/context";
import type {
  ContextRepository,
  ListContextsOptions,
} from "@/domain/context/context-repository";
import { normalizeContextAliases } from "@/features/concepts/concept-identity";

export class InMemoryContextRepository implements ContextRepository {
  private readonly contexts = new Map<string, Context>();

  constructor(contexts: Context[] = []) {
    contexts.forEach((context) =>
      this.contexts.set(context.id, normalizeContextAliases(context)),
    );
  }

  async getById(id: string): Promise<Context | null> {
    return this.contexts.get(id) ?? null;
  }

  async list(options: ListContextsOptions): Promise<Context[]> {
    return Array.from(this.contexts.values())
      .filter((context) => context.workspaceId === options.workspaceId)
      .filter((context) => !options.type || context.type === options.type)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(context: Context): Promise<Context> {
    const stored = normalizeContextAliases(context);
    this.contexts.set(stored.id, stored);
    return stored;
  }

}
