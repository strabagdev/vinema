import type { SemanticRelationKind } from "@/features/cognition/semantic-understanding/semantic-patterns";

export type SemanticEvidenceLevel =
  | "EXPLICIT"
  | "REPEATED_EXPLICIT"
  | "CONTEXTUAL";

export type SemanticConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface SemanticStatement {
  id: string;
  sourceConceptId: string;
  sourceLabel: string;
  relation: SemanticRelationKind;
  targetConceptId: string;
  targetLabel: string;
  evidenceLevel: SemanticEvidenceLevel;
  confidence: SemanticConfidence;
  evidence: SemanticStatementEvidence[];
  firstObservedAt: Date | null;
  lastObservedAt: Date | null;
  hasContradictoryEvidence: boolean;
}

export interface SemanticStatementEvidence {
  nodeId: string;
  excerpt: string;
  createdAt: Date;
  matchedExpression: string;
}

export interface SemanticStatementCandidate {
  sourceConceptId: string;
  sourceLabel: string;
  relation: SemanticRelationKind;
  targetConceptId: string;
  targetLabel: string;
  evidence: SemanticStatementEvidence;
  evidenceLevel: SemanticEvidenceLevel;
  negative?: boolean;
}

export function aggregateSemanticStatements(
  candidates: SemanticStatementCandidate[],
): SemanticStatement[] {
  const positives = new Map<string, SemanticStatementCandidate[]>();
  const contradictions = detectSemanticContradictions(candidates);

  for (const candidate of candidates) {
    if (candidate.negative) {
      continue;
    }

    const id = createSemanticStatementId(candidate);
    positives.set(id, [...(positives.get(id) ?? []), candidate]);
  }

  return Array.from(positives.entries())
    .map(([id, grouped]) => materializeStatement(id, grouped, contradictions.has(id)))
    .sort(compareSemanticStatements);
}

export function detectSemanticContradictions(
  candidates: SemanticStatementCandidate[],
) {
  const positiveIds = new Set(
    candidates
      .filter((candidate) => !candidate.negative)
      .map((candidate) => createSemanticStatementId(candidate)),
  );
  const negativeIds = new Set(
    candidates
      .filter((candidate) => candidate.negative)
      .map((candidate) => createSemanticStatementId(candidate)),
  );

  return new Set(
    Array.from(positiveIds).filter((id) => negativeIds.has(id)),
  );
}

export function createSemanticStatementId({
  sourceConceptId,
  relation,
  targetConceptId,
}: Pick<
  SemanticStatementCandidate,
  "sourceConceptId" | "relation" | "targetConceptId"
>) {
  return `semantic:${sourceConceptId}:${relation.toLocaleLowerCase("en-US")}:${targetConceptId}`;
}

function materializeStatement(
  id: string,
  candidates: SemanticStatementCandidate[],
  hasContradictoryEvidence: boolean,
): SemanticStatement {
  const first = candidates[0];
  const evidence = dedupeEvidence(candidates.map((candidate) => candidate.evidence));
  const timestamps = evidence.map((item) => item.createdAt.getTime());
  const explicitEvidence = candidates.filter(
    (candidate) => candidate.evidenceLevel === "EXPLICIT",
  );
  const repeatedExplicit = new Set(explicitEvidence.map((candidate) => candidate.evidence.nodeId)).size >= 2;
  const evidenceLevel = repeatedExplicit
    ? "REPEATED_EXPLICIT"
    : explicitEvidence.length > 0
      ? "EXPLICIT"
      : "CONTEXTUAL";

  return {
    id,
    sourceConceptId: first.sourceConceptId,
    sourceLabel: first.sourceLabel,
    relation: first.relation,
    targetConceptId: first.targetConceptId,
    targetLabel: first.targetLabel,
    evidenceLevel,
    confidence: evidenceLevel === "REPEATED_EXPLICIT"
      ? "HIGH"
      : evidenceLevel === "EXPLICIT"
        ? "MEDIUM"
        : "LOW",
    evidence,
    firstObservedAt: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null,
    lastObservedAt: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null,
    hasContradictoryEvidence,
  };
}

function dedupeEvidence(evidence: SemanticStatementEvidence[]) {
  const byNodeId = new Map<string, SemanticStatementEvidence>();

  for (const item of evidence) {
    const current = byNodeId.get(item.nodeId);

    if (!current || item.createdAt.getTime() > current.createdAt.getTime()) {
      byNodeId.set(item.nodeId, item);
    }
  }

  return Array.from(byNodeId.values()).sort(
    (first, second) =>
      first.createdAt.getTime() - second.createdAt.getTime() ||
      first.nodeId.localeCompare(second.nodeId),
  );
}

function compareSemanticStatements(first: SemanticStatement, second: SemanticStatement) {
  const confidenceDelta = confidenceRank(second.confidence) - confidenceRank(first.confidence);

  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  if (second.evidence.length !== first.evidence.length) {
    return second.evidence.length - first.evidence.length;
  }

  return first.id.localeCompare(second.id);
}

function confidenceRank(confidence: SemanticConfidence) {
  return confidence === "HIGH" ? 3 : confidence === "MEDIUM" ? 2 : 1;
}
