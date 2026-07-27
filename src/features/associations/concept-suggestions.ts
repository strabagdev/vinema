import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type {
  ConceptSuggestion,
  ConceptSuggestionTrace,
  ExistingConceptSuggestion,
} from "@/features/associations/association-types";
import { normalizeAssociationText } from "@/features/associations/normalize-text";
import {
  tokenizeAssociationText,
  uniqueTokens,
} from "@/features/associations/tokenize";

export const MIN_CONCEPT_SCORE = 0.18;

export function suggestConcepts({
  text,
  contexts,
  nodes,
  relations,
  selectedContextIds = [],
  limit = 8,
}: {
  text: string;
  contexts: Context[];
  nodes: Node[];
  relations: NodeContextRelation[];
  selectedContextIds?: string[];
  limit?: number;
}): ConceptSuggestion[] {
  const queryTokens = uniqueTokens(tokenizeAssociationText(text));

  if (queryTokens.length === 0) {
    return selectedConcepts(contexts, selectedContextIds);
  }

  const traces = diagnoseConceptSuggestions({
    text,
    contexts,
    nodes,
    relations,
    selectedContextIds,
  });
  const selected = selectedConcepts(
    contexts.filter((context) => context.archivedAt === null),
    selectedContextIds,
  );
  const relevant = traces
    .filter((trace) => trace.included)
    .map(toExistingConceptSuggestion)
    .sort(byConceptPriority);
  const merged = new Map<string, ConceptSuggestion>();

  for (const suggestion of selected) {
    merged.set(suggestion.context.id, suggestion);
  }

  for (const suggestion of relevant) {
    merged.set(suggestion.context.id, suggestion);
  }

  return Array.from(merged.values()).slice(
    0,
    Math.max(limit, selectedContextIds.length),
  );
}

export function diagnoseConceptSuggestions({
  text,
  contexts,
  nodes,
  relations,
  selectedContextIds = [],
}: {
  text: string;
  contexts: Context[];
  nodes: Node[];
  relations: NodeContextRelation[];
  selectedContextIds?: string[];
}): ConceptSuggestionTrace[] {
  const queryTokens = uniqueTokens(tokenizeAssociationText(text));
  const activeContexts = contexts.filter((context) => context.archivedAt === null);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return activeContexts.map((context) => {
    const contextTokens = uniqueTokens(
      tokenizeAssociationText(`${context.name} ${context.description ?? ""}`),
    );
    const relatedRelations = relations.filter(
      (relation) =>
        relation.contextId === context.id &&
        relation.relationType !== "CAPTURE_ASSOCIATION",
    );
    const relatedCaptureIds = relatedRelations.map((relation) => relation.nodeId);
    const relatedContentTokens = uniqueTokens(
      tokenizeAssociationText(
        relatedRelations
          .map((relation) => nodesById.get(relation.nodeId)?.content ?? "")
          .join(" "),
      ),
    );
    const directMatches = overlapCount(queryTokens, contextTokens);
    const relatedMatches = overlapCount(queryTokens, relatedContentTokens);
    const selectedBoost = selectedContextIds.includes(context.id) ? 1 : 0;
    const score =
      directMatches / Math.max(queryTokens.length, 1) +
      relatedMatches / Math.max(queryTokens.length * 2, 1) +
      selectedBoost;

    return {
      context,
      queryTokens,
      contextTokens,
      relatedContentTokens,
      relatedCaptureIds,
      directMatches,
      relatedMatches,
      selectedBoost,
      score,
      threshold: MIN_CONCEPT_SCORE,
      included: score >= MIN_CONCEPT_SCORE,
    };
  });
}

function selectedConcepts(
  contexts: Context[],
  selectedContextIds: string[],
): ExistingConceptSuggestion[] {
  return contexts
    .filter((context) => selectedContextIds.includes(context.id))
    .map((context) => ({
      kind: "existing" as const,
      context,
      conceptId: context.id,
      label: context.name,
      score: 1,
      evidenceCaptureIds: [],
      matchedTerms: [],
    }));
}

function overlapCount(first: string[], second: string[]) {
  const secondSet = new Set(second);
  return first.filter((token) => secondSet.has(normalizeAssociationText(token))).length;
}

function toExistingConceptSuggestion(
  trace: ConceptSuggestionTrace,
): ExistingConceptSuggestion {
  return {
    kind: "existing",
    context: trace.context,
    conceptId: trace.context.id,
    label: trace.context.name,
    score: trace.score,
    evidenceCaptureIds: trace.relatedCaptureIds,
    matchedTerms: trace.queryTokens.filter(
      (token) =>
        trace.contextTokens.includes(token) ||
        trace.relatedContentTokens.includes(token),
    ),
  };
}

function byConceptPriority(a: ConceptSuggestion, b: ConceptSuggestion) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  return getConceptLabel(a).localeCompare(getConceptLabel(b));
}

function getConceptLabel(suggestion: ConceptSuggestion) {
  return suggestion.kind === "existing"
    ? suggestion.label
    : suggestion.suggestedLabel;
}
