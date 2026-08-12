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
import {
  createCompactConceptIdentityKey,
  createConceptIdentity,
  deriveConceptAcronym,
  isConceptIdentityLookupCandidate,
  normalizeConceptIdentityLabel,
} from "@/features/concepts/concept-identity";
import { extractSemanticPhraseCandidates } from "@/features/semantics/semantic-phrase-extractor";

export const MIN_CONCEPT_SCORE = 0.18;

export type ConceptSuggestionDiagnosis = {
  traces: ConceptSuggestionTrace[];
  metrics: {
    diagnosticRunCount: number;
    identityCandidateInitialCount: number;
    identityCandidateDeduplicatedCount: number;
    identityContextTraversalCount: number;
  };
};

type IdentityCandidate = {
  text: string;
  normalizedKey: string;
  compactKey: string;
  acronymKey: string;
};

type IdentityResolution =
  | {
      status: "EXACT" | "ALIAS";
      conceptId: string;
      matchedText: string;
      matchedAlias?: string;
    }
  | {
      status: "AMBIGUOUS" | "NEW";
      matchedText: string;
    };

type ConceptIdentityIndex = {
  exactCanonical: Map<string, Context[]>;
  normalizedCanonical: Map<string, Context[]>;
  compactCanonical: Map<string, Context[]>;
  exactAlias: Map<string, Context[]>;
  normalizedAlias: Map<string, Context[]>;
  compactAlias: Map<string, Context[]>;
  acronym: Map<string, Context[]>;
  contextTraversalCount: number;
};

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
  return buildConceptSuggestionsFromTraces({
    contexts,
    selectedContextIds,
    traces,
    limit,
  });
}

export function buildConceptSuggestionsFromTraces({
  contexts,
  selectedContextIds = [],
  traces,
  limit = 8,
}: {
  contexts: Context[];
  selectedContextIds?: string[];
  traces: ConceptSuggestionTrace[];
  limit?: number;
}): ConceptSuggestion[] {
  const selected = selectedConcepts(contexts, selectedContextIds);
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
  return diagnoseConceptSuggestionDetails({
    text,
    contexts,
    nodes,
    relations,
    selectedContextIds,
  }).traces;
}

export function diagnoseConceptSuggestionDetails({
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
}): ConceptSuggestionDiagnosis {
  const queryTokens = uniqueTokens(tokenizeAssociationText(text));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const identityCandidates = collectIdentityCandidates(text);
  const identityIndex = buildConceptIdentityIndex(contexts);
  const identityMatches = resolveIdentityMatches(identityCandidates, identityIndex);
  const relationsByContextId = new Map<string, NodeContextRelation[]>();

  for (const relation of relations) {
    if (relation.relationType === "CAPTURE_ASSOCIATION") {
      continue;
    }

    const current = relationsByContextId.get(relation.contextId) ?? [];
    current.push(relation);
    relationsByContextId.set(relation.contextId, current);
  }

  const traces = contexts.map((context) => {
    const contextTokens = uniqueTokens(
      tokenizeAssociationText(
        [
          context.name,
          context.description ?? "",
          ...(context.aliases ?? []),
          ...(context.normalizedAliases ?? []),
          deriveConceptAcronym(context.name),
        ].join(" "),
      ),
    );
    const relatedRelations = relationsByContextId.get(context.id) ?? [];
    const relatedCaptureIds = relatedRelations.map((relation) => relation.nodeId);
    const relatedContentTokens = uniqueTokens(
      tokenizeAssociationText(
        relatedRelations
          .map((relation) => nodesById.get(relation.nodeId)?.content ?? "")
          .join(" "),
      ),
    );
    const identityMatch = identityMatches.get(context.id) ?? null;
    const directMatches = overlapCount(queryTokens, contextTokens) +
      (identityMatch ? Math.max(1, queryTokens.length) : 0);
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
      matchedAlias: identityMatch?.matchedAlias,
      directMatches,
      relatedMatches,
      selectedBoost,
      score,
      threshold: MIN_CONCEPT_SCORE,
      included: score >= MIN_CONCEPT_SCORE,
    };
  });

  return {
    traces,
    metrics: {
      diagnosticRunCount: 1,
      identityCandidateInitialCount: identityCandidates.initialCount,
      identityCandidateDeduplicatedCount: identityCandidates.items.length,
      identityContextTraversalCount: identityIndex.contextTraversalCount,
    },
  };
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
    matchedAlias: trace.matchedAlias,
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

function collectIdentityCandidates(text: string): {
  initialCount: number;
  items: IdentityCandidate[];
} {
  const initialCandidates = [
    text,
    ...extractSemanticPhraseCandidates(text).map((candidate) => candidate.text),
    ...text.split(/\s+/).filter(Boolean),
    ...Array.from(text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}.-]*/gu), (match) => match[0]),
  ];
  const seen = new Set<string>();
  const items: IdentityCandidate[] = [];

  for (const candidate of initialCandidates) {
    const normalizedKey = normalizeConceptIdentityLabel(candidate);

    if (!normalizedKey || seen.has(normalizedKey)) {
      continue;
    }

    seen.add(normalizedKey);
    items.push({
      text: candidate,
      normalizedKey,
      compactKey: createCompactConceptIdentityKey(candidate),
      acronymKey: normalizeAcronym(candidate),
    });
  }

  return {
    initialCount: initialCandidates.length,
    items,
  };
}

