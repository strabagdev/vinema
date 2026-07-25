import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";

export async function getNode(
  repository: NodeRepository,
  id: string,
): Promise<Node | null> {
  return repository.findById(id);
}
