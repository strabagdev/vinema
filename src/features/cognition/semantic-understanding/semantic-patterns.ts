export type SemanticRelationKind =
  | "IS_A"
  | "PART_OF"
  | "LOCATED_IN"
  | "USES"
  | "DEPENDS_ON"
  | "PRODUCES"
  | "CREATES"
  | "WORKS_AT"
  | "WORKS_WITH"
  | "RESPONSIBLE_FOR"
  | "RELATED_TO";

export interface SemanticRelationPattern {
  relation: SemanticRelationKind;
  expressions: string[];
}

export const EXPLICIT_SEMANTIC_PATTERNS: SemanticRelationPattern[] = [];

export function getSemanticRelationHumanLabel(relation: SemanticRelationKind) {
  return relation;
}
