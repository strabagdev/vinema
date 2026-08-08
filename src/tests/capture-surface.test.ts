import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  areMapTransformsEqual,
  areWorkspaceStatesEquivalent,
  CaptureSurface,
  ConceptPanelContent,
  mergeWorkspaceState,
  replaceWorkspaceHistoryState,
} from "@/features/capture/capture-surface";
import {
  CANVAS_PREFERENCES_KEY,
  DEFAULT_CANVAS_PREFERENCES,
} from "@/features/canvas/canvas-preferences";
import { getCanvasPrompts } from "@/features/canvas/canvas-prompts";
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

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: navigationMocks.replace,
    push: navigationMocks.push,
  }),
  useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock("@/app/notes/knowledge-base-client", () => ({
  KnowledgeBaseClient: ({
    embedded,
    onOpenMemory,
  }: {
    embedded?: boolean;
    onOpenMemory?: (nodeId: string) => void;
  }) =>
    createElement(
      "section",
      {
        "data-knowledge-base-client": "",
        "data-embedded": embedded ? "true" : "false",
      },
      "Memoria reutilizada",
      embedded
        ? createElement(
            "button",
            {
              type: "button",
              onClick: () => onOpenMemory?.("mitcom"),
            },
            "Abrir captura Mitcom",
          )
        : null,
    ),
}));

vi.mock("@/app/notes/detail/note-detail-client", () => ({
  NoteDetailClient: ({
    embeddedNodeId,
    onBack,
    onOpenConcept,
  }: {
    embeddedNodeId?: string;
    onBack?: () => void;
    onOpenConcept?: (conceptId: string) => void;
  }) =>
    createElement(
      "section",
      {
        "data-note-detail": "",
        "data-node-id": embeddedNodeId,
        "data-embedded": embeddedNodeId ? "true" : "false",
      },
      `Detalle captura ${embeddedNodeId}`,
      createElement(
        "button",
        {
          type: "button",
          onClick: () => onOpenConcept?.("railway"),
        },
        "Abrir concepto Railway",
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: onBack,
        },
        "Volver a memoria",
      ),
    ),
}));

vi.mock("@/app/concepts/concept-index-client", () => ({
  ConceptIndexClient: ({
    embedded,
    onOpenMap,
    onOpenConcept,
  }: {
    embedded?: boolean;
    onOpenMap?: () => void;
    onOpenConcept?: (conceptId: string) => void;
  }) =>
    createElement(
      "section",
      {
        "data-concept-index": "",
        "data-embedded": embedded ? "true" : "false",
      },
      "Conceptos reutilizados",
      embedded
        ? createElement(
            "button",
            {
              type: "button",
              onClick: () => onOpenConcept?.("railway"),
            },
            "Railway",
          )
        : null,
      embedded
        ? createElement(
            "button",
            {
              type: "button",
              onClick: onOpenMap,
            },
            "Abrir mapa de conceptos",
          )
        : null,
    ),
}));

vi.mock("@/app/concepts/concept-workspace-client", () => ({
  ConceptWorkspaceClient: ({
    initialConceptId,
    initialState,
    onOpenMemory,
    onOpenConcept,
    onClose,
    onStateChange,
  }: {
    initialConceptId?: string | null;
    initialState?: { selectedConceptId?: string | null; query?: string };
    onOpenMemory?: (nodeId: string) => void;
    onOpenConcept?: (conceptId: string) => void;
    onClose?: () => void;
    onStateChange?: (state: { selectedConceptId?: string | null; query?: string }) => void;
  }) => {
    const [selectedConceptId, setSelectedConceptId] = useState<string | null>(
      initialState?.selectedConceptId ?? initialConceptId ?? null,
    );

    return createElement(
      "section",
      {
        "data-concept-workspace": "",
      },
      createElement(
        "div",
        {
          "data-concept-workspace-index": "",
          className: "overflow-y-auto",
        },
        "Índice",
        createElement(
          "button",
          {
            type: "button",
            onClick: onClose,
          },
          "Cerrar conceptos",
        ),
        createElement(
          "button",
          {
            type: "button",
            "aria-pressed": selectedConceptId === "railway",
            onClick: () => {
              setSelectedConceptId("railway");
              onStateChange?.({ selectedConceptId: "railway", query: initialState?.query });
            },
          },
          "Railway",
        ),
      ),
      createElement(
        "div",
        {
          "data-concept-workspace-map": "",
          "data-knowledge-explorer-canvas": "",
        },
        "Mapa",
        createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              setSelectedConceptId("sync");
              onStateChange?.({ selectedConceptId: "sync", query: initialState?.query });
            },
          },
          "Nodo Sync",
        ),
      ),
      createElement(
        "div",
        {
          "data-concept-workspace-profile": "",
          className: "overflow-y-auto",
        },
        selectedConceptId
          ? `Perfil concepto ${selectedConceptId}`
          : "Perfil",
        selectedConceptId
          ? createElement(
              "button",
              {
                type: "button",
                onClick: () => onOpenConcept?.("mitcom"),
              },
              "Concepto relacionado",
            )
          : null,
        selectedConceptId
          ? createElement(
              "button",
              {
                type: "button",
                onClick: () => onOpenMemory?.("mitcom"),
              },
              "Abrir recuerdo relacionado",
            )
          : null,
      ),
    );
  },
}));

vi.mock("@/app/concepts/explore/concept-knowledge-explorer-client", () => ({
  ConceptKnowledgeExplorerClient: ({
    embedded,
    onBack,
    onOpenConcept,
  }: {
    embedded?: boolean;
    onBack?: () => void;
    onOpenConcept?: (conceptId: string) => void;
  }) =>
    createElement(
      "section",
      {
        "data-knowledge-explorer-canvas": "",
        "data-embedded": embedded ? "true" : "false",
      },
      "Mapa de conceptos conectado",
      createElement(
        "button",
        {
          type: "button",
          onClick: () => onOpenConcept?.("sync"),
        },
        "Ver perfil",
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: onBack,
        },
        "Volver a conceptos",
      ),
    ),
}));

vi.mock("@/app/concepts/detail/concept-exploration-client", () => ({
  ConceptExplorationClient: ({
    embeddedContextId,
    onBack,
    onOpenMemory,
    onOpenMap,
    onOpenConcept,
  }: {
    embeddedContextId?: string;
    onBack?: () => void;
    onOpenMemory?: (nodeId: string) => void;
    onOpenMap?: (focusId: string) => void;
    onOpenConcept?: (conceptId: string) => void;
  }) =>
    createElement(
      "section",
      {
        "data-concept-detail": "",
        "data-context-id": embeddedContextId,
      },
      `Perfil concepto ${embeddedContextId}`,
      createElement(
        "button",
        {
          type: "button",
          onClick: () => onOpenMemory?.("mitcom"),
        },
        "Abrir recuerdo relacionado",
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => onOpenMap?.(embeddedContextId ?? "railway"),
        },
        "Explorar conexiones",
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => onOpenConcept?.("sync"),
        },
        "Concepto relacionado",
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: onBack,
        },
        "Volver a conceptos",
      ),
    ),
}));

vi.mock("@/features/sync/observability/memory-sync-status-panel", () => ({
  MemorySyncStatusPanel: ({
    variant,
    onClose,
  }: {
    variant?: string;
    onClose?: () => void;
  }) =>
    createElement(
      "section",
      {
        role: "dialog",
        "aria-label": "Estado de la memoria",
        "data-memory-sync-panel": "",
        "data-memory-sync-status-panel-variant": variant,
      },
      createElement(
        "button",
        {
          type: "button",
          onClick: onClose,
          "aria-label": "Cerrar Estado de la memoria",
        },
        "Cerrar",
      ),
      "Estado de la memoria",
    ),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { email: "user@example.test", displayName: "User" },
    isAuthenticated: true,
    workspaceId: "workspace-1",
    deviceId: "device-1",
    accessToken: "access-token",
    syncNow: vi.fn(),
  }),
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => ({
    status: "ready",
    workspace: {
      id: "workspace-1",
      name: "Personal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    device: {
      id: "device-1",
      workspaceId: "workspace-1",
      name: "Web",
      platform: "WEB",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  }),
}));

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

describe("workspace navigation snapshots", () => {
  it("treats equivalent map transforms as unchanged even with a new object", () => {
    expect(
      areMapTransformsEqual(
        { scale: 1, x: 12, y: -4 },
        { scale: 1, x: 12, y: -4 },
      ),
    ).toBe(true);
  });

  it("detects real map transform changes", () => {
    expect(
      areMapTransformsEqual(
        { scale: 1, x: 12, y: -4 },
        { scale: 1.1, x: 12, y: -4 },
      ),
    ).toBe(false);
  });

  it("keeps workspace state equivalent when replacing identical snapshot values", () => {
    const current = {
      concept: {
        selectedConceptId: "mitcom",
        query: "mit",
        profileScrollTop: 42,
        mapTransform: { scale: 1, x: 10, y: 5 },
      },
    };
    const merged = mergeWorkspaceState(current, {
      concept: {
        mapTransform: { scale: 1, x: 10, y: 5 },
      },
    });

    expect(areWorkspaceStatesEquivalent(current, merged)).toBe(true);
  });

  it("returns the same history array when the replacement is semantically identical", () => {
    const current = [
      {
        view: { kind: "concept-workspace" as const, selectedConceptId: "mitcom" },
        params: {},
        state: {
          concept: {
            selectedConceptId: "mitcom",
            query: "mit",
            profileScrollTop: 42,
            mapTransform: { scale: 1, x: 10, y: 5 },
          },
        },
      },
    ];

    expect(
      replaceWorkspaceHistoryState(current, {
        concept: {
          mapTransform: { scale: 1, x: 10, y: 5 },
        },
      }),
    ).toBe(current);
  });
});

