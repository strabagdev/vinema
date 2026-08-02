import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptExplorationClient } from "@/app/concepts/detail/concept-exploration-client";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import { emitSyncDataChanged } from "@/features/sync/sync-data-events";

const mocks = vi.hoisted(() => ({
  contexts: new Map<string, Context>(),
  nodes: new Map<string, Node>(),
  relations: new Map<string, NodeContextRelation>(),
  push: vi.fn(),
  searchParams: new URLSearchParams("contextId=railway"),
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
        (context) => context.workspaceId === workspaceId,
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
        (node) =>
          node.workspaceId === workspaceId &&
          node.status === "ACTIVE" &&
          node.deletedAt === null,
      ),
    ),
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ConceptExplorationClient", () => {
  beforeEach(() => {
    mocks.contexts.clear();
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.push.mockReset();
    mocks.searchParams = new URLSearchParams("contextId=railway");
    seedConceptExploration();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("loads related memories and connected concepts without fabricated titles", async () => {
    const screen = await renderConceptExploration();

    expect(screen.querySelector("[data-knowledge-base-surface]")).toBeTruthy();
    expect(screen.textContent).toContain("Railway");
    expect(screen.textContent).toContain("Base de conocimiento");
    expect(screen.textContent).toContain("2 recuerdos relacionados");
    expect(screen.textContent).toContain("Recuerdos representativos");
    expect(screen.textContent).toContain("Conectado con");
    expect(screen.textContent).toContain("Evolución");
    expect(screen.textContent).toContain("Sync");
    expect(screen.textContent).toContain("Workspace");
    expect(screen.textContent).toContain("Captura sobre Railway y Sync");
    expect(screen.textContent).not.toContain("Sin título");
    expect(screen.textContent).not.toContain("other workspace");
  });

  it("navigates to a connected concept from the current center", async () => {
    const screen = await renderConceptExploration();

    await click(getButton(screen, "Workspace"));

    expect(mocks.push).toHaveBeenCalledWith(
      "/concepts/detail?contextId=workspace",
    );
  });

  it("keeps local concept history and returns without a global list hop", async () => {
    const screen = await renderConceptExploration();

    await click(getButton(screen, "Workspace"));
    await click(getButton(screen, "← Volver"));

    expect(mocks.push).toHaveBeenNthCalledWith(
      1,
      "/concepts/detail?contextId=workspace",
    );
    expect(mocks.push).toHaveBeenNthCalledWith(
      2,
      "/concepts/detail?contextId=railway",
    );
  });

  it("keeps Recuerdos, Tiempo and Mapa modes within the centered knowledge base", async () => {
    const screen = await renderConceptExploration();

    expect(getButtonByLabel(screen, "Recuerdos").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(getButtonByLabel(screen, "Tiempo")).toBeDefined();
    expect(getButtonByLabel(screen, "Mapa")).toBeDefined();

    await click(getButtonByLabel(screen, "Mapa"));

    expect(screen.textContent).toContain("Mapa conceptual preparado");
    expect(screen.textContent).toContain("Actividad conectada");
    expect(screen.textContent).toContain("Conceptos cercanos");
    expect(screen.textContent).not.toContain("Graphify");
  });

  it("records panel expansion origin without introducing a global knowledge base entry", async () => {
    mocks.searchParams = new URLSearchParams(
      "contextId=railway&returnTo=%2F&from=panel",
    );
    const screen = await renderConceptExploration();

    expect(
      screen
        .querySelector("[data-knowledge-base-surface]")
        ?.getAttribute("data-expansion-source"),
    ).toBe("panel");
    expect(screen.textContent).not.toContain("Explorar");
  });

  it("refreshes the open exploration after remote sync invalidation", async () => {
    const screen = await renderConceptExploration();

    expect(screen.textContent).toContain("2 recuerdos relacionados");
    mocks.nodes.set(
      "new",
      node({ id: "new", content: "Nueva captura remota de Railway" }),
    );
    mocks.relations.set(
      "new-railway",
      relation({ id: "new-railway", nodeId: "new", contextId: "railway" }),
    );

    await act(async () => {
      emitSyncDataChanged({
        workspaceId: "workspace-1",
        entityTypes: ["captureConcept"],
        changedAt: "2026-08-01T00:00:00.000Z",
      });
      await flushPromises();
    });

    expect(screen.textContent).toContain("3 recuerdos relacionados");
    expect(screen.textContent).toContain("3");
    expect(screen.textContent).toContain("Nueva captura remota de Railway");
  });

  it("shows aliases as identity evidence without technical normalized values", async () => {
    mocks.contexts.set(
      "railway",
      context({
        id: "railway",
        name: "Railway",
        aliases: ["Railway Cloud"],
        normalizedAliases: ["railway cloud"],
      }),
    );
    const screen = await renderConceptExploration();

    expect(screen.textContent).toContain("También aparece como");
    expect(screen.textContent).toContain("Railway Cloud");
    expect(screen.textContent).not.toContain("railway cloud");
  });

  it("shows a one-memory profile without empty sections or unnecessary temporal noise", async () => {
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.nodes.set(
      "single",
      node({ id: "single", content: "Railway despliega Vinema API" }),
    );
    mocks.relations.set(
      "single-railway",
      relation({ id: "single-railway", nodeId: "single", contextId: "railway" }),
    );

    const screen = await renderConceptExploration();

    expect(screen.textContent).toContain("1 recuerdos relacionados");
    expect(screen.textContent).toContain("Recuerdos representativos");
    expect(screen.textContent).toContain("Railway despliega Vinema API");
    expect(screen.textContent).not.toContain("Conectado con");
    expect(screen.textContent).not.toContain("Evolución");
    expect(screen.textContent).not.toContain("últimos 7 días");
    expect(screen.textContent).not.toContain("Aún sin recuerdos");
  });
});

async function renderConceptExploration() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(createElement(ConceptExplorationClient));
    await flushPromises();
  });

  return container;
}

function seedConceptExploration() {
  [
    context({ id: "railway", name: "Railway" }),
    context({ id: "sync", name: "Sync" }),
    context({ id: "workspace", name: "Workspace" }),
  ].forEach((item) => mocks.contexts.set(item.id, item));
  [
    node({ id: "a", content: "Captura sobre Railway y Sync" }),
    node({ id: "b", content: "Captura sobre Railway y Workspace" }),
    node({
      id: "other",
      workspaceId: "workspace-2",
      content: "other workspace",
    }),
  ].forEach((item) => mocks.nodes.set(item.id, item));
  [
    relation({ id: "a-railway", nodeId: "a", contextId: "railway" }),
    relation({ id: "a-sync", nodeId: "a", contextId: "sync" }),
    relation({ id: "b-railway", nodeId: "b", contextId: "railway" }),
    relation({ id: "b-workspace", nodeId: "b", contextId: "workspace" }),
    relation({
      id: "other-railway",
      workspaceId: "workspace-2",
      nodeId: "other",
      contextId: "railway",
    }),
  ].forEach((item) => mocks.relations.set(item.id, item));
}

function context(overrides: Partial<Context>): Context {
  return {
    id: "context",
    workspaceId: "workspace-1",
    type: "PROJECT",
    name: "Context",
    description: null,
    aliases: [],
    normalizedAliases: [],
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
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.includes(name),
  );

  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }

  return button as HTMLButtonElement;
}

function getButtonByLabel(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.getAttribute("aria-label") === label,
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button as HTMLButtonElement;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
