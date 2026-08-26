import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  createMemoryEvidenceModel,
  type MemoryEvidenceModel,
} from "@/features/cognition/memory-evidence/memory-evidence-model";
import { createPersonalLearning } from "@/features/cognition/personal-learning";
import {
  DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
} from "@/features/cognition/behavioral-engine/behavioral-engine";
import type {
  SemanticStatement,
  SemanticStatementCandidate,
} from "@/features/cognition/semantic-understanding/semantic-statements";

export interface DeriveSemanticStatementsOptions {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  evidenceModel?: MemoryEvidenceModel;
}

/** @deprecated Use createPersonalLearning({ evidence }).observedRelations. */
export function deriveSemanticStatements({
  contexts,
  relations,
  nodes,
  now = new Date(),
  evidenceModel,
}: DeriveSemanticStatementsOptions): SemanticStatement[] {
  const evidence =
    evidenceModel ??
    createMemoryEvidenceModel({
      contexts,
      relations,
      nodes,
      now,
      recentWindowDays: DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
    });

  return createPersonalLearning({ evidence }).observedRelations;
}

/** @deprecated Explicit semantic language patterns were removed from the neutral core. */
export function detectExplicitSemanticStatements(
  options?: Omit<DeriveSemanticStatementsOptions, "now">,
): SemanticStatementCandidate[] {
  void options;
  return [];
}
