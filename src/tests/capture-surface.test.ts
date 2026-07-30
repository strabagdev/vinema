import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureSurface } from "@/features/capture/capture-surface";
import {
  CAPTURE_DRAFT_KEY,
  saveCaptureDraft,
} from "@/features/capture/capture-draft";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";
import type { Node } from "@/domain/node/node";
import type { Context } from "@/domain/context/context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class MemoryStorageAdapter implements StorageAdapter {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const workspace: Workspace = {
  id: "workspace-1",
  name: "Personal",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const device: Device = {
  id: "device-1",
  name: "Web",
  platform: DevicePlatform.WEB,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

describe("CaptureSurface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("autosaves a draft, restores it after remount and does not create a capture", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository();
    const screen = await renderCaptureSurface({ storage, nodeRepository });

    await changeTextarea(screen.container, "Proveedor Mitcom pendiente");
    await advanceTime(500);

    await expect(storage.get(CAPTURE_DRAFT_KEY)).resolves.toMatchObject({
      content: "Proveedor Mitcom pendiente",
    });
    await expect(nodeRepository.listByWorkspace(workspace.id)).resolves.toEqual([]);

    await act(async () => {
      screen.root.unmount();
    });

    const restored = await renderCaptureSurface({ storage, nodeRepository });

    expect(getTextarea(restored.container)?.value).toBe(
      "Proveedor Mitcom pendiente",
    );
    await expect(nodeRepository.listByWorkspace(workspace.id)).resolves.toEqual([]);
  });

  it("does not show capture actions for empty or whitespace-only content", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository();
    const screen = await renderCaptureSurface({ storage, nodeRepository });

    expect(queryButton(screen.container, "Capturar")).toBeUndefined();

    await changeTextarea(screen.container, "   ");
    await advanceTime(500);

    await expect(storage.get(CAPTURE_DRAFT_KEY)).resolves.toBeNull();
    await expect(nodeRepository.listByWorkspace(workspace.id)).resolves.toEqual([]);
    expect(queryButton(screen.container, "Capturar")).toBeUndefined();
  });

  it("does not show association suggestions before there is enough useful text", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "meeting",
        content:
          "Las reuniones extensas reducen mi capacidad de concentración durante la tarde.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    expect(screen.container.textContent).not.toContain("Esto me recordó a…");

    await changeTextarea(screen.container, "reu");
    await advanceTime(500);

    expect(screen.container.textContent).not.toContain("Esto me recordó a…");
  });

  it("finishes recovery for a short specific query with results", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Proveedor Mitcom pendiente de seguimiento",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "mitcom");
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Esto me recordó a…");
    expect(screen.container.textContent).toContain("Proveedor Mitcom");
    expect(screen.container.textContent).not.toContain("Recordando...");
  });

  it("finishes recovery for a short specific query without results", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "mitcom");
    await advanceTime(500);

    expect(screen.container.textContent).not.toContain("Recordando...");
    expect(screen.container.textContent).not.toContain("Esto me recordó a…");
  });

  it("does not restart recovery from stable empty selected capture ids", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Proveedor Mitcom pendiente de seguimiento",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const listByWorkspace = vi.spyOn(nodeRepository, "listByWorkspace");
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "mitcom");
    await advanceTime(500);
    await advanceTime(1500);

    expect(screen.container.textContent).not.toContain("Recordando...");
    expect(listByWorkspace).toHaveBeenCalledTimes(2);
  });

  it("captures once, clears the editor and updates recent content", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository();
    const screen = await renderCaptureSurface({ storage, nodeRepository });

    await changeTextarea(screen.container, "Reunion con Mitcom sobre soporte");
    await advanceTime(500);
    await doubleClick(getButton(screen.container, "Capturar"));

    const captures = await nodeRepository.listByWorkspace(workspace.id);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      type: "NOTE",
      organizationStatus: "ORGANIZED",
      content: "Reunion con Mitcom sobre soporte",
    });
    await waitFor(() => getTextarea(screen.container)?.value === "");
    expect(getTextarea(screen.container)?.value).toBe("");
    await waitFor(async () => (await storage.get(CAPTURE_DRAFT_KEY)) === null);
    await expect(storage.get(CAPTURE_DRAFT_KEY)).resolves.toBeNull();
    expect(screen.container.textContent).toContain(
      "Reunion con Mitcom sobre soporte",
    );
    expect(getFirstResultLink(screen.container)?.getAttribute("href")).toContain(
      "/notes/detail?nodeId=",
    );
  });

  it("orders recent captures by date and hides them while writing", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "older",
        content: "Aprendizaje anterior",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      createStoredNode({
        id: "newer",
        content: "Decision nueva para Andes Norte",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    const text = screen.container.textContent ?? "";
    expect(text.indexOf("Decision nueva para Andes Norte")).toBeLessThan(
      text.indexOf("Aprendizaje anterior"),
    );
    expect(
      getLinkByHref(screen.container, "nodeId=newer")?.getAttribute("href"),
    ).toBe("/notes/detail?nodeId=newer&returnTo=%2F");

    await changeTextarea(screen.container, "Borrador privado");
    await advanceTime(500);

    expect(screen.container.textContent).not.toContain("Decision nueva para Andes Norte");
    expect(screen.container.textContent).not.toContain("Aprendizaje anterior");
  });

  it("restores a draft directly into the editor without showing recent captures", async () => {
    const storage = new MemoryStorageAdapter();
    await saveCaptureDraft(storage, "Borrador privado sin capturar");
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "recent",
        content: "Captura visible solo con editor vacio",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);

    const screen = await renderCaptureSurface({ storage, nodeRepository });

    expect(getTextarea(screen.container)?.value).toBe(
      "Borrador privado sin capturar",
    );
    expect(screen.container.textContent).not.toContain(
      "Captura visible solo con editor vacio",
    );
  });

  it("shows active historical captures without requiring the old organized state", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "legacy-idea",
        content: "Captura antigua disponible",
        organizationStatus: "INBOX",
        type: "IDEA",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    expect(screen.container.textContent).toContain("Captura antigua disponible");
  });

  it("shows recovered captures as one-line links without creating relations", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Reunion de control de gestion con proveedor Mitcom",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const screen = await renderCaptureSurface({
      storage,
      nodeRepository,
      relationRepository,
    });

    await changeTextarea(
      screen.container,
      "Planificar control de gestion con Mitcom",
    );
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Esto me recordó a…");
    expect(screen.container.textContent).toContain("Mitcom");
    expect(screen.container.querySelector("input[type='checkbox']")).toBeNull();

    const recoveryLink = getLinkByHref(screen.container, "nodeId=mitcom");
    expect(recoveryLink?.querySelector("span")?.className).toContain("truncate");
    await clickElement(recoveryLink as HTMLAnchorElement);
    await expect(relationRepository.listByWorkspace(workspace.id)).resolves.toEqual(
      [],
    );
    await expect(storage.get(CAPTURE_DRAFT_KEY)).resolves.toMatchObject({
      content: "Planificar control de gestion con Mitcom",
    });
  });

  it("shows concept chips, preserves manual selection and saves selected concepts only", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "rare-carbon",
        content: "Rare Carbon es una alternativa al perfil de Ombre Leather.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "perfumes", name: "Perfumes" }),
      createContext({ id: "compras", name: "Compras" }),
      createContext({ id: "trabajo", name: "Trabajo" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      {
        id: "rare-carbon-perfumes",
        workspaceId: workspace.id,
        nodeId: "rare-carbon",
        contextId: "perfumes",
        version: 1,
        createdAt: "2026-01-05T00:00:00.000Z",
      },
    ]);
    const screen = await renderCaptureSurface({
      storage,
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(
      screen.container,
      "Perfumes parecidos a Ombre Leather para comprar despues",
    );
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Conceptos");
    expect(screen.container.textContent).toContain("Perfumes");
    expect(screen.container.textContent).not.toContain("Trabajo");

    const perfumeChip = getButton(screen.container, "Perfumes");
    expect(perfumeChip.getAttribute("aria-pressed")).toBe("false");
    await click(perfumeChip);
    expect(perfumeChip.getAttribute("aria-pressed")).toBe("true");

    await changeTextarea(
      screen.container,
      "Un texto distinto sobre Leather que cambia el ranking",
    );
    await advanceTime(500);
    expect(screen.container.textContent).toContain("Perfumes");
    expect(getButton(screen.container, "Perfumes").getAttribute("aria-pressed")).toBe(
      "true",
    );

    await click(getButton(screen.container, "Capturar"));
    await waitFor(async () => (await storage.get(CAPTURE_DRAFT_KEY)) === null);

    const captures = await nodeRepository.listByWorkspace(workspace.id);
    const newCapture = captures.find((node) =>
      node.content.includes("Un texto distinto"),
    );
    const relations = await relationRepository.listByWorkspace(workspace.id);

    expect(newCapture).toBeDefined();
    expect(relations).toHaveLength(2);
    expect(relations).toContainEqual(
      expect.objectContaining({
        nodeId: newCapture?.id,
        contextId: "perfumes",
      }),
    );
    expect(relations).not.toContainEqual(
      expect.objectContaining({
        relationType: "CAPTURE_ASSOCIATION",
      }),
    );
  });

  it("suggests Reuniones from related captures and persists the selected concept", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "reunion-1",
        content: "Reunion semanal con proveedor Mitcom para revisar soporte.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
      createStoredNode({
        id: "reunion-2",
        content: "Preparar reunion de seguimiento del equipo comercial.",
        updatedAt: "2026-01-06T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "reuniones", name: "Reuniones" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      {
        id: "reunion-1-reuniones",
        workspaceId: workspace.id,
        nodeId: "reunion-1",
        contextId: "reuniones",
        version: 1,
        createdAt: "2026-01-05T00:00:00.000Z",
      },
      {
        id: "reunion-2-reuniones",
        workspaceId: workspace.id,
        nodeId: "reunion-2",
        contextId: "reuniones",
        version: 1,
        createdAt: "2026-01-06T00:00:00.000Z",
      },
    ]);
    const screen = await renderCaptureSurface({
      storage,
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(
      screen.container,
      "Nueva reunion con Mitcom para revisar pendientes",
    );
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Conceptos");
    expect(screen.container.textContent).toContain("Reuniones");

    const reunionesChip = getButton(screen.container, "Reuniones");
    expect(reunionesChip.getAttribute("aria-pressed")).toBe("false");
    await click(reunionesChip);
    expect(reunionesChip.getAttribute("aria-pressed")).toBe("true");

    await click(getButton(screen.container, "Capturar"));
    await waitFor(async () => (await storage.get(CAPTURE_DRAFT_KEY)) === null);

    const captures = await nodeRepository.listByWorkspace(workspace.id);
    const newCapture = captures.find((node) =>
      node.content.includes("Nueva reunion con Mitcom"),
    );
    const relations = await relationRepository.listByWorkspace(workspace.id);

    expect(newCapture).toBeDefined();
    expect(relations).toContainEqual(
      expect.objectContaining({
        nodeId: newCapture?.id,
        contextId: "reuniones",
      }),
    );
  });

  it("suggests an emerging concept, persists it only when selected and reuses it later", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "perfume-1",
        content: "Perfume cuero intenso parecido a Ombre Leather.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
      createStoredNode({
        id: "perfume-2",
        content: "Perfume cuero ahumado para comparar con Rare Carbon.",
        updatedAt: "2026-01-06T00:00:00.000Z",
      }),
      createStoredNode({
        id: "perfume-3",
        content: "Perfume cuero economico dentro del estilo clones.",
        updatedAt: "2026-01-07T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository();
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const screen = await renderCaptureSurface({
      storage,
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(screen.container, "Perfume cuero para comprar despues");
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Perfumes");
    expect(screen.container.textContent).not.toContain("nuevo");
    await expect(
      contextRepository.list({ workspaceId: workspace.id, includeArchived: true }),
    ).resolves.toEqual([]);

    const emergingChip = getButton(screen.container, "Perfumes");
    await click(emergingChip);
    expect(emergingChip.getAttribute("aria-pressed")).toBe("true");
    await click(getButton(screen.container, "Capturar"));
    await waitFor(async () => (await storage.get(CAPTURE_DRAFT_KEY)) === null);

    const contexts = await contextRepository.list({
      workspaceId: workspace.id,
      includeArchived: true,
    });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ name: "Perfumes" });

    const captures = await nodeRepository.listByWorkspace(workspace.id);
    const newCapture = captures.find((node) =>
      node.content.includes("Perfume cuero para comprar"),
    );
    const relations = await relationRepository.listByWorkspace(workspace.id);

    expect(relations).toContainEqual(
      expect.objectContaining({
        nodeId: newCapture?.id,
        contextId: contexts[0].id,
      }),
    );
    expect(
      relations.filter((relation) => relation.contextId === contexts[0].id).length,
    ).toBeGreaterThanOrEqual(4);

    await changeTextarea(screen.container, "Otro perfume cuero para revisar");
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Perfumes");
    expect(screen.container.textContent).not.toContain("nuevo");
  });

  it("does not persist an emerging concept when it is not selected", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "perfume-1",
        content: "Perfume cuero intenso parecido a Ombre Leather.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
      createStoredNode({
        id: "perfume-2",
        content: "Perfume cuero ahumado para comparar con Rare Carbon.",
        updatedAt: "2026-01-06T00:00:00.000Z",
      }),
      createStoredNode({
        id: "perfume-3",
        content: "Perfume cuero economico dentro del estilo clones.",
        updatedAt: "2026-01-07T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository();
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const screen = await renderCaptureSurface({
      storage,
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(screen.container, "Perfume cuero sin clasificar");
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Perfumes");
    expect(screen.container.textContent).not.toContain("nuevo");

    await click(getButton(screen.container, "Capturar"));
    await waitFor(async () => (await storage.get(CAPTURE_DRAFT_KEY)) === null);

    await expect(
      contextRepository.list({ workspaceId: workspace.id, includeArchived: true }),
    ).resolves.toEqual([]);
    await expect(relationRepository.listByWorkspace(workspace.id)).resolves.toEqual(
      [],
    );
  });

  it("shows controlled association suggestions with visible memory language", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "meeting",
        content:
          "Las reuniones extensas reducen mi capacidad de concentración durante la tarde.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
      createStoredNode({
        id: "contract",
        content:
          "Revisar el avance semanal del contrato y preparar el informe de gestión.",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(
      screen.container,
      "Después de muchas reuniones me cuesta concentrarme.",
    );
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Esto me recordó a…");
    expect(screen.container.textContent).toContain(
      "Las reuniones extensas reducen",
    );
    expect(screen.container.querySelector("input[type='checkbox']")).toBeNull();
  });

  it("shows textual suggestions even when relation enrichment fails", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "meeting",
        content:
          "Las reuniones extensas reducen mi capacidad de concentración durante la tarde.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    relationRepository.listByWorkspace = async () => {
      throw new Error("Missing relation index");
    };
    const screen = await renderCaptureSurface({
      nodeRepository,
      relationRepository,
    });

    await changeTextarea(
      screen.container,
      "Después de muchas reuniones me cuesta concentrarme.",
    );
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Esto me recordó a…");
    expect(screen.container.textContent).toContain(
      "Las reuniones extensas reducen",
    );
    expect(screen.container.textContent).not.toContain("No pude buscar asociaciones.");
  });

  it("shows retry when association query fails and reruns without losing text", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "meeting",
        content:
          "Las reuniones extensas reducen mi capacidad de concentración durante la tarde.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const originalList = nodeRepository.listByWorkspace.bind(nodeRepository);
    let calls = 0;
    nodeRepository.listByWorkspace = async (...args) => {
      calls += 1;

      if (calls === 2) {
        throw new Error("IndexedDB temporarily failed");
      }

      return originalList(...args);
    };
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(
      screen.container,
      "Después de muchas reuniones me cuesta concentrarme.",
    );
    await advanceTime(500);

    expect(getButton(screen.container, "Reintentar")).toBeDefined();
    await click(getButton(screen.container, "Reintentar"));
    await advanceTime(500);

    expect(getTextarea(screen.container)?.value).toBe(
      "Después de muchas reuniones me cuesta concentrarme.",
    );
    expect(screen.container.textContent).toContain("Esto me recordó a…");
  });
});

async function renderCaptureSurface({
  storage = new MemoryStorageAdapter(),
  nodeRepository = new InMemoryNodeRepository(),
  contextRepository = new InMemoryContextRepository(),
  relationRepository = new InMemoryNodeContextRelationRepository(),
}: {
  storage?: MemoryStorageAdapter;
  nodeRepository?: InMemoryNodeRepository;
  contextRepository?: InMemoryContextRepository;
  relationRepository?: InMemoryNodeContextRelationRepository;
} = {}) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const root = createRoot(container);
  const repositories = {
    contextRepository,
    nodeContextRelationRepository: relationRepository,
    nodeRepository,
  };

  await act(async () => {
    root.render(
      createElement(CaptureSurface, {
        device,
        workspace,
        storage,
        repositories,
      }),
    );
    await flushPromises();
  });

  return { container, root };
}

