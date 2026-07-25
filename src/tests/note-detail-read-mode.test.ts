import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
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
  it("opens in read mode without showing the form", async () => {
    const screen = await renderNoteDetail();

    expect(screen.textContent).toContain("Memoria viva");
    expect(screen.textContent).toContain("Contenido guardado");
    expect(screen.querySelector("input")).toBeNull();
    expect(screen.querySelector("textarea")).toBeNull();
    expect(getButton(screen, "Editar")).toBeTruthy();
  });

  it("uses a visible back link to /notes", async () => {
    const screen = await renderNoteDetail();
    const backLink = getLink(screen, "← Volver");

    expect(backLink?.getAttribute("href")).toBe("/notes");
  });

  it("enters edit mode only after pressing Editar", async () => {
    const screen = await renderNoteDetail();

    await click(getButton(screen, "Editar"));

    expect(screen.querySelector("input")?.getAttribute("value")).toBe(
      "Memoria viva",
    );
    expect(screen.querySelector("textarea")?.value).toBe("Contenido guardado");
    expect(getButton(screen, "Guardar")).toBeTruthy();
    expect(getButton(screen, "Cancelar")).toBeTruthy();
  });

  it("saves changes and returns to read mode", async () => {
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
    await click(getButton(screen, "Guardar"));

    expect(onSave).toHaveBeenCalledWith({
      title: "Memoria editada",
      content: "Contenido editado",
    });
    expect(screen.querySelector("input")).toBeNull();
    expect(screen.querySelector("textarea")).toBeNull();
    expect(screen.textContent).toContain("Memoria editada");
    expect(screen.textContent).toContain("Contenido editado");
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
    const onSave = vi.fn(async () => baseNode);
    const screen = await renderNoteDetail({ onSave });

    await keyDown(getDetailSection(screen), "s", { ctrlKey: true });

    expect(onSave).not.toHaveBeenCalled();

    await click(getButton(screen, "Editar"));
    await keyDown(getDetailSection(screen), "s", { ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
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
}: {
  node?: Node;
  onSave?: (draft: { title: string; content: string }) => Promise<Node>;
  onArchive?: () => Promise<void>;
} = {}) {
  const { container } = createContainer();

  await act(async () => {
    createRoot(container).render(
      createElement(NoteDetailView, {
        node,
        onSave,
        onArchive,
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
