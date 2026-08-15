import { act, createElement } from "react";
import type { ComponentType, ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeBaseClient } from "@/app/notes/knowledge-base-client";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { CAPTURE_CREATED_EVENT } from "@/features/capture/capture-events";
import {
  KNOWLEDGE_BASE_BATCH_SIZE,
  listKnowledgeCapturePage,
} from "@/features/capture/list-knowledge-captures";
import { createHighlightedParts } from "@/features/recovery/highlight-text";
import { emitSyncDataChanged } from "@/features/sync/sync-data-events";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const mocks = vi.hoisted(() => {
  const contexts = new Map<string, Context>();
  const nodes = new Map<string, Node>();
  const relations = new Map<string, NodeContextRelation>();
  const vinemaContext = {
    status: "ready",
    device: null,
    workspace: { id: "workspace-1", name: "Personal" },
    error: null,
  };

  return {
    contexts,
    nodes,
    relations,
    vinemaContext,
    nodeRepository: {
    async create(node: Node): Promise<Node> {
      nodes.set(node.id, node);
      return node;
    },
    async update(node: Node): Promise<Node> {
      nodes.set(node.id, node);
      return node;
    },
    async findById(id: string): Promise<Node | null> {
      return nodes.get(id) ?? null;
    },
    async listActive(): Promise<Node[]> {
      return Array.from(nodes.values()).filter(
        (node) => node.deletedAt === null,
      );
    },
    async listInbox(): Promise<Node[]> {
      return Array.from(nodes.values()).filter(
        (node) => node.organizationStatus === "INBOX",
      );
    },
    async listByWorkspace(workspaceId: string): Promise<Node[]> {
      return Array.from(nodes.values()).filter(
        (node) =>
          node.workspaceId === workspaceId &&
          node.deletedAt === null,
      );
    },
  },
    replace: vi.fn(),
    searchParams: new URLSearchParams(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => mocks.vinemaContext,
}));

vi.mock("@/infrastructure/repositories", () => ({
  contextRepository: {
    getById: vi.fn(async (id: string) => mocks.contexts.get(id) ?? null),
  },
  createLocalSyncRepositorySet: vi.fn(() => ({
    contextRepository: {
      getById: vi.fn(async (id: string) => mocks.contexts.get(id) ?? null),
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
    nodeRepository: mocks.nodeRepository,
  })),
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
  nodeRepository: mocks.nodeRepository,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("Knowledge Base", () => {
  beforeEach(() => {
    mocks.contexts.clear();
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.searchParams = new URLSearchParams();
    mocks.vinemaContext.status = "ready";
    mocks.vinemaContext.error = null;
  });

  afterEach(() => {
    mocks.replace.mockClear();
    document.body.replaceChildren();
  });

  it("orders captures stably and treats legacy archived status as visible", async () => {
    const repository = new InMemoryNodeRepository([
      createNode({ id: "b", updatedAt: "2026-01-02T00:00:00.000Z" }),
      createNode({ id: "a", updatedAt: "2026-01-02T00:00:00.000Z" }),
      createNode({ id: "new", updatedAt: "2026-01-03T00:00:00.000Z" }),
      createNode({
        id: "archived",
        updatedAt: "2026-01-04T00:00:00.000Z",
        status: "ARCHIVED",
      }),
    ]);

    const page = await listKnowledgeCapturePage(repository, {
      workspaceId: "workspace-1",
      limit: 10,
    });

    expect(page.items.map((item) => item.id)).toEqual(["archived", "new", "a", "b"]);
    expect(page.total).toBe(4);
    expect(page.hasMore).toBe(false);
  });

  it("loads captures by batches without duplicating and detects the end", async () => {
    setMockNodes(
      Array.from({ length: KNOWLEDGE_BASE_BATCH_SIZE + 1 }, (_, index) =>
        createNode({
          id: `capture-${String(index).padStart(2, "0")}`,
          content: `Contenido ${index}`,
          updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        }),
      ),
    );

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain(
      `${KNOWLEDGE_BASE_BATCH_SIZE + 1} capturas activas.`,
    );
    expect(screen.querySelectorAll("a[href^='/memory/detail']")).toHaveLength(
      KNOWLEDGE_BASE_BATCH_SIZE,
    );

    await click(getButton(screen, "Cargar mas"));

    const links = Array.from(
      screen.querySelectorAll("a[href^='/memory/detail']"),
    ).map((link) => link.getAttribute("href"));

    expect(links).toHaveLength(KNOWLEDGE_BASE_BATCH_SIZE + 1);
    expect(new Set(links).size).toBe(KNOWLEDGE_BASE_BATCH_SIZE + 1);
    expect(screen.textContent).toContain("Llegaste al final de la Memoria.");
  });

  it("keeps the search controls sticky above the normal memory list", async () => {
    setMockNodes([
      createNode({ id: "sticky-a", content: "Captura A" }),
      createNode({ id: "sticky-b", content: "Captura B" }),
    ]);

    const screen = await renderKnowledgeBase();
    const shell = screen.querySelector("[data-knowledge-base-client]");
    const searchRegion = screen.querySelector("[data-memory-search-region]");
    const searchPanel = screen.querySelector(".vinema-memory-search-panel");
    const form = screen.querySelector("[data-memory-search-form]");
    const counter = screen.querySelector("[data-memory-result-counter]");

    expect(shell?.className).toContain("vinema-memory-shell");
    expect(shell?.className).not.toContain("overflow-y-auto");
    expect(shell?.className).not.toContain("vinema-scrollbar");
    expect(searchRegion?.className).toContain("vinema-memory-search-region");
    expect(searchRegion?.className).not.toContain("space-y-1");
    expect(searchPanel?.className).toContain("vinema-memory-search-panel");
    expect(searchPanel?.className).toContain("space-y-1");
    expect(form?.className).toContain("gap-2");
    expect(form?.className).not.toContain("bg-white");
    expect(counter?.className).toContain("text-xs");
    expect(searchRegion?.contains(form)).toBe(true);
    expect(searchRegion?.contains(counter)).toBe(true);
    expect(counter?.textContent).toContain("2 capturas activas.");
  });

  it("renders memory captures as a normal vertical list without changing DOM order or navigation", async () => {
    setMockNodes([
      createNode({
        id: "list-old",
        content: "Captura antigua",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      createNode({
        id: "list-middle",
        content: "Captura intermedia",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      createNode({
        id: "list-new",
        content: "Captura reciente",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
      createNode({
        id: "list-latest",
        content: "Captura final",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }),
    ]);

    const screen = await renderKnowledgeBase();
    const captureList = screen.querySelector("[data-memory-capture-list]");
    const cards = Array.from(captureList?.children ?? []);
    const links = Array.from(screen.querySelectorAll("a[href^='/memory/detail']"));

    expect(captureList?.className).toContain("space-y-3");
    expect(screen.querySelector("[data-memory-stack-list]")).toBeNull();
    expect(screen.querySelector("[data-memory-stack-page]")).toBeNull();
    expect(cards).toHaveLength(4);
    expect(cards.every((card) => card.tagName === "ARTICLE")).toBe(true);
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Captura final"),
      expect.stringContaining("Captura reciente"),
      expect.stringContaining("Captura intermedia"),
      expect.stringContaining("Captura antigua"),
    ]);
    expect(links[0]?.getAttribute("href")).toContain("nodeId=list-latest");
  });

  it("keeps loading and empty memory states outside the normal capture list", async () => {
    mocks.vinemaContext.status = "loading";
    const loadingScreen = await renderKnowledgeBase();

    expect(loadingScreen.textContent).toContain("Cargando Memoria");
    expect(loadingScreen.querySelector("[data-memory-capture-list]")).toBeNull();
    document.body.replaceChildren();

    mocks.vinemaContext.status = "ready";
    const emptyScreen = await renderKnowledgeBase();

    expect(emptyScreen.textContent).toContain("Todavia no has capturado contenido.");
    expect(emptyScreen.querySelector("[data-memory-capture-list]")).toBeNull();
  });

  it("renders the embedded memory view as a normal list inside its own scroll container", async () => {
    setMockNodes([
      createNode({
        id: "embedded-old",
        content: "Embebida antigua",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      createNode({
        id: "embedded-middle",
        content: "Embebida intermedia",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      createNode({
        id: "embedded-new",
        content: "Embebida reciente",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);
    const embeddedScreen = await renderKnowledgeBase(
      createElement(KnowledgeBaseClient as ComponentType<{ embedded?: boolean }>, {
        embedded: true,
      }),
    );
    const shell = embeddedScreen.querySelector("[data-knowledge-base-client]");
    const searchRegion = embeddedScreen.querySelector("[data-memory-search-region]");
    const resultsScroll = embeddedScreen.querySelector("[data-memory-results-scroll]");
    const captureList = embeddedScreen.querySelector("[data-memory-capture-list]");
    const cards = Array.from(captureList?.children ?? []);

    expect(shell?.hasAttribute("data-memory-scroll-container")).toBe(false);
    expect(shell?.className).toContain("vinema-memory-shell");
    expect(shell?.className).toContain("vinema-memory-shell--embedded");
    expect(shell?.className).toContain("flex-col");
    expect(shell?.className).toContain("min-h-0");
    expect(shell?.className).not.toContain("overflow-y-auto");
    expect(shell?.className).not.toContain("vinema-scrollbar");
    expect(searchRegion?.className).toContain("vinema-memory-search-region");
    expect(searchRegion?.parentElement).toBe(shell);
    expect(resultsScroll?.getAttribute("data-memory-scroll-container")).toBe("");
    expect(resultsScroll?.className).toContain("vinema-memory-results-scroll");
    expect(resultsScroll?.className).toContain("min-h-0");
    expect(resultsScroll?.className).toContain("flex-1");
    expect(resultsScroll?.className).toContain("overflow-y-auto");
    expect(resultsScroll?.className).toContain("vinema-scrollbar");
    expect(resultsScroll?.parentElement).toBe(shell);
    expect(captureList?.className).toContain("space-y-3");
    expect(captureList?.parentElement).toBe(resultsScroll);
    expect(resultsScroll?.contains(searchRegion)).toBe(false);
    expect(embeddedScreen.querySelector("[data-memory-stack-list]")).toBeNull();
    expect(embeddedScreen.querySelector("[data-memory-stack-page]")).toBeNull();
    expect(cards).toHaveLength(3);
    expect(cards.every((card) => card.tagName === "ARTICLE")).toBe(true);
  });

  it("rebuilds memory list entries from the current search result set", async () => {
    mocks.searchParams = new URLSearchParams("q=mitcom");
    setMockNodes([
      createNode({ id: "match", content: "Mitcom activo" }),
      createNode({ id: "other", content: "Contenido externo" }),
    ]);

    const screen = await renderKnowledgeBase();
    const cards = Array.from(
      screen.querySelectorAll("[data-memory-capture-list] > article"),
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain("Mitcom activo");
    expect(cards[0]?.textContent).not.toContain("Contenido externo");
  });

  it("keeps only the memory search header sticky and removes stack carousel CSS", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");

    expect(globals).toContain(".vinema-memory-shell");
    expect(globals).toContain(".vinema-memory-shell--embedded");
    expect(globals).toContain("--vinema-memory-header-offset: 3.5rem;");
    expect(globals).toContain("--vinema-memory-header-offset: 0rem");
    expect(globals).toContain(".vinema-memory-shell--embedded .vinema-memory-search-region");
    expect(globals).toContain("position: relative;");
    expect(globals).toContain("top: auto;");
    expect(globals).toContain("flex: none;");
    expect(globals).toContain(".vinema-memory-search-region");
    expect(globals).toContain("position: sticky;");
    expect(globals).toContain("top: var(--vinema-memory-header-offset);");
    expect(globals).toContain("z-index: 20;");
    expect(globals).toContain("width: 100%;");
    expect(globals).toContain("margin: 0;");
    expect(globals).toContain("padding: 0.625rem 0 0.5rem;");
    expect(globals).toContain("border-bottom: 1px solid var(--vinema-border-subtle);");
    expect(globals).toContain("background: var(--vinema-surface-panel);");
    expect(globals).toContain(".vinema-memory-search-panel");
    expect(globals).toContain("padding-inline: 0.625rem;");
    expect(globals).toContain("@media (min-width: 641px) and (max-width: 1024px)");
    expect(globals).not.toContain("vinema-memory-stack");
    expect(globals).not.toContain("--memory-stack");
    expect(globals).not.toContain("data-memory-stack");
    expect(globals).not.toContain("vinema-memory-card");
    expect(globals).not.toContain("scroll-snap");
    expect(globals).not.toContain("padding-bottom: var(--vinema-memory-stack");
    expect(globals).not.toContain("--vinema-memory-header-offset: calc(3.5rem");
    expect(globals).not.toContain("border-radius: 0.75rem;");
  });

  it("removes stack carousel code from the memory client", () => {
    const source = readFileSync("src/app/notes/knowledge-base-client.tsx", "utf8");

    expect(source).toContain('data-memory-capture-list=""');
    expect(source).not.toContain("MemoryStackPage");
    expect(source).not.toContain("memoryStack");
    expect(source).not.toContain("data-memory-stack");
    expect(source).not.toContain("--memory-stack");
    expect(source).not.toContain("IntersectionObserver");
    expect(source).not.toContain("activeStackIndex");
    expect(source).not.toContain("scroll-snap");
  });

  it("renders a single memory surface and groups captures with the same emergent identity", async () => {
    setMockNodes([
      createNode({
        id: "thread-new",
        content: "Coordinar recepcion del servidor",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
      createNode({
        id: "thread-old",
        content: "Revisar layout NTI",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      createNode({
        id: "partial",
        content: "Seguimiento Mitcom sin servidor",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    setMockContexts([
      createContext({ id: "mitcom", name: "Mitcom" }),
      createContext({ id: "tracking", name: "Tracking" }),
      createContext({ id: "server", name: "Servidor" }),
    ]);
    setMockRelations([
      createRelation({ nodeId: "thread-new", contextId: "server" }),
      createRelation({ nodeId: "thread-new", contextId: "mitcom" }),
      createRelation({ nodeId: "thread-new", contextId: "tracking" }),
      createRelation({ nodeId: "thread-old", contextId: "tracking" }),
      createRelation({ nodeId: "thread-old", contextId: "server" }),
      createRelation({ nodeId: "thread-old", contextId: "mitcom" }),
      createRelation({ nodeId: "partial", contextId: "mitcom" }),
      createRelation({ nodeId: "partial", contextId: "tracking" }),
    ]);

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain("Memoria");
    expect(screen.textContent).toContain("Tus capturas organizadas por contexto.");
    expect(screen.textContent).not.toContain("Tus capturas organizadas por contexto y tiempo.");
    expect(screen.textContent).not.toContain("Hilos");
    expect(screen.textContent).not.toContain("Tiempo");
    expect(screen.textContent).not.toContain("Archivo");
    expect(getLinkByHref(screen, "/#capture")).toBeUndefined();
    expect(screen.querySelector("[aria-label='Modo de Memoria']")).toBeNull();
    expect(screen.textContent).toContain("Mitcom · Servidor · Tracking");
    expect(screen.textContent).toContain("2 capturas");
    expect(screen.textContent).toContain("Seguimiento Mitcom sin servidor");
  });

  it("expands and collapses memory threads without navigating away", async () => {
    setMockNodes([
      createNode({
        id: "one",
        content: "Primera captura",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      createNode({
        id: "two",
        content: "Segunda captura",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      createNode({
        id: "three",
        content: "Tercera captura",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);
    setMockContexts([createContext({ id: "mitcom", name: "Mitcom" })]);
    setMockRelations([
      createRelation({ nodeId: "one", contextId: "mitcom" }),
      createRelation({ nodeId: "two", contextId: "mitcom" }),
      createRelation({ nodeId: "three", contextId: "mitcom" }),
    ]);

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).not.toContain("Primera captura");

    await click(getButtonContaining(screen, "Ver 3 capturas"));
    expect(screen.textContent).toContain("Primera captura");

    await click(getButton(screen, "Contraer"));
    expect(screen.textContent).not.toContain("Primera captura");
  });

  it("keeps individual captures visible without exposing a time mode", async () => {
    setMockNodes([
      createNode({
        id: "old",
        content: "Captura antigua",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      createNode({
        id: "new",
        content: "Captura reciente",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);

    const screen = await renderKnowledgeBase();

    const links = Array.from(screen.querySelectorAll("a[href^='/memory/detail']"));
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Captura reciente"),
      expect.stringContaining("Captura antigua"),
    ]);
    expect(screen.textContent).not.toContain("Tiempo");
  });

  it("searches Hilos by emergent identity labels and aliases", async () => {
    mocks.searchParams = new URLSearchParams("q=proveedor mitcom");
    setMockNodes([
      createNode({ id: "match-a", content: "Contenido A" }),
      createNode({ id: "match-b", content: "Contenido B" }),
      createNode({ id: "other", content: "Contenido C" }),
    ]);
    setMockContexts([
      createContext({
        id: "mitcom",
        name: "Mitcom",
        aliases: ["Proveedor Mitcom"],
        normalizedAliases: ["proveedor mitcom"],
      }),
      createContext({ id: "railway", name: "Railway" }),
    ]);
    setMockRelations([
      createRelation({ nodeId: "match-a", contextId: "mitcom" }),
      createRelation({ nodeId: "match-b", contextId: "mitcom" }),
      createRelation({ nodeId: "other", contextId: "railway" }),
    ]);

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain("2 resultados para \"proveedor mitcom\".");
    expect(screen.textContent).toContain("Mitcom");
    expect(screen.textContent).toContain("Contenido A");
    expect(screen.textContent).toContain("Contenido B");
    expect(screen.textContent).not.toContain("Contenido C");
  });

  it("searches individual memory entries by emergent identity aliases", async () => {
    mocks.searchParams = new URLSearchParams("q=proveedor mitcom");
    setMockNodes([
      createNode({ id: "match", content: "Contenido sin el alias visible" }),
      createNode({ id: "other", content: "Contenido externo" }),
    ]);
    setMockContexts([
      createContext({
        id: "mitcom",
        name: "Mitcom",
        aliases: ["Proveedor Mitcom"],
        normalizedAliases: ["proveedor mitcom"],
      }),
      createContext({ id: "railway", name: "Railway" }),
    ]);
    setMockRelations([
      createRelation({ nodeId: "match", contextId: "mitcom" }),
      createRelation({ nodeId: "other", contextId: "railway" }),
    ]);

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain("1 resultados para \"proveedor mitcom\".");
    expect(screen.textContent).toContain("Contenido sin el alias visible");
    expect(screen.textContent).not.toContain("Contenido externo");
  });

  it("shows accepted concepts as emergent identity without duplicating the body", async () => {
    setMockNodes([
      createNode({
        id: "capture-identity",
        content:
          "Necesitamos revisar por que Railway no esta usando el workspace autenticado.",
      }),
    ]);
    setMockContexts([
      createContext({ id: "railway", name: "Railway" }),
      createContext({ id: "sync", name: "Sincronizacion" }),
      createContext({ id: "workspace", name: "Workspace" }),
    ]);
    setMockRelations([
      createRelation({
        nodeId: "capture-identity",
        contextId: "railway",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      createRelation({
        nodeId: "capture-identity",
        contextId: "sync",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      createRelation({
        nodeId: "capture-identity",
        contextId: "workspace",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain("Railway · Sincronizacion · Workspace");
    expect(countText(screen, "Necesitamos revisar por que Railway")).toBe(1);
  });

  it("does not fabricate an identity when a capture has no accepted concepts", async () => {
    setMockNodes([
      createNode({
        id: "capture-without-identity",
        content: "Contenido sin relaciones aceptadas",
      }),
    ]);

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain("Contenido sin relaciones aceptadas");
    expect(screen.textContent).not.toContain("Sin título");
    expect(countText(screen, "Contenido sin relaciones aceptadas")).toBe(1);
  });

  it("refreshes the open Knowledge Base after a global capture is created", async () => {
    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain("0 capturas activas.");

    setMockNodes([
      createNode({
        id: "quick-capture",
        content: "Captura rapida desde detalle",
      }),
    ]);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(CAPTURE_CREATED_EVENT));
      await flushPromises();
    });

    expect(screen.textContent).toContain("1 capturas activas.");
    expect(screen.textContent).toContain("Captura rapida desde detalle");
  });

  it("refreshes the open Knowledge Base after remote sync changes IndexedDB", async () => {
    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain("0 capturas activas.");

    setMockNodes([
      createNode({
        id: "remote-capture",
        content: "Captura recibida por Pull",
      }),
    ]);

    await act(async () => {
      emitSyncDataChanged({
        workspaceId: "workspace-1",
        entityTypes: ["capture"],
        changedAt: "2026-07-31T12:00:00.000Z",
      });
      await flushPromises();
    });

    expect(screen.textContent).toContain("1 capturas activas.");
    expect(screen.textContent).toContain("Captura recibida por Pull");
  });

  it("does not refresh Knowledge Base for another workspace sync event", async () => {
    const screen = await renderKnowledgeBase();

    setMockNodes([
      createNode({
        id: "other-workspace-event",
        content: "No deberia aparecer aun",
      }),
    ]);

    await act(async () => {
      emitSyncDataChanged({
        workspaceId: "workspace-2",
        entityTypes: ["capture"],
        changedAt: "2026-07-31T12:00:00.000Z",
      });
      await flushPromises();
    });

    expect(screen.textContent).toContain("0 capturas activas.");
    expect(screen.textContent).not.toContain("No deberia aparecer aun");
  });

  it("searches with the shared recovery logic, shows count, highlights safely and preserves returnTo", async () => {
    mocks.searchParams = new URLSearchParams("q=%20Mitcom%20%28A%29%20");
    setMockNodes([
      createNode({
        id: "match",
        content: "Seguimiento con caracteres especiales Mitcom (A)",
      }),
      createNode({
        id: "legacy-status",
        status: "ARCHIVED",
        content: "Mitcom (A) historico",
      }),
      createNode({
        id: "other",
      }),
    ]);

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain('2 resultados para "Mitcom (A)".');
    expect(screen.querySelectorAll("mark")).toHaveLength(4);
    expect(getFirstDetailLink(screen)?.getAttribute("href")).toBe(
      "/memory/detail?nodeId=legacy-status&returnTo=%2Fmemory%3Fq%3DMitcom%2520(A)",
    );
    expect(screen.textContent).toContain("historico");
  });

  it("clears an empty search state", async () => {
    mocks.searchParams = new URLSearchParams("q=inexistente");
    setMockNodes([
      createNode({ id: "capture", content: "Contenido real" }),
    ]);

    const screen = await renderKnowledgeBase();

    expect(screen.textContent).toContain(
      'No encontramos capturas para "inexistente".',
    );

    await click(getButton(screen, "Limpiar busqueda"));

    expect(mocks.replace).toHaveBeenCalledWith("/memory", { scroll: false });
  });

  it("opens memory details through callbacks when embedded", async () => {
    const openMemory = vi.fn();
    setMockNodes([
      createNode({
        id: "embedded-memory",
        content: "Captura para abrir dentro del workspace",
      }),
    ]);

    const screen = await renderKnowledgeBase(
      createElement(KnowledgeBaseClient as ComponentType<{
        embedded?: boolean;
        onOpenMemory?: (nodeId: string) => void;
      }>, { embedded: true, onOpenMemory: openMemory }),
    );
    const memoryButton = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label")?.includes("Abrir captura"),
    );
    const surface = screen.querySelector("section") as HTMLElement;
    const firstContent = Array.from(surface.children).find(
      (child) => !child.hasAttribute("aria-live"),
    );
    const searchRegion = screen.querySelector("[data-memory-search-region]");
    const resultsScroll = screen.querySelector("[data-memory-results-scroll]");

    expect(memoryButton).toBeTruthy();
    expect(screen.querySelector("h1")).toBeNull();
    expect(screen.textContent).not.toContain("Tus capturas organizadas por contexto.");
    expect(firstContent).toBe(searchRegion);
    expect(searchRegion?.querySelector("form")?.textContent).toContain("Buscar");
    expect(firstContent?.textContent).toContain("Buscar");
    expect(surface.hasAttribute("data-memory-scroll-container")).toBe(false);
    expect(resultsScroll?.getAttribute("data-memory-scroll-container")).toBe("");
    expect(resultsScroll?.parentElement).toBe(surface);
    expect(resultsScroll?.contains(searchRegion)).toBe(false);
    expect(screen.querySelector("[data-memory-capture-list]")).toBeTruthy();
    expect(screen.querySelector("[data-memory-stack-list]")).toBeNull();
    expect(screen.querySelector("[data-memory-stack-page]")).toBeNull();
    expect(screen.querySelector("a[href^='/memory/detail']")).toBeNull();

    await click(memoryButton as HTMLButtonElement);

    expect(openMemory).toHaveBeenCalledWith("embedded-memory");
    expect(mocks.replace).not.toHaveBeenCalledWith(
      expect.stringContaining("/memory/detail"),
      expect.anything(),
    );
  });
});

describe("highlight text", () => {
  it("handles special characters without unsafe HTML", () => {
    expect(createHighlightedParts("Mitcom (A) + soporte", "(A) +")).toEqual([
      { text: "Mitcom ", highlighted: false },
      { text: "(A)", highlighted: true },
      { text: " ", highlighted: false },
      { text: "+", highlighted: true },
      { text: " soporte", highlighted: false },
    ]);
  });
});

async function renderKnowledgeBase(
  element: ReactElement = createElement(KnowledgeBaseClient),
) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(element);
    await flushPromises();
  });

  return container;
}

function setMockNodes(nodes: Node[]) {
  mocks.nodes.clear();
  nodes.forEach((node) => mocks.nodes.set(node.id, node));
}

function setMockContexts(contexts: Context[]) {
  mocks.contexts.clear();
  contexts.forEach((context) => mocks.contexts.set(context.id, context));
}

function setMockRelations(relations: NodeContextRelation[]) {
  mocks.relations.clear();
  relations.forEach((relation) => mocks.relations.set(relation.id, relation));
}

function createNode({
  id,
  content = "Contenido",
  updatedAt = "2026-01-01T00:00:00.000Z",
  status = "ACTIVE",
}: {
  id: string;
  content?: string;
  updatedAt?: string;
  status?: Node["status"];
}): Node {
  return {
    id,
    workspaceId: "workspace-1",
    type: "NOTE",
    content,
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
    id: `relation-${overrides.nodeId ?? "node"}-${overrides.contextId ?? "context"}`,
    workspaceId: "workspace-1",
    nodeId: "node-1",
    contextId: "context-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function countText(container: HTMLElement, text: string) {
  return (container.textContent?.split(text).length ?? 1) - 1;
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === name,
  );

  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }

  return button as HTMLButtonElement;
}

function getButtonContaining(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button as HTMLButtonElement;
}

function getFirstDetailLink(container: HTMLElement) {
  return container.querySelector("a[href^='/memory/detail']");
}

function getLinkByHref(container: HTMLElement, href: string) {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find(
    (link) => link.getAttribute("href") === href,
  );
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await flushPromises();
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
