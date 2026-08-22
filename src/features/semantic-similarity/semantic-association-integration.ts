import type {
  AssociationSuggestion,
} from "@/features/associations/association-types";
import { dedupeAssociationSuggestionsByContent } from "@/features/associations/association-engine";
import type {
  SemanticSimilarityMatch,
} from "@/features/semantic-similarity/semantic-similarity-engine";
import { getCapturePreview } from "@/features/node/node-display";

export function mergeSemanticAssociationSuggestions(
  existing: AssociationSuggestion[],
  semanticMatches: SemanticSimilarityMatch[],
  limit: number,
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

  return dedupeAssociationSuggestionsByContent(
    Array.from(suggestions.values()),
  ).slice(0, Math.max(limit, existing.length));
}
