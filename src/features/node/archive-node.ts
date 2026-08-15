import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";

export async function archiveNode(
  repository: NodeRepository,
  input: { id: string; archivedAt?: string },
): Promise<Node> {
  return repository.archive(input.id, input.archivedAt ?? new Date().toISOString());
}
