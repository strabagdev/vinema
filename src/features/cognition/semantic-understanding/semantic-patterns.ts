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
  humanLabel: string;
}

export const EXPLICIT_SEMANTIC_PATTERNS: SemanticRelationPattern[] = [
  {
    relation: "IS_A",
    humanLabel: "es",
    expressions: ["es", "corresponde a", "se considera"],
  },
  {
    relation: "PART_OF",
    humanLabel: "forma parte de",
    expressions: ["forma parte de", "pertenece a", "es parte de"],
  },
  {
    relation: "LOCATED_IN",
    humanLabel: "está en",
    expressions: [
      "está en",
      "esta en",
      "se encuentra en",
      "está ubicado en",
      "esta ubicado en",
      "se realizará en",
      "se realizara en",
    ],
  },
  {
    relation: "USES",
    humanLabel: "usa",
    expressions: ["usa", "utiliza", "emplea"],
  },
  {
    relation: "DEPENDS_ON",
    humanLabel: "depende de",
    expressions: ["depende de", "requiere", "necesita"],
  },
  {
    relation: "PRODUCES",
    humanLabel: "produce",
    expressions: ["produce", "fabrica", "genera"],
  },
  {
    relation: "CREATES",
    humanLabel: "crea",
    expressions: ["creó", "creo", "desarrolla", "construye", "implementa"],
  },
  {
    relation: "WORKS_AT",
    humanLabel: "trabaja en",
    expressions: ["trabaja en", "pertenece a la empresa"],
  },
  {
    relation: "WORKS_WITH",
    humanLabel: "trabaja con",
    expressions: ["trabaja con", "colabora con", "participa con"],
  },
  {
    relation: "RESPONSIBLE_FOR",
    humanLabel: "está a cargo de",
    expressions: [
      "está a cargo de",
      "esta a cargo de",
      "es responsable de",
      "lidera",
    ],
  },
];

export function getSemanticRelationHumanLabel(relation: SemanticRelationKind) {
  if (relation === "RELATED_TO") {
    return "está relacionado con";
  }

  return EXPLICIT_SEMANTIC_PATTERNS.find((pattern) => pattern.relation === relation)
    ?.humanLabel ?? relation;
}
