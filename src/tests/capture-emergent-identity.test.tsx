import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import { deriveCaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { CaptureEmergentIdentityLabel } from "@/features/identity/capture-emergent-identity-view";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("emergent capture identity", () => {
  it("derives the virtual title from accepted relations without persisting a title", () => {
    const node = createNode({
      content:
        "Necesitamos revisar por que la sincronizacion de Railway no usa el workspace autenticado.",
    });
    const identity = deriveCaptureEmergentIdentity({
      contexts: [
        createContext({ id: "railway", name: "Railway" }),
        createContext({ id: "sync", name: "Sincronizacion" }),
        createContext({ id: "workspace", name: "Workspace" }),
      ],
      relations: [
        createRelation({ contextId: "railway", createdAt: "2026-01-01T00:00:00.000Z" }),
        createRelation({ contextId: "sync", createdAt: "2026-01-02T00:00:00.000Z" }),
        createRelation({ contextId: "workspace", createdAt: "2026-01-03T00:00:00.000Z" }),
      ],
      nodeId: node.id,
    });

    expect(identity.displayText).toBe("Railway · Sincronizacion · Workspace");
    expect(identity.concepts.map((concept) => concept.label)).toEqual([
      "Railway",
      "Sincronizacion",
      "Workspace",
    ]);
    expect("title" in node).toBe(false);
    expect(identity.displayText).not.toContain("Necesitamos revisar");
  });

  it("does not use ignored suggestions or the first line as fallback", () => {
    const identity = deriveCaptureEmergentIdentity({
      contexts: [
        createContext({ id: "ignored", name: "Railway" }),
      ],
      relations: [],
    });

    expect(identity.displayText).toBeNull();
    expect(identity.concepts).toEqual([]);
  });

  it("excludes archived concepts and relations for another capture", () => {
    const identity = deriveCaptureEmergentIdentity({
      contexts: [
        createContext({ id: "active", name: "Railway" }),
        createContext({
          id: "archived",
          name: "Workspace",
          archivedAt: "2026-01-02T00:00:00.000Z",
        }),
        createContext({ id: "other", name: "Mitcom" }),
      ],
      relations: [
        createRelation({ contextId: "active" }),
        createRelation({ contextId: "archived" }),
        createRelation({ nodeId: "other-node", contextId: "other" }),
      ],
      nodeId: "node-1",
    });

    expect(identity.displayText).toBe("Railway");
    expect(identity.concepts.map((concept) => concept.id)).toEqual(["active"]);
  });

  it("deduplicates normalized labels and keeps the earliest accepted label", () => {
    const identity = deriveCaptureEmergentIdentity({
      contexts: [
        createContext({ id: "first", name: "Railway" }),
        createContext({ id: "second", name: " railway " }),
      ],
      relations: [
        createRelation({ contextId: "second", createdAt: "2026-01-02T00:00:00.000Z" }),
        createRelation({ contextId: "first", createdAt: "2026-01-01T00:00:00.000Z" }),
      ],
      nodeId: "node-1",
    });

    expect(identity.concepts).toHaveLength(1);
    expect(identity.concepts[0]).toMatchObject({
      id: "first",
      label: "Railway",
      normalizedLabel: "railway",
    });
  });

  it("uses relation creation time and a stable label fallback for ordering", () => {
    const identity = deriveCaptureEmergentIdentity({
      contexts: [
        createContext({ id: "workspace", name: "Workspace" }),
        createContext({ id: "railway", name: "Railway" }),
        createContext({ id: "sync", name: "Sincronizacion" }),
      ],
      relations: [
        createRelation({ contextId: "workspace", createdAt: "2026-01-03T00:00:00.000Z" }),
        createRelation({ contextId: "sync", createdAt: "2026-01-02T00:00:00.000Z" }),
        createRelation({ contextId: "railway", createdAt: "2026-01-01T00:00:00.000Z" }),
      ],
      nodeId: "node-1",
    });

    expect(identity.displayText).toBe("Railway · Sincronizacion · Workspace");
  });

  it("limits visible concepts and exposes the additional count", () => {
    const identity = deriveCaptureEmergentIdentity({
      contexts: [
        createContext({ id: "a", name: "A" }),
        createContext({ id: "b", name: "B" }),
        createContext({ id: "c", name: "C" }),
        createContext({ id: "d", name: "D" }),
        createContext({ id: "e", name: "E" }),
      ],
      relations: ["a", "b", "c", "d", "e"].map((contextId, index) =>
        createRelation({
          contextId,
          createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        }),
      ),
      maxVisibleConcepts: 3,
      nodeId: "node-1",
    });

    expect(identity.visibleConcepts.map((concept) => concept.label)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(identity.hiddenCount).toBe(2);
    expect(identity.displayText).toBe("A · B · C · +2");
  });

  it("renders inline identity with accessible additional count", async () => {
    const identity = deriveCaptureEmergentIdentity({
      contexts: [
        createContext({ id: "railway", name: "Railway" }),
        createContext({ id: "sync", name: "Sync" }),
        createContext({ id: "workspace", name: "Workspace" }),
        createContext({ id: "api", name: "API" }),
      ],
      relations: ["railway", "sync", "workspace", "api"].map((contextId, index) =>
        createRelation({
          contextId,
          createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        }),
      ),
      nodeId: "node-1",
    });
    const container = document.createElement("div");

    await act(async () => {
      createRoot(container).render(
        createElement(CaptureEmergentIdentityLabel, {
          identity,
          getConceptHref: (conceptId: string) => `/contexts/detail?contextId=${conceptId}`,
        }),
      );
    });

    expect(container.textContent).toBe("Railway · Sync · Workspace · +1");
    expect(container.querySelectorAll("a")).toHaveLength(3);
    expect(container.querySelector("p")?.getAttribute("aria-label")).toBe(
      "Identidad emergente: Railway · Sync · Workspace · API",
    );
  });
});

function createContext(overrides: Partial<Context>): Context {
  return {
    id: "context-1",
    workspaceId: "workspace-1",
    type: "PROJECT",
    name: "Railway",
    description: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function createRelation(
  overrides: Partial<NodeContextRelation>,
): NodeContextRelation {
  return {
    id: `relation-${overrides.contextId ?? "context-1"}`,
    workspaceId: "workspace-1",
    nodeId: "node-1",
    contextId: "context-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createNode(overrides: Partial<Node> = {}): Node {
  return {
    id: "node-1",
    workspaceId: "workspace-1",
    type: "NOTE",
    content: "Contenido",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
    ...overrides,
  };
}
