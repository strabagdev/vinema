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
import { VisualFeedbackProvider } from "@/features/feedback/visual-feedback-provider";
import {
  createVisualFeedbackService,
  type VisualFeedbackService,
} from "@/features/feedback/visual-feedback-service";

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
    setPointerCapability("fine");
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
    expect(getContextIndicator(screen.container, "conceptos sugeridos")).toBeUndefined();
    expect(getContextIndicator(screen.container, "ideas relacionadas")).toBeUndefined();

    await changeTextarea(screen.container, "   ");
    await advanceTime(500);

    await expect(storage.get(CAPTURE_DRAFT_KEY)).resolves.toBeNull();
    await expect(nodeRepository.listByWorkspace(workspace.id)).resolves.toEqual([]);
    expect(queryButton(screen.container, "Capturar")).toBeUndefined();
  });

  it("shows only contextual indicators by default when concepts and memories exist", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Proveedor Mitcom pendiente de seguimiento",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Revisar Mitcom");
    await advanceTime(500);

    expect(getContextIndicator(screen.container, "conceptos sugeridos")).toBeDefined();
    expect(getContextIndicator(screen.container, "ideas relacionadas")).toBeDefined();
    expect(screen.container.textContent).not.toContain("Conceptos detectados");
    expect(screen.container.textContent).not.toContain("Me recuerda a…");
    expect(screen.container.textContent).not.toContain("Proveedor Mitcom");
  });

  it("shows only Brain when concepts exist without related ideas", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);

    const group = screen.container.querySelector("[data-context-indicator-group]");

    expect(getContextIndicator(screen.container, "conceptos sugeridos")).toBeDefined();
    expect(getContextIndicator(screen.container, "ideas relacionadas")).toBeUndefined();
    expect(group?.className).toContain("justify-center");
    expect(group?.querySelectorAll("[data-context-indicator]")).toHaveLength(1);
    expect(group?.textContent).not.toContain("0");
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

    expect(screen.container.textContent).not.toContain("Me recuerda a…");

    await changeTextarea(screen.container, "reu");
    await advanceTime(500);

    expect(screen.container.textContent).not.toContain("Me recuerda a…");
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

    expect(getContextIndicator(screen.container, "ideas relacionadas")).toBeDefined();
    await openMemoryPanel(screen.container);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
    expect(screen.container.textContent).toContain("Proveedor Mitcom");
    expect(screen.container.textContent).not.toContain("Recordando...");
  });

  it("finishes recovery for a short specific query without results", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "mitcom");
    await advanceTime(500);

    expect(screen.container.textContent).not.toContain("Recordando...");
    expect(screen.container.textContent).not.toContain("Me recuerda a…");
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
    expect(listByWorkspace).toHaveBeenCalledTimes(1);
  });

  it("captures once, clears the editor, keeps focus and does not render recent content", async () => {
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
    expect(document.activeElement).toBe(getTextarea(screen.container));
    expect(screen.container.textContent).not.toContain(
      "Reunion con Mitcom sobre soporte",
    );
    expect(screen.container.textContent).not.toContain("Captura guardada.");
  });

  it("publishes capture feedback immediately after local capture succeeds", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository();
    const feedbackService = createVisualFeedbackService();
    const screen = await renderCaptureSurface({
      storage,
      nodeRepository,
      feedbackService,
    });

    await changeTextarea(screen.container, "Reunion con Mitcom sobre soporte");
    await advanceTime(500);
    await click(getButton(screen.container, "Capturar"));

    expect(feedbackService.getState().current?.kind).toBe("capture");
  });

  it("captures from an open panel and clears panels and indicators", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    await click(getButton(screen.container, "Capturar"));
    await waitFor(() => getTextarea(screen.container)?.value === "");

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(getContextIndicator(screen.container, "conceptos sugeridos")).toBeUndefined();
    expect(document.activeElement).toBe(getTextarea(screen.container));
  });

  it("captures with Ctrl+Enter without requiring a title field", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Decision sobre Railway\nsegunda linea");
    await advanceTime(500);
    await keydownTextarea(screen.container, {
      key: "Enter",
      ctrlKey: true,
    });

    const captures = await nodeRepository.listByWorkspace(workspace.id);

    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      content: "Decision sobre Railway\nsegunda linea",
    });
    expect(captures[0].metadata).not.toHaveProperty("title");
    expect(getTextarea(screen.container)?.value).toBe("");
  });

  it("keeps Enter available for multiline writing", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Primera linea");
    await advanceTime(500);
    await keydownTextarea(screen.container, { key: "Enter" });

    await expect(nodeRepository.listByWorkspace(workspace.id)).resolves.toEqual([]);
  });

  it("does not show recent captures on Inicio", async () => {
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

    expect(screen.container.textContent).not.toContain(
      "Decision nueva para Andes Norte",
    );
    expect(screen.container.textContent).not.toContain("Aprendizaje anterior");
    expect(screen.container.textContent).not.toContain("Reciente");

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

  it("keeps active historical captures out of Inicio until recovered by writing", async () => {
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

    expect(screen.container.textContent).not.toContain("Captura antigua disponible");

    await changeTextarea(screen.container, "captura antigua");
    await advanceTime(500);

    await openMemoryPanel(screen.container);
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

    await openMemoryPanel(screen.container);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
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

  it("keeps only one contextual panel open", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Proveedor Mitcom pendiente de seguimiento",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Revisar Mitcom");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    expect(getDialog(screen.container, "Me recuerda a…")).toBeUndefined();

    await openMemoryPanel(screen.container);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
  });

  it("positions desktop panels above the centered indicator group", async () => {
    setViewportSize({ width: 1366, height: 768 });
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
    await openMemoryPanel(screen.container);

    const panel = getDialog(screen.container, "Me recuerda a…") as HTMLElement;
    const root = screen.container.querySelector("[data-contextual-panel-root]");
    const group = screen.container.querySelector("[data-context-indicator-group]");

    expect(panel.dataset.layout).toBe("desktop-popover");
    expect(root?.className).toContain("relative");
    expect(root?.className).toContain("mx-auto");
    expect(group?.className).toContain("justify-center");
    expect(panel.className).toContain("absolute");
    expect(panel.className).toContain("bottom-[calc(100%+10px)]");
    expect(panel.className).toContain("left-1/2");
    expect(panel.className).toContain("-translate-x-1/2");
    expect(panel.className).toContain("w-[min(25rem,calc(100vw-2rem))]");
    expect(panel.className).toContain("max-h-[min(42vh,24rem)]");
    expect(panel.style.top).toBe("");
    expect(panel.style.left).toBe("");
    expect(getButtonByLabel(screen.container, "Cerrar panel")).toBeUndefined();
    expect(screen.container.querySelector("[class*='border-b']")).toBeNull();
    expect(screen.container.textContent).not.toContain("Me recuerda a…");
  });

  it("does not use lateral desktop positioning or indicator rect measurements", async () => {
    setViewportSize({ width: 1024, height: 768 });
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    const indicator = getContextIndicator(screen.container, "conceptos sugeridos");
    const getRectSpy = vi.fn(() => ({
      x: 700,
      y: 420,
      width: 80,
      height: 40,
      left: 700,
      right: 780,
      top: 420,
      bottom: 460,
      toJSON: () => ({}),
    }));

    if (!indicator) {
      throw new Error("Concept indicator not found");
    }

    indicator.getBoundingClientRect = getRectSpy;
    await openConceptPanel(screen.container);

    const panel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;

    expect(panel.dataset.layout).toBe("desktop-popover");
    expect(panel.style.left).toBe("");
    expect(panel.style.top).toBe("");
    expect(panel.className).not.toContain("right");
    expect(panel.className).not.toContain("md:inset-auto");
    expect(getRectSpy).not.toHaveBeenCalled();
  });

  it("keeps progressive panels as mobile bottom sheets below the desktop breakpoint", async () => {
    setViewportSize({ width: 390, height: 844 });
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    const panel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;

    expect(panel.dataset.layout).toBe("mobile-sheet");
    expect(panel.style.top).toBe("");
    expect(panel.style.left).toBe("");
    expect(panel.className).toContain("bottom-[max(0.75rem,env(safe-area-inset-bottom))]");
    expect(panel.className).toContain("overflow-hidden");
    expect(panel.className).not.toContain("bottom-[calc(100%+10px)]");
    expect(getButtonByLabel(screen.container, "Cerrar panel")).toBeDefined();
  });

  it("uses the mobile sheet on touch screens even when the viewport is wide", async () => {
    setViewportSize({ width: 1024, height: 768 });
    setPointerCapability("coarse");
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    const panel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;

    expect(panel.dataset.layout).toBe("mobile-sheet");
    expect(getButtonByLabel(screen.container, "Cerrar panel")).toBeDefined();
  });

  it("opens desktop panels on hover and closes after the intent delay", async () => {
    setViewportSize({ width: 1366, height: 768 });
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    const indicator = getContextIndicator(screen.container, "conceptos sugeridos");

    await mouseEnter(indicator);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await mouseLeave(indicator);
    await advanceTime(349);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await advanceTime(1);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
  });

  it("keeps desktop panels open when the pointer moves from indicator to panel", async () => {
    setViewportSize({ width: 1366, height: 768 });
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    const indicator = getContextIndicator(screen.container, "conceptos sugeridos");

    await mouseEnter(indicator);
    const panel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;
    await mouseLeave(indicator);
    await advanceTime(200);
    await mouseEnter(panel);
    await advanceTime(200);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await mouseLeave(panel);
    await advanceTime(350);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
  });

  it("cancels the close delay when intent returns before it expires", async () => {
    setViewportSize({ width: 1366, height: 768 });
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    const indicator = getContextIndicator(screen.container, "conceptos sugeridos");

    await mouseEnter(indicator);
    await mouseLeave(indicator);
    await advanceTime(200);
    await mouseEnter(indicator);
    await advanceTime(200);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
  });

  it("opens on focus and closes after focus leaves the indicator and panel", async () => {
    setViewportSize({ width: 1366, height: 768 });
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    const indicator = getContextIndicator(screen.container, "conceptos sugeridos");

    await focusElement(indicator);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await blurElement(indicator, getTextarea(screen.container));
    await advanceTime(350);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
  });

  it("click opens a desktop panel without making it permanent", async () => {
    setViewportSize({ width: 1366, height: 768 });
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    const indicator = getContextIndicator(screen.container, "conceptos sugeridos");

    if (!indicator) {
      throw new Error("Concept indicator not found");
    }

    await click(indicator);
    const panel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;

    expect(panel.dataset.interactionSource).toBe("click");

    await mouseLeave(indicator);
    await advanceTime(350);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
  });

  it("uses the same desktop positioning for concept and memory panels", async () => {
    setViewportSize({ width: 1920, height: 1080 });
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Proveedor Mitcom pendiente de seguimiento",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Revisar Mitcom");
    await advanceTime(500);
    await openConceptPanel(screen.container);
    const conceptPanel = getDialog(
      screen.container,
      "Conceptos detectados",
    ) as HTMLElement;

    await openMemoryPanel(screen.container);
    const memoryPanel = getDialog(screen.container, "Me recuerda a…") as HTMLElement;

    expect(memoryPanel.dataset.layout).toBe("desktop-popover");
    expect(memoryPanel.className).toBe(conceptPanel.className);
    expect(memoryPanel.style.left).toBe("");
    expect(memoryPanel.style.top).toBe("");
  });

  it("keeps indicators as one centered group and marks the active icon", async () => {
    setViewportSize({ width: 1366, height: 768 });
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Proveedor Mitcom pendiente de seguimiento",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Revisar Mitcom y Railway");
    await advanceTime(500);

    await openConceptPanel(screen.container);
    const conceptPanel = getDialog(
      screen.container,
      "Conceptos detectados",
    ) as HTMLElement;
    const conceptIndicator = screen.container.querySelector(
      '[data-context-indicator-panel="concepts"]',
    ) as HTMLElement;
    const group = screen.container.querySelector("[data-context-indicator-group]");

    expect(group?.className).toContain("justify-center");
    expect(conceptPanel.className).toContain("bottom-[calc(100%+10px)]");
    expect(conceptPanel.className).toContain("left-1/2");
    expect(conceptIndicator.className).toContain("w-9");

    await openMemoryPanel(screen.container);
    const memoryPanel = getDialog(screen.container, "Me recuerda a…") as HTMLElement;
    const memoryIndicator = screen.container.querySelector(
      '[data-context-indicator-panel="memories"]',
    ) as HTMLElement;
    expect(memoryPanel.className).toContain("bottom-[calc(100%+10px)]");
    expect(memoryPanel.className).toContain("left-1/2");
    expect(memoryIndicator.className).toContain("w-9");
  });

  it("closes an open contextual panel with Escape and returns focus", async () => {
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
    await openMemoryPanel(screen.container);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();

    await keydownWindow({ key: "Escape" });

    expect(getDialog(screen.container, "Me recuerda a…")).toBeUndefined();
    expect(document.activeElement).toBe(getTextarea(screen.container));
  });

  it("closes an open contextual panel when clicking outside", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await pointerDown(document.body);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(document.activeElement).toBe(getTextarea(screen.container));
  });

  it("does not close a contextual panel when interacting inside it", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);
    const panel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;

    await pointerDown(panel);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
  });

  it("closes an open contextual panel when writing resumes", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await changeTextarea(screen.container, "Revisar Railway mañana");
    await advanceTime(500);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
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

    expect(getContextIndicator(screen.container, "conceptos sugeridos")).toBeDefined();
    await openConceptPanel(screen.container);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
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
    await openConceptPanel(screen.container);
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

    await openConceptPanel(screen.container);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
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

  it("expands existing concept suggestions into the knowledge base and preserves the draft", async () => {
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
    await openConceptPanel(screen.container);

    const expandLink = getLinkByLabel(
      screen.container,
      "Profundizar en Base de conocimiento",
    );

    expect(expandLink?.getAttribute("href")).toBe(
      "/concepts/detail?contextId=reuniones&returnTo=%2F&from=panel",
    );

    await clickElement(expandLink as HTMLAnchorElement);

    await expect(storage.get(CAPTURE_DRAFT_KEY)).resolves.toMatchObject({
      content: "Nueva reunion con Mitcom para revisar pendientes",
    });
  });

  it("expands remembered captures through their emergent identity", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "meeting",
        content:
          "Las reuniones extensas reducen mi capacidad de concentración durante la tarde.",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "reuniones", name: "Reuniones" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      {
        id: "meeting-reuniones",
        workspaceId: workspace.id,
        nodeId: "meeting",
        contextId: "reuniones",
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
      "Después de muchas reuniones me cuesta concentrarme.",
    );
    await advanceTime(500);
    await openMemoryPanel(screen.container);

    const expandLink = getLinkByLabel(
      screen.container,
      "Profundizar en Base de conocimiento",
    );

    expect(expandLink?.getAttribute("href")).toBe(
      "/concepts/detail?contextId=reuniones&returnTo=%2F&from=panel",
    );
    expect(screen.container.textContent).not.toContain("Ver en Explorar");
  });

  it("shows current-input emerging concepts and persists the selected chip", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository();
    const contextRepository = new InMemoryContextRepository();
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const screen = await renderCaptureSurface({
      storage,
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(
      screen.container,
      "Revisar Railway para la sincronizacion de Vinema",
    );
    await advanceTime(500);

    await openConceptPanel(screen.container);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    expect(screen.container.textContent).toContain("Railway");
    expect(screen.container.textContent).not.toContain("Me recuerda a…");

    const railwayChip = getButton(screen.container, "Railway");
    expect(railwayChip.getAttribute("aria-pressed")).toBe("false");
    await click(railwayChip);
    expect(railwayChip.getAttribute("aria-pressed")).toBe("true");

    await click(getButton(screen.container, "Capturar"));
    await waitFor(async () => (await storage.get(CAPTURE_DRAFT_KEY)) === null);

    const contexts = await contextRepository.list({
      workspaceId: workspace.id,
      includeArchived: true,
    });
    const captures = await nodeRepository.listByWorkspace(workspace.id);
    const newCapture = captures.find((node) => node.content.includes("Railway"));
    const relations = await relationRepository.listByWorkspace(workspace.id);

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      name: "Railway",
      description: "Concepto emergente confirmado desde la captura actual.",
    });
    expect(relations).toContainEqual(
      expect.objectContaining({
        nodeId: newCapture?.id,
        contextId: contexts[0].id,
      }),
    );
  });

  it("shows semantic phrase concepts in the UI without partial capitalized words", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(
      screen.container,
      "Los perfumes que quiero comprar son Ombre Leather de Tom Ford y Erba Pura.",
    );
    await advanceTime(500);
    await openConceptPanel(screen.container);

    expect(screen.container.textContent).toContain("Perfumes");
    expect(screen.container.textContent).toContain("Ombre Leather");
    expect(screen.container.textContent).toContain("Tom Ford");
    expect(screen.container.textContent).toContain("Erba Pura");
    expect(getButton(screen.container, "Ombre")).toBeUndefined();
    expect(getButton(screen.container, "Ford")).toBeUndefined();
    expect(getButton(screen.container, "Erba")).toBeUndefined();
  });

  it("clears current-input emerging concepts when the editor is cleared", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);
    expect(screen.container.textContent).toContain("Railway");

    await changeTextarea(screen.container, "");
    await advanceTime(500);

    expect(screen.container.textContent).not.toContain("Conceptos");
    expect(screen.container.textContent).not.toContain("Railway");
    expect(screen.container.querySelector("[data-context-indicator-group]")).toBeNull();
  });

  it("closes an open panel when its indicator disappears", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await changeTextarea(screen.container, "");
    await advanceTime(500);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(screen.container.querySelector("[data-context-indicator-group]")).toBeNull();
  });

  it("does not let stale concept suggestions replace newer input", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const originalList = nodeRepository.listByWorkspace.bind(nodeRepository);
    let calls = 0;
    let releaseSlowAssociationRead: (() => void) | null = null;

    nodeRepository.listByWorkspace = async (...args) => {
      calls += 1;

      if (calls === 1) {
        return new Promise<Node[]>((resolve) => {
          releaseSlowAssociationRead = () => resolve([]);
        });
      }

      return originalList(...args);
    };

    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await changeTextarea(screen.container, "Revisar Mitcom");
    await advanceTime(500);

    expect(screen.container.textContent).toContain("Mitcom");
    expect(screen.container.textContent).not.toContain("Railway");

    await act(async () => {
      releaseSlowAssociationRead?.();
      await flushPromises();
    });

    expect(screen.container.textContent).toContain("Mitcom");
    expect(screen.container.textContent).not.toContain("Railway");
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

    await openConceptPanel(screen.container);
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

    await openConceptPanel(screen.container);
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

    await openConceptPanel(screen.container);
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

    await openMemoryPanel(screen.container);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
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

    await openMemoryPanel(screen.container);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
    expect(screen.container.textContent).toContain(
      "Las reuniones extensas reducen",
    );
    expect(screen.container.textContent).not.toContain("No pude buscar asociaciones.");
  });

  it("keeps memory indicators silent when association query fails without results", async () => {
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

      if (calls === 1) {
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

    expect(getTextarea(screen.container)?.value).toBe(
      "Después de muchas reuniones me cuesta concentrarme.",
    );
    expect(getContextIndicator(screen.container, "ideas relacionadas")).toBeUndefined();
    expect(screen.container.querySelector("[data-context-indicator-group]")).toBeNull();
    expect(getButton(screen.container, "Reintentar")).toBeUndefined();
  });
});