function buildConceptIdentityIndex(contexts: Context[]): ConceptIdentityIndex {
  const index: ConceptIdentityIndex = {
    exactCanonical: new Map(),
    normalizedCanonical: new Map(),
    compactCanonical: new Map(),
    exactAlias: new Map(),
    normalizedAlias: new Map(),
    compactAlias: new Map(),
    acronym: new Map(),
    contextTraversalCount: contexts.length,
  };

  for (const context of contexts) {
    const identity = createConceptIdentity(context);

    addIdentityIndexValue(index.exactCanonical, context.name.trim(), context);
    addIdentityIndexValue(
      index.normalizedCanonical,
      identity.normalizedCanonicalLabel,
      context,
    );
    addIdentityIndexValue(
      index.compactCanonical,
      createCompactConceptIdentityKey(identity.canonicalLabel),
      context,
    );

    for (const alias of context.aliases ?? []) {
      addIdentityIndexValue(index.exactAlias, alias.trim(), context);
    }

    for (const alias of identity.normalizedAliases) {
      addIdentityIndexValue(index.normalizedAlias, alias, context);
    }

    for (const alias of identity.aliases) {
      addIdentityIndexValue(
        index.compactAlias,
        createCompactConceptIdentityKey(alias),
        context,
      );
    }

    addIdentityIndexValue(index.acronym, deriveConceptAcronym(context.name), context);
  }

  return index;
}

function resolveIdentityMatches(
  candidates: { items: IdentityCandidate[] },
  index: ConceptIdentityIndex,
) {
  const matches = new Map<string, { matchedText: string; matchedAlias?: string }>();

  for (const candidate of candidates.items) {
    const resolution = resolveIdentityCandidate(candidate, index);

    if (resolution.status !== "EXACT" && resolution.status !== "ALIAS") {
      continue;
    }

    if (!matches.has(resolution.conceptId)) {
      matches.set(resolution.conceptId, {
        matchedText: resolution.matchedText,
        matchedAlias: resolution.matchedAlias,
      });
    }
  }

  return matches;
}

function resolveIdentityCandidate(
  candidate: IdentityCandidate,
  index: ConceptIdentityIndex,
): IdentityResolution {
  if (!isConceptIdentityLookupCandidate(candidate.text)) {
    return { status: "NEW", matchedText: candidate.text };
  }

  return resolveIndexedIdentity(
    index.exactCanonical.get(candidate.text.trim()) ?? [],
    candidate.text,
    "EXACT",
  ) ?? resolveIndexedIdentity(
    index.normalizedCanonical.get(candidate.normalizedKey) ?? [],
    candidate.text,
    "EXACT",
  ) ?? resolveIndexedIdentity(
    index.compactCanonical.get(candidate.compactKey) ?? [],
    candidate.text,
    "EXACT",
  ) ?? resolveIndexedIdentity(
    index.exactAlias.get(candidate.text.trim()) ?? [],
    candidate.text,
    "ALIAS",
  ) ?? resolveIndexedIdentity(
    index.normalizedAlias.get(candidate.normalizedKey) ?? [],
    candidate.text,
    "ALIAS",
  ) ?? resolveIndexedIdentity(
    index.compactAlias.get(candidate.compactKey) ?? [],
    candidate.text,
    "ALIAS",
  ) ?? resolveIndexedIdentity(
    candidate.normalizedKey.length > 1
      ? index.acronym.get(candidate.acronymKey) ?? []
      : [],
    candidate.text,
    "ALIAS",
  ) ?? { status: "NEW", matchedText: candidate.text };
}

function resolveIndexedIdentity(
  contexts: Context[],
  matchedText: string,
  status: "EXACT" | "ALIAS",
): IdentityResolution | null {
  if (contexts.length === 0) {
    return null;
  }

  if (contexts.length > 1) {
    return {
      status: "AMBIGUOUS",
      matchedText,
    };
  }

  const [context] = contexts;

  return {
    status,
    conceptId: context.id,
    matchedText,
    matchedAlias: status === "ALIAS" ? matchedText : undefined,
  };
}

function addIdentityIndexValue(
  index: Map<string, Context[]>,
  key: string,
  context: Context,
) {
  if (!key) {
    return;
  }

  const current = index.get(key) ?? [];

  if (!current.some((item) => item.id === context.id)) {
    current.push(context);
  }

  index.set(key, current);
}

function normalizeAcronym(value: string) {
  return normalizeConceptIdentityLabel(value)
    .replace(/\s+/g, "")
    .toLocaleUpperCase("es");
}
