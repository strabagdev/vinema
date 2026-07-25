import type { Device } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";

export async function archiveNode(
  repository: NodeRepository,
  id: string,
  device: Device,
): Promise<Node> {
  const existingNode = await repository.findById(id);

  if (!existingNode) {
    throw new Error("No se encontro la nota.");
  }

  const archivedNode: Node = {
    ...existingNode,
    status: "ARCHIVED",
    version: existingNode.version + 1,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    lastModifiedByDeviceId: device.id,
  };

  return repository.update(archivedNode);
}
