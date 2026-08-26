export {
  combinations,
  countMonthlySpread,
  createTemporalWindows,
  isHistorical,
  isPrevious,
  isRecent,
  latestEvidenceCaptureIds,
  relationshipKey,
} from "@/features/cognition/personal-evidence/personal-evidence";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  createPersonalEvidence,
} from "@/features/cognition/personal-evidence/personal-evidence";
import type {
  PersonalEvidence,
} from "@/features/cognition/personal-evidence/personal-evidence";
export type {
  CaptureEvidence,
  ConceptEvidence,
  ConceptRelationEvidence,
  CreatePersonalEvidenceOptions,
  PersonalEvidence,
  TemporalCounts,
  TemporalEvidence,
  TemporalWindows,
} from "@/features/cognition/personal-evidence/personal-evidence";

export { createPersonalEvidence };
export {
  /** @deprecated Use latestEvidenceCaptureIds. Pending removal after PersonalEvidence migration. */
  latestEvidenceCaptureIds as latestEvidenceNodeIds,
} from "@/features/cognition/personal-evidence/personal-evidence";

/** @deprecated Use CreatePersonalEvidenceOptions. Pending removal after PersonalEvidence migration. */
export interface CreateMemoryEvidenceModelOptions {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  recentWindowDays: number;
  dormantDays?: number;
}

/** @deprecated Use createPersonalEvidence. Pending removal after PersonalEvidence migration. */
export function createMemoryEvidenceModel({
  contexts,
  relations,
  nodes,
  now,
  recentWindowDays,
  dormantDays,
}: CreateMemoryEvidenceModelOptions): PersonalEvidence {
  return createPersonalEvidence({
    concepts: contexts,
    relations,
    captures: nodes,
    now,
    recentWindowDays,
    dormantDays,
  });
}

export type {
  /** @deprecated Use CaptureEvidence. Pending removal after PersonalEvidence migration. */
  CaptureEvidence as MemoryEvidenceNode,
  /** @deprecated Use ConceptEvidence. Pending removal after PersonalEvidence migration. */
  ConceptEvidence as ConceptEvidenceRecord,
  /** @deprecated Use TemporalEvidence. Pending removal after PersonalEvidence migration. */
  TemporalEvidence as ConceptMemorySeries,
  /** @deprecated Use ConceptRelationEvidence. Pending removal after PersonalEvidence migration. */
  ConceptRelationEvidence as RelationshipMemorySeries,
  /** @deprecated Use PersonalEvidence. Pending removal after PersonalEvidence migration. */
  PersonalEvidence as MemoryEvidenceModel,
} from "@/features/cognition/personal-evidence/personal-evidence";
