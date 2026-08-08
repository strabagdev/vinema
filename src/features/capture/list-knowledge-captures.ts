import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import { compareByContentTimestamp } from "@/features/capture/capture-timestamps";

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

export function sortKnowledgeCaptures(nodes: Node[]): Node[] {
  return [...nodes].sort(compareByContentTimestamp);
}

function isActiveRecoverableNode(node: Node) {
  return node.deletedAt === null;
}
