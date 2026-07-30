import { act, createElement } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveClient } from "@/app/notes/archive/archive-client";
import type { Node } from "@/domain/node/node";
import {
  KNOWLEDGE_BASE_BATCH_SIZE,
  listArchivedCapturePage,
} from "@/features/capture/list-knowledge-captures";
import { searchNodes } from "@/features/recovery/search-nodes";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const mocks = vi.hoisted(() => {
  const nodes = new Map<string, Node>();
  const device = {
    id: "device-1",
    name: "Web",
    platform: "WEB",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };
  const nodeRepository = {
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
      return Array.from(nodes.values()).filter((node) => node.status === "ACTIVE");
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
  };

  return {
    device,
    nodeRepository,
    nodes,
    replace: vi.fn(),
    searchParams: new URLSearchParams(),
    vinemaContext: {
      status: "ready",
      device,
      workspace: { id: "workspace-1", name: "Personal" },
      error: null,
    },
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

describe("Archive", () => {
  beforeEach(() => {
    mocks.nodes.clear();
    mocks.searchParams = new URLSearchParams();
  });

  afterEach(() => {
    mocks.replace.mockClear();
    document.body.replaceChildren();
  });

  it("lists only archived captures with stable ordering and pagination", async () => {
    const repository = new InMemoryNodeRepository([
      createNode({ id: "active", status: "ACTIVE" }),
      createNode({
        id: "b",
        status: "ARCHIVED",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      createNode({
        id: "a",
        status: "ARCHIVED",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      createNode({
        id: "new",
        status: "ARCHIVED",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);

    const page = await listArchivedCapturePage(repository, {
      workspaceId: "workspace-1",
      limit: 2,
    });

    expect(page.items.map((item) => item.id)).toEqual(["new", "a"]);
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(true);
  });

  it("renders archived batches, avoids duplicates and detects the end", async () => {
    setMockNodes(
      Array.from({ length: KNOWLEDGE_BASE_BATCH_SIZE + 1 }, (_, index) =>
        createNode({
          id: `archived-${String(index).padStart(2, "0")}`,
          content: `Archivada ${index}`,
          status: "ARCHIVED",
          updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        }),
      ),
    );

    const screen = await render(createElement(ArchiveClient));

    expect(screen.textContent).toContain(
      `${KNOWLEDGE_BASE_BATCH_SIZE + 1} capturas archivadas.`,
    );
    expect(screen.querySelectorAll("a[href^='/notes/detail']")).toHaveLength(
      KNOWLEDGE_BASE_BATCH_SIZE,
    );

    await click(getButton(screen, "Cargar mas"));

    const links = Array.from(screen.querySelectorAll("a[href^='/notes/detail']"));
    expect(links).toHaveLength(KNOWLEDGE_BASE_BATCH_SIZE + 1);
    expect(new Set(links.map((link) => link.getAttribute("href"))).size).toBe(
      KNOWLEDGE_BASE_BATCH_SIZE + 1,
    );
    expect(screen.textContent).toContain("Llegaste al final del Archivo.");
  });

  it("searches only archived captures and preserves returnTo", async () => {
    mocks.searchParams = new URLSearchParams("q=%20Mitcom%20%28A%29%20");
    setMockNodes([
      createNode({
        id: "archived-match",
        content: "Contrato Mitcom (A)",
        status: "ARCHIVED",
      }),
      createNode({
        id: "active-match",
        status: "ACTIVE",
      }),
    ]);

    const screen = await render(createElement(ArchiveClient));

    expect(screen.textContent).toContain(
      '1 resultados archivados para "Mitcom (A)".',
    );
    expect(screen.querySelectorAll("mark")).toHaveLength(4);
    expect(screen.querySelector("a[href^='/notes/detail']")?.getAttribute("href")).toBe(
      "/notes/detail?nodeId=archived-match&returnTo=%2Fnotes%2Farchive%3Fq%3DMitcom%2520(A)",
    );

    await expect(
      searchNodes(
        {
          contextRepository: new InMemoryContextRepository(),
          nodeContextRelationRepository: new InMemoryNodeContextRelationRepository(),
          nodeRepository: mocks.nodeRepository,
        },
        { workspaceId: "workspace-1", query: "Mitcom", scope: "archived" },
      ),
    ).resolves.toHaveLength(1);
  });

  it("restores the same record and removes it from Archive", async () => {
    setMockNodes([
      createNode({
        id: "restore-me",
        content: "Contenido intacto",
        status: "ARCHIVED",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    const screen = await render(createElement(ArchiveClient));

    await click(getButton(screen, "Restaurar"));

    const restored = mocks.nodes.get("restore-me");
    expect(restored).toMatchObject({
      id: "restore-me",
      content: "Contenido intacto",
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(screen.textContent).toContain("Captura restaurada.");
    expect(screen.textContent).toContain("No hay capturas archivadas.");
  });

  it("shows empty and empty-search states", async () => {
    const empty = await render(createElement(ArchiveClient));

    expect(empty.textContent).toContain("No hay capturas archivadas.");

    mocks.searchParams = new URLSearchParams("q=nada");
    setMockNodes([createNode({ id: "archived", status: "ARCHIVED" })]);

    const noResults = await render(createElement(ArchiveClient));

    expect(noResults.textContent).toContain(
      'No encontramos capturas archivadas para "nada".',
    );
    await click(getButton(noResults, "Limpiar busqueda"));
    expect(mocks.replace).toHaveBeenCalledWith("/notes/archive", {
      scroll: false,
    });
  });
});

async function render(element: ReactElement) {
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

function createNode({
  id,
  content = "Contenido",
  status = "ACTIVE",
  type = "NOTE",
  organizationStatus = "ORGANIZED",
  createdAt = "2026-01-01T00:00:00.000Z",
  updatedAt = "2026-01-01T00:00:00.000Z",
}: {
  id: string;
  content?: string;
  status?: Node["status"];
  type?: Node["type"];
  organizationStatus?: Node["organizationStatus"];
  createdAt?: string;
  updatedAt?: string;
}): Node {
  return {
    id,
    workspaceId: "workspace-1",
    type,
    content,
    status,
    organizationStatus,
    metadata: {},
    version: 1,
    createdAt,
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
