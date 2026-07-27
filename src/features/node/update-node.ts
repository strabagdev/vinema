import type { Device } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import { validateEditableNode } from "@/features/node/node-validation";

export type UpdateNodeInput = {
  id: string;
  content: string;
  device: Device;
};

export async function updateNode(
  repository: NodeRepository,
  input: UpdateNodeInput,
): Promise<Node> {
  const existingNode = await repository.findById(input.id);

  if (!existingNode) {
    throw new Error("No se encontro la captura.");
  }

  const validated = validateEditableNode({
    content: input.content,
    organizationStatus: existingNode.organizationStatus,
  });
  const now = new Date().toISOString();

  const updatedNode: Node = {
    ...existingNode,
    content: validated.content,
    version: existingNode.version + 1,
    contentUpdatedAt: now,
    updatedAt: now,
    lastModifiedByDeviceId: input.device.id,
  };

  return repository.update(updatedNode);
}
