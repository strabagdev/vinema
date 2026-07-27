import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextDetailView } from "@/app/contexts/detail/context-detail-client";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const context: Context = {
  id: "context-1",
  workspaceId: "workspace-1",
  type: "PROJECT",
  name: "Vinema",
  description: "Memoria local",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};

const node: Node = {
  id: "note-1",
  workspaceId: "workspace-1",
  type: "NOTE",
  content: "Seguimiento del proyecto",
  status: "ACTIVE",
  organizationStatus: "ORGANIZED",
  metadata: {},
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  deletedAt: null,
  createdByDeviceId: "device-1",
  lastModifiedByDeviceId: "device-1",
};

describe("ContextDetailView", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("opens in read mode with related notes", async () => {
    const screen = await renderContextDetail();

    expect(screen.textContent).toContain("Vinema");
    expect(screen.textContent).toContain("Memoria local");
    expect(screen.textContent).toContain("Capturas relacionadas");
    expect(screen.textContent).toContain("Seguimiento del proyecto");
    expect(screen.querySelector("input")).toBeNull();
  });

  it("edits with Listo and keeps the same context id", async () => {
    const onSave = vi.fn(async (draft: { name: string; description: string }) => ({
      ...context,
      ...draft,
      updatedAt: "2026-01-03T00:00:00.000Z",
    }));
    const screen = await renderContextDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeInput(screen.querySelector("input"), "Vinema local");
    await click(getButton(screen, "Listo"));

    expect(onSave).toHaveBeenCalledWith({
      name: "Vinema local",
      description: "Memoria local",
    });
    expect(screen.textContent).toContain("Vinema local");
    expect(screen.querySelector("input")).toBeNull();
  });

  it("cancels edits without persisting draft changes", async () => {
    const onSave = vi.fn(async () => context);
    const screen = await renderContextDetail({ onSave });

    await click(getButton(screen, "Editar"));
    await changeInput(screen.querySelector("input"), "No persistir");
    await click(getButton(screen, "Cancelar"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.textContent).toContain("Vinema");
    expect(screen.textContent).not.toContain("No persistir");
  });

  it("archives and restores context from read mode", async () => {
    const onArchive = vi.fn(async () => undefined);
    const onRestore = vi.fn(async () => undefined);
    const screen = await renderContextDetail({ onArchive, onRestore });

    await click(getButton(screen, "Archivar"));

    expect(onArchive).toHaveBeenCalledOnce();
    expect(screen.textContent).toContain("Archivado");

    await click(getButton(screen, "Restaurar"));

    expect(onRestore).toHaveBeenCalledOnce();
    expect(screen.textContent).toContain("Activo");
  });
});

async function renderContextDetail({
  onSave = vi.fn(async () => context),
  onArchive = vi.fn(async () => undefined),
  onRestore = vi.fn(async () => undefined),
}: {
  onSave?: (draft: { name: string; description: string }) => Promise<Context>;
  onArchive?: () => Promise<void>;
  onRestore?: () => Promise<void>;
} = {}) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(
      createElement(ContextDetailView, {
        context,
        nodes: [node],
        onSave,
        onArchive,
        onRestore,
      }),
    );
  });

  return container;
}

function getButton(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === name,
  ) as HTMLButtonElement | undefined;
}

async function click(element: HTMLElement | undefined) {
  if (!element) {
    throw new Error("Expected element to exist.");
  }

  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function changeInput(element: HTMLInputElement | null, value: string) {
  if (!element) {
    throw new Error("Expected input to exist.");
  }

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
