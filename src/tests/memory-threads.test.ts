import { describe, expect, it } from "vitest";
import type { Node } from "@/domain/node/node";
import type { CaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import {
  createEmergentIdentityKey,
  deriveMemoryThreads,
} from "@/features/memory/memory-threads";

describe("memory threads", () => {
  it("derives a stable key from sorted canonical concept ids", () => {
    expect(createEmergentIdentityKey([
      { id: "tracking" },
      { id: "mitcom" },
      { id: "server" },
    ])).toBe("mitcom\u001fserver\u001ftracking");
  });

  it("groups captures with the exact same concept set regardless of order", () => {
    const entries = deriveMemoryThreads({
      captures: [
        node({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }),
        node({ id: "b", updatedAt: "2026-01-02T00:00:00.000Z" }),
      ],
      identities: new Map([
        ["a", identity(["mitcom", "tracking", "server"])],
        ["b", identity(["server", "mitcom", "tracking"])],
      ]),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "thread",
      thread: {
        id: "mitcom\u001fserver\u001ftracking",
        conceptIds: ["mitcom", "server", "tracking"],
        captureCount: 2,
      },
    });
    expect(entries[0].kind === "thread" ? entries[0].thread.captures.map(
      (capture) => capture.node.id,
    ) : []).toEqual(["b", "a"]);
  });

  it("does not group partial matches, unique identities or captures without concepts", () => {
    const entries = deriveMemoryThreads({
      captures: [
        node({ id: "full" }),
        node({ id: "partial" }),
        node({ id: "unique" }),
        node({ id: "empty" }),
      ],
      identities: new Map([
        ["full", identity(["mitcom", "tracking", "server"])],
        ["partial", identity(["mitcom", "tracking"])],
        ["unique", identity(["railway"])],
        ["empty", identity([])],
      ]),
    });

    expect(entries).toHaveLength(4);
    expect(entries.every((entry) => entry.kind === "capture")).toBe(true);
  });

  it("excludes archived captures and ignores archived concepts through active identities", () => {
    const entries = deriveMemoryThreads({
      captures: [
        node({ id: "active-a", updatedAt: "2026-01-01T00:00:00.000Z" }),
        node({ id: "active-b", updatedAt: "2026-01-02T00:00:00.000Z" }),
        node({
          id: "archived",
          status: "ARCHIVED",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ],
      identities: new Map([
        ["active-a", identity(["mitcom"])],
        ["active-b", identity(["mitcom"])],
        ["archived", identity(["mitcom"])],
      ]),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "thread",
      thread: { captureCount: 3 },
    });
  });

  it("orders visual units by recent activity, capture count and stable identity", () => {
    const entries = deriveMemoryThreads({
      captures: [
        node({ id: "single", updatedAt: "2026-01-03T00:00:00.000Z" }),
        node({ id: "thread-a-1", updatedAt: "2026-01-02T00:00:00.000Z" }),
        node({ id: "thread-a-2", updatedAt: "2026-01-02T00:00:00.000Z" }),
        node({ id: "thread-b-1", updatedAt: "2026-01-02T00:00:00.000Z" }),
        node({ id: "thread-b-2", updatedAt: "2026-01-02T00:00:00.000Z" }),
        node({ id: "thread-b-3", updatedAt: "2026-01-02T00:00:00.000Z" }),
      ],
      identities: new Map([
        ["single", identity(["single"])],
        ["thread-a-1", identity(["alpha"])],
        ["thread-a-2", identity(["alpha"])],
        ["thread-b-1", identity(["beta"])],
        ["thread-b-2", identity(["beta"])],
        ["thread-b-3", identity(["beta"])],
      ]),
    });

    expect(entries.map((entry) =>
      entry.kind === "thread" ? entry.thread.identityLabels[0] : entry.capture.node.id,
    )).toEqual(["single", "Beta", "Alpha"]);
  });
});

function node({
  id,
  status = "ACTIVE",
  updatedAt = "2026-01-01T00:00:00.000Z",
}: {
  id: string;
  status?: Node["status"];
  updatedAt?: string;
}): Node {
  return {
    id,
    workspaceId: "workspace-1",
    type: "NOTE",
    content: `Contenido ${id}`,
    status,
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
  };
}

function identity(conceptIds: string[]): CaptureEmergentIdentity {
  const concepts = conceptIds.map((id) => ({
    id,
    label: title(id),
    normalizedLabel: id,
    aliases: id === "mitcom" ? ["Proveedor Mitcom"] : [],
    normalizedAliases: id === "mitcom" ? ["proveedor mitcom"] : [],
  }));

  return {
    concepts,
    displayText:
      concepts.length > 0
        ? concepts.map((concept) => concept.label).join(" · ")
        : null,
    hiddenCount: 0,
    visibleConcepts: concepts,
  };
}

function title(value: string) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
