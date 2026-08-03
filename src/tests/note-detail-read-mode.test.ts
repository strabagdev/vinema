import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NoteDetailMessage,
  NoteDetailView,
} from "@/app/notes/detail/note-detail-client";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { VisualFeedbackProvider } from "@/features/feedback/visual-feedback-provider";
import {
  createVisualFeedbackService,
  type VisualFeedbackService,
} from "@/features/feedback/visual-feedback-service";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const baseNode: Node = {
  id: "note-1",
  workspaceId: "workspace-1",
  type: "NOTE",
  content: "Contenido guardado",
  status: "ACTIVE",
  organizationStatus: "ORGANIZED",
  metadata: {},
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  createdByDeviceId: "device-1",
  lastModifiedByDeviceId: "device-1",
};

const areaContext: Context = {
  id: "area-1",
  workspaceId: "workspace-1",
  type: "AREA",
  name: "Trabajo",
  description: null,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};

const projectContext: Context = {
  id: "project-1",
  workspaceId: "workspace-1",
  type: "PROJECT",
  name: "Vinema",
  description: null,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};

const archivedPersonContext: Context = {
  id: "person-1",
  workspaceId: "workspace-1",
  type: "PERSON",
  name: "Juan Perez",
  description: null,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: "2026-01-02T00:00:00.000Z",
};

