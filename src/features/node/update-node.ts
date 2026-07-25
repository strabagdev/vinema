import type { Device } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import { validateEditableNode } from "@/features/node/node-validation";

export type UpdateNodeInput = {
  id: string;
  title: string;
  content: string;
  device: Device;
};

export async function updateNode(
  repository: NodeRepository,
  input: UpdateNodeInput,
): Promise<Node> {
  const existingNode = await repository.findById(input.id);

  if (!existingNode) {
    throw new Error("No se encontro la nota.");
  }

  const validated = validateEditableNode({
    title: input.title,
    content: input.content,
    organizationStatus: existingNode.organizationStatus,
  });

  const updatedNode: Node = {
    ...existingNode,
    title: validated.title,
    content: validated.content,
    version: existingNode.version + 1,
    updatedAt: new Date().toISOString(),
    lastModifiedByDeviceId: input.device.id,
  };

  return repository.update(updatedNode);
}
