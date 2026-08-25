import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import {
  createCharacterTrigrams,
  createWordNgrams,
  overlapRatio,
} from "@/features/associations/ngrams";
import { normalizeAssociationText } from "@/features/associations/normalize-text";
import {
  tokenizeAssociationText,
  uniqueTokens,
} from "@/features/associations/tokenize";
import {
  getSharedNeighbors,
  normalizeAssociationPair,
} from "@/features/associations/graph-metrics";
import {
  hasDirectionalContradiction,
  getMeaningfulLocalSupportTokens,
  hasMeaningfulLocalTokenOverlap,
  isMeaningfulLocalSupportToken,
} from "@/features/associations/local-support";
import { captureMarkdownToEmbeddingText } from "@/features/semantic-similarity/embedding-text";
import type {
  AssociationIndexedCapture,
  AssociationReason,
  AssociationSuggestion,
} from "@/features/associations/association-types";

const MIN_QUERY_TOKENS = 1;
const MIN_QUERY_LENGTH = 4;
const MIN_SUGGESTION_SCORE = 0.045;
const MAX_SUGGESTIONS = 5;
const MIN_RECURRENT_ANCHOR_DOCUMENT_FREQUENCY = 2;
const MIN_SHARED_TOKEN_SUPPORT_COUNT = 3;
const SUPERFICIAL_BOUNDARY_PUNCTUATION =
  /^[\s"'“”‘’.,;:!?¡¿()[\]{}]+|[\s"'“”‘’.,;:!?¡¿()[\]{}]+$/g;

export type AssociationEngineInput = {
  nodes: Node[];
  relations?: NodeContextRelation[];
};

export type SuggestAssociationsInput = {
  text: string;
  currentNodeId?: string;
  selectedCaptureIds?: string[];
  limit?: number;
  diagnostics?: AssociationScoringDiagnostics;
};

export type AssociationScoringDiagnostics = {
  queryIndexMs: number;
  scoringMs: number;
  rankingMs: number;
  resultBuildMs: number;
  scoredCaptureCount: number;
};

export type AssociationIndex = {
  captures: AssociationIndexedCapture[];
  documentFrequency: Map<string, number>;
  averageLength: number;
  relations: NodeContextRelation[];
};

export function buildAssociationIndex({
  nodes,
  relations = [],
}: AssociationEngineInput): AssociationIndex {
  const activeNodes = nodes.filter(isIndexableActiveNode);
  const captures = activeNodes.map(indexCapture);
  const documentFrequency = new Map<string, number>();

  for (const capture of captures) {
    for (const token of capture.uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const averageLength =
    captures.reduce((sum, capture) => sum + capture.tokens.length, 0) /
      Math.max(captures.length, 1) || 1;

  return {
    captures,
    documentFrequency,
    averageLength,
    relations: relations.filter(isCaptureAssociationRelation),
  };
}

export function suggestAssociations(
  index: AssociationIndex,
  input: SuggestAssociationsInput,
): AssociationSuggestion[] {
  const normalizedText = normalizeAssociationText(input.text);
  const queryTokens = tokenizeAssociationText(input.text);

  if (
    normalizedText.length < MIN_QUERY_LENGTH ||
    uniqueTokens(queryTokens).length < MIN_QUERY_TOKENS
  ) {
    return [];
  }

  const queryIndexStartedAt = performance.now();
  const query = indexText(input.text);
  const queryIndexMs = Math.round(performance.now() - queryIndexStartedAt);
  const selectedCaptureIds = input.selectedCaptureIds ?? [];
  const scoringStartedAt = performance.now();
  const scoredSuggestions = index.captures
    .filter((capture) => capture.node.id !== input.currentNodeId)
    .map((capture) =>
      scoreCapture(index, query, capture, selectedCaptureIds),
    )
    .filter((suggestion): suggestion is AssociationSuggestion => suggestion !== null);
  const structurallyDominantSuggestions = suppressStructurallyDominatedSuggestions(
    query,
    scoredSuggestions,
  );
  const scoringMs = Math.round(performance.now() - scoringStartedAt);
  const rankingStartedAt = performance.now();
  structurallyDominantSuggestions.sort(bySuggestionPriority);
  const rankingMs = Math.round(performance.now() - rankingStartedAt);
  const resultBuildStartedAt = performance.now();
  const selectedSuggestions = structurallyDominantSuggestions.filter((suggestion) =>
    selectedCaptureIds.includes(suggestion.node.id),
  );
  const suggestions = structurallyDominantSuggestions.filter(
    (suggestion) => suggestion.score >= MIN_SUGGESTION_SCORE,
  );
  const visibleSuggestions = dedupeAssociationSuggestionsByContent(
    mergeSuggestions(selectedSuggestions, suggestions),
  );
  const result = visibleSuggestions.slice(
    0,
    Math.max(input.limit ?? MAX_SUGGESTIONS, selectedSuggestions.length),
  );

  if (input.diagnostics) {
    input.diagnostics.queryIndexMs = queryIndexMs;
    input.diagnostics.scoringMs = scoringMs;
    input.diagnostics.rankingMs = rankingMs;
    input.diagnostics.resultBuildMs = Math.round(
      performance.now() - resultBuildStartedAt,
    );
    input.diagnostics.scoredCaptureCount = structurallyDominantSuggestions.length;
  }

  return result;
}

function suppressStructurallyDominatedSuggestions(
  query: AssociationIndexedCapture,
  suggestions: AssociationSuggestion[],
) {
  const exactSuggestions = suggestions.filter(
    (suggestion) =>
      normalizeAssociationText(suggestion.node.content) === query.normalizedText,
  );

  if (exactSuggestions.length === 0) {
    return suggestions;
  }

  return suggestions.filter((suggestion) => {
    if (exactSuggestions.includes(suggestion)) {
      return true;
    }

    return !isNearSurfaceVariant(query.node.content, suggestion.node.content);
  });
}

function isNearSurfaceVariant(first: string, second: string) {
  const firstTokens = normalizeAssociationText(first).split(" ").filter(Boolean);
  const secondTokens = normalizeAssociationText(second).split(" ").filter(Boolean);
  const maxDistance = Math.max(3, Math.ceil(firstTokens.length * 0.35));

  return tokenEditDistance(firstTokens, secondTokens, maxDistance) <= maxDistance;
}

function tokenEditDistance(first: string[], second: string[], maxDistance: number) {
  if (Math.abs(first.length - second.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: second.length + 1 }, (_value, index) => index);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    let rowMinimum = current[0] ?? 0;

    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitutionCost =
        first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      const cost = Math.min(
        (previous[secondIndex] ?? 0) + 1,
        (current[secondIndex - 1] ?? 0) + 1,
        (previous[secondIndex - 1] ?? 0) + substitutionCost,
      );

      current[secondIndex] = cost;
      rowMinimum = Math.min(rowMinimum, cost);
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[second.length] ?? maxDistance + 1;
}

export function indexCapture(node: Node): AssociationIndexedCapture {
  return indexText(safeText(node.content), node);
}

function indexText(value: string, node?: Node): AssociationIndexedCapture {
  const normalizedText = normalizeAssociationText(value);
  const tokens = tokenizeAssociationText(value);
  const termFrequency = new Map<string, number>();

  for (const token of tokens) {
    termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
  }

  return {
    node: node ?? createQueryNode(value),
    normalizedText,
    tokens,
    uniqueTokens: uniqueTokens(tokens),
    termFrequency,
    wordBigrams: createWordNgrams(tokens, 2),
    wordTrigrams: createWordNgrams(tokens, 3),
    characterTrigrams: createCharacterTrigrams(normalizedText),
  };
}

function scoreCapture(
  index: AssociationIndex,
  query: AssociationIndexedCapture,
  capture: AssociationIndexedCapture,
  selectedCaptureIds: string[],
): AssociationSuggestion | null {
  const commonTerms = query.uniqueTokens.filter((token) =>
    capture.termFrequency.has(token),
  );
  const commonBigrams = query.wordBigrams.filter((phrase) =>
    capture.wordBigrams.includes(phrase),
  );
  const commonTrigrams = query.wordTrigrams.filter((phrase) =>
    capture.wordTrigrams.includes(phrase),
  );
  const commonPhrases = uniqueTokens([...commonTrigrams, ...commonBigrams]);
  const lexicalScore =
    commonTerms.length / Math.max(query.uniqueTokens.length, 1);
  const bm25Score = calculateBm25(index, query, capture);
  const tfidfScore = calculateTfIdfCosine(index, query, capture);
  const phraseScore = Math.min(1, commonPhrases.length * 0.32);
  const charScore = overlapRatio(query.characterTrigrams, capture.characterTrigrams);
  const relationScore = selectedCaptureIds.some((selectedId) =>
    areCapturesAssociated(index.relations, selectedId, capture.node.id),
  )
    ? 1
    : 0;
  const selectedScore = selectedCaptureIds.includes(capture.node.id) ? 1 : 0;
  const queryMeaningfulTokens = getMeaningfulLocalSupportTokens(query.node.content);
  const sharedNeighbors = selectedCaptureIds.flatMap((selectedId) =>
    getSharedNeighbors(index.relations, selectedId, capture.node.id),
  );
  const sharedNeighborScore = Math.min(1, uniqueTokens(sharedNeighbors).length / 3);

  const score = clamp01(
    bm25Score * 0.34 +
      lexicalScore * 0.18 +
      tfidfScore * 0.24 +
      phraseScore * 0.14 +
      charScore * 0.05 +
      relationScore * 0.04 +
      sharedNeighborScore * 0.01,
  );
  const reasons = buildReasons(
    commonTerms,
    commonPhrases,
    relationScore,
    selectedCaptureIds,
    sharedNeighbors,
  );
  const contradiction = hasDirectionalContradiction(
    query.node.content,
    capture.node.content,
  );
  const localSupport =
    selectedScore > 0 ||
    relationScore > 0 ||
    hasExactSingleTokenQuerySupport(queryMeaningfulTokens, commonTerms) ||
    hasMultipleSharedTokenSupport(commonTerms) ||
    hasMeaningfulPhraseOverlap(commonPhrases) ||
    hasMeaningfulLocalTokenOverlap(query.node.content, capture.node.content) ||
    hasRareCommonTermSupport(index, commonTerms);

  if (reasons.length === 0 || !localSupport || contradiction) {
    return null;
  }

  return {
    node: capture.node,
    score,
    excerpt: createAssociationExcerpt(capture.node.content, commonTerms, commonPhrases),
    reasons,
  };
}

function hasExactSingleTokenQuerySupport(
  queryMeaningfulTokens: string[],
  commonTerms: string[],
) {
  return (
    queryMeaningfulTokens.length === 1 &&
    commonTerms.includes(queryMeaningfulTokens[0] ?? "")
  );
}

function hasMultipleSharedTokenSupport(commonTerms: string[]) {
  const meaningfulTerms = commonTerms.filter(isMeaningfulLocalSupportToken);

  return meaningfulTerms.length >= MIN_SHARED_TOKEN_SUPPORT_COUNT;
}

export function calculateBm25(
  index: AssociationIndex,
  query: AssociationIndexedCapture,
  capture: AssociationIndexedCapture,
) {
  if (index.captures.length === 0 || query.uniqueTokens.length === 0) {
    return 0;
  }

  const k1 = 1.2;
  const b = 0.75;
  const documentCount = index.captures.length;
  let score = 0;

  for (const token of query.uniqueTokens) {
    const frequency = capture.termFrequency.get(token) ?? 0;

    if (frequency === 0) {
      continue;
    }

    const df = index.documentFrequency.get(token) ?? 0;
    const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    const denominator =
      frequency +
      k1 *
        (1 - b + b * (capture.tokens.length / Math.max(index.averageLength, 1)));
    score += idf * ((frequency * (k1 + 1)) / denominator);
  }

  return clamp01(score / Math.max(query.uniqueTokens.length, 1));
}

export function calculateTfIdfCosine(
  index: AssociationIndex,
  query: AssociationIndexedCapture,
  capture: AssociationIndexedCapture,
) {
  const vocabulary = uniqueTokens([...query.uniqueTokens, ...capture.uniqueTokens]);

  if (vocabulary.length === 0) {
    return 0;
  }

  let dot = 0;
  let queryMagnitude = 0;
  let captureMagnitude = 0;

  for (const token of vocabulary) {
    const idf = getIdf(index, token);
    const queryWeight = (query.termFrequency.get(token) ?? 0) * idf;
    const captureWeight = (capture.termFrequency.get(token) ?? 0) * idf;

    dot += queryWeight * captureWeight;
    queryMagnitude += queryWeight ** 2;
    captureMagnitude += captureWeight ** 2;
  }

  if (queryMagnitude === 0 || captureMagnitude === 0) {
    return 0;
  }

  return clamp01(dot / (Math.sqrt(queryMagnitude) * Math.sqrt(captureMagnitude)));
}

export function formatAssociationReason(reason: AssociationReason) {
  if (reason.type === "PHRASE_MATCH") {
    return `Comparte la frase "${reason.phrases[0]}"`;
  }

  if (reason.type === "TERM_MATCH") {
    return `Coincide en ${reason.terms.slice(0, 3).map((term) => `"${formatTermForDisplay(term)}"`).join(" y ")}`;
  }

  if (reason.type === "SHARED_RELATION") {
    return "Relacionada con capturas ya seleccionadas";
  }

  if (reason.type === "VECTOR_SIMILARITY") {
    return "Contenido parecido en tu memoria";
  }

  return "Comparte capturas cercanas";
}

function formatTermForDisplay(term: string) {
  return term;
}

function buildReasons(
  terms: string[],
  phrases: string[],
  relationScore: number,
  selectedCaptureIds: string[],
  sharedNeighbors: string[],
): AssociationReason[] {
  const reasons: AssociationReason[] = [];

  if (phrases.length > 0) {
    reasons.push({ type: "PHRASE_MATCH", phrases: phrases.slice(0, 2) });
  }

  if (terms.length > 0) {
    reasons.push({ type: "TERM_MATCH", terms: terms.slice(0, 4) });
  }

  if (relationScore > 0) {
    reasons.push({
      type: "SHARED_RELATION",
      relatedCaptureIds: selectedCaptureIds.slice(0, 4),
    });
  }

  if (sharedNeighbors.length > 0) {
    reasons.push({
      type: "SHARED_NEIGHBOR",
      captureIds: uniqueTokens(sharedNeighbors).slice(0, 4),
    });
  }

  return reasons;
}

function hasMeaningfulPhraseOverlap(phrases: string[]) {
  return phrases.some((phrase) =>
    phrase
      .split(/\s+/)
      .filter(Boolean)
      .some(isMeaningfulLocalSupportToken),
  );
}

function hasRareCommonTermSupport(index: AssociationIndex, terms: string[]) {
  return terms.some((term) => {
    if (!isMeaningfulLocalSupportToken(term)) {
      return false;
    }

    const documentFrequency = index.documentFrequency.get(term) ?? 0;
    const documentRatio = documentFrequency / Math.max(index.captures.length, 1);

    return (
      documentFrequency >= MIN_RECURRENT_ANCHOR_DOCUMENT_FREQUENCY &&
      documentRatio <= 0.35
    );
  });
}

function createAssociationExcerpt(
  content: string,
  terms: string[],
  phrases: string[],
) {
  const compactContent = content.trim().replace(/\s+/g, " ");

  if (!compactContent) {
    return "Sin contenido";
  }

  const normalizedContent = normalizeAssociationText(compactContent);
  const firstMatch = [...phrases, ...terms]
    .map((value) => normalizedContent.indexOf(value))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return compactContent.slice(0, 160);
  }

  const start = Math.max(0, firstMatch - 70);
  const end = Math.min(compactContent.length, firstMatch + 110);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compactContent.length ? "..." : "";

  return `${prefix}${compactContent.slice(start, end).trim()}${suffix}`;
}

function getIdf(index: AssociationIndex, token: string) {
  const documentCount = Math.max(index.captures.length, 1);
  const df = index.documentFrequency.get(token) ?? 0;

  return Math.log((documentCount + 1) / (df + 1)) + 1;
}

function bySuggestionPriority(
  a: AssociationSuggestion,
  b: AssociationSuggestion,
) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const dateDiff =
    Date.parse(getContentTimestamp(b.node)) - Date.parse(getContentTimestamp(a.node));

  if (dateDiff !== 0) {
    return dateDiff;
  }

  return a.node.id.localeCompare(b.node.id);
}

export function createAssociationContentDeduplicationKey(content: unknown) {
  return captureMarkdownToEmbeddingText(safeText(content))
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(SUPERFICIAL_BOUNDARY_PUNCTUATION, "")
    .trim();
}

export function dedupeAssociationSuggestionsByContent(
  suggestions: AssociationSuggestion[],
) {
  const suggestionsByContent = new Map<string, AssociationSuggestion>();

  for (const suggestion of suggestions) {
    const contentKey = createAssociationContentDeduplicationKey(
      suggestion.node.content,
    );
    const deduplicationKey = contentKey || `capture:${suggestion.node.id}`;
    const currentSuggestion = suggestionsByContent.get(deduplicationKey);

    if (
      !currentSuggestion ||
      bySuggestionPriority(suggestion, currentSuggestion) < 0
    ) {
      suggestionsByContent.set(deduplicationKey, suggestion);
    }
  }

  return Array.from(suggestionsByContent.values());
}

function mergeSuggestions(...groups: AssociationSuggestion[][]) {
  const suggestions = new Map<string, AssociationSuggestion>();

  for (const group of groups) {
    for (const suggestion of group) {
      suggestions.set(suggestion.node.id, suggestion);
    }
  }

  return Array.from(suggestions.values());
}

function areCapturesAssociated(
  relations: NodeContextRelation[],
  firstId: string,
  secondId: string,
) {
  const pair = normalizeAssociationPair(firstId, secondId);

  return relations.some(
    (relation) =>
      relation.nodeId === pair.nodeId && relation.contextId === pair.relatedNodeId,
  );
}

function isCaptureAssociationRelation(relation: NodeContextRelation) {
  return (
    relation.relationType === "CAPTURE_ASSOCIATION" &&
    typeof relation.relatedNodeId === "string" &&
    relation.relatedNodeId.length > 0 &&
    typeof relation.nodeId === "string" &&
    typeof relation.contextId === "string"
  );
}

function isIndexableActiveNode(node: Node) {
  return (
    typeof node.id === "string" &&
    node.id.length > 0 &&
    node.deletedAt === null &&
    !node.archivedAt &&
    typeof node.content === "string"
  );
}

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function createQueryNode(content: string): Node {
  return {
    id: "__query__",
    workspaceId: "__query__",
    type: "NOTE",
    content,
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    deletedAt: null,
    createdByDeviceId: "__query__",
    lastModifiedByDeviceId: "__query__",
  };
}
