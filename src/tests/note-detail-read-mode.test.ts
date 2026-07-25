import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NoteDetailMessage,
  NoteDetailView,
} from "@/app/notes/detail/note-detail-client";
import type { Node } from "@/domain/node/node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const baseNode: Node = {
  id: "note-1",
  workspaceId: "workspace-1",
  type: "NOTE",
  title: "Memoria viva",
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

    expect(screen.textContent).toContain("Memoria viva");
    expect(screen.textContent).toContain("Contenido guardado");
    expect(screen.querySelector("input")).toBeNull();
    expect(screen.querySelector("textarea")).toBeNull();
    expect(getButton(screen, "Editar")).toBeTruthy();
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

    expect(screen.querySelector("input")?.getAttribute("value")).toBe(
      "Memoria viva",
    );
    expect(screen.querySelector("textarea")?.value).toBe("Contenido guardado");
    expect(getButton(screen, ["Guar", "dar"].join(""))).toBeUndefined();
    expect(getButton(screen, "Listo")).toBeTruthy();
    expect(getButton(screen, "Cancelar")).toBeTruthy();
  });

  it("finishes editing by saving pending changes and returning to read mode", async () => {
    const onSave = vi.fn(async () => ({
      ...baseNode,
      title: "Memoria editada",
      content: "Contenido editado",
      version: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeInput(screen.querySelector("input"), "Memoria editada");
    await changeTextarea(screen.querySelector("textarea"), "Contenido editado");
    await click(getButton(screen, "Listo"));

    expect(onSave).toHaveBeenCalledWith({
      title: "Memoria editada",
      content: "Contenido editado",
    });
    expect(screen.querySelector("input")).toBeNull();
    expect(screen.querySelector("textarea")).toBeNull();
    expect(screen.textContent).toContain("Memoria editada");
    expect(screen.textContent).toContain("Contenido editado");
  });

  it("does not show a manual Guardar button in edit mode", async () => {
    const screen = await renderNoteDetail();

    await click(getButton(screen, "Editar"));

    expect(getButton(screen, ["Guar", "dar"].join(""))).toBeUndefined();
    expect(getButton(screen, "Listo")).toBeTruthy();
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
    const onSave = vi.fn(async ({ title, content }) => ({
      ...baseNode,
      title,
      content,
      version: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Contenido autosave");

    expect(screen.textContent).toContain("Cambios sin guardar");

    await advanceTime(699);
    expect(onSave).not.toHaveBeenCalled();

    await advanceTime(1);

    expect(onSave).toHaveBeenCalledWith({
      title: "Memoria viva",
      content: "Contenido autosave",
    });
    expect(screen.textContent).toContain("Guardado");
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
    await changeInput(screen.querySelector("input"), "Borrador descartado");
    await changeTextarea(screen.querySelector("textarea"), "No guardar");
    await click(getButton(screen, "Cancelar"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.querySelector("input")).toBeNull();
    expect(screen.textContent).toContain("Memoria viva");
    expect(screen.textContent).toContain("Contenido guardado");

    await click(getButton(screen, "Editar"));

    expect(screen.querySelector("input")?.getAttribute("value")).toBe(
      "Memoria viva",
    );
    expect(screen.querySelector("textarea")?.value).toBe("Contenido guardado");
  });

  it("only handles Ctrl+S while editing", async () => {
    const onSave = vi.fn(async ({ title, content }) => ({
      ...baseNode,
      title,
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
    const onSave = vi.fn(async ({ title, content }) => ({
      ...baseNode,
      title,
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
    const onSave = vi.fn(async ({ title, content }) => ({
      ...baseNode,
      title,
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
    expect(screen.textContent).toContain("Error al guardar");
    expect(screen.textContent).toContain("No se pudo escribir");
  });

  it("disables Listo while it is waiting for a save", async () => {
    let resolveSave: ((node: Node) => void) | undefined;
    const onSave = vi.fn(
      ({ title, content }) =>
        new Promise<Node>((resolve) => {
          resolveSave = () =>
            resolve({
              ...baseNode,
              title,
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
    expect(screen.textContent).toContain("Guardando...");

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
    const onSave = vi.fn(async ({ title, content }) => ({
      ...baseNode,
      title,
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
      .mockImplementationOnce(async ({ title, content }) => ({
        ...baseNode,
        title,
        content,
        version: 2,
      }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Borrador con error");
    await advanceAutosave();

    expect(screen.textContent).toContain("Error al guardar");
    expect(screen.textContent).toContain("IndexedDB fallo");
    expect(screen.querySelector("textarea")?.value).toBe("Borrador con error");

    await changeTextarea(screen.querySelector("textarea"), "Borrador corregido");
    await advanceAutosave();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.textContent).toContain("Guardado");
  });

  it("does not mark newer changes as saved when an older save resolves", async () => {
    let resolveFirstSave: ((node: Node) => void) | undefined;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        ({ title, content }) =>
          new Promise<Node>((resolve) => {
            resolveFirstSave = () =>
              resolve({
                ...baseNode,
                title,
                content,
                version: 2,
              });
          }),
      )
      .mockImplementationOnce(async ({ title, content }) => ({
        ...baseNode,
        title,
        content,
        version: 3,
      }));
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeTextarea(screen.querySelector("textarea"), "Cambio A");
    await advanceAutosave();

    expect(screen.textContent).toContain("Guardando");

    await changeTextarea(screen.querySelector("textarea"), "Cambio B");

    await act(async () => {
      resolveFirstSave?.(baseNode);
      await flushPromises();
    });

    expect(screen.textContent).toContain("Cambios sin guardar");
    expect(screen.textContent).not.toContain("Guardado");

    await advanceAutosave();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith({
      title: "Memoria viva",
      content: "Cambio B",
    });
  });

  it("does not autosave an invalid draft", async () => {
    const onSave = vi.fn(async () => baseNode);
    const screen = await renderNoteDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeInput(screen.querySelector("input"), " ");
    await changeTextarea(screen.querySelector("textarea"), " ");
    await advanceAutosave();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.textContent).toContain("Escribe un titulo o contenido");
    expect(screen.textContent).toContain("Cambios sin guardar");
  });

  it("flushes pending changes before returning to notes", async () => {
    const onBack = vi.fn();
    const onSave = vi.fn(async ({ title, content }) => ({
      ...baseNode,
      title,
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
    expect(screen.textContent).toContain("No se pudo escribir");
    expect(screen.querySelector("textarea")).toBeTruthy();
  });

  it("keeps a return action available for a missing note state", async () => {
    const screen = await renderMessage();

    expect(screen.textContent).toContain("Nota no encontrada");
    expect(getLink(screen, "Volver a notas")?.getAttribute("href")).toBe("/notes");
  });
});

async function renderNoteDetail({
  node = baseNode,
  onSave = vi.fn(async () => node),
  onArchive = vi.fn(async () => undefined),
  onBack = vi.fn(),
}: {
  node?: Node;
  onSave?: (draft: { title: string; content: string }) => Promise<Node>;
  onArchive?: () => Promise<void>;
  onBack?: () => void;
} = {}) {
  const { container } = createContainer();

  await act(async () => {
    createRoot(container).render(
      createElement(NoteDetailView, {
        node,
        onSave,
        onArchive,
        onBack,
      }),
    );
  });

  return container;
}

async function renderMessage() {
  const { container } = createContainer();

  await act(async () => {
    createRoot(container).render(
      createElement(NoteDetailMessage, {
        title: "Nota no encontrada",
        message: "No existe en este dispositivo.",
      }),
    );
  });

  return container;
}

function createContainer(): { container: HTMLDivElement; root?: Root } {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  return { container };
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

async function changeInput(element: HTMLInputElement | null, value: string) {
  if (!element) {
    throw new Error("Expected input to exist.");
  }

  await act(async () => {
    setNativeValue(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
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
