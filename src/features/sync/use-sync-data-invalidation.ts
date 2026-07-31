"use client";

import { useEffect } from "react";
import {
  subscribeToSyncDataChanged,
  type SyncDataEntityType,
} from "@/features/sync/sync-data-events";

export function useSyncDataInvalidation({
  workspaceId,
  entityTypes,
  onInvalidate,
}: {
  workspaceId: string | null;
  entityTypes: readonly SyncDataEntityType[];
  onInvalidate: () => void;
}) {
  useEffect(() => {
    if (!workspaceId || entityTypes.length === 0) {
      return;
    }

    const expectedTypes = new Set(entityTypes);
    return subscribeToSyncDataChanged((detail) => {
      if (detail.workspaceId !== workspaceId) {
        return;
      }

      if (!detail.entityTypes.some((entityType) => expectedTypes.has(entityType))) {
        return;
      }

      onInvalidate();
    });
  }, [entityTypes, onInvalidate, workspaceId]);
}
