import type { Context, ContextType } from "@/domain/context/context";

export type ListContextsOptions = {
  workspaceId: string;
  type?: ContextType;
  includeArchived?: boolean;
};

export interface ContextRepository {
  getById(id: string): Promise<Context | null>;
  list(options: ListContextsOptions): Promise<Context[]>;
  save(context: Context): Promise<Context>;
}
