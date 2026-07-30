import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeBaseClient } from "@/app/notes/knowledge-base-client";
import type { Node } from "@/domain/node/node";
import { CAPTURE_CREATED_EVENT } from "@/features/capture/capture-events";
import {
  KNOWLEDGE_BASE_BATCH_SIZE,
  listKnowledgeCapturePage,
} from "@/features/capture/list-knowledge-captures";
import { createHighlightedParts } from "@/features/recovery/highlight-text";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const mocks = vi.hoisted(() => {
  const nodes = new Map<string, Node>();
  const vinemaContext = {
    status: "ready",
    device: null,
    workspace: { id: "workspace-1", name: "Personal" },
    error: null,
  };

  return {
    nodes,
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
    getById: vi.fn(async () => null),
  },
  createLocalSyncRepositorySet: vi.fn(() => ({
    contextRepository: {
      getById: vi.fn(async () => null),
    },
    nodeContextRelationRepository: {
      listByNodeId: vi.fn(async () => []),
      listByWorkspace: vi.fn(async () => []),
    },
    nodeRepository: mocks.nodeRepository,
  })),
  nodeContextRelationRepository: {
    listByNodeId: vi.fn(async () => []),
    listByWorkspace: vi.fn(async () => []),
  },
  nodeRepository: mocks.nodeRepository,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("Knowledge Base", () => {
  beforeEach(() => {
    mocks.nodes.clear();
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
    expect(screen.querySelectorAll("a[href^='/notes/detail']")).toHaveLength(
      KNOWLEDGE_BASE_BATCH_SIZE,
    );

    await click(getButton(screen, "Cargar mas"));

    const links = Array.from(
      screen.querySelectorAll("a[href^='/notes/detail']"),
    ).map((link) => link.getAttribute("href"));

    expect(links).toHaveLength(KNOWLEDGE_BASE_BATCH_SIZE + 1);
    expect(new Set(links).size).toBe(KNOWLEDGE_BASE_BATCH_SIZE + 1);
    expect(screen.textContent).toContain("Llegaste al final del Historial.");
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

    expect(screen.textContent).toContain('1 resultados para "Mitcom (A)".');
    expect(screen.querySelectorAll("mark")).toHaveLength(4);
    expect(getFirstDetailLink(screen)?.getAttribute("href")).toBe(
      "/notes/detail?nodeId=match&returnTo=%2Fnotes%3Fq%3DMitcom%2520(A)",
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

    expect(mocks.replace).toHaveBeenCalledWith("/notes", { scroll: false });
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

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === name,
  );

  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }

  return button as HTMLButtonElement;
}

function getFirstDetailLink(container: HTMLElement) {
  return container.querySelector("a[href^='/notes/detail']");
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