function createStoredNode({
  id,
  content,
  updatedAt,
  organizationStatus = "ORGANIZED",
  type = "NOTE",
}: {
  id: string;
  content: string;
  updatedAt: string;
  organizationStatus?: Node["organizationStatus"];
  type?: Node["type"];
}): Node {
  return {
    id,
    workspaceId: workspace.id,
    type,
    content,
    status: "ACTIVE",
    organizationStatus,
    metadata: {},
    version: 1,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    createdByDeviceId: device.id,
    lastModifiedByDeviceId: device.id,
  };
}

function createContext({
  id,
  name,
  type = "AREA",
}: {
  id: string;
  name: string;
  type?: Context["type"];
}): Context {
  return {
    id,
    workspaceId: workspace.id,
    type,
    name,
    description: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}

function getTextarea(container: HTMLElement) {
  return container.querySelector("textarea");
}

function getButton(container: HTMLElement, name: string) {
  return queryButton(container, name) as HTMLButtonElement;
}

function queryButton(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === name,
  ) as HTMLButtonElement | undefined;
}

function getFirstResultLink(container: HTMLElement) {
  return Array.from(container.querySelectorAll("a")).find((link) =>
    link.getAttribute("href")?.startsWith("/notes/detail?nodeId="),
  ) as HTMLAnchorElement | undefined;
}

function getLinkByHref(container: HTMLElement, hrefPart: string) {
  return Array.from(container.querySelectorAll("a")).find((link) =>
    link.getAttribute("href")?.includes(hrefPart),
  ) as HTMLAnchorElement | undefined;
}

async function changeTextarea(container: HTMLElement, value: string) {
  const textarea = getTextarea(container);
  if (!textarea) {
    throw new Error("Textarea not found");
  }

  await act(async () => {
    setNativeValue(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
  });
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype = Object.getPrototypeOf(element) as
    | HTMLInputElement
    | HTMLTextAreaElement;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  valueSetter?.call(element, value);
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await flushPromises();
  });
}

async function clickElement(element: HTMLElement) {
  await act(async () => {
    element.click();
    await flushPromises();
  });
}

async function doubleClick(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    button.click();
    await flushPromises();
  });
}

async function advanceTime(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await flushPromises();
  });
}

async function waitFor(assertion: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await assertion()) {
      return;
    }

    await act(async () => {
      await flushPromises();
    });
  }
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}
