"use client";

import { useState } from "react";
import type { Device } from "@/domain/device/device";
import type { Node, NodeOrganizationStatus, NodeType } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import { createNode } from "@/features/node/create-node";
import { createLocalSyncRepositorySet } from "@/infrastructure/repositories";

export function useCreateNode() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(input: {
    type: NodeType;
    content: string;
    organizationStatus: NodeOrganizationStatus;
    workspace: Workspace;
    device: Device;
  }): Promise<Node | null> {
    setSaving(true);
    setError(null);

    try {
      const repositories = createLocalSyncRepositorySet({
        workspaceId: input.workspace.id,
        deviceId: input.device.id,
      });
      return await createNode(repositories.nodeRepository, input);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  return { create, saving, error, setError };
}
