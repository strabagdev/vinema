export const CONTEXT_TYPES = ["AREA", "PROJECT", "PERSON"] as const;

export type ContextType = (typeof CONTEXT_TYPES)[number];

export interface Context {
  id: string;
  workspaceId: string;
  type: ContextType;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export function isContextType(value: unknown): value is ContextType {
  return (
    typeof value === "string" &&
    CONTEXT_TYPES.includes(value as ContextType)
  );
}

export function normalizeContextNameForComparison(name: string) {
  return name.trim().toLocaleLowerCase();
}
