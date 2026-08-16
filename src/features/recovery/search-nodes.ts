import type { Context } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import { getCapturePreview } from "@/features/node/node-display";
import {
  normalizeRecoveryText,
  tokenizeRecoveryQuery,
} from "@/features/recovery/recovery-normalization";
import type {
  RecoveryMatchedField,
  RecoveryRankCategory,
  RecoveryResult,
} from "@/features/recovery/recovery-result";
import type { SemanticSimilarityPolicy } from "@/features/semantic-similarity/semantic-similarity-engine";

const EXCERPT_RADIUS = 72;
const RANK_CATEGORY_PRIORITY: Record<RecoveryRankCategory, number> = {
  literal: 1,
  "canonical-concept": 2,
  alias: 3,
  "explicit-association": 4,
  "backed-relationship": 5,
};

export type SearchNodesRepositories = {
  contextRepository: ContextRepository;
  nodeContextRelationRepository: NodeContextRelationRepository;
  nodeRepository: NodeRepository;
  semanticSimilarity?: {
    findSimilarCaptures(input: {
      workspaceId: string;
      text: string;
      topK?: number;
      policy?: SemanticSimilarityPolicy;
    }): Promise<
      Array<{
        node: Node;
        evidence: {
          similarity: number;
          rank: number;
          marginToNext: number | null;
        };
      }>
    >;
  };
};

export type SearchNodesInput = {
  workspaceId: string;
  query: string;
  includeContexts?: boolean;
  scope?: "active" | "all";
};

export async function searchNodes(
  repositories: SearchNodesRepositories,
  input: SearchNodesInput,
): Promise<RecoveryResult[]> {
  const normalizedQuery = normalizeRecoveryText(input.query);
  const queryTokens = tokenizeRecoveryQuery(input.query);

  if (!normalizedQuery || queryTokens.length === 0) {
    return [];
  }

  const nodes = (
    await repositories.nodeRepository.listByWorkspace(input.workspaceId)
  ).filter((node) => node.deletedAt === null && !node.archivedAt);
  const relations = await repositories.nodeContextRelationRepository.listByWorkspace(
    input.workspaceId,
  );
  const contextsById = await loadContextsById(
    repositories.contextRepository,
    relations.map((relation) => relation.contextId),
    input.workspaceId,
  );
  const relationsByNodeId = groupRelationsByNodeId(relations);
  const conceptMatchesByContextId = buildConceptMatchesByContextId(
    contextsById,
    normalizedQuery,
    queryTokens,
  );
  const relationshipEvidenceByNodeId = buildRelationshipEvidenceByNodeId({
    nodes,
    relations,
    contextsById,
    conceptMatchesByContextId,
    normalizedQuery,
    queryTokens,
  });
  const results = nodes.map((node) => {
    const allContexts = listContextsForNode(
      relationsByNodeId,
      contextsById,
      node.id,
    );
    const contexts = input.includeContexts === false ? [] : allContexts;

    return buildRecoveryResult({
      node,
      contexts,
      allContexts,
      conceptMatchesByContextId,
      relationshipEvidence: relationshipEvidenceByNodeId.get(node.id) ?? null,
      normalizedQuery,
      queryTokens,
    });
  });

  const literalResults = results
    .filter((result): result is RecoveryResult => result !== null)
    .sort(byRecoveryPriority);
  const semanticResults = repositories.semanticSimilarity
    ? await buildSemanticRecoveryResults(repositories, input)
    : [];
  return mergeRecoveryResults(literalResults, semanticResults)
    .sort(byRecoveryPriority)
    .map((result, index) => ({ ...result, searchRank: index + 1 }));
}

async function buildSemanticRecoveryResults(
  repositories: SearchNodesRepositories,
  input: SearchNodesInput,
): Promise<RecoveryResult[]> {
  const semanticMatches =
    (await repositories.semanticSimilarity?.findSimilarCaptures({
      workspaceId: input.workspaceId,
      text: input.query,
      topK: 8,
      policy: "search",
    })) ?? [];

  return semanticMatches
    .filter((match) => match.node.deletedAt === null && !match.node.archivedAt)
    .map((match) => ({
      nodeId: match.node.id,
      preview: getCapturePreview(match.node.content, { maxLength: 90 }),
      excerpt:
        getCapturePreview(match.node.content, { maxLength: 160 }) || "Sin contenido",
      matchedFields: ["semantic" as const],
      contexts: [],
      updatedAt: getContentTimestamp(match.node),
      score: 0,
      semantic: {
        similarity: match.evidence.similarity,
        rank: match.evidence.rank,
        marginToNext: match.evidence.marginToNext,
      },
    }));
}