async function renderCaptureSurface({
  storage = new MemoryStorageAdapter(),
  nodeRepository = new InMemoryNodeRepository(),
  contextRepository = new InMemoryContextRepository(),
  relationRepository = new InMemoryNodeContextRelationRepository(),
  feedbackService,
}: {
  storage?: MemoryStorageAdapter;
  nodeRepository?: InMemoryNodeRepository;
  contextRepository?: InMemoryContextRepository;
  relationRepository?: InMemoryNodeContextRelationRepository;
  feedbackService?: VisualFeedbackService;
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
    const surface = createElement(CaptureSurface, {
      device,
      workspace,
      storage,
      repositories,
    });

    root.render(
      feedbackService
        ? createElement(VisualFeedbackProvider, { service: feedbackService }, surface)
        : surface,
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

function getButtonByLabel(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === label,
  ) as HTMLButtonElement | undefined;
}

function getContextIndicator(container: HTMLElement, labelPart: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes(labelPart),
  ) as HTMLButtonElement | undefined;
}

function getDialog(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("[role='dialog']")).find(
    (dialog) => dialog.getAttribute("aria-label") === label,
  ) as HTMLElement | undefined;
}

function setViewportSize({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function setPointerCapability(pointer: "fine" | "coarse") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches:
        query === "(hover: hover) and (pointer: fine)"
          ? pointer === "fine"
          : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

async function openConceptPanel(container: HTMLElement) {
  const indicator = getContextIndicator(container, "conceptos sugeridos");
  if (!indicator) {
    throw new Error("Concept indicator not found");
  }

  await click(indicator);
}

async function openMemoryPanel(container: HTMLElement) {
  const indicator =
    getContextIndicator(container, "ideas relacionadas") ??
    getContextIndicator(container, "No se pudo buscar recuerdos");

  if (!indicator) {
    throw new Error("Memory indicator not found");
  }

  await click(indicator);
}

function getLinkByHref(container: HTMLElement, hrefPart: string) {
  return Array.from(container.querySelectorAll("a")).find((link) =>
    link.getAttribute("href")?.includes(hrefPart),
  ) as HTMLAnchorElement | undefined;
}

function getLinkByLabel(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("a")).find(
    (link) => link.getAttribute("aria-label") === label,
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

async function keydownTextarea(
  container: HTMLElement,
  eventInit: KeyboardEventInit,
) {
  const textarea = getTextarea(container);
  if (!textarea) {
    throw new Error("Textarea not found");
  }

  await act(async () => {
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        ...eventInit,
      }),
    );
    await flushPromises();
  });
}

