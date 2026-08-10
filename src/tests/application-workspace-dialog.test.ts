import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationWorkspaceDialog } from "@/components/app-shell/application-workspace-dialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ApplicationWorkspaceDialog", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders a compact workspace header with title and close action only", async () => {
    const onOpenChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);

    await act(async () => {
      createRoot(container).render(
        createElement(
          ApplicationWorkspaceDialog,
          {
            open: true,
            title: "Conceptos",
            onOpenChange,
          } as unknown as Parameters<typeof ApplicationWorkspaceDialog>[0],
          createElement("div", null, "Contenido"),
        ),
      );
      await Promise.resolve();
    });

    const dialog = document.body.querySelector("[data-application-workspace-dialog]");
    const header = document.body.querySelector("header");
    const contentSlot = dialog?.lastElementChild as HTMLElement | null;

    expect(dialog).toBeTruthy();
    expect(dialog?.className).toContain(
      "h-[calc(100dvh_-_20px_-_max(20px,env(safe-area-inset-bottom)))]",
    );
    expect(dialog?.className).toContain("w-[calc(100vw_-_40px)]");
    expect(dialog?.className).toContain(
      "sm:h-[calc(100dvh_-_24px_-_max(24px,env(safe-area-inset-bottom)))]",
    );
    expect(dialog?.className).toContain("sm:w-[min(1400px,calc(100vw_-_48px))]");
    expect(contentSlot?.className).toContain(
      "flex min-h-0 flex-1 flex-col overflow-hidden",
    );
    expect(header?.className).toContain("min-h-[56px]");
    expect(header?.className).not.toContain("border-b");
    expect(document.body.textContent).toContain("Conceptos");
    expect(document.body.textContent).not.toContain(
      "Conceptos, recuerdos y conexiones de Vinema.",
    );
    expect(document.body.textContent).toContain("Contenido");
    expect(document.body.querySelector("[aria-label='Cerrar Conceptos']")).toBeTruthy();
  });

  it("can hide the generic header for workspaces with an integrated topbar", async () => {
    const onOpenChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);

    await act(async () => {
      createRoot(container).render(
        createElement(
          ApplicationWorkspaceDialog,
          {
            open: true,
            title: "Conceptos",
            hideHeader: true,
            onOpenChange,
          } as unknown as Parameters<typeof ApplicationWorkspaceDialog>[0],
          createElement("div", { "data-concept-workspace-topbar": "" }, "Conceptos"),
        ),
      );
      await Promise.resolve();
    });

    expect(document.body.querySelector("[data-application-workspace-dialog]")).toBeTruthy();
    expect(document.body.querySelector("header")).toBeNull();
    expect(document.body.querySelector("[data-concept-workspace-topbar]")).toBeTruthy();
    expect(document.body.querySelector("[aria-label='Cerrar Conceptos']")).toBeNull();
  });
});
