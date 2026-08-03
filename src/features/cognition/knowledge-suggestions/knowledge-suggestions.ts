export type KnowledgeSuggestionKind =
  | "RELATED_NOW"
  | "MISSING_CONTEXT"
  | "REVISIT";

export type KnowledgeSuggestionConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface KnowledgeSuggestion {
  id: string;
  kind: KnowledgeSuggestionKind;
  conceptId: string;
  canonicalLabel: string;
  confidence: KnowledgeSuggestionConfidence;
  reasons: string[];
  evidenceNodeIds: string[];
}

export const KNOWLEDGE_SUGGESTION_LABELS: Record<KnowledgeSuggestionKind, string> = {
  RELATED_NOW: "Relacionado ahora",
  MISSING_CONTEXT: "Podría faltar",
  REVISIT: "Retomar",
};