async function keydownWindow(eventInit: KeyboardEventInit) {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        ...eventInit,
      }),
    );
    await flushPromises();
  });
}

async function pointerDown(target: HTMLElement) {
  await act(async () => {
    const event =
      typeof PointerEvent === "undefined"
        ? new Event("pointerdown", { bubbles: true })
        : new PointerEvent("pointerdown", {
          bubbles: true,
        });

    target.dispatchEvent(event);
    await flushPromises();
  });
}

async function mouseEnter(target: HTMLElement | undefined) {
  if (!target) {
    throw new Error("Expected target to exist.");
  }

  await act(async () => {
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await flushPromises();
  });
}

async function mouseLeave(target: HTMLElement | undefined) {
  if (!target) {
    throw new Error("Expected target to exist.");
  }

  await act(async () => {
    target.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await flushPromises();
  });
}

async function focusElement(target: HTMLElement | undefined) {
  if (!target) {
    throw new Error("Expected target to exist.");
  }

  await act(async () => {
    target.focus();
    target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushPromises();
  });
}

async function blurElement(
  target: HTMLElement | undefined,
  relatedTarget: HTMLElement | null,
) {
  if (!target) {
    throw new Error("Expected target to exist.");
  }

  await act(async () => {
    target.dispatchEvent(
      new FocusEvent("focusout", {
        bubbles: true,
        relatedTarget,
      }),
    );
    relatedTarget?.focus();
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
