import type {
  ConceptSuggestion,
  ExistingConceptSuggestion,
} from "@/features/associations/association-types";
import type {
  SemanticConceptSimilarityMatch,
} from "@/features/semantic-similarity/semantic-similarity-engine";

export const SEMANTIC_CONCEPT_SUGGESTION_REASON =
  "Contenido relacionado por significado.";

export function mergeSemanticConceptSuggestions({
  existing,
  semanticMatches,
  limit,
}: {
  existing: ConceptSuggestion[];
  semanticMatches: SemanticConceptSimilarityMatch[];
  limit: number;
}) {
  if (semanticMatches.length === 0) {
    return existing;
  }

  const byConceptId = new Map<string, ConceptSuggestion>();

  for (const suggestion of existing) {
    byConceptId.set(getConceptSuggestionId(suggestion), suggestion);
  }

  for (const match of semanticMatches) {
    const current = byConceptId.get(match.concept.id);
    const semanticSuggestion: ExistingConceptSuggestion = {
      kind: "existing",
      context: match.concept,
      conceptId: match.concept.id,
      label: match.concept.name,
      score: Math.max(0.01, Math.min(0.65, match.evidence.similarity * 0.6)),
      evidenceCaptureIds: match.evidenceNodeIds,
      matchedTerms: [],
      knowledgeSuggestionKind: "RELATED_NOW",
      knowledgeSuggestionReasons: [SEMANTIC_CONCEPT_SUGGESTION_REASON],
      suggestionSource: "VECTOR_SIMILARITY",
    };

    if (!current) {
      byConceptId.set(match.concept.id, semanticSuggestion);
      continue;
    }

    if (current.kind !== "existing") {
      continue;
    }

    byConceptId.set(match.concept.id, {
      ...current,
      evidenceCaptureIds: mergeUniqueStrings(
        current.evidenceCaptureIds,
        semanticSuggestion.evidenceCaptureIds,
      ),
      knowledgeSuggestionReasons: mergeUniqueStrings(
        current.knowledgeSuggestionReasons ?? [],
        semanticSuggestion.knowledgeSuggestionReasons ?? [],
      ),
      suggestionSource: current.suggestionSource ?? "VECTOR_SIMILARITY",
    });
  }

  return Array.from(byConceptId.values()).slice(0, Math.max(limit, existing.length));
}

function getConceptSuggestionId(suggestion: ConceptSuggestion) {
  return suggestion.kind === "existing"
    ? suggestion.conceptId
    : suggestion.suggestedLabel;
}

function mergeUniqueStrings(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second])).sort();
}
