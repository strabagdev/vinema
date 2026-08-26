import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  createMemoryEvidenceModel,
  type ConceptMemorySeries,
  type MemoryEvidenceModel,
} from "@/features/cognition/memory-evidence/memory-evidence-model";
import {
  createPersonalLearning,
  deriveConceptTemporalSignals,
  detectContextShift,
} from "@/features/cognition/personal-learning";
import {
  DEFAULT_DORMANT_DAYS,
  DEFAULT_RECENT_WINDOW_DAYS,
  type EvolutionWindows,
  type MemoryEvolutionSignal,
} from "@/features/cognition/memory-evolution/memory-evolution";

export interface DeriveMemoryEvolutionSignalsOptions {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  recentWindowDays?: number;
  dormantDays?: number;
  maxSignals?: number;
  evidenceModel?: MemoryEvidenceModel;
}

/** @deprecated Use createPersonalLearning({ evidence }).temporalSignals. */
export function deriveMemoryEvolutionSignals({
  contexts,
  relations,
  nodes,
  now = new Date(),
  recentWindowDays = DEFAULT_RECENT_WINDOW_DAYS,
  dormantDays = DEFAULT_DORMANT_DAYS,
  maxSignals,
  evidenceModel,
}: DeriveMemoryEvolutionSignalsOptions): MemoryEvolutionSignal[] {
  const evidence =
    evidenceModel ??
    createMemoryEvidenceModel({
      contexts,
      relations,
      nodes,
      now,
      recentWindowDays,
      dormantDays,
    });

  return createPersonalLearning({
    evidence,
    evolutionRecentWindowDays: recentWindowDays,
    dormantDays,
    maxTemporalSignals: maxSignals,
  }).temporalSignals;
}

/** @deprecated Use deriveConceptTemporalSignals. */
export function deriveConceptEvolution({
  input,
  windows,
}: {
  input: ConceptMemorySeries;
  windows: EvolutionWindows;
}): MemoryEvolutionSignal[] {
  return deriveConceptTemporalSignals({ input, windows });
}

export { detectContextShift };