function mergeRecoveryResults(
  literalResults: RecoveryResult[],
  semanticResults: RecoveryResult[],
) {
  const results = new Map<string, RecoveryResult>();

  for (const result of literalResults) {
    results.set(result.nodeId, result);
  }

  for (const result of semanticResults) {
    const existing = results.get(result.nodeId);

    if (!existing) {
      continue;
    }

    results.set(result.nodeId, {
      ...existing,
      matchedFields: Array.from(
        new Set([...existing.matchedFields, ...result.matchedFields]),
      ),
      score: existing.score + 1,
      semantic: result.semantic,
    });
  }

  return Array.from(results.values());
}

function buildRecoveryResult(input: {
  node: Node;
  contexts: Context[];
  allContexts: Context[];
  conceptMatchesByContextId: Map<string, ConceptMatch>;
  relationshipEvidence: RelationshipEvidence | null;
  normalizedQuery: string;
  queryTokens: string[];
}): RecoveryResult | null {
  const {
    node,
    contexts,
    allContexts,
    conceptMatchesByContextId,
    relationshipEvidence,
    normalizedQuery,
    queryTokens,
  } = input;
  const normalizedContent = normalizeRecoveryText(node.content);
  const normalizedContextText = normalizeRecoveryText(
    allContexts.map((context) => context.name).join(" "),
  );
  const matchedFields = new Set<RecoveryMatchedField>();
  let score = 0;
  let rankCategory: RecoveryRankCategory | null = null;

  if (includesQuery(normalizedContent, normalizedQuery, queryTokens)) {
    matchedFields.add("content");
    score += 100;
    rankCategory = bestRankCategory(rankCategory, "literal");
  }

  const conceptMatch = bestConceptMatch(
    allContexts,
    conceptMatchesByContextId,
  );

  if (conceptMatch) {
    matchedFields.add("context");
    matchedFields.add(conceptMatch.field);
    matchedFields.add("association");
    score += conceptMatch.field === "concept" ? 80 : 70;
    rankCategory = bestRankCategory(
      rankCategory,
      conceptMatch.field === "concept" ? "canonical-concept" : "alias",
    );
  } else if (includesQuery(normalizedContextText, normalizedQuery, queryTokens)) {
    matchedFields.add("context");
    score += 65;
    rankCategory = bestRankCategory(rankCategory, "explicit-association");
  }

  if (relationshipEvidence) {
    matchedFields.add("relationship");
    score += relationshipEvidence.score;
    rankCategory = bestRankCategory(rankCategory, "backed-relationship");
  }

  const matchedTokenCount = queryTokens.filter(
    (token) =>
      normalizedContent.includes(token) ||
      normalizedContextText.includes(token),
  ).length;

  score += matchedTokenCount;

  if (matchedFields.size === 0) {
    return null;
  }

  return {
    nodeId: node.id,
    preview: getCapturePreview(node.content, { maxLength: 90 }),
    excerpt: createRecoveryExcerpt(node, normalizedQuery, queryTokens),
    matchedFields: Array.from(matchedFields),
    contexts: contexts.map((context) => ({
      id: context.id,
      name: context.name,
      type: context.type,
    })),
    updatedAt: getContentTimestamp(node),
    score,
    rankCategory: rankCategory ?? "literal",
  };
}

function includesQuery(
  normalizedValue: string,
  normalizedQuery: string,
  queryTokens: string[],
) {
  return (
    normalizedValue.includes(normalizedQuery) ||
    queryTokens.every((token) => normalizedValue.includes(token))
  );
}

type ConceptMatch = {
  field: "concept" | "alias";
  score: number;
};

type RelationshipEvidence = {
  score: number;
};

async function loadContextsById(
  contextRepository: ContextRepository,
  contextIds: string[],
  workspaceId: string,
) {
  const uniqueContextIds = Array.from(new Set(contextIds));
  const contexts = await Promise.all(
    uniqueContextIds.map((contextId) => contextRepository.getById(contextId)),
  );

  return new Map(
    contexts
      .filter((context): context is Context => context !== null)
      .filter((context) => context.workspaceId === workspaceId && !context.archivedAt)
      .map((context) => [context.id, context]),
  );
}

function groupRelationsByNodeId(relations: NodeContextRelation[]) {
  const byNodeId = new Map<string, NodeContextRelation[]>();

  for (const relation of relations) {
    byNodeId.set(relation.nodeId, [...(byNodeId.get(relation.nodeId) ?? []), relation]);
  }

  return byNodeId;
}

