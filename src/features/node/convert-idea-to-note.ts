import type { Device } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";

export async function convertIdeaToNote(
  repository: NodeRepository,
  id: string,
  device: Device,
): Promise<Node> {
  const existingNode = await repository.findById(id);

  if (!existingNode) {
    throw new Error("No se encontro la idea.");
  }

  const now = new Date().toISOString();
  const updatedNode: Node = {
    ...existingNode,
    type: "NOTE",
    organizationStatus: "ORGANIZED",
    version: existingNode.version + 1,
    contentUpdatedAt: now,
    updatedAt: now,
    lastModifiedByDeviceId: device.id,
  };

  return repository.update(updatedNode);
}
