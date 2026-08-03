import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
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
        (node) => node.status === "ACTIVE",
      );
    },
    async listInbox(): Promise<Node[]> {
      return Array.from(nodes.values()).filter(
        (node) => node.organizationStatus === "INBOX",
      );
    },
    async listArchived(): Promise<Node[]> {
      return Array.from(nodes.values()).filter(
        (node) => node.status === "ARCHIVED",
      );
    },
    async listByWorkspace(
      workspaceId: string,
      options: { includeArchived?: boolean } = {},
    ): Promise<Node[]> {
      return Array.from(nodes.values()).filter(
        (node) =>
          node.workspaceId === workspaceId &&
          node.deletedAt === null &&
          (options.includeArchived || node.status !== "ARCHIVED"),
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
  });

  afterEach(() => {
    mocks.replace.mockClear();
    document.body.replaceChildren();
  });

  it("orders active captures stably and excludes archived captures", async () => {
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

    expect(page.items.map((item) => item.id)).toEqual(["new", "a", "b"]);
    expect(page.total).toBe(3);
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

  it("starts in Hilos mode and groups captures with the same emergent identity", async () => {
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
    expect(screen.querySelector("button[aria-pressed='true']")?.textContent).toBe(
      "Hilos",
    );
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

  it("switches to Tiempo mode and preserves chronological capture cards", async () => {
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
    await click(getButton(screen, "Tiempo"));

    const links = Array.from(screen.querySelectorAll("a[href^='/memory/detail']"));
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Captura reciente"),
      expect.stringContaining("Captura antigua"),
    ]);
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

  it("searches Tiempo by emergent identity aliases", async () => {
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
    await click(getButton(screen, "Tiempo"));

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
        id: "archived",
        status: "ARCHIVED",
      }),
      createNode({
        id: "other",
      }),
    ]);

    const screen = await renderKnowledgeBase();
    await click(getButton(screen, "Tiempo"));

    expect(screen.textContent).toContain('1 resultados para "Mitcom (A)".');
    expect(screen.querySelectorAll("mark")).toHaveLength(2);
    expect(getFirstDetailLink(screen)?.getAttribute("href")).toBe(
      "/memory/detail?nodeId=match&returnTo=%2Fmemory%3Fq%3DMitcom%2520(A)",
    );
    expect(screen.textContent).not.toContain("archivado");
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

async function renderKnowledgeBase() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(createElement(KnowledgeBaseClient));
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
