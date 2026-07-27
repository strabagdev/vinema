import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import {
  compareByArchivedTimestamp,
  compareByContentTimestamp,
} from "@/features/capture/capture-timestamps";

export const KNOWLEDGE_BASE_BATCH_SIZE = 20;

export type KnowledgeCapturePage = {
  items: Node[];
  total: number;
  hasMore: boolean;
};

export async function listKnowledgeCaptures(
  repository: NodeRepository,
  input: { workspaceId: string; limit?: number; offset?: number },
): Promise<Node[]> {
  const page = await listKnowledgeCapturePage(repository, input);
  return page.items;
}

export async function listKnowledgeCapturePage(
  repository: NodeRepository,
  input: { workspaceId: string; limit?: number; offset?: number },
): Promise<KnowledgeCapturePage> {
  const nodes = await repository.listByWorkspace(input.workspaceId);
  const offset = input.offset ?? 0;
  const limit = input.limit ?? KNOWLEDGE_BASE_BATCH_SIZE;
  const captures = sortKnowledgeCaptures(nodes.filter(isActiveRecoverableNode));

  return {
    items: captures.slice(offset, offset + limit),
    total: captures.length,
    hasMore: offset + limit < captures.length,
  };
}

export async function listArchivedCapturePage(
  repository: NodeRepository,
  input: { workspaceId: string; limit?: number; offset?: number },
): Promise<KnowledgeCapturePage> {
  const nodes = await repository.listByWorkspace(input.workspaceId, {
    includeArchived: true,
  });
  const offset = input.offset ?? 0;
  const limit = input.limit ?? KNOWLEDGE_BASE_BATCH_SIZE;
  const captures = sortArchivedCaptures(nodes.filter(isArchivedRecoverableNode));

  return {
    items: captures.slice(offset, offset + limit),
    total: captures.length,
    hasMore: offset + limit < captures.length,
  };
}

export function sortKnowledgeCaptures(nodes: Node[]): Node[] {
  return [...nodes].sort(compareByContentTimestamp);
}

export function sortArchivedCaptures(nodes: Node[]): Node[] {
  return [...nodes].sort(compareByArchivedTimestamp);
}

function isActiveRecoverableNode(node: Node) {
  return node.deletedAt === null && node.status === "ACTIVE";
}

function isArchivedRecoverableNode(node: Node) {
  return node.deletedAt === null && node.status === "ARCHIVED";
}
