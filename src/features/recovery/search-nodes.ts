import type { Context } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";
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
  RecoveryResult,
} from "@/features/recovery/recovery-result";

const EXCERPT_RADIUS = 72;

export type SearchNodesRepositories = {
  contextRepository: ContextRepository;
  nodeContextRelationRepository: NodeContextRelationRepository;
  nodeRepository: NodeRepository;
  semanticSimilarity?: {
    findSimilarCaptures(input: {
      workspaceId: string;
      text: string;
      topK?: number;
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
  const results = await Promise.all(
    nodes.map(async (node) => {
      const contexts =
        input.includeContexts === false
          ? []
          : await listContextsForNode(
              repositories.contextRepository,
              repositories.nodeContextRelationRepository,
              node.id,
              input.workspaceId,
            );

      return buildRecoveryResult(
        node,
        contexts,
        normalizedQuery,
        queryTokens,
      );
    }),
  );

  const literalResults = results
    .filter((result): result is RecoveryResult => result !== null)
    .sort(byRecoveryPriority);
  const semanticResults = repositories.semanticSimilarity
    ? await buildSemanticRecoveryResults(repositories, input)
    : [];

  return mergeRecoveryResults(literalResults, semanticResults).sort(byRecoveryPriority);
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
      score: 8 + Math.round(match.evidence.similarity * 10),
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
      results.set(result.nodeId, result);
      continue;
    }

    results.set(result.nodeId, {
      ...existing,
      matchedFields: Array.from(
        new Set([...existing.matchedFields, ...result.matchedFields]),
      ),
      score: existing.score + 3,
      semantic: result.semantic,
    });
  }

  return Array.from(results.values());
}

function buildRecoveryResult(
  node: Node,
  contexts: Context[],
  normalizedQuery: string,
  queryTokens: string[],
): RecoveryResult | null {
  const normalizedContent = normalizeRecoveryText(node.content);
  const normalizedContextText = normalizeRecoveryText(
    contexts.map((context) => context.name).join(" "),
  );
  const matchedFields = new Set<RecoveryMatchedField>();
  let score = 0;

  if (includesQuery(normalizedContextText, normalizedQuery, queryTokens)) {
    matchedFields.add("context");
    score += 40;
  }

  if (includesQuery(normalizedContent, normalizedQuery, queryTokens)) {
    matchedFields.add("content");
    score += 20;
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
  };
}

async function listContextsForNode(
  contextRepository: ContextRepository,
  relationRepository: NodeContextRelationRepository,
  nodeId: string,
  workspaceId: string,
) {
  const relations = await relationRepository.listByNodeId(nodeId);
  const contexts = await Promise.all(
    relations.map((relation) => contextRepository.getById(relation.contextId)),
  );

  return contexts
    .filter((context): context is Context => context !== null)
    .filter((context) => context.workspaceId === workspaceId)
    .sort((a, b) => a.name.localeCompare(b.name));
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

function byRecoveryPriority(a: RecoveryResult, b: RecoveryResult) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}
