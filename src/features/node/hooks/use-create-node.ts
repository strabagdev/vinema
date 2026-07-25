"use client";

import { useState } from "react";
import type { Device } from "@/domain/device/device";
import type { Node, NodeOrganizationStatus, NodeType } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import { createNode } from "@/features/node/create-node";
import { nodeRepository } from "@/infrastructure/repositories";

export function useCreateNode() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(input: {
    type: NodeType;
    title: string;
    content: string;
    organizationStatus: NodeOrganizationStatus;
    workspace: Workspace;
    device: Device;
  }): Promise<Node | null> {
    setSaving(true);
    setError(null);

    try {
      return await createNode(nodeRepository, input);
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
