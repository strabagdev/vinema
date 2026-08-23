import type {
  AssociationSuggestion,
} from "@/features/associations/association-types";
import { dedupeAssociationSuggestionsByContent } from "@/features/associations/association-engine";
import {
  hasDirectionalContradiction,
  hasMeaningfulLocalTokenOverlap,
} from "@/features/associations/local-support";
import type {
  SemanticSimilarityMatch,
} from "@/features/semantic-similarity/semantic-similarity-engine";
import { getCapturePreview } from "@/features/node/node-display";

export function mergeSemanticAssociationSuggestions(
  existing: AssociationSuggestion[],
  semanticMatches: SemanticSimilarityMatch[],
  limit: number,
  localText?: string,
) {
  if (semanticMatches.length === 0) {
    return existing;
  }

  const suggestions = new Map<string, AssociationSuggestion>();

  for (const suggestion of existing) {
    suggestions.set(suggestion.node.id, suggestion);
  }

  for (const match of semanticMatches) {
    if (suggestions.has(match.node.id)) {
      continue;
    }

    if (!hasLocalSemanticMemorySupport(match, localText)) {
      continue;
    }

    suggestions.set(match.node.id, {
      node: match.node,
      score: Math.max(0.01, Math.min(0.99, match.evidence.similarity * 0.5)),
      excerpt: getCapturePreview(match.node.content, { maxLength: 160 }),
      reasons: [
        {
          type: "VECTOR_SIMILARITY",
          similarity: match.evidence.similarity,
          rank: match.evidence.rank,
          marginToNext: match.evidence.marginToNext,
        },
      ],
    });
  }

  const mergedSuggestions = Array.from(suggestions.values());
  const deduplicatedSuggestions = dedupeAssociationSuggestionsByContent(
    mergedSuggestions,
  );

  return deduplicatedSuggestions.slice(0, Math.max(limit, existing.length));
}

function hasLocalSemanticMemorySupport(
  match: SemanticSimilarityMatch,
  localText?: string,
) {
  if (!localText) {
    return true;
  }

  if (hasDirectionalContradiction(localText, match.node.content)) {
    return false;
  }

  return hasMeaningfulLocalTokenOverlap(localText, match.node.content);
}
