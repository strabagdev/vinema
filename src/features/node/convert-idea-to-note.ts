import type { Device } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import { createTitleFromContent } from "@/features/node/node-display";

export async function convertIdeaToNote(
  repository: NodeRepository,
  id: string,
  device: Device,
): Promise<Node> {
  const existingNode = await repository.findById(id);

  if (!existingNode) {
    throw new Error("No se encontro la idea.");
  }

  const updatedNode: Node = {
    ...existingNode,
    type: "NOTE",
    title: existingNode.title.trim() || createTitleFromContent(existingNode.content),
    organizationStatus: "ORGANIZED",
    version: existingNode.version + 1,
    updatedAt: new Date().toISOString(),
    lastModifiedByDeviceId: device.id,
  };

  return repository.update(updatedNode);
}
