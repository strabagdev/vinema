import type { Context } from "@/domain/context/context";
import type { BehavioralPattern } from "@/features/cognition/behavioral-engine/behavioral-engine";
import type { KnowledgeSuggestion } from "@/features/cognition/knowledge-suggestions";
import type { MemoryEvolutionSignal } from "@/features/cognition/memory-evolution";
import type { SemanticStatement } from "@/features/cognition/semantic-understanding";
import type { ConceptProfile } from "@/features/exploration/concept-profile";
import type { DerivedConceptRelationship, RelationshipEvidence } from "@/features/exploration/concept-relationships";

export interface MemoryEvidence extends RelationshipEvidence {
  sources: Array<
    | "PROFILE"
    | "RELATIONSHIP"
    | "BEHAVIORAL"
    | "SEMANTIC"
    | "EVOLUTION"
    | "SUGGESTION"
  >;
}

export interface MemorySummary {
  totalConcepts: number;
  totalRelationships: number;
  activeSuggestions: number;
  activePatterns: number;
  evolutionSignals: number;
  explicitStatements: number;
  evidenceNodes: number;
}

export interface MemoryResponse {
  concepts: Context[];
  profiles: ConceptProfile[];
  relationships: DerivedConceptRelationship[];
  behavioralPatterns: BehavioralPattern[];
  semanticStatements: SemanticStatement[];
  evolutionSignals: MemoryEvolutionSignal[];
  suggestions: KnowledgeSuggestion[];
  evidence: MemoryEvidence[];
  summary: MemorySummary;
}
