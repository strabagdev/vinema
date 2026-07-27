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
import type {
  AssociationIndexedCapture,
  AssociationReason,
  AssociationSuggestion,
} from "@/features/associations/association-types";

const MIN_QUERY_TOKENS = 1;
const MIN_QUERY_LENGTH = 4;
const MIN_SUGGESTION_SCORE = 0.045;
const MAX_SUGGESTIONS = 5;

export type AssociationEngineInput = {
  nodes: Node[];
  relations?: NodeContextRelation[];
};

export type SuggestAssociationsInput = {
  text: string;
  currentNodeId?: string;
  selectedCaptureIds?: string[];
  limit?: number;
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

  const query = indexText(input.text);
  const selectedCaptureIds = input.selectedCaptureIds ?? [];
  const scoredSuggestions = index.captures
    .filter((capture) => capture.node.id !== input.currentNodeId)
    .map((capture) =>
      scoreCapture(index, query, capture, selectedCaptureIds),
    )
    .filter((suggestion): suggestion is AssociationSuggestion => suggestion !== null)
    .sort(bySuggestionPriority);
  const selectedSuggestions = scoredSuggestions.filter((suggestion) =>
    selectedCaptureIds.includes(suggestion.node.id),
  );
  const suggestions = scoredSuggestions.filter(
    (suggestion) => suggestion.score >= MIN_SUGGESTION_SCORE,
  );
  const visibleSuggestions = mergeSuggestions(selectedSuggestions, suggestions);

  return visibleSuggestions.slice(
    0,
    Math.max(input.limit ?? MAX_SUGGESTIONS, selectedSuggestions.length),
  );
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

  if (reasons.length === 0) {
    return null;
  }

  return {
    node: capture.node,
    score,
    excerpt: createAssociationExcerpt(capture.node.content, commonTerms, commonPhrases),
    reasons,
  };
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

  return "Comparte capturas cercanas";
}

function formatTermForDisplay(term: string) {
  const knownTerms: Record<string, string> = {
    concentr: "concentración",
    gestion: "gestión",
    plan: "planificación",
    reunion: "reuniones",
  };

  return knownTerms[term] ?? term;
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
    node.status === "ACTIVE" &&
    node.deletedAt === null &&
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
