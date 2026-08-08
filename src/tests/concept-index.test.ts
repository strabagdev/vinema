import { act, createElement } from "react";
import type { ComponentType, ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptIndexClient } from "@/app/concepts/concept-index-client";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";

const mocks = vi.hoisted(() => ({
  contexts: new Map<string, Context>(),
  nodes: new Map<string, Node>(),
  relations: new Map<string, NodeContextRelation>(),
  vinemaContext: {
    status: "ready",
    workspace: { id: "workspace-1", name: "Personal" },
    device: { id: "device-1" },
    error: null,
  },
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => mocks.vinemaContext,
}));

vi.mock("@/infrastructure/repositories", () => ({
  contextRepository: {
    list: vi.fn(async ({ workspaceId }: { workspaceId: string }) =>
      Array.from(mocks.contexts.values()).filter(
        (context) => context.workspaceId === workspaceId && context.archivedAt === null,
      ),
    ),
  },
  nodeContextRelationRepository: {
    listByWorkspace: vi.fn(async (workspaceId: string) =>
      Array.from(mocks.relations.values()).filter(
        (relation) => relation.workspaceId === workspaceId,
      ),
    ),
  },
  nodeRepository: {
    listByWorkspace: vi.fn(async (workspaceId: string) =>
      Array.from(mocks.nodes.values()).filter(
        (node) => node.workspaceId === workspaceId && node.deletedAt === null,
      ),
    ),
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ConceptIndexClient", () => {
  beforeEach(() => {
    mocks.contexts.clear();
    mocks.nodes.clear();
    mocks.relations.clear();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("shows a serene empty state without fabricating concepts", async () => {
    const screen = await renderConceptIndex();

    expect(screen.querySelector("[data-concept-index]")).toBeTruthy();
    expect(screen.textContent).toContain("Conocimiento");
    expect(screen.textContent).toContain("Aun no hay conceptos");
    expect(screen.textContent).toContain(
      "Los conceptos apareceran cuando tu memoria empiece a formar conexiones.",
    );
    expect(screen.textContent).not.toContain("Sin conceptos");
    expect(screen.querySelector("a[href^='/concepts/detail']")).toBeNull();
  });

  it("lists existing concepts as entry points to contextual exploration", async () => {
    mocks.contexts.set("railway", context({ id: "railway", name: "Railway" }));
    mocks.contexts.set("sync", context({ id: "sync", name: "Sync" }));
    mocks.nodes.set("a", node({ id: "a", content: "Captura sobre Railway y Sync" }));
    mocks.relations.set(
      "a-railway",
      relation({ id: "a-railway", nodeId: "a", contextId: "railway" }),
    );
    mocks.relations.set(
      "a-sync",
      relation({ id: "a-sync", nodeId: "a", contextId: "sync" }),
    );

    const screen = await renderConceptIndex();

    expect(screen.textContent).toContain("Conocimiento");
    expect(screen.textContent).toContain("Railway");
    expect(screen.textContent).toContain("Sync");
    expect(screen.textContent).toContain("1 recuerdo relacionado");
    expect(screen.textContent).toContain("1 conexión");
    const railwayLink = Array.from(screen.querySelectorAll("a")).find((link) =>
      link.getAttribute("href")?.startsWith("/concepts/detail?contextId=railway"),
    );

    expect(railwayLink?.getAttribute("href")).toContain("returnTo=%2Fconcepts");
    expect(railwayLink?.textContent).toContain("Railway");
    expect(screen.textContent).not.toContain("Captura sobre");
  });

  it("exposes the concept map action when embedded without route navigation chrome", async () => {
    const openMap = vi.fn();
    const openConcept = vi.fn();
    mocks.contexts.set("railway", context({ id: "railway", name: "Railway" }));

    const screen = await renderConceptIndex(
      createElement(ConceptIndexClient as ComponentType<{
        embedded?: boolean;
        onOpenMap?: () => void;
        onOpenConcept?: (conceptId: string) => void;
      }>, { embedded: true, onOpenMap: openMap, onOpenConcept: openConcept }),
    );
    const mapButton = getButton(screen, "Abrir mapa de conceptos");
    const railwayButton = getButtonContaining(screen, "Railway");

    expect(mapButton).toBeTruthy();
    expect(railwayButton).toBeTruthy();
    expect(screen.textContent).not.toContain("Volver");
    expect(screen.querySelector("a[href^='/concepts/detail']")).toBeNull();
    expect(
      Array.from(screen.querySelectorAll("a")).some(
        (link) => link.getAttribute("href") === "/concepts/explore",
      ),
    ).toBe(false);

    await act(async () => {
      mapButton?.click();
      await flushPromises();
    });

    expect(openMap).toHaveBeenCalledTimes(1);

    await act(async () => {
      railwayButton?.click();
      await flushPromises();
    });

    expect(openConcept).toHaveBeenCalledWith("railway");
  });
});

async function renderConceptIndex(
  element: ReactElement = createElement(ConceptIndexClient),
) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(element);
    await flushPromises();
  });

  return container;
}

function getButton(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === name,
  ) as HTMLButtonElement | undefined;
}

function getButtonContaining(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

function context(overrides: Partial<Context>): Context {
  return {
    id: "context",
    workspaceId: "workspace-1",
    type: "PROJECT",
    name: "Context",
    description: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function node(overrides: Partial<Node>): Node {
  return {
    id: "node",
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

function relation(
  overrides: Partial<NodeContextRelation>,
): NodeContextRelation {
  return {
    id: "relation",
    workspaceId: "workspace-1",
    nodeId: "node",
    contextId: "context",
    createdAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
