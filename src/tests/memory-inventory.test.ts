import { describe, expect, it } from "vitest";
import { getMemoryInventory } from "@/features/memory/memory-inventory";

const expectedData = [
  "User",
  "Workspace",
  "WorkspaceMember",
  "Device",
  "AuthSession",
  "Capture",
  "Concept",
  "CaptureConcept",
  "SyncChange",
  "ProcessedMutation",
  "nodes",
  "contexts",
  "node_context_relations",
  "app_settings",
  "vinema:capture-draft:v1",
  "key-value",
  "auth_session",
  "devices",
  "workspaces",
  "sync_mutations",
  "sync_metadata",
  "sync_entity_acknowledgements",
  "association suggestions",
  "emergent identity",
];

describe("memory inventory", () => {
  it("classifies every persisted or functional memory source for export reset and restore", () => {
    const inventory = getMemoryInventory();

    expect(inventory.map((item) => item.data)).toEqual(expectedData);
    expect(inventory.every((item) => item.notes.trim().length > 0)).toBe(true);
    expect(
      inventory
        .filter((item) => item.isMemory)
        .map((item) => item.data)
        .sort(),
    ).toEqual([
      "Capture",
      "CaptureConcept",
      "Concept",
      "contexts",
      "node_context_relations",
      "nodes",
    ]);
    expect(
      inventory
        .filter((item) => item.export)
        .every((item) => item.reset && item.restore),
    ).toBe(true);
    expect(
      inventory
        .filter((item) => item.category === "IDENTITY_AND_SECURITY")
        .every((item) => !item.export && !item.reset && !item.restore),
    ).toBe(true);
  });
});
