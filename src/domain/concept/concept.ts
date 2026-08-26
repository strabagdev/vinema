export const CONCEPT_TYPES = ["AREA", "PROJECT", "PERSON"] as const;

export type ConceptType = (typeof CONCEPT_TYPES)[number];

export interface Concept {
  id: string;
  workspaceId: string;
  type: ConceptType;
  name: string;
  description: string | null;
  aliases?: string[];
  normalizedAliases?: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export function isConceptType(value: unknown): value is ConceptType {
  return (
    typeof value === "string" &&
    CONCEPT_TYPES.includes(value as ConceptType)
  );
}

export function normalizeConceptNameForComparison(name: string) {
  return name.trim().toLocaleLowerCase();
}
