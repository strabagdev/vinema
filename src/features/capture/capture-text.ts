import type { Device } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import type { Workspace } from "@/domain/workspace/workspace";
import { createNode } from "@/features/node/create-node";

export type CaptureTextInput = {
  content: string;
  workspace: Workspace;
  device: Device;
};

export async function captureText(
  repository: NodeRepository,
  input: CaptureTextInput,
): Promise<Node> {
  return createNode(repository, {
    type: "NOTE",
    content: input.content,
    organizationStatus: "ORGANIZED",
    workspace: input.workspace,
    device: input.device,
  });
}
