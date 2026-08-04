import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptExplorationClient } from "@/app/concepts/detail/concept-exploration-client";
import { ConceptKnowledgeExplorerClient } from "@/app/concepts/explore/concept-knowledge-explorer-client";
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
    expect(screen.textContent).toContain("Perfil vivo");
    expect(screen.textContent).toContain("2 recuerdos");
    expect(screen.textContent).toContain("Recuerdos representativos");
    expect(screen.textContent).toContain("Conexiones principales");
    expect(screen.textContent).toContain("Actividad");
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

  it("removes Recuerdos, Tiempo and Mapa modes from the living concept profile", async () => {
    const screen = await renderConceptExploration();

    expect(queryButtonByLabel(screen, "Recuerdos")).toBeNull();
    expect(queryButtonByLabel(screen, "Tiempo")).toBeNull();
    expect(queryButtonByLabel(screen, "Mapa")).toBeNull();
    expect(screen.textContent).toContain("Conexiones principales");
    expect(screen.textContent).toContain("Explorar conexiones");
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
    expect(screen.textContent).toContain("Explorar conexiones");
  });

  it("refreshes the open exploration after remote sync invalidation", async () => {
    const screen = await renderConceptExploration();

    expect(screen.textContent).toContain("2 recuerdos");
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

    expect(screen.textContent).toContain("3 recuerdos");
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

    expect(screen.textContent).toContain("1 recuerdo");
    expect(screen.textContent).toContain("Recuerdos representativos");
    expect(screen.textContent).toContain("Railway despliega Vinema API");
    expect(screen.textContent).not.toContain("Conectado con");
    expect(screen.textContent).not.toContain("Conexiones principales");
    expect(screen.textContent).not.toContain("Evolución");
    expect(screen.textContent).not.toContain("últimos 7 días");
    expect(screen.textContent).not.toContain("Aún sin recuerdos");
  });

  it("hides observed patterns when evidence is insufficient", async () => {
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

    expect(screen.textContent).not.toContain("Patrones observados");
  });

  it("does not duplicate main relationships as observed patterns", async () => {
    mocks.nodes.clear();
    mocks.relations.clear();

    [
      node({
        id: "pattern-a",
        content: "Railway y Sync en despliegue",
        updatedAt: "2026-04-01T10:00:00.000Z",
      }),
      node({
        id: "pattern-b",
        content: "Railway y Sync en produccion",
        updatedAt: "2026-06-01T10:00:00.000Z",
      }),
      node({
        id: "pattern-c",
        content: "Railway y Sync en pruebas",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ].forEach((item) => mocks.nodes.set(item.id, item));

    for (const memoryId of ["pattern-a", "pattern-b", "pattern-c"]) {
      mocks.relations.set(
        `${memoryId}-railway`,
        relation({ id: `${memoryId}-railway`, nodeId: memoryId, contextId: "railway" }),
      );
      mocks.relations.set(
        `${memoryId}-sync`,
        relation({ id: `${memoryId}-sync`, nodeId: memoryId, contextId: "sync" }),
      );
    }

    const screen = await renderConceptExploration();

    expect(screen.textContent).not.toContain("Patrones observados");
    expect(screen.textContent).toContain("Conexiones principales");
    expect(screen.textContent).toContain("Sync");
  });

  it("hides observed meanings when no explicit semantic statement exists", async () => {
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.nodes.set(
      "contextual",
      node({ id: "contextual", content: "Estoy pensando en Railway y Sync." }),
    );
    mocks.relations.set(
      "contextual-railway",
      relation({
        id: "contextual-railway",
        nodeId: "contextual",
        contextId: "railway",
      }),
    );
    mocks.relations.set(
      "contextual-sync",
      relation({ id: "contextual-sync", nodeId: "contextual", contextId: "sync" }),
    );

    const screen = await renderConceptExploration();

    expect(screen.textContent).not.toContain("Significados observados");
  });

  it("shows explicit semantic meanings with human labels and evidence links", async () => {
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.nodes.set(
      "meaning",
      node({ id: "meaning", content: "Railway usa Sync." }),
    );
    mocks.relations.set(
      "meaning-railway",
      relation({ id: "meaning-railway", nodeId: "meaning", contextId: "railway" }),
    );
    mocks.relations.set(
      "meaning-sync",
      relation({ id: "meaning-sync", nodeId: "meaning", contextId: "sync" }),
    );

    const screen = await renderConceptExploration();

    expect(screen.textContent).toContain("Significados observados");
    expect(screen.textContent).toContain("Railway");
    expect(screen.textContent).toContain("usa");
    expect(screen.textContent).toContain("Sync");
    expect(screen.textContent).not.toContain("USES");
    expect(
      Array.from(screen.querySelectorAll("a")).some((link) =>
        link.getAttribute("href")?.startsWith("/memory/detail?nodeId=meaning"),
      ),
    ).toBeTruthy();

    await click(getButton(screen, "Sync"));

    expect(mocks.push).toHaveBeenCalledWith("/concepts/detail?contextId=sync");
  });

  it("does not show evolution for weak one-memory signals", async () => {
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.nodes.set(
      "single",
      node({
        id: "single",
        content: "Railway aparece una vez",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
    );
    mocks.relations.set(
      "single-railway",
      relation({ id: "single-railway", nodeId: "single", contextId: "railway" }),
    );

    const screen = await renderConceptExploration();

    expect(screen.textContent).not.toContain("Ha ganado actividad");
    expect(screen.textContent).not.toContain("Concepto reciente");
  });

  it("uses the primary memory evolution signal as the activity signal", async () => {
    mocks.nodes.clear();
    mocks.relations.clear();

    [
      node({
        id: "evolution-previous",
        content: "Railway en despliegue previo",
        updatedAt: "2026-06-15T10:00:00.000Z",
      }),
      node({
        id: "evolution-recent-a",
        content: "Railway gana actividad con Sync",
        updatedAt: "2026-07-15T10:00:00.000Z",
      }),
      node({
        id: "evolution-recent-b",
        content: "Railway vuelve a aparecer en producción",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ].forEach((item) => mocks.nodes.set(item.id, item));

    for (const memoryId of [
      "evolution-previous",
      "evolution-recent-a",
      "evolution-recent-b",
    ]) {
      mocks.relations.set(
        `${memoryId}-railway`,
        relation({ id: `${memoryId}-railway`, nodeId: memoryId, contextId: "railway" }),
      );
    }

    const screen = await renderConceptExploration();

    expect(screen.textContent).toContain("Ha ganado actividad");
    expect(screen.textContent).toContain(
      "Tiene más presencia reciente que en el periodo anterior.",
    );
    expect(
      Array.from(screen.querySelectorAll("a")).some((link) =>
        link.getAttribute("href")?.startsWith("/memory/detail?nodeId=evolution-recent"),
      ),
    ).toBeTruthy();
  });

  it("links profile connections to the global knowledge explorer with focus", async () => {
    const screen = await renderConceptExploration();
    const link = Array.from(screen.querySelectorAll("a")).find(
      (item) => item.textContent?.includes("Explorar conexiones"),
    );

    expect(link?.getAttribute("href")).toBe("/concepts/explore?focus=railway");
  });

  it("links recent concept memories back to Memoria with concept query", async () => {
    const screen = await renderConceptExploration();
    const link = Array.from(screen.querySelectorAll("a")).find(
      (item) => item.textContent?.includes("Memoria"),
    );

    expect(link?.getAttribute("href")).toBe("/memory?concept=railway");
  });

  it("renders the global knowledge explorer focused from the query", async () => {
    mocks.searchParams = new URLSearchParams("focus=railway");
    const screen = await renderConceptExplorer();

    expect(screen.textContent).toContain("Explorar conocimiento");
    expect(screen.textContent).toContain("¿Cómo está conectada mi memoria?");
    expect(screen.textContent).toContain("Foco");
    expect(screen.textContent).toContain("Railway");
    expect(screen.textContent).toContain("Conexiones del foco");
    expect(screen.textContent).toContain("Sync");
    expect(screen.textContent).toContain("Workspace");
    const canvas = screen.querySelector("[data-knowledge-explorer-canvas]");
    const graphRegion = screen.querySelector("[aria-label='Mapa de conexiones']");
    const alternativeList = screen.querySelector("[aria-label='Conexiones del foco']");

    expect(canvas?.className).toContain("h-full");
    expect(canvas?.className).toContain("min-h-0");
    expect(canvas?.className).toContain("overflow-hidden");
    expect(graphRegion?.className).toContain("overflow-auto");
    expect(graphRegion?.className).toContain("vinema-scrollbar");
    expect(alternativeList?.parentElement?.className).toContain("overflow-y-auto");
    expect(screen.querySelector("svg[aria-label='Mapa de conceptos conectados']")).toBeTruthy();
  });

  it("changes graph focus when a node is clicked", async () => {
    mocks.searchParams = new URLSearchParams("focus=railway");
    const screen = await renderConceptExplorer();
    const syncNode = screen.querySelector("[aria-label='Enfocar Sync']");

    expect(syncNode).toBeTruthy();
    await click(syncNode as HTMLElement);

    expect(mocks.push).toHaveBeenCalledWith("/concepts/explore?focus=sync");
  });

  it("uses concept search to focus an existing concept without creating alias nodes", async () => {
    mocks.contexts.set(
      "railway",
      context({
        id: "railway",
        name: "Railway",
        aliases: ["Railway Cloud"],
      }),
    );
    mocks.searchParams = new URLSearchParams("");
    const screen = await renderConceptExplorer();
    const input = screen.querySelector("#concept-explorer-search") as HTMLInputElement;

    await act(async () => {
      setInputValue(input, "cloud");
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await flushPromises();
    });

    expect(screen.textContent).toContain("Railway");
    expect(screen.textContent).not.toContain("Railway Cloud");
    const result = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent === "Railway",
    );

    expect(result).toBeTruthy();
    await click(result as HTMLButtonElement);

    expect(mocks.push).toHaveBeenCalledWith("/concepts/explore?focus=railway");
  });

  it("shows an empty state when there are not enough graph connections", async () => {
    mocks.relations.clear();
    mocks.searchParams = new URLSearchParams("");
    const screen = await renderConceptExplorer();

    expect(screen.textContent).toContain("No hay suficientes conexiones todavía.");
    expect(screen.textContent).toContain("Volver a capturar");
    expect(screen.textContent).toContain("Conceptos");
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

async function renderConceptExplorer() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(createElement(ConceptKnowledgeExplorerClient));
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

function queryButtonByLabel(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (item) => item.getAttribute("aria-label") === label,
  ) ?? null;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  setter?.call(input, value);
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
