import { act, createElement } from "react";
import type { ComponentType, ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptExplorationClient } from "@/app/concepts/detail/concept-exploration-client";
import { ConceptKnowledgeExplorerClient } from "@/app/concepts/explore/concept-knowledge-explorer-client";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import { deriveMemoryEvolutionSignals } from "@/features/cognition/memory-evolution";
import { emitSyncDataChanged } from "@/features/sync/sync-data-events";

const mocks = vi.hoisted(() => ({
  contexts: new Map<string, Context>(),
  nodes: new Map<string, Node>(),
  relations: new Map<string, NodeContextRelation>(),
  push: vi.fn(),
  back: vi.fn(),
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
    back: mocks.back,
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

const TEST_NOW = new Date("2026-08-01T12:00:00.000Z");

describe("ConceptExplorationClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
    mocks.contexts.clear();
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.push.mockReset();
    mocks.back.mockReset();
    mocks.searchParams = new URLSearchParams("contextId=railway");
    seedConceptExploration();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads related memories and connected concepts without fabricated titles", async () => {
    const screen = await renderConceptExploration();

    expect(screen.querySelector("[data-knowledge-base-surface]")).toBeTruthy();
    expect(screen.textContent).toContain("Railway");
    expect(screen.textContent).toContain("2 recuerdos · 2 conexiones");
    expect(screen.textContent).not.toContain("Perfil vivo");
    expect(screen.textContent).toContain("2 recuerdos");
    expect(getTab(screen, "Recuerdos").getAttribute("aria-selected")).toBe("true");
    expect(getTab(screen, "Relaciones").getAttribute("aria-selected")).toBe("false");
    expect(screen.querySelector("[role='tabpanel']")?.textContent).toContain(
      "Evidencia concreta asociada",
    );
    expect(screen.textContent).toContain("Sync");
    expect(screen.textContent).toContain("Workspace");
    expect(screen.textContent).toContain("Captura sobre Railway y Sync");
    expect(screen.textContent).not.toContain("Activo");
    expect(screen.textContent).not.toContain("Primera aparición");
    expect(screen.textContent).not.toContain("Última actividad");
    expect(screen.textContent).not.toContain("Concepto emergente confirmado");
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

  it("renders accessible tabs and moves between them with the keyboard", async () => {
    const screen = await renderConceptExploration();
    const tablist = screen.querySelector("[role='tablist']") as HTMLElement;

    expect(tablist).toBeTruthy();
    expect(getTab(screen, "Recuerdos").getAttribute("aria-selected")).toBe("true");
    expect(getTab(screen, "Relaciones").getAttribute("aria-controls")).toBe(
      "concept-tabpanel-relations",
    );
    expect(queryButtonByLabel(screen, "Tiempo")).toBeNull();
    expect(queryButtonByLabel(screen, "Mapa")).toBeNull();
    expect(screen.textContent).not.toContain("Conexiones principales");
    expect(screen.textContent).not.toContain("Explorar conexiones");
    expect(screen.textContent).not.toContain("Graphify");

    await keyDown(tablist, "ArrowRight");

    expect(getTab(screen, "Relaciones").getAttribute("aria-selected")).toBe("true");
    expect(screen.querySelector("[role='tabpanel']")?.textContent).toContain(
      "recuerdo compartido",
    );
  });

  it("keeps relationship evidence collapsed until requested", async () => {
    const screen = await renderConceptExploration();
    await click(getTab(screen, "Relaciones"));
    const relationships = screen.querySelector(
      "section[aria-label='Relaciones']",
    ) as HTMLElement;

    expect(relationships.textContent).toContain("Sync");
    expect(relationships.textContent).toContain("1 recuerdo compartido");
    expect(relationships.textContent).not.toContain("Captura sobre Railway y Sync");
    expect(relationships.textContent).not.toContain("Reciente");
    expect(relationships.textContent).not.toContain("Estable");
    expect(relationships.textContent).not.toContain("Ocasional");

    await click(getButton(relationships, "Ver evidencia"));

    expect(relationships.textContent).toContain("Captura sobre Railway y Sync");
    expect(relationships.textContent).toContain("Última actividad:");
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
    expect(screen.textContent).not.toContain("Explorar conexiones");
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
    expect(screen.textContent).toContain("Railway despliega Vinema API");
    expect(screen.textContent).not.toContain("Conectado con");
    expect(screen.querySelector("[role='tabpanel']")?.textContent).not.toContain(
      "Evolución",
    );
    expect(screen.textContent).not.toContain("últimos 7 días");
    expect(screen.textContent).not.toContain("Aún sin recuerdos");
  });

  it("shows empty states inside the tabbed concept detail", async () => {
    mocks.nodes.clear();
    mocks.relations.clear();

    const screen = await renderConceptExploration();

    expect(screen.querySelector("[role='tabpanel']")?.textContent).toContain(
      "sus recuerdos viviran aqui",
    );

    await click(getTab(screen, "Relaciones"));
    expect(screen.querySelector("[role='tabpanel']")?.textContent).toContain(
      "Todavía no hay relaciones respaldadas por recuerdos compartidos.",
    );

    await click(getTab(screen, "Evolución"));
    expect(screen.querySelector("[role='tabpanel']")?.textContent).toContain(
      "Aún no hay suficiente información temporal",
    );

    await click(getTab(screen, "Patrones"));
    expect(screen.querySelector("[role='tabpanel']")?.textContent).toContain(
      "Todavía no hay patrones observados con evidencia suficiente.",
    );
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

    await click(getTab(screen, "Patrones"));

    expect(screen.textContent).not.toContain("Patrones observados");
    expect(screen.textContent).toContain(
      "Todavía no hay patrones observados con evidencia suficiente.",
    );

    await click(getTab(screen, "Relaciones"));

    expect(screen.textContent).toContain("Relaciones");
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

  it("keeps semantic statements out of the tabbed detail and preserves memory links", async () => {
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

    expect(screen.textContent).not.toContain("Significados observados");
    expect(screen.textContent).toContain("Railway usa Sync.");
    expect(
      Array.from(screen.querySelectorAll("a")).some((link) =>
        link.getAttribute("href")?.startsWith("/memory/detail?nodeId=meaning"),
      ),
    ).toBeTruthy();

    await click(getTab(screen, "Relaciones"));

    expect(screen.textContent).toContain("Railway");
    expect(screen.textContent).toContain("Sync");
    expect(screen.textContent).not.toContain("USES");

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

    await click(getTab(screen, "Evolución"));

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

  it("classifies evolution fixture dates across historical, previous and recent windows", () => {
    const contexts = [context({ id: "railway", name: "Railway" })];
    const nodes = [
      node({
        id: "historical-boundary",
        updatedAt: "2026-06-02T11:59:59.999Z",
      }),
      node({
        id: "previous-boundary",
        updatedAt: "2026-06-02T12:00:00.000Z",
      }),
      node({
        id: "recent-boundary",
        updatedAt: "2026-07-02T12:00:00.000Z",
      }),
      node({
        id: "recent-later",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ];
    const relations = nodes.map((memory) =>
      relation({
        id: `${memory.id}-railway`,
        nodeId: memory.id,
        contextId: "railway",
      }),
    );

    const growing = deriveMemoryEvolutionSignals({
      contexts,
      nodes,
      relations,
      now: TEST_NOW,
    }).find((signal) => signal.kind === "GROWING_CONCEPT");

    expect(growing?.metrics).toMatchObject({
      totalMemories: 4,
      previousMemories: 1,
      recentMemories: 2,
    });
  });

  it("keeps the concept map as the only connection explorer", async () => {
    const screen = await renderConceptExploration();

    expect(screen.textContent).not.toContain("Explorar conexiones");
    expect(screen.querySelector("a[href^='/concepts/explore']")).toBeNull();
  });

  it("links recent concept memories back to Memoria with concept query", async () => {
    const screen = await renderConceptExploration();
    const link = Array.from(screen.querySelectorAll("a")).find(
      (item) => item.textContent?.includes("Memoria"),
    );

    expect(link?.getAttribute("href")).toBe("/memory?concept=railway");
  });

  it("keeps concept profile navigation embedded through callbacks", async () => {
    const openConcept = vi.fn();
    const openMemory = vi.fn();
    const openMemoryIndex = vi.fn();
    const onBack = vi.fn();
    const screen = await renderConceptExploration(
      createElement(ConceptExplorationClient as ComponentType<{
        embeddedContextId?: string;
        onBack?: () => void;
        onOpenConcept?: (conceptId: string) => void;
        onOpenMemory?: (nodeId: string) => void;
        onOpenMemoryIndex?: () => void;
      }>, {
        embeddedContextId: "railway",
        onBack,
        onOpenConcept: openConcept,
        onOpenMemory: openMemory,
        onOpenMemoryIndex: openMemoryIndex,
      }),
    );

    expect(screen.querySelector("a[href^='/concepts/explore']")).toBeNull();
    expect(screen.querySelector("a[href^='/memory/detail']")).toBeNull();

    expect(screen.textContent).not.toContain("Explorar conexiones");

    await click(getButton(screen, "Memoria"));
    expect(openMemoryIndex).toHaveBeenCalledTimes(1);

    await click(getButton(screen, "← Volver"));
    expect(onBack).toHaveBeenCalledTimes(1);

    const syncButton = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Sync"),
    );
    await click(syncButton as HTMLButtonElement);
    expect(openConcept).toHaveBeenCalledWith("sync");

    await click(getTab(screen, "Relaciones"));
    await click(getButton(screen, "Ver evidencia"));

    const memoryButton = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Captura sobre Railway"),
    );
    await click(memoryButton as HTMLButtonElement);
    expect(openMemory).toHaveBeenCalled();
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
    expect(graphRegion?.className).toContain("overflow-hidden");
    expect(graphRegion?.className).not.toContain("overflow-auto");
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

  it("renders the global knowledge explorer embedded without route navigation", async () => {
    mocks.searchParams = new URLSearchParams("focus=railway");
    const onBack = vi.fn();
    const openConcept = vi.fn();
    const screen = await renderConceptExplorer(
      createElement(ConceptKnowledgeExplorerClient as ComponentType<{
        embedded?: boolean;
        onBack?: () => void;
        onOpenConcept?: (conceptId: string) => void;
      }>, { embedded: true, onBack, onOpenConcept: openConcept }),
    );
    const syncNode = screen.querySelector("[aria-label='Enfocar Sync']");

    expect(screen.textContent).toContain("Volver a conceptos");
    expect(screen.querySelector("[data-knowledge-explorer-canvas]")).toBeTruthy();

    await click(syncNode as HTMLElement);

    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.textContent).toContain("Sync");

    await click(getButton(screen, "Ver perfil"));
    expect(openConcept).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();

    await click(getButton(screen, "Volver a conceptos"));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mocks.back).not.toHaveBeenCalled();
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

async function renderConceptExploration(
  element: ReactElement = createElement(ConceptExplorationClient),
) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(element);
    await flushPromises();
  });

  return container;
}

async function renderConceptExplorer(
  element: ReactElement = createElement(ConceptKnowledgeExplorerClient),
) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(element);
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

function getTab(container: HTMLElement, name: string) {
  const tab = Array.from(container.querySelectorAll("[role='tab']")).find(
    (item) => item.textContent === name,
  );

  if (!tab) {
    throw new Error(`Tab not found: ${name}`);
  }

  return tab as HTMLButtonElement;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

async function keyDown(element: HTMLElement, key: string) {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key }),
    );
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
