"use client";

import { useCallback, useEffect, useState } from "react";
import type { Node } from "@/domain/node/node";
import { getNode } from "@/features/node/get-node";
import { nodeRepository } from "@/infrastructure/repositories";

export function useNode(nodeId: string) {
  const [node, setNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextNode = await getNode(nodeRepository, nodeId);
      setNode(nextNode);

      if (!nextNode) {
        setError("No se encontro la nota.");
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar la nota.",
      );
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    queueMicrotask(() => {
      refresh();
    });
  }, [refresh]);

  return { node, loading, error, refresh, setNode };
}
