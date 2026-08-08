import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptWorkspaceClient } from "@/app/concepts/concept-workspace-client";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";

const mocks = vi.hoisted(() => ({
  contexts: new Map<string, Context>(),
  nodes: new Map<string, Node>(),
  relations: new Map<string, NodeContextRelation>(),
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  vinemaContext: {
    status: "ready",
    workspace: { id: "workspace-1", name: "Personal" },
    device: { id: "device-1" },
    error: null,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: vi.fn(),
  }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => mocks.vinemaContext,
}));

vi.mock("@/infrastructure/repositories", () => ({
  contextRepository: {
    getById: vi.fn(async (id: string) => mocks.contexts.get(id) ?? null),
    list: vi.fn(async ({ workspaceId }: { workspaceId: string }) =>
      Array.from(mocks.contexts.values()).filter(
        (context) =>
          context.workspaceId === workspaceId && context.archivedAt === null,
      ),
    ),
  },
  nodeContextRelationRepository: {
    listByNodeId: vi.fn(async (nodeId: string) =>
      Array.from(mocks.relations.values()).filter(
        (relation) => relation.nodeId === nodeId,
      ),
    ),
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

describe("ConceptWorkspaceClient", () => {
  beforeEach(() => {
    mocks.contexts.clear();
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.searchParams = new URLSearchParams();
    seedWorkspace();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps index, map and profile in one synchronized workspace", async () => {
    const screen = await renderConceptWorkspace();

    expect(screen.querySelector("[data-concept-workspace]")).toBeTruthy();
    expect(screen.querySelector("[data-concept-workspace-index]")).toBeTruthy();
    expect(screen.querySelector("[data-concept-workspace-map]")).toBeTruthy();
    expect(screen.querySelector("[data-concept-workspace-profile]")).toBeTruthy();
    expect(screen.querySelector("[data-knowledge-explorer-canvas]")).toBeTruthy();
    expect(screen.querySelector("[data-concept-index-list]")?.parentElement?.className)
      .toContain("overflow-y-auto");
    expect(screen.textContent).not.toContain("Abrir mapa de conceptos");
    expect(screen.textContent).not.toContain("Explorar conocimiento");

    await click(getButtonContaining(screen, "Railway"));

    expect(getButtonContaining(screen, "Railway").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.textContent).toContain("Perfil");
    expect(screen.textContent).toContain("Railway");
    expect(screen.querySelector("[data-concept-profile-workspace]")?.className)
      .toContain("overflow-y-auto");
    expect(mocks.push).not.toHaveBeenCalled();

    await click(screen.querySelector("[aria-label='Enfocar Sync']") as HTMLElement);

    expect(screen.textContent).toContain("Sync");
    expect(getButtonContaining(screen, "Sync").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

async function renderConceptWorkspace() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(createElement(ConceptWorkspaceClient));
    await flushPromises();
  });

  return container;
}

function seedWorkspace() {
  [
    context({ id: "railway", name: "Railway" }),
    context({ id: "sync", name: "Sync" }),
  ].forEach((item) => mocks.contexts.set(item.id, item));
  [
    node({ id: "a", content: "Captura sobre Railway y Sync" }),
    node({ id: "b", content: "Otra captura sobre Railway y Sync" }),
  ].forEach((item) => mocks.nodes.set(item.id, item));
  [
    relation({ id: "a-railway", nodeId: "a", contextId: "railway" }),
    relation({ id: "a-sync", nodeId: "a", contextId: "sync" }),
    relation({ id: "b-railway", nodeId: "b", contextId: "railway" }),
    relation({ id: "b-sync", nodeId: "b", contextId: "sync" }),
  ].forEach((item) => mocks.relations.set(item.id, item));
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

function relation(overrides: Partial<NodeContextRelation>): NodeContextRelation {
  return {
    id: "relation",
    workspaceId: "workspace-1",
    nodeId: "node",
    contextId: "context",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function getButtonContaining(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button as HTMLButtonElement;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