function listContextsForNode(
  relationsByNodeId: Map<string, NodeContextRelation[]>,
  contextsById: Map<string, Context>,
  nodeId: string,
) {
  return (relationsByNodeId.get(nodeId) ?? [])
    .map((relation) => contextsById.get(relation.contextId))
    .filter((context): context is Context => context !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildConceptMatchesByContextId(
  contextsById: Map<string, Context>,
  normalizedQuery: string,
  queryTokens: string[],
) {
  const matches = new Map<string, ConceptMatch>();

  for (const context of contextsById.values()) {
    if (includesQuery(normalizeRecoveryText(context.name), normalizedQuery, queryTokens)) {
      matches.set(context.id, { field: "concept", score: 80 });
      continue;
    }

    const aliases = [
      ...(context.aliases ?? []),
      ...(context.normalizedAliases ?? []),
    ];
    const aliasMatches = aliases.some((alias) =>
      includesQuery(normalizeRecoveryText(alias), normalizedQuery, queryTokens),
    );

    if (aliasMatches) {
      matches.set(context.id, { field: "alias", score: 70 });
    }
  }

  return matches;
}

function bestConceptMatch(
  contexts: Context[],
  conceptMatchesByContextId: Map<string, ConceptMatch>,
) {
  return contexts
    .map((context) => conceptMatchesByContextId.get(context.id))
    .filter((match): match is ConceptMatch => Boolean(match))
    .sort((first, second) => second.score - first.score)[0] ?? null;
}

function buildRelationshipEvidenceByNodeId(input: {
  nodes: Node[];
  relations: NodeContextRelation[];
  contextsById: Map<string, Context>;
  conceptMatchesByContextId: Map<string, ConceptMatch>;
  normalizedQuery: string;
  queryTokens: string[];
}) {
  const evidenceBackedNodeIds = new Set<string>();
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const relationsByNodeId = groupRelationsByNodeId(input.relations);

  for (const node of input.nodes) {
    const normalizedContent = normalizeRecoveryText(node.content);

    if (includesQuery(normalizedContent, input.normalizedQuery, input.queryTokens)) {
      evidenceBackedNodeIds.add(node.id);
      continue;
    }

    const contexts = listContextsForNode(relationsByNodeId, input.contextsById, node.id);

    if (bestConceptMatch(contexts, input.conceptMatchesByContextId)) {
      evidenceBackedNodeIds.add(node.id);
    }
  }

  const relationshipEvidence = new Map<string, RelationshipEvidence>();

  for (const relation of input.relations) {
    if (relation.relationType !== "CAPTURE_ASSOCIATION") {
      continue;
    }

    const relatedNodeId = relation.relatedNodeId ?? relation.contextId;
    const firstNode = nodesById.get(relation.nodeId);
    const secondNode = nodesById.get(relatedNodeId);

    if (!firstNode || !secondNode) {
      continue;
    }

    if (evidenceBackedNodeIds.has(firstNode.id)) {
      relationshipEvidence.set(secondNode.id, { score: 45 });
    }

    if (evidenceBackedNodeIds.has(secondNode.id)) {
      relationshipEvidence.set(firstNode.id, { score: 45 });
    }
  }

  return relationshipEvidence;
}

function bestRankCategory(
  current: RecoveryRankCategory | null,
  candidate: RecoveryRankCategory,
) {
  if (!current) {
    return candidate;
  }

  return RANK_CATEGORY_PRIORITY[candidate] < RANK_CATEGORY_PRIORITY[current]
    ? candidate
    : current;
}

function getRankCategoryPriority(result: RecoveryResult) {
  return RANK_CATEGORY_PRIORITY[result.rankCategory ?? "literal"];
}

function byRecoveryPriority(first: RecoveryResult, second: RecoveryResult) {
  const categoryDelta = getRankCategoryPriority(first) - getRankCategoryPriority(second);

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  if (second.score !== first.score) {
    return second.score - first.score;
  }

  return Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
}

function createRecoveryExcerpt(
  node: Node,
  normalizedQuery: string,
  queryTokens: string[],
) {
  const normalizedContent = normalizeRecoveryText(node.content);
  const queryIndex = normalizedContent.indexOf(normalizedQuery);
  const tokenIndex =
    queryIndex >= 0
      ? queryIndex
      : Math.min(
          ...queryTokens
            .map((token) => normalizedContent.indexOf(token))
            .filter((index) => index >= 0),
        );

  if (!Number.isFinite(tokenIndex)) {
    return node.content.trim().replace(/\s+/g, " ").slice(0, 160) || "Sin contenido";
  }

  const compactContent = node.content.trim().replace(/\s+/g, " ");
  const start = Math.max(0, tokenIndex - EXCERPT_RADIUS);
  const end = Math.min(compactContent.length, tokenIndex + EXCERPT_RADIUS);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compactContent.length ? "..." : "";

  return `${prefix}${compactContent.slice(start, end).trim()}${suffix}`;
}
