import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { resolveAuthenticatedVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { IndexedDbWorkspaceRepository } from "@/infrastructure/workspace/indexed-db-workspace-repository";
import {
  VINEMA_DB_NAME,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";

describe("Vinema authenticated context", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("uses the authenticated workspace and device ids instead of the local default workspace", async () => {
    await new IndexedDbWorkspaceRepository().saveDefault({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Workspace local previo",
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    });

    const context = await resolveAuthenticatedVinemaContext({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      deviceId: "33333333-3333-4333-8333-333333333333",
    });

    expect(context.workspace).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Personal",
    });
    expect(context.device).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
    });
  });
});
