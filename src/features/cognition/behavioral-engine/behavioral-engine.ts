import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  createMemoryEvidenceModel,
  type MemoryEvidenceModel,
} from "@/features/cognition/memory-evidence/memory-evidence-model";
import {
  createPersonalLearning,
  type ObservedPattern,
  type ObservedPatternKind,
  type ObservedPatternStrength,
} from "@/features/cognition/personal-learning";

export type BehavioralPatternKind = ObservedPatternKind;
export type BehavioralPatternStrength = ObservedPatternStrength;
export type BehavioralPattern = ObservedPattern;

export interface DeriveBehavioralPatternsOptions {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  recentWindowDays?: number;
  maxPatterns?: number;
  evidenceModel?: MemoryEvidenceModel;
}

export const DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS = 60;

/** @deprecated Use createPersonalLearning({ evidence }).observedPatterns. */
export function deriveBehavioralPatterns({
  contexts,
  relations,
  nodes,
  now = new Date(),
  recentWindowDays = DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
  maxPatterns,
  evidenceModel,
}: DeriveBehavioralPatternsOptions): BehavioralPattern[] {
  const evidence =
    evidenceModel ??
    createMemoryEvidenceModel({
      contexts,
      relations,
      nodes,
      now,
      recentWindowDays,
    });

  return createPersonalLearning({
    evidence,
    behavioralRecentWindowDays: recentWindowDays,
    maxObservedPatterns: maxPatterns,
  }).observedPatterns;
}

export function describeBehavioralPattern(
  pattern: BehavioralPattern,
  conceptsById: Map<string, Context>,
) {
  const labels = pattern.conceptIds
    .map((conceptId) => conceptsById.get(conceptId)?.name ?? conceptId)
    .join(" + ");

  switch (pattern.kind) {
    case "RECURRENT_PAIR":
      return `Aparece frecuentemente junto a ${labels}.`;
    case "EMERGING_RELATIONSHIP":
      return `La relación ha aumentado recientemente: ${labels}.`;
    case "DECLINING_RELATIONSHIP":
      return `La actividad compartida ha disminuido: ${labels}.`;
    case "STABLE_RELATIONSHIP":
      return `La relación se mantiene estable: ${labels}.`;
    case "RECURRING_CLUSTER":
      return `Grupo recurrente observado: ${labels}.`;
  }
}
