import { describe, expect, it, vi } from "vitest";
import {
  emitSyncDataChanged,
  subscribeToSyncDataChanged,
} from "@/features/sync/sync-data-events";

describe("sync data events", () => {
  it("notifies subscribers with minimal workspace-scoped metadata", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSyncDataChanged(listener);

    emitSyncDataChanged({
      workspaceId: "workspace-1",
      entityTypes: ["capture", "capture", "concept"],
      changedAt: "2026-07-31T12:00:00.000Z",
    });

    expect(listener).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      entityTypes: ["capture", "concept"],
      changedAt: "2026-07-31T12:00:00.000Z",
    });
    unsubscribe();
  });

  it("supports unsubscribe and ignores empty invalidations", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSyncDataChanged(listener);

    emitSyncDataChanged({
      workspaceId: "",
      entityTypes: ["capture"],
      changedAt: "2026-07-31T12:00:00.000Z",
    });
    emitSyncDataChanged({
      workspaceId: "workspace-1",
      entityTypes: [],
      changedAt: "2026-07-31T12:00:00.000Z",
    });
    unsubscribe();
    emitSyncDataChanged({
      workspaceId: "workspace-1",
      entityTypes: ["capture"],
      changedAt: "2026-07-31T12:00:00.000Z",
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
