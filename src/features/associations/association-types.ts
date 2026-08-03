import type { Node } from "@/domain/node/node";
import type { Context } from "@/domain/context/context";

export type AssociationReason =
  | {
      type: "TERM_MATCH";
      terms: string[];
    }
  | {
      type: "PHRASE_MATCH";
      phrases: string[];
    }
  | {
      type: "SHARED_RELATION";
      relatedCaptureIds: string[];
    }
  | {
      type: "SHARED_NEIGHBOR";
      captureIds: string[];
    };

export type AssociationSuggestion = {
  node: Node;
  score: number;
  excerpt: string;
  reasons: AssociationReason[];
};

export type ExistingConceptSuggestion = {
  kind: "existing";
  context: Context;
  conceptId: string;
  label: string;
  score: number;
  evidenceCaptureIds: string[];
  matchedTerms: string[];
  matchedAlias?: string;
  knowledgeSuggestionKind?: "RELATED_NOW" | "MISSING_CONTEXT" | "REVISIT";
  knowledgeSuggestionReasons?: string[];
};

export type EmergingConceptSuggestion = {
  kind: "emerging";
  candidateId: string;
  suggestedLabel: string;
  score: number;
  evidenceCaptureIds: string[];
  representativeTerms: string[];
};

export type ConceptSuggestion =
  | ExistingConceptSuggestion
  | EmergingConceptSuggestion;

export type ConceptSuggestionTrace = {
  context: Context;
  queryTokens: string[];
  contextTokens: string[];
  relatedContentTokens: string[];
  relatedCaptureIds: string[];
  matchedAlias?: string;
  directMatches: number;
  relatedMatches: number;
  selectedBoost: number;
  score: number;
  threshold: number;
  included: boolean;
};

export type SuggestionDiagnostics = {
  query: string;
  requestId: number;
  debounceMs: number;
  captureReadMs: number;
  contextReadMs: number;
  relationReadMs: number;
  indexPreparationMs: number;
  recoveryMs: number;
  conceptsMs: number;
  stateUpdateMs: number;
  totalMs: number;
  captureCount: number;
  contextCount: number;
  relationCount: number;
  recoveryResultCount: number;
  conceptResultCount: number;
  conceptTraces: ConceptSuggestionTrace[];
  evidenceCandidateCount: number;
  clusterCount: number;
  existingConceptSuggestionCount: number;
  emergingConceptSuggestionCount: number;
  clusterDetectionMs: number;
  labelExtractionMs: number;
  deduplicationMs: number;
};

export type AssociationIndexedCapture = {
  node: Node;
  normalizedText: string;
  tokens: string[];
  uniqueTokens: string[];
  termFrequency: Map<string, number>;
  wordBigrams: string[];
  wordTrigrams: string[];
  characterTrigrams: string[];
};