describe("NoteDetailView read mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("opens in read mode without showing the form", async () => {
    const screen = await renderNoteDetail();

    expect(screen.textContent).toContain("Captura");
    expect(screen.textContent).toContain("Contenido guardado");
    expect(screen.querySelector("input")).toBeNull();
    expect(screen.querySelector("textarea")).toBeNull();
    expect(getButton(screen, "Editar")).toBeTruthy();
  });

  it("shows concepts in read mode with compact links", async () => {
    const screen = await renderNoteDetail({
      relatedContexts: [areaContext, projectContext, archivedPersonContext],
      relatedRelations: [
        createRelation({ contextId: "area-1" }),
        createRelation({ contextId: "project-1" }),
        createRelation({ contextId: "person-1" }),
      ],
    });

    expect(screen.textContent).toContain("Trabajo · Vinema");
    expect(screen.textContent).not.toContain("Trabajo · Vinema · Juan Perez");
    expect(screen.textContent).toContain("Conceptos");
    expect(screen.textContent).toContain("Trabajo");
    expect(screen.textContent).toContain("Vinema");
    expect(screen.textContent).toContain("Juan Perez · Archivado");
    expect(getLink(screen, "Trabajo")?.getAttribute("href")).toBe(
      "/concepts/detail?contextId=area-1",
    );
  });

  it("updates emergent identity when accepted relations change", async () => {
    const { container, root } = createContainer();

    await act(async () => {
      root.render(
        createElement(NoteDetailView, {
          node: baseNode,
          relatedContexts: [areaContext],
          relatedRelations: [createRelation({ contextId: "area-1" })],
          contextOptions: [areaContext, projectContext],
          onSave: vi.fn(async () => baseNode),
          onSaveContextRelations: vi.fn(async () => undefined),
          onArchive: vi.fn(async () => undefined),
          onRestore: vi.fn(async () => baseNode),
          onBack: vi.fn(),
        }),
      );
    });

    expect(container.textContent).toContain("Trabajo");
    expect(container.textContent).not.toContain("Trabajo · Vinema");

    await act(async () => {
      root.render(
        createElement(NoteDetailView, {
          node: baseNode,
          relatedContexts: [areaContext, projectContext],
          relatedRelations: [
            createRelation({ contextId: "area-1" }),
            createRelation({
              contextId: "project-1",
              createdAt: "2026-01-02T00:00:00.000Z",
            }),
          ],
          contextOptions: [areaContext, projectContext],
          onSave: vi.fn(async () => baseNode),
          onSaveContextRelations: vi.fn(async () => undefined),
          onArchive: vi.fn(async () => undefined),
          onRestore: vi.fn(async () => baseNode),
          onBack: vi.fn(),
        }),
      );
    });

    expect(container.textContent).toContain("Trabajo · Vinema");
  });

  it("captures selected text in edit mode and associates it immediately", async () => {
    const onResolveCaptureSelection = vi.fn(async () => ({
      status: "EXACT" as const,
      conceptId: "area-1",
      concept: areaContext,
      matchedText: "Trabajo",
      canonicalLabel: "Trabajo",
    }));
    const onApplyCaptureSelection = vi.fn(async () => undefined);
    const screen = await renderNoteDetail({
      node: {
        ...baseNode,
        content: "Revisar Trabajo mañana",
      },
      contextOptions: [areaContext],
      onResolveCaptureSelection,
      onApplyCaptureSelection,
    });

    await click(getButton(screen, "Editar"));
    await selectTextareaText(screen, "Trabajo");
    await click(getButton(screen, "Capturar seleccion"));

    expect(onResolveCaptureSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Trabajo",
        normalizedText: "trabajo",
      }),
    );
    expect(onApplyCaptureSelection).toHaveBeenCalledWith({
      contextId: "area-1",
      label: "Trabajo",
    });
  });

  it("keeps a newly captured selection selected when finishing detail edit", async () => {
    const feedbackService = createVisualFeedbackService();
    const onSaveContextRelations = vi.fn(async () => undefined);
    const onResolveCaptureSelection = vi.fn(async () => ({
      status: "NEW" as const,
      matchedText: "ESTADO DE PAGO",
    }));
    const onApplyCaptureSelection = vi.fn(async () => ({
      contextId: "context-new",
      label: "Estado de pago",
    }));
    const screen = await renderNoteDetail({
      node: {
        ...baseNode,
        content: "Revisar ESTADO DE PAGO mañana",
      },
      feedbackService,
      onSaveContextRelations,
      onResolveCaptureSelection,
      onApplyCaptureSelection,
    });

    await click(getButton(screen, "Editar"));
    await selectTextareaText(screen, "ESTADO DE PAGO");
    await click(getButton(screen, "Capturar seleccion"));
    await click(getButton(screen, "Confirmar"));

    expect(feedbackService.getState().current?.accessibleText).toBe(
      "Concepto creado",
    );

    await click(getButton(screen, "Listo"));

    expect(onApplyCaptureSelection).toHaveBeenCalledWith({
      label: "ESTADO DE PAGO",
    });
    expect(onSaveContextRelations).toHaveBeenCalledWith(["context-new"]);
  });

  it("does not render an empty concepts hint when no relations exist", async () => {
    const screen = await renderNoteDetail();

    expect(screen.textContent).not.toContain("Conceptos");
    expect(screen.textContent).not.toContain("Sin contextos relacionados");
  });

  it("uses a visible back action", async () => {
    const onBack = vi.fn();
    const screen = await renderNoteDetail({ onBack });

    await click(getButton(screen, "← Volver"));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("enters edit mode only after pressing Editar", async () => {
    const screen = await renderNoteDetail();

    await click(getButton(screen, "Editar"));

    expect(screen.querySelector("input")).toBeNull();
    expect(screen.querySelector("textarea")?.value).toBe("Contenido guardado");
    expect(getButton(screen, ["Guar", "dar"].join(""))).toBeUndefined();
    expect(getButton(screen, "Listo")).toBeTruthy();
    expect(getButton(screen, "Cancelar")).toBeTruthy();
  });

  it("finishes editing by saving pending changes and returning to read mode", async () => {
    const onSave = vi.fn(async () => ({
      ...baseNode,
      content: "Contenido editado",
      version: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Contenido editado");
    await click(getButton(screen, "Listo"));

    expect(onSave).toHaveBeenCalledWith({
      content: "Contenido editado",
    });
    expect(screen.querySelector("input")).toBeNull();
    expect(screen.querySelector("textarea")).toBeNull();
    expect(screen.textContent).toContain("Contenido editado");
  });

  it("does not show a manual Guardar button in edit mode", async () => {
    const screen = await renderNoteDetail();

    await click(getButton(screen, "Editar"));

    expect(getButton(screen, ["Guar", "dar"].join(""))).toBeUndefined();
    expect(getButton(screen, "Listo")).toBeTruthy();
  });

  it("keeps contextual relation changes local until pressing Listo", async () => {
    const onSaveContextRelations = vi.fn(async () => undefined);
    const screen = await renderNoteDetail({
      relatedContexts: [areaContext],
      contextOptions: [areaContext, projectContext],
      onSaveContextRelations,
    });

    await click(getButton(screen, "Editar"));
    await toggleChip(screen, "Vinema");

    expect(onSaveContextRelations).not.toHaveBeenCalled();

    await click(getButton(screen, "Listo"));

    expect(onSaveContextRelations).toHaveBeenCalledWith(["area-1", "project-1"]);
  });

  it("cancels contextual relation changes without persisting them", async () => {
    const onSaveContextRelations = vi.fn(async () => undefined);
    const screen = await renderNoteDetail({
      relatedContexts: [areaContext],
      contextOptions: [areaContext, projectContext],
      onSaveContextRelations,
    });

    await click(getButton(screen, "Editar"));
    await toggleChip(screen, "Vinema");
    await click(getButton(screen, "Cancelar"));

    expect(onSaveContextRelations).not.toHaveBeenCalled();
    expect(screen.textContent).toContain("Trabajo");
    expect(screen.textContent).not.toContain("Vinema");
  });

  it("does not save after entering edit mode without changes", async () => {
    const onSave = vi.fn(async () => baseNode);
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await advanceAutosave();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.textContent).not.toContain("Guardando");
  });

  it("marks dirty immediately and autosaves after the debounce", async () => {
    const onSave = vi.fn(async ({ content }) => ({
      ...baseNode,
      content,
      version: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Contenido autosave");

    expect(screen.textContent).not.toContain("Cambios sin guardar");

    await advanceTime(699);
    expect(onSave).not.toHaveBeenCalled();

    await advanceTime(1);

    expect(onSave).toHaveBeenCalledWith({
      content: "Contenido autosave",
    });
    expect(screen.textContent).not.toContain("Guardado");
    expect(screen.querySelector("textarea")).toBeTruthy();
  });

  it("does not autosave when there are no real changes", async () => {
    const onSave = vi.fn(async () => baseNode);
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Contenido guardado");
    await advanceAutosave();

    expect(onSave).not.toHaveBeenCalled();
  });

  it("cancels without saving and restores the persisted content", async () => {
    const onSave = vi.fn();
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "No guardar");
    await click(getButton(screen, "Cancelar"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.querySelector("input")).toBeNull();
    expect(screen.textContent).toContain("Contenido guardado");

    await click(getButton(screen, "Editar"));

    expect(screen.querySelector("input")).toBeNull();
    expect(screen.querySelector("textarea")?.value).toBe("Contenido guardado");
  });

  it("only handles Ctrl+S while editing", async () => {
    const onSave = vi.fn(async ({ content }) => ({
      ...baseNode,
      content,
      version: 2,
    }));
    const screen = await renderNoteDetail({ onSave });

    await keyDown(getDetailSection(screen), "s", { ctrlKey: true });

    expect(onSave).not.toHaveBeenCalled();

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Guardado con teclado");
    await keyDown(getDetailSection(screen), "s", { ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.querySelector("textarea")).toBeTruthy();
  });

  it("Listo cancels pending debounce, saves immediately and returns to read mode", async () => {
    const onSave = vi.fn(async ({ content }) => ({
      ...baseNode,
      content,
      version: 2,
    }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Guardado con listo");
    await click(getButton(screen, "Listo"));
    await advanceAutosave();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.querySelector("textarea")).toBeNull();
    expect(screen.textContent).toContain("Guardado con listo");
  });

  it("Listo exits read mode without writing when there are no changes", async () => {
    const onSave = vi.fn(async () => baseNode);
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await click(getButton(screen, "Listo"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.querySelector("textarea")).toBeNull();
    expect(screen.textContent).toContain("Contenido guardado");
  });

  it("Listo does not save again after autosave already persisted changes", async () => {
    const onSave = vi.fn(async ({ content }) => ({
      ...baseNode,
      content,
      version: 2,
    }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Ya guardado solo");
    await advanceAutosave();
    await click(getButton(screen, "Listo"));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.querySelector("textarea")).toBeNull();
    expect(screen.textContent).toContain("Ya guardado solo");
  });

  it("Listo keeps edit mode and draft when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("No se pudo escribir"));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Borrador con fallo");
    await click(getButton(screen, "Listo"));

    expect(screen.querySelector("textarea")).toBeTruthy();
    expect(screen.querySelector("textarea")?.value).toBe("Borrador con fallo");
    expect(screen.textContent).not.toContain("Error al guardar");
    expect(screen.textContent).not.toContain("No se pudo escribir");
  });

  it("disables Listo while it is waiting for a save", async () => {
    let resolveSave: ((node: Node) => void) | undefined;
    const onSave = vi.fn(
      ({ content }) =>
        new Promise<Node>((resolve) => {
          resolveSave = () =>
            resolve({
              ...baseNode,
              content,
              version: 2,
            });
        }),
    );
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Guardando lento");
    await click(getButton(screen, "Listo"));

    expect(getButton(screen, "Listo")?.disabled).toBe(true);
    expect(screen.textContent).not.toContain("Guardando...");

    await act(async () => {
      resolveSave?.(baseNode);
      await flushPromises();
    });

    expect(screen.querySelector("textarea")).toBeNull();
  });

  it("cancel before autosave discards pending changes", async () => {
    const onSave = vi.fn(async () => baseNode);
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Borrador temporal");
    await click(getButton(screen, "Cancelar"));
    await advanceAutosave();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.textContent).toContain("Contenido guardado");
    expect(screen.textContent).not.toContain("Borrador temporal");
  });

  it("cancel after autosave keeps the persisted autosaved content", async () => {
    const onSave = vi.fn(async ({ content }) => ({
      ...baseNode,
      content,
      version: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Ya autosave");
    await advanceAutosave();
    await changeTextarea(screen.querySelector("textarea"), "Borrador posterior");
    await click(getButton(screen, "Cancelar"));

    expect(screen.textContent).toContain("Ya autosave");
    expect(screen.textContent).not.toContain("Borrador posterior");
  });

  it("keeps the draft and allows retry after a save error", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("IndexedDB fallo"))
      .mockImplementationOnce(async ({ content }) => ({
        ...baseNode,
        content,
        version: 2,
      }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Borrador con error");
    await advanceAutosave();

    expect(screen.textContent).not.toContain("Error al guardar");
    expect(screen.textContent).not.toContain("IndexedDB fallo");
    expect(screen.querySelector("textarea")?.value).toBe("Borrador con error");

    await changeTextarea(screen.querySelector("textarea"), "Borrador corregido");
    await advanceAutosave();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.textContent).not.toContain("Guardado");
  });

  it("does not mark newer changes as saved when an older save resolves", async () => {
    let resolveFirstSave: ((node: Node) => void) | undefined;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        ({ content }) =>
          new Promise<Node>((resolve) => {
            resolveFirstSave = () =>
              resolve({
                ...baseNode,
                content,
                version: 2,
              });
          }),
      )
      .mockImplementationOnce(async ({ content }) => ({
        ...baseNode,
        content,
        version: 3,
      }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Cambio A");
    await advanceAutosave();

    expect(screen.textContent).not.toContain("Guardando");

    await changeTextarea(screen.querySelector("textarea"), "Cambio B");

    await act(async () => {
      resolveFirstSave?.(baseNode);
      await flushPromises();
    });

    expect(screen.textContent).not.toContain("Cambios sin guardar");
    expect(screen.textContent).not.toContain("Guardado");

    await advanceAutosave();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith({
      content: "Cambio B",
    });
  });

  it("does not autosave an invalid draft", async () => {
    const onSave = vi.fn(async () => baseNode);
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), " ");
    await advanceAutosave();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.textContent).not.toContain("Escribe contenido");
    expect(screen.textContent).not.toContain("Cambios sin guardar");
  });

  it("flushes pending changes before returning to notes", async () => {
    const onBack = vi.fn();
    const onSave = vi.fn(async ({ content }) => ({
      ...baseNode,
      content,
      version: 2,
    }));
    const screen = await renderNoteDetail({ onSave, onBack });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Guardar antes de volver");
    await click(getButton(screen, "← Volver"));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("does not navigate back if flushing changes fails", async () => {
    const onBack = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error("No se pudo escribir"));
    const screen = await renderNoteDetail({ onSave, onBack });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "No navega");
    await click(getButton(screen, "← Volver"));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.textContent).not.toContain("No se pudo escribir");
    expect(screen.querySelector("textarea")).toBeTruthy();
  });

  it("asks for confirmation before archiving", async () => {
    const onArchive = vi.fn(async () => undefined);
    const screen = await renderNoteDetail({ onArchive });

    await click(getButton(screen, "Archivar"));

    expect(onArchive).not.toHaveBeenCalled();
    expect(screen.textContent).toContain("Archivar esta captura?");
    expect(screen.textContent).toContain("Podras restaurarla desde Archivo.");

    await click(getButton(screen, "Cancelar"));

    expect(screen.textContent).not.toContain("Archivar esta captura?");

    await click(getButton(screen, "Archivar"));
    await click(getButton(screen, "Archivar"));

    expect(onArchive).toHaveBeenCalledOnce();
  });

  it("opens archived captures in read mode with restore and without edit actions", async () => {
    const onRestore = vi.fn(async (): Promise<Node> => ({
      ...baseNode,
      status: "ACTIVE",
      version: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
    const screen = await renderNoteDetail({
      node: { ...baseNode, status: "ARCHIVED" },
      onRestore,
    });

    expect(screen.textContent).toContain("Captura archivada");
    expect(getButton(screen, "Editar")).toBeUndefined();
    expect(getButton(screen, "Archivar")).toBeUndefined();
    expect(getButton(screen, "Restaurar")).toBeTruthy();

    await click(getButton(screen, "Restaurar"));

    expect(onRestore).toHaveBeenCalledOnce();
    expect(screen.textContent).not.toContain("Captura restaurada.");
    expect(screen.textContent).not.toContain("Ver en Base de Conocimiento");
  });

  it("keeps a return action available for a missing note state", async () => {
    const screen = await renderMessage();

    expect(screen.textContent).toContain("Captura no encontrada");
    expect(getLink(screen, "Volver a Memoria")?.getAttribute("href")).toBe(
      "/memory",
    );
  });
});

async function renderNoteDetail({
  node = baseNode,
  relatedContexts = [],
  relatedRelations = [],
  contextOptions = [],
  contextError = null,
  onSave = vi.fn(async () => node),
  onSaveContextRelations = vi.fn(async () => undefined),
  onArchive = vi.fn(async () => undefined),
  onRestore = vi.fn(async () => node),
  onBack = vi.fn(),
  onResolveCaptureSelection,
  onApplyCaptureSelection,
  feedbackService,
}: {
  node?: Node;
  relatedContexts?: Context[];
  relatedRelations?: NodeContextRelation[];
  contextOptions?: Context[];
  contextError?: string | null;
  onSave?: (draft: { content: string }) => Promise<Node>;
  onSaveContextRelations?: (selectedContextIds: string[]) => Promise<void>;
  onArchive?: () => Promise<void>;
  onRestore?: () => Promise<Node>;
  onBack?: () => void;
  onResolveCaptureSelection?: Parameters<typeof NoteDetailView>[0]["onResolveCaptureSelection"];
  onApplyCaptureSelection?: Parameters<typeof NoteDetailView>[0]["onApplyCaptureSelection"];
  feedbackService?: VisualFeedbackService;
} = {}) {
  const { container, root } = createContainer();

  await act(async () => {
    const detail = createElement(NoteDetailView, {
        node,
        relatedContexts,
        relatedRelations,
        contextOptions,
        contextError,
        onSave,
        onSaveContextRelations,
        onArchive,
        onRestore,
        onBack,
        onResolveCaptureSelection,
        onApplyCaptureSelection,
      });

    root.render(
      feedbackService
        ? createElement(VisualFeedbackProvider, { service: feedbackService }, detail)
        : detail,
    );
  });

  return container;
}

async function renderMessage() {
  const { container, root } = createContainer();

  await act(async () => {
    root.render(
      createElement(NoteDetailMessage, {
        heading: "Captura no encontrada",
        message: "No existe en este dispositivo.",
      }),
    );
  });

  return container;
}

function createContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  return { container, root: createRoot(container) };
}

function createRelation(
  overrides: Partial<NodeContextRelation> = {},
): NodeContextRelation {
  return {
    id: `relation-${overrides.contextId ?? "context-1"}`,
    workspaceId: "workspace-1",
    nodeId: "note-1",
    contextId: "context-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function getButton(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === name,
  ) as HTMLButtonElement | undefined;
}

function getLink(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("a")).find(
    (link) => link.textContent?.trim() === name,
  ) as HTMLAnchorElement | undefined;
}

async function toggleChip(container: HTMLElement, labelText: string) {
  const button = getButton(container, labelText);

  if (!button) {
    throw new Error(`Expected chip ${labelText} to exist.`);
  }

  await click(button);
}

function getDetailSection(container: HTMLElement) {
  const section = container.querySelector("section");

  if (!section) {
    throw new Error("Expected detail section to exist.");
  }

  return section as HTMLElement;
}

async function click(element: HTMLElement | undefined) {
  if (!element) {
    throw new Error("Expected element to exist.");
  }

  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function keyDown(
  element: HTMLElement,
  key: string,
  options: KeyboardEventInit = {},
) {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key, ...options }),
    );
  });
}

async function advanceAutosave() {
  await advanceTime(700);
}

async function advanceTime(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await flushPromises();
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function changeTextarea(
  element: HTMLTextAreaElement | null,
  value: string,
) {
  if (!element) {
    throw new Error("Expected textarea to exist.");
  }

  await act(async () => {
    setNativeValue(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  setter?.call(element, value);
}

async function selectTextareaText(container: HTMLElement, selectionText: string) {
  const textarea = container.querySelector("textarea");
  if (!textarea) {
    throw new Error("Expected textarea to exist.");
  }

  const start = textarea.value.indexOf(selectionText);
  if (start === -1) {
    throw new Error(`Selection text ${selectionText} not found.`);
  }

  await act(async () => {
    textarea.focus();
    textarea.setSelectionRange(start, start + selectionText.length);
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
    textarea.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
}
