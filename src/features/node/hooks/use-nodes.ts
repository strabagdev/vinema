"use client";

import { useCallback, useEffect, useState } from "react";
import type { Node } from "@/domain/node/node";
import { listActiveNodes, listInboxNodes } from "@/features/node/list-nodes";
import { nodeRepository } from "@/infrastructure/repositories";

type NodeListKind = "active" | "inbox";

export function useNodes(kind: NodeListKind) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextNodes =
        kind === "active"
          ? await listActiveNodes(nodeRepository)
          : await listInboxNodes(nodeRepository);
      setNodes(nextNodes);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar la lista.",
      );
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    queueMicrotask(() => {
      refresh();
    });
  }, [refresh]);

  return { nodes, loading, error, refresh, setNodes };
}
