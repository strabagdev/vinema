"use client";

import { useEffect } from "react";
import type { NodeRepository } from "@/domain/node/node-repository";
import type { ContextRepository } from "@/domain/context/context-repository";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import { createMemoryEvidenceModel } from "@/features/cognition/memory-evidence/memory-evidence-model";
import { subscribeToSyncDataChanged } from "@/features/sync/sync-data-events";
import { getSemanticSimilarityService } from "@/features/semantic-similarity/semantic-similarity-service";

export function useSemanticSimilarityIndexing({
  workspaceId,
  nodeRepository,
  contextRepository,
  relationRepository,
  enabled = true,
}: {
  workspaceId: string;
  nodeRepository: NodeRepository | null;
  contextRepository?: ContextRepository | null;
  relationRepository?: NodeContextRelationRepository | null;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled || !workspaceId || !nodeRepository) {
      return;
    }

    const service = getSemanticSimilarityService(nodeRepository);
    async function backfill() {
      try {
        await service.backfillWorkspace(workspaceId, { limit: 4 });

        if (
          !contextRepository ||
          !relationRepository ||
          !nodeRepository ||
          typeof contextRepository.list !== "function" ||
          typeof relationRepository.listByWorkspace !== "function" ||
          typeof nodeRepository.listByWorkspace !== "function"
        ) {
          return;
        }

        const [contexts, relations, nodes] = await Promise.all([
          contextRepository.list({ workspaceId }),
          relationRepository.listByWorkspace(workspaceId),
          nodeRepository.listByWorkspace(workspaceId),
        ]);
        const evidenceModel = createMemoryEvidenceModel({
          contexts,
          relations,
          nodes,
          recentWindowDays: 30,
        });
        await service.backfillConceptsFromEvidenceModel(workspaceId, evidenceModel, {
          limit: 4,
        });
      } catch {
        // Semantic indexing is derived local evidence; missing mocks or runtime failures must not affect capture flow.
      }
    }

    void backfill();

    return subscribeToSyncDataChanged((event) => {
      if (event.workspaceId !== workspaceId || !event.entityTypes.includes("capture")) {
        return;
      }

      void backfill();
    });
  }, [
    contextRepository,
    enabled,
    nodeRepository,
    relationRepository,
    workspaceId,
  ]);
}
