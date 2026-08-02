import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptIndexClient } from "@/app/concepts/concept-index-client";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";

const mocks = vi.hoisted(() => ({
  contexts: new Map<string, Context>(),
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
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ConceptIndexClient", () => {
  beforeEach(() => {
    mocks.contexts.clear();
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
    mocks.relations.set(
      "a-railway",
      relation({ id: "a-railway", nodeId: "a", contextId: "railway" }),
    );

    const screen = await renderConceptIndex();

    expect(screen.textContent).toContain("Conocimiento");
    expect(screen.textContent).toContain("Railway");
    expect(screen.textContent).toContain("Sync");
    expect(screen.textContent).toContain("1 recuerdo relacionado");
    const railwayLink = Array.from(screen.querySelectorAll("a")).find((link) =>
      link.getAttribute("href")?.startsWith("/concepts/detail?contextId=railway"),
    );

    expect(railwayLink?.getAttribute("href")).toContain("returnTo=%2Fconcepts");
    expect(railwayLink?.textContent).toContain("Railway");
    expect(screen.textContent).not.toContain("Captura sobre");
  });
});

async function renderConceptIndex() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(createElement(ConceptIndexClient));
    await flushPromises();
  });

  return container;
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