describe("CaptureSurface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPointerCapability("fine");
    navigationMocks.replace.mockReset();
    navigationMocks.push.mockReset();
    navigationMocks.searchParams = new URLSearchParams();
    window.history.replaceState(null, "", "/");
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

  it("keeps the canvas centered in the permanent three-zone grid", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository();
    const screen = await renderCaptureSurface({ storage, nodeRepository });
    const canvas = screen.container.querySelector("[data-capture-canvas]");
    const mainRegion = screen.container.querySelector("[data-canvas-main-region]");
    const composer = screen.container.querySelector("[data-mobile-capture-composer]");
    const scrollViewport = screen.container.querySelector("[data-canvas-scroll-viewport]");
    const writingTrack = screen.container.querySelector("[data-canvas-writing-track]");
    const textarea = getTextarea(screen.container);
    const iconRail = screen.container.querySelector("[data-canvas-icon-rail]");
    const panelColumn = screen.container.querySelector("[data-canvas-panel-column]");
    const dock = screen.container.querySelector("[data-canvas-capture-dock]");
    const button = screen.container.querySelector("[data-capture-submit]");

    expect(canvas?.className).toContain("grid");
    expect(canvas?.className).toContain("grid-rows-[minmax(0,1fr)_auto]");
    expect(canvas?.className).toContain("h-full");
    expect(canvas?.className).toContain("min-h-0");
    expect(canvas?.className).toContain("overflow-hidden");
    expect(canvas?.hasAttribute("data-canvas-width")).toBe(false);
    expect(canvas?.getAttribute("data-canvas-text-size")).toBe("16");
    expect(canvas?.hasAttribute("data-canvas-font")).toBe(false);
    expect(canvas?.getAttribute("data-canvas-appearance")).toBe("system");
    expect(mainRegion).toBeDefined();
    expect(mainRegion?.className).toContain("row-[1]");
    expect(mainRegion?.className).toContain("vinema-canvas-main-grid");
    expect(mainRegion?.className).toContain("overflow-hidden");
    expect(iconRail).toBeDefined();
    expect(iconRail?.className).toContain("col-[1]");
    expect(iconRail?.className).toContain("z-20");
    expect(iconRail?.className).toContain(
      "grid-cols-[var(--vinema-canvas-icon-width)_minmax(0,var(--vinema-canvas-panel-width))_minmax(0,1fr)]",
    );
    expect(panelColumn).toBeDefined();
    expect(panelColumn?.className).toContain("col-[1]");
    expect(panelColumn?.className).toContain("pointer-events-none");
    expect(panelColumn?.firstElementChild?.className).toContain("pointer-events-auto");
    expect(panelColumn?.className).toContain("z-30");
    expect(panelColumn?.className).toContain(
      "grid-cols-[var(--vinema-canvas-icon-width)_minmax(0,var(--vinema-canvas-panel-width))_minmax(0,1fr)]",
    );
    expect(composer?.className).toContain("col-[2]");
    expect(composer?.className).toContain("h-full");
    expect(composer?.className).toContain("px-[var(--vinema-canvas-padding-x)]");
    expect(scrollViewport?.className).toContain("h-full");
    expect(scrollViewport?.className).toContain("overflow-y-auto");
    expect(scrollViewport?.className).toContain("vinema-scrollbar");
    expect(writingTrack?.className).toContain("min-h-full");
    expect(writingTrack?.className).toContain(
      "grid-rows-[minmax(0,var(--vinema-canvas-editor-start))_auto_minmax(var(--vinema-canvas-editor-end-space),1fr)]",
    );
    expect(dock).toBeDefined();
    expect(dock?.className).toContain("col-[3]");
    expect(dock?.className).toContain(
      "grid-cols-[var(--vinema-canvas-submit-gap)_var(--vinema-canvas-dock-width)_minmax(0,1fr)]",
    );
    expect(dock?.className).toContain("items-center");
    expect(getCanvasPrompts("mixed")).toContain(textarea?.getAttribute("placeholder"));
    expect(
      (composer as HTMLElement | null)?.style.getPropertyValue(
        "--vinema-canvas-editor-start",
      ),
    ).toBe("40%");
    expect(textarea?.className).toContain("row-[2]");
    expect(textarea?.className).not.toContain("pt-[calc(50%-0.85em)]");
    expect(textarea?.className).toContain("overflow-hidden");
    expect(textarea?.className).not.toContain("overflow-y-auto");
    expect(textarea?.className).not.toContain("vinema-scrollbar");
    expect(textarea?.getAttribute("data-canvas-caret-follow-ratio")).toBe("0.7");
    expect(button).toBeDefined();
    expect(button?.className).toContain("bg-zinc-950");
    expect(button?.className).toContain("text-white");
    expect(button?.className).toContain("opacity-0");
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    expect(button?.querySelector("svg")).toBeDefined();
    expect(screen.container.querySelector("[data-canvas-footer]")).toBeNull();
    expect(screen.container.querySelector("[data-canvas-pulse]")).toBeNull();
    expect(dock?.contains(button)).toBe(true);
    expect(getContextIndicator(screen.container, "conceptos sugeridos")).toBeUndefined();
    expect(getContextIndicator(screen.container, "Memoria")).toBeUndefined();

    await changeTextarea(screen.container, "ok");
    await advanceTime(500);

    expect(getTextarea(screen.container)?.className).toContain("row-[2]");
    expect(getTextarea(screen.container)?.className).toContain("overflow-hidden");
    expect(screen.container.querySelector("[data-canvas-scroll-viewport]")?.className).toContain(
      "overflow-y-auto",
    );
    await expect(storage.get(CAPTURE_DRAFT_KEY)).resolves.toMatchObject({
      content: "ok",
    });
    await expect(nodeRepository.listByWorkspace(workspace.id)).resolves.toEqual([]);
    expect(screen.container.querySelector("[data-capture-submit]")).toBeDefined();
  });

  it("keeps the editor vertical origin stable from empty to long content", async () => {
    const screen = await renderCaptureSurface();
    const textarea = getTextarea(screen.container);
    const composer = screen.container.querySelector("[data-canvas-writing-surface]");
    const scrollViewport = screen.container.querySelector("[data-canvas-scroll-viewport]");
    const writingTrack = screen.container.querySelector("[data-canvas-writing-track]");

    if (!textarea || !composer || !scrollViewport || !writingTrack) {
      throw new Error("Expected canvas editor.");
    }

    const initialComposerClassName = composer.className;
    const initialTextareaClassName = textarea.className;

    expect(scrollViewport.className).toContain("h-full");
    expect(scrollViewport.className).toContain("overflow-y-auto");
    expect(writingTrack.className).toContain(
      "grid-rows-[minmax(0,var(--vinema-canvas-editor-start))_auto_minmax(var(--vinema-canvas-editor-end-space),1fr)]",
    );
    expect(initialTextareaClassName).toContain("row-[2]");
    expect(initialTextareaClassName).toContain("overflow-hidden");
    expect(initialTextareaClassName).not.toContain("overflow-y-auto");
    expect(textarea.getAttribute("data-canvas-caret-follow-ratio")).toBe("0.7");

    await changeTextarea(screen.container, "A");
    await advanceTime(500);

    expect(composer.className).toBe(initialComposerClassName);
    expect(getTextarea(screen.container)?.className).toBe(initialTextareaClassName);

    await changeTextarea(screen.container, "Texto corto en el punto inicial");
    await advanceTime(500);

    expect(composer.className).toBe(initialComposerClassName);
    expect(getTextarea(screen.container)?.className).toBe(initialTextareaClassName);

    await changeTextarea(
      screen.container,
      Array.from({ length: 80 }, (_, index) => `Linea ${index + 1}`).join("\n"),
    );
    await advanceTime(500);

    expect(composer.className).toBe(initialComposerClassName);
    expect(getTextarea(screen.container)?.className).toBe(initialTextareaClassName);
    expect(getTextarea(screen.container)?.className).toContain("overflow-hidden");
  });

  it("keeps the same editor origin across supported text sizes", async () => {
    for (const textSize of [14, 16, 18, 20]) {
      const storage = new MemoryStorageAdapter();
      await storage.set(CANVAS_PREFERENCES_KEY, {
        ...DEFAULT_CANVAS_PREFERENCES,
        textSize,
      });
      const screen = await renderCaptureSurface({ storage });
      const textarea = getTextarea(screen.container);
      const initialClassName = textarea?.className;

      expect(textarea?.style.fontSize).toBe(`${textSize}px`);
      expect(textarea?.className).toContain("row-[2]");
      expect(textarea?.className).toContain("overflow-hidden");

      await changeTextarea(screen.container, "A");
      await advanceTime(500);

      expect(getTextarea(screen.container)?.style.fontSize).toBe(`${textSize}px`);
      expect(getTextarea(screen.container)?.className).toBe(initialClassName);

      await act(async () => {
        screen.root.unmount();
      });
      document.body.replaceChildren();
    }
  });

  it("applies persisted canvas preferences while ignoring removed width and font", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set(CANVAS_PREFERENCES_KEY, {
      ...DEFAULT_CANVAS_PREFERENCES,
      width: "wide",
      textSize: 20,
      fontFamily: "serif",
      appearance: "light",
    });

    const screen = await renderCaptureSurface({ storage });
    const canvas = screen.container.querySelector<HTMLElement>(
      "[data-capture-canvas]",
    );

    expect(canvas?.hasAttribute("data-canvas-width")).toBe(false);
    expect(canvas?.getAttribute("data-canvas-text-size")).toBe("20");
    expect(canvas?.hasAttribute("data-canvas-font")).toBe(false);
    expect(canvas?.getAttribute("data-canvas-appearance")).toBe("light");
    expect(canvas?.style.getPropertyValue("--vinema-canvas-max-width")).toBe(
      "920px",
    );
    expect(getTextarea(screen.container)?.style.fontSize).toBe("20px");
    expect(getTextarea(screen.container)?.style.fontFamily).toContain(
      "var(--font-geist-sans)",
    );
  });

  it("falls back from invalid canvas preferences and can reset persisted values", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set(CANVAS_PREFERENCES_KEY, {
      width: "huge",
      textSize: "massive",
      fontFamily: "comic",
      appearance: "nocturne",
    });

    const screen = await renderCaptureSurface({ storage });
    const canvas = screen.container.querySelector("[data-capture-canvas]");

    expect(canvas?.hasAttribute("data-canvas-width")).toBe(false);
    expect(canvas?.getAttribute("data-canvas-text-size")).toBe("16");
    expect(canvas?.hasAttribute("data-canvas-font")).toBe(false);
    expect(canvas?.getAttribute("data-canvas-appearance")).toBe("system");

    const preferencesButton = getButtonByLabel(
      document.body,
      "Canvas",
    );
    if (!preferencesButton) {
      throw new Error("Canvas preferences trigger not found");
    }

    await click(preferencesButton);

    expect(document.body.textContent).not.toContain("Ancho");
    expect(document.body.textContent).not.toContain("Compacto");
    expect(document.body.textContent).not.toContain("Normal");
    expect(document.body.textContent).not.toContain("Amplio");
    expect(document.body.textContent).not.toContain("Fuente");
    expect(document.body.textContent).not.toContain("Sans");
    expect(document.body.textContent).not.toContain("Serif");
    expect(document.body.textContent).not.toContain("Mono");

    await click(getButton(document.body, "Restablecer"));

    await expect(storage.get(CANVAS_PREFERENCES_KEY)).resolves.toBeNull();
    expect(canvas?.hasAttribute("data-canvas-width")).toBe(false);
  });

  it("updates the real capture editor text size with compact controls and persists it", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set(CANVAS_PREFERENCES_KEY, {
      ...DEFAULT_CANVAS_PREFERENCES,
      textSize: 14,
    });
    const screen = await renderCaptureSurface({ storage });
    const textarea = getTextarea(screen.container);

    expect(textarea?.style.fontSize).toBe("14px");

    const preferencesButton = getButtonByLabel(
      screen.container,
      "Canvas",
    );
    if (!preferencesButton) {
      throw new Error("Canvas preferences trigger not found");
    }

    await click(preferencesButton);
    const decreaseButton = getButtonByLabel(document.body, "Reducir tamaño del texto");
    const increaseButton = getButtonByLabel(document.body, "Aumentar tamaño del texto");

    expect(decreaseButton?.hasAttribute("disabled")).toBe(true);
    expect(increaseButton?.hasAttribute("disabled")).toBe(false);

    await click(increaseButton!);
    expect(getTextarea(screen.container)?.style.fontSize).toBe("16px");
    await click(increaseButton!);
    expect(getTextarea(screen.container)?.style.fontSize).toBe("18px");
    await click(increaseButton!);

    expect(getTextarea(screen.container)?.style.fontSize).toBe("20px");
    expect(increaseButton?.hasAttribute("disabled")).toBe(true);

    await click(decreaseButton!);
    expect(getTextarea(screen.container)?.style.fontSize).toBe("18px");
    await click(decreaseButton!);
    expect(getTextarea(screen.container)?.style.fontSize).toBe("16px");
    await click(decreaseButton!);
    expect(getTextarea(screen.container)?.style.fontSize).toBe("14px");
    expect(decreaseButton?.hasAttribute("disabled")).toBe(true);

    await click(increaseButton!);
    await click(increaseButton!);
    await click(increaseButton!);
    await expect(storage.get(CANVAS_PREFERENCES_KEY)).resolves.toMatchObject({
      textSize: 20,
    });

    await act(async () => {
      screen.root.unmount();
    });

    const restored = await renderCaptureSurface({ storage });

    expect(getTextarea(restored.container)?.style.fontSize).toBe("20px");
  });

  it("keeps the preferences panel limited to essential writing controls", async () => {
    const screen = await renderCaptureSurface();
    const preferencesButton = getButtonByLabel(
      screen.container,
      "Canvas",
    );

    if (!preferencesButton) {
      throw new Error("Canvas preferences trigger not found");
    }

    await click(preferencesButton);

    expect(document.body.textContent).toContain("Texto");
    expect(document.body.textContent).toContain("Apariencia");
    expect(getButtonByLabel(document.body, "Reducir tamaño del texto")).toBeDefined();
    expect(getButtonByLabel(document.body, "Aumentar tamaño del texto")).toBeDefined();
    expect(document.body.textContent).not.toContain("Ancho");
    expect(document.body.textContent).not.toContain("Fuente");
    expect(document.body.textContent).not.toContain("Compacto");
    expect(document.body.textContent).not.toContain("Sans");
    expect(document.body.textContent).not.toContain("Foco");
    expect(document.body.textContent).not.toContain("Densidad");
    expect(document.body.textContent).not.toContain("Prompts");
  });

  it("keeps the placeholder stable while editing", async () => {
    const screen = await renderCaptureSurface();
    const textarea = getTextarea(screen.container);
    const initialPlaceholder = textarea?.getAttribute("placeholder");

    await changeTextarea(screen.container, "Una idea en curso");
    expect(getTextarea(screen.container)?.getAttribute("placeholder")).toBe(
      initialPlaceholder,
    );

    await changeTextarea(screen.container, "");
    expect(getTextarea(screen.container)?.getAttribute("placeholder")).toBe(
      initialPlaceholder,
    );
  });

  it("does not capture empty content while the submit action is invisible", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const feedbackService = createVisualFeedbackService();
    const screen = await renderCaptureSurface({ feedbackService, nodeRepository });
    const button = screen.container.querySelector<HTMLButtonElement>(
      "[data-capture-submit]",
    );
    if (!button) {
      throw new Error("Capture submit button not found");
    }

    expect(button?.className).toContain("opacity-0");
    await click(button);

    await expect(nodeRepository.listByWorkspace(workspace.id)).resolves.toEqual([]);
    expect(feedbackService.getState().current?.kind).not.toBe("error");
  });

  it("keeps capture elements at normal opacity without calm attributes", async () => {
    const screen = await renderCaptureSurface();
    const canvas = screen.container.querySelector("[data-capture-canvas]");
    const editor = getTextarea(screen.container);
    const submitButton = screen.container.querySelector("[data-capture-submit]");

    expect(canvas?.hasAttribute("data-canvas-focus")).toBe(false);
    expect(screen.container.querySelector("[data-calm-primary]")).toBeNull();
    expect(screen.container.querySelector("[data-calm-secondary]")).toBeNull();
    expect(editor?.className).toContain("text-zinc-950");
    expect(submitButton?.className).toContain("opacity-0");

    await changeTextarea(screen.container, "Interfaz estable");
    await advanceTime(2000);

    expect(screen.container.querySelector("[data-calm-primary]")).toBeNull();
    expect(screen.container.querySelector("[data-calm-secondary]")).toBeNull();
    expect(screen.container.querySelector("[data-capture-submit]")?.className).toContain(
      "opacity-100",
    );
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
    expect(getContextIndicator(screen.container, "Memoria")).toBeDefined();
    expect(screen.container.textContent).not.toContain("Conceptos detectados");
    expect(screen.container.textContent).not.toContain("Me recuerda a…");
    expect(screen.container.textContent).not.toContain("Proveedor Mitcom");
  });

  it("keeps the rail permanent and shows contextual canvas buttons only with results", async () => {
    const screen = await renderCaptureSurface();
    const emptyRail = screen.container.querySelector("[data-canvas-icon-rail]");
    const writingSurface = screen.container.querySelector("[data-canvas-writing-surface]");
    const scrollViewport = screen.container.querySelector("[data-canvas-scroll-viewport]");
    const writingTrack = screen.container.querySelector("[data-canvas-writing-track]");
    const initialWritingSurfaceClassName = writingSurface?.className;
    const initialScrollViewportClassName = scrollViewport?.className;
    const initialWritingTrackClassName = writingTrack?.className;

    expect(emptyRail?.querySelectorAll("[data-canvas-panel-trigger]")).toHaveLength(4);
    expect(emptyRail?.querySelectorAll("[data-context-indicator]")).toHaveLength(0);
    expect(screen.container.querySelector("[data-canvas-context-bar]")).toBeNull();
    expect(getLinkByLabel(screen.container, "Memoria")).toBeUndefined();
    expect(screen.container.querySelector("[data-canvas-memory-nav]")).toBeNull();
    expect(getContextIndicator(screen.container, "Memoria")).toBeUndefined();
    expect(getButtonByLabel(screen.container, "Conceptos")).toBeUndefined();
    expect(getButtonByLabel(screen.container, "Explorar conocimiento")).toBeDefined();
    expect(getButtonByLabel(screen.container, "Explorar conceptos")).toBeDefined();
    expect(getButtonByLabel(screen.container, "Canvas")).toBeDefined();
    expect(getButtonByLabel(screen.container, "Administrar")).toBeUndefined();
    expect(
      screen.container.querySelectorAll("[data-knowledge-management-trigger]"),
    ).toHaveLength(0);
    expect(getButtonByLabel(screen.container, "Estado")).toBeDefined();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);

    const rail = screen.container.querySelector("[data-canvas-icon-rail]");
    const contextBar = screen.container.querySelector("[data-canvas-context-bar]");

    expect(getContextIndicator(screen.container, "conceptos sugeridos")).toBeDefined();
    expect(getContextIndicator(screen.container, "Memoria")).toBeUndefined();
    expect(contextBar).toBeDefined();
    expect(contextBar?.contains(getContextIndicator(screen.container, "conceptos sugeridos")!)).toBe(
      true,
    );
    expect(writingSurface?.contains(contextBar)).toBe(true);
    expect(scrollViewport?.contains(contextBar)).toBe(false);
    expect(writingSurface?.className).toBe(initialWritingSurfaceClassName);
    expect(scrollViewport?.className).toBe(initialScrollViewportClassName);
    expect(writingTrack?.className).toBe(initialWritingTrackClassName);
    expect(rail?.querySelectorAll("[data-canvas-panel-trigger]")).toHaveLength(4);
    expect(rail?.querySelectorAll("[data-context-indicator]")).toHaveLength(0);
    expect(getContextIndicator(screen.container, "Memoria")).toBeUndefined();
    expect(getButtonByLabel(screen.container, "Canvas")).toBeDefined();
  });

  it("opens global knowledge and concepts workspaces from permanent rail actions", async () => {
    const screen = await renderCaptureSurface();
    const canvas = screen.container.querySelector("[data-capture-canvas]");
    const knowledgeTrigger = getButtonByLabel(
      screen.container,
      "Explorar conocimiento",
    );
    const conceptsTrigger = getButtonByLabel(screen.container, "Explorar conceptos");

    expect(knowledgeTrigger?.querySelector("[data-canvas-rail-icon='knowledge']")).toBeDefined();
    expect(
      conceptsTrigger?.querySelector("[data-canvas-rail-icon='concept-network']"),
    ).toBeDefined();
    expect(canvas).toBeDefined();

    await click(knowledgeTrigger!);

    const memoryDialog = getDialog(document.body, "Memoria") as HTMLElement;
    expect(memoryDialog).toBeDefined();
    expect(memoryDialog.hasAttribute("data-application-workspace-dialog")).toBe(true);
    expect(memoryDialog.querySelector("[data-knowledge-base-client]")?.getAttribute(
      "data-embedded",
    )).toBe("true");
    expect(screen.container.contains(canvas)).toBe(true);
    expect(window.location.pathname).toBe("/");

    await click(getButtonByLabel(document.body, "Cerrar Memoria")!);
    expect(getDialog(document.body, "Memoria")).toBeUndefined();

    await click(conceptsTrigger!);

    const conceptsDialog = getDialog(document.body, "Conceptos") as HTMLElement;
    expect(conceptsDialog).toBeDefined();
    expect(conceptsDialog.hasAttribute("data-application-workspace-dialog")).toBe(
      true,
    );
    expect(conceptsDialog.querySelector("[data-concept-workspace]")).toBeDefined();
    expect(conceptsDialog.querySelector("[data-knowledge-explorer-canvas]")).toBeDefined();
    expect(screen.container.contains(canvas)).toBe(true);
    expect(window.location.pathname).toBe("/");

    await click(getButton(document.body, "Cerrar conceptos"));
    expect(getDialog(document.body, "Conceptos")).toBeUndefined();
    expect(screen.container.contains(canvas)).toBe(true);
  });

  it("shows cognitive indicators in the canvas context bar without visible counters", async () => {
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

    const conceptIndicator = getContextIndicator(screen.container, "conceptos sugeridos");
    const memoryIndicator = getContextIndicator(screen.container, "Memoria");

    expect(conceptIndicator?.getAttribute("aria-label")).toBe(
      "1 conceptos sugeridos",
    );
    expect(memoryIndicator?.getAttribute("aria-label")).toBe(
      "Memoria",
    );
    expect(
      memoryIndicator?.querySelector("[data-canvas-rail-icon='lightbulb']"),
    ).toBeDefined();
    expect(screen.container.querySelector("[data-canvas-memory-nav]")).toBeNull();
    expect(screen.container.querySelector("[data-canvas-context-bar]")?.contains(conceptIndicator!)).toBe(
      true,
    );
    expect(screen.container.querySelector("[data-canvas-context-bar]")?.contains(memoryIndicator!)).toBe(
      true,
    );
    expect(conceptIndicator?.className).toContain("h-8");
    expect(memoryIndicator?.className).toContain("h-8");
    expect(conceptIndicator?.querySelector("svg")?.className.baseVal).toContain(
      "h-4",
    );
    expect(conceptIndicator?.querySelector("svg")?.className.baseVal).toContain(
      "w-4",
    );
    expect(conceptIndicator?.textContent?.trim()).toBe("Conceptos");
    expect(memoryIndicator?.textContent?.trim()).toBe("Memoria");
  });

  it("opens the memory status panel from the rail without duplicating the header trigger", async () => {
    const screen = await renderCaptureSurface();
    const statusTrigger = getButtonByLabel(
      screen.container,
      "Estado",
    );

    expect(statusTrigger).toBeDefined();
    expect(statusTrigger?.querySelector("[data-canvas-rail-icon='activity']")).toBeDefined();
    expect(statusTrigger?.querySelector("[data-memory-sync-status-dot]")).toBeNull();
    expect(screen.container.querySelectorAll("[data-memory-sync-trigger]")).toHaveLength(1);

    await hoverElement(statusTrigger);
    const statusPanel = getDialog(screen.container, "Estado de la memoria");

    expect(statusPanel).toBeDefined();
    expect(screen.container.querySelector("[data-memory-sync-panel]")).toBeTruthy();
    expect(
      screen.container.querySelector("[data-memory-sync-status-panel-variant]")?.getAttribute(
        "data-memory-sync-status-panel-variant",
      ),
    ).toBe("rail-panel");

    await unhoverElement(statusTrigger);
    await hoverElement(statusPanel);
    await advanceTime(100);

    expect(getDialog(screen.container, "Estado de la memoria")).toBeDefined();
    await advanceTime(140);
    expect(getDialog(screen.container, "Estado de la memoria")).toBeDefined();

    await unhoverElement(statusPanel);
    await advanceTime(240);
    expect(screen.container.querySelector("[data-canvas-side-panel]")?.getAttribute(
      "data-panel-state",
    )).toBe("closing");
    await advanceTime(240);
    expect(getDialog(screen.container, "Estado de la memoria")).toBeUndefined();

    await click(statusTrigger!);
    const pinnedStatusPanel = getDialog(screen.container, "Estado de la memoria");
    await unhoverElement(pinnedStatusPanel);
    await advanceTime(200);

    expect(getDialog(screen.container, "Estado de la memoria")).toBeDefined();

    await keydownWindow({ key: "Escape" });

    expect(getDialog(screen.container, "Estado de la memoria")).toBeUndefined();
  });

  it("does not show an explanation for literal concept suggestions", async () => {
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "codelco", name: "Codelco" }),
    ]);
    const screen = await renderCaptureSurface({ contextRepository });

    await changeTextarea(screen.container, "Revisar Codelco");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    expect(screen.container.textContent).toContain("Codelco");
    expect(screen.container.textContent).not.toContain("Concepto detectado en el texto");
    expect(screen.container.textContent).not.toContain("Detectado como");
  });

  it("shows the existing alias explanation for non-literal concept suggestions", async () => {
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "elteniente", name: "División El Teniente", aliases: ["DET"] }),
    ]);
    const screen = await renderCaptureSurface({ contextRepository });

    await changeTextarea(screen.container, "Revisar DET");
    await advanceTime(500);
    await hoverElement(getContextIndicator(screen.container, "conceptos sugeridos"));

    expect(screen.container.textContent).toContain("División El Teniente");
    expect(screen.container.textContent).toContain("Detectado como DET");

    await click(getContextIndicator(screen.container, "conceptos sugeridos")!);

    expect(screen.container.textContent).toContain("División El Teniente");
    expect(screen.container.textContent).toContain("Detectado como DET");
  });

  it("renders explicit concept origin rules in the real concept panel rows", async () => {
    const codelco = createContext({ id: "codelco", name: "Codelco" });
    const operationalCore = createContext({
      id: "operational-core",
      name: "Operational Core",
    });
    const continuidad = createContext({
      id: "continuidad-operacional",
      name: "Continuidad operacional",
    });
    const tracking = createContext({ id: "tracking", name: "Tracking" });
    const selected = createContext({ id: "selected", name: "Seleccionado" });
    const container = await renderConceptPanelContent({
      suggestions: [
        {
          kind: "existing",
          context: codelco,
          conceptId: codelco.id,
          label: codelco.name,
          score: 1,
          evidenceCaptureIds: [],
          matchedTerms: [],
          knowledgeSuggestionReasons: ["Concepto detectado en el texto"],
        },
        {
          kind: "existing",
          context: operationalCore,
          conceptId: operationalCore.id,
          label: operationalCore.name,
          score: 1,
          evidenceCaptureIds: [],
          matchedTerms: [],
          matchedAlias: "OC",
        },
        {
          kind: "existing",
          context: continuidad,
          conceptId: continuidad.id,
          label: continuidad.name,
          score: 1,
          evidenceCaptureIds: [],
          matchedTerms: [],
          knowledgeSuggestionReasons: [
            "Suele formar parte de este mismo contexto",
          ],
        },
        {
          kind: "existing",
          context: tracking,
          conceptId: tracking.id,
          label: tracking.name,
          score: 1,
          evidenceCaptureIds: [],
          matchedTerms: [],
          knowledgeSuggestionReasons: [
            "Concepto detectado en el texto",
            "Existe memoria previa que podría ser relevante",
          ],
        },
        {
          kind: "existing",
          context: selected,
          conceptId: selected.id,
          label: selected.name,
          score: 1,
          evidenceCaptureIds: [],
          matchedTerms: [],
          knowledgeSuggestionReasons: [
            "Suele formar parte de este mismo contexto",
          ],
        },
      ],
      selectedContextIds: [selected.id],
    });

    const literalRow = getConceptSuggestionRow(container, "codelco");
    expect(literalRow?.textContent).toContain("Codelco");
    expect(
      literalRow?.querySelector("[data-concept-suggestion-explanation]"),
    ).toBeNull();

    const aliasRow = getConceptSuggestionRow(container, "operational-core");
    expect(aliasRow?.textContent).toContain("Operational Core");
    expect(aliasRow?.textContent).toContain("Detectado como OC");

    const nonLiteralRow = getConceptSuggestionRow(
      container,
      "continuidad-operacional",
    );
    expect(nonLiteralRow?.textContent).toContain(
      "Suele formar parte de este mismo contexto",
    );

    const literalAndNonLiteralRow = getConceptSuggestionRow(container, "tracking");
    expect(literalAndNonLiteralRow?.textContent).not.toContain(
      "Concepto detectado en el texto",
    );
    expect(literalAndNonLiteralRow?.textContent).toContain(
      "Existe memoria previa que podría ser relevante",
    );

    const selectedRow = getConceptSuggestionRow(container, "selected");
    expect(selectedButtonFromRow(selectedRow).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(selectedRow?.textContent).toContain(
      "Suele formar parte de este mismo contexto",
    );
  });

  it("renders non-literal concept origins inside the visible suggestion row", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "memory-1",
        content: "Mitcom, Servidor y Continuidad operacional revisan cambios.",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
      createStoredNode({
        id: "memory-2",
        content: "Mitcom, Servidor y Continuidad operacional ajustan soporte.",
        updatedAt: "2026-05-01T00:00:00.000Z",
      }),
      createStoredNode({
        id: "memory-3",
        content: "Mitcom, Servidor y Continuidad operacional cierran pendientes.",
        updatedAt: "2026-07-20T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "mitcom", name: "Mitcom" }),
      createContext({ id: "servidor", name: "Servidor" }),
      createContext({
        id: "continuidad-operacional",
        name: "Continuidad operacional",
      }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      ...createRelationsFor("memory-1", [
        "mitcom",
        "servidor",
        "continuidad-operacional",
      ]),
      ...createRelationsFor("memory-2", [
        "mitcom",
        "servidor",
        "continuidad-operacional",
      ]),
      ...createRelationsFor("memory-3", [
        "mitcom",
        "servidor",
        "continuidad-operacional",
      ]),
    ]);
    const screen = await renderCaptureSurface({
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(screen.container, "Mitcom y Servidor revisan pendientes");
    await advanceTime(500);
    await hoverElement(getContextIndicator(screen.container, "conceptos sugeridos"));

    const previewRow = getConceptSuggestionRow(
      screen.container,
      "continuidad-operacional",
    );
    expect(previewRow?.textContent).toContain("Continuidad operacional");
    expect(previewRow?.textContent).toContain(
      "Suele formar parte de este mismo contexto",
    );
    expect(
      previewRow?.querySelector("[data-concept-suggestion-explanation]"),
    ).toBeTruthy();

    await click(getContextIndicator(screen.container, "conceptos sugeridos")!);

    const pinnedRow = getConceptSuggestionRow(
      screen.container,
      "continuidad-operacional",
    );
    expect(pinnedRow?.textContent).toContain(
      "Suele formar parte de este mismo contexto",
    );

    await click(selectedButtonFromRow(pinnedRow));

    const selectedRow = getConceptSuggestionRow(
      screen.container,
      "continuidad-operacional",
    );
    expect(
      selectedButtonFromRow(selectedRow).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(selectedRow?.textContent).toContain(
      "Suele formar parte de este mismo contexto",
    );
  });

  it("renders a real non-literal knowledge reason from capture suggestions", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "memory-1",
        content: "Mitcom y Tracking revisan continuidad operacional.",
        updatedAt: "2026-04-01T00:00:00.000Z",
      }),
      createStoredNode({
        id: "memory-2",
        content: "Mitcom y Tracking preparan continuidad operacional.",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
      createStoredNode({
        id: "memory-3",
        content: "Mitcom y Tracking cierran continuidad operacional.",
        updatedAt: "2026-07-20T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "mitcom", name: "Mitcom" }),
      createContext({ id: "tracking", name: "Tracking" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      ...createRelationsFor("memory-1", ["mitcom", "tracking"]),
      ...createRelationsFor("memory-2", ["mitcom", "tracking"]),
      ...createRelationsFor("memory-3", ["mitcom", "tracking"]),
    ]);
    const screen = await renderCaptureSurface({
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(screen.container, "Mitcom continuidad operacional");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    const trackingRow = getConceptSuggestionRow(screen.container, "tracking");
    expect(trackingRow?.textContent).toContain("Tracking");
    expect(trackingRow?.textContent).not.toContain("Concepto detectado en el texto");
    expect(trackingRow?.textContent).toContain("Patrón recurrente en tu memoria");
  });

  it("marks the active contextual action while its panel is open and returns after close", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);

    const indicator = getContextIndicator(screen.container, "conceptos sugeridos");
    expect(indicator?.getAttribute("aria-pressed")).toBe("false");

    await openConceptPanel(screen.container);

    expect(indicator?.getAttribute("aria-pressed")).toBe("true");

    await keydownWindow({ key: "Escape" });

    expect(indicator?.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps contextual actions above the canvas and capture action in the right dock", async () => {
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

    const rail = screen.container.querySelector("[data-canvas-icon-rail]");
    const dock = screen.container.querySelector("[data-canvas-capture-dock]");
    const button = screen.container.querySelector("[data-capture-submit]");

    expect(rail).toBeDefined();
    expect(dock).toBeDefined();
    expect(button).toBeDefined();
    expect(button?.className).toContain("h-11");
    expect(button?.className).toContain("w-11");
    expect(button?.className).toContain("rounded-full");
    expect(button?.querySelector("svg")).toBeDefined();
    expect(button?.querySelector(".sr-only")?.textContent).toBe("Capturar");
    expect(rail?.querySelectorAll("[data-context-indicator]")).toHaveLength(0);
    expect(screen.container.querySelector("[data-canvas-context-bar]")?.querySelectorAll(
      "[data-context-indicator]",
    )).toHaveLength(2);
    expect(dock?.contains(button)).toBe(true);
  });

  it("keeps the capture action in the right dock when there are no contextual indicators", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "ok");
    await advanceTime(500);

    const rail = screen.container.querySelector("[data-canvas-icon-rail]");
    const dock = screen.container.querySelector("[data-canvas-capture-dock]");
    const button = screen.container.querySelector("[data-capture-submit]");

    expect(rail?.querySelectorAll("[data-context-indicator]")).toHaveLength(0);
    expect(dock).toBeDefined();
    expect(button).toBeDefined();
    expect(button?.className).toContain("w-11");
    expect(button?.querySelector("svg")).toBeDefined();
    expect(button?.querySelector(".sr-only")?.textContent).toBe("Capturar");
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

    expect(getContextIndicator(screen.container, "Memoria")).toBeDefined();
    await openMemoryPanel(screen.container);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
    expect(screen.container.textContent).toContain("Proveedor Mitcom");
    expect(screen.container.textContent).not.toContain("Recordando...");
  });

  it("resolves a memory panel opened while a newer recall is still loading", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Proveedor Mitcom pendiente de seguimiento",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
      createStoredNode({
        id: "railway",
        content: "Railway queda pendiente para revisar despliegues.",
        updatedAt: "2026-01-06T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "mitcom");
    await advanceTime(500);
    expect(getContextIndicator(screen.container, "Memoria")).toBeDefined();

    await changeTextarea(screen.container, "railway");
    await advanceTime(100);
    await openMemoryPanel(screen.container);

    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
    expect(screen.container.textContent).toContain("Recordando...");

    await advanceTime(500);

    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
    expect(screen.container.textContent).toContain("Railway queda pendiente");
    expect(screen.container.textContent).not.toContain("Recordando...");
  });

  it("does not leave memory recall loading indefinitely when a local query hangs", async () => {
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
    expect(getContextIndicator(screen.container, "Memoria")).toBeDefined();

    nodeRepository.listByWorkspace = async () =>
      new Promise<Node[]>(() => {
        // Intentionally unresolved to exercise the visual safety timeout.
      });

    await changeTextarea(screen.container, "mitcom pendiente nuevo");
    await advanceTime(100);
    await openMemoryPanel(screen.container);

    expect(screen.container.textContent).toContain("Recordando...");

    await advanceTime(3600);

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

  it("requests synchronization immediately after the local capture is committed", async () => {
    const storage = new MemoryStorageAdapter();
    const nodeRepository = new InMemoryNodeRepository();
    const onCaptureCommitted = vi.fn(async () => {
      await expect(nodeRepository.listByWorkspace(workspace.id)).resolves.toHaveLength(1);
    });
    const screen = await renderCaptureSurface({
      storage,
      nodeRepository,
      onCaptureCommitted,
    });

    await changeTextarea(screen.container, "Captura local que debe propagarse");
    await advanceTime(500);
    await click(getButton(screen.container, "Capturar"));

    expect(onCaptureCommitted).toHaveBeenCalledTimes(1);
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

  it("captures selected text as an existing concept without duplicating relations", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const feedbackService = createVisualFeedbackService();
    const contextRepository = new InMemoryContextRepository([
      createContext({
        id: "mitcom",
        name: "Mitcom",
        aliases: ["Proveedor Mitcom"],
      }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const screen = await renderCaptureSurface({
      nodeRepository,
      contextRepository,
      relationRepository,
      feedbackService,
    });

    await changeTextarea(screen.container, "Revisar Proveedor Mitcom mañana");
    await selectTextareaText(screen.container, "Proveedor Mitcom");
    await click(getButton(screen.container, "Capturar seleccion"));
    expect(feedbackService.getState().current?.accessibleText).toBe(
      "Concepto asociado",
    );
    await openConceptPanel(screen.container);
    expect(screen.container.textContent).toContain("Mitcom");
    const selectedMitcomChip = Array.from(
      screen.container.querySelectorAll("button[aria-pressed='true']"),
    ).find((button) => button.textContent?.includes("Mitcom"));
    expect(selectedMitcomChip?.textContent).toContain("Mitcom");
    expect(
      selectedMitcomChip?.closest("[data-concept-suggestion-highlighted]"),
    ).toBeTruthy();

    await selectTextareaText(screen.container, "Proveedor Mitcom");
    await click(getButton(screen.container, "Capturar seleccion"));
    expect(feedbackService.getState().current?.accessibleText).toBe(
      "Ya estaba asociado",
    );
    expect(
      Array.from(
        screen.container.querySelectorAll("button[aria-pressed][type='button']"),
      ).filter(
        (button) =>
          button.closest("[data-canvas-side-panel]") &&
          button.textContent?.trim(),
      ),
    )
      .toHaveLength(1);

    await click(getButton(screen.container, "Capturar"));

    const nodes = await nodeRepository.listByWorkspace(workspace.id);
    const relations = await relationRepository.listByWorkspace(workspace.id);
    expect(nodes).toHaveLength(1);
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      nodeId: nodes[0]?.id,
      contextId: "mitcom",
      workspaceId: workspace.id,
    });
  });

  it("renders the selection action in a body portal above the header layer", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Mitcom mañana");
    await selectTextareaText(screen.container, "Mitcom");

    const action = document.body.querySelector<HTMLElement>(
      "[data-capture-selection-action]",
    );

    expect(action).toBeDefined();
    expect(action?.parentElement?.parentElement).toBe(document.body);
    expect(action?.parentElement?.getAttribute("data-vinema-floating-layer-root")).toBe(
      "popover",
    );
    expect(action?.className).toContain("fixed");
    expect(action?.className).toContain("z-[60]");
    expect(action?.closest("[data-capture-canvas]")).toBeNull();
    expect(action?.closest("[class*='overflow-hidden']")).toBeNull();
    expect(action?.style.top).not.toBe("");
    expect(action?.style.left).not.toBe("");
  });

  it("keeps a new selection local until the capture is saved", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const contextRepository = new InMemoryContextRepository();
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const feedbackService = createVisualFeedbackService();
    const screen = await renderCaptureSurface({
      nodeRepository,
      contextRepository,
      relationRepository,
      feedbackService,
    });

    await changeTextarea(screen.container, "Revisar ESTADO DE PAGO mañana");
    await selectTextareaText(screen.container, "ESTADO DE PAGO");
    await click(getButton(screen.container, "Capturar seleccion"));

    expect(document.body.textContent).toContain("Nuevo concepto");
    expect(document.body.textContent).toContain("Estado de pago");
    await expect(contextRepository.list({ workspaceId: workspace.id })).resolves.toHaveLength(0);

    await click(getButton(screen.container, "Confirmar"));
    expect(feedbackService.getState().current?.accessibleText).toBe(
      "Concepto incorporado",
    );
    await expect(contextRepository.list({ workspaceId: workspace.id })).resolves.toHaveLength(0);

    await openConceptPanel(screen.container);
    const estadoDePagoChip = getButton(screen.container, "Estado de pago");
    expect(estadoDePagoChip).toBeDefined();
    expect(estadoDePagoChip.getAttribute("aria-pressed")).toBe("true");
    expect(
      estadoDePagoChip.closest("[data-concept-suggestion-highlighted]"),
    ).toBeTruthy();

    await click(getButton(screen.container, "Capturar"));

    const contexts = await contextRepository.list({ workspaceId: workspace.id });
    const relations = await relationRepository.listByWorkspace(workspace.id);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.name).toBe("Estado de pago");
    expect(relations).toHaveLength(1);
    expect(relations[0]?.contextId).toBe(contexts[0]?.id);
  });

  it("lets ambiguous selected text choose an existing concept", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const feedbackService = createVisualFeedbackService();
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "core", name: "Operational Core", aliases: ["OC"] }),
      createContext({ id: "office", name: "Oficina Central", aliases: ["OC"] }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const screen = await renderCaptureSurface({
      nodeRepository,
      contextRepository,
      relationRepository,
      feedbackService,
    });

    await changeTextarea(screen.container, "Revisar OC mañana");
    await selectTextareaText(screen.container, "OC");
    await click(getButton(screen.container, "Capturar seleccion"));

    expect(document.body.textContent).toContain("Elegir concepto");
    expect(feedbackService.getState().current?.accessibleText).not.toBe(
      "Concepto asociado",
    );
    await click(getButton(screen.container, "Operational Core"));
    expect(feedbackService.getState().current?.accessibleText).toBe(
      "Concepto asociado",
    );
    await click(getButton(screen.container, "Capturar"));

    await expect(relationRepository.listByWorkspace(workspace.id)).resolves.toMatchObject([
      { contextId: "core" },
    ]);
  });

  it("ignores invalid selections and closes the selection action with Escape", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Mitcom mañana");
    await selectTextareaRange(screen.container, 7, 8);
    expect(queryButton(screen.container, "Capturar seleccion")).toBeUndefined();

    await selectTextareaText(screen.container, "mañana");
    expect(queryButton(screen.container, "Capturar seleccion")).toBeDefined();

    await changeTextarea(screen.container, "Revisar de mañana");
    await selectTextareaText(screen.container, "de");
    expect(queryButton(screen.container, "Capturar seleccion")).toBeUndefined();

    await changeTextarea(screen.container, "Revisar Mitcom mañana");
    await selectTextareaText(screen.container, "Mitcom");
    expect(queryButton(screen.container, "Capturar seleccion")).toBeDefined();

    await keydownWindow({ key: "Escape" });

    expect(queryButton(screen.container, "Capturar seleccion")).toBeUndefined();
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

  it("shows recovered captures as compact navigable suggestions without global CTAs", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
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

    expect(recoveryLink).toBeDefined();
    expect(recoveryLink?.textContent).toContain(
      "Reunion de control de gestion con proveedor Mitcom",
    );
    expect(screen.container.textContent).not.toContain("Explorar memoria");
    expect(screen.container.textContent).not.toContain("Explorar conocimiento");
    expect(screen.container.textContent).not.toContain("Explorar conceptos");
    expect(getLinksByExactHref(screen.container, "/memory")).toHaveLength(0);
    expect(screen.container.querySelector("article span")?.className).toContain("truncate");
    await expect(relationRepository.listByWorkspace(workspace.id)).resolves.toEqual(
      [],
    );

    const canvas = screen.container.querySelector("[data-capture-canvas]");
    await clickAnchor(recoveryLink!);

    const captureDialog = getDialog(document.body, "Captura") as HTMLElement;
    const noteDetail = document.body.querySelector("[data-note-detail]");

    expect(captureDialog).toBeDefined();
    expect(captureDialog.hasAttribute("data-application-workspace-dialog")).toBe(true);
    expect(noteDetail?.getAttribute("data-node-id")).toBe("mitcom");
    expect(noteDetail?.getAttribute("data-embedded")).toBe("true");
    expect(document.body.querySelectorAll("[data-application-workspace-dialog]")).toHaveLength(1);
    expect(getButtonByLabel(document.body, "Volver")).toBeDefined();
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
    expect(screen.container.contains(canvas)).toBe(true);
    expect(getTextarea(screen.container)?.value).toBe(
      "Planificar control de gestion con Mitcom",
    );
    expect(window.location.pathname).toBe("/");
    expect(navigationMocks.push).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();

    await click(getButtonByLabel(document.body, "Volver") as HTMLButtonElement);

    expect(getDialog(document.body, "Captura")).toBeUndefined();
    expect(document.body.querySelector("[data-note-detail]")).toBeNull();
    expect(screen.container.contains(canvas)).toBe(true);
    expect(window.location.pathname).toBe("/");

    openSpy.mockRestore();
  });

  it("shows more compact memory rows in the same contextual panel", async () => {
    const nodeRepository = new InMemoryNodeRepository(
      Array.from({ length: 6 }, (_, index) =>
        createStoredNode({
          id: `delta-${index + 1}`,
          content: `Proyecto Delta seguimiento ${index + 1} con acuerdos y pendientes compartidos.`,
          updatedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        }),
      ),
    );
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Proyecto Delta seguimiento");
    await advanceTime(500);
    await openMemoryPanel(screen.container);

    const panel = getDialog(screen.container, "Me recuerda a…") as HTMLElement;
    const rows = Array.from(panel.querySelectorAll("article"));

    expect(rows).toHaveLength(5);
    expect(panel.textContent).toContain("Proyecto Delta seguimiento 6");
    expect(panel.textContent).toContain("Proyecto Delta seguimiento 5");
    expect(panel.textContent).not.toContain("Proyecto Delta seguimiento 1");
    expect(panel.textContent).not.toContain("Explorar memoria");
    expect(rows[0]?.querySelector("a")?.getAttribute("href")).toContain(
      "nodeId=delta-6",
    );
    expect(rows[0]?.querySelector("a")?.className).toContain("py-1.5");
  });

  it("opens the memory explorer from the rail without leaving the canvas", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "mitcom",
        content: "Reunion de control de gestion con proveedor Mitcom",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ]);
    const screen = await renderCaptureSurface({ nodeRepository });

    await changeTextarea(screen.container, "Planificar control con Mitcom");
    await advanceTime(500);
    const exploreButton = getButtonByLabel(screen.container, "Explorar conocimiento");

    await click(exploreButton!);

    const dialog = getDialog(document.body, "Memoria");
    expect(dialog).toBeDefined();
    expect(dialog?.hasAttribute("data-application-workspace-dialog")).toBe(true);
    expect(window.location.pathname).toBe("/");
    expect(getTextarea(screen.container)?.value).toBe(
      "Planificar control con Mitcom",
    );

    await click(getButton(document.body, "Abrir captura Mitcom"));

    expect(getDialog(document.body, "Captura")).toBeDefined();
    expect(document.body.querySelector("[data-note-detail]")).toBeTruthy();
    expect(window.location.pathname).toBe("/");
    expect(document.body.querySelectorAll("[data-application-workspace-dialog]")).toHaveLength(1);
    expect(getTextarea(screen.container)?.value).toBe(
      "Planificar control con Mitcom",
    );

    await click(getButton(document.body, "Volver a memoria"));

    expect(getDialog(document.body, "Memoria")).toBeDefined();
    expect(document.body.querySelector("[data-knowledge-base-client]")).toBeTruthy();
    expect(document.body.querySelector("[data-note-detail]")).toBeNull();

    await click(getButton(document.body, "Abrir captura Mitcom"));
    await click(getButton(document.body, "Abrir concepto Railway"));

    expect(getDialog(document.body, "Conceptos")).toBeDefined();
    expect(document.body.querySelector("[data-concept-workspace]")).toBeTruthy();
    expect(document.body.textContent).toContain("Perfil concepto railway");
    expect(window.location.pathname).toBe("/");
    expect(document.body.querySelectorAll("[data-application-workspace-dialog]")).toHaveLength(1);

    await keydownDocument({ key: "Escape" });

    expect(getDialog(document.body, "Conceptos")).toBeUndefined();
    expect(document.activeElement).toBe(exploreButton);
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

  it("opens memory panels from the canvas context bar without moving the canvas", async () => {
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
    const canvasClassName = screen.container.querySelector(
      "[data-capture-canvas]",
    )?.className;
    const composerClassName = screen.container.querySelector(
      "[data-mobile-capture-composer]",
    )?.className;
    await openMemoryPanel(screen.container);

    const panel = getDialog(screen.container, "Me recuerda a…") as HTMLElement;
    const panelColumn = screen.container.querySelector("[data-canvas-panel-column]");
    const contextLayer = screen.container.querySelector("[data-canvas-context-layer]");
    const contextPanelAnchor = screen.container.querySelector(
      "[data-canvas-context-panel-anchor]",
    );

    expect(panelColumn?.contains(panel)).toBe(false);
    expect(contextLayer?.contains(panel)).toBe(true);
    expect(contextPanelAnchor?.contains(panel)).toBe(true);
    expect(panel.className).toContain("min-w-[var(--vinema-canvas-panel-min-width)]");
    expect(panel.className).toContain("w-[var(--vinema-canvas-panel-preferred-width)]");
    expect(panel.className).toContain("max-h-[var(--vinema-canvas-panel-max-height)]");
    expect(panel.className).toContain(
      "max-w-[calc(100vw-var(--vinema-canvas-icon-width)-var(--vinema-canvas-panel-gutter)-1rem)]",
    );
    expect(panel.className).toContain("box-border");
    expect(panel.className).toContain("flex-col");
    expect(panel.className).toContain("opacity-100");
    expect(panel.className).not.toContain("h-[min(34rem,calc(100%-2rem))]");
    expect(panel.querySelector("[data-canvas-side-panel-header]")?.className).toContain(
      "shrink-0",
    );
    expect(panel.querySelector("[data-canvas-side-panel-content]")?.className).toContain(
      "overflow-y-auto",
    );
    expect(panel.querySelector("[data-canvas-side-panel-content]")?.className).toContain(
      "px-5",
    );
    expect(panel.className).not.toContain("absolute");
    expect(panel.className).not.toContain("bottom-[calc(100%+10px)]");
    expect(panel.className).not.toContain("left-1/2");
    expect(screen.container.querySelector("[data-capture-canvas]")?.className).toBe(
      canvasClassName,
    );
    expect(screen.container.querySelector("[data-mobile-capture-composer]")?.className).toBe(
      composerClassName,
    );
  });

  it("uses the same auto-sizing geometry for concepts, memories, preferences and status", async () => {
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
    await click(getButtonByLabel(screen.container, "Canvas")!);
    const preferencesPanel = getDialog(
      screen.container,
      "Configuración del Canvas",
    ) as HTMLElement;
    await click(getButtonByLabel(screen.container, "Estado")!);
    const statusPanel = screen.container.querySelector(
      '[data-canvas-side-panel-active="memoryStatus"]',
    ) as HTMLElement;

    expect(memoryPanel.className).toBe(conceptPanel.className);
    expect(preferencesPanel.className).toBe(conceptPanel.className);
    expect(statusPanel.className).toBe(conceptPanel.className);
    expect(conceptPanel.className).toContain("transition-[opacity,transform]");
    expect(conceptPanel.className).toContain("duration-150");
    expect(conceptPanel.className).toContain("animate-[vinema-panel-enter_150ms_ease-out]");
    expect(conceptPanel.className).toContain("max-h-[var(--vinema-canvas-panel-max-height)]");
    expect(conceptPanel.className).toContain("min-w-[var(--vinema-canvas-panel-min-width)]");
    expect(conceptPanel.className).toContain("w-[var(--vinema-canvas-panel-preferred-width)]");
    expect(statusPanel.querySelector("[data-canvas-side-panel-header]")?.textContent).toContain(
      "Estado",
    );
    expect(statusPanel.querySelector("[data-canvas-side-panel-header]")?.className).toContain(
      "gap-3",
    );
    expect(statusPanel.querySelector("[data-canvas-side-panel-content]")?.className).toContain(
      "[overflow-wrap:anywhere]",
    );
  });

  it("keeps the permanent rail grouped while contextual actions mark the active panel", async () => {
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
    const rail = screen.container.querySelector("[data-canvas-icon-rail]");

    expect(rail?.className).toContain("items-center");
    expect(rail?.className).toContain("z-20");
    expect(screen.container.querySelector("[data-canvas-panel-column]")?.className).toContain(
      "pointer-events-none",
    );
    expect(screen.container.querySelector("[data-canvas-panel-column]")?.className).toContain(
      "z-30",
    );
    const contextBar = screen.container.querySelector("[data-canvas-context-bar]");

    expect(getLinkByLabel(screen.container, "Memoria")).toBeUndefined();
    expect(getButtonByLabel(screen.container, "Administrar")).toBeUndefined();
    expect(getButtonByLabel(screen.container, "Explorar conocimiento")).toBeDefined();
    expect(getButtonByLabel(screen.container, "Explorar conceptos")).toBeDefined();
    expect(rail?.querySelectorAll("[data-canvas-panel-trigger]")).toHaveLength(4);
    expect(rail?.querySelectorAll("[data-context-indicator]")).toHaveLength(0);
    expect(contextBar?.querySelectorAll("[data-context-indicator]")).toHaveLength(2);
    expect(conceptPanel.className).toContain("w-[var(--vinema-canvas-panel-preferred-width)]");
    expect(conceptIndicator.getAttribute("aria-pressed")).toBe("true");

    await openMemoryPanel(screen.container);
    const memoryPanel = getDialog(screen.container, "Me recuerda a…") as HTMLElement;
    const memoryIndicator = screen.container.querySelector(
      '[data-context-indicator-panel="memories"]',
    ) as HTMLElement;
    expect(memoryPanel.className).toContain("w-[var(--vinema-canvas-panel-preferred-width)]");
    expect(memoryIndicator.getAttribute("aria-pressed")).toBe("true");
    expect(conceptIndicator.getAttribute("aria-pressed")).toBe("false");
    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(1);
  });

  it("previews contextual canvas panels on hover while click keeps a panel pinned", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
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

    const conceptIcon = getContextIndicator(screen.container, "conceptos sugeridos");
    const memoryIcon = getContextIndicator(screen.container, "Memoria");

    await hoverElement(conceptIcon);
    const previewPanel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;
    expect(previewPanel).toBeDefined();
    expect(previewPanel.getAttribute("data-canvas-side-panel-active")).toBe("concepts");
    expect(previewPanel.getAttribute("data-panel-mode")).toBe("preview");
    expect(previewPanel.className).toContain("pointer-events-auto");
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(1);
    expect(conceptIcon?.className).toContain("text-indigo-600");
    expect(conceptIcon?.getAttribute("aria-expanded")).toBe("true");
    expect(conceptIcon?.getAttribute("aria-pressed")).toBe("false");
    expect(conceptIcon?.getAttribute("aria-controls")).toBe("canvas-tool-panel");

    await unhoverElement(conceptIcon);
    await advanceTime(100);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(1);
    await hoverElement(conceptIcon);
    await advanceTime(240);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await unhoverElement(conceptIcon);
    await advanceTime(240);
    const closingConceptPanel = screen.container.querySelector("[data-canvas-side-panel]");
    expect(closingConceptPanel?.getAttribute("data-panel-state")).toBe("closing");
    expect(closingConceptPanel?.className).toContain("duration-240");
    expect(closingConceptPanel?.className).toContain("opacity-0");
    expect(closingConceptPanel?.className).toContain("pointer-events-none");
    await advanceTime(240);
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(0);

    await hoverElement(conceptIcon);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    await hoverElement(memoryIcon);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(1);
    await unhoverElement(memoryIcon);
    await advanceTime(240);
    expect(screen.container.querySelector("[data-canvas-side-panel]")?.getAttribute(
      "data-panel-state",
    )).toBe("closing");
    await advanceTime(240);
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(0);

    await click(conceptIcon!);
    const pinnedConceptPanel = getDialog(
      screen.container,
      "Conceptos detectados",
    ) as HTMLElement;
    expect(pinnedConceptPanel.getAttribute("data-panel-mode")).toBe("pinned");
    expect(pinnedConceptPanel.className).toContain("pointer-events-auto");
    expect(conceptIcon?.getAttribute("aria-pressed")).toBe("true");

    await hoverElement(memoryIcon);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeUndefined();
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(1);

    await click(memoryIcon!);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(1);

    await unhoverElement(conceptIcon);
    await advanceTime(200);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeDefined();

    await click(memoryIcon!);
    expect(getDialog(screen.container, "Me recuerda a…")).toBeUndefined();
    expect(screen.container.querySelectorAll("[data-canvas-side-panel]")).toHaveLength(0);
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.some(
          (message) =>
            typeof message === "string" &&
            message.includes(
              "The final argument passed to useEffect changed size between renders",
            ),
        ),
      ),
    ).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("keeps contextual indicators stable while a new evaluation is loading", async () => {
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

    expect(getContextIndicator(screen.container, "Memoria")).toBeDefined();

    await changeTextarea(screen.container, "Texto sin coincidencias qwerty");
    await advanceTime(100);

    expect(getContextIndicator(screen.container, "Memoria")).toBeDefined();

    await advanceTime(400);

    expect(getContextIndicator(screen.container, "Memoria")).toBeUndefined();
  });

  it("keeps hover preview interactive when the pointer enters the panel corridor", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);

    const conceptIcon = getContextIndicator(screen.container, "conceptos sugeridos");

    await hoverElement(conceptIcon);
    const panel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;
    expect(panel).toBeDefined();
    expect(panel.className).toContain("pointer-events-auto");

    await unhoverElement(conceptIcon);
    const contextLayer = screen.container.querySelector(
      "[data-canvas-context-layer]",
    ) as HTMLElement;
    await hoverElement(contextLayer);
    await advanceTime(100);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    await advanceTime(140);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    const railwayPreviewChip = getButton(screen.container, "Railway");
    await click(railwayPreviewChip);
    expect(getButton(screen.container, "Railway").getAttribute("aria-pressed")).toBe(
      "true",
    );

    await unhoverElement(contextLayer);
    await advanceTime(240);
    expect(screen.container.querySelector("[data-canvas-side-panel]")?.getAttribute(
      "data-panel-state",
    )).toBe("closing");
    await advanceTime(240);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();

    await click(conceptIcon!);
    const fixedPanel = getDialog(screen.container, "Conceptos detectados");
    expect(fixedPanel).toBeDefined();

    const railwayChip = getButton(screen.container, "Railway");
    await click(railwayChip);
    expect(getButton(screen.container, "Railway").getAttribute("aria-pressed")).toBe(
      "false",
    );

    await click(getButtonByLabel(screen.container, "Cerrar panel")!);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
  });

  it("keeps hover preview alive across panel header, padding and content", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);

    const conceptIcon = getContextIndicator(screen.container, "conceptos sugeridos");

    await hoverElement(conceptIcon);
    const panel = getDialog(screen.container, "Conceptos detectados") as HTMLElement;
    const interactionRegion = screen.container.querySelector(
      "[data-canvas-panel-interaction-region]",
    ) as HTMLElement;
    const panelAnchor = screen.container.querySelector(
      "[data-canvas-context-panel-anchor]",
    ) as HTMLElement;
    const panelHeader = panel.querySelector(
      "[data-canvas-side-panel-header]",
    ) as HTMLElement;
    const panelContent = panel.querySelector(
      "[data-canvas-side-panel-content]",
    ) as HTMLElement;

    expect(interactionRegion).toBeDefined();
    expect(interactionRegion.className).toContain("pointer-events-auto");
    expect(interactionRegion.className).toContain("gap-2");
    expect(panelAnchor.className).not.toContain("mt-2");

    await unhoverElement(conceptIcon);
    await hoverElement(panelAnchor);
    await advanceTime(240);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await unhoverElement(panelAnchor);
    await hoverElement(panelHeader);
    await advanceTime(240);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await unhoverElement(panelHeader);
    await hoverElement(panelContent);
    panelContent.dispatchEvent(new Event("scroll", { bubbles: true }));
    await advanceTime(240);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await unhoverElement(panelContent);
    await unhoverElement(interactionRegion);
    await advanceTime(240);
    expect(screen.container.querySelector("[data-canvas-side-panel]")?.getAttribute(
      "data-panel-state",
    )).toBe("closing");
  });

  it("updates contextual snapshots silently without asking for manual refresh", async () => {
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "mitcom", name: "Mitcom" }),
    ]);
    const screen = await renderCaptureSurface({ contextRepository });

    await changeTextarea(screen.container, "Revisar Mitcom");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    const mitcomRow = getConceptSuggestionRow(screen.container, "mitcom");
    expect(mitcomRow?.textContent).toContain("Mitcom");
    await click(selectedButtonFromRow(mitcomRow));
    expect(
      selectedButtonFromRow(getConceptSuggestionRow(screen.container, "mitcom"))
        .getAttribute("aria-pressed"),
    ).toBe("true");

    await changeTextarea(screen.container, "Revisar Mitcom y Railway");
    await advanceTime(500);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    expect(screen.container.textContent).not.toContain("Actualizar sugerencias");
    expect(screen.container.querySelector("[data-canvas-panel-refresh]")).toBeNull();
    expect(getConceptSuggestionRow(screen.container, "railway")).toBeNull();
    expect(
      selectedButtonFromRow(getConceptSuggestionRow(screen.container, "mitcom"))
        .getAttribute("aria-pressed"),
    ).toBe("true");

    await openConceptPanel(screen.container);
    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();

    await openConceptPanel(screen.container);

    expect(getConceptSuggestionRow(screen.container, "mitcom")).toBeDefined();
    expect(getConceptSuggestionRow(screen.container, "railway")).toBeDefined();
    expect(screen.container.textContent).not.toContain("Actualizar sugerencias");
    expect(
      selectedButtonFromRow(getConceptSuggestionRow(screen.container, "mitcom"))
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps an accepted suggested concept selected across preview, pinned panel and reopen", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);

    const conceptIcon = getContextIndicator(screen.container, "conceptos sugeridos");
    await hoverElement(conceptIcon);

    expect(getButton(screen.container, "Railway").getAttribute("aria-pressed")).toBe(
      "false",
    );

    await click(getButton(screen.container, "Railway"));

    expect(getButton(screen.container, "Railway").getAttribute("aria-pressed")).toBe(
      "true",
    );

    await click(conceptIcon!);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();
    expect(getButton(screen.container, "Railway").getAttribute("aria-pressed")).toBe(
      "true",
    );

    await keydownWindow({ key: "Escape" });
    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();

    await hoverElement(conceptIcon);
    await advanceTime(500);

    expect(getButton(screen.container, "Railway").getAttribute("aria-pressed")).toBe(
      "true",
    );

    await click(getButton(screen.container, "Railway"));

    expect(getButton(screen.container, "Railway").getAttribute("aria-pressed")).toBe(
      "false",
    );
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

  it("closes an open contextual panel when writing removes its real suggestions", async () => {
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

  it("opens the concept workspace from the rail and preserves the draft", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
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
    expect(screen.container.textContent).not.toContain("Explorar conceptos");

    const exploreButton = getButtonByLabel(screen.container, "Explorar conceptos");

    expect(exploreButton).toBeDefined();

    await click(exploreButton!);

    expect(getDialog(document.body, "Conceptos")).toBeDefined();
    expect(document.body.querySelector("[data-concept-workspace]")).toBeTruthy();
    expect(document.body.querySelector("[data-concept-workspace-index]")).toBeTruthy();
    expect(document.body.querySelector("[data-concept-workspace-map]")).toBeTruthy();
    expect(document.body.querySelector("[data-concept-workspace-profile]")).toBeTruthy();
    expect(document.body.querySelector("[data-knowledge-explorer-canvas]")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Abrir mapa de conceptos");
    expect(document.body.textContent).not.toContain("Volver a conceptos");
    expect(window.location.pathname).toBe("/");
    expect(getTextarea(screen.container)?.value).toBe(
      "Nueva reunion con Mitcom para revisar pendientes",
    );

    const railwayButton = getButton(document.body, "Railway");
    expect(railwayButton.getAttribute("aria-pressed")).toBe("false");
    await click(railwayButton);

    expect(getDialog(document.body, "Conceptos")).toBeDefined();
    expect(railwayButton.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Perfil concepto railway");
    expect(window.location.pathname).toBe("/");
    expect(document.body.querySelectorAll("[data-application-workspace-dialog]")).toHaveLength(1);
    expect(getTextarea(screen.container)?.value).toBe(
      "Nueva reunion con Mitcom para revisar pendientes",
    );

    await click(getButton(document.body, "Nodo Sync"));

    expect(getDialog(document.body, "Conceptos")).toBeDefined();
    expect(document.body.textContent).toContain("Perfil concepto sync");
    expect(window.location.pathname).toBe("/");
    expect(document.body.querySelectorAll("[data-application-workspace-dialog]")).toHaveLength(1);

    await click(getButton(document.body, "Concepto relacionado"));

    expect(getDialog(document.body, "Conceptos")).toBeDefined();
    expect(document.body.textContent).toContain("Perfil concepto mitcom");
    expect(window.location.pathname).toBe("/");
    expect(document.body.querySelectorAll("[data-application-workspace-dialog]")).toHaveLength(1);

    await click(getButton(document.body, "Abrir recuerdo relacionado"));

    expect(getDialog(document.body, "Captura")).toBeDefined();
    expect(document.body.querySelector("[data-note-detail]")).toBeTruthy();
    expect(document.body.querySelectorAll("[data-application-workspace-dialog]")).toHaveLength(1);
    expect(window.location.pathname).toBe("/");
    expect(openSpy).not.toHaveBeenCalled();

    await click(getButtonByLabel(document.body, "Volver") as HTMLButtonElement);

    expect(getDialog(document.body, "Conceptos")).toBeDefined();
    expect(document.body.textContent).toContain("Perfil concepto mitcom");
    expect(window.location.pathname).toBe("/");

    await click(getButtonByLabel(document.body, "Volver") as HTMLButtonElement);

    expect(getDialog(document.body, "Conceptos")).toBeDefined();
    expect(document.body.textContent).toContain("Perfil concepto sync");
    expect(window.location.pathname).toBe("/");

    openSpy.mockRestore();
  });

  it("groups knowledge suggestions as related now and missing context", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "memory-1",
        content: "Mitcom, Servidor y Sponsor revisan la continuidad operativa.",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
      createStoredNode({
        id: "memory-2",
        content: "Mitcom, Servidor y Sponsor definen el plan de soporte.",
        updatedAt: "2026-05-01T00:00:00.000Z",
      }),
      createStoredNode({
        id: "memory-3",
        content: "Mitcom, Servidor y Sponsor cierran seguimiento técnico.",
        updatedAt: "2026-07-20T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "mitcom", name: "Mitcom" }),
      createContext({ id: "servidor", name: "Servidor" }),
      createContext({ id: "sponsor", name: "Sponsor" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      ...createRelationsFor("memory-1", ["mitcom", "servidor", "sponsor"]),
      ...createRelationsFor("memory-2", ["mitcom", "servidor", "sponsor"]),
      ...createRelationsFor("memory-3", ["mitcom", "servidor", "sponsor"]),
    ]);
    const screen = await renderCaptureSurface({
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(screen.container, "Mitcom y Servidor revisan pendientes");
    await advanceTime(500);
    await hoverElement(getContextIndicator(screen.container, "conceptos sugeridos"));

    expect(screen.container.textContent).not.toContain("Relacionado ahora");
    expect(screen.container.textContent).not.toContain("Podría faltar");
    expect(screen.container.textContent).toContain("Sponsor");
    expect(screen.container.textContent).toContain(
      "Suele formar parte de este mismo contexto",
    );

    await click(getContextIndicator(screen.container, "conceptos sugeridos")!);

    expect(screen.container.textContent).toContain("Sponsor");
    expect(screen.container.textContent).toContain(
      "Suele formar parte de este mismo contexto",
    );
  });

  it("groups dormant relevant knowledge as revisit", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "old-1",
        content: "Mitcom y Contratos tuvieron una revisión pendiente.",
        updatedAt: "2026-01-10T00:00:00.000Z",
      }),
      createStoredNode({
        id: "old-2",
        content: "Mitcom y Contratos definieron condiciones comerciales.",
        updatedAt: "2026-02-10T00:00:00.000Z",
      }),
      createStoredNode({
        id: "old-3",
        content: "Mitcom y Contratos quedaron para seguimiento.",
        updatedAt: "2026-03-10T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "mitcom", name: "Mitcom" }),
      createContext({ id: "contratos", name: "Contratos" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      ...createRelationsFor("old-1", ["mitcom", "contratos"]),
      ...createRelationsFor("old-2", ["mitcom", "contratos"]),
      ...createRelationsFor("old-3", ["mitcom", "contratos"]),
    ]);
    const screen = await renderCaptureSurface({
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(screen.container, "Mitcom requiere seguimiento");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    expect(screen.container.textContent).not.toContain("Retomar");
    expect(screen.container.textContent).toContain("Contratos");
  });

  it("does not render low-confidence knowledge suggestions", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      createStoredNode({
        id: "weak",
        content: "Mitcom y Tracking aparecieron juntos una vez.",
        updatedAt: "2026-07-20T00:00:00.000Z",
      }),
    ]);
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "mitcom", name: "Mitcom" }),
      createContext({ id: "tracking", name: "Tracking" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      ...createRelationsFor("weak", ["mitcom", "tracking"]),
    ]);
    const screen = await renderCaptureSurface({
      nodeRepository,
      contextRepository,
      relationRepository,
    });

    await changeTextarea(screen.container, "Mitcom requiere seguimiento");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    expect(screen.container.textContent).toContain("Mitcom");
    expect(screen.container.textContent).not.toContain("Tracking");
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

    expect(screen.container.textContent).toContain(
      "Las reuniones extensas reducen",
    );
    expect(screen.container.textContent).not.toContain("Reuniones");
    expect(screen.container.textContent).not.toContain("Explorar memoria");
    expect(getLinksByExactHref(screen.container, "/memory")).toHaveLength(0);
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

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(screen.container.textContent).not.toContain("Railway");
    expect(screen.container.textContent).not.toContain("Actualizar sugerencias");
    expect(screen.container.querySelectorAll("[data-context-indicator]")).toHaveLength(0);
  });

  it("closes an open panel when its contextual indicator disappears", async () => {
    const screen = await renderCaptureSurface();

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeDefined();

    await changeTextarea(screen.container, "");
    await advanceTime(500);

    expect(getDialog(screen.container, "Conceptos detectados")).toBeUndefined();
    expect(screen.container.querySelectorAll("[data-context-indicator]")).toHaveLength(0);
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

  it("clears incompatible concept suggestions as soon as the text changes", async () => {
    const contextRepository = new InMemoryContextRepository([
      createContext({ id: "railway", name: "Railway" }),
    ]);
    const screen = await renderCaptureSurface({ contextRepository });

    await changeTextarea(screen.container, "Revisar Railway");
    await advanceTime(500);
    await openConceptPanel(screen.container);
    expect(screen.container.textContent).toContain("Railway");

    await changeTextarea(screen.container, "Voy a revisar pagos pendientes");

    expect(screen.container.textContent).not.toContain("Railway");
    expect(screen.container.textContent).not.toContain("Actualizar sugerencias");
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
    expect(getContextIndicator(screen.container, "Memoria")).toBeUndefined();
    expect(screen.container.querySelectorAll("[data-context-indicator]")).toHaveLength(0);
    expect(getButton(screen.container, "Reintentar")).toBeUndefined();
  });
});

async function renderCaptureSurface({
  storage = new MemoryStorageAdapter(),
  nodeRepository = new InMemoryNodeRepository(),
  contextRepository = new InMemoryContextRepository(),
  relationRepository = new InMemoryNodeContextRelationRepository(),
  feedbackService,
  onCaptureCommitted,
}: {
  storage?: MemoryStorageAdapter;
  nodeRepository?: InMemoryNodeRepository;
  contextRepository?: InMemoryContextRepository;
  relationRepository?: InMemoryNodeContextRelationRepository;
  feedbackService?: VisualFeedbackService;
  onCaptureCommitted?: () => void | Promise<void>;
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
      onCaptureCommitted,
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

async function renderConceptPanelContent({
  suggestions,
  selectedContextIds = [],
  selectedEmergingCandidateIds = [],
}: {
  suggestions: Parameters<typeof ConceptPanelContent>[0]["suggestions"];
  selectedContextIds?: string[];
  selectedEmergingCandidateIds?: string[];
}) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(ConceptPanelContent, {
        suggestions,
        selectedContextIds,
        selectedEmergingCandidateIds,
        highlightedConceptKeys: new Set<string>(),
        onToggleExisting: vi.fn(),
        onToggleEmerging: vi.fn(),
      }),
    );
    await flushPromises();
  });

  return container;
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
  aliases = [],
  normalizedAliases = [],
}: {
  id: string;
  name: string;
  type?: Context["type"];
  aliases?: string[];
  normalizedAliases?: string[];
}): Context {
  return {
    id,
    workspaceId: workspace.id,
    type,
    name,
    description: null,
    aliases,
    normalizedAliases,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}

function createRelationsFor(
  nodeId: string,
  contextIds: string[],
): Array<{
  id: string;
  workspaceId: string;
  nodeId: string;
  contextId: string;
  version: number;
  createdAt: string;
}> {
  return contextIds.map((contextId) => ({
    id: `${nodeId}-${contextId}`,
    workspaceId: workspace.id,
    nodeId,
    contextId,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
}

function getTextarea(container: HTMLElement) {
  return container.querySelector("textarea");
}

function getButton(container: HTMLElement, name: string) {
  return queryButton(container, name) as HTMLButtonElement;
}

function queryButton(container: HTMLElement, name: string) {
  const candidates = [
    ...Array.from(container.querySelectorAll("button")),
    ...Array.from(document.body.querySelectorAll("button")).filter(
      (button) => !container.contains(button),
    ),
  ];

  return candidates.find(
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
  const candidates = [
    ...Array.from(container.querySelectorAll("[role='dialog']")),
    ...Array.from(document.body.querySelectorAll("[role='dialog']")).filter(
      (dialog) => !container.contains(dialog),
    ),
  ];

  return candidates.find(
    (dialog) => dialog.getAttribute("aria-label") === label,
  ) as HTMLElement | undefined;
}

function getConceptSuggestionRow(container: HTMLElement, conceptId: string) {
  return container.querySelector(
    `[data-concept-suggestion-row][data-concept-suggestion-id='${conceptId}']`,
  ) as HTMLElement | null;
}

function selectedButtonFromRow(row: HTMLElement | null) {
  const button = row?.querySelector("button");

  if (!button) {
    throw new Error("Expected concept suggestion row button to exist.");
  }

  return button as HTMLButtonElement;
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
    getContextIndicator(container, "Memoria") ??
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

function getLinksByExactHref(container: HTMLElement, href: string) {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).filter(
    (link) => link.getAttribute("href") === href,
  );
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

async function selectTextareaText(container: HTMLElement, selectionText: string) {
  const textarea = getTextarea(container);
  if (!textarea) {
    throw new Error("Textarea not found");
  }

  const start = textarea.value.indexOf(selectionText);
  if (start === -1) {
    throw new Error(`Selection text ${selectionText} not found.`);
  }

  await selectTextareaRange(container, start, start + selectionText.length);
}

async function selectTextareaRange(container: HTMLElement, start: number, end: number) {
  const textarea = getTextarea(container);
  if (!textarea) {
    throw new Error("Textarea not found");
  }

  await act(async () => {
    textarea.focus();
    textarea.setSelectionRange(start, end);
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
    textarea.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
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

async function keydownDocument(eventInit: KeyboardEventInit) {
  await act(async () => {
    document.dispatchEvent(
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

async function hoverElement(target: HTMLElement | undefined) {
  if (!target) {
    throw new Error("Expected target to exist.");
  }

  await act(async () => {
    target.dispatchEvent(createPointerEvent("pointerover"));
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await flushPromises();
  });
}

async function unhoverElement(target: HTMLElement | undefined) {
  if (!target) {
    throw new Error("Expected target to exist.");
  }

  await act(async () => {
    target.dispatchEvent(createPointerEvent("pointerout"));
    target.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await flushPromises();
  });
}

function createPointerEvent(type: "pointerover" | "pointerout") {
  return typeof PointerEvent === "undefined"
    ? new Event(type, { bubbles: true })
    : new PointerEvent(type, { bubbles: true });
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

async function clickAnchor(anchor: HTMLAnchorElement) {
  await act(async () => {
    anchor.click();
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
